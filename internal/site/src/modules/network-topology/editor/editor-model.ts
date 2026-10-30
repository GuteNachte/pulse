import dagre from "dagre"
import { MarkerType, type Edge, type Node } from "@xyflow/react"
import { getAssetProfile } from "../../asset-center/asset-profiles.ts"
import { getTopologyEdgeAppearance, getTopologyVisualDirection, pickTopologyHandles } from "../topology-edge-style.ts"
import type { AssetInterfaceRecord, AssetPresenceRecord, AssetRecord, AssetRelationRecord, SystemRecord } from "@/types"

// 2026-10-20 网络拓扑编辑页（用户方案）：节点位置/隐藏/显示设置存独立布局集合；
// 连线仍写 asset_relations，不建平行链路表。

export type TopologyEditorMedium = "fiber" | "ethernet" | "wifi"
export type TopologyEditorLinkStatus = "active" | "backup" | "fault"
export type TopologyEditorDomain = string

export type TopologyCanvasViewport = {
	x: number
	y: number
	zoom: number
}

export type TopologyCanvas = {
	id: string
	name: string
	domain: string
	viewport?: TopologyCanvasViewport
}

export type TopologyEditorNodeSettings = {
	scale: number
	icon: string
	showName: boolean
	showIp: boolean
	showModel: boolean
	showLocation: boolean
	notes: string
}

export type TopologyLayoutNode = TopologyEditorNodeSettings & {
	assetId: string
	canvasId?: string
	x: number
	y: number
	hidden?: boolean
}

export type TopologyLayout = {
	nodes: TopologyLayoutNode[]
	canvases?: TopologyCanvas[]
}

export type TopologyEditorNodeData = {
	asset: AssetRecord
	system?: SystemRecord
	presence?: AssetPresenceRecord
	settings: TopologyEditorNodeSettings
	/** 编辑页常显四个连接点；展示页隐藏（悬停才出现） */
	showHandles?: boolean
	/** 展示页：有连线经过的连接点常显，其余悬停才出现 */
	connectedHandles?: string[]
	/** 展示页：连接点圆点取所连线的颜色（side → color） */
	handleColors?: Partial<Record<string, string>>
}

export type TopologyEditorNode = Node<TopologyEditorNodeData, "topologyEditor">

export type TopologyEditorEdgeData = {
	relationId: string
	isNew: boolean
	domain: TopologyEditorDomain
	sourceInterface: string
	targetInterface: string
	medium: TopologyEditorMedium
	bandwidth: string
	band: string
	status: TopologyEditorLinkStatus
	notes: string
	label: string
	handlesManual: boolean
}

export type TopologyEditorEdge = Edge<TopologyEditorEdgeData> & {
	data: TopologyEditorEdgeData
}

// 2026-10-25 设备地图信息量增加（名称 / 类型·型号 / IP·位置 / 状态），卡片放大到 260×104
export const TOPOLOGY_NODE_WIDTH = 260
export const TOPOLOGY_NODE_HEIGHT = 104

// 2026-10-20 用户要求编辑器按网段拆画布：家庭网/科技网是默认画布，
// 以后新增的拓扑图用同一套 canvases 结构持久化。
export const DEFAULT_TOPOLOGY_CANVASES: TopologyCanvas[] = [
	{ id: "home", name: "家庭网", domain: "home" },
	{ id: "technology", name: "科技网", domain: "technology" },
]

export function normalizeTopologyCanvases(value: unknown): TopologyCanvas[] {
	const canvases = DEFAULT_TOPOLOGY_CANVASES.map((canvas) => ({ ...canvas }))
	const seen = new Set(canvases.map((canvas) => canvas.id))
	if (!Array.isArray(value)) return canvases
	for (const item of value) {
		if (!item || typeof item !== "object") continue
		const record = item as Partial<TopologyCanvas>
		const id = typeof record.id === "string" ? record.id.trim() : ""
		const name = typeof record.name === "string" ? record.name.trim() : ""
		if (!id || !name) continue
		const viewport = normalizeTopologyViewport(record.viewport)
		const existing = canvases.find((canvas) => canvas.id === id)
		if (existing) {
			if (viewport) existing.viewport = viewport
			continue
		}
		if (seen.has(id)) continue
		const domain = typeof record.domain === "string" && record.domain.trim() ? record.domain.trim() : id
		canvases.push({ id, name, domain, ...(viewport ? { viewport } : {}) })
		seen.add(id)
	}
	return canvases
}

// 2026-10-21 用户要求画布从 100% 起只能放大：保存的视口缩小值统一归一到 100%。
export function normalizeTopologyViewport(value: unknown): TopologyCanvasViewport | undefined {
	if (!value || typeof value !== "object") return undefined
	const record = value as Partial<TopologyCanvasViewport>
	if (typeof record.zoom !== "number" || !Number.isFinite(record.zoom)) return undefined
	return {
		x: typeof record.x === "number" && Number.isFinite(record.x) ? record.x : 0,
		y: typeof record.y === "number" && Number.isFinite(record.y) ? record.y : 0,
		zoom: Math.min(2, Math.max(1, record.zoom)),
	}
}

// 旧布局没有 canvasId：按资产所属网段（含关系网段）归入画布，保存后补齐新字段。
export function buildAssetCanvasMap(
	assets: AssetRecord[],
	relations: AssetRelationRecord[],
	canvases: TopologyCanvas[],
	layoutNodes: TopologyLayoutNode[] = []
): Map<string, string> {
	const knownCanvasIds = new Set(canvases.map((canvas) => canvas.id))
	const assetsById = new Map(assets.map((asset) => [asset.id, asset]))
	const explicitByAsset = new Map<string, string>()
	for (const node of layoutNodes) {
		if (node.canvasId && knownCanvasIds.has(node.canvasId)) explicitByAsset.set(node.assetId, node.canvasId)
	}
	const relationDomainsByAsset = new Map<string, Set<string>>()
	for (const relation of relations) {
		if (relation.kind !== "connected_to") continue
		const domain = resolveEditorRelationDomain(relation, assetsById)
		for (const assetId of [relation.source_asset, relation.target_asset]) {
			const domains = relationDomainsByAsset.get(assetId) ?? new Set<string>()
			domains.add(domain)
			relationDomainsByAsset.set(assetId, domains)
		}
	}
	const byAsset = new Map<string, string>()
	for (const asset of assets) {
		const explicit = explicitByAsset.get(asset.id)
		if (explicit) {
			byAsset.set(asset.id, explicit)
			continue
		}
		const rawDomain = asset.metadata?.network_domain
		const explicitHome = rawDomain === "家庭网" || rawDomain === "home"
		const explicitTech = rawDomain === "科技网" || rawDomain === "technology" || rawDomain === "tech"
		const relationDomains = relationDomainsByAsset.get(asset.id) ?? new Set<string>()
		let canvasId = explicitTech
			? "technology"
			: explicitHome
				? "home"
				: relationDomains.has("technology")
					? "technology"
					: Array.from(relationDomains)[0] || inferEditorDomain(asset)
		if (!knownCanvasIds.has(canvasId)) canvasId = inferEditorDomain(asset)
		if (!knownCanvasIds.has(canvasId)) canvasId = "home"
		byAsset.set(asset.id, canvasId)
	}
	return byAsset
}

export function normalizeLayoutNodes(
	nodes: unknown,
	canvases: TopologyCanvas[],
	assetsById: Map<string, AssetRecord>,
	canvasIdByAsset?: Map<string, string>
): TopologyLayoutNode[] {
	if (!Array.isArray(nodes)) return []
	const fallbackCanvasId = canvases[0]?.id ?? "home"
	const knownCanvasIds = new Set(canvases.map((canvas) => canvas.id))
	return nodes.flatMap((item) => {
		if (!item || typeof item !== "object") return []
		const node = item as TopologyLayoutNode
		if (!node.assetId) return []
		const storedCanvasId = typeof node.canvasId === "string" ? node.canvasId : ""
		const inferredCanvasId = canvasIdByAsset?.get(node.assetId) ?? inferEditorDomain(assetsById.get(node.assetId))
		const canvasId = knownCanvasIds.has(storedCanvasId)
			? storedCanvasId
			: knownCanvasIds.has(inferredCanvasId)
				? inferredCanvasId
				: fallbackCanvasId
		return [{ ...node, canvasId }]
	})
}

export const DEFAULT_NODE_SETTINGS: TopologyEditorNodeSettings = {
	scale: 1,
	icon: "",
	showName: true,
	showIp: true,
	showModel: true,
	showLocation: true,
	notes: "",
}

export const MEDIUM_OPTIONS: { value: TopologyEditorMedium; label: string }[] = [
	{ value: "fiber", label: "光纤" },
	{ value: "ethernet", label: "网线" },
	{ value: "wifi", label: "WiFi" },
]

export const BANDWIDTH_OPTIONS = ["100M", "1G", "2.5G", "10G", "WiFi 5", "WiFi 6", "WiFi 6E", "WiFi 7"] as const

export const LINK_STATUS_OPTIONS: { value: TopologyEditorLinkStatus; label: string }[] = [
	{ value: "active", label: "在用" },
	{ value: "backup", label: "备用" },
	{ value: "fault", label: "故障" },
]

const NETWORK_DEVICE_TYPES = new Set(["ont", "smart_ont", "router", "gateway", "ap"])
const WIRELESS_CLIENT_TYPES = new Set([
	"phone",
	"tablet",
	"handheld",
	"ebook",
	"wearable",
	"camera",
	"iot",
	"sensor",
	"light",
	"plug",
	"smart_switch",
	"lock",
	"vacuum",
	"speaker",
	"tv",
	"game_console",
])

export function isEditorNetworkDevice(asset: AssetRecord | undefined) {
	return asset ? NETWORK_DEVICE_TYPES.has(asset.type) : false
}

export function isEditorWirelessClient(asset: AssetRecord | undefined) {
	return asset ? WIRELESS_CLIENT_TYPES.has(asset.type) : false
}

export function normalizeNodeSettings(value?: Partial<TopologyEditorNodeSettings>): TopologyEditorNodeSettings {
	return {
		scale: typeof value?.scale === "number" && value.scale >= 1 && value.scale <= 1.5 ? value.scale : 1,
		icon: typeof value?.icon === "string" ? value.icon : "",
		showName: value?.showName !== false,
		showIp: value?.showIp !== false,
		showModel: value?.showModel !== false,
		showLocation: value?.showLocation !== false,
		notes: typeof value?.notes === "string" ? value.notes : "",
	}
}

export function normalizeMedium(value: unknown): TopologyEditorMedium {
	if (value === "wifi") return "wifi"
	if (value === "fiber" || value === "internet") return "fiber"
	return "ethernet"
}

export function normalizeLinkStatus(value: unknown): TopologyEditorLinkStatus {
	if (value === "backup" || value === "fault") return value
	return "active"
}

export function inferEditorDomain(...assets: (AssetRecord | undefined)[]): TopologyEditorDomain {
	for (const asset of assets) {
		const value = asset?.metadata?.network_domain
		if (value === "technology" || value === "科技网") return "technology"
	}
	return "home"
}

export function getAssetEditorGroup(asset: AssetRecord) {
	if (asset.type === "internet") return "宽带接入"
	return getAssetProfile(asset.type)?.group ?? "其他"
}

const GROUP_ORDER = [
	"宽带接入",
	"网络设备",
	"计算设备",
	"移动设备",
	"智能家居",
	"影音娱乐",
	"安防与办公",
	"电源设备",
	"资源与服务",
	"其他",
]

export function groupAssetsForLibrary(assets: AssetRecord[]) {
	const groups = new Map<string, AssetRecord[]>()
	for (const asset of assets) {
		const group = getAssetEditorGroup(asset)
		const list = groups.get(group) ?? []
		list.push(asset)
		groups.set(group, list)
	}
	return Array.from(groups.entries())
		.sort(([a], [b]) => {
			const ai = GROUP_ORDER.indexOf(a)
			const bi = GROUP_ORDER.indexOf(b)
			return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
		})
		.map(([title, items]) => ({
			title,
			assets: items.slice().sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
		}))
}

export function formatInterfaceSpeed(speedMbps?: number) {
	if (!speedMbps || speedMbps <= 0) return ""
	if (speedMbps >= 1000) return `${(speedMbps / 1000).toFixed(speedMbps % 1000 === 0 ? 0 : 1)}G`
	return `${speedMbps}M`
}

export function getInterfaceBand(interfaces: AssetInterfaceRecord[], id: string | null | undefined) {
	if (!id) return ""
	const value = interfaces.find((item) => item.id === id)?.metadata?.band
	return typeof value === "string" ? value : ""
}

export function buildEditorGraph(input: {
	assets: AssetRecord[]
	interfaces: AssetInterfaceRecord[]
	relations: AssetRelationRecord[]
	layout: TopologyLayout | null
	systems: SystemRecord[]
	presence?: AssetPresenceRecord[]
	/** 编辑页传 true：四个连接点常显；展示页不传，保持悬停显示 */
	showHandles?: boolean
	domain?: string
}): {
	nodes: TopologyEditorNode[]
	edges: TopologyEditorEdge[]
	visibleAssetIds: Set<string>
	hiddenAssetIds: Set<string>
	hasLayout: boolean
} {
	const assetsById = new Map(input.assets.map((asset) => [asset.id, asset]))
	const systemsByAssetId = new Map(
		input.systems.filter((system) => system.asset).map((system) => [system.asset as string, system])
	)
	const presenceByAssetId = new Map((input.presence ?? []).map((item) => [item.asset, item]))
	const layoutByAsset = new Map((input.layout?.nodes ?? []).map((node) => [node.assetId, node]))
	const connectedRelations = input.relations.filter(
		(relation) =>
			relation.kind === "connected_to" &&
			(!input.domain || resolveEditorRelationDomain(relation, assetsById) === input.domain)
	)
	const relationEndpoints = new Set<string>()
	for (const relation of connectedRelations) {
		relationEndpoints.add(relation.source_asset)
		relationEndpoints.add(relation.target_asset)
	}
	const layoutNodes = input.layout?.nodes ?? []
	const hiddenAssetIds = new Set(layoutNodes.filter((node) => node.hidden).map((node) => node.assetId))
	const visibleAssetIds = new Set<string>()
	for (const node of layoutNodes) {
		if (!node.hidden && assetsById.has(node.assetId)) visibleAssetIds.add(node.assetId)
	}
	for (const assetId of relationEndpoints) {
		if (!layoutByAsset.has(assetId) && assetsById.has(assetId)) visibleAssetIds.add(assetId)
	}

	const nodes: TopologyEditorNode[] = Array.from(visibleAssetIds)
		.map((assetId) => assetsById.get(assetId))
		.filter((asset): asset is AssetRecord => Boolean(asset))
		.map((asset) => {
			const layoutNode = layoutByAsset.get(asset.id)
			const settings = normalizeNodeSettings(layoutNode)
			const width = TOPOLOGY_NODE_WIDTH * settings.scale
			const height = TOPOLOGY_NODE_HEIGHT * settings.scale
			return {
				id: asset.id,
				type: "topologyEditor",
				position: { x: layoutNode?.x ?? 0, y: layoutNode?.y ?? 0 },
				style: { width, height },
				data: {
					asset,
					system: systemsByAssetId.get(asset.id),
					presence: presenceByAssetId.get(asset.id),
					settings,
					showHandles: input.showHandles === true,
				},
			}
		})

	const nodesById = new Map(nodes.map((node) => [node.id, node]))
	const interfacesById = new Map(input.interfaces.map((item) => [item.id, item]))
	const edges: TopologyEditorEdge[] = connectedRelations
		.filter((relation) => visibleAssetIds.has(relation.source_asset) && visibleAssetIds.has(relation.target_asset))
		.map((relation) => {
			const edge = buildEditorEdgeFromRelation(relation, assetsById, interfacesById)
			if (edge.data.handlesManual) return edge
			return { ...edge, ...pickEditorEdgeHandles(nodesById.get(edge.source), nodesById.get(edge.target)) }
		})

	return {
		nodes,
		edges,
		visibleAssetIds,
		hiddenAssetIds,
		hasLayout: layoutNodes.length > 0,
	}
}

export function resolveEditorRelationDomain(
	relation: AssetRelationRecord | undefined,
	assetsById: Map<string, AssetRecord>
): TopologyEditorDomain {
	const value = relation?.metadata?.network_domain
	if (typeof value === "string") {
		const normalized = value.trim()
		if (normalized === "technology" || normalized === "科技网" || normalized === "tech") return "technology"
		if (normalized === "home" || normalized === "家庭网") return "home"
		if (normalized) return normalized
	}
	return inferEditorDomain(
		relation ? assetsById.get(relation.source_asset) : undefined,
		relation ? assetsById.get(relation.target_asset) : undefined
	)
}

export function buildEditorEdgeFromRelation(
	relation: AssetRelationRecord,
	assetsById: Map<string, AssetRecord>,
	interfacesById?: Map<string, AssetInterfaceRecord>
): TopologyEditorEdge {
	const medium = normalizeMedium(relation.metadata?.link_kind)
	const bandwidth = typeof relation.metadata?.bandwidth === "string" ? relation.metadata.bandwidth : ""
	const sourceAsset = assetsById.get(relation.source_asset)
	const targetAsset = assetsById.get(relation.target_asset)
	const direction = getTopologyVisualDirection(
		relation.source_asset,
		relation.target_asset,
		medium,
		sourceAsset,
		targetAsset
	)
	const sourceInterface =
		typeof relation.metadata?.source_interface === "string" ? relation.metadata.source_interface : ""
	const targetInterface =
		typeof relation.metadata?.target_interface === "string" ? relation.metadata.target_interface : ""
	const interfaceBand =
		interfacesById?.get(sourceInterface)?.metadata?.band ?? interfacesById?.get(targetInterface)?.metadata?.band
	const band =
		typeof relation.metadata?.wifi_band === "string"
			? relation.metadata.wifi_band
			: typeof interfaceBand === "string"
				? interfaceBand
				: ""
	const storedSourceHandle = typeof relation.metadata?.source_handle === "string" ? relation.metadata.source_handle : ""
	const storedTargetHandle = typeof relation.metadata?.target_handle === "string" ? relation.metadata.target_handle : ""
	const handlesManual = Boolean(storedSourceHandle && storedTargetHandle)
	return decorateEditorEdge({
		id: relation.id,
		source: direction.source,
		target: direction.target,
		type: "smoothstep",
		sourceHandle: handlesManual ? storedSourceHandle : undefined,
		targetHandle: handlesManual ? storedTargetHandle : undefined,
		data: {
			relationId: relation.id,
			isNew: false,
			domain: resolveEditorRelationDomain(relation, assetsById),
			sourceInterface: direction.swapped ? targetInterface : sourceInterface,
			targetInterface: direction.swapped ? sourceInterface : targetInterface,
			medium,
			bandwidth,
			band,
			status: normalizeLinkStatus(relation.metadata?.link_status),
			notes: typeof relation.metadata?.notes === "string" ? relation.metadata.notes : "",
			label: relation.label || "",
			handlesManual,
		},
	})
}

export function pickEditorEdgeHandles(
	sourceNode: TopologyEditorNode | undefined,
	targetNode: TopologyEditorNode | undefined
): { sourceHandle: string; targetHandle: string } {
	if (!sourceNode || !targetNode) return { sourceHandle: "right", targetHandle: "left" }
	return pickTopologyHandles(
		{
			x: sourceNode.position.x,
			y: sourceNode.position.y,
			width: Number(sourceNode.style?.width) || TOPOLOGY_NODE_WIDTH,
			height: Number(sourceNode.style?.height) || TOPOLOGY_NODE_HEIGHT,
		},
		{
			x: targetNode.position.x,
			y: targetNode.position.y,
			width: Number(targetNode.style?.width) || TOPOLOGY_NODE_WIDTH,
			height: Number(targetNode.style?.height) || TOPOLOGY_NODE_HEIGHT,
		}
	)
}

export function decorateEditorEdge(edge: TopologyEditorEdge): TopologyEditorEdge {
	const visual = getTopologyEdgeAppearance(edge.data.medium, edge.data.bandwidth, undefined, edge.data.band)
	// pathOptions 是 smoothstep 边的运行时属性，@xyflow/react 的 Edge 联合类型未在对象类型上暴露，整体断言。
	return {
		...edge,
		sourceHandle: edge.sourceHandle ?? "right",
		targetHandle: edge.targetHandle ?? "left",
		reconnectable: true,
		type: "smoothstep",
		pathOptions: { borderRadius: 16 },
		style: {
			stroke: visual.color,
			strokeWidth: visual.width,
			strokeDasharray: visual.dashed ? "5 5" : undefined,
		},
		markerEnd: {
			type: MarkerType.ArrowClosed,
			width: 11,
			height: 11,
			color: visual.color,
		},
	} as TopologyEditorEdge
}

export function createEditorEdge(
	sourceId: string,
	targetId: string,
	assets: AssetRecord[],
	interfaces: AssetInterfaceRecord[],
	id = `new-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
	sourceHandle: string | null = null,
	targetHandle: string | null = null,
	domain?: string
): TopologyEditorEdge {
	const assetsById = new Map(assets.map((asset) => [asset.id, asset]))
	let source = sourceId
	let target = targetId
	let sourceAsset = assetsById.get(source)
	let targetAsset = assetsById.get(target)
	let medium: TopologyEditorMedium = "ethernet"
	if (sourceAsset?.type === "internet" || targetAsset?.type === "internet") medium = "fiber"
	else if (isEditorWirelessClient(sourceAsset) || isEditorWirelessClient(targetAsset)) medium = "wifi"
	else if (isEditorNetworkDevice(sourceAsset) || isEditorNetworkDevice(targetAsset)) medium = "ethernet"

	const direction = getTopologyVisualDirection(source, target, medium, sourceAsset, targetAsset)
	source = direction.source
	target = direction.target
	sourceAsset = assetsById.get(source)
	targetAsset = assetsById.get(target)

	const picked = pickDefaultInterfaces(sourceAsset, targetAsset, medium, interfaces)
	const band =
		medium === "wifi"
			? getInterfaceBand(interfaces, picked.sourceInterface) || getInterfaceBand(interfaces, picked.targetInterface)
			: ""
	return decorateEditorEdge({
		id,
		source,
		target,
		type: "smoothstep",
		sourceHandle: sourceHandle ?? "right",
		targetHandle: targetHandle ?? "left",
		data: {
			relationId: id,
			isNew: true,
			domain: domain || inferEditorDomain(sourceAsset, targetAsset),
			sourceInterface: picked.sourceInterface,
			targetInterface: picked.targetInterface,
			medium,
			bandwidth: picked.bandwidth,
			band,
			status: "active",
			notes: "",
			label: "",
			handlesManual: Boolean(sourceHandle || targetHandle),
		},
	})
}

export function reconnectEditorEdge(
	edge: TopologyEditorEdge,
	connection: {
		source: string | null
		target: string | null
		sourceHandle?: string | null
		targetHandle?: string | null
	},
	assets: AssetRecord[],
	interfaces: AssetInterfaceRecord[]
): TopologyEditorEdge {
	if (!connection.source || !connection.target || connection.source === connection.target) return edge
	const assetsById = new Map(assets.map((asset) => [asset.id, asset]))
	const direction = getTopologyVisualDirection(
		connection.source,
		connection.target,
		edge.data.medium,
		assetsById.get(connection.source),
		assetsById.get(connection.target)
	)
	const source = direction.source
	const target = direction.target
	const rawSourceHandle = direction.swapped ? connection.targetHandle : connection.sourceHandle
	const rawTargetHandle = direction.swapped ? connection.sourceHandle : connection.targetHandle
	const sourceHandle = rawSourceHandle || (source === edge.source ? edge.sourceHandle : null) || "right"
	const targetHandle = rawTargetHandle || (target === edge.target ? edge.targetHandle : null) || "left"
	const endpointChanged = source !== edge.source || target !== edge.target
	const picked = endpointChanged
		? pickEditorInterfaces(assetsById.get(source), assetsById.get(target), edge.data.medium, interfaces)
		: undefined
	const band =
		picked && edge.data.medium === "wifi"
			? getInterfaceBand(interfaces, picked.sourceInterface) || getInterfaceBand(interfaces, picked.targetInterface)
			: edge.data.band
	return decorateEditorEdge({
		...edge,
		source,
		target,
		sourceHandle,
		targetHandle,
		data: {
			...edge.data,
			sourceInterface: picked ? picked.sourceInterface : edge.data.sourceInterface,
			targetInterface: picked ? picked.targetInterface : edge.data.targetInterface,
			band,
			handlesManual: true,
		},
	})
}

export function createEditorNode(
	asset: AssetRecord,
	system: SystemRecord | undefined,
	position: { x: number; y: number },
	settings?: Partial<TopologyEditorNodeSettings>
): TopologyEditorNode {
	const normalized = normalizeNodeSettings(settings)
	return {
		id: asset.id,
		type: "topologyEditor",
		position,
		style: {
			width: TOPOLOGY_NODE_WIDTH * normalized.scale,
			height: TOPOLOGY_NODE_HEIGHT * normalized.scale,
		},
		data: { asset, system, settings: normalized },
	}
}

export function pickEditorInterfaces(
	sourceAsset: AssetRecord | undefined,
	targetAsset: AssetRecord | undefined,
	medium: TopologyEditorMedium,
	interfaces: AssetInterfaceRecord[]
) {
	return pickDefaultInterfaces(sourceAsset, targetAsset, medium, interfaces)
}

function pickDefaultInterfaces(
	sourceAsset: AssetRecord | undefined,
	targetAsset: AssetRecord | undefined,
	medium: TopologyEditorMedium,
	interfaces: AssetInterfaceRecord[]
): { sourceInterface: string; targetInterface: string; bandwidth: string } {
	const forAsset = (asset: AssetRecord | undefined) =>
		interfaces.filter((item) => item.asset === asset?.id && item.metadata?.enabled !== false)
	const first = (asset: AssetRecord | undefined, kinds: string[]) =>
		forAsset(asset).find((item) => kinds.includes(item.kind) && item.primary) ??
		forAsset(asset).find((item) => kinds.includes(item.kind))
	if (medium === "fiber" && sourceAsset?.type === "internet") {
		const targetInterface = first(targetAsset, ["pon", "wan"]) ?? first(targetAsset, ["optical"])
		return {
			sourceInterface: "",
			targetInterface: targetInterface?.id ?? "",
			bandwidth: formatInterfaceSpeed(targetInterface?.speed_mbps),
		}
	}
	if (medium === "wifi") {
		const sourceInterface = first(sourceAsset, ["wifi"])
		const targetInterface = first(targetAsset, ["wifi"])
		return {
			sourceInterface: sourceInterface?.id ?? "",
			targetInterface: targetInterface?.id ?? "",
			bandwidth: "",
		}
	}
	const kinds = medium === "fiber" ? ["optical", "pon", "wan"] : ["ethernet", "lan", "wan"]
	const sourceInterface = first(sourceAsset, kinds)
	const targetInterface = first(targetAsset, kinds)
	return {
		sourceInterface: sourceInterface?.id ?? "",
		targetInterface: targetInterface?.id ?? "",
		bandwidth: formatInterfaceSpeed(targetInterface?.speed_mbps ?? sourceInterface?.speed_mbps),
	}
}

export function autoLayoutEditorGraph(nodes: TopologyEditorNode[], edges: TopologyEditorEdge[]): TopologyEditorNode[] {
	const graph = new dagre.graphlib.Graph()
	graph.setDefaultEdgeLabel(() => ({}))
	graph.setGraph({ rankdir: "LR", nodesep: 64, ranksep: 150, marginx: 48, marginy: 48 })
	for (const node of nodes) {
		const width = Number(node.style?.width) || TOPOLOGY_NODE_WIDTH
		const height = Number(node.style?.height) || TOPOLOGY_NODE_HEIGHT
		graph.setNode(node.id, { width, height })
	}
	for (const edge of edges) {
		if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) graph.setEdge(edge.source, edge.target)
	}
	dagre.layout(graph)
	const connectedIds = new Set(edges.flatMap((edge) => [edge.source, edge.target]))
	let maxY = 0
	const laidOut = nodes.map((node) => {
		const width = Number(node.style?.width) || TOPOLOGY_NODE_WIDTH
		const height = Number(node.style?.height) || TOPOLOGY_NODE_HEIGHT
		const point = graph.node(node.id) as { x: number; y: number } | undefined
		const x = Math.max(0, (point?.x ?? 0) - width / 2)
		const y = Math.max(0, (point?.y ?? 0) - height / 2)
		maxY = Math.max(maxY, y + height)
		return {
			...node,
			position: { x: Math.round(x / 20) * 20, y: Math.round(y / 20) * 20 },
		}
	})
	const isolated = laidOut.filter((node) => !connectedIds.has(node.id))
	if (isolated.length > 0) {
		const startY = Math.round((maxY + 120) / 20) * 20
		isolated.forEach((node, index) => {
			node.position = {
				x: 48 + (index % 5) * (TOPOLOGY_NODE_WIDTH + 60),
				y: startY + Math.floor(index / 5) * (TOPOLOGY_NODE_HEIGHT + 60),
			}
		})
	}
	return laidOut
}

export function toLayoutNode(node: TopologyEditorNode, hidden = false, canvasId?: string): TopologyLayoutNode {
	return {
		assetId: node.id,
		...(canvasId ? { canvasId } : {}),
		x: Math.round(node.position.x / 20) * 20,
		y: Math.round(node.position.y / 20) * 20,
		hidden,
		...node.data.settings,
	}
}

export function buildLayoutPayload(
	visibleNodes: TopologyEditorNode[],
	hiddenNodes: TopologyLayoutNode[],
	canvasId?: string
): TopologyLayout {
	const byAsset = new Map<string, TopologyLayoutNode>()
	for (const node of hiddenNodes) {
		byAsset.set(node.assetId, { ...node, hidden: true, ...(canvasId ? { canvasId } : {}) })
	}
	for (const node of visibleNodes) byAsset.set(node.id, toLayoutNode(node, false, canvasId))
	return { nodes: Array.from(byAsset.values()) }
}

export function buildRelationSavePayload(
	edge: TopologyEditorEdge,
	relation: AssetRelationRecord | undefined,
	assetsById: Map<string, AssetRecord>
) {
	let source = edge.source
	let target = edge.target
	let sourceInterface = edge.data.sourceInterface
	let targetInterface = edge.data.targetInterface
	let sourceAsset = assetsById.get(source)
	let targetAsset = assetsById.get(target)

	if (edge.data.medium === "fiber" && targetAsset?.type === "internet" && sourceAsset?.type !== "internet") {
		;[source, target] = [target, source]
		;[sourceInterface, targetInterface] = [targetInterface, sourceInterface]
		;[sourceAsset, targetAsset] = [targetAsset, sourceAsset]
	}
	if (edge.data.medium === "wifi" && isEditorNetworkDevice(sourceAsset) && !isEditorNetworkDevice(targetAsset)) {
		;[source, target] = [target, source]
		;[sourceInterface, targetInterface] = [targetInterface, sourceInterface]
		;[sourceAsset, targetAsset] = [targetAsset, sourceAsset]
	}
	if (sourceAsset?.type === "internet") sourceInterface = ""
	if (targetAsset?.type === "internet") targetInterface = ""

	const metadata: Record<string, unknown> = { ...(relation?.metadata ?? {}) }
	metadata.link_kind =
		sourceAsset?.type === "internet" ? "internet" : edge.data.medium === "fiber" ? "fiber" : edge.data.medium
	metadata.network_domain = edge.data.domain
	metadata.link_status = edge.data.status
	if (edge.data.medium === "wifi" && edge.data.band) metadata.wifi_band = edge.data.band
	else delete metadata.wifi_band
	if (sourceInterface) metadata.source_interface = sourceInterface
	else delete metadata.source_interface
	if (targetInterface) metadata.target_interface = targetInterface
	else delete metadata.target_interface
	if (edge.data.bandwidth) metadata.bandwidth = edge.data.bandwidth
	else delete metadata.bandwidth
	if (edge.data.notes) metadata.notes = edge.data.notes
	else delete metadata.notes
	if (edge.data.handlesManual) {
		if (edge.sourceHandle) metadata.source_handle = edge.sourceHandle
		if (edge.targetHandle) metadata.target_handle = edge.targetHandle
	} else {
		delete metadata.source_handle
		delete metadata.target_handle
	}

	return {
		source_asset: source,
		target_asset: target,
		kind: "connected_to" as const,
		label: relation?.label || edge.data.label || `${sourceAsset?.name ?? source} → ${targetAsset?.name ?? target}`,
		metadata,
	}
}
