import { buildAssetParameterGroups, resolveParameterGroupId } from "./asset-detail-parameter-groups.ts"
import { getAssetFormSections } from "./asset-schema.ts"
import type { AssetInterfaceRecord, AssetRecord, AssetRelationRecord } from "@/types"

function assertDeepEqual(actual: unknown, expected: unknown, message?: string) {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(
			`${message ? `${message}: ` : ""}Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`
		)
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
		// 2026-10-07 分类重排（docs/pc-asset-design.md 顺序）：CPU/内存/存储在前，电源与散热在后
		{ title: "CPU", rows: [["芯片 / SoC", "天玑 8100"]] },
		{ title: "内存", rows: [["运行内存", "12 GB"]] },
		{ title: "存储", rows: [["存储容量", "256 GB"]] },
		{ title: "电源与散热", rows: [["电池容量", "5500 mAh"]] },
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

// 2026-10-17 组归属映射（展示与编辑弹窗共用）：计算设备「主板与固件」（platform）并入「系统与软件」组；
// 散热设计已独立成组（不再并入电源）；其他资产类型保留原分类
assertDeepEqual(resolveParameterGroupId("platform", "mini_pc"), "system")
assertDeepEqual(resolveParameterGroupId("platform", "physical_host"), "system")
assertDeepEqual(resolveParameterGroupId("platform", "nas"), "system")
assertDeepEqual(resolveParameterGroupId("platform", "server"), "system")
assertDeepEqual(resolveParameterGroupId("platform", "phone"), "platform")
assertDeepEqual(resolveParameterGroupId("thermal_environment", "mini_pc"), "thermal_environment")
assertDeepEqual(resolveParameterGroupId("memory", "mini_pc"), "memory")

const hostGroups = buildAssetParameterGroups(host)
assertDeepEqual(
	hostGroups.map((group) => group.title),
	// 2026-10-18 用户拍板：物理规格放到最上面；网络连接上移（三张表格组相邻）
	[
		"物理规格",
		"处理器(CPU)",
		"图形核心(GPU/核显)",
		"内存",
		"存储支持",
		"网络连接",
		"显示输出",
		"接口与扩展",
		"电源与功耗",
		"散热设计",
		"系统与软件",
	]
)
assertDeepEqual(
	hostGroups.filter((group) => group.rows.length === 0).map((group) => group.title),
	[
		"物理规格",
		"图形核心(GPU/核显)",
		"存储支持",
		"网络连接",
		"显示输出",
		"接口与扩展",
		"电源与功耗",
		"散热设计",
		"系统与软件",
	]
)

const fullyProfiledHost = {
	...host,
	id: "host-2",
	metadata: {
		form_factor: "迷你主机",
		motherboard_model: "AMD FP7",
		motherboard_vendor: "Shenzhen Meigao Electronic Equipment Co., Ltd.",
		bios_vendor: "American Megatrends International, LLC.",
		bios_version: "1.20",
		bios_date: "2024-03-06",
		cpu_vendor: "AMD",
		cpu_model: "AMD Ryzen 9 6900HX",
		cpu_cores: "8 核 / 16 线程",
		memory_gb: 32,
		memory_vendor: "Hynix",
		memory_detail: "16 GB x 2",
		gpu_model: "Radeon 680M",
		gpu_vendor: "AMD",
		gpu_detail: "处理器集成显卡",
		storage_summary: "1 TB NVMe SSD",
		storage_vendor: "Great Wall",
		storage_model: "GW3300 1TB",
		storage_media: "NVMe SSD",
		primary_nic_speed_mbps: 2500,
		nic_vendor: "Intel",
		nic_model: "I225-V",
		wifi_vendor: "MediaTek",
		wifi_model: "RZ608 Wi-Fi 6E 80MHz",
		power_adapter_w: 120,
		display_outputs: "HDMI 2.1 x 2",
		usb_ports: "USB4 x 2",
	},
} as unknown as AssetRecord

assertDeepEqual(
	buildAssetParameterGroups(fullyProfiledHost).map((group) => group.title),
	// 2026-10-18 用户拍板：物理规格放到最上面；网络连接上移（三张表格组相邻）
	[
		"物理规格",
		"处理器(CPU)",
		"图形核心(GPU/核显)",
		"内存",
		"存储支持",
		"网络连接",
		"显示输出",
		"接口与扩展",
		"电源与功耗",
		"散热设计",
		"系统与软件",
	]
)
assertDeepEqual(
	buildAssetParameterGroups(fullyProfiledHost)
		.find((group) => group.title === "电源与功耗")
		?.rows.map((row) => [row.label, row.value]),
	[["电源", "120"]]
)
assertDeepEqual(
	buildAssetParameterGroups(fullyProfiledHost)
		.find((group) => group.title === "系统与软件")
		?.rows.map((row) => [row.label, row.value]),
	[
		// 2026-10-17 主板与固件并入系统与软件
		["主板品牌", "Shenzhen Meigao Electronic Equipment Co., Ltd."],
		["主板型号", "AMD FP7"],
		["BIOS 厂商", "American Megatrends International, LLC."],
		["BIOS 版本", "1.20"],
		["BIOS 日期", "2024-03-06"],
	]
)
assertDeepEqual(
	buildAssetParameterGroups(fullyProfiledHost)
		.find((group) => group.title === "处理器(CPU)")
		?.rows.map((row) => [row.label, row.value]),
	[
		["CPU 厂商", "AMD"],
		["CPU 型号", "AMD Ryzen 9 6900HX"],
		["CPU 核心 / 线程", "8 核 / 16 线程"],
	]
)
assertDeepEqual(
	buildAssetParameterGroups(fullyProfiledHost)
		.find((group) => group.title === "网络连接")
		?.rows.map((row) => [row.label, row.value, row.cells]),
	[
		// 2026-10-17 网络重设计：规范参数单独铺格子；表格只放接口 | 接口类型 | 连接的设备
		["有线网卡芯片", "Intel I225-V", null],
		["有线速率", "2.5G", null],
		["Wi-Fi 模块", "MediaTek RZ608 Wi-Fi 6E 80MHz", null],
		["有线网卡", "", ["", ""]],
		["无线网卡", "", ["", ""]],
	]
)
assertDeepEqual(
	buildAssetParameterGroups(fullyProfiledHost)
		.find((group) => group.title === "接口与扩展")
		?.rows.map((row) => [row.label, row.value]),
	// 2026-10-17 显示输出从接口与扩展拆出独立成组
	[["USB / 扩展接口", "USB4 x 2"]]
)
assertDeepEqual(
	buildAssetParameterGroups(fullyProfiledHost)
		.find((group) => group.title === "显示输出")
		?.rows.map((row) => [row.label, row.value]),
	[["显示输出", "HDMI 2.1 x 2"]]
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
		?.rows.map((row) => [row.label, row.value, row.cells]),
	[
		// 2026-10-17 用户拍板：内存重设计——规范参数单独铺格子（支持类型/最大容量/通道数/ECC），
		// 表格只显示每个插槽的实际安装（内存类型/容量/频率/品牌/规格）
		["支持内存类型", "笔记本 DDR5", null],
		["最大容量", "64 GB", null],
		["通道数", "2", null],
		["ECC 内存", "否", null],
		["已安装内存", "DDR5 · 32 GB · 4800 MHz · Hynix · 16 GB x 2", ["DDR5", "32 GB", "4800 MHz", "Hynix", "16 GB x 2"]],
	]
)
assertDeepEqual(
	buildAssetParameterGroups(officialMiniPc).some((group) => group.title === "其他"),
	false
)

// 2026-10-12 支持内存类型/频率区间：类型混写频率（含区间与单位）被剥离成纯代际，频率区间原样保留
const rangeMemoryHost = {
	...fullyProfiledHost,
	id: "host-4",
	metadata: {
		supported_memory_type: "DDR5-4800/5600",
		supported_memory_speed_mhz: "4800-6400",
		memory_slots: 2,
	},
} as unknown as AssetRecord

assertDeepEqual(
	buildAssetParameterGroups(rangeMemoryHost)
		.find((group) => group.title === "内存")
		?.rows.map((row) => [row.label, row.value, row.cells]),
	[
		// 2026-10-17 内存重设计：规范参数单独铺格子（插槽数/支持内存类型/支持频率）；插槽行只留实际安装列（空）
		["插槽数", "2", null],
		["支持内存类型", "DDR5", null],
		["支持频率", "4800-6400", null],
		["插槽 1", "", ["", "", "", "", ""]],
		["插槽 2", "", ["", "", "", "", ""]],
	]
)

// 2026-10-17 用户拍板：粘贴/手动写入的自定义参数（_group_params 按分组清单）展示到对应分组——
// 不在字段池里的参数显示为「自定义参数」小节；字段池里的 key 不重复渲染；保留键与空值跳过
const customParamHost = {
	...fullyProfiledHost,
	id: "host-5",
	metadata: {
		...fullyProfiledHost.metadata,
		"RGB 灯效": "支持神光同步",
		device_color: "珠光白",
		_hidden_params: "不该显示",
		空值参数: "   ",
		_group_params: {
			appearance: ["RGB 灯效", "device_color", "_hidden_params", "空值参数", "RGB 灯效"],
			memory: ["内存通道数量"],
		},
		内存通道数量: "双通道",
	},
} as unknown as AssetRecord

assertDeepEqual(
	buildAssetParameterGroups(customParamHost)
		.find((group) => group.title === "物理规格")
		?.rows.filter((row) => row.section === "自定义参数")
		.map((row) => [row.label, row.value]),
	[
		// device_color 在字段池已渲染（形态与颜色小节），不重复；「空值参数」无值跳过；_hidden_params 保留键跳过
		["RGB 灯效", "支持神光同步"],
	]
)
assertDeepEqual(
	buildAssetParameterGroups(customParamHost)
		.find((group) => group.title === "内存")
		?.rows.map((row) => [row.label, row.section ?? ""])
		.filter(([, section]) => section === "自定义参数"),
	[["内存通道数量", "自定义参数"]]
)
assertDeepEqual(
	hostGroups.find((group) => group.title === "内存")?.rows.map((row) => [row.label, row.value, row.cells]),
	[
		// 2026-10-17 内存重设计：插槽行只含实际安装列（内存类型/容量/频率/品牌/规格）
		[
			"已安装内存",
			"DDR5 · 32 GB · 4800 MHz · Kingston · 16 GB x 2",
			["DDR5", "32 GB", "4800 MHz", "Kingston", "16 GB x 2"],
		],
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
		storage_slots: "SATA 3.0 x1；M.2 Key-M 2280 x1",
		net_weight_g: 1250,
	},
} as unknown as AssetRecord

assertDeepEqual(
	buildAssetParameterGroups(nas)
		.filter((group) => group.title === "存储支持")
		.flatMap((group) => group.rows.map((row) => [row.label, row.value, row.cells])),
	[
		// 2026-10-17 存储重设计：规范参数单独铺格子（插槽数 4）；表格只留实际安装列（品牌/型号/容量/硬盘类型）
		["插槽数", "4", null],
		["盘位 1", "", ["", "", "", ""]],
		["盘位 2", "", ["", "", "", ""]],
		["盘位 3", "", ["", "", "", ""]],
		["盘位 4", "", ["", "", "", ""]],
	]
)
assertDeepEqual(
	buildAssetParameterGroups(nas)
		.find((group) => group.title === "存储支持")
		?.rows.every((row) => !row.section || row.section === "实际安装" || row.section === "支持规格"),
	true
)
// RAID / 文件系统归「系统」组（2026-10-07 计算设备 11 组）
assertDeepEqual(
	buildAssetParameterGroups(nas)
		.find((group) => group.title === "系统与软件")
		?.rows.map((row) => [row.label, row.value]),
	[
		["阵列 / RAID", "RAID 5"],
		["文件系统", "Btrfs"],
	]
)

const nasEditFieldLabels = new Set(
	getAssetFormSections("nas")
		.flatMap((section) => (section.title === "存储支持" || section.title === "系统与软件" ? section.fields : []))
		.map((field) => field.label)
)
const nasDetailFieldLabels = new Set(
	buildAssetParameterGroups(nas)
		.filter((group) => group.title === "存储支持" || group.title === "系统与软件")
		.flatMap((group) => group.rows.map((row) => row.label))
)
assertDeepEqual(
	// 2026-10-12 硬盘位数量成为存储盘位表格的行数来源（盘位 1-4），不再作为参数行标签出现
	[...nasDetailFieldLabels].filter((label) => ["阵列 / RAID", "文件系统"].includes(label)).sort(),
	[...nasEditFieldLabels].filter((label) => ["阵列 / RAID", "文件系统"].includes(label)).sort()
)
assertDeepEqual(
	buildAssetParameterGroups(nas)
		.flatMap((group) => group.rows.map((row) => row.section))
		.some((section) => /\s+\d+$/.test(section ?? "")),
	false
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
			],
		},
		{
			title: "订阅周期",
			rows: [["计费周期", "月付"]],
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
		["检测状态", "IPv4：检测服务不可达；IPv6：检测服务不可达"],
		["上次更新时间", "2026-07-19 08:00"],
		["下次更新时间", "2026-07-19 08:30"],
	]
)

const internetManual = {
	...internet,
	id: "internet-manual",
	metadata: {
		access_technology: "ftth",
		auth_mode: "dhcp",
		down_mbps: 300,
		up_mbps: 300,
		public_ip_mode: "manual",
		public_ipv4: "140.235.140.170",
		public_ipv6: "2408:8207:9014:abf0:c8d9:bfa0:c6e1:1a17",
		public_ip_checked_at: "2026-10-20T10:00:00Z",
		public_ip_auto_refresh: "no",
		public_ip_refresh_interval_minutes: 30,
	},
} as unknown as AssetRecord

assertDeepEqual(
	buildAssetParameterGroups(internetManual)
		.find((group) => group.title === "公网地址")
		?.rows.map((row) => [row.label, row.value]),
	[
		["当前公网 IPv4", "140.235.140.170"],
		["当前公网 IPv6", "2408:8207:9014:abf0:c8d9:bfa0:c6e1:1a17"],
		["维护方式", "手动填写"],
		["上次维护时间", "2026-10-20 18:00"],
		["自动更新", "手动模式，不自动更新"],
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
		usb_port_count: 1,
		power_spec: "DC 12V / 2A",
	},
} as unknown as AssetRecord

assertDeepEqual(
	buildAssetParameterGroups(ont).map((group) => group.title),
	["接入角色", "光纤接入", "路由与管理", "无线网络", "有线网络", "主板与固件", "接口与扩展", "电源与散热"]
)
assertDeepEqual(
	buildAssetParameterGroups(ont)
		.find((group) => group.title === "无线网络")
		?.rows.map((row) => row.label),
	["无线标准", "2.4 GHz 支持", "2.4 GHz 状态", "5 GHz 支持", "5 GHz 状态"]
)

const networkSwitch = {
	id: "switch-1",
	user: "user-1",
	name: "绿联 CM754",
	type: "switch",
	status: "active",
	metadata: {
		dimensions_mm: "220 × 136 × 28",
		power_input: "12V / 1A",
		ethernet_port_count: 8,
		default_ethernet_speed_mbps: 2500,
		switching_capacity_gbps: 60,
		mac_table_entries: 4000,
		forwarding_method: "store_and_forward",
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
	["网络功能", "网口状态", "管理功能", "电源与散热", "外观"]
)
assertDeepEqual(
	switchGroups.find((group) => group.title === "网络功能")?.rows.map((row) => row.label),
	["交换容量", "MAC 地址表容量", "转发方式"]
)
assertDeepEqual(
	switchGroups.find((group) => group.title === "网络功能")?.rows.map((row) => row.section),
	[undefined, undefined, undefined]
)
// 2026-10-20 管理功能独立：VLAN 等开关从网络能力组移出，单独成组
assertDeepEqual(
	switchGroups.find((group) => group.title === "管理功能")?.rows.map((row) => row.label),
	["VLAN 支持"]
)
assertDeepEqual(
	switchGroups
		.find((group) => group.title === "网口状态")
		?.rows.map((row) => row.section)
		.filter((section, index, sections) => sections.indexOf(section) === index),
	["端口能力", "端口明细"]
)
assertDeepEqual(
	switchGroups.find((group) => group.title === "网口状态")?.rows.some((row) => row.label === "交换容量"),
	false
)

// 2026-10-17 用户拍板：组编辑弹窗上移/下移的自定义排序持久化到 _param_order，展示按该顺序渲染
const reorderedHost = {
	...host,
	id: "host-6",
	metadata: {
		length_mm: 100,
		width_mm: 200,
		height_mm: 300,
		_param_order: { appearance: ["height_mm", "length_mm"] },
	},
} as unknown as AssetRecord
assertDeepEqual(
	buildAssetParameterGroups(reorderedHost)
		.find((group) => group.title === "物理规格")
		?.rows.map((row) => row.label),
	// height 排第一、length 第二；未记录顺序的 width 保持原相对顺序排在后面
	["高度", "长度", "宽度"]
)

// 2026-10-17 用户拍板：表格行拖拽排序持久化到 _table_row_order，展示按此顺序渲染（规范参数格子位置不变）
const tableOrderedHost = {
	...host,
	id: "host-7",
	metadata: {
		memory_type: "DDR5",
		memory_gb: 32,
		memory_speed_mhz: 4800,
		memory_vendor: "Kingston",
		memory_detail: "16 GB x 2",
		memory_slots: 2,
		_table_row_order: { memory: ["slot-2", "slot-1"] },
	},
} as unknown as AssetRecord
assertDeepEqual(
	buildAssetParameterGroups(tableOrderedHost)
		.find((group) => group.title === "内存")
		?.rows.filter((row) => row.section === "实际安装")
		.map((row) => row.label),
	["插槽 2", "插槽 1"]
)

// 2026-10-20 硬件档案自定义分组：自定义分组/未分类、重命名、隐藏、拖拽顺序
const customGroupHost = {
	...host,
	id: "host-8",
	metadata: {
		length_mm: 100,
		_custom_groups: [{ id: "custom-1", title: "功能特性" }],
		_group_params: { appearance: ["自定义外观"], "custom-1": ["灯效"], uncategorized: ["未知参数"] },
		自定义外观: "金属外壳",
		灯效: "RGB",
		未知参数: "待归类",
		_group_order: ["custom-1", "appearance"],
		_group_titles: { appearance: "外观规格" },
		_hidden_groups: ["power"],
	},
} as unknown as AssetRecord
const customGroups = buildAssetParameterGroups(customGroupHost)
assertDeepEqual(
	customGroups.filter((group) => group.rows.length > 0).map((group) => group.title),
	["功能特性", "外观规格", "未分类"],
	"自定义分组按 _group_order 置前；外观重命名；power 隐藏；未分类有参数才出现"
)
assertDeepEqual(
	customGroups.find((group) => group.title === "功能特性")?.rows.map((row) => row.label),
	["灯效"]
)
assertDeepEqual(
	customGroups.find((group) => group.title === "外观规格")?.rows.map((row) => row.label),
	["长度", "自定义外观"]
)
assertDeepEqual(
	customGroups.find((group) => group.title === "未分类")?.rows.map((row) => row.label),
	["未知参数"]
)
