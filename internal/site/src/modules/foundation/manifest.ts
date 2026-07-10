import { DatabaseIcon } from "lucide-react"
import type { PulseModuleManifest } from "../types"

export const foundationModule: PulseModuleManifest = {
	id: "foundation",
	name: "基础底座",
	description: "PocketBase 基座、Pulse 内核、认证、模块注册、审计和基础运行能力。",
	version: "1.0.6",
	category: "基础底座",
	defaultEnabled: true,
	required: true,
	dependencies: [],
	routes: ["/", "/settings", "/settings/general", "/settings/modules", "/settings/about"],
	collections: ["users", "_superusers", "user_settings", "module_settings", "system_settings", "operation_audit"],
	jobs: ["Hub 启动", "数据库迁移", "模块状态加载"],
	agentCapabilities: [],
	healthChecks: ["集合迁移", "认证状态", "模块状态"],
	sourcePaths: [
		"internal/hub",
		"internal/site/src/modules",
		"internal/site/src/components/routes/settings/modules.tsx",
		"internal/site/src/components/routes/settings/general.tsx",
		"internal/site/src/components/routes/settings/about.tsx",
	],
	icon: DatabaseIcon,
}
