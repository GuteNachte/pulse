import { MarkerType, type Edge, type Node, type Viewport } from "@xyflow/react"
import { formatBytes } from "@/lib/utils"
import type {
	AssetInterfaceRecord,
	AssetRecord,
	AssetRelationRecord,
	AssetType,
	NetworkInterfaceDetails,
	NetworkLayoutRecord,
	NetworkLinkRecord,
	NetworkPortRecord,
	SystemDetailsRecord,
	SystemRecord,
	AssetInterfaceKind,
} from "@/types"

export type TopologyNodeKind = "asset" | "system"

export type TopologyLinkLike = {
	id: string
	kind: NetworkLinkRecord["kind"]
	name?: string
	notes?: string
	source_port?: string
	target_port?: string
	relation?: AssetRelationRecord
}

export type TopologyNodeData = {
	kind: TopologyNodeKind
	title: string
	subtitle: string
	meta: string[]
	connectionBadges: TopologyConnectionBadge[]
	availableConnectionBadges: TopologyConnectionBadge[]
	status?: SystemRecord["status"]
	asset?: AssetRecord
	system?: SystemRecord
	rateLabel?: string
	portCount?: number
}

export type TopologyConnectionKind = "wired" | "wireless"

export type TopologyConnectionBadge = {
	kind: TopologyConnectionKind
	label: string
	summary: string
	details: string[]
}

export type TopologyEdgeData = {
	link: TopologyLinkLike
	sourcePort?: NetworkPortRecord
	targetPort?: NetworkPortRecord
	rateLabel?: string
	speedLabel: string
	trafficLabel: string
}

export type TopologyGraph = {
	nodes: Node<TopologyNodeData>[]
	edges: Edge<TopologyEdgeData>[]
	stats: {
		devices: number
		systems: number
		links: number
		ports: number
		onlineSystems: number
		wirelessLinks: number
		internetAccesses: number
	}
}

export type TopologyInput = {
	assets?: AssetRecord[]
	interfaces?: AssetInterfaceRecord[]
	relations?: AssetRelationRecord[]
	systems: SystemRecord[]
	details: SystemDetailsRecord[]
	layout?: NetworkLayoutRecord["layout"]
}

export const TOPOLOGY_GRID_SIZE = 28
export const TOPOLOGY_NODE_WIDTH = 260
export const TOPOLOGY_NODE_HEIGHT = 148
export const TOPOLOGY_SLOT_GAP_X = 72
export const TOPOLOGY_SLOT_GAP_Y = 84
export const TOPOLOGY_CANVAS_ORIGIN_X = 84
export const TOPOLOGY_CANVAS_ORIGIN_Y = 56
export const TOPOLOGY_SLOT_WIDTH = TOPOLOGY_NODE_WIDTH + TOPOLOGY_SLOT_GAP_X
export const TOPOLOGY_SLOT_HEIGHT = TOPOLOGY_NODE_HEIGHT + TOPOLOGY_SLOT_GAP_Y

export function buildTopologyGraph({
	assets = [],
	interfaces = [],
	relations = [],
	systems,
	details,
	layout,
}: TopologyInput): TopologyGraph {
	const assetsById = new Map(assets.map((asset) => [asset.id, asset]))
	const topologyPorts = buildTopologyPorts(interfaces)
	const topologyPortsByOwner = groupPortsByOwner(topologyPorts)
	const systemsByAssetId = new Map(
		systems.filter((system) => system.asset).map((system) => [system.asset as string, system])
	)
	const detailsById = new Map(details.map((detail) => [detail.id, detail]))
	const networkAssets = assets
		.filter((asset) => asset.type !== "web_endpoint")
		.sort((a, b) => getTopologyAssetOrder(a.type) - getTopologyAssetOrder(b.type) || a.name.localeCompare(b.name))

	const nodes: Node<TopologyNodeData>[] = []

	for (const asset of networkAssets) {
		const id = assetNodeId(asset.id)
		const system = systemsByAssetId.get(asset.id)
		const detail = system ? detailsById.get(system.id) : undefined
		const assetPorts = topologyPortsByOwner.get(id) ?? []
		const networkInterfaces = system ? (detail?.network_interfaces ?? []) : []
		const connectionBadges = getConnectionBadges({
			nodeId: id,
			layout,
			ports: assetPorts,
			asset,
			networkInterfaces,
		})
		nodes.push({
			id,
			type: "pulseTopology",
			position: getSavedPosition(layout, id, nodes.length),
			style: getNodeStyle(),
			data: {
				kind: system ? "system" : "asset",
				title: asset.name,
				subtitle: system
					? getSystemSubtitle(system, detail) || getAssetTypeLabel(asset.type)
					: getAssetTypeLabel(asset.type),
				meta: getAssetNodeMeta(asset, system, detail),
				connectionBadges: connectionBadges.selected,
				availableConnectionBadges: connectionBadges.available,
				status: system?.status,
				asset,
				system,
				rateLabel: getSystemRateLabel(system),
				portCount: assetPorts.length,
			},
		})
	}

	const normalizedNodes = normalizeTopologyNodePositions(nodes)
	const nodeIdSet = new Set(normalizedNodes.map((node) => node.id))
	const internetNodeIds = new Set(
		normalizedNodes.filter((node) => isInternetNodeData(node.data)).map((node) => node.id)
	)
	const edges: Edge<TopologyEdgeData>[] = []
	for (const relation of relations) {
		if (relation.kind !== "connected_to" && relation.kind !== "depends_on") continue
		const source = assetNodeId(relation.source_asset)
		const target = assetNodeId(relation.target_asset)
		if (!nodeIdSet.has(source) || !nodeIdSet.has(target) || source === target) continue
		const sourceAsset = assetsById.get(relation.source_asset)
		const targetAsset = assetsById.get(relation.target_asset)
		const sourceSystem = sourceAsset ? systemsByAssetId.get(sourceAsset.id) : undefined
		const targetSystem = targetAsset ? systemsByAssetId.get(targetAsset.id) : undefined
		const sourcePorts = topologyPortsByOwner.get(source) ?? []
		const targetPorts = topologyPortsByOwner.get(target) ?? []
		const sourcePort = getRelationInterfacePort(relation, "source_interface", sourcePorts) ?? sourcePorts[0]
		const targetPort = getRelationInterfacePort(relation, "target_interface", targetPorts) ?? targetPorts[0]
		const kind = getRelationLinkKind(relation, sourceAsset, targetAsset)
		const rateLabel = getSystemRateLabel(sourceSystem) || getSystemRateLabel(targetSystem)
		const selectedPorts = [sourcePort, targetPort].filter((port): port is NetworkPortRecord => Boolean(port))
		edges.push(
			createTopologyEdge({
				id: `asset-relation-${relation.id}`,
				source,
				target,
				link: { id: relation.id, kind, name: relation.label, relation },
				sourcePort,
				targetPort,
				rateLabel,
				speedLabel:
					selectedPorts.length > 0
						? getPortsSpeedLabel(selectedPorts)
						: getPortsSpeedLabel([...sourcePorts, ...targetPorts]),
				trafficLabel: rateLabel || "实时 --",
			})
		)
	}

	const normalizedEdges = normalizeTopologyEdgeDirections(edges, internetNodeIds)

	return {
		nodes: normalizedNodes,
		edges: normalizedEdges,
		stats: {
			devices: networkAssets.filter((asset) => asset.type !== "internet").length,
			systems: normalizedNodes.filter((node) => node.data.kind === "system").length,
			links: normalizedEdges.length,
			ports: topologyPorts.filter((port) => nodeIdSet.has(getPortOwnerNodeId(port))).length,
			onlineSystems: normalizedNodes.filter((node) => node.data.status === "up").length,
			wirelessLinks: normalizedEdges.filter((edge) => edge.data?.link.kind === "wifi").length,
			internetAccesses: normalizedNodes.filter((node) => node.data.asset?.type === "internet").length,
		},
	}
}

function getConnectionBadges({
	nodeId,
	layout,
	ports,
	asset,
	networkInterfaces = [],
}: {
	nodeId: string
	layout?: NetworkLayoutRecord["layout"]
	ports: NetworkPortRecord[]
	asset?: AssetRecord
	networkInterfaces?: NetworkInterfaceDetails[]
}): { available: TopologyConnectionBadge[]; selected: TopologyConnectionBadge[] } {
	const badges = [
		buildWiredBadge({ ports, asset, networkInterfaces }),
		buildWirelessBadge({ ports, asset, networkInterfaces }),
	].filter((badge): badge is TopologyConnectionBadge => Boolean(badge))
	const selectedModes = layout?.connection_modes?.[nodeId]
	if (!selectedModes || selectedModes.length === 0) {
		return { available: badges, selected: badges }
	}
	return { available: badges, selected: badges.filter((badge) => selectedModes.includes(badge.kind)) }
}

function buildWiredBadge({
	ports,
	asset,
	networkInterfaces,
}: {
	ports: NetworkPortRecord[]
	asset?: AssetRecord
	networkInterfaces: NetworkInterfaceDetails[]
}): TopologyConnectionBadge | undefined {
	const wiredInterfaces = networkInterfaces.filter((item) => !isWirelessInterface(item))
	const wiredPorts = ports.filter((port) => !isWirelessPort(port))
	if (wiredInterfaces.length === 0 && wiredPorts.length === 0) {
		return undefined
	}
	return {
		kind: "wired",
		label: "有线",
		summary: getConnectionSummary(wiredInterfaces, wiredPorts),
		details: getConnectionDetails({
			fallbackLabel: "有线网卡",
			interfaces: wiredInterfaces,
			ports: wiredPorts,
			ipFallback: asset?.management_ip,
		}),
	}
}

function buildWirelessBadge({
	ports,
	asset,
	networkInterfaces,
}: {
	ports: NetworkPortRecord[]
	asset?: AssetRecord
	networkInterfaces: NetworkInterfaceDetails[]
}): TopologyConnectionBadge | undefined {
	const wirelessInterfaces = networkInterfaces.filter(isWirelessInterface)
	const wirelessPorts = ports.filter(isWirelessPort)
	if (wirelessInterfaces.length === 0 && wirelessPorts.length === 0) {
		return undefined
	}
	return {
		kind: "wireless",
		label: "无线",
		summary: getConnectionSummary(wirelessInterfaces, wirelessPorts),
		details: getConnectionDetails({
			fallbackLabel: "无线网卡",
			interfaces: wirelessInterfaces,
			ports: wirelessPorts,
			ipFallback: asset?.management_ip,
		}),
	}
}

function getConnectionSummary(interfaces: NetworkInterfaceDetails[], ports: NetworkPortRecord[]) {
	const speed =
		interfaces.find((item) => item.link_speed)?.link_speed ?? ports.find((port) => port.speed_mbps)?.speed_mbps
	if (speed) {
		return formatLinkSpeed(speed)
	}
	return interfaces[0]?.status || `${interfaces.length || ports.length} 项`
}

function getConnectionDetails({
	fallbackLabel,
	interfaces,
	ports,
	ipFallback,
}: {
	fallbackLabel: string
	interfaces: NetworkInterfaceDetails[]
	ports: NetworkPortRecord[]
	ipFallback?: string
}) {
	if (interfaces.length > 0) {
		return interfaces.flatMap((item) => [
			`网卡：${item.display_name || item.name || fallbackLabel}`,
			`速率：${item.link_speed ? formatLinkSpeed(item.link_speed) : "未上报"}`,
			`IPv4：${item.ipv4?.join(" / ") || "未上报"}`,
			`IPv6：${item.ipv6?.join(" / ") || "未上报"}`,
		])
	}
	if (ports.length > 0) {
		return ports.flatMap((port) => [
			`网卡：${port.name || fallbackLabel}`,
			`速率：${port.speed_mbps ? formatLinkSpeed(port.speed_mbps) : "未设置"}`,
			`IPv4：${ipFallback || "未配置"}`,
			"IPv6：未配置",
		])
	}
	return [`网卡：${fallbackLabel}`, "速率：未上报", "IPv4：未上报", "IPv6：未上报"]
}

function isWirelessPort(port: NetworkPortRecord) {
	return port.type === "wifi" || /wi-?fi|wlan|wireless|无线/i.test(port.name)
}

function isWirelessInterface(item: NetworkInterfaceDetails) {
	return /wi-?fi|wlan|wireless|802\.11|无线/i.test(`${item.name} ${item.display_name ?? ""}`)
}

export function createLayoutPayload(nodes: Node<TopologyNodeData>[], selected?: string, viewport?: Viewport) {
	return {
		nodes: Object.fromEntries(nodes.map((node) => [node.id, snapTopologyPosition(node.position)])),
		selected,
		viewport,
	}
}

export function snapTopologyPosition(position: { x: number; y: number }) {
	return {
		x: Math.max(
			TOPOLOGY_CANVAS_ORIGIN_X,
			TOPOLOGY_CANVAS_ORIGIN_X +
				Math.round((position.x - TOPOLOGY_CANVAS_ORIGIN_X) / TOPOLOGY_SLOT_WIDTH) * TOPOLOGY_SLOT_WIDTH
		),
		y: Math.max(
			TOPOLOGY_CANVAS_ORIGIN_Y,
			TOPOLOGY_CANVAS_ORIGIN_Y +
				Math.round((position.y - TOPOLOGY_CANVAS_ORIGIN_Y) / TOPOLOGY_SLOT_HEIGHT) * TOPOLOGY_SLOT_HEIGHT
		),
	}
}

export function assetNodeId(id: string) {
	return `asset:${id}`
}

export function systemNodeId(id: string) {
	return `system:${id}`
}

export function getPortOwnerNodeId(port: NetworkPortRecord) {
	if (port.asset) {
		return assetNodeId(port.asset)
	}
	if (port.system) {
		return systemNodeId(port.system)
	}
	return `port:${port.id}`
}

export function buildTopologyPorts(interfaces: AssetInterfaceRecord[] = []) {
	return interfaces.map((item) => assetInterfaceToNetworkPort(item))
}

export function getAssetTypeLabel(type: AssetType) {
	const labels: Record<AssetType, string> = {
		internet: "互联网",
		physical_host: "物理主机",
		nas: "NAS",
		server: "服务器",
		mini_pc: "迷你主机",
		router: "路由器",
		switch: "交换机",
		ap: "无线 AP",
		gateway: "网关",
		ont: "光猫",
		firewall: "防火墙",
		phone: "手机",
		tablet: "平板",
		camera: "摄像头",
		printer: "打印机",
		ups: "UPS",
		game_console: "游戏主机",
		handheld: "游戏掌机",
		ebook: "电子阅读器",
		wearable: "可穿戴",
		tv: "电视 / 显示",
		speaker: "音箱 / 音频",
		smarthome_gateway: "智能家居网关",
		sensor: "传感器",
		light: "灯具",
		plug: "插座 / 开关",
		lock: "门锁",
		vacuum: "扫地机器人",
		iot: "IoT",
		vm: "虚拟机",
		web_endpoint: "网页端点",
		custom: "自定义资产",
	}
	return labels[type] ?? "资产"
}

export function getPortTypeLabel(type: NetworkPortRecord["type"]) {
	const labels: Record<NetworkPortRecord["type"], string> = {
		wan: "WAN",
		lan: "LAN",
		wifi: "Wi-Fi",
		uplink: "上联",
		downlink: "下联",
		management: "管理",
		system: "机器网卡",
		custom: "自定义",
	}
	return labels[type] ?? type
}

export function getLinkKindLabel(kind: NetworkLinkRecord["kind"]) {
	const labels: Record<NetworkLinkRecord["kind"], string> = {
		ethernet: "有线链路",
		wifi: "无线链路",
		internet: "外网链路",
		custom: "自定义链路",
	}
	return labels[kind] ?? kind
}

function groupPortsByOwner(ports: NetworkPortRecord[]) {
	const groups = new Map<string, NetworkPortRecord[]>()
	for (const port of ports) {
		const ownerId = getPortOwnerNodeId(port)
		const group = groups.get(ownerId) ?? []
		group.push(port)
		groups.set(ownerId, group)
	}
	return groups
}

function normalizeTopologyNodePositions(nodes: Node<TopologyNodeData>[]) {
	const used = new Set<string>()
	let internetIndex = 0
	return nodes.map((node, index) => {
		let position = isInternetNodeData(node.data)
			? {
					x: TOPOLOGY_CANVAS_ORIGIN_X,
					y: TOPOLOGY_CANVAS_ORIGIN_Y + internetIndex++ * TOPOLOGY_SLOT_HEIGHT,
				}
			: snapTopologyPosition(node.position ?? getSavedPosition(undefined, node.id, index))
		if (!isInternetNodeData(node.data) && position.x <= TOPOLOGY_CANVAS_ORIGIN_X) {
			position = { ...position, x: TOPOLOGY_CANVAS_ORIGIN_X + TOPOLOGY_SLOT_WIDTH }
		}
		let guard = 0
		while (used.has(getPositionKey(position))) {
			guard += 1
			position =
				guard % 8 === 0
					? {
							x: TOPOLOGY_CANVAS_ORIGIN_X,
							y: position.y + TOPOLOGY_SLOT_HEIGHT,
						}
					: {
							x: position.x + TOPOLOGY_SLOT_WIDTH,
							y: position.y,
						}
		}
		used.add(getPositionKey(position))
		return { ...node, position }
	})
}

function getPositionKey(position: { x: number; y: number }) {
	return `${position.x}:${position.y}`
}

function isInternetNodeData(data: TopologyNodeData) {
	return data.asset?.type === "internet"
}

function normalizeTopologyEdgeDirections(edges: Edge<TopologyEdgeData>[], internetNodeIds: Set<string>) {
	return edges.map((edge) => {
		if (edge.data?.link.kind !== "internet") return edge
		if (!internetNodeIds.has(edge.target) || internetNodeIds.has(edge.source)) return edge
		return { ...edge, source: edge.target, target: edge.source }
	})
}

function createTopologyEdge({
	id,
	source,
	target,
	link,
	sourcePort,
	targetPort,
	rateLabel,
	speedLabel,
	trafficLabel,
}: {
	id: string
	source: string
	target: string
	link: TopologyLinkLike
	sourcePort?: NetworkPortRecord
	targetPort?: NetworkPortRecord
	rateLabel?: string
	speedLabel: string
	trafficLabel: string
}): Edge<TopologyEdgeData> {
	const edgeColor = getEdgeColor(link.kind)
	return {
		id,
		source,
		target,
		type: "pulseTopologyLink",
		label: `${trafficLabel} · ${speedLabel}`,
		data: { link, sourcePort, targetPort, rateLabel, speedLabel, trafficLabel },
		className: getEdgeClassName(link.kind),
		markerStart: {
			type: MarkerType.ArrowClosed,
			color: edgeColor,
			width: 14,
			height: 14,
		},
		markerEnd: {
			type: MarkerType.ArrowClosed,
			color: edgeColor,
			width: 14,
			height: 14,
		},
	}
}

function getRelationLinkKind(
	relation: AssetRelationRecord,
	sourceAsset?: AssetRecord,
	targetAsset?: AssetRecord
): NetworkLinkRecord["kind"] {
	const metadataKind = getStringMetadata(relation.metadata, "link_kind")
	if (
		metadataKind === "ethernet" ||
		metadataKind === "wifi" ||
		metadataKind === "internet" ||
		metadataKind === "custom"
	) {
		return metadataKind
	}
	if (sourceAsset?.type === "internet" || targetAsset?.type === "internet") {
		return "internet"
	}
	if ([sourceAsset?.type, targetAsset?.type].includes("ap")) {
		return "wifi"
	}
	return "ethernet"
}

function getRelationInterfacePort(
	relation: AssetRelationRecord,
	metadataKey: "source_interface" | "target_interface",
	ports: NetworkPortRecord[]
) {
	const interfaceId = getStringMetadata(relation.metadata, metadataKey)
	if (!interfaceId) return undefined
	return ports.find(
		(port) =>
			port.id === interfaceId ||
			port.id === `asset-interface:${interfaceId}` ||
			getNetworkPortInterfaceKey(port) === interfaceId
	)
}

function getStringMetadata(metadata: Record<string, unknown> | undefined, key: string) {
	const value = metadata?.[key]
	return typeof value === "string" ? value : ""
}

function getAssetNodeMeta(asset: AssetRecord, system?: SystemRecord, details?: SystemDetailsRecord) {
	if (asset.type === "internet") {
		return [asset.vendor, getInternetBandwidthLabel(asset), asset.role].filter(Boolean) as string[]
	}
	if (system) {
		return [getSystemPrimaryIP(system), getSystemPrimaryMac(details), asset.model || asset.role].filter(
			Boolean
		) as string[]
	}
	return [asset.model, asset.management_ip, asset.role].filter(Boolean) as string[]
}

function getTopologyAssetOrder(type: AssetType) {
	const order: Partial<Record<AssetType, number>> = {
		internet: 0,
		ont: 1,
		gateway: 2,
		router: 2,
		firewall: 2,
		switch: 3,
		ap: 4,
	}
	return order[type] ?? 5
}

function getInternetBandwidthLabel(asset: AssetRecord) {
	const down = getNumberMetadata(asset.metadata, "down_mbps")
	const up = getNumberMetadata(asset.metadata, "up_mbps")
	if (!down && !up) {
		return ""
	}
	return `↓ ${down ? formatLinkSpeed(down) : "未设"} / ↑ ${up ? formatLinkSpeed(up) : "未设"}`
}

function getNumberMetadata(metadata: Record<string, unknown> | undefined, key: string) {
	const value = metadata?.[key]
	if (typeof value === "number" && Number.isFinite(value)) return value
	if (typeof value === "string") {
		const parsed = Number(value)
		return Number.isFinite(parsed) ? parsed : undefined
	}
	return undefined
}

function assetInterfaceToNetworkPort(item: AssetInterfaceRecord): NetworkPortRecord {
	return {
		id: `asset-interface:${item.id}`,
		collectionId: "",
		collectionName: "asset_interfaces",
		user: item.user,
		asset: item.asset,
		name: item.name,
		type: mapAssetInterfaceKindToNetworkPortType(item.kind),
		speed_mbps: item.speed_mbps,
		notes: [item.mac, item.ipv4, item.ipv6].filter(Boolean).join(" · "),
		metadata: { asset_interface: item.id },
		created: item.created,
		updated: item.updated,
	} as NetworkPortRecord
}

function getNetworkPortInterfaceKey(port: NetworkPortRecord) {
	const metadata = (port as NetworkPortRecord & { metadata?: Record<string, unknown> }).metadata
	const value = metadata?.asset_interface
	return typeof value === "string" ? value : ""
}

function mapAssetInterfaceKindToNetworkPortType(kind: AssetInterfaceKind): NetworkPortRecord["type"] {
	if (kind === "wan") return "wan"
	if (kind === "lan" || kind === "ethernet") return "lan"
	if (kind === "wifi") return "wifi"
	if (kind === "management") return "management"
	return "custom"
}

function getSavedPosition(layout: NetworkLayoutRecord["layout"], id: string, index: number) {
	const saved = layout?.nodes?.[id]
	if (saved) {
		return snapTopologyPosition(saved)
	}
	return {
		x: TOPOLOGY_CANVAS_ORIGIN_X + (index % 4) * TOPOLOGY_SLOT_WIDTH,
		y: TOPOLOGY_CANVAS_ORIGIN_Y + Math.floor(index / 4) * TOPOLOGY_SLOT_HEIGHT,
	}
}

function getNodeStyle() {
	return {
		width: TOPOLOGY_NODE_WIDTH,
		height: TOPOLOGY_NODE_HEIGHT,
	}
}

function getSystemSubtitle(system: SystemRecord, details?: SystemDetailsRecord) {
	return [system.info?.os, details?.os_name || system.info?.h].filter(Boolean).join(" · ") || "Pulse Agent"
}

function getSystemPrimaryIP(system: SystemRecord) {
	return system.target_ip || system.connect_ip || system.reported_ips?.find(Boolean) || system.info?.ip || ""
}

function getSystemPrimaryMac(details?: SystemDetailsRecord) {
	return details?.network_interfaces?.find((item) => item.mac)?.mac ?? ""
}

function getSystemRateLabel(system?: SystemRecord) {
	const direction = system?.info?.bbd
	if (!direction) {
		return ""
	}
	const upload = formatBytes(direction[0], true)
	const download = formatBytes(direction[1], true)
	return `↑ ${formatRatePart(upload)} / ↓ ${formatRatePart(download)}`
}

function formatRatePart(value: { value: number; unit: string }) {
	return `${value.value >= 10 ? value.value.toFixed(0) : value.value.toFixed(1)} ${value.unit}`
}

function getPortsSpeedLabel(ports: NetworkPortRecord[]) {
	const speeds = ports.map((port) => port.speed_mbps).filter((speed): speed is number => Boolean(speed))
	if (speeds.length === 0) {
		return "速率未设"
	}
	return `链路 ${formatLinkSpeed(Math.min(...speeds))}`
}

function formatLinkSpeed(value: number) {
	if (value >= 1000) {
		return `${formatCompactNumber(value / 1000)} Gbps`
	}
	return `${formatCompactNumber(value)} Mbps`
}

function formatCompactNumber(value: number) {
	return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)
}

function getEdgeClassName(kind: NetworkLinkRecord["kind"]) {
	if (kind === "wifi") {
		return "pulse-topology-edge-wifi"
	}
	if (kind === "internet") {
		return "pulse-topology-edge-internet"
	}
	return "pulse-topology-edge"
}

function getEdgeColor(kind: NetworkLinkRecord["kind"]) {
	if (kind === "wifi") {
		return "hsl(158 64% 42%)"
	}
	if (kind === "internet") {
		return "hsl(38 92% 48%)"
	}
	return "hsl(213 94% 56%)"
}
