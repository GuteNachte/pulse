import { SendIcon } from "lucide-react"
import type { PulseModuleManifest } from "../types"

export const notificationsModule: PulseModuleManifest = {
	id: "notifications",
	name: "通知模块",
	description: "管理通知通道、发送诊断、失败记录和告警触达状态。",
	version: "1.0.6",
	category: "告警",
	defaultEnabled: true,
	required: false,
	dependencies: ["alerts"],
	routes: ["/notifications", "/settings/notifications"],
	collections: ["notification_failures", "notification_channel_health", "alert_notification_states"],
	jobs: ["通知发送", "通道健康检查", "失败诊断"],
	agentCapabilities: [],
	healthChecks: ["通知通道", "发送失败队列"],
	sourcePaths: [
		"internal/site/src/components/routes/notifications.tsx",
		"internal/site/src/components/routes/settings/notifications.tsx",
	],
	icon: SendIcon,
}
