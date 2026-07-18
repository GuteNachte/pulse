import type { AssetInterfaceKind, AssetInterfaceRecord, AssetRecord } from "@/types"
import { getInternetBandwidthLabel } from "./asset-profile-summary.ts"
import { getMetadataString } from "./asset-schema.ts"

export type AssetInterfaceSpeedItem = {
	id: string
	label: string
	speedLabel: string
	connected: boolean
	primary: boolean
}

export type AssetInterfaceDisplay = {
	accessLabel: string
	speedMode: "interfaces" | "not_applicable" | "error"
	speedItems: AssetInterfaceSpeedItem[]
	secondaryLabel?: string
}

export function groupAssetInterfacesByAsset(records: AssetInterfaceRecord[]) {
	const grouped = new Map<string, AssetInterfaceRecord[]>()
	for (const record of records) {
		grouped.set(record.asset, [...(grouped.get(record.asset) ?? []), record])
	}
	return grouped
}

export function buildAssetInterfaceDisplay(
	asset: AssetRecord,
	records: AssetInterfaceRecord[],
	options: { loadFailed?: boolean } = {}
): AssetInterfaceDisplay {
	if (asset.type === "internet" || asset.type === "web_endpoint") {
		const accessMode = getMetadataString(asset.metadata, "access_mode")
		const bandwidth = asset.type === "internet" ? getInternetBandwidthLabel(asset) : ""
		return {
			accessLabel: accessMode || (asset.type === "internet" ? "互联网接入" : "服务访问"),
			secondaryLabel: bandwidth || undefined,
			speedMode: "not_applicable",
			speedItems: [],
		}
	}

	if (options.loadFailed) {
		return {
			accessLabel: "接口读取失败",
			speedMode: "error",
			speedItems: [],
		}
	}

	const connectedKinds = [
		...new Set(records.filter((item) => item.connected).map((item) => formatAssetInterfaceKind(item.kind))),
	]
	return {
		accessLabel: records.length === 0 ? "未设置" : connectedKinds.join(" + ") || "未接入",
		speedMode: "interfaces",
		speedItems: records.map((item) => ({
			id: item.id,
			label: item.name || formatAssetInterfaceKind(item.kind),
			speedLabel: item.speed_mbps ? formatAssetInterfaceSpeed(item.speed_mbps) : "速率未填",
			connected: item.connected === true,
			primary: item.primary === true,
		})),
	}
}

export function formatAssetInterfaceKind(kind: AssetInterfaceKind) {
	switch (kind) {
		case "ethernet":
			return "有线"
		case "wifi":
			return "Wi-Fi"
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
