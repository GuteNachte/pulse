import type { WebsiteMonitorCheckRecord } from "@/types"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { formatDate, formatLatency, statusBarBgClass, statusLabel } from "./format"

export function HeartbeatStrip({
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
	const count = slotCount ?? (compact ? 24 : 40)
	const items = checks.slice(-count)
	const slots = items.length ? [...new Array(Math.max(count - items.length, 0)).fill(undefined), ...items] : []

	return (
		<div
			className={cn("grid min-w-0 overflow-hidden rounded-md", compact ? "h-8" : "h-12 bg-surface-soft p-2", className)}
		>
			<div className="grid h-full min-w-0 grid-flow-col auto-cols-fr items-stretch gap-1">
				{(slots.length ? slots : Array.from({ length: count })).map((check, index) => (
					<HeartbeatSegment key={check?.id ?? `empty-${index}`} check={check} />
				))}
			</div>
		</div>
	)
}

function HeartbeatSegment({ check }: { check?: WebsiteMonitorCheckRecord }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div
					className={cn(
						"h-full min-w-0 rounded-[2px] transition-opacity hover:opacity-85",
						check ? statusBarBgClass(check.status) : "bg-surface-strong"
					)}
				/>
			</TooltipTrigger>
			<TooltipContent side="top" className="grid gap-1 text-xs">
				<div className="font-medium">{check ? statusLabel(check.status) : "待检测"}</div>
				<div className="text-muted-foreground">
					{check ? `${formatLatency(check.latency_ms)} · ${formatDate(check.created)}` : "还没有检测记录"}
				</div>
			</TooltipContent>
		</Tooltip>
	)
}
