import { InfoIcon, LoaderCircleIcon } from "lucide-react"
import type { ReactNode } from "react"
import { TableCell, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

export function EmptyState({
	loading,
	loadingText,
	emptyText,
	description,
	className,
	children,
}: {
	loading: boolean
	loadingText: string
	emptyText: string
	description?: string
	className?: string
	children?: ReactNode
}) {
	return (
		<div
			className={cn(
				"grid min-h-24 place-items-center rounded-md border border-border/70 bg-surface-soft p-4 text-center text-sm shadow-none",
				className
			)}
		>
			<div className="grid justify-items-center gap-2">
				<span className="grid size-8 place-items-center rounded-md border border-border/70 bg-card text-muted-foreground shadow-none">
					{loading ? <LoaderCircleIcon className="size-4 animate-spin" /> : <InfoIcon className="size-4" />}
				</span>
				<span className="font-medium text-foreground">{loading ? loadingText : emptyText}</span>
				{description ? (
					<span className="max-w-sm text-xs leading-relaxed text-muted-foreground">{description}</span>
				) : null}
				{!loading && children ? <div className="mt-1 flex flex-wrap justify-center gap-2">{children}</div> : null}
			</div>
		</div>
	)
}

export function TableEmptyRow({
	colSpan,
	loading,
	loadingText,
	emptyText,
	description,
}: {
	colSpan: number
	loading: boolean
	loadingText: string
	emptyText: string
	description?: string
}) {
	return (
		<TableRow>
			<TableCell colSpan={colSpan} className="p-3">
				<EmptyState loading={loading} loadingText={loadingText} emptyText={emptyText} description={description} />
			</TableCell>
		</TableRow>
	)
}
