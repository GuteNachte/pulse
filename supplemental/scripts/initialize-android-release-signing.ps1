param(
    [string]$LocalDirectory = (Join-Path $env:LOCALAPPDATA "Pulse\signing\android"),
    [string]$NasDirectory = "Z:\Pulse-Secrets\Android",
    [string]$RecoverySheetPath = "",
    [string]$Alias = "pulse-release",
    [string]$CredentialTarget = "Pulse/AndroidReleaseRecovery",
    [string]$KeytoolCommand = "keytool",
    [string]$OpenSslCommand = "",
    [switch]$SkipCredentialManager
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "android-signing-helpers.ps1")

if ([string]::IsNullOrWhiteSpace($RecoverySheetPath)) {
    $RecoverySheetPath = Join-Path ([Environment]::GetFolderPath("Desktop")) "Pulse-Android-Release-Recovery.txt"
}
if ([string]::IsNullOrWhiteSpace($OpenSslCommand)) {
    $OpenSslCommand = if ($IsWindows) {
        "C:\Program Files\Git\usr\bin\openssl.exe"
    } else {
        (Get-Command openssl -ErrorAction Stop).Source
    }
}

$localKeyStore = Join-Path $LocalDirectory "pulse-android-release.p12"
$localCertificate = Join-Path $LocalDirectory "pulse-android-release.cer"
$signingProperties = Join-Path $LocalDirectory "signing.properties"
$nasKeyStore = Join-Path $NasDirectory "pulse-android-release.p12"
$nasCertificate = Join-Path $NasDirectory "pulse-android-release.cer"
$encryptedRecoveryManifest = Join-Path $NasDirectory "pulse-android-recovery.json.enc"
$recoveryInstructions = Join-Path $NasDirectory "README.md"
$targets = @(
    $localKeyStore,
    $localCertificate,
    $signingProperties,
    $nasKeyStore,
    $nasCertificate,
    $encryptedRecoveryManifest,
    $recoveryInstructions,
    $RecoverySheetPath
)
foreach ($target in $targets) {
    if (Test-Path -LiteralPath $target) {
        throw "Android release signing target already exists: $target"
    }
}

foreach ($command in @($KeytoolCommand, $OpenSslCommand)) {
    $resolved = Get-Command $command -ErrorAction SilentlyContinue
    if (-not $resolved -and -not (Test-Path -LiteralPath $command -PathType Leaf)) {
        throw "Required Android signing command does not exist: $command"
    }
}

$createdFiles = [System.Collections.Generic.List[string]]::new()
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("pulse-android-signing-init-" + [guid]::NewGuid().ToString("N"))
$storePassword = New-CryptographicPassword -ByteCount 32
$recoveryPassword = New-CryptographicPassword -ByteCount 32
$completed = $false
$credentialWritten = $false

try {
    foreach ($directory in @(
        $LocalDirectory,
        $NasDirectory,
        (Split-Path -Parent $RecoverySheetPath),
        $tempRoot
    )) {
        if (-not (Test-Path -LiteralPath $directory -PathType Container)) {
            New-Item -ItemType Directory -Path $directory -Force | Out-Null
        }
    }

    if ($IsWindows) {
        $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
        & icacls.exe $LocalDirectory /inheritance:r /grant:r "${currentUser}:(OI)(CI)F" "SYSTEM:(OI)(CI)F" /T /C *> $null
        if ($LASTEXITCODE -ne 0) {
            throw "Unable to restrict the local Android signing directory ACL."
        }
    }

    $storePasswordFile = Join-Path $tempRoot "store-password.txt"
    $recoveryPasswordFile = Join-Path $tempRoot "recovery-password.txt"
    $plainRecoveryManifest = Join-Path $tempRoot "recovery.json"
    $restoredRecoveryManifest = Join-Path $tempRoot "restored-recovery.json"
    $restoredStorePasswordFile = Join-Path $tempRoot "restored-store-password.txt"
    $storePassword | Set-Content -LiteralPath $storePasswordFile -Encoding ascii -NoNewline
    $recoveryPassword | Set-Content -LiteralPath $recoveryPasswordFile -Encoding ascii -NoNewline

    $keytoolOutput = & $KeytoolCommand @(
        "-genkeypair",
        "-alias", $Alias,
        "-keyalg", "RSA",
        "-keysize", "4096",
        "-sigalg", "SHA256withRSA",
        "-validity", "36500",
        "-dname", "CN=Pulse Android Release, OU=Pulse, O=Pulse, C=CN",
        "-storetype", "PKCS12",
        "-keystore", $localKeyStore,
        "-storepass:file", $storePasswordFile,
        "-keypass:file", $storePasswordFile,
        "-noprompt"
    ) 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $localKeyStore -PathType Leaf)) {
        throw "Unable to generate the Android release key."
    }
    $createdFiles.Add($localKeyStore)

    $certificateOutput = & $KeytoolCommand @(
        "-exportcert",
        "-rfc",
        "-keystore", $localKeyStore,
        "-storetype", "PKCS12",
        "-alias", $Alias,
        "-storepass:file", $storePasswordFile,
        "-file", $localCertificate
    ) 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $localCertificate -PathType Leaf)) {
        throw "Unable to export the Android release certificate."
    }
    $createdFiles.Add($localCertificate)

    $certificateSha256 = Get-KeyStoreCertificateFingerprint `
        -KeyStorePath $localKeyStore `
        -Alias $Alias `
        -PasswordFile $storePasswordFile `
        -KeytoolCommand $KeytoolCommand

    @(
        "storeFile=$($localKeyStore.Replace('\', '/'))",
        "storePassword=$storePassword",
        "keyAlias=$Alias",
        "keyPassword=$storePassword"
    ) | Set-Content -LiteralPath $signingProperties -Encoding utf8NoBOM
    $createdFiles.Add($signingProperties)

    Copy-Item -LiteralPath $localKeyStore -Destination $nasKeyStore
    $createdFiles.Add($nasKeyStore)
    Copy-Item -LiteralPath $localCertificate -Destination $nasCertificate
    $createdFiles.Add($nasCertificate)

    $localHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $localKeyStore).Hash.ToUpperInvariant()
    $nasHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $nasKeyStore).Hash.ToUpperInvariant()
    if ($localHash -ne $nasHash) {
        throw "Local and NAS Android release key hashes do not match."
    }

    [ordered]@{
        schema = "pulse.android.signing.recovery.v1"
        createdAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        keyAlias = $Alias
        keyStoreSha256 = $localHash
        certificateSha256 = $certificateSha256
        storePassword = $storePassword
        keyPassword = $storePassword
    } | ConvertTo-Json | Set-Content -LiteralPath $plainRecoveryManifest -Encoding utf8NoBOM

    Protect-AndroidRecoveryManifest `
        -InputPath $plainRecoveryManifest `
        -OutputPath $encryptedRecoveryManifest `
        -RecoveryPasswordFile $recoveryPasswordFile `
        -OpenSslCommand $OpenSslCommand
    $createdFiles.Add($encryptedRecoveryManifest)

    Unprotect-AndroidRecoveryManifest `
        -InputPath $encryptedRecoveryManifest `
        -OutputPath $restoredRecoveryManifest `
        -RecoveryPasswordFile $recoveryPasswordFile `
        -OpenSslCommand $OpenSslCommand
    $restored = Get-Content -Raw -LiteralPath $restoredRecoveryManifest | ConvertFrom-Json
    $restored.storePassword | Set-Content -LiteralPath $restoredStorePasswordFile -Encoding ascii -NoNewline
    $restoredFingerprint = Get-KeyStoreCertificateFingerprint `
        -KeyStorePath $nasKeyStore `
        -Alias $restored.keyAlias `
        -PasswordFile $restoredStorePasswordFile `
        -KeytoolCommand $KeytoolCommand
    if ($restoredFingerprint -ne $certificateSha256) {
        throw "Recovered Android release key certificate fingerprint does not match."
    }

    @"
# Pulse Android Release Signing Recovery

- Alias: $Alias
- Certificate SHA-256: $certificateSha256
- PKCS12 SHA-256: $localHash
- Encrypted recovery manifest: $encryptedRecoveryManifest
- Public certificate: $nasCertificate

Restore the encrypted manifest with OpenSSL AES-256-CBC, PBKDF2 and 600000 iterations. The recovery password is stored separately in Windows Credential Manager and on the one-time offline recovery sheet. Never copy the key, encrypted manifest or recovery sheet into Git, Issues, logs or public cloud storage.
"@ | Set-Content -LiteralPath $recoveryInstructions -Encoding utf8NoBOM
    $createdFiles.Add($recoveryInstructions)

    @"
Pulse Android Release Signing - Offline Recovery

Recovery password: $recoveryPassword
Credential target: $CredentialTarget
Certificate SHA-256: $certificateSha256
NAS directory: $NasDirectory

Print or transcribe this sheet and keep it offline. Delete this plaintext file only after the offline copy has been confirmed.
"@ | Set-Content -LiteralPath $RecoverySheetPath -Encoding utf8NoBOM
    $createdFiles.Add($RecoverySheetPath)

    if (-not $SkipCredentialManager) {
        Set-WindowsGenericCredential `
            -Target $CredentialTarget `
            -UserName "Pulse Android Release Recovery" `
            -Password $recoveryPassword
        $credentialWritten = $true
        $storedCredential = Get-WindowsGenericCredential -Target $CredentialTarget
        if ($storedCredential.Password -ne $recoveryPassword) {
            throw "Windows Credential Manager did not return the Android recovery password."
        }
    }

    $completed = $true
    [pscustomobject]@{
        LocalKeyStore = $localKeyStore
        NasKeyStore = $nasKeyStore
        SigningProperties = $signingProperties
        EncryptedRecoveryManifest = $encryptedRecoveryManifest
        PublicCertificate = $nasCertificate
        RecoveryInstructions = $recoveryInstructions
        RecoverySheet = $RecoverySheetPath
        KeyStoreSha256 = $localHash
        CertificateSha256 = $certificateSha256
        CredentialTarget = if ($SkipCredentialManager) { "" } else { $CredentialTarget }
    }
} finally {
    if (-not $completed) {
        foreach ($path in $targets) {
            if (Test-Path -LiteralPath $path) {
                Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
            }
        }
        if ($credentialWritten) {
            try {
                Remove-WindowsGenericCredential -Target $CredentialTarget
            } catch {
                # Best-effort rollback after a failed signing initialization.
            }
        }
    }
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
    $storePassword = $null
    $recoveryPassword = $null
}
