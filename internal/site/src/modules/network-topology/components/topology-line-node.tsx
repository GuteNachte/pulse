import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { memo } from "react"
import { cn } from "../../../lib/utils.ts"
import type { TopologyHandleId } from "../canvas-core/handles.ts"
import type { TopologyMedium } from "../topology-domain.ts"

export const TOPOLOGY_LINE_NODE_TYPE = "pulseTopologyLineNode"

export type TopologyLineNodeData = {
	kind: "line"
	relationId: string
	index: number
	ratio: number
	medium: TopologyMedium
	readOnly?: boolean
	hidden?: boolean
}

export const TopologyLineNode = memo(function TopologyLineNode({ data }: NodeProps<Node<TopologyLineNodeData>>) {
	return (
		<div
			className={cn(
				"pulse-free-line-node",
				data.readOnly && "is-readonly",
				data.hidden && "is-hidden",
				`is-${data.medium}`
			)}
		>
			<LineHandle id="top" position={Position.Top} readOnly={data.readOnly} />
			<LineHandle id="right" position={Position.Right} readOnly={data.readOnly} />
			<LineHandle id="bottom" position={Position.Bottom} readOnly={data.readOnly} />
			<LineHandle id="left" position={Position.Left} readOnly={data.readOnly} />
		</div>
	)
})

function LineHandle({ id, position, readOnly }: { id: TopologyHandleId; position: Position; readOnly?: boolean }) {
	return (
		<Handle
			id={id}
			type="source"
			position={position}
			isConnectable={!readOnly}
			className={cn("pulse-free-line-handle", readOnly && "is-readonly")}
		/>
	)
}
