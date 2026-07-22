import assert from "node:assert/strict"
import test from "node:test"
import { createEmptyLayout, parseTopologyLayout, serializeTopologyLayout } from "./layout-v2.ts"

test("migrates legacy node positions and viewport without selection state", () => {
	const result = parseTopologyLayout({
		nodes: { "asset-a": { x: 20, y: 40 } },
		selected: "asset-a",
		viewport: { x: 1, y: 2, zoom: 0.8 },
	})

	assert.equal(result.version, 2)
	assert.deepEqual(result.nodes["asset-a"], { x: 20, y: 40 })
	assert.deepEqual(result.edgeWaypoints, {})
	assert.deepEqual(result.viewport, { x: 1, y: 2, zoom: 0.8 })
	assert.equal("selected" in serializeTopologyLayout(result), false)
})

test("round trips edge waypoints in the persisted snake-case shape", () => {
	const layout = createEmptyLayout()
	layout.edgeWaypoints["relation-a"] = [{ x: 100, y: 200 }]

	const serialized = serializeTopologyLayout(layout)
	assert.deepEqual(serialized.edge_waypoints, { "relation-a": [{ x: 100, y: 200 }] })
	assert.deepEqual(parseTopologyLayout(serialized).edgeWaypoints, layout.edgeWaypoints)
})

test("drops invalid points and restores a safe viewport", () => {
	const result = parseTopologyLayout({
		version: 2,
		nodes: {
			valid: { x: 1, y: 2 },
			invalid: { x: Number.NaN, y: 3 },
		},
		edge_waypoints: {
			relation: [{ x: 4, y: 5 }, { x: Number.POSITIVE_INFINITY, y: 6 }],
		},
		viewport: { x: 0, y: 0, zoom: 0 },
	})

	assert.deepEqual(result.nodes, { valid: { x: 1, y: 2 } })
	assert.deepEqual(result.edgeWaypoints, { relation: [{ x: 4, y: 5 }] })
	assert.deepEqual(result.viewport, { x: 0, y: 0, zoom: 1 })
})
