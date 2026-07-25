# Pulse Public Contribution Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make feedback and code contribution understandable, low-friction, testable, and safe for outside users without granting private infrastructure access.

**Architecture:** Repository-local policy documents, structured forms, and CI define the contribution contract. GitHub-side settings are applied later through an audited script after explicit account authorization.

**Tech Stack:** Markdown, YAML, GitHub Actions, GitHub CLI, PowerShell 7

---

### Task 1: Add contribution, support and conduct documents

**Files:**
- Create: `CONTRIBUTING.md`
- Create: `CONTRIBUTING.en.md`
- Create: `CODE_OF_CONDUCT.md`
- Create: `SUPPORT.md`
- Create: `docs/developer-module-map.md`
- Create: `supplemental/scripts/test-public-contribution-docs.ps1`

- [ ] **Step 1: Write the failing document contract**

Assert that both contribution guides contain setup, tests, release notes, security, license, PR and no-private-data sections; support distinguishes Discussions, Issues and private security reports; module map lists `asset-center`, `network-topology`, `client-monitoring`, `maintenance` and Agent boundaries.

- [ ] **Step 2: Verify it fails**

Run `pwsh -NoProfile -File supplemental/scripts/test-public-contribution-docs.ps1`.

Expected: FAIL because required documents do not exist.

- [ ] **Step 3: Write concise contribution contracts**

State that contributions are provided under the repository license, no CLA is required, external developers never need private Harbor/FlyNAS access, behavior changes need focused tests and release records, and sensitive reports must not be posted publicly.

- [ ] **Step 4: Verify and commit**

```powershell
pwsh -NoProfile -File supplemental/scripts/test-public-contribution-docs.ps1
git add CONTRIBUTING.md CONTRIBUTING.en.md CODE_OF_CONDUCT.md SUPPORT.md docs/developer-module-map.md supplemental/scripts/test-public-contribution-docs.ps1
git commit -m "docs: define public contribution and support workflow"
```

### Task 2: Add equivalent Linux and macOS development startup

**Files:**
- Create: `supplemental/scripts/run-hub-dev.sh`
- Create: `supplemental/scripts/test-run-hub-dev.sh`
- Modify: `docs/local-dev-runbook.md`
- Modify: `CONTRIBUTING.md`
- Modify: `CONTRIBUTING.en.md`

- [ ] **Step 1: Write the failing shell contract**

The test runs in an isolated temporary directory and checks prerequisite detection, temporary log/data paths, loopback/LAN binding output, Hub `8090`, Vite `5173`, cleanup on interruption, and a `--check` mode that starts no process.

- [ ] **Step 2: Verify it fails**

Run `bash supplemental/scripts/test-run-hub-dev.sh`.

Expected: FAIL because `run-hub-dev.sh` does not exist.

- [ ] **Step 3: Implement parity with the Windows launcher**

The script uses `set -euo pipefail`, discovers the repository root from its own path, validates Go/Node/npm, reuses the same Hub and Vite commands as `run-hub-dev.ps1`, binds only documented interfaces, waits for both health endpoints, prints local/LAN URLs, and traps `EXIT INT TERM` to stop only child processes it started.

- [ ] **Step 4: Verify and commit**

```bash
bash supplemental/scripts/test-run-hub-dev.sh
bash supplemental/scripts/run-hub-dev.sh --check
git add supplemental/scripts/run-hub-dev.sh supplemental/scripts/test-run-hub-dev.sh docs/local-dev-runbook.md CONTRIBUTING.md CONTRIBUTING.en.md
git commit -m "feat: add Unix development launcher"
```

### Task 3: Complete structured Issue and Discussion intake

**Files:**
- Modify: `.github/ISSUE_TEMPLATE/bug_report.yml`
- Modify: `.github/ISSUE_TEMPLATE/feature_request.yml`
- Modify: `.github/ISSUE_TEMPLATE/config.yml`
- Create: `.github/ISSUE_TEMPLATE/deployment_help.yml`
- Create: `.github/ISSUE_TEMPLATE/device_compatibility.yml`
- Create: `.github/ISSUE_TEMPLATE/documentation.yml`
- Modify: `.github/DISCUSSION_TEMPLATE/support.yml`
- Modify: `.github/DISCUSSION_TEMPLATE/ideas.yml`
- Create: `.github/DISCUSSION_TEMPLATE/showcase.yml`
- Test: `supplemental/scripts/test-github-community-templates.ps1`

- [ ] **Step 1: Write failing template validation**

Parse every YAML file and assert required version, deployment, platform, reproduction, redaction and consent fields. Assert logs warn users to remove Tokens, domains, IPs and account data.

- [ ] **Step 2: Verify it fails**

Expected: FAIL because three Issue categories and showcase discussion are missing.

- [ ] **Step 3: Implement forms without duplication**

Bug reports remain for reproducible defects; deployment help routes to Discussions when enabled; compatibility reports collect device/OS/architecture/Agent facts; documentation reports require exact page URL. Keep blank Issues disabled. Every template uses concise Chinese and English labels/descriptions in the same form so international contributors do not need a separate duplicate template.

- [ ] **Step 4: Verify and commit**

```powershell
pwsh -NoProfile -File supplemental/scripts/test-github-community-templates.ps1
git add .github supplemental/scripts/test-github-community-templates.ps1
git commit -m "feat: structure public feedback intake"
```

### Task 4: Strengthen Pull Request quality gates

**Files:**
- Modify: `.github/pull_request_template.md`
- Modify: `.github/workflows/quality.yml`
- Modify: `.github/workflows/vulncheck.yml`
- Create: `.github/labeler.yml`
- Create: `.github/workflows/labeler.yml`
- Create: `supplemental/scripts/test-github-quality-contract.ps1`

- [ ] **Step 1: Write the failing workflow contract**

Assert full-history checkout for audit jobs, pinned permissions, Go tests, Web tests, typecheck, build, public audit, docs check when docs change, and PR checkboxes for tests, release notes, About, privacy and rollback.

- [ ] **Step 2: Verify it fails**

Expected: FAIL because public audit, docs check, labeler and expanded PR fields are absent.

- [ ] **Step 3: Implement the checks**

Keep current Go/Web jobs, add path-aware docs and public-readiness jobs, pin workflow permissions to read-only except label assignment, and label Pull Requests by module paths. Do not grant package or release permissions to PR workflows.

- [ ] **Step 4: Verify and commit**

```powershell
pwsh -NoProfile -File supplemental/scripts/test-github-quality-contract.ps1
go test -tags=testing -count=1 -timeout=10m ./...
npm.cmd --prefix internal/site test
npm.cmd --prefix internal/site run typecheck
git add .github supplemental/scripts/test-github-quality-contract.ps1
git commit -m "ci: enforce public contribution quality gates"
```

### Task 5: Prepare the initial contributor task backlog

**Files:**
- Create: `docs/public-contributions/good-first-issues.md`
- Create: `docs/public-contributions/help-wanted.md`
- Create: `supplemental/scripts/create-public-contributor-issues.ps1`
- Create: `supplemental/scripts/test-create-public-contributor-issues.ps1`

- [ ] **Step 1: Define ten bounded starter issues locally**

Each issue includes outcome, exact files or module, out-of-scope behavior, acceptance criteria, verification command, estimated difficulty and required labels. Choose documentation, focused tests and isolated UI/data helpers; exclude authentication, backup restore, migrations and Agent privilege handling from `good first issue`.

- [ ] **Step 2: Add a dry-run issue creator**

Parse the Markdown entries, validate unique titles and required sections, print the `gh issue create` operations, and require both `-Apply` and `-ConfirmRepository` before mutation.

- [ ] **Step 3: Verify and commit**

```powershell
pwsh -NoProfile -File supplemental/scripts/test-create-public-contributor-issues.ps1
pwsh -NoProfile -File supplemental/scripts/create-public-contributor-issues.ps1 -DryRun
git add docs/public-contributions supplemental/scripts/create-public-contributor-issues.ps1 supplemental/scripts/test-create-public-contributor-issues.ps1
git commit -m "docs: prepare first public contributor tasks"
```

### Task 6: Prepare GitHub settings as an audited script

**Files:**
- Create: `supplemental/scripts/configure-public-github.ps1`
- Create: `supplemental/scripts/test-configure-public-github.ps1`
- Create: `docs/public-github-settings.md`

- [ ] **Step 1: Write a dry-run-first test**

Assert the script defaults to `-DryRun`, refuses to mutate when unauthenticated, discovers repository identity through `gh repo view`, and prints every API operation before execution.

- [ ] **Step 2: Implement explicit apply semantics**

Require both `-Apply` and `-ConfirmRepository <discovered nameWithOwner>`. Configure Discussions, Private Vulnerability Reporting, squash merge, branch protection, required checks, labels, topics and social preview metadata. Do not create or change repository visibility.

- [ ] **Step 3: Verify locally**

```powershell
pwsh -NoProfile -File supplemental/scripts/test-configure-public-github.ps1
pwsh -NoProfile -File supplemental/scripts/configure-public-github.ps1 -DryRun
```

Expected: tests pass; dry run lists actions and performs no mutation.

- [ ] **Step 4: Commit**

```powershell
git add supplemental/scripts/configure-public-github.ps1 supplemental/scripts/test-configure-public-github.ps1 docs/public-github-settings.md
git commit -m "feat: prepare guarded GitHub community settings"
```

### Task 7: Account authorization gate

Before using `-Apply`, present the discovered repository, settings diff, required scopes, public maintainer identity and rollback commands. Apply only after explicit authorization.
