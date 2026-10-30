import { BellIcon } from "lucide-react"
import type { PulseModuleManifest } from "../types"

export const alertsModule: PulseModuleManifest = {
	id: "alerts",
	name: "告警中心",
	description: "告警规则、当前告警、历史告警、通知触发和失败诊断。",
	version: "1.0.6",
	category: "告警",
	defaultEnabled: true,
	required: false,
	dependencies: ["client-monitoring"],
	routes: ["/alerts"],
	collections: ["alerts", "alerts_history", "alert_policies"],
	jobs: ["告警刷新", "告警历史维护"],
	agentCapabilities: [],
	healthChecks: ["告警集合", "告警规则"],
	sourcePaths: ["internal/site/src/components/routes/alerts.tsx"],
	icon: BellIcon,
}
