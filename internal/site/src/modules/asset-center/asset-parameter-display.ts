type AssetDisplayField = {
	key: string
	label: string
}

const assetDisplayUnitByFieldKey = new Map<string, string>([
	["battery_capacity_mah", "mAh"],
	["capacity_w", "W"],
	["charging_power_w", "W"],
	["default_port_speed_mbps", "Mbps"],
	["disk_gb", "GB"],
	["down_mbps", "Mbps"],
	["gpu_vram_gb", "GB"],
	["memory_gb", "GB"],
	["memory_speed_mhz", "MHz"],
	["primary_nic_speed_mbps", "Mbps"],
	["screen_refresh_rate", "Hz"],
	["storage_gb", "GB"],
	["touch_sampling_rate", "Hz"],
	["up_mbps", "Mbps"],
])

const assetDisplayLabelUnits = [
	"mAh",
	"Mbps",
	"MHz",
	"GHz",
	"Hz",
	"GB",
	"TB",
	"MB",
	"KB",
	"VA",
	"W",
	"mm",
	"cm",
	"kg",
	"g",
]

export function formatAssetParameterRowDisplay(field: AssetDisplayField, value: string) {
	const unit = getAssetParameterDisplayUnit(field)
	if (!unit) return { label: field.label, value }
	return {
		label: stripAssetParameterLabelUnit(field.label, unit),
		value: formatAssetParameterValueWithUnit(value, unit),
	}
}

function getAssetParameterDisplayUnit(field: AssetDisplayField) {
	const unitFromKey = assetDisplayUnitByFieldKey.get(field.key)
	if (unitFromKey) return unitFromKey
	return assetDisplayLabelUnits.find((unit) => labelEndsWithDisplayUnit(field.label, unit))
}

function stripAssetParameterLabelUnit(label: string, unit: string) {
	const trimmed = label.trim()
	if (new RegExp(`\\s+${escapeRegExp(unit)}$`, "i").test(trimmed)) {
		return trimmed.replace(new RegExp(`\\s+${escapeRegExp(unit)}$`, "i"), "").trim()
	}
	if (labelEndsWithDisplayUnit(trimmed, unit)) {
		return trimmed.slice(0, -unit.length).trim()
	}
	return trimmed
}

function formatAssetParameterValueWithUnit(value: string, unit: string) {
	const trimmed = value.trim()
	if (!trimmed) return trimmed
	const numericUnitPattern = new RegExp(`(\\d(?:[\\d.,]*))\\s*${escapeRegExp(unit)}(?=$|[\\s,/，、;；)])`, "gi")
	const normalized = trimmed.replace(numericUnitPattern, (_match, number) => `${number} ${unit}`)
	if (normalized !== trimmed) return normalized
	const unitFirstPattern = new RegExp(`^${escapeRegExp(unit)}\\s*[:：]?\\s*(-?\\d+(?:\\.\\d+)?)$`, "i")
	const unitFirst = trimmed.match(unitFirstPattern)
	if (unitFirst) return `${unitFirst[1]} ${unit}`
	if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return `${trimmed} ${unit}`
	return trimmed
}

function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function labelEndsWithDisplayUnit(label: string, unit: string) {
	const trimmed = label.trim()
	if (new RegExp(`\\s${escapeRegExp(unit)}$`, "i").test(trimmed)) return true
	if (!trimmed.toLowerCase().endsWith(unit.toLowerCase())) return false
	const prefix = trimmed.slice(0, -unit.length).trimEnd()
	const previous = prefix[prefix.length - 1]
	return Boolean(previous && /[\u4e00-\u9fa5）)]/.test(previous))
}
