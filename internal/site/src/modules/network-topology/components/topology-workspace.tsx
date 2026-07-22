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
import { useCallback, useEffect, useMemo, useReducer } from "react"
import { createSuggestedLayout } from "../auto-layout.ts"
import type { TopologyLayoutV2, TopologyPoint } from "../layout-v2.ts"
import type { SaveTopologyLayoutResult } from "../layout-persistence.ts"
import type { PulseTopologyEdgeData, PulseTopologyGraph } from "../pulse-adapter.ts"
import type { TopologyDomain } from "../topology-domain.ts"
import { createWorkspaceState, reduceWorkspace, type TopologyWorkspaceState } from "../workspace-state.ts"
import { TOPOLOGY_FREE_EDGE_TYPE, TopologyFreeEdge, type TopologyFreeEdgeData } from "./topology-free-edge.tsx"
import { TOPOLOGY_FREE_NODE_TYPE, TopologyFreeNode, type TopologyFreeNodeData } from "./topology-free-node.tsx"
import { TopologyWorkspaceToolbar } from "./topology-workspace-toolbar.tsx"

const nodeTypes = { [TOPOLOGY_FREE_NODE_TYPE]: TopologyFreeNode }
const edgeTypes = { [TOPOLOGY_FREE_EDGE_TYPE]: TopologyFreeEdge }

export type TopologyWorkspaceProps = {
	domain: TopologyDomain
	graph: PulseTopologyGraph
	layout: TopologyLayoutV2
	loadedUpdated?: string
	readOnly?: boolean
	onSave?: (state: TopologyWorkspaceState) => Promise<SaveTopologyLayoutResult>
	onConnect?: (connection: Connection) => void
	onNodeOpen?: (node: Node<TopologyFreeNodeData>) => void
	onEdgeOpen?: (edge: Edge<TopologyFreeEdgeData>) => void
	onStateChange?: (state: TopologyWorkspaceState) => void
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
	onSave,
	onConnect,
	onNodeOpen,
	onEdgeOpen,
	onStateChange,
}: TopologyWorkspaceProps) {
	const [state, dispatch] = useReducer(reduceWorkspace, undefined, () =>
		createWorkspaceState(domain, layout, loadedUpdated)
	)
	const { screenToFlowPosition } = useReactFlow()
	const layoutIdentity = useMemo(() => JSON.stringify(layout), [layout])

	useEffect(() => {
		dispatch({ type: "switch-domain", domain, layout, loadedUpdated })
	}, [domain, layoutIdentity, loadedUpdated, layout])

	useEffect(() => {
		onStateChange?.(state)
	}, [onStateChange, state])

	const renderedNodes = useMemo<Node<TopologyFreeNodeData>[]>(
		() =>
			graph.nodes.map((node) => ({
				...node,
				type: TOPOLOGY_FREE_NODE_TYPE,
				position: state.layout.nodes[node.id] ?? node.position,
				data: { ...node.data, readOnly } as TopologyFreeNodeData,
			})),
		[graph.nodes, readOnly, state.layout.nodes]
	)
	const renderedEdges = useMemo<Edge<TopologyFreeEdgeData>[]>(
		() =>
			graph.edges.map((edge) => ({
				...edge,
				type: TOPOLOGY_FREE_EDGE_TYPE,
				data: createEdgeData(edge.data, state.layout.edgeWaypoints[edge.id] ?? [], {
					readOnly,
					onAddWaypoint(index, point) {
						const waypoints = [...(state.layout.edgeWaypoints[edge.id] ?? [])]
						waypoints.splice(index, 0, point)
						dispatch({ type: "set-edge-waypoints", id: edge.id, waypoints })
					},
					onMoveWaypoint(index, screenPoint) {
						const waypoints = [...(state.layout.edgeWaypoints[edge.id] ?? [])]
						waypoints[index] = screenToFlowPosition(screenPoint)
						dispatch({ type: "set-edge-waypoints", id: edge.id, waypoints })
					},
					onDeleteWaypoint(index) {
						const waypoints = [...(state.layout.edgeWaypoints[edge.id] ?? [])]
						waypoints.splice(index, 1)
						dispatch({ type: "set-edge-waypoints", id: edge.id, waypoints })
					},
				}),
			})),
		[graph.edges, readOnly, screenToFlowPosition, state.layout.edgeWaypoints]
	)
	const [nodes, setNodes, onNodesChange] = useNodesState(renderedNodes)
	const [edges, setEdges, onEdgesChange] = useEdgesState(renderedEdges)

	useEffect(() => setNodes(renderedNodes), [renderedNodes, setNodes])
	useEffect(() => setEdges(renderedEdges), [renderedEdges, setEdges])

	const stats = useMemo(
		() => ({
			devices: graph.nodes.filter((node) => node.data.kind === "asset").length,
			links: graph.edges.length,
			ports: graph.nodes.reduce((total, node) => total + node.data.interfaces.length, 0),
			wireless: graph.edges.filter((edge) => edge.data?.medium === "wifi").length,
		}),
		[graph.edges, graph.nodes]
	)

	const handleAutoLayout = useCallback(() => {
		dispatch({ type: "apply-snapshot", snapshot: createSuggestedLayout(graph) })
	}, [graph])
	const handleSave = useCallback(async () => {
		if (!onSave || readOnly || !state.dirty) return
		dispatch({ type: "save-started" })
		const result = await onSave(state)
		if (result.status === "saved") {
			dispatch({ type: "save-succeeded", updated: result.updated })
		} else if (result.status === "conflict") {
			dispatch({ type: "save-conflict", message: "远端布局已更新，请先处理冲突" })
		} else {
			dispatch({ type: "save-failed", message: getErrorMessage(result.error) })
		}
	}, [onSave, readOnly, state])
	const handleMoveEnd = useCallback((_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
		dispatch({ type: "set-viewport", viewport })
	}, [])

	return (
		<section className="grid min-h-[620px] grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-background">
			<TopologyWorkspaceToolbar
				domain={domain}
				stats={stats}
				dirty={state.dirty}
				readOnly={readOnly}
				canUndo={state.canUndo}
				canRedo={state.canRedo}
				onUndo={() => dispatch({ type: "undo" })}
				onRedo={() => dispatch({ type: "redo" })}
				onAutoLayout={handleAutoLayout}
				onSave={handleSave}
			/>
			<div className="min-h-0 bg-background">
				<ReactFlow
					className="pulse-topology-flow pulse-free-topology-flow"
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
					elementsSelectable
					onNodesChange={onNodesChange}
					onEdgesChange={onEdgesChange}
					onConnect={readOnly ? undefined : onConnect}
					onNodeDoubleClick={(_event, node) => onNodeOpen?.(node)}
					onEdgeDoubleClick={(_event, edge) => onEdgeOpen?.(edge)}
					onNodeDragStop={(_event, node) =>
						dispatch({ type: "move-node", id: node.id, position: { ...node.position } })
					}
					onMoveEnd={handleMoveEnd}
				>
					<Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color="var(--border)" />
					<Controls showInteractive={false} position="bottom-left" />
				</ReactFlow>
			</div>
		</section>
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
