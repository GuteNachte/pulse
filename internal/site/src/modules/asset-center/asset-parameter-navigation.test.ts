import assert from "node:assert/strict"
import { existsSync } from "node:fs"

const moduleUrl = new URL("./asset-parameter-navigation.ts", import.meta.url)

assert.equal(existsSync(moduleUrl), true, "asset parameter navigation rules must exist")

const { getAssetParameterSectionId, getAssetParameterScrollBehavior } = await import(
	"./asset-parameter-navigation.ts"
)

assert.equal(getAssetParameterSectionId("hardware_ports"), "asset-parameter-hardware_ports")
assert.equal(getAssetParameterSectionId("network-wireless"), "asset-parameter-network-wireless")
assert.equal(getAssetParameterScrollBehavior(false), "smooth")
assert.equal(getAssetParameterScrollBehavior(true), "auto")

console.log("asset parameter navigation contract passed")
