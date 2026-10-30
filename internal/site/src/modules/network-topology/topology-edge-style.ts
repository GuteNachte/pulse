// 编辑页和展示页共用同一套连线视觉规范，避免“编辑时紫色虚线、展示时绿色虚线”。
export type TopologyEdgeMedium = "fiber" | "ethernet" | "wifi"

export type TopologyEdgeAppearance = {
	medium: TopologyEdgeMedium
	color: string
	width: number
	dashed: boolean
	label: string
	bandwidth: string
}

export function normalizeTopologyEdgeMedium(value: string | undefined): TopologyEdgeMedium {
	if (value === "wifi") return "wifi"
	if (value === "fiber" || value === "internet") return "fiber"
	return "ethernet"
}

export function formatTopologyEdgeBandwidth(speedMbps?: number, bandwidth?: string): string {
	const explicit = bandwidth?.trim()
	if (explicit) return explicit
	if (!speedMbps || speedMbps <= 0) return ""
	if (speedMbps >= 1000) {
		const gbps = speedMbps / 1000
		return `${Number.isInteger(gbps) ? gbps : gbps.toFixed(1)}G`
	}
	return `${speedMbps}M`
}

export function normalizeTopologyWifiBand(value: string | undefined): "2.4" | "5" | "" {
	const text = value?.trim().toLowerCase() ?? ""
	if (!text) return ""
	if (text.includes("2.4")) return "2.4"
	if (text.includes("5")) return "5"
	return ""
}

export function getTopologyEdgeAppearance(
	mediumValue: string | undefined,
	bandwidthValue?: string,
	speedMbps?: number,
	bandValue?: string
): TopologyEdgeAppearance {
	const medium = normalizeTopologyEdgeMedium(mediumValue)
	const bandwidth = formatTopologyEdgeBandwidth(speedMbps, bandwidthValue)
	if (medium === "wifi") {
		const band = normalizeTopologyWifiBand(bandValue) || "5"
		return {
			medium,
			color: band === "2.4" ? "#06b6d4" : "#8b5cf6",
			width: 1.5,
			dashed: true,
			label: band === "2.4" ? "WiFi 2.4G" : "WiFi 5G",
			bandwidth,
		}
	}
	if (medium === "fiber") {
		return {
			medium,
			color: "#3b82f6",
			width: 2.5,
			dashed: false,
			label: bandwidth ? `光纤 · ${bandwidth}` : "光纤",
			bandwidth,
		}
	}
	const isTenGigabit = /(^|\D)10G/i.test(bandwidth) || (typeof speedMbps === "number" && speedMbps >= 10000)
	const isTwoPointFive = bandwidth.includes("2.5") || (typeof speedMbps === "number" && speedMbps >= 2500)
	return {
		medium,
		color: isTenGigabit ? "#0d9488" : isTwoPointFive ? "#059669" : "#10b981",
		width: isTenGigabit ? 2.5 : isTwoPointFive ? 2 : 1.5,
		dashed: false,
		label: bandwidth ? `网线 · ${bandwidth}` : "网线",
		bandwidth,
	}
}

const NETWORK_ASSET_TYPES = new Set(["ont", "smart_ont", "router", "gateway", "ap", "switch", "firewall"])

export type TopologyHandleRect = {
	x: number
	y: number
	width: number
	height: number
}

// 根据两张卡片的相对位置选择相邻侧连接点，避免所有边默认挤在顶部。
export function pickTopologyHandles(
	source: TopologyHandleRect,
	target: TopologyHandleRect
): { sourceHandle: string; targetHandle: string } {
	const dx = target.x + target.width / 2 - (source.x + source.width / 2)
	const dy = target.y + target.height / 2 - (source.y + source.height / 2)
	if (Math.abs(dx) >= Math.abs(dy)) {
		return dx >= 0 ? { sourceHandle: "right", targetHandle: "left" } : { sourceHandle: "left", targetHandle: "right" }
	}
	return dy >= 0 ? { sourceHandle: "bottom", targetHandle: "top" } : { sourceHandle: "top", targetHandle: "bottom" }
}

function isNetworkAsset(asset: { type?: string } | undefined) {
	return Boolean(asset?.type && NETWORK_ASSET_TYPES.has(asset.type))
}

// 视觉方向统一为「上游 → 下游」：宽带 → 接入设备，网络设备 → 终端。
// WiFi 关系在数据层必须是终端 → 路由（后端约束），展示时应反向成路由 → 终端。
export function getTopologyVisualDirection(
	source: string,
	target: string,
	mediumValue: string | undefined,
	sourceAsset: { type?: string } | undefined,
	targetAsset: { type?: string } | undefined
): { source: string; target: string; swapped: boolean } {
	const swap = () => ({ source: target, target: source, swapped: true })
	const keep = () => ({ source, target, swapped: false })
	const sourceIsInternet = sourceAsset?.type === "internet"
	const targetIsInternet = targetAsset?.type === "internet"
	if (targetIsInternet && !sourceIsInternet) return swap()
	if (sourceIsInternet) return keep()
	const medium = normalizeTopologyEdgeMedium(mediumValue)
	if ((medium === "wifi" || medium === "ethernet") && isNetworkAsset(targetAsset) && !isNetworkAsset(sourceAsset)) {
		return swap()
	}
	return keep()
}
