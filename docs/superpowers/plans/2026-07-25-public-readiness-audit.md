# Pulse Public Readiness Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that the current tree and Git history can be published without exposing credentials, private infrastructure, household data, or incomplete license attribution.

**Architecture:** A repository-owned PowerShell audit coordinates deterministic path/pattern checks and Gitleaks history scanning. A human-readable report records findings and remediation; publishing remains blocked until the report status is `ready`.

**Tech Stack:** PowerShell 7, Git, Gitleaks, GitHub Actions, Markdown

---

### Task 1: Add a testable repository audit contract

**Files:**
- Create: `supplemental/scripts/public-audit-rules.json`
- Create: `supplemental/scripts/test-public-repository-audit.ps1`
- Modify: `.gitignore`

- [ ] **Step 1: Write the failing contract test**

The test creates a temporary repository containing one allowed documentation example and one forbidden credential-shaped value, invokes the audit with `-RepositoryRoot`, and asserts the forbidden fixture fails while the clean fixture passes:

```powershell
$result = & $auditScript -RepositoryRoot $fixtureRoot -SkipHistoryScan 2>&1
if ($LASTEXITCODE -eq 0) { throw "audit accepted a credential fixture" }
Set-Content -LiteralPath $fixtureFile -Value 'TOKEN="example-redacted"'
& $auditScript -RepositoryRoot $fixtureRoot -SkipHistoryScan
if ($LASTEXITCODE -ne 0) { throw "audit rejected the clean fixture" }
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
pwsh -NoProfile -File supplemental/scripts/test-public-repository-audit.ps1
```

Expected: FAIL because `audit-public-repository.ps1` does not exist.

- [ ] **Step 3: Add explicit rules**

`public-audit-rules.json` must define forbidden tracked paths (`pulse_data`, database, backup, log, generated credential, private-key and local media patterns), forbidden private endpoints (`192.0.2.20:3005`, `registry.example.com` in public-facing files), and allowed locations where historical/private deployment documentation is intentionally retained during remediation.

Do not add real secrets to the rule fixture. Use only reserved examples such as `example.com`, `192.0.2.0/24`, `198.51.100.0/24`, and `203.0.113.0/24`.

- [ ] **Step 4: Ignore audit output**

Add:

```gitignore
.public-audit/
```

- [ ] **Step 5: Commit the failing contract**

```powershell
git add .gitignore supplemental/scripts/public-audit-rules.json supplemental/scripts/test-public-repository-audit.ps1
git commit -m "test: define public repository audit contract"
```

### Task 2: Implement current-tree and history scanning

**Files:**
- Create: `supplemental/scripts/audit-public-repository.ps1`
- Create: `.gitleaks.toml`
- Modify: `supplemental/scripts/test-public-repository-audit.ps1`

- [ ] **Step 1: Implement deterministic tree checks**

The script must expose these parameters and stop on any finding:

```powershell
param(
    [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")),
    [string]$OutputDirectory = ".public-audit",
    [switch]$SkipHistoryScan
)
$ErrorActionPreference = "Stop"
```

Use `git ls-files` as the source of tracked paths, parse `public-audit-rules.json` with `ConvertFrom-Json`, write machine-readable findings to `.public-audit/findings.json`, and return exit code 1 when findings are non-empty.

- [ ] **Step 2: Integrate Gitleaks without weakening failures**

When `-SkipHistoryScan` is absent, require `gitleaks` on `PATH` and run:

```powershell
gitleaks git $RepositoryRoot --config (Join-Path $RepositoryRoot ".gitleaks.toml") --redact --report-format json --report-path $historyReport
```

The config may allow known hashes and reserved documentation values, but it must not allow entire source or documentation directories.

- [ ] **Step 3: Verify red-green behavior**

Run the contract test. Expected: the forbidden fixture fails, the clean fixture passes, and the test exits 0.

- [ ] **Step 4: Commit the implementation**

```powershell
git add .gitleaks.toml supplemental/scripts/audit-public-repository.ps1 supplemental/scripts/test-public-repository-audit.ps1
git commit -m "feat: audit repository privacy before publication"
```

### Task 3: Correct public-facing ownership and security policy

**Files:**
- Modify: `LICENSE`
- Modify: `THIRD_PARTY_NOTICES.md`
- Modify: `SECURITY.md`
- Create: `docs/public-security-and-privacy.md`
- Test: `supplemental/scripts/test-public-repository-audit.ps1`

- [ ] **Step 1: Extend the contract test**

Assert that `LICENSE` retains `Copyright (c) 2024 henrygd`, includes a separate Pulse contributors copyright line, `THIRD_PARTY_NOTICES.md` lists Homelable, and `SECURITY.md` directs vulnerabilities to GitHub Private Vulnerability Reporting without publishing an unapproved personal email.

- [ ] **Step 2: Run the test and verify it fails**

Expected: FAIL on the missing Pulse contributors line and incomplete reporting route.

- [ ] **Step 3: Update policy and attribution**

Keep the upstream MIT notice unchanged, add a separate copyright statement for new Pulse modifications, document the relationship between `LICENSE` and `THIRD_PARTY_NOTICES.md`, and state that telemetry is disabled by default and user data remains in the configured `pulse_data` directory.

- [ ] **Step 4: Run the test and audit**

```powershell
pwsh -NoProfile -File supplemental/scripts/test-public-repository-audit.ps1
pwsh -NoProfile -File supplemental/scripts/audit-public-repository.ps1 -SkipHistoryScan
```

Expected: PASS.

- [ ] **Step 5: Commit policy changes**

```powershell
git add LICENSE THIRD_PARTY_NOTICES.md SECURITY.md docs/public-security-and-privacy.md supplemental/scripts/test-public-repository-audit.ps1
git commit -m "docs: define public security and license boundaries"
```

### Task 4: Add CI enforcement and produce the audit decision

**Files:**
- Create: `.github/workflows/public-readiness.yml`
- Create: `docs/public-readiness-report.md`
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`

- [ ] **Step 1: Add the CI workflow**

Pin Gitleaks to a reviewed release or commit, check out full history with `fetch-depth: 0`, run the PowerShell audit, and upload the redacted report only on failure. Permissions remain `contents: read`.

- [ ] **Step 2: Run the full local history audit**

```powershell
pwsh -NoProfile -File supplemental/scripts/audit-public-repository.ps1
```

Expected: either PASS or a redacted finding list with paths and commits. Never copy secret values into the report.

- [ ] **Step 3: Remediate every finding**

For live credentials, rotate first. For current-tree privacy, replace with reserved examples. For historical privacy, document the affected refs and use `git filter-repo` only after creating a local safety clone and recording before/after commit maps.

- [ ] **Step 4: Write the final decision**

`docs/public-readiness-report.md` records scan commands, versions, finding categories, remediation, license review, remaining risks, and exactly one status: `blocked` or `ready`. It contains no secret values.

- [ ] **Step 5: Verify and commit**

```powershell
pwsh -NoProfile -File supplemental/scripts/audit-public-repository.ps1
go test -tags=testing -count=1 -timeout=10m ./...
npm.cmd --prefix internal/site test
git diff --check
git add .github/workflows/public-readiness.yml docs/public-readiness-report.md docs/release-notes-next.md internal/site/src/components/routes/settings/release-history.ts
git commit -m "ci: enforce public readiness audit"
```

Expected: all checks pass and the report status is `ready` before phase 2 begins.
