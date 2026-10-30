import { useEffect, useState } from "react"
import { isPocketBaseAutoCancel, pb } from "@/lib/api"
import { normalizeTopologyCanvases, type TopologyLayout } from "./editor/editor-model"

// 展示页读取编辑页保存的节点位置、隐藏状态和画布缩放；没有布局记录时继续用自动布局。
export function useTopologyLayout() {
	const [layout, setLayout] = useState<TopologyLayout | null>(null)

	useEffect(() => {
		const userId = pb.authStore.record?.id
		if (!userId) return
		let ignore = false
		pb.collection<{ nodes?: unknown; canvases?: unknown }>("network_topology_layouts")
			.getFirstListItem(`user="${userId}"`)
			.then((record) => {
				if (ignore) return
				setLayout({
					nodes: Array.isArray(record.nodes) ? (record.nodes as TopologyLayout["nodes"]) : [],
					canvases: normalizeTopologyCanvases(record.canvases),
				})
			})
			.catch((error) => {
				if (ignore || isPocketBaseAutoCancel(error)) return
				if ((error as { status?: number })?.status !== 404) {
					console.warn("load topology layout", error)
				}
			})
		return () => {
			ignore = true
		}
	}, [])

	return layout
}
