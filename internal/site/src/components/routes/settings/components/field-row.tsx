import type { ReactNode } from "react"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

export function SettingsField({
	label,
	description,
	htmlFor,
	error,
	children,
	className,
}: {
	label: string
	description?: ReactNode
	htmlFor?: string
	error?: string
	children: ReactNode
	className?: string
}) {
	return (
		<div className={cn("grid min-w-0 content-start gap-2", className)}>
			<div className="min-w-0">
				<Label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
					{label}
				</Label>
				{description ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
			</div>
			<div className="min-w-0">
				{children}
				{error ? (
					<p className="mt-1.5 text-xs text-destructive" role="alert">
						{error}
					</p>
				) : null}
			</div>
		</div>
	)
}

export function SettingsFieldRow({
	label,
	description,
	htmlFor,
	error,
	children,
	className,
}: {
	label: string
	description?: string
	htmlFor?: string
	error?: string
	children: ReactNode
	className?: string
}) {
	return (
		<div
			className={cn(
				"grid gap-2 border-t border-border/70 py-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start lg:gap-6",
				className
			)}
		>
			<div className="min-w-0">
				<Label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
					{label}
				</Label>
				{description ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
			</div>
			<div className="min-w-0">
				{children}
				{error ? (
					<p className="mt-1.5 text-xs text-destructive" role="alert">
						{error}
					</p>
				) : null}
			</div>
		</div>
	)
}
