import type {
	AssetInterfaceKind,
	AssetInterfaceRecord,
	AssetLocationRecord,
	AssetPresenceRecord,
	AssetRecord,
	AssetRelationRecord,
	AssetType,
	SmartAttribute,
	SmartDeviceRecord,
} from "@/types"

export const DEMO_USER_ID = "demo_user_00001"
export const DEMO_TIMESTAMP = "2026-07-31 08:00:00.000Z"

type DemoAssetRow = readonly [
	id: string,
	name: string,
	type: AssetType,
	managementIp: string,
	role: string,
	domain: "home" | "technology" | "shared",
]

const demoAssetRows: DemoAssetRow[] = [
	["demo-internet", "星云宽带", "internet", "", "家庭互联网入口", "shared"],
	["demo-ont", "光桥 X10", "ont", "192.0.2.1", "家庭主网关", "home"],
	["demo-switch", "CoreSwitch 2.5G", "switch", "192.0.2.2", "家庭核心交换机", "home"],
	["demo-ap", "Ceiling AP 7", "ap", "192.0.2.3", "家庭无线接入点", "home"],
	["demo-nas", "Atlas NAS", "nas", "192.0.2.10", "家庭存储", "home"],
	["demo-windows", "Studio PC", "physical_host", "192.0.2.20", "Windows 工作站", "home"],
	["demo-phone", "Aurora Phone", "phone", "192.0.2.30", "移动终端", "home"],
	["demo-tech-router", "Lab Router", "router", "192.0.2.40", "科技网路由器", "technology"],
	["demo-linux", "Orion Server", "server", "192.0.2.41", "实验服务器", "technology"],
	["demo-light", "客厅灯带", "light", "192.0.2.60", "智能照明", "home"],
	["demo-sensor", "环境传感器", "sensor", "192.0.2.61", "温湿度监测", "home"],
	["demo-web", "家庭服务入口", "web_endpoint", "", "互联网服务监控", "shared"],
]

export function demoRecordBase(id: string, collectionId: string, collectionName: string) {
	return {
		id,
		collectionId,
		collectionName,
		expand: {},
	}
}

function asset([id, name, type, managementIp, role, domain]: DemoAssetRow, index: number): AssetRecord {
	return {
		...demoRecordBase(id, "demo_assets", "assets"),
		user: DEMO_USER_ID,
		name,
		type,
		status: "active",
		management_ip: managementIp || undefined,
		vendor: type === "internet" || type === "web_endpoint" ? "Nebula Labs" : "Pulse Demo",
		model: type === "web_endpoint" ? "Web Endpoint" : name,
		role,
		location: domain === "technology" ? "实验室" : domain === "home" ? "家 / 卧室" : undefined,
		tags: [domain === "shared" ? "共享" : domain === "home" ? "家庭网" : "科技网"],
		metadata: {
			asset_tag: `DEMO-${String(index + 1).padStart(3, "0")}`,
			network_domain: domain,
			purpose: role,
			demo_fixture: true,
		},
		created: DEMO_TIMESTAMP,
		updated: DEMO_TIMESTAMP,
	}
}

export const demoAssets: AssetRecord[] = demoAssetRows.map(asset)

type DemoInterfaceInput = {
	id: string
	asset: string
	name: string
	kind: AssetInterfaceKind
	mac?: string
	ipv4?: string
	speedMbps?: number
	primary?: boolean
	metadata?: Record<string, unknown>
}

function networkInterface(input: DemoInterfaceInput): AssetInterfaceRecord {
	return {
		...demoRecordBase(input.id, "demo_asset_interfaces", "asset_interfaces"),
		user: DEMO_USER_ID,
		asset: input.asset,
		name: input.name,
		kind: input.kind,
		mac: input.mac,
		ipv4: input.ipv4,
		speed_mbps: input.speedMbps,
		connected: true,
		primary: input.primary ?? false,
		source: "manual",
		metadata: input.metadata ?? {},
		created: DEMO_TIMESTAMP,
		updated: DEMO_TIMESTAMP,
	}
}

export const demoInterfaces: AssetInterfaceRecord[] = [
	networkInterface({
		id: "if-internet",
		asset: "demo-internet",
		name: "光纤入口",
		kind: "pon",
		speedMbps: 10_000,
		primary: true,
	}),
	networkInterface({
		id: "if-ont-pon",
		asset: "demo-ont",
		name: "PON 上联",
		kind: "pon",
		speedMbps: 10_000,
		primary: true,
	}),
	networkInterface({
		id: "if-ont-lan",
		asset: "demo-ont",
		name: "LAN 1",
		kind: "lan",
		mac: "02:50:00:00:01:01",
		ipv4: "192.0.2.1",
		speedMbps: 2_500,
	}),
	networkInterface({
		id: "if-switch-up",
		asset: "demo-switch",
		name: "电口 1",
		kind: "ethernet",
		mac: "02:50:00:00:02:01",
		ipv4: "192.0.2.2",
		speedMbps: 2_500,
		primary: true,
	}),
	networkInterface({ id: "if-switch-ap", asset: "demo-switch", name: "电口 2", kind: "ethernet", speedMbps: 2_500 }),
	networkInterface({ id: "if-switch-nas", asset: "demo-switch", name: "电口 3", kind: "ethernet", speedMbps: 2_500 }),
	networkInterface({ id: "if-switch-pc", asset: "demo-switch", name: "电口 4", kind: "ethernet", speedMbps: 2_500 }),
	networkInterface({ id: "if-switch-tech", asset: "demo-switch", name: "电口 5", kind: "ethernet", speedMbps: 1_000 }),
	networkInterface({
		id: "if-ap-up",
		asset: "demo-ap",
		name: "2.5GbE",
		kind: "ethernet",
		mac: "02:50:00:00:03:01",
		ipv4: "192.0.2.3",
		speedMbps: 2_500,
		primary: true,
	}),
	networkInterface({
		id: "if-ap-wifi",
		asset: "demo-ap",
		name: "5 GHz Wi-Fi",
		kind: "wifi",
		metadata: { wifi_standard: "Wi-Fi 7", wifi_band: "5 GHz" },
	}),
	networkInterface({
		id: "if-nas",
		asset: "demo-nas",
		name: "2.5GbE",
		kind: "ethernet",
		mac: "02:50:00:00:10:01",
		ipv4: "192.0.2.10",
		speedMbps: 2_500,
		primary: true,
	}),
	networkInterface({
		id: "if-windows",
		asset: "demo-windows",
		name: "2.5GbE",
		kind: "ethernet",
		mac: "02:50:00:00:20:01",
		ipv4: "192.0.2.20",
		speedMbps: 2_500,
		primary: true,
	}),
	networkInterface({
		id: "if-phone",
		asset: "demo-phone",
		name: "5 GHz Wi-Fi",
		kind: "wifi",
		mac: "02:50:00:00:30:01",
		ipv4: "192.0.2.30",
		primary: true,
		metadata: { wifi_standard: "Wi-Fi 7", wifi_band: "5 GHz" },
	}),
	networkInterface({
		id: "if-tech-wan",
		asset: "demo-tech-router",
		name: "WAN",
		kind: "wan",
		mac: "02:50:00:00:40:01",
		ipv4: "192.0.2.40",
		speedMbps: 1_000,
		primary: true,
	}),
	networkInterface({ id: "if-tech-lan", asset: "demo-tech-router", name: "LAN 1", kind: "lan", speedMbps: 2_500 }),
	networkInterface({
		id: "if-linux",
		asset: "demo-linux",
		name: "2.5GbE",
		kind: "ethernet",
		mac: "02:50:00:00:41:01",
		ipv4: "192.0.2.41",
		speedMbps: 2_500,
		primary: true,
	}),
	networkInterface({
		id: "if-light",
		asset: "demo-light",
		name: "2.4 GHz Wi-Fi",
		kind: "wifi",
		mac: "02:50:00:00:60:01",
		ipv4: "192.0.2.60",
		primary: true,
		metadata: { wifi_standard: "Wi-Fi 6", wifi_band: "2.4 GHz" },
	}),
	networkInterface({
		id: "if-sensor",
		asset: "demo-sensor",
		name: "2.4 GHz Wi-Fi",
		kind: "wifi",
		mac: "02:50:00:00:61:01",
		ipv4: "192.0.2.61",
		primary: true,
		metadata: { wifi_standard: "Wi-Fi 6", wifi_band: "2.4 GHz" },
	}),
]

type DemoRelationInput = {
	id: string
	from: string
	to: string
	fromInterface: string
	toInterface: string
	medium: "ethernet" | "wifi" | "fiber"
	domain: "home" | "technology"
}

function relation(input: DemoRelationInput): AssetRelationRecord {
	return {
		...demoRecordBase(input.id, "demo_asset_relations", "asset_relations"),
		user: DEMO_USER_ID,
		source_asset: input.from,
		target_asset: input.to,
		kind: "connected_to",
		label: input.medium === "wifi" ? "无线连接" : input.medium === "fiber" ? "光纤连接" : "有线连接",
		metadata: {
			source_interface: input.fromInterface,
			target_interface: input.toInterface,
			medium: input.medium,
			network_domain: input.domain,
		},
		created: DEMO_TIMESTAMP,
		updated: DEMO_TIMESTAMP,
	}
}

export const demoRelations: AssetRelationRecord[] = [
	relation({
		id: "rel-internet-ont",
		from: "demo-internet",
		to: "demo-ont",
		fromInterface: "if-internet",
		toInterface: "if-ont-pon",
		medium: "fiber",
		domain: "home",
	}),
	relation({
		id: "rel-ont-switch",
		from: "demo-ont",
		to: "demo-switch",
		fromInterface: "if-ont-lan",
		toInterface: "if-switch-up",
		medium: "ethernet",
		domain: "home",
	}),
	relation({
		id: "rel-switch-ap",
		from: "demo-switch",
		to: "demo-ap",
		fromInterface: "if-switch-ap",
		toInterface: "if-ap-up",
		medium: "ethernet",
		domain: "home",
	}),
	relation({
		id: "rel-switch-nas",
		from: "demo-switch",
		to: "demo-nas",
		fromInterface: "if-switch-nas",
		toInterface: "if-nas",
		medium: "ethernet",
		domain: "home",
	}),
	relation({
		id: "rel-switch-pc",
		from: "demo-switch",
		to: "demo-windows",
		fromInterface: "if-switch-pc",
		toInterface: "if-windows",
		medium: "ethernet",
		domain: "home",
	}),
	relation({
		id: "rel-ap-phone",
		from: "demo-ap",
		to: "demo-phone",
		fromInterface: "if-ap-wifi",
		toInterface: "if-phone",
		medium: "wifi",
		domain: "home",
	}),
	relation({
		id: "rel-ap-light",
		from: "demo-ap",
		to: "demo-light",
		fromInterface: "if-ap-wifi",
		toInterface: "if-light",
		medium: "wifi",
		domain: "home",
	}),
	relation({
		id: "rel-ap-sensor",
		from: "demo-ap",
		to: "demo-sensor",
		fromInterface: "if-ap-wifi",
		toInterface: "if-sensor",
		medium: "wifi",
		domain: "home",
	}),
	relation({
		id: "rel-internet-tech",
		from: "demo-internet",
		to: "demo-tech-router",
		fromInterface: "if-internet",
		toInterface: "if-tech-wan",
		medium: "ethernet",
		domain: "technology",
	}),
	relation({
		id: "rel-tech-linux",
		from: "demo-tech-router",
		to: "demo-linux",
		fromInterface: "if-tech-lan",
		toInterface: "if-linux",
		medium: "ethernet",
		domain: "technology",
	}),
]

export const demoLocations: AssetLocationRecord[] = [
	{
		...demoRecordBase("demo-location-home", "demo_asset_locations", "asset_locations"),
		user: DEMO_USER_ID,
		name: "星云之家",
		kind: "area",
		sort_order: 1,
		created: DEMO_TIMESTAMP,
		updated: DEMO_TIMESTAMP,
	},
	{
		...demoRecordBase("demo-location-lab", "demo_asset_locations", "asset_locations"),
		user: DEMO_USER_ID,
		name: "实验室",
		kind: "area",
		sort_order: 2,
		created: DEMO_TIMESTAMP,
		updated: DEMO_TIMESTAMP,
	},
]

// 2026-10-30 拓扑布局结构对齐 1.0.8：单条记录 nodes 数组（含 canvasId）+ canvases 画布定义，
// 与 components/routes/network-topology-editor.tsx 的 LayoutRecord（TopologyLayout + id/user）同构。
type DemoTopologyLayoutNode = {
	assetId: string
	x: number
	y: number
	canvasId: string
}

type DemoTopologyCanvas = {
	id: string
	name: string
	domain: string
	viewport?: { x: number; y: number; zoom: number }
}

type DemoTopologyLayoutRecord = {
	id: string
	collectionId: string
	collectionName: string
	expand: Record<string, never>
	user: string
	nodes: DemoTopologyLayoutNode[]
	canvases: DemoTopologyCanvas[]
	created: string
	updated: string
}

const demoCanvases: DemoTopologyCanvas[] = [
	{ id: "home", name: "家庭网", domain: "home" },
	{ id: "technology", name: "科技网", domain: "technology" },
]

function layoutNode(assetId: string, canvasId: string, x: number, y: number): DemoTopologyLayoutNode {
	return { assetId, x, y, canvasId }
}

export const demoLayouts: DemoTopologyLayoutRecord[] = [
	{
		...demoRecordBase("demo-topology-layout", "demo_network_topology_layouts", "network_topology_layouts"),
		user: DEMO_USER_ID,
		nodes: [
			layoutNode("demo-internet", "home", 40, 300),
			layoutNode("demo-ont", "home", 360, 300),
			layoutNode("demo-switch", "home", 680, 300),
			layoutNode("demo-ap", "home", 1000, 130),
			layoutNode("demo-nas", "home", 1000, 280),
			layoutNode("demo-windows", "home", 1000, 430),
			layoutNode("demo-phone", "home", 1320, 130),
			layoutNode("demo-light", "home", 1320, 280),
			layoutNode("demo-sensor", "home", 1320, 430),
			layoutNode("demo-internet", "technology", 60, 240),
			layoutNode("demo-tech-router", "technology", 420, 240),
			layoutNode("demo-linux", "technology", 780, 240),
		],
		canvases: demoCanvases,
		created: DEMO_TIMESTAMP,
		updated: DEMO_TIMESTAMP,
	},
]

// 2026-10-30 设备在线探测：家庭网核心设备在线，demo-linux 宿主机 ping 不通（防火墙）但心跳在线，
// 智能家居两台离线——真实三态语义与生产一致。
export const demoPresence: AssetPresenceRecord[] = (
	[
		["demo-ont", "online", 3],
		["demo-switch", "online", 5],
		["demo-ap", "online", 4],
		["demo-nas", "online", 7],
		["demo-windows", "offline", 0],
		["demo-tech-router", "online", 6],
		["demo-light", "offline", 0],
		["demo-sensor", "offline", 0],
	] as const
).map(([asset, status, latency]) => ({
	...demoRecordBase(`demo-presence-${asset}`, "demo_asset_presence", "asset_presence"),
	asset,
	status: status as AssetPresenceRecord["status"],
	method: "ping" as const,
	last_checked: DEMO_TIMESTAMP,
	last_seen: DEMO_TIMESTAMP,
	latency_ms: latency as number,
	fail_streak: status === "offline" ? 4 : 0,
	created: DEMO_TIMESTAMP,
	updated: DEMO_TIMESTAMP,
}))

const demoSmartAttributes: SmartAttribute[] = [
	{ id: 5, n: "Reallocated Sector Count", v: 100, w: 100, t: 10, rv: 0, rs: "0" },
	{ id: 9, n: "Power-On Hours", v: 92, w: 92, t: 0, rv: 11872, rs: "11872" },
	{ id: 194, n: "Temperature", v: 68, w: 52, t: 0, rv: 32, rs: "32" },
	{ id: 196, n: "Reallocation Event Count", v: 100, w: 100, t: 0, rv: 0, rs: "0" },
	{ id: 197, n: "Current Pending Sector Count", v: 100, w: 100, t: 0, rv: 0, rs: "0" },
]

function smartDevice(
	id: string,
	systemId: string,
	name: string,
	model: string,
	capacityGb: number,
	temp: number,
	type: string
): SmartDeviceRecord {
	return {
		...demoRecordBase(id, "demo_smart_devices", "smart_devices"),
		system: systemId,
		name,
		model,
		state: "passed",
		capacity: capacityGb * 1024 ** 3,
		temp,
		firmware: "DEMO1.0",
		serial: `DEMO${id.slice(-6).toUpperCase()}`,
		type: type.includes("NVMe") ? "nvme" : "ata",
		media_type: type,
		hours: 11872,
		cycles: 2143,
		attributes: demoSmartAttributes,
		created: DEMO_TIMESTAMP,
		updated: DEMO_TIMESTAMP,
	}
}

export const demoSmartDevices: SmartDeviceRecord[] = [
	smartDevice("demo-smart-nas-ssd", "demo-system-nas", "/dev/nvme0", "Demo SSD 1TB NVMe", 1024, 41, "NVMe SSD"),
	smartDevice("demo-smart-nas-hdd", "demo-system-nas", "/dev/sda", "Demo HDD 8TB", 8192, 38, "HDD"),
	smartDevice(
		"demo-smart-windows",
		"demo-system-windows",
		"\\\\.\\PHYSICALDRIVE0",
		"Demo NVMe 2TB",
		2048,
		44,
		"NVMe SSD"
	),
]

// 2026-10-30 机器详情图表：为每台 demoSystem 生成 48 个确定性数据点（正弦 + 固定噪声），
// 无随机数，保证演示截图与 e2e 断言可重复。
function demoStatsSeries(systemId: string, base: { cpu: number; memory: number; disk: number; gpu: boolean }) {
	// PocketBase created 为字符串时间戳：demo 序列从基准时间向前铺 23.5 小时（30 分钟一个点）
	const baseMs = Date.parse(DEMO_TIMESTAMP)
	return Array.from({ length: 48 }, (_, index) => {
		const wave = Math.sin(index / 6) * 0.5 + Math.sin(index / 17) * 0.3
		const cpu = Math.max(1, Math.min(98, base.cpu + wave * 14 + (index % 5)))
		const memoryPercent = Math.max(5, Math.min(95, base.memory + wave * 6))
		const memoryGb = systemId === "demo-system-windows" ? 32 : 64
		return {
			...demoRecordBase(`${systemId}-stat-${index}`, "demo_system_stats", "system_stats"),
			system: systemId,
			created: new Date(baseMs - (47 - index) * 1800_000).toISOString().replace("T", " ").replace("Z", "Z"),
			stats: {
				cpu: Number(cpu.toFixed(1)),
				cpum: Number(Math.min(99, cpu + 9).toFixed(1)),
				la: [Number((cpu / 25).toFixed(2)), Number((cpu / 30).toFixed(2)), Number((cpu / 40).toFixed(2))] as [
					number,
					number,
					number,
				],
				m: memoryGb,
				mu: Number(((memoryGb * memoryPercent) / 100).toFixed(1)),
				mp: Number(memoryPercent.toFixed(1)),
				mb: Number((memoryGb * 0.12).toFixed(1)),
				s: memoryGb / 8,
				su: 0,
				d: 2048,
				du: Number((2048 * base.disk) / 100).toFixed(0),
				dp: base.disk,
				dr: Number((8 + wave * 6).toFixed(1)),
				dw: Number((3 + wave * 4).toFixed(1)),
				ns: Number((4 + wave * 5).toFixed(1)),
				nr: Number((9 + wave * 12).toFixed(1)),
				b: [1_200_000 + index * 3_000, 3_800_000 + index * 9_000] as [number, number],
				t: {
					cpu: Number((44 + wave * 5).toFixed(1)),
					motherboard: Number((38 + wave * 3).toFixed(1)),
				},
				...(base.gpu
					? {
							g: {
								gpu0: {
									n: "Demo Graphics X8",
									gt: "discrete",
									u: Number(Math.max(0, 22 + wave * 30).toFixed(1)),
									mu: 3120,
									mt: 16384,
									p: Number((28 + wave * 40).toFixed(1)),
								},
							},
						}
					: {}),
			},
		}
	})
}

export const demoSystemStats = [
	...demoStatsSeries("demo-system-nas", { cpu: 12, memory: 46, disk: 63, gpu: false }),
	...demoStatsSeries("demo-system-windows", { cpu: 30, memory: 58, disk: 41, gpu: true }),
	...demoStatsSeries("demo-system-linux", { cpu: 0, memory: 2, disk: 72, gpu: false }),
]

export const demoUsers = [
	{
		...demoRecordBase(DEMO_USER_ID, "demo_users", "users"),
		name: "demo",
		verified: true,
		emailVisibility: true,
		role: "admin" as const,
		created: DEMO_TIMESTAMP,
		updated: DEMO_TIMESTAMP,
	},
]
