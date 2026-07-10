import { WrenchIcon } from "lucide-react"
import type { PulseModuleManifest } from "../types"

export const maintenanceModule: PulseModuleManifest = {
	id: "maintenance",
	name: "备份、日志与审计",
	description: "集中管理备份恢复、系统日志、操作审计、高级维护和运行诊断。",
	version: "1.0.6",
	category: "维护",
	defaultEnabled: true,
	required: false,
	dependencies: ["foundation"],
	routes: [
		"/settings/backups",
		"/settings/logs",
		"/settings/system-logs",
		"/settings/audit",
		"/settings/operation-audit",
		"/settings/advanced",
	],
	collections: ["operation_audit", "operation_actions"],
	jobs: ["备份恢复", "日志读取", "审计记录"],
	agentCapabilities: [],
	healthChecks: ["备份入口", "日志入口", "审计集合"],
	sourcePaths: [
		"internal/site/src/components/routes/settings/backups.tsx",
		"internal/site/src/components/routes/settings/logs.tsx",
		"internal/site/src/components/routes/settings/operation-audit.tsx",
		"internal/site/src/components/routes/settings/advanced.tsx",
	],
	icon: WrenchIcon,
}
