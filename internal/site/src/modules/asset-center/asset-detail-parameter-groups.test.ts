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
		memory_speed_mhz: 4800,
	},
} as unknown as AssetRecord

const hostGroups = buildAssetParameterGroups(host)
assertDeepEqual(
	hostGroups.map((group) => group.title),
	["CPU", "内存"]
)
assertDeepEqual(
	hostGroups[1]?.rows.map((row) => [row.label, row.value]),
	[
		["内存容量", "32 GB"],
		["内存频率", "4800 MHz"],
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
		.filter((group) => group.title === "NAS 存储参数")
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
		.find((group) => group.title === "NAS 存储参数")
		?.rows.map((row) => row.label)
)
assertDeepEqual(
	[...nasDetailFieldLabels].sort(),
	[...nasEditFieldLabels].filter((label) => ["硬盘位数量", "阵列 / RAID", "文件系统"].includes(label)).sort()
)
