import { NetworkIcon } from "lucide-react"
import type { PulseModuleManifest } from "../types"

export const networkTopologyModule: PulseModuleManifest = {
	id: "network-topology",
	name: "网络拓扑",
	description: "基于资产中心的家庭网与科技网拓扑、真实接口关系、首页只读总览和独立拓扑编辑页。",
	version: "1.0.6",
	category: "资产",
	defaultEnabled: true,
	required: false,
	dependencies: ["asset-center"],
	routes: ["/network/home", "/network/technology", "/network/edit", "/"],
	collections: ["assets", "asset_interfaces", "asset_relations", "network_topology_layouts"],
	jobs: ["固定拓扑建模", "接口关系映射", "拓扑布局保存"],
	agentCapabilities: ["网络详情", "基础流量"],
	healthChecks: ["拓扑集合", "接口关系", "网络域", "布局集合"],
	sourcePaths: [
		"internal/site/src/components/routes/network.tsx",
		"internal/site/src/components/routes/network-topology-editor.tsx",
		"internal/site/src/components/routes/home-topology-workspace.tsx",
		"internal/site/src/modules/network-topology/editor/editor-model.ts",
		"internal/site/src/modules/network-topology/editor/editor-node.tsx",
		"internal/site/src/modules/network-topology/topology-edge-style.ts",
		"internal/site/src/modules/network-topology/pulse-adapter.ts",
		"internal/site/src/modules/network-topology/use-topology-workspace-data.ts",
		"internal/site/src/modules/network-topology/use-topology-summary.ts",
	],
	icon: NetworkIcon,
}
