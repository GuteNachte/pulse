# Network Topology Controlled Source Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Pulse 网络拓扑改造成基于 Homelable 受控源码移植的双网络自由编辑工作台，同时保持 Pulse 资产、接口和关系为唯一真实数据源。

**Architecture:** 先把端点、折点、历史和序列化能力移入独立 `canvas-core`，再通过 `pulse-adapter` 把 Pulse 数据转换成 React Flow 节点和边。家庭网络与科技网使用显式关系域和独立布局记录；真实关系修改与视觉布局保存分开处理，页面层只组合领域模型、持久化和 Sheet。

**Tech Stack:** React 19、TypeScript 6、`@xyflow/react` 12、PocketBase 0.27、Nanostores Router、Radix / shadcn、Node test runner、Playwright。

---

## File Map

### New files

- `THIRD_PARTY_NOTICES.md` — Homelable 版本、提交、许可证和移植范围。
- `internal/site/src/modules/network-topology/topology-domain.ts` — 网络域、链路介质和元数据兼容解析。
- `internal/site/src/modules/network-topology/topology-domain.test.ts` — 域和介质规则测试。
- `internal/site/src/modules/network-topology/layout-v2.ts` — 双工作区布局解析、迁移和 payload。
- `internal/site/src/modules/network-topology/layout-v2.test.ts` — 旧布局兼容、折点和冲突测试。
- `internal/site/src/modules/network-topology/canvas-core/types.ts` — 独立画布类型。
- `internal/site/src/modules/network-topology/canvas-core/handles.ts` — 四边 Handle ID 和规范化。
- `internal/site/src/modules/network-topology/canvas-core/handles.test.ts` — Handle 规则测试。
- `internal/site/src/modules/network-topology/canvas-core/waypoints.ts` — 折点路径、吸附和位移。
- `internal/site/src/modules/network-topology/canvas-core/waypoints.test.ts` — 折点测试。
- `internal/site/src/modules/network-topology/canvas-core/history.ts` — 布局历史栈。
- `internal/site/src/modules/network-topology/canvas-core/history.test.ts` — 撤销重做测试。
- `internal/site/src/modules/network-topology/canvas-core/serialization.ts` — 画布布局序列化。
- `internal/site/src/modules/network-topology/canvas-core/serialization.test.ts` — 序列化测试。
- `internal/site/src/modules/network-topology/pulse-adapter.ts` — Pulse 记录到画布图的唯一适配层。
- `internal/site/src/modules/network-topology/pulse-adapter.test.ts` — 双域、多网卡和异常端点测试。
- `internal/site/src/modules/network-topology/auto-layout.ts` — 一次性建议布局，不修改真实关系。
- `internal/site/src/modules/network-topology/auto-layout.test.ts` — 稳定坐标和关系不变测试。
- `internal/site/src/modules/network-topology/layout-persistence.ts` — 布局读取、版本检查和冲突结果。
- `internal/site/src/modules/network-topology/layout-persistence.test.ts` — 保存成功、失败和冲突测试。
- `internal/site/src/modules/network-topology/workspace-state.ts` — 当前工作区草稿和保存状态 reducer。
- `internal/site/src/modules/network-topology/workspace-state.test.ts` — 草稿、失败恢复和切换测试。
- `internal/site/src/modules/network-topology/components/topology-free-node.tsx` — 紧凑设备节点和四边端点。
- `internal/site/src/modules/network-topology/components/topology-free-edge.tsx` — 三类链路和折点控件。
- `internal/site/src/modules/network-topology/components/topology-workspace-toolbar.tsx` — 双网络切换、统计和编辑操作。
- `internal/site/src/modules/network-topology/components/topology-connection-sheet.tsx` — 新建、重连和编辑真实关系。
- `internal/site/src/modules/network-topology/components/topology-workspace.tsx` — React Flow 工作台组合。
- `internal/site/playwright.config.ts` — 桌面拓扑浏览器验收配置。
- `internal/site/e2e/network-topology.spec.ts` — 双页面、拖线、折点、只读和布局验收。

### Modified files

- `internal/site/src/types.d.ts` — `NetworkLayoutRecord.layout` 增加版本 2 和折点字段。
- `internal/site/package.json` — 扩展拓扑测试脚本和浏览器验收脚本。
- `internal/site/src/modules/network-topology/topology-data-query.ts` — 按工作区 key 读取布局及 `updated`。
- `internal/site/src/modules/network-topology/topology-data-query.test.ts` — 双布局查询测试。
- `internal/site/src/lib/network-topology.ts` — 保留共享格式化，逐步停止旧矩阵构图入口。
- `internal/site/src/components/routes/home-network-topology.tsx` — 收敛为首页只读总览包装器。
- `internal/site/src/components/routes/network.tsx` — 读取路由域并挂载新工作台。
- `internal/site/src/components/router.tsx` — `/network/:domain?`。
- `internal/site/src/main.tsx` — 将网络域参数传给页面。
- `internal/site/src/modules/network-topology/manifest.ts` — 更新路由和代码所有权。
- `internal/site/src/modules/network-topology/components/topology-inspector-sheet.tsx` — 复用新节点 / 链路模型。
- `internal/site/src/modules/network-topology/workspace-data.test.ts` — 替换旧矩阵源码断言。
- `internal/site/src/index.css` — 点阵画布、端点和三类链路样式。
- `docs/release-notes-next.md` — Web / Hub 更新说明。
- `internal/site/src/components/routes/settings/release-history.ts` — About 页 Web / Hub 更新记录。

### Removed after cutover

- `internal/site/src/modules/network-topology/topology-matrix.ts`
- `internal/site/src/modules/network-topology/topology-matrix.test.ts`
- `internal/site/src/modules/network-topology/topology-matrix-layout.ts`
- `internal/site/src/modules/network-topology/topology-matrix-layout.test.ts`
- `internal/site/src/modules/network-topology/components/topology-matrix-node.tsx`
- `internal/site/src/modules/network-topology/components/topology-matrix-edge.tsx`

这些文件只能在新工作台、首页总览和全部测试通过后删除。执行时先检查工作区已有修改，不回退用户未提交内容。

---

### Task 1: Lock Provenance and Canonical Metadata

**Files:**
- Create: `THIRD_PARTY_NOTICES.md`
- Create: `internal/site/src/modules/network-topology/topology-domain.ts`
- Create: `internal/site/src/modules/network-topology/topology-domain.test.ts`
- Modify: `internal/site/package.json`

- [ ] **Step 1: Record the dirty-worktree baseline**

Run:

```powershell
git status --short
git diff --name-only
```

Expected: existing unrelated asset, topology and development-script changes may be present. Save the list in the execution notes and never use reset or checkout to remove them.

- [ ] **Step 2: Write the failing domain tests**

Create `topology-domain.test.ts` with concrete cases:

```ts
import assert from "node:assert/strict"
import test from "node:test"
import { getRelationDomain, getRelationMedium, withTopologyMetadata } from "./topology-domain.ts"

test("reads explicit domain and legacy link kinds", () => {
	assert.equal(getRelationDomain({ network_domain: "technology" }), "technology")
	assert.equal(getRelationMedium({ link_kind: "ethernet" }), "wired")
	assert.equal(getRelationMedium({ link_kind: "internet" }), "fiber")
})

test("writes canonical topology metadata without dropping interface ids", () => {
	assert.deepEqual(
		withTopologyMetadata(
			{ source_interface: "if-a", target_interface: "if-b", notes: "keep" },
			{ domain: "home", medium: "wifi" }
		),
		{
			source_interface: "if-a",
			target_interface: "if-b",
			notes: "keep",
			network_domain: "home",
			link_kind: "wifi",
		}
	)
})
```

- [ ] **Step 3: Run the test and verify the missing module failure**

Run:

```powershell
cd internal/site
node --experimental-strip-types src/modules/network-topology/topology-domain.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `topology-domain.ts`.

- [ ] **Step 4: Implement the canonical domain helpers**

Create `topology-domain.ts` with these public types and functions:

```ts
export type TopologyDomain = "home" | "technology"
export type TopologyMedium = "wired" | "wifi" | "fiber"

export function getRelationDomain(metadata: Record<string, unknown> | undefined): TopologyDomain | undefined {
	return metadata?.network_domain === "home" || metadata?.network_domain === "technology"
		? metadata.network_domain
		: undefined
}

export function getRelationMedium(metadata: Record<string, unknown> | undefined): TopologyMedium | undefined {
	if (metadata?.link_kind === "wifi") return "wifi"
	if (metadata?.link_kind === "fiber" || metadata?.link_kind === "internet") return "fiber"
	if (metadata?.link_kind === "ethernet") return "wired"
	return undefined
}

export function withTopologyMetadata(
	metadata: Record<string, unknown> | undefined,
	input: { domain: TopologyDomain; medium: TopologyMedium }
) {
	return {
		...metadata,
		network_domain: input.domain,
		link_kind: input.medium === "wired" ? "ethernet" : input.medium,
	}
}
```

- [ ] **Step 5: Add provenance and test script**

Create `THIRD_PARTY_NOTICES.md` containing the Homelable project URL, MIT license notice, `v3.1.1`, commit `d9f3b4c18ab8adb1be742abd45806e6bb302dbce`, and a list limited to handles, waypoint edges, history, serialization and their tests. Add `topology-domain.test.ts` to `test:network-topology`.

- [ ] **Step 6: Run and commit**

Run:

```powershell
npm run test:network-topology
npm run typecheck
```

Expected: all topology tests PASS and TypeScript exits `0`.

Commit only Task 1 files:

```powershell
git add THIRD_PARTY_NOTICES.md internal/site/src/modules/network-topology/topology-domain.ts internal/site/src/modules/network-topology/topology-domain.test.ts internal/site/package.json
git commit -m "feat: define topology domains and source provenance"
```

---

### Task 2: Add Versioned Dual-Workspace Layouts

**Files:**
- Create: `internal/site/src/modules/network-topology/layout-v2.ts`
- Create: `internal/site/src/modules/network-topology/layout-v2.test.ts`
- Modify: `internal/site/src/types.d.ts`
- Modify: `internal/site/package.json`

- [ ] **Step 1: Write failing migration tests**

Create `layout-v2.test.ts`:

```ts
import assert from "node:assert/strict"
import test from "node:test"
import { createEmptyLayout, parseTopologyLayout, serializeTopologyLayout } from "./layout-v2.ts"

test("migrates legacy nodes and viewport without persisting selection", () => {
	const result = parseTopologyLayout({
		nodes: { "asset-a": { x: 20, y: 40 } },
		selected: "asset-a",
		viewport: { x: 1, y: 2, zoom: 0.8 },
	})
	assert.equal(result.version, 2)
	assert.deepEqual(result.nodes["asset-a"], { x: 20, y: 40 })
	assert.deepEqual(result.edgeWaypoints, {})
	assert.equal("selected" in serializeTopologyLayout(result), false)
})

test("round trips waypoints", () => {
	const layout = createEmptyLayout()
	layout.edgeWaypoints["relation-a"] = [{ x: 100, y: 200 }]
	assert.deepEqual(parseTopologyLayout(serializeTopologyLayout(layout)).edgeWaypoints, layout.edgeWaypoints)
})
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
node --experimental-strip-types src/modules/network-topology/layout-v2.test.ts
```

Expected: FAIL with missing `layout-v2.ts`.

- [ ] **Step 3: Implement layout types and migration**

Use one canonical model:

```ts
export type TopologyPoint = { x: number; y: number }
export type TopologyViewport = TopologyPoint & { zoom: number }

export type TopologyLayoutV2 = {
	version: 2
	nodes: Record<string, TopologyPoint>
	edgeWaypoints: Record<string, TopologyPoint[]>
	viewport: TopologyViewport
}
```

`parseTopologyLayout()` accepts unknown JSON, clamps non-finite values, maps `edge_waypoints` to `edgeWaypoints`, and defaults viewport to `{ x: 0, y: 0, zoom: 1 }`. `serializeTopologyLayout()` emits `version`, `nodes`, `edge_waypoints`, and `viewport` only.

- [ ] **Step 4: Update `NetworkLayoutRecord`**

Replace the narrow inline `layout` type with a backward-compatible shape:

```ts
layout?: {
	version?: 2
	nodes?: Record<string, { x: number; y: number }>
	edge_waypoints?: Record<string, { x: number; y: number }[]>
	connection_modes?: Record<string, ("wired" | "wireless")[]>
	selected?: string
	viewport?: { x: number; y: number; zoom: number }
}
```

- [ ] **Step 5: Run and commit**

Run `npm run test:network-topology && npm run typecheck`. Expected: PASS.

Commit:

```powershell
git add internal/site/src/modules/network-topology/layout-v2.ts internal/site/src/modules/network-topology/layout-v2.test.ts internal/site/src/types.d.ts internal/site/package.json
git commit -m "feat: add versioned topology layouts"
```

---

### Task 3: Port the Isolated Canvas Core

**Files:**
- Create: `internal/site/src/modules/network-topology/canvas-core/types.ts`
- Create: `internal/site/src/modules/network-topology/canvas-core/handles.ts`
- Create: `internal/site/src/modules/network-topology/canvas-core/handles.test.ts`
- Create: `internal/site/src/modules/network-topology/canvas-core/waypoints.ts`
- Create: `internal/site/src/modules/network-topology/canvas-core/waypoints.test.ts`
- Create: `internal/site/src/modules/network-topology/canvas-core/history.ts`
- Create: `internal/site/src/modules/network-topology/canvas-core/history.test.ts`
- Create: `internal/site/src/modules/network-topology/canvas-core/serialization.ts`
- Create: `internal/site/src/modules/network-topology/canvas-core/serialization.test.ts`
- Modify: `internal/site/package.json`

- [ ] **Step 1: Write failing handle and waypoint tests**

Cover stable four-side IDs and waypoint translation:

```ts
assert.deepEqual(TOPOLOGY_HANDLE_IDS, ["top", "right", "bottom", "left"])
assert.equal(normalizeHandleId("invalid"), "right")
assert.deepEqual(
	translateWaypoints([{ x: 10, y: 20 }], { x: 5, y: -2 }),
	[{ x: 15, y: 18 }]
)
assert.deepEqual(snapWaypoint45({ x: 0, y: 0 }, { x: 20, y: 17 }), { x: 20, y: 20 })
```

- [ ] **Step 2: Verify the tests fail**

Run each new test with `node --experimental-strip-types`. Expected: missing modules.

- [ ] **Step 3: Port handles and waypoints from Homelable**

Keep only framework-independent helpers. Public API:

```ts
export const TOPOLOGY_HANDLE_IDS = ["top", "right", "bottom", "left"] as const
export type TopologyHandleId = (typeof TOPOLOGY_HANDLE_IDS)[number]
export function normalizeHandleId(value: unknown): TopologyHandleId
export function buildWaypointPath(points: TopologyPoint[], style: "orthogonal" | "smooth"): string
export function snapWaypoint45(origin: TopologyPoint, point: TopologyPoint): TopologyPoint
export function translateWaypoints(points: TopologyPoint[], delta: TopologyPoint): TopologyPoint[]
```

Retain the upstream mathematical behavior and tests, but replace Homelable aliases and theme imports with local types.

- [ ] **Step 4: Write failing history and serialization tests**

Test a capacity-limited immutable history:

```ts
const history = createCanvasHistory({ nodes: {}, edgeWaypoints: {} }, 50)
const moved = history.push({ nodes: { a: { x: 1, y: 2 } }, edgeWaypoints: {} })
assert.deepEqual(moved.undo().present.nodes, {})
assert.deepEqual(moved.undo().redo().present.nodes.a, { x: 1, y: 2 })
```

Serialization must exclude React component references, selected state and transient drag data.

- [ ] **Step 5: Implement history and serialization**

Use pure return values, not a global Zustand store:

```ts
export type CanvasSnapshot = {
	nodes: Record<string, TopologyPoint>
	edgeWaypoints: Record<string, TopologyPoint[]>
}

export type CanvasHistory = {
	past: CanvasSnapshot[]
	present: CanvasSnapshot
	future: CanvasSnapshot[]
	push(next: CanvasSnapshot): CanvasHistory
	undo(): CanvasHistory
	redo(): CanvasHistory
}
```

Maximum history is 50 snapshots and duplicate snapshots are not pushed.

- [ ] **Step 6: Run and commit**

Run all four core tests, `npm run test:network-topology`, and `npm run typecheck`. Expected: PASS.

Commit only the canvas-core files, package script, and any required attribution adjustment:

```powershell
git add internal/site/src/modules/network-topology/canvas-core internal/site/package.json THIRD_PARTY_NOTICES.md
git commit -m "feat: port isolated topology canvas core"
```

---

### Task 4: Build the Pulse Graph Adapter

**Files:**
- Create: `internal/site/src/modules/network-topology/pulse-adapter.ts`
- Create: `internal/site/src/modules/network-topology/pulse-adapter.test.ts`
- Create: `internal/site/src/modules/network-topology/auto-layout.ts`
- Create: `internal/site/src/modules/network-topology/auto-layout.test.ts`
- Modify: `internal/site/src/lib/network-topology.ts`
- Modify: `internal/site/package.json`

- [ ] **Step 1: Write failing adapter tests**

Create fixtures for home, technology, dual-homed and broken relations. Assert:

```ts
const graph = buildPulseTopologyGraph({
	domain: "home",
	assets: [internet, router, phone],
	interfaces: [pon, wifi],
	relations: [homeFiberRelation, homeWifiRelation],
	systems: [],
	details: [],
	layout: createEmptyLayout(),
})

assert.deepEqual(graph.nodes.map((node) => node.id), ["asset-internet", "asset-router", "asset-phone"])
assert.equal(graph.edges[0].data.medium, "fiber")
assert.equal(graph.edges[1].data.medium, "wifi")
assert.equal(graph.edges[1].data.sourceInterface?.id, "wifi-phone")
```

Add a relation with `network_domain: "technology"` and assert it is excluded from the home graph. Add one missing interface and assert `diagnostics` includes `missing-interface` without inventing a port.

- [ ] **Step 2: Verify failure**

Run `node --experimental-strip-types src/modules/network-topology/pulse-adapter.test.ts`. Expected: missing module.

- [ ] **Step 3: Implement the adapter**

Define focused types:

```ts
export type PulseTopologyNodeData = {
	kind: "asset"
	asset: AssetRecord
	interfaces: AssetInterfaceRecord[]
	status?: SystemRecord["status"]
	diagnosticCodes: string[]
} | {
	kind: "placeholder"
	missingAssetId: string
	interfaces: []
	diagnosticCodes: ["missing-asset"]
}

export type PulseTopologyEdgeData = {
	relation: AssetRelationRecord
	medium?: TopologyMedium
	sourceInterface?: AssetInterfaceRecord
	targetInterface?: AssetInterfaceRecord
	diagnosticCodes: string[]
}
```

`buildPulseTopologyGraph()` must filter by explicit domain first, use the legacy name heuristic only when metadata has no domain, place nodes from the selected layout, and create a `placeholder` visual node for a missing asset ID without creating a fake `AssetRecord` or `AssetInterfaceRecord`.

- [ ] **Step 4: Write and implement deterministic auto-layout tests**

Create `auto-layout.test.ts` and `auto-layout.ts`. The test must assert the same input produces the same coordinates, linked nodes are separated by at least one node width, and the returned graph preserves every node ID and edge ID:

```ts
const first = createSuggestedLayout(graph)
const second = createSuggestedLayout(graph)
assert.deepEqual(first, second)
assert.deepEqual(Object.keys(first.nodes).sort(), graph.nodes.map((node) => node.id).sort())
assert.deepEqual(graph.edges.map((edge) => edge.id), originalEdgeIds)
```

The implementation may reuse the current stable depth / sort rules from `topology-matrix-layout.ts`, but it returns only suggested node positions and default empty waypoint arrays. It must not mutate assets, interfaces, relations, domain metadata, or edge endpoints.

Add both adapter and auto-layout tests to `test:network-topology` before running the complete script.

- [ ] **Step 5: Reduce old shared-lib ownership**

Keep reusable formatting and port label helpers in `src/lib/network-topology.ts`, but export new adapter types only from the module. Do not delete old matrix functions until Task 9.

- [ ] **Step 6: Run and commit**

Run `npm run test:network-topology && npm run typecheck`. Expected: PASS.

Commit:

```powershell
git add internal/site/src/modules/network-topology/pulse-adapter.ts internal/site/src/modules/network-topology/pulse-adapter.test.ts internal/site/src/modules/network-topology/auto-layout.ts internal/site/src/modules/network-topology/auto-layout.test.ts internal/site/src/lib/network-topology.ts internal/site/package.json
git commit -m "feat: adapt Pulse assets into topology graphs"
```

---

### Task 5: Add Layout Persistence, Conflict Detection, and Draft State

**Files:**
- Create: `internal/site/src/modules/network-topology/layout-persistence.ts`
- Create: `internal/site/src/modules/network-topology/layout-persistence.test.ts`
- Create: `internal/site/src/modules/network-topology/workspace-state.ts`
- Create: `internal/site/src/modules/network-topology/workspace-state.test.ts`
- Modify: `internal/site/src/modules/network-topology/topology-data-query.ts`
- Modify: `internal/site/src/modules/network-topology/topology-data-query.test.ts`
- Modify: `internal/site/package.json`

- [ ] **Step 1: Write failing persistence tests**

Use fake collections to cover two layout keys and conflict detection:

```ts
assert.equal(getTopologyLayoutKey("home"), "network-home")
assert.equal(getTopologyLayoutKey("technology"), "network-technology")

const result = await saveTopologyLayout({
	record: { id: "layout-a", updated: "2026-07-22 20:00:00.000Z" },
	loadedUpdated: "2026-07-22 19:00:00.000Z",
	layout,
	collection,
})
assert.equal(result.status, "conflict")
assert.equal(collection.updateCalls.length, 0)
```

- [ ] **Step 2: Write failing reducer tests**

Cover dirty, saving, saved, failed, conflict, undo and domain switch:

```ts
let state = createWorkspaceState("home", layout)
state = reduceWorkspace(state, { type: "move-node", id: "asset-a", position: { x: 8, y: 12 } })
assert.equal(state.dirty, true)
state = reduceWorkspace(state, { type: "save-failed", message: "offline" })
assert.equal(state.dirty, true)
assert.equal(state.saveStatus, "failed")
```

- [ ] **Step 3: Implement persistence and reducer**

`saveTopologyLayout()` fetches the current record immediately before update. It returns one of:

```ts
type SaveTopologyLayoutResult =
	| { status: "saved"; updated: string }
	| { status: "conflict"; remote: NetworkLayoutRecord }
	| { status: "failed"; error: unknown }
```

No thrown request error may clear local dirty state. The reducer owns local history and exposes `canUndo`, `canRedo`, `dirty`, and `saveStatus`.

- [ ] **Step 4: Update topology queries**

Make `loadTopologyData()` accept `layoutKey` instead of a prebuilt filter. Escape the key with PocketBase filter helpers or a fixed domain-to-key map. Include `updated` in layout fields and add tests for both keys.

- [ ] **Step 5: Run and commit**

Run the four new / modified tests, `npm run test:network-topology`, and `npm run typecheck`. Expected: PASS.

Commit:

```powershell
git add internal/site/src/modules/network-topology/layout-persistence.ts internal/site/src/modules/network-topology/layout-persistence.test.ts internal/site/src/modules/network-topology/workspace-state.ts internal/site/src/modules/network-topology/workspace-state.test.ts internal/site/src/modules/network-topology/topology-data-query.ts internal/site/src/modules/network-topology/topology-data-query.test.ts internal/site/package.json
git commit -m "feat: persist topology workspaces safely"
```

---

### Task 6: Render Compact Nodes, Media-Specific Edges, and Toolbar

**Files:**
- Create: `internal/site/src/modules/network-topology/components/topology-free-node.tsx`
- Create: `internal/site/src/modules/network-topology/components/topology-free-edge.tsx`
- Create: `internal/site/src/modules/network-topology/components/topology-workspace-toolbar.tsx`
- Create: `internal/site/src/modules/network-topology/components/topology-workspace.tsx`
- Modify: `internal/site/src/index.css`
- Modify: `internal/site/src/modules/network-topology/workspace-data.test.ts`

- [ ] **Step 1: Add failing source-contract tests**

Extend `workspace-data.test.ts` to assert the new component sources contain:

```ts
assert.ok(nodeSource.includes('id="top"'))
assert.ok(nodeSource.includes('id="right"'))
assert.ok(nodeSource.includes('id="bottom"'))
assert.ok(nodeSource.includes('id="left"'))
assert.ok(edgeSource.includes('data.medium === "wifi"'))
assert.ok(edgeSource.includes('data.medium === "fiber"'))
assert.equal(workspaceSource.includes("pulse-matrix-band"), false)
```

Also assert the toolbar has fixed-height icon controls and separate home / technology links.

- [ ] **Step 2: Verify the source-contract tests fail**

Run `node --experimental-strip-types src/modules/network-topology/workspace-data.test.ts`. Expected: missing files or failed source assertions.

- [ ] **Step 3: Implement the node**

`TopologyFreeNode` renders a fixed-size compact card and four `Handle` elements. Use `ConnectionMode.Loose` at workspace level so every side can start or receive a connection. Hide Handle interaction when `readOnly` is true, but keep endpoints measurable so edges remain visible.

- [ ] **Step 4: Implement the edge**

Use `buildWaypointPath()` from `canvas-core`. Render:

- wired: orthogonal solid path and square endpoint markers;
- wifi: smooth dashed path and centered Wi-Fi icon;
- fiber: wide translucent underlay plus narrow foreground path and round endpoint markers.

Selected edges render waypoint handles and segment add buttons. Hover / selection reveals interface and speed labels; default state hides them.

- [ ] **Step 5: Implement toolbar and workspace shell**

The toolbar exposes callbacks only:

```ts
type TopologyWorkspaceToolbarProps = {
	domain: TopologyDomain
	stats: { devices: number; links: number; ports: number; wireless: number }
	dirty: boolean
	readOnly: boolean
	canUndo: boolean
	canRedo: boolean
	onUndo(): void
	onRedo(): void
	onAutoLayout(): void
	onSave(): void
}
```

The workspace uses a point-grid `Background`, no network bands, no fixed columns, and no decorative outer card. `onAutoLayout` calls `createSuggestedLayout()` and pushes the resulting positions into local history; it never saves automatically.

- [ ] **Step 6: Run and commit**

Run `npm run test:network-topology`, `npm run typecheck`, and `npx biome check` for the new files. Expected: PASS.

Commit:

```powershell
git add internal/site/src/modules/network-topology/components/topology-free-node.tsx internal/site/src/modules/network-topology/components/topology-free-edge.tsx internal/site/src/modules/network-topology/components/topology-workspace-toolbar.tsx internal/site/src/modules/network-topology/components/topology-workspace.tsx internal/site/src/modules/network-topology/workspace-data.test.ts internal/site/src/index.css
git commit -m "feat: render the free topology workspace"
```

---

### Task 7: Add Real-Relation Connection, Reconnect, and Delete Flows

**Files:**
- Create: `internal/site/src/modules/network-topology/components/topology-connection-sheet.tsx`
- Create: `internal/site/src/modules/network-topology/relation-operations.ts`
- Create: `internal/site/src/modules/network-topology/relation-operations.test.ts`
- Modify: `internal/site/src/modules/network-topology/components/topology-workspace.tsx`
- Modify: `internal/site/src/modules/network-topology/components/topology-inspector-sheet.tsx`
- Modify: `internal/site/package.json`

- [ ] **Step 1: Write failing relation payload tests**

Create tests for create, reconnect and delete payloads:

```ts
const payload = buildNetworkRelationPayload({
	user: "user-a",
	sourceAsset: "asset-a",
	targetAsset: "asset-b",
	sourceInterface: "if-a",
	targetInterface: "if-b",
	domain: "technology",
	medium: "wired",
	metadata: { keep: true },
})

assert.equal(payload.kind, "connected_to")
assert.deepEqual(payload.metadata, {
	keep: true,
	source_interface: "if-a",
	target_interface: "if-b",
	network_domain: "technology",
	link_kind: "ethernet",
})
```

Assert missing interface IDs produce `{ ok: false, reason: "missing-interface" }` instead of a payload.

- [ ] **Step 2: Implement pure relation operations**

Expose `buildNetworkRelationPayload()` and `validateInterfaceOwnership()`. Validation must confirm each interface belongs to the selected asset and reject same-asset loops unless explicitly allowed by a future rule.

- [ ] **Step 3: Implement the connection Sheet**

The Sheet receives selected source / target assets and lists only their real interfaces. Required fields are source interface, target interface, domain, and medium. Saving calls `pb.collection("asset_relations").create()` or `.update()` once; errors remain visible in the Sheet and keep the draft edge.

- [ ] **Step 4: Implement reconnect and delete**

Edge reconnect opens the same Sheet with existing values. Delete uses `AlertDialog`, calls `asset_relations.delete(id)`, and removes the edge only after success. Node deletion routes to the asset center and never deletes `assets` from the topology canvas.

- [ ] **Step 5: Verify read-only behavior**

Add source-contract assertions that `isReadOnlyUser()` disables Handle connections, hides edit / delete controls, and prevents relation mutations even when callbacks are invoked programmatically.

- [ ] **Step 6: Run and commit**

Run relation tests, `npm run test:network-topology`, and `npm run typecheck`. Expected: PASS.

Commit:

```powershell
git add internal/site/src/modules/network-topology/components/topology-connection-sheet.tsx internal/site/src/modules/network-topology/relation-operations.ts internal/site/src/modules/network-topology/relation-operations.test.ts internal/site/src/modules/network-topology/components/topology-workspace.tsx internal/site/src/modules/network-topology/components/topology-inspector-sheet.tsx internal/site/package.json
git commit -m "feat: edit real topology relations"
```

---

### Task 8: Wire Dual Routes and Preserve the Home Overview

**Files:**
- Modify: `internal/site/src/components/router.tsx`
- Modify: `internal/site/src/main.tsx`
- Modify: `internal/site/src/components/routes/network.tsx`
- Modify: `internal/site/src/components/routes/home-network-topology.tsx`
- Modify: `internal/site/src/modules/network-topology/manifest.ts`
- Modify: `internal/site/src/components/navbar.tsx`
- Modify: `internal/site/src/modules/network-topology/workspace-data.test.ts`

- [ ] **Step 1: Write failing route tests**

Add source assertions for:

```ts
assert.ok(routerSource.includes('network: "/network/:domain?"'))
assert.ok(networkPageSource.includes('domain === "technology" ? "technology" : "home"'))
assert.ok(manifestSource.includes('"/network/home"'))
assert.ok(manifestSource.includes('"/network/technology"'))
```

Assert `/network` defaults to the last valid domain from local storage and otherwise `home`.

- [ ] **Step 2: Modify the router and page handoff**

Change the route to `/network/:domain?`, pass `page.params.domain` through `main.tsx`, and normalize unknown values to `home`. Store the last domain in `localStorage` under `pulse.network.last-domain` only after a valid route renders.

- [ ] **Step 3: Wire full-page workspace**

`network.tsx` mounts `TopologyWorkspace` with the normalized domain and the current systems store. The toolbar switches routes with `getPagePath($router, "network", { domain: "home" })` and `technology`.

- [ ] **Step 4: Preserve the homepage as read-only**

Reduce `home-network-topology.tsx` to a home-domain read-only wrapper. It must reuse `pulse-adapter`, hide Handles without removing their layout anchors, disable zoom / edit controls, and link to `/network/home`.

- [ ] **Step 5: Update module ownership and navigation**

Add both routes to the manifest and make the navbar target `/network/home`. `getModuleForAppRoute()` continues mapping route name `network` to `network-topology`.

- [ ] **Step 6: Run and commit**

Run `npm run test:modules`, `npm run test:network-topology`, `npm run typecheck`, and `npm run build`. Expected: PASS.

Commit:

```powershell
git add internal/site/src/components/router.tsx internal/site/src/main.tsx internal/site/src/components/routes/network.tsx internal/site/src/components/routes/home-network-topology.tsx internal/site/src/modules/network-topology/manifest.ts internal/site/src/components/navbar.tsx internal/site/src/modules/network-topology/workspace-data.test.ts
git commit -m "feat: split home and technology topology routes"
```

---

### Task 9: Cut Over from the Matrix and Add Desktop Browser Coverage

**Files:**
- Delete: `internal/site/src/modules/network-topology/topology-matrix.ts`
- Delete: `internal/site/src/modules/network-topology/topology-matrix.test.ts`
- Delete: `internal/site/src/modules/network-topology/topology-matrix-layout.ts`
- Delete: `internal/site/src/modules/network-topology/topology-matrix-layout.test.ts`
- Delete: `internal/site/src/modules/network-topology/components/topology-matrix-node.tsx`
- Delete: `internal/site/src/modules/network-topology/components/topology-matrix-edge.tsx`
- Create: `internal/site/playwright.config.ts`
- Create: `internal/site/e2e/network-topology.spec.ts`
- Modify: `internal/site/package.json`

- [ ] **Step 1: Prove the old matrix is unreferenced**

Run:

```powershell
rg -n "TopologyMatrix|topology-matrix|pulse-matrix-band" internal/site/src
```

Expected: references appear only in files scheduled for deletion and old test-script entries. If another live reference exists, migrate it before deletion.

- [ ] **Step 2: Delete old matrix files and update scripts**

Remove the six files with `apply_patch`, remove their commands from `test:network-topology`, and run the complete topology tests. Expected: PASS without missing imports.

- [ ] **Step 3: Add Playwright configuration**

Configure:

```ts
import { defineConfig } from "playwright/test"

export default defineConfig({
	testDir: "./e2e",
	use: { baseURL: "http://127.0.0.1:5173", trace: "retain-on-failure" },
	webServer: { command: "npm run dev -- --host 127.0.0.1", url: "http://127.0.0.1:5173", reuseExistingServer: true },
})
```

Add `test:e2e:network-topology` to `package.json`.

- [ ] **Step 4: Add desktop interaction tests**

The test file must cover viewports `2494 × 1194` and `1727 × 1272`, visit both routes, verify no network bands, drag a node, open a relation, distinguish all three media classes, open the inspector, and verify no overlap with the toolbar. Require `PULSE_E2E_EMAIL` and `PULSE_E2E_PASSWORD` for a dedicated local non-MFA development user; fail in `beforeAll` with a clear message when either variable is absent. Log in through `input[name="email"]`, `input[name="password"]`, and the form submit button. Never hard-code credentials or commit Playwright storage state.

- [ ] **Step 5: Run browser and pixel verification**

Start local source development using the project script:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental/scripts/run-hub-dev.ps1 -Restart
cd internal/site
npm run test:e2e:network-topology
```

Expected: all desktop projects PASS, screenshots show a nonblank point grid, nodes remain inside the canvas, and links do not cover node labels.

- [ ] **Step 6: Run and commit**

Run `npm run test`, `npm run typecheck`, and `npm run build`. Expected: PASS.

Commit the cutover and browser tests:

```powershell
git add internal/site/src/modules/network-topology internal/site/playwright.config.ts internal/site/e2e/network-topology.spec.ts internal/site/package.json
git commit -m "test: cover the free topology workspace"
```

---

### Task 10: Release Notes, About History, and Final Verification

**Files:**
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`
- Modify: `internal/site/src/modules/network-topology/manifest.ts`

- [ ] **Step 1: Update release notes**

Add a Web / Hub entry that states:

- Homelable topology editing core was migrated under MIT with a pinned source revision;
- home and technology networks now have independent pages and layouts;
- nodes support free drag and four-side connections;
- wired, Wi-Fi and fiber links have distinct rendering and editable waypoints;
- all saved links remain Pulse asset relations with real interfaces;
- save conflict, failure recovery and read-only behavior are covered.

- [ ] **Step 2: Update About history**

Add the same user-facing behavior under the current `1.0.6` Web / Hub section. Do not claim Agent, Android or deployment changes beyond “no behavior change” unless implementation actually touches them.

- [ ] **Step 3: Verify the module manifest**

Confirm `network-topology` owns the new routes, collections and source paths, depends on `asset-center`, and does not claim scanner or Agent capabilities that were not added.

- [ ] **Step 4: Run the full verification suite**

Run from `internal/site`:

```powershell
npm run test
npm run typecheck
npm run check
npm run build
npm run test:e2e:network-topology
```

Run from the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental/scripts/check-version-consistency.ps1 -Version 1.0.6
git diff --check
```

Expected: every command exits `0`; no test, type, formatting, build, browser, version or whitespace errors.

- [ ] **Step 5: Inspect the final diff**

Run:

```powershell
git status --short
git diff --stat
git diff -- docs/release-notes-next.md internal/site/src/components/routes/settings/release-history.ts
```

Expected: only planned implementation files plus pre-existing user changes remain. Confirm no `.superpowers/brainstorm` files are staged.

- [ ] **Step 6: Commit the release documentation**

```powershell
git add docs/release-notes-next.md internal/site/src/components/routes/settings/release-history.ts internal/site/src/modules/network-topology/manifest.ts
git commit -m "docs: record free topology workspace"
```

---

## Final Acceptance Checklist

- [ ] `/network/home` and `/network/technology` load independently.
- [ ] `/network` opens the last valid domain or defaults to home.
- [ ] Four sides of every editable node can start or receive a connection.
- [ ] Wired, Wi-Fi and fiber links are distinguishable without relying on color.
- [ ] Waypoints can be added, moved, removed and preserved after node drag.
- [ ] Relation creation requires real source and target interfaces.
- [ ] Delete and reconnect mutate `asset_relations`, not a visual-only store.
- [ ] Layout changes use `network-home` and `network-technology` records.
- [ ] Conflict and request failure preserve local drafts.
- [ ] Read-only accounts cannot mutate relations or layouts.
- [ ] Homepage topology remains a compact read-only home-network overview.
- [ ] Homelable source and MIT attribution are recorded.
- [ ] Old matrix files and tests are removed only after the free workspace passes.
- [ ] Unit, type, lint, build, Playwright and version checks pass.
- [ ] Release notes and About history match the implemented behavior.
