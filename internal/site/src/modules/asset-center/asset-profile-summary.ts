import type { AssetRecord } from "@/types"
import { getAssetTypeLabel, getMetadataString, getStatusLabel } from "./asset-schema.ts"

// 2026-10-18 用户拍板：资产完整度无法确认，整块移除；保留生命周期标签色给资产卡片/表单使用
export type AssetLifecycleTone = "neutral" | "ok" | "warning" | "danger"

// 2026-10-20 宽带型号直接维护在 assets.model（运营商写入型号），
// 这里不再按资产类型回退读取 vendor，避免显示层依赖特殊字段。
export function getAssetModelDisplay(asset: AssetRecord) {
	const internalModel = getMetadataString(asset.metadata, "internal_model")
	return internalModel ? [asset.model, `(${internalModel})`].filter(Boolean).join(" ") : asset.model || ""
}

export function buildAssetSearchText(asset: AssetRecord) {
	return [
		asset.name,
		asset.vendor,
		asset.model,
		asset.serial_number,
		asset.management_ip,
		asset.location,
		asset.role,
		getAssetTypeLabel(asset.type),
		// 2026-10-04 产品决策：清单筛选只保留位置，类型/状态靠关键词搜索覆盖
		asset.status ? getStatusLabel(asset.status) : "",
		...Object.values(asset.metadata ?? {}).map((value) =>
			typeof value === "string" || typeof value === "number" ? String(value) : ""
		),
	]
		.filter(Boolean)
		.join(" ")
		.toLowerCase()
}
