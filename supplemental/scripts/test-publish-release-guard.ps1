$ErrorActionPreference = "Stop"

function Assert-Contains {
    param(
        [string]$ScriptName,
        [string]$Script,
        [string]$Needle
    )

    if (-not $Script.Contains($Needle)) {
        throw "$ScriptName is missing release guard text: $Needle"
    }
}

function Assert-GuardsFlags {
    param(
        [string]$ScriptName,
        [string]$Script,
        [string[]]$Flags
    )

    foreach ($flag in $Flags) {
        Assert-Contains -ScriptName $ScriptName -Script $Script -Needle "if (`$$flag) { `$skipFlags += `"-$flag`" }"
    }
}

$helperScriptName = "release-script-helpers.ps1"
$helperScript = Get-Content -LiteralPath (Join-Path $PSScriptRoot $helperScriptName) -Raw -Encoding UTF8
foreach ($required in @(
    "function Resolve-PulseVersion",
    "AndroidVersionCode",
    "function Assert-ReleaseVersionConsistency",
    "check-version-consistency.ps1",
    "function Assert-ReleaseSkipFlagsAllowed",
    "Skip flags are only allowed with -DryRun",
    "function Resolve-ReleaseSkipPush",
    "`$SkipPush -or `$DryRun",
    "function Test-ContainerImageReference",
    "buildx imagetools inspect"
)) {
    Assert-Contains -ScriptName $helperScriptName -Script $helperScript -Needle $required
}

$releaseScriptName = "publish-release-v1.ps1"
$releaseScript = Get-Content -LiteralPath (Join-Path $PSScriptRoot $releaseScriptName) -Raw -Encoding UTF8

foreach ($required in @(
    "[switch]`$DryRun",
    "release-script-helpers.ps1",
    "Assert-ReleaseVersionConsistency",
    "Assert-ReleaseSkipFlagsAllowed -Context `"release`"",
    "Dry run `$Version ready",
    "Resolve-ReleaseSkipPush",
    "Resolve-PulseVersion -Version `$Version",
    "`$resolvedVersion.AndroidVersionCode",
    "`$agentArgs.DryRun = `$true",
    "`$hubArgs.DryRun = `$true",
    "[string]`$PublicHubImage",
    "[string]`$PublicAgentImage",
    "[string]`$PublicOutputDirectory",
    "package-public-release.ps1"
)) {
    Assert-Contains -ScriptName $releaseScriptName -Script $releaseScript -Needle $required
}

$verifyScriptName = "verify-release-v1.ps1"
$verifyScript = Get-Content -LiteralPath (Join-Path $PSScriptRoot $verifyScriptName) -Raw -Encoding UTF8
foreach ($required in @(
    "Resolve-PulseVersion -Version `$Version",
    "`$resolvedVersion.AndroidVersionCode",
    "[string]`$PublicReleaseDirectory",
    "Test-PublicReleasePackage",
    "Test-ContainerImageReference",
    "SHA256SUMS"
)) {
    Assert-Contains -ScriptName $verifyScriptName -Script $verifyScript -Needle $required
}

foreach ($flag in @(
    "SkipPush",
    "SkipAgentBuild",
    "SkipLinuxAgentImageBuild",
    "SkipAndroidAppBuild"
)) {
    Assert-Contains -ScriptName $releaseScriptName -Script $releaseScript -Needle "$flag = `$$flag"
}

$agentScriptName = "publish-agent-v1.ps1"
$agentScript = Get-Content -LiteralPath (Join-Path $PSScriptRoot $agentScriptName) -Raw -Encoding UTF8
foreach ($required in @(
    "[switch]`$DryRun",
    "release-script-helpers.ps1",
    "Assert-ReleaseVersionConsistency",
    "Assert-ReleaseSkipFlagsAllowed -Context `"Agent`"",
    "Resolve-ReleaseSkipPush",
    "Agent `$Version dry run files prepared",
    "Agent `$Version dry run manifest prepared"
)) {
    Assert-Contains -ScriptName $agentScriptName -Script $agentScript -Needle $required
}
foreach ($flag in @(
    "SkipPush",
    "SkipLinuxImageBuild"
)) {
    Assert-Contains -ScriptName $agentScriptName -Script $agentScript -Needle "$flag = `$$flag"
}

$hubScriptName = "publish-hub-v1.ps1"
$hubScript = Get-Content -LiteralPath (Join-Path $PSScriptRoot $hubScriptName) -Raw -Encoding UTF8
foreach ($required in @(
    "[switch]`$DryRun",
    "release-script-helpers.ps1",
    "Assert-ReleaseVersionConsistency",
    "Assert-ReleaseSkipFlagsAllowed -Context `"Hub`"",
    "Resolve-ReleaseSkipPush",
    "Hub `$Version dry run image prepared"
)) {
    Assert-Contains -ScriptName $hubScriptName -Script $hubScript -Needle $required
}
Assert-Contains -ScriptName $hubScriptName -Script $hubScript -Needle "SkipPush = `$SkipPush"

$buildAgentScriptName = "build-agent-v1.ps1"
$buildAgentScript = Get-Content -LiteralPath (Join-Path $PSScriptRoot $buildAgentScriptName) -Raw -Encoding UTF8
foreach ($required in @(
    "release-script-helpers.ps1",
    "Assert-ReleaseVersionConsistency"
)) {
    Assert-Contains -ScriptName $buildAgentScriptName -Script $buildAgentScript -Needle $required
}

Write-Host "Publish release guard test passed."
