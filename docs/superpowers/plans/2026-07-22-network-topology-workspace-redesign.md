# Network Topology Matrix Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从零重做 `/network` 为四列网络分层矩阵，让家庭网络、科技网以及网线 / 无线 / 光纤关系在桌面窗口中紧凑、稳定且一目了然。

**Architecture:** 保留现有数据读取和真实关系构图入口，在 `modules/network-topology` 新增矩阵模型、坐标模型、选中模型和详情模型。React Flow 只负责渲染与交互，节点列归属、网络域、列内排序、异常诊断和三类链路语义均由纯函数决定。

**Tech Stack:** React 19、TypeScript 6、Vite 8、Tailwind CSS 4、shadcn/Radix UI、`@xyflow/react`、Lucide、Node Test Runner、Biome。

---

## 文件结构

- Create: `internal/site/src/modules/network-topology/topology-matrix.ts` — 网络域、四列归属、默认顺序和诊断。
- Create: `internal/site/src/modules/network-topology/topology-matrix.test.ts` — 家庭网、科技网、孤立节点、环路和列归属测试。
- Create: `internal/site/src/modules/network-topology/topology-matrix-layout.ts` — 网络带尺寸和稳定 React Flow 坐标。
- Create: `internal/site/src/modules/network-topology/topology-matrix-layout.test.ts` — 坐标、网络带间距和列内重排测试。
- Create: `internal/site/src/modules/network-topology/topology-selection.ts` — 域筛选、URL 定位和直接上下联强调。
- Create: `internal/site/src/modules/network-topology/topology-selection.test.ts` — 节点 / 链路选择测试。
- Create: `internal/site/src/modules/network-topology/topology-inspector-model.ts` — 节点和链路详情模型。
- Create: `internal/site/src/modules/network-topology/topology-inspector-model.test.ts` — 上联、下联、网口和缺失端点测试。
- Create: `internal/site/src/modules/network-topology/components/topology-matrix-node.tsx` — 基础设施与终端节点。
- Create: `internal/site/src/modules/network-topology/components/topology-matrix-edge.tsx` — 网线、无线、光纤三类边。
- Create: `internal/site/src/modules/network-topology/components/topology-workspace-toolbar.tsx` — 顶部控制栏、统计、域筛选和调整模式。
- Create: `internal/site/src/modules/network-topology/components/topology-inspector-sheet.tsx` — 节点 / 链路详情抽屉。
- Modify: `internal/site/src/components/routes/home-network-topology.tsx` — 组合矩阵工作台、保存顺序和现有维护弹窗。
- Modify: `internal/site/src/lib/network-topology.ts` — 补充矩阵展示字段与布局 payload。
- Modify: `internal/site/src/types.d.ts` — 增加保存顺序和当前网络域字段。
- Modify: `internal/site/src/index.css` — 三类链路、网络带、选中和淡化样式。
- Modify: `internal/site/package.json` — 把新增测试加入 `test:network-topology`。
- Modify: `docs/release-notes-next.md` — 追加 Web / Hub 开发记录。
- Modify: `internal/site/src/components/routes/settings/release-history.ts` — 同步 About 页版本记录。

### Task 1: 建立网络分层矩阵模型

**Files:**
- Create: `internal/site/src/modules/network-topology/topology-matrix.ts`
- Create: `internal/site/src/modules/network-topology/topology-matrix.test.ts`
- Modify: `internal/site/package.json`

- [ ] **Step 1: 写矩阵领域失败测试**

```ts
import assert from "node:assert/strict"
import test from "node:test"
import type { Edge, Node } from "@xyflow/react"
import type { TopologyEdgeData, TopologyNodeData } from "@/lib/network-topology"
import type { AssetRecord, AssetType } from "@/types"
import { buildTopologyMatrix } from "./topology-matrix.ts"

const asset = (id: string, name: string, type: AssetType) =>
	({ id, user: "user-1", name, type, created: "", updated: "", collectionId: "assets", collectionName: "assets" }) as AssetRecord

const node = (id: string, name: string, type: AssetType) =>
	({ id, position: { x: 0, y: 0 }, data: { kind: "asset", title: name, subtitle: type, meta: [], connectionBadges: [], availableConnectionBadges: [], asset: asset(id, name, type) } }) as Node<TopologyNodeData>

const edge = (id: string, source: string, target: string, kind: TopologyEdgeData["link"]["kind"] = "ethernet") =>
	({ id, source, target, data: { link: { id, kind }, speedLabel: "--", trafficLabel: "--" } }) as Edge<TopologyEdgeData>

test("builds separate home and technology network bands", () => {
	const nodes = [node("internet", "宽带", "internet"), node("ont", "华为主网关", "ont"), node("tech", "科技网", "custom"), node("router", "小米 BE7000", "router")]
	const matrix = buildTopologyMatrix(nodes, [edge("a", "internet", "ont", "internet"), edge("b", "tech", "router")])
	assert.deepEqual(matrix.domains.map((item) => item.label), ["家庭网络", "科技网"])
	assert.deepEqual(matrix.domains[0].columns.upstream.map((item) => item.id), ["internet"])
	assert.deepEqual(matrix.domains[0].columns.gateway.map((item) => item.id), ["ont"])
})

test("places switches and terminals in fixed semantic columns", () => {
	const nodes = [node("router", "路由器", "router"), node("switch", "交换机", "switch"), node("nas", "NAS", "nas"), node("phone", "手机", "phone")]
	const matrix = buildTopologyMatrix(nodes, [edge("a", "router", "switch"), edge("b", "switch", "nas"), edge("c", "router", "phone", "wifi")])
	assert.deepEqual(matrix.domains[0].columns.gateway.map((item) => item.id), ["router"])
	assert.deepEqual(matrix.domains[0].columns.access.map((item) => item.id), ["switch"])
	assert.deepEqual(matrix.domains[0].columns.endpoint.map((item) => item.id), ["nas", "phone"])
})

test("keeps isolated nodes in the unlinked band", () => {
	const matrix = buildTopologyMatrix([node("nas", "备用 NAS", "nas")], [])
	assert.deepEqual(matrix.unlinked.map((item) => item.id), ["nas"])
})

test("reports cycles and missing endpoints without recursion", () => {
	const nodes = [node("a", "A", "router"), node("b", "B", "switch"), node("c", "C", "ap")]
	const matrix = buildTopologyMatrix(nodes, [edge("ab", "a", "b"), edge("bc", "b", "c"), edge("ca", "c", "a"), edge("missing", "c", "missing")])
	assert.equal(matrix.domains[0].diagnostics.some((item) => item.kind === "cycle"), true)
	assert.equal(matrix.domains[0].diagnostics.some((item) => item.kind === "missing-endpoint"), true)
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```powershell
Set-Location internal/site
node --experimental-strip-types src/modules/network-topology/topology-matrix.test.ts
```

Expected: FAIL，原因是 `topology-matrix.ts` 不存在。

- [ ] **Step 3: 实现稳定矩阵模型**

```ts
import type { Edge, Node } from "@xyflow/react"
import type { TopologyEdgeData, TopologyNodeData } from "@/lib/network-topology"

export type TopologyMatrixColumn = "upstream" | "gateway" | "access" | "endpoint"
export type TopologyDiagnostic =
	| { kind: "cycle"; nodeIds: string[] }
	| { kind: "missing-endpoint"; edgeIds: string[] }
	| { kind: "missing-uplink"; nodeIds: string[] }

export type TopologyMatrixNode = { id: string; column: TopologyMatrixColumn; depth: number }
export type TopologyMatrixDomain = {
	id: string
	label: string
	rootNodeIds: string[]
	columns: Record<TopologyMatrixColumn, TopologyMatrixNode[]>
	edgeIds: string[]
	diagnostics: TopologyDiagnostic[]
	summary: { devices: number; links: number; wireless: number }
}
export type TopologyMatrix = { domains: TopologyMatrixDomain[]; unlinked: TopologyMatrixNode[] }

export function buildTopologyMatrix(nodes: Node<TopologyNodeData>[], edges: Edge<TopologyEdgeData>[]): TopologyMatrix {
	const nodesById = new Map(nodes.map((item) => [item.id, item]))
	const validEdges = edges.filter((item) => nodesById.has(item.source) && nodesById.has(item.target))
	const connectedIds = new Set(validEdges.flatMap((item) => [item.source, item.target]))
	const components = buildConnectedComponents(nodes.filter((item) => connectedIds.has(item.id)), validEdges)
	return {
		domains: components.map((ids) => buildDomain(ids, nodesById, edges)).sort(compareDomains),
		unlinked: nodes
			.filter((item) => !connectedIds.has(item.id))
			.map((item) => toMatrixNode(item, 0))
			.sort(compareMatrixNodes),
	}
}

export function getTopologyMatrixColumn(data: TopologyNodeData): TopologyMatrixColumn {
	switch (data.asset?.type) {
		case "internet": return "upstream"
		case "ont":
		case "gateway":
		case "router":
		case "firewall": return "gateway"
		case "switch":
		case "ap": return "access"
		default: return "endpoint"
	}
}
```

同文件使用队列构建无向连通分量，使用有向边计算最短深度和环路。排序固定为 `depth → type priority → zh-CN name → id`。缺少端点的边归入包含其已知端点的域诊断。

- [ ] **Step 4: 运行测试并加入定向入口**

Run:

```powershell
Set-Location internal/site
node --experimental-strip-types src/modules/network-topology/topology-matrix.test.ts
```

Expected: 4 个测试全部 PASS。

把以下命令加入 `test:network-topology`：

```json
"node --experimental-strip-types src/modules/network-topology/topology-matrix.test.ts"
```

- [ ] **Step 5: 提交矩阵模型**

```powershell
git add internal/site/src/modules/network-topology/topology-matrix.ts internal/site/src/modules/network-topology/topology-matrix.test.ts internal/site/package.json
git commit -m "feat: model topology matrix bands"
```

### Task 2: 建立网络带坐标与列内排序

**Files:**
- Create: `internal/site/src/modules/network-topology/topology-matrix-layout.ts`
- Create: `internal/site/src/modules/network-topology/topology-matrix-layout.test.ts`
- Modify: `internal/site/package.json`

- [ ] **Step 1: 写布局失败测试**

```ts
test("uses fixed x positions for all four columns", () => {
	const layout = buildTopologyMatrixLayout(matrixFixture, nodesFixture)
	assert.equal(layout.positions.get("internet")?.x, 96)
	assert.equal(layout.positions.get("router")?.x, 344)
	assert.equal(layout.positions.get("switch")?.x, 592)
	assert.equal(layout.positions.get("nas")?.x, 840)
})

test("grows a band from its busiest column and separates bands", () => {
	const layout = buildTopologyMatrixLayout(twoDomainMatrixFixture, nodesFixture)
	assert.ok(layout.bands[0].height >= 3 * 76 + 48)
	assert.ok(layout.bands[0].y + layout.bands[0].height + 48 <= layout.bands[1].y)
})

test("applies saved order only inside the same column", () => {
	const saved = { endpoint: ["phone", "nas"], gateway: ["nas"] }
	const layout = buildTopologyMatrixLayout(matrixFixture, nodesFixture, saved)
	assert.ok(layout.positions.get("phone")!.y < layout.positions.get("nas")!.y)
	assert.equal(layout.positions.get("nas")!.x, 840)
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```powershell
Set-Location internal/site
node --experimental-strip-types src/modules/network-topology/topology-matrix-layout.test.ts
```

Expected: FAIL，原因是布局模块不存在。

- [ ] **Step 3: 实现矩阵坐标**

```ts
const COLUMN_X: Record<TopologyMatrixColumn, number> = {
	upstream: 96,
	gateway: 344,
	access: 592,
	endpoint: 840,
}
const BAND_START_Y = 84
const BAND_GAP_Y = 48
const NODE_GAP_Y = 12
const INFRASTRUCTURE_HEIGHT = 64
const ENDPOINT_HEIGHT = 48

export function buildTopologyMatrixLayout(matrix: TopologyMatrix, nodes: TopologyNode[], savedOrder: TopologySavedOrder = {}) {
	const positions = new Map<string, { x: number; y: number }>()
	const bands: TopologyBandLayout[] = []
	let bandY = BAND_START_Y
	for (const domain of matrix.domains) {
		const orderedColumns = orderDomainColumns(domain.columns, savedOrder[domain.id])
		const contentHeight = Math.max(...Object.entries(orderedColumns).map(([column, items]) => getColumnHeight(column as TopologyMatrixColumn, items.length)), 48)
		const height = contentHeight + 56
		for (const [column, items] of Object.entries(orderedColumns) as [TopologyMatrixColumn, TopologyMatrixNode[]][]) {
			let nodeY = bandY + 44
			for (const item of items) {
				positions.set(item.id, { x: COLUMN_X[column], y: nodeY })
				nodeY += getNodeHeight(column) + NODE_GAP_Y
			}
		}
		bands.push({ id: domain.id, label: domain.label, y: bandY, height })
		bandY += height + BAND_GAP_Y
	}
	return { positions, bands, width: 1104, height: Math.max(420, bandY) }
}
```

未接入网络带使用相同终端列宽度，但横跨四列显示，节点按类型分组排列。保存顺序只作为同域同列 ID 顺序读取，非法 ID 或跨列 ID直接忽略。

- [ ] **Step 4: 运行测试并提交**

Run:

```powershell
Set-Location internal/site
node --experimental-strip-types src/modules/network-topology/topology-matrix-layout.test.ts
npm run test:network-topology
```

Expected: 新旧拓扑测试全部 PASS。

```powershell
git add internal/site/src/modules/network-topology/topology-matrix-layout.ts internal/site/src/modules/network-topology/topology-matrix-layout.test.ts internal/site/package.json
git commit -m "feat: lay out topology matrix bands"
```

### Task 3: 建立域筛选与上下联强调模型

**Files:**
- Create: `internal/site/src/modules/network-topology/topology-selection.ts`
- Create: `internal/site/src/modules/network-topology/topology-selection.test.ts`
- Modify: `internal/site/package.json`

- [ ] **Step 1: 写选择模型失败测试**

```ts
test("emphasizes a node and its direct links only", () => {
	const result = getTopologyFocusSet(nodesFixture, edgesFixture, { nodeId: "switch" })
	assert.deepEqual([...result.emphasizedNodeIds].sort(), ["nas", "router", "switch"])
	assert.equal(result.dimmedNodeIds.has("phone"), true)
})

test("selecting an edge keeps both endpoints visible", () => {
	const result = getTopologyFocusSet(nodesFixture, edgesFixture, { edgeId: "switch-nas" })
	assert.deepEqual([...result.emphasizedNodeIds].sort(), ["nas", "switch"])
})

test("finds the network band for URL focus", () => {
	assert.equal(findSelectionDomain(matrixFixture, { edgeId: "tech-router" })?.id, "tech")
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```powershell
Set-Location internal/site
node --experimental-strip-types src/modules/network-topology/topology-selection.test.ts
```

Expected: FAIL，原因是选择模型不存在。

- [ ] **Step 3: 实现无副作用选择模型**

```ts
export type TopologySelection = { nodeId?: string; edgeId?: string }

export function getTopologyFocusSet(nodes: TopologyNode[], edges: TopologyEdge[], selection?: TopologySelection) {
	const emphasizedNodeIds = new Set<string>()
	const emphasizedEdgeIds = new Set<string>()
	if (selection?.nodeId) {
		emphasizedNodeIds.add(selection.nodeId)
		for (const edge of edges) {
			if (edge.source !== selection.nodeId && edge.target !== selection.nodeId) continue
			emphasizedEdgeIds.add(edge.id)
			emphasizedNodeIds.add(edge.source)
			emphasizedNodeIds.add(edge.target)
		}
	}
	if (selection?.edgeId) {
		const edge = edges.find((item) => item.id === selection.edgeId)
		if (edge) {
			emphasizedEdgeIds.add(edge.id)
			emphasizedNodeIds.add(edge.source)
			emphasizedNodeIds.add(edge.target)
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

同文件实现 `filterMatrixByDomain()` 和 `findSelectionDomain()`，不修改源数组。

- [ ] **Step 4: 运行测试并提交**

Run:

```powershell
Set-Location internal/site
node --experimental-strip-types src/modules/network-topology/topology-selection.test.ts
```

Expected: 全部 PASS。

```powershell
git add internal/site/src/modules/network-topology/topology-selection.ts internal/site/src/modules/network-topology/topology-selection.test.ts internal/site/package.json
git commit -m "feat: add topology matrix selection"
```

### Task 4: 建立节点和链路详情模型

**Files:**
- Create: `internal/site/src/modules/network-topology/topology-inspector-model.ts`
- Create: `internal/site/src/modules/network-topology/topology-inspector-model.test.ts`
- Modify: `internal/site/package.json`

- [ ] **Step 1: 写详情失败测试**

```ts
test("builds node uplinks downlinks and interface rows", () => {
	const model = buildTopologyInspectorModel({ selection: { nodeId: "asset-switch" }, graph, assets, interfaces, relations, systems, topologyPorts })
	assert.equal(model?.kind, "node")
	if (model?.kind !== "node") throw new Error("expected node inspector")
	assert.deepEqual(model.uplinks.map((item) => item.peer), ["华为主网关"])
	assert.deepEqual(model.downlinks.map((item) => item.peer), ["飞牛 NAS"])
	assert.deepEqual(model.interfaces.map((item) => item.name), ["LAN 1", "LAN 2"])
})

test("does not invent a missing edge interface", () => {
	const model = buildTopologyInspectorModel({ selection: { edgeId: "asset-relation-r1" }, graph, assets, interfaces, relations, systems, topologyPorts })
	assert.equal(model?.kind, "edge")
	if (model?.kind !== "edge") throw new Error("expected edge inspector")
	assert.equal(model.target.interfaceName, "接口待确认")
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```powershell
Set-Location internal/site
node --experimental-strip-types src/modules/network-topology/topology-inspector-model.test.ts
```

Expected: FAIL，原因是详情模型不存在。

- [ ] **Step 3: 实现判别联合类型**

```ts
export type TopologyInspectorModel =
	| { kind: "node"; nodeId: string; title: string; subtitle: string; ipv4?: string; managementUrl?: string; status?: string; uplinks: InspectorRelation[]; downlinks: InspectorRelation[]; interfaces: InspectorInterface[] }
	| { kind: "edge"; edgeId: string; title: string; direction: string; medium: "ethernet" | "wifi" | "fiber" | "custom"; speed: string; source: InspectorEndpoint; target: InspectorEndpoint; relationId?: string }

export function buildTopologyInspectorModel(input: BuildTopologyInspectorInput): TopologyInspectorModel | undefined {
	if (input.selection?.edgeId) return buildEdgeInspector(input)
	if (input.selection?.nodeId) return buildNodeInspector(input)
	return undefined
}
```

方向调用现有 `getAssetNetworkRelationDirection()`；接口名称只读取 `metadata.source_interface` 和 `metadata.target_interface` 对应的真实记录。`pon`、`optical` 和光口接口统一映射 `fiber`，不把未知介质猜成网线。

- [ ] **Step 4: 运行测试并提交**

Run:

```powershell
Set-Location internal/site
node --experimental-strip-types src/modules/network-topology/topology-inspector-model.test.ts
npm run test:network-topology
```

Expected: 全部 PASS。

```powershell
git add internal/site/src/modules/network-topology/topology-inspector-model.ts internal/site/src/modules/network-topology/topology-inspector-model.test.ts internal/site/package.json
git commit -m "feat: model topology matrix details"
```

### Task 5: 实现两类节点和三类链路

**Files:**
- Create: `internal/site/src/modules/network-topology/components/topology-matrix-node.tsx`
- Create: `internal/site/src/modules/network-topology/components/topology-matrix-edge.tsx`
- Modify: `internal/site/src/lib/network-topology.ts`
- Modify: `internal/site/src/index.css`
- Modify: `internal/site/src/modules/network-topology/workspace-data.test.ts`

- [ ] **Step 1: 写视觉语义契约失败测试**

```ts
test("matrix nodes and links have distinct stable contracts", () => {
	const nodeSource = readFileSync(new URL("./components/topology-matrix-node.tsx", import.meta.url), "utf8")
	const edgeSource = readFileSync(new URL("./components/topology-matrix-edge.tsx", import.meta.url), "utf8")
	const css = readFileSync(new URL("../../index.css", import.meta.url), "utf8")
	assert.ok(nodeSource.includes("topology-node-infrastructure"))
	assert.ok(nodeSource.includes("topology-node-endpoint"))
	assert.ok(edgeSource.includes("TopologyEthernetEdge"))
	assert.ok(edgeSource.includes("TopologyWirelessEdge"))
	assert.ok(edgeSource.includes("TopologyFiberEdge"))
	assert.ok(css.includes("stroke-dasharray"), "无线必须用非颜色线型区分")
	assert.ok(css.includes("topology-fiber-edge-secondary"), "光纤必须显示双层线")
	assert.equal(css.includes("pulse-topology-packet-forward"), false, "默认链路不能持续流动")
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```powershell
Set-Location internal/site
npm run test:network-topology
```

Expected: FAIL，因为新组件尚不存在。

- [ ] **Step 3: 实现固定尺寸节点**

`TopologyMatrixNode` 根据 `data.matrixColumn` 输出 `topology-node-infrastructure` 或 `topology-node-endpoint`。基础设施节点显示接口占用，终端节点只显示名称、类型、状态和可用 IPv4。两类节点均提供 Tooltip 和点击详情事件。

```tsx
export function TopologyMatrixNode({ id, data, selected }: NodeProps<Node<TopologyNodeData>>) {
	const infrastructure = data.matrixColumn !== "endpoint"
	const { icon: Icon, label: iconLabel } = getTopologyNodeIcon(data)
	return (
		<button
			type="button"
			data-dimmed={data.presentation === "dimmed" || undefined}
			className={cn(
				"nodrag nopan grid h-full w-full items-center rounded-md border bg-card px-2.5 text-start",
				infrastructure ? "topology-node-infrastructure" : "topology-node-endpoint",
				data.presentation === "dimmed" && "opacity-30",
				selected && "border-primary ring-2 ring-primary/15"
			)}
			onClick={() => openTopologyInspector({ nodeId: id })}
		>
			<div className="flex min-w-0 items-center gap-2">
				<Icon className="size-4 shrink-0" aria-label={iconLabel} />
				<div className="min-w-0 flex-1">
					<div className="truncate text-xs font-semibold">{data.title}</div>
					<div className="truncate text-[10px] text-muted-foreground">{[data.subtitle, data.ipv4].filter(Boolean).join(" · ")}</div>
				</div>
				{infrastructure && <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{data.connectedPortCount ?? 0}/{data.portCount ?? 0}</span>}
			</div>
			<Handle type="target" position={Position.Left} className="topology-port-endpoint" />
			<Handle type="source" position={Position.Right} className="topology-port-endpoint" />
		</button>
	)
}
```

- [ ] **Step 4: 实现三类独立边**

```tsx
export function TopologyMatrixEdge(props: EdgeProps<Edge<TopologyEdgeData>>) {
	const medium = getTopologyEdgeMedium(props.data)
	if (medium === "wifi") return <TopologyWirelessEdge {...props} />
	if (medium === "fiber") return <TopologyFiberEdge {...props} />
	return <TopologyEthernetEdge {...props} />
}
```

- `TopologyEthernetEdge` 使用 `getSmoothStepPath({ borderRadius: 4 })`、单实线和方形端点。
- `TopologyWirelessEdge` 使用 `getBezierPath()`、短虚线，并在路径中点渲染 `WifiIcon` 小标记。
- `TopologyFiberEdge` 使用同一路径渲染主线与平移后的副线，端点使用圆形光口标记，中点显示“光纤”或接口名称。
- 选中态只增强当前边并显示方向 marker；不渲染持续动画。

- [ ] **Step 5: 补充图数据字段并运行验证**

在 `TopologyNodeData` 增加：

```ts
matrixColumn?: TopologyMatrixColumn
ipv4?: string
connectedPortCount?: number
wirelessClientCount?: number
presentation?: "normal" | "dimmed"
```

在 `TopologyEdgeData` 增加：

```ts
medium?: "ethernet" | "wifi" | "fiber" | "custom"
presentation?: "normal" | "dimmed"
```

Run:

```powershell
Set-Location internal/site
npm run test:network-topology
npm run typecheck
```

Expected: PASS。

- [ ] **Step 6: 提交节点与链路**

```powershell
git add internal/site/src/modules/network-topology/components/topology-matrix-node.tsx internal/site/src/modules/network-topology/components/topology-matrix-edge.tsx internal/site/src/lib/network-topology.ts internal/site/src/index.css internal/site/src/modules/network-topology/workspace-data.test.ts
git commit -m "feat: add topology matrix visuals"
```

### Task 6: 实现顶部控制栏和详情抽屉

**Files:**
- Create: `internal/site/src/modules/network-topology/components/topology-workspace-toolbar.tsx`
- Create: `internal/site/src/modules/network-topology/components/topology-inspector-sheet.tsx`
- Modify: `internal/site/src/modules/network-topology/workspace-data.test.ts`

- [ ] **Step 1: 写工作台组件契约失败测试**

```ts
test("matrix workspace uses a compact toolbar and on-demand inspector", () => {
	const toolbar = readFileSync(new URL("./components/topology-workspace-toolbar.tsx", import.meta.url), "utf8")
	const sheet = readFileSync(new URL("./components/topology-inspector-sheet.tsx", import.meta.url), "utf8")
	assert.ok(toolbar.includes("调整布局"))
	assert.ok(toolbar.includes("保存顺序"))
	assert.ok(toolbar.includes("取消调整"))
	assert.ok(toolbar.includes("DropdownMenuItem"))
	assert.ok(sheet.includes("SheetContent"))
	assert.ok(sheet.includes("网口状态"))
	assert.equal(sheet.includes("未选择节点"), false)
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```powershell
Set-Location internal/site
npm run test:network-topology
```

Expected: FAIL，因为组件不存在。

- [ ] **Step 3: 实现顶部控制栏**

```tsx
export function TopologyWorkspaceToolbar(props: TopologyWorkspaceToolbarProps) {
	return (
		<header className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-4 py-2">
			<div className="flex min-w-0 flex-wrap items-center gap-2">
				<h1 className="shrink-0 text-lg font-semibold">网络拓扑</h1>
				<TopologyStats stats={props.stats} />
				<TopologyDomainTabs domains={props.domains} value={props.domainId} onValueChange={props.onDomainChange} />
			</div>
			<div className="flex items-center gap-1.5">
				<AddTopologyMenu readOnly={props.readOnly} onDevice={props.onAddDevice} onPort={props.onAddPort} onLink={props.onAddLink} />
				<Button variant="ghost" size="icon" title="刷新" onClick={props.onRefresh}><RefreshCwIcon /></Button>
				{props.adjusting ? (
					<><Button variant="outline" size="sm" onClick={props.onCancelAdjust}>取消调整</Button><Button size="sm" onClick={props.onSaveOrder}>保存顺序</Button></>
				) : (
					<Button variant="outline" size="sm" onClick={props.onStartAdjust} disabled={props.readOnly}><ListRestartIcon />调整布局</Button>
				)}
			</div>
		</header>
	)
}
```

- [ ] **Step 4: 实现按需详情 Sheet**

`TopologyInspectorSheet` 只消费 `TopologyInspectorModel`。`open` 由选中节点或链路决定；关闭只清理 selection，不修改图数据。节点详情顺序固定为“摘要、上联、下联、网口状态”；链路详情顺序固定为“两端、介质、方向、速率、编辑”。

```tsx
export function TopologyInspectorSheet({ open, model, onOpenChange, onEditNode, onEditRelation }: TopologyInspectorSheetProps) {
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent side="right" className="w-[22.5rem] max-w-[calc(100vw-2rem)] overflow-y-auto p-0">
				{model?.kind === "node" && <NodeInspector model={model} onEdit={onEditNode} />}
				{model?.kind === "edge" && <EdgeInspector model={model} onEdit={onEditRelation} />}
			</SheetContent>
		</Sheet>
	)
}
```

- [ ] **Step 5: 运行测试并提交**

Run:

```powershell
Set-Location internal/site
npm run test:network-topology
npm run typecheck
```

Expected: PASS。

```powershell
git add internal/site/src/modules/network-topology/components/topology-workspace-toolbar.tsx internal/site/src/modules/network-topology/components/topology-inspector-sheet.tsx internal/site/src/modules/network-topology/workspace-data.test.ts
git commit -m "feat: add topology matrix workspace controls"
```

### Task 7: 集成完整矩阵工作台

**Files:**
- Modify: `internal/site/src/components/routes/home-network-topology.tsx`
- Modify: `internal/site/src/types.d.ts`
- Modify: `internal/site/src/lib/network-topology.ts`
- Modify: `internal/site/src/modules/network-topology/workspace-data.test.ts`

- [ ] **Step 1: 写页面集成失败测试**

```ts
test("network page integrates the matrix without a permanent sidebar", () => {
	const source = readFileSync(new URL("../../components/routes/home-network-topology.tsx", import.meta.url), "utf8")
	assert.ok(source.includes("buildTopologyMatrix"))
	assert.ok(source.includes("buildTopologyMatrixLayout"))
	assert.ok(source.includes("TopologyWorkspaceToolbar"))
	assert.ok(source.includes("TopologyInspectorSheet"))
	assert.equal(source.includes("lg:grid-cols-[minmax(0,1fr)_20rem]"), false)
	assert.equal(source.includes("未选择节点"), false)
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```powershell
Set-Location internal/site
npm run test:network-topology
```

Expected: FAIL，因为页面仍是旧结构。

- [ ] **Step 3: 接入矩阵状态**

```ts
const [activeDomainId, setActiveDomainId] = useState("all")
const [selection, setSelection] = useState<TopologySelection>()
const [adjusting, setAdjusting] = useState(false)
const [draftOrder, setDraftOrder] = useState<TopologySavedOrder>({})
const [loadError, setLoadError] = useState<string>()

const matrix = useMemo(() => buildTopologyMatrix(graph.nodes, graph.edges), [graph.edges, graph.nodes])
const visibleMatrix = useMemo(() => filterMatrixByDomain(matrix, activeDomainId), [activeDomainId, matrix])
const matrixLayout = useMemo(() => buildTopologyMatrixLayout(visibleMatrix, graph.nodes, draftOrder), [draftOrder, graph.nodes, visibleMatrix])
const focusSet = useMemo(() => getTopologyFocusSet(graph.nodes, graph.edges, selection), [graph.edges, graph.nodes, selection])
const inspector = useMemo(() => buildTopologyInspectorModel({ selection, graph, assets: topology.assets, interfaces: topology.interfaces, relations: topology.relations, systems, topologyPorts }), [graph, selection, systems, topology, topologyPorts])
```

把矩阵坐标映射到 React Flow nodes；背景网络带和四列标题使用不可交互背景节点或 React Flow `Panel` 渲染，不放入资产节点计数。

- [ ] **Step 4: 接入列内排序模式**

默认 `nodesDraggable={false}`。调整模式改为 `nodesDraggable`，但 `onNodeDragStop` 必须把 x 还原到所属列，只根据 y 计算同域同列顺序：

```ts
const handleNodeDragStop: OnNodeDrag<TopologyNode> = useCallback((_event, node) => {
	if (!adjusting) return
	setDraftOrder((current) => reorderMatrixColumn(current, visibleMatrix, node.id, node.position.y))
}, [adjusting, visibleMatrix])
```

进入调整模式时保存原始顺序快照；取消恢复快照；保存写入 `network_layouts.layout.order`。

- [ ] **Step 5: 扩展布局 payload**

`NetworkLayoutRecord.layout` 增加：

```ts
domain?: string
order?: Record<string, Partial<Record<TopologyMatrixColumn, string[]>>>
```

`createLayoutPayload()` 不再以自由坐标作为完整页主要布局来源，但保留首页兼容字段 `nodes`、`viewport` 和 `connection_modes`。完整页额外保存 `domain` 与 `order`。

- [ ] **Step 6: 接入 URL 定位、刷新错误和抽屉**

- URL 目标先通过 `findSelectionDomain()` 切换域，再设置 selection 和打开 Sheet。
- 首次加载才显示全矩阵 loading；刷新失败保留最后成功数据并设置“拓扑刷新失败，当前显示上次成功数据。”。
- 节点 / 链路不存在时清理 selection 并关闭 Sheet。
- 成功刷新后清空错误。

- [ ] **Step 7: 保护首页只读模式**

首页继续只读、自动适配高度、不显示新增 / 调整 / 保存 / Sheet。首页可复用新节点和三类链路，但不渲染完整页网络带标题和控制栏。

- [ ] **Step 8: 运行测试、类型检查和构建**

Run:

```powershell
Set-Location internal/site
npm run test:network-topology
npm test
npm run typecheck
npm run build
```

Expected: 全部 PASS；构建只允许既有非阻断警告。

- [ ] **Step 9: 提交页面集成**

```powershell
git add internal/site/src/components/routes/home-network-topology.tsx internal/site/src/types.d.ts internal/site/src/lib/network-topology.ts internal/site/src/modules/network-topology/workspace-data.test.ts
git commit -m "feat: redesign topology as a network matrix"
```

### Task 8: 更新版本记录

**Files:**
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`

- [ ] **Step 1: 追加一致的 Web / Hub 记录**

```text
完整网络拓扑页从自由画布重做为网络分层矩阵：家庭网络、科技网和未接入设备按独立网络带展示，节点固定归入上游网络、网关 / 路由、交换 / 接入和终端四列；默认锁定布局，调整模式只允许同列排序。网线、无线和光纤分别使用直角实线与方形网口、弧形虚线与 Wi-Fi 标记、双层线与圆形光口，默认移除持续流动动画。详情改为按需右侧抽屉，刷新失败保留最后成功数据；真实资产、接口、关系和现有维护弹窗继续复用。
```

- [ ] **Step 2: 运行记录测试和格式检查**

Run:

```powershell
Set-Location internal/site
npm run test:asset-center
npx biome check src/components/routes/settings/release-history.ts
```

Expected: PASS。

- [ ] **Step 3: 提交版本记录**

```powershell
git add docs/release-notes-next.md internal/site/src/components/routes/settings/release-history.ts
git commit -m "docs: record topology matrix redesign"
```

### Task 9: 浏览器视觉与交互验收

**Files:**
- Modify as needed: `internal/site/src/components/routes/home-network-topology.tsx`
- Modify as needed: `internal/site/src/modules/network-topology/components/topology-matrix-node.tsx`
- Modify as needed: `internal/site/src/modules/network-topology/components/topology-matrix-edge.tsx`
- Modify as needed: `internal/site/src/modules/network-topology/components/topology-workspace-toolbar.tsx`
- Modify as needed: `internal/site/src/modules/network-topology/components/topology-inspector-sheet.tsx`
- Modify as needed: `internal/site/src/index.css`

- [ ] **Step 1: 启动源码开发环境**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental/scripts/run-hub-dev.ps1 -Restart
```

Expected: Hub 监听 `0.0.0.0:8090`，Vite 监听 `0.0.0.0:5173`。

- [ ] **Step 2: 验收 2494 × 1194 桌面窗口**

打开 `http://localhost:5173/network`，检查：

- 两条网络带和四列标题清晰，不依赖旧页面布局。
- 家庭网络与科技网不会混线。
- 三类链路只看形状和端点即可区分。
- 矩阵使用可视高度，无长期空白详情栏。
- 点击节点和链路打开正确 Sheet，关闭后恢复全宽。
- `全部 / 家庭网络 / 科技网`切换正确。
- 新增、刷新、调整、保存、取消均可用。

- [ ] **Step 3: 验收 1727 × 1272 较窄桌面窗口**

检查控制栏可自然收紧、列标题和节点不重叠、矩阵可横向平移、Sheet 不遮挡关闭按钮和主要信息。

- [ ] **Step 4: 验收调整模式**

拖动终端节点时只能改变终端列纵向顺序；x 坐标回到固定终端列。取消后恢复原顺序；保存后刷新保持新顺序。

- [ ] **Step 5: 验收首页和主题**

打开 `http://localhost:5173/`，确认首页只读拓扑完整显示且无维护工具。分别验证深色和浅色主题，确认线型、端点、状态和淡化对象均可辨认。

- [ ] **Step 6: 截图比较与视觉修正**

保存 2494 × 1194 和 1727 × 1272 截图并用 `view_image` 检查：布局密度、网络带高度、链路交叉、文字截断、端点、按钮和 Sheet。修正所有重叠、裁切、错位、过度留白和颜色依赖问题后重新截图。

- [ ] **Step 7: 最终验证**

Run:

```powershell
Set-Location internal/site
npm run test:network-topology
npm test
npm run typecheck
npm run build
```

Expected: 全部 PASS。

- [ ] **Step 8: 提交视觉收口**

仅在浏览器验收产生额外修正时执行：

```powershell
git add internal/site/src/components/routes/home-network-topology.tsx internal/site/src/modules/network-topology/components/topology-matrix-node.tsx internal/site/src/modules/network-topology/components/topology-matrix-edge.tsx internal/site/src/modules/network-topology/components/topology-workspace-toolbar.tsx internal/site/src/modules/network-topology/components/topology-inspector-sheet.tsx internal/site/src/index.css
git commit -m "style: refine topology matrix workspace"
```

## 完成标准

- `/network` 完全使用新的网络分层矩阵，不保留旧页面布局和固定详情栏。
- 家庭网络、科技网和未接入设备分别呈现。
- 所有节点稳定进入四个语义列之一。
- 网线、无线、光纤具有不同路径、线型、端点和文字语义。
- 默认锁定，调整模式只能同列排序。
- 节点和链路详情只在选中后打开 Sheet。
- 首页只读拓扑无功能回退。
- 版本记录与 About 页同步。
- `npm run test:network-topology`、`npm test`、`npm run typecheck`、`npm run build` 全部通过。
- 两档桌面视口与深浅主题无重叠、裁切、控制台错误或持续视觉噪音。
