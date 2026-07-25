import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import {
	buildTopologyAssetOptions,
	formatTopologyInternetBandwidth,
	formatTopologyPortSpeed,
	getUnlinkedTopologySystems,
	mapAssetInterfaceKindToNetworkPortType,
	mapTopologyPortTypeToAssetInterfaceKind,
} from "./workspace-data.ts"
import type { AssetRecord, NetworkPortRecord, SystemRecord } from "@/types"

const system = (overrides: Partial<SystemRecord> = {}) =>
	({
		id: "system-1",
		name: "UM690",
		status: "up",
		created: "",
		updated: "",
		collectionId: "",
		collectionName: "systems",
		...overrides,
	}) as SystemRecord

const asset = (overrides: Partial<AssetRecord> = {}) =>
	({
		id: "asset-1",
		user: "user-1",
		name: "核心路由器",
		type: "router",
		created: "",
		updated: "",
		collectionId: "",
		collectionName: "assets",
		...overrides,
	}) as AssetRecord

test("topology workspace reuses non-web assets and linked system fallbacks", () => {
	const result = buildTopologyAssetOptions(
		[asset(), asset({ id: "site-1", type: "web_endpoint", name: "家庭门户" })],
		[system({ id: "system-2", asset: "system-asset", name: "Hub 主机" })]
	)

	assert.deepEqual(
		result.map((item) => [item.id, item.name, item.type]),
		[
			["asset-1", "核心路由器", "router"],
			["system-asset", "Hub 主机", "physical_host"],
		]
	)
})

test("topology workspace filters assets already represented by an interface", () => {
	const systems = [system({ id: "linked", asset: "asset-1" }), system({ id: "available" })]
	const ports = [{ id: "port-1", system: "linked" }] as NetworkPortRecord[]

	assert.deepEqual(
		getUnlinkedTopologySystems(systems, ports).map((item) => item.id),
		["available"]
	)
})

test("topology workspace maps and formats connection metadata", () => {
	assert.equal(mapTopologyPortTypeToAssetInterfaceKind("wifi"), "wifi")
	assert.equal(mapTopologyPortTypeToAssetInterfaceKind("uplink"), "ethernet")
	assert.equal(mapTopologyPortTypeToAssetInterfaceKind("custom"), "custom")
	assert.equal(mapAssetInterfaceKindToNetworkPortType("pon", { role: "uplink" }), "uplink")
	assert.equal(mapAssetInterfaceKindToNetworkPortType("optical", { role: "downlink" }), "downlink")
	assert.equal(formatTopologyPortSpeed(2500), "2.5 Gbps")
	assert.equal(formatTopologyPortSpeed(100), "100 Mbps")
	assert.equal(
		formatTopologyInternetBandwidth(asset({ metadata: { down_mbps: "1000", up_mbps: 100 } })),
		"↓ 1G / ↑ 100M"
	)
})

test("home topology reuses the viewport-sized read-only workspace", () => {
	const homeSource = readFileSync(new URL("../../components/routes/home-network-topology.tsx", import.meta.url), "utf8")
	const workspaceSource = readFileSync(new URL("./components/topology-workspace.tsx", import.meta.url), "utf8")

	assert.ok(homeSource.includes("<TopologyWorkspace"), "首页应复用自由拓扑工作台")
	assert.ok(homeSource.includes("readOnly"), "首页拓扑必须只读")
	assert.ok(homeSource.includes("overview"), "首页拓扑必须使用总览模式")
	assert.ok(workspaceSource.includes("h-[min(64vh,640px)]"), "总览画布应按桌面窗口自适应高度")
	assert.equal(homeSource.includes("TopologyMatrix"), false, "首页不应继续引用旧矩阵")
	assert.equal(homeSource.includes("TopologyInspectorSheet"), false, "首页不应挂载编辑详情抽屉")
})

test("home dashboard renders independent home and technology topology cards", () => {
	const source = readFileSync(new URL("../../components/routes/home-network-topology.tsx", import.meta.url), "utf8")

	assert.ok(source.includes("grid-cols-2"), "首页网络拓扑应使用左右两列")
	assert.ok(source.includes('domain="home"'), "左侧应加载家庭网")
	assert.ok(source.includes('domain="technology"'), "右侧应加载科技网")
	assert.ok(source.includes('title="家庭网"'), "左侧标题应明确标识家庭网")
	assert.ok(source.includes('title="科技网"'), "右侧标题应明确标识科技网")
	assert.ok(source.includes("min-h-[560px]"), "两张首页拓扑画布都应提高最小高度")
})

test("full topology fills the remaining desktop viewport height", () => {
	const workspaceSource = readFileSync(new URL("./components/topology-workspace.tsx", import.meta.url), "utf8")

	assert.ok(workspaceSource.includes("h-[calc(100dvh-7.5rem)]"), "完整拓扑应填满桌面导航下方的剩余视口")
	assert.ok(workspaceSource.includes("min-h-[720px]"), "完整拓扑应保留可操作的最小画布高度")
	assert.equal(workspaceSource.includes('"min-h-[620px] grid-rows'), false, "完整拓扑不应只依赖固定最小高度")
	assert.ok(workspaceSource.includes("h-[min(64vh,640px)]"), "首页总览应提高高度并按桌面窗口自适应")
})

test("home topology places its compact summary after the page title", () => {
	const source = readFileSync(new URL("../../components/routes/home-network-topology.tsx", import.meta.url), "utf8")
	const titleIndex = source.indexOf("<h2")
	const summaryIndex = source.indexOf("aria-label=")

	assert.ok(titleIndex >= 0 && summaryIndex > titleIndex, "拓扑统计应紧跟在页面标题之后")
	assert.ok(source.includes('className="inline-flex h-7 items-center'), "拓扑统计应使用紧凑横向样式")
	assert.equal(source.includes("grid-cols-3"), false, "首页不应继续显示画布上方的旧统计网格")
})

test("free topology workspace exposes four-sided nodes and media-specific links", () => {
	const nodeSource = readFileSync(new URL("./components/topology-free-node.tsx", import.meta.url), "utf8")
	const edgeSource = readFileSync(new URL("./components/topology-free-edge.tsx", import.meta.url), "utf8")
	const toolbarSource = readFileSync(new URL("./components/topology-workspace-toolbar.tsx", import.meta.url), "utf8")
	const workspaceSource = readFileSync(new URL("./components/topology-workspace.tsx", import.meta.url), "utf8")

	assert.ok(nodeSource.includes('id="top"'))
	assert.ok(nodeSource.includes('id="right"'))
	assert.ok(nodeSource.includes('id="bottom"'))
	assert.ok(nodeSource.includes('id="left"'))
	assert.ok(edgeSource.includes('data.medium === "wifi"'))
	assert.ok(edgeSource.includes('data.medium === "fiber"'))
	assert.ok(edgeSource.includes("data.onSelect?.()"), "自定义边点击后应保持选中态")
	assert.ok(edgeSource.includes("data.onOpen?.()"), "自定义边应直接处理关系详情点击")
	assert.ok(toolbarSource.includes('getPagePath($router, "network", { domain: "home" })'))
	assert.ok(toolbarSource.includes('getPagePath($router, "network", { domain: "technology" })'))
	assert.ok(toolbarSource.includes("size-9 min-h-9"), "工具栏图标按钮应保持固定尺寸")
	assert.ok(workspaceSource.includes("ConnectionMode.Loose"))
	assert.ok(workspaceSource.includes("snapToGrid"), "拓扑节点拖动应启用网格吸附")
	assert.ok(workspaceSource.includes("TOPOLOGY_SNAP_GRID"), "拓扑画布应复用统一网格单位")
	assert.ok(workspaceSource.includes("snapTopologyPoint"), "折点位置应使用同一网格吸附规则")
	assert.ok(workspaceSource.includes("resolveTopologyEdgeHandles"), "未保存的连接节点应按卡片位置相向选择")
	assert.ok(workspaceSource.includes("BackgroundVariant.Dots"))
	assert.equal(workspaceSource.includes("pulse-matrix-band"), false)
})

test("wifi links stay orthogonal while markers follow the rendered route", () => {
	const edgeSource = readFileSync(new URL("./components/topology-free-edge.tsx", import.meta.url), "utf8")
	const styleSource = readFileSync(new URL("../../index.css", import.meta.url), "utf8")
	const wifiRule = styleSource.match(/\.pulse-free-edge-wifi\s*\{([^}]*)\}/)?.[1] ?? ""

	assert.ok(edgeSource.includes("getTopologyEdgePathPoints(controlPoints, medium)"))
	assert.ok(edgeSource.includes("getTopologyPathMidpoint(pathPoints)"), "介质图标应跟随实际绘制路径")
	assert.equal(edgeSource.includes("getCenterPoint(controlPoints)"), false)
	assert.ok(edgeSource.includes('buildWaypointPath(pathPoints, "orthogonal")'))
	assert.equal(edgeSource.match(/data\.onMoveWaypoint\?\./g)?.length, 1, "折点拖动不应重复提交同一位置")
	assert.ok(wifiRule.includes("stroke-dasharray"))
})

test("node handles are the single static connection endpoints", () => {
	const nodeSource = readFileSync(new URL("./components/topology-free-node.tsx", import.meta.url), "utf8")
	const edgeSource = readFileSync(new URL("./components/topology-free-edge.tsx", import.meta.url), "utf8")
	const workspaceSource = readFileSync(new URL("./components/topology-workspace.tsx", import.meta.url), "utf8")
	const styleSource = readFileSync(new URL("../../index.css", import.meta.url), "utf8")
	const handleHoverRule =
		styleSource.match(/\.react-flow__node:hover \.pulse-free-handle[\s\S]*?\{([^}]*)\}/)?.[1] ?? ""

	assert.ok(workspaceSource.includes("handleMediaByNode"), "工作台应把实际连线介质映射到节点连接点")
	assert.ok(nodeSource.includes("handleMedia"), "节点应使用连接点介质状态")
	assert.match(nodeSource, /medium && `is-\$\{medium\}`/, "已连接点应使用对应介质颜色")
	assert.equal(edgeSource.includes("EndpointMarkers"), false, "连线不应再额外绘制第二套端点")
	assert.equal(styleSource.includes(".pulse-free-endpoint"), false, "旧连线端点样式应移除")
	assert.equal(handleHoverRule.includes("transform"), false, "连接点悬停时不能缩放或位移")
	assert.ok(handleHoverRule.includes("box-shadow"), "连接点悬停应保留不移动的视觉反馈")
})

test("topology relation controls enforce read-only mode before mutations", () => {
	const workspaceSource = readFileSync(new URL("./components/topology-workspace.tsx", import.meta.url), "utf8")
	const sheetSource = readFileSync(new URL("./components/topology-connection-sheet.tsx", import.meta.url), "utf8")
	const operationSource = readFileSync(new URL("./relation-operations.ts", import.meta.url), "utf8")

	assert.ok(workspaceSource.includes("nodesConnectable={!readOnly}"))
	assert.ok(workspaceSource.includes("edgesReconnectable={!readOnly}"), "可编辑拓扑应允许拖动已有线路端点")
	assert.ok(
		workspaceSource.includes("onReconnect={readOnly ? undefined : handleReconnect}"),
		"已有线路重连必须进入真实关系编辑"
	)
	assert.ok(workspaceSource.includes("reconnectRadius={16}"), "线路端点应有足够的透明拖动命中区")
	assert.ok(workspaceSource.includes("if (readOnly) return"))
	assert.ok(sheetSource.includes("saveNetworkRelation"))
	assert.ok(sheetSource.includes("deleteNetworkRelation"))
	assert.ok(sheetSource.includes("relation && !readOnly"), "只读账号不应看到删除入口")
	assert.ok(operationSource.match(/if \(readOnly\) return \{ status: "forbidden" \}/g)?.length === 2)
})

test("saved line branches are rendered through persistent line anchors", () => {
	const workspaceSource = readFileSync(new URL("./components/topology-workspace.tsx", import.meta.url), "utf8")

	assert.ok(workspaceSource.includes("persistentBranchNodes"), "工作台应为已保存分支创建持久线路锚点")
	assert.ok(workspaceSource.includes("edge.data?.branch"), "渲染边必须消费构图阶段解析出的分支信息")
	assert.ok(workspaceSource.includes("getTopologyPathPointAtRatio"), "分支锚点必须按保存比例落在父线路实际路径上")
	assert.ok(workspaceSource.includes("hidden: !connectionEditing"), "持久线路锚点只应在连线编辑时显示")
})

test("full topology opens the new inspector without matrix dependencies", () => {
	const networkPageSource = readFileSync(new URL("../../components/routes/network.tsx", import.meta.url), "utf8")
	const workspaceSource = readFileSync(new URL("./components/topology-workspace.tsx", import.meta.url), "utf8")
	const inspectorSource = readFileSync(new URL("./components/topology-inspector-sheet.tsx", import.meta.url), "utf8")

	assert.ok(networkPageSource.includes("<TopologyInspectorSheet"))
	assert.ok(workspaceSource.includes("onEdgeOpen?.(edge)"))
	assert.ok(workspaceSource.includes("onEdgeClick"))
	assert.ok(
		workspaceSource.includes("onOpen: () => handleEditEdge(positionedEdge)"),
		"边数据应使用校正节点方向后的连接打开详情"
	)
	assert.equal(inspectorSource.includes("topology-matrix"), false)
})

test("network topology uses independent domain routes and a read-only home overview", () => {
	const routerSource = readFileSync(new URL("../../components/router.tsx", import.meta.url), "utf8")
	const networkPageSource = readFileSync(new URL("../../components/routes/network.tsx", import.meta.url), "utf8")
	const homeSource = readFileSync(new URL("../../components/routes/home-network-topology.tsx", import.meta.url), "utf8")
	const manifestSource = readFileSync(new URL("./manifest.ts", import.meta.url), "utf8")
	const navbarSource = readFileSync(new URL("../../components/navbar.tsx", import.meta.url), "utf8")

	assert.ok(routerSource.includes('network: "/network/:domain?"'))
	assert.ok(networkPageSource.includes('domain === "technology" ? "technology" : "home"'))
	assert.ok(networkPageSource.includes('"pulse.network.last-domain"'))
	assert.ok(manifestSource.includes('"/network/home"'))
	assert.ok(manifestSource.includes('"/network/technology"'))
	assert.ok(navbarSource.includes('{ domain: "home" }'))
	assert.ok(homeSource.includes("readOnly"))
	assert.ok(homeSource.includes("overview"))
})
