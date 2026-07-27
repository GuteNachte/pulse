$ErrorActionPreference = "Stop"

function New-CryptographicPassword {
    param([ValidateRange(16, 1024)][int]$ByteCount = 32)

    $bytes = [byte[]]::new($ByteCount)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function Resolve-AndroidReleaseVersion {
    param([Parameter(Mandatory)][string]$Version)

    $pattern = '^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?<suffix>-(?:alpha|beta|rc)\.[1-9]\d*)?$'
    if ($Version -notmatch $pattern) {
        throw "Android release version must be a semantic version such as 1.0.6 or 1.0.6-beta.2."
    }
    $major = [int]$Matches.major
    $minor = [int]$Matches.minor
    $patch = [int]$Matches.patch
    if ($minor -gt 99 -or $patch -gt 99) {
        throw "Android release version minor and patch components must not exceed 99."
    }
    $versionCode = ($major * 10000) + ($minor * 100) + $patch
    if ($versionCode -le 0 -or $versionCode -gt [int]::MaxValue) {
        throw "Android release versionCode is outside the supported range."
    }
    return [pscustomobject]@{
        FullVersion = $Version
        AndroidVersionCode = $versionCode
        IsPrerelease = -not [string]::IsNullOrWhiteSpace($Matches.suffix)
    }
}

function ConvertTo-CanonicalCertificateFingerprint {
    param([Parameter(Mandatory)][string]$Fingerprint)

    if ($Fingerprint -notmatch '^[0-9A-Fa-f:\s-]+$') {
        throw "Certificate fingerprint must contain only hexadecimal digits and separators."
    }
    $canonical = $Fingerprint -replace '[:\s-]', ''
    if ($canonical -notmatch '^[0-9A-Fa-f]{64}$') {
        throw "Certificate fingerprint must contain exactly 64 hexadecimal digits."
    }
    return $canonical.ToUpperInvariant()
}

function Read-AndroidSigningProperties {
    param([Parameter(Mandatory)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Android signing properties file does not exist: $Path"
    }

    $values = [ordered]@{}
    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmed = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith("#")) {
            continue
        }
        $separator = $trimmed.IndexOf("=", [System.StringComparison]::Ordinal)
        if ($separator -le 0) {
            throw "Invalid Android signing property line."
        }
        $key = $trimmed.Substring(0, $separator).Trim()
        $value = $trimmed.Substring($separator + 1).Trim()
        if ($values.Contains($key)) {
            throw "Duplicate Android signing property: $key"
        }
        $values[$key] = $value
    }

    foreach ($required in @("storeFile", "storePassword", "keyAlias", "keyPassword")) {
        if (-not $values.Contains($required) -or [string]::IsNullOrWhiteSpace([string]$values[$required])) {
            throw "Android signing properties are missing required key: $required"
        }
    }

    return [pscustomobject]$values
}

function Get-AndroidSdkBuildTool {
    param(
        [Parameter(Mandatory)][ValidateSet("apksigner", "aapt2")][string]$Name,
        [string]$SdkRoot = ""
    )

    if ([string]::IsNullOrWhiteSpace($SdkRoot)) {
        $SdkRoot = if (-not [string]::IsNullOrWhiteSpace($env:ANDROID_HOME)) {
            $env:ANDROID_HOME
        } else {
            $env:ANDROID_SDK_ROOT
        }
    }
    if ([string]::IsNullOrWhiteSpace($SdkRoot)) {
        throw "ANDROID_HOME or ANDROID_SDK_ROOT is required to locate $Name."
    }

    $buildToolsRoot = Join-Path $SdkRoot "build-tools"
    if (-not (Test-Path -LiteralPath $buildToolsRoot -PathType Container)) {
        throw "Android SDK build-tools directory does not exist: $buildToolsRoot"
    }
    $fileName = if ($IsWindows) {
        if ($Name -eq "apksigner") { "apksigner.bat" } else { "aapt2.exe" }
    } else {
        $Name
    }
    foreach ($directory in Get-ChildItem -LiteralPath $buildToolsRoot -Directory | Sort-Object { [version]$_.Name } -Descending) {
        $candidate = Join-Path $directory.FullName $fileName
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return $candidate
        }
    }
    throw "Android SDK build tool was not found: $Name"
}

function Test-AndroidReleaseApk {
    param(
        [Parameter(Mandatory)][string]$Version,
        [Parameter(Mandatory)][string]$ApkPath,
        [Parameter(Mandatory)][string]$RepositoryRoot,
        [string]$ApkSignerCommand = "",
        [string]$Aapt2Command = ""
    )

    $RepositoryRoot = (Resolve-Path -LiteralPath $RepositoryRoot).Path
    if (-not (Test-Path -LiteralPath $ApkPath -PathType Leaf)) {
        throw "Android Release APK does not exist: $ApkPath"
    }

    $resolvedVersion = Resolve-AndroidReleaseVersion -Version $Version
    $fingerprintPath = Join-Path $RepositoryRoot "internal\site\android\release-certificate.sha256"
    if (-not (Test-Path -LiteralPath $fingerprintPath -PathType Leaf)) {
        throw "Android Release certificate fingerprint does not exist: $fingerprintPath"
    }
    $expectedFingerprint = ConvertTo-CanonicalCertificateFingerprint (Get-Content -Raw -LiteralPath $fingerprintPath)

    if ([string]::IsNullOrWhiteSpace($ApkSignerCommand)) {
        $ApkSignerCommand = Get-AndroidSdkBuildTool -Name "apksigner"
    }
    if ([string]::IsNullOrWhiteSpace($Aapt2Command)) {
        $Aapt2Command = Get-AndroidSdkBuildTool -Name "aapt2"
    }
    foreach ($command in @($ApkSignerCommand, $Aapt2Command)) {
        if (-not (Test-Path -LiteralPath $command -PathType Leaf) -and -not (Get-Command $command -ErrorAction SilentlyContinue)) {
            throw "Android Release verification command does not exist: $command"
        }
    }

    $apkSignerOutput = & $ApkSignerCommand verify --verbose --print-certs $ApkPath 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
        throw "Android Release APK signature verification failed."
    }
    if ($apkSignerOutput -notmatch '(?im)^Verified using v(?:2|3) scheme .*:\s*true\s*$') {
        throw "Android Release APK does not contain a verified v2 or v3 signature."
    }
    if ($apkSignerOutput -notmatch '(?im)^Signer #1 certificate SHA-256 digest:\s*(?<fingerprint>[0-9a-f: -]+)\s*$') {
        throw "Android Release APK certificate fingerprint was not reported."
    }
    $actualFingerprint = ConvertTo-CanonicalCertificateFingerprint $Matches.fingerprint
    if ($actualFingerprint -ne $expectedFingerprint) {
        throw "Android Release APK certificate fingerprint does not match the fixed release identity."
    }

    $aaptOutput = & $Aapt2Command dump badging $ApkPath 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
        throw "Android Release APK metadata verification failed."
    }
    if ($aaptOutput -notmatch "(?m)^package:\s+name='(?<package>[^']+)'\s+versionCode='(?<code>\d+)'\s+versionName='(?<version>[^']+)'") {
        throw "Android Release APK package metadata was not reported."
    }
    if ($Matches.package -ne "site.gutenacht.pulse") {
        throw "Android Release APK applicationId is not site.gutenacht.pulse."
    }
    if ([int]$Matches.code -ne $resolvedVersion.AndroidVersionCode) {
        throw "Android Release APK versionCode does not match the release version."
    }
    if ($Matches.version -ne $resolvedVersion.FullVersion) {
        throw "Android Release APK versionName does not match the release version."
    }
    if ($aaptOutput -match '(?m)^application-debuggable\s*$') {
        throw "Android Release APK is debuggable."
    }

    return [pscustomobject]@{
        ApkPath = $ApkPath
        VersionName = $resolvedVersion.FullVersion
        VersionCode = $resolvedVersion.AndroidVersionCode
        CertificateSha256 = $actualFingerprint
    }
}

function Get-KeyStoreCertificateFingerprint {
    param(
        [Parameter(Mandatory)][string]$KeyStorePath,
        [Parameter(Mandatory)][string]$Alias,
        [Parameter(Mandatory)][string]$PasswordFile,
        [string]$KeytoolCommand = "keytool"
    )

    foreach ($path in @($KeyStorePath, $PasswordFile)) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            throw "Android signing input does not exist: $path"
        }
    }

    $certificatePath = Join-Path ([System.IO.Path]::GetTempPath()) ("pulse-android-certificate-" + [guid]::NewGuid().ToString("N") + ".cer")
    try {
        $output = & $KeytoolCommand `
            -exportcert `
            -keystore $KeyStorePath `
            -storetype PKCS12 `
            -alias $Alias `
            '-storepass:file' $PasswordFile `
            -file $certificatePath 2>&1 | Out-String
        if ($LASTEXITCODE -ne 0) {
            throw "Unable to export the Android signing certificate."
        }
        if (-not (Test-Path -LiteralPath $certificatePath -PathType Leaf)) {
            throw "Android signing certificate export did not create a file."
        }
        $certificate = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($certificatePath)
        return ConvertTo-CanonicalCertificateFingerprint $certificate.GetCertHashString([System.Security.Cryptography.HashAlgorithmName]::SHA256)
    } finally {
        if (Test-Path -LiteralPath $certificatePath) {
            Remove-Item -LiteralPath $certificatePath -Force
        }
    }
}

function Invoke-OpenSslRecoveryCommand {
    param(
        [Parameter(Mandatory)][string]$OpenSslCommand,
        [Parameter(Mandatory)][string[]]$Arguments,
        [Parameter(Mandatory)][string]$OutputPath
    )

    $output = & $OpenSslCommand @Arguments 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
        throw "OpenSSL recovery operation failed."
    }
    if (-not (Test-Path -LiteralPath $OutputPath -PathType Leaf)) {
        throw "OpenSSL recovery operation did not create its output."
    }
}

function Protect-AndroidRecoveryManifest {
    param(
        [Parameter(Mandatory)][string]$InputPath,
        [Parameter(Mandatory)][string]$OutputPath,
        [Parameter(Mandatory)][string]$RecoveryPasswordFile,
        [Parameter(Mandatory)][string]$OpenSslCommand
    )

    Invoke-OpenSslRecoveryCommand `
        -OpenSslCommand $OpenSslCommand `
        -OutputPath $OutputPath `
        -Arguments @(
            "enc", "-aes-256-cbc", "-salt", "-pbkdf2", "-iter", "600000",
            "-in", $InputPath, "-out", $OutputPath, "-pass", "file:$RecoveryPasswordFile"
        )
}

function Unprotect-AndroidRecoveryManifest {
    param(
        [Parameter(Mandatory)][string]$InputPath,
        [Parameter(Mandatory)][string]$OutputPath,
        [Parameter(Mandatory)][string]$RecoveryPasswordFile,
        [Parameter(Mandatory)][string]$OpenSslCommand
    )

    Invoke-OpenSslRecoveryCommand `
        -OpenSslCommand $OpenSslCommand `
        -OutputPath $OutputPath `
        -Arguments @(
            "enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "600000",
            "-in", $InputPath, "-out", $OutputPath, "-pass", "file:$RecoveryPasswordFile"
        )
}

function Initialize-WindowsCredentialNativeType {
    if ("Pulse.AndroidSigning.CredentialNative" -as [type]) {
        return
    }

    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace Pulse.AndroidSigning
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct Credential
    {
        public UInt32 Flags;
        public UInt32 Type;
        public string TargetName;
        public string Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public UInt32 CredentialBlobSize;
        public IntPtr CredentialBlob;
        public UInt32 Persist;
        public UInt32 AttributeCount;
        public IntPtr Attributes;
        public string TargetAlias;
        public string UserName;
    }

    public static class CredentialNative
    {
        [DllImport("advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
        public static extern bool CredWrite(ref Credential credential, UInt32 flags);

        [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
        public static extern bool CredRead(string target, UInt32 type, UInt32 flags, out IntPtr credential);

        [DllImport("advapi32.dll", EntryPoint = "CredDeleteW", CharSet = CharSet.Unicode, SetLastError = true)]
        public static extern bool CredDelete(string target, UInt32 type, UInt32 flags);

        [DllImport("advapi32.dll", EntryPoint = "CredFree", SetLastError = false)]
        public static extern void CredFree(IntPtr buffer);
    }
}
'@
}

function Assert-WindowsCredentialSupport {
    if (-not $IsWindows) {
        throw "Windows Credential Manager is only available on Windows."
    }
    Initialize-WindowsCredentialNativeType
}

function Set-WindowsGenericCredential {
    param(
        [Parameter(Mandatory)][string]$Target,
        [Parameter(Mandatory)][string]$UserName,
        [Parameter(Mandatory)][string]$Password
    )

    Assert-WindowsCredentialSupport
    $blob = [Runtime.InteropServices.Marshal]::StringToCoTaskMemUni($Password)
    try {
        $credential = [Pulse.AndroidSigning.Credential]::new()
        $credential.Type = 1
        $credential.TargetName = $Target
        $credential.UserName = $UserName
        $credential.CredentialBlob = $blob
        $credential.CredentialBlobSize = [Text.Encoding]::Unicode.GetByteCount($Password)
        $credential.Persist = 2
        if (-not [Pulse.AndroidSigning.CredentialNative]::CredWrite([ref]$credential, 0)) {
            $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
            throw "Unable to write Windows credential '$Target' (Win32 $errorCode)."
        }
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeCoTaskMemUnicode($blob)
    }
}

function Get-WindowsGenericCredential {
    param([Parameter(Mandatory)][string]$Target)

    Assert-WindowsCredentialSupport
    $pointer = [IntPtr]::Zero
    if (-not [Pulse.AndroidSigning.CredentialNative]::CredRead($Target, 1, 0, [ref]$pointer)) {
        $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
        if ($errorCode -eq 1168) {
            throw "Windows credential not found: $Target"
        }
        throw "Unable to read Windows credential '$Target' (Win32 $errorCode)."
    }
    try {
        $credential = [Runtime.InteropServices.Marshal]::PtrToStructure($pointer, [type][Pulse.AndroidSigning.Credential])
        $password = [Runtime.InteropServices.Marshal]::PtrToStringUni(
            $credential.CredentialBlob,
            [int]($credential.CredentialBlobSize / 2)
        )
        return [pscustomobject]@{
            Target = $credential.TargetName
            UserName = $credential.UserName
            Password = $password
        }
    } finally {
        [Pulse.AndroidSigning.CredentialNative]::CredFree($pointer)
    }
}

function Remove-WindowsGenericCredential {
    param([Parameter(Mandatory)][string]$Target)

    Assert-WindowsCredentialSupport
    if (-not [Pulse.AndroidSigning.CredentialNative]::CredDelete($Target, 1, 0)) {
        $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
        if ($errorCode -eq 1168) {
            throw "Windows credential not found: $Target"
        }
        throw "Unable to delete Windows credential '$Target' (Win32 $errorCode)."
    }
}
