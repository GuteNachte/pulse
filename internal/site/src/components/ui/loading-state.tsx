import { ActivityIcon, LoaderCircleIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export function LoadingState({
	title = "正在加载",
	description,
	className,
	compact = false,
}: {
	title?: string
	description?: string
	className?: string
	compact?: boolean
}) {
	return (
		<div
			className={cn(
				"grid place-items-center rounded-lg bg-transparent p-3",
				compact ? "min-h-10" : "min-h-32",
				className
			)}
		>
			<div
				className={cn(
					"flex w-full max-w-sm items-center gap-3 rounded-md border border-border/70 bg-card text-sm shadow-none",
					compact ? "px-3 py-2" : "px-4 py-3"
				)}
			>
				<span className="relative grid size-9 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft text-muted-foreground">
					<ActivityIcon className="size-4 opacity-45" strokeWidth={1.9} />
					<LoaderCircleIcon className="absolute size-4 animate-spin text-foreground" strokeWidth={1.9} />
				</span>
				<span className="min-w-0">
					<span className="block truncate font-medium text-foreground">{title}</span>
					{description ? (
						<span className="mt-0.5 block truncate text-xs text-muted-foreground">{description}</span>
					) : null}
				</span>
			</div>
		</div>
	)
}
