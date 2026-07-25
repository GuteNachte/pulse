param(
    [string]$Version = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
. (Join-Path $PSScriptRoot "release-script-helpers.ps1")
$textFileCache = @{}

function Read-JsonFile {
    param([string]$Path)
    return Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json
}

function Read-TextFile {
    param(
        [System.Collections.Generic.List[string]]$Failures,
        [string]$RelativePath,
        [string]$Label
    )

    $path = Join-Path $repoRoot $RelativePath
    if (-not (Test-Path -LiteralPath $path)) {
        Add-Failure $Failures "$Label missing file: $RelativePath"
        return $null
    }

    if (-not $textFileCache.ContainsKey($RelativePath)) {
        $textFileCache[$RelativePath] = Get-Content -Raw -LiteralPath $path
    }
    return $textFileCache[$RelativePath]
}

function Add-Failure {
    param(
        [System.Collections.Generic.List[string]]$Failures,
        [string]$Message
    )
    $Failures.Add($Message) | Out-Null
}

function Assert-Equal {
    param(
        [System.Collections.Generic.List[string]]$Failures,
        [string]$Label,
        [string]$Expected,
        [string]$Actual
    )
    if ($Actual -ne $Expected) {
        Add-Failure $Failures "$Label expected '$Expected' but found '$Actual'"
        return
    }
    Write-Host "[OK] $Label = $Expected"
}

function Assert-FilePattern {
    param(
        [System.Collections.Generic.List[string]]$Failures,
        [string]$RelativePath,
        [string]$Pattern,
        [string]$Label
    )
    $content = Read-TextFile $Failures $RelativePath $Label
    if ($null -eq $content) { return }
    if ($content -notmatch $Pattern) {
        Add-Failure $Failures "$Label did not match expected version pattern in $RelativePath"
        return
    }
    Write-Host "[OK] $Label"
}

function Assert-FileNotPattern {
    param(
        [System.Collections.Generic.List[string]]$Failures,
        [string]$RelativePath,
        [string]$Pattern,
        [string]$Label
    )
    $content = Read-TextFile $Failures $RelativePath $Label
    if ($null -eq $content) { return }
    if ($content -match $Pattern) {
        Add-Failure $Failures "$Label found forbidden pattern in $RelativePath"
        return
    }
    Write-Host "[OK] $Label"
}

function Assert-PatternSet {
    param(
        [System.Collections.Generic.List[string]]$Failures,
        [object[]]$Checks
    )

    foreach ($check in $Checks) {
        Assert-FilePattern $Failures $check.Path $check.Pattern $check.Label
    }
}

function Assert-ForbiddenPatternSet {
    param(
        [System.Collections.Generic.List[string]]$Failures,
        [object[]]$Checks
    )

    foreach ($check in $Checks) {
        Assert-FileNotPattern $Failures $check.Path $check.Pattern $check.Label
    }
}

$sitePackagePath = Join-Path $repoRoot "internal\site\package.json"
if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = (Read-JsonFile $sitePackagePath).version
}

$resolvedVersion = Resolve-PulseVersion -Version $Version
$Version = $resolvedVersion.FullVersion
$androidVersionCode = $resolvedVersion.AndroidVersionCode
$escapedVersion = [regex]::Escape($Version)
$escapedVersionCode = [regex]::Escape([string]$androidVersionCode)
$failures = [System.Collections.Generic.List[string]]::new()

$sitePackage = Read-JsonFile $sitePackagePath
Assert-Equal $failures "internal/site/package.json version" $Version $sitePackage.version

Assert-PatternSet $failures @(
    @{
        Path = "internal\site\package-lock.json"
        Pattern = "(?s)^\s*\{\s*`"name`"\s*:\s*`"pulse`"\s*,\s*`"version`"\s*:\s*`"$escapedVersion`""
        Label = "internal/site/package-lock.json root version"
    },
    @{
        Path = "internal\site\package-lock.json"
        Pattern = "(?s)`"packages`"\s*:\s*\{\s*`"`"\s*:\s*\{\s*`"name`"\s*:\s*`"pulse`"\s*,\s*`"version`"\s*:\s*`"$escapedVersion`""
        Label = "internal/site/package-lock.json package version"
    },
    @{ Path = "pulse.go"; Pattern = "var\s+Version\s*=\s*`"$escapedVersion`""; Label = "pulse.go Version" },
    @{ Path = "Makefile"; Pattern = "(?m)^AGENT_VERSION\s*\?=\s*$escapedVersion\s*$"; Label = "Makefile AGENT_VERSION" },
    @{ Path = "Makefile"; Pattern = "(?m)^HUB_VERSION\s*\?=\s*$escapedVersion\s*$"; Label = "Makefile HUB_VERSION" },
    @{
        Path = "internal\site\android\app\build.gradle"
        Pattern = "versionCode\s+project\.hasProperty\('pulseVersionCode'\)\s*\?\s*project\.property\('pulseVersionCode'\)\.toInteger\(\)\s*:\s*$escapedVersionCode"
        Label = "Android versionCode"
    },
    @{
        Path = "internal\site\android\app\build.gradle"
        Pattern = "versionName\s+project\.hasProperty\('pulseVersionName'\)\s*\?\s*project\.property\('pulseVersionName'\)\s*:\s*`"$escapedVersion`""
        Label = "Android versionName"
    },
    @{ Path = "internal\dockerfile_agent"; Pattern = "ARG\s+AGENT_VERSION=$escapedVersion"; Label = "dockerfile_agent AGENT_VERSION" },
    @{ Path = "internal\dockerfile_agent_intel"; Pattern = "ARG\s+AGENT_VERSION=$escapedVersion"; Label = "dockerfile_agent_intel AGENT_VERSION" },
    @{ Path = "internal\dockerfile_hub"; Pattern = "ARG\s+HUB_VERSION=$escapedVersion"; Label = "dockerfile_hub HUB_VERSION" }
)

$scriptDefaults = @(
    "supplemental\scripts\build-agent-v1.ps1",
    "supplemental\scripts\publish-agent-v1.ps1",
    "supplemental\scripts\publish-hub-v1.ps1",
    "supplemental\scripts\publish-release-v1.ps1",
    "supplemental\scripts\verify-release-v1.ps1"
)
foreach ($relativePath in $scriptDefaults) {
    Assert-FilePattern $failures $relativePath ('\[string\]\s*\$Version\s*=\s*"' + $escapedVersion + '"') "$relativePath default Version"
}
Assert-PatternSet $failures @(
    @{
        Path = "supplemental\scripts\run-hub-dev.ps1"
        Pattern = '\[string\]\s*\$HubVersion\s*=\s*"' + $escapedVersion + '"'
        Label = "run-hub-dev HubVersion"
    },
    @{
        Path = "supplemental\scripts\run-hub-local.ps1"
        Pattern = '\[string\]\s*\$Image\s*=\s*"pulse-hub:' + $escapedVersion + '"'
        Label = "run-hub-local image tag"
    },
    @{
        Path = "supplemental\scripts\run-hub-local.ps1"
        Pattern = '\[string\]\s*\$HubVersion\s*=\s*"' + $escapedVersion + '"'
        Label = "run-hub-local HubVersion"
    }
)

$harborHubImagePattern = "(?m)^\s*image:\s*registry\.example\.com/infra/pulse-hub:$escapedVersion\s*$"
$harborAgentImagePattern = "(?m)^\s*image:\s*registry\.example\.com/infra/pulse-agent:$escapedVersion\s*$"
$localHubImagePattern = "(?m)^\s*image:\s*pulse-hub:$escapedVersion\s*$"

Assert-PatternSet $failures @(
    @{ Path = "supplemental\docker\hub\docker-compose.yml"; Pattern = $harborHubImagePattern; Label = "Hub Compose pulse-hub image" },
    @{ Path = "supplemental\docker\hub\docker-compose.yml"; Pattern = $harborAgentImagePattern; Label = "Hub Compose pulse-agent image" },
    @{ Path = "supplemental\docker\same-system\docker-compose.yml"; Pattern = $harborHubImagePattern; Label = "Same-system Compose pulse-hub image" },
    @{ Path = "supplemental\docker\same-system\docker-compose.yml"; Pattern = $harborAgentImagePattern; Label = "Same-system Compose pulse-agent image" },
    @{ Path = "supplemental\docker\agent\docker-compose.yml"; Pattern = $harborAgentImagePattern; Label = "Agent Compose pulse-agent image" },
    @{ Path = "supplemental\docker\local-dev\docker-compose.yml"; Pattern = $localHubImagePattern; Label = "Local dev Compose pulse-hub image" }
)

Assert-ForbiddenPatternSet $failures @(
    @{ Path = "supplemental\docker\agent\docker-compose.yml"; Pattern = "(?m)^\s*image:\s*\S+:latest\s*$"; Label = "supplemental\docker\agent\docker-compose.yml does not use latest image tag" },
    @{ Path = "supplemental\docker\hub\docker-compose.yml"; Pattern = "(?m)^\s*image:\s*\S+:latest\s*$"; Label = "supplemental\docker\hub\docker-compose.yml does not use latest image tag" },
    @{ Path = "supplemental\docker\local-dev\docker-compose.yml"; Pattern = "(?m)^\s*image:\s*\S+:latest\s*$"; Label = "supplemental\docker\local-dev\docker-compose.yml does not use latest image tag" },
    @{ Path = "supplemental\docker\same-system\docker-compose.yml"; Pattern = "(?m)^\s*image:\s*\S+:latest\s*$"; Label = "supplemental\docker\same-system\docker-compose.yml does not use latest image tag" }
)

Assert-PatternSet $failures @(
    @{
        Path = "internal\site\src\components\routes\settings\about.tsx"
        Pattern = 'import\s+sitePackage\s+from\s+"../../../../package\.json"'
        Label = "About reads Web/Android version from package.json"
    },
    @{
        Path = "internal\site\src\components\routes\settings\about.tsx"
        Pattern = 'const\s+WEB_VERSION\s*=\s*sitePackage\.version'
        Label = "About uses package.json as version source"
    },
    @{
        Path = "internal\site\src\components\routes\settings\about.tsx"
        Pattern = '\{\s*label:\s*"Web"\s*,\s*value:\s*WEB_VERSION'
        Label = "About displays Web version from shared source"
    },
    @{
        Path = "internal\site\src\components\routes\settings\about.tsx"
        Pattern = '\{\s*label:\s*"Android"\s*,\s*value:\s*WEB_VERSION'
        Label = "About displays Android version from shared source"
    },
    @{
        Path = "internal\site\src\components\routes\settings\about.tsx"
        Pattern = 'label="Agent 实际版本"'
        Label = "About displays actual Agent versions"
    },
    @{ Path = "docs\agent-1.0-install.md"; Pattern = "registry\.example\.com/infra/pulse-agent:$escapedVersion"; Label = "Agent install doc pulse-agent image" },
    @{ Path = "docs\agent-1.0-install.md"; Pattern = 'loopback-only.*`Hub`'; Label = "Agent install doc local Hub display rule" },
    @{ Path = "docs\flynas-compose-checklist.md"; Pattern = "registry\.example\.com/infra/pulse-hub:$escapedVersion"; Label = "FlyNAS checklist pulse-hub image" },
    @{ Path = "docs\flynas-compose-checklist.md"; Pattern = "registry\.example\.com/infra/pulse-agent:$escapedVersion"; Label = "FlyNAS checklist pulse-agent image" },
    @{ Path = "docs\flynas-compose-checklist.md"; Pattern = "docker pull registry\.example\.com/infra/pulse-hub:$escapedVersion"; Label = "FlyNAS checklist pulse-hub pull command" },
    @{ Path = "docs\flynas-compose-checklist.md"; Pattern = "docker pull registry\.example\.com/infra/pulse-agent:$escapedVersion"; Label = "FlyNAS checklist pulse-agent pull command" },
    @{ Path = "docs\flynas-compose-checklist.md"; Pattern = 'loopback-only.*`Hub`'; Label = "FlyNAS checklist local Hub display rule" },
    @{ Path = "docs\local-dev-runbook.md"; Pattern = "pulse-hub:$escapedVersion"; Label = "Local runbook local Hub image" },
    @{ Path = "docs\local-dev-runbook.md"; Pattern = "image:\s*registry\.example\.com/infra/pulse-hub:$escapedVersion"; Label = "Local runbook deploy pulse-hub image" },
    @{ Path = "docs\local-dev-runbook.md"; Pattern = "image:\s*registry\.example\.com/infra/pulse-agent:$escapedVersion"; Label = "Local runbook deploy pulse-agent image" },
    @{ Path = "docs\local-dev-runbook.md"; Pattern = "check-version-consistency\.ps1 -Version $escapedVersion"; Label = "Local runbook version check command" },
    @{ Path = "docs\local-dev-runbook.md"; Pattern = "publish-release-v1\.ps1 -Version $escapedVersion"; Label = "Local runbook release command" },
    @{ Path = "docs\local-dev-runbook.md"; Pattern = "verify-release-v1\.ps1 -Version $escapedVersion"; Label = "Local runbook release verification command" },
    @{ Path = "docs\release-deployment-runbook.md"; Pattern = "publish-release-v1\.ps1 -Version $escapedVersion"; Label = "Release deployment runbook release command" },
    @{ Path = "docs\release-deployment-runbook.md"; Pattern = "verify-release-v1\.ps1 -Version $escapedVersion"; Label = "Release deployment runbook verification command" },
    @{ Path = "docs\release-deployment-runbook.md"; Pattern = "pulse-hub:$escapedVersion"; Label = "Release deployment runbook Hub image" },
    @{ Path = "docs\release-deployment-runbook.md"; Pattern = "pulse-agent:$escapedVersion"; Label = "Release deployment runbook Agent image" },
    @{ Path = "docs\release-deployment-runbook.md"; Pattern = "versionName.*$escapedVersion"; Label = "Release deployment runbook Android versionName" }
)

$versionedTextFiles = @(
    "internal\site\src\lib\agent-install.ts",
    "internal\site\src\components\routes\settings\release-history.ts",
    "internal\site\index.html",
    "internal\site\public\static\manifest.json",
    "supplemental\docker\agent\docker-compose.yml",
    "supplemental\docker\hub\docker-compose.yml",
    "supplemental\docker\local-dev\docker-compose.yml",
    "supplemental\docker\same-system\docker-compose.yml",
    "docs\agent-1.0-install.md",
    "docs\flynas-compose-checklist.md",
    "docs\local-dev-runbook.md",
    "docs\release-deployment-runbook.md"
)
foreach ($relativePath in $versionedTextFiles) {
    Assert-FilePattern $failures $relativePath $escapedVersion "$relativePath contains $Version"
}

if ($failures.Count -gt 0) {
    Write-Host ""
    Write-Host "Version consistency check failed:" -ForegroundColor Red
    foreach ($failure in $failures) {
        Write-Host "  - $failure" -ForegroundColor Red
    }
    exit 1
}

Write-Host ""
Write-Host "Version consistency check passed for $Version. Android versionCode: $androidVersionCode"
