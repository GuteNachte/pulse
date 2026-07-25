import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const source = readFileSync(new URL("./systems-table.tsx", import.meta.url), "utf8")

test("desktop client cards keep a fixed width when only one system is visible", () => {
	assert.match(source, /repeat\(auto-fill, minmax\(min\(100%, 20rem\), 24rem\)\)/)
	assert.doesNotMatch(source, /visibleRows\.length\s*===\s*1/)
})
