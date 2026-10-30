import { useStore } from "@nanostores/react"
import { lazy, memo, Suspense, useEffect, useMemo, useState } from "react"
import { MobileDashboard } from "@/components/mobile/mobile-dashboard"
import { useMobileLayout, type MobileStatusTone } from "@/components/mobile/mobile-ui"
import { NotificationFailuresBanner } from "@/components/notification-failures-banner"
import { EmptyState } from "@/components/ui/empty-state"
import { isPocketBaseAutoCancel, pb } from "@/lib/api"
import { pageTitle } from "@/lib/branding"
import { $systems, $userSettings } from "@/lib/stores"
import { $moduleSettings } from "@/modules/module-state"
import { useTopologySummary, type TopologyAssetSummary } from "@/modules/network-topology/use-topology-summary"

const HomeTopologyWorkspace = lazy(() => import("@/components/routes/home-topology-workspace"))

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

type MetricState = "default" | "success" | "warning" | "danger"

export default memo(() => {
	const systems = useStore($systems)
	const userSettings = useStore($userSettings)
	const moduleSettings = useStore($moduleSettings)
	const { isMobile } = useMobileLayout()
	const { activeAlertCount, assetSummary, assetSummaryHref } = useTopologySummary(systems)
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
		document.title = pageTitle("首页")
	}, [])

	useEffect(() => {
		let ignore = false

		async function loadSummary() {
			try {
				const response = await pb.send<DashboardSummaryResponse>("/api/pulse/dashboard/summary", { requestKey: null })
				if (ignore) return
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
				if (ignore || isPocketBaseAutoCancel(error)) return
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

	const homeSystems = useMemo(() => systems.filter((system) => !system.hide_from_home), [systems])
	const totalSystems = homeSystems.length
	const onlineSystems = homeSystems.filter((system) => system.status === "up").length
	const downCount = homeSystems.filter((system) => system.status === "down").length
	const pausedCount = homeSystems.filter((system) => system.status === "paused").length
	const abnormalSystems = downCount + pausedCount
	const websiteState = getWebsiteSummaryState(summary)
	const containerState = getContainerSummaryState(summary)
	const assetState = getAssetSummaryState(assetSummary)
	const topologyEnabled = moduleSettings["network-topology"]?.effectiveEnabled !== false

	if (isMobile) {
		return (
			<MobileDashboard
				systems={homeSystems}
				onlineSystems={onlineSystems}
				totalSystems={totalSystems}
				abnormalSystems={abnormalSystems}
				activeAlertCount={activeAlertCount}
				assetCount={assetSummary.total}
				assetDetail={assetState.detail}
				assetHref={assetSummaryHref}
				assetTone={toMobileStatusTone(assetState.state)}
				containerCount={summary.containers}
				containerDetail={containerState.detail}
				containerTone={toMobileStatusTone(containerState.state)}
				websiteText={`${summary.websitesUp}/${summary.websites}`}
				websiteTone={toMobileStatusTone(websiteState.state)}
				unitNet={userSettings.unitNet}
			/>
		)
	}

	return (
		<div className="grid pulse-card-gap">
			<NotificationFailuresBanner />
			{topologyEnabled ? (
				<Suspense fallback={<EmptyState loading loadingText="正在加载网络拓扑" emptyText="暂无网络拓扑" />}>
					<HomeTopologyWorkspace
						systems={homeSystems}
						activeAlertCount={activeAlertCount}
						assetSummary={assetSummary}
						assetSummaryHref={assetSummaryHref}
					/>
				</Suspense>
			) : (
				<EmptyState loading={false} loadingText="正在加载网络拓扑" emptyText="网络拓扑模块已关闭，请在设置中启用" />
			)}
		</div>
	)
})

function getWebsiteSummaryState(summary: { websites: number; websitesDown: number; websitesUnknown: number }): {
	detail: string
	state: MetricState
} {
	if (summary.websites === 0) return { detail: "暂无监控", state: "default" }
	if (summary.websitesDown > 0) return { detail: `${summary.websitesDown} 个异常`, state: "danger" }
	if (summary.websitesUnknown > 0) return { detail: `${summary.websitesUnknown} 个待检测`, state: "warning" }
	return { detail: "地址检测正常", state: "success" }
}

function getContainerSummaryState(summary: { containers: number; containersStopped: number }): {
	detail: string
	state: MetricState
} {
	if (summary.containers === 0) return { detail: "暂无容器", state: "default" }
	if (summary.containersStopped > 0) return { detail: `停止 ${summary.containersStopped}`, state: "warning" }
	return { detail: "全部运行", state: "success" }
}

function getAssetSummaryState(summary: TopologyAssetSummary): { detail: string; state: MetricState } {
	if (summary.total === 0) return { detail: "暂无资产", state: "default" }
	if (summary.looseLocationAssets > 0)
		return { detail: `${summary.looseLocationAssets} 条资产待归档`, state: "warning" }
	if (summary.manual > 0) return { detail: `${summary.monitored} 已监控 / ${summary.manual} 手动`, state: "success" }
	return { detail: "全部已接入", state: "success" }
}

function toMobileStatusTone(state: MetricState): MobileStatusTone {
	return state === "default" ? "neutral" : state
}
