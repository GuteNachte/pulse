import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
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

test("home topology uses the React Flow readonly canvas", () => {
	const homeSource = readFileSync(
		new URL("../../components/routes/home-topology-workspace.tsx", import.meta.url),
		"utf8"
	)

	assert.ok(homeSource.includes("<ReactFlow"), "首页应使用 React Flow 画布")
	assert.ok(homeSource.includes("useTopologyWorkspaceData"), "首页拓扑应复用资产关系数据")
	assert.ok(homeSource.includes("TopologyEditorNodeCard"), "展示页必须复用编辑器节点组件")
	assert.ok(homeSource.includes("buildEditorGraph"), "展示页必须使用编辑器同一套节点/连线构建")
	assert.ok(homeSource.includes("TopologyEdgeLegend"), "展示页必须显示左下角连线图例")
	assert.ok(homeSource.includes("onNodeDoubleClick"), "双击节点必须进入资产详情")
	assert.ok(homeSource.includes("onNodesChange"), "节点尺寸测量与画布更新必须交给 React Flow")
	// 2026-10-25 用户要求拓扑图固定 1 倍：所有缩放入口关闭，缩放按钮 / 小地图一并移除
	assert.ok(homeSource.includes("minZoom={1}") && homeSource.includes("maxZoom={1}"), "展示页必须锁定 1 倍缩放")
	assert.ok(homeSource.includes("zoomOnScroll={false}"), "展示页滚轮不能缩放")
	assert.ok(homeSource.includes("zoomOnDoubleClick={false}"), "展示页双击不能缩放")
	assert.ok(homeSource.includes("panOnDrag={false}"), "展示页不能拖动画布")
	assert.equal(homeSource.includes("<Controls"), false, "展示页不能显示缩放/适应视图按钮")
	assert.equal(homeSource.includes("<MiniMap"), false, "展示页不能显示小地图")
	assert.equal(homeSource.includes("<Background"), false, "展示页不显示定位网格")
	assert.equal(homeSource.includes("network_links"), false, "首页拓扑不能改读遗留链路集合")
})

test("home loose location summary links to loose assets", () => {
	const source = readFileSync(new URL("./use-topology-summary.ts", import.meta.url), "utf8")

	assert.ok(source.includes("LOOSE_LOCATION_FILTER"), "首页待归档入口必须使用待归档位置专用筛选")
	assert.ok(source.includes("?location="), "首页待归档入口必须携带位置筛选参数")
	assert.equal(source.includes("?location=__empty__"), false, "待归档位置不能误用空位置筛选")
})

test("home workspace switches between home and technology domains", () => {
	const source = readFileSync(new URL("../../components/routes/home-topology-workspace.tsx", import.meta.url), "utf8")

	assert.ok(source.includes('home: "家庭网"'), "必须提供家庭网切换")
	assert.ok(source.includes('technology: "科技网"'), "必须提供科技网切换")
	assert.ok(source.includes("onDomainChange(next)"), "切换分区必须更新加载域")
	assert.ok(source.includes("<ReactFlow"), "两个分区共用 React Flow 画布")
})

test("read-only full topology page is retired in favour of the editor", () => {
	// 2026-10-25 首页与完整拓扑页重复：只读页下线，网络拓扑入口直接进入编辑页
	assert.equal(
		existsSync(new URL("../../components/routes/network.tsx", import.meta.url)),
		false,
		"只读完整拓扑页文件必须已删除"
	)
	const workspaceSource = readFileSync(
		new URL("../../components/routes/home-topology-workspace.tsx", import.meta.url),
		"utf8"
	)
	const navbarSource = readFileSync(new URL("../../components/navbar.tsx", import.meta.url), "utf8")
	const mainSource = readFileSync(new URL("../../main.tsx", import.meta.url), "utf8")

	assert.ok(workspaceSource.includes('getPagePath($router, "networkEdit")'), "首页状态条必须有可见的编辑拓扑按钮")
	assert.ok(workspaceSource.includes("<ReactFlow"), "共享拓扑工作台必须使用 React Flow 画布")
	assert.equal(navbarSource.includes('"networkEdit"'), false, "导航栏不再提供独立的网络拓扑页面入口")
	assert.ok(mainSource.includes("LegacyNetworkEditRedirect"), "旧 /network 地址必须重定向到编辑页")
})

test("topology workspace keeps home and technology views", () => {
	const workspaceSource = readFileSync(
		new URL("../../components/routes/home-topology-workspace.tsx", import.meta.url),
		"utf8"
	)

	assert.ok(workspaceSource.includes("家庭网") && workspaceSource.includes("科技网"), "切换入口必须明确显示两个网段")
	assert.ok(workspaceSource.includes("onDomainChange(next)"), "切换分区必须更新加载域")
})

test("fixed topology removes the retired free-canvas implementation", () => {
	const e2eSource = readFileSync(new URL("../../../e2e/network-topology.spec.ts", import.meta.url), "utf8")
	const retiredFiles = [
		"./components/topology-workspace.tsx",
		"./components/topology-workspace-toolbar.tsx",
		"./components/topology-free-node.tsx",
		"./components/topology-free-edge.tsx",
		"./components/topology-line-node.tsx",
	]

	for (const path of retiredFiles) {
		assert.equal(existsSync(new URL(path, import.meta.url)), false, `${path} 不应继续保留`)
	}

	assert.ok(e2eSource.includes("react-flow__"), "端到端验收必须覆盖共享 React Flow 画布")
	assert.equal(e2eSource.includes("pulse-free-"), false, "端到端验收不能继续引用自由画布")
	assert.equal(e2eSource.includes("pulse-fixed-topology-canvas"), false, "端到端验收不能继续引用旧固定画布")
})

test("home topology renders the status strip and details sidebar", () => {
	const source = readFileSync(new URL("../../components/routes/home-topology-workspace.tsx", import.meta.url), "utf8")

	assert.ok(source.includes("presenceStats"), "首页状态条必须按画布节点统计三态")
	assert.ok(source.includes("未探测"), "首页状态条必须显示未探测数量")
	assert.ok(source.includes("未恢复告警"), "首页状态条必须显示未恢复告警")
	assert.ok(source.includes("待处理事项"), "未选中节点时右侧栏必须显示待办")
	assert.ok(source.includes("查看详情"), "选中节点时右侧栏必须提供资产详情入口")
	// 2026-10-25 编辑入口统一走右上角「编辑拓扑」按钮（只对非只读账号显示），不再有页面级 editable 开关
	assert.ok(source.includes('getPagePath($router, "networkEdit")'), "首页必须提供编辑拓扑入口")
	assert.ok(source.includes("isReadOnlyUser()"), "只读账号不能看到编辑入口")
})

test("topology inspector and asset navigation stay in the shared workspace", () => {
	const workspaceSource = readFileSync(
		new URL("../../components/routes/home-topology-workspace.tsx", import.meta.url),
		"utf8"
	)

	assert.ok(
		workspaceSource.includes("<TopologyWorkspace") || workspaceSource.includes("export function TopologyWorkspace")
	)
	assert.equal(workspaceSource.includes("TopologyInspectorSheet"), false)
	assert.equal(workspaceSource.includes("TopologyWanDialog"), false)
	assert.ok(workspaceSource.includes('getPagePath($router, "asset"'), "节点双击必须导航到资产详情")
})

test("network topology keeps domain routes and a single read-only home overview", () => {
	const routerSource = readFileSync(new URL("../../components/router.tsx", import.meta.url), "utf8")
	const homeSource = readFileSync(
		new URL("../../components/routes/home-topology-workspace.tsx", import.meta.url),
		"utf8"
	)
	const manifestSource = readFileSync(new URL("./manifest.ts", import.meta.url), "utf8")
	const navbarSource = readFileSync(new URL("../../components/navbar.tsx", import.meta.url), "utf8")

	assert.ok(routerSource.includes('network: "/network/:domain?"'))
	assert.ok(manifestSource.includes('"/network/home"'))
	assert.ok(manifestSource.includes('"/network/technology"'))
	assert.equal(navbarSource.includes('"networkEdit"'), false, "网络拓扑不再占用导航栏入口，统一从首页编辑")
	assert.ok(homeSource.includes("useTopologyWorkspaceData"))
	assert.ok(homeSource.includes("<ReactFlow"))
})

test("editor splits network canvases and supports creating a new canvas", () => {
	const editorSource = readFileSync(
		new URL("../../components/routes/network-topology-editor.tsx", import.meta.url),
		"utf8"
	)

	assert.ok(editorSource.includes("DEFAULT_TOPOLOGY_CANVASES"), "编辑器必须提供默认网段画布")
	assert.ok(editorSource.includes("switchCanvas"), "编辑器必须能在画布之间切换")
	assert.ok(editorSource.includes("新建画布"), "编辑器必须提供新建画布入口")
	assert.ok(editorSource.includes("canvases"), "布局保存必须包含画布定义")
	assert.ok(editorSource.includes("canvasId"), "节点布局必须记录所属画布")
	assert.ok(editorSource.includes("viewportByCanvasRef"), "编辑器必须按画布保存平移视口")
	assert.ok(editorSource.includes("minZoom={1}"), "编辑器最小缩放必须是 100%")
	// 2026-10-25 用户要求：编辑页画布也固定 100%，全屏/自适应按钮一并去掉，画布就这么大
	assert.ok(editorSource.includes("maxZoom={1}"), "编辑器必须锁定 1 倍缩放")
	assert.ok(editorSource.includes("zoomOnScroll={false}"), "编辑器滚轮不能缩放")
	assert.equal(editorSource.includes('title="重置为 100%"'), false, "编辑器不再显示缩放重置按钮")
	assert.equal(editorSource.includes("{Math.round(zoom * 100)}%"), false, "编辑器不再显示缩放比例")
	assert.equal(editorSource.includes("MaximizeIcon"), false, "编辑器不再显示全屏/自适应按钮")
	assert.equal(editorSource.includes("<MiniMap"), false, "编辑器不再显示右下角小地图")
	assert.ok(editorSource.includes("buildCanvasExtent"), "编辑器必须限定卡片可拖动范围")
	assert.ok(editorSource.includes("nodeExtent={canvasExtent"), "卡片不能拖出初始画布范围")
	assert.ok(editorSource.includes("BackgroundVariant.Lines"), "编辑器必须显示定位网格")
	assert.ok(editorSource.includes('title="切换对齐辅助线"'), "对齐辅助线开关必须放在顶栏")
	assert.equal(editorSource.includes("自动布局"), false, "编辑器不再提供自动布局入口")
	assert.equal(editorSource.includes("网格吸附："), false, "底栏不能重复显示网格吸附")
	assert.equal(editorSource.includes("对齐辅助线："), false, "底栏不能重复显示辅助线")
	assert.equal(editorSource.includes("activeCanvas.name} · 节点"), false, "顶部不能重复显示节点链路统计")
	assert.equal(editorSource.includes("拖拽资源到画布"), false, "顶部不能显示过小的状态说明")
})

test("display workspace only reads the current domain canvas layout", () => {
	const homeSource = readFileSync(
		new URL("../../components/routes/home-topology-workspace.tsx", import.meta.url),
		"utf8"
	)
	const layoutSource = readFileSync(new URL("./use-topology-layout.ts", import.meta.url), "utf8")

	assert.ok(homeSource.includes("domainLayout"), "展示页必须按当前网段筛选布局")
	assert.ok(homeSource.includes("node.canvasId === domain"), "展示页不能读取其他画布的节点")
	assert.ok(homeSource.includes("domain,"), "展示页构图必须按网段过滤连线")
	// 2026-10-25 展示页锁定 1 倍：不再套用编辑器保存的缩放，只按固定比例居中
	assert.equal(homeSource.includes("savedZoom"), false, "展示页不再套用保存的缩放")
	assert.equal(homeSource.includes("getSharedTopologyZoom"), false, "展示页不再读取共享缩放")
	assert.ok(homeSource.includes("minZoom: 1"), "展示页 fitView 必须锁定 100%")
	assert.ok(layoutSource.includes("normalizeTopologyCanvases(record.canvases)"), "布局加载必须保留画布缩放")
})
