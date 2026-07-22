import type { Edge, Node } from "@xyflow/react"
import type {
	AssetInterfaceRecord,
	AssetRecord,
	AssetRelationRecord,
	SystemDetailsRecord,
	SystemRecord,
} from "../../types.ts"
import type { TopologyPoint } from "./layout-v2.ts"
import type { TopologyLayoutV2 } from "./layout-v2.ts"
import { getRelationDomain, getRelationMedium, type TopologyDomain, type TopologyMedium } from "./topology-domain.ts"
import { assetNodeId } from "./topology-identifiers.ts"

export type PulseTopologyNodeData =
	| {
			kind: "asset"
			asset: AssetRecord
			interfaces: AssetInterfaceRecord[]
			status?: SystemRecord["status"]
			diagnosticCodes: string[]
	  }
	| {
			kind: "placeholder"
			missingAssetId: string
			interfaces: []
			diagnosticCodes: ["missing-asset"]
	  }

export type PulseTopologyEdgeData = {
	relation: AssetRelationRecord
	medium?: TopologyMedium
	sourceInterface?: AssetInterfaceRecord
	targetInterface?: AssetInterfaceRecord
	diagnosticCodes: string[]
	waypoints: TopologyPoint[]
}

export type PulseTopologyGraph = {
	nodes: Node<PulseTopologyNodeData>[]
	edges: Edge<PulseTopologyEdgeData>[]
}

export type PulseTopologyInput = {
	domain: TopologyDomain
	assets: AssetRecord[]
	interfaces: AssetInterfaceRecord[]
	relations: AssetRelationRecord[]
	systems: SystemRecord[]
	details: SystemDetailsRecord[]
	layout: TopologyLayoutV2
}

const LEGACY_TECHNOLOGY_PATTERN = /科技网|单位网|办公网/i

export function buildPulseTopologyGraph({
	domain,
	assets,
	interfaces,
	relations,
	systems,
	details: _details,
	layout,
}: PulseTopologyInput): PulseTopologyGraph {
	const assetsById = new Map(assets.map((item) => [item.id, item]))
	const interfacesById = new Map(interfaces.map((item) => [item.id, item]))
	const interfacesByAssetId = groupInterfacesByAsset(interfaces)
	const systemsByAssetId = new Map(
		systems.filter((system) => system.asset).map((system) => [system.asset as string, system])
	)
	const domainRelations = relations.filter(
		(relation) => isNetworkRelation(relation) && getEffectiveRelationDomain(relation, assetsById) === domain
	)
	const interfaceUseCounts = countInterfaceUses(domainRelations)
	const includedAssetIds = collectIncludedAssetIds(domainRelations, assets, layout)
	const nodes = includedAssetIds.map((assetId) =>
		createNode({
			assetId,
			asset: assetsById.get(assetId),
			interfaces: interfacesByAssetId.get(assetId) ?? [],
			status: systemsByAssetId.get(assetId)?.status,
			layout,
		})
	)
	const edges = domainRelations.map((relation) =>
		createEdge({ relation, assetsById, interfacesById, interfaceUseCounts, layout })
	)

	return { nodes, edges }
}

function getEffectiveRelationDomain(
	relation: AssetRelationRecord,
	assetsById: Map<string, AssetRecord>
): TopologyDomain {
	const explicitDomain = getRelationDomain(relation.metadata)
	if (explicitDomain) return explicitDomain
	const source = assetsById.get(relation.source_asset)
	const target = assetsById.get(relation.target_asset)
	const legacyText = [source?.name, source?.role, target?.name, target?.role, relation.label]
		.filter(Boolean)
		.join(" ")
	return LEGACY_TECHNOLOGY_PATTERN.test(legacyText) ? "technology" : "home"
}

function isNetworkRelation(relation: AssetRelationRecord) {
	return relation.kind === "connected_to" || relation.kind === "depends_on"
}

function collectIncludedAssetIds(
	relations: AssetRelationRecord[],
	assets: AssetRecord[],
	layout: TopologyLayoutV2
) {
	const result: string[] = []
	const seen = new Set<string>()
	const add = (id: string) => {
		if (!id || seen.has(id)) return
		seen.add(id)
		result.push(id)
	}
	for (const relation of relations) {
		add(relation.source_asset)
		add(relation.target_asset)
	}
	for (const asset of assets) {
		if (layout.nodes[assetNodeId(asset.id)]) add(asset.id)
	}
	return result
}

function createNode({
	assetId,
	asset,
	interfaces,
	status,
	layout,
}: {
	assetId: string
	asset?: AssetRecord
	interfaces: AssetInterfaceRecord[]
	status?: SystemRecord["status"]
	layout: TopologyLayoutV2
}): Node<PulseTopologyNodeData> {
	const id = assetNodeId(assetId)
	return {
		id,
		type: "pulseTopologyFree",
		position: clonePoint(layout.nodes[id] ?? { x: 0, y: 0 }),
		data: asset
			? { kind: "asset", asset, interfaces: [...interfaces], status, diagnosticCodes: [] }
			: {
					kind: "placeholder",
					missingAssetId: assetId,
					interfaces: [],
					diagnosticCodes: ["missing-asset"],
				},
	}
}

function createEdge({
	relation,
	assetsById,
	interfacesById,
	interfaceUseCounts,
	layout,
}: {
	relation: AssetRelationRecord
	assetsById: Map<string, AssetRecord>
	interfacesById: Map<string, AssetInterfaceRecord>
	interfaceUseCounts: Map<string, number>
	layout: TopologyLayoutV2
}): Edge<PulseTopologyEdgeData> {
	const sourceInterfaceId = getMetadataString(relation.metadata, "source_interface")
	const targetInterfaceId = getMetadataString(relation.metadata, "target_interface")
	const sourceInterface = getOwnedInterface(interfacesById, sourceInterfaceId, relation.source_asset)
	const targetInterface = getOwnedInterface(interfacesById, targetInterfaceId, relation.target_asset)
	const diagnosticCodes = new Set<string>()
	if (!assetsById.has(relation.source_asset) || !assetsById.has(relation.target_asset)) {
		diagnosticCodes.add("missing-asset")
	}
	if (!sourceInterface || !targetInterface) {
		diagnosticCodes.add("missing-interface")
	}
	if (
		(sourceInterfaceId && (interfaceUseCounts.get(sourceInterfaceId) ?? 0) > 1) ||
		(targetInterfaceId && (interfaceUseCounts.get(targetInterfaceId) ?? 0) > 1)
	) {
		diagnosticCodes.add("interface-conflict")
	}

	return {
		id: relation.id,
		source: assetNodeId(relation.source_asset),
		target: assetNodeId(relation.target_asset),
		type: "pulseTopologyFree",
		data: {
			relation,
			medium: getRelationMedium(relation.metadata),
			sourceInterface,
			targetInterface,
			diagnosticCodes: [...diagnosticCodes],
			waypoints: (layout.edgeWaypoints[relation.id] ?? []).map(clonePoint),
		},
	}
}

function groupInterfacesByAsset(interfaces: AssetInterfaceRecord[]) {
	const groups = new Map<string, AssetInterfaceRecord[]>()
	for (const item of interfaces) {
		const group = groups.get(item.asset) ?? []
		group.push(item)
		groups.set(item.asset, group)
	}
	return groups
}

function countInterfaceUses(relations: AssetRelationRecord[]) {
	const counts = new Map<string, number>()
	for (const relation of relations) {
		for (const key of ["source_interface", "target_interface"] as const) {
			const interfaceId = getMetadataString(relation.metadata, key)
			if (interfaceId) counts.set(interfaceId, (counts.get(interfaceId) ?? 0) + 1)
		}
	}
	return counts
}

function getOwnedInterface(
	interfacesById: Map<string, AssetInterfaceRecord>,
	interfaceId: string,
	assetId: string
) {
	if (!interfaceId) return undefined
	const item = interfacesById.get(interfaceId)
	return item?.asset === assetId ? item : undefined
}

function getMetadataString(metadata: Record<string, unknown> | undefined, key: string) {
	const value = metadata?.[key]
	return typeof value === "string" ? value : ""
}

function clonePoint(point: TopologyPoint): TopologyPoint {
	return { x: point.x, y: point.y }
}
