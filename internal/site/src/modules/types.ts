import type { ComponentType, SVGProps } from "react"

export type PulseModuleId =
	| "foundation"
	| "asset-center"
	| "smarthome"
	| "client-monitoring"
	| "website-monitoring"
	| "alerts"
	| "notifications"
	| "agent-management"
	| "network-topology"
	| "account-access"
	| "maintenance"

export type PulseModuleCategory = "基础底座" | "资产" | "监控" | "告警" | "接入" | "权限" | "维护"

export type PulseModuleStatus = "required" | "enabled" | "disabled" | "blocked"

export type PulseModuleManifest = {
	id: PulseModuleId
	name: string
	description: string
	version: string
	category: PulseModuleCategory
	defaultEnabled: boolean
	required: boolean
	dependencies: PulseModuleId[]
	routes: string[]
	collections: string[]
	jobs: string[]
	agentCapabilities: string[]
	healthChecks: string[]
	sourcePaths: string[]
	icon?: ComponentType<SVGProps<SVGSVGElement>>
}

export type PulseModuleRuntimeState = {
	id: PulseModuleId
	enabled: boolean
	effectiveEnabled: boolean
	status: PulseModuleStatus
	blockedBy: PulseModuleId[]
	recordId?: string
	updated?: string
}
