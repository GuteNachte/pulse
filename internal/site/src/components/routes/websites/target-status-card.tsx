import { Globe2Icon, RouterIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { WebsiteMonitorCheckRecord } from "@/types"
import { failureCategoryLabel, failureCategoryTone, formatLatency, formatMonitorError, formatTime } from "./format"
import { VisitLink } from "./shared-ui"
import { IPVersionBadge, StatusBadge } from "./status-ui"
import { compactTargetLabel, isInternalTarget } from "./target-utils"
import type { MonitorTargetPayload } from "./types"

export function TargetStatusCard({
	target,
	check,
}: {
	target: MonitorTargetPayload
	check?: WebsiteMonitorCheckRecord
}) {
	const hasUrl = Boolean(target.url)
	const displayLabel = compactTargetLabel(target.label)
	const errorLabel = formatMonitorError(check?.error)
	const failureLabel = failureCategoryLabel(check?.failure_category)

	return (
		<div className="grid h-full min-h-[156px] min-w-0 grid-rows-[auto_auto_1fr] gap-3 rounded-lg border border-border/70 bg-card p-3 shadow-none">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="flex min-w-0 items-center gap-2">
						<span className="truncate font-semibold">{displayLabel}</span>
						<IPVersionBadge value={check?.ip_version || target.ip_version} compact />
					</div>
					<div className="mt-2 truncate text-xs text-muted-foreground">{target.url || "未配置"}</div>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					{failureLabel && check?.status === "down" && (
						<Badge variant={failureCategoryTone(check.failure_category)} className="h-5 rounded-md px-1.5 text-[10px]">
							{failureLabel}
						</Badge>
					)}
					{hasUrl ? (
						<StatusBadge status={check?.status} />
					) : (
						<Badge variant="outline" className="rounded-md">
							未配置
						</Badge>
					)}
				</div>
			</div>
			<div className="grid min-w-0 grid-cols-2 gap-2 text-sm">
				<TargetMetric label="响应时间" value={hasUrl ? formatLatency(check?.latency_ms) : "--"} />
				<TargetMetric label="检测时间" value={check?.created ? formatTime(check.created) : "--"} />
			</div>
			<div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
				{errorLabel ? (
					<div className="min-w-0 truncate text-xs text-destructive" title={check.error}>
						{errorLabel}
					</div>
				) : (
					<div className="min-w-0 truncate text-xs text-muted-foreground">
						{hasUrl ? "最近一次检测结果" : "地址未配置"}
					</div>
				)}
				<VisitLink
					href={target.url}
					label="访问"
					icon={isInternalTarget(target) ? <RouterIcon className="size-3.5" /> : <Globe2Icon className="size-3.5" />}
					compact
				/>
			</div>
		</div>
	)
}

function TargetMetric({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-0 rounded-md border border-border/70 bg-surface-soft px-2.5 py-2">
			<div className="text-[11px] font-medium text-muted-foreground">{label}</div>
			<div className="mt-1 font-semibold tabular-nums">{value}</div>
		</div>
	)
}
