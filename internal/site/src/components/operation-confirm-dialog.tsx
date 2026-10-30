import { AlertTriangleIcon, InfoIcon, LoaderCircleIcon } from "lucide-react"
import type { ReactNode } from "react"
import { MobileActionSheet, useMobileLayout } from "@/components/mobile/mobile-ui"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { offlineReadOnlyMessage, useOnlineState } from "@/lib/network-state"
import { cn } from "@/lib/utils"

export type OperationConfirmVariant = "default" | "destructive"

type OperationConfirmDialogProps = {
	open: boolean
	onOpenChange: (open: boolean) => void
	title: ReactNode
	description?: ReactNode
	children?: ReactNode
	cancelLabel?: string
	confirmLabel?: string
	confirmVariant?: OperationConfirmVariant
	confirmDisabled?: boolean
	running?: boolean
	progressTitle?: ReactNode
	progressDescription?: ReactNode
	onConfirm: () => void | Promise<void>
}

export function OperationConfirmDialog({
	open,
	onOpenChange,
	title,
	description,
	children,
	cancelLabel = "取消",
	confirmLabel = "确认",
	confirmVariant = "default",
	confirmDisabled,
	running,
	progressTitle,
	progressDescription,
	onConfirm,
}: OperationConfirmDialogProps) {
	const { isMobile } = useMobileLayout()
	const online = useOnlineState()
	const offlineBlocked = !online
	const effectiveConfirmDisabled = confirmDisabled || offlineBlocked
	const confirm = () => {
		if (offlineBlocked) {
			return
		}
		Promise.resolve(onConfirm()).catch((error) => console.error(error))
	}
	const progress =
		running && progressTitle ? <OperationProgress title={progressTitle} description={progressDescription} /> : null
	const offlineNotice = offlineBlocked ? <OperationOfflineNotice /> : null

	if (isMobile) {
		return (
			<MobileActionSheet
				open={open}
				onOpenChange={onOpenChange}
				title={title}
				description={description}
				cancelLabel={cancelLabel}
				confirmLabel={offlineBlocked ? "离线不可操作" : confirmLabel}
				confirmVariant={confirmVariant}
				confirmDisabled={effectiveConfirmDisabled}
				running={running}
				onConfirm={confirm}
			>
				{children}
				{offlineNotice}
				{progress}
			</MobileActionSheet>
		)
	}

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="max-h-[calc(100dvh-2rem)] max-w-[30rem] overflow-y-auto rounded-lg border-border/70 bg-card p-0 shadow-none">
				<AlertDialogHeader className="border-b border-border/70 px-5 py-4">
					<div className="flex items-start gap-3">
						<div
							className={cn(
								"mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border text-sm font-semibold",
								confirmVariant === "destructive"
									? "border-destructive/30 bg-card text-destructive"
									: "border-border/70 bg-surface-soft text-foreground"
							)}
							aria-hidden="true"
						>
							{confirmVariant === "destructive" ? (
								<AlertTriangleIcon className="size-4" />
							) : (
								<InfoIcon className="size-4" />
							)}
						</div>
						<AlertDialogTitle className="min-w-0 text-lg font-semibold leading-tight">{title}</AlertDialogTitle>
					</div>
					{(description || children || offlineNotice || progress) && (
						<AlertDialogDescription asChild>
							<div className="mt-4 space-y-3 text-sm">
								{description && <div className="leading-relaxed text-muted-foreground">{description}</div>}
								{children && (
									<div className="grid gap-2 rounded-lg border border-border/70 bg-card p-3 text-foreground shadow-none">
										<div className="text-xs font-medium text-muted-foreground">目标对象</div>
										<div className="min-w-0">{children}</div>
									</div>
								)}
								{offlineNotice}
								{progress}
							</div>
						</AlertDialogDescription>
					)}
				</AlertDialogHeader>
				<AlertDialogFooter className="gap-2 border-t border-border/70 bg-surface-soft px-5 py-4 sm:justify-end">
					<AlertDialogCancel className="mt-0 border-border/70 bg-card" disabled={running}>
						{cancelLabel}
					</AlertDialogCancel>
					<AlertDialogAction
						disabled={effectiveConfirmDisabled || running}
						className={cn(
							"bg-primary text-primary-foreground hover:bg-primary/90",
							confirmVariant === "destructive" && "bg-destructive text-destructive-foreground hover:bg-destructive/90"
						)}
						onClick={(event) => {
							event.preventDefault()
							confirm()
						}}
					>
						{running ? "执行中" : offlineBlocked ? "离线不可操作" : confirmLabel}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}

function OperationOfflineNotice() {
	return (
		<div className="rounded-lg border border-border/70 bg-card p-3 text-sm text-muted-foreground shadow-none">
			<div className="font-medium text-foreground">离线只读</div>
			<div className="mt-1 leading-relaxed">{offlineReadOnlyMessage}</div>
		</div>
	)
}

function OperationProgress({ title, description }: { title: ReactNode; description?: ReactNode }) {
	return (
		<div className="rounded-lg border border-border/70 bg-card p-3 shadow-none">
			<div className="flex items-center justify-between gap-3">
				<div className="min-w-0">
					<div className="text-sm font-medium text-foreground">{title}</div>
					{description && <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>}
				</div>
				<LoaderCircleIcon className="size-4 shrink-0 animate-spin text-primary" />
			</div>
			<div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-soft">
				<div className="operation-progress-bar h-full w-1/3 rounded-full bg-primary" />
			</div>
		</div>
	)
}
