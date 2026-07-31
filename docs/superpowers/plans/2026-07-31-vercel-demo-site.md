# Pulse Vercel Demo Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public, read-only Pulse demo on Vercel that renders the real application with deterministic fictional data and supplies privacy-reviewed screenshots for GitHub.

**Architecture:** A compile-time `VITE_PULSE_DEMO=1` flag starts an MSW browser worker before React renders, seeds a local demo auth identity, and serves PocketBase-compatible read responses from typed fixtures. Production builds retain the current PocketBase runtime, while demo builds reject every write, skip realtime connections, and are deployed as a static Vite SPA with restrictive Vercel headers.

**Tech Stack:** React 19, Vite 8, TypeScript 6, PocketBase JS SDK, MSW 2, Playwright 1.61, Vercel CLI 50.28, PowerShell 7

---

## File Map

Create focused demo units under `internal/site/src/demo/`:

- `mode.ts`: compile-time mode detection and public demo metadata.
- `auth.ts`: deterministic non-secret PocketBase demo identity.
- `records.ts`: PocketBase record/list response helpers and minimal filter/sort/pagination behavior.
- `fixture-core.ts`: assets, interfaces, relations, locations and layouts.
- `fixture-monitoring.ts`: systems, details, containers, alerts, websites and backups.
- `fixture.ts`: the single exported collection registry and custom API summaries.
- `handlers.ts`: MSW request handlers.
- `browser.ts`: worker startup and fail-closed initialization.
- `*.test.ts`: privacy, query, handler and runtime contracts.

Create deployment and screenshot units:

- `vercel.json`: static build, SPA rewrite and security headers.
- `internal/site/playwright.demo.config.ts`: isolated demo server and deterministic browser settings.
- `internal/site/e2e/demo-site.spec.ts`: route, console, network and read-only verification.
- `internal/site/e2e/demo-screenshots.spec.ts`: reviewed screenshot generation.
- `supplemental/scripts/test-vercel-demo-config.ps1`: repository-level deployment contract.
- `supplemental/scripts/verify-demo-artifacts.ps1`: fixture/build/screenshot privacy gate.

Modify only the runtime seams needed by demo mode:

- `internal/site/src/main.tsx`: wait for the demo worker and skip realtime subscriptions.
- `internal/site/src/lib/api.ts`: seed demo runtime and reject writes.
- `internal/site/src/components/navbar.tsx`: show a compact demo badge and public links.
- `internal/site/index.html`: demo-aware description/robots metadata via Vite HTML transform.
- `internal/site/vite.config.ts`: demo metadata injection and production bundle exclusion checks.
- `internal/site/package.json` and `package-lock.json`: MSW and demo scripts.
- `.gitignore`: ignore `.vercel/` while allowing reviewed screenshot files.
- `readme.md`, `README.en.md`, release notes and About history: publish the final demo entry points.

### Task 1: Establish demo-mode and fixture privacy contracts

**Files:**
- Create: `internal/site/src/demo/mode.ts`
- Create: `internal/site/src/demo/mode.test.ts`
- Create: `internal/site/src/demo/fixture-core.ts`
- Create: `internal/site/src/demo/fixture-core.test.ts`
- Modify: `internal/site/package.json`
- Modify: `internal/site/package-lock.json`
- Modify: `.gitignore`

- [ ] **Step 1: Add failing demo-mode and privacy tests**

Create `mode.test.ts` so mode parsing is explicit and cannot be enabled by arbitrary truthy strings:

```ts
import assert from "node:assert/strict"
import { demoModeFromEnv } from "./mode.ts"

assert.equal(demoModeFromEnv("1"), true)
assert.equal(demoModeFromEnv("true"), true)
assert.equal(demoModeFromEnv("0"), false)
assert.equal(demoModeFromEnv(undefined), false)
console.log("demo mode contract passed")
```

Create `fixture-core.test.ts` with the exact public-data rules:

```ts
import assert from "node:assert/strict"
import { demoAssets, demoInterfaces, demoRelations } from "./fixture-core.ts"

const serialized = JSON.stringify({ demoAssets, demoInterfaces, demoRelations })
const forbiddenMarkers = [
	["192", "168", "1", ""].join("."),
	["192", "168", "31", ""].join("."),
	["gutenacht", "site"].join("."),
	["Fly", "NAS"].join(""),
	["Har", "bor"].join(""),
	["@", "gmail.com"].join("")
]
for (const forbidden of forbiddenMarkers) {
	assert.equal(serialized.includes(forbidden), false, `private marker found: ${forbidden}`)
}
assert.ok(demoAssets.every((asset) => !asset.management_ip || asset.management_ip.startsWith("192.168.50.")))
assert.ok(demoInterfaces.every((item) => !item.mac || /^02(:[0-9A-F]{2}){5}$/i.test(item.mac)))
const ids = new Set(demoAssets.map((asset) => asset.id))
assert.equal(ids.size, demoAssets.length)
assert.ok(demoRelations.every((relation) => ids.has(relation.source_asset) && ids.has(relation.target_asset)))
console.log("demo fixture privacy contract passed")
```

- [ ] **Step 2: Run the tests and verify they fail**

Run:

```powershell
node --experimental-strip-types internal/site/src/demo/mode.test.ts
node --experimental-strip-types internal/site/src/demo/fixture-core.test.ts
```

Expected: both fail because the demo modules do not exist.

- [ ] **Step 3: Add MSW and demo scripts**

Run from `internal/site`:

```powershell
npm install --save-dev msw@2
npx msw init public --save
```

Add these scripts:

```json
{
	"build:demo": "lingui extract --overwrite --clean && lingui compile && vite build --mode demo",
	"dev:demo": "vite --mode demo --host",
	"preview:demo": "vite preview --mode demo --host 127.0.0.1 --port 4173",
	"test:demo": "node --experimental-strip-types src/demo/mode.test.ts && node --experimental-strip-types src/demo/fixture-core.test.ts && node --experimental-strip-types src/demo/records.test.ts && node --experimental-strip-types src/demo/handlers.test.ts"
}
```

Add `.vercel/` to `.gitignore`, plus exceptions for reviewed public media:

```gitignore
.vercel/
!docs/media/
!docs/media/screenshots/
!docs/media/screenshots/*.png
!docs/media/social-preview.png
```

- [ ] **Step 4: Implement mode detection and the core fixture**

Create `mode.ts`:

```ts
export function demoModeFromEnv(value: string | undefined) {
	return value === "1" || value === "true"
}

export const isDemoMode = () => demoModeFromEnv(import.meta.env.VITE_PULSE_DEMO)
export const demoRepositoryUrl = "https://github.com/GuteNachte/pulse"
export const demoReleaseUrl = "https://github.com/GuteNachte/pulse/releases/latest"
```

Create typed record builders in `fixture-core.ts`, using a single fictional timestamp and user ID. The exported asset inventory must contain these exact records:

```ts
const demoAssetRows = [
	["demo-internet", "星云宽带", "internet", "", "家庭互联网入口"],
	["demo-ont", "光桥 X10", "ont", "192.168.50.1", "家庭主网关"],
	["demo-switch", "CoreSwitch 2.5G", "switch", "192.168.50.2", "家庭核心交换机"],
	["demo-ap", "Ceiling AP 7", "ap", "192.168.50.3", "家庭无线接入点"],
	["demo-nas", "Atlas NAS", "nas", "192.168.50.10", "家庭存储"],
	["demo-windows", "Studio PC", "physical_host", "192.168.50.20", "Windows 工作站"],
	["demo-phone", "Aurora Phone", "phone", "192.168.50.30", "移动终端"],
	["demo-tech-router", "Lab Router", "router", "192.168.50.40", "科技网路由器"],
	["demo-linux", "Orion Server", "server", "192.168.50.41", "实验服务器"],
	["demo-light", "客厅灯带", "light", "192.168.50.60", "智能照明"],
	["demo-sensor", "环境传感器", "sensor", "192.168.50.61", "温湿度监测"],
	["demo-web", "家庭服务入口", "web_endpoint", "", "互联网服务监控"]
] as const
```

Use `asset()`, `networkInterface()` and `relation()` helpers to add PocketBase fields (`id`, `collectionId`, `collectionName`, `user`, `created`, `updated`). Connect Internet -> ONT -> switch -> AP/NAS/Windows and tech router -> Linux, with phone/light/sensor on Wi-Fi. All MAC addresses begin with `02:` and all domains end in `.example.com`.

- [ ] **Step 5: Run focused tests and commit**

Run:

```powershell
npm.cmd --prefix internal/site run test:demo
git diff --check
```

Expected: mode and core privacy tests pass; tests for later tasks may still be absent from the script until their files are created.

Commit:

```powershell
git add .gitignore internal/site/package.json internal/site/package-lock.json internal/site/public/mockServiceWorker.js internal/site/src/demo
git commit -m "feat: establish public demo fixtures"
```

### Task 2: Implement PocketBase-compatible in-browser reads

**Files:**
- Create: `internal/site/src/demo/records.ts`
- Create: `internal/site/src/demo/records.test.ts`
- Create: `internal/site/src/demo/handlers.ts`
- Create: `internal/site/src/demo/handlers.test.ts`
- Create: `internal/site/src/demo/fixture-monitoring.ts`
- Create: `internal/site/src/demo/fixture.ts`

- [ ] **Step 1: Write failing record-query tests**

Cover equality filters joined by `&&`, ascending/descending sort, field projection, pagination and record lookup:

```ts
import assert from "node:assert/strict"
import { listRecords, projectRecord } from "./records.ts"

const records = [
	{ id: "a", asset: "one", primary: true, name: "LAN 1" },
	{ id: "b", asset: "two", primary: false, name: "WAN" },
	{ id: "c", asset: "one", primary: false, name: "LAN 2" }
]
const result = listRecords(records, new URL("https://demo.invalid/api/collections/interfaces/records?filter=asset%20%3D%20%22one%22&sort=-name&page=1&perPage=1"))
assert.deepEqual(result.items.map((item) => item.id), ["c"])
assert.equal(result.totalItems, 2)
assert.deepEqual(projectRecord(records[0], "id,name"), { id: "a", name: "LAN 1" })
console.log("demo record query contract passed")
```

- [ ] **Step 2: Verify the query test fails**

Run:

```powershell
node --experimental-strip-types internal/site/src/demo/records.test.ts
```

Expected: FAIL because `records.ts` does not exist.

- [ ] **Step 3: Implement the minimal query engine**

`records.ts` must export:

```ts
export type DemoRecord = Record<string, unknown> & { id: string }
export type DemoListResult<T> = { page: number; perPage: number; totalItems: number; totalPages: number; items: T[] }

export function matchesFilter(record: DemoRecord, filter: string): boolean
export function projectRecord<T extends DemoRecord>(record: T, fields?: string): Partial<T>
export function listRecords<T extends DemoRecord>(records: T[], url: URL): DemoListResult<Partial<T>>
export function getRecord<T extends DemoRecord>(records: T[], id: string, fields?: string): Partial<T> | undefined
```

The filter parser supports only the expressions used by the selected Pulse routes: `field = "value"`, `field != "value"`, booleans, and `&&`. Any unsupported non-empty expression throws an error so the demo cannot silently show incorrect data.

- [ ] **Step 4: Add monitoring fixtures and the collection registry**

Create `fixture-monitoring.ts` with:

- three systems: `Atlas NAS` (up), `Studio PC` (up), `Orion Server` (down);
- corresponding `system_details` records with fictional CPU, memory, OS and `192.168.50.0/24` interfaces;
- six containers across NAS and Linux, five running and one stopped;
- two alerts, one triggered;
- three `website_monitors` targeting `status.example.com`, `files.example.com` and `lab.example.com`;
- twelve website check records spanning up/down and 18-95ms;
- three display-only backups with deterministic sizes and timestamps;
- user settings, module settings and network layout records.

Create `fixture.ts`:

```ts
export const demoCollections = {
	assets: demoAssets,
	asset_interfaces: demoInterfaces,
	asset_relations: demoRelations,
	asset_locations: demoLocations,
	network_layouts: demoLayouts,
	systems: demoSystems,
	system_details: demoSystemDetails,
	containers: demoContainers,
	alerts: demoAlerts,
	website_monitors: demoWebsiteMonitors,
	website_monitor_checks: demoWebsiteChecks,
	user_settings: demoUserSettings,
	module_settings: demoModuleSettings
} satisfies Record<string, DemoRecord[]>

export const demoDashboardSummary = {
	containers: { total: 6, running: 5, stopped: 1 },
	websites: { total: 3, up: 2, down: 1, unknown: 0 }
}
```

- [ ] **Step 5: Write handler contract tests with MSW Node**

Use `setupServer(...demoHandlers)` and verify:

- `GET /api/collections/assets/records` returns PocketBase list metadata;
- `GET /api/collections/assets/records/demo-nas` returns Atlas NAS;
- `GET /api/pulse/systems/summary` returns three systems;
- `GET /api/pulse/dashboard/summary` returns deterministic totals;
- `GET /api/backups` returns the three display-only backups;
- `POST`, `PATCH`, `PUT` and `DELETE /api/:path*` return `405` with `{ code: "demo_read_only" }`;
- an uncovered `GET /api/pulse/unknown` returns controlled `404` rather than bypassing the network.

- [ ] **Step 6: Implement handlers and verify**

`handlers.ts` must handle auth refresh, collection list/single-record reads, summaries, runtime info, backup listing and asset media empty-state responses. End with explicit `/api/*` GET 404 and write rejection handlers.

Run:

```powershell
npm.cmd --prefix internal/site run test:demo
```

Expected: all demo query and handler contracts pass.

- [ ] **Step 7: Commit**

```powershell
git add internal/site/src/demo
git commit -m "feat: serve fictional PocketBase demo data"
```

### Task 3: Bootstrap demo auth and fail closed without a Hub

**Files:**
- Create: `internal/site/src/demo/auth.ts`
- Create: `internal/site/src/demo/browser.ts`
- Create: `internal/site/src/demo/browser.test.ts`
- Modify: `internal/site/src/main.tsx`
- Modify: `internal/site/src/lib/api.ts`
- Modify: `internal/site/src/lib/systemsManager.ts`
- Modify: `internal/site/src/lib/alerts.ts`

- [ ] **Step 1: Write the failing bootstrap contract**

Extract pure helpers and assert:

```ts
import assert from "node:assert/strict"
import { demoAuthRecord, demoAuthToken, shouldUseRealtime } from "./auth.ts"

assert.equal(demoAuthRecord.role, "readonly")
assert.equal(demoAuthRecord.email, "visitor@demo.example.com")
assert.equal(demoAuthToken.split(".").length, 3)
assert.equal(shouldUseRealtime(true), false)
assert.equal(shouldUseRealtime(false), true)
console.log("demo bootstrap contract passed")
```

- [ ] **Step 2: Verify failure, then implement auth and worker startup**

`auth.ts` exports a deterministic future-expiry unsigned demo JWT, a readonly user record, `seedDemoAuth(pb)`, and `shouldUseRealtime(demoMode)`.

`browser.ts` starts the worker with strict behavior:

```ts
export async function startDemoBrowser() {
	const { worker } = await import("./worker.ts")
	await worker.start({ onUnhandledRequest: "error", serviceWorker: { url: "./mockServiceWorker.js" }, quiet: true })
}
```

Move `setupWorker(...demoHandlers)` to `worker.ts` so Node tests do not import browser-only globals.

- [ ] **Step 3: Integrate runtime seams**

In `main.tsx`, call a `bootstrap()` function and render only after `startDemoBrowser()` resolves. If startup fails, render a dedicated loading/error state and do not call the production API.

In `api.ts`:

- return `{ environment: "web", hubUrl: "", hubConfigured: true }` from `initializePocketBaseRuntime()` in demo mode;
- seed demo auth after the async auth adapter is ready;
- reject write methods through the existing `beforeSend` hook with `演示模式为只读，数据不会被修改。`;
- skip `verifyAuth()` in demo mode.

Gate `systemsManager.subscribe()` and `alertManager.subscribe()` with `shouldUseRealtime(isDemoMode())`, while keeping their initial `refresh()` calls.

- [ ] **Step 4: Verify the demo and production entry contracts**

Run:

```powershell
npm.cmd --prefix internal/site run test:demo
npm.cmd --prefix internal/site run typecheck
npm.cmd --prefix internal/site run build
npm.cmd --prefix internal/site run build:demo
```

Expected: all commands pass; production and demo builds both produce `dist/index.html`.

- [ ] **Step 5: Verify production bundle exclusion**

Add a marker `PULSE_DEMO_FIXTURE_V1` only to `fixture.ts`. After a production build:

```powershell
if (rg -l 'PULSE_DEMO_FIXTURE_V1' internal/site/dist) { throw 'Demo fixture leaked into production build' }
```

Expected: no matches.

- [ ] **Step 6: Commit**

```powershell
git add internal/site/src/main.tsx internal/site/src/lib/api.ts internal/site/src/lib/systemsManager.ts internal/site/src/lib/alerts.ts internal/site/src/demo
git commit -m "feat: start Pulse in isolated demo mode"
```

### Task 4: Add visible demo boundaries and route coverage

**Files:**
- Create: `internal/site/src/components/demo-mode-indicator.tsx`
- Create: `internal/site/src/components/demo-mode-indicator.test.ts`
- Modify: `internal/site/src/components/navbar.tsx`
- Modify: `internal/site/src/components/login/login.tsx`
- Modify: `internal/site/src/demo/fixture.ts`
- Modify: `internal/site/src/demo/handlers.ts`

- [ ] **Step 1: Write indicator and route coverage tests**

Test that the indicator model contains `公开演示`, the GitHub URL and Release URL, and that every required route has all expected collections/handlers:

```ts
const requiredCollections = [
	"assets", "asset_interfaces", "asset_relations", "asset_locations", "network_layouts",
	"systems", "system_details", "containers", "alerts", "website_monitors", "website_monitor_checks",
	"user_settings", "module_settings"
]
for (const name of requiredCollections) assert.ok(name in demoCollections, `missing ${name}`)
```

- [ ] **Step 2: Implement a compact indicator**

Render a stable-height status beside the logo on desktop and inside the mobile user menu:

```tsx
<Badge variant="outline" className="h-6 gap-1.5 px-2 text-[11px] text-muted-foreground">
	<EyeIcon className="size-3" />
	公开演示
</Badge>
```

The menu exposes `查看 GitHub` and `下载测试版`. Logging out is hidden in demo mode so visitors cannot reach an unusable login screen.

- [ ] **Step 3: Confirm read-only behavior uses the existing role system**

Keep the demo identity as `readonly`. Existing pages should hide write controls where role-aware; any remaining write request is blocked by both the PocketBase `beforeSend` hook and MSW catch-all handler. Do not add fake-success mutations.

- [ ] **Step 4: Run route-level type and unit tests**

Run:

```powershell
npm.cmd --prefix internal/site run test
npm.cmd --prefix internal/site run test:demo
npm.cmd --prefix internal/site run typecheck
```

Expected: all pass.

- [ ] **Step 5: Commit**

```powershell
git add internal/site/src/components internal/site/src/demo internal/site/src/components/login/login.tsx
git commit -m "feat: mark the public demo as read only"
```

### Task 5: Add reproducible Vercel static deployment

**Files:**
- Create: `vercel.json`
- Create: `supplemental/scripts/test-vercel-demo-config.ps1`
- Modify: `internal/site/vite.config.ts`
- Modify: `internal/site/index.html`
- Modify: `.gitignore`

- [ ] **Step 1: Write the failing Vercel contract test**

The PowerShell test parses JSON structurally and asserts:

```powershell
$config = Get-Content $vercelPath -Raw | ConvertFrom-Json
Assert-Equal $config.framework 'vite'
Assert-Equal $config.outputDirectory 'internal/site/dist'
Assert-Contains $config.buildCommand 'build:demo'
Assert-Equal $config.rewrites[0].destination '/index.html'
Assert-Contains (($config.headers.headers | Where-Object key -eq 'Content-Security-Policy').value) "connect-src 'self'"
Assert-NotContains (Get-Content $vercelPath -Raw) '192.168.'
```

- [ ] **Step 2: Verify it fails**

Run:

```powershell
pwsh -NoProfile -File supplemental/scripts/test-vercel-demo-config.ps1
```

Expected: FAIL because `vercel.json` does not exist.

- [ ] **Step 3: Implement Vercel configuration**

Create root `vercel.json`:

```json
{
	"$schema": "https://openapi.vercel.sh/vercel.json",
	"framework": "vite",
	"installCommand": "npm ci --prefix internal/site",
	"buildCommand": "npm --prefix internal/site run build:demo",
	"outputDirectory": "internal/site/dist",
	"rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
	"headers": [
		{
			"source": "/(.*)",
			"headers": [
				{ "key": "X-Content-Type-Options", "value": "nosniff" },
				{ "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
				{ "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
				{ "key": "Content-Security-Policy", "value": "default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; worker-src 'self' blob:; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'" }
			]
		}
	]
}
```

- [ ] **Step 4: Make HTML metadata mode-aware**

Use a small Vite `transformIndexHtml` plugin to set demo builds to:

```html
<html lang="zh-CN">
<meta name="description" content="Pulse 家庭资产、网络拓扑与设备监控公开演示" />
<meta name="robots" content="index, follow" />
```

Production keeps the current `noindex, nofollow` behavior because individual self-hosted instances must not be indexed.

- [ ] **Step 5: Verify configuration and both builds**

Run:

```powershell
pwsh -NoProfile -File supplemental/scripts/test-vercel-demo-config.ps1
npm.cmd --prefix internal/site run build
npm.cmd --prefix internal/site run build:demo
git diff --check
```

Expected: all pass.

- [ ] **Step 6: Commit**

```powershell
git add vercel.json supplemental/scripts/test-vercel-demo-config.ps1 internal/site/vite.config.ts internal/site/index.html .gitignore
git commit -m "feat: configure the Vercel demo deployment"
```

### Task 6: Verify the complete demo in Playwright

**Files:**
- Create: `internal/site/playwright.demo.config.ts`
- Create: `internal/site/e2e/demo-site.spec.ts`
- Modify: `internal/site/package.json`

- [ ] **Step 1: Add a failing end-to-end suite**

Configure Playwright to start `npm run dev:demo -- --host 127.0.0.1 --port 4173`, use base URL `http://127.0.0.1:4173`, Chromium, one worker and no reused server.

The suite visits the ten required routes, asserts the `公开演示` marker and route-specific heading, records console errors, and rejects network requests whose hostname is not `127.0.0.1`, `localhost`, or the configured Vercel host.

For each viewport (`1440x1000`, `768x1024`, `390x844`), assert:

```ts
expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
```

Attempt one visible write control if present and assert the demo data remains unchanged after reload.

- [ ] **Step 2: Run and observe missing handler failures**

Run:

```powershell
npx --prefix internal/site playwright test --config=playwright.demo.config.ts
```

Expected: initial failures identify exact uncovered API GETs or page assumptions.

- [ ] **Step 3: Complete only the handlers required by the ten routes**

Add explicit handlers/fixture records for each failing read. Do not expand to admin, notification sending, Agent release mutation, AI enrichment or PocketBase administration.

- [ ] **Step 4: Rerun until all demo routes pass**

Run:

```powershell
npm.cmd --prefix internal/site run test:demo
npx --prefix internal/site playwright test --config=playwright.demo.config.ts
```

Expected: all tests pass with zero console errors and zero external business requests.

- [ ] **Step 5: Commit**

```powershell
git add internal/site/playwright.demo.config.ts internal/site/e2e/demo-site.spec.ts internal/site/package.json internal/site/src/demo
git commit -m "test: verify the public demo routes"
```

### Task 7: Create and verify public screenshots

**Files:**
- Create: `internal/site/e2e/demo-screenshots.spec.ts`
- Create: `supplemental/scripts/verify-demo-artifacts.ps1`
- Create: `docs/media/screenshots/*.png`
- Create: `docs/media/social-preview.png`

- [ ] **Step 1: Add deterministic screenshot capture**

Capture at `1600x1000`, light theme, reduced motion and a fixed clock. Save these stable filenames:

```text
docs/media/screenshots/dashboard.png
docs/media/screenshots/assets.png
docs/media/screenshots/asset-detail.png
docs/media/screenshots/network-home.png
docs/media/screenshots/network-technology.png
docs/media/screenshots/clients.png
docs/media/screenshots/containers.png
docs/media/screenshots/websites.png
```

Before each capture, wait for the route heading, `document.fonts.ready`, no loading labels and stable topology/card bounds across two animation frames.

- [ ] **Step 2: Add artifact privacy verification**

`verify-demo-artifacts.ps1` must:

- require all eight screenshots and `1280x640` social preview;
- reject zero-byte files and dimensions below the expected size;
- scan fixture/source/README text for private endpoints and email patterns;
- scan built JS for `PULSE_DEMO_FIXTURE_V1` in demo output and reject it in production output;
- print SHA256 for each approved image.

- [ ] **Step 3: Generate screenshots from the demo build**

Run:

```powershell
npx --prefix internal/site playwright test e2e/demo-screenshots.spec.ts --config=playwright.demo.config.ts
pwsh -NoProfile -File supplemental/scripts/verify-demo-artifacts.ps1
```

Expected: eight screenshots, one social preview and SHA256 output.

- [ ] **Step 4: Manually review the images**

Confirm no real IP, MAC, domain, account, device name, browser identity, loading state, overlap or clipped text is visible. Any failed image is regenerated from corrected fixture/UI state, never edited to hide private data after capture.

- [ ] **Step 5: Commit**

```powershell
git add internal/site/e2e/demo-screenshots.spec.ts supplemental/scripts/verify-demo-artifacts.ps1 docs/media .gitignore
git commit -m "docs: add reproducible Pulse demo screenshots"
```

### Task 8: Deploy and promote the Vercel site

**Files:**
- Local only: `.vercel/project.json`
- Modify after stable URL: `docs/public-demo.md`

- [ ] **Step 1: Verify Vercel CLI and authentication**

Run:

```powershell
npx --yes vercel@50.28.0 --version
npx --yes vercel@50.28.0 whoami
```

Expected: CLI `50.28.0` and the authorized Vercel account. If unauthenticated, run `npx --yes vercel@50.28.0 login` using OAuth Device Flow; never paste the resulting Token into chat or repository files.

- [ ] **Step 2: Link deterministically**

Discover the account/team, then run with the confirmed scope:

```powershell
$scope = (npx --yes vercel@50.28.0 whoami | Select-Object -Last 1).Trim()
if (-not $scope) { throw 'Vercel scope discovery failed' }
npx --yes vercel@50.28.0 link --yes --project pulse-demo --scope $scope
```

Confirm `.vercel/project.json` exists locally and remains ignored by Git.

- [ ] **Step 3: Build and deploy a preview**

Run:

```powershell
npx --yes vercel@50.28.0 pull --yes --environment=preview
npx --yes vercel@50.28.0 build
$previewUrl = (npx --yes vercel@50.28.0 deploy --prebuilt | Select-Object -Last 1).Trim()
if ($previewUrl -notmatch '^https://') { throw 'Vercel preview URL discovery failed' }
```

Record the returned immutable preview URL in the task log, not in source documentation.

- [ ] **Step 4: Run remote browser verification**

Set `$env:PULSE_DEMO_BASE_URL = $previewUrl` and run the same Playwright route suite. Verify status `200`, SPA deep links, security headers, console/network constraints and all viewports.

- [ ] **Step 5: Promote the exact tested artifact**

Run:

```powershell
npx --yes vercel@50.28.0 promote $previewUrl
npx --yes vercel@50.28.0 inspect $previewUrl
```

Expected: production deployment status `READY`. Do not rebuild between verification and promotion.

- [ ] **Step 6: Document the stable public URL**

Create `docs/public-demo.md` with the production URL, fictional-data boundary, supported routes, read-only limitations, rebuild command, verification command and rollback procedure:

```powershell
npx --yes vercel@50.28.0 rollback
```

- [ ] **Step 7: Commit**

```powershell
git add docs/public-demo.md
git commit -m "docs: record the public demo deployment"
```

### Task 9: Turn the demo into GitHub discovery and contribution entry points

**Files:**
- Modify: `readme.md`
- Create: `README.en.md`
- Create: `CONTRIBUTING.md`
- Create: `CODE_OF_CONDUCT.md`
- Create: `SUPPORT.md`
- Modify: `.github/ISSUE_TEMPLATE/bug_report.yml`
- Modify: `.github/ISSUE_TEMPLATE/config.yml`
- Modify: `.github/pull_request_template.md`
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`

- [ ] **Step 1: Update the README first viewport**

The Chinese README starts with:

- one-sentence product positioning;
- CI, release, license and demo badges;
- `在线演示`, `下载测试版`, `三分钟部署`, `English` links;
- `dashboard.png` followed by three focused screenshots;
- current public release `v1.0.6-beta.6`, not beta.1.

Keep installation, known limitations, backup warning, architecture, roadmap and contribution routes below the screenshots. Do not expose internal deployment docs as the primary public installation path.

- [ ] **Step 2: Add complete English entry documentation**

`README.en.md` mirrors positioning, screenshots, demo, quick start, supported platforms, limitations, privacy, feedback and contribution paths. Commands and URLs match the Chinese README exactly.

- [ ] **Step 3: Add governance and support files**

- `CONTRIBUTING.md`: Windows and Unix setup, module map, tests, release notes/About rule, privacy checklist and PR workflow.
- `CODE_OF_CONDUCT.md`: Contributor Covenant 2.1 with a private enforcement route that does not publish a personal email.
- `SUPPORT.md`: Discussions for help, Issues for reproducible bugs, Private Vulnerability Reporting for security, no commercial SLA.
- PR template: tests, demo impact, release notes, About, privacy and rollback checkboxes.
- Bug template: explicit warning to remove Token, domains, IPs, MACs and household asset names.

- [ ] **Step 4: Update release notes and About history**

Add separate entries:

- Web / Hub: demo mode and read-only behavior.
- Mobile / Android: no runtime behavior change; synchronized version language only.
- Agent / deployment: no Agent protocol change; Vercel static demo deployment added.
- Documentation / rules: screenshots, bilingual README and contribution entry points.

- [ ] **Step 5: Validate public documentation**

Run:

```powershell
pwsh -NoProfile -File supplemental/scripts/verify-demo-artifacts.ps1
pwsh -NoProfile -File supplemental/scripts/audit-public-repository.ps1
npm.cmd --prefix internal/site run typecheck
git diff --check
```

Expected: all pass.

- [ ] **Step 6: Commit**

```powershell
git add readme.md README.en.md CONTRIBUTING.md CODE_OF_CONDUCT.md SUPPORT.md .github docs internal/site/src/components/routes/settings/release-history.ts
git commit -m "docs: open Pulse to public discovery"
```

### Task 10: Final verification and GitHub publication

**Files:**
- Modify if needed: `supplemental/scripts/configure-public-github.ps1`
- Modify if needed: `docs/public-github-settings.md`

- [ ] **Step 1: Run the complete local gate**

```powershell
npm.cmd --prefix internal/site run test
npm.cmd --prefix internal/site run test:demo
npm.cmd --prefix internal/site run typecheck
npm.cmd --prefix internal/site run build
npm.cmd --prefix internal/site run build:demo
npx --prefix internal/site playwright test --config=playwright.demo.config.ts
pwsh -NoProfile -File supplemental/scripts/test-vercel-demo-config.ps1
pwsh -NoProfile -File supplemental/scripts/verify-demo-artifacts.ps1
pwsh -NoProfile -File supplemental/scripts/audit-public-repository.ps1
git diff --check
git status --short
```

Expected: all commands exit `0`; working tree is clean.

- [ ] **Step 2: Review the branch against public main**

```powershell
git fetch origin --prune
git log --oneline origin/main..HEAD
git diff --stat origin/main...HEAD
git diff --name-status origin/main...HEAD
```

Confirm no database, backup, log, `.vercel`, local media or private deployment inventory is included.

- [ ] **Step 3: Push and open a draft Pull Request**

Use the `github:yeet` workflow. Push `codex/github-project-discovery`, open a draft PR against `main`, and include the Vercel production URL, screenshot list, privacy controls, local checks and rollback command.

- [ ] **Step 4: Apply GitHub metadata after the PR is ready**

Set:

- Description: `开源的家庭资产、网络拓扑与设备监控平台`.
- Homepage: the verified Vercel demo production URL.
- Topics: `self-hosted`, `homelab`, `network-topology`, `asset-management`, `monitoring`, `nas`, `docker`, `pocketbase`, `react`, `golang`.
- Social Preview: `docs/media/social-preview.png`.

Keep Discussions and Private Vulnerability Reporting enabled. Do not change visibility, delete releases, move tags or reuse prerelease versions.

- [ ] **Step 5: Verify GitHub after merge**

Check README rendering, image loading, community profile, Actions, demo link, Release link, Topics, Homepage and Social Preview. Record the merged commit and final demo URL in `docs/public-demo.md` during the next release-note consolidation, not by amending an immutable release tag.

## Plan Self-Review

- Spec coverage: demo isolation, fictional data, read-only behavior, selected routes, Vercel configuration, screenshots, privacy, GitHub discovery and rollback each map to a task.
- Placeholder scan: authenticated Vercel scope and deployment URLs are discovered and validated by commands; no product behavior or code is left unspecified.
- Type consistency: `demoCollections`, `DemoRecord`, `listRecords`, `demoHandlers`, `isDemoMode`, `startDemoBrowser` and the selected route list use the same names throughout.
- Scope control: admin mutation, real Agent connections, telemetry, external databases, full documentation-site migration and unrelated UI refactors remain out of scope.
