import "@xyflow/react/dist/style.css"
import {
	Background,
	BackgroundVariant,
	ConnectionMode,
	Panel,
	ReactFlow,
	ViewportPortal,
	useEdgesState,
	useNodesState,
	type Connection,
	type CoordinateExtent,
	type ReactFlowInstance,
} from "@xyflow/react"
import { getPagePath } from "@nanostores/router"
import { useStore } from "@nanostores/react"
import {
	ArrowLeftIcon,
	CheckIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	EyeOffIcon,
	ExternalLinkIcon,
	Grid3X3Icon,
	PlusIcon,
	Redo2Icon,
	RulerIcon,
	SaveIcon,
	SearchIcon,
	Trash2Icon,
	Undo2Icon,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { $router, Link, navigate } from "@/components/router"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "@/components/ui/use-toast"
import { isPocketBaseAutoCancel, isReadOnlyUser, pb } from "@/lib/api"
import { pageTitle } from "@/lib/branding"
import { formatPocketBaseError } from "@/lib/pocketbase-error"
import { $systems } from "@/lib/stores"
import { getAssetIcon } from "@/modules/asset-center/components/asset-card"
import { getAssetTypeLabel } from "@/modules/asset-center/asset-schema"
import type { AssetInterfaceRecord, AssetPresenceRecord, AssetRecord, AssetRelationRecord } from "@/types"
import { EDITOR_ICON_OPTIONS, TopologyEditorNodeCard } from "@/modules/network-topology/editor/editor-node"
import {
	BANDWIDTH_OPTIONS,
	DEFAULT_NODE_SETTINGS,
	DEFAULT_TOPOLOGY_CANVASES,
	LINK_STATUS_OPTIONS,
	MEDIUM_OPTIONS,
	autoLayoutEditorGraph,
	buildAssetCanvasMap,
	buildEditorEdgeFromRelation,
	buildEditorGraph,
	buildLayoutPayload,
	buildRelationSavePayload,
	createEditorEdge,
	createEditorNode,
	decorateEditorEdge,
	formatInterfaceSpeed,
	getInterfaceBand,
	groupAssetsForLibrary,
	inferEditorDomain,
	isEditorNetworkDevice,
	normalizeLayoutNodes,
	normalizeNodeSettings,
	normalizeTopologyCanvases,
	TOPOLOGY_NODE_HEIGHT,
	TOPOLOGY_NODE_WIDTH,
	pickEditorInterfaces,
	reconnectEditorEdge,
	resolveEditorRelationDomain,
	toLayoutNode,
	type TopologyCanvas,
	type TopologyCanvasViewport,
	type TopologyEditorEdge,
	type TopologyEditorMedium,
	type TopologyEditorNode,
	type TopologyEditorNodeSettings,
	type TopologyLayout,
	type TopologyLayoutNode,
} from "@/modules/network-topology/editor/editor-model"
import { TopologyEdgeLegend } from "@/modules/network-topology/editor/topology-edge-legend"

const nodeTypes = { topologyEditor: TopologyEditorNodeCard }
const ASSET_DRAG_TYPE = "application/pulse-asset"
const ACTIVE_CANVAS_STORAGE_KEY = "pulse.topology.active-canvas"

type LayoutRecord = TopologyLayout & { id: string; user: string }

function isDefaultCanvas(canvas: TopologyCanvas) {
	return canvas.id === "home" || canvas.id === "technology"
}

const CANVAS_EXTENT_PADDING = 24

// 2026-10-21 用户要求卡片不能拖出初始画布：用加载时的节点包围盒作为固定可拖拽范围。
function buildCanvasExtent(nodes: TopologyEditorNode[]): CoordinateExtent | null {
	if (nodes.length === 0) return null
	const left = Math.min(...nodes.map((node) => node.position.x)) - CANVAS_EXTENT_PADDING
	const top = Math.min(...nodes.map((node) => node.position.y)) - CANVAS_EXTENT_PADDING
	const right = Math.max(...nodes.map((node) => node.position.x)) + TOPOLOGY_NODE_WIDTH + CANVAS_EXTENT_PADDING
	const bottom = Math.max(...nodes.map((node) => node.position.y)) + TOPOLOGY_NODE_HEIGHT + CANVAS_EXTENT_PADDING
	return [
		[left, top],
		[right, bottom],
	]
}

function mergeCanvasExtent(current: CoordinateExtent | null, next: CoordinateExtent | null) {
	if (!current) return next
	if (!next) return current
	return [
		[Math.min(current[0][0], next[0][0]), Math.min(current[0][1], next[0][1])],
		[Math.max(current[1][0], next[1][0]), Math.max(current[1][1], next[1][1])],
	] as CoordinateExtent
}

// 默认画布按资产所属网段取节点；新建画布只包含明确拖入该画布的节点。
function getCanvasAssets(
	canvas: TopologyCanvas,
	assets: AssetRecord[],
	layoutNodes: TopologyLayoutNode[],
	canvasIdByAsset: Map<string, string>
) {
	const explicit = new Set(layoutNodes.filter((node) => node.canvasId === canvas.id).map((node) => node.assetId))
	if (isDefaultCanvas(canvas)) {
		return assets.filter((asset) => explicit.has(asset.id) || canvasIdByAsset.get(asset.id) === canvas.id)
	}
	return assets.filter((asset) => explicit.has(asset.id))
}

type EditorSnapshot = {
	nodes: TopologyEditorNode[]
	edges: TopologyEditorEdge[]
	hiddenNodes: TopologyLayoutNode[]
	deletedRelationIds: string[]
}

const INTERFACE_KIND_LABELS: Record<string, string> = {
	ethernet: "电口",
	wifi: "无线",
	pon: "PON",
	optical: "光口",
	wan: "WAN",
	lan: "LAN",
	management: "管理口",
	virtual: "虚拟",
	power: "电源",
	usb: "USB",
	video: "视频",
	custom: "自定义",
}

export default function NetworkTopologyEditorPage() {
	const systems = useStore($systems)
	const readOnly = isReadOnlyUser()
	const [assets, setAssets] = useState<AssetRecord[]>([])
	const [interfaces, setInterfaces] = useState<AssetInterfaceRecord[]>([])
	const [relations, setRelations] = useState<AssetRelationRecord[]>([])
	const [presence, setPresence] = useState<AssetPresenceRecord[]>([])
	const [nodes, setNodes, onNodesChange] = useNodesState<TopologyEditorNode>([])
	const [edges, setEdges, onEdgesChange] = useEdgesState<TopologyEditorEdge>([])
	const [hiddenNodes, setHiddenNodes] = useState<TopologyLayoutNode[]>([])
	const [deletedRelationIds, setDeletedRelationIds] = useState<string[]>([])
	const [layoutRecordId, setLayoutRecordId] = useState<string | null>(null)
	const [canvases, setCanvases] = useState<TopologyCanvas[]>(() =>
		DEFAULT_TOPOLOGY_CANVASES.map((canvas) => ({ ...canvas }))
	)
	const [allLayoutNodes, setAllLayoutNodes] = useState<TopologyLayoutNode[]>([])
	const [activeCanvasId, setActiveCanvasId] = useState("home")
	const [newCanvasOpen, setNewCanvasOpen] = useState(false)
	const [newCanvasName, setNewCanvasName] = useState("")
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
	const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
	const [search, setSearch] = useState("")
	const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set())
	const [gridSnap, setGridSnap] = useState(true)
	const [showGuides, setShowGuides] = useState(true)
	const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] })
	const [canvasExtent, setCanvasExtent] = useState<CoordinateExtent | null>(null)
	const viewportByCanvasRef = useRef<Map<string, TopologyCanvasViewport>>(new Map())
	const [instance, setInstance] = useState<ReactFlowInstance<TopologyEditorNode, TopologyEditorEdge> | null>(null)
	const [loading, setLoading] = useState(true)
	const [saving, setSaving] = useState(false)
	const [dirty, setDirty] = useState(false)
	const [loadError, setLoadError] = useState("")
	const [leaveOpen, setLeaveOpen] = useState(false)
	const historyRef = useRef<EditorSnapshot[]>([])
	const futureRef = useRef<EditorSnapshot[]>([])
	const [, setHistoryVersion] = useState(0)
	const fittedRef = useRef(false)

	const systemsByAssetId = useMemo(
		() => new Map(systems.filter((system) => system.asset).map((system) => [system.asset as string, system])),
		[systems]
	)
	const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets])
	const interfacesById = useMemo(() => new Map(interfaces.map((item) => [item.id, item])), [interfaces])
	const activeCanvas = useMemo(
		() => canvases.find((canvas) => canvas.id === activeCanvasId) ?? canvases[0] ?? DEFAULT_TOPOLOGY_CANVASES[0],
		[activeCanvasId, canvases]
	)
	const canvasIdByAsset = useMemo(
		() => buildAssetCanvasMap(assets, relations, canvases, allLayoutNodes),
		[allLayoutNodes, assets, canvases, relations]
	)
	const canvasAssets = useMemo(
		() => getCanvasAssets(activeCanvas, assets, allLayoutNodes, canvasIdByAsset),
		[activeCanvas, allLayoutNodes, assets, canvasIdByAsset]
	)
	const libraryAssets = useMemo(
		() => (isDefaultCanvas(activeCanvas) ? canvasAssets : assets),
		[activeCanvas, assets, canvasAssets]
	)
	const visibleAssetIds = useMemo(() => new Set(nodes.map((node) => node.id)), [nodes])
	const hiddenAssetIds = useMemo(() => new Set(hiddenNodes.map((node) => node.assetId)), [hiddenNodes])
	const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId) ?? null, [nodes, selectedNodeId])
	const selectedEdge = useMemo(() => edges.find((edge) => edge.id === selectedEdgeId) ?? null, [edges, selectedEdgeId])
	const sourceAsset = selectedEdge ? assetsById.get(selectedEdge.source) : undefined
	const targetAsset = selectedEdge ? assetsById.get(selectedEdge.target) : undefined
	const canUndo = historyRef.current.length > 0
	const canRedo = futureRef.current.length > 0
	const libraryGroups = useMemo(() => groupAssetsForLibrary(libraryAssets), [libraryAssets])

	useEffect(() => {
		document.title = pageTitle("网络拓扑编辑")
		document.body.classList.add("pulse-topology-editor-mode")
		return () => document.body.classList.remove("pulse-topology-editor-mode")
	}, [])

	useEffect(() => {
		if (readOnly) {
			setLoading(false)
			return
		}
		loadEditor().catch((error) => {
			console.error("load topology editor", error)
			setLoadError(formatPocketBaseError(error, "拓扑编辑数据加载失败，请稍后重试。"))
			setLoading(false)
		})
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [readOnly])

	useEffect(() => {
		if (!dirty) return
		const handler = (event: BeforeUnloadEvent) => {
			event.preventDefault()
			event.returnValue = ""
		}
		window.addEventListener("beforeunload", handler)
		return () => window.removeEventListener("beforeunload", handler)
	}, [dirty])

	useEffect(() => {
		if (fittedRef.current || !instance || nodes.length === 0) return
		fittedRef.current = true
		const savedViewport = viewportByCanvasRef.current.get(activeCanvasId) ?? activeCanvas.viewport
		window.requestAnimationFrame(() => {
			// 画布固定 100%：只恢复平移位置，缩放永远锁 1
			if (savedViewport) {
				instance.setViewport({ x: savedViewport.x, y: savedViewport.y, zoom: 1 }, { duration: 0 })
				return
			}
			instance.fitView({ padding: 0.18, minZoom: 1, maxZoom: 1, duration: 0 })
		})
	}, [activeCanvas.viewport, activeCanvasId, instance, nodes.length])

	// 全局 systems 与拓扑数据谁先到不确定：两边任一到位都要回填心跳，避免 Agent 主机被在线探测误判为离线
	useEffect(() => {
		if (systemsByAssetId.size === 0) return
		setNodes((current) => {
			let changed = false
			const next = current.map((node) => {
				const nextSystem = systemsByAssetId.get(node.id)
				if (node.data.system?.id === nextSystem?.id && node.data.system?.status === nextSystem?.status) return node
				changed = true
				return { ...node, data: { ...node.data, system: nextSystem } }
			})
			return changed ? next : current
		})
	}, [systemsByAssetId, nodes.length, setNodes])

	async function loadEditor() {
		setLoading(true)
		setLoadError("")
		fittedRef.current = false
		try {
			const [assetList, interfaceList, relationList, presenceList] = await Promise.all([
				pb.collection<AssetRecord>("assets").getFullList({ sort: "name", requestKey: null }),
				pb.collection<AssetInterfaceRecord>("asset_interfaces").getFullList({
					sort: "-primary,kind,name",
					requestKey: null,
				}),
				pb.collection<AssetRelationRecord>("asset_relations").getFullList({
					sort: "kind,created",
					requestKey: null,
				}),
				pb.collection<AssetPresenceRecord>("asset_presence").getFullList({ requestKey: null }),
			])
			const userId = pb.authStore.record?.id
			let layoutRecord: LayoutRecord | null = null
			if (userId) {
				try {
					layoutRecord = await pb
						.collection<LayoutRecord>("network_topology_layouts")
						.getFirstListItem(`user="${userId}"`)
				} catch (error) {
					if ((error as { status?: number })?.status !== 404) throw error
				}
			}
			const nextCanvases = normalizeTopologyCanvases(layoutRecord?.canvases)
			const viewportByCanvas = new Map<string, TopologyCanvasViewport>()
			for (const canvas of nextCanvases) {
				if (canvas.viewport) viewportByCanvas.set(canvas.id, canvas.viewport)
			}
			viewportByCanvasRef.current = viewportByCanvas
			const rawLayoutNodes = Array.isArray(layoutRecord?.nodes) ? layoutRecord.nodes : []
			const assetsByIdForLoad = new Map(assetList.map((asset) => [asset.id, asset]))
			const canvasIdByAssetForLoad = buildAssetCanvasMap(
				assetList,
				relationList,
				nextCanvases,
				rawLayoutNodes as TopologyLayoutNode[]
			)
			const nextLayoutNodes = normalizeLayoutNodes(
				rawLayoutNodes,
				nextCanvases,
				assetsByIdForLoad,
				canvasIdByAssetForLoad
			)
			const params = new URLSearchParams(window.location.search)
			const focusAsset = params.get("asset")
			const focusNode = focusAsset ? nextLayoutNodes.find((node) => node.assetId === focusAsset) : undefined
			const requestedCanvasId =
				params.get("canvas") || focusNode?.canvasId || localStorage.getItem(ACTIVE_CANVAS_STORAGE_KEY)
			const nextActiveCanvas =
				nextCanvases.find((canvas) => canvas.id === requestedCanvasId) ??
				nextCanvases.find((canvas) => canvas.id === "home") ??
				nextCanvases[0]
			setAssets(assetList)
			setInterfaces(interfaceList)
			setRelations(relationList)
			setPresence(presenceList)
			setCanvases(nextCanvases)
			setAllLayoutNodes(nextLayoutNodes)
			setLayoutRecordId(layoutRecord?.id ?? null)
			applyCanvasState(
				nextActiveCanvas,
				assetList,
				nextLayoutNodes,
				interfaceList,
				relationList,
				canvasIdByAssetForLoad,
				presenceList
			)
			if (focusAsset) {
				const focusGraph = buildCanvasElements(
					nextActiveCanvas,
					assetList,
					nextLayoutNodes,
					interfaceList,
					relationList,
					canvasIdByAssetForLoad,
					presenceList
				)
				if (focusGraph.nodes.some((node) => node.id === focusAsset)) setSelectedNodeId(focusAsset)
			}
		} catch (error) {
			if (isPocketBaseAutoCancel(error)) return
			throw error
		} finally {
			setLoading(false)
		}
	}

	function buildCanvasElements(
		canvas: TopologyCanvas,
		assetList: AssetRecord[],
		layoutNodes: TopologyLayoutNode[],
		interfaceList: AssetInterfaceRecord[],
		relationList: AssetRelationRecord[],
		canvasIdByAsset: Map<string, string>,
		presenceList: AssetPresenceRecord[] = presence
	) {
		const canvasLayoutNodes = layoutNodes.filter((node) => node.canvasId === canvas.id)
		const canvasAssets = getCanvasAssets(canvas, assetList, layoutNodes, canvasIdByAsset)
		const graph = buildEditorGraph({
			assets: canvasAssets,
			interfaces: interfaceList,
			relations: relationList,
			layout: { nodes: canvasLayoutNodes },
			systems,
			presence: presenceList,
			// 编辑页：四个连接点常显成小节点，便于拖线
			showHandles: true,
			domain: canvas.domain,
		})
		let nextNodes = graph.nodes
		if (!graph.hasLayout) {
			nextNodes = autoLayoutEditorGraph(nextNodes, graph.edges)
		} else {
			const positioned = new Set(canvasLayoutNodes.map((node) => node.assetId))
			const maxX = nextNodes.reduce((max, node) => Math.max(max, node.position.x), 0)
			const missing = nextNodes.filter((node) => !positioned.has(node.id))
			missing.forEach((node, index) => {
				node.position = {
					x: maxX + 280 + (index % 3) * 260,
					y: 60 + Math.floor(index / 3) * 130,
				}
			})
		}
		return {
			nodes: nextNodes,
			edges: graph.edges,
			hiddenNodes: canvasLayoutNodes.filter((node) => node.hidden),
		}
	}

	function applyCanvasState(
		canvas: TopologyCanvas,
		assetList: AssetRecord[],
		layoutNodes: TopologyLayoutNode[],
		interfaceList: AssetInterfaceRecord[],
		relationList: AssetRelationRecord[],
		canvasIdByAsset?: Map<string, string>,
		presenceList?: AssetPresenceRecord[]
	) {
		const resolvedCanvasIds = canvasIdByAsset ?? buildAssetCanvasMap(assetList, relationList, canvases, layoutNodes)
		const elements = buildCanvasElements(
			canvas,
			assetList,
			layoutNodes,
			interfaceList,
			relationList,
			resolvedCanvasIds,
			presenceList
		)
		setActiveCanvasId(canvas.id)
		setNodes(elements.nodes)
		setEdges(elements.edges)
		setHiddenNodes(elements.hiddenNodes)
		setCanvasExtent(buildCanvasExtent(elements.nodes))
		setDeletedRelationIds([])
		clearSelection()
		setDirty(false)
		historyRef.current = []
		futureRef.current = []
		fittedRef.current = false
		setHistoryVersion((version) => version + 1)
		localStorage.setItem(ACTIVE_CANVAS_STORAGE_KEY, canvas.id)
	}

	function switchCanvas(canvasId: string) {
		if (canvasId === activeCanvasId) return
		if (dirty) {
			toast({
				title: "请先保存当前画布",
				description: "切换画布前先保存，避免当前位置和连线修改丢失。",
			})
			return
		}
		const nextCanvas = canvases.find((canvas) => canvas.id === canvasId)
		if (!nextCanvas) return
		applyCanvasState(nextCanvas, assets, allLayoutNodes, interfaces, relations)
	}

	function createCanvas() {
		if (dirty) {
			toast({ title: "请先保存当前画布", description: "保存后再新建画布。" })
			return
		}
		const name = newCanvasName.trim()
		if (!name) return
		if (canvases.some((canvas) => canvas.name === name)) {
			toast({ title: "画布名称已存在", description: "换一个名称再新建。", variant: "destructive" })
			return
		}
		const id = `canvas-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`
		const nextCanvas: TopologyCanvas = { id, name, domain: id }
		const nextCanvases = [...canvases, nextCanvas]
		setCanvases(nextCanvases)
		applyCanvasState(nextCanvas, assets, allLayoutNodes, interfaces, relations)
		setDirty(true)
		setNewCanvasName("")
		setNewCanvasOpen(false)
		toast({ title: "画布已新建", description: "从左侧拖入设备开始编辑。" })
	}

	function currentSnapshot(): EditorSnapshot {
		return {
			nodes: structuredClone(nodes),
			edges: structuredClone(edges),
			hiddenNodes: structuredClone(hiddenNodes),
			deletedRelationIds: [...deletedRelationIds],
		}
	}

	function pushHistory() {
		historyRef.current.push(currentSnapshot())
		if (historyRef.current.length > 50) historyRef.current.shift()
		futureRef.current = []
		setHistoryVersion((version) => version + 1)
	}

	function applySnapshot(snapshot: EditorSnapshot) {
		setNodes(snapshot.nodes)
		setEdges(snapshot.edges)
		setHiddenNodes(snapshot.hiddenNodes)
		setDeletedRelationIds(snapshot.deletedRelationIds)
		clearSelection()
	}

	function undo() {
		const previous = historyRef.current.pop()
		if (!previous) return
		futureRef.current.push(currentSnapshot())
		applySnapshot(previous)
		setDirty(true)
		setHistoryVersion((version) => version + 1)
	}

	function redo() {
		const next = futureRef.current.pop()
		if (!next) return
		historyRef.current.push(currentSnapshot())
		applySnapshot(next)
		setDirty(true)
		setHistoryVersion((version) => version + 1)
	}

	function clearSelection() {
		setSelectedNodeId(null)
		setSelectedEdgeId(null)
	}

	function handleNodeClick(_: React.MouseEvent, node: TopologyEditorNode) {
		setSelectedNodeId(node.id)
		setSelectedEdgeId(null)
	}

	function handleEdgeClick(_: React.MouseEvent, edge: TopologyEditorEdge) {
		setSelectedEdgeId(edge.id)
		setSelectedNodeId(null)
	}

	function handleDrop(event: React.DragEvent) {
		event.preventDefault()
		const assetId = event.dataTransfer.getData(ASSET_DRAG_TYPE)
		const asset = assetsById.get(assetId)
		if (!asset || !instance) return
		if (isDefaultCanvas(activeCanvas) && inferEditorDomain(asset) !== activeCanvas.id) {
			toast({ title: "设备不属于当前网段", description: "请先在资产档案中调整所属网段。" })
			return
		}
		const position = instance.screenToFlowPosition({ x: event.clientX, y: event.clientY })
		const existing = nodes.find((node) => node.id === assetId)
		if (existing) {
			setSelectedNodeId(existing.id)
			setSelectedEdgeId(null)
			return
		}
		pushHistory()
		const hidden = hiddenNodes.find((node) => node.assetId === assetId)
		const settings = hidden ?? DEFAULT_NODE_SETTINGS
		const node = createEditorNode(asset, systemsByAssetId.get(assetId), position, settings)
		setNodes((current) => [...current, node])
		setCanvasExtent((current) => mergeCanvasExtent(current, buildCanvasExtent([...nodes, node])))
		if (hidden) {
			setHiddenNodes((current) => current.filter((item) => item.assetId !== assetId))
			const restoredEdges = relations
				.filter(
					(relation) =>
						relation.kind === "connected_to" &&
						resolveEditorRelationDomain(relation, assetsById) === activeCanvas.domain &&
						(relation.source_asset === assetId || relation.target_asset === assetId) &&
						(relation.source_asset === assetId || visibleAssetIds.has(relation.source_asset)) &&
						(relation.target_asset === assetId || visibleAssetIds.has(relation.target_asset))
				)
				.filter((relation) => !edges.some((edge) => edge.id === relation.id))
				.map((relation) =>
					buildEditorEdgeFromRelation(relation, assetsById, new Map(interfaces.map((item) => [item.id, item])))
				)
			if (restoredEdges.length > 0) setEdges((current) => [...current, ...restoredEdges])
		}
		setSelectedNodeId(assetId)
		setSelectedEdgeId(null)
		setDirty(true)
	}

	function handleConnect(connection: Connection) {
		if (!connection.source || !connection.target || connection.source === connection.target) return
		pushHistory()
		const edge = createEditorEdge(
			connection.source,
			connection.target,
			assets,
			interfaces,
			undefined,
			connection.sourceHandle,
			connection.targetHandle,
			activeCanvas.domain
		)
		setEdges((current) => [...current, edge])
		setSelectedEdgeId(edge.id)
		setSelectedNodeId(null)
		setDirty(true)
	}

	function handleReconnect(oldEdge: TopologyEditorEdge, connection: Connection) {
		if (!connection.source || !connection.target) return
		pushHistory()
		setEdges((current) =>
			current.map((edge) => (edge.id === oldEdge.id ? reconnectEditorEdge(edge, connection, assets, interfaces) : edge))
		)
		setSelectedEdgeId(oldEdge.id)
		setSelectedNodeId(null)
		setDirty(true)
	}

	function hideNode(nodeId: string) {
		const node = nodes.find((item) => item.id === nodeId)
		if (!node) return
		pushHistory()
		setHiddenNodes((current) => [...current.filter((item) => item.assetId !== nodeId), toLayoutNode(node, true)])
		setNodes((current) => current.filter((item) => item.id !== nodeId))
		setEdges((current) => current.filter((edge) => edge.source !== nodeId && edge.target !== nodeId))
		clearSelection()
		setDirty(true)
	}

	function deleteEdge(edgeId: string) {
		const edge = edges.find((item) => item.id === edgeId)
		if (!edge) return
		pushHistory()
		if (!edge.data.isNew) {
			setDeletedRelationIds((current) =>
				current.includes(edge.data.relationId) ? current : [...current, edge.data.relationId]
			)
		}
		setEdges((current) => current.filter((item) => item.id !== edgeId))
		setSelectedEdgeId(null)
		setDirty(true)
	}

	function deleteSelection() {
		const edgeIds = new Set<string>()
		const nodeIds = new Set<string>()
		if (selectedEdgeId) edgeIds.add(selectedEdgeId)
		if (selectedNodeId) nodeIds.add(selectedNodeId)
		for (const edge of edges) if (edge.selected) edgeIds.add(edge.id)
		for (const node of nodes) if (node.selected) nodeIds.add(node.id)
		if (edgeIds.size === 0 && nodeIds.size === 0) return
		pushHistory()
		if (edgeIds.size > 0) {
			const deleted = edges.filter((edge) => edgeIds.has(edge.id) && !edge.data.isNew)
			if (deleted.length > 0) {
				setDeletedRelationIds((current) => [
					...current,
					...deleted.map((edge) => edge.data.relationId).filter((id) => !current.includes(id)),
				])
			}
			setEdges((current) => current.filter((edge) => !edgeIds.has(edge.id)))
		}
		if (nodeIds.size > 0) {
			const nextHidden = nodes.filter((node) => nodeIds.has(node.id)).map((node) => toLayoutNode(node, true))
			setHiddenNodes((current) => [...current.filter((node) => !nodeIds.has(node.assetId)), ...nextHidden])
			setNodes((current) => current.filter((node) => !nodeIds.has(node.id)))
			setEdges((current) => current.filter((edge) => !nodeIds.has(edge.source) && !nodeIds.has(edge.target)))
		}
		clearSelection()
		setDirty(true)
	}

	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null
			if (target?.matches("input, textarea, select") || target?.isContentEditable) return
			const modifier = event.ctrlKey || event.metaKey
			if (modifier && event.key.toLowerCase() === "z") {
				event.preventDefault()
				if (event.shiftKey) redo()
				else undo()
				return
			}
			if (modifier && event.key.toLowerCase() === "a") {
				event.preventDefault()
				setNodes((current) => current.map((node) => ({ ...node, selected: true })))
				setEdges((current) => current.map((edge) => ({ ...edge, selected: true })))
				return
			}
			if (event.key === "Delete" || event.key === "Backspace") {
				event.preventDefault()
				deleteSelection()
				return
			}
			if (event.key === "Escape") {
				clearSelection()
				return
			}
			if (modifier && event.key === "0") {
				event.preventDefault()
				instance?.fitView({ padding: 0.18, duration: 250 })
				return
			}
			if (modifier && (event.key === "=" || event.key === "+")) {
				event.preventDefault()
				instance?.zoomIn({ duration: 120 })
				return
			}
			if (modifier && event.key === "-") {
				event.preventDefault()
				instance?.zoomOut({ duration: 120 })
			}
		}
		window.addEventListener("keydown", handler)
		return () => window.removeEventListener("keydown", handler)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [nodes, edges, hiddenNodes, selectedNodeId, selectedEdgeId, instance, dirty])

	function updateNodeSettings(patch: Partial<TopologyEditorNodeSettings>) {
		if (!selectedNode) return
		pushHistory()
		setNodes((current) =>
			current.map((node) =>
				node.id === selectedNode.id
					? {
							...node,
							style: {
								...node.style,
								width: TOPOLOGY_NODE_WIDTH * normalizeNodeSettings({ ...node.data.settings, ...patch }).scale,
								height: TOPOLOGY_NODE_HEIGHT * normalizeNodeSettings({ ...node.data.settings, ...patch }).scale,
							},
							data: {
								...node.data,
								settings: normalizeNodeSettings({ ...node.data.settings, ...patch }),
							},
						}
					: node
			)
		)
		setDirty(true)
	}

	function updateEdge(patch: Partial<TopologyEditorEdge["data"]>) {
		if (!selectedEdge) return
		pushHistory()
		setEdges((current) =>
			current.map((edge) => {
				if (edge.id !== selectedEdge.id) return edge
				const nextData = { ...edge.data, ...patch }
				if (nextData.medium === "wifi") {
					const band =
						getInterfaceBand(interfaces, nextData.sourceInterface) ||
						getInterfaceBand(interfaces, nextData.targetInterface)
					if (band) nextData.band = band
				}
				return decorateEditorEdge({
					...edge,
					data: nextData,
				})
			})
		)
		setDirty(true)
	}

	function changeEdgeMedium(medium: TopologyEditorMedium) {
		if (!selectedEdge) return
		const source = assetsById.get(selectedEdge.source)
		const target = assetsById.get(selectedEdge.target)
		const picked = pickEditorInterfaces(source, target, medium, interfaces)
		const band =
			medium === "wifi"
				? getInterfaceBand(interfaces, picked.sourceInterface) || getInterfaceBand(interfaces, picked.targetInterface)
				: ""
		updateEdge({
			medium,
			sourceInterface: picked.sourceInterface,
			targetInterface: picked.targetInterface,
			bandwidth: picked.bandwidth,
			band,
		})
	}

	function handleNodeDrag(_event: unknown, node: TopologyEditorNode) {
		if (!showGuides) {
			setGuides({ x: [], y: [] })
			return
		}
		const width = Number(node.style?.width) || 220
		const height = Number(node.style?.height) || 90
		const centerX = node.position.x + width / 2
		const centerY = node.position.y + height / 2
		const xs = new Set<number>()
		const ys = new Set<number>()
		for (const other of nodes) {
			if (other.id === node.id) continue
			const otherWidth = Number(other.style?.width) || 220
			const otherHeight = Number(other.style?.height) || 90
			const otherX = other.position.x + otherWidth / 2
			const otherY = other.position.y + otherHeight / 2
			if (Math.abs(otherX - centerX) < 6) xs.add(Math.round(otherX))
			if (Math.abs(otherY - centerY) < 6) ys.add(Math.round(otherY))
		}
		setGuides({ x: Array.from(xs), y: Array.from(ys) })
	}

	function interfaceOptions(assetId: string | undefined, medium: TopologyEditorMedium) {
		if (!assetId) return []
		const kinds =
			medium === "wifi"
				? ["wifi"]
				: medium === "fiber"
					? ["pon", "wan", "optical", "ethernet"]
					: ["ethernet", "lan", "wan"]
		return interfaces
			.filter((item) => item.asset === assetId && kinds.includes(item.kind))
			.map((item) => ({
				value: item.id,
				label: `${item.name || INTERFACE_KIND_LABELS[item.kind] || item.kind}${
					item.speed_mbps ? ` · ${formatInterfaceSpeed(item.speed_mbps)}` : ""
				}`,
			}))
	}

	function validateEdges() {
		for (const edge of edges) {
			const source = assetsById.get(edge.source)
			const target = assetsById.get(edge.target)
			if (!source || !target) return "连接端点资产不存在。"
			const payload = buildRelationSavePayload(
				edge,
				relations.find((item) => item.id === edge.data.relationId),
				assetsById
			)
			const targetAssetRecord = assetsById.get(payload.target_asset)
			const sourceAssetRecord = assetsById.get(payload.source_asset)
			if (sourceAssetRecord?.type === "internet") {
				const targetInterface = interfacesById.get(String(payload.metadata.target_interface ?? ""))
				if (!targetInterface || !["pon", "wan"].includes(targetInterface.kind)) {
					return `宽带「${sourceAssetRecord.name}」必须选择对端 PON/WAN 接口。`
				}
			}
			if (edge.data.medium === "wifi") {
				const targetInterface = interfacesById.get(String(payload.metadata.target_interface ?? ""))
				if (!targetAssetRecord || !isEditorNetworkDevice(targetAssetRecord)) {
					return "WiFi 连接的目标必须是光猫、路由器、网关或 AP。"
				}
				if (targetInterface?.kind !== "wifi") {
					return `WiFi 连接「${source.name} → ${target.name}」必须选择目标 Wi-Fi 接口。`
				}
			}
		}
		return ""
	}

	async function saveEditor() {
		if (readOnly || saving) return
		const validationError = validateEdges()
		if (validationError) {
			toast({ title: "拓扑保存失败", description: validationError, variant: "destructive" })
			return
		}
		const userId = pb.authStore.record?.id
		if (!userId) {
			toast({ title: "拓扑保存失败", description: "登录状态已失效，请重新登录。", variant: "destructive" })
			return
		}
		setSaving(true)
		try {
			const nextEdges = edges.map((edge) => ({
				...edge,
				data: { ...edge.data },
			}))
			for (const edge of nextEdges) {
				const relation = relations.find((item) => item.id === edge.data.relationId)
				const payload = buildRelationSavePayload(edge, relation, assetsById)
				if (edge.data.isNew) {
					const created = await pb.collection<AssetRelationRecord>("asset_relations").create({
						user: userId,
						...payload,
					})
					edge.data.relationId = created.id
					edge.data.isNew = false
				} else {
					await pb.collection("asset_relations").update(edge.data.relationId, payload)
				}
			}
			for (const relationId of deletedRelationIds) {
				try {
					await pb.collection("asset_relations").delete(relationId)
				} catch (error) {
					if ((error as { status?: number })?.status !== 404) throw error
				}
			}
			const activeLayout = buildLayoutPayload(nodes, hiddenNodes, activeCanvas.id)
			const otherLayoutNodes = allLayoutNodes.filter((node) => node.canvasId !== activeCanvas.id)
			const mergedLayoutNodes = [...otherLayoutNodes, ...activeLayout.nodes]
			const nextCanvases = canvases.map((canvas) => {
				const viewport = viewportByCanvasRef.current.get(canvas.id) ?? canvas.viewport
				// 画布固定 100%：只持久化平移位置，缩放永远存 1
				return viewport ? { ...canvas, viewport: { ...viewport, zoom: 1 } } : canvas
			})
			const layoutPayload = {
				user: userId,
				nodes: mergedLayoutNodes,
				canvases: nextCanvases,
			}
			if (layoutRecordId) {
				await pb.collection("network_topology_layouts").update(layoutRecordId, layoutPayload)
			} else {
				const created = await pb.collection<LayoutRecord>("network_topology_layouts").create(layoutPayload)
				setLayoutRecordId(created.id)
			}
			setAllLayoutNodes(mergedLayoutNodes)
			setCanvases(nextCanvases)
			setEdges(nextEdges)
			setDeletedRelationIds([])
			setDirty(false)
			const freshRelations = await pb
				.collection<AssetRelationRecord>("asset_relations")
				.getFullList({ sort: "kind,created", requestKey: null })
			setRelations(freshRelations)
			toast({ title: "拓扑已保存" })
		} catch (error) {
			console.error("save topology editor", error)
			toast({
				title: "拓扑保存失败",
				description: formatPocketBaseError(error, "请检查接口、网段和连接方向后重试。"),
				variant: "destructive",
			})
		} finally {
			setSaving(false)
		}
	}

	function handleBack(event: React.MouseEvent<HTMLAnchorElement>) {
		if (!dirty) return
		event.preventDefault()
		setLeaveOpen(true)
	}

	function selectLibraryAsset(asset: AssetRecord) {
		if (nodes.some((node) => node.id === asset.id)) {
			setSelectedNodeId(asset.id)
			setSelectedEdgeId(null)
		}
	}

	if (readOnly) {
		return (
			<div className="grid h-dvh place-items-center bg-[#0F1115] p-6 text-[#E5E7EB]">
				<div className="grid max-w-md gap-4 rounded-lg border border-[#272A31] bg-[#16181D] p-6 text-center">
					<div className="text-lg font-semibold">只读账号不能编辑拓扑</div>
					<div className="text-sm text-[#9CA3AF]">请让管理员账号进入编辑页。</div>
					<Link
						href={getPagePath($router, "home")}
						className="inline-flex h-9 items-center justify-center rounded-md border border-[#2E323B] px-3 text-sm hover:bg-[#1E2128]"
					>
						返回拓扑展示
					</Link>
				</div>
			</div>
		)
	}

	if (loading) {
		return (
			<div className="grid h-dvh place-items-center bg-[#0F1115] text-sm text-[#9CA3AF]">正在加载拓扑编辑数据…</div>
		)
	}

	if (loadError) {
		return (
			<div className="grid h-dvh place-items-center bg-[#0F1115] p-6 text-[#E5E7EB]">
				<div className="grid max-w-md gap-3 rounded-lg border border-[#3B1F24] bg-[#16181D] p-6 text-center">
					<div className="text-lg font-semibold">拓扑编辑加载失败</div>
					<div className="text-sm text-[#FCA5A5]">{loadError}</div>
					<button
						type="button"
						className="h-9 rounded-md bg-[#3B82F6] text-sm font-medium text-white"
						onClick={() => loadEditor().catch((error) => console.error("retry topology editor", error))}
					>
						重试
					</button>
				</div>
			</div>
		)
	}

	return (
		<div className="pulse-topology-editor flex h-dvh min-h-0 flex-col bg-[#0F1115] text-[#E5E7EB]">
			<header className="flex h-14 shrink-0 items-center gap-2 border-b border-[#272A31] bg-[#16181D] px-3">
				<Link
					href={getPagePath($router, "home")}
					onClick={handleBack}
					className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#2E323B] px-2.5 text-xs text-[#E5E7EB] hover:bg-[#1E2128]"
				>
					<ArrowLeftIcon className="size-3.5" />
					返回
				</Link>
				<div className="mx-1 h-6 w-px bg-[#272A31]" />
				<div className="min-w-0">
					<div className="truncate text-sm font-semibold">网络拓扑编辑</div>
				</div>
				<div className="ms-auto flex items-center gap-1.5">
					<EditorToolbarButton onClick={undo} disabled={!canUndo} title="撤销 Ctrl+Z">
						<Undo2Icon className="size-3.5" />
					</EditorToolbarButton>
					<EditorToolbarButton onClick={redo} disabled={!canRedo} title="重做 Ctrl+Shift+Z">
						<Redo2Icon className="size-3.5" />
					</EditorToolbarButton>
					<EditorToolbarButton onClick={() => setGridSnap((value) => !value)} active={gridSnap} title="切换网格吸附">
						<Grid3X3Icon className="size-3.5" />
						网格吸附
					</EditorToolbarButton>
					<EditorToolbarButton
						onClick={() => {
							setShowGuides((value) => !value)
							setGuides({ x: [], y: [] })
						}}
						active={showGuides}
						title="切换对齐辅助线"
					>
						<RulerIcon className="size-3.5" />
						对齐辅助线
					</EditorToolbarButton>
					<button
						type="button"
						disabled={!dirty || saving}
						onClick={() => saveEditor()}
						className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#10B981] px-3 text-xs font-semibold text-[#0F1115] disabled:cursor-not-allowed disabled:opacity-40"
					>
						<SaveIcon className="size-3.5" />
						{saving ? "保存中…" : "保存"}
					</button>
				</div>
			</header>

			<div className="flex min-h-0 flex-1">
				<aside className="flex w-[260px] shrink-0 flex-col border-r border-[#272A31] bg-[#16181D]">
					<div className="border-b border-[#272A31] p-3">
						<div className="relative">
							<SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#6B7280]" />
							<input
								value={search}
								onChange={(event) => setSearch(event.target.value)}
								placeholder="搜索设备..."
								className="h-9 w-full rounded-md border border-[#2E323B] bg-[#1E2128] pl-8 pr-2 text-xs text-[#E5E7EB] outline-none placeholder:text-[#6B7280] focus:border-[#3B82F6]"
							/>
						</div>
					</div>
					<div className="min-h-0 flex-1 overflow-y-auto p-2">
						{libraryGroups.map((group) => {
							const filtered = group.assets.filter((asset) =>
								asset.name.toLowerCase().includes(search.trim().toLowerCase())
							)
							if (filtered.length === 0) return null
							const collapsed = collapsedGroups.has(group.title)
							return (
								<div key={group.title} className="mb-1">
									<button
										type="button"
										onClick={() =>
											setCollapsedGroups((current) => {
												const next = new Set(current)
												if (next.has(group.title)) next.delete(group.title)
												else next.add(group.title)
												return next
											})
										}
										className="flex h-8 w-full items-center gap-1.5 rounded px-2 text-left text-[11px] font-semibold text-[#9CA3AF] hover:bg-[#1E2128]"
									>
										{collapsed ? <ChevronRightIcon className="size-3" /> : <ChevronDownIcon className="size-3" />}
										{group.title}
										<span className="ms-auto text-[10px] text-[#6B7280]">{filtered.length}</span>
									</button>
									{!collapsed ? (
										<div className="grid gap-0.5">
											{filtered.map((asset) => {
												const inTopology = visibleAssetIds.has(asset.id)
												const hidden = hiddenAssetIds.has(asset.id)
												const Icon = getAssetIcon(asset.type)
												return (
													<button
														key={asset.id}
														type="button"
														draggable={!inTopology}
														onDragStart={(event) => {
															if (inTopology) return
															event.dataTransfer.setData(ASSET_DRAG_TYPE, asset.id)
															event.dataTransfer.effectAllowed = "move"
														}}
														onClick={() => selectLibraryAsset(asset)}
														className={`flex h-10 items-center gap-2 rounded px-2 text-xs ${
															inTopology
																? "cursor-default opacity-45"
																: "cursor-grab hover:bg-[#1E2128] active:cursor-grabbing"
														}`}
														title={inTopology ? "已在拓扑中" : "拖到画布添加"}
													>
														<span className="grid size-6 shrink-0 place-items-center rounded border border-[#2E323B] bg-[#1E2128] text-[#9CA3AF]">
															<Icon className="size-3.5" />
														</span>
														<span className="min-w-0 flex-1 truncate text-[#E5E7EB]">{asset.name}</span>
														{inTopology ? (
															<CheckIcon className="size-3.5 shrink-0 text-[#6B7280]" />
														) : hidden ? (
															<EyeOffIcon className="size-3.5 shrink-0 text-[#6B7280]" />
														) : null}
													</button>
												)
											})}
										</div>
									) : null}
								</div>
							)
						})}
					</div>
				</aside>

				<main className="relative flex min-w-0 flex-1 flex-col">
					<div className="flex h-10 shrink-0 items-center gap-1 border-b border-[#272A31] bg-[#16181D] px-3">
						{canvases.map((canvas) => (
							<button
								key={canvas.id}
								type="button"
								onClick={() => switchCanvas(canvas.id)}
								className={`inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-xs ${
									canvas.id === activeCanvas.id
										? "bg-[#3B82F6] font-semibold text-white"
										: "text-[#9CA3AF] hover:bg-[#1E2128] hover:text-[#E5E7EB]"
								}`}
							>
								{canvas.name}
							</button>
						))}
						<button
							type="button"
							onClick={() => {
								if (dirty) {
									toast({ title: "请先保存当前画布", description: "保存后再新建画布。" })
									return
								}
								setNewCanvasOpen(true)
							}}
							className="inline-flex h-7 items-center gap-1 rounded border border-dashed border-[#3A3F4A] px-2 text-xs text-[#9CA3AF] hover:border-[#3B82F6] hover:text-[#E5E7EB]"
						>
							<PlusIcon className="size-3" />
							新建画布
						</button>
					</div>
					<div className="relative min-h-0 flex-1">
						<ReactFlow
							key={activeCanvas.id}
							nodes={nodes}
							edges={edges}
							onNodesChange={onNodesChange}
							onEdgesChange={onEdgesChange}
							onConnect={handleConnect}
							onReconnect={handleReconnect}
							edgesReconnectable
							reconnectRadius={24}
							nodeTypes={nodeTypes}
							connectionMode={ConnectionMode.Loose}
							minZoom={1}
							maxZoom={1}
							zoomOnScroll={false}
							zoomOnPinch={false}
							zoomOnDoubleClick={false}
							nodeExtent={canvasExtent ?? undefined}
							translateExtent={canvasExtent ?? undefined}
							snapToGrid={gridSnap}
							snapGrid={[20, 20]}
							nodesConnectable
							deleteKeyCode={null}
							selectionOnDrag
							panOnDrag={[1, 2]}
							panActivationKeyCode="Space"
							onInit={setInstance}
							onNodeClick={handleNodeClick}
							onEdgeClick={handleEdgeClick}
							onPaneClick={clearSelection}
							onNodeDoubleClick={(_, node) => {
								window.open(getPagePath($router, "asset", { id: node.data.asset.id }), "_blank", "noopener,noreferrer")
							}}
							onNodeDragStart={() => {
								pushHistory()
								setDirty(true)
							}}
							onNodeDrag={handleNodeDrag}
							onNodeDragStop={() => {
								setGuides({ x: [], y: [] })
								setDirty(true)
							}}
							onDrop={handleDrop}
							onDragOver={(event) => event.preventDefault()}
							onWheelCapture={() => setDirty(true)}
							onMove={(_, viewport) => {
								if (fittedRef.current) {
									viewportByCanvasRef.current.set(activeCanvasId, { ...viewport, zoom: 1 })
								}
							}}
							// 隐藏右下角 React Flow 角标（库提供的官方开关）
							proOptions={{ hideAttribution: true }}
							className="pulse-topology-editor-flow"
						>
							<Background variant={BackgroundVariant.Lines} gap={20} size={1} color="#2A2E37" />
							<Panel position="bottom-left">
								<TopologyEdgeLegend />
							</Panel>
							<ViewportPortal>
								{guides.x.map((x) => (
									<div
										key={`guide-x-${x}`}
										className="pointer-events-none absolute w-px border-l border-dashed border-[#EF4444]"
										style={{ left: x, top: -2000, height: 5000 }}
									/>
								))}
								{guides.y.map((y) => (
									<div
										key={`guide-y-${y}`}
										className="pointer-events-none absolute h-px border-t border-dashed border-[#EF4444]"
										style={{ top: y, left: -2000, width: 5000 }}
									/>
								))}
							</ViewportPortal>
						</ReactFlow>
						<div className="pointer-events-none absolute left-3 top-3 rounded border border-[#272A31] bg-[#16181D]/90 px-2 py-1 text-[10px] text-[#9CA3AF]">
							拖拽节点移动 · 点击连线编辑 · 拖线端点重连 · 双击节点打开详情
						</div>
						{nodes.length === 0 ? (
							<div className="pointer-events-none absolute inset-0 grid place-items-center">
								<div className="rounded-lg border border-dashed border-[#3A3F4A] bg-[#16181D]/80 px-4 py-3 text-center text-xs text-[#9CA3AF]">
									<div className="font-medium text-[#E5E7EB]">{activeCanvas.name}</div>
									<div className="mt-1">从左侧拖入设备开始编辑</div>
								</div>
							</div>
						) : null}
					</div>
				</main>

				{selectedNode || selectedEdge ? (
					<aside className="flex w-[300px] shrink-0 flex-col border-l border-[#272A31] bg-[#16181D]">
						<div className="flex h-10 shrink-0 items-center justify-between border-b border-[#272A31] px-3">
							<div className="text-xs font-semibold">{selectedNode ? "节点属性" : "链路属性"}</div>
							<button
								type="button"
								onClick={clearSelection}
								className="text-[11px] text-[#6B7280] hover:text-[#E5E7EB]"
							>
								关闭
							</button>
						</div>
						<div className="min-h-0 flex-1 overflow-y-auto p-3">
							{selectedNode ? (
								<NodePropertyPanel
									node={selectedNode}
									onUpdate={updateNodeSettings}
									onHide={() => hideNode(selectedNode.id)}
								/>
							) : null}
							{selectedEdge ? (
								<EdgePropertyPanel
									edge={selectedEdge}
									sourceAsset={sourceAsset}
									targetAsset={targetAsset}
									canvasName={activeCanvas.name}
									interfaceOptions={interfaceOptions}
									onUpdate={updateEdge}
									onMediumChange={changeEdgeMedium}
									onDelete={() => deleteEdge(selectedEdge.id)}
								/>
							) : null}
						</div>
					</aside>
				) : null}
			</div>

			<footer className="flex h-10 shrink-0 items-center gap-3 border-t border-[#272A31] bg-[#16181D] px-3 text-[11px] text-[#9CA3AF]">
				<span>节点：{nodes.length} 个</span>
				<span>链路：{edges.length} 条</span>
				{/* 画布固定 100%，不再提供缩放 / 自适应按钮 */}
			</footer>

			<Dialog open={newCanvasOpen} onOpenChange={setNewCanvasOpen}>
				<DialogContent className="border-[#2E323B] bg-[#16181D] text-[#E5E7EB]">
					<DialogHeader>
						<DialogTitle>新建拓扑画布</DialogTitle>
					</DialogHeader>
					<div className="grid gap-2">
						<div className="text-xs text-[#9CA3AF]">一个画布对应一个网段，可以直接拖入设备编辑。</div>
						<input
							autoFocus
							value={newCanvasName}
							onChange={(event) => setNewCanvasName(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") createCanvas()
							}}
							placeholder="例如 IoT 网 / 访客网络"
							className="h-9 rounded-md border border-[#2E323B] bg-[#1E2128] px-2 text-sm text-[#E5E7EB] outline-none placeholder:text-[#6B7280] focus:border-[#3B82F6]"
						/>
					</div>
					<DialogFooter>
						<button
							type="button"
							className="h-8 rounded-md border border-[#2E323B] px-3 text-xs"
							onClick={() => setNewCanvasOpen(false)}
						>
							取消
						</button>
						<button
							type="button"
							disabled={!newCanvasName.trim()}
							className="h-8 rounded-md bg-[#3B82F6] px-3 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
							onClick={createCanvas}
						>
							新建
						</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
				<DialogContent className="border-[#2E323B] bg-[#16181D] text-[#E5E7EB]">
					<DialogHeader>
						<DialogTitle>有未保存的修改</DialogTitle>
					</DialogHeader>
					<div className="text-sm text-[#9CA3AF]">离开后本次节点位置和连线修改会丢失。</div>
					<DialogFooter>
						<button
							type="button"
							className="h-8 rounded-md border border-[#2E323B] px-3 text-xs"
							onClick={() => setLeaveOpen(false)}
						>
							继续编辑
						</button>
						<button
							type="button"
							className="h-8 rounded-md bg-[#EF4444] px-3 text-xs font-medium text-white"
							onClick={() => navigate(getPagePath($router, "home"))}
						>
							放弃并返回
						</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}

function EditorToolbarButton({
	children,
	onClick,
	disabled,
	active,
	title,
}: {
	children: React.ReactNode
	onClick: () => void
	disabled?: boolean
	active?: boolean
	title: string
}) {
	return (
		<button
			type="button"
			title={title}
			disabled={disabled}
			onClick={onClick}
			className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-40 ${
				active
					? "border-[#3B82F6] bg-[#3B82F6]/15 text-[#93C5FD]"
					: "border-[#2E323B] text-[#E5E7EB] hover:bg-[#1E2128]"
			}`}
		>
			{children}
		</button>
	)
}

function NodePropertyPanel({
	node,
	onUpdate,
	onHide,
}: {
	node: TopologyEditorNode
	onUpdate: (patch: Partial<TopologyEditorNodeSettings>) => void
	onHide: () => void
}) {
	const settings = node.data.settings
	const Icon = getAssetIcon(node.data.asset.type)
	return (
		<div className="grid gap-4 text-xs">
			<div className="grid gap-1.5 rounded-md border border-[#2E323B] bg-[#1E2128] p-2.5">
				<div className="flex items-center gap-2">
					<Icon className="size-4 text-[#9CA3AF]" />
					<span className="min-w-0 truncate text-sm font-semibold">{node.data.asset.name}</span>
				</div>
				<div className="text-[11px] text-[#9CA3AF]">{getAssetTypeLabel(node.data.asset.type)}</div>
			</div>
			<div className="grid gap-2">
				<div className="text-[11px] font-semibold text-[#9CA3AF]">显示设置</div>
				{[
					["showName", "显示设备名称"],
					["showIp", "显示 IP 地址"],
					["showModel", "显示型号"],
					["showLocation", "显示位置"],
				].map(([key, label]) => (
					<label key={key} className="flex items-center gap-2 text-[#E5E7EB]">
						<input
							type="checkbox"
							checked={Boolean(settings[key as keyof TopologyEditorNodeSettings])}
							onChange={(event) => onUpdate({ [key]: event.target.checked })}
							className="size-3.5 accent-[#3B82F6]"
						/>
						{label}
					</label>
				))}
			</div>
			<div className="grid gap-1.5">
				<div className="text-[11px] font-semibold text-[#9CA3AF]">节点大小</div>
				<input
					type="range"
					min={1}
					max={1.5}
					step={0.05}
					value={settings.scale}
					onChange={(event) => onUpdate({ scale: Number(event.target.value) })}
					className="w-full accent-[#3B82F6]"
				/>
				<div className="text-right text-[10px] text-[#6B7280]">{settings.scale.toFixed(2)}x</div>
			</div>
			<div className="grid gap-1.5">
				<div className="text-[11px] font-semibold text-[#9CA3AF]">节点图标</div>
				<select
					value={settings.icon}
					onChange={(event) => onUpdate({ icon: event.target.value })}
					className="h-8 rounded-md border border-[#2E323B] bg-[#1E2128] px-2 text-xs text-[#E5E7EB]"
				>
					{EDITOR_ICON_OPTIONS.map((option) => (
						<option key={option.value} value={option.value}>
							{option.label}
						</option>
					))}
				</select>
			</div>
			<div className="grid gap-1.5">
				<div className="text-[11px] font-semibold text-[#9CA3AF]">备注</div>
				<textarea
					value={settings.notes}
					onChange={(event) => onUpdate({ notes: event.target.value })}
					rows={3}
					className="rounded-md border border-[#2E323B] bg-[#1E2128] p-2 text-xs text-[#E5E7EB] outline-none focus:border-[#3B82F6]"
				/>
			</div>
			<div className="grid gap-2 border-t border-[#272A31] pt-3">
				<a
					href={getPagePath($router, "asset", { id: node.data.asset.id })}
					target="_blank"
					rel="noreferrer"
					className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-[#2E323B] text-xs hover:bg-[#1E2128]"
				>
					<ExternalLinkIcon className="size-3.5" />
					跳转资产详情
				</a>
				<button
					type="button"
					onClick={onHide}
					className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-[#7F1D1D] text-xs text-[#FCA5A5] hover:bg-[#7F1D1D]/20"
				>
					<Trash2Icon className="size-3.5" />
					从拓扑移除
				</button>
			</div>
		</div>
	)
}

function EdgePropertyPanel({
	edge,
	sourceAsset,
	targetAsset,
	canvasName,
	interfaceOptions,
	onUpdate,
	onMediumChange,
	onDelete,
}: {
	edge: TopologyEditorEdge
	sourceAsset?: AssetRecord
	targetAsset?: AssetRecord
	canvasName: string
	interfaceOptions: (assetId: string | undefined, medium: TopologyEditorMedium) => { value: string; label: string }[]
	onUpdate: (patch: Partial<TopologyEditorEdge["data"]>) => void
	onMediumChange: (medium: TopologyEditorMedium) => void
	onDelete: () => void
}) {
	const bandwidthOptions = (BANDWIDTH_OPTIONS as readonly string[]).includes(edge.data.bandwidth)
		? BANDWIDTH_OPTIONS
		: [...BANDWIDTH_OPTIONS, edge.data.bandwidth]
	return (
		<div className="grid gap-4 text-xs">
			<div className="grid gap-1.5 rounded-md border border-[#2E323B] bg-[#1E2128] p-2.5">
				<div className="text-[11px] text-[#9CA3AF]">本端</div>
				<div className="truncate font-semibold">{sourceAsset?.name ?? "未知资产"}</div>
				<div className="text-[11px] text-[#9CA3AF]">对端</div>
				<div className="truncate font-semibold">{targetAsset?.name ?? "未知资产"}</div>
			</div>
			<div className="grid gap-1.5">
				<div className="text-[11px] font-semibold text-[#9CA3AF]">本端接口</div>
				<select
					value={edge.data.sourceInterface}
					onChange={(event) => onUpdate({ sourceInterface: event.target.value })}
					disabled={sourceAsset?.type === "internet"}
					className="h-8 rounded-md border border-[#2E323B] bg-[#1E2128] px-2 text-xs text-[#E5E7EB] disabled:opacity-50"
				>
					<option value="">不指定</option>
					{interfaceOptions(sourceAsset?.id, edge.data.medium).map((option) => (
						<option key={option.value} value={option.value}>
							{option.label}
						</option>
					))}
				</select>
			</div>
			<div className="grid gap-1.5">
				<div className="text-[11px] font-semibold text-[#9CA3AF]">对端接口</div>
				<select
					value={edge.data.targetInterface}
					onChange={(event) => onUpdate({ targetInterface: event.target.value })}
					disabled={targetAsset?.type === "internet"}
					className="h-8 rounded-md border border-[#2E323B] bg-[#1E2128] px-2 text-xs text-[#E5E7EB] disabled:opacity-50"
				>
					<option value="">不指定</option>
					{interfaceOptions(targetAsset?.id, edge.data.medium).map((option) => (
						<option key={option.value} value={option.value}>
							{option.label}
						</option>
					))}
				</select>
			</div>
			<div className="grid grid-cols-2 gap-2">
				<div className="grid gap-1.5">
					<div className="text-[11px] font-semibold text-[#9CA3AF]">介质</div>
					<select
						value={edge.data.medium}
						onChange={(event) => onMediumChange(event.target.value as TopologyEditorMedium)}
						className="h-8 rounded-md border border-[#2E323B] bg-[#1E2128] px-2 text-xs text-[#E5E7EB]"
					>
						{MEDIUM_OPTIONS.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				</div>
				<div className="grid gap-1.5">
					<div className="text-[11px] font-semibold text-[#9CA3AF]">速率</div>
					<select
						value={edge.data.bandwidth}
						onChange={(event) => onUpdate({ bandwidth: event.target.value })}
						className="h-8 rounded-md border border-[#2E323B] bg-[#1E2128] px-2 text-xs text-[#E5E7EB]"
					>
						<option value="">未指定</option>
						{bandwidthOptions.map((option) => (
							<option key={option} value={option}>
								{option}
							</option>
						))}
					</select>
				</div>
			</div>
			<div className="grid grid-cols-2 gap-2">
				<div className="grid gap-1.5">
					<div className="text-[11px] font-semibold text-[#9CA3AF]">状态</div>
					<select
						value={edge.data.status}
						onChange={(event) => onUpdate({ status: event.target.value as never })}
						className="h-8 rounded-md border border-[#2E323B] bg-[#1E2128] px-2 text-xs text-[#E5E7EB]"
					>
						{LINK_STATUS_OPTIONS.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				</div>
				<div className="grid gap-1.5">
					<div className="text-[11px] font-semibold text-[#9CA3AF]">所属画布</div>
					<div className="flex h-8 items-center rounded-md border border-[#2E323B] bg-[#1E2128] px-2 text-xs text-[#9CA3AF]">
						{canvasName}
					</div>
				</div>
			</div>
			<div className="grid gap-1.5">
				<div className="text-[11px] font-semibold text-[#9CA3AF]">备注</div>
				<input
					value={edge.data.notes}
					onChange={(event) => onUpdate({ notes: event.target.value })}
					className="h-8 rounded-md border border-[#2E323B] bg-[#1E2128] px-2 text-xs text-[#E5E7EB] outline-none focus:border-[#3B82F6]"
				/>
			</div>
			<button
				type="button"
				onClick={onDelete}
				className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-[#7F1D1D] text-xs text-[#FCA5A5] hover:bg-[#7F1D1D]/20"
			>
				<Trash2Icon className="size-3.5" />
				删除链路
			</button>
		</div>
	)
}
