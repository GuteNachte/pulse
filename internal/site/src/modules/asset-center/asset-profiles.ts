import type { AssetType } from "../../types"
import { internetAssetTypeSpec } from "./asset-type-specs.ts"

export type AssetClass =
	| "compute"
	| "network"
	| "mobile"
	| "entertainment"
	| "security_office"
	| "power"
	| "smart_home"
	| "resource"
	| "other"

export type AssetProfileDefinition = {
	type: AssetType
	label: string
	group: string
	assetClass: AssetClass
	description: string
	creatable: boolean
	requiredFieldKeys: readonly string[]
}

const phoneRequiredFieldKeys = ["memory_gb", "storage_gb"] as const
const internetRequiredFieldKeys = internetAssetTypeSpec.sections
	.flatMap((section) => section.fields)
	.filter((field) => field.inputMode === "manual_required" || ["vendor", "access_technology", "auth_mode"].includes(field.key))
	.map((field) => field.key)

export const assetProfiles: readonly AssetProfileDefinition[] = [
	{
		type: "physical_host",
		label: "物理主机",
		group: "计算设备",
		assetClass: "compute",
		description: "台式机、工作站、实体 Linux / Windows 主机",
		creatable: true,
		requiredFieldKeys: [],
	},
	{
		type: "nas",
		label: "NAS",
		group: "计算设备",
		assetClass: "compute",
		description: "飞牛、Unraid、群晖、存储服务器",
		creatable: true,
		requiredFieldKeys: [],
	},
	{
		type: "server",
		label: "服务器",
		group: "计算设备",
		assetClass: "compute",
		description: "长期运行的物理服务器",
		creatable: true,
		requiredFieldKeys: [],
	},
	{
		type: "mini_pc",
		label: "迷你主机",
		group: "计算设备",
		assetClass: "compute",
		description: "NUC、软路由主机、低功耗主机",
		creatable: true,
		requiredFieldKeys: [],
	},
	{
		type: "router",
		label: "路由器",
		group: "网络设备",
		assetClass: "network",
		description: "家庭主路由、旁路由、软路由",
		creatable: true,
		requiredFieldKeys: [],
	},
	{
		type: "gateway",
		label: "网关",
		group: "网络设备",
		assetClass: "network",
		description: "默认网关、出口网关、DHCP 网关",
		creatable: true,
		requiredFieldKeys: [],
	},
	{
		type: "ont",
		label: "光猫 / ONT",
		group: "网络设备",
		assetClass: "network",
		description: "运营商入户光猫、桥接设备",
		creatable: true,
		requiredFieldKeys: [],
	},
	{
		type: "switch",
		label: "交换机",
		group: "网络设备",
		assetClass: "network",
		description: "有线交换、PoE、核心或接入交换",
		creatable: true,
		requiredFieldKeys: [],
	},
	{
		type: "ap",
		label: "无线 AP",
		group: "网络设备",
		assetClass: "network",
		description: "独立 AP、Mesh 节点、无线覆盖",
		creatable: true,
		requiredFieldKeys: [],
	},
	{
		type: "firewall",
		label: "防火墙",
		group: "网络设备",
		assetClass: "network",
		description: "硬件防火墙、安全网关",
		creatable: true,
		requiredFieldKeys: [],
	},
	{
		type: "phone",
		label: "手机",
		group: "移动设备",
		assetClass: "mobile",
		description: "手机、备用机、移动终端",
		creatable: true,
		requiredFieldKeys: phoneRequiredFieldKeys,
	},
	{
		type: "tablet",
		label: "平板",
		group: "移动设备",
		assetClass: "mobile",
		description: "平板和大屏移动设备",
		creatable: true,
		requiredFieldKeys: [],
	},
	{
		type: "wearable",
		label: "可穿戴",
		group: "移动设备",
		assetClass: "mobile",
		description: "手表、手环、健康设备",
		creatable: true,
		requiredFieldKeys: [],
	},
	{
		type: "ebook",
		label: "电子阅读器",
		group: "移动设备",
		assetClass: "mobile",
		description: "Kindle、墨水屏阅读器",
		creatable: true,
		requiredFieldKeys: [],
	},
	{
		type: "game_console",
		label: "游戏主机",
		group: "娱乐与显示",
		assetClass: "entertainment",
		description: "主机、电视游戏设备",
		creatable: true,
		requiredFieldKeys: [],
	},
	{
		type: "handheld",
		label: "游戏掌机",
		group: "娱乐与显示",
		assetClass: "entertainment",
		description: "掌机、便携游戏设备",
		creatable: true,
		requiredFieldKeys: [],
	},
	{
		type: "tv",
		label: "电视 / 显示",
		group: "娱乐与显示",
		assetClass: "entertainment",
		description: "智能电视、显示器、投影",
		creatable: true,
		requiredFieldKeys: [],
	},
	{
		type: "speaker",
		label: "音箱 / 音频",
		group: "娱乐与显示",
		assetClass: "entertainment",
		description: "智能音箱、功放、网络音频设备",
		creatable: true,
		requiredFieldKeys: [],
	},
	{
		type: "camera",
		label: "摄像头",
		group: "安防与办公",
		assetClass: "security_office",
		description: "网络摄像头、NVR 接入设备",
		creatable: true,
		requiredFieldKeys: [],
	},
	{
		type: "printer",
		label: "打印机",
		group: "安防与办公",
		assetClass: "security_office",
		description: "网络打印机、扫描仪",
		creatable: true,
		requiredFieldKeys: [],
	},
	{
		type: "ups",
		label: "UPS",
		group: "电源设备",
		assetClass: "power",
		description: "不间断电源、后备电池",
		creatable: true,
		requiredFieldKeys: [],
	},
	{
		type: "smarthome_gateway",
		label: "智能家居网关",
		group: "智能家居",
		assetClass: "smart_home",
		description: "Matter、Zigbee、蓝牙、米家等网关",
		creatable: true,
		requiredFieldKeys: [],
	},
	{
		type: "sensor",
		label: "传感器",
		group: "智能家居",
		assetClass: "smart_home",
		description: "温湿度、门窗、人体、水浸等传感器",
		creatable: true,
		requiredFieldKeys: [],
	},
	{
		type: "light",
		label: "灯具",
		group: "智能家居",
		assetClass: "smart_home",
		description: "灯泡、灯带、吸顶灯",
		creatable: true,
		requiredFieldKeys: [],
	},
	{
		type: "plug",
		label: "插座 / 开关",
		group: "智能家居",
		assetClass: "smart_home",
		description: "智能插座、墙壁开关、继电器",
		creatable: true,
		requiredFieldKeys: [],
	},
	{
		type: "lock",
		label: "门锁",
		group: "智能家居",
		assetClass: "smart_home",
		description: "智能门锁、门禁设备",
		creatable: true,
		requiredFieldKeys: [],
	},
	{
		type: "vacuum",
		label: "扫地机器人",
		group: "智能家居",
		assetClass: "smart_home",
		description: "扫地机、拖地机、基站",
		creatable: true,
		requiredFieldKeys: [],
	},
	{
		type: "iot",
		label: "IoT 设备",
		group: "智能家居",
		assetClass: "smart_home",
		description: "暂未归类的智能家居或物联设备",
		creatable: true,
		requiredFieldKeys: [],
	},
	{
		type: "internet",
		label: "互联网接入",
		group: "资源与服务",
		assetClass: "resource",
		description: "宽带线路、运营商、公网出口",
		creatable: true,
		requiredFieldKeys: internetRequiredFieldKeys,
	},
	{
		type: "web_endpoint",
		label: "互联网服务监控",
		group: "资源与服务",
		assetClass: "resource",
		description: "网站、API、中转站、Webhook 和管理后台的可用性监控对象",
		creatable: true,
		requiredFieldKeys: [],
	},
	{
		type: "custom",
		label: "自定义",
		group: "其他",
		assetClass: "other",
		description: "暂未归类但需要纳入资产中心的对象",
		creatable: true,
		requiredFieldKeys: [],
	},
	{
		type: "vm",
		label: "虚拟机",
		group: "历史兼容",
		assetClass: "compute",
		description: "历史虚拟机资产记录，不再支持新建",
		creatable: false,
		requiredFieldKeys: [],
	},
]

const assetProfilesByType = new Map(assetProfiles.map((profile) => [profile.type, profile]))

export function getAssetProfile(type: AssetType) {
	return assetProfilesByType.get(type)
}

export function getCreatableAssetTypeOptions() {
	return assetProfiles.filter((profile) => profile.creatable)
}

export function getEditableAssetTypeOptions(selectedType: AssetType) {
	const selectedProfile = getAssetProfile(selectedType)
	if (!selectedProfile || selectedProfile.creatable) {
		return getCreatableAssetTypeOptions()
	}
	return [...getCreatableAssetTypeOptions(), selectedProfile]
}

export function getProfileRequiredFieldKeys(type: AssetType) {
	return getAssetProfile(type)?.requiredFieldKeys ?? []
}
