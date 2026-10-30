$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$builderPath = Join-Path $PSScriptRoot "build-android-release.ps1"
$gradlePath = Join-Path $repoRoot "internal\site\android\app\build.gradle"
if (-not (Test-Path -LiteralPath $builderPath -PathType Leaf)) {
    throw "Android Release builder does not exist: $builderPath"
}

function Assert-Contains {
    param([string]$Label, [string]$Content, [string]$Needle)
    if (-not $Content.Contains($Needle)) {
        throw "$Label is missing required text: $Needle"
    }
}

function Assert-Throws {
    param([string]$Label, [scriptblock]$Action, [string]$MessagePart)
    try {
        & $Action
    } catch {
        if ($_.Exception.Message -notlike "*$MessagePart*") {
            throw "$Label failed with an unexpected message: $($_.Exception.Message)"
        }
        return
    }
    throw "$Label did not fail."
}

$gradle = Get-Content -Raw -LiteralPath $gradlePath
foreach ($required in @(
    "pulseSigningPropertiesFile",
    "signingConfigs",
    "signingConfig signingConfigs.release",
    "gradle.taskGraph.whenReady",
    "Release builds require"
)) {
    Assert-Contains "Android Gradle signing config" $gradle $required
}
foreach ($forbidden in @(
    "pulse-android-release.p12",
    'storePassword "',
    'keyPassword "'
)) {
    if ($gradle.Contains($forbidden)) {
        throw "Android Gradle signing config contains repository-local secret text: $forbidden"
    }
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("pulse-android-release-build-" + [guid]::NewGuid().ToString("N"))
$fixtureRoot = Join-Path $tempRoot "repository"
$toolRoot = Join-Path $tempRoot "tools"
$tracePath = Join-Path $tempRoot "gradle-trace.txt"
$fingerprint = "AB" * 32
$wrongFingerprint = "CD" * 32
$apkPath = Join-Path $fixtureRoot "internal\site\android\app\build\outputs\apk\release\app-release.apk"

New-Item -ItemType Directory -Path $toolRoot -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $fixtureRoot "internal\site\android") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $fixtureRoot "private") -Force | Out-Null
try {
    $fakeGradle = Join-Path $toolRoot "fake-gradle.ps1"
    @'
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Remaining)
Add-Content -LiteralPath $env:PULSE_TEST_GRADLE_TRACE -Value ($Remaining -join " ")
$apkPath = Join-Path $env:PULSE_TEST_REPOSITORY "internal\site\android\app\build\outputs\apk\release\app-release.apk"
New-Item -ItemType Directory -Path (Split-Path -Parent $apkPath) -Force | Out-Null
[System.IO.File]::WriteAllBytes($apkPath, [byte[]](1, 2, 3, 4))
exit 0
'@ | Set-Content -LiteralPath $fakeGradle -Encoding utf8NoBOM

    $fakeApkSigner = Join-Path $toolRoot "fake-apksigner.ps1"
    @'
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Remaining)
Write-Output "Verifies"
Write-Output "Verified using v2 scheme (APK Signature Scheme v2): true"
Write-Output "Signer #1 certificate SHA-256 digest: $env:PULSE_TEST_CERTIFICATE_SHA256"
exit 0
'@ | Set-Content -LiteralPath $fakeApkSigner -Encoding utf8NoBOM

    $fakeAapt2 = Join-Path $toolRoot "fake-aapt2.ps1"
    @'
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Remaining)
Write-Output "package: name='site.gutenacht.pulse' versionCode='10006' versionName='1.0.6'"
if ($env:PULSE_TEST_DEBUGGABLE -eq "true") {
    Write-Output "application-debuggable"
}
exit 0
'@ | Set-Content -LiteralPath $fakeAapt2 -Encoding utf8NoBOM

    $keyStorePath = Join-Path $fixtureRoot "private\pulse-android-release.p12"
    [System.IO.File]::WriteAllBytes($keyStorePath, [byte[]](5, 6, 7, 8))
    $signingPropertiesPath = Join-Path $fixtureRoot "private\signing.properties"
    @(
        "storeFile=$($keyStorePath.Replace('\', '/'))",
        "storePassword=private-store-password",
        "keyAlias=pulse-release",
        "keyPassword=private-key-password"
    ) | Set-Content -LiteralPath $signingPropertiesPath -Encoding utf8NoBOM
    $fingerprint | Set-Content `
        -LiteralPath (Join-Path $fixtureRoot "internal\site\android\release-certificate.sha256") `
        -Encoding ascii `
        -NoNewline

    $env:PULSE_TEST_REPOSITORY = $fixtureRoot
    $env:PULSE_TEST_GRADLE_TRACE = $tracePath
    $env:PULSE_TEST_CERTIFICATE_SHA256 = $fingerprint.ToLowerInvariant()
    $env:PULSE_TEST_DEBUGGABLE = "false"

    $result = & $builderPath `
        -Version "1.0.6" `
        -SigningPropertiesPath $signingPropertiesPath `
        -RepositoryRoot $fixtureRoot `
        -GradleCommand $fakeGradle `
        -ApkSignerCommand $fakeApkSigner `
        -Aapt2Command $fakeAapt2 `
        -SkipWebSync
    if ($result.ApkPath -ne $apkPath -or -not (Test-Path -LiteralPath $result.ApkPath -PathType Leaf)) {
        throw "Android Release builder did not return the expected APK path."
    }
    if ($result.CertificateSha256 -ne $fingerprint) {
        throw "Android Release builder returned the wrong certificate fingerprint."
    }
    $trace = Get-Content -Raw -LiteralPath $tracePath
    foreach ($required in @(
        "assembleRelease",
        "-PpulseVersionName=1.0.6",
        "-PpulseVersionCode=10006",
        "-PpulseSigningPropertiesFile=$signingPropertiesPath"
    )) {
        Assert-Contains "Gradle invocation" $trace $required
    }
    foreach ($secret in @("private-store-password", "private-key-password")) {
        if ($trace.Contains($secret)) {
            throw "Gradle trace contains Android signing password."
        }
    }

    $defaultGradleRelativePath = if ($IsWindows) {
        "internal\site\android\gradlew.bat"
    } else {
        "internal/site/android/gradlew"
    }
    $defaultGradlePath = Join-Path $fixtureRoot $defaultGradleRelativePath
    if ($IsWindows) {
        @'
@echo off
echo %*>>"%PULSE_TEST_GRADLE_TRACE%"
if not exist "%PULSE_TEST_REPOSITORY%\internal\site\android\app\build\outputs\apk\release" mkdir "%PULSE_TEST_REPOSITORY%\internal\site\android\app\build\outputs\apk\release"
>"%PULSE_TEST_REPOSITORY%\internal\site\android\app\build\outputs\apk\release\app-release.apk" echo fake-apk
exit /b 0
'@ | Set-Content -LiteralPath $defaultGradlePath -Encoding ascii
    } else {
        @'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$PULSE_TEST_GRADLE_TRACE"
apk_dir="$PULSE_TEST_REPOSITORY/internal/site/android/app/build/outputs/apk/release"
mkdir -p "$apk_dir"
printf 'fake-apk' > "$apk_dir/app-release.apk"
'@ | Set-Content -LiteralPath $defaultGradlePath -Encoding utf8NoBOM
        chmod +x $defaultGradlePath
    }
    $defaultGradleResult = & $builderPath `
        -Version "1.0.6" `
        -SigningPropertiesPath $signingPropertiesPath `
        -RepositoryRoot $fixtureRoot `
        -ApkSignerCommand $fakeApkSigner `
        -Aapt2Command $fakeAapt2 `
        -SkipWebSync
    if ($defaultGradleResult.ApkPath -ne $apkPath -or -not (Test-Path -LiteralPath $apkPath -PathType Leaf)) {
        throw "Android Release builder did not use the repository default Gradle wrapper."
    }

    $env:PULSE_TEST_CERTIFICATE_SHA256 = $wrongFingerprint
    Assert-Throws `
        -Label "Wrong signing certificate" `
        -MessagePart "fingerprint" `
        -Action {
            & $builderPath `
                -Version "1.0.6" `
                -SigningPropertiesPath $signingPropertiesPath `
                -RepositoryRoot $fixtureRoot `
                -GradleCommand $fakeGradle `
                -ApkSignerCommand $fakeApkSigner `
                -Aapt2Command $fakeAapt2 `
                -SkipWebSync | Out-Null
        }
    if (Test-Path -LiteralPath $apkPath) {
        throw "Wrong-certificate APK was not removed."
    }

    $env:PULSE_TEST_CERTIFICATE_SHA256 = $fingerprint.ToLowerInvariant()
    $env:PULSE_TEST_DEBUGGABLE = "true"
    Assert-Throws `
        -Label "Debuggable Release APK" `
        -MessagePart "debuggable" `
        -Action {
            & $builderPath `
                -Version "1.0.6" `
                -SigningPropertiesPath $signingPropertiesPath `
                -RepositoryRoot $fixtureRoot `
                -GradleCommand $fakeGradle `
                -ApkSignerCommand $fakeApkSigner `
                -Aapt2Command $fakeAapt2 `
                -SkipWebSync | Out-Null
        }
    if (Test-Path -LiteralPath $apkPath) {
        throw "Debuggable Release APK was not removed."
    }

    Assert-Throws `
        -Label "Missing signing properties" `
        -MessagePart "does not exist" `
        -Action {
            & $builderPath `
                -Version "1.0.6" `
                -SigningPropertiesPath (Join-Path $tempRoot "missing.properties") `
                -RepositoryRoot $fixtureRoot `
                -GradleCommand $fakeGradle `
                -ApkSignerCommand $fakeApkSigner `
                -Aapt2Command $fakeAapt2 `
                -SkipWebSync | Out-Null
        }
} finally {
    Remove-Item Env:PULSE_TEST_REPOSITORY -ErrorAction SilentlyContinue
    Remove-Item Env:PULSE_TEST_GRADLE_TRACE -ErrorAction SilentlyContinue
    Remove-Item Env:PULSE_TEST_CERTIFICATE_SHA256 -ErrorAction SilentlyContinue
    Remove-Item Env:PULSE_TEST_DEBUGGABLE -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}

Write-Host "Android Release build tests passed."
