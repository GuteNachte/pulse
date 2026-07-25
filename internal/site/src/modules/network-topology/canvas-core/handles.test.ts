import assert from "node:assert/strict"
import test from "node:test"
import { normalizeHandleId, resolveTopologyEdgeHandles, TOPOLOGY_HANDLE_IDS } from "./handles.ts"

test("exposes one stable handle on every node side", () => {
	assert.deepEqual(TOPOLOGY_HANDLE_IDS, ["top", "right", "bottom", "left"])
})

test("normalizes unknown handles to the right side", () => {
	assert.equal(normalizeHandleId("top"), "top")
	assert.equal(normalizeHandleId("invalid"), "right")
	assert.equal(normalizeHandleId(undefined), "right")
})

test("faces unsaved edge handles toward each other from left to right", () => {
	assert.deepEqual(
		resolveTopologyEdgeHandles({
			sourcePosition: { x: 500, y: 100 },
			targetPosition: { x: 100, y: 100 },
		}),
		{ sourceHandle: "left", targetHandle: "right" }
	)
	assert.deepEqual(
		resolveTopologyEdgeHandles({
			sourcePosition: { x: 100, y: 100 },
			targetPosition: { x: 500, y: 100 },
		}),
		{ sourceHandle: "right", targetHandle: "left" }
	)
})

test("faces unsaved vertical handles together and preserves saved handles", () => {
	assert.deepEqual(
		resolveTopologyEdgeHandles({
			sourcePosition: { x: 100, y: 500 },
			targetPosition: { x: 100, y: 100 },
		}),
		{ sourceHandle: "top", targetHandle: "bottom" }
	)
	assert.deepEqual(
		resolveTopologyEdgeHandles({
			sourcePosition: { x: 500, y: 100 },
			targetPosition: { x: 100, y: 100 },
			sourceHandle: "bottom",
			targetHandle: "top",
		}),
		{ sourceHandle: "bottom", targetHandle: "top" }
	)
})
