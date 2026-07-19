import { getSystemDisplayName } from "../../lib/system-roles.ts"
import type { AssetInterfaceRecord, AssetRecord, NetworkPortRecord, SystemRecord } from "../../types.ts"

export function getUnlinkedTopologySystems(systems: SystemRecord[], ports: NetworkPortRecord[]) {
	const linkedSystemIds = new Set(ports.map((port) => port.system).filter(Boolean))
	return systems.filter((system) => !system.asset && !linkedSystemIds.has(system.id))
}

export function buildTopologyAssetOptions(assets: AssetRecord[], systems: SystemRecord[]) {
	const assetsById = new Map(assets.map((asset) => [asset.id, asset]))
	const systemAssets = systems
		.filter((system) => system.asset && !assetsById.has(system.asset))
		.map(
			(system) =>
				({
					id: system.asset,
					user: "",
					name: getSystemDisplayName(system),
					type: "physical_host",
					created: "",
					updated: "",
					collectionId: "",
					collectionName: "assets",
				}) as AssetRecord
		)
	return [...assets.filter((asset) => asset.type !== "web_endpoint"), ...systemAssets]
}

export function mapTopologyPortTypeToAssetInterfaceKind(type: NetworkPortRecord["type"]): AssetInterfaceRecord["kind"] {
	if (type === "wan") return "wan"
	if (type === "wifi") return "wifi"
	if (type === "management") return "management"
	if (type === "lan" || type === "uplink" || type === "downlink" || type === "system") return "ethernet"
	return "custom"
}

export function mapAssetInterfaceKindToNetworkPortType(
	kind: AssetInterfaceRecord["kind"],
	metadata: Record<string, unknown> = {}
): NetworkPortRecord["type"] {
	const role = typeof metadata.role === "string" ? metadata.role : ""
	if (kind === "pon" || role === "uplink") return "uplink"
	if (kind === "optical" || role === "downlink") return "downlink"
	if (kind === "wan") return "wan"
	if (kind === "lan" || kind === "ethernet") return "lan"
	if (kind === "wifi") return "wifi"
	if (kind === "management") return "management"
	return "custom"
}

export function formatTopologyPortSpeed(value: number) {
	if (value >= 1000) {
		return `${value / 1000} Gbps`
	}
	return `${value} Mbps`
}

export function formatTopologyInternetBandwidth(asset: AssetRecord) {
	const down = getMetadataNumber(asset.metadata, "down_mbps")
	const up = getMetadataNumber(asset.metadata, "up_mbps")
	if (!down && !up) return ""
	return `↓ ${formatCompactBandwidth(down)} / ↑ ${formatCompactBandwidth(up)}`
}

function getMetadataNumber(metadata: Record<string, unknown> | undefined, key: string) {
	const value = metadata?.[key]
	if (typeof value === "number" && Number.isFinite(value)) return value
	if (typeof value === "string") {
		const parsed = Number(value)
		return Number.isFinite(parsed) ? parsed : undefined
	}
	return undefined
}

function formatCompactBandwidth(value?: number) {
	if (!value) return "未设"
	if (value >= 1000) {
		const gbps = value / 1000
		return `${Number.isInteger(gbps) ? gbps.toFixed(0) : gbps.toFixed(1)}G`
	}
	return `${value}M`
}
