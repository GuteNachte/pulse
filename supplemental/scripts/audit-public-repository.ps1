param(
    [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")),
    [string]$OutputDirectory = ".public-audit",
    [switch]$SkipHistoryScan
)

$ErrorActionPreference = "Stop"

function Test-FindingAllowed {
    param(
        [Parameter(Mandatory)]$Rules,
        [Parameter(Mandatory)][string]$RuleId,
        [Parameter(Mandatory)][string]$Path
    )

    foreach ($allowRule in @($Rules.allowedFindings)) {
        if ($allowRule.ruleId -eq $RuleId -and $Path -match $allowRule.pathPattern) {
            return $true
        }
    }
    return $false
}

function Get-TextFileContent {
    param([Parameter(Mandatory)][string]$Path)

    $bytes = [System.IO.File]::ReadAllBytes($Path)
    if ([Array]::IndexOf($bytes, [byte]0) -ge 0) {
        return $null
    }
    return [System.Text.Encoding]::UTF8.GetString($bytes)
}

function Add-AuditFinding {
    param(
        [Parameter(Mandatory)]$Findings,
        [Parameter(Mandatory)][string]$Source,
        [Parameter(Mandatory)][string]$Category,
        [Parameter(Mandatory)][string]$RuleId,
        [string]$Path = "",
        [string]$Commit = "",
        [Parameter(Mandatory)][string]$Description
    )

    $Findings.Add([pscustomobject][ordered]@{
        source = $Source
        category = $Category
        ruleId = $RuleId
        path = $Path
        commit = $Commit
        description = $Description
    }) | Out-Null
}

$repositoryPath = (Resolve-Path -LiteralPath $RepositoryRoot).Path
$rulesPath = Join-Path $PSScriptRoot "public-audit-rules.json"
$gitleaksConfigPath = Join-Path $repositoryPath ".gitleaks.toml"
$outputPath = if ([System.IO.Path]::IsPathRooted($OutputDirectory)) {
    $OutputDirectory
} else {
    Join-Path $repositoryPath $OutputDirectory
}
$findingsPath = Join-Path $outputPath "findings.json"
$historyReportPath = Join-Path $outputPath "gitleaks-history.json"

if (-not (Test-Path -LiteralPath $rulesPath)) {
    throw "Missing public audit rules: $rulesPath"
}

$rules = Get-Content -LiteralPath $rulesPath -Raw -Encoding UTF8 | ConvertFrom-Json
$findings = [System.Collections.Generic.List[object]]::new()
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null

$trackedFiles = @(& git -C $repositoryPath ls-files)
if ($LASTEXITCODE -ne 0) {
    throw "Unable to list tracked files in repository: $repositoryPath"
}

foreach ($trackedFile in $trackedFiles) {
    $relativePath = $trackedFile.Replace("\", "/")
    $absolutePath = Join-Path $repositoryPath $trackedFile

    foreach ($pathRule in @($rules.forbiddenTrackedPaths)) {
        if ($relativePath -match $pathRule.pattern -and -not (Test-FindingAllowed -Rules $rules -RuleId $pathRule.id -Path $relativePath)) {
            Add-AuditFinding -Findings $findings -Source "current-tree" -Category "forbidden-path" -RuleId $pathRule.id -Path $relativePath -Description $pathRule.description
        }
    }

    if (-not (Test-Path -LiteralPath $absolutePath -PathType Leaf)) {
        continue
    }

    $content = Get-TextFileContent -Path $absolutePath
    if ($null -eq $content) {
        continue
    }

    foreach ($contentRule in @($rules.forbiddenContent)) {
        if ($relativePath -notmatch $contentRule.pathPattern) {
            continue
        }
        if ($content -match $contentRule.pattern -and -not (Test-FindingAllowed -Rules $rules -RuleId $contentRule.id -Path $relativePath)) {
            Add-AuditFinding -Findings $findings -Source "current-tree" -Category "forbidden-content" -RuleId $contentRule.id -Path $relativePath -Description $contentRule.description
        }
    }
}

$historyStatus = "skipped"
if (-not $SkipHistoryScan) {
    $historyStatus = "completed"
    $gitleaksCommand = Get-Command gitleaks -ErrorAction SilentlyContinue
    if ($null -eq $gitleaksCommand) {
        $historyStatus = "unavailable"
        Add-AuditFinding -Findings $findings -Source "history" -Category "scanner-unavailable" -RuleId "gitleaks-required" -Description "Gitleaks must be available on PATH for a full history audit."
    } elseif (-not (Test-Path -LiteralPath $gitleaksConfigPath)) {
        $historyStatus = "configuration-missing"
        Add-AuditFinding -Findings $findings -Source "history" -Category "scanner-configuration" -RuleId "gitleaks-config-required" -Path ".gitleaks.toml" -Description "The repository must provide a Gitleaks configuration."
    } else {
        Remove-Item -LiteralPath $historyReportPath -Force -ErrorAction SilentlyContinue
        $null = & $gitleaksCommand.Source git $repositoryPath --config $gitleaksConfigPath --redact --report-format json --report-path $historyReportPath --no-banner --no-color --log-level error 2>&1
        $gitleaksExitCode = $LASTEXITCODE

        if ($gitleaksExitCode -eq 1) {
            $historyStatus = "findings"
            $historyFindings = if (Test-Path -LiteralPath $historyReportPath) {
                @(Get-Content -LiteralPath $historyReportPath -Raw -Encoding UTF8 | ConvertFrom-Json)
            } else {
                @()
            }

            if ($historyFindings.Count -eq 0) {
                Add-AuditFinding -Findings $findings -Source "history" -Category "secret" -RuleId "gitleaks-finding" -Description "Gitleaks reported a redacted history finding."
            } else {
                foreach ($historyFinding in $historyFindings) {
                    Add-AuditFinding -Findings $findings -Source "history" -Category "secret" -RuleId ([string]$historyFinding.RuleID) -Path ([string]$historyFinding.File) -Commit ([string]$historyFinding.Commit) -Description "Gitleaks reported a redacted history finding."
                }
            }
        } elseif ($gitleaksExitCode -ne 0) {
            $historyStatus = "failed"
            Add-AuditFinding -Findings $findings -Source "history" -Category "scanner-error" -RuleId "gitleaks-execution" -Description "Gitleaks failed before completing the history audit."
        }
    }
}

$sortedFindings = @($findings | Sort-Object source, category, path, ruleId, commit)
$status = if ($sortedFindings.Count -eq 0) { "ready" } else { "blocked" }
$report = [pscustomobject][ordered]@{
    schemaVersion = 1
    status = $status
    historyScan = $historyStatus
    findingCount = $sortedFindings.Count
    findings = $sortedFindings
}

$report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $findingsPath -Encoding utf8NoBOM

if ($sortedFindings.Count -gt 0) {
    Write-Host "Public repository audit blocked with $($sortedFindings.Count) finding(s). See $findingsPath"
    exit 1
}

Write-Host "Public repository audit passed. See $findingsPath"
exit 0
