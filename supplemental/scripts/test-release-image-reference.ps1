$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "release-script-helpers.ps1")

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("pulse-image-reference-" + [guid]::NewGuid().ToString("N"))
$fakeDocker = Join-Path $tempRoot "fake-docker.ps1"
$tracePath = Join-Path $tempRoot "trace.txt"

function Assert-EqualValue {
    param(
        [string]$Label,
        [object]$Expected,
        [object]$Actual
    )

    if ([string]$Expected -ne [string]$Actual) {
        throw "$Label expected '$Expected' but found '$Actual'."
    }
}

function Invoke-ImageReferenceCase {
    param(
        [int]$ManifestExitCode,
        [int]$ImageToolsExitCode,
        [bool]$ExpectedResult,
        [string]$ExpectedTrace
    )

    $env:PULSE_TEST_DOCKER_TRACE = $tracePath
    $env:PULSE_TEST_MANIFEST_EXIT = [string]$ManifestExitCode
    $env:PULSE_TEST_IMAGETOOLS_EXIT = [string]$ImageToolsExitCode
    if (Test-Path -LiteralPath $tracePath) {
        Remove-Item -LiteralPath $tracePath -Force
    }

    $actualResult = Test-ContainerImageReference `
        -Image "ghcr.io/example/pulse-hub:1.0.0" `
        -DockerCommand $fakeDocker

    Assert-EqualValue "Image reference result" $ExpectedResult $actualResult
    $actualTrace = (Get-Content -LiteralPath $tracePath) -join "|"
    Assert-EqualValue "Docker command trace" $ExpectedTrace $actualTrace
}

New-Item -ItemType Directory -Path $tempRoot | Out-Null
try {
    $fakeDockerContent = @'
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Remaining)

$command = $Remaining -join " "
Add-Content -LiteralPath $env:PULSE_TEST_DOCKER_TRACE -Value $command
if ($command.StartsWith("manifest inspect ", [System.StringComparison]::Ordinal)) {
    exit [int]$env:PULSE_TEST_MANIFEST_EXIT
}
if ($command.StartsWith("buildx imagetools inspect ", [System.StringComparison]::Ordinal)) {
    exit [int]$env:PULSE_TEST_IMAGETOOLS_EXIT
}
exit 99
'@
    [System.IO.File]::WriteAllText($fakeDocker, $fakeDockerContent, [System.Text.UTF8Encoding]::new($false))

    Invoke-ImageReferenceCase `
        -ManifestExitCode 0 `
        -ImageToolsExitCode 1 `
        -ExpectedResult $true `
        -ExpectedTrace "manifest inspect ghcr.io/example/pulse-hub:1.0.0"
    Invoke-ImageReferenceCase `
        -ManifestExitCode 1 `
        -ImageToolsExitCode 0 `
        -ExpectedResult $true `
        -ExpectedTrace "manifest inspect ghcr.io/example/pulse-hub:1.0.0|buildx imagetools inspect ghcr.io/example/pulse-hub:1.0.0"
    Invoke-ImageReferenceCase `
        -ManifestExitCode 1 `
        -ImageToolsExitCode 1 `
        -ExpectedResult $false `
        -ExpectedTrace "manifest inspect ghcr.io/example/pulse-hub:1.0.0|buildx imagetools inspect ghcr.io/example/pulse-hub:1.0.0"
} finally {
    Remove-Item Env:PULSE_TEST_DOCKER_TRACE -ErrorAction SilentlyContinue
    Remove-Item Env:PULSE_TEST_MANIFEST_EXIT -ErrorAction SilentlyContinue
    Remove-Item Env:PULSE_TEST_IMAGETOOLS_EXIT -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}

Write-Host "Release image reference fallback test passed."
