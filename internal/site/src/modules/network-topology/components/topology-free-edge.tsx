import { BaseEdge, EdgeLabelRenderer, type Edge, type EdgeProps } from "@xyflow/react"
import { CircleDotIcon, PlusIcon, WifiIcon } from "lucide-react"
import { useState } from "react"
import { cn } from "../../../lib/utils.ts"
import {
	getTopologyEdgePathPoints,
	getTopologyPathMidpoint,
	getTopologyWaypointAddPoint,
} from "../canvas-core/edge-routing.ts"
import { buildWaypointPath } from "../canvas-core/waypoints.ts"
import type { TopologyPoint } from "../layout-v2.ts"
import type { PulseTopologyEdgeData } from "../pulse-adapter.ts"

export const TOPOLOGY_FREE_EDGE_TYPE = "pulseTopologyFree"

export type TopologyFreeEdgeData = PulseTopologyEdgeData & {
	readOnly?: boolean
	onSelect?: () => void
	onOpen?: () => void
	onAddWaypoint?: (index: number, point: TopologyPoint) => void
	onMoveWaypoint?: (index: number, point: TopologyPoint) => void
	onDeleteWaypoint?: (index: number) => void
}

export function TopologyFreeEdge(props: EdgeProps<Edge<TopologyFreeEdgeData>>) {
	const [hovered, setHovered] = useState(false)
	const data = props.data
	if (!data) {
		return <BaseEdge id={props.id} path={`M ${props.sourceX} ${props.sourceY} L ${props.targetX} ${props.targetY}`} />
	}
	if (data.medium === "wifi") {
		return <MediaEdge {...props} data={data} medium="wifi" hovered={hovered} setHovered={setHovered} />
	}
	if (data.medium === "fiber") {
		return <MediaEdge {...props} data={data} medium="fiber" hovered={hovered} setHovered={setHovered} />
	}
	return <MediaEdge {...props} data={data} medium="wired" hovered={hovered} setHovered={setHovered} />
}

function MediaEdge({
	data,
	medium,
	hovered,
	setHovered,
	...props
}: EdgeProps<Edge<TopologyFreeEdgeData>> & {
	data: TopologyFreeEdgeData
	medium: "wired" | "wifi" | "fiber"
	hovered: boolean
	setHovered: (value: boolean) => void
}) {
	const source = { x: props.sourceX, y: props.sourceY }
	const target = { x: props.targetX, y: props.targetY }
	const controlPoints = [source, ...data.waypoints, target]
	const pathPoints = getTopologyEdgePathPoints(controlPoints, medium)
	const path = buildWaypointPath(pathPoints, "orthogonal")
	const labelPoint = getTopologyPathMidpoint(pathPoints)
	const selected = Boolean(props.selected)

	return (
		<>
			<g>
				{medium === "fiber" ? (
					<BaseEdge
						id={`${props.id}-underlay`}
						path={path}
						interactionWidth={0}
						className="pulse-free-edge pulse-free-edge-fiber-underlay"
					/>
				) : null}
				<BaseEdge
					id={props.id}
					path={path}
					interactionWidth={0}
					onClick={() => {
						data.onSelect?.()
						data.onOpen?.()
					}}
					onMouseEnter={() => setHovered(true)}
					onMouseLeave={() => setHovered(false)}
					className={cn(
						"pulse-free-edge",
						medium === "wired" && "pulse-free-edge-wired",
						medium === "wifi" && "pulse-free-edge-wifi",
						medium === "fiber" && "pulse-free-edge-fiber",
						!data.medium && "pulse-free-edge-unknown",
						selected && "is-selected"
					)}
				/>
				{/* biome-ignore lint/a11y/noStaticElementInteractions: React Flow owns keyboard focus on the enclosing edge. */}
				<path
					d={path}
					fill="none"
					stroke="transparent"
					strokeWidth={24}
					pointerEvents="stroke"
					className="react-flow__edge-interaction"
					onClick={() => {
						data.onSelect?.()
						data.onOpen?.()
					}}
				/>
			</g>
			{medium !== "wired" ? <MediumMarker medium={medium} point={labelPoint} /> : null}
			<EdgeDetails data={data} point={labelPoint} visible={hovered || selected} />
			{selected && !data.readOnly ? (
				<WaypointControls data={data} medium={medium} source={source} target={target} />
			) : null}
		</>
	)
}

function MediumMarker({ medium, point }: { medium: "wifi" | "fiber"; point: TopologyPoint }) {
	const Icon = medium === "wifi" ? WifiIcon : CircleDotIcon
	return (
		<EdgeLabelRenderer>
			<div
				className={cn("pulse-free-medium-marker", `is-${medium}`)}
				style={{ transform: `translate(-50%, -50%) translate(${point.x}px, ${point.y}px)` }}
			>
				<Icon aria-hidden="true" />
				{medium === "fiber" ? <span>光纤</span> : null}
			</div>
		</EdgeLabelRenderer>
	)
}

function EdgeDetails({ data, point, visible }: { data: TopologyFreeEdgeData; point: TopologyPoint; visible: boolean }) {
	const interfaceLabel = [data.sourceInterface?.name, data.targetInterface?.name].filter(Boolean).join(" → ")
	const speeds = [data.sourceInterface?.speed_mbps, data.targetInterface?.speed_mbps].filter(
		(value): value is number => typeof value === "number" && value > 0
	)
	const speed = speeds.length > 0 ? formatSpeed(Math.min(...speeds)) : "速率待确认"
	return (
		<EdgeLabelRenderer>
			<div
				className={cn("pulse-free-edge-caption", visible && "is-visible")}
				style={{ transform: `translate(-50%, calc(-100% - 12px)) translate(${point.x}px, ${point.y}px)` }}
			>
				<span>{interfaceLabel || "网口待确认"}</span>
				<span>{speed}</span>
			</div>
		</EdgeLabelRenderer>
	)
}

function WaypointControls({
	data,
	medium,
	source,
	target,
}: {
	data: TopologyFreeEdgeData
	medium: "wired" | "wifi" | "fiber"
	source: TopologyPoint
	target: TopologyPoint
}) {
	const points = [source, ...data.waypoints, target]
	return (
		<EdgeLabelRenderer>
			{data.waypoints.map((point, index) => (
				<button
					key={`waypoint-${index}-${point.x}-${point.y}`}
					type="button"
					aria-label={`移动折点 ${index + 1}`}
					className="nodrag nopan pulse-free-waypoint"
					style={{ transform: `translate(-50%, -50%) translate(${point.x}px, ${point.y}px)` }}
					onPointerDown={(event) => event.stopPropagation()}
					onDoubleClick={(event) => {
						event.stopPropagation()
						data.onDeleteWaypoint?.(index)
					}}
					onPointerMove={(event) => {
						if (event.buttons === 1) data.onMoveWaypoint?.(index, { x: event.clientX, y: event.clientY })
					}}
				/>
			))}
			{points.slice(0, -1).map((point, index) => {
				const midpoint = getTopologyWaypointAddPoint(point, points[index + 1], medium)
				return (
					<button
						key={`segment-${index}`}
						type="button"
						aria-label={`在第 ${index + 1} 段添加折点`}
						className="nodrag nopan pulse-free-waypoint-add"
						style={{ transform: `translate(-50%, -50%) translate(${midpoint.x}px, ${midpoint.y}px)` }}
						onPointerDown={(event) => event.stopPropagation()}
						onClick={(event) => {
							event.stopPropagation()
							data.onAddWaypoint?.(index, midpoint)
						}}
					>
						<PlusIcon aria-hidden="true" />
					</button>
				)
			})}
		</EdgeLabelRenderer>
	)
}

function formatSpeed(speedMbps: number) {
	return speedMbps >= 1000 ? `${Number((speedMbps / 1000).toFixed(1))} Gbps` : `${speedMbps} Mbps`
}
