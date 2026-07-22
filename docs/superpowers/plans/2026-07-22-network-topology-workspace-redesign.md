# Network Topology Workspace Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/network` 改造成按网络域和上下联层级阅读的紧凑桌面拓扑工作台，同时保留真实资产关系、维护弹窗、拖拽与布局保存能力。

**Architecture:** 保留 `loadTopologyData()` 和 `buildTopologyGraph()` 作为数据读取与基础构图入口，在 `modules/network-topology` 新增分域、分层布局、选中聚焦和详情展示模型。完整页组合新的工具栏、域筛选与固定详情栏；首页只读总览继续复用基础画布但不加载维护 UI。

**Tech Stack:** React 19、TypeScript 6、Vite 8、Tailwind CSS 4、shadcn/Radix UI、`@xyflow/react`、`@dagrejs/dagre`、Node Test Runner、Biome。

---

## 文件结构

- Create: `internal/site/src/modules/network-topology/topology-domains.ts` — 连通分量、根节点、层级、域名称与诊断。
- Create: `internal/site/src/modules/network-topology/topology-domains.test.ts` — 家庭网、科技网、孤立节点与环路测试。
- Create: `internal/site/src/modules/network-topology/topology-layout.ts` — Dagre 自动布局和多域坐标规整。
- Create: `internal/site/src/modules/network-topology/topology-layout.test.ts` — 坐标稳定性、层级方向和域间隔测试。
- Create: `internal/site/src/modules/network-topology/topology-selection.ts` — 域筛选、URL 聚焦和邻接强调模型。
- Create: `internal/site/src/modules/network-topology/topology-selection.test.ts` — 节点 / 链路聚焦和无关元素淡化测试。
- Create: `internal/site/src/modules/network-topology/topology-inspector-model.ts` — 域、节点和链路详情模型。
- Create: `internal/site/src/modules/network-topology/topology-inspector-model.test.ts` — 上联、下联、接口、缺失端点和域诊断测试。
- Create: `internal/site/src/modules/network-topology/components/topology-workspace-toolbar.tsx` — 标题、统计、域筛选和工作台操作。
- Create: `internal/site/src/modules/network-topology/components/topology-inspector.tsx` — 固定详情栏和窄窗口 Sheet。
- Create: `internal/site/src/modules/network-topology/components/topology-canvas-elements.tsx` — 紧凑节点和克制链路渲染。
- Modify: `internal/site/src/components/routes/home-network-topology.tsx` — 组合新模型与组件，保留加载、保存和弹窗状态。
- Modify: `internal/site/src/lib/network-topology.ts` — 补充节点展示数据和布局 payload 字段，移除已迁出的渲染职责。
- Modify: `internal/site/src/types.d.ts` — 为 `network_layouts.layout` 增加当前网络域字段。
- Modify: `internal/site/src/index.css` — 更新链路线型、选中态、淡化态与动画规则。
- Modify: `internal/site/package.json` / `internal/site/package-lock.json` — 增加 Dagre 并纳入定向测试。
- Modify: `docs/release-notes-next.md` — 追加 Web / Hub 开发记录。
- Modify: `internal/site/src/components/routes/settings/release-history.ts` — 同步 About 页 Web / Hub 版本记录。

### Task 1: 引入稳定的分层布局依赖

**Files:**
- Modify: `internal/site/package.json`
- Modify: `internal/site/package-lock.json`

- [ ] **Step 1: 检查当前依赖中没有重复的图布局库**

Run:

```powershell
Set-Location internal/site
npm ls @dagrejs/dagre dagre elkjs
```

Expected: 当前没有已安装的分层图布局依赖；若命令以缺失依赖退出，继续下一步。

- [ ] **Step 2: 安装 Dagre**

Run:

```powershell
Set-Location internal/site
npm install @dagrejs/dagre
```

Expected: `package.json` 和 `package-lock.json` 只新增 Dagre 及其必要依赖，安装无高危错误。

- [ ] **Step 3: 验证依赖可被 ESM 导入**

Run:

```powershell
Set-Location internal/site
node --input-type=module -e "import dagre from '@dagrejs/dagre'; console.log(typeof dagre.layout)"
```

Expected: 输出 `function`。

- [ ] **Step 4: 提交依赖变更**

```powershell
git add internal/site/package.json internal/site/package-lock.json
git commit -m "build: add topology layout engine"
```

### Task 2: 建立网络域与层级模型

**Files:**
- Create: `internal/site/src/modules/network-topology/topology-domains.ts`
- Create: `internal/site/src/modules/network-topology/topology-domains.test.ts`
- Modify: `internal/site/package.json`

- [ ] **Step 1: 写分域和层级失败测试**

Create `topology-domains.test.ts`，使用最小 React Flow 节点 / 边 fixture：

```ts
import assert from "node:assert/strict"
import test from "node:test"
import type { Edge, Node } from "@xyflow/react"
import type { TopologyEdgeData, TopologyNodeData } from "@/lib/network-topology"
import type { AssetRecord, AssetType } from "@/types"
import { buildTopologyDomains } from "./topology-domains.ts"

const asset = (id: string, name: string, type: AssetType) =>
	({
		id,
		user: "user-1",
		name,
		type,
		created: "",
		updated: "",
		collectionId: "assets",
		collectionName: "assets",
	}) as AssetRecord

const node = (id: string, title: string, type: AssetType) =>
	({
		id,
		position: { x: 0, y: 0 },
		data: { kind: "asset", title, subtitle: type, meta: [], connectionBadges: [], availableConnectionBadges: [], asset: asset(id, title, type) },
	}) as Node<TopologyNodeData>

const edge = (id: string, source: string, target: string) =>
	({ id, source, target, data: { link: { id, kind: "ethernet" }, speedLabel: "--", trafficLabel: "--" } }) as Edge<TopologyEdgeData>

test("splits home and technology networks into stable domains", () => {
	const nodes = [
		node("internet", "宽带", "internet"),
		node("ont", "华为主网关", "ont"),
		node("tech", "科技网", "custom"),
		node("router", "小米 BE7000", "router"),
	]
	const domains = buildTopologyDomains(nodes, [edge("a", "internet", "ont"), edge("b", "tech", "router")])
	assert.deepEqual(domains.map((item) => item.label), ["家庭网络", "科技网"])
	assert.deepEqual(domains.map((item) => item.levels.map((level) => level.nodeIds)), [
		[["internet"], ["ont"]],
		[["tech"], ["router"]],
	])
})

test("isolated nodes use an unconnected domain", () => {
	const domains = buildTopologyDomains([node("nas", "备用 NAS", "nas")], [])
	assert.equal(domains[0]?.label, "未连接")
	assert.deepEqual(domains[0]?.diagnostics, [{ kind: "isolated", nodeIds: ["nas"] }])
})

test("cycles terminate and report a diagnostic", () => {
	const nodes = [node("a", "A", "router"), node("b", "B", "switch"), node("c", "C", "ap")]
	const domains = buildTopologyDomains(nodes, [edge("ab", "a", "b"), edge("bc", "b", "c"), edge("ca", "c", "a")])
	assert.equal(domains[0]?.diagnostics.some((item) => item.kind === "cycle"), true)
	assert.equal(new Set(domains[0]?.levels.flatMap((item) => item.nodeIds)).size, 3)
})
```

在实际测试中把 fixture 的 `asset` 完整断言为 `AssetRecord`，不要用条件类型绕过类型检查。

- [ ] **Step 2: 运行测试并确认失败**

Run:

```powershell
Set-Location internal/site
node --experimental-strip-types src/modules/network-topology/topology-domains.test.ts
```

Expected: FAIL，原因是 `topology-domains.ts` 尚不存在。

- [ ] **Step 3: 实现纯函数模型**

Create `topology-domains.ts`，公开稳定类型与入口：

```ts
import type { Edge, Node } from "@xyflow/react"
import type { TopologyEdgeData, TopologyNodeData } from "@/lib/network-topology"

export type TopologyDomainDiagnostic =
	| { kind: "isolated"; nodeIds: string[] }
	| { kind: "cycle"; nodeIds: string[] }
	| { kind: "missing-endpoint"; edgeIds: string[] }

export type TopologyDomain = {
	id: string
	label: string
	rootNodeIds: string[]
	nodeIds: string[]
	edgeIds: string[]
	levels: { depth: number; nodeIds: string[] }[]
	diagnostics: TopologyDomainDiagnostic[]
	summary: { devices: number; links: number; wireless: number }
}

export function buildTopologyDomains(
	nodes: Node<TopologyNodeData>[],
	edges: Edge<TopologyEdgeData>[]
): TopologyDomain[] {
	const nodesById = new Map(nodes.map((item) => [item.id, item]))
	const validEdges = edges.filter((item) => nodesById.has(item.source) && nodesById.has(item.target))
	const missingEndpointEdges = edges.filter((item) => !nodesById.has(item.source) || !nodesById.has(item.target))
	const neighbors = new Map(nodes.map((item) => [item.id, new Set<string>()]))
	for (const item of validEdges) {
		neighbors.get(item.source)?.add(item.target)
		neighbors.get(item.target)?.add(item.source)
	}
	const visited = new Set<string>()
	const components: string[][] = []
	for (const item of nodes.slice().sort(compareNodes)) {
		if (visited.has(item.id)) continue
		const queue = [item.id]
		const component: string[] = []
		visited.add(item.id)
		while (queue.length > 0) {
			const current = queue.shift()
			if (!current) continue
			component.push(current)
			for (const peer of neighbors.get(current) ?? []) {
				if (visited.has(peer)) continue
				visited.add(peer)
				queue.push(peer)
			}
		}
		components.push(component.sort((a, b) => compareNodes(nodesById.get(a)!, nodesById.get(b)!)))
	}
	return components
		.map((nodeIds) => {
			const domain = buildDomain(nodeIds, nodesById, validEdges)
			const nodeIdSet = new Set(nodeIds)
			const edgeIds = missingEndpointEdges
				.filter((item) => nodeIdSet.has(item.source) || nodeIdSet.has(item.target))
				.map((item) => item.id)
			return edgeIds.length > 0
				? { ...domain, diagnostics: [...domain.diagnostics, { kind: "missing-endpoint" as const, edgeIds }] }
				: domain
		})
		.sort(compareDomains)
}
```

在同文件实现 `buildDomain()`、根节点优先级、BFS 最短层级、稳定排序与有向环检测。只有包含 `internet` 资产的首个域使用“家庭网络”；没有 `internet` 的域使用根资产名称；单节点无边域统一使用“未连接”。

- [ ] **Step 4: 运行测试并确认通过**

Run:

```powershell
Set-Location internal/site
node --experimental-strip-types src/modules/network-topology/topology-domains.test.ts
```

Expected: 3 个测试全部 PASS。

- [ ] **Step 5: 把测试加入定向入口并提交**

在 `package.json` 的 `test:network-topology` 中加入：

```json
"node --experimental-strip-types src/modules/network-topology/topology-domains.test.ts"
```

Run:

```powershell
git add internal/site/src/modules/network-topology/topology-domains.ts internal/site/src/modules/network-topology/topology-domains.test.ts internal/site/package.json
git commit -m "feat: model topology network domains"
```

### Task 3: 实现多域自动布局

**Files:**
- Create: `internal/site/src/modules/network-topology/topology-layout.ts`
- Create: `internal/site/src/modules/network-topology/topology-layout.test.ts`
- Modify: `internal/site/package.json`

- [ ] **Step 1: 写坐标稳定性失败测试**

```ts
import assert from "node:assert/strict"
import test from "node:test"
import { layoutTopologyDomains } from "./topology-layout.ts"

test("places upstream nodes before downstream nodes", () => {
	const result = layoutTopologyDomains(domainsFixture, nodesFixture, edgesFixture)
	const positions = new Map(result.map((item) => [item.id, item.position]))
	assert.ok(positions.get("internet")!.x < positions.get("ont")!.x)
	assert.ok(positions.get("ont")!.x < positions.get("switch")!.x)
})

test("returns deterministic positions and separates domains", () => {
	const first = layoutTopologyDomains(domainsFixture, nodesFixture, edgesFixture)
	const second = layoutTopologyDomains(domainsFixture, nodesFixture, edgesFixture)
	assert.deepEqual(first.map((item) => item.position), second.map((item) => item.position))
	const homeBounds = getBounds(first, new Set(domainsFixture[0].nodeIds))
	const techBounds = getBounds(first, new Set(domainsFixture[1].nodeIds))
	assert.ok(homeBounds.bottom + 84 <= techBounds.top)
})

function getBounds(nodes: typeof nodesFixture, ids: Set<string>) {
	const selected = nodes.filter((item) => ids.has(item.id))
	return {
		top: Math.min(...selected.map((item) => item.position.y)),
		bottom: Math.max(...selected.map((item) => item.position.y + 148)),
	}
}
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```powershell
Set-Location internal/site
node --experimental-strip-types src/modules/network-topology/topology-layout.test.ts
```

Expected: FAIL，原因是布局模块尚不存在。

- [ ] **Step 3: 使用 Dagre 实现布局**

```ts
import dagre from "@dagrejs/dagre"
import type { Edge, Node } from "@xyflow/react"
import {
	TOPOLOGY_GRID_SIZE,
	TOPOLOGY_NODE_HEIGHT,
	TOPOLOGY_NODE_WIDTH,
	type TopologyEdgeData,
	type TopologyNodeData,
} from "@/lib/network-topology"
import type { TopologyDomain } from "./topology-domains.ts"

const DOMAIN_GAP_Y = 112

export function layoutTopologyDomains(
	domains: TopologyDomain[],
	nodes: Node<TopologyNodeData>[],
	edges: Edge<TopologyEdgeData>[]
) {
	const nodesById = new Map(nodes.map((item) => [item.id, item]))
	let offsetY = 56
	const positions = new Map<string, { x: number; y: number }>()
	for (const domain of domains) {
		const graph = new dagre.graphlib.Graph()
		graph.setGraph({ rankdir: "LR", ranksep: 96, nodesep: 52, marginx: 28, marginy: 28 })
		graph.setDefaultEdgeLabel(() => ({}))
		for (const id of domain.nodeIds) graph.setNode(id, { width: TOPOLOGY_NODE_WIDTH, height: TOPOLOGY_NODE_HEIGHT })
		for (const item of edges.filter((edge) => domain.edgeIds.includes(edge.id))) graph.setEdge(item.source, item.target)
		dagre.layout(graph)
		let domainBottom = offsetY
		for (const id of domain.nodeIds) {
			const point = graph.node(id)
			const position = snap({ x: point.x - TOPOLOGY_NODE_WIDTH / 2 + 56, y: point.y - TOPOLOGY_NODE_HEIGHT / 2 + offsetY })
			positions.set(id, position)
			domainBottom = Math.max(domainBottom, position.y + TOPOLOGY_NODE_HEIGHT)
		}
		offsetY = domainBottom + DOMAIN_GAP_Y
	}
	return nodes.map((item) => ({ ...item, position: positions.get(item.id) ?? item.position }))
}

function snap(point: { x: number; y: number }) {
	return {
		x: Math.round(point.x / TOPOLOGY_GRID_SIZE) * TOPOLOGY_GRID_SIZE,
		y: Math.round(point.y / TOPOLOGY_GRID_SIZE) * TOPOLOGY_GRID_SIZE,
	}
}
```

实现时用 `Set` 缓存域边 ID，避免在节点循环中反复 `includes()`；测试中的 fixture 必须覆盖分叉和两个网络域。

- [ ] **Step 4: 运行测试并纳入定向入口**

Run:

```powershell
Set-Location internal/site
node --experimental-strip-types src/modules/network-topology/topology-layout.test.ts
npm run test:network-topology
```

Expected: 新布局测试及现有拓扑测试全部 PASS。

- [ ] **Step 5: 提交布局模块**

```powershell
git add internal/site/src/modules/network-topology/topology-layout.ts internal/site/src/modules/network-topology/topology-layout.test.ts internal/site/package.json
git commit -m "feat: add layered topology layout"
```

### Task 4: 建立域筛选与选中聚焦模型

**Files:**
- Create: `internal/site/src/modules/network-topology/topology-selection.ts`
- Create: `internal/site/src/modules/network-topology/topology-selection.test.ts`
- Modify: `internal/site/package.json`

- [ ] **Step 1: 写筛选和邻接强调失败测试**

```ts
test("keeps the selected node and direct neighbors emphasized", () => {
	const result = getTopologyFocusSet(nodesFixture, edgesFixture, { nodeId: "switch" })
	assert.deepEqual([...result.emphasizedNodeIds].sort(), ["nas", "ont", "switch"])
	assert.deepEqual([...result.emphasizedEdgeIds].sort(), ["ont-switch", "switch-nas"])
	assert.equal(result.dimmedNodeIds.has("phone"), true)
})

test("filters graph elements by domain without mutating source arrays", () => {
	const result = filterTopologyByDomain(nodesFixture, edgesFixture, domainFixture)
	assert.deepEqual(result.nodes.map((item) => item.id), domainFixture.nodeIds)
	assert.equal(nodesFixture.length, 5)
})

test("resolves URL targets to their owning domain", () => {
	assert.equal(findFocusDomain(domainsFixture, { edgeId: "tech-router" })?.id, "tech")
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```powershell
Set-Location internal/site
node --experimental-strip-types src/modules/network-topology/topology-selection.test.ts
```

Expected: FAIL，原因是选择模型尚不存在。

- [ ] **Step 3: 实现无副作用的选择模型**

```ts
export type TopologySelection = { nodeId?: string; edgeId?: string }

export function getTopologyFocusSet(nodes: TopologyNode[], edges: TopologyEdge[], selection?: TopologySelection) {
	const emphasizedNodeIds = new Set<string>()
	const emphasizedEdgeIds = new Set<string>()
	if (selection?.nodeId) {
		emphasizedNodeIds.add(selection.nodeId)
		for (const item of edges) {
			if (item.source !== selection.nodeId && item.target !== selection.nodeId) continue
			emphasizedEdgeIds.add(item.id)
			emphasizedNodeIds.add(item.source)
			emphasizedNodeIds.add(item.target)
		}
	}
	if (selection?.edgeId) {
		const item = edges.find((edge) => edge.id === selection.edgeId)
		if (item) {
			emphasizedEdgeIds.add(item.id)
			emphasizedNodeIds.add(item.source)
			emphasizedNodeIds.add(item.target)
		}
	}
	return {
		emphasizedNodeIds,
		emphasizedEdgeIds,
		dimmedNodeIds: new Set(nodes.filter((item) => emphasizedNodeIds.size > 0 && !emphasizedNodeIds.has(item.id)).map((item) => item.id)),
		dimmedEdgeIds: new Set(edges.filter((item) => emphasizedEdgeIds.size > 0 && !emphasizedEdgeIds.has(item.id)).map((item) => item.id)),
	}
}
```

同文件实现 `filterTopologyByDomain()` 与 `findFocusDomain()`，返回新数组但保留节点 / 边对象引用。

- [ ] **Step 4: 运行测试并提交**

Run:

```powershell
Set-Location internal/site
node --experimental-strip-types src/modules/network-topology/topology-selection.test.ts
```

Expected: 所有选择模型测试 PASS。

```powershell
git add internal/site/src/modules/network-topology/topology-selection.ts internal/site/src/modules/network-topology/topology-selection.test.ts internal/site/package.json
git commit -m "feat: add topology focus model"
```

### Task 5: 建立右侧详情展示模型

**Files:**
- Create: `internal/site/src/modules/network-topology/topology-inspector-model.ts`
- Create: `internal/site/src/modules/network-topology/topology-inspector-model.test.ts`
- Modify: `internal/site/package.json`

- [ ] **Step 1: 写三种详情状态失败测试**

```ts
test("builds domain overview with diagnostics and unlinked systems", () => {
	const model = buildTopologyInspectorModel({ domain, graph, assets, interfaces, relations, systems, topologyPorts })
	assert.equal(model.kind, "domain")
	assert.equal(model.summary.links, 3)
	assert.deepEqual(model.attention.map((item) => item.label), ["1 个接口端点待确认"])
})

test("builds node uplinks downlinks and interface rows", () => {
	const model = buildTopologyInspectorModel({ selection: { nodeId: "asset-switch" }, domain, graph, assets, interfaces, relations, systems, topologyPorts })
	assert.equal(model.kind, "node")
	assert.deepEqual(model.uplinks.map((item) => item.peer), ["华为主网关"])
	assert.deepEqual(model.downlinks.map((item) => item.peer), ["飞牛 NAS"])
	assert.deepEqual(model.interfaces.map((item) => item.name), ["LAN 1", "LAN 2"])
})

test("builds edge endpoints without inventing missing interfaces", () => {
	const model = buildTopologyInspectorModel({ selection: { edgeId: "asset-relation-r1" }, domain, graph, assets, interfaces, relations, systems, topologyPorts })
	assert.equal(model.kind, "edge")
	assert.equal(model.source.interfaceName, "LAN 1")
	assert.equal(model.target.interfaceName, "接口待确认")
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```powershell
Set-Location internal/site
node --experimental-strip-types src/modules/network-topology/topology-inspector-model.test.ts
```

Expected: FAIL，原因是详情模型尚不存在。

- [ ] **Step 3: 实现判别联合类型和构建函数**

```ts
export type TopologyInspectorModel =
	| { kind: "domain"; title: string; summary: TopologyDomain["summary"]; attention: InspectorNotice[]; unlinkedSystems: SystemRecord[] }
	| { kind: "node"; nodeId: string; title: string; subtitle: string; ipv4?: string; managementUrl?: string; status?: string; uplinks: InspectorRelation[]; downlinks: InspectorRelation[]; interfaces: InspectorInterface[] }
	| { kind: "edge"; edgeId: string; title: string; direction: string; linkKind: string; speed: string; source: InspectorEndpoint; target: InspectorEndpoint; relationId?: string }

export function buildTopologyInspectorModel(input: BuildTopologyInspectorInput): TopologyInspectorModel {
	if (input.selection?.edgeId) return buildEdgeInspector(input)
	if (input.selection?.nodeId) return buildNodeInspector(input)
	return buildDomainInspector(input)
}
```

节点方向统一调用现有 `getAssetNetworkRelationDirection()`；接口名称和速率调用现有资产接口格式化函数；只读取 `metadata.source_interface`、`metadata.target_interface` 和 `metadata.link_kind` 的真实值。缺失端点返回“接口待确认”，不能回退到任意第一个接口。

- [ ] **Step 4: 运行测试并提交**

Run:

```powershell
Set-Location internal/site
node --experimental-strip-types src/modules/network-topology/topology-inspector-model.test.ts
npm run test:network-topology
```

Expected: 新增测试和全部拓扑定向测试 PASS。

```powershell
git add internal/site/src/modules/network-topology/topology-inspector-model.ts internal/site/src/modules/network-topology/topology-inspector-model.test.ts internal/site/package.json
git commit -m "feat: model topology inspector details"
```

### Task 6: 重做节点与链路视觉组件

**Files:**
- Create: `internal/site/src/modules/network-topology/components/topology-canvas-elements.tsx`
- Modify: `internal/site/src/components/routes/home-network-topology.tsx`
- Modify: `internal/site/src/lib/network-topology.ts`
- Modify: `internal/site/src/index.css`
- Test: `internal/site/src/modules/network-topology/workspace-data.test.ts`

- [ ] **Step 1: 先写节点尺寸和链路动画契约测试**

在 `workspace-data.test.ts` 增加：

```ts
test("topology canvas uses compact fixed nodes and quiet links", () => {
	const source = readFileSync(new URL("./components/topology-canvas-elements.tsx", import.meta.url), "utf8")
	const css = readFileSync(new URL("../../index.css", import.meta.url), "utf8")
	assert.ok(source.includes("已连接"), "网络设备节点应显示接口占用摘要")
	assert.ok(source.includes("data-dimmed"), "节点和链路应支持无关对象淡化")
	assert.equal(css.includes("pulse-topology-packet-forward"), false, "默认链路不应持续播放数据脉冲")
	assert.ok(css.includes("stroke-dasharray"), "无线链路应有非颜色线型")
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```powershell
Set-Location internal/site
npm run test:network-topology
```

Expected: FAIL，因为新组件不存在且旧动画类仍存在。

- [ ] **Step 3: 抽出画布元素组件**

`topology-canvas-elements.tsx` 导出稳定映射：

```tsx
export const topologyNodeTypes = { pulseTopology: TopologyCanvasNode }
export const topologyEdgeTypes = { pulseTopologyLink: TopologyCanvasEdge }

export function TopologyCanvasNode({ id, data, selected }: NodeProps<Node<TopologyNodeData>>) {
	const dimmed = data.presentation === "dimmed"
	const { icon: Icon, label: iconLabel } = getTopologyNodeIcon(data)
	return (
		<div
			data-dimmed={dimmed || undefined}
			className={cn(
				"grid h-full w-full grid-rows-[auto_1fr] rounded-lg border bg-card p-2.5",
				dimmed && "opacity-30",
				selected && "border-primary ring-2 ring-primary/15"
			)}
		>
			<div className="flex min-w-0 items-start gap-2">
				<span className="grid size-8 shrink-0 place-items-center rounded-md border bg-surface-soft" title={iconLabel}>
					<Icon className="size-4" />
				</span>
				<div className="min-w-0 flex-1">
					<div className="truncate text-sm font-semibold">{data.title}</div>
					<div className="truncate text-[11px] text-muted-foreground">{data.subtitle}</div>
				</div>
				<span className={cn("mt-1 size-2 rounded-full", data.status ? getStatusDotClassName(data.status) : "bg-emerald-500")} />
			</div>
			<div className="mt-2 flex min-w-0 items-end justify-between gap-2 text-[11px] text-muted-foreground">
				<span className="truncate font-mono tabular-nums">{data.ipv4 || ""}</span>
				{typeof data.portCount === "number" && (
					<span className="shrink-0 tabular-nums">已连接 {data.connectedPortCount ?? 0}/{data.portCount}</span>
				)}
				{typeof data.wirelessClientCount === "number" && data.wirelessClientCount > 0 && (
					<span className="shrink-0 tabular-nums">无线 {data.wirelessClientCount}</span>
				)}
			</div>
			<Handle type="target" position={Position.Left} className="!size-2.5 !border-border !bg-card" />
			<Handle type="source" position={Position.Right} className="!size-2.5 !border-border !bg-card" />
		</div>
	)
}
```

把当前文件中的设备图标映射、状态标签、Tooltip 和节点详情事件一起迁入新组件。把节点宽高调整为固定紧凑尺寸，例如 `TOPOLOGY_NODE_WIDTH = 220`、`TOPOLOGY_NODE_HEIGHT = 104`，并让 `buildTopologyGraph()` 在 `TopologyNodeData` 中提供 `ipv4`、`connectedPortCount`、`wirelessClientCount` 和 `presentation`。

- [ ] **Step 4: 收紧链路样式**

`TopologyCanvasEdge` 只渲染轨道与主路径：

```tsx
return (
	<>
		<path d={edgePath} fill="none" className="pulse-topology-link-underlay" />
		<BaseEdge id={id} path={edgePath} markerEnd={markerEnd} data-dimmed={data?.presentation === "dimmed" || undefined} className={cn("pulse-topology-link-path", tone.path, selected && "pulse-topology-link-path-selected")} />
	</>
)
```

删除 packet path 和对应 keyframes；Wi-Fi 使用 `stroke-dasharray`，光纤和互联网使用独立但克制的线型。链路 Tooltip 显示两端设备、接口、方式和速率。

- [ ] **Step 5: 运行测试、类型检查并提交**

Run:

```powershell
Set-Location internal/site
npm run test:network-topology
npm run typecheck
```

Expected: 测试和类型检查 PASS。

```powershell
git add internal/site/src/modules/network-topology/components/topology-canvas-elements.tsx internal/site/src/components/routes/home-network-topology.tsx internal/site/src/lib/network-topology.ts internal/site/src/index.css internal/site/src/modules/network-topology/workspace-data.test.ts
git commit -m "refactor: simplify topology canvas elements"
```

### Task 7: 实现工具栏、域筛选和右侧详情组件

**Files:**
- Create: `internal/site/src/modules/network-topology/components/topology-workspace-toolbar.tsx`
- Create: `internal/site/src/modules/network-topology/components/topology-inspector.tsx`
- Modify: `internal/site/src/modules/network-topology/workspace-data.test.ts`

- [ ] **Step 1: 写工作台组件契约失败测试**

```ts
test("topology workspace exposes compact domain navigation and inspector states", () => {
	const toolbar = readFileSync(new URL("./components/topology-workspace-toolbar.tsx", import.meta.url), "utf8")
	const inspector = readFileSync(new URL("./components/topology-inspector.tsx", import.meta.url), "utf8")
	assert.ok(toolbar.includes("全部"))
	assert.ok(toolbar.includes("自动整理"))
	assert.ok(toolbar.includes("DropdownMenuItem"))
	assert.ok(inspector.includes('model.kind === "domain"'))
	assert.ok(inspector.includes('model.kind === "node"'))
	assert.ok(inspector.includes('model.kind === "edge"'))
	assert.ok(inspector.includes("网口状态"))
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```powershell
Set-Location internal/site
npm run test:network-topology
```

Expected: FAIL，因为工作台组件尚不存在。

- [ ] **Step 3: 实现紧凑工具栏**

```tsx
export function TopologyWorkspaceToolbar(props: TopologyWorkspaceToolbarProps) {
	return (
		<div className="flex min-h-14 flex-wrap items-center gap-2 border-b border-border/70 bg-surface-soft px-4 py-2">
			<div className="flex min-w-0 items-center gap-2">
				<NetworkIcon className="size-4 text-muted-foreground" />
				<h1 className="text-lg font-semibold">网络拓扑</h1>
				<TopologyStats stats={props.stats} />
			</div>
			<div className="ms-auto flex items-center gap-1.5">
				<AddTopologyMenu disabled={props.readOnly} onDevice={props.onAddDevice} onPort={props.onAddPort} onLink={props.onAddLink} />
				<Button variant="outline" size="sm" onClick={props.onRefresh}><RefreshCwIcon />刷新</Button>
				<Button variant="outline" size="sm" onClick={props.onAutoLayout}><LayoutTemplateIcon />自动整理</Button>
				<Button variant="outline" size="sm" onClick={props.onSave} disabled={props.readOnly}><SaveIcon />保存布局</Button>
			</div>
			<TopologyDomainTabs domains={props.domains} value={props.domainId} onValueChange={props.onDomainChange} />
		</div>
	)
}
```

域切换使用现有 Tabs；统计保持固定高度；`新增`使用 DropdownMenu。所有按钮图标使用项目现有 Lucide 图标和 shadcn Button 尺寸。

- [ ] **Step 4: 实现详情栏三种状态**

`TopologyInspector` 只消费 `TopologyInspectorModel`，不读取 PocketBase：

```tsx
export function TopologyInspector({ model, onEditNode, onEditRelation }: TopologyInspectorProps) {
	if (model.kind === "domain") return <DomainInspector model={model} />
	if (model.kind === "edge") return <EdgeInspector model={model} onEdit={onEditRelation} />
	return <NodeInspector model={model} onEdit={onEditNode} />
}
```

`NodeInspector` 使用上联 / 下联紧凑记录和网口表格；没有对应数据时不渲染空卡。域概览展示诊断和未接入机器；无诊断时显示“连接关系完整”。窄窗口复用同一组件放入 Sheet，避免两套详情逻辑。

- [ ] **Step 5: 运行测试和类型检查并提交**

Run:

```powershell
Set-Location internal/site
npm run test:network-topology
npm run typecheck
```

Expected: 测试和类型检查 PASS。

```powershell
git add internal/site/src/modules/network-topology/components/topology-workspace-toolbar.tsx internal/site/src/modules/network-topology/components/topology-inspector.tsx internal/site/src/modules/network-topology/workspace-data.test.ts
git commit -m "feat: add topology workspace controls"
```

### Task 8: 把分域工作台接入完整拓扑页

**Files:**
- Modify: `internal/site/src/components/routes/home-network-topology.tsx`
- Modify: `internal/site/src/lib/network-topology.ts`
- Modify: `internal/site/src/types.d.ts`
- Modify: `internal/site/src/modules/network-topology/workspace-data.test.ts`

- [ ] **Step 1: 写页面集成失败测试**

把原有源代码契约改成新结构：

```ts
test("workspace integrates domains, auto layout and fixed inspector", () => {
	const source = readFileSync(new URL("../../components/routes/home-network-topology.tsx", import.meta.url), "utf8")
	assert.ok(source.includes("buildTopologyDomains"))
	assert.ok(source.includes("layoutTopologyDomains"))
	assert.ok(source.includes("TopologyWorkspaceToolbar"))
	assert.ok(source.includes("TopologyInspector"))
	assert.ok(source.includes("lg:grid-cols-[minmax(0,1fr)_20rem]"))
	assert.equal(source.includes("未选择节点"), false)
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```powershell
Set-Location internal/site
npm run test:network-topology
```

Expected: FAIL，因为页面还未使用新模型和组件。

- [ ] **Step 3: 接入状态和派生数据**

在 `NetworkTopologyPanel` 中增加：

```ts
const [activeDomainId, setActiveDomainId] = useState("all")
const [selection, setSelection] = useState<TopologySelection>()
const [loadError, setLoadError] = useState<string>()
const domains = useMemo(() => buildTopologyDomains(graph.nodes, graph.edges), [graph.nodes, graph.edges])
const activeDomain = useMemo(() => domains.find((item) => item.id === activeDomainId), [activeDomainId, domains])
const visibleGraph = useMemo(() => filterTopologyByDomain(graph.nodes, graph.edges, activeDomain), [activeDomain, graph.edges, graph.nodes])
const focusSet = useMemo(() => getTopologyFocusSet(visibleGraph.nodes, visibleGraph.edges, selection), [selection, visibleGraph])
const inspector = useMemo(() => buildTopologyInspectorModel({ selection, domain: activeDomain, graph, assets: topology.assets, interfaces: topology.interfaces, relations: topology.relations, systems, topologyPorts }), [activeDomain, graph, selection, systems, topology, topologyPorts])
```

URL 目标先通过 `findFocusDomain()` 切换域，再设置 `selection`。React Flow 的 `onSelectionChange` 同时记录节点或链路，不再把链路选择退化成源节点选择。

- [ ] **Step 4: 接入自动整理和布局保存**

```ts
const handleAutoLayout = useCallback(() => {
	setNodes((current) => layoutTopologyDomains(domains, current, edges))
	requestAnimationFrame(() => fitView({ padding: 0.12, duration: 320, maxZoom: 1 }))
}, [domains, edges, fitView, setNodes])
```

把 `createLayoutPayload()` 扩展为：

```ts
export function createLayoutPayload(nodes: TopologyNode[], selected?: string, viewport?: Viewport, domain?: string) {
	return { nodes: Object.fromEntries(nodes.map((node) => [node.id, snapTopologyPosition(node.position)])), selected, viewport, domain }
}
```

在 `NetworkLayoutRecord.layout` 增加 `domain?: string`。初始化 `activeDomainId` 时读取布局保存值；值已不存在时回退 `all`。

- [ ] **Step 5: 保留最后成功数据并显示刷新错误**

加载开始时只在首次无数据时显示全画布 loading。刷新失败时不清空 `topology`，设置：

```ts
setLoadError("拓扑刷新失败，当前显示上次成功数据。")
```

成功后清空错误。工具栏下使用现有 Alert 或紧凑语义区展示错误和重试按钮。

- [ ] **Step 6: 组合页面并保护首页总览**

完整页渲染 `TopologyWorkspaceToolbar + ReactFlow + TopologyInspector`。首页分支继续使用原有标题、统计、只读 React Flow、自适应高度和“完整拓扑”入口，不渲染域筛选、自动整理、保存或详情栏。

- [ ] **Step 7: 运行定向测试、完整测试和构建**

Run:

```powershell
Set-Location internal/site
npm run test:network-topology
npm test
npm run typecheck
npm run build
```

Expected: 全部命令 PASS；构建只允许既有的非阻断警告。

- [ ] **Step 8: 提交工作台集成**

```powershell
git add internal/site/src/components/routes/home-network-topology.tsx internal/site/src/lib/network-topology.ts internal/site/src/types.d.ts internal/site/src/modules/network-topology/workspace-data.test.ts
git commit -m "feat: redesign network topology workspace"
```

### Task 9: 更新版本说明

**Files:**
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`

- [ ] **Step 1: 追加 Web / Hub 开发记录**

在两个位置使用一致文案：

```text
重设计完整网络拓扑工作台：家庭网络与科技网按真实关系自动分域，并按上游、网关 / 路由、交换设备和终端分层布局；顶部收紧统计与维护操作，新增域筛选和自动整理，右侧固定显示域概览、节点上下联、网口状态或链路端点。节点与链路减少持续动画和大面积色块，选中对象只强调直接上下联；刷新失败保留最后成功数据，孤立节点、缺失接口和环路均明确提示。首页只读总览、真实资产主数据、维护弹窗、拖拽和布局保存能力保持不变。
```

- [ ] **Step 2: 运行版本记录测试和格式检查**

Run:

```powershell
Set-Location internal/site
npm run test:asset-center
npx biome check src/components/routes/settings/release-history.ts
```

Expected: 测试和 Biome 检查 PASS。

- [ ] **Step 3: 提交文档变更**

```powershell
git add docs/release-notes-next.md internal/site/src/components/routes/settings/release-history.ts
git commit -m "docs: record topology workspace redesign"
```

### Task 10: 浏览器视觉与交互验收

**Files:**
- Modify as needed: `internal/site/src/components/routes/home-network-topology.tsx`
- Modify as needed: `internal/site/src/modules/network-topology/components/topology-workspace-toolbar.tsx`
- Modify as needed: `internal/site/src/modules/network-topology/components/topology-inspector.tsx`
- Modify as needed: `internal/site/src/modules/network-topology/components/topology-canvas-elements.tsx`
- Modify as needed: `internal/site/src/index.css`

- [ ] **Step 1: 确认源码开发服务可访问**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental/scripts/run-hub-dev.ps1 -Restart
```

Expected: Hub 监听 `0.0.0.0:8090`，Vite 监听 `0.0.0.0:5173`，输出本机与局域网预览地址。

- [ ] **Step 2: 用 in-app Browser 验收 2494 × 1194**

打开 `http://localhost:5173/network`，检查：

- 顶部标题、统计和操作保持单行或自然换行，无重叠。
- 家庭网络与科技网分开，层级从左到右，交叉线明显少于改动前。
- 画布占满可视高度，右侧详情固定且内部自然滚动。
- `全部 / 家庭网络 / 科技网`切换后正确聚焦。
- 选择节点只强调直接上下联；选择链路显示两端接口。
- 新增菜单的设备、网口、链路弹窗均能正常打开和关闭。
- 自动整理不立即写库；保存后刷新仍保留坐标和域选择。

- [ ] **Step 3: 用 in-app Browser 验收 1727 × 1272**

检查画布仍可操作、节点文字不溢出、统计不遮挡按钮、详情栏按断点切换 Sheet 且关闭后画布状态不丢失。

- [ ] **Step 4: 验收首页只读总览和主题**

打开 `http://localhost:5173/`，确认首页只读拓扑仍完整显示且没有维护入口。分别切换浅色 / 深色主题，检查文字、线型、状态和淡化对象仍可辨认。

- [ ] **Step 5: 对比截图并修正可见问题**

在相同视口保存改动前和改动后截图，使用 `view_image` 逐项比较：画布利用率、网络域辨识、链路交叉、详情栏稳定性、节点密度和按钮对齐。发现问题时只修改上述 UI 文件，重新截图直到无重叠、裁切、错位或过度装饰。

- [ ] **Step 6: 最终验证**

Run:

```powershell
Set-Location internal/site
npm run test:network-topology
npm test
npm run typecheck
npm run build
```

Expected: 全部 PASS。

- [ ] **Step 7: 提交视觉收口**

仅在浏览器验收产生额外代码修正时执行：

```powershell
git add internal/site/src/components/routes/home-network-topology.tsx internal/site/src/modules/network-topology/components/topology-workspace-toolbar.tsx internal/site/src/modules/network-topology/components/topology-inspector.tsx internal/site/src/modules/network-topology/components/topology-canvas-elements.tsx internal/site/src/index.css
git commit -m "style: refine topology workspace layout"
```

## 完成标准

- `/network` 默认能一眼区分家庭网络与科技网。
- 节点按真实上下联关系从左到右分层，孤立节点和环路不伪造关系。
- 画布、详情栏、较窄桌面 Sheet、节点和链路选择均可用。
- 新增、刷新、自动整理、拖拽和保存布局行为符合设计文档。
- 首页只读总览没有功能回退。
- 版本记录与 About 页同步。
- `npm run test:network-topology`、`npm test`、`npm run typecheck` 和 `npm run build` 全部通过。
- 浏览器两种桌面视口和深浅主题验收无重叠、裁切、控制台错误或持续视觉噪音。
