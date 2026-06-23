import { useSyncExternalStore, type ComponentType, type ReactNode } from "react"
import { AlertTriangleIcon, CheckCircle2Icon, CircleIcon, InfoIcon, LoaderCircleIcon, XCircleIcon } from "lucide-react"
import { Link } from "@/components/router"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

export type MobileLayoutKind = "phone" | "tabletPortrait" | "desktop"
export type MobileStatusTone = "neutral" | "success" | "warning" | "danger" | "info"

type MobileViewportSnapshot = {
	width: number
	height: number
	screenWidth: number
	screenHeight: number
	devicePixelRatio: number
	coarsePointer: boolean
}

const mobileViewportListeners = new Set<() => void>()
let activeMobileViewportSubscribers = 0
let currentMobileViewportSnapshot = readMobileViewportSnapshot()

export function getMobileLayoutKind(input: number | MobileViewportSnapshot): MobileLayoutKind {
	const snapshot = typeof input === "number" ? null : input
	const width = typeof input === "number" ? input : input.width

	if (snapshot && isHighResolutionPhoneLike(snapshot)) {
		return width >= 768 ? "tabletPortrait" : "phone"
	}

	if (width >= 1024) {
		return "desktop"
	}
	if (width >= 768) {
		return "tabletPortrait"
	}
	return "phone"
}

export function useMobileLayout() {
	const viewport = useSyncExternalStore(
		subscribeMobileViewport,
		getMobileViewportSnapshot,
		getDefaultMobileViewportSnapshot
	)
	const kind = getMobileLayoutKind(viewport)
	return {
		kind,
		isMobile: kind !== "desktop",
		isPhone: kind === "phone",
		isTabletPortrait: kind === "tabletPortrait",
	}
}

function subscribeMobileViewport(listener: () => void) {
	mobileViewportListeners.add(listener)
	activeMobileViewportSubscribers += 1

	if (activeMobileViewportSubscribers === 1 && typeof window !== "undefined") {
		updateMobileViewportSnapshot()
		window.addEventListener("resize", updateMobileViewportSnapshot)
		window.addEventListener("orientationchange", updateMobileViewportSnapshot)
		window.visualViewport?.addEventListener("resize", updateMobileViewportSnapshot)
	}

	return () => {
		mobileViewportListeners.delete(listener)
		activeMobileViewportSubscribers -= 1

		if (activeMobileViewportSubscribers === 0 && typeof window !== "undefined") {
			window.removeEventListener("resize", updateMobileViewportSnapshot)
			window.removeEventListener("orientationchange", updateMobileViewportSnapshot)
			window.visualViewport?.removeEventListener("resize", updateMobileViewportSnapshot)
		}
	}
}

function getMobileViewportSnapshot() {
	return currentMobileViewportSnapshot
}

function updateMobileViewportSnapshot() {
	const nextSnapshot = readMobileViewportSnapshot()
	if (isSameMobileViewportSnapshot(currentMobileViewportSnapshot, nextSnapshot)) {
		return
	}
	currentMobileViewportSnapshot = nextSnapshot
	for (const listener of mobileViewportListeners) {
		listener()
	}
}

function isSameMobileViewportSnapshot(a: MobileViewportSnapshot, b: MobileViewportSnapshot) {
	return (
		a.width === b.width &&
		a.height === b.height &&
		a.screenWidth === b.screenWidth &&
		a.screenHeight === b.screenHeight &&
		a.devicePixelRatio === b.devicePixelRatio &&
		a.coarsePointer === b.coarsePointer
	)
}

export function MobilePageShell({
	title,
	subtitle,
	action,
	children,
	className,
	contentClassName,
}: {
	title: ReactNode
	subtitle?: ReactNode
	action?: ReactNode
	children: ReactNode
	className?: string
	contentClassName?: string
}) {
	return (
		<div className={cn("grid min-w-0 gap-3 overflow-x-clip", className)}>
			<MobileTopBar title={title} subtitle={subtitle} action={action} />
			<div className={cn("grid min-w-0 gap-3", contentClassName)}>{children}</div>
		</div>
	)
}

function readMobileViewportSnapshot(): MobileViewportSnapshot {
	if (typeof window === "undefined") {
		return getDefaultMobileViewportSnapshot()
	}

	return {
		width: window.innerWidth,
		height: window.innerHeight,
		screenWidth: window.screen.width || window.innerWidth,
		screenHeight: window.screen.height || window.innerHeight,
		devicePixelRatio: window.devicePixelRatio || 1,
		coarsePointer: window.matchMedia("(pointer: coarse)").matches,
	}
}

function getDefaultMobileViewportSnapshot(): MobileViewportSnapshot {
	return {
		width: 1024,
		height: 768,
		screenWidth: 1024,
		screenHeight: 768,
		devicePixelRatio: 1,
		coarsePointer: false,
	}
}

function isHighResolutionPhoneLike(viewport: MobileViewportSnapshot) {
	if (!viewport.coarsePointer) {
		return false
	}
	const physicalShortSide = Math.min(viewport.screenWidth, viewport.screenHeight) * viewport.devicePixelRatio
	const physicalLongSide = Math.max(viewport.screenWidth, viewport.screenHeight) * viewport.devicePixelRatio
	return physicalShortSide >= 900 && physicalShortSide <= 1200 && physicalLongSide <= 2600
}

export function MobileTopBar({
	title,
	subtitle,
	action,
}: {
	title: ReactNode
	subtitle?: ReactNode
	action?: ReactNode
}) {
	return (
		<header className="pulse-mobile-topbar sticky z-30 -mx-3 border-b border-border/70 bg-card px-3 pb-2.5 pt-2.5 shadow-none sm:-mx-4 sm:px-4 lg:static lg:pt-2.5">
			<div className="flex min-w-0 items-center justify-between gap-3">
				<div className="min-w-0">
					<h1 className="truncate text-[1.15rem] font-semibold leading-tight tracking-normal">{title}</h1>
					{subtitle && <div className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</div>}
				</div>
				{action && <div className="shrink-0">{action}</div>}
			</div>
		</header>
	)
}

export function MobileSection({
	title,
	count,
	action,
	children,
	className,
}: {
	title: ReactNode
	count?: ReactNode
	action?: ReactNode
	children: ReactNode
	className?: string
}) {
	return (
		<section className={cn("grid min-w-0 gap-2.5", className)}>
			<div className="flex min-w-0 items-center justify-between gap-3 px-0.5">
				<div className="flex min-w-0 items-baseline gap-2">
					<h2 className="truncate text-sm font-semibold">{title}</h2>
					{count !== undefined && <span className="text-[11px] text-muted-foreground">{count}</span>}
				</div>
				{action}
			</div>
			{children}
		</section>
	)
}

export function MobileList({ children, className }: { children: ReactNode; className?: string }) {
	return <div className={cn("grid min-w-0 gap-2 sm:grid-cols-2 lg:block", className)}>{children}</div>
}

export function MobileListItem({
	href,
	onClick,
	children,
	className,
}: {
	href?: string
	onClick?: () => void
	children: ReactNode
	className?: string
}) {
	const baseClass = cn(
		"block min-w-0 rounded-lg border border-border/70 bg-card px-3 py-3 text-left shadow-none",
		className
	)
	const interactiveClass = cn(
		baseClass,
		"transition-[background-color,border-color,transform] duration-150 ease-out hover:border-foreground/15 hover:bg-surface-soft active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
	)
	if (href) {
		return (
			<Link href={href} className={interactiveClass}>
				{children}
			</Link>
		)
	}
	if (!onClick) {
		return <div className={baseClass}>{children}</div>
	}
	return (
		<button type="button" className={cn(interactiveClass, "w-full")} onClick={onClick}>
			{children}
		</button>
	)
}

export function MobileStatusTag({
	tone = "neutral",
	children,
	className,
}: {
	tone?: MobileStatusTone
	children: ReactNode
	className?: string
}) {
	const Icon = statusIconMap[tone]
	return (
		<span
			className={cn(
				"inline-flex h-6 max-w-full shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] font-medium leading-none",
				statusToneClassName(tone),
				className
			)}
		>
			<Icon className="size-3" />
			<span className="truncate">{children}</span>
		</span>
	)
}

export function MobileMetricRow({
	items,
	className,
}: {
	items: Array<{ label: string; value: ReactNode; tone?: MobileStatusTone; progress?: number }>
	className?: string
}) {
	return (
		<div className={cn("grid min-w-0 gap-2", className)}>
			{items.map((item) => (
				<div key={item.label} className="grid min-w-0 gap-1">
					<div className="flex min-w-0 items-center justify-between gap-2 text-xs">
						<span className="text-muted-foreground">{item.label}</span>
						<span className={cn("truncate font-semibold tabular-nums", metricToneClassName(item.tone))}>
							{item.value}
						</span>
					</div>
					{typeof item.progress === "number" && (
						<div className="h-1.5 overflow-hidden rounded-full bg-surface-strong">
							<div
								className={cn("h-full rounded-full", progressToneClassName(item.tone))}
								style={{ width: `${Math.max(0, Math.min(100, item.progress))}%` }}
							/>
						</div>
					)}
				</div>
			))}
		</div>
	)
}

export function MobileSummaryStrip({
	items,
	className,
}: {
	items: Array<{
		label: string
		value: ReactNode
		tone?: MobileStatusTone
		icon?: ComponentType<{ className?: string }>
	}>
	className?: string
}) {
	return (
		<div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-3", className)}>
			{items.map((item) => {
				const Icon = item.icon
				return (
					<div key={item.label} className="min-w-0 rounded-lg border border-border/70 bg-card px-3 py-2.5 shadow-none">
						<div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
							{Icon && <Icon className="size-3.5 shrink-0" />}
							<span className="truncate">{item.label}</span>
						</div>
						<div className={cn("mt-1 truncate text-base font-semibold tabular-nums", metricToneClassName(item.tone))}>
							{item.value}
						</div>
					</div>
				)
			})}
		</div>
	)
}

export function MobileFactGrid({
	items,
	className,
}: {
	items: Array<{ label: string; value: ReactNode; tone?: MobileStatusTone }>
	className?: string
}) {
	return (
		<div className={cn("grid grid-cols-2 gap-2", className)}>
			{items.map((item) => (
				<div key={item.label} className="min-w-0 rounded-lg border border-border/70 bg-card px-3 py-2.5 shadow-none">
					<div className="truncate text-[11px] text-muted-foreground">{item.label}</div>
					<div className={cn("mt-1 truncate text-xs font-semibold tabular-nums", metricToneClassName(item.tone))}>
						{item.value}
					</div>
				</div>
			))}
		</div>
	)
}

export function MobileEmptyState({
	children,
	className,
	loading = false,
}: {
	children: ReactNode
	className?: string
	loading?: boolean
}) {
	return (
		<div
			className={cn(
				"flex min-h-24 items-center gap-3 rounded-lg border border-border/70 bg-card px-3 py-5 text-sm text-muted-foreground shadow-none",
				className
			)}
		>
			<span className="grid size-8 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft">
				{loading ? <LoaderCircleIcon className="size-4 animate-spin" /> : <InfoIcon className="size-4" />}
			</span>
			<span className="min-w-0 leading-relaxed">{children}</span>
		</div>
	)
}

export function MobileActionSheet({
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
	onConfirm,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	title: ReactNode
	description?: ReactNode
	children?: ReactNode
	cancelLabel?: string
	confirmLabel?: string
	confirmVariant?: "default" | "destructive"
	confirmDisabled?: boolean
	running?: boolean
	onConfirm: () => void
}) {
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="bottom"
				className="max-h-[82dvh] rounded-t-2xl px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4"
			>
				<SheetHeader className="text-left">
					<SheetTitle>{title}</SheetTitle>
					{description && <SheetDescription>{description}</SheetDescription>}
				</SheetHeader>
				{children && <div className="mt-4 grid gap-3 text-sm">{children}</div>}
				<SheetFooter className="mt-5 grid grid-cols-2 gap-2 sm:flex">
					<Button variant="outline" disabled={running} onClick={() => onOpenChange(false)}>
						{cancelLabel}
					</Button>
					<Button variant={confirmVariant} disabled={confirmDisabled || running} onClick={onConfirm}>
						{running ? "执行中" : confirmLabel}
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	)
}

function statusToneClassName(tone: MobileStatusTone) {
	if (tone === "success") {
		return "border-emerald-500/25 bg-card text-emerald-700 dark:text-emerald-300"
	}
	if (tone === "warning") {
		return "border-amber-500/28 bg-card text-amber-700 dark:text-amber-300"
	}
	if (tone === "danger") {
		return "border-red-500/25 bg-card text-red-700 dark:text-red-300"
	}
	if (tone === "info") {
		return "border-sky-500/25 bg-card text-sky-700 dark:text-sky-300"
	}
	return "border-border/70 bg-surface-soft text-muted-foreground"
}

function metricToneClassName(tone?: MobileStatusTone) {
	if (tone === "success") return "text-emerald-700 dark:text-emerald-300"
	if (tone === "warning") return "text-amber-700 dark:text-amber-300"
	if (tone === "danger") return "text-red-700 dark:text-red-300"
	if (tone === "info") return "text-sky-700 dark:text-sky-300"
	return "text-foreground"
}

function progressToneClassName(tone?: MobileStatusTone) {
	if (tone === "success") return "bg-emerald-500"
	if (tone === "warning") return "bg-amber-500"
	if (tone === "danger") return "bg-red-500"
	if (tone === "info") return "bg-sky-500"
	return "bg-primary"
}

const statusIconMap: Record<MobileStatusTone, ComponentType<{ className?: string }>> = {
	neutral: CircleIcon,
	success: CheckCircle2Icon,
	warning: AlertTriangleIcon,
	danger: XCircleIcon,
	info: InfoIcon,
}
