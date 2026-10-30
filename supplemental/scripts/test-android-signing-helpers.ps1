$ErrorActionPreference = "Stop"

$helperPath = Join-Path $PSScriptRoot "android-signing-helpers.ps1"
if (-not (Test-Path -LiteralPath $helperPath -PathType Leaf)) {
    throw "Android signing helpers do not exist: $helperPath"
}
. $helperPath

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

function Assert-Throws {
    param(
        [string]$Label,
        [scriptblock]$Action,
        [string]$MessagePart
    )

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

$canonicalFingerprint = ("AA:" * 31) + "AA"
Assert-EqualValue `
    -Label "Fingerprint normalization" `
    -Expected ("AA" * 32) `
    -Actual (ConvertTo-CanonicalCertificateFingerprint $canonicalFingerprint.ToLowerInvariant())
Assert-Throws `
    -Label "Invalid fingerprint" `
    -MessagePart "64 hexadecimal" `
    -Action { ConvertTo-CanonicalCertificateFingerprint "AA:BB" | Out-Null }

$passwordOne = New-CryptographicPassword -ByteCount 32
$passwordTwo = New-CryptographicPassword -ByteCount 32
if ($passwordOne.Length -lt 43 -or $passwordTwo.Length -lt 43) {
    throw "Generated Android signing password is too short."
}
if ($passwordOne -eq $passwordTwo) {
    throw "Generated Android signing passwords unexpectedly match."
}
if ($passwordOne -match '[+/=]' -or $passwordTwo -match '[+/=]') {
    throw "Generated Android signing password is not Base64Url-safe."
}

$stableVersion = Resolve-AndroidReleaseVersion -Version "1.0.6"
Assert-EqualValue "Stable Android version" "1.0.6" $stableVersion.FullVersion
Assert-EqualValue "Stable Android versionCode" 10006 $stableVersion.AndroidVersionCode
$betaVersion = Resolve-AndroidReleaseVersion -Version "1.0.6-beta.2"
Assert-EqualValue "Beta Android version" "1.0.6-beta.2" $betaVersion.FullVersion
Assert-EqualValue "Beta Android versionCode" 10006 $betaVersion.AndroidVersionCode
Assert-Throws `
    -Label "Invalid Android release version" `
    -MessagePart "semantic version" `
    -Action { Resolve-AndroidReleaseVersion -Version "1.0.6-beta" | Out-Null }

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("pulse-android-signing-helper-" + [guid]::NewGuid().ToString("N"))
$credentialTarget = "Pulse/TestAndroidReleaseRecovery/$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $tempRoot | Out-Null
try {
    $propertiesPath = Join-Path $tempRoot "release-signing.properties"
    @(
        "storeFile=C:/private/pulse-android-release.p12",
        "storePassword=$passwordOne",
        "keyAlias=pulse-release",
        "keyPassword=$passwordTwo"
    ) | Set-Content -LiteralPath $propertiesPath -Encoding utf8

    $properties = Read-AndroidSigningProperties -Path $propertiesPath
    Assert-EqualValue "Signing store path" "C:/private/pulse-android-release.p12" $properties.storeFile
    Assert-EqualValue "Signing alias" "pulse-release" $properties.keyAlias
    Assert-EqualValue "Signing store password" $passwordOne $properties.storePassword
    Assert-EqualValue "Signing key password" $passwordTwo $properties.keyPassword

    $invalidPropertiesPath = Join-Path $tempRoot "invalid-signing.properties"
    @(
        "storeFile=C:/private/pulse-android-release.p12",
        "storePassword=$passwordOne",
        "keyAlias=pulse-release"
    ) | Set-Content -LiteralPath $invalidPropertiesPath -Encoding utf8
    Assert-Throws `
        -Label "Missing signing property" `
        -MessagePart "keyPassword" `
        -Action { Read-AndroidSigningProperties -Path $invalidPropertiesPath | Out-Null }

    $openSsl = if ($IsWindows) {
        "C:\Program Files\Git\usr\bin\openssl.exe"
    } else {
        (Get-Command openssl -ErrorAction Stop).Source
    }
    if (-not (Test-Path -LiteralPath $openSsl -PathType Leaf)) {
        throw "OpenSSL is missing: $openSsl"
    }

    $manifestPath = Join-Path $tempRoot "recovery.json"
    $encryptedPath = Join-Path $tempRoot "recovery.json.enc"
    $restoredPath = Join-Path $tempRoot "restored.json"
    $recoveryPasswordPath = Join-Path $tempRoot "recovery-password.txt"
    '{"alias":"pulse-release","storePassword":"private"}' | Set-Content -LiteralPath $manifestPath -Encoding utf8NoBOM
    $passwordOne | Set-Content -LiteralPath $recoveryPasswordPath -Encoding ascii -NoNewline

    Protect-AndroidRecoveryManifest `
        -InputPath $manifestPath `
        -OutputPath $encryptedPath `
        -RecoveryPasswordFile $recoveryPasswordPath `
        -OpenSslCommand $openSsl
    Unprotect-AndroidRecoveryManifest `
        -InputPath $encryptedPath `
        -OutputPath $restoredPath `
        -RecoveryPasswordFile $recoveryPasswordPath `
        -OpenSslCommand $openSsl
    Assert-EqualValue `
        -Label "Recovery manifest round trip" `
        -Expected (Get-Content -Raw -LiteralPath $manifestPath) `
        -Actual (Get-Content -Raw -LiteralPath $restoredPath)

    if ($IsWindows) {
        Set-WindowsGenericCredential `
            -Target $credentialTarget `
            -UserName "Pulse" `
            -Password $passwordOne
        $credential = Get-WindowsGenericCredential -Target $credentialTarget
        Assert-EqualValue "Credential username" "Pulse" $credential.UserName
        Assert-EqualValue "Credential password" $passwordOne $credential.Password
        Remove-WindowsGenericCredential -Target $credentialTarget
        Assert-Throws `
            -Label "Deleted Windows credential" `
            -MessagePart "not found" `
            -Action { Get-WindowsGenericCredential -Target $credentialTarget | Out-Null }
    }
} finally {
    if ($IsWindows) {
        try {
            Remove-WindowsGenericCredential -Target $credentialTarget -ErrorAction SilentlyContinue
        } catch {
            # Best-effort cleanup after a partially completed credential test.
        }
    }
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}

Write-Host "Android signing helper tests passed."
