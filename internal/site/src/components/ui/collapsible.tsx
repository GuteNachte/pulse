import { ChevronDownIcon } from "lucide-react"
import * as React from "react"
import { cn } from "@/lib/utils"
import { Button } from "./button"

interface CollapsibleProps {
	title: string
	children: React.ReactNode
	description?: React.ReactNode
	defaultOpen?: boolean
	className?: string
	icon?: React.ReactNode
	descriptionWhenOpenOnly?: boolean
}

export function Collapsible({
	title,
	children,
	description,
	defaultOpen = false,
	className,
	icon,
	descriptionWhenOpenOnly = false,
}: CollapsibleProps) {
	const [isOpen, setIsOpen] = React.useState(defaultOpen)

	return (
		<div className={cn("overflow-hidden rounded-lg border border-border/70 bg-card shadow-none", className)}>
			<Button
				variant="ghost"
				className="min-h-12 w-full justify-between rounded-none px-4 py-3 font-semibold hover:bg-surface-soft"
				onClick={() => setIsOpen(!isOpen)}
			>
				<div className="flex min-w-0 items-center gap-2 text-left">
					{icon}
					<span className="truncate">{title}</span>
				</div>
				<ChevronDownIcon
					className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-out", {
						"rotate-180": isOpen,
					})}
				/>
			</Button>
			{description && (!descriptionWhenOpenOnly || isOpen) && (
				<div className="border-t border-border/70 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
					{description}
				</div>
			)}
			{isOpen && (
				<div className="border-t border-border/70 bg-surface-soft px-4 py-4">
					<div className="grid gap-3">{children}</div>
				</div>
			)}
		</div>
	)
}
