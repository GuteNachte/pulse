import { ArrowDownIcon, ArrowUpIcon, CableIcon, NetworkIcon, WaypointsIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { Badge, type BadgeProps } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type {
	NetworkConnectionState,
	NetworkDetailStatusTone,
	NetworkDeviceDetailModel,
	NetworkInterfaceRow,
	NetworkInterfaceState,
	NetworkRelationDirection,
} from "../asset-network-detail-model"

const INTERFACE_FILTER_THRESHOLD = 12

type InterfaceFilter = "all" | "connected" | "disconnected" | "disabled"

export function AssetNetworkDetailTable({
	model,
	actions,
	extraSection,
}: {
	model: NetworkDeviceDetailModel
	// 2026-10-06 连接展示定稿：编辑连接入口透传到网口状态标题行右上角
	actions?: React.ReactNode
	// 其他连接段（电源口/USB/外设等非网络连接表格），渲染在网口状态之后
	extraSection?: React.ReactNode
}) {
	const [interfaceFilter, setInterfaceFilter] = useState<InterfaceFilter>("all")
	const visibleInterfaces = useMemo(
		() => model.interfaces.filter((item) => matchesInterfaceFilter(item, interfaceFilter)),
		[interfaceFilter, model.interfaces]
	)
	const showFilter = model.interfaces.length > INTERFACE_FILTER_THRESHOLD
	const showRelations = model.interfaces.length === 0 && model.relations.length > 0
	const subtitle = model.interfaces.length > 0 ? "设备能力与真实接口状态" : "设备能力与接入关系"
	const hasContent = model.capabilitySections.length > 0 || model.interfaces.length > 0 || model.relations.length > 0
	if (!hasContent) return null

	return (
		<Card className="min-w-0 border-border/70 bg-card shadow-none">
			<CardHeader className="border-b border-border/70 px-4 py-3">
				<div className="flex min-w-0 items-center justify-between gap-3">
					<div className="flex min-w-0 items-center gap-2.5">
						<span className="grid size-8 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft text-muted-foreground">
							<NetworkIcon className="size-4" />
						</span>
						<div className="min-w-0">
							<CardTitle className="truncate text-base">网络详情</CardTitle>
							<div className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</div>
						</div>
					</div>
					<div className="hidden shrink-0 items-center gap-1.5 sm:flex">
						{model.interfaces.length > 0 ? <Badge variant="secondary">{model.interfaces.length} 个接口</Badge> : null}
						{showRelations ? <Badge variant="secondary">{model.relations.length} 条关系</Badge> : null}
						{actions}
					</div>
				</div>
			</CardHeader>
			<CardContent className="p-0">
				{model.capabilitySections.length > 0 ? (
					<div className="border-b border-border/70 px-3 py-2.5">
						{model.capabilitySections.map((section) => (
							<div key={section.id} className="mb-2.5 last:mb-0">
								<div className="text-[11px] font-semibold text-muted-foreground">{section.title}</div>
								<div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-5">
									{section.rows.map((row) => (
										<div
											key={row.label}
											className="min-w-0 rounded-md border border-border/70 bg-surface-soft px-2 py-1.5"
										>
											<div className="truncate text-[10px] text-muted-foreground">{row.label}</div>
											<div className="truncate text-xs font-medium">{row.value}</div>
										</div>
									))}
								</div>
							</div>
						))}
					</div>
				) : null}
				{model.interfaces.length > 0 ? (
					<NetworkInterfaceTable
						rows={visibleInterfaces}
						total={model.interfaces.length}
						showFilter={showFilter}
						filter={interfaceFilter}
						onFilterChange={setInterfaceFilter}
					/>
				) : null}
				{showRelations ? <NetworkRelationTable rows={model.relations} /> : null}
				{extraSection}
			</CardContent>
		</Card>
	)
}

function NetworkInterfaceTable({
	rows,
	total,
	showFilter,
	filter,
	onFilterChange,
}: {
	rows: NetworkInterfaceRow[]
	total: number
	showFilter: boolean
	filter: InterfaceFilter
	onFilterChange: (filter: InterfaceFilter) => void
}) {
	return (
		<section aria-labelledby="network-interface-title" className="min-w-0 border-t border-border/70 px-3 py-3">
			<div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
				<SectionHeading
					id="network-interface-title"
					icon={<CableIcon className="size-4" />}
					title="网口状态"
					count={`${rows.length}/${total} 个`}
				/>
				{showFilter ? (
					<Tabs value={filter} onValueChange={(value) => onFilterChange(value as InterfaceFilter)}>
						<TabsList className="min-h-8 rounded-md p-0.5">
							<TabsTrigger value="all" className="min-h-7 px-2 py-1 text-xs">
								全部
							</TabsTrigger>
							<TabsTrigger value="connected" className="min-h-7 px-2 py-1 text-xs">
								已连接
							</TabsTrigger>
							<TabsTrigger value="disconnected" className="min-h-7 px-2 py-1 text-xs">
								未连接
							</TabsTrigger>
							<TabsTrigger value="disabled" className="min-h-7 px-2 py-1 text-xs">
								未启用
							</TabsTrigger>
						</TabsList>
					</Tabs>
				) : null}
			</div>
			<div className="mt-2 overflow-hidden rounded-md border border-border/70">
				<div className="hidden md:block">
					<Table className="table-fixed text-xs">
						<TableHeader>
							<TableRow className="hover:bg-transparent">
								<TableHead className="h-8 w-[15%] px-2">接口</TableHead>
								<TableHead className="h-8 w-[9%] px-2">硬盘类型</TableHead>
								<TableHead className="h-8 w-[11%] px-2">启用状态</TableHead>
								<TableHead className="h-8 w-[13%] px-2">链路 / 连接</TableHead>
								<TableHead className="h-8 w-[10%] px-2">角色</TableHead>
								<TableHead className="h-8 w-[20%] px-2">速率 / 频段</TableHead>
								<TableHead className="h-8 px-2">对端设备</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows
								.slice()
								.sort((left, right) => Number(right.role === "上联") - Number(left.role === "上联"))
								.map((row) => (
									<TableRow key={row.id}>
										<TableCell className="break-words px-2 py-2 font-semibold">{row.name}</TableCell>
										<TableCell className="break-words px-2 py-2 text-muted-foreground">{row.medium}</TableCell>
										<TableCell className="px-2 py-2">
											<InterfaceEnabledBadge state={row.enabledState} />
										</TableCell>
										<TableCell className="px-2 py-2">
											<InterfaceConnectionBadge state={row.connectionState} />
										</TableCell>
										<TableCell className="px-2 py-2">
											<RoleBadge role={row.role} />
										</TableCell>
										<TableCell className="break-words px-2 py-2">{row.speed}</TableCell>
										<TableCell className="break-words px-2 py-2 font-mono text-[11px]">{row.ipv4 || "—"}</TableCell>
										<TableCell className="break-words px-2 py-2 font-mono text-[11px]">{row.mac || "—"}</TableCell>
										<TableCell className="break-words px-2 py-2">{row.peer}</TableCell>
									</TableRow>
								))}
						</TableBody>
					</Table>
				</div>
				<div className="grid gap-0 md:hidden">
					{rows.map((row) => (
						<div key={row.id} className="grid gap-2 border-b border-border/65 p-2.5 last:border-b-0">
							<div className="flex min-w-0 flex-wrap items-center gap-1.5">
								<div className="me-auto min-w-0 break-words text-xs font-semibold">{row.name}</div>
								<Badge variant="secondary" className="h-5 rounded-md px-1.5 text-[10px]">
									{row.medium}
								</Badge>
								<InterfaceEnabledBadge state={row.enabledState} />
								<InterfaceConnectionBadge state={row.connectionState} />
							</div>
							<div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
								<div className="col-span-2">
									<RoleBadge role={row.role} />
								</div>
								<MobileValue label="速率 / 频段" value={row.speed} />
								<MobileValue label="IPv4" value={row.ipv4 || "—"} />
								<MobileValue label="MAC" value={row.mac || "—"} />
								<div className="col-span-2">
									<MobileValue label="对端设备" value={row.peer} />
								</div>
							</div>
						</div>
					))}
				</div>
			</div>
		</section>
	)
}

function NetworkRelationTable({ rows }: { rows: NetworkDeviceDetailModel["relations"] }) {
	return (
		<section aria-labelledby="network-relation-title" className="min-w-0 border-t border-border/70 px-3 py-3">
			<SectionHeading
				id="network-relation-title"
				icon={<WaypointsIcon className="size-4" />}
				title="接入关系"
				count={`${rows.length} 条`}
			/>
			<div className="mt-2 overflow-hidden rounded-md border border-border/70">
				<div className="hidden md:block">
					<Table className="table-fixed text-xs">
						<TableHeader>
							<TableRow className="hover:bg-transparent">
								<TableHead className="h-8 w-[12%] px-2">方向</TableHead>
								<TableHead className="h-8 w-[21%] px-2">对端设备</TableHead>
								<TableHead className="h-8 w-[18%] px-2">本机接口</TableHead>
								<TableHead className="h-8 w-[18%] px-2">对端接口</TableHead>
								<TableHead className="h-8 w-[16%] px-2">链路类型</TableHead>
								<TableHead className="h-8 px-2">关系状态</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((row) => (
								<TableRow key={row.id}>
									<TableCell className="px-2 py-2">
										<DirectionBadge direction={row.direction} label={row.directionLabel} />
									</TableCell>
									<TableCell className="break-words px-2 py-2 font-semibold">{row.peerAsset}</TableCell>
									<TableCell className="break-words px-2 py-2">{row.currentInterface}</TableCell>
									<TableCell className="break-words px-2 py-2">{row.peerInterface}</TableCell>
									<TableCell className="break-words px-2 py-2 text-muted-foreground">{row.linkKind}</TableCell>
									<TableCell className="px-2 py-2">
										<StatusBadge tone={row.statusTone}>{row.status}</StatusBadge>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
				<div className="grid gap-0 md:hidden">
					{rows.map((row) => (
						<div key={row.id} className="grid gap-2 border-b border-border/65 p-2.5 last:border-b-0">
							<div className="flex min-w-0 flex-wrap items-center gap-1.5">
								<DirectionBadge direction={row.direction} label={row.directionLabel} />
								<div className="me-auto min-w-0 break-words text-xs font-semibold">{row.peerAsset}</div>
								<StatusBadge tone={row.statusTone}>{row.status}</StatusBadge>
							</div>
							<div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
								<MobileValue label="本机接口" value={row.currentInterface} />
								<MobileValue label="对端接口" value={row.peerInterface} />
								<div className="col-span-2">
									<MobileValue label="链路类型" value={row.linkKind} />
								</div>
							</div>
						</div>
					))}
				</div>
			</div>
		</section>
	)
}

function SectionHeading({
	id,
	icon,
	title,
	count,
}: {
	id: string
	icon: React.ReactNode
	title: string
	count: string
}) {
	return (
		<div className="flex min-w-0 items-center gap-2">
			<span className="text-muted-foreground">{icon}</span>
			<h3 id={id} className="text-sm font-semibold">
				{title}
			</h3>
			<span className="text-[11px] text-muted-foreground">{count}</span>
		</div>
	)
}

function InterfaceEnabledBadge({ state }: { state: NetworkInterfaceState }) {
	const display =
		state === "enabled"
			? { label: "启用", tone: "positive" as const }
			: state === "disabled"
				? { label: "未启用", tone: "neutral" as const }
				: { label: "未记录", tone: "attention" as const }
	return <StatusBadge tone={display.tone}>{display.label}</StatusBadge>
}

function InterfaceConnectionBadge({ state }: { state: NetworkConnectionState }) {
	const display =
		state === "connected"
			? { label: "已连接", tone: "positive" as const }
			: state === "disconnected"
				? { label: "未连接", tone: "neutral" as const }
				: { label: "未记录", tone: "attention" as const }
	return <StatusBadge tone={display.tone}>{display.label}</StatusBadge>
}

function DirectionBadge({ direction, label }: { direction: NetworkRelationDirection; label: string }) {
	return (
		<Badge
			variant={direction === "ambiguous" ? "warning" : direction === "uplink" ? "default" : "secondary"}
			className="h-5 rounded-md px-1.5 text-[10px]"
		>
			{label}
		</Badge>
	)
}

// 2026-10-06 连接展示定稿：上联/下联方向徽标（颜色+箭头明显区分）
function RoleBadge({ role }: { role: string }) {
	if (role === "上联") {
		return (
			<Badge variant="default" className="h-5 gap-0.5 rounded-md px-1.5 text-[10px]">
				<ArrowUpIcon className="size-3" />
				上联
			</Badge>
		)
	}
	if (role === "下联") {
		return (
			<Badge variant="secondary" className="h-5 gap-0.5 rounded-md px-1.5 text-[10px]">
				<ArrowDownIcon className="size-3" />
				下联
			</Badge>
		)
	}
	return <span className="break-words text-muted-foreground">{role || "—"}</span>
}

function StatusBadge({ tone, children }: { tone: NetworkDetailStatusTone; children: React.ReactNode }) {
	const variant: BadgeProps["variant"] =
		tone === "positive" ? "success" : tone === "attention" ? "warning" : tone === "danger" ? "danger" : "secondary"
	return (
		<Badge variant={variant} className="h-5 rounded-md px-1.5 text-[10px]">
			{children}
		</Badge>
	)
}

function MobileValue({ label, value }: { label: string; value: string }) {
	return (
		<div className="grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] gap-1.5">
			<span className="text-muted-foreground">{label}</span>
			<span className="min-w-0 break-words font-medium">{value}</span>
		</div>
	)
}

function matchesInterfaceFilter(item: NetworkInterfaceRow, filter: InterfaceFilter) {
	if (filter === "connected") return item.connectionState === "connected"
	if (filter === "disconnected") return item.connectionState === "disconnected"
	if (filter === "disabled") return item.enabledState === "disabled"
	return true
}
