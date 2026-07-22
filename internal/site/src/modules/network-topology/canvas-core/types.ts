import type { TopologyPoint } from "../layout-v2.ts"

export type CanvasSnapshot = {
	nodes: Record<string, TopologyPoint>
	edgeWaypoints: Record<string, TopologyPoint[]>
}

export type TopologyPathStyle = "orthogonal" | "smooth"
