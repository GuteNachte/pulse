$ErrorActionPreference = "Stop"

$auditScript = Join-Path $PSScriptRoot "audit-public-repository.ps1"
$rulesPath = Join-Path $PSScriptRoot "public-audit-rules.json"
$repositoryRoot = [string](Resolve-Path (Join-Path $PSScriptRoot "..\.."))
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

    $policyFailures = [System.Collections.Generic.List[string]]::new()
    $license = Get-Content -LiteralPath (Join-Path $repositoryRoot "LICENSE") -Raw -Encoding UTF8
    if (-not $license.Contains("Copyright (c) 2024 henrygd")) {
        $policyFailures.Add("LICENSE must retain the upstream henrygd copyright.")
    }
    if (-not $license.Contains("Copyright (c) 2026 Pulse contributors")) {
        $policyFailures.Add("LICENSE must identify the Pulse contributors separately.")
    }

    $thirdPartyNotices = Get-Content -LiteralPath (Join-Path $repositoryRoot "THIRD_PARTY_NOTICES.md") -Raw -Encoding UTF8
    if (-not $thirdPartyNotices.Contains("## Homelable")) {
        $policyFailures.Add("THIRD_PARTY_NOTICES.md must list Homelable.")
    }
    if (-not $thirdPartyNotices.Contains("[LICENSE](LICENSE)")) {
        $policyFailures.Add("THIRD_PARTY_NOTICES.md must explain its relationship to LICENSE.")
    }

    $securityPolicy = Get-Content -LiteralPath (Join-Path $repositoryRoot "SECURITY.md") -Raw -Encoding UTF8
    if (-not $securityPolicy.Contains("GitHub Private Vulnerability Reporting")) {
        $policyFailures.Add("SECURITY.md must use GitHub Private Vulnerability Reporting.")
    }
    if ($securityPolicy -match "(?i)[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}") {
        $policyFailures.Add("SECURITY.md must not publish an unapproved personal email address.")
    }

    $privacyPath = Join-Path $repositoryRoot "docs\public-security-and-privacy.md"
    if (-not (Test-Path -LiteralPath $privacyPath)) {
        $policyFailures.Add("docs/public-security-and-privacy.md is missing.")
    } else {
        $privacyPolicy = Get-Content -LiteralPath $privacyPath -Raw -Encoding UTF8
        if (-not $privacyPolicy.Contains("Telemetry is disabled by default")) {
            $policyFailures.Add("The privacy policy must state that telemetry is disabled by default.")
        }
        if (-not $privacyPolicy.Contains('`pulse_data`')) {
            $policyFailures.Add("The privacy policy must identify the configured pulse_data directory.")
        }
    }

    $workflowPath = Join-Path $repositoryRoot ".github\workflows\public-readiness.yml"
    if (-not (Test-Path -LiteralPath $workflowPath)) {
        $policyFailures.Add("The public readiness CI workflow is missing.")
    } else {
        $workflow = Get-Content -LiteralPath $workflowPath -Raw -Encoding UTF8
        foreach ($workflowContract in @(
            "permissions:",
            "contents: read",
            "fetch-depth: 0",
            'GITLEAKS_VERSION: "8.30.1"',
            "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb",
            "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
            "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
            "pwsh -NoProfile -File supplemental/scripts/audit-public-repository.ps1",
            "if: failure()"
        )) {
            if (-not $workflow.Contains($workflowContract)) {
                $policyFailures.Add("The public readiness workflow is missing: $workflowContract")
            }
        }
    }

    if ($policyFailures.Count -gt 0) {
        throw "Public policy contract failed: $($policyFailures -join ' ')"
    }

    $rules = Get-Content -LiteralPath $rulesPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $privateEndpointRule = $rules.forbiddenContent | Where-Object id -eq "private-legacy-endpoint"
    $privateEndpointValue = @($privateEndpointRule.historyLiteralParts) -join ""
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
    New-Item -ItemType Directory -Force -Path (Join-Path $fixtureRoot "src") | Out-Null
    Set-Content -LiteralPath (Join-Path $fixtureRoot "docs\credential-example.md") -Encoding UTF8 -Value 'TOKEN="example-redacted"'
    Set-Content -LiteralPath (Join-Path $fixtureRoot "docs\environment-example.yml") -Encoding UTF8 -Value @'
TOKEN: "${PULSE_AGENT_TOKEN}"
PASSWORD: "YOUR_PASSWORD"
'@
    Set-Content -LiteralPath (Join-Path $fixtureRoot ".gitleaks.toml") -Encoding UTF8 -Value 'title = "Fixture"'

    $fixtureFile = Join-Path $fixtureRoot "config\settings.ps1"
    Set-Content -LiteralPath $fixtureFile -Encoding UTF8 -Value 'TOKEN="fixture-forbidden-value"'
    $privateSourceFile = Join-Path $fixtureRoot "src\private-endpoint.go"
    Set-Content -LiteralPath $privateSourceFile -Encoding UTF8 -Value $privateEndpointValue

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
    if (@($blockedReport.findings.ruleId) -notcontains "private-legacy-endpoint") {
        throw "Audit did not identify a private endpoint in source code."
    }

    Set-Content -LiteralPath $fixtureFile -Encoding UTF8 -Value 'TOKEN="example-redacted"'
    Set-Content -LiteralPath $privateSourceFile -Encoding UTF8 -Value "http://192.0.2.20:3005"
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
        Invoke-FixtureGit -Arguments @("config", "user.name", "Pulse Audit Fixture")
        Invoke-FixtureGit -Arguments @("config", "user.email", "audit@example.com")
        Invoke-FixtureGit -Arguments @("add", ".")
        Invoke-FixtureGit -Arguments @("commit", "--quiet", "-m", "clean fixture")

        $env:PATH = "$fakeBin;$originalPath"
        $historyOutput = & $auditScript -RepositoryRoot $fixtureRoot 2>&1
        if ($LASTEXITCODE -ne 0) {
            $unexpectedHistoryReport = Get-Content -LiteralPath $findingsPath -Raw -Encoding UTF8 | ConvertFrom-Json
            $unexpectedHistorySummary = @($unexpectedHistoryReport.findings | ForEach-Object { "$($_.ruleId):$($_.path):$($_.commit)" }) -join ", "
            throw "Audit rejected the clean history fixture: $unexpectedHistorySummary"
        }
        if (($historyOutput -join [Environment]::NewLine) -match "PRIVATE-SCANNER-OUTPUT") {
            throw "Audit exposed scanner process output."
        }

        $privateHistoryValue = @($privateEndpointRule.historyLiteralParts) -join ""
        if ([string]::IsNullOrWhiteSpace($privateHistoryValue)) {
            throw "Private endpoint rule is missing a history literal contract."
        }

        $historyFixturePath = Join-Path $fixtureRoot "docs\historical-endpoint.md"
        Set-Content -LiteralPath $historyFixturePath -Encoding UTF8 -Value $privateHistoryValue
        Invoke-FixtureGit -Arguments @("add", ".")
        Invoke-FixtureGit -Arguments @("commit", "--quiet", "-m", "add private endpoint")
        Set-Content -LiteralPath $historyFixturePath -Encoding UTF8 -Value "http://192.0.2.20:3005"
        Invoke-FixtureGit -Arguments @("add", ".")
        Invoke-FixtureGit -Arguments @("commit", "--quiet", "-m", "remove private endpoint")

        $historyOutput = & $auditScript -RepositoryRoot $fixtureRoot 2>&1
        if ($LASTEXITCODE -eq 0) {
            throw "Audit accepted a private endpoint retained in Git history."
        }
        $historyReport = Get-Content -LiteralPath $findingsPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $privateHistoryFindings = @($historyReport.findings | Where-Object { $_.source -eq "history" -and $_.ruleId -eq "private-legacy-endpoint" })
        if ($privateHistoryFindings.Count -lt 1) {
            throw "Audit did not report the private endpoint history finding."
        }
        if (($historyOutput -join [Environment]::NewLine) -match "PRIVATE-SCANNER-OUTPUT") {
            throw "Audit exposed scanner process output while reporting history findings."
        }
    } finally {
        $env:PATH = $originalPath
    }

    Write-Host "Public repository audit contract passed."
} finally {
    Remove-Item -LiteralPath $fixtureRoot -Recurse -Force -ErrorAction SilentlyContinue
}
