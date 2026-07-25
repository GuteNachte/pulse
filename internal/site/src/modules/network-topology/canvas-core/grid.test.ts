import assert from "node:assert/strict"
import test from "node:test"
import { snapTopologyPoint, TOPOLOGY_GRID_SIZE } from "./grid.ts"

test("snaps topology points to the 24px canvas grid", () => {
	assert.equal(TOPOLOGY_GRID_SIZE, 24)
	assert.deepEqual(snapTopologyPoint({ x: 83, y: 71 }), { x: 72, y: 72 })
	assert.deepEqual(snapTopologyPoint({ x: 11, y: 11 }), { x: 0, y: 0 })
})
