import type { ReactNode } from "react"
import { ExternalLinkIcon } from "lucide-react"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

export function VisitLink({
	href,
	label,
	icon,
	compact = false,
}: {
	href?: string
	label: string
	icon: ReactNode
	compact?: boolean
}) {
	if (!href) {
		return null
	}
	return (
		<a
			href={href}
			target="_blank"
			rel="noreferrer"
			onClick={(event) => event.stopPropagation()}
			className={cn(
				"inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md border border-border/70 bg-card text-sm font-medium shadow-none transition-[background-color,border-color,transform] hover:border-foreground/15 hover:bg-surface-soft active:scale-[0.96]",
				compact ? "px-3 py-1.5" : "px-3 py-2"
			)}
		>
			<span className="shrink-0">{icon}</span>
			<span>{label}</span>
			<ExternalLinkIcon className="size-3.5 shrink-0 text-muted-foreground" />
		</a>
	)
}

export function FormField({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="grid gap-2">
			<Label>{label}</Label>
			{children}
		</div>
	)
}
