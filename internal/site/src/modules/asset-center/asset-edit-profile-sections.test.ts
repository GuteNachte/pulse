import assert from "node:assert/strict"
import { buildAssetProfileEditSections, getRequiredAssetProfileFieldKeys } from "./asset-edit-profile-sections.ts"

const phoneRequiredFields = getRequiredAssetProfileFieldKeys("phone")
assert.equal(phoneRequiredFields.has("memory_gb"), true)
assert.equal(phoneRequiredFields.has("storage_gb"), true)
assert.equal(phoneRequiredFields.has("asset_tag"), true)

const hostRequiredFields = getRequiredAssetProfileFieldKeys("mini_pc")
assert.equal(hostRequiredFields.has("memory_gb"), false)
assert.equal(hostRequiredFields.has("storage_gb"), false)

const phoneSections = buildAssetProfileEditSections("phone", phoneRequiredFields)
assert.equal(
	phoneSections.every((section) => section.fields.every((field) => !phoneRequiredFields.has(field.key))),
	true,
	"完整编辑区不能重复渲染已置顶的必填字段"
)
