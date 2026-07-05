import { accountAccessModule } from "./account-access/manifest"
import { agentManagementModule } from "./agent-management/manifest"
import { alertsModule } from "./alerts/manifest"
import { assetCenterModule } from "./asset-center/manifest"
import { clientMonitoringModule } from "./client-monitoring/manifest"
import { foundationModule } from "./foundation/manifest"
import { maintenanceModule } from "./maintenance/manifest"
import { networkTopologyModule } from "./network-topology/manifest"
import { notificationsModule } from "./notifications/manifest"
import { smarthomeModule } from "./smarthome/manifest"
import { websiteMonitoringModule } from "./website-monitoring/manifest"
import type { PulseModuleId, PulseModuleManifest } from "./types"

export const pulseModules = [
	foundationModule,
	assetCenterModule,
	smarthomeModule,
	clientMonitoringModule,
	websiteMonitoringModule,
	alertsModule,
	notificationsModule,
	agentManagementModule,
	networkTopologyModule,
	accountAccessModule,
	maintenanceModule,
] as const satisfies readonly PulseModuleManifest[]

export const pulseModuleMap = new Map<PulseModuleId, PulseModuleManifest>(
	pulseModules.map((module) => [module.id, module])
)

export function getPulseModule(id: PulseModuleId) {
	const module = pulseModuleMap.get(id)
	if (!module) {
		throw new Error(`Unknown Pulse module: ${id}`)
	}
	return module
}

export function getModuleForAppRoute(route?: string, settingsName?: string): PulseModuleId | undefined {
	if (!route) return undefined
	if (route === "home") return "foundation"
	if (route === "assets") return "asset-center"
	if (route === "asset") return "asset-center"
	if (route === "smarthome") return "smarthome"
	if (route === "network") return "network-topology"
	if (route === "clients") return "client-monitoring"
	if (route === "system") return "client-monitoring"
	if (route === "containers") return "client-monitoring"
	if (route === "websites") return "website-monitoring"
	if (route === "alerts") return "alerts"
	if (route === "notifications") return "notifications"
	if (route === "smart") return "client-monitoring"
	if (route === "settings") return getModuleForSettingsName(settingsName)
	return undefined
}

export function getModuleForSettingsName(name?: string): PulseModuleId {
	switch (name || "general") {
		case "ai":
			return "asset-center"
		case "notifications":
			return "notifications"
		case "agent":
		case "tokens":
			return "agent-management"
		case "users":
			return "account-access"
		case "backups":
		case "logs":
		case "system-logs":
		case "audit":
		case "operation-audit":
		case "advanced":
			return "maintenance"
		case "about":
		case "modules":
		case "general":
			return "foundation"
		default:
			return "foundation"
	}
}

export function getModulesByCategory() {
	const groups = new Map<PulseModuleManifest["category"], PulseModuleManifest[]>()
	for (const module of pulseModules) {
		const group = groups.get(module.category) ?? []
		group.push(module)
		groups.set(module.category, group)
	}
	return [...groups.entries()].map(([category, modules]) => ({ category, modules }))
}
