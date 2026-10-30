import assert from "node:assert/strict"
import test from "node:test"
import { createLatestRequestGuard } from "./latest-request-guard.ts"

test("only lets the newest request commit state", () => {
	const guard = createLatestRequestGuard()
	const first = guard.begin()

	assert.equal(guard.isCurrent(first), true)

	const second = guard.begin()
	assert.equal(guard.isCurrent(first), false)
	assert.equal(guard.isCurrent(second), true)
})
