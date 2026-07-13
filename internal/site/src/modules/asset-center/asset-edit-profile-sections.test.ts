import assert from "node:assert/strict"
import { buildAssetProfileEditSections, getRequiredAssetProfileFieldKeys } from "./asset-edit-profile-sections.ts"

const phoneRequiredFields = getRequiredAssetProfileFieldKeys("phone")
assert.equal(phoneRequiredFields.has("memory_gb"), true)
assert.equal(phoneRequiredFields.has("storage_gb"), true)
assert.equal(phoneRequiredFields.has("asset_tag"), true)

const hostRequiredFields = getRequiredAssetProfileFieldKeys("mini_pc")
assert.equal(hostRequiredFields.has("memory_gb"), false)
assert.equal(hostRequiredFields.has("storage_gb"), false)

const serviceRequiredFields = getRequiredAssetProfileFieldKeys("web_endpoint")
assert.equal(serviceRequiredFields.has("name"), true)
assert.equal(serviceRequiredFields.has("location"), true)
assert.equal(serviceRequiredFields.has("vendor"), false)
assert.equal(serviceRequiredFields.has("model"), false)
assert.equal(serviceRequiredFields.has("internal_model"), false)
assert.equal(serviceRequiredFields.has("fixed_ipv4"), false)

const internetRequiredFields = getRequiredAssetProfileFieldKeys("internet")
assert.equal(internetRequiredFields.has("name"), true)
assert.equal(internetRequiredFields.has("vendor"), true)
assert.equal(internetRequiredFields.has("asset_tag"), true)
assert.equal(internetRequiredFields.has("type"), false)
assert.equal(internetRequiredFields.has("model"), false)
assert.equal(internetRequiredFields.has("internal_model"), false)
assert.equal(internetRequiredFields.has("color"), false)
assert.equal(internetRequiredFields.has("location"), false)
assert.equal(internetRequiredFields.has("management_ip"), false)
assert.equal(internetRequiredFields.has("fixed_ipv4"), false)

const phoneSections = buildAssetProfileEditSections("phone", phoneRequiredFields)
assert.equal(
	phoneSections.every((section) => section.fields.every((field) => !phoneRequiredFields.has(field.key))),
	true,
	"完整编辑区不能重复渲染已置顶的必填字段"
)
