import assert from "node:assert/strict"
import {
	getAssetProfile,
	getCreatableAssetTypeOptions,
	getEditableAssetTypeOptions,
	getProfileRequiredFieldKeys,
} from "./asset-profiles.ts"

assert.equal(getAssetProfile("camera")?.group, "安防与办公")
assert.equal(getAssetProfile("printer")?.group, "安防与办公")
assert.equal(getAssetProfile("ups")?.group, "电源设备")
assert.equal(getAssetProfile("internet")?.group, "资源与服务")
assert.equal(getAssetProfile("web_endpoint")?.group, "资源与服务")
assert.equal(getAssetProfile("web_endpoint")?.label, "互联网服务监控")
assert.equal(getAssetProfile("vm")?.creatable, false)
assert.equal(
	getCreatableAssetTypeOptions().some((option) => option.type === "vm"),
	false
)
assert.equal(
	getEditableAssetTypeOptions("vm").some((option) => option.type === "vm"),
	true
)
assert.deepEqual(getProfileRequiredFieldKeys("phone"), ["memory_gb", "storage_gb"])
assert.deepEqual(getProfileRequiredFieldKeys("mini_pc"), [])
assert.deepEqual(getProfileRequiredFieldKeys("ont"), ["carrier", "operating_role"])

console.log("asset profile contract passed")
