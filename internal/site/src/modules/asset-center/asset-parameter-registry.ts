import type { AssetType } from "@/types"
import registryJson from "../../../../assetcatalog/asset-parameter-registry.json" with { type: "json" }

export type AssetArchiveFieldScope = "dossier" | "parameter" | "line" | "service" | "operational"
export type AssetParameterCategoryId =
	| "appearance"
	| "functions"
	| "power"
	| "electrical"
	| "platform"
	| "processor"
	| "graphics"
	| "memory"
	| "storage"
	| "display_output"
	| "network"
	| "management"
	| "io"
	| "system"
	| "display"
	| "imaging"
	| "audio"
	| "sensors"
	| "thermal_environment"
export type AssetParameterCategoryDefinition = { id: AssetParameterCategoryId; title: string; order: number }
export type AssetArchiveFieldDefinition = {
	key: string
	label: string
	scope: AssetArchiveFieldScope
	category?: AssetParameterCategoryId
	section?: string
	order: number
	source: "asset" | "metadata" | "interface" | "relation"
	capture: "manual" | "agent_collectable" | "agent_required" | "future_collectable"
	type: "text" | "number" | "date" | "url" | "select"
	assetTypes: AssetType[]
}
export type AssetParameterFieldDefinition = AssetArchiveFieldDefinition & {
	scope: "parameter"
	category: AssetParameterCategoryId
}

const registry = registryJson as {
	version: number
	categories: AssetParameterCategoryDefinition[]
	fields: AssetArchiveFieldDefinition[]
}
export const ASSET_PARAMETER_CATEGORIES = [...registry.categories].sort((a, b) => a.order - b.order)
const fieldsByKey = new Map(registry.fields.map((field) => [field.key, field]))
export function getAssetArchiveField(key: string) {
	return fieldsByKey.get(key)
}

const fieldsByLabel = new Map(registry.fields.map((field) => [field.label, field]))

// 2026-10-06 网络能力编辑：格子行显示的是中文标签，保存时反查原始字段键
export function getAssetArchiveFieldByLabel(label: string) {
	return fieldsByLabel.get(label)
}
export function getAssetArchiveFieldsForType(type: AssetType) {
	return registry.fields.filter((field) => field.assetTypes.includes(type))
}
export function getAssetParameterFieldsForType(type: AssetType) {
	return getAssetArchiveFieldsForType(type).filter(
		(field): field is AssetParameterFieldDefinition => field.scope === "parameter" && Boolean(field.category)
	)
}
export function validateAssetParameterRegistry() {
	const errors: string[] = []
	const categoryIds = new Set<string>()
	const categoryOrders = new Set<number>()
	for (const category of registry.categories) {
		if (categoryIds.has(category.id)) errors.push(`分类 ${category.id} 重复`)
		if (categoryOrders.has(category.order)) errors.push(`分类顺序 ${category.order} 重复`)
		categoryIds.add(category.id)
		categoryOrders.add(category.order)
	}
	const fieldKeys = new Set<string>()
	const fieldOrders = new Set<string>()
	for (const field of registry.fields) {
		if (fieldKeys.has(field.key)) errors.push(`字段 ${field.key} 重复`)
		fieldKeys.add(field.key)
		if (field.key === "fixed_ipv6") errors.push("设备管理 IPv6 不得进入字段目录")
		if (field.assetTypes.length === 0) errors.push(`字段 ${field.key} 没有适用资产类型`)
		if (field.scope === "parameter" && !field.category) errors.push(`参数 ${field.key} 缺少分类`)
		if (field.scope !== "parameter" && field.category) errors.push(`非参数 ${field.key} 不得设置分类`)
		if (field.category && !categoryIds.has(field.category))
			errors.push(`字段 ${field.key} 使用未知分类 ${field.category}`)
		if (field.key === "public_ipv6" && (field.scope !== "line" || field.assetTypes.some((type) => type !== "internet")))
			errors.push("public_ipv6 只能属于宽带线路")
		if (field.scope === "parameter")
			for (const assetType of field.assetTypes) {
				const orderKey = `${assetType}:${field.category}:${field.section ?? ""}:${field.order}`
				if (fieldOrders.has(orderKey)) errors.push(`字段顺序 ${orderKey} 重复`)
				fieldOrders.add(orderKey)
			}
	}
	return errors
}
