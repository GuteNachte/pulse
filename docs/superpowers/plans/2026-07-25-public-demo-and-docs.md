# Pulse Public Demo And Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a repeatable fictional Pulse instance, bilingual project entry documentation, automated screenshots, and a locally verifiable GitHub Pages documentation site.

**Architecture:** A testing-only Go fixture package creates deterministic PocketBase records in a disposable data directory. Playwright logs into that instance and captures fixed routes; VitePress consumes checked-in documentation and reviewed screenshots.

**Tech Stack:** Go, PocketBase test app, Playwright, TypeScript, VitePress, Markdown, GitHub Pages

---

### Task 1: Define and validate fictional demo data

**Files:**
- Create: `internal/hub/demo_fixture.go`
- Create: `internal/hub/demo_fixture_test.go`
- Create: `supplemental/demo/fixture.json`
- Create: `supplemental/demo/README.md`

- [ ] **Step 1: Write failing fixture tests**

Test that the fixture contains Internet, gateway, switch, NAS, Windows, Linux, phone and smart-home assets; all domains end in `example.com`; public IPs use RFC documentation ranges; local management IPs use the dedicated fictional `192.168.50.0/24` network rather than the user's `192.168.1.0/24`; MACs are locally administered; and names never match known private inventory.

```go
func TestDemoFixtureUsesOnlyReservedIdentity(t *testing.T) {
    fixture := loadDemoFixture(t)
    for _, asset := range fixture.Assets {
        require.True(t, isReservedDemoAddress(asset.IPv4))
        require.False(t, strings.Contains(strings.ToLower(asset.Name), "nacht"))
    }
}
```

- [ ] **Step 2: Verify the test fails**

Run `go test -tags=testing ./internal/hub -run TestDemoFixture -count=1`.

Expected: FAIL because the fixture loader and JSON do not exist.

- [ ] **Step 3: Implement the testing-only fixture loader**

Keep the loader behind `//go:build testing`; validate every record before writing; assign stable IDs; and create assets, locations, interfaces, relations, layouts, systems and representative monitoring summaries through existing collections. The helper refuses a data directory that is not under the OS temporary directory.

- [ ] **Step 4: Verify and commit**

```powershell
go test -tags=testing ./internal/hub -run TestDemoFixture -count=1
git add internal/hub/demo_fixture.go internal/hub/demo_fixture_test.go supplemental/demo
git commit -m "test: add safe public demo fixture"
```

### Task 2: Add disposable demo-instance orchestration

**Files:**
- Create: `supplemental/scripts/run-public-demo.ps1`
- Create: `supplemental/scripts/test-public-demo.ps1`
- Modify: `internal/site/playwright.config.ts`

- [ ] **Step 1: Write the failing orchestration test**

The test passes a temporary root, starts the fixture preparation command, verifies the database and generated credentials remain under that root, and checks cleanup removes the directory after processes stop.

- [ ] **Step 2: Verify it fails**

Run `pwsh -NoProfile -File supplemental/scripts/test-public-demo.ps1`.

Expected: FAIL because the orchestration script does not exist.

- [ ] **Step 3: Implement the guarded runner**

The runner creates a random temporary directory, sets `PULSE_DEMO_MODE=1`, generates one-time credentials inside the temp directory, starts Hub on an available loopback port and Vite on an available loopback port, seeds the fixture, prints URLs, and returns a process manifest for cleanup. It rejects non-loopback bindings.

- [ ] **Step 4: Verify and commit**

```powershell
pwsh -NoProfile -File supplemental/scripts/test-public-demo.ps1
git add supplemental/scripts/run-public-demo.ps1 supplemental/scripts/test-public-demo.ps1 internal/site/playwright.config.ts
git commit -m "feat: run disposable public demo instances"
```

### Task 3: Capture deterministic screenshots

**Files:**
- Create: `internal/site/e2e/public-screenshots.spec.ts`
- Create: `internal/site/e2e/public-screenshot-routes.ts`
- Create: `docs/public/assets/screenshots/README.md`
- Modify: `internal/site/package.json`
- Modify: `internal/site/package-lock.json`

- [ ] **Step 1: Write the screenshot route contract**

Define exact desktop captures for `/`, `/assets`, one deterministic asset detail route, `/network/home`, `/network/technology`, `/clients`, `/alerts`, and `/settings/backups`. Assert every route has a unique filename, title expectation and ready locator.

- [ ] **Step 2: Verify it fails**

Run `npm.cmd --prefix internal/site run test:public-screenshots`.

Expected: FAIL because the script and route module do not exist.

- [ ] **Step 3: Implement capture and privacy checks**

Playwright uses the demo credentials, fixed 1728x1080 viewport, reduced motion, deterministic date/time, and PNG output under `docs/public/assets/screenshots`. Before saving, scan visible text for forbidden private endpoints and known local identifiers; fail on console warnings, page errors, horizontal overflow, missing images or empty topology canvases.

- [ ] **Step 4: Generate and review captures**

```powershell
npm.cmd --prefix internal/site run test:public-screenshots
pwsh -NoProfile -File supplemental/scripts/audit-public-repository.ps1 -SkipHistoryScan
```

Expected: eight nonblank screenshots, no privacy findings.

- [ ] **Step 5: Commit**

```powershell
git add internal/site/e2e internal/site/package.json internal/site/package-lock.json docs/public/assets/screenshots
git commit -m "docs: automate public product screenshots"
```

### Task 4: Build bilingual README and documentation site

**Files:**
- Modify: `readme.md`
- Create: `README.en.md`
- Create: `docs-site/package.json`
- Create: `docs-site/package-lock.json`
- Create: `docs-site/.vitepress/config.mts`
- Create: `docs-site/zh/index.md`
- Create: `docs-site/en/index.md`
- Create: `docs-site/zh/guide/*.md`
- Create: `docs-site/en/guide/*.md`
- Create: `.github/workflows/docs.yml`

- [ ] **Step 1: Add documentation link tests**

Create `docs-site/scripts/check-content.mjs` to fail when required pages, language counterparts, screenshot references, version strings or internal/private endpoints are missing or forbidden.

- [ ] **Step 2: Verify it fails**

Run `npm.cmd --prefix docs-site run check`.

Expected: FAIL because the site and required pages do not exist.

- [ ] **Step 3: Implement the VitePress site**

Use a compact neutral theme and stable navigation. Chinese pages cover quick start, deployment, initialization, Agent, assets, topology, monitoring, alerts, backup, upgrade, rollback, troubleshooting, privacy, support and contribution. English pages fully cover home, quick start, deployment, support and contribution.

- [ ] **Step 4: Rewrite repository entry pages**

README order is product identity, screenshot, three-minute start, capabilities, support matrix, limitations, architecture, documentation, contribution, security and licenses. All install examples use the public release bundle or GHCR-derived Compose after the repository is authorized; no private Harbor address appears.

- [ ] **Step 5: Verify locally**

```powershell
npm.cmd --prefix docs-site ci
npm.cmd --prefix docs-site run check
npm.cmd --prefix docs-site run build
pwsh -NoProfile -File supplemental/scripts/audit-public-repository.ps1 -SkipHistoryScan
```

Expected: static build succeeds and the audit passes.

- [ ] **Step 6: Commit**

```powershell
git add readme.md README.en.md docs-site .github/workflows/docs.yml
git commit -m "docs: add bilingual public documentation"
```

### Task 5: Add reviewed video and social assets

**Files:**
- Create: `docs/public/assets/social-preview.png`
- Create: `docs/public/assets/pulse-overview.webm`
- Create: `docs/public/assets/asset-manifest.json`
- Create: `supplemental/scripts/verify-public-assets.ps1`

- [ ] **Step 1: Add asset verification first**

The verifier checks allowed extensions, maximum sizes, exact dimensions, SHA256, manifest membership, nonblank images, and absence of metadata fields containing user or machine identity.

- [ ] **Step 2: Generate assets only from the demo instance**

Record a 30-60 second path through startup, assets and topology. Use the approved Pulse product view, not a marketing mockup. Strip metadata before hashing.

- [ ] **Step 3: Verify and commit**

```powershell
pwsh -NoProfile -File supplemental/scripts/verify-public-assets.ps1
pwsh -NoProfile -File supplemental/scripts/audit-public-repository.ps1 -SkipHistoryScan
git add docs/public/assets supplemental/scripts/verify-public-assets.ps1
git commit -m "docs: add verified public media assets"
```

### Task 6: Pages authorization gate

Do not enable Pages or run a Pages deployment until the repository is public and the user authorizes the destination. Local `vitepress build` remains allowed.
