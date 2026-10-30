import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import { pulseModules } from "./registry.ts"

type ContractEntry = {
	id: string
	required: boolean
	dependencies: string[]
}

function loadContract(): ContractEntry[] {
	const path = join(process.cwd(), "..", "..", "docs", "module-contract.json")
	return JSON.parse(readFileSync(path, "utf8")) as ContractEntry[]
}

test("前端模块注册表符合项目共享模块契约", () => {
	const contract = loadContract()
	const actual = pulseModules.map(({ id, required, dependencies }) => ({
		id,
		required,
		dependencies,
	}))
	assert.deepEqual(actual, contract)
})
