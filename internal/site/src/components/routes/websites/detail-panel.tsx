import { MoreHorizontalIcon, PauseIcon, RefreshCwIcon, Trash2Icon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { EmptyState } from "@/components/ui/empty-state"
import { cn } from "@/lib/utils"
import type { WebsiteMonitorCheckRecord, WebsiteMonitorRecord } from "@/types"
import { CheckLatencyChart } from "./check-latency-chart"
import {
	failureCategoryLabel,
	failureCategoryTone,
	formatMonitorFreshness,
	formatMonitorError,
	isMonitorStale,
} from "./format"
import { TargetHistoryBars } from "./history-bars"
import { SiteIcon } from "./site-icon"
import { DetailMetric, StatusBadge, StatusLegend } from "./status-ui"
import { TargetStatusCard } from "./target-status-card"
import type { MonitorTargetPayload } from "./types"

export function WebsiteDetailPanel({
	selected,
	systemName,
	targets,
	checks,
	latestChecks,
	checksLoading,
	running,
	readOnly,
	onCheck,
	onEdit,
	onToggle,
	onDelete,
}: {
	selected?: WebsiteMonitorRecord
	systemName?: string
	targets: MonitorTargetPayload[]
	checks: WebsiteMonitorCheckRecord[]
	latestChecks: Record<string, WebsiteMonitorCheckRecord>
	checksLoading?: boolean
	running: boolean
	readOnly: boolean
	onCheck: () => void
	onEdit: () => void
	onToggle: () => void
	onDelete: () => void
}) {
	if (!selected) {
		return (
			<div className="grid min-h-[520px] place-items-center p-6">
				<EmptyState
					loading={false}
					loadingText="正在读取监控项"
					emptyText="请选择一个监控项"
					description="左侧列表会展示每个网站的状态、归属机器和最近检测结果，选中后可查看地址、趋势和异常原因。"
					className="w-full max-w-sm"
				/>
			</div>
		)
	}
	const lastErrorLabel = formatMonitorError(selected.last_error)
	const lastFailureLabel = failureCategoryLabel(selected.last_failure_category)
	const stale = isMonitorStale(selected)
	const freshness = formatMonitorFreshness(selected)
	const hasIPv6Target = targets.some((target) => target.ip_version === "IPv6")
	const latestIPv6Checks = Object.values(latestChecks).filter((check) => check.ip_version === "IPv6")
	const hasIPv6Failure =
		hasIPv6Target &&
		(latestIPv6Checks.some((check) => check.status === "down") || selected.last_error?.toLowerCase().includes("ipv6"))
	const detailTargets = buildDetailTargets(targets)

	return (
		<>
			<div className="border-b border-border/70 bg-card p-4">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
					<div className="flex min-w-0 gap-3">
						<SiteIcon monitor={selected} />
						<div className="min-w-0">
							<div className="flex flex-wrap items-center gap-2">
								<h2 className="truncate text-xl font-semibold leading-tight tracking-[-0.02em]">{selected.name}</h2>
								<StatusBadge status={selected.last_status} />
								{!selected.enabled && (
									<Badge variant="outline" className="rounded-md">
										已暂停
									</Badge>
								)}
							</div>
							<div className="mt-1 line-clamp-2 text-sm text-muted-foreground">
								{selected.description || "暂无介绍"}
							</div>
						</div>
					</div>
					<div className="flex shrink-0 flex-wrap gap-2">
						<Button variant="outline" className="h-10" onClick={onCheck} disabled={running}>
							<RefreshCwIcon className={cn("me-2 size-4", running && "animate-spin")} />
							立即检测
						</Button>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="outline" size="icon" className="size-10">
									<MoreHorizontalIcon className="size-4" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								{!readOnly && (
									<>
										<DropdownMenuItem onClick={onEdit}>编辑</DropdownMenuItem>
										<DropdownMenuItem onClick={onToggle}>
											<PauseIcon className="me-2 size-4" />
											{selected.enabled ? "暂停" : "启用"}
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
			</div>
			<div className="grid min-w-0 gap-4 bg-surface-soft p-3 sm:p-4">
				<div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-6">
					<DetailMetric label="归属机器" value={systemName || "未归属"} />
					<DetailMetric label="监控地址" value={`${targets.filter((target) => target.url).length} 个`} />
					<DetailMetric label="检测间隔" value={`${Math.round((selected.interval_seconds || 300) / 60)} 分钟`} />
					<DetailMetric label="请求超时" value={`${selected.timeout_seconds || 10} 秒`} />
					<DetailMetric label="最近检测" value={freshness} />
					<DetailMetric
						label="24h 可用率"
						value={typeof selected.uptime_24h === "number" ? `${selected.uptime_24h.toFixed(1)}%` : "--"}
					/>
				</div>
				{selected.expected_content && (
					<div className="rounded-md border border-border/70 bg-card p-3 text-sm shadow-none">
						<span className="text-muted-foreground">内容校验：</span>
						<span className="font-medium">{selected.expected_content}</span>
					</div>
				)}
				{stale && (
					<div className="rounded-md border border-amber-500/28 bg-card p-3 text-sm text-amber-800 shadow-none dark:border-amber-300/18 dark:bg-card dark:text-amber-200">
						检测结果已过期：当前状态来自 {freshness}，建议执行一次立即检测后再判断服务是否正常。
					</div>
				)}
				{hasIPv6Failure && (
					<div className="rounded-md border border-sky-500/24 bg-card p-3 text-sm text-sky-800 shadow-none dark:border-sky-300/18 dark:bg-card dark:text-sky-200">
						IPv6 地址异常时，请同时确认 Hub 所在网络是否具备 IPv6 出口、DNS 是否返回 AAAA 记录，以及目标防火墙是否允许
						IPv6 访问。
					</div>
				)}
				<div className="grid min-w-0 gap-3 md:grid-cols-[repeat(2,minmax(0,1fr))]">
					{detailTargets.map((target) => (
						<TargetStatusCard key={target.id} target={target} check={latestChecks[target.id]} />
					))}
				</div>
				<div className="min-w-0 rounded-lg border border-border/70 bg-card p-3 shadow-none">
					<div className="mb-3 flex items-center justify-between gap-3">
						<div>
							<div className="font-semibold tracking-[-0.01em]">检测状态条</div>
						</div>
						<StatusLegend />
					</div>
					{checksLoading ? (
						<EmptyState
							loading
							loadingText="正在加载检测历史"
							emptyText="暂无检测历史"
							className="min-h-20 border-0 bg-surface-soft"
						/>
					) : (
						<TargetHistoryBars checks={checks} targets={targets} />
					)}
				</div>
				{checksLoading ? (
					<EmptyState
						loading
						loadingText="正在加载响应趋势"
						emptyText="暂无检测记录"
						className="min-h-48 bg-surface-soft"
					/>
				) : (
					<CheckLatencyChart checks={checks} targets={targets} />
				)}
				{lastErrorLabel && (
					<div
						className="flex flex-wrap items-start gap-2 rounded-md border border-destructive/30 bg-card p-3 text-sm text-destructive shadow-none"
						title={selected.last_error}
					>
						<span>最近异常：</span>
						{lastFailureLabel && (
							<Badge variant={failureCategoryTone(selected.last_failure_category)} className="h-5 px-1.5 text-[10px]">
								{lastFailureLabel}
							</Badge>
						)}
						<span className="min-w-0 flex-1">{lastErrorLabel}</span>
					</div>
				)}
			</div>
		</>
	)
}

function buildDetailTargets(targets: MonitorTargetPayload[]) {
	const hasExternalTarget = targets.some((target) => target.scope === "external" || target.id.startsWith("external"))
	if (hasExternalTarget) {
		return targets
	}
	return [
		...targets,
		{
			id: "external-ipv4",
			label: "外网 IPv4",
			url: "",
			scope: "external" as const,
			ip_version: "IPv4" as const,
		},
	]
}
