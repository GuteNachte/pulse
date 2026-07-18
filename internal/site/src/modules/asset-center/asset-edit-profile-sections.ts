import { getProfileRequiredFieldKeys } from "./asset-profiles.ts"
import { HOST_ASSET_TYPES, getAssetFormSections, type AssetFieldDefinition } from "./asset-schema.ts"
import type { AssetRecord } from "../../types"

const assetQuickSettingFieldKeys: [] = []
const assetConnectionFieldKeys = ["fixed_ipv4", "fixed_ipv6", "mac", "management_url"] as const

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
		return new Set(["name", "vendor", "asset_tag"])
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
		"fixed_ipv6",
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
	const sections = getAssetFormSections(type)
		.map((section) => ({
			...section,
			title: getAssetProfileEditSectionTitle(section.title),
			fields: section.fields.filter((field) => !requiredFieldKeys.has(field.key)),
		}))
		.filter((section) => section.fields.length > 0)
	return HOST_ASSET_TYPES.includes(type) ? buildHostProfileEditSections(type, sections) : sections
}

function getAssetProfileEditSectionTitle(title: string) {
	if (title === "硬件识别") return "识别与官方资料"
	if (title === "Agent 可采集规格") return "硬件规格"
	if (title === "硬件细节") return "硬件扩展"
	return title
}

const hostEditSectionDefinitions = [
	{
		title: "外观尺寸",
		keys: [
			"form_factor",
			"case_form_factor",
			"rack_form_factor",
			"mount_support",
			"length_mm",
			"width_mm",
			"height_mm",
			"chassis_vendor",
			"chassis_model",
		],
	},
	{ title: "主板", keys: ["motherboard_vendor", "motherboard_model", "bios_vendor", "pcie_slots", "bmc"] },
	{ title: "CPU", keys: ["cpu_vendor", "cpu_model", "cpu_socket_count"] },
	{
		title: "内存",
		keys: [
			"memory_gb",
			"memory_vendor",
			"memory_detail",
			"memory_type",
			"memory_speed_mhz",
			"supported_memory_type",
			"max_memory_gb",
			"memory_channel_count",
			"ecc_memory",
		],
	},
	{ title: "GPU", keys: ["gpu_detail", "gpu_vendor", "gpu_model", "gpu_board_vendor", "gpu_vram_gb"] },
	{
		title: "硬盘",
		keys: [
			"storage_summary",
			"storage_detail",
			"storage_vendor",
			"storage_model",
			"storage_media",
			"storage_serial_note",
			"storage_slots",
			"bay_count",
			"storage_backplane",
			"raid_mode",
			"raid_controller",
			"filesystem",
			"hot_swap",
			"cache_slots",
			"transcode_engine",
		],
	},
	{
		title: "网络",
		keys: [
			"primary_nic_speed_mbps",
			"nic_detail",
			"nic_vendor",
			"nic_model",
			"wifi_vendor",
			"wifi_model",
			"wifi_support",
			"bluetooth_support",
		],
	},
	{ title: "电源", keys: ["chassis_power_detail", "psu_vendor", "psu_model", "power_adapter_w", "redundant_psu"] },
	{ title: "接口", keys: ["display_outputs", "audio_output", "usb_ports"] },
	{ title: "其他", keys: ["preinstalled_os", "supported_os", "package_weight_kg", "weight_kg", "release_date"] },
] as const

const miniPcHiddenFieldKeys = ["chassis_power_detail", "psu_vendor", "psu_model", "redundant_psu"]

function buildHostProfileEditSections(
	type: AssetRecord["type"],
	sections: { title: string; fields: AssetFieldDefinition[] }[]
) {
	const fieldsByKey = new Map(sections.flatMap((section) => section.fields.map((field) => [field.key, field])))
	if (type === "mini_pc") {
		for (const key of miniPcHiddenFieldKeys) fieldsByKey.delete(key)
	}
	const usedKeys = new Set<string>()
	const hardwareSections = hostEditSectionDefinitions.flatMap((definition) => {
		const fields = definition.keys.flatMap((key) => {
			const field = fieldsByKey.get(key)
			if (!field) return []
			usedKeys.add(key)
			return [field]
		})
		return fields.length > 0 ? [{ title: definition.title, fields }] : []
	})
	const remainder = sections
		.filter((section) => !["购买信息", "备注"].includes(section.title))
		.flatMap((section) => section.fields)
		.filter((field) => fieldsByKey.has(field.key))
		.filter((field) => !usedKeys.has(field.key))
	if (remainder.length > 0) {
		hardwareSections.push({ title: "其他", fields: remainder })
	}
	return [...hardwareSections, ...sections.filter((section) => ["购买信息", "备注"].includes(section.title))]
}
