import type { Edge, Node } from "@xyflow/react"
import {
	ArrowDownLeftIcon,
	ArrowUpRightIcon,
	CableIcon,
	CircleDotIcon,
	ExternalLinkIcon,
	PencilIcon,
	WifiIcon,
} from "lucide-react"
import { useState } from "react"
import { Link, prependBasePath } from "../../../components/router.tsx"
import { Badge } from "../../../components/ui/badge.tsx"
import { Button } from "../../../components/ui/button.tsx"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../../../components/ui/sheet.tsx"
import { getAssetTypeLabel } from "../../../lib/network-topology.ts"
import { getInterfaceKindLabel } from "../../asset-center/asset-detail-relations.ts"
import { resolveAssetNetworkRelationEndpoints } from "../../asset-center/asset-network-uplink.ts"
import type { PulseTopologyGraph } from "../pulse-adapter.ts"
import type { TopologyDomain } from "../topology-domain.ts"
import { formatTopologyPortSpeed } from "../workspace-data.ts"
import { TopologyConnectionSheet } from "./topology-connection-sheet.tsx"
import type { TopologyFreeEdgeData } from "./topology-free-edge.tsx"
import type { TopologyFreeNodeData } from "./topology-free-node.tsx"

export type TopologyInspectorSheetProps = {
	open: boolean
	onOpenChange: (open: boolean) => void
	node?: Node<TopologyFreeNodeData>
	edge?: Edge<TopologyFreeEdgeData>
	nodes: PulseTopologyGraph["nodes"]
	domain: TopologyDomain
	readOnly: boolean
	onRelationsChanged?: () => void | Promise<void>
}

export function TopologyInspectorSheet({
	open,
	onOpenChange,
	node,
	edge,
	nodes,
	domain,
	readOnly,
	onRelationsChanged,
}: TopologyInspectorSheetProps) {
	const [editing, setEditing] = useState(false)
	const source = edge ? nodes.find((item) => item.id === edge.source) : undefined
	const target = edge ? nodes.find((item) => item.id === edge.target) : undefined
	const sourceAsset = source?.data.kind === "asset" ? source.data.asset : undefined
	const targetAsset = target?.data.kind === "asset" ? target.data.asset : undefined
	const resolvedEndpoints = edge
		? edge.data
			? resolveAssetNetworkRelationEndpoints(
					edge.data.relation,
					new Map(nodes.flatMap((item) => item.data.interfaces).map((item) => [item.id, item]))
				)
			: undefined
		: undefined
	const upstream = resolvedEndpoints
		? nodes.find((item) => item.id === `asset:${resolvedEndpoints.upstreamAssetId}`)
		: undefined
	const downstream = resolvedEndpoints
		? nodes.find((item) => item.id === `asset:${resolvedEndpoints.downstreamAssetId}`)
		: undefined
	const title = node ? getNodeTitle(node) : edge?.data?.relation.label || "网络连接"

	return (
		<>
			<Sheet open={open} onOpenChange={onOpenChange}>
				<SheetContent className="w-[min(100vw-1rem,24rem)] gap-0 overflow-y-auto p-0">
					<SheetHeader className="border-b border-border/70 pr-14">
						<SheetTitle>{title}</SheetTitle>
						<SheetDescription>{node ? getNodeSubtitle(node) : getMediumLabel(edge?.data?.medium)}</SheetDescription>
					</SheetHeader>
					<div className="grid gap-4 p-4">
						{node ? <NodeDetails node={node} /> : null}
						{edge ? (
							<EdgeDetails
								edge={edge}
								upstreamName={getNodeName(upstream)}
								downstreamName={getNodeName(downstream)}
								upstreamInterfaceName={resolvedEndpoints?.upstreamInterface?.name}
								downstreamInterfaceName={resolvedEndpoints?.downstreamInterface?.name}
							/>
						) : null}
						{edge && sourceAsset && targetAsset && !readOnly ? (
							<Button variant="outline" className="justify-start gap-2" onClick={() => setEditing(true)}>
								<PencilIcon aria-hidden="true" className="size-4" />
								编辑连接
							</Button>
						) : null}
					</div>
				</SheetContent>
			</Sheet>
			<TopologyConnectionSheet
				open={editing}
				onOpenChange={setEditing}
				sourceAsset={sourceAsset}
				targetAsset={targetAsset}
				interfaces={nodes.flatMap((item) => item.data.interfaces)}
				domain={domain}
				relation={edge?.data?.relation}
				readOnly={readOnly}
				onSaved={async () => {
					await onRelationsChanged?.()
					setEditing(false)
					onOpenChange(false)
				}}
				onDeleted={async () => {
					await onRelationsChanged?.()
					setEditing(false)
					onOpenChange(false)
				}}
			/>
		</>
	)
}

function NodeDetails({ node }: { node: Node<TopologyFreeNodeData> }) {
	if (node.data.kind === "placeholder") {
		return (
			<section className="grid gap-2">
				<SectionTitle>待建档设备</SectionTitle>
				<DetailRow label="资产 ID" value={node.data.missingAssetId} mono />
			</section>
		)
	}

	const asset = node.data.asset
	return (
		<>
			<section className="grid gap-2">
				<SectionTitle>设备档案</SectionTitle>
				<DetailRow label="名称" value={asset.name} />
				<DetailRow label="类型" value={getAssetTypeLabel(asset.type)} />
				{asset.model ? <DetailRow label="型号" value={asset.model} /> : null}
				{asset.management_ip ? <DetailRow label="IPv4" value={asset.management_ip} mono /> : null}
				{asset.role ? <DetailRow label="用途" value={asset.role} /> : null}
				{asset.location ? <DetailRow label="位置" value={asset.location} /> : null}
			</section>
			<section className="grid gap-2">
				<div className="flex items-center justify-between gap-2">
					<SectionTitle>网口状态</SectionTitle>
					<Badge variant="outline">{node.data.interfaces.length}</Badge>
				</div>
				{node.data.interfaces.length > 0 ? (
					node.data.interfaces.map((networkInterface) => (
						<div
							key={networkInterface.id}
							className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border/60 py-2 last:border-0"
						>
							<div className="min-w-0">
								<div className="truncate text-sm font-medium">{networkInterface.name}</div>
								<div className="mt-0.5 text-xs text-muted-foreground">
									{getInterfaceKindLabel(networkInterface.kind)}
								</div>
							</div>
							<div className="text-right text-xs tabular-nums text-muted-foreground">
								{networkInterface.speed_mbps ? formatTopologyPortSpeed(networkInterface.speed_mbps) : "速率待确认"}
							</div>
						</div>
					))
				) : (
					<div className="border border-dashed border-border/80 px-3 py-4 text-sm text-muted-foreground">
						暂无网口资料
					</div>
				)}
			</section>
			<Button asChild variant="outline" className="justify-start gap-2">
				<Link href={prependBasePath(`/assets/${asset.id}`)}>
					<ExternalLinkIcon aria-hidden="true" className="size-4" />
					打开资产详情
				</Link>
			</Button>
		</>
	)
}

function EdgeDetails({
	edge,
	upstreamName,
	downstreamName,
	upstreamInterfaceName,
	downstreamInterfaceName,
}: {
	edge: Edge<TopologyFreeEdgeData>
	upstreamName: string
	downstreamName: string
	upstreamInterfaceName?: string
	downstreamInterfaceName?: string
}) {
	const Icon = edge.data?.medium === "wifi" ? WifiIcon : edge.data?.medium === "fiber" ? CircleDotIcon : CableIcon
	return (
		<>
			<section className="grid gap-2">
				<SectionTitle>接入方向</SectionTitle>
				<EndpointRow icon={ArrowUpRightIcon} label="上游" value={upstreamName} />
				<EndpointRow icon={ArrowDownLeftIcon} label="下联" value={downstreamName} />
			</section>
			<section className="grid gap-2">
				<SectionTitle>连接参数</SectionTitle>
				<DetailRow label="介质" value={getMediumLabel(edge.data?.medium)} icon={<Icon className="size-3.5" />} />
				<DetailRow label="上游网口" value={upstreamInterfaceName || "待确认"} />
				<DetailRow label="下联网口" value={downstreamInterfaceName || "待确认"} />
			</section>
		</>
	)
}

function EndpointRow({ icon: Icon, label, value }: { icon: typeof ArrowUpRightIcon; label: string; value: string }) {
	return (
		<div className="grid grid-cols-[20px_minmax(0,1fr)] gap-2 border-b border-border/60 py-2 last:border-0">
			<Icon aria-hidden="true" className="mt-0.5 size-4 text-muted-foreground" />
			<div>
				<div className="text-xs text-muted-foreground">{label}</div>
				<div className="text-sm font-medium">{value}</div>
			</div>
		</div>
	)
}

function SectionTitle({ children }: { children: string }) {
	return <h3 className="text-xs font-semibold text-muted-foreground">{children}</h3>
}

function DetailRow({
	label,
	value,
	mono,
	icon,
}: {
	label: string
	value: string
	mono?: boolean
	icon?: React.ReactNode
}) {
	return (
		<div className="grid grid-cols-[5rem_minmax(0,1fr)] items-start gap-3 border-b border-border/60 py-2 last:border-0">
			<span className="text-xs text-muted-foreground">{label}</span>
			<span
				className={`${mono ? "font-mono tabular-nums" : ""} flex items-center gap-1.5 break-all text-sm font-medium`}
			>
				{icon}
				{value}
			</span>
		</div>
	)
}

function getNodeTitle(node: Node<TopologyFreeNodeData>) {
	return node.data.kind === "asset" ? node.data.asset.name : "设备待建档"
}

function getNodeSubtitle(node: Node<TopologyFreeNodeData>) {
	return node.data.kind === "asset" ? getAssetTypeLabel(node.data.asset.type) : node.data.missingAssetId
}

function getNodeName(node?: PulseTopologyGraph["nodes"][number]) {
	if (!node) return "端点缺失"
	return node.data.kind === "asset" ? node.data.asset.name : "设备待建档"
}

function getMediumLabel(medium?: TopologyFreeEdgeData["medium"]) {
	if (medium === "wifi") return "无线"
	if (medium === "fiber") return "光纤 / PON"
	if (medium === "wired") return "网线"
	return "介质待确认"
}
