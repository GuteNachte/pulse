export const TOPOLOGY_HANDLE_IDS = ["top", "right", "bottom", "left"] as const
export type TopologyHandleId = (typeof TOPOLOGY_HANDLE_IDS)[number]

export function normalizeHandleId(value: unknown): TopologyHandleId {
	return TOPOLOGY_HANDLE_IDS.includes(value as TopologyHandleId) ? (value as TopologyHandleId) : "right"
}
