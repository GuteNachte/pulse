import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { isPocketBaseAutoCancel, pb } from "../../lib/api.ts"
import type {
	AssetInterfaceRecord,
	AssetPresenceRecord,
	AssetRecord,
	AssetRelationRecord,
	SystemRecord,
} from "../../types.ts"
import { buildPulseTopologyGraph, type PulseTopologyGraph } from "./pulse-adapter.ts"
import { loadTopologyData } from "./topology-data-query.ts"
import type { TopologyDomain } from "./topology-domain.ts"

type TopologyWorkspaceView = {
	graph: PulseTopologyGraph
}

const EMPTY_GRAPH: PulseTopologyGraph = { nodes: [], edges: [] }

export function useTopologyWorkspaceData(domain: TopologyDomain, systems: SystemRecord[]) {
	const [view, setView] = useState<TopologyWorkspaceView>({
		graph: EMPTY_GRAPH,
	})
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<unknown>()
	const requestIdRef = useRef(0)

	const reload = useCallback(
		async (options?: { silent?: boolean }) => {
			const requestId = ++requestIdRef.current
			if (!options?.silent) setLoading(true)
			setError(undefined)
			try {
				const data = await loadTopologyData({
					collections: {
						assets: pb.collection<AssetRecord>("assets"),
						interfaces: pb.collection<AssetInterfaceRecord>("asset_interfaces"),
						relations: pb.collection<AssetRelationRecord>("asset_relations"),
						presence: pb.collection<AssetPresenceRecord>("asset_presence"),
					},
				})
				if (requestId !== requestIdRef.current) return

				setView({
					graph: buildPulseTopologyGraph({
						domain,
						assets: data.assets,
						interfaces: data.interfaces,
						relations: data.relations,
						systems,
						presence: data.presence,
					}),
				})
			} catch (loadError) {
				if (requestId !== requestIdRef.current || isPocketBaseAutoCancel(loadError)) return
				setError(loadError)
			} finally {
				if (requestId === requestIdRef.current) setLoading(false)
			}
		},
		[domain, systems]
	)

	useEffect(() => {
		reload()
		return () => {
			requestIdRef.current += 1
		}
	}, [reload])

	const saveWanInterface = useCallback(
		async (nodeId: string, interfaceId: string) => {
			const node = view.graph.nodes.find((item) => item.id === nodeId)
			if (node?.data.kind !== "asset") throw new Error("网络设备不存在")
			const selected = node.data.interfaces.find((item) => item.id === interfaceId && item.kind !== "wifi")
			if (!selected) throw new Error("WAN 接口不存在")
			const nodeIdsByAssetId = new Map(
				view.graph.nodes.flatMap((item) => (item.data.kind === "asset" ? [[item.data.asset.id, item.id] as const] : []))
			)
			const internetNodeIds = new Set(
				view.graph.nodes
					.filter((item) => item.data.kind === "asset" && item.data.asset.type === "internet")
					.map((item) => item.id)
			)
			const internetEdge = view.graph.edges.find(
				(edge) =>
					(edge.source === nodeId && internetNodeIds.has(edge.target)) ||
					(edge.target === nodeId && internetNodeIds.has(edge.source))
			)

			const updates: Promise<unknown>[] = node.data.interfaces
				.filter((item) => item.kind !== "wifi")
				.flatMap((item) => {
					const currentRole = item.metadata?.topology_role
					const builtInWan = item.kind === "wan" || item.kind === "pon" || item.metadata?.role === "wan"
					const nextRole = item.id === interfaceId ? "wan" : currentRole === "wan" || builtInWan ? "lan" : currentRole
					if (nextRole === currentRole) return []
					return [
						pb.collection<AssetInterfaceRecord>("asset_interfaces").update(item.id, {
							metadata: { ...item.metadata, topology_role: nextRole },
						}),
					]
				})
			if (internetEdge?.data?.relation) {
				const relation = internetEdge.data.relation
				const networkIsSource = nodeIdsByAssetId.get(relation.source_asset) === nodeId
				updates.push(
					pb.collection<AssetRelationRecord>("asset_relations").update(relation.id, {
						metadata: {
							...relation.metadata,
							[networkIsSource ? "source_interface" : "target_interface"]: interfaceId,
						},
					})
				)
			}
			await Promise.all(updates)
			await reload()
		},
		[reload, view.graph.edges, view.graph.nodes]
	)

	return useMemo(
		() => ({ ...view, loading, error, reload, saveWanInterface }),
		[error, loading, reload, saveWanInterface, view]
	)
}
