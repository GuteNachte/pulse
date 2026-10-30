import {
	demoLayouts,
	demoPresence,
	demoSmartDevices,
	demoSystemStats,
	demoUsers,
	demoAssets,
	demoInterfaces,
	demoLocations,
	demoRelations,
} from "./fixture-core.ts"
import {
	demoAlerts,
	demoContainers,
	demoModuleSettings,
	demoSystemDetails,
	demoSystems,
	demoUserSettings,
	demoWebsiteChecks,
	demoWebsiteMonitors,
} from "./fixture-monitoring.ts"
import type { DemoRecord } from "./records.ts"

export const DEMO_FIXTURE_MARKER = "PULSE_DEMO_FIXTURE_V1"

// 2026-10-30 集合清单对齐 1.0.8：拓扑布局改用 network_topology_layouts（单记录 nodes+canvases），
// 新增 asset_presence / smart_devices / system_stats / users / agent_releases 等 1.0.8 页面依赖集合；
// 未演示的集合登记为空数组（返回空列表而不是 404，页面显示正常空态）。
export const demoCollections = {
	assets: demoAssets,
	asset_interfaces: demoInterfaces,
	asset_relations: demoRelations,
	asset_locations: demoLocations,
	asset_presence: demoPresence,
	asset_components: [],
	asset_maintenance: [],
	asset_attachments: [],
	asset_visuals: [],
	asset_changes: [],
	asset_enrichment_reports: [],
	asset_enrichment_suggestions: [],
	asset_monitor_bindings: [],
	ai_tasks: [],
	network_topology_layouts: demoLayouts,
	systems: demoSystems,
	system_details: demoSystemDetails,
	system_stats: demoSystemStats,
	container_stats: [],
	smart_devices: demoSmartDevices,
	users: demoUsers,
	agent_releases: [],
	containers: demoContainers,
	alerts: demoAlerts,
	alerts_history: [],
	alert_notification_states: [],
	website_monitors: demoWebsiteMonitors,
	website_monitor_checks: demoWebsiteChecks,
	monitored_software: [],
	monitored_services: [],
	software_monitor_rules: [],
	service_control_rules: [],
	user_settings: demoUserSettings,
	module_settings: demoModuleSettings,
	notification_failures: [],
	notification_channel_health: [],
} satisfies Record<string, DemoRecord[]>

export type DemoCollectionName = keyof typeof demoCollections

export const demoDashboardSummary = {
	containers: { total: 6, running: 5, stopped: 1 },
	websites: { total: 3, up: 2, down: 1, unknown: 0 },
}
