import { MoreHorizontalIcon, PauseIcon, RefreshCwIcon, Trash2Icon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { WebsiteMonitorRecord } from "@/types"
import {
	failureCategoryLabel,
	failureCategoryTone,
	formatLatency,
	formatMonitorError,
	formatMonitorFreshness,
	isMonitorStale,
	statusDotClass,
} from "./format"
import { SiteIcon } from "./site-icon"
import { monitorTargetsFromRecord } from "./target-utils"

export function MonitorCard({
	monitor,
	systemName,
	selected,
	running,
	readOnly,
	onSelect,
	onCheck,
	onEdit,
	onToggle,
	onDelete,
}: {
	monitor: WebsiteMonitorRecord
	systemName?: string
	selected: boolean
	running: boolean
	readOnly: boolean
	onSelect: () => void
	onCheck: () => void
	onEdit: () => void
	onToggle: () => void
	onDelete: () => void
}) {
	const targets = monitorTargetsFromRecord(monitor)
	const primaryURL = targets[0]?.url || monitor.url
	const latestLatency = monitor.last_latency_ms
	const latestFailureCategory = monitor.last_failure_category
	const failureLabel = failureCategoryLabel(latestFailureCategory)
	const errorLabel = formatMonitorError(monitor.last_error)
	const stale = isMonitorStale(monitor)
	const freshness = formatMonitorFreshness(monitor)

	return (
		<div
			className={cn(
				"relative grid gap-3 rounded-lg border border-border/70 bg-card p-3 text-start shadow-none transition-[background-color,border-color,transform] duration-150 ease-out hover:border-foreground/15 hover:bg-surface-soft",
				selected && "border-primary/35 bg-surface-soft ring-1 ring-foreground/10"
			)}
		>
			<div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
				<button
					type="button"
					aria-label={`选择 ${monitor.name}`}
					onClick={onSelect}
					className="grid min-w-0 cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-2.5 rounded-md text-start focus:outline-hidden focus:ring-2 focus:ring-ring/25"
				>
					<SiteIcon monitor={monitor} />
					<div className="min-w-0">
						<div className="flex min-w-0 items-center gap-2">
							<span className={cn("size-2.5 rounded-full", statusDotClass(monitor.last_status))} />
							<div className="truncate text-sm font-semibold">{monitor.name}</div>
							{!monitor.enabled && (
								<Badge variant="outline" className="h-5 rounded-md px-1.5 text-[10px]">
									暂停
								</Badge>
							)}
						</div>
						<div className="mt-1 truncate text-xs text-muted-foreground">
							{monitor.description || primaryURL || "暂无介绍"}
						</div>
						<div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
							<span>{systemName || "未归属"}</span>
							<span>{targets.filter((target) => target.url).length} 个地址</span>
							<span className="tabular-nums">响应 {formatLatency(latestLatency)}</span>
							<span className={cn("tabular-nums", stale && "font-medium text-amber-600 dark:text-amber-300")}>
								{freshness}
							</span>
							{stale && (
								<Badge variant="warning" className="h-5 rounded-md px-1.5 text-[10px]">
									结果过期
								</Badge>
							)}
							{monitor.last_status === "down" && failureLabel && (
								<Badge
									variant={failureCategoryTone(latestFailureCategory)}
									className="h-5 rounded-md px-1.5 text-[10px]"
								>
									{failureLabel}
								</Badge>
							)}
						</div>
						{monitor.last_status === "down" && errorLabel && (
							<div className="mt-1 truncate text-[11px] text-destructive" title={monitor.last_error || errorLabel}>
								{errorLabel}
							</div>
						)}
					</div>
				</button>
				<div className="flex min-w-0 items-center justify-end gap-1">
					<Button
						variant="ghost"
						size="icon"
						className="size-10 rounded-md"
						disabled={running}
						onClick={(event) => {
							event.stopPropagation()
							onCheck()
						}}
					>
						<RefreshCwIcon className={cn("size-4", running && "animate-spin")} />
					</Button>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="size-10 rounded-md"
								onClick={(event) => event.stopPropagation()}
							>
								<MoreHorizontalIcon className="size-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							{!readOnly && (
								<>
									<DropdownMenuItem onClick={onEdit}>编辑</DropdownMenuItem>
									<DropdownMenuItem onClick={onToggle}>
										<PauseIcon className="me-2 size-4" />
										{monitor.enabled ? "暂停" : "启用"}
									</DropdownMenuItem>
									<DropdownMenuItem className="text-destructive" onClick={onDelete}>
										<Trash2Icon className="me-2 size-4" />
										删除
									</DropdownMenuItem>
								</>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>
			<div className="flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-border/70 bg-surface-soft px-2.5 py-2 text-[11px] text-muted-foreground">
				{targets.map((target) => (
					<span key={target.id} className="min-w-0 truncate rounded-md bg-card px-2 py-0.5">
						{target.label}
					</span>
				))}
				{!targets.length && <span>未配置检测地址</span>}
			</div>
		</div>
	)
}
