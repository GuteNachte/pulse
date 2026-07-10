import { getAssetFormSections, isPhoneVariantSpecRequired } from "./asset-schema.ts"
import type { AssetRecord } from "../../types"

export function getRequiredAssetProfileFieldKeys(type: AssetRecord["type"]) {
	const keys = new Set([
		"name",
		"type",
		"vendor",
		"model",
		"internal_model",
		"color",
		"asset_tag",
		"location",
		"management_ip",
		"fixed_ipv4",
	])
	if (isPhoneVariantSpecRequired(type)) {
		keys.add("memory_gb")
		keys.add("storage_gb")
	}
	return keys
}

export function buildAssetProfileEditSections(type: AssetRecord["type"], requiredFieldKeys: Set<string>) {
	return getAssetFormSections(type)
		.map((section) => ({
			...section,
			fields: section.fields.filter((field) => !requiredFieldKeys.has(field.key)),
		}))
		.filter((section) => section.fields.length > 0)
}
