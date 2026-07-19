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
	getHostTypeSpecificFields,
	getMetadataNumber,
	getMetadataString,
	getStatusLabel,
	type AssetFieldDefinition,
} from "./asset-schema.ts"
import { normalizeMemorySpecification } from "./asset-memory-spec.ts"
import { normalizeNetworkInterfaceSummary } from "./asset-runtime-hardware.ts"
import {
	formatInternetAddressTimestamp,
	getInternetAddressAutoRefreshSettings,
} from "./asset-internet-address-status.ts"
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
	const groups = dedupeParameterGroups([...archiveGroups, ...hostGroups])
	return asset.type === "internet" ? addInternetAddressStatusRows(asset, groups) : groups
}

function addInternetAddressStatusRows(asset: AssetRecord, groups: AssetParameterGroup[]) {
	const ipv4 = getMetadataString(asset.metadata, "public_ipv4")
	const ipv6 = getMetadataString(asset.metadata, "public_ipv6")
	const checkedAt = getMetadataString(asset.metadata, "public_ip_checked_at")
	const nextCheckAt = getMetadataString(asset.metadata, "public_ip_next_check_at")
	const settings = getInternetAddressAutoRefreshSettings(asset.metadata ?? {})
	const rows: AssetParameterRow[] = [
		{ label: "当前公网 IPv4", value: ipv4 || "尚未获取" },
		{ label: "当前公网 IPv6", value: ipv6 || "尚未获取" },
		{ label: "上次更新时间", value: formatInternetAddressTimestamp(checkedAt) },
		{
			label: "下次更新时间",
			value: nextCheckAt
				? formatInternetAddressTimestamp(nextCheckAt)
				: settings.enabled
					? "等待首次更新"
					: "自动更新已关闭",
		},
	]
	const existing = groups.find((group) => group.title === "动态公网地址")
	if (existing) {
		return groups.map((group) =>
			group.title === "动态公网地址" ? { ...group, rows, summary: ipv4 || ipv6 || "尚未获取" } : group
		)
	}
	const addressGroup: AssetParameterGroup = {
		id: "internet-public-addresses",
		title: "动态公网地址",
		summary: ipv4 || ipv6 || "尚未获取",
		icon: createElement(Globe2Icon, { className: "size-4" }),
		rows,
	}
	const lineParametersIndex = groups.findIndex((group) => group.title === "线路参数")
	const insertAt = lineParametersIndex >= 0 ? lineParametersIndex + 1 : 0
	return [...groups.slice(0, insertAt), addressGroup, ...groups.slice(insertAt)]
}

const hiddenArchiveParameterGroupTitles = new Set([
	"基础资料",
	"基础身份",
	"硬件识别",
	"固定地址",
	"接入信息",
	"购买信息",
	"生命周期",
	"备注",
])
const hiddenHostHardwareParameterGroupTitles = new Set<string>()

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
	section?: string
}

type HostHardwareProfileGroup = {
	title: string
	icon: ReactNode
	rows: HostHardwareProfileRow[]
}

function buildHostHardwareProfileGroups(asset: AssetRecord): HostHardwareProfileGroup[] {
	const metadata = asset.metadata
	const metadataRow = (
		label: string,
		key: string,
		capture: AssetFieldDefinition["capture"] = "future_collectable"
	): HostHardwareProfileRow | undefined => {
		const rawValue = getMetadataString(metadata, key)
		const value =
			key === "memory_detail"
				? normalizeMemorySpecification(rawValue)
				: key === "nic_detail"
					? normalizeNetworkInterfaceSummary(rawValue)
					: rawValue
		return value ? { label, value, capture } : undefined
	}
	const numberRow = (
		label: string,
		key: string,
		unit: string,
		capture: AssetFieldDefinition["capture"] = "future_collectable"
	): HostHardwareProfileRow | undefined => {
		const value = getMetadataNumber(metadata, key)
		return value ? { label, value: unit ? `${value} ${unit}` : String(value), capture } : undefined
	}
	const compact = (rows: (HostHardwareProfileRow | undefined)[]) => rows.filter(Boolean) as HostHardwareProfileRow[]
	const typeSpecificRows = new Map(
		getHostTypeSpecificFields(asset.type)
			.map((field) => {
				const value = getAssetFieldDisplayValue(asset, field)
				return value ? [field.key, { label: field.label, value, capture: field.capture }] : undefined
			})
			.filter(Boolean) as [string, HostHardwareProfileRow][]
	)
	const typeSpecificRow = (key: string) => typeSpecificRows.get(key)

	return [
		{
			title: "外观尺寸",
			icon: createElement(BoxesIcon, { className: "size-4" }),
			rows: compact([
				typeSpecificRow("form_factor"),
				typeSpecificRow("case_form_factor"),
				typeSpecificRow("rack_form_factor"),
				typeSpecificRow("mount_support"),
				numberRow("长度", "length_mm", "mm", "manual"),
				numberRow("宽度", "width_mm", "mm", "manual"),
				numberRow("高度", "height_mm", "mm", "manual"),
				metadataRow("外观颜色", "color", "manual"),
				typeSpecificRow("chassis_vendor"),
				typeSpecificRow("chassis_model"),
			]),
		},
		{
			title: "主板",
			icon: createElement(BoxesIcon, { className: "size-4" }),
			rows: compact([
				metadataRow("主板品牌", "motherboard_vendor"),
				metadataRow("主板型号", "motherboard_model"),
				metadataRow("BIOS 厂商", "bios_vendor"),
				typeSpecificRow("pcie_slots"),
				typeSpecificRow("bmc"),
			]),
		},
		{
			title: "CPU",
			icon: createElement(CpuIcon, { className: "size-4" }),
			rows: compact([
				metadataRow("CPU 厂商", "cpu_vendor", "agent_collectable"),
				metadataRow("CPU 型号", "cpu_model", "agent_collectable"),
				typeSpecificRow("cpu_socket_count"),
			]),
		},
		{
			title: "内存",
			icon: createElement(BoxesIcon, { className: "size-4" }),
			rows: compact([
				numberRow("当前内存容量", "memory_gb", "GB", "agent_collectable"),
				metadataRow("内存品牌", "memory_vendor"),
				metadataRow("内存规格", "memory_detail"),
				metadataRow("当前内存类型", "memory_type"),
				numberRow("当前内存频率", "memory_speed_mhz", "MHz"),
				metadataRow("支持内存类型", "supported_memory_type"),
				numberRow("最大内存容量", "max_memory_gb", "GB"),
				numberRow("内存通道数量", "memory_channel_count", ""),
				typeSpecificRow("ecc_memory"),
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
			]),
		},
		{
			title: "硬盘",
			icon: createElement(HardDriveIcon, { className: "size-4" }),
			rows: compact([
				metadataRow("当前存储摘要", "storage_summary", "agent_collectable"),
				metadataRow("当前硬盘品牌 / 型号", "storage_detail"),
				metadataRow("当前主存储品牌", "storage_vendor"),
				metadataRow("当前主存储型号", "storage_model"),
				metadataRow("当前存储介质 / 总线", "storage_media"),
				metadataRow("当前硬盘序列号备注", "storage_serial_note"),
				typeSpecificRow("storage_slots"),
				typeSpecificRow("bay_count"),
				typeSpecificRow("storage_backplane"),
				typeSpecificRow("raid_mode"),
				typeSpecificRow("raid_controller"),
				typeSpecificRow("filesystem"),
				typeSpecificRow("hot_swap"),
				typeSpecificRow("cache_slots"),
				typeSpecificRow("transcode_engine"),
			]),
		},
		{
			title: "网络",
			icon: createElement(NetworkIcon, { className: "size-4" }),
			rows: compact([
				numberRow("主网卡速率", "primary_nic_speed_mbps", "Mbps", "agent_collectable"),
				metadataRow("网卡品牌 / 型号", "nic_detail"),
				metadataRow("有线网卡品牌", "nic_vendor"),
				metadataRow("有线网卡型号", "nic_model"),
				metadataRow("无线网卡品牌", "wifi_vendor"),
				metadataRow("无线网卡型号", "wifi_model"),
				typeSpecificRow("wifi_support"),
				typeSpecificRow("bluetooth_support"),
			]),
		},
		{
			title: "电源",
			icon: createElement(BatteryIcon, { className: "size-4" }),
			rows: compact([
				typeSpecificRow("chassis_power_detail"),
				metadataRow("电源品牌", "psu_vendor", "manual"),
				metadataRow("电源型号 / 功率", "psu_model", "manual"),
				typeSpecificRow("power_adapter_w"),
				typeSpecificRow("redundant_psu"),
			]),
		},
		{
			title: "接口",
			icon: createElement(NetworkIcon, { className: "size-4" }),
			rows: compact([
				typeSpecificRow("display_outputs"),
				typeSpecificRow("audio_output"),
				typeSpecificRow("usb_ports"),
			]),
		},
		{
			title: "其他",
			icon: createElement(ListChecksIcon, { className: "size-4" }),
			rows: compact([
				typeSpecificRow("preinstalled_os"),
				typeSpecificRow("supported_os"),
				numberRow("包装重", "package_weight_kg", "kg", "manual"),
				numberRow("净重", "weight_kg", "kg", "manual"),
				typeSpecificRow("release_date"),
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
		case "memory_detail":
			value = normalizeMemorySpecification(getMetadataString(asset.metadata, field.key))
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
