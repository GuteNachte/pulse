$ErrorActionPreference = "Stop"

$initializerPath = Join-Path $PSScriptRoot "initialize-android-release-signing.ps1"
$helperPath = Join-Path $PSScriptRoot "android-signing-helpers.ps1"
if (-not (Test-Path -LiteralPath $initializerPath -PathType Leaf)) {
    throw "Android release signing initializer does not exist: $initializerPath"
}
. $helperPath

function Assert-EqualValue {
    param([string]$Label, [object]$Expected, [object]$Actual)
    if ([string]$Expected -ne [string]$Actual) {
        throw "$Label expected '$Expected' but found '$Actual'."
    }
}

function Assert-FileExists {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Expected file does not exist: $Path"
    }
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("pulse-android-signing-init-" + [guid]::NewGuid().ToString("N"))
$localRoot = Join-Path $tempRoot "local"
$nasRoot = Join-Path $tempRoot "nas"
$sheetPath = Join-Path $tempRoot "offline-recovery.txt"
$openSsl = if ($IsWindows) {
    "C:\Program Files\Git\usr\bin\openssl.exe"
} else {
    (Get-Command openssl -ErrorAction Stop).Source
}
$keytool = (Get-Command keytool -ErrorAction Stop).Source

New-Item -ItemType Directory -Path $tempRoot | Out-Null
try {
    $result = & $initializerPath `
        -LocalDirectory $localRoot `
        -NasDirectory $nasRoot `
        -RecoverySheetPath $sheetPath `
        -CredentialTarget ("Pulse/TestAndroidReleaseRecovery/" + [guid]::NewGuid().ToString("N")) `
        -KeytoolCommand $keytool `
        -OpenSslCommand $openSsl `
        -SkipCredentialManager

    foreach ($path in @(
        $result.LocalKeyStore,
        $result.NasKeyStore,
        $result.SigningProperties,
        $result.EncryptedRecoveryManifest,
        $result.PublicCertificate,
        $result.RecoveryInstructions,
        $result.RecoverySheet
    )) {
        Assert-FileExists $path
    }

    Assert-EqualValue `
        -Label "Local and NAS keystore hash" `
        -Expected (Get-FileHash -Algorithm SHA256 -LiteralPath $result.LocalKeyStore).Hash `
        -Actual (Get-FileHash -Algorithm SHA256 -LiteralPath $result.NasKeyStore).Hash
    if ($result.CertificateSha256 -notmatch '^[0-9A-F]{64}$') {
        throw "Initializer returned an invalid certificate fingerprint."
    }

    $signingProperties = Read-AndroidSigningProperties -Path $result.SigningProperties
    Assert-EqualValue "Signing alias" "pulse-release" $signingProperties.keyAlias
    Assert-EqualValue `
        -Label "Signing keystore path" `
        -Expected $result.LocalKeyStore.Replace("\", "/") `
        -Actual $signingProperties.storeFile

    $sheet = Get-Content -Raw -LiteralPath $result.RecoverySheet
    if ($sheet -notmatch '(?m)^Recovery password: (?<password>\S+)\s*$') {
        throw "Offline recovery sheet does not contain a recovery password."
    }
    $recoveryPassword = $Matches.password
    $recoveryPasswordFile = Join-Path $tempRoot "recovery-password.txt"
    $restoredManifestPath = Join-Path $tempRoot "restored-recovery.json"
    $recoveredStorePasswordFile = Join-Path $tempRoot "recovered-store-password.txt"
    $recoveryPassword | Set-Content -LiteralPath $recoveryPasswordFile -Encoding ascii -NoNewline
    Unprotect-AndroidRecoveryManifest `
        -InputPath $result.EncryptedRecoveryManifest `
        -OutputPath $restoredManifestPath `
        -RecoveryPasswordFile $recoveryPasswordFile `
        -OpenSslCommand $openSsl
    $restoredManifest = Get-Content -Raw -LiteralPath $restoredManifestPath | ConvertFrom-Json
    Assert-EqualValue "Recovered alias" "pulse-release" $restoredManifest.keyAlias
    $restoredManifest.storePassword | Set-Content -LiteralPath $recoveredStorePasswordFile -Encoding ascii -NoNewline
    Assert-EqualValue `
        -Label "Recovered certificate fingerprint" `
        -Expected $result.CertificateSha256 `
        -Actual (Get-KeyStoreCertificateFingerprint `
            -KeyStorePath $result.NasKeyStore `
            -Alias $restoredManifest.keyAlias `
            -PasswordFile $recoveredStorePasswordFile `
            -KeytoolCommand $keytool)

    $instructions = Get-Content -Raw -LiteralPath $result.RecoveryInstructions
    foreach ($secret in @(
        $recoveryPassword,
        $restoredManifest.storePassword,
        $restoredManifest.keyPassword
    )) {
        if ($instructions.Contains($secret)) {
            throw "Recovery instructions contain secret material."
        }
    }

    try {
        & $initializerPath `
            -LocalDirectory $localRoot `
            -NasDirectory $nasRoot `
            -RecoverySheetPath $sheetPath `
            -KeytoolCommand $keytool `
            -OpenSslCommand $openSsl `
            -SkipCredentialManager | Out-Null
        throw "Initializer overwrote an existing release key."
    } catch {
        if ($_.Exception.Message -notlike "*already exists*") {
            throw
        }
    }
} finally {
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}

Write-Host "Android release signing initialization test passed."
