export type TopologyPoint = { x: number; y: number }
export type TopologyViewport = TopologyPoint & { zoom: number }

export type TopologyLayoutV2 = {
	version: 2
	nodes: Record<string, TopologyPoint>
	edgeWaypoints: Record<string, TopologyPoint[]>
	viewport: TopologyViewport
}

export type SerializedTopologyLayoutV2 = {
	version: 2
	nodes: Record<string, TopologyPoint>
	edge_waypoints: Record<string, TopologyPoint[]>
	viewport: TopologyViewport
}

const DEFAULT_VIEWPORT: TopologyViewport = { x: 0, y: 0, zoom: 1 }

export function createEmptyLayout(): TopologyLayoutV2 {
	return {
		version: 2,
		nodes: {},
		edgeWaypoints: {},
		viewport: { ...DEFAULT_VIEWPORT },
	}
}

export function parseTopologyLayout(value: unknown): TopologyLayoutV2 {
	if (!isRecord(value)) return createEmptyLayout()
	return {
		version: 2,
		nodes: parsePointRecord(value.nodes),
		edgeWaypoints: parseWaypointRecord(value.edge_waypoints),
		viewport: parseViewport(value.viewport),
	}
}

export function serializeTopologyLayout(layout: TopologyLayoutV2): SerializedTopologyLayoutV2 {
	return {
		version: 2,
		nodes: parsePointRecord(layout.nodes),
		edge_waypoints: parseWaypointRecord(layout.edgeWaypoints),
		viewport: parseViewport(layout.viewport),
	}
}

function parsePointRecord(value: unknown) {
	if (!isRecord(value)) return {}
	const result: Record<string, TopologyPoint> = {}
	for (const [id, point] of Object.entries(value)) {
		const parsed = parsePoint(point)
		if (parsed) result[id] = parsed
	}
	return result
}

function parseWaypointRecord(value: unknown) {
	if (!isRecord(value)) return {}
	const result: Record<string, TopologyPoint[]> = {}
	for (const [id, points] of Object.entries(value)) {
		if (!Array.isArray(points)) continue
		result[id] = points.map(parsePoint).filter((point): point is TopologyPoint => Boolean(point))
	}
	return result
}

function parseViewport(value: unknown): TopologyViewport {
	if (!isRecord(value)) return { ...DEFAULT_VIEWPORT }
	return {
		x: finiteNumber(value.x) ?? DEFAULT_VIEWPORT.x,
		y: finiteNumber(value.y) ?? DEFAULT_VIEWPORT.y,
		zoom: positiveNumber(value.zoom) ?? DEFAULT_VIEWPORT.zoom,
	}
}

function parsePoint(value: unknown): TopologyPoint | undefined {
	if (!isRecord(value)) return undefined
	const x = finiteNumber(value.x)
	const y = finiteNumber(value.y)
	return x === undefined || y === undefined ? undefined : { x, y }
}

function finiteNumber(value: unknown) {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function positiveNumber(value: unknown) {
	const parsed = finiteNumber(value)
	return parsed !== undefined && parsed > 0 ? parsed : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}
