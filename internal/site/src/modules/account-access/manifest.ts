import { ShieldCheckIcon } from "lucide-react"
import type { PulseModuleManifest } from "../types"

export const accountAccessModule: PulseModuleManifest = {
	id: "account-access",
	name: "账号管理与权限",
	description: "管理用户、角色、登录、MFA 和只读权限，是多用户访问控制边界。",
	version: "1.0.6",
	category: "权限",
	defaultEnabled: true,
	required: true,
	dependencies: ["foundation"],
	routes: ["/settings/users"],
	collections: ["users", "_superusers"],
	jobs: ["登录校验", "权限校验"],
	agentCapabilities: [],
	healthChecks: ["用户集合", "认证配置"],
	sourcePaths: ["internal/site/src/components/routes/settings/users.tsx", "internal/hub/auth_security.go"],
	icon: ShieldCheckIcon,
}
