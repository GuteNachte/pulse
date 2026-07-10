import {
	BatteryIcon,
	BoxesIcon,
	CpuIcon,
	Globe2Icon,
	HardDriveIcon,
	ImageIcon,
	ListChecksIcon,
	MonitorIcon,
	NetworkIcon,
	ThermometerIcon,
} from "lucide-react"
import { createElement, type ReactNode } from "react"
import type { AssetRecord } from "@/types"
import type { AssetParameterGroup, AssetParameterRow } from "./components/asset-parameter-columns"
import { formatAssetParameterRowDisplay } from "./asset-parameter-display.ts"
import {
	HOST_ASSET_TYPES,
	getAssetFormSections,
	getMetadataNumber,
	getMetadataString,
	getStatusLabel,
	type AssetFieldDefinition,
} from "./asset-schema.ts"
export function buildAssetParameterGroups(asset: AssetRecord): AssetParameterGroup[] {
	const useHostHardwareProfile = HOST_ASSET_TYPES.includes(asset.type)
	const archiveGroups = useHostHardwareProfile
		? []
		: buildArchiveDetailSections(asset)
				.filter((section) => !hiddenArchiveParameterGroupTitles.has(section.title))
				.flatMap((section) =>
					splitArchiveSectionIntoParameterGroups(section).map((group, index) => ({
						...group,
						id: `archive-${normalizeGroupId(group.title)}-${index}`,
					}))
				)
	const hostGroups = useHostHardwareProfile
		? buildHostHardwareProfileGroups(asset)
				.filter((group) => !hiddenHostHardwareParameterGroupTitles.has(group.title))
				.filter((group) => group.rows.length > 0)
				.map((group, index) => ({
					id: `host-${normalizeGroupId(group.title)}-${index}`,
					title: group.title,
					icon: group.icon,
					rows: group.rows.map((row) => ({
						label: row.label,
						value: row.value,
						href: row.href,
						capture: row.capture,
						section: row.section,
					})),
					summary: getParameterGroupSummary(group.rows),
				}))
		: []
	return dedupeParameterGroups([...archiveGroups, ...hostGroups])
}

const hiddenArchiveParameterGroupTitles = new Set(["基础身份", "硬件识别", "固定地址", "接入信息", "生命周期", "备注"])
const hiddenHostHardwareParameterGroupTitles = new Set(["整机与支持"])

function splitArchiveSectionIntoParameterGroups(section: ArchiveDetailSection): Omit<AssetParameterGroup, "id">[] {
	const visibleRows = section.rows.filter((row) => !hiddenArchiveParameterFieldKeys.has(row.field.key))
	if (section.title !== "硬件性能") {
		const rows = visibleRows.map(archiveRowToParameterRow)
		return [
			{
				title: normalizeArchiveSectionTitle(section.title),
				icon: getParameterGroupIcon(section.title),
				rows,
				summary: getParameterGroupSummary(rows),
			},
		]
	}
	const buckets = [
		{
			title: "处理器",
			keys: [
				"cpu_model",
				"cpu_vendor",
				"cpu_process",
				"cpu_architecture",
				"cpu_cores",
				"cpu_frequency",
				"gpu_model",
				"gpu_detail",
			],
			icon: createElement(CpuIcon, { className: "size-4" }),
		},
		{
			title: "内存",
			keys: ["memory_gb", "memory_detail", "memory_type"],
			icon: createElement(HardDriveIcon, { className: "size-4" }),
		},
		{
			title: "存储",
			keys: ["storage_gb", "storage_detail", "storage_options"],
			icon: createElement(HardDriveIcon, { className: "size-4" }),
		},
	]
	return buckets.flatMap((bucket) => {
		const rows = visibleRows.filter((row) => bucket.keys.includes(row.field.key)).map(archiveRowToParameterRow)
		if (rows.length === 0) return []
		return [{ title: bucket.title, icon: bucket.icon, rows, summary: getParameterGroupSummary(rows) }]
	})
}

function archiveRowToParameterRow(row: ArchiveDetailRow): AssetParameterRow {
	const isUrl = row.field.type === "url" && /^https?:\/\//i.test(row.value)
	const display = formatAssetParameterRowDisplay(row.field, row.value)
	return {
		label: display.label,
		value: display.value,
		href: isUrl ? row.value : undefined,
		capture: row.field.capture,
		section: getArchiveRowDetailSection(row.field.key),
	}
}

const hiddenArchiveParameterFieldKeys = new Set([
	"asset_tag",
	"internal_model",
	"fixed_ipv4",
	"fixed_ipv6",
	"mac",
	"management_url",
	"support_url",
	"product_url",
	"official_url",
	"official_image_url",
	"account_note",
])

const archiveParameterDetailSectionMap = new Map<string, string>([
	["cpu_model", "处理器"],
	["cpu_vendor", "处理器"],
	["cpu_process", "处理器"],
	["cpu_architecture", "处理器"],
	["cpu_cores", "处理器"],
	["cpu_frequency", "处理器"],
	["gpu_model", "图形"],
	["gpu_detail", "图形"],
	["memory_gb", "内存"],
	["memory_detail", "内存"],
	["memory_type", "内存"],
	["storage_gb", "存储"],
	["storage_detail", "存储"],
	["storage_options", "存储"],
	["screen_size", "面板"],
	["display_type", "面板"],
	["display_resolution", "显示"],
	["screen_refresh_rate", "显示"],
	["touch_sampling_rate", "显示"],
	["display_brightness", "显示"],
	["display_color_depth", "显示"],
	["hdr_support", "显示"],
	["display_protection", "耐用性"],
	["battery_capacity_mah", "电池"],
	["battery_type", "电池"],
	["charging_power_w", "有线充电"],
	["wireless_charging", "无线充电"],
	["battery_life_note", "续航"],
	["camera_summary", "摘要"],
	["rear_camera_detail", "后置影像"],
	["rear_main_camera", "后置影像"],
	["rear_ultrawide_camera", "后置影像"],
	["rear_macro_camera", "后置影像"],
	["rear_telephoto_camera", "后置影像"],
	["front_camera_detail", "前置影像"],
	["video_recording", "视频"],
	["image_stabilization", "防抖 / 对焦"],
	["mobile_network", "蜂窝"],
	["sim_detail", "蜂窝"],
	["wifi_standard", "无线"],
	["bluetooth_version", "无线"],
	["positioning", "定位"],
	["usb_detail", "接口"],
	["nfc", "近场 / 红外"],
	["infrared", "近场 / 红外"],
	["dimensions", "尺寸重量"],
	["weight", "尺寸重量"],
	["body_material", "外观"],
	["colors_available", "外观"],
	["water_resistance", "防护"],
	["speaker_detail", "音频"],
	["audio_detail", "音频"],
	["biometrics", "识别"],
	["sensor_detail", "传感器"],
	["cooling_system", "散热"],
	["official_image_url", "资料来源"],
	["support_url", "资料来源"],
	["product_url", "资料来源"],
	["official_url", "资料来源"],
	["account_note", "归属"],
	["power_mode", "供电"],
])

function getArchiveRowDetailSection(fieldKey: string) {
	const section = archiveParameterDetailSectionMap.get(fieldKey)
	if (section) return section
	if (fieldKey.endsWith("_support_url")) return "资料来源"
	return undefined
}

function getParameterGroupSummary(rows: { label: string; value: string }[]) {
	const first = rows.find((row) => row.value)
	if (!first) return "暂无数据"
	return first.value
}

function normalizeArchiveSectionTitle(title: string) {
	if (title === "网络与接口") return "网络接口"
	if (title === "机身与外观") return "外观尺寸"
	return title
}

function getParameterGroupIcon(title: string) {
	if (title.includes("屏幕")) return createElement(MonitorIcon, { className: "size-4" })
	if (title.includes("电池") || title.includes("充电")) return createElement(BatteryIcon, { className: "size-4" })
	if (title.includes("影像")) return createElement(ImageIcon, { className: "size-4" })
	if (title.includes("网络") || title.includes("接口")) return createElement(NetworkIcon, { className: "size-4" })
	if (title.includes("外观") || title.includes("尺寸")) return createElement(BoxesIcon, { className: "size-4" })
	if (title.includes("账号")) return createElement(Globe2Icon, { className: "size-4" })
	return createElement(ListChecksIcon, { className: "size-4" })
}

function normalizeGroupId(value: string) {
	return normalizeComparableText(value).replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
}

function dedupeParameterGroups(groups: AssetParameterGroup[]) {
	const seen = new Set<string>()
	return groups.filter((group) => {
		if (group.rows.length === 0) return false
		const signature = `${group.title}:${group.rows.map((row) => `${row.label}:${row.value}`).join("|")}`
		if (seen.has(signature)) return false
		seen.add(signature)
		return true
	})
}

type ArchiveDetailSection = {
	title: string
	rows: ArchiveDetailRow[]
}

type ArchiveDetailRow = {
	field: AssetFieldDefinition
	value: string
}

const archivePersonalDeviceSectionMap = new Map<string, string>([
	["cpu_model", "硬件性能"],
	["cpu_vendor", "硬件性能"],
	["cpu_process", "硬件性能"],
	["cpu_architecture", "硬件性能"],
	["cpu_cores", "硬件性能"],
	["cpu_frequency", "硬件性能"],
	["gpu_model", "硬件性能"],
	["gpu_detail", "硬件性能"],
	["memory_gb", "硬件性能"],
	["memory_detail", "硬件性能"],
	["memory_type", "硬件性能"],
	["storage_gb", "硬件性能"],
	["storage_detail", "硬件性能"],
	["storage_options", "硬件性能"],
	["screen_size", "屏幕"],
	["display_type", "屏幕"],
	["display_resolution", "屏幕"],
	["screen_refresh_rate", "屏幕"],
	["touch_sampling_rate", "屏幕"],
	["display_brightness", "屏幕"],
	["display_color_depth", "屏幕"],
	["hdr_support", "屏幕"],
	["display_protection", "屏幕"],
	["battery_capacity_mah", "电池与充电"],
	["battery_type", "电池与充电"],
	["charging_power_w", "电池与充电"],
	["wireless_charging", "电池与充电"],
	["battery_life_note", "电池与充电"],
	["camera_summary", "影像"],
	["rear_camera_detail", "影像"],
	["rear_main_camera", "影像"],
	["rear_ultrawide_camera", "影像"],
	["rear_macro_camera", "影像"],
	["rear_telephoto_camera", "影像"],
	["front_camera_detail", "影像"],
	["video_recording", "影像"],
	["image_stabilization", "影像"],
	["mobile_network", "网络与接口"],
	["sim_detail", "网络与接口"],
	["wifi_standard", "网络与接口"],
	["bluetooth_version", "网络与接口"],
	["positioning", "网络与接口"],
	["usb_detail", "网络与接口"],
	["nfc", "网络与接口"],
	["infrared", "网络与接口"],
	["dimensions", "机身与外观"],
	["weight", "机身与外观"],
	["body_material", "机身与外观"],
	["colors_available", "机身与外观"],
	["water_resistance", "机身与外观"],
	["speaker_detail", "机身与外观"],
	["audio_detail", "机身与外观"],
	["biometrics", "机身与外观"],
	["sensor_detail", "机身与外观"],
	["cooling_system", "机身与外观"],
	["official_image_url", "机身与外观"],
	["account_note", "关联账号"],
	["power_mode", "关联账号"],
])

const hiddenArchiveDetailFieldKeys = new Set([
	"online_specs_summary",
	"device_os",
	"firmware_version",
	"bios_version",
	"bios_release_date",
])

function buildArchiveDetailSections(asset: AssetRecord): ArchiveDetailSection[] {
	const sections = getAssetFormSections(asset.type)
	return sections.flatMap((section) => {
		const rows = buildArchiveDetailRows(asset, section.fields)
		if (rows.length === 0) return []
		if (section.title === "设备参数") {
			return splitArchiveRowsBySemanticSection(rows, archivePersonalDeviceSectionMap)
		}
		return [{ title: section.title, rows }]
	})
}

function buildArchiveDetailRows(asset: AssetRecord, fields: AssetFieldDefinition[]): ArchiveDetailRow[] {
	return fields
		.filter((field) => !hiddenArchiveDetailFieldKeys.has(field.key))
		.map((field) => ({
			field,
			value: getAssetFieldDisplayValue(asset, field),
		}))
		.filter((row) => row.value)
}

function splitArchiveRowsBySemanticSection(
	rows: ArchiveDetailRow[],
	sectionMap: Map<string, string>
): ArchiveDetailSection[] {
	const sections: ArchiveDetailSection[] = []
	for (const row of rows) {
		const title = sectionMap.get(row.field.key) ?? "其他参数"
		let section = sections.find((item) => item.title === title)
		if (!section) {
			section = { title, rows: [] }
			sections.push(section)
		}
		section.rows.push(row)
	}
	return sections
}

type HostHardwareProfileRow = {
	label: string
	value: string
	capture?: AssetFieldDefinition["capture"]
	href?: string
}

type HostHardwareProfileGroup = {
	title: string
	icon: ReactNode
	rows: HostHardwareProfileRow[]
}

function buildHostHardwareProfileGroups(asset: AssetRecord): HostHardwareProfileGroup[] {
	const metadata = asset.metadata
	const urlRow = (
		label: string,
		key: string,
		capture: AssetFieldDefinition["capture"] = "future_collectable"
	): HostHardwareProfileRow | undefined => {
		const value = getMetadataString(metadata, key)
		if (!value) return undefined
		return { label, value, href: /^https?:\/\//i.test(value) ? value : undefined, capture }
	}
	const metadataRow = (
		label: string,
		key: string,
		capture: AssetFieldDefinition["capture"] = "future_collectable"
	): HostHardwareProfileRow | undefined => {
		const value = getMetadataString(metadata, key)
		return value ? { label, value, capture } : undefined
	}
	const numberRow = (
		label: string,
		key: string,
		unit: string,
		capture: AssetFieldDefinition["capture"] = "future_collectable"
	): HostHardwareProfileRow | undefined => {
		const value = getMetadataNumber(metadata, key)
		return value ? { label, value: `${value} ${unit}`, capture } : undefined
	}
	const directRow = (
		label: string,
		value: string,
		capture: AssetFieldDefinition["capture"] = "manual"
	): HostHardwareProfileRow | undefined => (value ? { label, value, capture } : undefined)
	const compact = (rows: (HostHardwareProfileRow | undefined)[]) => rows.filter(Boolean) as HostHardwareProfileRow[]

	return [
		{
			title: "整机与支持",
			icon: createElement(MonitorIcon, { className: "size-4" }),
			rows: compact([
				directRow("厂商 / 品牌", asset.vendor),
				directRow("型号 / 规格", asset.model),
				directRow("序列号", asset.serial_number),
				urlRow("厂家官方支持页", "support_url", "manual"),
				urlRow("厂家官方产品页", "product_url", "manual"),
				urlRow("厂家官网资料页", "official_url", "manual"),
				metadataRow("专项识别依据", "hardware_fingerprint_note"),
				metadataRow("专项识别匹配备注", "hardware_match_note"),
			]),
		},
		{
			title: "CPU",
			icon: createElement(CpuIcon, { className: "size-4" }),
			rows: compact([
				metadataRow("CPU 厂商", "cpu_vendor", "agent_collectable"),
				metadataRow("CPU 型号", "cpu_model", "agent_collectable"),
				urlRow("CPU 官方支持页", "cpu_support_url"),
			]),
		},
		{
			title: "主板 / BIOS",
			icon: createElement(BoxesIcon, { className: "size-4" }),
			rows: compact([
				metadataRow("主板品牌", "motherboard_vendor"),
				metadataRow("主板型号", "motherboard_model"),
				urlRow("主板支持页", "motherboard_support_url"),
				metadataRow("BIOS 厂商", "bios_vendor"),
			]),
		},
		{
			title: "GPU",
			icon: createElement(ThermometerIcon, { className: "size-4" }),
			rows: compact([
				metadataRow("显卡品牌 / 型号", "gpu_detail"),
				metadataRow("GPU 芯片厂商", "gpu_vendor"),
				metadataRow("GPU 芯片型号", "gpu_model"),
				metadataRow("显卡板卡品牌", "gpu_board_vendor"),
				numberRow("显存", "gpu_vram_gb", "GB"),
				urlRow("显卡支持页", "gpu_support_url"),
			]),
		},
		{
			title: "内存",
			icon: createElement(BoxesIcon, { className: "size-4" }),
			rows: compact([
				numberRow("内存容量", "memory_gb", "GB", "agent_collectable"),
				metadataRow("内存品牌 / 规格", "memory_detail"),
				metadataRow("内存品牌", "memory_vendor"),
				metadataRow("内存型号 / 颗粒", "memory_model"),
				metadataRow("内存类型", "memory_type"),
				numberRow("内存频率", "memory_speed_mhz", "MHz"),
				metadataRow("内存插槽摘要", "memory_slots_summary"),
				urlRow("内存支持页", "memory_support_url"),
			]),
		},
		{
			title: "存储",
			icon: createElement(HardDriveIcon, { className: "size-4" }),
			rows: compact([
				metadataRow("存储摘要", "storage_summary", "agent_collectable"),
				metadataRow("硬盘品牌 / 型号", "storage_detail"),
				metadataRow("主存储品牌", "storage_vendor"),
				metadataRow("主存储型号", "storage_model"),
				metadataRow("存储介质 / 总线", "storage_media"),
				metadataRow("硬盘序列号备注", "storage_serial_note"),
				urlRow("存储支持页", "storage_support_url"),
			]),
		},
		{
			title: "网络硬件",
			icon: createElement(NetworkIcon, { className: "size-4" }),
			rows: compact([
				numberRow("主网卡速率", "primary_nic_speed_mbps", "Mbps", "agent_collectable"),
				metadataRow("网卡品牌 / 型号", "nic_detail"),
				metadataRow("有线网卡品牌", "nic_vendor"),
				metadataRow("有线网卡型号", "nic_model"),
				metadataRow("无线网卡品牌", "wifi_vendor"),
				metadataRow("无线网卡型号", "wifi_model"),
				urlRow("网卡驱动 / 支持页", "nic_support_url"),
				urlRow("无线网卡驱动 / 支持页", "wifi_support_url"),
			]),
		},
		{
			title: "机箱 / 电源",
			icon: createElement(BatteryIcon, { className: "size-4" }),
			rows: compact([
				metadataRow("机箱 / 电源", "chassis_power_detail", "manual"),
				metadataRow("机箱品牌", "chassis_vendor", "manual"),
				metadataRow("机箱型号", "chassis_model", "manual"),
				urlRow("机箱支持页", "chassis_support_url", "manual"),
				metadataRow("电源品牌", "psu_vendor", "manual"),
				metadataRow("电源型号 / 功率", "psu_model", "manual"),
				urlRow("电源支持页", "psu_support_url", "manual"),
			]),
		},
	]
}

function getAssetFieldDisplayValue(asset: AssetRecord, field: AssetFieldDefinition) {
	let value = ""
	switch (field.key) {
		case "name":
			value = asset.name
			break
		case "status":
			value = getStatusLabel(asset.status || "active")
			break
		case "vendor":
			value = asset.vendor || ""
			break
		case "model":
			value = asset.model || ""
			break
		case "serial_number":
			value = asset.serial_number || ""
			break
		case "management_ip":
			value = asset.management_ip || ""
			break
		case "location":
			value = asset.location || ""
			break
		case "role":
			value = asset.role || ""
			break
		case "notes":
			value = asset.notes || ""
			break
		default:
			value = getMetadataString(asset.metadata, field.key)
	}
	if (field.type === "select") {
		return field.options?.find((option) => option.value === value)?.label ?? value
	}
	return value
}

function normalizeComparableText(value: string) {
	return value.trim().toLowerCase()
}
