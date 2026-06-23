import type { ReactNode } from "react"
import { SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

export function SystemDetailSheetContent({
	title,
	description,
	children,
	className,
}: {
	title: ReactNode
	description?: ReactNode
	children: ReactNode
	className?: string
}) {
	return (
		<SheetContent className={cn("w-full gap-0 overflow-y-auto bg-surface-soft p-0 sm:max-w-220", className)}>
			<SheetHeader className="border-b border-border/70 bg-card px-4 py-3 pr-14 sm:px-5">
				<SheetTitle className="text-base font-semibold tracking-normal">{title}</SheetTitle>
				{description && <SheetDescription className="text-xs">{description}</SheetDescription>}
			</SheetHeader>
			<div className="grid gap-4 p-3 sm:p-4">{children}</div>
		</SheetContent>
	)
}
