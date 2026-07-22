import { Redo2Icon, SaveIcon, Undo2Icon, WandSparklesIcon } from "lucide-react"
import { getPagePath } from "@nanostores/router"
import { Button } from "../../../components/ui/button.tsx"
import { Tooltip, TooltipContent, TooltipTrigger } from "../../../components/ui/tooltip.tsx"
import { $router, Link } from "../../../components/router.tsx"
import { cn } from "../../../lib/utils.ts"
import type { TopologyDomain } from "../topology-domain.ts"

export type TopologyWorkspaceToolbarProps = {
	domain: TopologyDomain
	stats: { devices: number; links: number; ports: number; wireless: number }
	dirty: boolean
	readOnly: boolean
	canUndo: boolean
	canRedo: boolean
	onUndo(): void
	onRedo(): void
	onAutoLayout(): void
	onSave(): void
}

export function TopologyWorkspaceToolbar({
	domain,
	stats,
	dirty,
	readOnly,
	canUndo,
	canRedo,
	onUndo,
	onRedo,
	onAutoLayout,
	onSave,
}: TopologyWorkspaceToolbarProps) {
	return (
		<div className="flex min-h-12 min-w-0 flex-wrap items-center gap-2 border-b border-border bg-background px-3 py-1.5">
			<h1 className="me-1 shrink-0 text-sm font-semibold">网络拓扑</h1>
			<nav aria-label="网络拓扑页面" className="flex shrink-0 items-center gap-1 rounded-md bg-surface-soft p-0.5">
				<NetworkLink href={getPagePath($router, "network", { domain: "home" })} active={domain === "home"}>
					家庭网络
				</NetworkLink>
				<NetworkLink href={getPagePath($router, "network", { domain: "technology" })} active={domain === "technology"}>
					科技网
				</NetworkLink>
			</nav>

			<section
				aria-label="拓扑统计"
				className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden px-1 text-[11px] text-muted-foreground tabular-nums"
			>
				<Stat label="设备" value={stats.devices} />
				<Stat label="链路" value={stats.links} />
				<Stat label="网口" value={stats.ports} />
				<Stat label="无线" value={stats.wireless} />
			</section>

			<div className="ms-auto flex shrink-0 items-center gap-1">
				{dirty ? <span className="me-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">未保存</span> : null}
				<IconAction label="撤销" icon={Undo2Icon} onClick={onUndo} disabled={!canUndo || readOnly} />
				<IconAction label="重做" icon={Redo2Icon} onClick={onRedo} disabled={!canRedo || readOnly} />
				<IconAction label="自动整理" icon={WandSparklesIcon} onClick={onAutoLayout} disabled={readOnly} />
				<IconAction label="保存布局" icon={SaveIcon} onClick={onSave} disabled={!dirty || readOnly} primary />
			</div>
		</div>
	)
}

function NetworkLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
	return (
		<Button
			asChild
			variant={active ? "outline" : "ghost"}
			size="sm"
			className={cn("h-8 min-h-8 px-2.5 text-[11px]", active && "bg-card")}
		>
			<Link href={href} aria-current={active ? "page" : undefined}>
				{children}
			</Link>
		</Button>
	)
}

function Stat({ label, value }: { label: string; value: number }) {
	return (
		<span className="inline-flex shrink-0 items-baseline gap-1">
			<strong className="font-semibold text-foreground">{value}</strong>
			{label}
		</span>
	)
}

function IconAction({
	label,
	icon: Icon,
	disabled,
	onClick,
	primary,
}: {
	label: string
	icon: typeof SaveIcon
	disabled?: boolean
	onClick: () => void
	primary?: boolean
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant={primary ? "default" : "ghost"}
					size="icon"
					className="size-9 min-h-9"
					disabled={disabled}
					onClick={onClick}
					aria-label={label}
				>
					<Icon aria-hidden="true" data-icon="inline-start" />
				</Button>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	)
}
