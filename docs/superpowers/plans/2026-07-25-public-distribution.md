# Pulse Public Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce and verify `1.0.6-beta.1` GitHub Release artifacts and GHCR images while retaining the private Harbor target and preventing unapproved publication.

**Architecture:** Prerelease parsing is centralized in the existing release helpers. Existing build scripts remain the source of artifacts; a new GitHub workflow supplies GHCR destinations, creates checksums, and publishes only from an approved tag environment.

**Tech Stack:** PowerShell 7, Go, Gradle, Docker Buildx, GitHub Actions, GHCR, GitHub Releases

---

### Task 1: Support explicit prerelease versions consistently

**Files:**
- Modify: `supplemental/scripts/release-script-helpers.ps1`
- Modify: `supplemental/scripts/check-version-consistency.ps1`
- Modify: `supplemental/scripts/publish-release-v1.ps1`
- Modify: `supplemental/scripts/verify-release-v1.ps1`
- Modify: `supplemental/scripts/test-publish-release-guard.ps1`
- Test: `supplemental/scripts/test-prerelease-version.ps1`

- [ ] **Step 1: Write failing prerelease tests**

Test `1.0.6-beta.1` as valid, `latest` and `1.0.6-beta` as invalid, Android `versionName` as the full prerelease, and Android `versionCode` as `10006`:

```powershell
$parsed = Resolve-PulseVersion -Version "1.0.6-beta.1"
Assert-Equal $parsed.BaseVersion "1.0.6"
Assert-Equal $parsed.AndroidVersionCode 10006
Assert-Equal $parsed.IsPrerelease $true
```

- [ ] **Step 2: Verify the test fails**

Run `pwsh -NoProfile -File supplemental/scripts/test-prerelease-version.ps1`.

Expected: FAIL because `Resolve-PulseVersion` does not exist and the current validator only accepts three numeric components.

- [ ] **Step 3: Implement one parser**

Add `Resolve-PulseVersion` to `release-script-helpers.ps1` with the accepted pattern:

```powershell
'^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?<suffix>-(?:alpha|beta|rc)\.[1-9]\d*)?$'
```

Return `BaseVersion`, `FullVersion`, `AndroidVersionCode`, and `IsPrerelease`. All version scripts call this function instead of duplicating parsing.

- [ ] **Step 4: Verify and commit**

```powershell
pwsh -NoProfile -File supplemental/scripts/test-prerelease-version.ps1
pwsh -NoProfile -File supplemental/scripts/test-publish-release-guard.ps1
git add supplemental/scripts
git commit -m "feat: support explicit prerelease versions"
```

### Task 2: Apply the prerelease version across all version sources

**Files:**
- Create: `supplemental/scripts/set-pulse-version.ps1`
- Create: `supplemental/scripts/test-set-pulse-version.ps1`
- Modify: version-bearing files enumerated by `supplemental/scripts/check-version-consistency.ps1`

- [ ] **Step 1: Write the failing version-update contract**

Copy the version-bearing files to a temporary fixture, run the updater with `1.0.6-beta.1`, and assert that package, lockfile, Go, Makefile, Docker, Android, release script and documentation sources agree while Android `versionCode` remains `10006`.

- [ ] **Step 2: Verify the test fails**

Run `pwsh -NoProfile -File supplemental/scripts/test-set-pulse-version.ps1`.

Expected: FAIL because the centralized updater does not exist.

- [ ] **Step 3: Implement a table-driven updater**

Reuse `Resolve-PulseVersion`. Each version source has one exact regex and replacement; abort when a rule matches zero or more than the expected number of locations. Run the consistency check after writing and restore all files on failure.

- [ ] **Step 4: Apply the prerelease version and verify**

```powershell
pwsh -NoProfile -File supplemental/scripts/set-pulse-version.ps1 -Version 1.0.6-beta.1
pwsh -NoProfile -File supplemental/scripts/check-version-consistency.ps1 -Version 1.0.6-beta.1
```

Expected: both commands pass and all four components report the same prerelease.

- [ ] **Step 5: Commit**

```powershell
git add supplemental/scripts internal/site/package.json internal/site/package-lock.json pulse.go Makefile internal/dockerfile_* internal/site/android docs
git commit -m "build: set Pulse 1.0.6 beta version"
```

### Task 3: Build a public release bundle without publishing

**Files:**
- Create: `supplemental/scripts/package-public-release.ps1`
- Create: `supplemental/scripts/test-package-public-release.ps1`
- Modify: `supplemental/scripts/publish-release-v1.ps1`
- Modify: `supplemental/scripts/verify-release-v1.ps1`

- [ ] **Step 1: Write the failing package contract**

Assert that a dry-run output directory contains Windows Agent, Android APK, SHA256SUMS, public Compose files, release manifest, licenses, and no private Harbor hostname.

- [ ] **Step 2: Verify it fails**

Expected: FAIL because the public package script and manifest do not exist.

- [ ] **Step 3: Implement deterministic packaging**

The script accepts `-Version`, `-HubImage`, `-AgentImage`, and `-OutputDirectory`; validates inputs with `Resolve-PulseVersion`; copies only allowlisted artifacts; generates SHA256 with `Get-FileHash`; and writes `release-manifest.json` containing version, image names, artifact paths, hashes, and build timestamp.

Public Compose files use the image names passed into the script. Private Harbor remains available only when explicitly passed by internal release commands.

- [ ] **Step 4: Run the dry-run package test**

```powershell
pwsh -NoProfile -File supplemental/scripts/test-package-public-release.ps1
```

Expected: PASS and no network access.

- [ ] **Step 5: Commit**

```powershell
git add supplemental/scripts/package-public-release.ps1 supplemental/scripts/test-package-public-release.ps1 supplemental/scripts/publish-release-v1.ps1 supplemental/scripts/verify-release-v1.ps1
git commit -m "feat: package public release artifacts"
```

### Task 4: Add guarded GHCR and GitHub Release automation

**Files:**
- Create: `.github/workflows/public-release.yml`
- Create: `docs/public-release-runbook.md`
- Modify: `docs/release-deployment-runbook.md`
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`

- [ ] **Step 1: Add a no-publish validation job**

The workflow triggers on tags matching `v*.*.*-*.*` and `workflow_dispatch`. Its first job checks that the tag equals `v${packageVersion}`, the audit report status is `ready`, the tree is clean, and all quality/version checks pass.

- [ ] **Step 2: Add least-privilege publishing jobs**

Use `packages: write`, `contents: write`, and an environment named `public-release`. Derive lowercase image ownership from `${{ github.repository_owner }}` at runtime; do not hardcode an unapproved account. Build and push `pulse-hub` and `pulse-agent`, then attach the packaged artifacts and checksums to a prerelease.

- [ ] **Step 3: Document rollback and authorization**

The runbook must state that configuring the `public-release` environment, creating a tag, enabling packages, or making the repository public requires explicit user authorization. Failed releases are removed or superseded without deleting local safety artifacts.

- [ ] **Step 4: Validate locally**

```powershell
pwsh -NoProfile -File supplemental/scripts/check-version-consistency.ps1 -Version 1.0.6-beta.1
pwsh -NoProfile -File supplemental/scripts/package-public-release.ps1 -Version 1.0.6-beta.1 -HubImage ghcr.io/local-validation/pulse-hub:1.0.6-beta.1 -AgentImage ghcr.io/local-validation/pulse-agent:1.0.6-beta.1 -OutputDirectory build/public-release/1.0.6-beta.1
pwsh -NoProfile -File supplemental/scripts/verify-release-v1.ps1 -Version 1.0.6-beta.1 -SkipRegistry
git diff --check
```

Expected: all checks pass without pushing any image or release.

- [ ] **Step 5: Commit**

```powershell
git add .github/workflows/public-release.yml docs/public-release-runbook.md docs/release-deployment-runbook.md docs/release-notes-next.md internal/site/src/components/routes/settings/release-history.ts
git commit -m "ci: prepare guarded public prereleases"
```

### Task 5: Keep the private Gitea mirror reproducible

**Files:**
- Create: `supplemental/scripts/sync-private-mirror.ps1`
- Create: `supplemental/scripts/test-sync-private-mirror.ps1`
- Modify: `docs/public-release-runbook.md`

- [ ] **Step 1: Write a dry-run mirror test**

Use two temporary bare repositories and assert the script fetches the public source, displays the exact refs to update, defaults to `-DryRun`, and refuses to mirror uncommitted work or a repository whose audit status is not `ready`.

- [ ] **Step 2: Implement explicit mirror application**

Require `-Apply`, `-SourceRemote`, `-MirrorRemote`, and `-ConfirmMirrorUrl`. Push branches and tags with `--prune` only after the dry-run ref list is accepted. Never copy GitHub Secrets, Actions environments, Issues, Discussions or Packages into Gitea.

- [ ] **Step 3: Verify and commit**

```powershell
pwsh -NoProfile -File supplemental/scripts/test-sync-private-mirror.ps1
git add supplemental/scripts/sync-private-mirror.ps1 supplemental/scripts/test-sync-private-mirror.ps1 docs/public-release-runbook.md
git commit -m "feat: guard private repository mirroring"
```

### Task 6: External authorization gate

- [ ] **Step 1: Present the exact external change summary**

Report repository slug discovered by `gh repo view`, visibility, GHCR package names, release version, artifacts, required permissions, absence of fees, and rollback commands.

- [ ] **Step 2: Wait for explicit authorization**

Do not run `gh repo create`, `gh repo edit --visibility public`, `git push` to a new public remote, `docker push`, `gh release create`, or configure repository secrets before approval.
