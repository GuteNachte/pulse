import type { WebsiteMonitorCheckRecord } from "@/types"
import { cn } from "@/lib/utils"
import { formatLatency, statusDotClass, statusLabel, statusTextClass } from "./format"
import { HeartbeatStrip } from "./heartbeat-strip"
import { IPVersionBadge } from "./status-ui"
import { compactTargetLabel, getCheckTimelineSlots, targetLabel } from "./target-utils"
import type { MonitorTargetPayload } from "./types"

export function HistoryBars({
	checks,
	compact = false,
	slotCount,
	className,
}: {
	checks: Array<WebsiteMonitorCheckRecord | undefined>
	compact?: boolean
	slotCount?: number
	className?: string
}) {
	return <HeartbeatStrip checks={checks} compact={compact} slotCount={slotCount} className={className} />
}

export function TargetHistoryBars({
	checks,
	targets,
	compact = false,
}: {
	checks: WebsiteMonitorCheckRecord[]
	targets?: MonitorTargetPayload[]
	compact?: boolean
}) {
	const slotCount = compact ? 24 : 40
	const configuredTargets = targets?.length
		? targets.map((target) => ({ key: target.id, label: target.label, ipVersion: target.ip_version }))
		: Array.from(new Set(checks.map((check) => check.target || "internal"))).map((key) => ({
				key,
				label: targetLabel(key),
				ipVersion: undefined,
			}))
	const slots = getCheckTimelineSlots(
		checks,
		slotCount,
		configuredTargets.map((target) => target.key)
	)
	const visibleTargets = configuredTargets.filter((target) => slots.some((slot) => slot[target.key]))

	if (!visibleTargets.length) {
		return <HistoryBars checks={[]} compact={compact} />
	}

	return (
		<div className={cn("grid min-w-0", compact ? "gap-2" : "gap-2")}>
			{visibleTargets.map((target) => {
				const historyChecks = slots.map((slot) => slot[target.key])
				const latestCheck = [...historyChecks]
					.reverse()
					.find((check): check is WebsiteMonitorCheckRecord => Boolean(check))
				const ipVersion = target.ipVersion || latestCheck?.ip_version

				return (
					<TargetHistoryRow
						key={target.key}
						label={target.label}
						ipVersion={ipVersion}
						latestCheck={latestCheck}
						historyChecks={historyChecks}
						slotCount={slotCount}
						compact={compact}
					/>
				)
			})}
		</div>
	)
}

function TargetHistoryRow({
	label,
	ipVersion,
	latestCheck,
	historyChecks,
	slotCount,
	compact,
}: {
	label: string
	ipVersion?: string
	latestCheck?: WebsiteMonitorCheckRecord
	historyChecks: Array<WebsiteMonitorCheckRecord | undefined>
	slotCount: number
	compact: boolean
}) {
	if (compact) {
		return (
			<div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[108px_minmax(0,1fr)] sm:items-center">
				<TargetHistoryLabel label={compactTargetLabel(label)} ipVersion={ipVersion} latestCheck={latestCheck} compact />
				<HistoryBars checks={historyChecks} compact slotCount={slotCount} />
			</div>
		)
	}

	return (
		<div className="grid min-w-0 gap-2 rounded-md border border-border/70 bg-surface-soft p-3">
			<div className="flex min-w-0 items-center justify-between gap-3">
				<TargetHistoryLabel
					label={ipVersion ? compactTargetLabel(label) : label}
					ipVersion={ipVersion}
					latestCheck={latestCheck}
				/>
				<div className="flex shrink-0 items-center gap-2 text-xs">
					<span className={cn("font-medium", statusTextClass(latestCheck?.status))}>
						{statusLabel(latestCheck?.status)}
					</span>
					<span className="tabular-nums text-muted-foreground">{formatLatency(latestCheck?.latency_ms)}</span>
				</div>
			</div>
			<HistoryBars checks={historyChecks} compact slotCount={slotCount} />
		</div>
	)
}

function TargetHistoryLabel({
	label,
	ipVersion,
	latestCheck,
	compact = false,
}: {
	label: string
	ipVersion?: string
	latestCheck?: WebsiteMonitorCheckRecord
	compact?: boolean
}) {
	return (
		<div className="grid min-w-0 content-center">
			<div className="flex min-w-0 items-center gap-1.5 leading-none">
				<span
					className={cn("shrink-0 rounded-full", compact ? "size-1.5" : "size-2", statusDotClass(latestCheck?.status))}
				/>
				<span className={cn("truncate font-medium", compact ? "text-xs" : "text-sm")}>{label}</span>
				<IPVersionBadge value={ipVersion} compact />
			</div>
			{compact && (
				<div className="mt-1 flex items-center gap-1 leading-none">
					<span className={cn("text-[11px] font-semibold tabular-nums", statusTextClass(latestCheck?.status))}>
						{formatLatency(latestCheck?.latency_ms)}
					</span>
					<span className="text-[10px] text-muted-foreground">{statusLabel(latestCheck?.status)}</span>
				</div>
			)}
		</div>
	)
}
