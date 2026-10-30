import type { AssetInterfaceRecord, AssetRelationRecord } from "@/types"
import { getMetadataString } from "./asset-schema.ts"

export type AssetNetworkRelationDirection = "uplink" | "downlink" | "ambiguous"

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
