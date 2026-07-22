import type { TopologyPoint } from "../layout-v2.ts"
import type { TopologyPathStyle } from "./types.ts"

export function translateWaypoints(points: TopologyPoint[], delta: TopologyPoint) {
	return points.map((point) => ({ x: point.x + delta.x, y: point.y + delta.y }))
}

export function snapWaypoint45(origin: TopologyPoint, point: TopologyPoint): TopologyPoint {
	const dx = point.x - origin.x
	const dy = point.y - origin.y
	if (Math.abs(Math.abs(dx) - Math.abs(dy)) > 4) return { ...point }
	const distance = Math.max(Math.abs(dx), Math.abs(dy))
	return {
		x: origin.x + Math.sign(dx || 1) * distance,
		y: origin.y + Math.sign(dy || 1) * distance,
	}
}

export function buildWaypointPath(points: TopologyPoint[], style: TopologyPathStyle) {
	if (points.length === 0) return ""
	const [first, ...rest] = points
	if (style === "orthogonal" || points.length < 3) {
		return [`M ${formatPoint(first)}`, ...rest.map((point) => `L ${formatPoint(point)}`)].join(" ")
	}
	if (points.length === 3) {
		return `M ${formatPoint(points[0])} Q ${formatPoint(points[1])} ${formatPoint(points[2])}`
	}
	const commands = [`M ${formatPoint(first)}`]
	for (let index = 1; index < points.length - 1; index += 1) {
		const current = points[index]
		const next = points[index + 1]
		const endpoint = index === points.length - 2 ? next : midpoint(current, next)
		commands.push(`Q ${formatPoint(current)} ${formatPoint(endpoint)}`)
	}
	return commands.join(" ")
}

function midpoint(a: TopologyPoint, b: TopologyPoint): TopologyPoint {
	return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function formatPoint(point: TopologyPoint) {
	return `${point.x} ${point.y}`
}
