import type { AssetComponentKind, AssetRecord } from "../../types"

// 2026-10-07 计算设备④（docs/pc-asset-design.md 四）：自组装配件清单逻辑——
// 配件不是独立资产，是整机资产下的清单；分类固定 10 种，规格字段按分类动态出（存 JSON 键值）。

export type AssetComponentCategory = {
	value: AssetComponentKind
	label: string
	specFields: string[]
}

export const ASSET_COMPONENT_CATEGORIES: AssetComponentCategory[] = [
	{ value: "cpu", label: "CPU", specFields: ["核心 / 线程", "频率"] },
	{ value: "motherboard", label: "主板", specFields: ["芯片组", "板型"] },
	{ value: "memory", label: "内存", specFields: ["容量", "类型", "频率"] },
	{ value: "storage", label: "存储", specFields: ["容量", "接口", "介质"] },
	{ value: "gpu", label: "显卡", specFields: ["显存", "接口"] },
	{ value: "psu", label: "电源", specFields: ["功率", "认证"] },
	{ value: "case", label: "机箱", specFields: ["板型支持", "颜色"] },
	{ value: "cooler", label: "散热器", specFields: ["类型", "高度"] },
	{ value: "nic", label: "网卡", specFields: ["速率", "接口"] },
	{ value: "other", label: "其他", specFields: [] },
]

export function getComponentCategory(kind: AssetComponentKind | string) {
	return ASSET_COMPONENT_CATEGORIES.find((category) => category.value === kind)
}

export function getComponentCategoryLabel(kind: AssetComponentKind | string) {
	return getComponentCategory(kind)?.label ?? String(kind)
}

export function getComponentSpecFields(kind: AssetComponentKind | string): string[] {
	return getComponentCategory(kind)?.specFields ?? []
}

// 规格键值对转摘要文本（保持分类模板键顺序，空值跳过；无模板的分类按自身键名序）
export function formatComponentSpec(
	kind: AssetComponentKind | string,
	spec: Record<string, string> | undefined | null
) {
	if (!spec) return ""
	const templateKeys = getComponentSpecFields(kind)
	const orderedKeys = templateKeys.length > 0 ? templateKeys : Object.keys(spec).sort()
	return orderedKeys
		.map((field) => {
			const value = spec[field]?.trim()
			return value ? `${field} ${value}` : ""
		})
		.filter(Boolean)
		.join(" · ")
}

// 清洗规格：只保留该分类模板内的键，空值丢弃；其他分类保留原键值（防模板变更丢数据）
export function normalizeComponentSpec(
	kind: AssetComponentKind | string,
	spec: Record<string, string> | undefined | null
) {
	const cleaned: Record<string, string> = {}
	if (!spec) return cleaned
	const allowed = new Set(getComponentSpecFields(kind))
	for (const [key, value] of Object.entries(spec)) {
		const text = typeof value === "string" ? value.trim() : ""
		if (!text) continue
		if (allowed.size > 0 && !allowed.has(key)) continue
		cleaned[key] = text
	}
	return cleaned
}

export function isDiyBuildAsset(asset: AssetRecord | undefined | null) {
	return asset?.metadata?.build_mode === "diy"
}
