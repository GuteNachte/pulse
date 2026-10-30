# Pulse Public Beta Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare Pulse for a safe, documented, contributor-friendly `1.0.6-beta.1` public beta without performing any external publication before explicit authorization.

**Architecture:** The work is split into five independently verifiable phase plans. Public-readiness auditing is the hard gate; distribution, documentation/demo, contributor workflow, and launch execution consume its approved output in that order.

**Tech Stack:** Git, PowerShell 7, Go, React/Vite, Playwright, VitePress, GitHub Actions, GitHub Releases, GHCR

---

## Plan Map

1. `docs/superpowers/plans/2026-07-25-public-readiness-audit.md`
2. `docs/superpowers/plans/2026-07-25-public-distribution.md`
3. `docs/superpowers/plans/2026-07-25-public-demo-and-docs.md`
4. `docs/superpowers/plans/2026-07-25-public-contribution-workflow.md`
5. `docs/superpowers/plans/2026-07-25-public-beta-launch.md`

## Dependency Order

```text
Public readiness audit
  -> public distribution
  -> demo and documentation
  -> contribution workflow
  -> beta launch
```

Distribution and documentation may be developed in parallel only after the current tree and full Git history pass the audit. No phase is allowed to push to GitHub, GHCR, Releases, Pages, Discussions, Issues, or external communities until its explicit authorization gate is satisfied.

### Task 1: Execute the public-readiness audit plan

**Files:** See phase plan 1.

- [ ] **Step 1: Complete every checkbox in phase plan 1**

Run the phase verification exactly as written. Expected: a committed audit toolchain, a reviewable report, no live secrets, and a written publish/no-publish decision.

- [ ] **Step 2: Stop if the audit decision is not `ready`**

Do not begin distribution work while any credential rotation, history rewrite, privacy cleanup, or license correction remains open.

### Task 2: Execute the public-distribution plan

**Files:** See phase plan 2.

- [ ] **Step 1: Complete local prerelease and packaging work**

Expected: `1.0.6-beta.1` is accepted by the version toolchain, public packages are reproducible, and dry-run verification passes without using external credentials.

- [ ] **Step 2: Pause at the external-account gate**

Obtain explicit authorization and GitHub repository access before creating a public repository, package, release, or secret.

### Task 3: Execute the demo and documentation plan

**Files:** See phase plan 3.

- [ ] **Step 1: Build the synthetic demo and documentation locally**

Expected: repeatable fictional data, automated screenshots, bilingual entry documentation, and a locally built static documentation site.

- [ ] **Step 2: Verify every image and page is free of private data**

Run both automated scanning and manual review before enabling Pages deployment.

### Task 4: Execute the contribution-workflow plan

**Files:** See phase plan 4.

- [ ] **Step 1: Complete repository-local governance and templates**

Expected: contribution, support, conduct, issue, discussion, PR, labels, and CI rules are understandable without private project knowledge.

- [ ] **Step 2: Pause before applying GitHub settings**

Branch protection, Private Vulnerability Reporting, labels, Discussions, and repository metadata require explicit account authorization.

### Task 5: Execute the beta-launch plan

**Files:** See phase plan 5.

- [ ] **Step 1: Complete the local launch rehearsal**

Expected: clean-instance install, upgrade, rollback, release notes, images, links, checksum, and support routes pass the launch checklist.

- [ ] **Step 2: Request final public-release authorization**

The authorization summary must state the repository visibility, exact version, public maintainer identity, artifacts, image names, documentation URL, communities, costs, known risks, and rollback path.

- [ ] **Step 3: Publish only after authorization**

Execute the release and community-posting sequence once, record URLs and checksums, and do not silently broaden the approved destinations.

## Final Verification

Run:

```powershell
go test -tags=testing -count=1 -timeout=10m ./...
npm.cmd --prefix internal/site test
npm.cmd --prefix internal/site run typecheck
npm.cmd --prefix internal/site run build
pwsh -NoProfile -File supplemental/scripts/audit-public-repository.ps1
pwsh -NoProfile -File supplemental/scripts/check-version-consistency.ps1 -Version 1.0.6-beta.1
git diff --check
git status --short
```

Expected: all commands exit 0; the final status contains only intentionally excluded local preview artifacts; published URLs are recorded only after the final authorization gate.
