import assert from "node:assert/strict"
import { demoAssets, demoInterfaces, demoRelations } from "./fixture-core.ts"

const serialized = JSON.stringify({ demoAssets, demoInterfaces, demoRelations })
const forbiddenMarkers = [
	["192", "168", "1", ""].join("."),
	["192", "168", "31", ""].join("."),
	["gutenacht", "site"].join("."),
	["Fly", "NAS"].join(""),
	["Har", "bor"].join(""),
	["@", "gmail.com"].join(""),
]

for (const forbidden of forbiddenMarkers) {
	assert.equal(serialized.includes(forbidden), false, `private marker found: ${forbidden}`)
}

assert.ok(demoAssets.length >= 12)
assert.ok(demoAssets.every((asset) => !asset.management_ip || asset.management_ip.startsWith("192.168.50.")))
assert.ok(demoInterfaces.every((item) => !item.mac || /^02(:[0-9A-F]{2}){5}$/i.test(item.mac)))

const assetIds = new Set(demoAssets.map((asset) => asset.id))
assert.equal(assetIds.size, demoAssets.length)
assert.ok(
	demoRelations.every(
		(relation) => assetIds.has(relation.source_asset) && assetIds.has(relation.target_asset)
	)
)

console.log("demo fixture privacy contract passed")
