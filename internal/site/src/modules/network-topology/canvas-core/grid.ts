import type { TopologyPoint } from "../layout-v2.ts"

export const TOPOLOGY_GRID_SIZE = 24
export const TOPOLOGY_SNAP_GRID: [number, number] = [TOPOLOGY_GRID_SIZE, TOPOLOGY_GRID_SIZE]

export function snapTopologyPoint(point: TopologyPoint): TopologyPoint {
	return {
		x: snapCoordinate(point.x),
		y: snapCoordinate(point.y),
	}
}

function snapCoordinate(value: number) {
	return Math.round(value / TOPOLOGY_GRID_SIZE) * TOPOLOGY_GRID_SIZE
}
