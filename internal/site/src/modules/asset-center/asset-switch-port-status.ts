import type { AssetInterfaceRecord, AssetRecord, AssetRelationRecord } from "@/types"
import {
	formatAssetInterfaceKind,
	formatAssetInterfaceSpeed,
	isAssetInterfaceEnabled,
} from "./asset-interface-display.ts"
import { getMetadataString } from "./asset-schema.ts"
import type { AssetParameterRow } from "./components/asset-parameter-columns"

const switchPortKinds = new Set<AssetInterfaceRecord["kind"]>(["ethernet", "optical", "lan", "wan"])
const portNameCollator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" })

export function buildSwitchPortStatusRows(
	asset: AssetRecord,
	interfaces: AssetInterfaceRecord[],
	assets: AssetRecord[],
	relations: AssetRelationRecord[]
): AssetParameterRow[] {
	if (asset.type !== "switch") return []
	const ports = interfaces
		.filter((item) => item.asset === asset.id && switchPortKinds.has(item.kind))
		.slice()
		.sort((left, right) => {
			const mediumOrder = getSwitchPortMediumOrder(left) - getSwitchPortMediumOrder(right)
			return mediumOrder || portNameCollator.compare(left.name || left.id, right.name || right.id)
		})
	if (ports.length === 0) return []

	const assetMap = new Map(assets.map((item) => [item.id, item]))
	return ports.map((port, index) => buildSwitchPortRow(asset.id, port, index, assetMap, relations))
}

function getSwitchPortMediumOrder(port: AssetInterfaceRecord) {
	return port.kind === "optical" ? 1 : 0
}

function buildSwitchPortRow(
	assetId: string,
	port: AssetInterfaceRecord,
	index: number,
	assetMap: Map<string, AssetRecord>,
	relations: AssetRelationRecord[]
): AssetParameterRow {
	const enabled = isAssetInterfaceEnabled(port)
	const connected = port.connected === true
	const negotiatedSpeed = Number(port.metadata?.negotiated_speed_mbps)
	const speedLabel =
		connected && Number.isFinite(negotiatedSpeed) && negotiatedSpeed > 0
			? `协商 ${formatAssetInterfaceSpeed(negotiatedSpeed)}`
			: port.speed_mbps
				? `支持 ${formatAssetInterfaceSpeed(port.speed_mbps)}`
				: "速率未确认"
	const connectionNote = getMetadataString(port.metadata, "connection_note")
	const peerName = connected ? getConnectedPeerName(assetId, port.id, assetMap, relations) : ""
	const connectionDetail = connected ? peerName || connectionNote || "对端未关联" : connectionNote
	const segments = [
		formatAssetInterfaceKind(port.kind),
		enabled ? "启用" : "未启用",
		connected ? "已接线" : "未接线",
		formatSwitchPortRole(getMetadataString(port.metadata, "role")),
		speedLabel,
		connectionDetail,
	].filter((value, segmentIndex, values): value is string => Boolean(value) && values.indexOf(value) === segmentIndex)
	return {
		label: port.name || `端口 ${index + 1}`,
		value: segments.join(" · "),
		section: "端口明细",
	}
}

function getConnectedPeerName(
	assetId: string,
	interfaceId: string,
	assetMap: Map<string, AssetRecord>,
	relations: AssetRelationRecord[]
) {
	const relation = relations.find((item) => {
		if (item.kind !== "connected_to") return false
		if (item.source_asset === assetId) {
			return getMetadataString(item.metadata, "source_interface") === interfaceId
		}
		if (item.target_asset === assetId) {
			return getMetadataString(item.metadata, "target_interface") === interfaceId
		}
		return false
	})
	if (!relation) return ""
	const currentIsSource = relation.source_asset === assetId
	const peerAssetId = currentIsSource ? relation.target_asset : relation.source_asset
	const peerExpandKey = currentIsSource ? "target_asset" : "source_asset"
	const expandedPeer = relation.expand?.[peerExpandKey]
	const peerAsset =
		assetMap.get(peerAssetId) ??
		(expandedPeer && !Array.isArray(expandedPeer) ? (expandedPeer as AssetRecord) : undefined)
	return peerAsset?.name?.trim() ?? ""
}

function formatSwitchPortRole(role: string) {
	switch (role) {
		case "uplink":
			return "上联"
		case "downlink":
			return "下联"
		case "general":
			return "通用"
		default:
			return "角色未确认"
	}
}
