import type { AssetLocationKind, AssetLocationRecord, AssetRecord } from "@/types"

export type LooseLocationGroup = {
	name: string
	count: number
	kind: AssetLocationKind
}

export type AssetLocationPreset = {
	name: string
	kind: AssetLocationKind
	parentName?: string
	sortOrder: number
	notes?: string
}

export function isAssetLocationNotApplicable(type: AssetRecord["type"]) {
	return type === "internet"
}

export const DEFAULT_ASSET_LOCATION_PRESETS: AssetLocationPreset[] = [
	{ name: "家", kind: "area", sortOrder: 10, notes: "家庭资产一级位置。" },
	{ name: "公司", kind: "area", sortOrder: 20, notes: "公司资产一级位置。" },
	{ name: "客厅", kind: "room", parentName: "家", sortOrder: 110 },
	{ name: "卧室", kind: "room", parentName: "家", sortOrder: 120 },
	{ name: "书房", kind: "room", parentName: "家", sortOrder: 130 },
	{ name: "弱电箱", kind: "cabinet", parentName: "家", sortOrder: 140 },
	{ name: "厨房", kind: "room", parentName: "家", sortOrder: 150 },
	{ name: "阳台", kind: "area", parentName: "家", sortOrder: 160 },
	{ name: "办公室", kind: "room", parentName: "公司", sortOrder: 210 },
]

export function buildPresetLocationPayload(user: string, preset: AssetLocationPreset, parentLocationId = "") {
	return {
		user,
		name: preset.name,
		kind: preset.kind,
		parent_location: parentLocationId,
		sort_order: preset.sortOrder,
		notes: preset.notes ?? "",
		metadata: {
			source: "asset-location-preset",
		},
	}
}

export function buildArchivedLocationPayload(user: string, group: LooseLocationGroup, sortOrder: number) {
	return {
		user,
		name: group.name,
		kind: group.kind,
		parent_location: "",
		sort_order: sortOrder,
		notes: `${group.count} 个资产已有此位置文本，来自资产清单归档。`,
		metadata: {
			source: "asset-location-archive",
			asset_count: group.count,
		},
	}
}

export function getLooseLocationGroups(assets: AssetRecord[], locations: AssetLocationRecord[]) {
	const normalizedLocationNames = new Set(
		locations.flatMap((location) => [location.name.trim(), buildLocationPath(location, locations)]).filter(Boolean)
	)
	const countsByName = new Map<string, number>()
	for (const asset of assets) {
		const location = asset.location?.trim()
		if (!location || normalizedLocationNames.has(location)) continue
		countsByName.set(location, (countsByName.get(location) ?? 0) + 1)
	}
	return [...countsByName.entries()]
		.map(([name, count]) => ({ name, count, kind: inferLocationKind(name) }))
		.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
}

export function getDefaultAssetLocationPresetValues() {
	return DEFAULT_ASSET_LOCATION_PRESETS.map((preset) => buildLocationPresetPath(preset)).filter(Boolean)
}

export function buildLocationPresetPath(preset: AssetLocationPreset, presets = DEFAULT_ASSET_LOCATION_PRESETS) {
	const names = [preset.name]
	let current = preset
	const visited = new Set([current.name])
	while (current.parentName) {
		const parent = presets.find((item) => item.name === current.parentName)
		if (!parent || visited.has(parent.name)) break
		names.unshift(parent.name)
		visited.add(parent.name)
		current = parent
	}
	return names.join(" / ")
}

export function buildLocationPresetParts(preset: AssetLocationPreset, presets = DEFAULT_ASSET_LOCATION_PRESETS) {
	return buildLocationPresetPath(preset, presets)
		.split(" / ")
		.map((part) => part.trim())
		.filter(Boolean)
}

export function isTwoLevelLocationPath(path: string) {
	return (
		path
			.split(" / ")
			.map((part) => part.trim())
			.filter(Boolean).length <= 2
	)
}

export function getLocationPresetParentPath(preset: AssetLocationPreset, presets = DEFAULT_ASSET_LOCATION_PRESETS) {
	if (!preset.parentName) return ""
	const parent = presets.find((item) => item.name === preset.parentName)
	return parent ? buildLocationPresetPath(parent, presets) : ""
}

export function buildLocationPath(location: AssetLocationRecord, locations: AssetLocationRecord[]) {
	const names = [location.name?.trim()].filter(Boolean)
	let current = location
	const visited = new Set([location.id])
	while (current.parent_location) {
		const parent = locations.find((item) => item.id === current.parent_location)
		if (!parent || visited.has(parent.id)) break
		names.unshift(parent.name?.trim())
		visited.add(parent.id)
		current = parent
	}
	return names.filter(Boolean).join(" / ")
}

export function inferLocationKind(name: string): AssetLocationKind {
	const normalized = name.trim().toLowerCase()
	if (!normalized) return "custom"
	if (/(客厅|卧室|书房|厨房|卫生间|阳台|房间|room)/i.test(normalized)) return "room"
	if (/(机架|rack)/i.test(normalized)) return "rack"
	if (/(柜|弱电箱|cabinet)/i.test(normalized)) return "cabinet"
	if (/(桌|desk)/i.test(normalized)) return "desk"
	if (/(vlan|ssid|iot|网络|分区|zone)/i.test(normalized)) return "zone"
	if (/(区域|area)/i.test(normalized)) return "area"
	return "custom"
}
