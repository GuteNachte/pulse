import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function SettingsTableCard({
	children,
	footer,
	className,
}: {
	children: ReactNode
	footer?: ReactNode
	className?: string
}) {
	return (
		<div className={cn("overflow-hidden rounded-lg border border-border/70 bg-card shadow-none", className)}>
			{children}
			{footer ? (
				<div className="border-t border-border/70 px-3 py-2 text-xs text-muted-foreground">{footer}</div>
			) : null}
		</div>
	)
}
