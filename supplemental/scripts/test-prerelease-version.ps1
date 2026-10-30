$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "release-script-helpers.ps1")

function Assert-EqualValue {
    param(
        [string]$Label,
        $Expected,
        $Actual
    )

    if ([string]$Expected -ne [string]$Actual) {
        throw "$Label expected '$Expected' but found '$Actual'."
    }
}

$prerelease = Resolve-PulseVersion -Version "1.0.6-beta.1"
Assert-EqualValue "Prerelease base version" "1.0.6" $prerelease.BaseVersion
Assert-EqualValue "Prerelease full version" "1.0.6-beta.1" $prerelease.FullVersion
Assert-EqualValue "Prerelease Android versionCode" 10006 $prerelease.AndroidVersionCode
Assert-EqualValue "Prerelease flag" $true $prerelease.IsPrerelease

$stable = Resolve-PulseVersion -Version "1.0.6"
Assert-EqualValue "Stable base version" "1.0.6" $stable.BaseVersion
Assert-EqualValue "Stable full version" "1.0.6" $stable.FullVersion
Assert-EqualValue "Stable Android versionCode" 10006 $stable.AndroidVersionCode
Assert-EqualValue "Stable prerelease flag" $false $stable.IsPrerelease

foreach ($invalidVersion in @("latest", "1.0.6-beta", "1.0.6-beta.0", "01.0.6")) {
    try {
        Resolve-PulseVersion -Version $invalidVersion | Out-Null
        throw "Invalid version '$invalidVersion' was accepted."
    } catch {
        if ($_.Exception.Message -like "Invalid version '* was accepted.*") {
            throw
        }
    }
}

Write-Host "Prerelease version contract passed."
