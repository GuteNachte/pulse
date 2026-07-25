import type { TopologyPoint } from "../layout-v2.ts"
import type { TopologyMedium } from "../topology-domain.ts"

const CONNECTION_NODE_SPACING = 300

export function getTopologyEdgePathPoints(points: TopologyPoint[], _medium: TopologyMedium): TopologyPoint[] {
	return getOrthogonalPoints(points)
}

export function getTopologyPathMidpoint(points: TopologyPoint[]): TopologyPoint {
	if (points.length === 0) return { x: 0, y: 0 }
	if (points.length === 1) return { ...points[0] }
	const segments = points.slice(0, -1).map((start, index) => {
		const end = points[index + 1]
		return { start, end, length: Math.hypot(end.x - start.x, end.y - start.y) }
	})
	const targetDistance = segments.reduce((total, segment) => total + segment.length, 0) / 2
	let traversed = 0
	for (const segment of segments) {
		if (segment.length === 0) continue
		if (traversed + segment.length >= targetDistance) {
			const ratio = (targetDistance - traversed) / segment.length
			return {
				x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
				y: segment.start.y + (segment.end.y - segment.start.y) * ratio,
			}
		}
		traversed += segment.length
	}
	const lastPoint = points.at(-1)
	return lastPoint ? { ...lastPoint } : { x: 0, y: 0 }
}

/** Returns temporary connection targets distributed across the actual orthogonal path. */
export function getTopologyConnectionNodePoints(points: TopologyPoint[]): TopologyPoint[] {
	const length = getTopologyPathLength(points)
	if (length === 0) return []
	const count = Math.max(1, Math.floor(length / CONNECTION_NODE_SPACING))
	return Array.from({ length: count }, (_, index) => getTopologyPathPointAtRatio(points, (index + 1) / (count + 1)))
}

export function getTopologyPathPointAtRatio(points: TopologyPoint[], ratio: number): TopologyPoint {
	if (points.length === 0) return { x: 0, y: 0 }
	if (points.length === 1) return { ...points[0] }
	const clampedRatio = Math.min(1, Math.max(0, ratio))
	const length = getTopologyPathLength(points)
	if (length === 0) return { ...points[0] }
	return getTopologyPathPointAtDistance(points, length * clampedRatio)
}

function getTopologyPathLength(points: TopologyPoint[]) {
	return points.slice(0, -1).reduce((total, start, index) => {
		const end = points[index + 1]
		return total + Math.hypot(end.x - start.x, end.y - start.y)
	}, 0)
}

function getTopologyPathPointAtDistance(points: TopologyPoint[], distance: number): TopologyPoint {
	let traversed = 0
	for (let index = 0; index < points.length - 1; index += 1) {
		const start = points[index]
		const end = points[index + 1]
		const segmentLength = Math.hypot(end.x - start.x, end.y - start.y)
		if (segmentLength === 0) continue
		if (traversed + segmentLength >= distance) {
			const ratio = (distance - traversed) / segmentLength
			return {
				x: start.x + (end.x - start.x) * ratio,
				y: start.y + (end.y - start.y) * ratio,
			}
		}
		traversed += segmentLength
	}
	return { ...(points.at(-1) ?? { x: 0, y: 0 }) }
}

export function getTopologyWaypointAddPoint(
	start: TopologyPoint,
	end: TopologyPoint,
	medium: TopologyMedium
): TopologyPoint {
	const route = getTopologyEdgePathPoints([start, end], medium)
	let longestStart = route[0]
	let longestEnd = route[1]
	let longestDistance = -1
	for (let index = 0; index < route.length - 1; index += 1) {
		const current = route[index]
		const next = route[index + 1]
		const distance = Math.abs(next.x - current.x) + Math.abs(next.y - current.y)
		if (distance > longestDistance) {
			longestStart = current
			longestEnd = next
			longestDistance = distance
		}
	}
	return getMidpoint(longestStart, longestEnd)
}

function getOrthogonalPoints(points: TopologyPoint[]) {
	const result: TopologyPoint[] = [{ ...points[0] }]
	for (let index = 1; index < points.length; index += 1) {
		const previous = result.at(-1) ?? points[index - 1]
		const next = points[index]
		if (previous.x !== next.x && previous.y !== next.y) {
			result.push({ x: next.x, y: previous.y })
		}
		result.push({ ...next })
	}
	return result
}

function getMidpoint(a: TopologyPoint, b: TopologyPoint) {
	return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}
