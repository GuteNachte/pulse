import { demoAssets, demoInterfaces, demoLayouts, demoLocations, demoRelations } from "./fixture-core.ts"
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

export const demoCollections = {
	assets: demoAssets,
	asset_interfaces: demoInterfaces,
	asset_relations: demoRelations,
	asset_locations: demoLocations,
	network_layouts: demoLayouts,
	systems: demoSystems,
	system_details: demoSystemDetails,
	containers: demoContainers,
	alerts: demoAlerts,
	website_monitors: demoWebsiteMonitors,
	website_monitor_checks: demoWebsiteChecks,
	user_settings: demoUserSettings,
	module_settings: demoModuleSettings,
} satisfies Record<string, DemoRecord[]>

export type DemoCollectionName = keyof typeof demoCollections

export const demoDashboardSummary = {
	containers: { total: 6, running: 5, stopped: 1 },
	websites: { total: 3, up: 2, down: 1, unknown: 0 },
}
