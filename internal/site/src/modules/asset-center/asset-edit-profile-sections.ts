import { getProfileRequiredFieldKeys } from "./asset-profiles.ts"
import { getAssetFormSections } from "./asset-schema.ts"
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
	for (const key of getProfileRequiredFieldKeys(type)) {
		keys.add(key)
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
