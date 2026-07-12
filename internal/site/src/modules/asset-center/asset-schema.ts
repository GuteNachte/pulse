import type { AssetStatus, AssetType } from "@/types"
import { getAssetProfile, getCreatableAssetTypeOptions } from "./asset-profiles.ts"

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
	{
		key: "internal_model",
		label: "内部型号",
		source: "metadata",
		placeholder: "例如 22021211RC / 产品内部代号",
		capture: "manual",
	},
	{ key: "serial_number", label: "序列号", source: "asset", placeholder: "可选，保修和盘点用" },
	{
		key: "support_url",
		label: "厂家官方支持页",
		source: "metadata",
		type: "url",
		placeholder: "该型号支持 / 下载 / 保修页面 URL，不填厂家首页",
		capture: "manual",
	},
	{
		key: "product_url",
		label: "厂家官方产品页",
		source: "metadata",
		type: "url",
		placeholder: "该型号官网产品 / 规格页面 URL",
		capture: "manual",
	},
	{
		key: "official_url",
		label: "厂家官网资料页",
		source: "metadata",
		type: "url",
		placeholder: "官网资料、说明书或品牌资料页面 URL",
		capture: "manual",
	},
	{ key: "asset_tag", label: "资产编号", source: "metadata", placeholder: "自定义编号，可选" },
]

const lifecycleFields: AssetFieldDefinition[] = [
	{ key: "purchase_date", label: "购买日期", source: "metadata", type: "date" },
	{ key: "online_date", label: "上线日期", source: "metadata", type: "date" },
	{ key: "warranty_until", label: "保修到期", source: "metadata", type: "date" },
	{ key: "owner", label: "归属 / 责任人", source: "metadata", placeholder: "可选" },
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
		key: "cpu_support_url",
		label: "CPU 官方支持页",
		source: "metadata",
		type: "url",
		placeholder: "CPU 厂商官方规格 / 支持页面",
		capture: "future_collectable",
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
		label: "存储摘要",
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
	{
		key: "planned_agent",
		label: "计划接入 Agent",
		source: "metadata",
		type: "select",
		options: yesNoOptions,
		capture: "manual",
	},
]

const hostHardwareDetailFields: AssetFieldDefinition[] = [
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
		key: "motherboard_support_url",
		label: "主板支持页",
		source: "metadata",
		type: "url",
		placeholder: "主板型号对应的官网支持 / BIOS / 驱动页",
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
		key: "gpu_support_url",
		label: "显卡支持页",
		source: "metadata",
		type: "url",
		placeholder: "板卡厂商官网支持 / 驱动页",
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
		label: "内存品牌 / 规格",
		source: "metadata",
		placeholder: "例如 Kingston DDR5 32GBx2 6000",
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
		key: "memory_model",
		label: "内存型号 / 颗粒",
		source: "metadata",
		placeholder: "Part Number / 颗粒备注",
		capture: "future_collectable",
	},
	{
		key: "memory_type",
		label: "内存类型",
		source: "metadata",
		placeholder: "DDR4 / DDR5 / LPDDR5",
		capture: "future_collectable",
	},
	{
		key: "memory_speed_mhz",
		label: "内存频率 MHz",
		source: "metadata",
		type: "number",
		placeholder: "6000",
		capture: "future_collectable",
	},
	{
		key: "memory_slots_summary",
		label: "内存插槽摘要",
		source: "metadata",
		placeholder: "2/4 槽，32GB x2",
		capture: "future_collectable",
	},
	{
		key: "memory_support_url",
		label: "内存支持页",
		source: "metadata",
		type: "url",
		placeholder: "内存厂商官方支持 / 规格 / 保修页",
		capture: "future_collectable",
	},
	{
		key: "storage_detail",
		label: "硬盘品牌 / 型号",
		source: "metadata",
		placeholder: "例如 Samsung 990 Pro 2TB / WD Red 8TB",
		capture: "future_collectable",
		span: "full",
	},
	{
		key: "storage_vendor",
		label: "主存储品牌",
		source: "metadata",
		placeholder: "Samsung / WD / Seagate / Crucial",
		capture: "future_collectable",
	},
	{
		key: "storage_model",
		label: "主存储型号",
		source: "metadata",
		placeholder: "例如 990 Pro / SN850X / IronWolf",
		capture: "future_collectable",
	},
	{
		key: "storage_media",
		label: "存储介质 / 总线",
		source: "metadata",
		placeholder: "NVMe SSD / SATA SSD / HDD",
		capture: "future_collectable",
	},
	{
		key: "storage_serial_note",
		label: "硬盘序列号备注",
		source: "metadata",
		placeholder: "多盘可写摘要，详细盘建议后续独立资产化",
		capture: "future_collectable",
		span: "full",
	},
	{
		key: "storage_support_url",
		label: "存储支持页",
		source: "metadata",
		type: "url",
		placeholder: "硬盘 / SSD 厂商支持、固件或保修页",
		capture: "future_collectable",
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
		key: "nic_support_url",
		label: "网卡驱动 / 支持页",
		source: "metadata",
		type: "url",
		placeholder: "网卡芯片或整卡官网驱动 / 支持页",
		capture: "future_collectable",
	},
	{
		key: "wifi_support_url",
		label: "无线网卡驱动 / 支持页",
		source: "metadata",
		type: "url",
		placeholder: "无线网卡芯片或整卡官网驱动 / 支持页",
		capture: "future_collectable",
	},
	{
		key: "chassis_power_detail",
		label: "机箱 / 电源",
		source: "metadata",
		placeholder: "例如 机箱型号、电源品牌和功率",
		capture: "manual",
	},
	{
		key: "chassis_vendor",
		label: "机箱品牌",
		source: "metadata",
		placeholder: "可选",
		capture: "manual",
	},
	{
		key: "chassis_model",
		label: "机箱型号",
		source: "metadata",
		placeholder: "可选",
		capture: "manual",
	},
	{
		key: "chassis_support_url",
		label: "机箱支持页",
		source: "metadata",
		type: "url",
		placeholder: "机箱厂商官方产品 / 支持页",
		capture: "manual",
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
	{
		key: "psu_support_url",
		label: "电源支持页",
		source: "metadata",
		type: "url",
		placeholder: "电源厂商官方产品 / 支持 / 保修页",
		capture: "manual",
	},
	{
		key: "hardware_fingerprint_note",
		label: "专项识别依据",
		source: "metadata",
		placeholder: "DMI / PCI / USB / SMART 硬件 ID 摘要，后续专项 Agent 可采集匹配",
		capture: "future_collectable",
		span: "full",
	},
	{
		key: "hardware_match_note",
		label: "专项识别匹配备注",
		source: "metadata",
		placeholder: "记录已确认的型号匹配、资料来源和不能自动覆盖的原因",
		capture: "future_collectable",
		span: "full",
	},
]

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
		"ssid_note",
		"vlan_note",
	],
	gateway: ["fixed_ipv4", "fixed_ipv6", "mac", "port_count", "default_port_speed_mbps", "power_mode", "vlan_note"],
	ont: ["fixed_ipv4", "fixed_ipv6", "mac", "port_count", "default_port_speed_mbps", "power_mode"],
	switch: ["fixed_ipv4", "fixed_ipv6", "mac", "port_count", "default_port_speed_mbps", "power_mode", "vlan_note"],
	ap: [
		"fixed_ipv4",
		"fixed_ipv6",
		"mac",
		"port_count",
		"default_port_speed_mbps",
		"power_mode",
		"wifi_standard",
		"ssid_note",
		"vlan_note",
	],
	firewall: ["fixed_ipv4", "fixed_ipv6", "mac", "port_count", "default_port_speed_mbps", "power_mode", "vlan_note"],
}

function getNetworkDeviceFields(type: AssetType) {
	const keys = new Set(networkDeviceFieldKeysByType[type] ?? networkDeviceFields.map((field) => field.key))
	return networkDeviceFields.filter((field) => keys.has(field.key))
}

const internetFields: AssetFieldDefinition[] = [
	{ key: "vendor", label: "运营商", source: "asset", placeholder: "联通 / 电信 / 移动" },
	{ key: "model", label: "套餐 / 线路名称", source: "asset", placeholder: "千兆宽带 / 第二宽带" },
	{ key: "line_id", label: "线路编号 / 备注", source: "metadata", placeholder: "可选，不存敏感密码" },
	{ key: "access_mode", label: "接入方式", source: "metadata", placeholder: "桥接 / 路由 / PPPoE / DHCP / 静态 IPv4" },
	{ key: "down_mbps", label: "下行 Mbps", source: "metadata", type: "number", placeholder: "1000" },
	{ key: "up_mbps", label: "上行 Mbps", source: "metadata", type: "number", placeholder: "100" },
	{ key: "public_ipv4", label: "公网 IPv4", source: "metadata", placeholder: "可选" },
	{ key: "public_ipv6", label: "公网 IPv6 前缀", source: "metadata", placeholder: "可选" },
	{ key: "has_public_ip", label: "有公网地址", source: "metadata", type: "select", options: yesNoOptions },
	{ key: "install_location", label: "入户位置", source: "metadata", placeholder: "弱电箱 / 客厅" },
]

const vmFields: AssetFieldDefinition[] = [
	{ key: "virtualization_platform", label: "虚拟化平台", source: "metadata", placeholder: "PVE / Hyper-V / Docker VM" },
	{ key: "vcpu", label: "vCPU", source: "metadata", type: "number", placeholder: "4" },
	{ key: "memory_gb", label: "内存 GB", source: "metadata", type: "number", placeholder: "8" },
	{ key: "disk_gb", label: "磁盘 GB", source: "metadata", type: "number", placeholder: "128" },
	{
		key: "planned_agent",
		label: "计划接入 Agent",
		source: "metadata",
		type: "select",
		options: yesNoOptions,
	},
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
	{ key: "resolution", label: "分辨率", source: "metadata", placeholder: "2K / 4K / 1080p" },
	{ key: "stream_url", label: "流地址", source: "metadata", type: "url", placeholder: "rtsp://..." },
	{ key: "power_mode", label: "供电方式", source: "metadata", placeholder: "PoE / USB / AC / 电池" },
	{ key: "storage_target", label: "录像归属", source: "metadata", placeholder: "NVR / NAS / SD 卡" },
]

const printerFields: AssetFieldDefinition[] = [
	{ key: "connection_type", label: "连接方式", source: "metadata", type: "select", options: connectionOptions },
	{ key: "printer_type", label: "类型", source: "metadata", placeholder: "激光 / 喷墨 / 热敏 / 扫描一体机" },
	{ key: "supplies", label: "耗材", source: "metadata", placeholder: "硒鼓型号 / 墨盒型号" },
	{ key: "paper_size", label: "纸张规格", source: "metadata", placeholder: "A4 / A3 / 标签纸" },
	{ key: "duplex", label: "双面", source: "metadata", type: "select", options: yesNoOptions },
	{ key: "management_url", label: "管理 URL", source: "metadata", type: "url", placeholder: "http://192.168.1.50" },
]

const upsFields: AssetFieldDefinition[] = [
	{ key: "capacity_va", label: "容量 VA", source: "metadata", type: "number", placeholder: "1500" },
	{ key: "capacity_w", label: "容量 W", source: "metadata", type: "number", placeholder: "900" },
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

const smartHomeFields: AssetFieldDefinition[] = [
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

const webEndpointFields: AssetFieldDefinition[] = [
	{ key: "url", label: "默认 URL", source: "metadata", type: "url", placeholder: "https://example.com" },
	{ key: "internal_url", label: "内网 URL", source: "metadata", type: "url", placeholder: "http://192.168.1.10:8080" },
	{
		key: "external_url",
		label: "外网 URL",
		source: "metadata",
		type: "url",
		placeholder: "https://service.example.com",
	},
	{ key: "endpoint_scope", label: "端点类型", source: "metadata", placeholder: "内网 / 外网 / 双栈 / 管理后台" },
	{ key: "expected_owner", label: "归属资产备注", source: "metadata", placeholder: "例如 运行在 NAS 上" },
]

const customFields: AssetFieldDefinition[] = [
	{ key: "custom_category", label: "自定义分类", source: "metadata", placeholder: "例如 UPS / KVM / 采集器" },
	{ key: "fixed_ipv4", label: "IPv4", source: "metadata", placeholder: "可选" },
	{ key: "fixed_ipv6", label: "IPv6", source: "metadata", placeholder: "可选" },
	{ key: "mac", label: "MAC", source: "metadata", placeholder: "可选" },
]

export function getAssetFormSections(type: AssetType): AssetFieldSection[] {
	if (type === "internet") {
		return [
			{ title: "基础身份", fields: commonIdentityFields },
			{ title: "宽带线路", fields: internetFields },
			{ title: "生命周期", fields: lifecycleFields },
			{ title: "备注", fields: [{ key: "notes", label: "备注", source: "asset", span: "full" }] },
		]
	}
	if (NETWORK_ASSET_TYPES.includes(type)) {
		return [
			{ title: "基础身份", fields: commonIdentityFields },
			{ title: "硬件识别", fields: hardwareIdentityFields },
			{ title: "网络参数", fields: getNetworkDeviceFields(type) },
			{ title: "生命周期", fields: lifecycleFields },
			{ title: "备注", fields: [{ key: "notes", label: "备注", source: "asset", span: "full" }] },
		]
	}
	if (HOST_ASSET_TYPES.includes(type)) {
		return [
			{ title: "基础身份", fields: commonIdentityFields },
			{ title: "硬件识别", fields: hardwareIdentityFields },
			{ title: "接入信息", fields: agentConnectionFields },
			{ title: "Agent 可采集规格", fields: hostSpecFields },
			{ title: "硬件细节", fields: hostHardwareDetailFields },
			{ title: "生命周期", fields: lifecycleFields },
			{ title: "备注", fields: [{ key: "notes", label: "备注", source: "asset", span: "full" }] },
		]
	}
	if (type === "vm") {
		const vmCollectableFields = vmFields.map((field) => ({
			...field,
			capture: field.key === "planned_agent" ? "manual" : "agent_collectable",
		})) satisfies AssetFieldDefinition[]
		return [
			{ title: "基础身份", fields: commonIdentityFields },
			{ title: "接入信息", fields: agentConnectionFields },
			{ title: "Agent 可采集虚拟化参数", fields: vmCollectableFields },
			{ title: "生命周期", fields: lifecycleFields },
			{ title: "备注", fields: [{ key: "notes", label: "备注", source: "asset", span: "full" }] },
		]
	}
	if (PERSONAL_ASSET_TYPES.includes(type)) {
		return [
			{ title: "基础身份", fields: commonIdentityFields },
			{ title: "硬件识别", fields: hardwareIdentityFields },
			{ title: "固定地址", fields: fixedAddressFields },
			{ title: "设备参数", fields: getPersonalDeviceFields(type) },
			{ title: "生命周期", fields: lifecycleFields },
			{ title: "备注", fields: [{ key: "notes", label: "备注", source: "asset", span: "full" }] },
		]
	}
	if (type === "camera") {
		return [
			{ title: "基础身份", fields: commonIdentityFields },
			{ title: "硬件识别", fields: hardwareIdentityFields },
			{ title: "固定地址", fields: fixedAddressFields },
			{ title: "摄像头参数", fields: cameraFields },
			{ title: "生命周期", fields: lifecycleFields },
			{ title: "备注", fields: [{ key: "notes", label: "备注", source: "asset", span: "full" }] },
		]
	}
	if (type === "printer") {
		return [
			{ title: "基础身份", fields: commonIdentityFields },
			{ title: "硬件识别", fields: hardwareIdentityFields },
			{ title: "固定地址", fields: fixedAddressFields },
			{ title: "打印参数", fields: printerFields },
			{ title: "生命周期", fields: lifecycleFields },
			{ title: "备注", fields: [{ key: "notes", label: "备注", source: "asset", span: "full" }] },
		]
	}
	if (type === "ups") {
		return [
			{ title: "基础身份", fields: commonIdentityFields },
			{ title: "硬件识别", fields: hardwareIdentityFields },
			{ title: "固定地址", fields: fixedAddressFields },
			{ title: "电源参数", fields: upsFields },
			{ title: "生命周期", fields: lifecycleFields },
			{ title: "备注", fields: [{ key: "notes", label: "备注", source: "asset", span: "full" }] },
		]
	}
	if (SMART_HOME_ASSET_TYPES.includes(type)) {
		return [
			{ title: "基础身份", fields: commonIdentityFields },
			{ title: "硬件识别", fields: hardwareIdentityFields },
			{ title: "固定地址", fields: fixedAddressFields },
			{ title: "智能家居参数", fields: smartHomeFields },
			{ title: "生命周期", fields: lifecycleFields },
			{ title: "备注", fields: [{ key: "notes", label: "备注", source: "asset", span: "full" }] },
		]
	}
	if (type === "web_endpoint") {
		return [
			{ title: "基础身份", fields: commonIdentityFields },
			{ title: "网页端点", fields: webEndpointFields },
			{ title: "生命周期", fields: lifecycleFields },
			{ title: "备注", fields: [{ key: "notes", label: "备注", source: "asset", span: "full" }] },
		]
	}
	return [
		{ title: "基础身份", fields: commonIdentityFields },
		{ title: "硬件识别", fields: hardwareIdentityFields },
		{ title: "自定义参数", fields: customFields },
		{ title: "生命周期", fields: lifecycleFields },
		{ title: "备注", fields: [{ key: "notes", label: "备注", source: "asset", span: "full" }] },
	]
}

export function getAssetTypeLabel(type: AssetType) {
	return getAssetProfile(type)?.label ?? type
}

export function isFixedSpecAssetType(type: AssetType) {
	return FIXED_SPEC_ASSET_TYPES.includes(type)
}

export function isPhoneVariantSpecRequired(type: AssetType) {
	return type === "phone"
}

export function buildFixedSpecAssetName(type: AssetType, model: string, internalModel?: string) {
	const modelName = model.trim()
	const internal = internalModel?.trim() ?? ""
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
