import type { TopologyPoint } from "../layout-v2.ts"

export const TOPOLOGY_HANDLE_IDS = ["top", "right", "bottom", "left"] as const
export type TopologyHandleId = (typeof TOPOLOGY_HANDLE_IDS)[number]

export function normalizeHandleId(value: unknown, fallback: TopologyHandleId = "right"): TopologyHandleId {
	return TOPOLOGY_HANDLE_IDS.includes(value as TopologyHandleId) ? (value as TopologyHandleId) : fallback
}

export function resolveTopologyEdgeHandles({
	sourcePosition,
	targetPosition,
	sourceHandle,
	targetHandle,
}: {
	sourcePosition: TopologyPoint
	targetPosition: TopologyPoint
	sourceHandle?: unknown
	targetHandle?: unknown
}): { sourceHandle: TopologyHandleId; targetHandle: TopologyHandleId } {
	const inferred = inferFacingHandles(sourcePosition, targetPosition)
	return {
		sourceHandle: isTopologyHandleId(sourceHandle) ? sourceHandle : inferred.sourceHandle,
		targetHandle: isTopologyHandleId(targetHandle) ? targetHandle : inferred.targetHandle,
	}
}

function inferFacingHandles(source: TopologyPoint, target: TopologyPoint) {
	const dx = target.x - source.x
	const dy = target.y - source.y
	if (Math.abs(dx) >= Math.abs(dy)) {
		return dx >= 0
			? { sourceHandle: "right" as const, targetHandle: "left" as const }
			: { sourceHandle: "left" as const, targetHandle: "right" as const }
	}
	return dy >= 0
		? { sourceHandle: "bottom" as const, targetHandle: "top" as const }
		: { sourceHandle: "top" as const, targetHandle: "bottom" as const }
}

function isTopologyHandleId(value: unknown): value is TopologyHandleId {
	return TOPOLOGY_HANDLE_IDS.includes(value as TopologyHandleId)
}
