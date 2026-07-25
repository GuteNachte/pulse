import type { AssetInterfaceRecord, AssetRecord, AssetRelationRecord } from "@/types"
import { getMetadataString } from "./asset-schema.ts"

export type AssetNetworkUplinkDisplay = {
	mode: "root" | "linked" | "ambiguous" | "unlinked" | "not_applicable"
	label: string
	peerAssetIds: string[]
}

export type AssetNetworkRelationDirection = "uplink" | "downlink" | "ambiguous"

export const unlinkedAssetNetworkUplink: AssetNetworkUplinkDisplay = {
	mode: "unlinked",
	label: "未关联",
	peerAssetIds: [],
}

export function buildAssetNetworkUplinks(
	assets: AssetRecord[],
	interfaces: AssetInterfaceRecord[],
	relations: AssetRelationRecord[]
) {
	const assetMap = new Map(assets.map((asset) => [asset.id, asset]))
	const interfaceMap = new Map(interfaces.map((assetInterface) => [assetInterface.id, assetInterface]))
	const relationsByAsset = new Map<string, AssetRelationRecord[]>()

	for (const relation of relations) {
		if (relation.kind !== "connected_to") continue
		for (const assetId of [relation.source_asset, relation.target_asset]) {
			relationsByAsset.set(assetId, [...(relationsByAsset.get(assetId) ?? []), relation])
		}
	}

	return new Map(
		assets.map((asset) => [
			asset.id,
			buildAssetNetworkUplink(asset, assetMap, interfaceMap, relationsByAsset.get(asset.id) ?? []),
		])
	)
}

function buildAssetNetworkUplink(
	asset: AssetRecord,
	assetMap: Map<string, AssetRecord>,
	interfaceMap: Map<string, AssetInterfaceRecord>,
	relations: AssetRelationRecord[]
): AssetNetworkUplinkDisplay {
	if (asset.type === "internet") return { mode: "root", label: "互联网", peerAssetIds: [] }
	if (asset.type === "web_endpoint") return { mode: "not_applicable", label: "无", peerAssetIds: [] }
	if (relations.length === 0) return unlinkedAssetNetworkUplink

	const peerAssetIds = relations
		.filter((relation) => getAssetNetworkRelationDirection(asset.id, relation, interfaceMap) === "uplink")
		.map((relation) => getPeerAssetId(asset.id, relation))
		.filter((peerAssetId, index, values) => Boolean(assetMap.get(peerAssetId)) && values.indexOf(peerAssetId) === index)
	const peerAssets = peerAssetIds
		.flatMap((peerAssetId) => {
			const peerAsset = assetMap.get(peerAssetId)
			return peerAsset ? [peerAsset] : []
		})
		.sort((left, right) => left.name.localeCompare(right.name, "zh-CN"))

	if (peerAssets.length === 0) return { mode: "ambiguous", label: "上联未明确", peerAssetIds: [] }
	return {
		mode: "linked",
		label: peerAssets.map((peerAsset) => peerAsset.name).join(" / "),
		peerAssetIds: peerAssets.map((peerAsset) => peerAsset.id),
	}
}

export function getAssetNetworkRelationDirection(
	assetId: string,
	relation: AssetRelationRecord,
	interfaceMap: Map<string, AssetInterfaceRecord>
): AssetNetworkRelationDirection {
	const currentIsSource = relation.source_asset === assetId
	const currentInterface = interfaceMap.get(
		getMetadataString(relation.metadata, currentIsSource ? "source_interface" : "target_interface")
	)
	const peerInterface = interfaceMap.get(
		getMetadataString(relation.metadata, currentIsSource ? "target_interface" : "source_interface")
	)
	const currentRole = getMetadataString(currentInterface?.metadata, "role")
	const peerRole = getMetadataString(peerInterface?.metadata, "role")

	if (currentRole === "uplink") return "uplink"
	if (currentRole === "downlink") return "downlink"
	if (peerRole === "downlink") return "uplink"
	if (peerRole === "uplink") return "downlink"

	const linkKind = getMetadataString(relation.metadata, "link_kind")
	if (linkKind === "internet") return currentIsSource ? "downlink" : "uplink"
	if (linkKind === "wifi") return currentIsSource ? "uplink" : "downlink"
	return "ambiguous"
}

export function resolveAssetNetworkRelationEndpoints(
	relation: AssetRelationRecord,
	interfaceMap: Map<string, AssetInterfaceRecord>
) {
	const sourceInterface = interfaceMap.get(getMetadataString(relation.metadata, "source_interface"))
	const targetInterface = interfaceMap.get(getMetadataString(relation.metadata, "target_interface"))
	const sourceDirection = getAssetNetworkRelationDirection(relation.source_asset, relation, interfaceMap)
	if (sourceDirection === "uplink") {
		return {
			upstreamAssetId: relation.target_asset,
			downstreamAssetId: relation.source_asset,
			upstreamInterface: targetInterface,
			downstreamInterface: sourceInterface,
		}
	}
	return {
		upstreamAssetId: relation.source_asset,
		downstreamAssetId: relation.target_asset,
		upstreamInterface: sourceInterface,
		downstreamInterface: targetInterface,
	}
}

function getPeerAssetId(assetId: string, relation: AssetRelationRecord) {
	return relation.source_asset === assetId ? relation.target_asset : relation.source_asset
}
