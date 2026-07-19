import type { AssetStatus, AssetType } from "@/types"
import { getAssetProfile, getCreatableAssetTypeOptions } from "./asset-profiles.ts"
import {
	internetAssetTypeSpec,
	normalizeInternetProvider,
	ontAssetTypeSpec,
	type AssetTypeSpec,
} from "./asset-type-specs.ts"

export type AssetFieldSource = "asset" | "metadata"
export type AssetFieldType = "text" | "number" | "date" | "url" | "select"
export type AssetFieldCapture = "manual" | "agent_collectable" | "agent_required" | "future_collectable"

export type AssetFieldDefinition = {
	key: string
	label: string
	source: AssetFieldSource
	type?: AssetFieldType
	required?: boolean
	placeholder?: string
	span?: "full"
	options?: { value: string; label: string }[]
	capture?: AssetFieldCapture
	readOnly?: boolean
}

export type AssetFieldSection = {
	title: string
	fields: AssetFieldDefinition[]
}

export const ASSET_TYPE_OPTIONS = getCreatableAssetTypeOptions().map((profile) => ({
	value: profile.type,
	label: profile.label,
	group: profile.group,
	description: profile.description,
}))

export const STATUS_OPTIONS: { value: AssetStatus; label: string }[] = [
	{ value: "active", label: "在用" },
	{ value: "planned", label: "规划" },
	{ value: "inactive", label: "停用" },
	{ value: "retired", label: "退役" },
]

export const HOST_ASSET_TYPES: AssetType[] = ["physical_host", "nas", "server", "mini_pc"]
export const NETWORK_ASSET_TYPES: AssetType[] = ["router", "switch", "ap", "gateway", "ont", "firewall"]
export const PERSONAL_ASSET_TYPES: AssetType[] = [
	"phone",
	"tablet",
	"wearable",
	"ebook",
	"game_console",
	"handheld",
	"tv",
	"speaker",
]
export const SMART_HOME_ASSET_TYPES: AssetType[] = [
	"smarthome_gateway",
	"sensor",
	"light",
	"plug",
	"lock",
	"vacuum",
	"iot",
]
export const FIXED_SPEC_ASSET_TYPES: AssetType[] = [
	...NETWORK_ASSET_TYPES,
	...PERSONAL_ASSET_TYPES,
	"camera",
	"printer",
	"ups",
	...SMART_HOME_ASSET_TYPES,
]
export const ENDPOINT_ASSET_TYPES: AssetType[] = [
	...PERSONAL_ASSET_TYPES,
	"camera",
	"printer",
	"ups",
	...SMART_HOME_ASSET_TYPES,
]

const yesNoOptions = [
	{ value: "yes", label: "是" },
	{ value: "no", label: "否" },
]

const connectionOptions = [
	{ value: "ethernet", label: "有线" },
	{ value: "wifi", label: "无线" },
	{ value: "both", label: "有线 + 无线" },
	{ value: "unknown", label: "暂不确定" },
]

const commonIdentityFields: AssetFieldDefinition[] = [
	{ key: "name", label: "资产名称", source: "asset", required: true, placeholder: "例如 GuteNacht / V271-20" },
	{ key: "status", label: "状态", source: "asset", type: "select", options: STATUS_OPTIONS },
	{ key: "location", label: "位置", source: "asset", required: true, placeholder: "例如 家 / 书房 / 电脑桌" },
	{ key: "role", label: "用途 / 角色", source: "asset", placeholder: "例如 主路由 / 游戏主机 / 备份 NAS" },
]

const hardwareIdentityFields: AssetFieldDefinition[] = [
	{ key: "vendor", label: "厂商 / 品牌", source: "asset", placeholder: "例如 Intel / TP-Link / 自组" },
	{ key: "model", label: "型号 / 规格", source: "asset", placeholder: "例如 V271-20 / CM754" },
	{ key: "serial_number", label: "序列号", source: "asset", placeholder: "可选，保修和盘点用" },
	{
		key: "official_url",
		label: "官方网站",
		source: "metadata",
		type: "url",
		placeholder: "主设备厂商官网或型号官方资料页面 URL",
		capture: "manual",
	},
	{ key: "asset_tag", label: "资产编号", source: "metadata", placeholder: "自定义编号，可选" },
]

const phoneInternalModelField: AssetFieldDefinition = {
	key: "internal_model",
	label: "内部型号",
	source: "metadata",
	placeholder: "例如 22021211RC / 产品内部代号",
	capture: "manual",
}

function getHardwareIdentityFields(type: AssetType) {
	return type === "phone" ? [...hardwareIdentityFields, phoneInternalModelField] : hardwareIdentityFields
}

const purchaseInfoFields: AssetFieldDefinition[] = [
	{ key: "purchase_date", label: "购买日期", source: "metadata", type: "date" },
	{ key: "purchase_price_cny", label: "购买价格（元）", source: "metadata", type: "number", placeholder: "例如 2999" },
]

const serviceSubscriptionFields: AssetFieldDefinition[] = [
	{ key: "renewal_date", label: "到期日期", source: "metadata", type: "date", capture: "manual" },
	{
		key: "recurring_price_cny",
		label: "续费价格（元）",
		source: "metadata",
		type: "number",
		placeholder: "例如 120",
		capture: "manual",
	},
	{
		key: "billing_cycle",
		label: "计费周期",
		source: "metadata",
		type: "select",
		capture: "manual",
		options: [
			{ value: "monthly", label: "月付" },
			{ value: "quarterly", label: "季付" },
			{ value: "semiannual", label: "半年付" },
			{ value: "yearly", label: "年付" },
			{ value: "usage", label: "按量计费" },
			{ value: "free", label: "免费 / 无续费" },
		],
	},
]

const fixedAddressFields: AssetFieldDefinition[] = [
	{ key: "fixed_ipv4", label: "IPv4", source: "metadata", placeholder: "192.168.1.10", capture: "manual" },
	{ key: "fixed_ipv6", label: "IPv6", source: "metadata", placeholder: "可选", capture: "manual" },
	{ key: "mac", label: "MAC", source: "metadata", placeholder: "AA:BB:CC:DD:EE:FF", capture: "manual" },
	{
		key: "management_url",
		label: "管理 URL",
		source: "metadata",
		type: "url",
		placeholder: "http://192.168.1.1",
		capture: "manual",
	},
]

const agentConnectionFields: AssetFieldDefinition[] = [
	{
		key: "fixed_ipv4",
		label: "IPv4",
		source: "metadata",
		required: true,
		placeholder: "192.168.1.10",
		capture: "agent_required",
	},
	{
		key: "fixed_ipv6",
		label: "IPv6",
		source: "metadata",
		placeholder: "Agent 接入后可采集",
		capture: "agent_collectable",
	},
	{ key: "mac", label: "MAC", source: "metadata", placeholder: "Agent 接入后可采集", capture: "agent_collectable" },
	{
		key: "management_url",
		label: "管理 URL",
		source: "metadata",
		type: "url",
		placeholder: "可选，通常手动维护",
		capture: "manual",
	},
]

const hostSpecFields: AssetFieldDefinition[] = [
	{
		key: "cpu_model",
		label: "CPU 型号",
		source: "metadata",
		placeholder: "Agent 接入后可采集",
		capture: "agent_collectable",
	},
	{
		key: "cpu_vendor",
		label: "CPU 厂商",
		source: "metadata",
		placeholder: "Agent 接入后可采集",
		capture: "agent_collectable",
	},
	{
		key: "memory_gb",
		label: "内存 GB",
		source: "metadata",
		type: "number",
		placeholder: "Agent 接入后可采集",
		capture: "agent_collectable",
	},
	{
		key: "storage_summary",
		label: "当前存储摘要",
		source: "metadata",
		placeholder: "SMART / Agent 接入后可采集，也可先手动填写",
		span: "full",
		capture: "agent_collectable",
	},
	{
		key: "primary_nic_speed_mbps",
		label: "主网卡速率 Mbps",
		source: "metadata",
		type: "number",
		placeholder: "Agent 接入后可采集",
		capture: "agent_collectable",
	},
]

const hostHardwareDetailFields: AssetFieldDefinition[] = [
	{
		key: "length_mm",
		label: "长度 mm",
		source: "metadata",
		type: "number",
		placeholder: "例如 180",
		capture: "manual",
	},
	{ key: "width_mm", label: "宽度 mm", source: "metadata", type: "number", placeholder: "例如 180", capture: "manual" },
	{ key: "height_mm", label: "高度 mm", source: "metadata", type: "number", placeholder: "例如 48", capture: "manual" },
	{
		key: "motherboard_vendor",
		label: "主板品牌",
		source: "metadata",
		placeholder: "例如 ASUS / MSI / Gigabyte",
		capture: "future_collectable",
	},
	{
		key: "motherboard_model",
		label: "主板型号",
		source: "metadata",
		placeholder: "例如 B760M / X670E",
		capture: "future_collectable",
	},
	{
		key: "bios_vendor",
		label: "BIOS 厂商",
		source: "metadata",
		placeholder: "例如 American Megatrends / Phoenix",
		capture: "future_collectable",
	},
	{
		key: "gpu_detail",
		label: "显卡品牌 / 型号",
		source: "metadata",
		placeholder: "例如 ASUS RTX 4080 / Intel UHD",
		capture: "future_collectable",
	},
	{
		key: "gpu_vendor",
		label: "GPU 芯片厂商",
		source: "metadata",
		placeholder: "NVIDIA / AMD / Intel",
		capture: "future_collectable",
	},
	{
		key: "gpu_model",
		label: "GPU 芯片型号",
		source: "metadata",
		placeholder: "例如 GeForce RTX 4080 / Radeon RX 7800 XT",
		capture: "future_collectable",
	},
	{
		key: "gpu_board_vendor",
		label: "显卡板卡品牌",
		source: "metadata",
		placeholder: "例如 ASUS / MSI / Sapphire",
		capture: "future_collectable",
	},
	{
		key: "gpu_vram_gb",
		label: "显存 GB",
		source: "metadata",
		type: "number",
		placeholder: "16",
		capture: "future_collectable",
	},
	{
		key: "memory_detail",
		label: "内存规格",
		source: "metadata",
		placeholder: "例如 16 GB x 2",
		capture: "future_collectable",
	},
	{
		key: "memory_vendor",
		label: "内存品牌",
		source: "metadata",
		placeholder: "Kingston / Corsair / Samsung",
		capture: "future_collectable",
	},
	{
		key: "memory_type",
		label: "当前内存类型",
		source: "metadata",
		placeholder: "DDR4 / DDR5 / LPDDR5",
		capture: "future_collectable",
	},
	{
		key: "memory_speed_mhz",
		label: "当前内存频率 MHz",
		source: "metadata",
		type: "number",
		placeholder: "6000",
		capture: "future_collectable",
	},
	{
		key: "max_memory_gb",
		label: "最大内存容量 GB",
		source: "metadata",
		type: "number",
		placeholder: "例如 64",
		capture: "future_collectable",
	},
	{
		key: "supported_memory_type",
		label: "支持内存类型",
		source: "metadata",
		placeholder: "例如 DDR5 SO-DIMM",
		capture: "future_collectable",
	},
	{
		key: "memory_channel_count",
		label: "内存通道数量",
		source: "metadata",
		type: "number",
		placeholder: "例如 2",
		capture: "future_collectable",
	},
	{
		key: "storage_detail",
		label: "当前硬盘品牌 / 型号",
		source: "metadata",
		placeholder: "例如 Samsung 990 Pro 2TB / WD Red 8TB",
		capture: "future_collectable",
		span: "full",
	},
	{
		key: "storage_vendor",
		label: "当前主存储品牌",
		source: "metadata",
		placeholder: "Samsung / WD / Seagate / Crucial",
		capture: "future_collectable",
	},
	{
		key: "storage_model",
		label: "当前主存储型号",
		source: "metadata",
		placeholder: "例如 990 Pro / SN850X / IronWolf",
		capture: "future_collectable",
	},
	{
		key: "storage_media",
		label: "当前存储介质 / 总线",
		source: "metadata",
		placeholder: "NVMe SSD / SATA SSD / HDD",
		capture: "future_collectable",
	},
	{
		key: "storage_serial_note",
		label: "当前硬盘序列号备注",
		source: "metadata",
		placeholder: "多盘可写摘要，详细盘建议后续独立资产化",
		capture: "future_collectable",
		span: "full",
	},
	{
		key: "nic_detail",
		label: "网卡品牌 / 型号",
		source: "metadata",
		placeholder: "例如 Intel I225-V / Realtek 8125",
		capture: "future_collectable",
	},
	{
		key: "nic_vendor",
		label: "有线网卡品牌",
		source: "metadata",
		placeholder: "Intel / Realtek / Broadcom",
		capture: "future_collectable",
	},
	{
		key: "nic_model",
		label: "有线网卡型号",
		source: "metadata",
		placeholder: "I225-V / I226-V / RTL8125",
		capture: "future_collectable",
	},
	{
		key: "wifi_vendor",
		label: "无线网卡品牌",
		source: "metadata",
		placeholder: "Intel / Qualcomm / MediaTek",
		capture: "future_collectable",
	},
	{
		key: "wifi_model",
		label: "无线网卡型号",
		source: "metadata",
		placeholder: "AX200 / BE200 / MT7922",
		capture: "future_collectable",
	},
	{
		key: "psu_vendor",
		label: "电源品牌",
		source: "metadata",
		placeholder: "Seasonic / Corsair / Great Wall",
		capture: "manual",
	},
	{
		key: "psu_model",
		label: "电源型号 / 功率",
		source: "metadata",
		placeholder: "例如 850W 金牌",
		capture: "manual",
	},
]

const hostTypeSpecificFields: Partial<Record<AssetType, AssetFieldDefinition[]>> = {
	physical_host: [
		{ key: "cpu_socket_count", label: "CPU 插槽数量", source: "metadata", type: "number", placeholder: "1" },
		{ key: "pcie_slots", label: "PCIe 扩展槽", source: "metadata", placeholder: "x16 / x4 / M.2 插槽摘要" },
		{ key: "case_form_factor", label: "机箱形态", source: "metadata", placeholder: "ATX 塔式 / ITX / 工作站" },
		{
			key: "chassis_power_detail",
			label: "机箱 / 电源",
			source: "metadata",
			placeholder: "例如机箱型号、电源品牌和功率",
		},
		{ key: "chassis_vendor", label: "机箱品牌", source: "metadata", placeholder: "可选" },
		{ key: "chassis_model", label: "机箱型号", source: "metadata", placeholder: "可选" },
	],
	nas: [
		{ key: "bay_count", label: "硬盘位数量", source: "metadata", type: "number", placeholder: "4" },
		{ key: "raid_mode", label: "阵列 / RAID", source: "metadata", placeholder: "RAID 5 / SHR / ZFS RAIDZ" },
		{ key: "filesystem", label: "文件系统", source: "metadata", placeholder: "Btrfs / ZFS / ext4" },
		{ key: "hot_swap", label: "热插拔", source: "metadata", type: "select", options: yesNoOptions },
		{ key: "cache_slots", label: "缓存盘位", source: "metadata", placeholder: "M.2 NVMe x2 / 无" },
		{ key: "transcode_engine", label: "硬件转码", source: "metadata", placeholder: "Intel Quick Sync / 无" },
	],
	server: [
		{ key: "cpu_socket_count", label: "CPU 插槽数量", source: "metadata", type: "number", placeholder: "2" },
		{ key: "ecc_memory", label: "ECC 内存", source: "metadata", type: "select", options: yesNoOptions },
		{ key: "storage_backplane", label: "背板 / 硬盘位", source: "metadata", placeholder: "12 x 3.5 英寸 SAS / SATA" },
		{ key: "raid_controller", label: "RAID / HBA 控制器", source: "metadata", placeholder: "LSI 9361 / HBA 9300" },
		{ key: "bmc", label: "带外管理", source: "metadata", placeholder: "iDRAC / iLO / IPMI" },
		{ key: "redundant_psu", label: "冗余电源", source: "metadata", type: "select", options: yesNoOptions },
		{ key: "rack_form_factor", label: "机架规格", source: "metadata", placeholder: "1U / 2U / 塔式" },
		{
			key: "chassis_power_detail",
			label: "机箱 / 电源",
			source: "metadata",
			placeholder: "例如机箱型号、电源品牌和功率",
		},
		{ key: "chassis_vendor", label: "机箱品牌", source: "metadata", placeholder: "可选" },
		{ key: "chassis_model", label: "机箱型号", source: "metadata", placeholder: "可选" },
	],
	mini_pc: [
		{ key: "form_factor", label: "机身形态", source: "metadata", placeholder: "迷你主机 / NUC / 软路由" },
		{ key: "storage_slots", label: "官方扩展槽", source: "metadata", placeholder: "M.2 2280 x2 / 2.5 英寸 SATA" },
		{ key: "ecc_memory", label: "ECC 内存", source: "metadata", type: "select", options: yesNoOptions },
		{ key: "wifi_support", label: "Wi-Fi", source: "metadata", type: "select", options: yesNoOptions },
		{ key: "bluetooth_support", label: "蓝牙", source: "metadata", type: "select", options: yesNoOptions },
		{ key: "display_outputs", label: "显示输出", source: "metadata", placeholder: "HDMI 2.1 / USB4 / DP" },
		{ key: "audio_output", label: "音频输出", source: "metadata", placeholder: "HDMI / 3.5mm Combo Jack" },
		{ key: "usb_ports", label: "USB / 扩展接口", source: "metadata", placeholder: "USB4 / USB-A / OCuLink" },
		{ key: "power_adapter_w", label: "电源", source: "metadata", placeholder: "例如 DC 19V / 120W" },
		{ key: "mount_support", label: "安装方式", source: "metadata", placeholder: "VESA / 桌面 / 机柜托盘" },
		{ key: "preinstalled_os", label: "预装操作系统", source: "metadata", placeholder: "例如 Windows 11" },
		{ key: "supported_os", label: "支持的操作系统", source: "metadata", placeholder: "例如 Windows 11 / Linux" },
		{ key: "package_weight_kg", label: "包装重 kg", source: "metadata", type: "number", placeholder: "例如 1.66" },
		{ key: "weight_kg", label: "净重 kg", source: "metadata", type: "number", placeholder: "例如 0.6" },
		{ key: "release_date", label: "上市日期", source: "metadata", placeholder: "例如 Q4'22 / 2022-10" },
	],
}

export function getHostTypeSpecificFields(type: AssetType) {
	return hostTypeSpecificFields[type] ?? []
}

export function getHostTypeSpecificTitle(type: AssetType) {
	if (type === "nas") return "NAS 存储参数"
	if (type === "server") return "服务器平台参数"
	if (type === "mini_pc") return "迷你主机扩展参数"
	return "物理主机平台参数"
}

const networkDeviceFields: AssetFieldDefinition[] = [
	{ key: "fixed_ipv4", label: "IPv4", source: "metadata", placeholder: "192.168.1.1" },
	{ key: "fixed_ipv6", label: "IPv6", source: "metadata", placeholder: "可选" },
	{ key: "mac", label: "MAC", source: "metadata", placeholder: "AA:BB:CC:DD:EE:FF" },
	{ key: "port_count", label: "端口数量", source: "metadata", type: "number", placeholder: "5" },
	{
		key: "default_port_speed_mbps",
		label: "默认端口速率 Mbps",
		source: "metadata",
		type: "number",
		placeholder: "2500",
	},
	{ key: "power_mode", label: "供电方式", source: "metadata", placeholder: "AC / PoE / USB-C" },
	{ key: "wifi_standard", label: "无线标准", source: "metadata", placeholder: "Wi-Fi 6 / Wi-Fi 7" },
	{ key: "wan_port_count", label: "WAN 端口数量", source: "metadata", type: "number", placeholder: "1" },
	{ key: "wifi_band", label: "无线频段", source: "metadata", placeholder: "2.4 / 5 / 6 GHz" },
	{ key: "wifi_streams", label: "空间流", source: "metadata", placeholder: "2x2 / 4x4 MIMO" },
	{ key: "antenna_type", label: "天线形态", source: "metadata", placeholder: "内置 / 外置 / 可拆卸" },
	{ key: "poe_standard", label: "PoE 标准", source: "metadata", placeholder: "802.3af / at / bt" },
	{ key: "poe_budget_w", label: "PoE 供电预算 W", source: "metadata", type: "number", placeholder: "120" },
	{ key: "switching_capacity_gbps", label: "交换容量 Gbps", source: "metadata", type: "number", placeholder: "56" },
	{ key: "pon_standard", label: "PON 标准", source: "metadata", placeholder: "GPON / EPON / XG-PON" },
	{ key: "optical_connector", label: "光纤接口", source: "metadata", placeholder: "SC/APC / SFP+" },
	{ key: "voice_port_count", label: "语音端口数量", source: "metadata", type: "number", placeholder: "1" },
	{ key: "security_throughput_gbps", label: "安全吞吐 Gbps", source: "metadata", type: "number", placeholder: "2.5" },
	{ key: "vpn_throughput_gbps", label: "VPN 吞吐 Gbps", source: "metadata", type: "number", placeholder: "1" },
	{ key: "session_capacity", label: "并发会话数", source: "metadata", type: "number", placeholder: "100000" },
	{ key: "ssid_note", label: "SSID 备注", source: "metadata", placeholder: "主 Wi-Fi / IoT Wi-Fi", span: "full" },
	{ key: "vlan_note", label: "VLAN / 网段备注", source: "metadata", placeholder: "LAN 192.168.1.0/24", span: "full" },
]

const networkDeviceFieldKeysByType: Partial<Record<AssetType, readonly string[]>> = {
	router: [
		"fixed_ipv4",
		"fixed_ipv6",
		"mac",
		"port_count",
		"default_port_speed_mbps",
		"power_mode",
		"wifi_standard",
		"wan_port_count",
		"wifi_band",
		"wifi_streams",
		"antenna_type",
		"ssid_note",
		"vlan_note",
	],
	gateway: [
		"fixed_ipv4",
		"fixed_ipv6",
		"mac",
		"port_count",
		"wan_port_count",
		"default_port_speed_mbps",
		"power_mode",
		"vlan_note",
	],
	switch: [
		"fixed_ipv4",
		"fixed_ipv6",
		"mac",
		"port_count",
		"default_port_speed_mbps",
		"poe_standard",
		"poe_budget_w",
		"switching_capacity_gbps",
		"power_mode",
		"vlan_note",
	],
	ap: [
		"fixed_ipv4",
		"fixed_ipv6",
		"mac",
		"port_count",
		"default_port_speed_mbps",
		"power_mode",
		"wifi_standard",
		"wifi_band",
		"wifi_streams",
		"antenna_type",
		"poe_standard",
		"ssid_note",
		"vlan_note",
	],
	firewall: [
		"fixed_ipv4",
		"fixed_ipv6",
		"mac",
		"port_count",
		"default_port_speed_mbps",
		"security_throughput_gbps",
		"vpn_throughput_gbps",
		"session_capacity",
		"power_mode",
		"vlan_note",
	],
}

function getNetworkDeviceFields(type: AssetType) {
	const keys = new Set(networkDeviceFieldKeysByType[type] ?? networkDeviceFields.map((field) => field.key))
	return networkDeviceFields.filter((field) => keys.has(field.key))
}

function assetTypeSpecSectionsToFormSections(spec: AssetTypeSpec): AssetFieldSection[] {
	return spec.sections.map((section) => ({
		title: section.title,
		fields: section.fields.map((field) => ({
			key: field.key,
			label: field.label,
			source: field.source,
			type: field.type,
			required: field.inputMode === "manual_required" || (spec.type === "internet" && field.key === "vendor"),
			placeholder: field.placeholder,
			span: field.span,
			options: field.options ? [...field.options] : undefined,
			capture: field.inputMode === "captured_candidate" ? "agent_collectable" : "manual",
			readOnly: field.readOnly,
		})),
	}))
}

const internetSections = assetTypeSpecSectionsToFormSections(internetAssetTypeSpec)
const ontSections = assetTypeSpecSectionsToFormSections(ontAssetTypeSpec)

const vmFields: AssetFieldDefinition[] = [
	{ key: "virtualization_platform", label: "虚拟化平台", source: "metadata", placeholder: "PVE / Hyper-V / Docker VM" },
	{ key: "vcpu", label: "vCPU", source: "metadata", type: "number", placeholder: "4" },
	{ key: "memory_gb", label: "内存 GB", source: "metadata", type: "number", placeholder: "8" },
	{ key: "disk_gb", label: "磁盘 GB", source: "metadata", type: "number", placeholder: "128" },
]

const personalDeviceFields: AssetFieldDefinition[] = [
	{ key: "cpu_model", label: "芯片 / SoC", source: "metadata", placeholder: "Snapdragon / Dimensity / Apple A 系列" },
	{ key: "cpu_vendor", label: "芯片厂商", source: "metadata", placeholder: "MediaTek / Qualcomm / Apple" },
	{ key: "cpu_process", label: "制程 / 架构", source: "metadata", placeholder: "5nm / 4nm / big.LITTLE" },
	{ key: "cpu_architecture", label: "CPU 架构", source: "metadata", placeholder: "A78 / A55 / Cortex-X" },
	{ key: "cpu_cores", label: "CPU 核心", source: "metadata", placeholder: "1+3+4 / 八核心" },
	{ key: "cpu_frequency", label: "CPU 频率", source: "metadata", placeholder: "最高 2.85GHz" },
	{ key: "gpu_model", label: "GPU", source: "metadata", placeholder: "Mali-G610 / Adreno / Apple GPU" },
	{ key: "gpu_detail", label: "GPU 详情", source: "metadata", placeholder: "核心数、频率或图形能力" },
	{ key: "memory_gb", label: "运行内存 GB", source: "metadata", type: "number", placeholder: "12" },
	{ key: "memory_detail", label: "内存规格", source: "metadata", placeholder: "8GB / LPDDR5" },
	{ key: "memory_type", label: "内存类型", source: "metadata", placeholder: "LPDDR5 / LPDDR5X" },
	{ key: "storage_gb", label: "存储容量 GB", source: "metadata", type: "number", placeholder: "256" },
	{ key: "storage_detail", label: "存储规格", source: "metadata", placeholder: "UFS 3.1 / NVMe / eMMC" },
	{ key: "storage_options", label: "存储版本", source: "metadata", placeholder: "128GB / 256GB / 512GB" },
	{ key: "screen_size", label: "屏幕 / 尺寸", source: "metadata", placeholder: "6.7 英寸 / 27 英寸 / 65 英寸" },
	{ key: "display_type", label: "屏幕类型", source: "metadata", placeholder: "OLED / AMOLED / LCD / E Ink" },
	{ key: "display_resolution", label: "屏幕分辨率", source: "metadata", placeholder: "3200 x 1440" },
	{ key: "screen_refresh_rate", label: "屏幕刷新率", source: "metadata", placeholder: "120 Hz" },
	{ key: "touch_sampling_rate", label: "触控采样率", source: "metadata", placeholder: "480 Hz" },
	{ key: "display_brightness", label: "屏幕亮度", source: "metadata", placeholder: "峰值 1200 nits" },
	{ key: "display_color_depth", label: "色深 / 色彩", source: "metadata", placeholder: "12-bit / P3 / 10.7 亿色" },
	{ key: "hdr_support", label: "HDR", source: "metadata", placeholder: "HDR10+ / Dolby Vision" },
	{ key: "display_protection", label: "屏幕保护", source: "metadata", placeholder: "Corning Gorilla Glass / 玻璃盖板" },
	{ key: "battery_capacity_mah", label: "电池容量", source: "metadata", placeholder: "5000 mAh" },
	{ key: "battery_type", label: "电池类型", source: "metadata", placeholder: "锂聚合物 / 双电芯" },
	{ key: "charging_power_w", label: "充电功率", source: "metadata", placeholder: "67W / 120W" },
	{ key: "wireless_charging", label: "无线充电", source: "metadata", placeholder: "支持 / 不支持 / 50W" },
	{ key: "battery_life_note", label: "续航备注", source: "metadata", placeholder: "官方续航或典型使用说明" },
	{
		key: "camera_summary",
		label: "摄像头摘要",
		source: "metadata",
		placeholder: "主摄、超广角、长焦等摘要",
		span: "full",
	},
	{
		key: "rear_camera_detail",
		label: "后置影像",
		source: "metadata",
		placeholder: "主摄、超广角、微距、传感器型号、防抖",
		span: "full",
	},
	{
		key: "rear_main_camera",
		label: "主摄",
		source: "metadata",
		placeholder: "像素、传感器、光圈、OIS",
		span: "full",
	},
	{
		key: "rear_ultrawide_camera",
		label: "超广角",
		source: "metadata",
		placeholder: "像素、视角、光圈",
		span: "full",
	},
	{
		key: "rear_macro_camera",
		label: "微距",
		source: "metadata",
		placeholder: "像素、最近对焦距离",
		span: "full",
	},
	{
		key: "rear_telephoto_camera",
		label: "长焦",
		source: "metadata",
		placeholder: "像素、倍率、防抖",
		span: "full",
	},
	{
		key: "front_camera_detail",
		label: "前置影像",
		source: "metadata",
		placeholder: "前置摄像头像素、传感器、对焦方式",
		span: "full",
	},
	{ key: "video_recording", label: "视频规格", source: "metadata", placeholder: "4K 60fps / 1080p" },
	{ key: "image_stabilization", label: "防抖 / 对焦", source: "metadata", placeholder: "OIS / EIS / PDAF" },
	{ key: "mobile_network", label: "蜂窝网络", source: "metadata", placeholder: "5G / 4G LTE / Wi-Fi only" },
	{ key: "sim_detail", label: "SIM / 卡槽", source: "metadata", placeholder: "Nano-SIM / 双卡" },
	{ key: "wifi_standard", label: "无线标准", source: "metadata", placeholder: "Wi-Fi 6 / 蓝牙 5.3" },
	{ key: "bluetooth_version", label: "蓝牙版本", source: "metadata", placeholder: "Bluetooth 5.3" },
	{ key: "positioning", label: "定位系统", source: "metadata", placeholder: "GPS / 北斗 / GLONASS / Galileo" },
	{ key: "usb_detail", label: "USB / 接口", source: "metadata", placeholder: "USB-C" },
	{ key: "nfc", label: "NFC", source: "metadata", placeholder: "支持 / 不支持" },
	{ key: "infrared", label: "红外", source: "metadata", placeholder: "支持 / 不支持" },
	{ key: "dimensions", label: "机身尺寸", source: "metadata", placeholder: "163.1 x 76.2 x 8.5 mm" },
	{ key: "weight", label: "重量", source: "metadata", placeholder: "201 g" },
	{ key: "body_material", label: "机身材质", source: "metadata", placeholder: "玻璃 / 金属 / 塑料" },
	{ key: "colors_available", label: "官方配色", source: "metadata", placeholder: "黑 / 银 / 蓝 / 绿" },
	{ key: "water_resistance", label: "防尘防水", source: "metadata", placeholder: "IP53 / IP68 / 未标注" },
	{ key: "speaker_detail", label: "扬声器 / 音频", source: "metadata", placeholder: "立体声双扬声器 / Hi-Res" },
	{ key: "audio_detail", label: "音频详情", source: "metadata", placeholder: "Hi-Res / Dolby Atmos / 编解码" },
	{ key: "biometrics", label: "生物识别", source: "metadata", placeholder: "侧边指纹 / 面容 / 屏下指纹" },
	{ key: "sensor_detail", label: "传感器", source: "metadata", placeholder: "指纹、陀螺仪、距离、光线等" },
	{ key: "cooling_system", label: "散热", source: "metadata", placeholder: "VC 液冷 / 石墨 / 均热板" },
	{
		key: "official_image_url",
		label: "官方图片",
		source: "metadata",
		type: "url",
		placeholder: "厂商官方设备图 URL",
	},
	{
		key: "online_specs_summary",
		label: "资料规格摘要",
		source: "metadata",
		placeholder: "由资料补全报告确认写入的规格摘要",
		span: "full",
	},
	{ key: "account_note", label: "账号 / 平台备注", source: "metadata", placeholder: "Apple ID / Steam / 米家账号备注" },
	{ key: "power_mode", label: "供电方式", source: "metadata", placeholder: "电池 / AC / USB-C" },
]

const personalDeviceFieldKeysByType: Partial<Record<AssetType, readonly string[]>> = {
	phone: personalDeviceFields.map((field) => field.key),
	tablet: [
		"cpu_model",
		"cpu_vendor",
		"cpu_process",
		"cpu_architecture",
		"cpu_cores",
		"cpu_frequency",
		"gpu_model",
		"gpu_detail",
		"memory_gb",
		"memory_detail",
		"memory_type",
		"storage_gb",
		"storage_detail",
		"storage_options",
		"screen_size",
		"display_type",
		"display_resolution",
		"screen_refresh_rate",
		"touch_sampling_rate",
		"display_brightness",
		"display_color_depth",
		"hdr_support",
		"display_protection",
		"battery_capacity_mah",
		"battery_type",
		"charging_power_w",
		"wireless_charging",
		"battery_life_note",
		"camera_summary",
		"rear_camera_detail",
		"front_camera_detail",
		"video_recording",
		"image_stabilization",
		"mobile_network",
		"sim_detail",
		"wifi_standard",
		"bluetooth_version",
		"positioning",
		"usb_detail",
		"nfc",
		"dimensions",
		"weight",
		"body_material",
		"colors_available",
		"water_resistance",
		"speaker_detail",
		"audio_detail",
		"biometrics",
		"sensor_detail",
		"official_image_url",
		"account_note",
		"power_mode",
	],
	wearable: [
		"cpu_model",
		"cpu_vendor",
		"memory_gb",
		"memory_detail",
		"storage_gb",
		"storage_detail",
		"screen_size",
		"display_type",
		"display_resolution",
		"display_brightness",
		"battery_capacity_mah",
		"battery_type",
		"battery_life_note",
		"wifi_standard",
		"bluetooth_version",
		"positioning",
		"dimensions",
		"weight",
		"body_material",
		"colors_available",
		"water_resistance",
		"speaker_detail",
		"audio_detail",
		"biometrics",
		"sensor_detail",
		"official_image_url",
		"account_note",
		"power_mode",
	],
	ebook: [
		"cpu_model",
		"memory_gb",
		"storage_gb",
		"storage_detail",
		"storage_options",
		"screen_size",
		"display_type",
		"display_resolution",
		"display_brightness",
		"display_color_depth",
		"display_protection",
		"battery_capacity_mah",
		"battery_life_note",
		"wifi_standard",
		"bluetooth_version",
		"usb_detail",
		"dimensions",
		"weight",
		"body_material",
		"colors_available",
		"water_resistance",
		"official_image_url",
		"power_mode",
	],
	game_console: [
		"cpu_model",
		"cpu_vendor",
		"cpu_architecture",
		"gpu_model",
		"gpu_detail",
		"memory_gb",
		"memory_detail",
		"storage_gb",
		"storage_detail",
		"storage_options",
		"display_resolution",
		"screen_refresh_rate",
		"hdr_support",
		"wifi_standard",
		"bluetooth_version",
		"usb_detail",
		"speaker_detail",
		"audio_detail",
		"dimensions",
		"weight",
		"colors_available",
		"official_image_url",
		"account_note",
		"power_mode",
	],
	handheld: [
		"cpu_model",
		"cpu_vendor",
		"cpu_architecture",
		"gpu_model",
		"gpu_detail",
		"memory_gb",
		"memory_detail",
		"storage_gb",
		"storage_detail",
		"storage_options",
		"screen_size",
		"display_type",
		"display_resolution",
		"screen_refresh_rate",
		"touch_sampling_rate",
		"display_brightness",
		"hdr_support",
		"battery_capacity_mah",
		"battery_life_note",
		"wifi_standard",
		"bluetooth_version",
		"usb_detail",
		"speaker_detail",
		"audio_detail",
		"dimensions",
		"weight",
		"colors_available",
		"official_image_url",
		"account_note",
		"power_mode",
	],
	tv: [
		"screen_size",
		"display_type",
		"display_resolution",
		"screen_refresh_rate",
		"display_brightness",
		"display_color_depth",
		"hdr_support",
		"display_protection",
		"wifi_standard",
		"bluetooth_version",
		"usb_detail",
		"speaker_detail",
		"audio_detail",
		"dimensions",
		"weight",
		"body_material",
		"colors_available",
		"official_image_url",
		"account_note",
		"power_mode",
	],
	speaker: [
		"wifi_standard",
		"bluetooth_version",
		"usb_detail",
		"speaker_detail",
		"audio_detail",
		"dimensions",
		"weight",
		"body_material",
		"colors_available",
		"official_image_url",
		"account_note",
		"power_mode",
	],
}

function getPersonalDeviceFields(type: AssetType): AssetFieldDefinition[] {
	const keys = new Set(personalDeviceFieldKeysByType[type] ?? personalDeviceFields.map((field) => field.key))
	const fields = personalDeviceFields.filter((field) => keys.has(field.key))
	if (!isPhoneVariantSpecRequired(type)) {
		return fields
	}
	return fields.map((field) => {
		if (field.key !== "memory_gb" && field.key !== "storage_gb") {
			return field
		}
		return {
			...field,
			required: true,
			capture: "manual",
		}
	})
}

const cameraFields: AssetFieldDefinition[] = [
	{ key: "connection_type", label: "连接方式", source: "metadata", type: "select", options: connectionOptions },
	{ key: "protocol", label: "协议", source: "metadata", placeholder: "RTSP / ONVIF / 私有协议" },
	{ key: "sensor_size", label: "传感器尺寸", source: "metadata", placeholder: "1/2.8 英寸 / 1/1.8 英寸" },
	{ key: "lens_spec", label: "镜头规格", source: "metadata", placeholder: "4 mm / F1.6 / 定焦或变焦" },
	{ key: "resolution", label: "分辨率", source: "metadata", placeholder: "2K / 4K / 1080p" },
	{ key: "field_of_view", label: "视场角", source: "metadata", placeholder: "水平 110 度" },
	{ key: "night_vision", label: "夜视能力", source: "metadata", placeholder: "红外 / 全彩 / 补光灯距离" },
	{ key: "video_codec", label: "视频编码", source: "metadata", placeholder: "H.265 / H.264" },
	{ key: "weather_rating", label: "防护等级", source: "metadata", placeholder: "IP66 / 室内" },
	{ key: "stream_url", label: "流地址", source: "metadata", type: "url", placeholder: "rtsp://..." },
	{ key: "power_mode", label: "供电方式", source: "metadata", placeholder: "PoE / USB / AC / 电池" },
	{ key: "storage_target", label: "录像归属", source: "metadata", placeholder: "NVR / NAS / SD 卡" },
]

const printerFields: AssetFieldDefinition[] = [
	{ key: "connection_type", label: "连接方式", source: "metadata", type: "select", options: connectionOptions },
	{ key: "printer_type", label: "类型", source: "metadata", placeholder: "激光 / 喷墨 / 热敏 / 扫描一体机" },
	{ key: "color_mode", label: "彩色能力", source: "metadata", placeholder: "黑白 / 彩色" },
	{ key: "print_speed_ppm", label: "打印速度 PPM", source: "metadata", type: "number", placeholder: "30" },
	{ key: "print_resolution", label: "打印分辨率", source: "metadata", placeholder: "1200 x 1200 dpi" },
	{ key: "scan_resolution", label: "扫描分辨率", source: "metadata", placeholder: "可选，适用于一体机" },
	{ key: "supplies", label: "耗材", source: "metadata", placeholder: "硒鼓型号 / 墨盒型号" },
	{ key: "paper_size", label: "纸张规格", source: "metadata", placeholder: "A4 / A3 / 标签纸" },
	{ key: "duplex", label: "双面", source: "metadata", type: "select", options: yesNoOptions },
	{ key: "management_url", label: "管理 URL", source: "metadata", type: "url", placeholder: "http://192.168.1.50" },
]

const upsFields: AssetFieldDefinition[] = [
	{ key: "capacity_va", label: "容量 VA", source: "metadata", type: "number", placeholder: "1500" },
	{ key: "capacity_w", label: "容量 W", source: "metadata", type: "number", placeholder: "900" },
	{ key: "topology", label: "拓扑类型", source: "metadata", placeholder: "后备式 / 在线互动式 / 在线式" },
	{ key: "waveform", label: "输出波形", source: "metadata", placeholder: "正弦波 / 近似正弦波" },
	{ key: "transfer_time_ms", label: "切换时间 ms", source: "metadata", type: "number", placeholder: "10" },
	{ key: "battery_model", label: "电池型号", source: "metadata", placeholder: "12V 9Ah x2" },
	{ key: "battery_count", label: "电池数量", source: "metadata", type: "number", placeholder: "2" },
	{ key: "outlet_count", label: "输出口数量", source: "metadata", type: "number", placeholder: "6" },
	{ key: "protocol", label: "监控协议", source: "metadata", placeholder: "USB / NUT / SNMP / 无" },
	{
		key: "protected_assets",
		label: "保护设备",
		source: "metadata",
		placeholder: "NAS / 路由器 / 交换机",
		span: "full",
	},
]

const smartHomeCommonFields: AssetFieldDefinition[] = [
	{ key: "smart_category", label: "家居分类", source: "metadata", placeholder: "灯 / 插座 / 门锁 / 传感器 / 网关" },
	{ key: "protocol", label: "协议", source: "metadata", placeholder: "Matter / Zigbee / BLE / Wi-Fi / 米家" },
	{ key: "gateway_name", label: "所属网关", source: "metadata", placeholder: "客厅网关 / Home Assistant" },
	{ key: "entity_id", label: "实体 ID", source: "metadata", placeholder: "light.living_room / sensor.xxx" },
	{ key: "room", label: "房间", source: "metadata", placeholder: "客厅 / 书房 / 卧室" },
	{ key: "power_mode", label: "供电方式", source: "metadata", placeholder: "电池 / 零火 / 单火 / AC / USB" },
	{ key: "battery_type", label: "电池型号", source: "metadata", placeholder: "CR2032 / 5 号 / 内置锂电" },
	{
		key: "automation_note",
		label: "自动化备注",
		source: "metadata",
		placeholder: "关联场景、规则或注意事项",
		span: "full",
	},
]

const smartHomeSpecificFields: Partial<Record<AssetType, AssetFieldDefinition[]>> = {
	smarthome_gateway: [
		{ key: "controller_platform", label: "控制平台", source: "metadata", placeholder: "Home Assistant / 米家 / Aqara" },
		{ key: "radio_protocols", label: "无线协议", source: "metadata", placeholder: "Zigbee / Thread / BLE" },
		{ key: "max_device_count", label: "最大接入数", source: "metadata", type: "number", placeholder: "128" },
	],
	sensor: [
		{ key: "sensor_kind", label: "传感器类型", source: "metadata", placeholder: "温湿度 / 门窗 / 人体 / 水浸" },
		{ key: "measurement_range", label: "测量范围", source: "metadata", placeholder: "0-50 C / 0-100% RH" },
		{ key: "measurement_precision", label: "测量精度", source: "metadata", placeholder: "±0.3 C / ±3% RH" },
		{ key: "reporting_interval", label: "上报间隔", source: "metadata", placeholder: "60 秒 / 事件触发" },
		{ key: "installation_position", label: "安装位置", source: "metadata", placeholder: "窗框 / 天花板 / 水槽下" },
	],
	light: [
		{ key: "light_kind", label: "灯具类型", source: "metadata", placeholder: "灯泡 / 灯带 / 吸顶灯" },
		{ key: "luminous_flux_lm", label: "光通量 lm", source: "metadata", type: "number", placeholder: "800" },
		{ key: "color_temperature_k", label: "色温 K", source: "metadata", placeholder: "2700-6500" },
		{ key: "color_rendering_index", label: "显色指数", source: "metadata", placeholder: "Ra 90" },
		{ key: "color_control", label: "调光 / 调色", source: "metadata", placeholder: "亮度 / RGB / 色温" },
	],
	plug: [
		{ key: "rated_power_w", label: "额定功率 W", source: "metadata", type: "number", placeholder: "2500" },
		{ key: "rated_current_a", label: "额定电流 A", source: "metadata", type: "number", placeholder: "10" },
		{ key: "outlet_count", label: "插孔 / 回路数", source: "metadata", type: "number", placeholder: "1" },
		{ key: "energy_monitoring", label: "电量统计", source: "metadata", type: "select", options: yesNoOptions },
		{ key: "neutral_wire", label: "零线要求", source: "metadata", placeholder: "需要零线 / 单火线 / 不适用" },
	],
	lock: [
		{ key: "unlock_methods", label: "开锁方式", source: "metadata", placeholder: "指纹 / 密码 / NFC / 钥匙" },
		{ key: "lock_body", label: "锁体类型", source: "metadata", placeholder: "全自动 / 半自动 / 霸王锁体" },
		{ key: "door_thickness", label: "适配门厚", source: "metadata", placeholder: "40-120 mm" },
		{ key: "emergency_power", label: "应急供电", source: "metadata", placeholder: "USB-C / 机械钥匙" },
	],
	vacuum: [
		{ key: "suction_pa", label: "吸力 Pa", source: "metadata", type: "number", placeholder: "7000" },
		{ key: "navigation", label: "导航避障", source: "metadata", placeholder: "激光 LDS / 结构光 / 视觉" },
		{ key: "dust_box_ml", label: "尘盒容量 ml", source: "metadata", type: "number", placeholder: "400" },
		{ key: "water_tank_ml", label: "水箱容量 ml", source: "metadata", type: "number", placeholder: "300" },
		{ key: "station_features", label: "基站能力", source: "metadata", placeholder: "集尘 / 洗拖布 / 烘干 / 上下水" },
	],
	iot: [
		{ key: "iot_capability", label: "设备能力", source: "metadata", placeholder: "继电器 / 红外 / 显示 / 控制器" },
		{
			key: "controller_platform",
			label: "控制平台",
			source: "metadata",
			placeholder: "Home Assistant / 米家 / 自定义",
		},
		{ key: "firmware_channel", label: "固件通道", source: "metadata", placeholder: "稳定版 / 开发版" },
	],
}

function getSmartHomeFields(type: AssetType) {
	return [...smartHomeCommonFields, ...(smartHomeSpecificFields[type] ?? [])]
}

const webEndpointFields: AssetFieldDefinition[] = [
	{
		key: "service_category",
		label: "服务类型",
		source: "metadata",
		type: "select",
		options: [
			{ value: "website", label: "网站 / 门户" },
			{ value: "api", label: "API 服务" },
			{ value: "relay", label: "中转站 / 反向代理" },
			{ value: "webhook", label: "Webhook" },
			{ value: "admin", label: "管理后台" },
			{ value: "other", label: "其他 HTTP(S) 服务" },
		],
	},
	{ key: "url", label: "主访问 URL", source: "metadata", type: "url", placeholder: "https://service.example.com" },
	{
		key: "internal_url",
		label: "内网检测 URL",
		source: "metadata",
		type: "url",
		placeholder: "http://192.168.1.10:8080",
	},
	{
		key: "external_url",
		label: "外网检测 URL",
		source: "metadata",
		type: "url",
		placeholder: "https://service.example.com",
	},
	{
		key: "endpoint_scope",
		label: "检测范围",
		source: "metadata",
		type: "select",
		options: [
			{ value: "内网", label: "仅内网" },
			{ value: "外网", label: "仅外网" },
			{ value: "内外网", label: "内网 + 外网" },
		],
	},
	{ key: "expected_owner", label: "承载 / 归属资产", source: "metadata", placeholder: "例如 运行在 NAS 上" },
]

const customFields: AssetFieldDefinition[] = [
	{ key: "custom_category", label: "自定义分类", source: "metadata", placeholder: "例如 UPS / KVM / 采集器" },
	{ key: "fixed_ipv4", label: "IPv4", source: "metadata", placeholder: "可选" },
	{ key: "fixed_ipv6", label: "IPv6", source: "metadata", placeholder: "可选" },
	{ key: "mac", label: "MAC", source: "metadata", placeholder: "可选" },
]

export function getAssetFormSections(type: AssetType): AssetFieldSection[] {
	if (type === "internet") {
		return internetSections
	}
	if (type === "ont") {
		return ontSections
	}
	if (NETWORK_ASSET_TYPES.includes(type)) {
		return [
			{ title: "基础身份", fields: commonIdentityFields },
			{ title: "硬件识别", fields: getHardwareIdentityFields(type) },
			{ title: "网络参数", fields: getNetworkDeviceFields(type) },
			{ title: "购买信息", fields: purchaseInfoFields },
			{ title: "备注", fields: [{ key: "notes", label: "备注", source: "asset", span: "full" }] },
		]
	}
	if (HOST_ASSET_TYPES.includes(type)) {
		const typeSpecificFields = getHostTypeSpecificFields(type)
		return [
			{ title: "基础身份", fields: commonIdentityFields },
			{ title: "硬件识别", fields: getHardwareIdentityFields(type) },
			{ title: "接入信息", fields: agentConnectionFields },
			{ title: "Agent 可采集规格", fields: hostSpecFields },
			{ title: "硬件细节", fields: hostHardwareDetailFields },
			...(typeSpecificFields.length ? [{ title: getHostTypeSpecificTitle(type), fields: typeSpecificFields }] : []),
			{ title: "购买信息", fields: purchaseInfoFields },
			{ title: "备注", fields: [{ key: "notes", label: "备注", source: "asset", span: "full" }] },
		]
	}
	if (type === "vm") {
		const vmCollectableFields = vmFields.map((field) => ({
			...field,
			capture: "agent_collectable",
		})) satisfies AssetFieldDefinition[]
		return [
			{ title: "基础身份", fields: commonIdentityFields },
			{ title: "接入信息", fields: agentConnectionFields },
			{ title: "Agent 可采集虚拟化参数", fields: vmCollectableFields },
			{ title: "购买信息", fields: purchaseInfoFields },
			{ title: "备注", fields: [{ key: "notes", label: "备注", source: "asset", span: "full" }] },
		]
	}
	if (PERSONAL_ASSET_TYPES.includes(type)) {
		return [
			{ title: "基础身份", fields: commonIdentityFields },
			{ title: "硬件识别", fields: getHardwareIdentityFields(type) },
			{ title: "固定地址", fields: fixedAddressFields },
			{ title: "设备参数", fields: getPersonalDeviceFields(type) },
			{ title: "购买信息", fields: purchaseInfoFields },
			{ title: "备注", fields: [{ key: "notes", label: "备注", source: "asset", span: "full" }] },
		]
	}
	if (type === "camera") {
		return [
			{ title: "基础身份", fields: commonIdentityFields },
			{ title: "硬件识别", fields: getHardwareIdentityFields(type) },
			{ title: "固定地址", fields: fixedAddressFields },
			{ title: "摄像头参数", fields: cameraFields },
			{ title: "购买信息", fields: purchaseInfoFields },
			{ title: "备注", fields: [{ key: "notes", label: "备注", source: "asset", span: "full" }] },
		]
	}
	if (type === "printer") {
		return [
			{ title: "基础身份", fields: commonIdentityFields },
			{ title: "硬件识别", fields: getHardwareIdentityFields(type) },
			{ title: "固定地址", fields: fixedAddressFields },
			{ title: "打印参数", fields: printerFields },
			{ title: "购买信息", fields: purchaseInfoFields },
			{ title: "备注", fields: [{ key: "notes", label: "备注", source: "asset", span: "full" }] },
		]
	}
	if (type === "ups") {
		return [
			{ title: "基础身份", fields: commonIdentityFields },
			{ title: "硬件识别", fields: getHardwareIdentityFields(type) },
			{ title: "固定地址", fields: fixedAddressFields },
			{ title: "电源参数", fields: upsFields },
			{ title: "购买信息", fields: purchaseInfoFields },
			{ title: "备注", fields: [{ key: "notes", label: "备注", source: "asset", span: "full" }] },
		]
	}
	if (SMART_HOME_ASSET_TYPES.includes(type)) {
		return [
			{ title: "基础身份", fields: commonIdentityFields },
			{ title: "硬件识别", fields: getHardwareIdentityFields(type) },
			{ title: "固定地址", fields: fixedAddressFields },
			{ title: "智能家居参数", fields: getSmartHomeFields(type) },
			{ title: "购买信息", fields: purchaseInfoFields },
			{ title: "备注", fields: [{ key: "notes", label: "备注", source: "asset", span: "full" }] },
		]
	}
	if (type === "web_endpoint") {
		return [
			{ title: "基础身份", fields: commonIdentityFields },
			{ title: "互联网服务监控", fields: webEndpointFields },
			{ title: "订阅与续费", fields: serviceSubscriptionFields },
			{ title: "备注", fields: [{ key: "notes", label: "备注", source: "asset", span: "full" }] },
		]
	}
	return [
		{ title: "基础身份", fields: commonIdentityFields },
		{ title: "硬件识别", fields: getHardwareIdentityFields(type) },
		{ title: "自定义参数", fields: customFields },
		{ title: "购买信息", fields: purchaseInfoFields },
		{ title: "备注", fields: [{ key: "notes", label: "备注", source: "asset", span: "full" }] },
	]
}

export function getAssetTypeLabel(type: AssetType) {
	return getAssetProfile(type)?.label ?? type
}

export function isFixedSpecAssetType(type: AssetType) {
	return FIXED_SPEC_ASSET_TYPES.includes(type)
}

export function isInternetResourceAssetType(type: AssetType) {
	return type === "internet"
}

export function buildInternetResourceName(vendor: string) {
	const normalizedVendor = normalizeInternetProvider(vendor)
	return normalizedVendor ? `${normalizedVendor}宽带` : ""
}

export function isPhoneVariantSpecRequired(type: AssetType) {
	return type === "phone"
}

export function buildFixedSpecAssetName(type: AssetType, model: string, internalModel?: string) {
	const modelName = model.trim()
	const internal = type === "phone" ? (internalModel?.trim() ?? "") : ""
	if (!isFixedSpecAssetType(type) || !modelName) {
		return ""
	}
	if (!internal || modelName.includes(`(${internal})`) || modelName.includes(`（${internal}）`)) {
		return modelName
	}
	return `${modelName} (${internal})`
}

export function getStatusLabel(status: AssetStatus) {
	return STATUS_OPTIONS.find((item) => item.value === status)?.label ?? status
}

export function getMetadataString(metadata: Record<string, unknown> | undefined, key: string) {
	const value = metadata?.[key]
	if (typeof value === "string") return value
	if (typeof value === "number" && Number.isFinite(value)) return String(value)
	return ""
}

export function getMetadataNumber(metadata: Record<string, unknown> | undefined, key: string) {
	const value = metadata?.[key]
	if (typeof value === "number" && Number.isFinite(value)) return value
	if (typeof value === "string") {
		const parsed = Number(value)
		return Number.isFinite(parsed) ? parsed : undefined
	}
	return undefined
}
