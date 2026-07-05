import "@xyflow/react/dist/style.css"

import {
	Background,
	BaseEdge,
	Controls,
	type Edge,
	type EdgeProps,
	Handle,
	Position,
	ReactFlow,
	ReactFlowProvider,
	getSmoothStepPath,
	type Node,
	type OnNodeDrag,
	type NodeProps,
	type OnNodesChange,
	type OnSelectionChangeParams,
	useEdgesState,
	useNodesState,
	useNodesInitialized,
	useReactFlow,
} from "@xyflow/react"
import {
	ActivityIcon,
	ArrowRightIcon,
	BoxesIcon,
	CableIcon,
	CpuIcon,
	EthernetPortIcon,
	GitBranchIcon,
	GlobeIcon,
	HardDriveIcon,
	HouseWifiIcon,
	LaptopMinimalIcon,
	MonitorIcon,
	NetworkIcon,
	RefreshCwIcon,
	RouterIcon,
	SaveIcon,
	ServerIcon,
	type LucideIcon,
} from "lucide-react"
import {
	memo,
	useCallback,
	useEffect,
	useMemo,
	useState,
	type ComponentProps,
	type FormEvent,
	type ReactNode,
} from "react"
import { getPagePath } from "@nanostores/router"
import { $router, Link, prependBasePath } from "@/components/router"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { toast } from "@/components/ui/use-toast"
import { isPocketBaseAutoCancel, isReadOnlyUser, pb } from "@/lib/api"
import { Os } from "@/lib/enums"
import {
	buildTopologyGraph,
	buildTopologyPorts,
	createLayoutPayload,
	assetNodeId,
	getAssetTypeLabel,
	getLinkKindLabel,
	getPortOwnerNodeId,
	getPortTypeLabel,
	snapTopologyPosition,
	TOPOLOGY_GRID_SIZE,
	TOPOLOGY_NODE_HEIGHT,
	type TopologyConnectionBadge,
	type TopologyConnectionKind,
	type TopologyEdgeData,
	type TopologyNodeData,
} from "@/lib/network-topology"
import { getSystemIPAddressLabel } from "@/lib/system-network"
import { getSystemDisplayName } from "@/lib/system-roles"
import { cn } from "@/lib/utils"
import type {
	AssetInterfaceRecord,
	AssetRecord,
	AssetRelationRecord,
	AssetType,
	NetworkLayoutRecord,
	NetworkLinkRecord,
	NetworkPortRecord,
	SystemDetailsRecord,
	SystemRecord,
} from "@/types"

const HOME_LAYOUT_KEY = "home"
const NETWORK_WORKSPACE_LAYOUT_KEY = "network-workspace"
const TOPOLOGY_NODE_DETAILS_EVENT = "pulse:topology-node-details"
const TOPOLOGY_NODE_TYPES = { pulseTopology: TopologyNode }
const TOPOLOGY_EDGE_TYPES = { pulseTopologyLink: TopologyLinkEdge }

type NetworkTopologyMode = "overview" | "workspace"

type TopologyFocusTarget = {
	nodeId?: string
	edgeId?: string
}

type NetworkTopologyData = {
	assets: AssetRecord[]
	interfaces: AssetInterfaceRecord[]
	relations: AssetRelationRecord[]
	layout?: NetworkLayoutRecord
	details: SystemDetailsRecord[]
}

function getTopologyFocusTarget(isOverview: boolean): TopologyFocusTarget | undefined {
	if (isOverview || typeof window === "undefined") return undefined
	const search = new URLSearchParams(window.location.search)
	const assetId = search.get("asset")?.trim()
	const relationId = search.get("relation")?.trim()
	if (relationId) return { edgeId: getRelationEdgeId(relationId) }
	if (assetId) return { nodeId: assetNodeId(assetId) }
	return undefined
}

function getRelationEdgeId(relationId: string) {
	return `asset-relation-${relationId}`
}

function getTopologyFocusNodeIds(
	nodes: Node<TopologyNodeData>[],
	edges: Edge<TopologyEdgeData>[],
	focusTarget?: TopologyFocusTarget
) {
	if (!focusTarget) return []
	if (focusTarget.nodeId && nodes.some((node) => node.id === focusTarget.nodeId)) return [focusTarget.nodeId]
	if (!focusTarget.edgeId) return []
	const edge = edges.find((item) => item.id === focusTarget.edgeId)
	return edge ? [edge.source, edge.target].filter(Boolean) : []
}

function applyTopologyFocus(
	graph: ReturnType<typeof buildTopologyGraph>,
	focusTarget?: TopologyFocusTarget
): ReturnType<typeof buildTopologyGraph> {
	if (!focusTarget) return graph
	const focusNodeIds = new Set(getTopologyFocusNodeIds(graph.nodes, graph.edges, focusTarget))
	return {
		...graph,
		nodes: graph.nodes.map((node) => ({
			...node,
			selected: focusTarget.nodeId ? node.id === focusTarget.nodeId : focusNodeIds.has(node.id),
		})),
		edges: graph.edges.map((edge) => ({
			...edge,
			selected: edge.id === focusTarget.edgeId,
		})),
	}
}

export function HomeNetworkTopology(props: { systems: SystemRecord[] }) {
	return (
		<ReactFlowProvider>
			<NetworkTopologyPanel {...props} mode="overview" />
		</ReactFlowProvider>
	)
}

export function NetworkTopologyWorkspace(props: { systems: SystemRecord[] }) {
	return (
		<ReactFlowProvider>
			<NetworkTopologyPanel {...props} mode="workspace" />
		</ReactFlowProvider>
	)
}

function NetworkTopologyPanel({ systems, mode }: { systems: SystemRecord[]; mode: NetworkTopologyMode }) {
	const isOverview = mode === "overview"
	const layoutKey = isOverview ? HOME_LAYOUT_KEY : NETWORK_WORKSPACE_LAYOUT_KEY
	const [topology, setTopology] = useState<NetworkTopologyData>({
		assets: [],
		interfaces: [],
		relations: [],
		details: [],
	})
	const [loading, setLoading] = useState(true)
	const [selectedId, setSelectedId] = useState<string>()
	const [deviceDialogOpen, setDeviceDialogOpen] = useState(false)
	const [portDialogOpen, setPortDialogOpen] = useState(false)
	const [linkDialogOpen, setLinkDialogOpen] = useState(false)
	const [detailsDialogOpen, setDetailsDialogOpen] = useState(false)
	const [detailsNodeId, setDetailsNodeId] = useState<string>()
	const readOnly = isReadOnlyUser()
	const userId = pb.authStore.record?.id ?? ""

	const graph = useMemo(
		() =>
			buildTopologyGraph({
				assets: topology.assets,
				interfaces: topology.interfaces,
				relations: topology.relations,
				systems,
				details: topology.details,
				layout: topology.layout?.layout,
			}),
		[topology, systems]
	)
	const topologyPorts = useMemo(() => buildTopologyPorts(topology.interfaces), [topology.interfaces])
	const focusTarget = useMemo(() => getTopologyFocusTarget(isOverview), [isOverview])
	const focusedGraph = useMemo(() => applyTopologyFocus(graph, focusTarget), [graph, focusTarget])
	const focusNodeIds = useMemo(
		() => getTopologyFocusNodeIds(graph.nodes, graph.edges, focusTarget),
		[graph, focusTarget]
	)
	const [nodes, setNodes, onNodesChangeBase] = useNodesState<TopologyNodeData>(focusedGraph.nodes)
	const [edges, setEdges, onEdgesChange] = useEdgesState<TopologyEdgeData>(focusedGraph.edges)
	const nodesInitialized = useNodesInitialized()
	const { fitView, getViewport } = useReactFlow()
	const overviewCanvasHeight = useMemo(() => {
		if (!isOverview) return undefined
		if (nodes.length === 0) return 300
		const minY = Math.min(...nodes.map((node) => node.position.y))
		const maxY = Math.max(...nodes.map((node) => node.position.y + TOPOLOGY_NODE_HEIGHT))
		return Math.min(420, Math.max(300, Math.ceil(maxY - minY + 96)))
	}, [isOverview, nodes])

	useEffect(() => {
		setNodes(focusedGraph.nodes)
		setEdges(focusedGraph.edges)
		if (focusNodeIds[0]) setSelectedId(focusNodeIds[0])
	}, [focusedGraph.nodes, focusedGraph.edges, focusNodeIds, setNodes, setEdges])

	useEffect(() => {
		if (!nodesInitialized || graph.nodes.length === 0) return
		const fitOptions =
			!isOverview && focusNodeIds.length > 0
				? { nodes: focusNodeIds.map((id) => ({ id })), padding: 0.26, duration: 420, maxZoom: 0.95 }
				: { padding: isOverview ? 0.06 : 0.18 }
		const animationFrame = requestAnimationFrame(() => fitView(fitOptions))
		const delayedFit = window.setTimeout(() => fitView(fitOptions), 80)
		return () => {
			cancelAnimationFrame(animationFrame)
			window.clearTimeout(delayedFit)
		}
	}, [fitView, focusNodeIds, graph.nodes.length, isOverview, nodesInitialized, overviewCanvasHeight])

	const loadTopology = useCallback(async () => {
		try {
			setLoading(true)
			const [assets, interfaces, relations, layouts, details] = await Promise.all([
				pb.collection<AssetRecord>("assets").getFullList({ sort: "created", requestKey: null }),
				pb.collection<AssetInterfaceRecord>("asset_interfaces").getFullList({ sort: "created", requestKey: null }),
				pb.collection<AssetRelationRecord>("asset_relations").getFullList({ sort: "created", requestKey: null }),
				pb.collection<NetworkLayoutRecord>("network_layouts").getFullList({
					filter: pb.filter("key = {:key}", { key: layoutKey }),
					requestKey: null,
				}),
				pb.collection<SystemDetailsRecord>("system_details").getFullList({
					fields: "id,network_interfaces",
					requestKey: null,
				}),
			])
			setTopology({ assets, interfaces, relations, layout: layouts[0], details })
		} catch (error) {
			if (!isPocketBaseAutoCancel(error)) {
				console.error("load network topology", error)
				toast({ title: "网络拓扑加载失败", description: "请稍后刷新重试。", variant: "destructive" })
			}
		} finally {
			setLoading(false)
		}
	}, [layoutKey])

	useEffect(() => {
		loadTopology()
	}, [loadTopology])

	const onNodesChange: OnNodesChange<TopologyNodeData> = useCallback(
		(changes) => onNodesChangeBase(changes),
		[onNodesChangeBase]
	)

	const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedId), [nodes, selectedId])
	const selectedPortOwnerPorts = useMemo(
		() => topologyPorts.filter((port) => (selectedId ? getPortOwnerNodeId(port) === selectedId : false)),
		[topologyPorts, selectedId]
	)
	const detailsNode = useMemo(() => nodes.find((node) => node.id === detailsNodeId), [detailsNodeId, nodes])
	const detailsPortOwnerPorts = useMemo(
		() => topologyPorts.filter((port) => (detailsNodeId ? getPortOwnerNodeId(port) === detailsNodeId : false)),
		[topologyPorts, detailsNodeId]
	)
	const hasTopology = graph.nodes.length > 0

	useEffect(() => {
		function handleNodeDetails(event: Event) {
			if (isOverview) return
			const nodeId = (event as CustomEvent<{ nodeId?: string }>).detail?.nodeId
			if (!nodeId) return
			setSelectedId(nodeId)
			setDetailsNodeId(nodeId)
			setDetailsDialogOpen(true)
		}
		window.addEventListener(TOPOLOGY_NODE_DETAILS_EVENT, handleNodeDetails)
		return () => window.removeEventListener(TOPOLOGY_NODE_DETAILS_EVENT, handleNodeDetails)
	}, [isOverview])

	const handleSelectionChange = useCallback((params: OnSelectionChangeParams<TopologyNodeData, TopologyEdgeData>) => {
		const selectedNodeId = params.nodes[0]?.id
		if (selectedNodeId) {
			setSelectedId(selectedNodeId)
			return
		}
		const selectedEdge = params.edges[0]
		setSelectedId(selectedEdge?.source)
	}, [])

	const handleNodeDragStop: OnNodeDrag<Node<TopologyNodeData>> = useCallback(
		(_event, node, draggedNodes) => {
			if (isOverview) return
			const affectedNodes = draggedNodes.length > 0 ? draggedNodes : [node]
			const snappedPositions = new Map(
				affectedNodes.map((item) => [item.id, snapTopologyPosition(item.position)] as const)
			)
			setNodes((currentNodes) =>
				currentNodes.map((item) => {
					const position = snappedPositions.get(item.id)
					return position ? { ...item, position } : item
				})
			)
		},
		[isOverview, setNodes]
	)

	const handleSaveLayout = useCallback(async () => {
		if (!userId || readOnly || isOverview) return
		const payload = {
			user: userId,
			key: layoutKey,
			layout: createLayoutPayload(nodes, selectedId, getViewport()),
		}
		try {
			if (topology.layout?.id) {
				await pb.collection("network_layouts").update(topology.layout.id, payload)
			} else {
				await pb.collection("network_layouts").create(payload)
			}
			await loadTopology()
			toast({ title: "拓扑布局已保存", description: "刷新首页后会保留当前节点位置。" })
		} catch (error) {
			console.error(error)
			toast({ title: "保存布局失败", description: "请确认当前账号有写入权限。", variant: "destructive" })
		}
	}, [getViewport, isOverview, layoutKey, loadTopology, nodes, readOnly, selectedId, topology.layout?.id, userId])

	const handleSaveConnectionModes = useCallback(
		async (nodeId: string, modes: TopologyConnectionKind[]) => {
			if (!userId || readOnly || isOverview) return
			const currentConnectionModes = { ...(topology.layout?.layout?.connection_modes ?? {}) }
			currentConnectionModes[nodeId] = modes
			const layoutPayload = {
				...createLayoutPayload(nodes, selectedId, getViewport()),
				connection_modes: currentConnectionModes,
			}
			const payload = {
				user: userId,
				key: layoutKey,
				layout: layoutPayload,
			}
			try {
				if (topology.layout?.id) {
					await pb.collection("network_layouts").update(topology.layout.id, payload)
				} else {
					await pb.collection("network_layouts").create(payload)
				}
				await loadTopology()
				toast({ title: "节点显示已保存", description: "卡片上的有线 / 无线图标会按当前配置展示。" })
			} catch (error) {
				console.error(error)
				toast({ title: "保存失败", description: "请确认当前账号有写入权限。", variant: "destructive" })
			}
		},
		[getViewport, isOverview, layoutKey, loadTopology, nodes, readOnly, selectedId, topology.layout, userId]
	)

	return (
		<Card className="overflow-hidden border-border/70 bg-card shadow-none">
			<CardHeader className="border-b border-border/70 bg-surface-soft px-5 py-4">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="grid gap-1">
						<div className="flex items-center gap-2">
							<span className="grid size-9 place-items-center rounded-md border border-border/70 bg-card text-muted-foreground">
								<NetworkIcon className="size-4" />
							</span>
							<CardTitle className="text-xl tracking-[-0.02em]">{isOverview ? "家庭网络拓扑" : "网络拓扑"}</CardTitle>
						</div>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						{isOverview ? (
							<Button asChild variant="outline" size="sm" className="gap-1.5">
								<Link href={getPagePath($router, "network")}>
									<ArrowRightIcon className="size-4" />
									完整拓扑
								</Link>
							</Button>
						) : (
							<>
								<Button variant="outline" size="sm" className="gap-1.5" onClick={loadTopology}>
									<RefreshCwIcon className="size-4" />
									刷新
								</Button>
								{!readOnly && (
									<Button variant="outline" size="sm" className="gap-1.5" onClick={handleSaveLayout}>
										<SaveIcon className="size-4" />
										保存布局
									</Button>
								)}
							</>
						)}
					</div>
				</div>
			</CardHeader>
			<CardContent className="p-0">
				<div className={cn("grid", isOverview ? "min-h-[340px]" : "min-h-[620px] lg:grid-cols-[minmax(0,1fr)_20rem]")}>
					<div className="min-w-0 border-b border-border/70 bg-surface-soft p-2 lg:border-e lg:border-b-0">
						<div className="mb-2 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
							<TopologyStat label="外网" value={graph.stats.internetAccesses} />
							<TopologyStat label="设备" value={graph.stats.devices} />
							<TopologyStat label="机器" value={`${graph.stats.onlineSystems}/${graph.stats.systems}`} />
							<TopologyStat label="端口" value={graph.stats.ports} />
							<TopologyStat label="链路" value={graph.stats.links} />
							<TopologyStat label="无线" value={graph.stats.wirelessLinks} />
						</div>
						<div
							className={cn(
								"relative overflow-hidden rounded-lg border border-border/70 bg-card",
								isOverview ? "min-h-[300px]" : "h-[520px] xl:h-[600px]"
							)}
							style={isOverview ? { height: overviewCanvasHeight } : undefined}
						>
							{loading ? (
								<EmptyState loading loadingText="正在读取网络拓扑" emptyText="暂无网络拓扑" className="h-full" />
							) : !hasTopology ? (
								<div className="grid h-full place-items-center p-6">
									<div className="max-w-md text-center">
										<div className="mx-auto grid size-12 place-items-center rounded-md border border-border/70 bg-surface-soft text-muted-foreground">
											<GitBranchIcon className="size-5" />
										</div>
										<h3 className="mt-4 text-lg font-semibold tracking-[-0.02em]">暂无拓扑节点</h3>
										<p className="mt-2 text-sm text-muted-foreground">
											先在资产中心添加宽带、路由器、交换机或主机资产，再到拓扑页建立连接。
										</p>
										{isOverview ? (
											<Button asChild variant="outline" className="mt-5 gap-1.5">
												<Link href={getPagePath($router, "network")}>
													<ArrowRightIcon className="size-4" />
													打开拓扑页
												</Link>
											</Button>
										) : (
											<Button asChild variant="outline" className="mt-5 gap-1.5">
												<Link href={getPagePath($router, "assets")}>
													<BoxesIcon className="size-4" />
													打开资产中心
												</Link>
											</Button>
										)}
									</div>
								</div>
							) : (
								<ReactFlow<TopologyNodeData, TopologyEdgeData>
									nodes={nodes}
									edges={edges}
									nodeTypes={TOPOLOGY_NODE_TYPES}
									edgeTypes={TOPOLOGY_EDGE_TYPES}
									onNodesChange={onNodesChange}
									onEdgesChange={onEdgesChange}
									onNodeDragStop={handleNodeDragStop}
									onSelectionChange={handleSelectionChange}
									fitView
									fitViewOptions={{ padding: isOverview ? 0.06 : 0.18 }}
									minZoom={isOverview ? 0.2 : 0.35}
									maxZoom={1.05}
									nodesDraggable={!isOverview}
									nodesConnectable={false}
									elementsSelectable={!isOverview}
									panOnDrag={!isOverview}
									zoomOnScroll={!isOverview}
									zoomOnPinch={!isOverview}
									zoomOnDoubleClick={!isOverview}
									snapToGrid={false}
									proOptions={{ hideAttribution: true }}
									className={cn("pulse-topology-flow", isOverview && "pulse-topology-flow-readonly")}
								>
									<Background color="hsl(var(--border))" gap={TOPOLOGY_GRID_SIZE} size={1} />
									{!isOverview && <Controls showInteractive={false} />}
								</ReactFlow>
							)}
						</div>
					</div>
					{!isOverview && (
						<aside className="grid content-start gap-3 bg-card p-4">
							{!readOnly && (
								<div className="grid grid-cols-3 gap-2">
									<Button variant="outline" size="sm" className="gap-1" onClick={() => setDeviceDialogOpen(true)}>
										<RouterIcon className="size-4" />
										设备
									</Button>
									<Button variant="outline" size="sm" className="gap-1" onClick={() => setPortDialogOpen(true)}>
										<CableIcon className="size-4" />
										端口
									</Button>
									<Button variant="outline" size="sm" className="gap-1" onClick={() => setLinkDialogOpen(true)}>
										<ActivityIcon className="size-4" />
										链路
									</Button>
								</div>
							)}
							<SelectionDetails node={selectedNode} ports={selectedPortOwnerPorts} />
							<div className="rounded-lg border border-border/70 bg-surface-soft p-3">
								<div className="text-sm font-semibold">未接入拓扑的机器</div>
								<div className="mt-2 grid gap-2">
									{getUnlinkedSystems(systems, topologyPorts)
										.slice(0, 5)
										.map((system) => (
											<Link
												key={system.id}
												href={prependBasePath(`/system/${system.id}`)}
												className="rounded-md border border-border/70 bg-card px-3 py-2 text-sm transition-colors hover:bg-surface-soft"
											>
												<div className="truncate font-medium">{getSystemDisplayName(system)}</div>
												<div className="mt-0.5 truncate text-xs text-muted-foreground">
													{getSystemIPAddressLabel(system)}
												</div>
											</Link>
										))}
									{getUnlinkedSystems(systems, topologyPorts).length === 0 && (
										<div className="rounded-md border border-border/70 bg-card px-3 py-4 text-sm text-muted-foreground">
											无未接入机器
										</div>
									)}
								</div>
							</div>
						</aside>
					)}
				</div>
			</CardContent>
			{!isOverview && (
				<>
					<DeviceDialog
						open={deviceDialogOpen}
						onOpenChange={setDeviceDialogOpen}
						userId={userId}
						onSaved={loadTopology}
					/>
					<PortDialog
						open={portDialogOpen}
						onOpenChange={setPortDialogOpen}
						userId={userId}
						assets={topology.assets}
						systems={systems}
						onSaved={loadTopology}
					/>
					<LinkDialog
						open={linkDialogOpen}
						onOpenChange={setLinkDialogOpen}
						userId={userId}
						assets={topology.assets}
						systems={systems}
						onSaved={loadTopology}
					/>
					<NodeDetailsDialog
						open={detailsDialogOpen}
						onOpenChange={setDetailsDialogOpen}
						node={detailsNode}
						ports={detailsPortOwnerPorts}
						readOnly={readOnly}
						onSaveConnectionModes={handleSaveConnectionModes}
					/>
				</>
			)}
		</Card>
	)
}

function TopologyLinkEdge({
	id,
	sourceX,
	sourceY,
	targetX,
	targetY,
	sourcePosition,
	targetPosition,
	markerStart,
	markerEnd,
	selected,
	data,
}: EdgeProps<Edge<TopologyEdgeData>>) {
	const [edgePath] = getSmoothStepPath({
		sourceX,
		sourceY,
		sourcePosition,
		targetX,
		targetY,
		targetPosition,
		borderRadius: 18,
	})
	const tone = getTopologyLinkTone(data?.link.kind)
	return (
		<>
			<path d={edgePath} fill="none" className="pulse-topology-link-underlay" style={{ stroke: tone.color }} />
			<BaseEdge
				id={id}
				path={edgePath}
				markerStart={markerStart}
				markerEnd={markerEnd}
				interactionWidth={26}
				className={cn("pulse-topology-link-path", tone.path, selected && "pulse-topology-link-path-selected")}
				style={{ stroke: tone.color }}
			/>
			<path
				d={edgePath}
				fill="none"
				className="pulse-topology-link-packet pulse-topology-link-packet-forward"
				style={{ stroke: tone.color }}
			/>
			<path
				d={edgePath}
				fill="none"
				className="pulse-topology-link-packet pulse-topology-link-packet-reverse"
				style={{ stroke: tone.color }}
			/>
		</>
	)
}

function TopologyNode({ id, data, selected }: NodeProps<Node<TopologyNodeData>>) {
	const isSystem = data.kind === "system"
	const isInternet = data.asset?.type === "internet"
	const icon = getTopologyNodeIcon(data)
	const Icon = icon.icon
	const tone = getTopologyNodeTone(data)
	const [detailsOpen, setDetailsOpen] = useState(false)
	if (isInternet) {
		return (
			<Tooltip open={detailsOpen} onOpenChange={setDetailsOpen}>
				<div className="relative grid h-full w-full place-items-center">
					<TooltipTrigger
						asChild
						onPointerEnter={() => setDetailsOpen(true)}
						onPointerLeave={() => setDetailsOpen(false)}
						onFocus={() => setDetailsOpen(true)}
						onBlur={() => setDetailsOpen(false)}
					>
						<button
							type="button"
							className={cn(
								"nodrag nopan relative grid min-h-24 w-36 place-items-center rounded-lg border border-border/70 bg-card px-3 py-3 text-muted-foreground transition-[border-color,background-color,color,transform] duration-150 ease-out hover:border-border hover:bg-surface-soft hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.96]",
								selected && "border-primary/45 ring-2 ring-primary/10"
							)}
							onClick={(event) => {
								event.stopPropagation()
								openTopologyNodeDetails(id)
							}}
							aria-label="查看互联网详情"
							title={icon.label}
						>
							<GlobeIcon className="size-6 stroke-[1.8]" aria-hidden="true" />
							<span className="mt-2 max-w-full truncate text-xs font-semibold text-foreground">{data.title}</span>
							{data.meta[1] && (
								<span className="mt-0.5 max-w-full truncate text-[10px] font-medium text-muted-foreground">
									{data.meta[1]}
								</span>
							)}
						</button>
					</TooltipTrigger>
					<Handle type="source" position={Position.Right} className="!size-2.5 !border-border !bg-card" />
				</div>
				<TooltipContent side="top" className="max-w-64 bg-foreground px-3 py-2 text-background">
					<div className="grid gap-1.5">
						<div className="text-sm font-semibold">{data.title}</div>
						<TooltipRow label="类型" value="宽带接入" />
						{data.meta.map((item, index) => (
							<TooltipRow key={`${item}-${index}`} label={getTopologyMetaLabel(data, index)} value={item} />
						))}
					</div>
				</TooltipContent>
			</Tooltip>
		)
	}
	return (
		<div
			className={cn(
				"grid h-full w-full grid-rows-[auto_1fr] overflow-hidden rounded-lg border border-border/70 bg-card p-3 shadow-none transition-[border-color,background-color]",
				selected && "border-primary/45 ring-2 ring-primary/15",
				isSystem ? "border-sky-500/25" : "border-emerald-500/25"
			)}
		>
			<Handle type="target" position={Position.Left} className="!size-2.5 !border-border !bg-card" />
			<div className="flex items-start justify-between gap-3">
				<div className="grid min-w-0 gap-1">
					<div className="truncate text-sm font-semibold leading-5">{data.title}</div>
					<div className="flex min-w-0 items-center gap-1.5">
						<NodeTag className={tone.typeTag}>{data.subtitle}</NodeTag>
						<TopologyConnectionBadges badges={data.connectionBadges} />
					</div>
				</div>
				<Tooltip open={detailsOpen} onOpenChange={setDetailsOpen}>
					<TooltipTrigger
						asChild
						onPointerEnter={() => setDetailsOpen(true)}
						onPointerLeave={() => setDetailsOpen(false)}
						onFocus={() => setDetailsOpen(true)}
						onBlur={() => setDetailsOpen(false)}
					>
						<button
							type="button"
							className={cn(
								"nodrag nopan relative grid size-10 shrink-0 place-items-center rounded-md border transition-[border-color,background-color,color,transform] duration-150 ease-out hover:border-border hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.96]",
								tone.icon
							)}
							onClick={(event) => {
								event.stopPropagation()
								openTopologyNodeDetails(id)
							}}
							aria-label={`查看${data.title}详情`}
							title={icon.label}
						>
							<Icon className="size-[18px] stroke-[1.8]" aria-hidden="true" />
							<span
								className={cn(
									"absolute right-1.5 top-1.5 size-1.5 rounded-full ring-2 ring-card",
									data.status ? getStatusDotClassName(data.status) : tone.dot
								)}
								aria-hidden="true"
							/>
						</button>
					</TooltipTrigger>
					<TooltipContent side="top" className="max-w-80 bg-foreground px-3 py-2 text-background">
						<div className="grid gap-1.5">
							<div className="text-sm font-semibold">{data.title}</div>
							<TooltipRow label="类型" value={data.subtitle} />
							{typeof data.portCount === "number" && <TooltipRow label="端口" value={`${data.portCount} 个`} />}
							{data.status && <TooltipRow label="状态" value={getTopologyStatusLabel(data.status)} />}
							{data.rateLabel && <TooltipRow label="流量" value={data.rateLabel} />}
							{data.meta.map((item, index) => (
								<TooltipRow key={`${item}-${index}`} label={getTopologyMetaLabel(data, index)} value={item} />
							))}
						</div>
					</TooltipContent>
				</Tooltip>
			</div>
			<div className="mt-3 grid min-h-0 content-end gap-1.5 overflow-hidden">
				<div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-1.5">
					<NodeMetric
						icon={<CableIcon className="size-3" />}
						value={`端口 ${typeof data.portCount === "number" ? data.portCount : "-"}`}
						className="justify-center border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300"
					/>
					{data.status ? (
						<NodeStatusTag status={data.status} />
					) : (
						<NodeMetric
							icon={<span className={cn("size-1.5 rounded-full", tone.dot)} />}
							value="正常"
							className={tone.stateTag}
						/>
					)}
				</div>
				{data.rateLabel && (
					<NodeMetric
						className="justify-center border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-300"
						icon={<ActivityIcon className="size-3" />}
						value={data.rateLabel}
					/>
				)}
				{!data.rateLabel && (
					<NodeMetric
						className="justify-center border-border/70 bg-surface-soft text-muted-foreground"
						icon={<NetworkIcon className="size-3" />}
						value={isSystem ? "暂无流量" : "手动设备"}
					/>
				)}
			</div>
			<Handle type="source" position={Position.Right} className="!size-2.5 !border-border !bg-card" />
		</div>
	)
}

function openTopologyNodeDetails(nodeId: string) {
	window.dispatchEvent(
		new CustomEvent(TOPOLOGY_NODE_DETAILS_EVENT, {
			detail: { nodeId },
		})
	)
}

function NodeTag({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<span
			className={cn(
				"inline-flex min-w-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4",
				className
			)}
		>
			{children}
		</span>
	)
}

function NodeMetric({ icon, value, className }: { icon: ReactNode; value: ReactNode; className?: string }) {
	return (
		<span
			className={cn(
				"inline-flex h-7 min-w-0 items-center gap-1 rounded-md border px-2 text-[11px] font-medium leading-none",
				className
			)}
		>
			<span className="grid shrink-0 place-items-center">{icon}</span>
			<span className="min-w-0 truncate tabular-nums">{value}</span>
		</span>
	)
}

function TopologyConnectionBadges({ badges }: { badges: TopologyConnectionBadge[] }) {
	if (badges.length === 0) return null
	return (
		<div className="flex min-w-0 items-center gap-1">
			{badges.map((badge) => (
				<TopologyConnectionBadgeIcon key={badge.kind} badge={badge} />
			))}
		</div>
	)
}

function TopologyConnectionBadgeIcon({ badge }: { badge: TopologyConnectionBadge }) {
	const Icon = badge.kind === "wireless" ? HouseWifiIcon : CableIcon
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					className={cn(
						"nodrag nopan grid size-6 shrink-0 place-items-center rounded-md border transition-[border-color,background-color,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.96]",
						"border-border/70 bg-surface-soft text-muted-foreground hover:border-border hover:bg-card hover:text-foreground"
					)}
					aria-label={`${badge.label}详情`}
					onClick={(event) => event.stopPropagation()}
					title={badge.label}
				>
					<Icon className="size-3.5 stroke-[1.9]" aria-hidden="true" />
				</button>
			</TooltipTrigger>
			<TooltipContent side="top" className="max-w-80 bg-foreground px-3 py-2 text-background">
				<div className="grid gap-1.5">
					<div className="text-sm font-semibold">
						{badge.label} · {badge.summary}
					</div>
					{badge.details.map((item, index) => (
						<div key={`${item}-${index}`} className="break-all text-xs font-medium text-background/85">
							{item}
						</div>
					))}
				</div>
			</TooltipContent>
		</Tooltip>
	)
}

function NodeStatusTag({ status }: { status: SystemRecord["status"] }) {
	if (status === "up") {
		return (
			<NodeMetric
				icon={<span className="size-1.5 rounded-full bg-emerald-500" />}
				value="在线"
				className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300"
			/>
		)
	}
	if (status === "paused") {
		return (
			<NodeMetric
				icon={<span className="size-1.5 rounded-full bg-amber-500" />}
				value="暂停"
				className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300"
			/>
		)
	}
	if (status === "pending") {
		return (
			<NodeMetric
				icon={<span className="size-1.5 rounded-full bg-slate-400" />}
				value="待接入"
				className="border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300"
			/>
		)
	}
	return (
		<NodeMetric
			icon={<span className="size-1.5 rounded-full bg-red-500" />}
			value="离线"
			className="border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300"
		/>
	)
}

function TooltipRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="grid grid-cols-[3rem_minmax(0,1fr)] gap-2 text-xs">
			<span className="text-background/60">{label}</span>
			<span className="break-all font-medium">{value}</span>
		</div>
	)
}

function getTopologyNodeIcon(data: TopologyNodeData): { icon: LucideIcon; label: string } {
	if (data.kind === "system") {
		return getSystemTopologyIcon(data.system)
	}
	if (data.asset) {
		return getAssetTopologyIcon(data.asset)
	}
	return { icon: NetworkIcon, label: "资产节点" }
}

function getAssetTopologyIcon(asset: AssetRecord): { icon: LucideIcon; label: string } {
	switch (asset.type) {
		case "internet":
			return { icon: GlobeIcon, label: "互联网接入" }
		case "gateway":
		case "router":
		case "ont":
		case "firewall":
			return { icon: RouterIcon, label: "网关 / 路由设备" }
		case "switch":
			return { icon: EthernetPortIcon, label: "以太网交换机" }
		case "ap":
			return { icon: HouseWifiIcon, label: "无线接入点" }
		case "nas":
			return { icon: HardDriveIcon, label: "NAS / 存储资产" }
		case "server":
		case "mini_pc":
		case "physical_host":
			return { icon: ServerIcon, label: "物理主机资产" }
		case "vm":
			return { icon: BoxesIcon, label: "虚拟机资产" }
		default:
			return { icon: NetworkIcon, label: "资产节点" }
	}
}

function getSystemTopologyIcon(system?: SystemRecord): { icon: LucideIcon; label: string } {
	if (!system) {
		return { icon: CpuIcon, label: "Pulse Agent 机器" }
	}
	const primaryUse = system.primary_use
	const profile = system.agent_profile || system.info?.cap?.agent_profile || ""
	if (system.is_local) {
		return { icon: ServerIcon, label: "Hub 所在机器" }
	}
	if (system.is_nas || primaryUse === "storage") {
		return { icon: HardDriveIcon, label: "NAS / 存储机器" }
	}
	if (primaryUse === "container_host" || profile.includes("container")) {
		return { icon: BoxesIcon, label: "容器承载机器" }
	}
	if (primaryUse === "network") {
		return { icon: NetworkIcon, label: "网络服务机器" }
	}
	if (primaryUse === "primary" || system.info?.os === Os.Windows) {
		return { icon: MonitorIcon, label: "桌面主机" }
	}
	if (system.info?.os === Os.Darwin) {
		return { icon: LaptopMinimalIcon, label: "macOS 机器" }
	}
	return { icon: CpuIcon, label: "Linux / 通用主机" }
}

function getTopologyNodeTone(data: TopologyNodeData) {
	if (data.kind === "system") {
		return {
			icon: "border-border/70 bg-surface-soft text-muted-foreground",
			typeTag:
				"w-fit border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-300",
			stateTag: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-300",
			dot: "bg-sky-500",
		}
	}
	if (data.asset?.type === "internet") {
		return {
			icon: "border-border/70 bg-surface-soft text-muted-foreground",
			typeTag:
				"w-fit border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300",
			stateTag:
				"border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300",
			dot: "bg-amber-500",
		}
	}
	if (data.asset?.type === "switch") {
		return {
			icon: "border-border/70 bg-surface-soft text-muted-foreground",
			typeTag:
				"w-fit border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/70 dark:bg-violet-950/40 dark:text-violet-300",
			stateTag:
				"border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/70 dark:bg-violet-950/40 dark:text-violet-300",
			dot: "bg-violet-500",
		}
	}
	return {
		icon: "border-border/70 bg-surface-soft text-muted-foreground",
		typeTag:
			"w-fit border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300",
		stateTag:
			"border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300",
		dot: "bg-emerald-500",
	}
}

function getTopologyLinkTone(kind?: NetworkLinkRecord["kind"]) {
	if (kind === "wifi") {
		return {
			color: "hsl(158 64% 42%)",
			path: "pulse-topology-link-path-wifi",
			label:
				"border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950 dark:text-emerald-200",
		}
	}
	if (kind === "internet") {
		return {
			color: "hsl(38 92% 48%)",
			path: "pulse-topology-link-path-internet",
			label:
				"border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950 dark:text-amber-200",
		}
	}
	return {
		color: "hsl(213 94% 56%)",
		path: "pulse-topology-link-path-ethernet",
		label: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950 dark:text-sky-200",
	}
}

function getTopologyStatusLabel(status: SystemRecord["status"]) {
	if (status === "up") return "在线"
	if (status === "paused") return "暂停"
	if (status === "pending") return "待接入"
	return "离线"
}

function getStatusDotClassName(status: SystemRecord["status"]) {
	if (status === "up") return "bg-emerald-500"
	if (status === "paused") return "bg-amber-500"
	if (status === "pending") return "bg-slate-400"
	return "bg-red-500"
}

function getTopologyMetaLabel(data: TopologyNodeData, index: number) {
	if (data.kind === "system") {
		return index === 0 ? "IP" : "MAC"
	}
	if (data.asset) {
		if (data.asset.type === "internet") {
			if (index === 0) return "运营商"
			if (index === 1) return "带宽"
			return "说明"
		}
		if (index === 0) return "型号"
		if (index === 1) return "管理"
		return "角色"
	}
	if (index === 0) return "型号"
	if (index === 1) return "管理"
	return "角色"
}

function TopologyStat({ label, value }: { label: string; value: number | string }) {
	return (
		<div className="rounded-md border border-border/70 bg-card px-3 py-2">
			<div className="text-lg font-semibold tabular-nums tracking-[-0.03em]">{value}</div>
			<div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div>
		</div>
	)
}

function SelectionDetails({ node, ports }: { node?: Node<TopologyNodeData>; ports: NetworkPortRecord[] }) {
	if (!node) {
		return (
			<div className="rounded-lg border border-border/70 bg-surface-soft p-4 text-sm font-medium text-muted-foreground">
				未选择节点
			</div>
		)
	}
	return (
		<div className="rounded-lg border border-border/70 bg-surface-soft p-3">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="truncate text-sm font-semibold">{node.data.title}</div>
					<div className="mt-1 truncate text-xs text-muted-foreground">{node.data.subtitle}</div>
				</div>
				{node.data.status && <StatusBadge status={node.data.status} />}
			</div>
			{node.data.meta.length > 0 && (
				<div className="mt-3 grid gap-1.5">
					{node.data.meta.map((item) => (
						<div key={item} className="break-all rounded-md border border-border/70 bg-card px-3 py-2 text-xs">
							{item}
						</div>
					))}
				</div>
			)}
			<div className="mt-3 grid gap-2">
				<div className="text-xs font-medium text-muted-foreground">端口</div>
				{ports.length === 0 ? (
					<div className="rounded-md border border-border/70 bg-card px-3 py-3 text-sm text-muted-foreground">
						暂无端口
					</div>
				) : (
					ports.map((port) => (
						<div key={port.id} className="rounded-md border border-border/70 bg-card px-3 py-2">
							<div className="flex items-center justify-between gap-2 text-sm">
								<span className="truncate font-medium">{port.name}</span>
								<span className="text-xs text-muted-foreground">{getPortTypeLabel(port.type)}</span>
							</div>
							{port.speed_mbps ? (
								<div className="mt-1 text-xs text-muted-foreground">{formatPortSpeed(port.speed_mbps)}</div>
							) : null}
						</div>
					))
				)}
			</div>
		</div>
	)
}

function NodeDetailsDialog({
	open,
	onOpenChange,
	node,
	ports,
	readOnly,
	onSaveConnectionModes,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	node?: Node<TopologyNodeData>
	ports: NetworkPortRecord[]
	readOnly: boolean
	onSaveConnectionModes: (nodeId: string, modes: TopologyConnectionKind[]) => Promise<void>
}) {
	const data = node?.data
	const system = data?.system
	const asset = data?.asset
	const availableModes = data?.availableConnectionBadges.map((badge) => badge.kind) ?? []
	const [selectedModes, setSelectedModes] = useState<TopologyConnectionKind[]>([])
	const [savingModes, setSavingModes] = useState(false)
	useEffect(() => {
		setSelectedModes(data?.connectionBadges.map((badge) => badge.kind) ?? [])
	}, [data])
	const canSaveModes = Boolean(node) && selectedModes.length > 0 && !readOnly && availableModes.length > 0
	async function handleSaveModes() {
		if (!node || !canSaveModes) return
		setSavingModes(true)
		try {
			await onSaveConnectionModes(node.id, selectedModes)
		} finally {
			setSavingModes(false)
		}
	}
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>{data ? `${data.title} 配置` : "节点配置"}</DialogTitle>
					<DialogDescription>
						{data?.kind === "system" ? "Pulse Agent 机器的实时身份和拓扑端口。" : "资产中心设备的基础配置和端口信息。"}
					</DialogDescription>
				</DialogHeader>
				{data && (
					<div className="grid gap-4">
						<section className="rounded-lg border border-border/70 bg-surface-soft p-3">
							<div className="mb-3 text-sm font-semibold">连接显示</div>
							{data.availableConnectionBadges.length === 0 ? (
								<div className="rounded-md border border-border/70 bg-card px-3 py-3 text-sm text-muted-foreground">
									暂无可展示的有线 / 无线信息
								</div>
							) : (
								<div className="grid gap-3">
									<div className="grid gap-2 sm:grid-cols-2">
										{data.availableConnectionBadges.map((badge) => (
											<ConnectionModeOption
												key={badge.kind}
												badge={badge}
												checked={selectedModes.includes(badge.kind)}
												disabled={readOnly || savingModes}
												onCheckedChange={(checked) =>
													setSelectedModes((current) =>
														checked
															? Array.from(new Set([...current, badge.kind]))
															: current.filter((item) => item !== badge.kind)
													)
												}
											/>
										))}
									</div>
									<div className="flex items-center justify-between gap-3">
										<div className="text-xs text-muted-foreground">至少保留一种连接类型，卡片会显示对应图标。</div>
										<Button
											type="button"
											size="sm"
											variant="outline"
											onClick={handleSaveModes}
											disabled={!canSaveModes || savingModes}
										>
											保存显示
										</Button>
									</div>
								</div>
							)}
						</section>
						<section className="rounded-lg border border-border/70 bg-surface-soft p-3">
							<div className="mb-3 text-sm font-semibold">基础信息</div>
							<div className="grid gap-2 sm:grid-cols-2">
								<TopologyDetailRow label="名称" value={data.title} />
								<TopologyDetailRow label="类型" value={data.subtitle} />
								{data.status && <TopologyDetailRow label="状态" value={getTopologyStatusLabel(data.status)} />}
								{data.rateLabel && <TopologyDetailRow label="实时流量" value={data.rateLabel} />}
								<TopologyDetailRow label="端口数量" value={`${ports.length} 个`} />
								{asset?.model && <TopologyDetailRow label="型号" value={asset.model} />}
								{asset?.type === "internet" && asset.vendor && (
									<TopologyDetailRow label="运营商" value={asset.vendor} />
								)}
								{asset?.type === "internet" && getInternetBandwidthLabel(asset) && (
									<TopologyDetailRow label="宽带带宽" value={getInternetBandwidthLabel(asset)} />
								)}
								{asset?.management_ip && <TopologyDetailRow label="管理 IP" value={asset.management_ip} />}
								{asset?.role && <TopologyDetailRow label="角色" value={asset.role} />}
								{asset?.location && <TopologyDetailRow label="位置" value={asset.location} />}
								{system?.info?.h && <TopologyDetailRow label="主机名" value={system.info.h} />}
								{system?.target_ip && <TopologyDetailRow label="目标 IP" value={system.target_ip} />}
								{system?.connect_ip && <TopologyDetailRow label="连接 IP" value={system.connect_ip} />}
								{system?.info?.v && <TopologyDetailRow label="Agent" value={system.info.v} />}
							</div>
							{asset?.notes && <TopologyDetailRow className="mt-2" label="备注" value={asset.notes} />}
						</section>
						{data.meta.length > 0 && (
							<section className="rounded-lg border border-border/70 bg-surface-soft p-3">
								<div className="mb-3 text-sm font-semibold">识别信息</div>
								<div className="grid gap-2">
									{data.meta.map((item, index) => (
										<TopologyDetailRow
											key={`${item}-${index}`}
											label={getTopologyMetaLabel(data, index)}
											value={item}
										/>
									))}
								</div>
							</section>
						)}
						<section className="rounded-lg border border-border/70 bg-surface-soft p-3">
							<div className="mb-3 text-sm font-semibold">端口配置</div>
							{ports.length === 0 ? (
								<div className="rounded-md border border-border/70 bg-card px-3 py-3 text-sm text-muted-foreground">
									暂无端口
								</div>
							) : (
								<div className="grid gap-2">
									{ports.map((port) => (
										<div key={port.id} className="rounded-md border border-border/70 bg-card px-3 py-2">
											<div className="flex items-center justify-between gap-2">
												<span className="truncate text-sm font-medium">{port.name}</span>
												<NodeTag className="border-border/70 bg-surface-soft text-muted-foreground">
													{getPortTypeLabel(port.type)}
												</NodeTag>
											</div>
											<div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
												<span>{port.speed_mbps ? formatPortSpeed(port.speed_mbps) : "速率未设置"}</span>
												{port.notes && <span className="break-all">{port.notes}</span>}
											</div>
										</div>
									))}
								</div>
							)}
						</section>
					</div>
				)}
				{system && (
					<DialogFooter>
						<Button asChild variant="outline">
							<Link href={prependBasePath(`/system/${system.id}`)}>打开机器详情</Link>
						</Button>
					</DialogFooter>
				)}
			</DialogContent>
		</Dialog>
	)
}

function TopologyDetailRow({ label, value, className }: { label: string; value: string; className?: string }) {
	return (
		<div className={cn("rounded-md border border-border/70 bg-card px-3 py-2", className)}>
			<div className="text-[11px] font-medium text-muted-foreground">{label}</div>
			<div className="mt-1 break-all text-sm font-medium">{value}</div>
		</div>
	)
}

function ConnectionModeOption({
	badge,
	checked,
	disabled,
	onCheckedChange,
}: {
	badge: TopologyConnectionBadge
	checked: boolean
	disabled: boolean
	onCheckedChange: (checked: boolean) => void
}) {
	const Icon = badge.kind === "wireless" ? HouseWifiIcon : CableIcon
	const checkboxId = `topology-connection-${badge.kind}`
	return (
		<div
			className={cn(
				"flex cursor-pointer items-start gap-3 rounded-md border border-border/70 bg-card px-3 py-2 transition-[border-color,background-color]",
				checked && "border-primary/40 bg-primary/5",
				disabled && "cursor-not-allowed opacity-70"
			)}
		>
			<Checkbox
				id={checkboxId}
				checked={checked}
				disabled={disabled}
				onCheckedChange={(value) => onCheckedChange(value === true)}
				className="mt-0.5"
			/>
			<label htmlFor={checkboxId} className="min-w-0 flex-1 cursor-pointer">
				<span className="flex items-center gap-2 text-sm font-semibold">
					<Icon className="size-4" aria-hidden="true" />
					{badge.label}
					<span className="text-xs font-medium text-muted-foreground">{badge.summary}</span>
				</span>
				<span className="mt-1 grid gap-0.5 text-xs text-muted-foreground">
					{badge.details.slice(0, 4).map((item, index) => (
						<span key={`${item}-${index}`} className="break-all">
							{item}
						</span>
					))}
				</span>
			</label>
		</div>
	)
}

function DeviceDialog({
	open,
	onOpenChange,
	userId,
	onSaved,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	userId: string
	onSaved: () => Promise<void>
}) {
	const [type, setType] = useState<AssetType>("switch")
	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const form = new FormData(event.currentTarget)
		const downMbps = Number(form.get("down_mbps")) || undefined
		const upMbps = Number(form.get("up_mbps")) || undefined
		await pb.collection("assets").create({
			user: userId,
			name: form.get("name"),
			type,
			status: "active",
			vendor: type === "internet" ? form.get("vendor") : undefined,
			model: type === "internet" ? undefined : form.get("model"),
			management_ip: form.get("management_ip"),
			role: form.get("role"),
			notes: form.get("notes"),
			metadata: type === "internet" ? { down_mbps: downMbps, up_mbps: upMbps } : undefined,
		})
		onOpenChange(false)
		await onSaved()
	}
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<form onSubmit={onSubmit} className="grid gap-4">
					<DialogHeader>
						<DialogTitle>添加拓扑资产</DialogTitle>
						<DialogDescription>用于维护光猫、路由器、交换机、AP、NAS 和主机等资产节点。</DialogDescription>
					</DialogHeader>
					<FormGrid>
						<TextField name="name" label="名称" required placeholder="例如 V271-20 / CM754" />
						<SelectField label="类型" value={type} onValueChange={(value) => setType(value as AssetType)}>
							{(
								[
									"internet",
									"gateway",
									"router",
									"ont",
									"firewall",
									"switch",
									"ap",
									"nas",
									"server",
									"mini_pc",
									"physical_host",
									"vm",
									"custom",
								] as const
							).map((item) => (
								<SelectItem key={item} value={item}>
									{getAssetTypeLabel(item)}
								</SelectItem>
							))}
						</SelectField>
						{type === "internet" ? (
							<>
								<TextField name="vendor" label="运营商" placeholder="联通 / 电信 / 移动" />
								<TextField name="down_mbps" label="下行 Mbps" type="number" placeholder="1000" />
								<TextField name="up_mbps" label="上行 Mbps" type="number" placeholder="100" />
								<TextField name="role" label="说明" placeholder="主宽带 / 备用宽带" />
							</>
						) : (
							<>
								<TextField name="model" label="型号" placeholder="设备型号" />
								<TextField name="management_ip" label="管理 IP" placeholder="192.168.1.1" />
								<TextField name="role" label="角色" placeholder="网关 / 核心交换机 / Wi-Fi AP" />
							</>
						)}
						<TextAreaField name="notes" label="备注" />
					</FormGrid>
					<DialogFooter>
						<Button type="submit">保存资产</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}

function PortDialog({
	open,
	onOpenChange,
	userId,
	assets,
	systems,
	onSaved,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	userId: string
	assets: AssetRecord[]
	systems: SystemRecord[]
	onSaved: () => Promise<void>
}) {
	const [assetId, setAssetId] = useState("")
	const [type, setType] = useState<NetworkPortRecord["type"]>("lan")
	const assetOptions = useMemo(() => buildTopologyAssets(assets, systems), [assets, systems])
	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		if (!assetId) return
		const form = new FormData(event.currentTarget)
		await createAssetInterface(userId, {
			asset: assetId,
			name: form.get("name")?.toString() || "Port",
			kind: mapNetworkPortTypeToAssetInterfaceKind(type),
			speed_mbps: Number(form.get("speed_mbps")) || undefined,
			ipv4: form.get("ipv4")?.toString(),
			ipv6: form.get("ipv6")?.toString(),
			mac: form.get("mac")?.toString(),
		})
		onOpenChange(false)
		await onSaved()
	}
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<form onSubmit={onSubmit} className="grid gap-4">
					<DialogHeader>
						<DialogTitle>添加端口</DialogTitle>
						<DialogDescription>端口写入资产中心，拓扑会用资产接口生成连接信息。</DialogDescription>
					</DialogHeader>
					<FormGrid>
						<SelectField label="归属资产" value={assetId} onValueChange={setAssetId}>
							{assetOptions.map((item) => (
								<SelectItem key={item.id} value={item.id}>
									{item.name}
								</SelectItem>
							))}
						</SelectField>
						<TextField name="name" label="端口名称" required placeholder="LAN / Wi-Fi / Port 1 / eth0" />
						<SelectField
							label="端口类型"
							value={type}
							onValueChange={(value) => setType(value as NetworkPortRecord["type"])}
						>
							{(["wan", "lan", "wifi", "uplink", "downlink", "management", "system", "custom"] as const).map((item) => (
								<SelectItem key={item} value={item}>
									{getPortTypeLabel(item)}
								</SelectItem>
							))}
						</SelectField>
						<TextField name="speed_mbps" label="速率 Mbps" type="number" placeholder="2500" />
						<TextField name="mac" label="MAC" placeholder="可选" />
						<TextField name="ipv4" label="IPv4" placeholder="192.168.1.10" />
						<TextField name="ipv6" label="IPv6" placeholder="可选" />
					</FormGrid>
					<DialogFooter>
						<Button type="submit" disabled={!assetId}>
							保存端口
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}

function LinkDialog({
	open,
	onOpenChange,
	userId,
	assets,
	systems,
	onSaved,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	userId: string
	assets: AssetRecord[]
	systems: SystemRecord[]
	onSaved: () => Promise<void>
}) {
	const [sourceAsset, setSourceAsset] = useState("")
	const [targetAsset, setTargetAsset] = useState("")
	const [kind, setKind] = useState<NetworkLinkRecord["kind"]>("ethernet")
	const assetOptions = useMemo(() => buildTopologyAssets(assets, systems), [assets, systems])
	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		if (!sourceAsset || !targetAsset || sourceAsset === targetAsset) return
		const form = new FormData(event.currentTarget)
		await pb.collection("asset_relations").create({
			user: userId,
			source_asset: sourceAsset,
			target_asset: targetAsset,
			kind: "connected_to",
			label: form.get("name"),
			metadata: {
				link_kind: kind,
				notes: form.get("notes")?.toString() || "",
			},
		})
		onOpenChange(false)
		await onSaved()
	}
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<form onSubmit={onSubmit} className="grid gap-4">
					<DialogHeader>
						<DialogTitle>添加链路</DialogTitle>
						<DialogDescription>选择两个资产建立连接，机器端会叠加 Agent 上报的网卡流量。</DialogDescription>
					</DialogHeader>
					<FormGrid>
						<SelectField label="A 端资产" value={sourceAsset} onValueChange={setSourceAsset}>
							{assetOptions.map((asset) => (
								<SelectItem key={asset.id} value={asset.id}>
									{asset.name}
								</SelectItem>
							))}
						</SelectField>
						<SelectField label="B 端资产" value={targetAsset} onValueChange={setTargetAsset}>
							{assetOptions.map((asset) => (
								<SelectItem key={asset.id} value={asset.id}>
									{asset.name}
								</SelectItem>
							))}
						</SelectField>
						<SelectField
							label="链路类型"
							value={kind}
							onValueChange={(value) => setKind(value as NetworkLinkRecord["kind"])}
						>
							{(["ethernet", "wifi", "internet", "custom"] as const).map((item) => (
								<SelectItem key={item} value={item}>
									{getLinkKindLabel(item)}
								</SelectItem>
							))}
						</SelectField>
						<TextField name="name" label="显示名称" placeholder="例如 网关到交换机" />
						<TextAreaField name="notes" label="备注" />
					</FormGrid>
					<DialogFooter>
						<Button type="submit" disabled={!sourceAsset || !targetAsset || sourceAsset === targetAsset}>
							保存链路
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}

function FormGrid({ children }: { children: ReactNode }) {
	return <div className="grid gap-3">{children}</div>
}

function TextField({ label, ...props }: ComponentProps<typeof Input> & { label: string }) {
	return (
		<div className="grid gap-2">
			<Label>{label}</Label>
			<Input {...props} />
		</div>
	)
}

function TextAreaField({ label, name }: { label: string; name: string }) {
	return (
		<div className="grid gap-2">
			<Label>{label}</Label>
			<Textarea name={name} />
		</div>
	)
}

function SelectField({
	label,
	value,
	onValueChange,
	children,
}: {
	label: string
	value: string
	onValueChange: (value: string) => void
	children: ReactNode
}) {
	return (
		<div className="grid gap-2">
			<Label>{label}</Label>
			<Select value={value} onValueChange={onValueChange}>
				<SelectTrigger>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>{children}</SelectContent>
			</Select>
		</div>
	)
}

function StatusBadge({ status }: { status: SystemRecord["status"] }) {
	if (status === "up") return <Badge variant="success">在线</Badge>
	if (status === "paused") return <Badge variant="warning">暂停</Badge>
	if (status === "pending") return <Badge variant="secondary">待接入</Badge>
	return <Badge variant="danger">离线</Badge>
}

function createAssetInterface(
	userId: string,
	values: Partial<Pick<AssetInterfaceRecord, "asset" | "name" | "kind" | "mac" | "ipv4" | "ipv6" | "speed_mbps">>
) {
	return pb.collection<AssetInterfaceRecord>("asset_interfaces").create({
		user: userId,
		asset: values.asset,
		name: values.name,
		kind: values.kind,
		mac: values.mac,
		ipv4: values.ipv4,
		ipv6: values.ipv6,
		speed_mbps: values.speed_mbps,
		connected: true,
		source: "manual",
	})
}

function getUnlinkedSystems(systems: SystemRecord[], ports: NetworkPortRecord[]) {
	const linkedSystemIds = new Set(ports.map((port) => port.system).filter(Boolean))
	return systems.filter((system) => !system.asset && !linkedSystemIds.has(system.id))
}

function buildTopologyAssets(assets: AssetRecord[], systems: SystemRecord[]) {
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

function mapNetworkPortTypeToAssetInterfaceKind(type: NetworkPortRecord["type"]): AssetInterfaceRecord["kind"] {
	if (type === "wan") return "wan"
	if (type === "wifi") return "wifi"
	if (type === "management") return "management"
	if (type === "lan" || type === "uplink" || type === "downlink" || type === "system") return "ethernet"
	return "custom"
}

function formatPortSpeed(value: number) {
	if (value >= 1000) {
		return `${value / 1000} Gbps`
	}
	return `${value} Mbps`
}

function getInternetBandwidthLabel(asset: AssetRecord) {
	const down = getMetadataNumber(asset.metadata, "down_mbps")
	const up = getMetadataNumber(asset.metadata, "up_mbps")
	if (!down && !up) {
		return ""
	}
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

export default memo(HomeNetworkTopology)
