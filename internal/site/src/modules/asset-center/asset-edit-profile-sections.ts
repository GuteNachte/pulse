import { getProfileRequiredFieldKeys } from "./asset-profiles.ts"
import { ASSET_PARAMETER_CATEGORIES, getAssetArchiveField } from "./asset-parameter-registry.ts"
import { getAssetFormSections, type AssetFieldDefinition } from "./asset-schema.ts"
import type { AssetRecord } from "../../types"

const assetQuickSettingFieldKeys: [] = []
const assetConnectionFieldKeys = ["fixed_ipv4", "mac", "management_url"] as const

export function getAssetQuickSettingFieldKeys() {
	return assetQuickSettingFieldKeys
}

export function getAssetConnectionFieldKeys(type: AssetRecord["type"]) {
	if (type === "internet" || type === "web_endpoint") return []
	return assetConnectionFieldKeys
}

export function getRequiredAssetProfileFieldKeys(type: AssetRecord["type"]) {
	if (type === "web_endpoint") {
		return new Set(["name", "type", "location", "status", "role"])
	}
	if (type === "internet") {
		return new Set(["name", "vendor", "asset_tag", "role"])
	}
	const keys = new Set([
		"name",
		"type",
		"vendor",
		"model",
		"serial_number",
		"official_url",
		"color",
		"asset_tag",
		"location",
		"status",
		"role",
		"management_ip",
		"fixed_ipv4",
		"mac",
		"management_url",
	])
	if (type === "phone") {
		keys.add("internal_model")
	}
	for (const key of getProfileRequiredFieldKeys(type)) {
		keys.add(key)
	}
	return keys
}

export function buildAssetProfileEditSections(type: AssetRecord["type"], requiredFieldKeys: Set<string>) {
	const sourceSections = getAssetFormSections(type).map((section) => ({
		...section,
		fields: section.fields.filter((field) => !requiredFieldKeys.has(field.key)),
	}))
	const fields = sourceSections.flatMap((section) => section.fields)
	const parameterSections = ASSET_PARAMETER_CATEGORIES.flatMap((category) => {
		const categoryFields = fields
			.filter((field) => getAssetArchiveField(field.key)?.category === category.id)
			.sort(
				(left, right) => (getAssetArchiveField(left.key)?.order ?? 0) - (getAssetArchiveField(right.key)?.order ?? 0)
			)
		return categoryFields.length > 0 ? [{ title: category.title, fields: categoryFields }] : []
	})
	const allowedBusinessSectionTitles = new Set([
		"线路参数",
		"动态公网地址",
		"套餐与续费",
		"互联网服务监控",
		"订阅与续费",
		"购买信息",
		"备注",
	])
	const businessSections: { title: string; fields: AssetFieldDefinition[] }[] = sourceSections
		.filter((section) => allowedBusinessSectionTitles.has(section.title))
		.map((section) => ({
			...section,
			fields: section.fields.filter((field) => getAssetArchiveField(field.key)?.scope !== "parameter"),
		}))
		.filter((section) => section.fields.length > 0)
	return [...parameterSections, ...businessSections]
}
