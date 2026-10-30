import assert from "node:assert/strict"
import test from "node:test"
import type { AssetInterfaceRecord, AssetRecord } from "@/types"
import {
	DEFAULT_TOPOLOGY_CANVASES,
	autoLayoutEditorGraph,
	buildEditorEdgeFromRelation,
	buildEditorGraph,
	buildLayoutPayload,
	buildRelationSavePayload,
	createEditorEdge,
	groupAssetsForLibrary,
	normalizeLayoutNodes,
	normalizeNodeSettings,
	normalizeTopologyCanvases,
	reconnectEditorEdge,
	toLayoutNode,
} from "./editor-model.ts"

const assets = [
	{ id: "internet", name: "科技网", type: "internet", metadata: { network_domain: "科技网" } },
	{ id: "router", name: "小米 BE7000", type: "router", metadata: {} },
	{ id: "phone", name: "手机", type: "phone", metadata: {} },
	{ id: "switch", name: "交换机", type: "switch", metadata: {} },
	{ id: "host", name: "主机", type: "mini_pc", metadata: {} },
] as unknown as AssetRecord[]
const interfaces = [
	{
		id: "router-wan",
		asset: "router",
		name: "WAN",
		kind: "wan",
		speed_mbps: 2500,
		primary: true,
		metadata: { enabled: true },
	},
	{ id: "router-wifi", asset: "router", name: "Wi-Fi", kind: "wifi", metadata: { enabled: true, band: "5 GHz" } },
	{ id: "phone-wifi", asset: "phone", name: "Wi-Fi", kind: "wifi", metadata: { enabled: true, band: "5 GHz" } },
	{ id: "switch-lan", asset: "switch", name: "LAN1", kind: "ethernet", speed_mbps: 2500, metadata: { enabled: true } },
	{ id: "host-eth", asset: "host", name: "网口", kind: "ethernet", speed_mbps: 2500, metadata: { enabled: true } },
] as unknown as AssetInterfaceRecord[]

test("node display defaults include model and location", () => {
	assert.equal(normalizeNodeSettings({}).showModel, true)
	assert.equal(normalizeNodeSettings({ showModel: false }).showModel, false)
	assert.equal(normalizeNodeSettings({}).showLocation, true)
	assert.equal(normalizeNodeSettings({ showLocation: false }).showLocation, false)
})

test("builds editor nodes and edges from layout and hides removed nodes", () => {
	const graph = buildEditorGraph({
		assets,
		interfaces,
		relations: [
			{
				id: "rel-1",
				source_asset: "internet",
				target_asset: "router",
				kind: "connected_to",
				label: "",
				metadata: { link_kind: "internet", target_interface: "router-wan", network_domain: "technology" },
			},
			{
				id: "rel-2",
				source_asset: "phone",
				target_asset: "router",
				kind: "connected_to",
				label: "",
				metadata: { link_kind: "wifi", source_interface: "phone-wifi", target_interface: "router-wifi" },
			},
			{
				id: "rel-3",
				source_asset: "switch",
				target_asset: "host",
				kind: "connected_to",
				label: "",
				metadata: { link_kind: "ethernet", source_interface: "switch-lan", target_interface: "host-eth" },
			},
		] as never,
		layout: {
			nodes: [
				{ assetId: "internet", x: 40, y: 40, ...normalizeNodeSettings({}) },
				{ assetId: "router", x: 320, y: 40, ...normalizeNodeSettings({ scale: 1.2 }) },
				{ assetId: "phone", x: 600, y: 40, ...normalizeNodeSettings({}) },
				{ assetId: "switch", x: 320, y: 220, ...normalizeNodeSettings({}), hidden: true },
				{ assetId: "host", x: 600, y: 220, ...normalizeNodeSettings({}) },
			],
		},
		systems: [],
	})

	assert.deepEqual(
		graph.nodes.map((node) => node.id),
		["internet", "router", "phone", "host"]
	)
	assert.equal(graph.nodes.find((node) => node.id === "router")?.position.x, 320)
	assert.equal(graph.edges.length, 2)
	const wifiEdge = graph.edges.find((edge) => edge.id === "rel-2")
	assert.equal(wifiEdge?.source, "router")
	assert.equal(wifiEdge?.target, "phone")
	assert.equal(wifiEdge?.data.sourceInterface, "router-wifi")
	assert.equal(wifiEdge?.data.targetInterface, "phone-wifi")
	assert.equal(wifiEdge?.sourceHandle, "right")
	assert.equal(wifiEdge?.targetHandle, "left")
	assert.ok(!graph.edges.some((edge) => edge.source === "switch" || edge.target === "switch"))
	assert.deepEqual([...graph.hiddenAssetIds], ["switch"])
	assert.equal(graph.hasLayout, true)
})

test("existing relations keep their saved topology domain", () => {
	const edge = buildEditorEdgeFromRelation(
		{
			id: "rel-tech",
			source_asset: "phone",
			target_asset: "router",
			kind: "connected_to",
			label: "",
			metadata: { link_kind: "wifi", network_domain: "technology" },
		} as never,
		new Map(assets.map((asset) => [asset.id, asset]))
	)
	assert.equal(edge.data.domain, "technology")
})

test("new internet and wifi edges normalize direction and pick interfaces", () => {
	const internetEdge = createEditorEdge("router", "internet", assets, interfaces, "edge-internet")
	assert.equal(internetEdge.source, "internet")
	assert.equal(internetEdge.target, "router")
	assert.equal(internetEdge.data.medium, "fiber")
	assert.equal(internetEdge.data.sourceInterface, "")
	assert.equal(internetEdge.data.targetInterface, "router-wan")
	assert.equal(internetEdge.data.domain, "technology")
	assert.equal(internetEdge.data.bandwidth, "2.5G")

	const wifiEdge = createEditorEdge("router", "phone", assets, interfaces, "edge-wifi")
	assert.equal(wifiEdge.source, "router")
	assert.equal(wifiEdge.target, "phone")
	assert.equal(wifiEdge.data.medium, "wifi")
	assert.equal(wifiEdge.data.sourceInterface, "router-wifi")
	assert.equal(wifiEdge.data.targetInterface, "phone-wifi")
	assert.equal(wifiEdge.data.band, "5 GHz")
	assert.equal(wifiEdge.sourceHandle, "right")
	assert.equal(wifiEdge.targetHandle, "left")

	const wifiPayload = buildRelationSavePayload(wifiEdge, undefined, new Map(assets.map((asset) => [asset.id, asset])))
	assert.equal(wifiPayload.source_asset, "phone")
	assert.equal(wifiPayload.target_asset, "router")
	assert.equal(wifiPayload.metadata.source_interface, "phone-wifi")
	assert.equal(wifiPayload.metadata.target_interface, "router-wifi")
	assert.equal(wifiPayload.metadata.wifi_band, "5 GHz")
	assert.equal(wifiPayload.metadata.source_handle, undefined)

	const manualEdge = createEditorEdge("router", "phone", assets, interfaces, "edge-manual", "top", "bottom")
	assert.equal(manualEdge.data.handlesManual, true)
	const manualPayload = buildRelationSavePayload(
		manualEdge,
		undefined,
		new Map(assets.map((asset) => [asset.id, asset]))
	)
	assert.equal(manualPayload.metadata.source_handle, "top")
	assert.equal(manualPayload.metadata.target_handle, "bottom")
})

test("reconnecting an edge updates handles and keeps unchanged interfaces", () => {
	const edge = createEditorEdge("router", "phone", assets, interfaces, "edge-reconnect")
	const reconnected = reconnectEditorEdge(
		edge,
		{ source: "router", target: "phone", sourceHandle: "top", targetHandle: "bottom" },
		assets,
		interfaces
	)
	assert.equal(reconnected.source, "router")
	assert.equal(reconnected.target, "phone")
	assert.equal(reconnected.sourceHandle, "top")
	assert.equal(reconnected.targetHandle, "bottom")
	assert.equal(reconnected.data.handlesManual, true)
	assert.equal(reconnected.data.sourceInterface, "router-wifi")
	assert.equal(reconnected.data.targetInterface, "phone-wifi")
})

test("saved manual handles are restored with the relation", () => {
	const edge = buildEditorEdgeFromRelation(
		{
			id: "rel-manual-handles",
			source_asset: "phone",
			target_asset: "router",
			kind: "connected_to",
			label: "",
			metadata: {
				link_kind: "wifi",
				source_handle: "left",
				target_handle: "right",
				network_domain: "home",
			},
		} as never,
		new Map(assets.map((asset) => [asset.id, asset]))
	)
	assert.equal(edge.data.handlesManual, true)
	assert.equal(edge.sourceHandle, "left")
	assert.equal(edge.targetHandle, "right")
})

test("saving an internet edge keeps the broadband as source and omits source interface", () => {
	const edge = createEditorEdge("internet", "router", assets, interfaces, "edge-save")
	const payload = buildRelationSavePayload(edge, undefined, new Map(assets.map((asset) => [asset.id, asset])))
	assert.equal(payload.source_asset, "internet")
	assert.equal(payload.target_asset, "router")
	assert.equal(payload.metadata.link_kind, "internet")
	assert.equal(payload.metadata.network_domain, "technology")
	assert.equal(payload.metadata.source_interface, undefined)
	assert.equal(payload.metadata.target_interface, "router-wan")
})

test("auto layout gives every node a non-negative position", () => {
	const graph = buildEditorGraph({
		assets,
		interfaces,
		relations: [
			{
				id: "rel-1",
				source_asset: "switch",
				target_asset: "host",
				kind: "connected_to",
				label: "",
				metadata: { link_kind: "ethernet" },
			},
		] as never,
		layout: null,
		systems: [],
	})
	const laidOut = autoLayoutEditorGraph(graph.nodes, graph.edges)
	for (const node of laidOut) {
		assert.ok(node.position.x >= 0)
		assert.ok(node.position.y >= 0)
	}
	assert.ok(new Set(laidOut.map((node) => `${node.position.x},${node.position.y}`)).size > 1)
})

test("layout payload keeps hidden devices and node display settings", () => {
	const graph = buildEditorGraph({
		assets,
		interfaces,
		relations: [
			{ id: "rel-1", source_asset: "switch", target_asset: "host", kind: "connected_to", label: "", metadata: {} },
		] as never,
		layout: null,
		systems: [],
	})
	const node = graph.nodes.find((item) => item.id === "host")
	assert.ok(node)
	if (!node) return
	node.data.settings = { ...node.data.settings, showModel: true, notes: "机柜" }
	const hidden = toLayoutNode(node, true)
	const payload = buildLayoutPayload([], [hidden])
	const saved = payload.nodes.find((item) => item.assetId === "host")
	assert.equal(saved?.hidden, true)
	assert.equal(saved?.notes, "机柜")
	assert.equal(saved?.showModel, true)
})

test("library groups use Pulse asset groups and separate broadband access", () => {
	const groups = groupAssetsForLibrary(assets)
	assert.equal(groups[0]?.title, "宽带接入")
	assert.ok(groups.some((group) => group.title === "网络设备" && group.assets.some((asset) => asset.id === "router")))
})

test("canvas definitions keep default networks and append custom canvases", () => {
	assert.deepEqual(
		DEFAULT_TOPOLOGY_CANVASES.map((canvas) => canvas.name),
		["家庭网", "科技网"]
	)
	const canvases = normalizeTopologyCanvases([
		{ id: "home", name: "覆盖家庭网", domain: "home", viewport: { x: 10, y: 20, zoom: 1.25 } },
		{ id: "iot", name: "IoT 网", domain: "iot", viewport: { x: 30, y: 40, zoom: 0.5 } },
	])
	assert.deepEqual(
		canvases.map((canvas) => canvas.name),
		["家庭网", "科技网", "IoT 网"]
	)
	assert.equal(canvases.find((canvas) => canvas.id === "iot")?.domain, "iot")
	assert.deepEqual(canvases.find((canvas) => canvas.id === "home")?.viewport, { x: 10, y: 20, zoom: 1.25 })
	assert.deepEqual(canvases.find((canvas) => canvas.id === "iot")?.viewport, { x: 30, y: 40, zoom: 1 })
})

test("legacy layout nodes are assigned to their network canvas", () => {
	const canvases = normalizeTopologyCanvases([{ id: "iot", name: "IoT 网", domain: "iot" }])
	const nodes = normalizeLayoutNodes(
		[
			{ assetId: "internet", x: 0, y: 0, ...normalizeNodeSettings({}) },
			{ assetId: "switch", x: 220, y: 0, ...normalizeNodeSettings({}) },
			{ assetId: "host", canvasId: "iot", x: 440, y: 0, ...normalizeNodeSettings({}) },
		],
		canvases,
		new Map(assets.map((asset) => [asset.id, asset]))
	)
	assert.equal(nodes.find((node) => node.assetId === "internet")?.canvasId, "technology")
	assert.equal(nodes.find((node) => node.assetId === "switch")?.canvasId, "home")
	assert.equal(nodes.find((node) => node.assetId === "host")?.canvasId, "iot")
})

test("graph filters relations by the active canvas domain", () => {
	const relations = [
		{
			id: "rel-home",
			source_asset: "switch",
			target_asset: "host",
			kind: "connected_to",
			label: "",
			metadata: { link_kind: "ethernet", network_domain: "home" },
		},
		{
			id: "rel-tech",
			source_asset: "internet",
			target_asset: "router",
			kind: "connected_to",
			label: "",
			metadata: { link_kind: "internet", network_domain: "technology" },
		},
	] as never
	const homeGraph = buildEditorGraph({ assets, interfaces, relations, layout: null, systems: [], domain: "home" })
	const techGraph = buildEditorGraph({
		assets,
		interfaces,
		relations,
		layout: null,
		systems: [],
		domain: "technology",
	})
	assert.deepEqual(
		homeGraph.edges.map((edge) => edge.id),
		["rel-home"]
	)
	assert.deepEqual(
		techGraph.edges.map((edge) => edge.id),
		["rel-tech"]
	)
})

test("layout payload records the canvas and custom edge domain", () => {
	const graph = buildEditorGraph({
		assets,
		interfaces,
		relations: [],
		layout: { nodes: [{ assetId: "host", x: 0, y: 0, ...normalizeNodeSettings({}) }] },
		systems: [],
	})
	const node = graph.nodes.find((item) => item.id === "host")
	assert.ok(node)
	if (!node) return
	const payload = buildLayoutPayload([node], [], "iot")
	assert.equal(payload.nodes[0]?.canvasId, "iot")

	const customEdge = createEditorEdge("router", "phone", assets, interfaces, "edge-custom", null, null, "iot")
	assert.equal(customEdge.data.domain, "iot")
	const relationPayload = buildRelationSavePayload(
		customEdge,
		undefined,
		new Map(assets.map((asset) => [asset.id, asset]))
	)
	assert.equal(relationPayload.metadata.network_domain, "iot")
})
