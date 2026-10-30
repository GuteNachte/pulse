import { ClipboardCopyIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { copyToClipboard } from "@/lib/utils"
import { cn } from "@/lib/utils"

/**
 * 日志 / 审计等只读记录共用的右侧详情抽屉：标题行带可选复制按钮，内容区统一滚动。
 */
export function SettingsDetailSheet({
	open,
	onOpenChange,
	title,
	description,
	copyText,
	children,
	className,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	title: string
	description?: ReactNode
	copyText?: string
	children: ReactNode
	className?: string
}) {
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				className={cn(
					"flex w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden rounded-lg border-border/70 bg-card p-0 sm:max-w-xl",
					className
				)}
			>
				<SheetHeader className="border-b border-border/70 bg-card px-5 py-4 pr-16">
					<SheetTitle>{title}</SheetTitle>
					{description ? <SheetDescription>{description}</SheetDescription> : null}
					{copyText ? (
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="absolute end-14 top-4 min-h-10 gap-1.5 bg-card px-3 shadow-none transition-transform active:scale-[0.96]"
							onClick={() => copyToClipboard(copyText)}
						>
							<ClipboardCopyIcon className="size-4" />
							复制
						</Button>
					) : null}
				</SheetHeader>
				<div className="grid content-start gap-3 overflow-y-auto bg-surface-soft p-3 sm:p-4">{children}</div>
			</SheetContent>
		</Sheet>
	)
}

export function SettingsDetailSection({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="grid gap-3 rounded-lg border border-border/70 bg-card p-3 shadow-none">
			<div className="text-sm font-semibold text-foreground">{title}</div>
			{children}
		</section>
	)
}

export function SettingsDetailFieldGrid({ entries }: { entries: [string, string][] }) {
	return (
		<div className="grid divide-y divide-border/70 overflow-hidden rounded-md border border-border/70">
			{entries.map(([label, value]) => (
				<div key={label} className="grid gap-1 bg-card px-3 py-2.5 sm:grid-cols-[8rem_1fr]">
					<div className="text-xs font-medium text-muted-foreground">{label}</div>
					<div className="min-w-0 break-words text-sm text-foreground">{value || "-"}</div>
				</div>
			))}
		</div>
	)
}
