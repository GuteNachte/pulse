import { getPagePath } from "@nanostores/router"
import { BellIcon, ContainerIcon, Globe2Icon, HomeIcon, MonitorIcon } from "lucide-react"
import type { ComponentType } from "react"
import { $router, Link } from "@/components/router"
import { cn } from "@/lib/utils"
import { useMobileLayout } from "./mobile-ui"

const items = [
	{ route: "home", label: "首页", icon: HomeIcon, href: getPagePath($router, "home") },
	{ route: "clients", label: "机器", icon: MonitorIcon, href: getPagePath($router, "clients") },
	{ route: "alerts", label: "告警", icon: BellIcon, href: getPagePath($router, "alerts") },
	{ route: "websites", label: "网站", icon: Globe2Icon, href: getPagePath($router, "websites") },
	{ route: "containers", label: "容器", icon: ContainerIcon, href: getPagePath($router, "containers") },
] as const

export function MobileBottomNav({ activeRoute }: { activeRoute?: string }) {
	const { isMobile } = useMobileLayout()
	if (!isMobile) {
		return null
	}

	return (
		<nav className="pulse-mobile-bottom-nav fixed inset-x-0 bottom-0 z-50 border-t border-border/70 bg-card px-2 pt-1.5 shadow-none">
			<div className="mx-auto grid max-w-3xl grid-cols-5 gap-0.5">
				{items.map((item) => (
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
