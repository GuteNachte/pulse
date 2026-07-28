param(
    [Parameter(Mandatory)]
    [string]$Version,
    [Parameter(Mandatory)]
    [ValidateRange(1, 2147483647)]
    [int]$AndroidVersionCode,
    [string]$RepositoryRoot = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = if ([string]::IsNullOrWhiteSpace($RepositoryRoot)) {
    Resolve-Path (Join-Path $PSScriptRoot "..\..")
} else {
    Resolve-Path -LiteralPath $RepositoryRoot
}

. (Join-Path $PSScriptRoot "release-script-helpers.ps1")

$resolvedTarget = Resolve-PulseVersion -Version $Version
$targetVersion = $resolvedTarget.FullVersion
$packagePath = Join-Path $repoRoot "internal\site\package.json"
if (-not (Test-Path -LiteralPath $packagePath)) {
    throw "Repository root does not contain internal/site/package.json: $repoRoot"
}

$currentVersion = (Get-Content -Raw -LiteralPath $packagePath | ConvertFrom-Json).version
$resolvedCurrent = Resolve-PulseVersion -Version $currentVersion
$androidVersionCodePath = Join-Path $repoRoot "internal\site\android\version-code.txt"
if (-not (Test-Path -LiteralPath $androidVersionCodePath -PathType Leaf)) {
    throw "Android versionCode source is missing: $androidVersionCodePath"
}
$currentAndroidVersionCode = 0
if (-not [int]::TryParse(
        (Get-Content -Raw -LiteralPath $androidVersionCodePath).Trim(),
        [ref]$currentAndroidVersionCode
    ) -or $currentAndroidVersionCode -le 0) {
    throw "Current Android versionCode must be a positive 32-bit integer."
}
if ($currentVersion -eq $targetVersion -and $AndroidVersionCode -ne $currentAndroidVersionCode) {
    throw "Android versionCode cannot change without changing the Pulse version."
}
if ($currentVersion -ne $targetVersion -and $AndroidVersionCode -le $currentAndroidVersionCode) {
    throw "Android versionCode must increase from $currentAndroidVersionCode for a new Pulse version."
}

function New-VersionRule {
    param(
        [string]$Path,
        [string]$Pattern,
        [string]$Replacement,
        [int]$ExpectedCount = 1
    )

    return [pscustomobject]@{
        Path = $Path
        Pattern = $Pattern
        Replacement = $Replacement
        ExpectedCount = $ExpectedCount
    }
}

function Invoke-VersionConsistencyCheck {
    $checkerPath = Join-Path $PSScriptRoot "check-version-consistency.ps1"
    $output = & pwsh -NoProfile -File $checkerPath -Version $targetVersion -RepositoryRoot $repoRoot 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
        throw "Post-update version consistency check failed:`n$output"
    }
    Write-Host $output.TrimEnd()
}

if ($currentVersion -eq $targetVersion) {
    Invoke-VersionConsistencyCheck
    Write-Host "Pulse version is already $targetVersion. No files changed."
    exit 0
}

$old = [regex]::Escape($currentVersion)
$target = $targetVersion
$rules = [System.Collections.Generic.List[object]]::new()

$rules.Add((New-VersionRule "internal\site\package.json" ('(?m)^(?<prefix>\s*"version"\s*:\s*)"' + $old + '"(?<suffix>\s*,?\s*)$') ('${prefix}"' + $target + '"${suffix}'))) | Out-Null
$rules.Add((New-VersionRule "internal\site\package-lock.json" ('(?m)^(?<prefix>\s*"version"\s*:\s*)"' + $old + '"(?<suffix>\s*,?\s*)$') ('${prefix}"' + $target + '"${suffix}') 2)) | Out-Null
$rules.Add((New-VersionRule "pulse.go" ('(?m)^(?<prefix>var\s+Version\s*=\s*")' + $old + '(?<suffix>"\s*)$') ('${prefix}' + $target + '${suffix}'))) | Out-Null
$rules.Add((New-VersionRule "Makefile" ('(?m)^(?<prefix>AGENT_VERSION\s*\?=\s*)' + $old + '(?<suffix>\s*)$') ('${prefix}' + $target + '${suffix}'))) | Out-Null
$rules.Add((New-VersionRule "Makefile" ('(?m)^(?<prefix>HUB_VERSION\s*\?=\s*)' + $old + '(?<suffix>\s*)$') ('${prefix}' + $target + '${suffix}'))) | Out-Null
$rules.Add((New-VersionRule "internal\site\android\app\build.gradle" ('(?<prefix>versionName\s+project\.hasProperty\(''pulseVersionName''\)\s*\?\s*project\.property\(''pulseVersionName''\)\s*:\s*")' + $old + '(?<suffix>")') ('${prefix}' + $target + '${suffix}'))) | Out-Null
$rules.Add((New-VersionRule `
    "internal\site\android\version-code.txt" `
    ('(?m)^' + [regex]::Escape([string]$currentAndroidVersionCode) + '\s*$') `
    ([string]$AndroidVersionCode)
)) | Out-Null

foreach ($entry in @(
    @{ Path = "internal\dockerfile_agent"; Name = "AGENT_VERSION" },
    @{ Path = "internal\dockerfile_agent_intel"; Name = "AGENT_VERSION" },
    @{ Path = "internal\dockerfile_hub"; Name = "HUB_VERSION" }
)) {
    $name = $entry.Name
    $rules.Add((New-VersionRule $entry.Path ('(?m)^(?<prefix>ARG\s+' + $name + '=)' + $old + '(?<suffix>\s*)$') ('${prefix}' + $target + '${suffix}'))) | Out-Null
}

foreach ($relativePath in @(
    "supplemental\scripts\build-agent-v1.ps1",
    "supplemental\scripts\publish-agent-v1.ps1",
    "supplemental\scripts\publish-hub-v1.ps1",
    "supplemental\scripts\publish-release-v1.ps1",
    "supplemental\scripts\verify-release-v1.ps1"
)) {
    $rules.Add((New-VersionRule $relativePath ('(?<prefix>\[string\]\s*\$Version\s*=\s*")' + $old + '(?<suffix>")') ('${prefix}' + $target + '${suffix}'))) | Out-Null
}

$rules.Add((New-VersionRule "supplemental\scripts\run-hub-dev.ps1" ('(?<prefix>\[string\]\s*\$HubVersion\s*=\s*")' + $old + '(?<suffix>")') ('${prefix}' + $target + '${suffix}'))) | Out-Null
$rules.Add((New-VersionRule "supplemental\scripts\run-hub-local.ps1" ('(?<prefix>\[string\]\s*\$Image\s*=\s*"pulse-hub:)' + $old + '(?<suffix>")') ('${prefix}' + $target + '${suffix}'))) | Out-Null
$rules.Add((New-VersionRule "supplemental\scripts\run-hub-local.ps1" ('(?<prefix>\[string\]\s*\$HubVersion\s*=\s*")' + $old + '(?<suffix>")') ('${prefix}' + $target + '${suffix}'))) | Out-Null

foreach ($entry in @(
    @{ Path = "supplemental\docker\agent\docker-compose.yml"; Count = 1 },
    @{ Path = "supplemental\docker\hub\docker-compose.yml"; Count = 2 },
    @{ Path = "supplemental\docker\local-dev\docker-compose.yml"; Count = 1 },
    @{ Path = "supplemental\docker\same-system\docker-compose.yml"; Count = 2 },
    @{ Path = "internal\site\index.html"; Count = 2 },
    @{ Path = "internal\site\public\static\manifest.json"; Count = 1 },
    @{ Path = "docs\agent-1.0-install.md"; Count = 2 },
    @{ Path = "docs\flynas-compose-checklist.md"; Count = 4 },
    @{ Path = "docs\local-dev-runbook.md"; Count = 6 },
    @{ Path = "docs\release-deployment-runbook.md"; Count = 20 }
)) {
    $rules.Add((New-VersionRule $entry.Path $old $target $entry.Count)) | Out-Null
}

$rules.Add((New-VersionRule "internal\site\src\lib\agent-install.ts" ('(?<prefix>AGENT_VERSION\s*=\s*")' + $old + '(?<suffix>")') ('${prefix}' + $target + '${suffix}'))) | Out-Null
$rules.Add((New-VersionRule "internal\site\src\components\routes\settings\release-history.ts" ('(?<prefix>version:\s*")' + $old + '(?<suffix>")') ('${prefix}' + $target + '${suffix}'))) | Out-Null
$rules.Add((New-VersionRule "internal\site\src\components\routes\settings\release-history.ts" ('(?<prefix>title:\s*"Pulse\s+)' + $old + '(?<suffix>\s+开发记录")') ('${prefix}' + $target + '${suffix}'))) | Out-Null
$rules.Add((New-VersionRule "docs\release-notes-next.md" ('(?m)^(?<prefix># Pulse\s+)' + $old + '(?<suffix>\s+开发记录)(?<eol>\r?)$') ('${prefix}' + $target + '${suffix}${eol}'))) | Out-Null
$rules.Add((New-VersionRule "docs\release-notes-next.md" ('(?m)^(?<prefix>##\s+)' + $old + '(?<suffix>\s+开发记录)(?<eol>\r?)$') ('${prefix}' + $target + '${suffix}${eol}'))) | Out-Null
$rules.Add((New-VersionRule "docs\release-notes-next.md" ('(?m)^(?<prefix>> .*?进入 `)' + $old + '(?<suffix>` 开发记录，不再回填到.*)$') ('${prefix}' + $target + '${suffix}'))) | Out-Null

$contents = @{}
$backups = @{}
foreach ($relativePath in ($rules.Path | Select-Object -Unique)) {
    $path = Join-Path $repoRoot $relativePath
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Version source file is missing: $relativePath"
    }
    $contents[$relativePath] = Get-Content -Raw -LiteralPath $path
    $backups[$relativePath] = [System.IO.File]::ReadAllBytes($path)
}

foreach ($rule in $rules) {
    $matches = [regex]::Matches($contents[$rule.Path], $rule.Pattern)
    if ($matches.Count -ne $rule.ExpectedCount) {
        throw "Version rule for $($rule.Path) expected $($rule.ExpectedCount) match(es), found $($matches.Count). No files were changed."
    }
    $contents[$rule.Path] = [regex]::Replace($contents[$rule.Path], $rule.Pattern, $rule.Replacement)
}

$changedPaths = [System.Collections.Generic.List[string]]::new()
try {
    foreach ($relativePath in $contents.Keys) {
        $path = Join-Path $repoRoot $relativePath
        $originalBytes = $backups[$relativePath]
        $hasUtf8Bom = $originalBytes.Length -ge 3 -and $originalBytes[0] -eq 0xEF -and $originalBytes[1] -eq 0xBB -and $originalBytes[2] -eq 0xBF
        [System.IO.File]::WriteAllText($path, $contents[$relativePath], [System.Text.UTF8Encoding]::new($hasUtf8Bom))
        $changedPaths.Add($relativePath) | Out-Null
    }

    Invoke-VersionConsistencyCheck
} catch {
    foreach ($relativePath in $changedPaths) {
        [System.IO.File]::WriteAllBytes((Join-Path $repoRoot $relativePath), $backups[$relativePath])
    }
    throw "Version update failed and all modified files were restored. $($_.Exception.Message)"
}

Write-Host "Pulse version updated from $currentVersion to $targetVersion across $($changedPaths.Count) files."
