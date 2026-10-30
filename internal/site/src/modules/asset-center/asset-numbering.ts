import type { AssetRecord } from "@/types"
import { getMetadataString } from "./asset-schema.ts"

// 2026-10-04 产品决策：编号按资产大类生成（如 NW-001、NAS-002、IOT-003），
// 各大类独立计数；编号唯一职责是"唯一且稳定"，类型细分类、位置等信息靠列表字段展示。

export type AssetNumberingSettings = {
	digits: string
	// 大类代码 -> 该大类下一个序号
	sequences: Record<string, string>
}

export type NormalizedAssetNumberingSettings = {
	digits: number
	sequences: Record<string, number>
}

export const assetNumberingStorageKey = "pulse.asset-center.numbering"

export const defaultAssetNumberingSettings: AssetNumberingSettings = {
	digits: "3",
	sequences: {},
}

// 大类定义：与"添加资产"选择界面的分组一一对应（顺序即设置页展示顺序）
export type AssetTypeGroup = {
	code: string
	label: string
	typeValues: string[]
}

// 2026-10-07 家庭用户类型固化：分组顺序按家庭使用频率（计算设备 → 网络设备 → 移动设备 →
// 智能家居 → 娱乐与显示 → 安防与办公 → 电源设备 → 资源与服务 → 其他）；
// gateway 已并入路由器不再新建，但老 gateway 资产仍归网络设备（NW）组；
// 2026-10-26 vm 转正归计算设备（PC）组，与宿主机同组编号，仍保持 9 大类
export const ASSET_TYPE_GROUPS: AssetTypeGroup[] = [
	{ code: "PC", label: "计算设备", typeValues: ["physical_host", "mini_pc", "nas", "server", "vm"] },
	{ code: "NW", label: "网络设备", typeValues: ["router", "gateway", "ont", "smart_ont", "switch", "ap", "firewall"] },
	{ code: "MB", label: "移动设备", typeValues: ["phone", "tablet", "wearable", "ebook"] },
	{
		code: "IOT",
		label: "智能家居",
		typeValues: ["smarthome_gateway", "sensor", "plug", "smart_switch", "light", "lock", "vacuum", "iot"],
	},
	{ code: "AV", label: "娱乐与显示", typeValues: ["game_console", "handheld", "tv", "speaker"] },
	{ code: "SO", label: "安防与办公", typeValues: ["camera", "printer"] },
	{ code: "PW", label: "电源设备", typeValues: ["ups"] },
	{
		code: "RS",
		label: "资源与服务",
		typeValues: ["internet", "subscription", "domain_name", "cloud_host", "web_endpoint"],
	},
	{ code: "X", label: "其他", typeValues: ["custom"] },
]

const groupsByType = new Map<string, AssetTypeGroup>()
for (const group of ASSET_TYPE_GROUPS) {
	for (const typeValue of group.typeValues) {
		groupsByType.set(typeValue, group)
	}
}

export function getAssetTypeGroup(typeValue: string): AssetTypeGroup {
	return groupsByType.get(typeValue) ?? ASSET_TYPE_GROUPS[ASSET_TYPE_GROUPS.length - 1]
}

export function loadAssetNumberingSettings(): AssetNumberingSettings {
	if (typeof window === "undefined") return defaultAssetNumberingSettings
	try {
		const raw = window.localStorage.getItem(assetNumberingStorageKey)
		if (!raw) return defaultAssetNumberingSettings
		return resolveAssetNumberingSettings(JSON.parse(raw) as Partial<AssetNumberingSettings>, null)
	} catch {
		return defaultAssetNumberingSettings
	}
}

export function resolveAssetNumberingSettings(
	server: Partial<AssetNumberingSettings> | null | undefined,
	legacy: Partial<AssetNumberingSettings> | null | undefined
): AssetNumberingSettings {
	// 兼容 1.0.6 之前的单前缀设置 {prefix, digits, nextSequence}：只保留 digits，序号从扫描现状重新推导
	const source = server ?? legacy ?? defaultAssetNumberingSettings
	const sequences: Record<string, string> = {}
	if (source.sequences && typeof source.sequences === "object") {
		for (const [code, value] of Object.entries(source.sequences)) {
			if (typeof value === "string" || typeof value === "number") sequences[code] = String(value)
		}
	}
	return {
		digits: typeof source.digits === "string" ? source.digits : defaultAssetNumberingSettings.digits,
		sequences,
	}
}

export function normalizeAssetNumberingSettings(settings: AssetNumberingSettings): NormalizedAssetNumberingSettings {
	const sequences: Record<string, number> = {}
	for (const group of ASSET_TYPE_GROUPS) {
		const raw = settings.sequences[group.code]
		sequences[group.code] = clampInteger(raw ?? "1", 1, 999999999, 1)
	}
	return {
		digits: clampInteger(settings.digits, 1, 12, Number(defaultAssetNumberingSettings.digits)),
		sequences,
	}
}

export function buildNextAssetTag(
	assets: AssetRecord[],
	settings: NormalizedAssetNumberingSettings,
	typeValue: string
) {
	return (
		buildAssetTagCandidates(assets, settings, typeValue, 1)[0] ??
		formatAssetTag(
			settings.sequences[getAssetTypeGroup(typeValue).code] ?? 1,
			settings.digits,
			getAssetTypeGroup(typeValue).code
		)
	)
}

export function buildAssetTagCandidates(
	assets: AssetRecord[],
	settings: NormalizedAssetNumberingSettings,
	typeValue: string,
	count = 5
) {
	const group = getAssetTypeGroup(typeValue)
	// 扫描全部资产里形如 "{大类代码}-数字" 的编号，该大类取最大序号 + 1；
	// 旧式 ASSET-xxxx 等其他格式不冲突，自动让位。
	const pattern = /^([A-Z]{1,4})-(\d+)$/
	const used = new Set<string>()
	const nextByCode = new Map<string, number>()
	for (const [code, seq] of Object.entries(settings.sequences)) {
		nextByCode.set(code, seq)
	}
	for (const asset of assets) {
		const tag = getMetadataString(asset.metadata, "asset_tag")
		if (!tag) continue
		used.add(tag)
		const match = tag.match(pattern)
		if (!match) continue
		const code = match[1]
		const current = nextByCode.get(code) ?? 1
		nextByCode.set(code, Math.max(current, Number(match[2]) + 1))
	}
	const candidates: string[] = []
	let next = nextByCode.get(group.code) ?? 1
	while (candidates.length < Math.max(0, Math.trunc(count))) {
		const candidate = formatAssetTag(next, settings.digits, group.code)
		if (!used.has(candidate)) candidates.push(candidate)
		next += 1
	}
	return candidates
}

export function formatAssetTag(sequence: number, digits: number, code: string) {
	return `${code}-${String(sequence).padStart(digits, "0")}`
}

function clampInteger(value: string, min: number, max: number, fallback: number) {
	const number = Number(value)
	if (!Number.isFinite(number)) return fallback
	return Math.min(max, Math.max(min, Math.trunc(number)))
}
