import { DatabaseIcon } from "lucide-react"
import type { PulseModuleManifest } from "../types"

export const foundationModule: PulseModuleManifest = {
	id: "foundation",
	name: "基础底座",
	description: "Pulse 内核：初始化 PocketBase，管理模块注册、全局基础设置、关于页和基础运行能力。",
	version: "1.0.6",
	category: "基础底座",
	defaultEnabled: true,
	required: true,
	dependencies: [],
	routes: ["/", "/settings", "/settings/general", "/settings/modules", "/settings/about"],
	collections: ["users", "_superusers", "user_settings", "module_settings", "system_settings"],
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
