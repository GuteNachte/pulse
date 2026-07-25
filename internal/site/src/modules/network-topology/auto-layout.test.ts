import assert from "node:assert/strict"
import test from "node:test"
import type { AssetRecord, AssetRelationRecord } from "../../types.ts"
import { createEmptyLayout } from "./layout-v2.ts"
import { buildPulseTopologyGraph } from "./pulse-adapter.ts"
import { SUGGESTED_NODE_WIDTH, createSuggestedLayout } from "./auto-layout.ts"

const assetNodeId = (id: string) => `asset:${id}`

function asset(id: string, name: string, type: AssetRecord["type"]) {
	return { id, name, type } as AssetRecord
}

function relation(id: string, source: string, target: string) {
	return {
		id,
		source_asset: source,
		target_asset: target,
		kind: "connected_to",
		metadata: { network_domain: "home", link_kind: "ethernet" },
	} as unknown as AssetRelationRecord
}

test("creates stable suggested positions without mutating graph records or endpoints", () => {
	const internet = asset("internet", "家庭宽带", "internet")
	const router = asset("router", "主网关", "router")
	const switchAsset = asset("switch", "核心交换机", "switch")
	const relations = [
		relation("internet-router", internet.id, router.id),
		relation("router-switch", router.id, switchAsset.id),
	]
	const graph = buildPulseTopologyGraph({
		domain: "home",
		assets: [switchAsset, router, internet],
		interfaces: [],
		relations,
		systems: [],
		details: [],
		layout: createEmptyLayout(),
	})
	const originalGraph = structuredClone(graph)
	const originalEdgeIds = graph.edges.map((edge) => edge.id)

	const first = createSuggestedLayout(graph)
	const second = createSuggestedLayout(graph)

	assert.deepEqual(first, second)
	assert.deepEqual(Object.keys(first.nodes).sort(), graph.nodes.map((node) => node.id).sort())
	assert.deepEqual(Object.keys(first.edgeWaypoints).sort(), originalEdgeIds.sort())
	assert.ok(
		Math.abs(first.nodes[assetNodeId(router.id)].x - first.nodes[assetNodeId(internet.id)].x) >= SUGGESTED_NODE_WIDTH
	)
	assert.ok(
		Math.abs(first.nodes[assetNodeId(switchAsset.id)].x - first.nodes[assetNodeId(router.id)].x) >= SUGGESTED_NODE_WIDTH
	)
	assert.deepEqual(first.edgeWaypoints, {
		"internet-router": [],
		"router-switch": [],
	})
	assert.deepEqual(graph, originalGraph)
	assert.deepEqual(
		graph.edges.map((edge) => edge.id),
		originalEdgeIds
	)
})

test("includes disconnected graph nodes in a deterministic row", () => {
	const alpha = asset("alpha", "Alpha", "custom")
	const beta = asset("beta", "Beta", "custom")
	const graph = {
		nodes: [
			{
				id: assetNodeId(beta.id),
				position: { x: 0, y: 0 },
				data: { kind: "asset" as const, asset: beta, interfaces: [], diagnosticCodes: [] },
			},
			{
				id: assetNodeId(alpha.id),
				position: { x: 0, y: 0 },
				data: { kind: "asset" as const, asset: alpha, interfaces: [], diagnosticCodes: [] },
			},
		],
		edges: [],
	}

	const layout = createSuggestedLayout(graph)

	assert.ok(layout.nodes[assetNodeId(alpha.id)].y < layout.nodes[assetNodeId(beta.id)].y)
	assert.deepEqual(layout.edgeWaypoints, {})
})

test("orders reversed relations from network entry through infrastructure to clients", () => {
	const internet = asset("internet", "家庭宽带", "internet")
	const router = asset("router", "主网关", "router")
	const switchAsset = asset("switch", "核心交换机", "switch")
	const phone = asset("phone", "手机", "phone")
	const nas = asset("nas", "NAS", "nas")
	const relations = [
		relation("router-internet", router.id, internet.id),
		relation("switch-router", switchAsset.id, router.id),
		relation("phone-router", phone.id, router.id),
		relation("nas-switch", nas.id, switchAsset.id),
	]
	const graph = buildPulseTopologyGraph({
		domain: "home",
		assets: [phone, switchAsset, internet, nas, router],
		interfaces: [],
		relations,
		systems: [],
		details: [],
		layout: createEmptyLayout(),
	})

	const layout = createSuggestedLayout(graph)

	assert.ok(layout.nodes[assetNodeId(internet.id)].x < layout.nodes[assetNodeId(router.id)].x)
	assert.ok(layout.nodes[assetNodeId(router.id)].x < layout.nodes[assetNodeId(switchAsset.id)].x)
	assert.ok(layout.nodes[assetNodeId(switchAsset.id)].x < layout.nodes[assetNodeId(phone.id)].x)
	assert.equal(layout.nodes[assetNodeId(phone.id)].x, layout.nodes[assetNodeId(nas.id)].x)
	for (const position of Object.values(layout.nodes)) {
		assert.equal(position.x % 24, 0)
		assert.equal(position.y % 24, 0)
	}
})
