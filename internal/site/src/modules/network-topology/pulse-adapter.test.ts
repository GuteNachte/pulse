import assert from "node:assert/strict"
import test from "node:test"
import type { AssetInterfaceRecord, AssetRecord, AssetRelationRecord, SystemRecord } from "../../types.ts"
import { createEmptyLayout } from "./layout-v2.ts"
import { buildPulseTopologyGraph } from "./pulse-adapter.ts"

const assetNodeId = (id: string) => `asset:${id}`

function asset(id: string, name: string, type: AssetRecord["type"] = "custom", role?: string) {
	return { id, name, type, role } as AssetRecord
}

function networkInterface(id: string, assetId: string, kind: AssetInterfaceRecord["kind"], name = id) {
	return { id, asset: assetId, kind, name } as AssetInterfaceRecord
}

function relation(
	id: string,
	sourceAsset: string,
	targetAsset: string,
	metadata?: Record<string, unknown>,
	label?: string
) {
	return {
		id,
		source_asset: sourceAsset,
		target_asset: targetAsset,
		kind: "connected_to",
		metadata,
		label,
	} as AssetRelationRecord
}

test("builds the selected domain from real assets, interfaces and saved layout", () => {
	const internet = asset("internet", "家庭宽带", "internet")
	const router = asset("router", "华为主网关", "gateway")
	const phone = asset("phone", "OPPO Find X9 Pro", "phone")
	const technologyRouter = asset("technology-router", "科技网路由器", "router")
	const pon = networkInterface("pon-router", router.id, "pon", "PON")
	const routerWifi = networkInterface("wifi-router", router.id, "wifi", "5 GHz Wi-Fi")
	const phoneWifi = networkInterface("wifi-phone", phone.id, "wifi", "Wi-Fi")
	const homeFiberRelation = relation("relation-fiber", internet.id, router.id, {
		network_domain: "home",
		link_kind: "fiber",
		target_interface: pon.id,
	})
	const homeWifiRelation = relation("relation-wifi", router.id, phone.id, {
		network_domain: "home",
		link_kind: "wifi",
		source_interface: routerWifi.id,
		target_interface: phoneWifi.id,
		source_handle: "bottom",
		target_handle: "top",
	})
	const technologyRelation = relation("relation-technology", technologyRouter.id, phone.id, {
		network_domain: "technology",
		link_kind: "wifi",
	})
	const layout = createEmptyLayout()
	layout.nodes[assetNodeId(router.id)] = { x: 320, y: 180 }
	layout.edgeWaypoints[homeWifiRelation.id] = [{ x: 540, y: 210 }]

	const graph = buildPulseTopologyGraph({
		domain: "home",
		assets: [internet, router, phone, technologyRouter],
		interfaces: [pon, routerWifi, phoneWifi],
		relations: [homeFiberRelation, homeWifiRelation, technologyRelation],
		systems: [{ id: "system-router", asset: router.id, status: "up" } as SystemRecord],
		details: [],
		layout,
	})

	assert.deepEqual(
		graph.nodes.map((node) => node.id),
		[assetNodeId(internet.id), assetNodeId(router.id), assetNodeId(phone.id)]
	)
	assert.deepEqual(graph.nodes[1].position, { x: 320, y: 180 })
	assert.equal(graph.nodes[1].data.kind, "asset")
	assert.equal(graph.nodes[1].data.status, "up")
	assert.deepEqual(
		graph.nodes[1].data.interfaces.map((item) => item.id),
		[pon.id, routerWifi.id]
	)
	assert.equal(graph.edges[0].data?.medium, "fiber")
	assert.equal(graph.edges[0].data?.targetInterface?.id, pon.id)
	assert.equal(graph.edges[1].data?.medium, "wifi")
	assert.equal(graph.edges[1].data?.sourceInterface?.id, routerWifi.id)
	assert.equal(graph.edges[1].data?.targetInterface?.id, phoneWifi.id)
	assert.equal(graph.edges[0].sourceHandle, "right")
	assert.equal(graph.edges[0].targetHandle, "left")
	assert.equal(graph.edges[1].sourceHandle, "bottom")
	assert.equal(graph.edges[1].targetHandle, "top")
	assert.deepEqual(graph.edges[1].data?.waypoints, [{ x: 540, y: 210 }])
	assert.deepEqual(
		graph.edges.map((edge) => edge.id),
		[homeFiberRelation.id, homeWifiRelation.id]
	)
})

test("uses legacy network names only when a relation has no explicit domain", () => {
	const homeRouter = asset("home-router", "家庭主网关", "router")
	const technologyRouter = asset("technology-router", "小米 AX7000", "router", "科技网路由器")
	const sharedPhone = asset("shared-phone", "测试终端", "phone")
	const legacyTechnology = relation("legacy-technology", technologyRouter.id, sharedPhone.id, {
		link_kind: "wifi",
	})
	const explicitHome = relation("explicit-home", technologyRouter.id, homeRouter.id, {
		network_domain: "home",
		link_kind: "ethernet",
	})

	const home = buildPulseTopologyGraph({
		domain: "home",
		assets: [homeRouter, technologyRouter, sharedPhone],
		interfaces: [],
		relations: [legacyTechnology, explicitHome],
		systems: [],
		details: [],
		layout: createEmptyLayout(),
	})
	const technology = buildPulseTopologyGraph({
		domain: "technology",
		assets: [homeRouter, technologyRouter, sharedPhone],
		interfaces: [],
		relations: [legacyTechnology, explicitHome],
		systems: [],
		details: [],
		layout: createEmptyLayout(),
	})

	assert.deepEqual(
		home.edges.map((edge) => edge.id),
		[explicitHome.id]
	)
	assert.deepEqual(
		technology.edges.map((edge) => edge.id),
		[legacyTechnology.id]
	)
	assert.ok(home.nodes.some((node) => node.id === assetNodeId(technologyRouter.id)))
	assert.ok(technology.nodes.some((node) => node.id === assetNodeId(technologyRouter.id)))
})

test("reports missing endpoints and interfaces without inventing records", () => {
	const router = asset("router", "主网关", "gateway")
	const broken = relation("broken", router.id, "missing-device", {
		network_domain: "home",
		link_kind: "ethernet",
		source_interface: "missing-source-port",
		target_interface: "missing-target-port",
	})

	const graph = buildPulseTopologyGraph({
		domain: "home",
		assets: [router],
		interfaces: [],
		relations: [broken],
		systems: [],
		details: [],
		layout: createEmptyLayout(),
	})

	assert.equal(graph.nodes[1].data.kind, "placeholder")
	if (graph.nodes[1].data.kind === "placeholder") {
		assert.equal(graph.nodes[1].data.missingAssetId, "missing-device")
		assert.deepEqual(graph.nodes[1].data.interfaces, [])
		assert.deepEqual(graph.nodes[1].data.diagnosticCodes, ["missing-asset"])
	}
	assert.equal(graph.edges[0].data?.sourceInterface, undefined)
	assert.equal(graph.edges[0].data?.targetInterface, undefined)
	assert.deepEqual(graph.edges[0].data?.diagnosticCodes.sort(), ["missing-asset", "missing-interface"])
})

test("marks an interface reused by multiple relations as a conflict", () => {
	const router = asset("router", "主网关", "router")
	const phoneA = asset("phone-a", "手机 A", "phone")
	const phoneB = asset("phone-b", "手机 B", "phone")
	const sharedWifi = networkInterface("wifi-router", router.id, "wifi")
	const relations = [
		relation("wifi-a", router.id, phoneA.id, {
			network_domain: "home",
			link_kind: "wifi",
			source_interface: sharedWifi.id,
		}),
		relation("wifi-b", router.id, phoneB.id, {
			network_domain: "home",
			link_kind: "wifi",
			source_interface: sharedWifi.id,
		}),
	]

	const graph = buildPulseTopologyGraph({
		domain: "home",
		assets: [router, phoneA, phoneB],
		interfaces: [sharedWifi],
		relations,
		systems: [],
		details: [],
		layout: createEmptyLayout(),
	})

	assert.ok(graph.edges.every((edge) => edge.data?.diagnosticCodes.includes("interface-conflict")))
})

test("preserves a saved line branch as a rendered edge attachment", () => {
	const gateway = asset("gateway", "主网关", "gateway")
	const switchAsset = asset("switch", "交换机", "switch")
	const client = asset("client", "客户端", "physical_host")
	const parent = relation("parent", gateway.id, switchAsset.id, {
		network_domain: "home",
		link_kind: "ethernet",
	})
	const branch = relation("branch", gateway.id, client.id, {
		network_domain: "home",
		link_kind: "ethernet",
		branch_from_relation: parent.id,
		branch_ratio: 0.6,
		branch_endpoint: "source",
	})

	const graph = buildPulseTopologyGraph({
		domain: "home",
		assets: [gateway, switchAsset, client],
		interfaces: [],
		relations: [parent, branch],
		systems: [],
		details: [],
		layout: createEmptyLayout(),
	})

	assert.deepEqual(graph.edges[1].data?.branch, {
		parentRelationId: parent.id,
		ratio: 0.6,
		endpoint: "source",
	})
})
