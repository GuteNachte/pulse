import type { AssetRelationRecord } from "../../types.ts"
import { normalizeHandleId, type TopologyHandleId } from "./canvas-core/handles.ts"

export type TopologyReconnectEndpoint =
	| { id: string; kind: "asset"; assetId: string }
	| { id: string; kind: "line"; relationId: string; ratio: number }

export type TopologyReconnectEdge = {
	id: string
	source: string
	target: string
	sourceHandle?: string | null
	targetHandle?: string | null
	relation: AssetRelationRecord
}

export type TopologyReconnectConnection = {
	source: string
	target: string
	sourceHandle?: string | null
	targetHandle?: string | null
}

type TopologyReconnectFailure = "missing-endpoint" | "line-to-line" | "self-asset" | "self-branch" | "branch-cycle"

export type TopologyReconnectResult =
	| {
			ok: true
			draft: {
				sourceAssetId: string
				targetAssetId: string
				sourceHandle: TopologyHandleId
				targetHandle: TopologyHandleId
				sourceInterface: string
				targetInterface: string
				metadata: Record<string, unknown>
			}
	  }
	| { ok: false; reason: TopologyReconnectFailure }

export function resolveTopologyReconnect({
	edge,
	connection,
	endpoints,
	edges,
}: {
	edge: TopologyReconnectEdge
	connection: TopologyReconnectConnection
	endpoints: TopologyReconnectEndpoint[]
	edges: TopologyReconnectEdge[]
}): TopologyReconnectResult {
	const endpointById = new Map(endpoints.map((endpoint) => [endpoint.id, endpoint]))
	const source = endpointById.get(connection.source)
	const target = endpointById.get(connection.target)
	if (!source || !target) return { ok: false, reason: "missing-endpoint" }
	if (source.kind === "line" && target.kind === "line") return { ok: false, reason: "line-to-line" }
	if (source.kind === "line" && source.relationId === edge.id) return { ok: false, reason: "self-branch" }
	if (target.kind === "line" && target.relationId === edge.id) return { ok: false, reason: "self-branch" }
	if (source.kind === "line" && referencesRelation(source.relationId, edge.id, edges)) {
		return { ok: false, reason: "branch-cycle" }
	}
	if (target.kind === "line" && referencesRelation(target.relationId, edge.id, edges)) {
		return { ok: false, reason: "branch-cycle" }
	}

	const sourceResolution = resolveAssetEndpoint(source, "source", connection.sourceHandle, edges)
	const targetResolution = resolveAssetEndpoint(target, "target", connection.targetHandle, edges)
	if (!sourceResolution || !targetResolution) return { ok: false, reason: "missing-endpoint" }
	if (sourceResolution.assetId === targetResolution.assetId) return { ok: false, reason: "self-asset" }
	const sourceAssetChanged = sourceResolution.assetId !== edge.relation.source_asset
	const targetAssetChanged = targetResolution.assetId !== edge.relation.target_asset

	const sourceChanged =
		connection.source !== edge.source ||
		normalizeHandleId(connection.sourceHandle) !== normalizeHandleId(edge.sourceHandle)
	const targetChanged =
		connection.target !== edge.target ||
		normalizeHandleId(connection.targetHandle, "left") !== normalizeHandleId(edge.targetHandle, "left")
	const metadata = { ...(edge.relation.metadata ?? {}) }
	const sourceInterface = getString(metadata.source_interface)
	const targetInterface = getString(metadata.target_interface)
	if (sourceAssetChanged) {
		metadata.source_interface = ""
	}
	if (targetAssetChanged) {
		metadata.target_interface = ""
	}
	if (sourceChanged) {
		delete metadata.branch_from_relation
		delete metadata.branch_ratio
		delete metadata.branch_endpoint
	}
	if (targetChanged) {
		delete metadata.branch_from_relation
		delete metadata.branch_ratio
		delete metadata.branch_endpoint
	}
	if (source.kind === "line") {
		metadata.branch_from_relation = source.relationId
		metadata.branch_ratio = source.ratio
		metadata.branch_endpoint = "source"
	}
	if (target.kind === "line") {
		metadata.branch_from_relation = target.relationId
		metadata.branch_ratio = target.ratio
		metadata.branch_endpoint = "target"
	}
	metadata.source_handle = sourceResolution.handle
	metadata.target_handle = targetResolution.handle

	return {
		ok: true,
		draft: {
			sourceAssetId: sourceResolution.assetId,
			targetAssetId: targetResolution.assetId,
			sourceHandle: sourceResolution.handle,
			targetHandle: targetResolution.handle,
			sourceInterface: sourceAssetChanged ? "" : sourceInterface,
			targetInterface: targetAssetChanged ? "" : targetInterface,
			metadata,
		},
	}
}

function resolveAssetEndpoint(
	endpoint: TopologyReconnectEndpoint,
	side: "source" | "target",
	handleId: string | null | undefined,
	edges: TopologyReconnectEdge[]
): { assetId: string; handle: TopologyHandleId } | undefined {
	if (endpoint.kind === "asset") {
		return {
			assetId: endpoint.assetId,
			handle: normalizeHandleId(handleId, side === "target" ? "left" : "right"),
		}
	}
	const parent = edges.find((item) => item.id === endpoint.relationId)
	if (!parent) return undefined
	return side === "source"
		? {
				assetId: parent.relation.source_asset,
				handle: normalizeHandleId(parent.sourceHandle, "right"),
			}
		: {
				assetId: parent.relation.target_asset,
				handle: normalizeHandleId(parent.targetHandle, "left"),
			}
}

function referencesRelation(relationId: string, targetId: string, edges: TopologyReconnectEdge[]) {
	const seen = new Set<string>()
	let current = relationId
	while (current && !seen.has(current)) {
		if (current === targetId) return true
		seen.add(current)
		const relation = edges.find((edge) => edge.id === current)?.relation
		const parent = relation?.metadata?.branch_from_relation
		current = typeof parent === "string" ? parent : ""
	}
	return false
}

function getString(value: unknown) {
	return typeof value === "string" ? value : ""
}
