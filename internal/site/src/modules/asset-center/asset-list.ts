import { HOST_ASSET_TYPES, getMetadataString } from "./asset-schema.ts"
import { getAssetTypeGroup } from "./asset-numbering.ts"
import { buildAssetSearchText } from "./asset-profile-summary.ts"
import { buildLocationPath, getDefaultAssetLocationPresetValues, isTwoLevelLocationPath } from "./asset-location.ts"
import type {
	AssetLocationRecord,
	AssetMonitorBindingRecord,
	AssetMonitorState,
	AssetRecord,
	AssetStatus,
	AssetType,
	SystemRecord,
	WebsiteMonitorRecord,
} from "@/types"

export type AssetMonitorFilter =
	| "all"
	| "monitored"
	| "unmonitored"
	| "monitorable"
	| "unbound"
	| "pending"
	| "healthy"
	| "error"
	| "paused"
	| "unsupported"
export type AssetLocationOptions = {
	values: string[]
	hasEmptyLocation: boolean
}

export const LOOSE_LOCATION_FILTER = "__loose__"

export type AssetListCounts = {
	total: number
	monitored: number
	manual: number
	locations: number
	looseLocationAssets: number
}

export function buildMonitoredAssetIds(systems: SystemRecord[], websites: WebsiteMonitorRecord[]) {
	const ids = new Set<string>()
	for (const system of systems) {
		if (system.asset) ids.add(system.asset)
	}
	for (const website of websites) {
		if (website.asset) ids.add(website.asset)
	}
	return ids
}

export function buildMonitoredAssetIdsFromBindings(bindings: AssetMonitorBindingRecord[]) {
	const ids = new Set<string>()
	for (const binding of bindings) {
		if (binding.asset) ids.add(binding.asset)
	}
	return ids
}

export function buildAssetMonitorStateMap(
	assets: AssetRecord[],
	bindings: AssetMonitorBindingRecord[]
): Map<string, AssetMonitorState> {
	const bindingByAsset = new Map(bindings.map((binding) => [binding.asset, binding]))
	const states = new Map<string, AssetMonitorState>()
	for (const asset of assets) {
		const binding = bindingByAsset.get(asset.id)
		states.set(asset.id, binding ? binding.state : isMonitorableAsset(asset) ? "unbound" : "unsupported")
	}
	return states
}

export function buildAssetLocationOptions(
	assets: AssetRecord[],
	locations: AssetLocationRecord[],
	options: { includePresets?: boolean } = {}
): AssetLocationOptions {
	const values = new Set<string>()
	let hasEmptyLocation = false
	if (options.includePresets) {
		for (const preset of getDefaultAssetLocationPresetValues()) {
			values.add(preset)
		}
	}
	for (const location of locations) {
		const path = buildLocationPath(location, locations)
		if (path && isTwoLevelLocationPath(path)) {
			values.add(path)
		}
	}
	for (const asset of assets) {
		const location = asset.location?.trim()
		if (location && isTwoLevelLocationPath(location)) {
			values.add(location)
		} else {
			hasEmptyLocation = true
		}
	}
	return {
		values: [...values].sort((a, b) => a.localeCompare(b, "zh-CN")),
		hasEmptyLocation,
	}
}

export function filterAssets(options: {
	assets: AssetRecord[]
	search: string
	typeFilter: AssetType | "all"
	statusFilter: AssetStatus | "all"
	locationFilter: string
	monitorFilter: AssetMonitorFilter
	typeGroupFilter: string
	monitoredAssetIds: Set<string>
	monitorStateByAsset?: Map<string, AssetMonitorState>
	looseLocationNames?: Set<string>
}) {
	const keyword = options.search.trim().toLowerCase()
	return options.assets.filter((asset) => {
		if (options.typeFilter !== "all" && asset.type !== options.typeFilter) {
			return false
		}
		if (options.typeGroupFilter !== "all" && getAssetTypeGroup(asset.type).code !== options.typeGroupFilter) {
			return false
		}
		if (options.statusFilter !== "all" && (asset.status || "active") !== options.statusFilter) {
			return false
		}
		const location = asset.location?.trim() || ""
		if (options.locationFilter === "__empty__" && location) {
			return false
		}
		if (options.locationFilter === LOOSE_LOCATION_FILTER) {
			if (!location || !options.looseLocationNames?.has(location)) {
				return false
			}
		}
		// 2026-10-04 产品决策：位置筛选按层级匹配——选"家"包含"家 / 卧室"等所有子位置，
		// 精确路径仍然只匹配自己；用" / "分隔符避免前缀误伤同名开头的位置。
		if (
			options.locationFilter !== "all" &&
			options.locationFilter !== "__empty__" &&
			options.locationFilter !== LOOSE_LOCATION_FILTER &&
			location !== options.locationFilter &&
			!location.startsWith(`${options.locationFilter} / `)
		) {
			return false
		}
		const monitored = options.monitoredAssetIds.has(asset.id)
		const monitorable = isMonitorableAsset(asset)
		if (options.monitorFilter === "monitored" && !monitored) {
			return false
		}
		if (options.monitorFilter === "unmonitored" && (monitored || !monitorable)) {
			return false
		}
		if (options.monitorFilter === "monitorable" && (!monitorable || monitored)) {
			return false
		}
		if (["unbound", "pending", "healthy", "error", "paused", "unsupported"].includes(options.monitorFilter)) {
			const monitorState = options.monitorStateByAsset?.get(asset.id) ?? (monitorable ? "unbound" : "unsupported")
			if (monitorState !== options.monitorFilter) return false
		}
		if (!keyword) {
			return true
		}
		return buildAssetSearchText(asset).includes(keyword)
	})
}

// 2026-10-04 产品决策：清单默认按编号排序——编号小的在前、未编号的排最后，
// 编号相同起点时再按名称。编号位数固定时字典序即分组+序号顺序，numeric 比较兜底。
export function sortAssetsByListOrder(assets: AssetRecord[]): AssetRecord[] {
	return [...assets].sort((a, b) => {
		const tagA = getMetadataString(a.metadata, "asset_tag")
		const tagB = getMetadataString(b.metadata, "asset_tag")
		if (tagA && tagB && tagA !== tagB) {
			return tagA.localeCompare(tagB, "en", { numeric: true })
		}
		if (tagA !== tagB) {
			return tagA ? -1 : 1
		}
		return a.name.localeCompare(b.name, "zh-CN")
	})
}

export function getAssetListCounts(options: {
	assets: AssetRecord[]
	locationCount: number
	looseLocationAssetCount: number
	monitoredAssetIds: Set<string>
}): AssetListCounts {
	const total = options.assets.length
	const monitored = options.assets.filter(
		(asset) => options.monitoredAssetIds.has(asset.id) && isMonitorableAsset(asset)
	).length
	const manual = options.assets.filter(
		(asset) => isMonitorableAsset(asset) && !options.monitoredAssetIds.has(asset.id)
	).length
	return {
		total,
		monitored,
		manual,
		locations: options.locationCount,
		looseLocationAssets: options.looseLocationAssetCount,
	}
}

export function isMonitorableAsset(asset: AssetRecord) {
	return isAgentMonitorableAsset(asset) || isWebsiteMonitorableAsset(asset)
}

export function isAgentMonitorableAsset(asset: AssetRecord) {
	return HOST_ASSET_TYPES.includes(asset.type)
}

export function isWebsiteMonitorableAsset(asset: AssetRecord) {
	return asset.type === "web_endpoint"
}
