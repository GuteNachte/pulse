param(
    [string]$Version = "1.0.6-beta.3",
    [string]$HubImage = "",
    [string]$LinuxAgentImage = "",
    [string]$PublicHubImage = "",
    [string]$PublicAgentImage = "",
    [string]$PublicOutputDirectory = "",
    [string]$AndroidSigningPropertiesPath = "",
    [switch]$SkipPush,
    [switch]$SkipAgentBuild,
    [switch]$SkipLinuxAgentImageBuild,
    [switch]$SkipAndroidAppBuild,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
. (Join-Path $PSScriptRoot "release-script-helpers.ps1")
$resolvedVersion = Resolve-PulseVersion -Version $Version
$Version = $resolvedVersion.FullVersion

Assert-ReleaseSkipFlagsAllowed -Context "release" -DryRun $DryRun -Flags @{
    SkipPush = $SkipPush
    SkipAgentBuild = $SkipAgentBuild
    SkipLinuxAgentImageBuild = $SkipLinuxAgentImageBuild
    SkipAndroidAppBuild = $SkipAndroidAppBuild
}
$SkipPush = Resolve-ReleaseSkipPush -SkipPush $SkipPush -DryRun $DryRun

if (-not $SkipAndroidAppBuild -and [string]::IsNullOrWhiteSpace($AndroidSigningPropertiesPath) -and -not $DryRun) {
    throw "AndroidSigningPropertiesPath is required for a complete Release build."
}
if (-not [string]::IsNullOrWhiteSpace($AndroidSigningPropertiesPath) -and
    -not (Test-Path -LiteralPath $AndroidSigningPropertiesPath -PathType Leaf)) {
    throw "Android signing properties do not exist: $AndroidSigningPropertiesPath"
}
$androidReleaseBuilt = $false

if ([string]::IsNullOrWhiteSpace($HubImage)) {
    $HubImage = "registry.example.com/infra/pulse-hub:$Version"
}

if ([string]::IsNullOrWhiteSpace($LinuxAgentImage)) {
    $LinuxAgentImage = "registry.example.com/infra/pulse-agent:$Version"
}

$publicPackageRequested = -not [string]::IsNullOrWhiteSpace($PublicHubImage) -or
    -not [string]::IsNullOrWhiteSpace($PublicAgentImage) -or
    -not [string]::IsNullOrWhiteSpace($PublicOutputDirectory)

Push-Location $repoRoot
try {
    Assert-ReleaseVersionConsistency -Version $Version

    if (-not $SkipAgentBuild) {
        & (Join-Path $PSScriptRoot "build-agent-v1.ps1") -Version $Version -OS windows -Arch amd64
        if ($LASTEXITCODE -ne 0) {
            throw "Windows agent build failed with exit code $LASTEXITCODE"
        }
    }

    if (-not $SkipAndroidAppBuild) {
        if ([string]::IsNullOrWhiteSpace($AndroidSigningPropertiesPath)) {
            Write-Host "Dry run ${Version}: Android Release build skipped because signing properties were not supplied."
        } else {
            & (Join-Path $PSScriptRoot "build-android-release.ps1") `
                -Version $Version `
                -SigningPropertiesPath $AndroidSigningPropertiesPath `
                -RepositoryRoot $repoRoot | Out-Null
            $androidReleaseBuilt = $true
        }
    }

    if ($publicPackageRequested) {
        if (-not $androidReleaseBuilt) {
            throw "A verified Android Release APK is required when preparing a public release package."
        }
        if ([string]::IsNullOrWhiteSpace($PublicHubImage) -or [string]::IsNullOrWhiteSpace($PublicAgentImage)) {
            throw "PublicHubImage and PublicAgentImage are both required when preparing a public release package."
        }
        if ([string]::IsNullOrWhiteSpace($PublicOutputDirectory)) {
            $PublicOutputDirectory = "build/public-release/$Version"
        }
        & (Join-Path $PSScriptRoot "package-public-release.ps1") `
            -Version $Version `
            -HubImage $PublicHubImage `
            -AgentImage $PublicAgentImage `
            -OutputDirectory $PublicOutputDirectory
        if ($LASTEXITCODE -ne 0) {
            throw "Public release packaging failed with exit code $LASTEXITCODE"
        }
    }

    $agentArgs = @{
        Version = $Version
        LinuxImage = $LinuxAgentImage
    }
    if ($SkipPush) {
        $agentArgs.SkipPush = $true
    }
    if ($SkipLinuxAgentImageBuild) {
        $agentArgs.SkipLinuxImageBuild = $true
    }
    if ($DryRun) {
        $agentArgs.DryRun = $true
    }
    & (Join-Path $PSScriptRoot "publish-agent-v1.ps1") @agentArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Agent publish failed with exit code $LASTEXITCODE"
    }

    $hubArgs = @{
        Version = $Version
        Image = $HubImage
    }
    if ($SkipPush) {
        $hubArgs.SkipPush = $true
    }
    if ($DryRun) {
        $hubArgs.DryRun = $true
    }
    & (Join-Path $PSScriptRoot "publish-hub-v1.ps1") @hubArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Hub publish failed with exit code $LASTEXITCODE"
    }

    if ($DryRun) {
        Write-Host "Dry run $Version ready; images were not pushed and deployment should not use these outputs directly."
    } else {
        Write-Host "Release $Version ready:"
    }
    Write-Host "  Hub image: $HubImage"
    Write-Host "  Agent image: $LinuxAgentImage"
    Write-Host "  Windows agent: build/releases/agent/$Version/pulse-agent_windows_amd64.exe"
    if ($androidReleaseBuilt) {
        Write-Host "  Android APK: internal\site\android\app\build\outputs\apk\release\app-release.apk"
    }
    if ($publicPackageRequested) {
        Write-Host "  Public package: $PublicOutputDirectory"
    }
} finally {
    Pop-Location
}

