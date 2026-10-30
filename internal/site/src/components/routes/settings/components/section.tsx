import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function SettingsSection({
	title,
	description,
	actions,
	children,
	className,
}: {
	title?: string
	description?: string
	actions?: ReactNode
	children: ReactNode
	className?: string
}) {
	return (
		<section className={cn("rounded-lg border border-border/70 bg-card p-4 shadow-none", className)}>
			{title || description || actions ? (
				<div className="flex flex-col gap-3 pb-1 sm:flex-row sm:items-start sm:justify-between">
					<div className="min-w-0">
						{title ? <h2 className="text-base font-semibold text-foreground">{title}</h2> : null}
						{description ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
					</div>
					{actions ? <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div> : null}
				</div>
			) : null}
			<div className="mt-1 grid [&>*:first-child]:border-t-0 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0">
				{children}
			</div>
		</section>
	)
}

export function SettingsSectionStack({ children, className }: { children: ReactNode; className?: string }) {
	return <div className={cn("grid pulse-card-gap", className)}>{children}</div>
}
