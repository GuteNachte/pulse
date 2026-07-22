import assert from "node:assert/strict"
import test from "node:test"
import { createCanvasHistory, type CanvasSnapshot } from "./history.ts"

const snapshot = (x: number): CanvasSnapshot => ({
	nodes: { a: { x, y: 2 } },
	edgeWaypoints: {},
})

test("undoes and redoes immutable canvas snapshots", () => {
	const initial = createCanvasHistory(snapshot(0), 50)
	const moved = initial.push(snapshot(1))
	const undone = moved.undo()

	assert.deepEqual(undone.present, snapshot(0))
	assert.deepEqual(undone.redo().present, snapshot(1))
	assert.deepEqual(initial.present, snapshot(0))
})

test("does not push duplicates and caps history size", () => {
	let history = createCanvasHistory(snapshot(0), 2)
	history = history.push(snapshot(0)).push(snapshot(1)).push(snapshot(2)).push(snapshot(3))

	assert.equal(history.past.length, 2)
	assert.deepEqual(history.undo().undo().present, snapshot(1))
})
