# Android Release Integrity Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the merge-blocking integrity gaps found during the `1.0.6-beta.2` Android release-signing review without publishing any artifact.

**Architecture:** Keep validation secret-free, pass an immutable validated commit SHA into the protected publish job, and make every external process fail closed. Treat the packaged APK as the release object of record and verify its version, signer set, v2 signature, and certificate directly before upload.

**Tech Stack:** GitHub Actions, PowerShell 7, Gradle, Android `apksigner`/`aapt2`, Pester-style repository scripts.

---

### Task 1: Bind publishing to the validated commit

**Files:**
- Modify: `.github/workflows/public-release.yml`
- Modify: `supplemental/scripts/test-public-release-workflow.ps1`

- [x] Add a failing workflow contract requiring a `validated_sha` output, checkout by that SHA, tag-to-SHA verification after approval, and image metadata based on the same SHA.
- [x] Run `pwsh -NoProfile -File supplemental/scripts/test-public-release-workflow.ps1` and confirm it fails on the missing immutable binding.
- [x] Output `git rev-parse HEAD` from validate, checkout `needs.validate.outputs.validated_sha`, force-fetch the expected tag, and reject any tag target that differs from the validated SHA.
- [x] Re-run the contract and confirm it passes.

### Task 2: Make every nested PowerShell contract fail fast

**Files:**
- Modify: `.github/workflows/public-release.yml`
- Modify: `.github/workflows/quality.yml`
- Modify: `supplemental/scripts/test-public-release-workflow.ps1`

- [x] Add a failing contract that requires each nested `pwsh` invocation to be followed immediately by `if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }`.
- [x] Confirm the contract fails against the current grouped calls.
- [x] Add the exit-code gate after every validate, Quality Android, and publish Agent restore invocation.
- [x] Re-run the contract and confirm it passes.

### Task 3: Require one signer and a verified v2 signature

**Files:**
- Modify: `supplemental/scripts/test-android-signing-helpers.ps1`
- Modify: `supplemental/scripts/android-signing-helpers.ps1`

- [x] Add failing fixtures for v3-only output and output containing a second signer.
- [x] Run the helper test and confirm both fixtures are incorrectly accepted before the fix.
- [x] Require `Verified using v2 scheme ...: true`, exactly one certificate digest, signer number `1`, and the fixed fingerprint.
- [x] Re-run the helper test and confirm both negative fixtures are rejected.

### Task 4: Verify the APK inside the public bundle

**Files:**
- Modify: `supplemental/scripts/test-package-public-release.ps1`
- Modify: `supplemental/scripts/verify-release-v1.ps1`

- [x] Add a failing test proving public bundle verification targets the bundle APK rather than the Android build-tree APK.
- [x] Run the package/verification test and confirm the source-tree path is still used.
- [x] Call `Test-AndroidReleaseApk` with the APK resolved from `PublicReleaseDirectory` and keep checksum validation as an independent gate.
- [x] Re-run the test and confirm the bundle path is verified.

### Task 5: Fail closed on signing-file permissions

**Files:**
- Modify: `.github/workflows/public-release.yml`
- Modify: `supplemental/scripts/test-public-release-workflow.ps1`

- [x] Add a failing workflow contract requiring a checked `chmod 600` result before writing `PULSE_ANDROID_SIGNING_PROPERTIES`.
- [x] Confirm the contract fails on the unchecked command.
- [x] Exit immediately when `chmod` returns non-zero.
- [x] Re-run the contract and confirm it passes.

### Task 6: Remove all partial signing outputs after initialization failure

**Files:**
- Modify: `supplemental/scripts/test-initialize-android-release-signing.ps1`
- Modify: `supplemental/scripts/initialize-android-release-signing.ps1`

- [x] Add a failing test that creates a partial target before a simulated command failure and asserts every precomputed target is removed.
- [x] Confirm the partial file remains before the fix.
- [x] On failure, delete the complete precomputed target list and remove a newly written Credential Manager entry when applicable.
- [x] Re-run the initialization test and confirm no sensitive partial file remains.

### Task 7: Make Android versionCode explicitly monotonic

**Files:**
- Create: `internal/site/android/version-code.txt`
- Modify: `internal/site/android/app/build.gradle`
- Modify: `supplemental/scripts/android-signing-helpers.ps1`
- Modify: `supplemental/scripts/build-android-release.ps1`
- Modify: `supplemental/scripts/check-version-consistency.ps1`
- Modify: related signing/version tests

- [x] Add failing tests showing prerelease versions cannot safely derive a reusable `versionCode` from only major/minor/patch.
- [x] Introduce one explicit integer source for Android `versionCode` and set `1.0.6-beta.2` to `1000602`.
- [x] Pass the explicit code through build and APK verification; reject mismatches and non-positive values.
- [x] Re-run signing and version-consistency tests.

### Task 8: Correct documentation and run the full gate

**Files:**
- Modify: `docs/public-release-runbook.md`
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`

- [x] Correct `publish=false` documentation: it validates and compiles without producing a signed public bundle.
- [x] Record all integrity hardening in release notes and About history.
- [x] Run workflow, signing, initialization, package, audit, Biome, build, version, and `git diff --check` gates.
- [ ] Commit and push only after all gates pass, then wait for PR checks before merging.
