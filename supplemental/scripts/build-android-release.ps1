param(
    [Parameter(Mandatory)][string]$Version,
    [Parameter(Mandatory)][string]$SigningPropertiesPath,
    [string]$RepositoryRoot = "",
    [string]$GradleCommand = "",
    [string]$ApkSignerCommand = "",
    [string]$Aapt2Command = "",
    [switch]$SkipWebSync
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "android-signing-helpers.ps1")

if ([string]::IsNullOrWhiteSpace($RepositoryRoot)) {
    $RepositoryRoot = Join-Path $PSScriptRoot "..\.."
}
$RepositoryRoot = (Resolve-Path -LiteralPath $RepositoryRoot).Path
$resolvedVersion = Resolve-AndroidReleaseVersion -Version $Version
$signingProperties = Read-AndroidSigningProperties -Path $SigningPropertiesPath
if ($signingProperties.keyAlias -ne "pulse-release") {
    throw "Android Release signing alias must be pulse-release."
}
if (-not (Test-Path -LiteralPath $signingProperties.storeFile -PathType Leaf)) {
    throw "Android Release keystore does not exist: $($signingProperties.storeFile)"
}

$siteRoot = Join-Path $RepositoryRoot "internal\site"
$androidRoot = Join-Path $siteRoot "android"
$apkPath = Join-Path $androidRoot "app\build\outputs\apk\release\app-release.apk"

if ([string]::IsNullOrWhiteSpace($GradleCommand)) {
    $GradleCommand = Join-Path $androidRoot (if ($IsWindows) { "gradlew.bat" } else { "gradlew" })
}
if ([string]::IsNullOrWhiteSpace($ApkSignerCommand)) {
    $ApkSignerCommand = Get-AndroidSdkBuildTool -Name "apksigner"
}
if ([string]::IsNullOrWhiteSpace($Aapt2Command)) {
    $Aapt2Command = Get-AndroidSdkBuildTool -Name "aapt2"
}
foreach ($command in @($GradleCommand, $ApkSignerCommand, $Aapt2Command)) {
    if (-not (Test-Path -LiteralPath $command -PathType Leaf) -and -not (Get-Command $command -ErrorAction SilentlyContinue)) {
        throw "Android Release build command does not exist: $command"
    }
}

if (Test-Path -LiteralPath $apkPath) {
    Remove-Item -LiteralPath $apkPath -Force
}

try {
    Push-Location $RepositoryRoot
    try {
        if (-not $SkipWebSync) {
            $npmCommand = if ($IsWindows) { "npm.cmd" } else { "npm" }
            $syncOutput = & $npmCommand --prefix internal/site run android:sync 2>&1 | Out-String
            if ($LASTEXITCODE -ne 0) {
                throw "Android Web and Capacitor sync failed."
            }
        }

        $gradleOutput = & $GradleCommand @(
            "-p", $androidRoot,
            "assembleRelease",
            "-PpulseVersionName=$($resolvedVersion.FullVersion)",
            "-PpulseVersionCode=$($resolvedVersion.AndroidVersionCode)",
            "-PpulseSigningPropertiesFile=$SigningPropertiesPath",
            "--console=plain"
        ) 2>&1 | Out-String
        if ($LASTEXITCODE -ne 0) {
            throw "Android Release Gradle build failed."
        }
    } finally {
        Pop-Location
    }

    if (-not (Test-Path -LiteralPath $apkPath -PathType Leaf)) {
        throw "Android Release Gradle build did not create app-release.apk."
    }

    Test-AndroidReleaseApk `
        -Version $resolvedVersion.FullVersion `
        -ApkPath $apkPath `
        -RepositoryRoot $RepositoryRoot `
        -ApkSignerCommand $ApkSignerCommand `
        -Aapt2Command $Aapt2Command
} catch {
    if (Test-Path -LiteralPath $apkPath) {
        Remove-Item -LiteralPath $apkPath -Force -ErrorAction SilentlyContinue
    }
    throw
}
