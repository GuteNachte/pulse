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
	assert.ok(workspaceSource.includes("h-[min(56vh,560px)]"), "总览画布应按桌面窗口自适应高度")
	assert.equal(homeSource.includes("TopologyMatrix"), false, "首页不应继续引用旧矩阵")
	assert.equal(homeSource.includes("TopologyInspectorSheet"), false, "首页不应挂载编辑详情抽屉")
})

test("home topology places its compact summary after the page title", () => {
	const source = readFileSync(new URL("../../components/routes/home-network-topology.tsx", import.meta.url), "utf8")
	const titleIndex = source.indexOf(">家庭网络拓扑</h2>")
	const summaryIndex = source.indexOf('aria-label="网络拓扑概览"')

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
	assert.ok(toolbarSource.includes('getPagePath($router, "network", { domain: "home" })'))
	assert.ok(toolbarSource.includes('getPagePath($router, "network", { domain: "technology" })'))
	assert.ok(toolbarSource.includes("size-9 min-h-9"), "工具栏图标按钮应保持固定尺寸")
	assert.ok(workspaceSource.includes("ConnectionMode.Loose"))
	assert.ok(workspaceSource.includes("BackgroundVariant.Dots"))
	assert.equal(workspaceSource.includes("pulse-matrix-band"), false)
})

test("topology relation controls enforce read-only mode before mutations", () => {
	const workspaceSource = readFileSync(new URL("./components/topology-workspace.tsx", import.meta.url), "utf8")
	const sheetSource = readFileSync(new URL("./components/topology-connection-sheet.tsx", import.meta.url), "utf8")
	const operationSource = readFileSync(new URL("./relation-operations.ts", import.meta.url), "utf8")

	assert.ok(workspaceSource.includes("nodesConnectable={!readOnly}"))
	assert.ok(workspaceSource.includes("if (readOnly) return"))
	assert.ok(sheetSource.includes("saveNetworkRelation"))
	assert.ok(sheetSource.includes("deleteNetworkRelation"))
	assert.ok(sheetSource.includes("relation && !readOnly"), "只读账号不应看到删除入口")
	assert.ok(operationSource.match(/if \(readOnly\) return \{ status: "forbidden" \}/g)?.length === 2)
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
