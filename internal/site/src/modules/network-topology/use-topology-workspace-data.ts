import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { isPocketBaseAutoCancel, pb } from "../../lib/api.ts"
import type {
	AssetInterfaceRecord,
	AssetRecord,
	AssetRelationRecord,
	NetworkLayoutRecord,
	SystemDetailsRecord,
	SystemRecord,
} from "../../types.ts"
import { createSuggestedLayout } from "./auto-layout.ts"
import { createEmptyLayout, parseTopologyLayout, type TopologyLayoutV2 } from "./layout-v2.ts"
import { getTopologyLayoutKey, saveTopologyLayout, type SaveTopologyLayoutResult } from "./layout-persistence.ts"
import { buildPulseTopologyGraph, type PulseTopologyGraph } from "./pulse-adapter.ts"
import { loadTopologyData } from "./topology-data-query.ts"
import type { TopologyDomain } from "./topology-domain.ts"
import type { TopologyWorkspaceState } from "./workspace-state.ts"

type TopologyWorkspaceView = {
	graph: PulseTopologyGraph
	layout: TopologyLayoutV2
	layoutRecord?: NetworkLayoutRecord
	layoutPersisted: boolean
}

const EMPTY_GRAPH: PulseTopologyGraph = { nodes: [], edges: [] }

export function useTopologyWorkspaceData(domain: TopologyDomain, systems: SystemRecord[]) {
	const [view, setView] = useState<TopologyWorkspaceView>({
		graph: EMPTY_GRAPH,
		layout: createEmptyLayout(),
		layoutPersisted: true,
	})
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<unknown>()
	const requestIdRef = useRef(0)
	const layoutKey = getTopologyLayoutKey(domain)

	const reload = useCallback(async () => {
		const requestId = ++requestIdRef.current
		setLoading(true)
		setError(undefined)
		try {
			const data = await loadTopologyData({
				collections: {
					assets: pb.collection<AssetRecord>("assets"),
					interfaces: pb.collection<AssetInterfaceRecord>("asset_interfaces"),
					relations: pb.collection<AssetRelationRecord>("asset_relations"),
					layouts: pb.collection<NetworkLayoutRecord>("network_layouts"),
					details: pb.collection<SystemDetailsRecord>("system_details"),
				},
				layoutKey,
			})
			if (requestId !== requestIdRef.current) return

			const storedLayout = parseTopologyLayout(data.layout?.layout)
			const initialGraph = buildPulseTopologyGraph({
				domain,
				assets: data.assets,
				interfaces: data.interfaces,
				relations: data.relations,
				systems,
				details: data.details,
				layout: storedLayout,
			})
			const missingNodeIds = initialGraph.nodes
				.map((node) => node.id)
				.filter((nodeId) => storedLayout.nodes[nodeId] === undefined)
			const suggestedLayout = createSuggestedLayout(initialGraph)
			const layout: TopologyLayoutV2 = {
				...storedLayout,
				nodes: { ...suggestedLayout.nodes, ...storedLayout.nodes },
			}

			setView({
				graph: buildPulseTopologyGraph({
					domain,
					assets: data.assets,
					interfaces: data.interfaces,
					relations: data.relations,
					systems,
					details: data.details,
					layout,
				}),
				layout,
				layoutRecord: data.layout,
				layoutPersisted: Boolean(data.layout) && missingNodeIds.length === 0,
			})
		} catch (loadError) {
			if (requestId !== requestIdRef.current || isPocketBaseAutoCancel(loadError)) return
			setError(loadError)
		} finally {
			if (requestId === requestIdRef.current) setLoading(false)
		}
	}, [domain, layoutKey, systems])

	useEffect(() => {
		reload()
		return () => {
			requestIdRef.current += 1
		}
	}, [reload])

	const save = useCallback(
		async (state: TopologyWorkspaceState): Promise<SaveTopologyLayoutResult> => {
			const userId = pb.authStore.record?.id
			if (!userId) return { status: "failed", error: new Error("当前用户未登录") }
			const result = await saveTopologyLayout({
				record: view.layoutRecord,
				loadedUpdated: state.loadedUpdated,
				layout: state.layout,
				layoutKey,
				userId,
				collection: pb.collection<NetworkLayoutRecord>("network_layouts"),
			})
			if (result.status === "saved") await reload()
			return result
		},
		[layoutKey, reload, view.layoutRecord]
	)

	return useMemo(() => ({ ...view, loading, error, reload, save }), [error, loading, reload, save, view])
}
