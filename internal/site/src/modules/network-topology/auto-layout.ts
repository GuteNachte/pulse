import type { CanvasSnapshot } from "./canvas-core/types.ts"
import { snapTopologyPoint } from "./canvas-core/grid.ts"

export const SUGGESTED_NODE_WIDTH = 240
export const SUGGESTED_COLUMN_GAP = 96
export const SUGGESTED_ROW_GAP = 36

const SUGGESTED_NODE_HEIGHT = 112
const SUGGESTED_ORIGIN_X = 80
const SUGGESTED_ORIGIN_Y = 72

type AutoLayoutGraph = {
	nodes: Array<{
		id: string
		data?: { kind?: string; asset?: { type?: string } }
	}>
	edges: Array<{ id: string; source: string; target: string }>
}

const NETWORK_DEVICE_TYPES = new Set(["ont", "gateway", "router", "firewall", "switch", "ap", "smarthome_gateway"])
const NETWORK_ENTRY_PRIORITY = new Map([
	["internet", 0],
	["ont", 1],
	["gateway", 2],
	["router", 3],
	["firewall", 3],
	["switch", 4],
	["ap", 5],
	["smarthome_gateway", 5],
])

export function createSuggestedLayout(graph: AutoLayoutGraph): CanvasSnapshot {
	const nodeIds = [...new Set(graph.nodes.map((node) => node.id))].sort(compareIds)
	const nodeIdSet = new Set(nodeIds)
	const edges = graph.edges
		.filter((edge) => nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target) && edge.source !== edge.target)
		.slice()
		.sort((a, b) => compareIds(a.source, b.source) || compareIds(a.target, b.target) || compareIds(a.id, b.id))
	const nodesById = new Map(graph.nodes.map((node) => [node.id, node]))
	const infrastructureIds = nodeIds.filter((id) => isInfrastructureNode(nodesById.get(id)))
	const infrastructureIdSet = new Set(infrastructureIds)
	const adjacency = new Map(infrastructureIds.map((id) => [id, [] as string[]]))

	for (const edge of edges) {
		if (!infrastructureIdSet.has(edge.source) || !infrastructureIdSet.has(edge.target)) continue
		adjacency.get(edge.source)?.push(edge.target)
		adjacency.get(edge.target)?.push(edge.source)
	}
	for (const neighbors of adjacency.values()) neighbors.sort(compareIds)

	const depth = createInfrastructureDepths(infrastructureIds, adjacency, nodesById)
	const clientColumn = infrastructureIds.length > 0 ? Math.max(...depth.values()) + 1 : 0

	const nodesByDepth = new Map<number, string[]>()
	for (const id of nodeIds) {
		const column = infrastructureIdSet.has(id) ? (depth.get(id) ?? 0) : clientColumn
		const group = nodesByDepth.get(column) ?? []
		group.push(id)
		nodesByDepth.set(column, group)
	}

	const positions: CanvasSnapshot["nodes"] = {}
	for (const [column, ids] of [...nodesByDepth.entries()].sort(([a], [b]) => a - b)) {
		ids.sort(compareIds)
		for (const [row, id] of ids.entries()) {
			positions[id] = snapTopologyPoint({
				x: SUGGESTED_ORIGIN_X + column * (SUGGESTED_NODE_WIDTH + SUGGESTED_COLUMN_GAP),
				y: SUGGESTED_ORIGIN_Y + row * (SUGGESTED_NODE_HEIGHT + SUGGESTED_ROW_GAP),
			})
		}
	}

	return {
		nodes: positions,
		edgeWaypoints: Object.fromEntries(graph.edges.map((edge) => [edge.id, []])),
	}
}

function createInfrastructureDepths(
	infrastructureIds: string[],
	adjacency: Map<string, string[]>,
	nodesById: Map<string, AutoLayoutGraph["nodes"][number]>
) {
	const depth = new Map<string, number>()
	const remaining = new Set(infrastructureIds)
	while (remaining.size > 0) {
		const component = collectComponent([...remaining].sort(compareIds)[0], adjacency)
		const componentIds = new Set(component)
		for (const id of component) remaining.delete(id)
		const rootPriority = Math.min(...component.map((id) => getEntryPriority(nodesById.get(id))))
		const queue = component.filter((id) => getEntryPriority(nodesById.get(id)) === rootPriority).sort(compareIds)
		for (const id of queue) depth.set(id, 0)
		for (let index = 0; index < queue.length; index += 1) {
			const source = queue[index]
			for (const target of adjacency.get(source) ?? []) {
				if (!componentIds.has(target) || depth.has(target)) continue
				depth.set(target, (depth.get(source) ?? 0) + 1)
				queue.push(target)
			}
		}
	}
	return depth
}

function collectComponent(start: string, adjacency: Map<string, string[]>) {
	const component: string[] = []
	const queue = [start]
	const seen = new Set(queue)
	for (let index = 0; index < queue.length; index += 1) {
		const source = queue[index]
		component.push(source)
		for (const target of adjacency.get(source) ?? []) {
			if (seen.has(target)) continue
			seen.add(target)
			queue.push(target)
		}
	}
	return component
}

function isInfrastructureNode(node: AutoLayoutGraph["nodes"][number] | undefined) {
	const type = getAssetType(node)
	return type === "internet" || NETWORK_DEVICE_TYPES.has(type)
}

function getEntryPriority(node: AutoLayoutGraph["nodes"][number] | undefined) {
	return NETWORK_ENTRY_PRIORITY.get(getAssetType(node)) ?? Number.MAX_SAFE_INTEGER
}

function getAssetType(node: AutoLayoutGraph["nodes"][number] | undefined) {
	return node?.data?.kind === "asset" && typeof node.data.asset?.type === "string" ? node.data.asset.type : ""
}

function compareIds(a: string, b: string) {
	return a.localeCompare(b, "en")
}
