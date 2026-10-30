# Android Release Signing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a recoverable Android Release signing identity and make every private and public Pulse release produce a non-debuggable APK signed by that fixed identity.

**Architecture:** A private initialization script creates the one-time PKCS12 key, local working copy, encrypted NAS recovery bundle, and public certificate fingerprint. A shared build script consumes an external signing-properties file, Gradle signs only the Release build, and verification rejects wrong versions, debuggable packages, invalid signatures, or unexpected certificates. GitHub validation remains secret-free; the existing `public-release` environment injects signing material only after approval and rebuilds the final public bundle with the signed APK.

**Tech Stack:** PowerShell 7, Java 21 `keytool`, OpenSSL AES-256/PBKDF2, Gradle/Android SDK 36, `apksigner`, `aapt2`, GitHub Actions Environment Secrets

---

## File Map

Private source repository (`C:\Users\Nacht\Documents\PL`):

- Create `supplemental/scripts/android-signing-helpers.ps1`: password generation, key metadata, recovery encryption and APK verification helpers.
- Create `supplemental/scripts/test-android-signing-helpers.ps1`: deterministic helper and failure-path tests.
- Create `supplemental/scripts/initialize-android-release-signing.ps1`: one-time local/NAS provisioning entry point.
- Create `supplemental/scripts/test-initialize-android-release-signing.ps1`: temporary-directory provisioning and recovery test.
- Create `supplemental/scripts/build-android-release.ps1`: signed Release APK build entry point.
- Create `supplemental/scripts/test-build-android-release.ps1`: fake-tool build/cleanup contract.
- Modify `internal/site/android/app/build.gradle`: external Release signing properties only.
- Create `internal/site/android/release-certificate.sha256`: fixed public certificate fingerprint after provisioning.
- Modify `supplemental/scripts/publish-release-v1.ps1`: call the Release builder and report Release APK path.
- Modify `supplemental/scripts/verify-release-v1.ps1`: verify Release metadata, signature, non-debuggable state and fingerprint.
- Modify `supplemental/scripts/test-publish-release-guard.ps1`: lock the Release-only contract.
- Modify `.gitignore`: reject local keystore and signing-property files.

Public repository (`C:\Users\Nacht\Documents\Pulse-public-distribution-sanitized-20260725`):

- Carry the shared helper, builder, tests, Gradle signing configuration and fingerprint file from the private implementation.
- Modify `supplemental/scripts/package-public-release.ps1`: default to the signed Release APK.
- Modify `supplemental/scripts/test-package-public-release.ps1`: fixture and assertions use the Release APK.
- Modify `supplemental/scripts/verify-release-v1.ps1`: same Release verification contract.
- Modify `.github/workflows/public-release.yml`: secret-free validation plus environment-approved signed build and final repackaging.
- Modify `.github/workflows/quality.yml`: run Android signing contract tests without real secrets.
- Modify `supplemental/scripts/test-public-release-workflow.ps1`: prove secret scope and operation ordering.
- Modify `.gitignore`, public runbooks, release notes and About release history.

Secrets and recovery artifacts are created only outside both repositories.

### Task 1: Add secret-leak and signing contract tests

**Files:**

- Create: `supplemental/scripts/test-android-signing-helpers.ps1`
- Modify: `supplemental/scripts/test-publish-release-guard.ps1`
- Modify: `.gitignore`

- [ ] **Step 1: Write the failing repository contract**

Add assertions that require the planned helper/builder names, Release output paths and ignore patterns, and reject tracked secret material:

```powershell
$trackedSecrets = @(git ls-files -- '*.p12' '*.jks' '*signing*.properties' '*recovery*.json')
if ($trackedSecrets.Count -gt 0) {
    throw "Tracked Android signing secrets: $($trackedSecrets -join ', ')"
}

foreach ($pattern in @('*.p12', '*.jks', '*signing*.properties', '*android-recovery*')) {
    if (-not $gitIgnore.Contains($pattern)) {
        throw ".gitignore is missing Android signing pattern: $pattern"
    }
}
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
pwsh -NoProfile -File supplemental/scripts/test-publish-release-guard.ps1
```

Expected: FAIL because the Release builder, Release APK path and ignore rules do not exist.

- [ ] **Step 3: Add only the ignore rules needed for secret material**

Append:

```gitignore
*.p12
*.jks
*signing*.properties
*android-recovery*
```

- [ ] **Step 4: Keep the test red for the missing implementation**

Run the same command. Expected: FAIL for the missing helper/builder contract, not for ignore rules.

### Task 2: Implement signing and recovery helpers

**Files:**

- Create: `supplemental/scripts/android-signing-helpers.ps1`
- Test: `supplemental/scripts/test-android-signing-helpers.ps1`

- [ ] **Step 1: Write failing tests for pure behavior**

Cover canonical fingerprint normalization, cryptographic password length, required signing-property keys, version metadata parsing and command failure propagation:

```powershell
Assert-Equal 'Fingerprint normalization' `
    'AABBCCDD' `
    (ConvertTo-CanonicalCertificateFingerprint 'AA:BB:cc:dd')

$password = New-CryptographicPassword -ByteCount 32
if ($password.Length -lt 43) { throw 'Generated password is too short.' }

$properties = Read-AndroidSigningProperties -Path $fixtureProperties
Assert-Equal 'Signing alias' 'pulse-release' $properties.keyAlias
```

- [ ] **Step 2: Run and verify RED**

```powershell
pwsh -NoProfile -File supplemental/scripts/test-android-signing-helpers.ps1
```

Expected: FAIL because `android-signing-helpers.ps1` and its functions do not exist.

- [ ] **Step 3: Implement the minimal helper API**

Implement these functions with terminating errors and no secret output:

```powershell
function New-CryptographicPassword { param([int]$ByteCount = 32) }
function ConvertTo-CanonicalCertificateFingerprint { param([string]$Fingerprint) }
function Read-AndroidSigningProperties { param([string]$Path) }
function Get-AndroidSdkBuildTool { param([string]$Name, [string]$SdkRoot = '') }
function Get-KeyStoreCertificateFingerprint { param([string]$KeyStorePath, [string]$Alias, [string]$PasswordFile, [string]$KeytoolCommand = 'keytool') }
function Protect-AndroidRecoveryManifest { param([string]$InputPath, [string]$OutputPath, [string]$RecoveryPasswordFile, [string]$OpenSslCommand) }
function Unprotect-AndroidRecoveryManifest { param([string]$InputPath, [string]$OutputPath, [string]$RecoveryPasswordFile, [string]$OpenSslCommand) }
function Set-WindowsGenericCredential { param([string]$Target, [string]$UserName, [string]$Password) }
function Get-WindowsGenericCredential { param([string]$Target) }
function Remove-WindowsGenericCredential { param([string]$Target) }
```

Use `System.Security.Cryptography.RandomNumberGenerator`; use OpenSSL `enc -aes-256-cbc -salt -pbkdf2 -iter 600000 -pass file:<path>`; delete plaintext temporary files in `finally`. Implement Windows Credential Manager through `CredWriteW`, `CredReadW`, `CredDeleteW` and `CredFree` P/Invoke so the recovery password is never placed in a process command line. Windows tests create a GUID-named temporary credential, read it back, and delete it in `finally`; non-Windows CI skips only this OS integration assertion.

- [ ] **Step 4: Run and verify GREEN**

```powershell
pwsh -NoProfile -File supplemental/scripts/test-android-signing-helpers.ps1
```

Expected: PASS with no password, Base64 key or recovery payload in output.

### Task 3: Implement one-time key provisioning and NAS recovery

**Files:**

- Create: `supplemental/scripts/initialize-android-release-signing.ps1`
- Create: `supplemental/scripts/test-initialize-android-release-signing.ps1`

- [ ] **Step 1: Write the failing provisioning test**

Use temporary local/NAS directories and real `keytool`/OpenSSL. Assert:

```powershell
$result = & $initializer `
    -LocalDirectory $localRoot `
    -NasDirectory $nasRoot `
    -RecoverySheetPath $sheetPath `
    -CredentialTarget 'Pulse/TestAndroidReleaseRecovery' `
    -SkipCredentialManager

Assert-Path $result.LocalKeyStore
Assert-Path $result.NasKeyStore
Assert-Path $result.EncryptedRecoveryManifest
Assert-Equal 'Key hashes' `
    (Get-FileHash $result.LocalKeyStore).Hash `
    (Get-FileHash $result.NasKeyStore).Hash
```

Decrypt the recovery manifest into a temporary directory, read the recovered password file, and run `keytool -list` against the NAS key copy. Delete the entire fixture in `finally`.

- [ ] **Step 2: Run and verify RED**

```powershell
pwsh -NoProfile -File supplemental/scripts/test-initialize-android-release-signing.ps1
```

Expected: FAIL because the initializer does not exist.

- [ ] **Step 3: Implement minimal provisioning**

The script must:

```powershell
param(
    [string]$LocalDirectory = "$env:LOCALAPPDATA\Pulse\signing\android",
    [string]$NasDirectory = 'Z:\Pulse-Secrets\Android',
    [string]$RecoverySheetPath,
    [string]$Alias = 'pulse-release',
    [string]$CredentialTarget = 'Pulse/AndroidReleaseRecovery',
    [switch]$SkipCredentialManager
)
```

Generate an RSA-4096 PKCS12 key valid for 36500 days, export the public certificate, calculate the certificate fingerprint, copy the key to NAS, encrypt a JSON credential manifest with an independent recovery password, compare hashes, decrypt once, and validate the recovered credentials with `keytool -list`. Existing key paths must cause a hard failure rather than overwrite.

- [ ] **Step 4: Run and verify GREEN**

```powershell
pwsh -NoProfile -File supplemental/scripts/test-initialize-android-release-signing.ps1
```

Expected: PASS; temporary local/NAS fixtures and plaintext files are removed.

### Task 4: Configure Gradle and build a verified Release APK

**Files:**

- Modify: `internal/site/android/app/build.gradle`
- Create: `supplemental/scripts/build-android-release.ps1`
- Create: `supplemental/scripts/test-build-android-release.ps1`
- Create after real provisioning: `internal/site/android/release-certificate.sha256`

- [ ] **Step 1: Write failing build and Gradle contracts**

Assert Gradle reads `pulseSigningPropertiesFile`, defines `signingConfigs.release`, assigns it only to `buildTypes.release`, and contains no password or repository-local keystore path. Assert the builder requires the fixed fingerprint file and emits `app-release.apk`.

- [ ] **Step 2: Run and verify RED**

```powershell
pwsh -NoProfile -File supplemental/scripts/test-build-android-release.ps1
```

Expected: FAIL because Gradle has no Release signing config and the builder does not exist.

- [ ] **Step 3: Implement Gradle signing**

Use the external properties path only:

```groovy
def pulseSigningPropertiesPath = providers.gradleProperty('pulseSigningPropertiesFile').orNull
def pulseSigningProperties = new Properties()
if (pulseSigningPropertiesPath != null) {
    file(pulseSigningPropertiesPath).withInputStream { pulseSigningProperties.load(it) }
}

signingConfigs {
    release {
        if (pulseSigningPropertiesPath != null) {
            storeFile file(pulseSigningProperties['storeFile'])
            storePassword pulseSigningProperties['storePassword']
            keyAlias pulseSigningProperties['keyAlias']
            keyPassword pulseSigningProperties['keyPassword']
        }
    }
}

gradle.taskGraph.whenReady { graph ->
    def requestsRelease = graph.allTasks.any { it.name.toLowerCase().contains('release') }
    if (requestsRelease && pulseSigningPropertiesPath == null) {
        throw new GradleException('Release builds require -PpulseSigningPropertiesFile outside the repository.')
    }
}
```

Assign `signingConfig signingConfigs.release` inside `buildTypes.release` only when the external file has loaded successfully. The Release task guard above ensures a direct `assembleRelease` cannot silently emit an unsigned package; Debug builds and unit tests remain secret-free.

- [ ] **Step 4: Implement build and verification order**

The builder accepts `-Version`, `-SigningPropertiesPath`, `-RepositoryRoot`, optional tool paths, and `-SkipWebSync` for isolated tests. It runs `android:sync`, `assembleRelease`, `apksigner verify --verbose --print-certs`, and `aapt2 dump badging`; then compares package, version, versionCode, absence of `application-debuggable`, and `internal/site/android/release-certificate.sha256` under the selected repository root. There is no fingerprint override parameter.

- [ ] **Step 5: Run and verify GREEN with a temporary test key**

```powershell
pwsh -NoProfile -File supplemental/scripts/test-build-android-release.ps1
```

Expected: PASS for the correct fixture and explicit failures for missing properties, wrong fingerprint and debuggable metadata.

### Task 5: Move local packaging and verification to Release APK

**Files:**

- Modify: `supplemental/scripts/publish-release-v1.ps1`
- Modify: `supplemental/scripts/verify-release-v1.ps1`
- Modify: `supplemental/scripts/test-publish-release-guard.ps1`
- Modify in the public repository only: `supplemental/scripts/package-public-release.ps1`
- Modify in the public repository only: `supplemental/scripts/test-package-public-release.ps1`

- [ ] **Step 1: Extend tests and verify RED**

Require:

```text
build-android-release.ps1
app/build/outputs/apk/release/app-release.apk
Test-AndroidReleaseApk
```

Reject `assembleDebug`, `/apk/debug/` and `app-debug.apk` from publish, package and verification scripts.

- [ ] **Step 2: Run the affected tests**

Expected: FAIL on current Debug paths.

- [ ] **Step 3: Replace Debug build and paths**

`publish-release-v1.ps1` receives `-AndroidSigningPropertiesPath`; a non-dry real release requires it. `package-public-release.ps1` defaults to the Release APK. `verify-release-v1.ps1` calls the shared APK verifier instead of checking metadata JSON alone.

- [ ] **Step 4: Run and verify GREEN**

```powershell
pwsh -NoProfile -File supplemental/scripts/test-publish-release-guard.ps1
pwsh -NoProfile -File supplemental/scripts/test-package-public-release.ps1
pwsh -NoProfile -File supplemental/scripts/test-build-android-release.ps1
```

### Task 6: Guard GitHub signed publishing

**Files:**

- Modify: `.github/workflows/public-release.yml`
- Modify: `.github/workflows/quality.yml`
- Modify: `supplemental/scripts/test-public-release-workflow.ps1`

- [ ] **Step 1: Write failing workflow assertions**

Require all four Android secrets, `environment: public-release`, `assembleRelease` through the shared builder, fingerprint verification before packaging, final repackaging in the publish job, and cleanup under `if: always()`. Assert no secret reference occurs before the publish job text offset.

- [ ] **Step 2: Run and verify RED**

```powershell
pwsh -NoProfile -File supplemental/scripts/test-public-release-workflow.ps1
```

Expected: FAIL because validation builds Debug APK and the publish job never signs or repackages Android.

- [ ] **Step 3: Keep validation secret-free**

Validation runs contract tests, Android unit tests and compile checks but does not create or upload a distributable public bundle. All Release artifacts are rebuilt from the exact checked-out tag only after the protected environment approval.

- [ ] **Step 4: Build and package signed APK after approval**

In the `publish` job, decode `${{ secrets.ANDROID_RELEASE_KEYSTORE_BASE64 }}` into `${{ runner.temp }}`, write the four-property file without echoing values, call `build-android-release.ps1`, rebuild the final public bundle, and run `verify-release-v1.ps1` before `gh release create`.

- [ ] **Step 5: Run and verify GREEN**

```powershell
pwsh -NoProfile -File supplemental/scripts/test-public-release-workflow.ps1
pwsh -NoProfile -File supplemental/scripts/audit-public-repository.ps1
```

### Task 7: Generate and recover the real signing identity

**Files outside Git:**

- Local: `%LOCALAPPDATA%\Pulse\signing\android`
- NAS: `Z:\Pulse-Secrets\Android`
- Temporary offline sheet: a user-visible local file deleted only after confirmation

- [ ] **Step 1: Confirm paths do not already contain a Release key**

Abort if any target key, recovery bundle or fingerprint file already exists; do not overwrite or rotate silently.

- [ ] **Step 2: Run the initializer once**

```powershell
pwsh -NoProfile -File supplemental/scripts/initialize-android-release-signing.ps1
```

Expected: local and NAS hashes match, encrypted recovery decrypts in a temporary directory, `keytool -list` succeeds, and the command prints only paths, hashes and fingerprint.

- [ ] **Step 3: Write the fixed public fingerprint**

Write the canonical uppercase fingerprint plus newline to `internal/site/android/release-certificate.sha256`. Never write password or Base64 key into Git.

- [ ] **Step 4: Pause for physical recovery confirmation**

Ask the user to print or transcribe the one-time recovery sheet. Continue only after explicit confirmation; then securely remove the temporary plaintext sheet while leaving the Windows Credential Manager entry.

### Task 8: Build and verify the real local Release APK

**Files:** no new secret files in Git.

- [ ] **Step 1: Build with the real external signing properties**

```powershell
pwsh -NoProfile -File supplemental/scripts/build-android-release.ps1 `
  -Version 1.0.6 `
  -SigningPropertiesPath "$env:LOCALAPPDATA\Pulse\signing\android\signing.properties"
```

- [ ] **Step 2: Independently verify**

Use `C:\Android\Sdk\build-tools\36.0.0\apksigner.bat verify --verbose --print-certs` and `aapt2.exe dump badging`. Expected: v2/v3 signature valid, fixed SHA-256 fingerprint, `site.gutenacht.pulse`, correct version and no `application-debuggable` line.

- [ ] **Step 3: Test upgrade boundary explicitly**

Document that Debug-signed `1.0.6-beta.1` cannot be upgraded in place. Do not attempt to weaken Android signature checks; the required one-time uninstall remains a release note.

### Task 9: Synchronize public-safe changes, advance beta version and configure GitHub Secrets

**Files:** shared files listed in the File Map.

- [ ] **Step 1: Apply shared changes to the public repository on `codex/android-release-signing`**

Copy only public-safe code, tests, fingerprint and documentation. Preserve public GHCR placeholders and private repository Harbor/FlyNAS values separately.

- [ ] **Step 2: Advance the public working version without publishing**

Run:

```powershell
pwsh -NoProfile -File supplemental/scripts/set-pulse-version.ps1 -Version 1.0.6-beta.2
pwsh -NoProfile -File supplemental/scripts/check-version-consistency.ps1 -Version 1.0.6-beta.2
```

Expected: Hub, Agent, Web and Android all report `1.0.6-beta.2`; Android `versionCode` remains `10006`. No tag or Release is created.

- [ ] **Step 3: Run public audit before any push**

```powershell
pwsh -NoProfile -File supplemental/scripts/audit-public-repository.ps1
git diff --check
```

- [ ] **Step 4: Configure Environment Secrets**

Use the authenticated GitHub session to write:

```text
ANDROID_RELEASE_KEYSTORE_BASE64
ANDROID_RELEASE_STORE_PASSWORD
ANDROID_RELEASE_KEY_ALIAS
ANDROID_RELEASE_KEY_PASSWORD
```

Do not display values after writing. Confirm only the four secret names and update timestamps in the `public-release` Environment.

- [ ] **Step 5: Run a no-publish workflow dispatch**

Expected: validation succeeds without reading signing secrets and no Release/tag/package is created.

### Task 10: Documentation, About history and final verification

**Files:**

- Modify: `docs/release-notes-next.md`
- Modify: `docs/public-release-runbook.md`
- Modify: `docs/public-installation-acceptance.md`
- Modify: `docs/release-deployment-runbook.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`
- Modify: `C:\Users\Nacht\.codex\memories\MEMORY.md`

- [ ] **Step 1: Record user-visible behavior and operational recovery**

Document the fixed fingerprint, secret names, NAS restore procedure, one-time beta.1 uninstall, no-key-rotation rule, and exact verification commands. About history separates Web/Hub, Android App, Agent/deployment and documentation/rules.

- [ ] **Step 2: Run full private repository verification**

```powershell
pwsh -NoProfile -File supplemental/scripts/test-android-signing-helpers.ps1
pwsh -NoProfile -File supplemental/scripts/test-initialize-android-release-signing.ps1
pwsh -NoProfile -File supplemental/scripts/test-build-android-release.ps1
pwsh -NoProfile -File supplemental/scripts/test-publish-release-guard.ps1
npm.cmd --prefix internal/site run check -- --max-diagnostics=200
npm.cmd --prefix internal/site run typecheck
npm.cmd --prefix internal/site test
npm.cmd --prefix internal/site run build
go vet -tags=testing ./...
go test -tags=testing -count=1 -timeout=10m ./...
pwsh -NoProfile -File supplemental/scripts/check-version-consistency.ps1 -Version 1.0.6
git diff --check
```

- [ ] **Step 3: Run full public repository verification**

```powershell
pwsh -NoProfile -File supplemental/scripts/test-android-signing-helpers.ps1
pwsh -NoProfile -File supplemental/scripts/test-initialize-android-release-signing.ps1
pwsh -NoProfile -File supplemental/scripts/test-build-android-release.ps1
pwsh -NoProfile -File supplemental/scripts/test-package-public-release.ps1
pwsh -NoProfile -File supplemental/scripts/test-public-release-workflow.ps1
pwsh -NoProfile -File supplemental/scripts/audit-public-repository.ps1
pwsh -NoProfile -File supplemental/scripts/check-version-consistency.ps1 -Version 1.0.6-beta.2
git diff --check
```

- [ ] **Step 4: Commit and push without creating a new release tag**

Commit private and public repositories separately. Push the public preparation branch, wait for `Quality`, `Public readiness` and `VulnCheck`, then fast-forward public `main` only after all succeed. Do not create `v1.0.6-beta.2` until a separate release authorization and full installation acceptance.
