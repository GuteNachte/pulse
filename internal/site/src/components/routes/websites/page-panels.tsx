import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, RefreshCwIcon, SearchIcon } from "lucide-react"
import { Link } from "@/components/router"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getSystemDisplayName } from "@/lib/system-roles"
import { cn } from "@/lib/utils"
import type { SystemRecord, WebsiteMonitorRecord } from "@/types"
import { MonitorCard } from "./monitor-card"
import type { StatusFilter } from "./types"

type SystemOption = {
	id: string
	name: string
}

const statusFilterOptions: Array<{ value: StatusFilter; label: string }> = [
	{ value: "all", label: "所有" },
	{ value: "up", label: "正常" },
	{ value: "down", label: "异常" },
	{ value: "unknown", label: "待检测" },
	{ value: "stale", label: "过期" },
]

export function WebsiteMonitorListPanel({
	filteredMonitors,
	selectedId,
	systems,
	availableSystemsById,
	statusCounts,
	statusFilter,
	systemFilter,
	search,
	hasActiveFilter,
	loading,
	runningId,
	readOnly,
	hasSystems,
	waitingForSystems,
	clientsPath,
	onLoad,
	onCreate,
	onSelect,
	onCheck,
	onEdit,
	onToggle,
	onDelete,
	onSearchChange,
	onStatusFilterChange,
	onSystemFilterChange,
	page,
	pageSize,
	hasMore,
	onPageChange,
}: {
	filteredMonitors: WebsiteMonitorRecord[]
	selectedId?: string
	systems: SystemOption[]
	availableSystemsById: Record<string, SystemRecord>
	statusCounts: Record<StatusFilter, number>
	statusFilter: StatusFilter
	systemFilter: string
	search: string
	hasActiveFilter: boolean
	loading: boolean
	runningId: string
	readOnly: boolean
	hasSystems: boolean
	waitingForSystems: boolean
	clientsPath: string
	onLoad: () => void
	onCreate: () => void
	onSelect: (monitor: WebsiteMonitorRecord, openMobileDetail: boolean) => void
	onCheck: (monitor: WebsiteMonitorRecord) => void
	onEdit: (monitor: WebsiteMonitorRecord) => void
	onToggle: (monitor: WebsiteMonitorRecord) => void
	onDelete: (monitor: WebsiteMonitorRecord) => void
	onSearchChange: (value: string) => void
	onStatusFilterChange: (value: StatusFilter) => void
	onSystemFilterChange: (value: string) => void
	page: number
	pageSize: number
	hasMore: boolean
	onPageChange: (page: number) => void
}) {
	const hasRows = filteredMonitors.length > 0
	const pageStart = hasRows ? page * pageSize + 1 : 0
	const pageEnd = page * pageSize + filteredMonitors.length
	const showPagination = hasRows || hasMore || page > 0

	return (
		<aside className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border/70 bg-card shadow-none">
			<div className="border-b border-border/70 bg-surface-soft p-3">
				<div className="flex items-center justify-between gap-3">
					<div className="min-w-0">
						<div className="grid min-w-0 gap-2">
							<div className="shrink-0 text-base font-semibold tracking-[-0.01em]">监控列表</div>
							<div className="flex min-w-0 flex-wrap items-center gap-1 rounded-lg bg-surface-soft p-1 text-[11px]">
								{statusFilterOptions.map((option) => (
									<button
										key={option.value}
										type="button"
										onClick={() => onStatusFilterChange(option.value)}
										className={cn(
											"inline-flex min-h-10 items-center gap-1 rounded-md px-2.5 font-medium text-muted-foreground transition-[background-color,color,transform] hover:bg-card hover:text-foreground active:scale-[0.96]",
											statusFilter === option.value && "bg-card text-foreground ring-1 ring-border"
										)}
									>
										<span>{option.label}</span>
										<span className="tabular-nums">{statusCounts[option.value]}</span>
									</button>
								))}
							</div>
						</div>
					</div>
					<div className="flex shrink-0 items-center gap-2">
						<Button variant="outline" size="icon" className="size-10" onClick={onLoad} disabled={loading}>
							<RefreshCwIcon className={cn("size-4", loading && "animate-spin")} />
						</Button>
						<CreateMonitorButton
							readOnly={readOnly}
							hasSystems={hasSystems}
							waitingForSystems={waitingForSystems}
							clientsPath={clientsPath}
							onCreate={onCreate}
						/>
					</div>
				</div>
				<div className="mt-3 flex overflow-hidden rounded-md border border-border/70 bg-card shadow-none focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/20">
					<div className="relative min-w-0 flex-1">
						<SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={search}
							onChange={(event) => onSearchChange(event.target.value)}
							placeholder="搜索名称、地址、分组"
							className="h-10 border-0 bg-transparent pl-9 shadow-none focus-visible:ring-0"
						/>
					</div>
					<Select
						value={systemFilter || "all"}
						onValueChange={(value) => onSystemFilterChange(value === "all" ? "" : value)}
					>
						<SelectTrigger className="h-10 w-28 shrink-0 rounded-none border-0 border-l border-border/70 bg-surface-soft px-2 text-xs shadow-none focus:ring-0 focus:ring-offset-0">
							<SelectValue placeholder="全部机器" />
						</SelectTrigger>
						<SelectContent align="end">
							<SelectItem value="all">全部机器</SelectItem>
							{systems.map((system) => (
								<SelectItem key={system.id} value={system.id}>
									{system.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
			<div className="grid max-h-none min-h-0 flex-1 content-start gap-2 overflow-visible bg-card p-2 sm:grid-cols-2 lg:grid-cols-1 lg:overflow-auto">
				{filteredMonitors.length ? (
					filteredMonitors.map((monitor) => (
						<MonitorCard
							key={monitor.id}
							monitor={monitor}
							systemName={monitor.system ? getSystemDisplayName(availableSystemsById[monitor.system], "") : ""}
							selected={selectedId === monitor.id}
							running={runningId === monitor.id}
							readOnly={readOnly}
							onSelect={() => onSelect(monitor, window.matchMedia("(max-width: 1023px)").matches)}
							onCheck={() => onCheck(monitor)}
							onEdit={() => onEdit(monitor)}
							onToggle={() => onToggle(monitor)}
							onDelete={() => onDelete(monitor)}
						/>
					))
				) : (
					<EmptyMonitorList
						hasActiveFilter={hasActiveFilter}
						readOnly={readOnly}
						hasSystems={hasSystems}
						waitingForSystems={waitingForSystems}
						clientsPath={clientsPath}
						onCreate={onCreate}
					/>
				)}
			</div>
			{showPagination ? (
				<div className="flex items-center justify-between gap-3 border-t border-border/70 bg-surface-soft px-3 py-2 text-xs text-muted-foreground">
					<div className="min-w-0 truncate">
						{hasRows ? `第 ${pageStart} - ${pageEnd} 条${hasMore ? "，后面还有更多" : ""}` : "暂无数据"}
					</div>
					<div className="flex shrink-0 items-center gap-1.5">
						<Button
							variant="outline"
							size="icon"
							className="size-10"
							disabled={loading || page <= 0}
							onClick={() => onPageChange(Math.max(0, page - 1))}
						>
							<ChevronLeftIcon className="size-4" />
						</Button>
						<span className="min-w-12 text-center tabular-nums">第 {page + 1} 页</span>
						<Button
							variant="outline"
							size="icon"
							className="size-10"
							disabled={loading || !hasMore}
							onClick={() => onPageChange(page + 1)}
						>
							<ChevronRightIcon className="size-4" />
						</Button>
					</div>
				</div>
			) : null}
		</aside>
	)
}

function CreateMonitorButton({
	readOnly,
	hasSystems,
	waitingForSystems,
	clientsPath,
	onCreate,
}: {
	readOnly: boolean
	hasSystems: boolean
	waitingForSystems: boolean
	clientsPath: string
	onCreate: () => void
}) {
	if (readOnly) {
		return null
	}
	if (hasSystems) {
		return (
			<Button onClick={onCreate} className="h-10 gap-1.5 px-3">
				<PlusIcon className="size-4" />
				添加
			</Button>
		)
	}
	if (waitingForSystems) {
		return (
			<Button className="h-10 px-3" disabled>
				<RefreshCwIcon className="me-2 size-4 animate-spin" />
				读取机器...
			</Button>
		)
	}
	return (
		<Button asChild className="h-10 px-3">
			<Link href={clientsPath}>先添加机器</Link>
		</Button>
	)
}

function EmptyMonitorList({
	hasActiveFilter,
	readOnly,
	hasSystems,
	waitingForSystems,
	clientsPath,
	onCreate,
}: {
	hasActiveFilter: boolean
	readOnly: boolean
	hasSystems: boolean
	waitingForSystems: boolean
	clientsPath: string
	onCreate: () => void
}) {
	const title = hasActiveFilter ? "没有匹配结果" : "暂无网站监控"
	const description = hasActiveFilter ? "换个关键词或筛选条件再试。" : "添加第一个网页服务后会自动执行一次检测。"

	return (
		<div className="sm:col-span-2 xl:col-span-1">
			<EmptyState
				loading={false}
				loadingText="正在读取网站监控"
				emptyText={title}
				description={description}
				className="min-h-72"
			>
				{!readOnly && !hasActiveFilter && hasSystems ? (
					<CreateMonitorButton
						readOnly={readOnly}
						hasSystems={hasSystems}
						waitingForSystems={waitingForSystems}
						clientsPath={clientsPath}
						onCreate={onCreate}
					/>
				) : null}
			</EmptyState>
		</div>
	)
}
