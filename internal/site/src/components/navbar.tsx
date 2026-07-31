import { Trans } from "@lingui/react/macro"
import { getPagePath } from "@nanostores/router"
import { useStore } from "@nanostores/react"
import {
	BellIcon,
	ArchiveIcon,
	Code2Icon,
	ContainerIcon,
	DownloadIcon,
	Globe2Icon,
	HousePlugIcon,
	LayoutDashboardIcon,
	LogOutIcon,
	MenuIcon,
	MonitorIcon,
	NetworkIcon,
	SettingsIcon,
	UserIcon,
} from "lucide-react"
import type { ReactNode } from "react"
import { buttonVariants } from "@/components/ui/button"
import { demoModeIndicatorModel, isDemoMode } from "@/demo/mode"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { logOut, pb } from "@/lib/api"
import { cn, runOnce } from "@/lib/utils"
import { $moduleSettings } from "@/modules/module-state"
import type { PulseModuleId } from "@/modules/types"
import { DemoModeIndicator } from "./demo-mode-indicator"
import { useMobileLayout } from "./mobile/mobile-ui"
import { Logo } from "./logo"
import { ModeToggle } from "./mode-toggle"
import { $router, Link, navigate, prependBasePath } from "./router"
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip"

export default function Navbar() {
	const page = useStore($router)
	const moduleSettings = useStore($moduleSettings)
	const { isMobile } = useMobileLayout()
	const settingsPath = getPagePath($router, "settings", { name: "general" })
	const settingsIndexPath = prependBasePath("/settings")
	const navigateFromMenu = (href: string) => () => {
		navigate(href)
	}
	const currentPath = typeof window !== "undefined" ? window.location.pathname : ""
	const isActiveRoute = (route: string, href?: string) => page?.route === route || (href ? currentPath === href : false)
	const assetsPath = getPagePath($router, "assets")
	const smarthomePath = getPagePath($router, "smarthome")
	const networkPath = getPagePath($router, "network", { domain: "home" })
	const containersPath = getPagePath($router, "containers")
	const clientsPath = getPagePath($router, "clients")
	const websitesPath = getPagePath($router, "websites")
	const alertsPath = getPagePath($router, "alerts")
	const accountMenuActive = isActiveRoute("alerts", alertsPath) || isActiveRoute("settings", settingsPath)
	const moduleEnabled = (id: PulseModuleId) => moduleSettings[id]?.effectiveEnabled !== false
	const demoMode = isDemoMode()

	return (
		<div className="my-1 flex h-10 items-center rounded-none border-0 bg-transparent px-1 pe-0 sm:px-2 md:my-[10px] md:h-16 md:rounded-lg md:border md:border-border md:bg-card md:px-5 md:shadow-none">
			<Link
				href={getPagePath($router, "home")}
				aria-label="首页"
				className="group -ms-1 me-3 inline-flex min-h-10 items-center rounded-md px-1.5 py-1 outline-none transition-[transform] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96] md:-ms-2 md:px-2"
				onMouseEnter={runOnce(() => import("@/components/routes/home"))}
			>
				<Logo className="text-[1.45rem] md:text-lg" />
			</Link>
			{!isMobile && <DemoModeIndicator />}

			{isMobile ? (
				<div className="ms-auto flex items-center text-base">
					<ModeToggle />
					<DropdownMenu>
						<DropdownMenuTrigger
							onMouseEnter={() => import("@/components/routes/settings/general")}
							className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "ms-1 size-10")}
							aria-label="打开菜单"
						>
							<MenuIcon />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="min-w-48">
							<DropdownMenuLabel className="grid max-w-52 gap-1.5">
								{demoMode && <DemoModeIndicator className="w-fit" />}
								<span className="truncate">{pb.authStore.record?.email}</span>
							</DropdownMenuLabel>
							<DropdownMenuSeparator />
							<DropdownMenuGroup>
								<DropdownMenuItem onSelect={navigateFromMenu(settingsIndexPath)}>
									<SettingsIcon className="me-2.5 h-4 w-4" />
									系统设置
								</DropdownMenuItem>
								{moduleEnabled("asset-center") && (
									<DropdownMenuItem onSelect={navigateFromMenu(assetsPath)}>
										<ArchiveIcon className="me-2.5 h-4 w-4" />
										资产中心
									</DropdownMenuItem>
								)}
								{moduleEnabled("network-topology") && (
									<DropdownMenuItem onSelect={navigateFromMenu(networkPath)}>
										<NetworkIcon className="me-2.5 h-4 w-4" />
										网络拓扑
									</DropdownMenuItem>
								)}
								{moduleEnabled("smarthome") && (
									<DropdownMenuItem onSelect={navigateFromMenu(smarthomePath)}>
										<HousePlugIcon className="me-2.5 h-4 w-4" />
										智能家居
									</DropdownMenuItem>
								)}
								{moduleEnabled("agent-management") && (
									<DropdownMenuItem onSelect={navigateFromMenu(getPagePath($router, "settings", { name: "agent" }))}>
										<MonitorIcon className="me-2.5 h-4 w-4" />
										Agent 管理
									</DropdownMenuItem>
								)}
								{moduleEnabled("notifications") && (
									<DropdownMenuItem
										onSelect={navigateFromMenu(getPagePath($router, "settings", { name: "notifications" }))}
									>
										<BellIcon className="me-2.5 h-4 w-4" />
										通知设置
									</DropdownMenuItem>
								)}
								<DropdownMenuItem onSelect={navigateFromMenu(getPagePath($router, "settings", { name: "about" }))}>
									<UserIcon className="me-2.5 h-4 w-4" />
									关于 Pulse
								</DropdownMenuItem>
							</DropdownMenuGroup>
							<DropdownMenuSeparator />
							{demoMode ? (
								<DropdownMenuGroup>
									<DropdownMenuItem asChild>
										<a href={demoModeIndicatorModel.repositoryUrl} target="_blank" rel="noreferrer">
											<Code2Icon className="me-2.5 h-4 w-4" />
											查看 GitHub
										</a>
									</DropdownMenuItem>
									<DropdownMenuItem asChild>
										<a href={demoModeIndicatorModel.releaseUrl} target="_blank" rel="noreferrer">
											<DownloadIcon className="me-2.5 h-4 w-4" />
											下载测试版
										</a>
									</DropdownMenuItem>
								</DropdownMenuGroup>
							) : (
								<DropdownMenuItem onSelect={logOut}>
									<Trans>Log Out</Trans>
								</DropdownMenuItem>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			) : null}

			{!isMobile ? (
				<div className="ms-auto flex items-center">
					<NavIconLink
						href={getPagePath($router, "home")}
						label="监控大屏"
						active={isActiveRoute("home", getPagePath($router, "home"))}
					>
						<LayoutDashboardIcon className="h-[1.2rem] w-[1.2rem]" />
					</NavIconLink>
					{moduleEnabled("asset-center") && (
						<NavIconLink href={assetsPath} label="资产中心" active={isActiveRoute("assets", assetsPath)}>
							<ArchiveIcon className="h-[1.2rem] w-[1.2rem]" />
						</NavIconLink>
					)}
					{moduleEnabled("network-topology") && (
						<NavIconLink href={networkPath} label="网络拓扑" active={isActiveRoute("network", networkPath)}>
							<NetworkIcon className="h-[1.2rem] w-[1.2rem]" />
						</NavIconLink>
					)}
					{moduleEnabled("smarthome") && (
						<NavIconLink href={smarthomePath} label="智能家居" active={isActiveRoute("smarthome", smarthomePath)}>
							<HousePlugIcon className="h-[1.2rem] w-[1.2rem]" />
						</NavIconLink>
					)}
					{moduleEnabled("client-monitoring") && (
						<NavIconLink href={clientsPath} label="客户端监控" active={isActiveRoute("clients", clientsPath)}>
							<MonitorIcon className="h-[1.2rem] w-[1.2rem]" />
						</NavIconLink>
					)}
					{moduleEnabled("client-monitoring") && (
						<NavIconLink href={containersPath} label="容器监控" active={isActiveRoute("containers", containersPath)}>
							<ContainerIcon className="h-[1.2rem] w-[1.2rem]" />
						</NavIconLink>
					)}
					{moduleEnabled("website-monitoring") && (
						<NavIconLink href={websitesPath} label="互联网服务监控" active={isActiveRoute("websites", websitesPath)}>
							<Globe2Icon className="h-[1.2rem] w-[1.2rem]" />
						</NavIconLink>
					)}
					<ModeToggle />
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								aria-label="用户菜单"
								aria-current={accountMenuActive ? "page" : undefined}
								onMouseEnter={() => import("@/components/routes/settings/general")}
								className={cn(
									buttonVariants({ variant: "ghost", size: "icon" }),
									accountMenuActive &&
										"relative bg-surface-soft text-foreground shadow-none ring-1 ring-border after:absolute after:inset-x-2 after:-bottom-1 after:h-0.5 after:rounded-sm after:bg-primary"
								)}
							>
								<UserIcon className="h-[1.2rem] w-[1.2rem]" />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="min-w-44">
							<DropdownMenuLabel className="max-w-56 truncate">{pb.authStore.record?.email}</DropdownMenuLabel>
							<DropdownMenuSeparator />
							{moduleEnabled("alerts") && (
								<>
									<DropdownMenuItem onSelect={navigateFromMenu(alertsPath)}>
										<BellIcon className="me-2.5 h-4 w-4" />
										<span>告警中心</span>
									</DropdownMenuItem>
									<DropdownMenuSeparator />
								</>
							)}
							<DropdownMenuItem onSelect={navigateFromMenu(settingsPath)}>
								<SettingsIcon className="me-2.5 h-4 w-4" />
								<span>系统设置</span>
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							{demoMode ? (
								<>
									<DropdownMenuItem asChild>
										<a href={demoModeIndicatorModel.repositoryUrl} target="_blank" rel="noreferrer">
											<Code2Icon className="me-2.5 h-4 w-4" />
											查看 GitHub
										</a>
									</DropdownMenuItem>
									<DropdownMenuItem asChild>
										<a href={demoModeIndicatorModel.releaseUrl} target="_blank" rel="noreferrer">
											<DownloadIcon className="me-2.5 h-4 w-4" />
											下载测试版
										</a>
									</DropdownMenuItem>
								</>
							) : (
								<DropdownMenuItem onSelect={logOut}>
									<LogOutIcon className="me-2.5 h-4 w-4" />
									<span>
										<Trans>Log Out</Trans>
									</span>
								</DropdownMenuItem>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			) : null}
		</div>
	)
}

function NavIconLink({
	href,
	label,
	children,
	active,
}: {
	href: string
	label: string
	children: ReactNode
	active?: boolean
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Link
					href={href}
					className={cn(
						buttonVariants({ variant: "ghost", size: "icon" }),
						"relative",
						active &&
							"bg-surface-soft text-foreground shadow-none ring-1 ring-border after:absolute after:inset-x-2 after:-bottom-1 after:h-0.5 after:rounded-sm after:bg-primary"
					)}
					aria-label={label}
					aria-current={active ? "page" : undefined}
				>
					{children}
				</Link>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	)
}
