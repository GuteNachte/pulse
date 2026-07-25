import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import {
	CircleHelpIcon,
	EthernetPortIcon,
	Globe2Icon,
	HardDriveIcon,
	HouseWifiIcon,
	MonitorIcon,
	RouterIcon,
	ServerIcon,
	SmartphoneIcon,
} from "lucide-react"
import { memo } from "react"
import { getAssetTypeLabel } from "../../../lib/network-topology.ts"
import { cn } from "../../../lib/utils.ts"
import type { TopologyHandleId } from "../canvas-core/handles.ts"
import type { PulseTopologyNodeData } from "../pulse-adapter.ts"
import type { TopologyMedium } from "../topology-domain.ts"

export const TOPOLOGY_FREE_NODE_TYPE = "pulseTopologyFree"

export type TopologyFreeNodeData = PulseTopologyNodeData & {
	readOnly?: boolean
	handleMedia?: Partial<Record<TopologyHandleId, TopologyMedium>>
}

export const TopologyFreeNode = memo(function TopologyFreeNode({
	data,
	selected,
}: NodeProps<Node<TopologyFreeNodeData>>) {
	const asset = data.kind === "asset" ? data.asset : undefined
	const Icon = getNodeIcon(data)
	const connectedInterfaces = data.interfaces.filter((item) => item.connected).length
	const interfaceSummary =
		data.interfaces.length > 0 ? `${connectedInterfaces}/${data.interfaces.length} 网口` : "未录入网口"
	const title = asset?.name ?? "设备待建档"
	const subtitle = data.kind === "asset" ? getAssetTypeLabel(data.asset.type) : data.missingAssetId

	return (
		<article
			aria-label={`${title}，${subtitle}`}
			className={cn(
				"group relative grid h-[104px] w-[232px] grid-cols-[36px_minmax(0,1fr)] items-center gap-2.5 rounded-md border bg-card px-3 py-2.5 text-left shadow-none transition-[border-color,background-color,box-shadow]",
				"hover:border-foreground/25 hover:bg-surface-soft",
				selected && "border-primary/60 bg-primary/5 ring-2 ring-primary/15",
				data.diagnosticCodes.length > 0 && "border-amber-500/45"
			)}
		>
			<TopologyHandle id="top" position={Position.Top} medium={data.handleMedia?.top} readOnly={data.readOnly} />
			<TopologyHandle id="right" position={Position.Right} medium={data.handleMedia?.right} readOnly={data.readOnly} />
			<TopologyHandle
				id="bottom"
				position={Position.Bottom}
				medium={data.handleMedia?.bottom}
				readOnly={data.readOnly}
			/>
			<TopologyHandle id="left" position={Position.Left} medium={data.handleMedia?.left} readOnly={data.readOnly} />

			<div className="grid size-9 place-items-center rounded-md border border-border bg-surface-soft text-muted-foreground">
				<Icon aria-hidden="true" className="size-[18px] stroke-[1.8]" />
			</div>
			<div className="min-w-0">
				<div className="flex min-w-0 items-center gap-1.5">
					<span className="truncate text-[13px] font-semibold leading-5">{title}</span>
					{data.kind === "asset" && data.status ? (
						<span
							role="img"
							aria-label={getStatusLabel(data.status)}
							className={cn("size-1.5 shrink-0 rounded-full", getStatusTone(data.status))}
						/>
					) : null}
				</div>
				<div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
					<span className="shrink-0">{subtitle}</span>
					{asset?.management_ip ? (
						<span className="truncate border-l border-border pl-1.5 font-mono tabular-nums">{asset.management_ip}</span>
					) : null}
				</div>
				<div className="mt-2 flex min-w-0 items-center gap-2 text-[10px] text-muted-foreground">
					<span className="inline-flex min-w-0 items-center gap-1">
						<EthernetPortIcon aria-hidden="true" className="size-3" />
						<span className="truncate">{interfaceSummary}</span>
					</span>
					{data.diagnosticCodes.length > 0 ? (
						<span className="shrink-0 text-amber-700 dark:text-amber-300">待确认</span>
					) : null}
				</div>
			</div>
		</article>
	)
})

function TopologyHandle({
	id,
	position,
	medium,
	readOnly,
}: {
	id: TopologyHandleId
	position: Position
	medium?: TopologyMedium
	readOnly?: boolean
}) {
	return (
		<Handle
			id={id}
			type="source"
			position={position}
			isConnectable={!readOnly}
			className={cn("pulse-free-handle", medium && "is-connected", medium && `is-${medium}`, readOnly && "is-readonly")}
		/>
	)
}

function getNodeIcon(data: TopologyFreeNodeData) {
	if (data.kind === "placeholder") return CircleHelpIcon
	if (data.asset.type === "internet") return Globe2Icon
	if (["gateway", "router", "ont", "firewall"].includes(data.asset.type)) return RouterIcon
	if (["switch", "ap", "smarthome_gateway"].includes(data.asset.type)) return HouseWifiIcon
	if (data.asset.type === "phone") return SmartphoneIcon
	if (data.asset.type === "nas") return HardDriveIcon
	if (["server", "mini_pc", "physical_host"].includes(data.asset.type)) return ServerIcon
	return MonitorIcon
}

function getStatusLabel(status: "up" | "down" | "paused" | "pending") {
	if (status === "up") return "在线"
	if (status === "paused") return "已暂停"
	if (status === "pending") return "待接入"
	return "离线"
}

function getStatusTone(status: "up" | "down" | "paused" | "pending") {
	if (status === "up") return "bg-emerald-500"
	if (status === "paused") return "bg-amber-500"
	if (status === "pending") return "bg-muted-foreground"
	return "bg-destructive"
}
