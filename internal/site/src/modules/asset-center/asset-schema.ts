import type { AssetStatus, AssetType } from "@/types"
import { getAssetArchiveField, type AssetParameterCategoryId } from "./asset-parameter-registry.ts"
import { getAssetProfile, getCreatableAssetTypeOptions } from "./asset-profiles.ts"
import {
	internetAssetTypeSpec,
	normalizeInternetProvider,
	ontAssetTypeSpec,
	switchAssetTypeSpec,
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
	pattern?: string
	title?: string
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
export const NETWORK_ASSET_TYPES: AssetType[] = ["router", "switch", "ap", "gateway", "ont", "smart_ont", "firewall"]
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
	"smart_switch",
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
	// 2026-10-04 产品决策：位置全部选填（docs/asset-create-flow-redesign.md）
	{ key: "location", label: "位置", source: "asset", placeholder: "例如 家 / 书房 / 电脑桌" },
	{ key: "role", label: "用途 / 角色", source: "asset", placeholder: "例如 主路由 / 游戏主机 / 备份 NAS" },
]

const hardwareIdentityFields: AssetFieldDefinition[] = [
	{ key: "vendor", label: "品牌", source: "asset", placeholder: "例如 Intel / TP-Link / 自组" },
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

// 2026-10-07 资源与服务细分：订阅服务/域名/云主机共用的服务档案字段
const resourceServiceFields: AssetFieldDefinition[] = [
	{ key: "url", label: "服务地址", source: "metadata", type: "url", placeholder: "https://...", capture: "manual" },
	{ key: "region", label: "区域 / 线路", source: "metadata", placeholder: "例如 国区 / 港区 / 国内" },
	{ key: "account", label: "账号", source: "metadata", placeholder: "邮箱或用户名（不含密码）" },
	{
		key: "plan_name",
		label: "套餐 / 档位",
		source: "metadata",
		placeholder: "例如 Premium / 2C4G / 个人版",
	},
]

const fixedAddressFields: AssetFieldDefinition[] = [
	{ key: "fixed_ipv4", label: "IPv4", source: "metadata", placeholder: "192.168.1.10", capture: "manual" },
	{ key: "mac", label: "MAC", source: "metadata", required: true, placeholder: "AA:BB:CC:DD:EE:FF", capture: "manual" },
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
	{ key: "mac", label: "MAC", source: "metadata", required: true, placeholder: "AA:BB:CC:DD:EE:FF", capture: "manual" },
	{
		key: "management_url",
		label: "管理 URL",
		source: "metadata",
		type: "url",
		placeholder: "可选，通常手动维护",
		capture: "manual",
	},
]

// 2026-10-07 计算设备固定 11 组（docs/pc-asset-design.md）：品牌整机与自组装档案级别一致，
// 字段池统一；类型差异只由字段目录（registry）的 assetTypes 控制，渲染时按类型过滤
// 2026-10-12 用户拍板外观组内小分类：机箱 / 形态与颜色 / 尺寸与重量（registry section 承载）；
// 上市日期归设备档案（不入池）
const hostGroupFieldPools: Partial<Record<AssetParameterCategoryId, AssetFieldDefinition[]>> = {
	appearance: [
		{ key: "chassis_vendor", label: "机箱品牌", source: "metadata", placeholder: "例如 Jonsbo / Fractal Design" },
		{ key: "chassis_model", label: "机箱型号", source: "metadata", placeholder: "可选" },
		{ key: "case_form_factor", label: "机箱形态", source: "metadata", placeholder: "ATX 塔式 / ITX / 工作站" },
		{ key: "rack_form_factor", label: "机架规格", source: "metadata", placeholder: "1U / 2U / 塔式" },
		{ key: "form_factor", label: "机身形态", source: "metadata", placeholder: "迷你主机 / NUC / 塔式 / 卧式" },
		{ key: "mount_support", label: "安装方式", source: "metadata", placeholder: "VESA / 桌面 / 机柜托盘" },
		{ key: "device_color", label: "外观颜色", source: "metadata", placeholder: "例如 黑色 / 银色" },
		{
			key: "length_mm",
			label: "长度 mm",
			source: "metadata",
			type: "number",
			placeholder: "例如 180",
			capture: "manual",
		},
		{
			key: "width_mm",
			label: "宽度 mm",
			source: "metadata",
			type: "number",
			placeholder: "例如 180",
			capture: "manual",
		},
		{
			key: "height_mm",
			label: "高度 mm",
			source: "metadata",
			type: "number",
			placeholder: "例如 48",
			capture: "manual",
		},
		{ key: "weight_kg", label: "净重 kg", source: "metadata", type: "number", placeholder: "例如 0.6" },
		{ key: "net_weight_g", label: "净重 g", source: "metadata", type: "number", placeholder: "1250" },
	],
	processor: [
		{
			key: "cpu_vendor",
			label: "CPU 厂商",
			source: "metadata",
			placeholder: "Agent 接入后可采集",
			capture: "agent_collectable",
		},
		{
			key: "cpu_model",
			label: "CPU 型号",
			source: "metadata",
			placeholder: "Agent 接入后可采集",
			capture: "agent_collectable",
		},
		{
			key: "cpu_frequency_ghz",
			label: "CPU 主频 GHz",
			source: "metadata",
			type: "number",
			placeholder: "例如 3.3",
			capture: "agent_collectable",
		},
		{
			key: "cpu_boost_frequency_ghz",
			label: "最高睿频 GHz",
			source: "metadata",
			type: "number",
			placeholder: "例如 4.9",
			capture: "agent_collectable",
		},
		{
			key: "cpu_cores",
			label: "CPU 核心 / 线程",
			source: "metadata",
			placeholder: "例如 8 核 / 16 线程",
			capture: "future_collectable",
		},
		{ key: "cpu_socket_count", label: "CPU 插槽数量", source: "metadata", type: "number", placeholder: "1" },
	],
	memory: [
		{
			key: "memory_gb",
			label: "内存容量 GB",
			source: "metadata",
			type: "number",
			placeholder: "Agent 接入后可采集",
			capture: "agent_collectable",
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
			key: "memory_detail",
			label: "内存规格",
			source: "metadata",
			placeholder: "例如 16 GB x 2",
			capture: "future_collectable",
		},
		{
			key: "memory_channel_count",
			label: "通道数",
			source: "metadata",
			type: "number",
			placeholder: "例如 2",
			capture: "future_collectable",
		},
		{
			key: "max_memory_gb",
			label: "最大容量 GB",
			source: "metadata",
			type: "number",
			placeholder: "例如 64",
			capture: "future_collectable",
		},
		{
			key: "supported_memory_type",
			label: "支持内存类型",
			source: "metadata",
			placeholder: "例如 DDR5，多代同支持写 DDR4 / DDR5",
			capture: "future_collectable",
		},
		{
			key: "supported_memory_speed_mhz",
			label: "支持频率 MHz",
			source: "metadata",
			placeholder: "例如 4800，区间写 4800-6400",
			capture: "agent_collectable",
		},
		{
			key: "memory_form_factor",
			label: "内存条形态",
			source: "metadata",
			type: "select",
			options: [
				{ label: "SO-DIMM（笔记本 / 迷你主机）", value: "SO-DIMM" },
				{ label: "UDIMM（台式机）", value: "UDIMM" },
				{ label: "ECC UDIMM（台式机 ECC）", value: "ECC UDIMM" },
				{ label: "RDIMM（服务器）", value: "RDIMM" },
				{ label: "ECC RDIMM（服务器 ECC）", value: "ECC RDIMM" },
				{ label: "CUDIMM（台式机 DDR5）", value: "CUDIMM" },
				{ label: "CAMM2（笔记本板载替代）", value: "CAMM2" },
				{ label: "LPCAMM2（笔记本板载替代）", value: "LPCAMM2" },
			],
			placeholder: "SO-DIMM / UDIMM / RDIMM",
			capture: "manual",
		},
		{
			key: "memory_slots",
			label: "插槽数",
			source: "metadata",
			type: "number",
			placeholder: "例如 2",
			capture: "agent_collectable",
		},
		// 2026-10-17 用户拍板：内存规范参数增加「是否可扩展」（如 可自行更换 / 扩容）
		{
			key: "memory_upgradable",
			label: "是否可扩展",
			source: "metadata",
			placeholder: "例如 可自行更换 / 扩容",
			capture: "agent_collectable",
		},
		{ key: "ecc_memory", label: "ECC 内存", source: "metadata", type: "select", options: yesNoOptions },
	],
	storage: [
		{ key: "bay_count", label: "插槽数", source: "metadata", type: "number", placeholder: "4" },
		// 2026-10-17 用户拍板：存储规范参数（与内存同构）——硬盘类型支持/接口/协议版本/每槽最大容量
		{
			key: "storage_supported_types",
			label: "硬盘类型支持",
			source: "metadata",
			placeholder: "例如 M.2 2280 NVMe SSD",
			capture: "agent_collectable",
		},
		{
			key: "storage_interface",
			label: "接口",
			source: "metadata",
			placeholder: "例如 M.2 2280（PCIe 4.0 x4）",
			capture: "agent_collectable",
		},
		{
			key: "storage_protocol",
			label: "协议版本",
			source: "metadata",
			placeholder: "例如 PCIe 4.0",
			capture: "agent_collectable",
		},
		{
			key: "storage_max_capacity_per_bay",
			label: "每槽最大容量",
			source: "metadata",
			placeholder: "例如 最大 2TB / 4TB",
			capture: "agent_collectable",
		},
		{ key: "storage_slots", label: "官方扩展槽", source: "metadata", placeholder: "M.2 2280 x2 / 2.5 英寸 SATA" },
		{ key: "storage_backplane", label: "背板 / 硬盘位", source: "metadata", placeholder: "12 x 3.5 英寸 SAS / SATA" },
		{ key: "hot_swap", label: "热插拔", source: "metadata", type: "select", options: yesNoOptions },
		{ key: "cache_slots", label: "缓存盘位", source: "metadata", placeholder: "M.2 NVMe x2 / 无" },
		{
			key: "storage_summary",
			label: "当前存储摘要",
			source: "metadata",
			placeholder: "SMART / Agent 接入后可采集，也可先手动填写",
			span: "full",
			capture: "agent_collectable",
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
		// 2026-10-14 用户拍板：存储表格列含「容量」——主机池此前缺 storage_gb 导致容量列无处可填（死列）
		{ key: "storage_gb", label: "容量 GB", source: "metadata", type: "number", placeholder: "例如 1024" },
		{
			key: "storage_media",
			label: "硬盘类型",
			source: "metadata",
			placeholder: "例如 SSD / HDD / NVMe SSD",
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
			key: "storage_serial_note",
			label: "当前硬盘序列号备注",
			source: "metadata",
			placeholder: "多盘可写摘要，详细盘建议后续独立资产化",
			capture: "future_collectable",
			span: "full",
		},
		{ key: "raid_controller", label: "RAID / HBA 控制器", source: "metadata", placeholder: "LSI 9361 / HBA 9300" },
	],
	graphics: [
		{
			key: "gpu_type",
			label: "显卡类型",
			source: "metadata",
			type: "select",
			options: [
				{ value: "核显", label: "核显" },
				{ value: "独立显卡", label: "独立显卡" },
			],
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
		{ key: "transcode_engine", label: "硬件转码", source: "metadata", placeholder: "Intel Quick Sync / 无" },
	],
	// 2026-10-17 用户拍板：主板与固件并入「系统与软件」组——字段池合并进 system（下方），
	// 保留 registry 分类 platform 以便 Agent 继续采集主板/BIOS（展示与弹窗按映射归入系统组）
	network: [
		// 2026-10-12 编辑弹窗按接口分小分类：有线网卡 → 无线网卡 → 其他（端口数量）
		{
			key: "primary_nic_speed_mbps",
			label: "有线速率",
			source: "metadata",
			// 2026-10-17 用户拍板：有线速率改为文本，可保存「2.5Gbps（2500Mbps，RJ45）」这类原值
			placeholder: "例如 2.5Gbps（2500Mbps，RJ45）",
			capture: "agent_collectable",
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
			key: "nic_detail",
			label: "网卡品牌 / 型号",
			source: "metadata",
			placeholder: "例如 Intel I225-V / Realtek 8125",
			capture: "future_collectable",
		},
		{ key: "wifi_support", label: "Wi-Fi", source: "metadata", type: "select", options: yesNoOptions },
		{ key: "wifi_standard", label: "无线标准", source: "metadata", placeholder: "Wi-Fi 6 / Wi-Fi 7" },
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
		// 2026-10-17 用户拍板：网络规范参数——Wi-Fi 速率与蓝牙版本（蓝牙规格归网络组）
		{
			key: "wifi_speed_mbps",
			label: "Wi-Fi 速率",
			source: "metadata",
			placeholder: "例如 理论峰值 2402Mbps（2×2 MIMO）",
			capture: "agent_collectable",
		},
		{
			key: "bluetooth_version",
			label: "蓝牙",
			source: "metadata",
			placeholder: "例如 蓝牙 5.2",
			capture: "agent_collectable",
		},
		{ key: "port_count", label: "端口数量", source: "metadata", type: "number", placeholder: "2" },
	],
	// 2026-10-17 用户拍板：显示输出独立成组（从接口与扩展拆出）
	display_output: [
		{ key: "display_outputs", label: "显示输出", source: "metadata", placeholder: "HDMI 2.1 / USB4 / DP" },
	],
	io: [
		{ key: "usb_ports", label: "USB / 扩展接口", source: "metadata", placeholder: "USB4 / USB-A / OCuLink" },
		{ key: "audio_output", label: "音频输出", source: "metadata", placeholder: "HDMI / 3.5mm Combo Jack" },
		{ key: "bluetooth_support", label: "蓝牙支持", source: "metadata", type: "select", options: yesNoOptions },
		{ key: "pcie_slots", label: "PCIe 扩展槽", source: "metadata", placeholder: "x16 / x4 / M.2 插槽摘要" },
	],
	power: [
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
		{ key: "power_adapter_w", label: "电源", source: "metadata", placeholder: "例如 DC 19V / 120W" },
		{ key: "power_input", label: "输入电源", source: "metadata", placeholder: "DC 12V 10A" },
		{
			key: "chassis_power_detail",
			label: "机箱 / 电源",
			source: "metadata",
			placeholder: "例如机箱型号、电源品牌和功率",
		},
		{ key: "redundant_psu", label: "冗余电源", source: "metadata", type: "select", options: yesNoOptions },
	],
	// 2026-10-17 用户拍板：散热设计独立成组（不再并入电源与功耗）
	thermal_environment: [
		{ key: "cooling_system", label: "散热", source: "metadata", placeholder: "主动散热 / 智能机箱风扇" },
		{ key: "operating_temperature_range", label: "工作温度", source: "metadata", placeholder: "0°C 至 50°C" },
		{ key: "operating_humidity_range", label: "工作湿度", source: "metadata", placeholder: "5% 至 90% RH，无凝露" },
	],
	system: [
		{
			key: "preinstalled_os",
			label: "预装操作系统",
			source: "metadata",
			type: "select",
			options: [
				{ label: "Windows 11 专业版", value: "Windows 11 专业版" },
				{ label: "Windows 11 家庭版", value: "Windows 11 家庭版" },
				{ label: "Windows 10", value: "Windows 10" },
				{ label: "未预装（准系统）", value: "未预装（准系统）" },
				{ label: "UNRAID", value: "UNRAID" },
				{ label: "飞牛 fnOS", value: "飞牛 fnOS" },
				{ label: "TrueNAS", value: "TrueNAS" },
				{ label: "群晖 DSM", value: "群晖 DSM" },
				{ label: "威联通 QTS", value: "威联通 QTS" },
				{ label: "PVE（Proxmox VE）", value: "PVE（Proxmox VE）" },
				{ label: "ESXi", value: "ESXi" },
				{ label: "Ubuntu", value: "Ubuntu" },
				{ label: "Debian", value: "Debian" },
				{ label: "Linux 其他发行版", value: "Linux 其他发行版" },
			],
		},
		{
			key: "supported_os",
			label: "支持的操作系统",
			source: "metadata",
			placeholder: "例如 Windows 11 / Linux",
		},
		{ key: "raid_mode", label: "阵列 / RAID", source: "metadata", placeholder: "RAID 5 / SHR / ZFS RAIDZ" },
		{ key: "filesystem", label: "文件系统", source: "metadata", placeholder: "Btrfs / ZFS / ext4" },
		// 2026-10-17 用户拍板：主板与固件并入系统与软件（原 platform 池迁入）
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
			key: "bios_version",
			label: "BIOS 版本",
			source: "metadata",
			placeholder: "例如 1.20 / F20",
			capture: "future_collectable",
		},
		{
			key: "bios_date",
			label: "BIOS 日期",
			source: "metadata",
			type: "date",
			placeholder: "例如 2024-03-06",
			capture: "future_collectable",
		},
		{ key: "bmc", label: "带外管理", source: "metadata", placeholder: "iDRAC / iLO / IPMI" },
	],
}

// 组内字段按字段目录的类型适用范围过滤，保证四种计算设备的组结构一致
function getHostGroupFields(category: AssetParameterCategoryId, type: AssetType): AssetFieldDefinition[] {
	return (hostGroupFieldPools[category] ?? []).filter((field) =>
		getAssetArchiveField(field.key)?.assetTypes.includes(type)
	)
}

const networkDeviceFields: AssetFieldDefinition[] = [
	{ key: "fixed_ipv4", label: "IPv4", source: "metadata", placeholder: "192.168.1.1" },
	{ key: "mac", label: "MAC", source: "metadata", required: true, placeholder: "AA:BB:CC:DD:EE:FF" },
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
	smart_ont: [
		"fixed_ipv4",
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
	router: [
		"fixed_ipv4",
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
	gateway: ["fixed_ipv4", "mac", "port_count", "wan_port_count", "default_port_speed_mbps", "power_mode", "vlan_note"],
	switch: [
		"fixed_ipv4",
		"mac",
		"port_count",
		"default_port_speed_mbps",
		"switching_capacity_gbps",
		"power_mode",
		"vlan_note",
	],
	ap: [
		"fixed_ipv4",
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
			pattern: field.pattern,
			title: field.title,
			span: field.span,
			options: field.options ? [...field.options] : undefined,
			capture: field.inputMode === "captured_candidate" ? "agent_collectable" : "manual",
			readOnly: field.readOnly,
		})),
	}))
}

const internetSections = assetTypeSpecSectionsToFormSections(internetAssetTypeSpec)
const ontSections = assetTypeSpecSectionsToFormSections(ontAssetTypeSpec)
const switchSections = assetTypeSpecSectionsToFormSections(switchAssetTypeSpec)

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
		{ key: "rated_voltage_v", label: "额定电压 V", source: "metadata", type: "number", placeholder: "220" },
		{ key: "outlet_count", label: "插孔数", source: "metadata", type: "number", placeholder: "1" },
		{ key: "energy_monitoring", label: "电量统计", source: "metadata", type: "select", options: yesNoOptions },
	],
	smart_switch: [
		{ key: "gang_count", label: "按键 / 路数", source: "metadata", type: "number", placeholder: "例如 3" },
		{ key: "neutral_wire", label: "零线要求", source: "metadata", placeholder: "需要零线 / 单火线 / 不适用" },
		{ key: "rated_power_w", label: "额定功率 W", source: "metadata", type: "number", placeholder: "例如 600" },
		{ key: "rated_voltage_v", label: "额定电压 V", source: "metadata", type: "number", placeholder: "220" },
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
		{
			key: "function_features",
			label: "功能特性",
			source: "metadata",
			placeholder: "恒湿、睡眠模式、缺水保护（顿号分隔显示为标签）",
		},
		{ key: "working_modes", label: "工作模式", source: "metadata", placeholder: "自动、睡眠、强力" },
		{ key: "applicable_area", label: "适用面积", source: "metadata", placeholder: "25-40 ㎡" },
		{ key: "rated_power_w", label: "额定功率 W", source: "metadata", type: "number", placeholder: "2500" },
		{ key: "rated_current_a", label: "额定电流 A", source: "metadata", type: "number", placeholder: "10" },
		{ key: "rated_voltage_v", label: "额定电压 V", source: "metadata", type: "number", placeholder: "220" },
		{ key: "rated_frequency_hz", label: "额定频率 Hz", source: "metadata", type: "number", placeholder: "50" },
		{ key: "outlet_count", label: "插孔数", source: "metadata", type: "number", placeholder: "1" },
		{ key: "energy_monitoring", label: "电量统计", source: "metadata", type: "select", options: yesNoOptions },
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
	{ key: "mac", label: "MAC", source: "metadata", placeholder: "可选" },
]

// 2026-10-07 计算设备购买与保修（docs/pc-asset-design.md 附加组）：与现有购买信息打通
const hostPurchaseWarrantyFields: AssetFieldDefinition[] = [
	{ key: "purchase_date", label: "购买日期", source: "metadata", type: "date" },
	{ key: "purchase_price_cny", label: "购买价格（元）", source: "metadata", type: "number", placeholder: "例如 2999" },
	{ key: "purchase_channel", label: "购买渠道", source: "metadata", placeholder: "例如 京东 / 拼多多 / 线下" },
	{ key: "warranty_until", label: "保修到期", source: "metadata", type: "date" },
]

// 2026-10-17 用户报「CPU 主频/最高睿频写了保存不了」：主频类字段是 number 类型，但手填/粘贴常带单位
// （如 3.3 GHz / 最高 4.9GHz）——直接 Number() 得 NaN 会把数据写丢；这里统一提取数值部分，
// 解析不出数字时保留原文（不再产生 NaN/空值）
export function normalizeNumberFieldValue(value: string): number | string {
	const trimmed = value.trim()
	if (!trimmed) return ""
	const direct = Number(trimmed)
	if (Number.isFinite(direct)) return direct
	const match = trimmed.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/)
	if (match) return Number(match[0])
	return trimmed
}

export function getAssetFormSections(type: AssetType): AssetFieldSection[] {
	if (type === "internet") {
		return internetSections
	}
	if (type === "ont") {
		return ontSections
	}
	if (type === "switch") {
		return switchSections
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
		// 2026-10-17 用户定稿分类体系：处理器(CPU) / 图形核心(GPU/核显) / 内存 / 存储支持 /
		// 显示输出 / 网络连接 / 接口与扩展 / 电源与功耗 / 散热设计 / 物理规格 / 系统与软件（2026-10-18 移除特色功能）
		// （「基本信息」为左侧独立卡片；主板与固件并入系统与软件）
		const hostGroupSections = (
			[
				// 2026-10-18 用户拍板：物理规格放到最上面
				["appearance", "物理规格"],
				["processor", "处理器(CPU)"],
				["graphics", "图形核心(GPU/核显)"],
				["memory", "内存"],
				["storage", "存储支持"],
				// 2026-10-18 用户拍板：网络连接上移，三张表格组相邻（内存/存储/网络）
				["network", "网络连接"],
				["display_output", "显示输出"],
				["io", "接口与扩展"],
				["power", "电源与功耗"],
				["thermal_environment", "散热设计"],
				["system", "系统与软件"],
			] as const
		)
			.map(([category, title]) => ({ title, fields: getHostGroupFields(category, type) }))
			.filter((section) => section.fields.length > 0)
		return [
			{ title: "基础身份", fields: commonIdentityFields },
			{ title: "硬件识别", fields: getHardwareIdentityFields(type) },
			{ title: "接入信息", fields: agentConnectionFields },
			...hostGroupSections,
			{ title: "购买与保修", fields: hostPurchaseWarrantyFields },
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
	if (type === "subscription" || type === "domain_name" || type === "cloud_host") {
		// 2026-10-07 家庭用户类型固化：资源与服务细分——订阅/域名/云主机共用服务档案
		return [
			{ title: "基础身份", fields: commonIdentityFields },
			{ title: "服务信息", fields: resourceServiceFields },
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

// 2026-10-07 计算设备装机方式（品牌整机/自组装）：添加时必选，全程跟随资产
export const BUILD_MODES = [
	{ value: "brand", label: "品牌整机" },
	{ value: "diy", label: "自组装" },
] as const

export type AssetBuildMode = (typeof BUILD_MODES)[number]["value"]

export function isComputeDeviceType(type: AssetType) {
	return ["physical_host", "nas", "server", "mini_pc"].includes(type)
}

export function getBuildModeLabel(mode: string | undefined) {
	if (!mode) return ""
	return BUILD_MODES.find((item) => item.value === mode)?.label ?? mode
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
