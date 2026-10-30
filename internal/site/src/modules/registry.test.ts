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

test("foundation modules are required while operational modules remain manageable", () => {
	for (const id of ["foundation", "asset-center", "account-access", "maintenance"] as const) {
		assert.equal(pulseModuleMap.get(id)?.required, true, `${id} should be required`)
	}
	for (const id of ["alerts", "notifications", "agent-management"] as const) {
		assert.equal(pulseModuleMap.get(id)?.required, false, `${id} should be manageable`)
	}
})
