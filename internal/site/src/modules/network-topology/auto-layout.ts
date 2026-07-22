import type { CanvasSnapshot } from "./canvas-core/types.ts"

export const SUGGESTED_NODE_WIDTH = 240
export const SUGGESTED_COLUMN_GAP = 96
export const SUGGESTED_ROW_GAP = 36

const SUGGESTED_NODE_HEIGHT = 112
const SUGGESTED_ORIGIN_X = 80
const SUGGESTED_ORIGIN_Y = 72

type AutoLayoutGraph = {
	nodes: Array<{ id: string }>
	edges: Array<{ id: string; source: string; target: string }>
}

export function createSuggestedLayout(graph: AutoLayoutGraph): CanvasSnapshot {
	const nodeIds = [...new Set(graph.nodes.map((node) => node.id))].sort(compareIds)
	const nodeIdSet = new Set(nodeIds)
	const edges = graph.edges
		.filter((edge) => nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target) && edge.source !== edge.target)
		.slice()
		.sort((a, b) => compareIds(a.source, b.source) || compareIds(a.target, b.target) || compareIds(a.id, b.id))
	const outgoing = new Map(nodeIds.map((id) => [id, [] as string[]]))
	const inDegree = new Map(nodeIds.map((id) => [id, 0]))
	const depth = new Map(nodeIds.map((id) => [id, 0]))

	for (const edge of edges) {
		outgoing.get(edge.source)?.push(edge.target)
		inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1)
	}
	for (const targets of outgoing.values()) targets.sort(compareIds)

	const queue = nodeIds.filter((id) => inDegree.get(id) === 0)
	const processed = new Set<string>()
	while (queue.length > 0) {
		queue.sort(compareIds)
		const source = queue.shift()
		if (!source) break
		processed.add(source)
		for (const target of outgoing.get(source) ?? []) {
			depth.set(target, Math.max(depth.get(target) ?? 0, (depth.get(source) ?? 0) + 1))
			const nextInDegree = (inDegree.get(target) ?? 0) - 1
			inDegree.set(target, nextInDegree)
			if (nextInDegree === 0) queue.push(target)
		}
	}

	let fallbackDepth = Math.max(0, ...depth.values()) + 1
	for (const id of nodeIds) {
		if (processed.has(id)) continue
		depth.set(id, fallbackDepth)
		fallbackDepth += 1
	}

	const nodesByDepth = new Map<number, string[]>()
	for (const id of nodeIds) {
		const column = depth.get(id) ?? 0
		const group = nodesByDepth.get(column) ?? []
		group.push(id)
		nodesByDepth.set(column, group)
	}

	const positions: CanvasSnapshot["nodes"] = {}
	for (const [column, ids] of [...nodesByDepth.entries()].sort(([a], [b]) => a - b)) {
		ids.sort(compareIds)
		for (const [row, id] of ids.entries()) {
			positions[id] = {
				x: SUGGESTED_ORIGIN_X + column * (SUGGESTED_NODE_WIDTH + SUGGESTED_COLUMN_GAP),
				y: SUGGESTED_ORIGIN_Y + row * (SUGGESTED_NODE_HEIGHT + SUGGESTED_ROW_GAP),
			}
		}
	}

	return {
		nodes: positions,
		edgeWaypoints: Object.fromEntries(graph.edges.map((edge) => [edge.id, []])),
	}
}

function compareIds(a: string, b: string) {
	return a.localeCompare(b, "en")
}
