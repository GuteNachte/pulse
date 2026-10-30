import { RadarIcon } from "lucide-react"
import type { PulseModuleManifest } from "../types"

export const assetMonitoringModule: PulseModuleManifest = {
	id: "asset-monitoring",
	name: "资产监控",
	description: "从资产中心统一接入和管理主机 Agent、网站 HTTP 监控，展示六态监控状态和完整体检详情。",
	version: "1.0.6",
	category: "监控",
	defaultEnabled: true,
	required: false,
	dependencies: ["asset-center"],
	routes: ["/monitoring"],
	collections: [
		"asset_monitor_bindings",
		"systems",
		"system_stats",
		"containers",
		"smart_devices",
		"website_monitors",
		"website_monitor_checks",
	],
	jobs: ["监控绑定状态同步", "绑定与 provider 对账"],
	agentCapabilities: ["基础指标", "容器", "S.M.A.R.T.", "GPU", "网站 HTTP 检测"],
	healthChecks: ["asset_monitor_bindings 集合", "绑定唯一性", "provider 状态同步"],
	sourcePaths: [
		"internal/site/src/modules/asset-monitoring",
		"internal/hub/asset_monitoring.go",
		"internal/hub/asset_monitoring_api.go",
	],
	icon: RadarIcon,
}
