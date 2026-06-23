import { CheckCircle2Icon, Clock3Icon, XCircleIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export function StatusBadge({ status }: { status?: string }) {
	if (status === "up") {
		return (
			<Badge variant="success" className="gap-1 rounded-full">
				<CheckCircle2Icon className="size-3" />
				正常
			</Badge>
		)
	}
	if (status === "down") {
		return (
			<Badge variant="danger" className="gap-1 rounded-full">
				<XCircleIcon className="size-3" />
				异常
			</Badge>
		)
	}
	return (
		<Badge variant="warning" className="gap-1 rounded-full">
			<Clock3Icon className="size-3" />
			待检测
		</Badge>
	)
}

export function StatusLegend() {
	return (
		<div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
			<StatusLegendItem className="bg-emerald-500" label="正常" />
			<StatusLegendItem className="bg-red-500" label="异常" />
			<StatusLegendItem className="bg-amber-500" label="待检测" />
		</div>
	)
}

function StatusLegendItem({ className, label }: { className: string; label: string }) {
	return (
		<span className="inline-flex items-center gap-1">
			<span className={cn("size-2 rounded-sm", className)} />
			{label}
		</span>
	)
}

export function IPVersionBadge({ value, compact = false }: { value?: string; compact?: boolean }) {
	if (!value) {
		return compact ? null : <span className="text-xs text-muted-foreground">--</span>
	}
	return (
		<span
			className={cn(
				"inline-flex items-center rounded-md border border-border/70 bg-surface-soft font-medium text-muted-foreground",
				compact ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-xs"
			)}
		>
			{value}
		</span>
	)
}

export function DetailMetric({ label, value }: { label: string; value: string | number }) {
	return (
		<div className="rounded-md border border-border/70 bg-card px-3 py-2.5 shadow-none">
			<div className="text-[11px] font-medium text-muted-foreground">{label}</div>
			<div className="mt-1 min-w-0 truncate font-semibold tabular-nums" title={String(value)}>
				{value}
			</div>
		</div>
	)
}

export function SummaryCard({
	label,
	value,
	detail,
	tone,
}: {
	label: string
	value: string | number
	detail: string
	tone?: "green" | "red"
}) {
	return (
		<div className="rounded-md border border-border/70 bg-card px-3 py-2.5 shadow-none">
			<div className="text-[11px] font-medium text-muted-foreground">{label}</div>
			<div
				className={cn(
					"mt-1 text-xl font-semibold tabular-nums",
					tone === "green" && "text-emerald-600",
					tone === "red" && "text-destructive"
				)}
			>
				{value}
			</div>
			<div className="mt-1 text-xs text-muted-foreground">{detail}</div>
		</div>
	)
}
