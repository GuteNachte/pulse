import { NetworkIcon } from "lucide-react"
import type { PulseModuleManifest } from "../types"

export const networkTopologyModule: PulseModuleManifest = {
	id: "network-topology",
	name: "网络拓扑",
	description: "基于资产中心的家庭网络拓扑、接口关系、布局和首页只读总览。",
	version: "1.0.6",
	category: "资产",
	defaultEnabled: true,
	required: false,
	dependencies: ["asset-center"],
	routes: ["/network/home", "/network/technology", "/"],
	collections: ["assets", "asset_interfaces", "asset_relations", "network_layouts", "system_details"],
	jobs: ["拓扑布局保存", "机器网卡叠加"],
	agentCapabilities: ["网络详情", "基础流量"],
	healthChecks: ["拓扑集合", "布局记录", "网卡详情"],
	sourcePaths: [
		"internal/site/src/components/routes/network.tsx",
		"internal/site/src/components/routes/home-network-topology.tsx",
		"internal/site/src/lib/network-topology.ts",
		"internal/site/src/modules/network-topology/components/topology-workspace.tsx",
		"internal/site/src/modules/network-topology/pulse-adapter.ts",
		"internal/site/src/modules/network-topology/use-topology-workspace-data.ts",
	],
	icon: NetworkIcon,
}
