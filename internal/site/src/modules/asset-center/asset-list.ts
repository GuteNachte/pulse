import { HOST_ASSET_TYPES } from "@/modules/asset-center/asset-schema"
import {
	buildAssetSearchText,
	getAssetCompleteness,
	needsAssetProfileAttention,
} from "@/modules/asset-center/asset-profile-summary"
import {
	buildLocationPath,
	getDefaultAssetLocationPresetValues,
	isTwoLevelLocationPath,
} from "@/modules/asset-center/asset-location"
import type {
	AssetLocationRecord,
	AssetMaintenanceRecord,
	AssetRecord,
	AssetStatus,
	AssetType,
	SystemRecord,
	WebsiteMonitorRecord,
} from "@/types"

export type AssetMonitorFilter = "all" | "monitored" | "unmonitored" | "monitorable"
export type AssetProfileFilter = "all" | "complete" | "usable" | "attention" | "incomplete" | "critical"
export type AssetLocationOptions = {
	values: string[]
	hasEmptyLocation: boolean
}

export type AssetListCounts = {
	total: number
	monitored: number
	manual: number
	locations: number
	looseLocations: number
	attention: number
	profileAttention: number
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

export function groupMaintenanceByAsset(records: AssetMaintenanceRecord[]) {
	const result = new Map<string, AssetMaintenanceRecord[]>()
	for (const record of records) {
		if (!record.asset) continue
		result.set(record.asset, [...(result.get(record.asset) ?? []), record])
	}
	return result
}

export function filterAssets(options: {
	assets: AssetRecord[]
	search: string
	typeFilter: AssetType | "all"
	statusFilter: AssetStatus | "all"
	locationFilter: string
	monitorFilter: AssetMonitorFilter
	profileFilter: AssetProfileFilter
	monitoredAssetIds: Set<string>
	internetUplinkAssetIds?: Set<string>
}) {
	const keyword = options.search.trim().toLowerCase()
	return options.assets.filter((asset) => {
		if (options.typeFilter !== "all" && asset.type !== options.typeFilter) {
			return false
		}
		if (options.statusFilter !== "all" && (asset.status || "active") !== options.statusFilter) {
			return false
		}
		const location = asset.location?.trim() || ""
		if (options.locationFilter === "__empty__" && location) {
			return false
		}
		if (
			options.locationFilter !== "all" &&
			options.locationFilter !== "__empty__" &&
			location !== options.locationFilter
		) {
			return false
		}
		const monitored = options.monitoredAssetIds.has(asset.id)
		const monitorable = isMonitorableAsset(asset)
		if (options.monitorFilter === "monitored" && !monitored) {
			return false
		}
		if (options.monitorFilter === "unmonitored" && monitored) {
			return false
		}
		if (options.monitorFilter === "monitorable" && (!monitorable || monitored)) {
			return false
		}
		if (!matchesProfileFilter(asset, options.profileFilter, options.internetUplinkAssetIds)) {
			return false
		}
		if (!keyword) {
			return true
		}
		return buildAssetSearchText(asset).includes(keyword)
	})
}

export function getAssetListCounts(options: {
	assets: AssetRecord[]
	locationCount: number
	looseLocationCount: number
	monitoredAssetIds: Set<string>
	internetUplinkAssetIds?: Set<string>
}): AssetListCounts {
	const total = options.assets.length
	const monitored = options.assets.filter((asset) => options.monitoredAssetIds.has(asset.id)).length
	const manual = total - monitored
	return {
		total,
		monitored,
		manual,
		locations: options.locationCount,
		looseLocations: options.looseLocationCount,
		attention: options.assets.filter((asset) =>
			needsAssetProfileAttention(asset, { hasInternetUplink: options.internetUplinkAssetIds?.has(asset.id) })
		).length,
		profileAttention: options.assets.filter((asset) =>
			needsAssetProfileAttention(asset, { hasInternetUplink: options.internetUplinkAssetIds?.has(asset.id) })
		).length,
	}
}

export function hasAssetListFilters(options: {
	search: string
	typeFilter: AssetType | "all"
	statusFilter: AssetStatus | "all"
	locationFilter: string
	monitorFilter: AssetMonitorFilter
	profileFilter: AssetProfileFilter
}) {
	return Boolean(
		options.search.trim() ||
			options.typeFilter !== "all" ||
			options.statusFilter !== "all" ||
			options.locationFilter !== "all" ||
			options.monitorFilter !== "all" ||
			options.profileFilter !== "all"
	)
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

function matchesProfileFilter(asset: AssetRecord, filter: AssetProfileFilter, internetUplinkAssetIds?: Set<string>) {
	if (filter === "all") return true
	const context = { hasInternetUplink: internetUplinkAssetIds?.has(asset.id) }
	const completeness = getAssetCompleteness(asset, context)
	switch (filter) {
		case "complete":
			return completeness.score >= 90
		case "usable":
			return completeness.score >= 70 && completeness.score < 90
		case "attention":
			return needsAssetProfileAttention(asset, context)
		case "incomplete":
			return completeness.score >= 45 && completeness.score < 70
		case "critical":
			return completeness.score < 45
	}
}
