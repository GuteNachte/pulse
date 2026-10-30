import { getPagePath } from "@nanostores/router"
import {
	ActivityIcon,
	AlertOctagonIcon,
	BadgeCheckIcon,
	BoxesIcon,
	ContainerIcon,
	Globe2Icon,
	ServerIcon,
} from "lucide-react"
import { useMemo } from "react"
import { ActiveAlerts } from "@/components/active-alerts"
import { NotificationFailuresBanner } from "@/components/notification-failures-banner"
import { Link, $router, prependBasePath } from "@/components/router"
import { SystemMetaTags } from "@/components/system-meta-tags"
import { Button } from "@/components/ui/button"
import { compareSystemsByAttention, getSystemStatusLabel, getSystemStatusTone } from "@/lib/system-display"
import { getSystemMetricDisplay, getSystemNetworkDisplay, type SystemMetricDisplayState } from "@/lib/system-metrics"
import { getSystemIPAddressLabel } from "@/lib/system-network"
import { getSystemDisplayName } from "@/lib/system-roles"
import { cn, decimalString } from "@/lib/utils"
import type { $userSettings } from "@/lib/stores"
import type { SystemRecord } from "@/types"
import {
	MobileList,
	MobileListItem,
	MobileEmptyState,
	MobileMetricRow,
	MobilePageShell,
	MobileSection,
	MobileStatusTag,
	MobileSummaryStrip,
	type MobileStatusTone,
} from "./mobile-ui"

export function MobileDashboard({
	systems,
	onlineSystems,
	totalSystems,
	abnormalSystems,
	activeAlertCount,
	assetCount,
	assetDetail,
	assetHref,
	assetTone,
	containerCount,
	containerDetail,
	containerTone,
	websiteText,
	websiteTone,
	unitNet,
}: {
	systems: SystemRecord[]
	onlineSystems: number
	totalSystems: number
	abnormalSystems: number
	activeAlertCount: number
	assetCount: number
	assetDetail: string
	assetHref: string
	assetTone: MobileStatusTone
	containerCount: number
	containerDetail: string
	containerTone: MobileStatusTone
	websiteText: string
	websiteTone: MobileStatusTone
	unitNet: typeof $userSettings.value.unitNet
}) {
	const sortedSystems = useMemo(() => systems.slice().sort(compareSystemsByAttention), [systems])
	const attentionSystems = useMemo(
		() => sortedSystems.filter((system) => system.status !== "up").slice(0, 4),
		[sortedSystems]
	)
	const recentSystems = sortedSystems.slice(0, 6)
	const overallTone: MobileStatusTone = abnormalSystems > 0 || activeAlertCount > 0 ? "warning" : "success"

	return (
		<MobilePageShell
			title="今日状态"
			subtitle={`${onlineSystems}/${totalSystems} 在线`}
			action={<MobileStatusTag tone={overallTone}>{overallTone === "success" ? "正常" : "需关注"}</MobileStatusTag>}
		>
			<NotificationFailuresBanner />
			<ActiveAlerts />

			<MobileSummaryStrip
				items={[
					{
						label: "资产",
						value: assetCount,
						tone: assetTone,
						icon: BoxesIcon,
					},
					{
						label: "机器",
						value: `${onlineSystems}/${totalSystems}`,
						tone: abnormalSystems > 0 ? "warning" : "success",
						icon: ServerIcon,
					},
					{
						label: "告警",
						value: activeAlertCount,
						tone: activeAlertCount > 0 ? "danger" : "success",
						icon: AlertOctagonIcon,
					},
					{
						label: "网站",
						value: websiteText,
						tone: websiteTone,
						icon: Globe2Icon,
					},
				]}
			/>

			{attentionSystems.length > 0 && (
				<MobileSection title="需要关注" count={`${attentionSystems.length} 项`}>
					<MobileList>
						{attentionSystems.map((system) => (
							<MobileSystemListCard key={system.id} system={system} unitNet={unitNet} compact />
						))}
					</MobileList>
				</MobileSection>
			)}

			<MobileSection title="服务概览">
				<div className="grid grid-cols-2 gap-2">
					<MobileListItem href={assetHref}>
						<div className="flex items-center justify-between gap-3">
							<div>
								<div className="text-xs text-muted-foreground">资产</div>
								<div className="mt-1 text-lg font-semibold tabular-nums">{assetCount}</div>
								<div className={cn("mt-0.5 line-clamp-1 text-[11px]", metricToneClassName(assetTone))}>
									{assetDetail}
								</div>
							</div>
							<BoxesIcon className="size-5 text-muted-foreground" />
						</div>
					</MobileListItem>
					<MobileListItem href={getPagePath($router, "containers")}>
						<div className="flex items-center justify-between gap-3">
							<div>
								<div className="text-xs text-muted-foreground">容器</div>
								<div className="mt-1 text-lg font-semibold tabular-nums">{containerCount}</div>
								<div className={cn("mt-0.5 line-clamp-1 text-[11px]", metricToneClassName(containerTone))}>
									{containerDetail}
								</div>
							</div>
							<ContainerIcon className="size-5 text-muted-foreground" />
						</div>
					</MobileListItem>
					<MobileListItem href={getPagePath($router, "websites")}>
						<div className="flex items-center justify-between gap-3">
							<div>
								<div className="text-xs text-muted-foreground">网站</div>
								<div className="mt-1 text-lg font-semibold tabular-nums">{websiteText}</div>
								<div className={cn("mt-0.5 line-clamp-1 text-[11px]", metricToneClassName(websiteTone))}>站点监控</div>
							</div>
							<Globe2Icon className="size-5 text-muted-foreground" />
						</div>
					</MobileListItem>
				</div>
			</MobileSection>

			<MobileSection
				title="机器"
				count={`${recentSystems.length}/${totalSystems}`}
				action={
					<Button asChild variant="ghost" size="sm" className="min-h-10 px-3 text-xs">
						<Link href={getPagePath($router, "clients")}>全部</Link>
					</Button>
				}
			>
				{recentSystems.length === 0 ? (
					<MobileEmptyState>暂无客户端数据</MobileEmptyState>
				) : (
					<MobileList>
						{recentSystems.map((system) => (
							<MobileSystemListCard key={system.id} system={system} unitNet={unitNet} />
						))}
					</MobileList>
				)}
			</MobileSection>
		</MobilePageShell>
	)
}

function MobileSystemListCard({
	system,
	unitNet,
	compact,
}: {
	system: SystemRecord
	unitNet: typeof $userSettings.value.unitNet
	compact?: boolean
}) {
	const cpu = getSystemMetricDisplay(system, "cpu")
	const memory = getSystemMetricDisplay(system, "mp")
	const disk = getSystemMetricDisplay(system, "dp")
	const networkRate = getSystemNetworkDisplay(system, unitNet)
	const description = getSystemIPAddressLabel(system) || system.description?.trim() || system.info?.h || system.info?.m
	const tone = systemStatusTone(system.status)

	return (
		<MobileListItem href={prependBasePath(`/system/${system.id}`)}>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0 flex-1">
					<div className="flex min-w-0 items-center gap-2">
						<StatusDot status={system.status} />
						<h3 className="truncate text-[15px] font-semibold">{getSystemDisplayName(system)}</h3>
					</div>
					<SystemMetaTags system={system} className="mt-1.5 gap-1" />
					{description && !compact && (
						<p className="mt-1.5 line-clamp-1 text-[11px] text-muted-foreground">{description}</p>
					)}
				</div>
				<MobileStatusTag tone={tone}>{getSystemStatusLabel(system.status)}</MobileStatusTag>
			</div>
			<MobileMetricRow
				className="mt-3"
				items={[
					{
						label: "CPU",
						value: cpu.value,
						progress: cpu.progress,
						tone: metricTone(cpu.state),
					},
					{
						label: "内存",
						value: memory.value,
						progress: memory.progress,
						tone: metricTone(memory.state),
					},
					{
						label: "磁盘",
						value: disk.value,
						progress: disk.progress,
						tone: metricTone(disk.state),
					},
				]}
			/>
			{!compact && (
				<div className="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
					<span className="flex min-w-0 items-center gap-1 truncate">
						<ActivityIcon className="size-3.5 shrink-0" />
						<span className="truncate">{formatLoadAverage(system.info?.la)}</span>
					</span>
					<span className="flex min-w-0 items-center gap-1 truncate">
						<BadgeCheckIcon className="size-3.5 shrink-0" />
						<span className="truncate">{networkRate.value}</span>
					</span>
				</div>
			)}
		</MobileListItem>
	)
}

function metricTone(state: SystemMetricDisplayState): MobileStatusTone {
	if (state === "missing" || state === "offline" || state === "paused" || state === "pending") {
		return "neutral"
	}
	if (state === "danger") {
		return "danger"
	}
	if (state === "warning") {
		return "warning"
	}
	return "success"
}

function metricToneClassName(tone?: MobileStatusTone) {
	if (tone === "success") return "text-emerald-700 dark:text-emerald-300"
	if (tone === "warning") return "text-amber-700 dark:text-amber-300"
	if (tone === "danger") return "text-red-700 dark:text-red-300"
	if (tone === "info") return "text-sky-700 dark:text-sky-300"
	return "text-muted-foreground"
}

function formatLoadAverage(load?: [number, number, number]) {
	if (!load?.length) {
		return "负载未采集"
	}
	return load.map((value) => decimalString(value, value >= 10 ? 1 : 2)).join(" ")
}

function StatusDot({ status }: { status: string }) {
	return (
		<span
			className={cn(
				"size-2.5 shrink-0 rounded-full",
				status === "up" && "bg-emerald-500",
				status === "down" && "bg-red-500",
				status === "paused" && "bg-amber-500",
				status === "pending" && "bg-muted-foreground"
			)}
		/>
	)
}

function systemStatusTone(status: SystemRecord["status"]): MobileStatusTone {
	const tone = getSystemStatusTone(status)
	return tone === "info" ? "neutral" : tone
}
