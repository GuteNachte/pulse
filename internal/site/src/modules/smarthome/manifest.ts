import { HousePlugIcon } from "lucide-react"
import type { PulseModuleManifest } from "../types"

export const smarthomeModule: PulseModuleManifest = {
	id: "smarthome",
	name: "智能家居",
	description: "基于资产中心查看智能家居网关、灯具、插座、传感器、门锁和扫地机器人等设备档案。",
	version: "1.0.6",
	category: "资产",
	defaultEnabled: true,
	required: false,
	dependencies: ["asset-center"],
	routes: ["/smarthome"],
	collections: ["assets", "asset_relations"],
	jobs: [],
	agentCapabilities: [],
	healthChecks: ["智能家居资产", "网关关系", "房间归档"],
	sourcePaths: ["internal/site/src/modules/smarthome/page.tsx", "internal/site/src/modules/smarthome/manifest.ts"],
	icon: HousePlugIcon,
}
