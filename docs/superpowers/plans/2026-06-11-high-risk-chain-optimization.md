# High Risk Chain Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 找出并修复 Pulse 当前最容易导致黑屏、误删、误操作、版本错乱或数据残留的高风险链路问题。

**Architecture:** 本轮不做大规模重构，按“验证基线 -> 扫描字段/API/权限边界 -> 修复第一个明确根因 -> 回归验证 -> 记录版本说明”的节奏推进。优先修数据源、后端约束和共享前端数据层，避免只在页面上遮盖症状。

**Tech Stack:** Go / PocketBase Hub、React / TypeScript / Vite 前端、PowerShell 本地开发脚本、Docker / Agent 更新链路。

---

## File Map

- `internal/site/src/lib/systemsManager.ts`: 前端 systems 全局数据读取、实时订阅、字段裁剪和 store 同步。
- `internal/site/src/components/routes/system/use-system-data.ts`: 机器详情页兜底读取、标题设置和详情数据加载。
- `internal/site/src/components/systems-table/systems-table-columns.tsx`: 客户端列表操作入口、删除入口隐藏和机器显示名。
- `internal/hub/system_delete.go`: Hub 侧机器删除源头保护。
- `internal/hub/operations.go`: 容器 / Compose 操作源头保护和操作动作分发。
- `internal/hub/agent_releases.go`: Agent 版本仓库和本地 release 同步。
- `internal/hub/systems/system_manager.go`: 系统记录自愈、详情采集写入和字段更新边界。
- `docs/release-notes-next.md`: 每个实际修复必须追加更新说明。

## Task 1: Establish Current Verification Baseline

**Files:**
- Read: `docs/dev-startup-checklist.md`
- Read: `docs/local-dev-runbook.md`
- Read: `docs/release-notes-next.md`

- [ ] **Step 1: Verify local Hub and Vite are reachable**

Run:

```powershell
(Invoke-WebRequest -Uri http://localhost:8090/api/health -UseBasicParsing -TimeoutSec 5).StatusCode
(Invoke-WebRequest -Uri http://localhost:5173 -UseBasicParsing -TimeoutSec 5).StatusCode
```

Expected: both commands return `200`.

- [ ] **Step 2: Run frontend build**

Run:

```powershell
npm.cmd --prefix internal\site run build
```

Expected: exit code `0`. Lingui missing-message count is acceptable if build completes.

- [ ] **Step 3: Run high-risk Hub tests with the required test tag**

Run:

```powershell
go test -tags testing ./internal/hub -run 'TestDeleteSystem|TestDeleteLocalSystem|TestLocalAgent|TestAgentRelease|TestOperation'
```

Expected: exit code `0`, or a clear compile/test failure that becomes the first root-cause investigation target.

- [ ] **Step 4: Browser smoke test the current visible surface**

Open:

```text
http://localhost:5173/clients?verify-high-risk-baseline=1
http://localhost:5173/containers?verify-high-risk-baseline=1
http://localhost:5173/settings/agent?verify-high-risk-baseline=1
```

Expected: each page renders without black screen; console should not show new runtime errors from the current task.

## Task 2: Audit Systems Field Boundary

**Files:**
- Modify if needed: `internal/site/src/lib/systemsManager.ts`
- Modify if needed: `internal/site/src/components/routes/system/use-system-data.ts`
- Modify if needed: `internal/site/src/components/systems-table/systems-table-columns.tsx`
- Test if changed: `internal/site/src/lib/system-roles.ts`

- [ ] **Step 1: Search for all systems field projections**

Run:

```powershell
rg -n 'fields:.*systems|FIELDS_DEFAULT|suppress_offline_alerts|is_local|primary_use|custom_role' internal\site\src internal\hub -S
```

Expected: every frontend systems projection that feeds shared UI includes `role`, `custom_role`, `primary_use`, `description`, `suppress_offline_alerts`, `is_local`, `info`, and `status` unless the code path only needs a narrower, explicitly documented subset.

- [ ] **Step 2: If a projection is missing a required display/protection field, add the field at the shared fetch layer**

Patch shape:

```ts
const FIELDS_DEFAULT =
	"id,name,role,custom_role,primary_use,description,suppress_offline_alerts,is_local,info,status"
```

Expected: list page, detail title, tag rendering, and delete menu all receive the same system identity fields.

- [ ] **Step 3: Verify the field boundary**

Run:

```powershell
npm.cmd --prefix internal\site run build
```

Expected: exit code `0`.

## Task 3: Audit Local System Delete Protection

**Files:**
- Read/modify if needed: `internal/hub/system_delete.go`
- Read/modify if needed: `internal/hub/system_delete_test.go`
- Read/modify if needed: `internal/site/src/components/systems-table/systems-table-columns.tsx`

- [ ] **Step 1: Verify backend source-of-truth protection**

Run:

```powershell
go test -tags testing ./internal/hub -run 'TestDeleteLocalSystem|TestDeleteSystem'
```

Expected: exit code `0`; local systems with `is_local=true` cannot be deleted.

- [ ] **Step 2: Verify frontend delete action depends on `is_local`**

Search:

```powershell
rg -n 'canDelete|is_local|删除|Delete' internal\site\src\components\systems-table -S
```

Expected: delete action is hidden or disabled when `system.is_local` is true, but backend remains the authority.

- [ ] **Step 3: If frontend only hides by name, change it to use `is_local`**

Patch shape:

```ts
const canDelete = !isReadOnlyUser() && !system.is_local
```

Expected: display name changes cannot accidentally re-enable delete.

## Task 4: Audit Protected Container / Compose Operations

**Files:**
- Read/modify if needed: `internal/hub/operations.go`
- Read/modify if needed: `internal/hub/operations_test.go`
- Read/modify if needed: `internal/site/src/components/containers-table/containers-table.tsx`
- Read/modify if needed: `internal/site/src/components/containers-table/containers-table-columns.tsx`

- [ ] **Step 1: Verify protected container detection includes Pulse names and legacy compatibility**

Run:

```powershell
rg -n 'isProtectedContainer|pulse-hub|pulse-agent|pulse-agent|pulse-hub|protected' internal\hub internal\site\src\components\containers-table -S
```

Expected: `pulse-hub` and `pulse-agent` are protected; legacy names are protected only for compatibility where needed; Harbor containers are not protected merely because they belong to a Compose stack.

- [ ] **Step 2: Run operation tests**

Run:

```powershell
go test -tags testing ./internal/hub -run 'Test.*Operation|Test.*ProtectedContainer'
```

Expected: exit code `0`, or the failing test becomes the next root-cause target.

- [ ] **Step 3: If protected stack logic over-blocks non-Pulse stacks, narrow the predicate**

Patch shape:

```go
func isProtectedContainer(name string, image string) bool {
	normalizedName := strings.ToLower(strings.TrimSpace(name))
	normalizedImage := strings.ToLower(strings.TrimSpace(image))
	return normalizedName == "pulse-hub" ||
		normalizedName == "pulse-agent" ||
		strings.Contains(normalizedImage, "/pulse-hub:") ||
		strings.Contains(normalizedImage, "/pulse-agent:")
}
```

Expected: Pulse self-management is blocked; ordinary Harbor Compose operations remain available.

## Task 5: Audit Agent Version / Release State

**Files:**
- Read/modify if needed: `internal/hub/agent_releases.go`
- Read/modify if needed: `internal/hub/agent_releases_test.go`
- Read/modify if needed: `internal/site/src/components/routes/settings/agent.tsx`
- Read/modify if needed: `supplemental/scripts/publish-release-v1.ps1`

- [ ] **Step 1: Verify Hub and Agent baseline version sources**

Run:

```powershell
rg -n '1\.0\.3|FALLBACK_VERSION|Agent 基线版本|HUB_VERSION|AGENT_VERSION|manifest.json' internal\site internal\hub agent supplemental docs -S
```

Expected: current development target is consistently `1.0.3`; release retention does not delete the current and immediately previous version.

- [ ] **Step 2: Run Agent release tests**

Run:

```powershell
go test -tags testing ./internal/hub -run 'Test.*AgentRelease|Test.*Release'
```

Expected: exit code `0`, or a clear failing test to investigate.

- [ ] **Step 3: Verify UI state semantics**

Open:

```text
http://localhost:5173/settings/agent?verify-agent-state-audit=1
```

Expected: rows on current version show no update button; only lower semantic versions show update availability; unsupported capability is not shown as a new version update.

## Task 6: Record and Verify Every Fix

**Files:**
- Modify: `docs/release-notes-next.md`
- Modify if release-visible: `internal/site/src/components/routes/settings/about.tsx`

- [ ] **Step 1: Add a release note for every code or behavior change**

Patch shape:

```md
- 修复/优化：说明用户可见变化、根因和影响范围。
```

Expected: future version release notes can be generated from this file without reconstructing chat history.

- [ ] **Step 2: Run final focused verification**

Run the smallest relevant set from the tasks above, plus:

```powershell
npm.cmd --prefix internal\site run build
```

Expected: exit code `0`.

- [ ] **Step 3: Browser-check the changed page**

Open the page affected by the fix with a `verify-*` query parameter.

Expected: page renders, the specific fixed behavior is visible, and no black screen appears.

