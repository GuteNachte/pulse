import type { AssetInterfaceKind, AssetInterfaceRecord, AssetRecord, AssetRelationRecord } from "@/types"
import { getMetadataString } from "./asset-schema.ts"

export type AssetInterfaceSpeedItem = {
	id: string
	label: string
	speedLabel: string
	connected: boolean
	primary: boolean
	enabled: boolean
	connectionNote?: string
	role?: "uplink" | "downlink" | "general"
	negotiatedSpeedLabel?: string
}

export type AssetInterfaceDisplay = {
	accessLabel: string
	speedMode: "interfaces" | "not_applicable" | "error"
	speedItems: AssetInterfaceSpeedItem[]
}

type AssetAccessMedium = "Wi-Fi" | "网线" | "光纤"

const assetAccessMediumOrder: AssetAccessMedium[] = ["Wi-Fi", "网线", "光纤"]

export function groupAssetInterfacesByAsset(records: AssetInterfaceRecord[]) {
	const grouped = new Map<string, AssetInterfaceRecord[]>()
	for (const record of records) {
		grouped.set(record.asset, [...(grouped.get(record.asset) ?? []), record])
	}
	return grouped
}

export function groupAssetNetworkRelationsByAsset(records: AssetRelationRecord[]) {
	const grouped = new Map<string, AssetRelationRecord[]>()
	for (const record of records) {
		if (record.kind !== "connected_to") continue
		for (const assetId of [record.source_asset, record.target_asset]) {
			grouped.set(assetId, [...(grouped.get(assetId) ?? []), record])
		}
	}
	return grouped
}

export function buildAssetInterfaceDisplay(
	asset: AssetRecord,
	records: AssetInterfaceRecord[],
	options: { loadFailed?: boolean; relations?: AssetRelationRecord[] } = {}
): AssetInterfaceDisplay {
	if (asset.type === "internet") {
		return {
			accessLabel: getMetadataString(asset.metadata, "access_technology") === "ftth" ? "光纤" : "未设置",
			speedMode: "not_applicable",
			speedItems: [],
		}
	}
	if (asset.type === "web_endpoint") {
		return { accessLabel: "无", speedMode: "not_applicable", speedItems: [] }
	}

	const connectedMedia = new Set<AssetAccessMedium>()
	for (const record of records) {
		if (!record.connected) continue
		const medium = getInterfaceAccessMedium(record.kind)
		if (medium) connectedMedia.add(medium)
	}
	for (const relation of options.relations ?? []) {
		const medium = getRelationAccessMedium(getMetadataString(relation.metadata, "link_kind"))
		if (medium) connectedMedia.add(medium)
	}
	const accessLabel = assetAccessMediumOrder.filter((medium) => connectedMedia.has(medium)).join(" + ")

	if (options.loadFailed && !accessLabel) {
		return {
			accessLabel: "接口读取失败",
			speedMode: "error",
			speedItems: [],
		}
	}

	return {
		accessLabel: accessLabel || (records.length > 0 || (options.relations?.length ?? 0) > 0 ? "未接入" : "未设置"),
		speedMode: "interfaces",
		speedItems: records.map((item) => {
			const connectionNote = getMetadataString(item.metadata, "connection_note")
			const isSwitchPort = asset.type === "switch"
			const role = getMetadataString(item.metadata, "role")
			const negotiatedSpeed = Number(item.metadata?.negotiated_speed_mbps)
			return {
				id: item.id,
				label: item.name || formatAssetInterfaceKind(item.kind),
				speedLabel: isSwitchPort
					? `支持 ${item.speed_mbps ? formatAssetInterfaceSpeed(item.speed_mbps) : "速率未填"}`
					: item.speed_mbps
						? formatAssetInterfaceSpeed(item.speed_mbps)
						: "速率未填",
				connected: item.connected === true,
				primary: item.primary === true,
				enabled: isAssetInterfaceEnabled(item),
				...(isSwitchPort && (role === "uplink" || role === "downlink" || role === "general") ? { role } : {}),
				...(isSwitchPort
					? {
							negotiatedSpeedLabel:
								Number.isFinite(negotiatedSpeed) && negotiatedSpeed > 0
									? `协商 ${formatAssetInterfaceSpeed(negotiatedSpeed)}`
									: "协商速率未确认",
						}
					: {}),
				...(connectionNote ? { connectionNote } : {}),
			}
		}),
	}
}

function getInterfaceAccessMedium(kind: AssetInterfaceKind): AssetAccessMedium | undefined {
	switch (kind) {
		case "wifi":
			return "Wi-Fi"
		case "ethernet":
		case "lan":
		case "wan":
			return "网线"
		case "pon":
		case "optical":
			return "光纤"
		default:
			return undefined
	}
}

function getRelationAccessMedium(linkKind: string): AssetAccessMedium | undefined {
	switch (linkKind) {
		case "wifi":
			return "Wi-Fi"
		case "ethernet":
			return "网线"
		case "internet":
			return "光纤"
		default:
			return undefined
	}
}

export function isAssetInterfaceEnabled(record: AssetInterfaceRecord) {
	return record.metadata?.enabled !== false
}

export function formatAssetInterfaceKind(kind: AssetInterfaceKind) {
	switch (kind) {
		case "ethernet":
			return "有线"
		case "wifi":
			return "Wi-Fi"
		case "pon":
			return "PON"
		case "optical":
			return "光纤"
		case "wan":
			return "WAN"
		case "lan":
			return "LAN"
		case "management":
			return "管理口"
		case "virtual":
			return "虚拟接口"
		case "custom":
			return "自定义"
	}
}

export function formatAssetInterfaceSpeed(speedMbps: number) {
	if (!Number.isFinite(speedMbps) || speedMbps <= 0) return "速率未填"
	if (speedMbps >= 1000) {
		const speedGbps = speedMbps / 1000
		return `${Number.isInteger(speedGbps) ? speedGbps.toFixed(0) : speedGbps.toFixed(1)} Gbps`
	}
	return `${Math.round(speedMbps)} Mbps`
}
