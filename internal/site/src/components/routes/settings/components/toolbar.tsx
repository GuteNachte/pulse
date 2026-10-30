import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function SettingsToolbar({
	left,
	right,
	className,
}: {
	left?: ReactNode
	right?: ReactNode
	className?: string
}) {
	return (
		<div className={cn("flex flex-wrap items-center gap-2", className)}>
			{left}
			<div className="min-w-0 flex-1" />
			{right}
		</div>
	)
}
