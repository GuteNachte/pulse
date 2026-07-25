$ErrorActionPreference = "Stop"

$auditScript = Join-Path $PSScriptRoot "audit-public-repository.ps1"
$fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("pulse-public-audit-" + [Guid]::NewGuid().ToString("N"))

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

    New-Item -ItemType Directory -Force -Path (Join-Path $fixtureRoot "docs") | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $fixtureRoot "config") | Out-Null
    Set-Content -LiteralPath (Join-Path $fixtureRoot "docs\credential-example.md") -Encoding UTF8 -Value 'TOKEN="example-redacted"'

    $fixtureFile = Join-Path $fixtureRoot "config\settings.ps1"
    Set-Content -LiteralPath $fixtureFile -Encoding UTF8 -Value 'TOKEN="fixture-forbidden-value"'

    Invoke-FixtureGit -Arguments @("init", "--quiet")
    Invoke-FixtureGit -Arguments @("add", ".")

    $forbiddenOutput = & $auditScript -RepositoryRoot $fixtureRoot -SkipHistoryScan 2>&1
    if ($LASTEXITCODE -eq 0) {
        throw "Audit accepted a credential fixture. Output: $($forbiddenOutput -join [Environment]::NewLine)"
    }

    Set-Content -LiteralPath $fixtureFile -Encoding UTF8 -Value 'TOKEN="example-redacted"'
    & $auditScript -RepositoryRoot $fixtureRoot -SkipHistoryScan
    if ($LASTEXITCODE -ne 0) {
        throw "Audit rejected the clean fixture."
    }

    Write-Host "Public repository audit contract passed."
} finally {
    Remove-Item -LiteralPath $fixtureRoot -Recurse -Force -ErrorAction SilentlyContinue
}
