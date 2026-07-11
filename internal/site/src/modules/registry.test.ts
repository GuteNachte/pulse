import assert from "node:assert/strict"
import { test } from "node:test"
import { getModulesByCategory, pulseModuleMap } from "./registry.ts"

test("required modules are grouped at the bottom of the module catalog", () => {
	const groups = getModulesByCategory()
	const requiredGroup = groups.at(-1)

	assert.equal(requiredGroup?.category, "必需模块")
	assert.ok(requiredGroup?.modules.length)
	assert.ok(requiredGroup?.modules.every((module) => module.required))
	assert.ok(groups.slice(0, -1).every((group) => group.modules.every((module) => !module.required)))
})

test("core operational modules are required", () => {
	for (const id of ["alerts", "notifications", "agent-management", "maintenance"] as const) {
		assert.equal(pulseModuleMap.get(id)?.required, true, `${id} should be required`)
	}
})
