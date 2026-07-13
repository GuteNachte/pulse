import { Globe2Icon } from "lucide-react"
import type { PulseModuleManifest } from "../types"

export const websiteMonitoringModule: PulseModuleManifest = {
	id: "website-monitoring",
	name: "互联网服务监控",
	description: "基于资产中心的互联网服务主档，检测网站、API、中转站和管理后台的内外网可用性、历史记录和状态。",
	version: "1.0.6",
	category: "监控",
	defaultEnabled: true,
	required: false,
	dependencies: ["asset-center"],
	routes: ["/websites"],
	collections: ["website_monitors", "website_monitor_checks", "assets"],
	jobs: ["网站定时检测", "检测历史清理"],
	agentCapabilities: [],
	healthChecks: ["互联网服务监控集合", "检测任务"],
	sourcePaths: ["internal/site/src/components/routes/websites.tsx", "internal/hub/website_monitor*.go"],
	icon: Globe2Icon,
}
