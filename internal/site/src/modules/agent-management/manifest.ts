import { CableIcon } from "lucide-react"
import type { PulseModuleManifest } from "../types"

export const agentManagementModule: PulseModuleManifest = {
	id: "agent-management",
	name: "Agent 管理",
	description: "管理 Agent 配对码、安装模板、版本仓库、安装命令和 Agent 更新。",
	version: "1.0.6",
	category: "接入",
	defaultEnabled: true,
	required: false,
	dependencies: ["foundation"],
	routes: ["/settings/agent"],
	collections: ["agent_releases", "agent_pairing_codes"],
	jobs: ["Agent 版本同步", "安装模板生成"],
	agentCapabilities: [],
	healthChecks: ["Agent 版本仓库", "配对码生成"],
	sourcePaths: ["internal/site/src/components/routes/settings/agent.tsx", "internal/hub/agent_*.go"],
	icon: CableIcon,
}
