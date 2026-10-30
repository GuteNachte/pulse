import type { AssetType } from "../../types"
import { internetAssetTypeSpec, ontAssetTypeSpec } from "./asset-type-specs.ts"

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
	.filter(
		(field) => field.inputMode === "manual_required" || ["vendor", "access_technology", "auth_mode"].includes(field.key)
	)
	.map((field) => field.key)
const ontRequiredFieldKeys = ontAssetTypeSpec.sections
	.flatMap((section) => section.fields)
	.filter((field) => field.key === "carrier" || field.key === "operating_role")
	.map((field) => field.key)

export const assetProfiles: readonly AssetProfileDefinition[] = [
	{
		type: "physical_host",
		label: "台式机 / 工作站",
		group: "计算设备",
		assetClass: "compute",
		description: "台式机、工作站、实体 Linux / Windows 主机",
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
		// 2026-10-26 虚拟机转正：vm 从历史兼容改为可新建，归计算设备组，
		// 宿主机关系用 hosted_on（「绑定宿主资产」）表达，详情页显示「运行在 <宿主机>」。
		type: "vm",
		label: "虚拟机",
		group: "计算设备",
		assetClass: "compute",
		description: "运行在 UNRAID / PVE / Hyper-V 等宿主机上的虚拟机",
		creatable: true,
		requiredFieldKeys: [],
	},
	{
		type: "router",
		label: "路由器",
		group: "网络设备",
		assetClass: "network",
		description: "家庭主路由、旁路由、软路由、出口网关",
		creatable: true,
		requiredFieldKeys: [],
	},
	{
		type: "ont",
		label: "光猫",
		group: "网络设备",
		assetClass: "network",
		description: "运营商入户光猫，负责光电转换与拨号（桥接为主）",
		creatable: true,
		requiredFieldKeys: ontRequiredFieldKeys,
	},
	// 2026-10-07 家庭用户类型固化：ONT 独立分类——集成路由、无线控制与光分发能力的智能终端（区别于只能拨号的光猫）
	{
		type: "smart_ont",
		label: "ONT",
		group: "网络设备",
		assetClass: "network",
		description: "光猫 + 主路由 + 无线控制器 + 光分发一体（FTTR 主网关，华为 iFTTR 等）",
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
		label: "手表 / 手环",
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
		type: "plug",
		label: "智能插座",
		group: "智能家居",
		assetClass: "smart_home",
		description: "智能插座、电量统计插座",
		creatable: true,
		requiredFieldKeys: [],
	},
	{
		type: "smart_switch",
		label: "智能开关",
		group: "智能家居",
		assetClass: "smart_home",
		description: "墙壁开关、智能开关面板",
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
		label: "其他智能设备",
		group: "智能家居",
		assetClass: "smart_home",
		description: "暂未归类的智能家居或物联设备",
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
		type: "internet",
		label: "宽带",
		group: "资源与服务",
		assetClass: "resource",
		description: "宽带线路、运营商、公网出口",
		creatable: true,
		requiredFieldKeys: internetRequiredFieldKeys,
	},
	// 2026-10-07 家庭用户类型固化：资源与服务细分——订阅服务/域名/云主机独立成类
	{
		type: "subscription",
		label: "订阅服务",
		group: "资源与服务",
		assetClass: "resource",
		description: "视频 / 音乐 / 网盘 / 软件 / AI 等周期性付费会员",
		creatable: true,
		requiredFieldKeys: [],
	},
	{
		type: "domain_name",
		label: "域名",
		group: "资源与服务",
		assetClass: "resource",
		description: "域名注册与 DNS 托管",
		creatable: true,
		requiredFieldKeys: [],
	},
	{
		type: "cloud_host",
		label: "云主机 / VPS",
		group: "资源与服务",
		assetClass: "resource",
		description: "云服务器、VPS、轻量应用服务器",
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
		type: "web_endpoint",
		label: "网站 / 服务监控",
		group: "资源与服务",
		assetClass: "resource",
		description: "网站、API 等可用性监控对象；先建资产，再在资产监控中接入网站监控",
		creatable: true,
		requiredFieldKeys: [],
	},
	// 2026-10-07 家庭用户类型固化：网关概念并入路由器（家庭"网关"即主路由），老资产走历史兼容
	{
		type: "gateway",
		label: "网关",
		group: "历史兼容",
		assetClass: "network",
		description: "历史网关资产记录，网关场景请选路由器，不再支持新建",
		creatable: false,
		requiredFieldKeys: [],
	},
]

const assetProfilesByType = new Map(assetProfiles.map((profile) => [profile.type, profile]))

export function getAssetProfile(type: AssetType) {
	return assetProfilesByType.get(type)
}

// 2026-10-20 用户拍板：宽带、订阅、域名、云主机、网站属于服务类资产（assetClass = resource），
// 不是实物；基本信息只保留与其他资产共有的公共字段，不新增服务专属字段。
// 服务自己的套餐/计费/线路/动态地址仍由右侧参数分组与「动态公网地址」卡承载。
export function isServiceAssetType(type: AssetType) {
	return getAssetProfile(type)?.assetClass === "resource"
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
