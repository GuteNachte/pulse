$ErrorActionPreference = "Stop"

$auditScript = Join-Path $PSScriptRoot "audit-public-repository.ps1"
$rulesPath = Join-Path $PSScriptRoot "public-audit-rules.json"
$fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("pulse-public-audit-" + [Guid]::NewGuid().ToString("N"))
$findingsPath = Join-Path $fixtureRoot ".public-audit\findings.json"

function Invoke-FixtureGit {
    param([Parameter(Mandatory)][string[]]$Arguments)

    & git -C $fixtureRoot @Arguments | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Fixture git command failed: git $($Arguments -join ' ')"
    }
}

try {
    if (-not (Test-Path -LiteralPath $auditScript)) {
        throw "Missing public repository audit implementation: $auditScript"
    }

    $rules = Get-Content -LiteralPath $rulesPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $pathFixtures = [ordered]@{
        "pulse_data/data.db" = "runtime-data"
        "state/pulse.db" = "pocketbase-database"
        "backups/pulse.zip" = "backup-artifact"
        "logs/hub.log" = "runtime-log"
        "config/secrets.json" = "generated-credential-file"
        "config/server.key" = "private-key-file"
        "device-photos/router.jpg" = "local-media"
    }
    foreach ($pathFixture in $pathFixtures.GetEnumerator()) {
        $rule = $rules.forbiddenTrackedPaths | Where-Object id -eq $pathFixture.Value
        if ($null -eq $rule -or $pathFixture.Key -notmatch $rule.pattern) {
            throw "Path rule $($pathFixture.Value) did not match $($pathFixture.Key)."
        }
    }
    if (@($rules.forbiddenTrackedPaths | Where-Object { "docs/credential-example.md" -match $_.pattern }).Count -ne 0) {
        throw "Path rules rejected a documentation example."
    }

    New-Item -ItemType Directory -Force -Path (Join-Path $fixtureRoot "docs") | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $fixtureRoot "config") | Out-Null
    Set-Content -LiteralPath (Join-Path $fixtureRoot "docs\credential-example.md") -Encoding UTF8 -Value 'TOKEN="example-redacted"'
    Set-Content -LiteralPath (Join-Path $fixtureRoot ".gitleaks.toml") -Encoding UTF8 -Value 'title = "Fixture"'

    $fixtureFile = Join-Path $fixtureRoot "config\settings.ps1"
    Set-Content -LiteralPath $fixtureFile -Encoding UTF8 -Value 'TOKEN="fixture-forbidden-value"'

    Invoke-FixtureGit -Arguments @("init", "--quiet")
    Invoke-FixtureGit -Arguments @("add", ".")

    $forbiddenOutput = & $auditScript -RepositoryRoot $fixtureRoot -SkipHistoryScan 2>&1
    if ($LASTEXITCODE -eq 0) {
        throw "Audit accepted a credential fixture. Output: $($forbiddenOutput -join [Environment]::NewLine)"
    }
    if (-not (Test-Path -LiteralPath $findingsPath)) {
        throw "Audit did not write machine-readable findings."
    }

    $blockedReport = Get-Content -LiteralPath $findingsPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($blockedReport.status -ne "blocked" -or $blockedReport.findingCount -lt 1) {
        throw "Audit did not report the forbidden fixture as blocked."
    }
    if (@($blockedReport.findings.ruleId) -notcontains "credential-assignment") {
        throw "Audit did not identify the credential assignment rule."
    }

    Set-Content -LiteralPath $fixtureFile -Encoding UTF8 -Value 'TOKEN="example-redacted"'
    & $auditScript -RepositoryRoot $fixtureRoot -SkipHistoryScan
    if ($LASTEXITCODE -ne 0) {
        throw "Audit rejected the clean fixture."
    }

    $readyReport = Get-Content -LiteralPath $findingsPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($readyReport.status -ne "ready" -or $readyReport.findingCount -ne 0) {
        throw "Audit retained findings after the fixture was cleaned."
    }

    $fakeBin = Join-Path $fixtureRoot ".test-bin"
    New-Item -ItemType Directory -Force -Path $fakeBin | Out-Null
    Set-Content -LiteralPath (Join-Path $fakeBin "gitleaks.cmd") -Encoding ASCII -Value @(
        "@echo PRIVATE-SCANNER-OUTPUT",
        "@exit /b 0"
    )

    $originalPath = $env:PATH
    try {
        $env:PATH = "$fakeBin;$originalPath"
        $historyOutput = & $auditScript -RepositoryRoot $fixtureRoot 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Audit rejected the clean history fixture."
        }
        if (($historyOutput -join [Environment]::NewLine) -match "PRIVATE-SCANNER-OUTPUT") {
            throw "Audit exposed scanner process output."
        }
    } finally {
        $env:PATH = $originalPath
    }

    Write-Host "Public repository audit contract passed."
} finally {
    Remove-Item -LiteralPath $fixtureRoot -Recurse -Force -ErrorAction SilentlyContinue
}
