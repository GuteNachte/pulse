import { Globe2Icon } from "lucide-react"
import type { PulseModuleManifest } from "../types"

export const websiteMonitoringModule: PulseModuleManifest = {
	id: "website-monitoring",
	name: "网站监控",
	description: "基于资产中心的网站端点或自定义网页目标，执行内外网可用性检测、历史记录和状态汇总。",
	version: "1.0.6",
	category: "监控",
	defaultEnabled: true,
	required: false,
	dependencies: ["asset-center"],
	routes: ["/websites"],
	collections: ["website_monitors", "website_monitor_checks", "assets"],
	jobs: ["网站定时检测", "检测历史清理"],
	agentCapabilities: [],
	healthChecks: ["网站监控集合", "检测任务"],
	sourcePaths: ["internal/site/src/components/routes/websites.tsx", "internal/hub/website_monitor*.go"],
	icon: Globe2Icon,
}
