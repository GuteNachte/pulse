param(
    [string]$Version = "1.0.6",
    [string]$HubImage = "",
    [string]$LinuxAgentImage = "",
    [switch]$SkipPush,
    [switch]$SkipAgentBuild,
    [switch]$SkipLinuxAgentImageBuild,
    [switch]$SkipAndroidAppBuild,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
. (Join-Path $PSScriptRoot "release-script-helpers.ps1")

Assert-ReleaseSkipFlagsAllowed -Context "release" -DryRun $DryRun -Flags @{
    SkipPush = $SkipPush
    SkipAgentBuild = $SkipAgentBuild
    SkipLinuxAgentImageBuild = $SkipLinuxAgentImageBuild
    SkipAndroidAppBuild = $SkipAndroidAppBuild
}
$SkipPush = Resolve-ReleaseSkipPush -SkipPush $SkipPush -DryRun $DryRun

if ([string]::IsNullOrWhiteSpace($HubImage)) {
    $HubImage = "registry.example.com/infra/pulse-hub:$Version"
}

if ([string]::IsNullOrWhiteSpace($LinuxAgentImage)) {
    $LinuxAgentImage = "registry.example.com/infra/pulse-agent:$Version"
}

Push-Location $repoRoot
try {
    Assert-ReleaseVersionConsistency -Version $Version

    if (-not $SkipAgentBuild) {
        & (Join-Path $PSScriptRoot "build-agent-v1.ps1") -Version $Version -OS windows -Arch amd64
        if ($LASTEXITCODE -ne 0) {
            throw "Windows agent build failed with exit code $LASTEXITCODE"
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

    if (-not $SkipAndroidAppBuild) {
        $siteDir = Join-Path $repoRoot "internal\site"
        Push-Location $siteDir
        try {
            npm.cmd run android:sync
            if ($LASTEXITCODE -ne 0) {
                throw "Android app sync failed with exit code $LASTEXITCODE"
            }
            $versionParts = $Version.Split(".")
            if ($versionParts.Count -lt 3) {
                throw "Android versionCode requires semantic version like 1.0.3"
            }
            $versionCode = ([int]$versionParts[0] * 10000) + ([int]$versionParts[1] * 100) + [int]$versionParts[2]
            $gradlew = Join-Path $siteDir "android\gradlew.bat"
            & $gradlew -p (Join-Path $siteDir "android") assembleDebug "-PpulseVersionName=$Version" "-PpulseVersionCode=$versionCode"
            if ($LASTEXITCODE -ne 0) {
                throw "Android APK build failed with exit code $LASTEXITCODE"
            }
        } finally {
            Pop-Location
        }
    }

    if ($DryRun) {
        Write-Host "Dry run $Version ready; images were not pushed and deployment should not use these outputs directly."
    } else {
        Write-Host "Release $Version ready:"
    }
    Write-Host "  Hub image: $HubImage"
    Write-Host "  Agent image: $LinuxAgentImage"
    Write-Host "  Windows agent: build/releases/agent/$Version/pulse-agent_windows_amd64.exe"
    if (-not $SkipAndroidAppBuild) {
        Write-Host "  Android APK: internal/site/android/app/build/outputs/apk/debug/app-debug.apk"
    }
} finally {
    Pop-Location
}

