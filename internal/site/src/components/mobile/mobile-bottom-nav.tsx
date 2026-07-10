import { getPagePath } from "@nanostores/router"
import { useStore } from "@nanostores/react"
import { BellIcon, ContainerIcon, Globe2Icon, HomeIcon, MonitorIcon } from "lucide-react"
import type { ComponentType } from "react"
import { $router, Link } from "@/components/router"
import { cn } from "@/lib/utils"
import { $moduleSettings } from "@/modules/module-state"
import type { PulseModuleId } from "@/modules/types"
import { useMobileLayout } from "./mobile-ui"

const items = [
	{ route: "home", label: "首页", icon: HomeIcon, href: getPagePath($router, "home") },
	{
		route: "clients",
		label: "机器",
		icon: MonitorIcon,
		href: getPagePath($router, "clients"),
		moduleId: "client-monitoring",
	},
	{ route: "alerts", label: "告警", icon: BellIcon, href: getPagePath($router, "alerts"), moduleId: "alerts" },
	{
		route: "websites",
		label: "网站",
		icon: Globe2Icon,
		href: getPagePath($router, "websites"),
		moduleId: "website-monitoring",
	},
	{
		route: "containers",
		label: "容器",
		icon: ContainerIcon,
		href: getPagePath($router, "containers"),
		moduleId: "client-monitoring",
	},
] as const

export function MobileBottomNav({ activeRoute }: { activeRoute?: string }) {
	const { isMobile } = useMobileLayout()
	const moduleSettings = useStore($moduleSettings)
	if (!isMobile) {
		return null
	}
	const visibleItems = items.filter((item) => {
		const moduleId = "moduleId" in item ? (item.moduleId as PulseModuleId) : undefined
		return !moduleId || moduleSettings[moduleId]?.effectiveEnabled !== false
	})

	return (
		<nav className="pulse-mobile-bottom-nav fixed inset-x-0 bottom-0 z-50 border-t border-border/70 bg-card px-2 pt-1.5 shadow-none">
			<div
				className="mx-auto grid max-w-3xl gap-0.5"
				style={{ gridTemplateColumns: `repeat(${visibleItems.length}, minmax(0, 1fr))` }}
			>
				{visibleItems.map((item) => (
					<MobileNavItem
						key={item.route}
						href={item.href}
						label={item.label}
						icon={item.icon}
						active={activeRoute === item.route}
					/>
				))}
			</div>
		</nav>
	)
}

function MobileNavItem({
	href,
	label,
	icon: Icon,
	active,
}: {
	href: string
	label: string
	icon: ComponentType<{ className?: string }>
	active: boolean
}) {
	return (
		<Link
			href={href}
			className={cn(
				"grid min-h-11 place-items-center gap-0.5 rounded-lg px-1 text-[10px] font-medium text-muted-foreground transition-[background-color,color,border-color,transform] active:scale-[0.96] sm:min-h-12 sm:text-[11px]",
				active && "border border-border/70 bg-surface-soft text-foreground shadow-none ring-1 ring-foreground/10"
			)}
			aria-current={active ? "page" : undefined}
		>
			<Icon className={cn("size-4", active && "text-foreground")} />
			<span className="truncate">{label}</span>
		</Link>
	)
}
