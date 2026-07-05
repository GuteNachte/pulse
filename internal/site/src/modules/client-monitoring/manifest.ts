import { MonitorIcon } from "lucide-react"
import type { PulseModuleManifest } from "../types"

export const clientMonitoringModule: PulseModuleManifest = {
	id: "client-monitoring",
	name: "客户端监控",
	description: "从资产中心选择需要接入的机器，管理 Agent 配对、机器详情、容器、S.M.A.R.T.、硬件指标和实时状态。",
	version: "1.0.6",
	category: "监控",
	defaultEnabled: true,
	required: false,
	dependencies: ["asset-center", "agent-management"],
	routes: ["/clients", "/system/:id", "/containers", "/smart"],
	collections: [
		"systems",
		"system_details",
		"system_stats",
		"containers",
		"container_stats",
		"smart_devices",
		"agent_pairing_codes",
	],
	jobs: ["系统列表订阅", "Agent 配对", "指标刷新", "容器监控", "SMART 采集"],
	agentCapabilities: ["基础指标", "身份上报", "网络详情", "容器", "SMART", "GPU"],
	healthChecks: ["systems 集合", "Agent 在线状态", "采集能力诊断"],
	sourcePaths: [
		"internal/site/src/components/routes/clients.tsx",
		"internal/site/src/components/routes/system.tsx",
		"internal/site/src/components/routes/containers.tsx",
		"internal/site/src/components/routes/smart.tsx",
		"internal/site/src/components/add-system.tsx",
	],
	icon: MonitorIcon,
}
