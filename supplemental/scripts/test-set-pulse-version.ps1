$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$updaterPath = Join-Path $PSScriptRoot "set-pulse-version.ps1"
$checkerPath = Join-Path $PSScriptRoot "check-version-consistency.ps1"
$targetVersion = "1.0.6-beta.4"
$targetAndroidVersionCode = 1000604

$fixtureFiles = @(
    "internal\site\package.json",
    "internal\site\package-lock.json",
    "pulse.go",
    "Makefile",
    "internal\site\android\app\build.gradle",
    "internal\site\android\version-code.txt",
    "internal\dockerfile_agent",
    "internal\dockerfile_agent_intel",
    "internal\dockerfile_hub",
    "supplemental\scripts\build-agent-v1.ps1",
    "supplemental\scripts\publish-agent-v1.ps1",
    "supplemental\scripts\publish-hub-v1.ps1",
    "supplemental\scripts\publish-release-v1.ps1",
    "supplemental\scripts\verify-release-v1.ps1",
    "supplemental\scripts\run-hub-dev.ps1",
    "supplemental\scripts\run-hub-local.ps1",
    "supplemental\docker\agent\docker-compose.yml",
    "supplemental\docker\hub\docker-compose.yml",
    "supplemental\docker\local-dev\docker-compose.yml",
    "supplemental\docker\same-system\docker-compose.yml",
    "internal\site\src\components\routes\settings\about.tsx",
    "internal\site\src\components\routes\settings\release-history.ts",
    "internal\site\src\lib\agent-install.ts",
    "internal\site\index.html",
    "internal\site\public\static\manifest.json",
    "docs\agent-1.0-install.md",
    "docs\flynas-compose-checklist.md",
    "docs\local-dev-runbook.md",
    "docs\release-deployment-runbook.md",
    "docs\release-notes-next.md"
)

function New-VersionFixture {
    $fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("pulse-version-test-" + [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $fixtureRoot | Out-Null
    foreach ($relativePath in $fixtureFiles) {
        $source = Join-Path $repoRoot $relativePath
        $destination = Join-Path $fixtureRoot $relativePath
        New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
        Copy-Item -LiteralPath $source -Destination $destination

        $content = Get-Content -Raw -LiteralPath $destination
        if ($content.Contains($targetVersion)) {
            [System.IO.File]::WriteAllText(
                $destination,
                $content.Replace($targetVersion, "1.0.6"),
                [System.Text.UTF8Encoding]::new($false)
            )
        }
    }
    return $fixtureRoot
}

function Invoke-PwshFile {
    param(
        [string]$Path,
        [string[]]$Arguments
    )

    $output = & pwsh -NoProfile -File $Path @Arguments 2>&1 | Out-String
    return [pscustomobject]@{
        ExitCode = $LASTEXITCODE
        Output = $output
    }
}

function Assert-Success {
    param([string]$Label, $Result)
    if ($Result.ExitCode -ne 0) {
        throw "$Label failed with exit code $($Result.ExitCode):`n$($Result.Output)"
    }
}

function Assert-EqualValue {
    param([string]$Label, $Expected, $Actual)
    if ([string]$Expected -ne [string]$Actual) {
        throw "$Label expected '$Expected' but found '$Actual'."
    }
}

function Get-FixtureHashes {
    param([string]$FixtureRoot)
    $hashes = [ordered]@{}
    foreach ($relativePath in $fixtureFiles) {
        $hashes[$relativePath] = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $FixtureRoot $relativePath)).Hash
    }
    return $hashes
}

function Assert-HashesEqual {
    param([string]$Label, $Expected, $Actual)
    foreach ($relativePath in $fixtureFiles) {
        Assert-EqualValue "$Label $relativePath" $Expected[$relativePath] $Actual[$relativePath]
    }
}

$fixtureRoot = New-VersionFixture
$rollbackFixtureRoot = $null
try {
    if (-not (Test-Path -LiteralPath $updaterPath)) {
        throw "Centralized version updater does not exist: $updaterPath"
    }

    $updateResult = Invoke-PwshFile -Path $updaterPath -Arguments @("-Version", $targetVersion, "-AndroidVersionCode", $targetAndroidVersionCode, "-RepositoryRoot", $fixtureRoot)
    Assert-Success "Version update" $updateResult

    $package = Get-Content -Raw -LiteralPath (Join-Path $fixtureRoot "internal\site\package.json") | ConvertFrom-Json
    $packageLock = Get-Content -Raw -LiteralPath (Join-Path $fixtureRoot "internal\site\package-lock.json") | ConvertFrom-Json -AsHashtable
    Assert-EqualValue "package.json version" $targetVersion $package.version
    Assert-EqualValue "package-lock root version" $targetVersion $packageLock["version"]
    Assert-EqualValue "package-lock package version" $targetVersion $packageLock["packages"][""]["version"]

    $gradle = Get-Content -Raw -LiteralPath (Join-Path $fixtureRoot "internal\site\android\app\build.gradle")
    if ($gradle -notmatch "version-code\.txt") { throw "Android Gradle does not read the explicit versionCode source." }
    Assert-EqualValue `
        "Android versionCode source" `
        $targetAndroidVersionCode `
        ((Get-Content -Raw -LiteralPath (Join-Path $fixtureRoot "internal\site\android\version-code.txt")).Trim())
    if ($gradle -notmatch 'versionName\s+project.*:\s*"1\.0\.6-beta\.4"') { throw "Android versionName was not updated." }

    $checkResult = Invoke-PwshFile -Path $checkerPath -Arguments @("-Version", $targetVersion, "-RepositoryRoot", $fixtureRoot)
    Assert-Success "Fixture consistency check" $checkResult

    $hashesAfterFirstRun = Get-FixtureHashes -FixtureRoot $fixtureRoot
    $idempotentResult = Invoke-PwshFile -Path $updaterPath -Arguments @("-Version", $targetVersion, "-AndroidVersionCode", $targetAndroidVersionCode, "-RepositoryRoot", $fixtureRoot)
    Assert-Success "Idempotent version update" $idempotentResult
    Assert-HashesEqual "Idempotent hash" $hashesAfterFirstRun (Get-FixtureHashes -FixtureRoot $fixtureRoot)

    $rollbackFixtureRoot = New-VersionFixture
    $aboutPath = Join-Path $rollbackFixtureRoot "internal\site\src\components\routes\settings\about.tsx"
    $aboutContent = Get-Content -Raw -LiteralPath $aboutPath
    [System.IO.File]::WriteAllText($aboutPath, $aboutContent.Replace('../../../../package.json', '../../../../package.invalid.json'), [System.Text.UTF8Encoding]::new($false))
    $hashesBeforeFailure = Get-FixtureHashes -FixtureRoot $rollbackFixtureRoot

    $failureResult = Invoke-PwshFile -Path $updaterPath -Arguments @("-Version", $targetVersion, "-AndroidVersionCode", $targetAndroidVersionCode, "-RepositoryRoot", $rollbackFixtureRoot)
    if ($failureResult.ExitCode -eq 0) {
        throw "Updater succeeded even though the post-write consistency check was invalid."
    }
    Assert-HashesEqual "Rollback hash" $hashesBeforeFailure (Get-FixtureHashes -FixtureRoot $rollbackFixtureRoot)

    Write-Host "Centralized version updater contract passed."
} finally {
    if (Test-Path -LiteralPath $fixtureRoot) {
        Remove-Item -LiteralPath $fixtureRoot -Recurse -Force
    }
    if ($rollbackFixtureRoot -and (Test-Path -LiteralPath $rollbackFixtureRoot)) {
        Remove-Item -LiteralPath $rollbackFixtureRoot -Recurse -Force
    }
}
