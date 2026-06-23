import { getPagePath } from "@nanostores/router"
import { useStore } from "@nanostores/react"
import { AlertOctagonIcon, ArrowRightIcon, ContainerIcon, Globe2Icon, MonitorIcon, ServerIcon } from "lucide-react"
import { memo, useEffect, useMemo, useState } from "react"
import { ActiveAlerts } from "@/components/active-alerts"
import { MobileDashboard } from "@/components/mobile/mobile-dashboard"
import { useMobileLayout } from "@/components/mobile/mobile-ui"
import { Link, $router, prependBasePath } from "@/components/router"
import { NotificationFailuresBanner } from "@/components/notification-failures-banner"
import { SystemMetaTags } from "@/components/system-meta-tags"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { isPocketBaseAutoCancel, pb } from "@/lib/api"
import { pageTitle } from "@/lib/branding"
import { compareSystemsByAttention, getSystemStatusLabel, getSystemStatusTone } from "@/lib/system-display"
import { getSystemMetricDisplay, getSystemNetworkDisplay } from "@/lib/system-metrics"
import { getSystemIPAddressLabel } from "@/lib/system-network"
import { $alerts, $systems, $userSettings } from "@/lib/stores"
import { getSystemDisplayName } from "@/lib/system-roles"
import { cn } from "@/lib/utils"
import type { SystemRecord } from "@/types"

type DashboardSummaryResponse = {
	containers?: {
		total?: number
		running?: number
		stopped?: number
	}
	websites?: {
		total?: number
		up?: number
		down?: number
		unknown?: number
	}
}

export default memo(() => {
	const systems = useStore($systems)
	const alerts = useStore($alerts)
	const userSettings = useStore($userSettings)
	const { isMobile } = useMobileLayout()
	const [summary, setSummary] = useState({
		containers: 0,
		containersRunning: 0,
		containersStopped: 0,
		websites: 0,
		websitesUp: 0,
		websitesDown: 0,
		websitesUnknown: 0,
	})

	useEffect(() => {
		document.title = pageTitle("监控大屏")
	}, [])

	useEffect(() => {
		let ignore = false

		async function loadSummary() {
			try {
				const response = await pb.send<DashboardSummaryResponse>("/api/pulse/dashboard/summary", { requestKey: null })
				if (ignore) {
					return
				}
				const containers = response.containers ?? {}
				const websites = response.websites ?? {}
				setSummary({
					containers: containers.total ?? 0,
					containersRunning: containers.running ?? 0,
					containersStopped: containers.stopped ?? 0,
					websites: websites.total ?? 0,
					websitesUp: websites.up ?? 0,
					websitesDown: websites.down ?? 0,
					websitesUnknown: websites.unknown ?? 0,
				})
			} catch (error) {
				if (ignore || isPocketBaseAutoCancel(error)) {
					return
				}
				console.error("load dashboard summary", error)
			}
		}

		loadSummary()
		const timer = window.setInterval(loadSummary, 30_000)
		return () => {
			ignore = true
			window.clearInterval(timer)
		}
	}, [])

	const activeAlertCount = useMemo(() => {
		let count = 0
		for (const systemAlerts of Object.values(alerts)) {
			for (const alert of systemAlerts.values()) {
				if (alert.triggered) {
					count += 1
				}
			}
		}
		return count
	}, [alerts])

	const homeSystems = useMemo(() => systems.filter((system) => !system.hide_from_home), [systems])

	const recentSystems = useMemo(() => homeSystems.slice().sort(compareSystemsByAttention).slice(0, 6), [homeSystems])

	const totalSystems = homeSystems.length
	const onlineSystems = homeSystems.filter((system) => system.status === "up").length
	const downCount = homeSystems.filter((system) => system.status === "down").length
	const pausedCount = homeSystems.filter((system) => system.status === "paused").length
	const abnormalSystems = downCount + pausedCount
	const websiteState = getWebsiteSummaryState(summary)
	const containerState = getContainerSummaryState(summary)
	const clientsDetail =
		totalSystems === 0 ? "暂无机器" : abnormalSystems > 0 ? `${abnormalSystems} 台需关注` : "全部在线"
	const overviewState =
		activeAlertCount > 0
			? `${activeAlertCount} 条告警触发`
			: abnormalSystems > 0
				? `${abnormalSystems} 台机器需要关注`
				: "当前运行平稳"

	return useMemo(
		() =>
			isMobile ? (
				<MobileDashboard
					systems={homeSystems}
					onlineSystems={onlineSystems}
					totalSystems={totalSystems}
					abnormalSystems={abnormalSystems}
					activeAlertCount={activeAlertCount}
					containerCount={summary.containers}
					containerDetail={containerState.detail}
					containerTone={containerState.state}
					websiteText={`${summary.websitesUp}/${summary.websites}`}
					websiteTone={websiteState.state}
					unitNet={userSettings.unitNet}
				/>
			) : (
				<div className="grid gap-5">
					<NotificationFailuresBanner />
					<ActiveAlerts />

					<section className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-none">
						<div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
							<div className="grid gap-3">
								<div className="inline-flex w-fit items-center rounded-md border border-border/70 bg-surface-soft px-3 py-1 text-xs font-medium text-muted-foreground">
									Pulse 运行总览
								</div>
								<div className="grid gap-2">
									<h1 className="text-3xl font-semibold tracking-[-0.04em] text-foreground xl:text-4xl">今日状态</h1>
									<p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
										{overviewState}，这里优先展示需要处理的机器、容器、网站和告警。
									</p>
								</div>
							</div>
							<div className="grid grid-cols-3 gap-2 rounded-lg border border-border/70 bg-surface-soft p-2 text-center xl:min-w-[24rem]">
								<OverviewPill label="在线机器" value={`${onlineSystems}/${totalSystems}`} />
								<OverviewPill label="运行容器" value={`${summary.containersRunning}/${summary.containers}`} />
								<OverviewPill label="正常网站" value={`${summary.websitesUp}/${summary.websites}`} />
							</div>
						</div>
					</section>

					<section className="grid gap-4">
						<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
							<MetricCard
								href={getPagePath($router, "clients")}
								title="客户端"
								value={`${onlineSystems}/${totalSystems}`}
								detail={clientsDetail}
								icon={MonitorIcon}
								state={totalSystems === 0 ? "default" : abnormalSystems > 0 ? "warning" : "success"}
							/>
							<MetricCard
								href={getPagePath($router, "containers")}
								title="容器"
								value={String(summary.containers)}
								detail={containerState.detail}
								icon={ContainerIcon}
								state={containerState.state}
							/>
							<MetricCard
								href={getPagePath($router, "websites")}
								title="网站监控"
								value={`${summary.websitesUp}/${summary.websites}`}
								detail={websiteState.detail}
								icon={Globe2Icon}
								state={websiteState.state}
							/>
							<MetricCard
								href={getPagePath($router, "alerts")}
								title="当前告警"
								value={String(activeAlertCount)}
								detail={activeAlertCount > 0 ? "存在触发项" : "暂无触发项"}
								icon={AlertOctagonIcon}
								state={activeAlertCount > 0 ? "danger" : "success"}
							/>
						</div>
					</section>

					<section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(22rem,0.55fr)]">
						<Card className="overflow-hidden border-border/70 bg-card shadow-none">
							<CardHeader className="border-b border-border/70 bg-surface-soft px-5 py-4">
								<div className="flex items-center justify-between gap-3">
									<div className="grid gap-1">
										<CardTitle className="text-xl tracking-[-0.02em]">重点机器</CardTitle>
										<p className="text-sm text-muted-foreground">按离线、暂停和资源压力优先排序</p>
									</div>
									<Button asChild variant="outline" size="sm" className="shrink-0">
										<Link href={getPagePath($router, "clients")}>
											查看全部
											<ArrowRightIcon className="ms-1 size-4" />
										</Link>
									</Button>
								</div>
							</CardHeader>
							<CardContent className="grid gap-3 p-4">
								{recentSystems.length === 0 ? (
									<EmptyState loading={false} loadingText="正在读取客户端数据" emptyText="暂无客户端数据" />
								) : (
									<div className="grid gap-3 md:grid-cols-2">
										{recentSystems.map((system) => (
											<RecentSystemCard key={system.id} system={system} unitNet={userSettings.unitNet} />
										))}
									</div>
								)}
							</CardContent>
						</Card>

						<div className="grid content-start gap-4">
							<Card className="overflow-hidden border-border/70 bg-card shadow-none">
								<CardHeader className="border-b border-border/70 bg-surface-soft px-5 py-4">
									<CardTitle className="text-xl tracking-[-0.02em]">状态分布</CardTitle>
								</CardHeader>
								<CardContent className="grid gap-4 p-5">
									<ProgressRow label="在线" value={onlineSystems} total={Math.max(totalSystems, 1)} variant="success" />
									<ProgressRow label="离线" value={downCount} total={Math.max(totalSystems, 1)} variant="danger" />
									<ProgressRow label="暂停" value={pausedCount} total={Math.max(totalSystems, 1)} variant="warning" />
								</CardContent>
							</Card>

							<Card className="overflow-hidden border-border/70 bg-card shadow-none">
								<CardHeader className="border-b border-border/70 bg-surface-soft px-5 py-4">
									<CardTitle className="text-xl tracking-[-0.02em]">快捷入口</CardTitle>
								</CardHeader>
								<CardContent className="grid gap-2 p-4">
									<QuickLink href={getPagePath($router, "clients")} icon={ServerIcon} label="所有客户端" />
									<QuickLink href={getPagePath($router, "containers")} icon={ContainerIcon} label="容器监控" />
									<QuickLink href={getPagePath($router, "websites")} icon={Globe2Icon} label="网站监控" />
								</CardContent>
							</Card>
						</div>
					</section>
				</div>
			),
		[
			activeAlertCount,
			abnormalSystems,
			clientsDetail,
			downCount,
			isMobile,
			onlineSystems,
			pausedCount,
			recentSystems,
			homeSystems,
			containerState.detail,
			containerState.state,
			summary.containers,
			summary.containersRunning,
			summary.containersStopped,
			summary.websites,
			summary.websitesDown,
			summary.websitesUp,
			summary.websitesUnknown,
			totalSystems,
			overviewState,
			userSettings.unitNet,
			websiteState.detail,
			websiteState.state,
		]
	)
})

function OverviewPill({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-md border border-border/70 bg-card px-3 py-2">
			<div className="text-lg font-semibold tracking-[-0.03em] text-foreground tabular-nums">{value}</div>
			<div className="mt-0.5 text-[11px] font-medium text-muted-foreground">{label}</div>
		</div>
	)
}

function getWebsiteSummaryState(summary: { websites: number; websitesDown: number; websitesUnknown: number }): {
	detail: string
	state: MetricState
} {
	if (summary.websites === 0) {
		return { detail: "暂无监控", state: "default" }
	}
	if (summary.websitesDown > 0) {
		return { detail: `${summary.websitesDown} 个异常`, state: "danger" }
	}
	if (summary.websitesUnknown > 0) {
		return { detail: `${summary.websitesUnknown} 个待检测`, state: "warning" }
	}
	return { detail: "地址检测正常", state: "success" }
}

function getContainerSummaryState(summary: { containers: number; containersStopped: number }): {
	detail: string
	state: MetricState
} {
	if (summary.containers === 0) {
		return { detail: "暂无容器", state: "default" }
	}
	if (summary.containersStopped > 0) {
		return { detail: `停止 ${summary.containersStopped}`, state: "warning" }
	}
	return { detail: "全部运行", state: "success" }
}

function RecentSystemCard({ system, unitNet }: { system: SystemRecord; unitNet: typeof $userSettings.value.unitNet }) {
	const cpu = getSystemMetricDisplay(system, "cpu")
	const memory = getSystemMetricDisplay(system, "mp")
	const disk = getSystemMetricDisplay(system, "dp")
	const network = getSystemNetworkDisplay(system, unitNet)
	const detailText = getSystemIPAddressLabel(system) || system.info?.h || system.info?.m

	return (
		<Link
			href={prependBasePath(`/system/${system.id}`)}
			className="rounded-lg border border-border/70 bg-card p-3 transition-[background-color,border-color,transform] duration-150 ease-out hover:border-foreground/10 hover:bg-surface-soft active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
		>
			<div className="flex items-start justify-between gap-3">
				<div className="grid min-w-0 gap-1.5">
					<div className="truncate text-sm font-semibold">{getSystemDisplayName(system)}</div>
					<SystemMetaTags system={system} className="gap-1" />
					{detailText && <div className="mt-1 truncate text-xs text-muted-foreground">{detailText}</div>}
				</div>
				<StatusBadge status={system.status} />
			</div>
			<div className="mt-3 grid grid-cols-2 gap-2 text-xs lg:grid-cols-4">
				<MiniValue label="CPU" value={cpu.value} />
				<MiniValue label="内存" value={memory.value} />
				<MiniValue label="磁盘" value={disk.value} />
				<MiniValue label="网络" value={network.value} />
			</div>
		</Link>
	)
}

type MetricState = "default" | "success" | "warning" | "danger"

function MetricCard({
	href,
	title,
	value,
	detail,
	icon: Icon,
	state = "default",
}: {
	href: string
	title: string
	value: string
	detail: string
	icon: React.ComponentType<{ className?: string }>
	state?: MetricState
}) {
	return (
		<Link
			href={href}
			className="block min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
		>
			<Card className="h-full overflow-hidden border-border/70 bg-surface-card shadow-none transition-[background-color,border-color,transform] duration-150 ease-out hover:border-foreground/10 hover:bg-surface-soft active:scale-[0.96]">
				<CardContent className="p-5">
					<div className="flex items-start justify-between gap-3">
						<div className="grid min-w-0 gap-2.5">
							<div className="text-sm font-medium text-muted-foreground">{title}</div>
							<div className="text-3xl font-semibold tracking-[-0.04em] text-foreground">{value}</div>
							<div
								className={cn(
									"w-fit rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground",
									state === "success" && "text-emerald-600 dark:text-emerald-300",
									state === "warning" && "text-amber-600 dark:text-amber-300",
									state === "danger" && "text-red-600 dark:text-red-300"
								)}
							>
								{detail}
							</div>
						</div>
						<div className="rounded-md border border-border/70 bg-card p-2">
							<Icon className="size-5 text-muted-foreground" />
						</div>
					</div>
				</CardContent>
			</Card>
		</Link>
	)
}

function StatusBadge({ status }: { status: string }) {
	const tone = getSystemStatusTone(status as SystemRecord["status"])
	if (tone === "success") {
		return <Badge variant="success">{getSystemStatusLabel(status as SystemRecord["status"])}</Badge>
	}
	if (tone === "warning") {
		return <Badge variant="warning">{getSystemStatusLabel(status as SystemRecord["status"])}</Badge>
	}
	return <Badge variant="danger">{getSystemStatusLabel(status as SystemRecord["status"])}</Badge>
}

function MiniValue({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-md border border-border/70 bg-surface-soft px-2.5 py-2">
			<div className="text-muted-foreground">{label}</div>
			<div className="mt-0.5 font-medium tabular-nums">{value}</div>
		</div>
	)
}

function ProgressRow({
	label,
	value,
	total,
	variant,
}: {
	label: string
	value: number
	total: number
	variant: "success" | "warning" | "danger"
}) {
	const percent = Math.min(100, Math.max(0, (value / total) * 100))
	return (
		<div className="grid gap-1.5">
			<div className="flex items-center justify-between text-sm">
				<span>{label}</span>
				<span className="text-muted-foreground">{value}</span>
			</div>
			<div className="h-2 overflow-hidden rounded-full bg-surface-soft">
				<div
					className={cn(
						"h-full rounded-full",
						variant === "success" && "bg-emerald-500",
						variant === "warning" && "bg-amber-500",
						variant === "danger" && "bg-red-500"
					)}
					style={{ width: `${percent}%` }}
				/>
			</div>
		</div>
	)
}

function QuickLink({
	href,
	icon: Icon,
	label,
}: {
	href: string
	icon: React.ComponentType<{ className?: string }>
	label: string
}) {
	return (
		<Button asChild variant="outline" className="h-11 justify-between px-3.5">
			<Link href={href}>
				<span className="flex items-center gap-2 font-medium">
					<Icon className="size-4" />
					{label}
				</span>
				<ArrowRightIcon className="size-4 text-muted-foreground" />
			</Link>
		</Button>
	)
}
