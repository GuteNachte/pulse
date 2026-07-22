import assert from "node:assert/strict"
import test from "node:test"
import { createEmptyLayout } from "../layout-v2.ts"
import { canvasSnapshotFromLayout, layoutFromCanvasSnapshot } from "./serialization.ts"

test("serializes only node positions and edge waypoints", () => {
	const layout = createEmptyLayout()
	layout.nodes = { a: { x: 1, y: 2 } }
	layout.edgeWaypoints = { edge: [{ x: 3, y: 4 }] }
	const snapshot = canvasSnapshotFromLayout(layout)

	assert.deepEqual(snapshot, {
		nodes: { a: { x: 1, y: 2 } },
		edgeWaypoints: { edge: [{ x: 3, y: 4 }] },
	})
	assert.deepEqual(layoutFromCanvasSnapshot(snapshot, { x: 5, y: 6, zoom: 0.8 }), {
		version: 2,
		nodes: { a: { x: 1, y: 2 } },
		edgeWaypoints: { edge: [{ x: 3, y: 4 }] },
		viewport: { x: 5, y: 6, zoom: 0.8 },
	})
})

test("returns detached copies that cannot mutate the source layout", () => {
	const layout = createEmptyLayout()
	layout.nodes.a = { x: 1, y: 2 }
	const snapshot = canvasSnapshotFromLayout(layout)
	snapshot.nodes.a.x = 99

	assert.equal(layout.nodes.a.x, 1)
})
