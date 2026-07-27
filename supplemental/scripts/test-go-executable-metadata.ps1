$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "release-script-helpers.ps1")

if (-not (Get-Command Assert-GoExecutableBuildMetadata -ErrorAction SilentlyContinue)) {
    throw "Assert-GoExecutableBuildMetadata is required for cross-platform artifact verification."
}

$fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("pulse-go-metadata-test-" + [guid]::NewGuid().ToString("N"))
$hostIsWindows = $IsWindows -or $env:OS -eq "Windows_NT"
$targetOS = if ($hostIsWindows) { "linux" } else { "windows" }
$targetArch = "amd64"
$version = "1.0.6-beta.1"
$extension = if ($targetOS -eq "windows") { ".exe" } else { "" }
$artifactPath = Join-Path $fixtureRoot "metadata-fixture$extension"

try {
    New-Item -ItemType Directory -Path $fixtureRoot -Force | Out-Null
    [System.IO.File]::WriteAllText(
        (Join-Path $fixtureRoot "main.go"),
        "package main`n`nvar version = `"dev`"`n`nfunc main() {}`n",
        [System.Text.UTF8Encoding]::new($false)
    )

    $previousGOOS = $env:GOOS
    $previousGOARCH = $env:GOARCH
    try {
        $env:GOOS = $targetOS
        $env:GOARCH = $targetArch
        & go build -o $artifactPath -ldflags "-X main.version=$version" (Join-Path $fixtureRoot "main.go")
        if ($LASTEXITCODE -ne 0) {
            throw "Cross-platform metadata fixture build failed with exit code $LASTEXITCODE."
        }
    } finally {
        $env:GOOS = $previousGOOS
        $env:GOARCH = $previousGOARCH
    }

    Assert-GoExecutableBuildMetadata `
        -Path $artifactPath `
        -Version $version `
        -TargetOS $targetOS `
        -TargetArch $targetArch `
        -VersionSymbol "main.version"

    try {
        Assert-GoExecutableBuildMetadata `
            -Path $artifactPath `
            -Version "9.9.9" `
            -TargetOS $targetOS `
            -TargetArch $targetArch `
            -VersionSymbol "main.version"
        throw "Metadata verification accepted an incorrect version."
    } catch {
        if ($_.Exception.Message -eq "Metadata verification accepted an incorrect version.") {
            throw
        }
    }

    Write-Host "Cross-platform Go executable metadata contract passed."
} finally {
    if (Test-Path -LiteralPath $fixtureRoot) {
        Remove-Item -LiteralPath $fixtureRoot -Recurse -Force
    }
}
