import { useStore } from "@nanostores/react"
import { getPagePath } from "@nanostores/router"
import type { Edge, Node } from "@xyflow/react"
import { memo, useCallback, useEffect, useState } from "react"
import { $router, navigate } from "@/components/router"
import { isReadOnlyUser } from "@/lib/api"
import { pageTitle } from "@/lib/branding"
import { $systems } from "@/lib/stores"
import type { TopologyFreeEdgeData } from "@/modules/network-topology/components/topology-free-edge"
import type { TopologyFreeNodeData } from "@/modules/network-topology/components/topology-free-node"
import { TopologyInspectorSheet } from "@/modules/network-topology/components/topology-inspector-sheet"
import { TopologyWorkspace } from "@/modules/network-topology/components/topology-workspace"
import type { TopologyDomain } from "@/modules/network-topology/topology-domain"
import { useTopologyWorkspaceData } from "@/modules/network-topology/use-topology-workspace-data"

const LAST_DOMAIN_STORAGE_KEY = "pulse.network.last-domain"

export default memo(function NetworkTopologyPage({ domain }: { domain?: unknown }) {
	const systems = useStore($systems)
	const routeDomain: TopologyDomain = domain === "technology" ? "technology" : "home"
	const routeDomainValid = domain === "home" || domain === "technology"
	const normalizedDomain = routeDomainValid ? routeDomain : readLastDomain()
	const view = useTopologyWorkspaceData(normalizedDomain, systems)
	const [inspectedNode, setInspectedNode] = useState<Node<TopologyFreeNodeData>>()
	const [inspectedEdge, setInspectedEdge] = useState<Edge<TopologyFreeEdgeData>>()
	const handleNodeOpen = useCallback((node: Node<TopologyFreeNodeData>) => {
		setInspectedNode(node)
		setInspectedEdge(undefined)
	}, [])
	const handleEdgeOpen = useCallback((edge: Edge<TopologyFreeEdgeData>) => {
		setInspectedNode(undefined)
		setInspectedEdge(edge)
	}, [])
	const handleInspectorOpenChange = useCallback((open: boolean) => {
		if (open) return
		setInspectedNode(undefined)
		setInspectedEdge(undefined)
	}, [])

	useEffect(() => {
		document.title = pageTitle(normalizedDomain === "technology" ? "科技网拓扑" : "家庭网络拓扑")
	}, [normalizedDomain])

	useEffect(() => {
		if (routeDomainValid) {
			localStorage.setItem(LAST_DOMAIN_STORAGE_KEY, normalizedDomain)
			return
		}
		navigate(getPagePath($router, "network", { domain: normalizedDomain }))
	}, [normalizedDomain, routeDomainValid])

	return (
		<section className="relative -mb-0 overflow-hidden rounded-lg border border-border/70 bg-card">
			{view.error ? (
				<div className="absolute inset-x-0 top-12 z-10 border-b border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
					网络拓扑加载失败，请稍后刷新重试
				</div>
			) : null}
			<TopologyWorkspace
				domain={normalizedDomain}
				graph={view.graph}
				layout={view.layout}
				loadedUpdated={view.layoutRecord?.updated}
				layoutPersisted={view.layoutPersisted}
				readOnly={isReadOnlyUser()}
				onSave={view.save}
				onRelationsChanged={view.reload}
				onNodeOpen={handleNodeOpen}
				onEdgeOpen={handleEdgeOpen}
			/>
			<TopologyInspectorSheet
				open={Boolean(inspectedNode || inspectedEdge)}
				onOpenChange={handleInspectorOpenChange}
				node={inspectedNode}
				edge={inspectedEdge}
				nodes={view.graph.nodes}
				domain={normalizedDomain}
				readOnly={isReadOnlyUser()}
				onRelationsChanged={view.reload}
			/>
		</section>
	)
})

function readLastDomain(): TopologyDomain {
	const stored = localStorage.getItem(LAST_DOMAIN_STORAGE_KEY)
	return stored === "technology" ? "technology" : "home"
}
