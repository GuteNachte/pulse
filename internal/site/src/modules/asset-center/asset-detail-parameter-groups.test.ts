import { buildAssetParameterGroups } from "./asset-detail-parameter-groups.ts"
import { getAssetFormSections } from "./asset-schema.ts"
import type { AssetRecord } from "@/types"

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
		{ title: "处理器", rows: [["芯片 / SoC", "天玑 8100"]] },
		{ title: "内存", rows: [["运行内存", "12 GB"]] },
		{ title: "存储", rows: [["存储容量", "256 GB"]] },
		{ title: "屏幕", rows: [["屏幕 / 尺寸", "6.67 英寸"]] },
		{ title: "电池与充电", rows: [["电池容量", "5500 mAh"]] },
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
	["CPU", "内存"]
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
	["外观尺寸", "主板", "CPU", "内存", "GPU", "硬盘", "网络", "电源", "接口"]
)
assertDeepEqual(
	buildAssetParameterGroups(fullyProfiledHost)
		.find((group) => group.title === "电源")
		?.rows.map((row) => [row.label, row.value]),
	[["电源", "120"]]
)
assertDeepEqual(
	buildAssetParameterGroups(fullyProfiledHost)
		.find((group) => group.title === "接口")
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
		["当前内存容量", "32 GB"],
		["当前内存类型", "DDR5"],
		["当前内存频率", "4800 MHz"],
		["支持内存类型", "笔记本 DDR5"],
		["最大内存容量", "64 GB"],
		["内存通道数量", "2"],
		["ECC 内存", "否"],
	]
)
assertDeepEqual(
	buildAssetParameterGroups(officialMiniPc)
		.find((group) => group.title === "其他")
		?.rows.map((row) => [row.label, row.value]),
	[
		["预装操作系统", "Windows 11"],
		["支持的操作系统", "Windows 11"],
		["包装重", "1.66 kg"],
		["净重", "0.6 kg"],
		["上市日期", "Q4'22"],
	]
)
assertDeepEqual(
	hostGroups.find((group) => group.title === "内存")?.rows.map((row) => [row.label, row.value]),
	[
		["当前内存容量", "32 GB"],
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
		.filter((group) => group.title === "硬盘")
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
		.find((group) => group.title === "硬盘")
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
		{ title: "动态公网地址", rows: [["公网 IPv4", "203.0.113.10"]] },
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
