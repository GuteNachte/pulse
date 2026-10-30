# Pulse Public Beta Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rehearse, authorize, publish, announce and monitor the `1.0.6-beta.1` public beta through one controlled launch sequence.

**Architecture:** A launch checklist gathers immutable evidence from the prior four phases. Announcement copy is prepared locally; a guarded release script publishes only approved destinations and records resulting URLs for follow-up.

**Tech Stack:** Markdown, PowerShell 7, GitHub CLI, Docker, GitHub Releases, GHCR, GitHub Discussions

---

### Task 1: Create the launch evidence checklist

**Files:**
- Create: `docs/public-launch/beta-checklist.md`
- Create: `docs/public-launch/known-limitations.md`
- Create: `supplemental/scripts/verify-public-beta-launch.ps1`
- Create: `supplemental/scripts/test-verify-public-beta-launch.ps1`

- [ ] **Step 1: Write the failing launch contract**

Require audit `ready`, clean install, upgrade, backup, restore, rollback, image manifests, checksums, version parity, docs build, screenshot audit, support routes and known limitations.

- [ ] **Step 2: Verify it fails**

Run `pwsh -NoProfile -File supplemental/scripts/test-verify-public-beta-launch.ps1`.

Expected: FAIL because launch evidence and verifier do not exist.

- [ ] **Step 3: Implement evidence validation**

The verifier accepts `-Version 1.0.6-beta.1` and `-EvidenceRoot`; validates files and machine-readable manifests; calls existing release verification; and returns a nonzero exit code for unchecked checklist items or stale version references.

- [ ] **Step 4: Verify and commit**

```powershell
pwsh -NoProfile -File supplemental/scripts/test-verify-public-beta-launch.ps1
git add docs/public-launch supplemental/scripts/verify-public-beta-launch.ps1 supplemental/scripts/test-verify-public-beta-launch.ps1
git commit -m "test: define public beta launch gate"
```

### Task 2: Prepare bilingual announcement material

**Files:**
- Create: `docs/public-launch/announcement-zh.md`
- Create: `docs/public-launch/announcement-en.md`
- Create: `docs/public-launch/release-notes-1.0.6-beta.1.md`
- Create: `docs/public-launch/community-matrix.md`

- [ ] **Step 1: Write announcement content from verified facts**

Chinese copy targets NAS, 飞牛, Homelab and family-network users. English copy targets self-hosted and homelab users. Both include product identity, screenshots/video, three-minute start, beta limits, privacy model, feedback links, contribution links and rollback.

- [ ] **Step 2: Define destinations without posting**

The matrix records audience, language, copy variant, account owner, posting permission, URL after posting and follow-up date for GitHub, 飞牛/NAS communities, V2EX, NodeSeek, Bilibili, `r/selfhosted`, `r/homelab` and Show HN. Status begins as `not-authorized`.

- [ ] **Step 3: Validate links and private data**

```powershell
npm.cmd --prefix docs-site run check
pwsh -NoProfile -File supplemental/scripts/audit-public-repository.ps1 -SkipHistoryScan
```

Expected: all local content passes; no post is sent.

- [ ] **Step 4: Commit**

```powershell
git add docs/public-launch
git commit -m "docs: prepare public beta launch material"
```

### Task 3: Run clean-install, upgrade and rollback rehearsals

**Files:**
- Modify: `docs/public-launch/beta-checklist.md`
- Modify: `docs/production-acceptance-evidence.md`
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`

- [ ] **Step 1: Build and verify all components**

```powershell
go test -tags=testing -count=1 -timeout=10m ./...
npm.cmd --prefix internal/site test
npm.cmd --prefix internal/site run typecheck
npm.cmd --prefix internal/site run build
pwsh -NoProfile -File supplemental/scripts/check-version-consistency.ps1 -Version 1.0.6-beta.1
pwsh -NoProfile -File supplemental/scripts/verify-public-beta-launch.ps1 -Version 1.0.6-beta.1 -EvidenceRoot build/public-release/1.0.6-beta.1
```

Expected: PASS.

- [ ] **Step 2: Test a disposable clean deployment**

Use a temporary empty data directory, initialize an admin, attach an Agent, import the demo asset package, create and restore a backup, then uninstall. Never point rehearsal commands at the current `pulse_data` or production FlyNAS data.

- [ ] **Step 3: Test upgrade and rollback**

Upgrade a copied fixture from `1.0.5` to `1.0.6-beta.1`, verify core collections and files, then restore the pre-upgrade backup and run the previous version. Record commands, hashes and health results.

- [ ] **Step 4: Commit evidence**

```powershell
git add docs/public-launch/beta-checklist.md docs/production-acceptance-evidence.md docs/release-notes-next.md internal/site/src/components/routes/settings/release-history.ts
git commit -m "docs: record public beta rehearsal evidence"
```

### Task 4: Final authorization summary

- [ ] **Step 1: Present one concise approval request**

Include exact repository visibility and slug, maintainer display name, version/tag, GHCR image names, artifacts and hashes, Pages URL, community destinations, required account permissions, expected fees, known limitations, privacy report, release rollback, and post rollback.

- [ ] **Step 2: Wait for explicit approval**

No external mutation occurs before approval. A partial approval applies only to named destinations.

### Task 5: Publish and record the beta

**Files:**
- Modify: `docs/public-launch/community-matrix.md`
- Modify: `docs/public-launch/beta-checklist.md`

- [ ] **Step 1: Publish code and artifacts**

Push the audited history, enable approved repository settings, run the protected public release workflow, verify GitHub Release and GHCR digests, and deploy Pages.

- [ ] **Step 2: Publish approved announcements**

Post only to destinations included in the authorization. Use native formatting but do not change claims, links or privacy statements.

- [ ] **Step 3: Record immutable results**

Save public URLs, timestamps, release ID, image digests, artifact hashes and posting URLs. Do not store external account tokens.

- [ ] **Step 4: Verify the public journey**

From a signed-out browser, verify project introduction, three-minute deployment, documentation, downloads, GHCR pull, Discussions, Issue forms, contribution guide and private security-report instructions.

- [ ] **Step 5: Commit launch records**

```powershell
git add docs/public-launch/community-matrix.md docs/public-launch/beta-checklist.md
git commit -m "docs: record public beta launch"
```

### Task 6: Establish the first 30-day feedback cycle

**Files:**
- Create: `docs/public-launch/30-day-review.md`

- [ ] **Step 1: Record privacy-preserving metrics**

Track successful deployments voluntarily reported, actionable Issues, external Pull Requests, supported operating systems/NAS types, Release downloads and GHCR pulls. Do not add application telemetry.

- [ ] **Step 2: Publish a two-week development update**

Summarize fixed, active and help-wanted items in GitHub Discussions, then update the local review document with the public URL.

- [ ] **Step 3: Review at day 30**

Compare results with the design targets, document support burden and release risks, and decide whether to continue beta, publish another prerelease, or prepare stable `1.0.6`.
