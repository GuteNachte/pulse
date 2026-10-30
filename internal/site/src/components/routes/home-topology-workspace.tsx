import "@xyflow/react/dist/style.css"
import {
	ConnectionMode,
	Panel,
	ReactFlow,
	useNodesState,
	type NodeMouseHandler,
	type ReactFlowInstance,
} from "@xyflow/react"
import { ArrowRightIcon, MapPinIcon, NetworkIcon, PencilIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { getPagePath } from "@nanostores/router"
import { $router, Link, navigate } from "@/components/router"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Unit } from "@/lib/enums"
import { getAssetTypeLabel, getMetadataString } from "@/modules/asset-center/asset-schema"
import { getAssetIcon } from "@/modules/asset-center/components/asset-card"
import { getSystemMetricDisplay, getSystemNetworkDisplay } from "@/lib/system-metrics"
import { isReadOnlyUser } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useTopologyWorkspaceData } from "@/modules/network-topology/use-topology-workspace-data"
import { useTopologyLayout } from "@/modules/network-topology/use-topology-layout"
import type { TopologyDomain } from "@/modules/network-topology/topology-domain"
import { formatTopologyInternetBandwidth } from "@/modules/network-topology/workspace-data"
import { TopologyEditorNodeCard } from "@/modules/network-topology/editor/editor-node"
import { TopologyEdgeLegend } from "@/modules/network-topology/editor/topology-edge-legend"
import {
	autoLayoutEditorGraph,
	buildEditorGraph,
	type TopologyEditorEdge,
	type TopologyEditorNode,
} from "@/modules/network-topology/editor/editor-model"
import type { AssetInterfaceRecord, AssetPresenceRecord, AssetRecord, AssetRelationRecord, SystemRecord } from "@/types"

const nodeTypes = { topologyEditor: TopologyEditorNodeCard }

type AssetSummary = {
	total: number
	monitored: number
	manual: number
	looseLocationAssets: number
}

const DOMAIN_LABELS: Record<TopologyDomain, string> = {
	home: "家庭网",
	technology: "科技网",
}

export type TopologyWorkspaceProps = {
	systems: SystemRecord[]
	activeAlertCount: number
	assetSummary: AssetSummary
	assetSummaryHref: string
}

type ControlledTopologyWorkspaceProps = TopologyWorkspaceProps & {
	domain: TopologyDomain
	onDomainChange: (domain: TopologyDomain) => void
}

// 2026-10-25 首页与完整拓扑页内容重复：只读「完整拓扑页」下线，拓扑展示只保留首页，
// 「网络拓扑」入口与首页右上按钮都直接进入独立编辑页 /network/edit。
export function TopologyWorkspace({
	systems,
	activeAlertCount,
	assetSummary,
	assetSummaryHref,
	domain,
	onDomainChange,
}: ControlledTopologyWorkspaceProps) {
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
	const view = useTopologyWorkspaceData(domain, systems)
	const layout = useTopologyLayout()
	// 编辑器按网段拆画布后，展示页只读取当前网段画布的布局；旧布局没有 canvasId 时继续兼容。
	const domainLayout = useMemo(
		() =>
			layout
				? {
						nodes: layout.nodes.filter((node) => !node.canvasId || node.canvasId === domain),
					}
				: null,
		[domain, layout]
	)
	const interfacesByAssetId = useMemo(() => {
		const map = new Map<string, AssetInterfaceRecord[]>()
		for (const node of view.graph.nodes) {
			if (node.data.kind === "asset") map.set(node.data.asset.id, node.data.interfaces)
		}
		return map
	}, [view.graph.nodes])
	const elements = useMemo(() => {
		const assets: AssetRecord[] = []
		const interfaces: AssetInterfaceRecord[] = []
		const relationMap = new Map<string, AssetRelationRecord>()
		const presenceList: AssetPresenceRecord[] = []
		for (const node of view.graph.nodes) {
			if (node.data.kind !== "asset") continue
			assets.push(node.data.asset)
			interfaces.push(...node.data.interfaces)
			if (node.data.presence) presenceList.push(node.data.presence)
		}
		for (const edge of view.graph.edges) {
			if (edge.data.relation) relationMap.set(edge.data.relation.id, edge.data.relation)
		}
		const graph = buildEditorGraph({
			assets,
			interfaces,
			relations: Array.from(relationMap.values()),
			layout: domainLayout,
			systems,
			presence: presenceList,
			domain,
		})
		let nodes = graph.nodes
		if (!graph.hasLayout) {
			nodes = autoLayoutEditorGraph(nodes, graph.edges)
		} else {
			const positioned = new Set((domainLayout?.nodes ?? []).map((node) => node.assetId))
			const missing = nodes.filter((node) => !positioned.has(node.id))
			const maxX = nodes.reduce((max, node) => Math.max(max, node.position.x), 0)
			missing.forEach((node, index) => {
				node.position = { x: maxX + 280 + (index % 3) * 260, y: 60 + Math.floor(index / 3) * 130 }
			})
		}
		// 展示页：有连线经过的连接点常显为小圆点，其余保持悬停显示；圆点取连线颜色
		const connectedHandleSides = new Map<string, Map<string, string>>()
		const markHandleSide = (nodeId: string, side: string | null | undefined, color: string) => {
			if (!side) return
			const sides = connectedHandleSides.get(nodeId) ?? new Map<string, string>()
			if (!sides.has(side)) sides.set(side, color)
			connectedHandleSides.set(nodeId, sides)
		}
		for (const edge of graph.edges) {
			const color = typeof edge.style?.stroke === "string" ? edge.style.stroke : "#3B82F6"
			markHandleSide(edge.source, edge.sourceHandle ?? "right", color)
			markHandleSide(edge.target, edge.targetHandle ?? "left", color)
		}
		nodes = nodes.map((node) => {
			const sides = connectedHandleSides.get(node.id)
			return sides
				? {
						...node,
						data: {
							...node.data,
							connectedHandles: [...sides.keys()],
							handleColors: Object.fromEntries(sides),
						},
					}
				: node
		})
		return { nodes, edges: graph.edges }
	}, [domain, domainLayout, systems, view.graph])
	const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<TopologyEditorNode>(elements.nodes)
	const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<TopologyEditorNode, TopologyEditorEdge> | null>(
		null
	)
	useEffect(() => {
		setFlowNodes(elements.nodes)
	}, [elements, setFlowNodes])
	// 2026-10-25 展示页锁定 1 倍显示：不再套用编辑器保存的缩放，只按固定比例居中。
	useEffect(() => {
		if (!flowInstance || flowNodes.length === 0) return
		let cancelled = false
		const timers = [80, 320, 1000, 2000].map((delay) =>
			window.setTimeout(() => {
				if (!cancelled) flowInstance.fitView({ padding: 0.18, minZoom: 1, maxZoom: 1, duration: 0 })
			}, delay)
		)
		return () => {
			cancelled = true
			for (const timer of timers) window.clearTimeout(timer)
		}
	}, [domain, elements.edges.length, flowInstance, flowNodes.length, layout])
	// 首页常驻时每 15 秒静默刷新一次拓扑，不闪加载态
	useEffect(() => {
		const timer = window.setInterval(() => {
			view.reload({ silent: true }).catch((error) => console.error("topology silent reload failed", error))
		}, 15_000)
		return () => window.clearInterval(timer)
	}, [view.reload])
	const selectedNode = useMemo(
		() => elements.nodes.find((node) => node.id === selectedNodeId),
		[selectedNodeId, elements.nodes]
	)
	// 按画布节点统计三态（Agent 心跳 > 网络探测 > 未探测），与图上颜色一一对应；
	// 宽带与手机不参与在线探测，不计入未探测
	const presenceStats = useMemo(() => {
		let online = 0
		let offline = 0
		let unmonitored = 0
		for (const node of elements.nodes) {
			if (node.data.system?.status === "up" || node.data.presence?.status === "online") online += 1
			else if (node.data.system?.status === "down" || node.data.presence?.status === "offline") offline += 1
			else if (node.data.asset.type !== "internet" && node.data.asset.type !== "phone") unmonitored += 1
		}
		return { online, offline, unmonitored }
	}, [elements.nodes])
	const hasNodes = elements.nodes.length > 0
	// 设备地图清点：按资产类型统计画布上的台数与在线/离线数（供图例显示）
	const kindCounts = useMemo(() => {
		const counts = new Map<string, { total: number; online: number; offline: number }>()
		for (const node of elements.nodes) {
			const type = node.data.asset.type
			const entry = counts.get(type) ?? { total: 0, online: 0, offline: 0 }
			entry.total += 1
			if (node.data.system?.status === "up" || node.data.presence?.status === "online") entry.online += 1
			else if (node.data.system?.status === "down" || node.data.presence?.status === "offline") entry.offline += 1
			counts.set(type, entry)
		}
		return counts
	}, [elements.nodes])
	// 2026-10-25 用户要求拓扑图固定 1 倍显示：禁用所有缩放入口（滚轮 / 双指 / 双击 / 缩放按钮），
	// 小地图与「适应视图」按钮一并移除；只保留拖拽平移。
	// （编辑页 /network/edit 仍保留缩放，那是编辑工具，需要在大画布上调整布局。）

	function selectDomain(next: TopologyDomain) {
		setSelectedNodeId(null)
		onDomainChange(next)
	}

	const handleNodeClick: NodeMouseHandler<TopologyEditorNode> = (_, node) => {
		setSelectedNodeId(node.id)
	}
	const handleNodeDoubleClick: NodeMouseHandler<TopologyEditorNode> = (_, node) => {
		navigate(getPagePath($router, "asset", { id: node.data.asset.id }))
	}

	return (
		<div className="grid min-h-0 pulse-card-gap">
			<div className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-2 text-xs">
				<span className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-surface-soft px-2 py-1">
					<span className="size-2 rounded-full bg-emerald-500" />
					在线 <strong className="tabular-nums">{presenceStats.online}</strong>
				</span>
				<span className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-surface-soft px-2 py-1">
					<span className="size-2 rounded-full bg-red-500" />
					离线 <strong className="tabular-nums">{presenceStats.offline}</strong>
				</span>
				<span className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-surface-soft px-2 py-1">
					<span className="size-2 rounded-full bg-gray-500" />
					未探测 <strong className="tabular-nums">{presenceStats.unmonitored}</strong>
				</span>
				<span className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-surface-soft px-2 py-1">
					<span className="size-2 rounded-full bg-amber-500" />
					未恢复告警 <strong className="tabular-nums">{activeAlertCount}</strong>
				</span>
				<span className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-surface-soft px-2 py-1">
					<span className="size-2 rounded-full bg-sky-500" />
					拓扑 <strong className="tabular-nums">{elements.nodes.length}</strong> 节点 ·
					<strong className="tabular-nums">{elements.edges.length}</strong> 链路
				</span>
				<span className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-surface-soft px-2 py-1">
					<MapPinIcon className="size-3" />
					待归档资产 <strong className="tabular-nums">{assetSummary.looseLocationAssets}</strong>
				</span>
				{!isReadOnlyUser() && (
					<Button asChild size="sm" className="ms-auto h-8 gap-1.5">
						<Link href={`${getPagePath($router, "networkEdit")}?canvas=${encodeURIComponent(domain)}`}>
							<PencilIcon className="size-3.5" />
							编辑拓扑
						</Link>
					</Button>
				)}
			</div>

			<div className="grid min-h-0 pulse-card-gap xl:grid-cols-[minmax(0,1fr)_20rem] xl:h-[calc(100dvh-10.5rem)]">
				<section className="relative min-h-[34rem] overflow-hidden rounded-lg border border-border/70 bg-[#0F1115]">
					<div className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded-md border border-border/70 bg-card/95 p-1 shadow-sm backdrop-blur">
						{(["home", "technology"] as const).map((item) => (
							<Button
								key={item}
								type="button"
								variant={domain === item ? "default" : "ghost"}
								size="sm"
								className="h-7 rounded px-2 text-xs"
								onClick={() => selectDomain(item)}
							>
								{DOMAIN_LABELS[item]}
							</Button>
						))}
					</div>

					{view.loading && (
						<div className="absolute inset-x-0 top-0 z-10 border-b border-border/70 bg-background/90 px-3 py-2 text-xs text-muted-foreground">
							正在加载{DOMAIN_LABELS[domain]}拓扑
						</div>
					)}
					{Boolean(view.error) && (
						<div className="absolute inset-x-0 top-0 z-10 border-b border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
							{DOMAIN_LABELS[domain]}拓扑加载失败
						</div>
					)}

					{hasNodes ? (
						<ReactFlow
							key={domain}
							nodes={flowNodes}
							edges={elements.edges}
							onInit={setFlowInstance}
							onNodesChange={onNodesChange}
							nodeTypes={nodeTypes}
							fitView
							// 固定 1 倍：minZoom = maxZoom = 1，fitView 只做居中不做缩放
							fitViewOptions={{ padding: 0.18, minZoom: 1, maxZoom: 1 }}
							minZoom={1}
							maxZoom={1}
							zoomOnScroll={false}
							zoomOnPinch={false}
							zoomOnDoubleClick={false}
							panOnScroll={false}
							// 展示页画布固定：不缩放、不拖动，位置由 fitView 统一确定
							panOnDrag={false}
							nodesDraggable={false}
							nodesConnectable={false}
							connectionMode={ConnectionMode.Loose}
							edgesReconnectable={false}
							onNodeClick={handleNodeClick}
							onNodeDoubleClick={handleNodeDoubleClick}
							onPaneClick={() => setSelectedNodeId(null)}
							// 隐藏右下角 React Flow 角标（库提供的官方开关）
							proOptions={{ hideAttribution: true }}
							className="pulse-topology-flow pulse-topology-readonly bg-[#0F1115]"
						>
							<Panel position="bottom-left">
								<TopologyEdgeLegend kindCounts={kindCounts} />
							</Panel>
						</ReactFlow>
					) : (
						<div className="grid h-full min-h-[34rem] place-items-center p-6 text-center">
							<div className="grid max-w-md gap-3">
								<span className="mx-auto grid size-12 place-items-center rounded-lg border border-border/70 bg-surface-soft text-muted-foreground">
									<NetworkIcon className="size-6" />
								</span>
								<div className="text-sm font-semibold text-foreground">还没有{DOMAIN_LABELS[domain]}拓扑数据</div>
								<div className="text-xs leading-5 text-muted-foreground">
									先在资产中心添加宽带、光猫、路由器或交换机，并在连接管理里建立资产关系，拓扑会自动出现。
								</div>
								<Button asChild size="sm" className="mx-auto">
									<Link href={getPagePath($router, "assets")}>去资产中心</Link>
								</Button>
							</div>
						</div>
					)}
				</section>

				<aside className="grid min-h-0 content-start pulse-card-gap overflow-y-auto rounded-lg border border-border/70 bg-card p-3">
					{selectedNode ? (
						<TopologyNodePanel
							asset={selectedNode.data.asset}
							system={selectedNode.data.system}
							presence={selectedNode.data.presence}
							interfaces={interfacesByAssetId.get(selectedNode.id) ?? []}
						/>
					) : (
						<TodoPanel
							activeAlertCount={activeAlertCount}
							assetSummary={assetSummary}
							assetSummaryHref={assetSummaryHref}
						/>
					)}
				</aside>
			</div>
		</div>
	)
}

export function HomeTopologyWorkspace(props: TopologyWorkspaceProps) {
	const [domain, setDomain] = useState<TopologyDomain>("home")
	// 首页是唯一的拓扑展示页；编辑入口统一走右上角「编辑拓扑」。
	return <TopologyWorkspace {...props} domain={domain} onDomainChange={setDomain} />
}

function TopologyNodePanel({
	asset,
	system,
	presence,
	interfaces,
}: {
	asset: AssetRecord
	system?: SystemRecord
	presence?: AssetPresenceRecord
	interfaces: AssetInterfaceRecord[]
}) {
	const Icon = getAssetIcon(asset.type)
	const ip =
		asset.type === "internet"
			? getMetadataString(asset.metadata, "public_ipv4") || "未获取 IP"
			: asset.management_ip || interfaces.find((item) => item.ipv4)?.ipv4 || "未填写 IP"
	const isInternet = asset.type === "internet"
	const bandwidth = isInternet ? formatTopologyInternetBandwidth(asset) : ""
	const publicAddress =
		getMetadataString(asset.metadata, "public_ipv6") || getMetadataString(asset.metadata, "public_ipv4")
	const packageName = getMetadataString(asset.metadata, "package_name")
	return (
		<div className="grid gap-3">
			<header className="flex min-w-0 items-start gap-2">
				<span className="grid size-9 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft text-muted-foreground">
					<Icon className="size-4" />
				</span>
				<div className="min-w-0 flex-1">
					<div className="truncate text-sm font-semibold">{asset.name}</div>
					<div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
						<span>{isInternet ? "宽带接入" : getAssetTypeLabel(asset.type)}</span>
						<span>·</span>
						<span
							className={cn(
								(system?.status === "up" || presence?.status === "online") &&
									"font-medium text-emerald-600 dark:text-emerald-400",
								(system?.status === "down" || presence?.status === "offline") &&
									"font-medium text-red-600 dark:text-red-400"
							)}
						>
							{system?.status === "up"
								? "在线（Agent 心跳）"
								: system?.status === "down"
									? "离线（Agent 心跳丢失）"
									: system?.status === "paused"
										? "监控已暂停"
										: presence?.status === "online"
											? `在线（网络探测${typeof presence.latency_ms === "number" ? ` · ${presence.latency_ms} ms` : ""}）`
											: presence?.status === "offline"
												? "离线（探测无响应）"
												: isInternet
													? "宽带接入（不参与在线探测）"
													: asset.type === "phone"
														? "手机（不参与在线探测）"
														: "未接入监控（无法判断在线状态）"}
						</span>
						{presence?.last_seen ? (
							<>
								<span>·</span>
								<span>
									最近在线 {new Date(presence.last_seen.replace(" ", "T")).toLocaleString("zh-CN", { hour12: false })}
								</span>
							</>
						) : null}
					</div>
				</div>
				<Badge variant="outline" className="shrink-0 px-1.5 text-[10px]">
					{isInternet ? "接入" : asset.location || "未填位置"}
				</Badge>
			</header>

			<div className="grid gap-1.5 text-xs">
				<InfoRow label="IP" value={ip} mono />
				{isInternet ? (
					<>
						<InfoRow label="运营商" value={asset.vendor || "未填写"} />
						<InfoRow label="带宽" value={bandwidth || "未填写"} />
						{publicAddress && publicAddress !== ip ? <InfoRow label="公网地址" value={publicAddress} mono /> : null}
						{packageName ? <InfoRow label="套餐" value={packageName} /> : null}
					</>
				) : (
					<>
						<InfoRow label="位置" value={asset.location || "未填写"} />
						<InfoRow label="用途" value={asset.role || "未填写"} />
						<InfoRow label="接口" value={`${interfaces.length} 个`} />
					</>
				)}
			</div>

			{system ? (
				<div className="grid grid-cols-2 gap-1.5 border-t border-border/70 pt-2 text-[11px] text-muted-foreground">
					<InfoRow label="CPU" value={getSystemMetricDisplay(system, "cpu").value} compact />
					<InfoRow label="内存" value={getSystemMetricDisplay(system, "mp").value} compact />
					<InfoRow label="磁盘" value={getSystemMetricDisplay(system, "dp").value} compact />
					<InfoRow label="网络" value={getSystemNetworkDisplay(system, Unit.Bytes).value} compact />
				</div>
			) : null}

			<div className="grid gap-2 border-t border-border/70 pt-2">
				<Button asChild variant="outline" size="sm" className="h-8">
					<Link href={getPagePath($router, "asset", { id: asset.id })}>查看详情</Link>
				</Button>
			</div>
		</div>
	)
}

function TodoPanel({
	activeAlertCount,
	assetSummary,
	assetSummaryHref,
}: {
	activeAlertCount: number
	assetSummary: AssetSummary
	assetSummaryHref: string
}) {
	return (
		<div className="grid gap-3">
			<div>
				<div className="text-sm font-semibold">待处理事项</div>
				<div className="mt-1 text-xs text-muted-foreground">点选拓扑节点查看设备详情</div>
			</div>
			<div className="grid gap-2">
				<TodoRow
					tone={activeAlertCount > 0 ? "danger" : "ok"}
					label={activeAlertCount > 0 ? `${activeAlertCount} 条未恢复告警` : "暂无未恢复告警"}
					href={getPagePath($router, "alerts")}
				/>
				<TodoRow
					tone={assetSummary.looseLocationAssets > 0 ? "warning" : "ok"}
					label={
						assetSummary.looseLocationAssets > 0 ? `${assetSummary.looseLocationAssets} 条资产待归档` : "资产位置已归档"
					}
					href={assetSummaryHref}
				/>
				<TodoRow
					tone={assetSummary.manual > 0 ? "warning" : "ok"}
					label={assetSummary.manual > 0 ? `${assetSummary.manual} 个资产未接入监控` : "全部资产已接入监控"}
					href={`${getPagePath($router, "assets")}?monitor=unmonitored`}
				/>
			</div>
			<div className="rounded-md border border-border/70 bg-surface-soft p-2.5 text-xs text-muted-foreground">
				资产总数 <strong className="text-foreground">{assetSummary.total}</strong> · 已监控{" "}
				<strong className="text-foreground">{assetSummary.monitored}</strong>
			</div>
		</div>
	)
}

function TodoRow({ tone, label, href }: { tone: "danger" | "warning" | "ok"; label: string; href: string }) {
	return (
		<Link
			href={href}
			className="flex min-w-0 items-center gap-2 rounded-md border border-border/70 bg-surface-soft px-2.5 py-2 text-xs transition-colors hover:bg-card"
		>
			<span
				className={
					tone === "danger"
						? "size-2 shrink-0 rounded-full bg-red-500"
						: tone === "warning"
							? "size-2 shrink-0 rounded-full bg-amber-500"
							: "size-2 shrink-0 rounded-full bg-emerald-500"
				}
			/>
			<span className="min-w-0 flex-1 truncate">{label}</span>
			<ArrowRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
		</Link>
	)
}

function InfoRow({
	label,
	value,
	mono = false,
	compact = false,
}: {
	label: string
	value: string
	mono?: boolean
	compact?: boolean
}) {
	return (
		<div
			className={
				compact
					? "rounded border border-border/60 bg-surface-soft px-2 py-1"
					: "flex items-center justify-between gap-2"
			}
		>
			<span className="text-muted-foreground">{label}</span>
			<span className={mono ? "truncate font-mono tabular-nums text-foreground" : "truncate text-foreground"}>
				{value}
			</span>
		</div>
	)
}

export default HomeTopologyWorkspace
