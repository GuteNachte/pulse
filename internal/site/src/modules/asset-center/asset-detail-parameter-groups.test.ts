import { buildAssetParameterGroups } from "./asset-detail-parameter-groups.ts"
import { getAssetFormSections } from "./asset-schema.ts"
import type { AssetInterfaceRecord, AssetRecord, AssetRelationRecord } from "@/types"

function assertDeepEqual(actual: unknown, expected: unknown) {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
	}
}

const phone = {
	id: "phone-1",
	user: "user-1",
	name: "Redmi K50",
	type: "phone",
	status: "active",
	vendor: "小米 / Redmi",
	model: "Redmi K50",
	created: "2026-07-11 00:00:00.000Z",
	updated: "2026-07-11 00:00:00.000Z",
	metadata: {
		cpu_model: "天玑 8100",
		memory_gb: 12,
		storage_gb: 256,
		screen_size: "6.67 英寸",
		battery_capacity_mah: 5500,
	},
} as unknown as AssetRecord

assertDeepEqual(
	buildAssetParameterGroups(phone).map((group) => ({
		title: group.title,
		rows: group.rows.map((row) => [row.label, row.value]),
	})),
	[
		{ title: "电源", rows: [["电池容量", "5500 mAh"]] },
		{ title: "处理器", rows: [["芯片 / SoC", "天玑 8100"]] },
		{ title: "内存", rows: [["运行内存", "12 GB"]] },
		{ title: "存储", rows: [["存储容量", "256 GB"]] },
		{ title: "显示", rows: [["屏幕 / 尺寸", "6.67 英寸"]] },
	]
)

const host = {
	...phone,
	id: "host-1",
	name: "UM690",
	type: "mini_pc",
	model: "UM690",
	metadata: {
		cpu_model: "AMD Ryzen 9 6900HX",
		memory_gb: 32,
		memory_vendor: "Kingston",
		memory_detail: "16 GB x 2",
		memory_type: "DDR5",
		memory_speed_mhz: 4800,
	},
} as unknown as AssetRecord

const hostGroups = buildAssetParameterGroups(host)
assertDeepEqual(
	hostGroups.map((group) => group.title),
	["处理器", "内存"]
)

const fullyProfiledHost = {
	...host,
	id: "host-2",
	metadata: {
		form_factor: "迷你主机",
		motherboard_model: "AMD FP7",
		cpu_model: "AMD Ryzen 9 6900HX",
		memory_gb: 32,
		gpu_model: "Radeon 680M",
		storage_summary: "1 TB NVMe SSD",
		primary_nic_speed_mbps: 2500,
		power_adapter_w: 120,
		display_outputs: "HDMI 2.1 x 2",
		usb_ports: "USB4 x 2",
	},
} as unknown as AssetRecord

assertDeepEqual(
	buildAssetParameterGroups(fullyProfiledHost).map((group) => group.title),
	["外观与尺寸", "电源", "主板与平台", "处理器", "显卡", "内存", "存储", "网络", "接口与扩展"]
)
assertDeepEqual(
	buildAssetParameterGroups(fullyProfiledHost)
		.find((group) => group.title === "电源")
		?.rows.map((row) => [row.label, row.value]),
	[["电源", "120"]]
)
assertDeepEqual(
	buildAssetParameterGroups(fullyProfiledHost)
		.find((group) => group.title === "接口与扩展")
		?.rows.map((row) => [row.label, row.value]),
	[
		["显示输出", "HDMI 2.1 x 2"],
		["USB / 扩展接口", "USB4 x 2"],
	]
)

const officialMiniPc = {
	...fullyProfiledHost,
	id: "host-3",
	metadata: {
		...fullyProfiledHost.metadata,
		memory_type: "DDR5",
		memory_speed_mhz: 4800,
		supported_memory_type: "笔记本 DDR5",
		max_memory_gb: 64,
		memory_channel_count: 2,
		ecc_memory: "no",
		wifi_support: "yes",
		bluetooth_support: "yes",
		display_outputs: "HDMI (4K@60Hz) x2\nUSB4 x1",
		audio_output: "HDMI x2\n3.5mm Combo Jack x1",
		usb_ports: "RJ45 2.5GbE x1\nUSB3.2 Gen2 Type-C x1\nUSB3.2 Gen2 Type-A x4\nUSB4 Type-C x1\nClear CMOS x1\nDMIC x1",
		power_adapter_w: "DC 19V",
		preinstalled_os: "Windows 11",
		supported_os: "Windows 11",
		package_weight_kg: 1.66,
		weight_kg: 0.6,
		release_date: "Q4'22",
	},
} as unknown as AssetRecord

assertDeepEqual(
	buildAssetParameterGroups(officialMiniPc)
		.find((group) => group.title === "内存")
		?.rows.map((row) => [row.label, row.value]),
	[
		["内存容量", "32 GB"],
		["当前内存类型", "DDR5"],
		["当前内存频率", "4800 MHz"],
		["支持内存类型", "笔记本 DDR5"],
		["最大内存容量", "64 GB"],
		["内存通道数量", "2"],
		["ECC 内存", "否"],
	]
)
assertDeepEqual(
	buildAssetParameterGroups(officialMiniPc).some((group) => group.title === "其他"),
	false
)
assertDeepEqual(
	hostGroups.find((group) => group.title === "内存")?.rows.map((row) => [row.label, row.value]),
	[
		["内存容量", "32 GB"],
		["内存品牌", "Kingston"],
		["内存规格", "16 GB x 2"],
		["当前内存类型", "DDR5"],
		["当前内存频率", "4800 MHz"],
	]
)

const nas = {
	...host,
	id: "nas-1",
	type: "nas",
	metadata: {
		bay_count: 4,
		raid_mode: "RAID 5",
		filesystem: "Btrfs",
	},
} as unknown as AssetRecord

assertDeepEqual(
	buildAssetParameterGroups(nas)
		.filter((group) => group.title === "存储")
		.flatMap((group) => group.rows.map((row) => [row.label, row.value])),
	[
		["硬盘位数量", "4"],
		["阵列 / RAID", "RAID 5"],
		["文件系统", "Btrfs"],
	]
)

const nasEditFieldLabels = new Set(
	getAssetFormSections("nas")
		.find((section) => section.title === "NAS 存储参数")
		?.fields.map((field) => field.label)
)
const nasDetailFieldLabels = new Set(
	buildAssetParameterGroups(nas)
		.find((group) => group.title === "存储")
		?.rows.map((row) => row.label)
)
assertDeepEqual(
	[...nasDetailFieldLabels].sort(),
	[...nasEditFieldLabels].filter((label) => ["硬盘位数量", "阵列 / RAID", "文件系统"].includes(label)).sort()
)

const internet = {
	id: "internet-1",
	type: "internet",
	name: "宽带",
	vendor: "中国联通",
	status: "active",
	metadata: {
		access_technology: "ftth",
		auth_mode: "pppoe",
		down_mbps: 1000,
		up_mbps: 300,
		public_ipv4: "203.0.113.10",
		public_ipv6: "2001:db8::10",
		public_ip_checked_at: "2026-07-19T00:00:00Z",
		public_ip_next_check_at: "2026-07-19T00:30:00Z",
		package_name: "联通千兆融合套餐",
		recurring_price_cny: 165,
		billing_cycle: "monthly",
	},
} as unknown as AssetRecord

assertDeepEqual(
	buildAssetParameterGroups(internet).map((group) => ({
		title: group.title,
		rows: group.rows.map((row) => [row.label, row.value]),
	})),
	[
		{
			title: "线路参数",
			rows: [
				["线路接入技术", "家庭光纤宽带（FTTH）"],
				["联网认证方式", "PPPoE 拨号"],
				["下行带宽", "1000 Mbps"],
				["上行带宽", "300 Mbps"],
			],
		},
		{
			title: "动态公网地址",
			rows: [
				["当前公网 IPv4", "203.0.113.10"],
				["当前公网 IPv6", "2001:db8::10"],
				["上次更新时间", "2026-07-19 08:00"],
				["下次更新时间", "2026-07-19 08:30"],
			],
		},
		{
			title: "套餐与续费",
			rows: [
				["套餐名称", "联通千兆融合套餐"],
				["套餐费用（元）", "165"],
				["计费周期", "月付"],
			],
		},
	]
)

const internetWithoutDetectedAddress = {
	...internet,
	id: "internet-no-address",
	metadata: {
		access_technology: "ftth",
		auth_mode: "pppoe",
		down_mbps: 1000,
		up_mbps: 300,
		public_ip_checked_at: "2026-07-19T00:00:00Z",
		public_ip_next_check_at: "2026-07-19T00:30:00Z",
		public_ipv4_error: "检测服务不可达",
		public_ipv6_error: "检测服务不可达",
	},
} as unknown as AssetRecord

assertDeepEqual(
	buildAssetParameterGroups(internetWithoutDetectedAddress)
		.find((group) => group.title === "动态公网地址")
		?.rows.map((row) => [row.label, row.value]),
	[
		["当前公网 IPv4", "尚未获取"],
		["当前公网 IPv6", "尚未获取"],
		["上次更新时间", "2026-07-19 08:00"],
		["下次更新时间", "2026-07-19 08:30"],
	]
)

const ont = {
	id: "ont-1",
	user: "user-1",
	name: "家庭主网关",
	type: "ont",
	status: "active",
	vendor: "华为",
	model: "V271-20",
	location: "家 / 弱电箱",
	created: "2026-07-19 00:00:00.000Z",
	updated: "2026-07-19 00:00:00.000Z",
	metadata: {
		product_series: "Huawei OptiXstar",
		carrier: "中国联通",
		operating_role: "ifttr_main_gateway",
		pon_standard: "10G-EPON",
		router_status: "enabled",
		gateway_status: "enabled",
		dhcp_status: "enabled",
		fixed_ipv4: "192.168.1.1",
		wifi_standard: "Wi-Fi 7",
		wifi_24_supported: "supported",
		wifi_24_enabled: "disabled",
		wifi_5_supported: "supported",
		wifi_5_enabled: "enabled",
		lan_port_count: 4,
		lan_2500_count: 1,
		lan_1000_count: 3,
		power_spec: "DC 12V / 2A",
	},
} as unknown as AssetRecord

assertDeepEqual(
	buildAssetParameterGroups(ont).map((group) => group.title),
	["电源", "主板与平台", "网络"]
)
assertDeepEqual(
	buildAssetParameterGroups(ont)
		.find((group) => group.title === "网络")
		?.rows.map((row) => row.section)
		.filter((section, index, sections) => sections.indexOf(section) === index),
	["接入角色", "光纤接入", "路由与管理", "无线网络", "有线网络"]
)

const networkSwitch = {
	id: "switch-1",
	user: "user-1",
	name: "绿联 CM754",
	type: "switch",
	status: "active",
	metadata: {
		ethernet_port_count: 8,
		default_ethernet_speed_mbps: 2500,
		vlan_status: "disabled",
	},
} as unknown as AssetRecord
const switchInterfaces = [
	{
		id: "switch-port-1",
		asset: networkSwitch.id,
		name: "电口 1",
		kind: "ethernet",
		speed_mbps: 2500,
		connected: false,
		metadata: { enabled: true, role: "uplink" },
	},
] as unknown as AssetInterfaceRecord[]
const switchGroups = buildAssetParameterGroups(networkSwitch, {
	interfaces: switchInterfaces,
	assets: [networkSwitch],
	relations: [] as AssetRelationRecord[],
})
assertDeepEqual(
	switchGroups.map((group) => group.title),
	["网络", "网口状态"]
)
assertDeepEqual(
	switchGroups
		.find((group) => group.title === "网络")
		?.rows.map((row) => row.section)
		.filter((section, index, sections) => sections.indexOf(section) === index),
	["网络功能"]
)
assertDeepEqual(
	switchGroups
		.find((group) => group.title === "网口状态")
		?.rows.map((row) => row.section)
		.filter((section, index, sections) => sections.indexOf(section) === index),
	["端口能力", "端口明细"]
)
