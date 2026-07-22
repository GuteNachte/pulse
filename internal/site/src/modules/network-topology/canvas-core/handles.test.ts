import assert from "node:assert/strict"
import test from "node:test"
import { normalizeHandleId, TOPOLOGY_HANDLE_IDS } from "./handles.ts"

test("exposes one stable handle on every node side", () => {
	assert.deepEqual(TOPOLOGY_HANDLE_IDS, ["top", "right", "bottom", "left"])
})

test("normalizes unknown handles to the right side", () => {
	assert.equal(normalizeHandleId("top"), "top")
	assert.equal(normalizeHandleId("invalid"), "right")
	assert.equal(normalizeHandleId(undefined), "right")
})
