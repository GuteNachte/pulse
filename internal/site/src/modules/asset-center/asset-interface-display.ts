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
		const accessInterfaces = records.filter((record) => record.connected && isAccessInterface(record.kind))
		const interfaceLabel = accessInterfaces.map((record) => formatAssetAccessInterface(asset, record))[0]
		return {
			accessLabel:
				getMetadataString(asset.metadata, "access_technology") === "ftth" ? "光纤" : interfaceLabel || "未设置",
			speedMode: "not_applicable",
			speedItems: [],
		}
	}
	if (asset.type === "web_endpoint") {
		return { accessLabel: "无", speedMode: "not_applicable", speedItems: [] }
	}

	const connectedInterfaces = records.filter((record) => record.connected && isAccessInterface(record.kind))
	const uplinkInterfaces = connectedInterfaces.filter(
		(record) => getMetadataString(record.metadata, "role") === "uplink"
	)
	const accessInterfaces = (uplinkInterfaces.length > 0 ? uplinkInterfaces : connectedInterfaces)
		.slice()
		.sort((left, right) => getAccessInterfacePriority(left.kind) - getAccessInterfacePriority(right.kind))
	const accessLabels = new Set(accessInterfaces.map((record) => formatAssetAccessInterface(asset, record)))

	if (accessLabels.size === 0) {
		for (const relation of options.relations ?? []) {
			const label = formatRelationAccessLabel(asset, relation)
			if (label) accessLabels.add(label)
		}
	}
	const accessLabel = [...accessLabels].join(" + ")

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

function isAccessInterface(kind: AssetInterfaceKind) {
	switch (kind) {
		case "wifi":
		case "ethernet":
		case "lan":
		case "wan":
		case "pon":
		case "optical":
			return true
		default:
			return false
	}
}

function getAccessInterfacePriority(kind: AssetInterfaceKind) {
	if (kind === "wifi") return 0
	if (kind === "pon" || kind === "optical") return 2
	return 1
}

function formatAssetAccessInterface(asset: AssetRecord, record: AssetInterfaceRecord) {
	if (record.kind === "wifi") {
		return formatWifiAccessLabel(
			getMetadataString(record.metadata, "wifi_standard") || getMetadataString(asset.metadata, "wifi_standard"),
			getMetadataString(record.metadata, "band") || extractWifiBand(record.name)
		)
	}
	if (record.kind === "pon" || record.kind === "optical") {
		return `光纤 · ${record.speed_mbps ? formatAssetInterfaceSpeed(record.speed_mbps) : "速率待确认"}`
	}
	return `网线 · ${record.speed_mbps ? formatAssetInterfaceSpeed(record.speed_mbps) : "速率待确认"}`
}

function formatRelationAccessLabel(asset: AssetRecord, relation: AssetRelationRecord) {
	const linkKind = getMetadataString(relation.metadata, "link_kind")
	if (linkKind === "wifi") {
		return formatWifiAccessLabel(
			getMetadataString(relation.metadata, "wifi_standard") || getMetadataString(asset.metadata, "wifi_standard"),
			getMetadataString(relation.metadata, "wifi_band") || getMetadataString(relation.metadata, "band")
		)
	}
	if (linkKind === "ethernet") {
		const speed = Number(relation.metadata?.speed_mbps)
		return `网线 · ${Number.isFinite(speed) && speed > 0 ? formatAssetInterfaceSpeed(speed) : "速率待确认"}`
	}
	if (linkKind === "internet") {
		const speed = Number(relation.metadata?.speed_mbps)
		return `光纤 · ${Number.isFinite(speed) && speed > 0 ? formatAssetInterfaceSpeed(speed) : "速率待确认"}`
	}
	return undefined
}

function formatWifiAccessLabel(standardValue: string, bandValue: string) {
	const standard = normalizeWifiStandard(standardValue)
	const band = normalizeWifiBand(bandValue)
	return `${standard || "Wi-Fi · 制式待确认"} · ${band || "频段待确认"}`
}

function normalizeWifiStandard(value: string) {
	const match = value.trim().match(/wi[\s-]*fi\s*(\d+)/i)
	return match ? `Wi-Fi ${match[1]}` : ""
}

function normalizeWifiBand(value: string) {
	const normalized = value.trim().toLowerCase().replace(/\s+/g, "")
	if (/^2\.4g(?:hz)?$/.test(normalized)) return "2.4 GHz"
	if (/^5g(?:hz)?$/.test(normalized)) return "5 GHz"
	if (/^6g(?:hz)?$/.test(normalized)) return "6 GHz"
	return ""
}

function extractWifiBand(value: string) {
	const match = value.match(/(?:^|\s)(2\.4|5|6)\s*GHz/i)
	return match ? `${match[1]} GHz` : ""
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
