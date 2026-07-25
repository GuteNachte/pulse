import "@xyflow/react/dist/style.css"
import {
	Background,
	BackgroundVariant,
	ConnectionMode,
	Controls,
	ReactFlow,
	ReactFlowProvider,
	useEdgesState,
	useNodesState,
	useReactFlow,
	type Connection,
	type Edge,
	type Node,
	type Viewport,
} from "@xyflow/react"
import { useCallback, useEffect, useMemo, useReducer, useState } from "react"
import { cn } from "../../../lib/utils.ts"
import { createSuggestedLayout } from "../auto-layout.ts"
import { normalizeHandleId, resolveTopologyEdgeHandles, type TopologyHandleId } from "../canvas-core/handles.ts"
import {
	getTopologyConnectionNodePoints,
	getTopologyEdgePathPoints,
	getTopologyPathPointAtRatio,
} from "../canvas-core/edge-routing.ts"
import { snapTopologyPoint, TOPOLOGY_SNAP_GRID } from "../canvas-core/grid.ts"
import type { TopologyLayoutV2, TopologyPoint } from "../layout-v2.ts"
import type { SaveTopologyLayoutResult } from "../layout-persistence.ts"
import type { PulseTopologyEdgeData, PulseTopologyGraph } from "../pulse-adapter.ts"
import {
	resolveTopologyReconnect,
	type TopologyReconnectConnection,
	type TopologyReconnectEdge,
	type TopologyReconnectEndpoint,
} from "../reconnect-resolution.ts"
import type { TopologyDomain, TopologyMedium } from "../topology-domain.ts"
import type { AssetRecord, AssetRelationRecord } from "../../../types.ts"
import { createWorkspaceState, reduceWorkspace, type TopologyWorkspaceState } from "../workspace-state.ts"
import { TopologyConnectionSheet } from "./topology-connection-sheet.tsx"
import { TOPOLOGY_FREE_EDGE_TYPE, TopologyFreeEdge, type TopologyFreeEdgeData } from "./topology-free-edge.tsx"
import { TOPOLOGY_FREE_NODE_TYPE, TopologyFreeNode, type TopologyFreeNodeData } from "./topology-free-node.tsx"
import { TOPOLOGY_LINE_NODE_TYPE, TopologyLineNode, type TopologyLineNodeData } from "./topology-line-node.tsx"
import { TopologyWorkspaceToolbar } from "./topology-workspace-toolbar.tsx"

const nodeTypes = { [TOPOLOGY_FREE_NODE_TYPE]: TopologyFreeNode, [TOPOLOGY_LINE_NODE_TYPE]: TopologyLineNode }
const edgeTypes = { [TOPOLOGY_FREE_EDGE_TYPE]: TopologyFreeEdge }
const TOPOLOGY_NODE_WIDTH = 232
const TOPOLOGY_NODE_HEIGHT = 104

export type TopologyWorkspaceProps = {
	domain: TopologyDomain
	graph: PulseTopologyGraph
	layout: TopologyLayoutV2
	loadedUpdated?: string
	readOnly?: boolean
	overview?: boolean
	layoutPersisted?: boolean
	onSave?: (state: TopologyWorkspaceState) => Promise<SaveTopologyLayoutResult>
	onConnect?: (connection: Connection) => void
	onNodeOpen?: (node: Node<TopologyFreeNodeData>) => void
	onEdgeOpen?: (edge: Edge<TopologyFreeEdgeData>) => void
	onStateChange?: (state: TopologyWorkspaceState) => void
	onRelationsChanged?: () => void | Promise<void>
}

export function TopologyWorkspace(props: TopologyWorkspaceProps) {
	return (
		<ReactFlowProvider>
			<TopologyWorkspaceCanvas {...props} />
		</ReactFlowProvider>
	)
}

function TopologyWorkspaceCanvas({
	domain,
	graph,
	layout,
	loadedUpdated,
	readOnly = false,
	overview = false,
	layoutPersisted = true,
	onSave,
	onConnect,
	onNodeOpen,
	onEdgeOpen,
	onStateChange,
	onRelationsChanged,
}: TopologyWorkspaceProps) {
	const [state, dispatch] = useReducer(reduceWorkspace, undefined, () =>
		createWorkspaceState(domain, layout, loadedUpdated)
	)
	const { screenToFlowPosition } = useReactFlow()
	const [connectionEditing, setConnectionEditing] = useState(false)
	const [connectionDraft, setConnectionDraft] = useState<{
		sourceAsset: AssetRecord
		targetAsset: AssetRecord
		sourceHandle: TopologyHandleId
		targetHandle: TopologyHandleId
		metadata?: Record<string, unknown>
		relation?: AssetRelationRecord
	}>()
	const layoutIdentity = useMemo(() => JSON.stringify(layout), [layout])

	useEffect(() => {
		dispatch({ type: "switch-domain", domain, layout, loadedUpdated })
	}, [domain, layoutIdentity, loadedUpdated, layout])

	useEffect(() => {
		onStateChange?.(state)
	}, [onStateChange, state])

	const handleEditEdge = useCallback(
		(edge: Edge<TopologyFreeEdgeData>) => {
			if (onEdgeOpen) {
				onEdgeOpen(edge)
				return
			}
			if (readOnly) return
			const sourceNode = graph.nodes.find((node) => getNodeAsset(node)?.id === edge.data?.relation.source_asset)
			const targetNode = graph.nodes.find((node) => getNodeAsset(node)?.id === edge.data?.relation.target_asset)
			const sourceAsset = sourceNode ? getNodeAsset(sourceNode) : undefined
			const targetAsset = targetNode ? getNodeAsset(targetNode) : undefined
			if (!sourceAsset || !targetAsset || !edge.data?.relation) return
			setConnectionDraft({
				sourceAsset,
				targetAsset,
				sourceHandle: normalizeHandleId(edge.sourceHandle),
				targetHandle: normalizeHandleId(edge.targetHandle, "left"),
				relation: edge.data.relation,
			})
		},
		[graph.nodes, onEdgeOpen, readOnly]
	)

	const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<TopologyFreeEdgeData>>([])
	const positionedEdges = useMemo(() => {
		const nodePositions = new Map(
			graph.nodes.map((node) => [node.id, state.layout.nodes[node.id] ?? node.position] as const)
		)
		return graph.edges.map((edge) => ({
			...edge,
			...resolveTopologyEdgeHandles({
				sourcePosition: nodePositions.get(edge.source) ?? { x: 0, y: 0 },
				targetPosition: nodePositions.get(edge.target) ?? { x: 0, y: 0 },
				sourceHandle: edge.data?.relation.metadata?.source_handle,
				targetHandle: edge.data?.relation.metadata?.target_handle,
			}),
		}))
	}, [graph.edges, graph.nodes, state.layout.nodes])
	const handleMediaByNode = useMemo(() => {
		const result = new Map<string, Partial<Record<TopologyHandleId, TopologyMedium>>>()
		const assignMedium = (nodeId: string, handleId: TopologyHandleId, medium: TopologyMedium) => {
			const media = result.get(nodeId) ?? {}
			media[handleId] ??= medium
			result.set(nodeId, media)
		}
		for (const edge of positionedEdges) {
			const medium = edge.data?.medium ?? "wired"
			assignMedium(edge.source, normalizeHandleId(edge.sourceHandle), medium)
			assignMedium(edge.target, normalizeHandleId(edge.targetHandle, "left"), medium)
		}
		return result
	}, [positionedEdges])
	const renderedNodes = useMemo<Node<TopologyFreeNodeData>[]>(
		() =>
			graph.nodes.map((node) => ({
				...node,
				type: TOPOLOGY_FREE_NODE_TYPE,
				position: state.layout.nodes[node.id] ?? node.position,
				data: { ...node.data, readOnly, handleMedia: handleMediaByNode.get(node.id) } as TopologyFreeNodeData,
			})),
		[graph.nodes, handleMediaByNode, readOnly, state.layout.nodes]
	)
	const lineNodes = useMemo<Node<TopologyLineNodeData>[]>(() => {
		if (!connectionEditing || readOnly) return []
		return positionedEdges.flatMap((edge) => {
			const sourceNode = graph.nodes.find((node) => node.id === edge.source)
			const targetNode = graph.nodes.find((node) => node.id === edge.target)
			if (!sourceNode || !targetNode) return []
			const sourcePosition = getNodeHandlePoint(
				state.layout.nodes[sourceNode.id] ?? sourceNode.position,
				normalizeHandleId(edge.sourceHandle)
			)
			const targetPosition = getNodeHandlePoint(
				state.layout.nodes[targetNode.id] ?? targetNode.position,
				normalizeHandleId(edge.targetHandle, "left")
			)
			const pathPoints = getTopologyEdgePathPoints(
				[sourcePosition, ...(state.layout.edgeWaypoints[edge.id] ?? []), targetPosition],
				edge.data?.medium ?? "wired"
			)
			const connectionNodePoints = getTopologyConnectionNodePoints(pathPoints)
			return connectionNodePoints.map((position, index) => ({
				id: getLineNodeId(edge.id, index),
				type: TOPOLOGY_LINE_NODE_TYPE,
				position,
				origin: [0.5, 0.5] as [number, number],
				draggable: false,
				selectable: false,
				data: {
					kind: "line",
					relationId: edge.id,
					index,
					medium: edge.data?.medium ?? "wired",
					ratio: (index + 1) / (connectionNodePoints.length + 1),
					readOnly,
				},
			}))
		})
	}, [connectionEditing, graph.nodes, positionedEdges, readOnly, state.layout.edgeWaypoints, state.layout.nodes])
	const persistentBranchNodes = useMemo<Node<TopologyLineNodeData>[]>(() => {
		return positionedEdges.flatMap((edge) => {
			const branch = edge.data?.branch
			if (!branch) return []
			const parent = positionedEdges.find((candidate) => candidate.id === branch.parentRelationId)
			if (!parent) return []
			const sourceNode = graph.nodes.find((node) => node.id === parent.source)
			const targetNode = graph.nodes.find((node) => node.id === parent.target)
			if (!sourceNode || !targetNode) return []
			const sourcePosition = getNodeHandlePoint(
				state.layout.nodes[sourceNode.id] ?? sourceNode.position,
				normalizeHandleId(parent.sourceHandle)
			)
			const targetPosition = getNodeHandlePoint(
				state.layout.nodes[targetNode.id] ?? targetNode.position,
				normalizeHandleId(parent.targetHandle, "left")
			)
			const pathPoints = getTopologyEdgePathPoints(
				[sourcePosition, ...(state.layout.edgeWaypoints[parent.id] ?? []), targetPosition],
				parent.data?.medium ?? "wired"
			)
			return [
				{
					id: getPersistentBranchNodeId(edge.id),
					type: TOPOLOGY_LINE_NODE_TYPE,
					position: getTopologyPathPointAtRatio(pathPoints, branch.ratio),
					origin: [0.5, 0.5] as [number, number],
					draggable: false,
					selectable: false,
					data: {
						kind: "line",
						relationId: branch.parentRelationId,
						index: -1,
						medium: edge.data?.medium ?? "wired",
						ratio: branch.ratio,
						readOnly,
						hidden: !connectionEditing,
					},
				},
			]
		})
	}, [connectionEditing, graph.nodes, positionedEdges, readOnly, state.layout.edgeWaypoints, state.layout.nodes])
	const canvasNodes = useMemo<Node<TopologyFreeNodeData | TopologyLineNodeData>[]>(
		() => [...renderedNodes, ...persistentBranchNodes, ...lineNodes],
		[lineNodes, persistentBranchNodes, renderedNodes]
	)
	const reconnectEndpoints = useMemo<TopologyReconnectEndpoint[]>(
		() => [
			...graph.nodes.flatMap((node) =>
				node.data.kind === "asset" ? [{ id: node.id, kind: "asset" as const, assetId: node.data.asset.id }] : []
			),
			...lineNodes.map((node) => ({
				id: node.id,
				kind: "line" as const,
				relationId: node.data.relationId,
				ratio: node.data.ratio,
			})),
			...persistentBranchNodes.map((node) => ({
				id: node.id,
				kind: "line" as const,
				relationId: node.data.relationId,
				ratio: node.data.ratio,
			})),
		],
		[graph.nodes, lineNodes, persistentBranchNodes]
	)
	const reconnectEdges = useMemo<TopologyReconnectEdge[]>(
		() =>
			graph.edges.map((edge) => ({
				id: edge.id,
				source: edge.source,
				target: edge.target,
				sourceHandle: edge.sourceHandle,
				targetHandle: edge.targetHandle,
				relation: edge.data?.relation as AssetRelationRecord,
			})),
		[graph.edges]
	)
	const renderedEdges = useMemo<Edge<TopologyFreeEdgeData>[]>(() => {
		const confirmedEdges = positionedEdges.map((edge) => {
			const branchNode = edge.data?.branch
				? persistentBranchNodes.find((node) => node.id === getPersistentBranchNodeId(edge.id))
				: undefined
			let positionedEdge = { ...edge, type: TOPOLOGY_FREE_EDGE_TYPE }
			if (branchNode && edge.data?.branch?.endpoint === "source") {
				positionedEdge = { ...positionedEdge, source: branchNode.id }
			}
			if (branchNode && edge.data?.branch?.endpoint === "target") {
				positionedEdge = { ...positionedEdge, target: branchNode.id }
			}
			return {
				...positionedEdge,
				data: createEdgeData(edge.data, state.layout.edgeWaypoints[edge.id] ?? [], {
					readOnly,
					onAddWaypoint(index, point) {
						const waypoints = [...(state.layout.edgeWaypoints[edge.id] ?? [])]
						waypoints.splice(index, 0, snapTopologyPoint(point))
						dispatch({ type: "set-edge-waypoints", id: edge.id, waypoints })
					},
					onMoveWaypoint(index, screenPoint) {
						const waypoints = [...(state.layout.edgeWaypoints[edge.id] ?? [])]
						waypoints[index] = snapTopologyPoint(screenToFlowPosition(screenPoint))
						dispatch({ type: "set-edge-waypoints", id: edge.id, waypoints })
					},
					onDeleteWaypoint(index) {
						const waypoints = [...(state.layout.edgeWaypoints[edge.id] ?? [])]
						waypoints.splice(index, 1)
						dispatch({ type: "set-edge-waypoints", id: edge.id, waypoints })
					},
					onOpen: () => handleEditEdge(positionedEdge),
					onSelect: () =>
						setEdges((currentEdges) =>
							currentEdges.map((currentEdge) => ({ ...currentEdge, selected: currentEdge.id === edge.id }))
						),
				}),
			}
		})
		if (!connectionDraft || connectionDraft.relation) return confirmedEdges
		return [
			...confirmedEdges,
			{
				id: "topology-draft-connection",
				source: graph.nodes.find((node) => getNodeAsset(node)?.id === connectionDraft.sourceAsset.id)?.id ?? "",
				target: graph.nodes.find((node) => getNodeAsset(node)?.id === connectionDraft.targetAsset.id)?.id ?? "",
				sourceHandle: connectionDraft.sourceHandle,
				targetHandle: connectionDraft.targetHandle,
				type: "smoothstep",
				className: "pulse-free-draft-edge",
				selectable: false,
			},
		]
	}, [
		connectionDraft,
		graph.nodes,
		handleEditEdge,
		positionedEdges,
		persistentBranchNodes,
		readOnly,
		screenToFlowPosition,
		state.layout.edgeWaypoints,
		setEdges,
	])
	const [nodes, setNodes, onNodesChange] = useNodesState<Node<TopologyFreeNodeData | TopologyLineNodeData>>(canvasNodes)

	useEffect(() => setNodes(canvasNodes), [canvasNodes, setNodes])
	useEffect(
		() =>
			setEdges((currentEdges) => {
				const selectedEdgeIds = new Set(currentEdges.filter((edge) => edge.selected).map((edge) => edge.id))
				return renderedEdges.map((edge) => ({ ...edge, selected: selectedEdgeIds.has(edge.id) }))
			}),
		[renderedEdges, setEdges]
	)

	const stats = useMemo(
		() => ({
			devices: graph.nodes.filter((node) => node.data.kind === "asset").length,
			links: graph.edges.length,
			ports: graph.nodes.reduce((total, node) => total + node.data.interfaces.length, 0),
			wireless: graph.edges.filter((edge) => edge.data?.medium === "wifi").length,
		}),
		[graph.edges, graph.nodes]
	)
	const effectiveDirty = state.dirty || !layoutPersisted

	const handleAutoLayout = useCallback(() => {
		dispatch({ type: "apply-snapshot", snapshot: createSuggestedLayout(graph) })
	}, [graph])
	const handleConnect = useCallback(
		(connection: Connection) => {
			if (readOnly) return
			const sourceLine = lineNodes.find((node) => node.id === connection.source)?.data
			const targetLine = lineNodes.find((node) => node.id === connection.target)?.data
			if (sourceLine && targetLine) return
			const sourceParentEdge = sourceLine ? graph.edges.find((edge) => edge.id === sourceLine.relationId) : undefined
			const targetParentEdge = targetLine ? graph.edges.find((edge) => edge.id === targetLine.relationId) : undefined
			const sourceNode = graph.nodes.find((node) => node.id === connection.source)
			const targetNode = graph.nodes.find((node) => node.id === connection.target)
			const sourceAsset = sourceLine
				? getNodeAsset(graph.nodes.find((node) => node.id === sourceParentEdge?.source))
				: sourceNode
					? getNodeAsset(sourceNode)
					: undefined
			const targetAsset = targetLine
				? getNodeAsset(graph.nodes.find((node) => node.id === targetParentEdge?.target))
				: targetNode
					? getNodeAsset(targetNode)
					: undefined
			if (!sourceAsset || !targetAsset || sourceAsset.id === targetAsset.id) return
			setConnectionDraft({
				sourceAsset,
				targetAsset,
				sourceHandle: normalizeHandleId(sourceLine ? sourceParentEdge?.sourceHandle : connection.sourceHandle),
				targetHandle: normalizeHandleId(targetLine ? targetParentEdge?.targetHandle : connection.targetHandle, "left"),
				metadata: sourceLine
					? { branch_from_relation: sourceLine.relationId, branch_ratio: sourceLine.ratio, branch_endpoint: "source" }
					: targetLine
						? { branch_from_relation: targetLine.relationId, branch_ratio: targetLine.ratio, branch_endpoint: "target" }
						: undefined,
			})
			onConnect?.(connection)
		},
		[graph.edges, graph.nodes, lineNodes, onConnect, readOnly]
	)
	const handleReconnect = useCallback(
		(oldEdge: Edge<TopologyFreeEdgeData>, newConnection: Connection) => {
			if (readOnly || !oldEdge.data?.relation) return
			const result = resolveTopologyReconnect({
				edge: {
					id: oldEdge.id,
					source: oldEdge.source,
					target: oldEdge.target,
					sourceHandle: oldEdge.sourceHandle,
					targetHandle: oldEdge.targetHandle,
					relation: oldEdge.data.relation,
				},
				connection: newConnection as TopologyReconnectConnection,
				endpoints: reconnectEndpoints,
				edges: reconnectEdges,
			})
			if (!result.ok) return
			const sourceAsset = graph.nodes.find(
				(node) => node.data.kind === "asset" && node.data.asset.id === result.draft.sourceAssetId
			)
			const targetAsset = graph.nodes.find(
				(node) => node.data.kind === "asset" && node.data.asset.id === result.draft.targetAssetId
			)
			if (!sourceAsset || !targetAsset || sourceAsset.data.kind !== "asset" || targetAsset.data.kind !== "asset") return
			setConnectionDraft({
				sourceAsset: sourceAsset.data.asset,
				targetAsset: targetAsset.data.asset,
				sourceHandle: result.draft.sourceHandle,
				targetHandle: result.draft.targetHandle,
				metadata: result.draft.metadata,
				relation: oldEdge.data.relation,
			})
		},
		[graph.nodes, readOnly, reconnectEdges, reconnectEndpoints]
	)
	const handleSave = useCallback(async () => {
		if (!onSave || readOnly || !effectiveDirty) return
		dispatch({ type: "save-started" })
		const result = await onSave(state)
		if (result.status === "saved") {
			dispatch({ type: "save-succeeded", updated: result.updated })
		} else if (result.status === "conflict") {
			dispatch({ type: "save-conflict", message: "远端布局已更新，请先处理冲突" })
		} else {
			dispatch({ type: "save-failed", message: getErrorMessage(result.error) })
		}
	}, [effectiveDirty, onSave, readOnly, state])
	const handleMoveEnd = useCallback((_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
		dispatch({ type: "set-viewport", viewport })
	}, [])

	return (
		<>
			<section
				className={cn(
					"grid overflow-hidden bg-background",
					overview
						? "h-[min(64vh,640px)] min-h-[560px] grid-rows-[minmax(0,1fr)]"
						: "h-[calc(100dvh-7.5rem)] min-h-[720px] grid-rows-[auto_minmax(0,1fr)]"
				)}
			>
				{overview ? null : (
					<TopologyWorkspaceToolbar
						domain={domain}
						stats={stats}
						dirty={effectiveDirty}
						readOnly={readOnly}
						canUndo={state.canUndo}
						canRedo={state.canRedo}
						onUndo={() => dispatch({ type: "undo" })}
						onRedo={() => dispatch({ type: "redo" })}
						onAutoLayout={handleAutoLayout}
						onSave={handleSave}
					/>
				)}
				<div className="min-h-0 bg-background">
					<ReactFlow
						className={cn("pulse-topology-flow pulse-free-topology-flow", overview && "pulse-topology-flow-readonly")}
						nodes={nodes}
						edges={edges}
						nodeTypes={nodeTypes}
						edgeTypes={edgeTypes}
						connectionMode={ConnectionMode.Loose}
						defaultViewport={state.layout.viewport}
						minZoom={0.35}
						maxZoom={1.8}
						fitView
						fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
						nodesConnectable={!readOnly}
						nodesDraggable={!readOnly}
						edgesReconnectable={!readOnly}
						reconnectRadius={16}
						elementsSelectable={!overview}
						panOnDrag={!overview}
						zoomOnScroll={!overview}
						zoomOnPinch={!overview}
						zoomOnDoubleClick={!overview}
						snapToGrid
						snapGrid={TOPOLOGY_SNAP_GRID}
						onNodesChange={onNodesChange}
						onEdgesChange={onEdgesChange}
						onConnect={readOnly ? undefined : handleConnect}
						onReconnect={readOnly ? undefined : handleReconnect}
						onNodeDoubleClick={(_event, node) => {
							if (node.data.kind !== "line") onNodeOpen?.(node as Node<TopologyFreeNodeData>)
						}}
						onEdgeClick={(_event, edge) => onEdgeOpen?.(edge)}
						onEdgeDoubleClick={(_event, edge) => handleEditEdge(edge)}
						onNodeDragStart={() => setConnectionEditing(true)}
						onNodeDragStop={(_event, node) => {
							if (node.data.kind !== "line") {
								dispatch({ type: "move-node", id: node.id, position: snapTopologyPoint(node.position) })
							}
							setConnectionEditing(false)
						}}
						onConnectStart={() => setConnectionEditing(true)}
						onConnectEnd={() => setConnectionEditing(false)}
						onReconnectStart={() => setConnectionEditing(true)}
						onReconnectEnd={() => setConnectionEditing(false)}
						onMoveEnd={overview ? undefined : handleMoveEnd}
						proOptions={{ hideAttribution: true }}
					>
						<Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color="var(--border)" />
						{overview ? null : <Controls showInteractive={false} position="bottom-left" />}
					</ReactFlow>
				</div>
			</section>
			<TopologyConnectionSheet
				open={Boolean(connectionDraft)}
				onOpenChange={(open) => {
					if (!open) setConnectionDraft(undefined)
				}}
				sourceAsset={connectionDraft?.sourceAsset}
				targetAsset={connectionDraft?.targetAsset}
				interfaces={graph.nodes.flatMap((node) => node.data.interfaces)}
				domain={domain}
				relation={connectionDraft?.relation}
				metadata={connectionDraft?.metadata}
				sourceHandle={connectionDraft?.sourceHandle}
				targetHandle={connectionDraft?.targetHandle}
				readOnly={readOnly}
				onSaved={async () => {
					await onRelationsChanged?.()
					setConnectionDraft(undefined)
				}}
				onDeleted={async () => {
					await onRelationsChanged?.()
					setConnectionDraft(undefined)
				}}
			/>
		</>
	)
}

function createEdgeData(
	data: PulseTopologyEdgeData | undefined,
	waypoints: TopologyPoint[],
	actions: Omit<TopologyFreeEdgeData, keyof PulseTopologyEdgeData>
): TopologyFreeEdgeData | undefined {
	if (!data) return undefined
	return { ...data, ...actions, waypoints: waypoints.map((point) => ({ ...point })) }
}

function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : "布局保存失败"
}

function getNodeAsset(node?: Node<PulseTopologyGraph["nodes"][number]["data"]>) {
	return node?.data.kind === "asset" ? node.data.asset : undefined
}

function getLineNodeId(relationId: string, index: number) {
	return `line:${relationId}:${index}`
}

function getPersistentBranchNodeId(relationId: string) {
	return `branch:${relationId}`
}

function getNodeHandlePoint(position: TopologyPoint, handle: TopologyHandleId): TopologyPoint {
	if (handle === "top") return { x: position.x + TOPOLOGY_NODE_WIDTH / 2, y: position.y }
	if (handle === "right") return { x: position.x + TOPOLOGY_NODE_WIDTH, y: position.y + TOPOLOGY_NODE_HEIGHT / 2 }
	if (handle === "bottom") return { x: position.x + TOPOLOGY_NODE_WIDTH / 2, y: position.y + TOPOLOGY_NODE_HEIGHT }
	return { x: position.x, y: position.y + TOPOLOGY_NODE_HEIGHT / 2 }
}
