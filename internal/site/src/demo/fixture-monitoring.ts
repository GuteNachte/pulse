import type {
	AlertRecord,
	ContainerRecord,
	ModuleSettingRecord,
	SystemDetailsRecord,
	SystemRecord,
	UserSettings,
	WebsiteMonitorCheckRecord,
	WebsiteMonitorRecord,
} from "@/types"
import { DEMO_TIMESTAMP, DEMO_USER_ID, demoRecordBase } from "./fixture-core.ts"

type DemoSystemInput = {
	id: string
	asset: string
	name: string
	status: SystemRecord["status"]
	ip: string
	os: string
	cpu: number
	memory: number
	disk: number
}

function system(input: DemoSystemInput): SystemRecord {
	return {
		...demoRecordBase(input.id, "demo_systems", "systems"),
		name: input.name,
		asset: input.asset,
		display_name: input.name,
		role: input.asset === "demo-nas" ? "nas" : "server",
		is_nas: input.asset === "demo-nas",
		pairing_confirmed: true,
		status: input.status,
		target_ip: input.ip,
		connect_ip: input.ip,
		reported_ips: [input.ip],
		info: {
			h: input.name.toLowerCase().replaceAll(" ", "-"),
			cpu: input.cpu,
			c: input.asset === "demo-windows" ? 12 : 8,
			m: input.asset === "demo-windows" ? "Demo Core 12" : "Demo Core 8",
			o: input.os,
			u: 864_000,
			mp: input.memory,
			dp: input.disk,
			b: 24,
			v: "1.0.6-beta.6",
			ip: input.ip,
		},
		v: "1.0.6-beta.6",
		updated: DEMO_TIMESTAMP,
	}
}

export const demoSystems: SystemRecord[] = [
	system({
		id: "demo-system-nas",
		asset: "demo-nas",
		name: "Atlas NAS",
		status: "up",
		ip: "192.168.50.10",
		os: "Linux",
		cpu: 18,
		memory: 46,
		disk: 63,
	}),
	system({
		id: "demo-system-windows",
		asset: "demo-windows",
		name: "Studio PC",
		status: "up",
		ip: "192.168.50.20",
		os: "Windows",
		cpu: 36,
		memory: 58,
		disk: 41,
	}),
	system({
		id: "demo-system-linux",
		asset: "demo-linux",
		name: "Orion Server",
		status: "down",
		ip: "192.168.50.41",
		os: "Linux",
		cpu: 0,
		memory: 0,
		disk: 72,
	}),
]

function systemDetails(
	id: string,
	systemId: string,
	hostname: string,
	ip: string,
	windows = false
): SystemDetailsRecord {
	return {
		...demoRecordBase(id, "demo_system_details", "system_details"),
		system: systemId,
		hostname,
		kernel: windows ? "Windows 11 24H2" : "Linux 6.12",
		cores: windows ? 12 : 8,
		threads: windows ? 20 : 16,
		cpu: windows ? "Demo Core 12" : "Demo Core 8",
		os: (windows ? 2 : 0) as SystemDetailsRecord["os"],
		os_name: windows ? "Windows 11 Pro" : "Debian 13",
		memory: windows ? 32 * 1024 ** 3 : 64 * 1024 ** 3,
		podman: false,
		container_runtime_name: windows ? "" : "Docker",
		container_runtime_version: windows ? "" : "28.3",
		network_interfaces: [
			{
				name: "eth0",
				display_name: "2.5GbE",
				mac: `02:50:00:00:${ip.split(".").at(-1)?.padStart(2, "0")}:01`,
				link_speed: 2_500,
				status: "up",
				ip_method: "static",
				ipv4: [`${ip}/24`],
				gateways: ["192.168.50.1"],
				dns_servers: ["192.0.2.53"],
			},
		],
	}
}

export const demoSystemDetails: SystemDetailsRecord[] = [
	systemDetails("demo-details-nas", "demo-system-nas", "atlas-nas", "192.168.50.10"),
	systemDetails("demo-details-windows", "demo-system-windows", "studio-pc", "192.168.50.20", true),
	systemDetails("demo-details-linux", "demo-system-linux", "orion-server", "192.168.50.41"),
]

function container(
	id: string,
	systemId: string,
	name: string,
	image: string,
	status: "running" | "exited",
	stack: string
): ContainerRecord {
	return {
		...demoRecordBase(id, "demo_containers", "containers"),
		system: systemId,
		name,
		image,
		ports: status === "running" ? "8080/tcp" : "",
		cpu: status === "running" ? 2.4 : 0,
		memory: status === "running" ? 192 : 0,
		net: status === "running" ? 1.2 : 0,
		health: status === "running" ? 1 : 0,
		status,
		stack_project: stack,
		stack_service: name,
		stack_number: "1",
		updated: Date.parse(DEMO_TIMESTAMP) / 1000,
	}
}

export const demoContainers: ContainerRecord[] = [
	container(
		"demo-container-pulse",
		"demo-system-nas",
		"pulse-hub",
		"ghcr.io/gutenachte/pulse-hub:1.0.6-beta.6",
		"running",
		"pulse"
	),
	container(
		"demo-container-agent",
		"demo-system-nas",
		"pulse-agent",
		"ghcr.io/gutenachte/pulse-agent:1.0.6-beta.6",
		"running",
		"pulse"
	),
	container("demo-container-files", "demo-system-nas", "files", "example/files:2.4", "running", "home-services"),
	container("demo-container-media", "demo-system-nas", "media", "example/media:1.8", "running", "home-services"),
	container("demo-container-lab", "demo-system-linux", "lab-console", "example/lab-console:0.9", "running", "lab"),
	container("demo-container-worker", "demo-system-linux", "lab-worker", "example/lab-worker:0.9", "exited", "lab"),
]

export const demoAlerts: AlertRecord[] = [
	{
		...demoRecordBase("demo-alert-linux", "demo_alerts", "alerts"),
		system: "demo-system-linux",
		asset: "demo-linux",
		name: "Status",
		triggered: true,
		value: 0,
		min: 1,
	},
	{
		...demoRecordBase("demo-alert-nas", "demo_alerts", "alerts"),
		system: "demo-system-nas",
		asset: "demo-nas",
		name: "Disk",
		triggered: false,
		value: 63,
		min: 85,
	},
]

function website(
	id: string,
	name: string,
	host: string,
	status: "up" | "down",
	latency: number,
	systemId: string
): WebsiteMonitorRecord {
	return {
		...demoRecordBase(id, "demo_website_monitors", "website_monitors"),
		user: DEMO_USER_ID,
		system: systemId,
		asset: "demo-web",
		name,
		url: `https://${host}`,
		external_url: `https://${host}`,
		description: "Pulse 公开演示服务",
		group: "演示服务",
		interval_seconds: 300,
		timeout_seconds: 10,
		enabled: true,
		last_status: status,
		last_status_code: status === "up" ? 200 : 503,
		last_latency_ms: latency,
		last_error: status === "down" ? "HTTP 503" : "",
		last_failure_category: status === "down" ? "http" : undefined,
		last_checked: DEMO_TIMESTAMP,
		uptime_24h: status === "up" ? 100 : 96.4,
	}
}

export const demoWebsiteMonitors: WebsiteMonitorRecord[] = [
	website("demo-website-status", "状态页", "status.example.com", "up", 18, "demo-system-nas"),
	website("demo-website-files", "文件服务", "files.example.com", "up", 42, "demo-system-nas"),
	website("demo-website-lab", "实验入口", "lab.example.com", "down", 95, "demo-system-linux"),
]

export const demoWebsiteChecks: WebsiteMonitorCheckRecord[] = demoWebsiteMonitors.flatMap((monitor, monitorIndex) =>
	Array.from({ length: 4 }, (_, index) => ({
		...demoRecordBase(`demo-check-${monitorIndex}-${index}`, "demo_website_checks", "website_monitor_checks"),
		user: DEMO_USER_ID,
		monitor: monitor.id,
		target: "external",
		url: monitor.url,
		ip_version: "IPv4",
		status: monitor.last_status === "down" && index === 0 ? "down" : "up",
		status_code: monitor.last_status === "down" && index === 0 ? 503 : 200,
		latency_ms: (monitor.last_latency_ms ?? 20) + index * 3,
		failure_category: monitor.last_status === "down" && index === 0 ? "http" : undefined,
		created: `2026-07-31 0${8 - index}:00:00.000Z`,
	}))
)

export const demoUserSettings = [
	{
		...demoRecordBase("demo-user-settings", "demo_user_settings", "user_settings"),
		user: DEMO_USER_ID,
		settings: {
			chartTime: "1h",
			colorWarn: 75,
			colorCrit: 90,
			layoutWidth: 1600,
		} satisfies UserSettings,
	},
]

export const demoModuleSettings: ModuleSettingRecord[] = []

export const demoBackups = [
	{
		key: "pulse_demo_20260731_080000.zip",
		size: 12_582_912,
		modified: "2026-07-31T08:00:00Z",
		type: "pulse",
		pulse_version: "1.0.6-beta.6",
		checksum: "verified",
		scope: "full",
	},
	{
		key: "pulse_demo_20260730_200000.zip",
		size: 12_451_840,
		modified: "2026-07-30T20:00:00Z",
		type: "pulse",
		pulse_version: "1.0.6-beta.6",
		checksum: "verified",
		scope: "full",
	},
	{
		key: "pulse_demo_20260730_080000.zip",
		size: 12_320_768,
		modified: "2026-07-30T08:00:00Z",
		type: "pulse",
		pulse_version: "1.0.6-beta.6",
		checksum: "verified",
		scope: "full",
	},
] as const
