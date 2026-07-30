$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "android-signing-helpers.ps1")

$fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("pulse-android-version-code-" + [guid]::NewGuid().ToString("N"))
$versionCodePath = Join-Path $fixtureRoot "internal\site\android\version-code.txt"

function Invoke-FixtureGit {
    param([Parameter(Mandatory)][string[]]$GitArguments)

    & git -C $fixtureRoot @GitArguments | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Fixture git command failed: git $($GitArguments -join ' ')"
    }
}

New-Item -ItemType Directory -Path (Split-Path -Parent $versionCodePath) -Force | Out-Null
try {
    Invoke-FixtureGit @("init", "--quiet")
    Invoke-FixtureGit @("config", "user.name", "Pulse Test")
    Invoke-FixtureGit @("config", "user.email", "pulse-test@example.invalid")

    $legacyResult = Assert-AndroidVersionCodeMonotonic `
        -Version "1.0.6-beta.1" `
        -VersionCode 1000602 `
        -RepositoryRoot $fixtureRoot
    if ($legacyResult.PreviousMaximum -ne 10006) {
        throw "Android versionCode history did not include the 1.0.6-beta.1 migration baseline."
    }

    foreach ($published in @(
        @{ Version = "1.0.6-beta.2"; VersionCode = 1000602 },
        @{ Version = "1.0.6-beta.3"; VersionCode = 1000603 },
        @{ Version = "1.0.6-beta.4"; VersionCode = 1000604 },
        @{ Version = "1.0.6-beta.5"; VersionCode = 1000605 }
    )) {
        [string]$published.VersionCode | Set-Content -LiteralPath $versionCodePath -Encoding ascii -NoNewline
        Invoke-FixtureGit @("add", "internal/site/android/version-code.txt")
        Invoke-FixtureGit @("commit", "--quiet", "-m", "release $($published.Version)")
        Invoke-FixtureGit @("tag", "-a", "v$($published.Version)", "-m", "Pulse $($published.Version)")
    }

    $result = Assert-AndroidVersionCodeMonotonic `
        -Version "1.0.6-beta.6" `
        -VersionCode 1000606 `
        -RepositoryRoot $fixtureRoot
    if ($result.PreviousMaximum -ne 1000605) {
        throw "Android versionCode history did not include the latest published versionCode."
    }

    "1000606" | Set-Content -LiteralPath $versionCodePath -Encoding ascii -NoNewline
    Invoke-FixtureGit @("add", "internal/site/android/version-code.txt")
    Invoke-FixtureGit @("commit", "--quiet", "-m", "release 1.0.6-beta.6")
    Invoke-FixtureGit @("tag", "-a", "v1.0.6-beta.6", "-m", "Pulse 1.0.6-beta.6")
    $taggedResult = Assert-AndroidVersionCodeMonotonic `
        -Version "1.0.6-beta.6" `
        -VersionCode 1000606 `
        -RepositoryRoot $fixtureRoot
    if ($taggedResult.PreviousMaximum -ne 1000605) {
        throw "Android versionCode guard did not exclude the current release tag."
    }

    try {
        Assert-AndroidVersionCodeMonotonic `
            -Version "1.0.6-beta.6" `
            -VersionCode 1000605 `
            -RepositoryRoot $fixtureRoot | Out-Null
        throw "Android versionCode monotonic guard accepted a published versionCode."
    } catch {
        if ($_.Exception.Message -notlike "*must be greater than published maximum*") {
            throw
        }
    }
} finally {
    if (Test-Path -LiteralPath $fixtureRoot) {
        Remove-Item -LiteralPath $fixtureRoot -Recurse -Force
    }
}

Write-Host "Android versionCode monotonic contract passed."
