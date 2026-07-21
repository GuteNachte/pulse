import type { AssetInterfaceRecord, AssetRecord, AssetRelationRecord } from "@/types"
import { buildAssetParameterGroups } from "./asset-detail-parameter-groups.ts"
import { formatAssetInterfaceKind, formatAssetInterfaceSpeed } from "./asset-interface-display.ts"
import { getAssetNetworkRelationDirection } from "./asset-network-uplink.ts"
import { NETWORK_ASSET_TYPES, getMetadataString } from "./asset-schema.ts"

export type NetworkDeviceDetailModel = {
	capabilitySections: NetworkCapabilitySection[]
	interfaces: NetworkInterfaceRow[]
	relations: NetworkRelationRow[]
}

export type NetworkCapabilitySection = {
	id: string
	title: string
	rows: { label: string; value: string }[]
}

export type NetworkInterfaceState = "enabled" | "disabled" | "unrecorded"
export type NetworkConnectionState = "connected" | "disconnected" | "unrecorded"
export type NetworkRelationDirection = "uplink" | "downlink" | "ambiguous" | "other"
export type NetworkDetailStatusTone = "positive" | "neutral" | "attention" | "danger"

export type NetworkInterfaceRow = {
	id: string
	name: string
	medium: string
	enabledState: NetworkInterfaceState
	connectionState: NetworkConnectionState
	role: string
	speed: string
	peer: string
}

export type NetworkRelationRow = {
	id: string
	direction: NetworkRelationDirection
	directionLabel: string
	peerAsset: string
	currentInterface: string
	peerInterface: string
	linkKind: string
	status: string
	statusTone: NetworkDetailStatusTone
}

const networkCapabilityGroupIds = new Set([
	"router-wired",
	"router-wireless",
	"router-planning",
	"gateway-forwarding",
	"gateway-planning",
	"ont-access-role",
	"ont-fiber-access",
	"ont-routing-management",
	"ont-wireless",
	"ont-wired",
	"ap-wired",
	"ap-wireless",
	"ap-planning",
	"firewall-forwarding",
	"firewall-security",
	"firewall-planning",
	"switch-network-functions",
	"switch-port-status",
	"network-fallback",
])

const interfaceNameCollator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" })

export function isNetworkDetailParameterGroup(type: AssetRecord["type"], groupId: string) {
	return NETWORK_ASSET_TYPES.includes(type) && networkCapabilityGroupIds.has(groupId)
}

export function buildNetworkDeviceDetailModel(
	asset: AssetRecord,
	assets: AssetRecord[],
	interfaces: AssetInterfaceRecord[],
	relations: AssetRelationRecord[]
): NetworkDeviceDetailModel | undefined {
	if (!NETWORK_ASSET_TYPES.includes(asset.type)) return undefined
	return {
		capabilitySections: buildCapabilitySections(asset, assets, interfaces, relations),
		interfaces: buildInterfaceRows(asset, assets, interfaces, relations),
		relations: buildRelationRows(asset, assets, interfaces, relations),
	}
}

function buildCapabilitySections(
	asset: AssetRecord,
	assets: AssetRecord[],
	interfaces: AssetInterfaceRecord[],
	relations: AssetRelationRecord[]
): NetworkCapabilitySection[] {
	return buildAssetParameterGroups(asset, { assets, interfaces, relations }).flatMap((group) => {
		if (!isNetworkDetailParameterGroup(asset.type, group.id)) return []
		if (group.id === "switch-port-status") {
			const rows = group.rows.filter((row) => row.section === "端口能力")
			return rows.length > 0
				? [{ id: "switch-interface-capability", title: "接口能力", rows: rows.map(toCapabilityRow) }]
				: []
		}
		return [{ id: group.id, title: group.title, rows: group.rows.map(toCapabilityRow) }]
	})
}

function toCapabilityRow(row: { label: string; value: string }) {
	return { label: row.label, value: row.value }
}

function buildInterfaceRows(
	asset: AssetRecord,
	assets: AssetRecord[],
	interfaces: AssetInterfaceRecord[],
	relations: AssetRelationRecord[]
) {
	const assetMap = new Map(assets.map((item) => [item.id, item]))
	return interfaces
		.filter((item) => item.asset === asset.id)
		.slice()
		.sort(
			(left, right) =>
				getInterfaceMediumOrder(left) - getInterfaceMediumOrder(right) ||
				interfaceNameCollator.compare(left.name || left.id, right.name || right.id)
		)
		.map((item): NetworkInterfaceRow => {
			const enabledState = getInterfaceEnabledState(item)
			const connectionState = getInterfaceConnectionState(item)
			return {
				id: item.id,
				name: item.name?.trim() || formatAssetInterfaceKind(item.kind),
				medium: formatAssetInterfaceKind(item.kind),
				enabledState,
				connectionState,
				role: formatInterfaceRole(getMetadataString(item.metadata, "role")),
				speed: formatInterfaceRate(item),
				peer: getInterfacePeer(asset.id, item, enabledState, connectionState, assetMap, relations),
			}
		})
}

function getInterfaceMediumOrder(item: AssetInterfaceRecord) {
	switch (item.kind) {
		case "ethernet":
		case "lan":
		case "wan":
		case "management":
			return 0
		case "pon":
		case "optical":
			return 1
		case "wifi":
			return 2
		case "virtual":
			return 3
		default:
			return 4
	}
}

function getInterfaceEnabledState(item: AssetInterfaceRecord): NetworkInterfaceState {
	return typeof item.metadata?.enabled === "boolean" ? (item.metadata.enabled ? "enabled" : "disabled") : "unrecorded"
}

function getInterfaceConnectionState(item: AssetInterfaceRecord): NetworkConnectionState {
	return typeof item.connected === "boolean" ? (item.connected ? "connected" : "disconnected") : "unrecorded"
}

function formatInterfaceRole(role: string) {
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

function formatInterfaceRate(item: AssetInterfaceRecord) {
	const band = getMetadataString(item.metadata, "band")
	const negotiatedSpeed = Number(item.metadata?.negotiated_speed_mbps)
	const speed =
		Number.isFinite(negotiatedSpeed) && negotiatedSpeed > 0
			? `协商 ${formatAssetInterfaceSpeed(negotiatedSpeed)}`
			: item.speed_mbps
				? `支持 ${formatAssetInterfaceSpeed(item.speed_mbps)}`
				: ""
	return [band, speed].filter(Boolean).join(" · ") || "未记录"
}

function getInterfacePeer(
	assetId: string,
	item: AssetInterfaceRecord,
	enabledState: NetworkInterfaceState,
	connectionState: NetworkConnectionState,
	assetMap: Map<string, AssetRecord>,
	relations: AssetRelationRecord[]
) {
	const relation = relations.find((candidate) => {
		if (candidate.kind !== "connected_to") return false
		if (candidate.source_asset === assetId) {
			return getMetadataString(candidate.metadata, "source_interface") === item.id
		}
		if (candidate.target_asset === assetId) {
			return getMetadataString(candidate.metadata, "target_interface") === item.id
		}
		return false
	})
	if (relation) {
		const currentIsSource = relation.source_asset === assetId
		const peerId = currentIsSource ? relation.target_asset : relation.source_asset
		return getRelationPeerAsset(relation, currentIsSource, assetMap)?.name?.trim() || (peerId ? "待建档" : "对端未关联")
	}
	const connectionNote = getMetadataString(item.metadata, "connection_note")
	if (connectionNote) return connectionNote
	if (connectionState === "connected") return "对端未关联"
	if (enabledState === "disabled") return "未使用"
	if (connectionState === "disconnected") return "未连接"
	return "未记录"
}

function buildRelationRows(
	asset: AssetRecord,
	assets: AssetRecord[],
	interfaces: AssetInterfaceRecord[],
	relations: AssetRelationRecord[]
) {
	const assetMap = new Map(assets.map((item) => [item.id, item]))
	const interfaceMap = new Map(interfaces.map((item) => [item.id, item]))
	const directionPriority: Record<NetworkRelationDirection, number> = {
		uplink: 0,
		downlink: 1,
		ambiguous: 2,
		other: 3,
	}
	return relations
		.filter((relation) => relation.source_asset === asset.id || relation.target_asset === asset.id)
		.map((relation): NetworkRelationRow => {
			const currentIsSource = relation.source_asset === asset.id
			const peerId = currentIsSource ? relation.target_asset : relation.source_asset
			const currentInterface = interfaceMap.get(
				getMetadataString(relation.metadata, currentIsSource ? "source_interface" : "target_interface")
			)
			const peerInterface = interfaceMap.get(
				getMetadataString(relation.metadata, currentIsSource ? "target_interface" : "source_interface")
			)
			const direction =
				relation.kind === "connected_to" ? getAssetNetworkRelationDirection(asset.id, relation, interfaceMap) : "other"
			const peerAsset = getRelationPeerAsset(relation, currentIsSource, assetMap)
			const status = getRelationStatus(relation, direction, peerAsset, currentInterface, peerInterface)
			return {
				id: relation.id,
				direction,
				directionLabel: formatRelationDirection(direction, relation.kind),
				peerAsset: peerAsset?.name?.trim() || (peerId ? "待建档" : "对端未关联"),
				currentInterface: currentInterface?.name?.trim() || "接口待确认",
				peerInterface: peerInterface?.name?.trim() || "接口待确认",
				linkKind: formatRelationLinkKind(getMetadataString(relation.metadata, "link_kind")),
				status: status.label,
				statusTone: status.tone,
			}
		})
		.sort(
			(left, right) =>
				directionPriority[left.direction] - directionPriority[right.direction] ||
				left.peerAsset.localeCompare(right.peerAsset, "zh-CN")
		)
}

function getRelationPeerAsset(
	relation: AssetRelationRecord,
	currentIsSource: boolean,
	assetMap: Map<string, AssetRecord>
) {
	const peerId = currentIsSource ? relation.target_asset : relation.source_asset
	const expandKey = currentIsSource ? "target_asset" : "source_asset"
	const expanded = relation.expand?.[expandKey]
	return (
		assetMap.get(peerId) ?? (expanded && !Array.isArray(expanded) ? (expanded as unknown as AssetRecord) : undefined)
	)
}

function getRelationStatus(
	relation: AssetRelationRecord,
	direction: NetworkRelationDirection,
	peerAsset: AssetRecord | undefined,
	currentInterface: AssetInterfaceRecord | undefined,
	peerInterface: AssetInterfaceRecord | undefined
): { label: string; tone: NetworkDetailStatusTone } {
	if (!peerAsset) return { label: "待建档", tone: "attention" }
	if (direction === "ambiguous") return { label: "方向待确认", tone: "attention" }
	if (relation.kind === "connected_to" && (!currentInterface || !peerInterface)) {
		return { label: "接口待确认", tone: "attention" }
	}
	return { label: relation.kind === "connected_to" ? "已确认" : "已关联", tone: "positive" }
}

function formatRelationDirection(direction: NetworkRelationDirection, kind: AssetRelationRecord["kind"]) {
	switch (direction) {
		case "uplink":
			return "上联"
		case "downlink":
			return "下联"
		case "ambiguous":
			return "方向待确认"
		default:
			return formatRelationKind(kind)
	}
}

function formatRelationKind(kind: AssetRelationRecord["kind"]) {
	const labels: Record<AssetRelationRecord["kind"], string> = {
		connected_to: "网络连接",
		hosted_on: "运行在",
		monitors: "监控",
		depends_on: "依赖",
		owns: "归属",
		located_in: "位于",
		powered_by: "供电于",
		custom: "自定义",
	}
	return labels[kind]
}

function formatRelationLinkKind(kind: string) {
	switch (kind) {
		case "ethernet":
			return "有线链路"
		case "wifi":
			return "无线链路"
		case "internet":
			return "外网链路"
		case "custom":
			return "自定义链路"
		default:
			return "链路待确认"
	}
}
