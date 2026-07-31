import type {
	AssetInterfaceKind,
	AssetInterfaceRecord,
	AssetRecord,
	AssetRelationRecord,
	AssetType,
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
	["demo-ont", "光桥 X10", "ont", "192.168.50.1", "家庭主网关", "home"],
	["demo-switch", "CoreSwitch 2.5G", "switch", "192.168.50.2", "家庭核心交换机", "home"],
	["demo-ap", "Ceiling AP 7", "ap", "192.168.50.3", "家庭无线接入点", "home"],
	["demo-nas", "Atlas NAS", "nas", "192.168.50.10", "家庭存储", "home"],
	["demo-windows", "Studio PC", "physical_host", "192.168.50.20", "Windows 工作站", "home"],
	["demo-phone", "Aurora Phone", "phone", "192.168.50.30", "移动终端", "home"],
	["demo-tech-router", "Lab Router", "router", "192.168.50.40", "科技网路由器", "technology"],
	["demo-linux", "Orion Server", "server", "192.168.50.41", "实验服务器", "technology"],
	["demo-light", "客厅灯带", "light", "192.168.50.60", "智能照明", "home"],
	["demo-sensor", "环境传感器", "sensor", "192.168.50.61", "温湿度监测", "home"],
	["demo-web", "家庭服务入口", "web_endpoint", "", "互联网服务监控", "shared"],
]

function recordBase(id: string, collectionId: string, collectionName: string) {
	return {
		id,
		collectionId,
		collectionName,
		expand: {},
	}
}

function asset([id, name, type, managementIp, role, domain]: DemoAssetRow, index: number): AssetRecord {
	return {
		...recordBase(id, "demo_assets", "assets"),
		user: DEMO_USER_ID,
		name,
		type,
		status: "active",
		management_ip: managementIp || undefined,
		vendor: type === "internet" || type === "web_endpoint" ? "Nebula Labs" : "Pulse Demo",
		model: type === "web_endpoint" ? "Web Endpoint" : name,
		role,
		tags: [domain === "shared" ? "共享" : domain === "home" ? "家庭网" : "科技网"],
		metadata: {
			asset_number: `DEMO-${String(index + 1).padStart(3, "0")}`,
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
		...recordBase(input.id, "demo_asset_interfaces", "asset_interfaces"),
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
	networkInterface({ id: "if-internet", asset: "demo-internet", name: "光纤入口", kind: "pon", speedMbps: 10_000, primary: true }),
	networkInterface({ id: "if-ont-pon", asset: "demo-ont", name: "PON 上联", kind: "pon", speedMbps: 10_000, primary: true }),
	networkInterface({ id: "if-ont-lan", asset: "demo-ont", name: "LAN 1", kind: "lan", mac: "02:50:00:00:01:01", ipv4: "192.168.50.1", speedMbps: 2_500 }),
	networkInterface({ id: "if-switch-up", asset: "demo-switch", name: "电口 1", kind: "ethernet", mac: "02:50:00:00:02:01", ipv4: "192.168.50.2", speedMbps: 2_500, primary: true }),
	networkInterface({ id: "if-switch-ap", asset: "demo-switch", name: "电口 2", kind: "ethernet", speedMbps: 2_500 }),
	networkInterface({ id: "if-switch-nas", asset: "demo-switch", name: "电口 3", kind: "ethernet", speedMbps: 2_500 }),
	networkInterface({ id: "if-switch-pc", asset: "demo-switch", name: "电口 4", kind: "ethernet", speedMbps: 2_500 }),
	networkInterface({ id: "if-switch-tech", asset: "demo-switch", name: "电口 5", kind: "ethernet", speedMbps: 1_000 }),
	networkInterface({ id: "if-ap-up", asset: "demo-ap", name: "2.5GbE", kind: "ethernet", mac: "02:50:00:00:03:01", ipv4: "192.168.50.3", speedMbps: 2_500, primary: true }),
	networkInterface({ id: "if-ap-wifi", asset: "demo-ap", name: "5 GHz Wi-Fi", kind: "wifi", metadata: { wifi_standard: "Wi-Fi 7", wifi_band: "5 GHz" } }),
	networkInterface({ id: "if-nas", asset: "demo-nas", name: "2.5GbE", kind: "ethernet", mac: "02:50:00:00:10:01", ipv4: "192.168.50.10", speedMbps: 2_500, primary: true }),
	networkInterface({ id: "if-windows", asset: "demo-windows", name: "2.5GbE", kind: "ethernet", mac: "02:50:00:00:20:01", ipv4: "192.168.50.20", speedMbps: 2_500, primary: true }),
	networkInterface({ id: "if-phone", asset: "demo-phone", name: "5 GHz Wi-Fi", kind: "wifi", mac: "02:50:00:00:30:01", ipv4: "192.168.50.30", primary: true, metadata: { wifi_standard: "Wi-Fi 7", wifi_band: "5 GHz" } }),
	networkInterface({ id: "if-tech-wan", asset: "demo-tech-router", name: "WAN", kind: "wan", mac: "02:50:00:00:40:01", ipv4: "192.168.50.40", speedMbps: 1_000, primary: true }),
	networkInterface({ id: "if-tech-lan", asset: "demo-tech-router", name: "LAN 1", kind: "lan", speedMbps: 2_500 }),
	networkInterface({ id: "if-linux", asset: "demo-linux", name: "2.5GbE", kind: "ethernet", mac: "02:50:00:00:41:01", ipv4: "192.168.50.41", speedMbps: 2_500, primary: true }),
	networkInterface({ id: "if-light", asset: "demo-light", name: "2.4 GHz Wi-Fi", kind: "wifi", mac: "02:50:00:00:60:01", ipv4: "192.168.50.60", primary: true, metadata: { wifi_standard: "Wi-Fi 6", wifi_band: "2.4 GHz" } }),
	networkInterface({ id: "if-sensor", asset: "demo-sensor", name: "2.4 GHz Wi-Fi", kind: "wifi", mac: "02:50:00:00:61:01", ipv4: "192.168.50.61", primary: true, metadata: { wifi_standard: "Wi-Fi 6", wifi_band: "2.4 GHz" } }),
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
		...recordBase(input.id, "demo_asset_relations", "asset_relations"),
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
	relation({ id: "rel-internet-ont", from: "demo-internet", to: "demo-ont", fromInterface: "if-internet", toInterface: "if-ont-pon", medium: "fiber", domain: "home" }),
	relation({ id: "rel-ont-switch", from: "demo-ont", to: "demo-switch", fromInterface: "if-ont-lan", toInterface: "if-switch-up", medium: "ethernet", domain: "home" }),
	relation({ id: "rel-switch-ap", from: "demo-switch", to: "demo-ap", fromInterface: "if-switch-ap", toInterface: "if-ap-up", medium: "ethernet", domain: "home" }),
	relation({ id: "rel-switch-nas", from: "demo-switch", to: "demo-nas", fromInterface: "if-switch-nas", toInterface: "if-nas", medium: "ethernet", domain: "home" }),
	relation({ id: "rel-switch-pc", from: "demo-switch", to: "demo-windows", fromInterface: "if-switch-pc", toInterface: "if-windows", medium: "ethernet", domain: "home" }),
	relation({ id: "rel-ap-phone", from: "demo-ap", to: "demo-phone", fromInterface: "if-ap-wifi", toInterface: "if-phone", medium: "wifi", domain: "home" }),
	relation({ id: "rel-ap-light", from: "demo-ap", to: "demo-light", fromInterface: "if-ap-wifi", toInterface: "if-light", medium: "wifi", domain: "home" }),
	relation({ id: "rel-ap-sensor", from: "demo-ap", to: "demo-sensor", fromInterface: "if-ap-wifi", toInterface: "if-sensor", medium: "wifi", domain: "home" }),
	relation({ id: "rel-switch-tech", from: "demo-switch", to: "demo-tech-router", fromInterface: "if-switch-tech", toInterface: "if-tech-wan", medium: "ethernet", domain: "technology" }),
	relation({ id: "rel-tech-linux", from: "demo-tech-router", to: "demo-linux", fromInterface: "if-tech-lan", toInterface: "if-linux", medium: "ethernet", domain: "technology" }),
]
