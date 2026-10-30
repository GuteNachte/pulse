import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function SettingsStatCard({
	label,
	value,
	detail,
	className,
}: {
	label: string
	value: ReactNode
	detail?: string
	className?: string
}) {
	return (
		<div className={cn("min-w-0 rounded-lg border border-border/70 bg-card p-4 shadow-none", className)}>
			<div className="text-xs text-muted-foreground">{label}</div>
			<div className="mt-1 truncate text-xl font-semibold tabular-nums text-foreground">{value}</div>
			{detail ? <div className="mt-1 truncate text-xs text-muted-foreground">{detail}</div> : null}
		</div>
	)
}

export function SettingsStatGrid({ children, className }: { children: ReactNode; className?: string }) {
	return <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-4", className)}>{children}</div>
}
