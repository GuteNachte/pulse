import { FingerprintIcon } from "lucide-react"
import type { PulseModuleManifest } from "../types"

export const assetPresenceModule: PulseModuleManifest = {
	id: "asset-presence",
	name: "设备在线探测",
	description:
		"对登记了管理 IP 的资产做 Hub 侧定时 ping 探测，为拓扑与后续展示提供真实在线/离线状态（手机类不参与判定）。",
	version: "1.0.6",
	category: "监控",
	defaultEnabled: true,
	required: false,
	dependencies: ["asset-center"],
	routes: [],
	collections: ["asset_presence"],
	jobs: ["设备在线探测（每分钟）"],
	agentCapabilities: [],
	healthChecks: ["asset_presence 集合", "探测任务心跳"],
	sourcePaths: ["internal/hub/asset_presence.go"],
	icon: FingerprintIcon,
}
