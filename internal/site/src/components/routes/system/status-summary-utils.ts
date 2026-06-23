import type { DetailView } from "@/components/mobile/mobile-system-detail"
import type { ChartData, GPUData, SystemDetailsRecord, SystemRecord } from "@/types"
import {
	formatNetworkRate,
	formatPercent,
	getContainerRuntimeLabel,
	getCpuFrequencySummary,
	getCpuVendorLabel,
	getDiskTypeLabel,
	getDiskSummary,
	getGpuOverviewValue,
	getGpuRuntimeSummary,
	getHardwareTemperatureSummary,
	getPrimaryGpuTypeLabel,
	getLoadState,
	getMemorySummary,
	getMemoryTypeLabel,
	getNetworkSummary,
	getNetworkUsagePercentSummary,
} from "./metric-summary-utils"
import { SystemStatus } from "@/lib/enums"
import type { Unit } from "@/lib/enums"

export type MetricState = "ok" | "warning" | "danger" | "muted" | "offline" | "paused" | "pending"

export type MetricOverviewItem = {
	key: DetailView
	label: string
	value: string
	helper?: string
	badge?: string
	badges?: string[]
	state: MetricState
	disabledReason?: string
}

export function buildStatusSummaryItems({
	system,
	systemStats,
	details,
	lastGpus,
	containerData,
	currentContainerCount,
	smartTotalCapacity,
	smartDisks,
	hasContainers,
	hasGpu,
	unitTemp,
}: {
	system: SystemRecord
	systemStats: ChartData["systemStats"]
	details?: SystemDetailsRecord | null
	lastGpus?: Record<string, GPUData> | null
	containerData: ChartData["containerData"]
	currentContainerCount?: number
	smartTotalCapacity: number
	smartDisks: { model?: string; name?: string; type?: string; media_type?: string; temp?: number }[]
	hasContainers: boolean
	hasGpu: boolean
	unitTemp?: Unit
}): MetricOverviewItem[] {
	const bandwidth = system.info.bb ?? system.info.b ?? 0
	const networkSummary = getNetworkSummary(details, systemStats)
	const temperatures = getHardwareTemperatureSummary({ systemStats, gpus: lastGpus, smartDisks, unitTemp })
	const latestContainers = containerData.at(-1)
	const chartContainerCount = latestContainers
		? Object.keys(latestContainers).filter((key) => key !== "created").length
		: 0
	const containerCount = currentContainerCount ?? chartContainerCount
	const online = system.status === SystemStatus.Up
	const nonLiveState = getNonLiveMetricState(system.status)
	const hasContainerRuntime = hasContainers || hasCollectedContainerRuntime(details, system)

	return [
		{
			key: "overview",
			label: "CPU",
			value: nonLiveState ? getNonLiveMetricValue(nonLiveState) : formatMetricPercent(system.info.cpu),
			helper: nonLiveState
				? getNonLiveMetricHelper(nonLiveState)
				: getCpuFrequencySummary(details, system, systemStats),
			badges: [getCpuVendorLabel(details), temperatures.cpu && `温度 ${temperatures.cpu}`].filter(Boolean),
			state: nonLiveState ?? getMetricState(system.info.cpu, online),
		},
		{
			key: "memory",
			label: "内存",
			value: nonLiveState ? getNonLiveMetricValue(nonLiveState) : formatMetricPercent(system.info.mp),
			helper: nonLiveState ? getNonLiveMetricHelper(nonLiveState) : getMemorySummary(systemStats, details),
			badge: getMemoryTypeLabel(details) || undefined,
			state: nonLiveState ?? getMetricState(system.info.mp, online),
		},
		{
			key: "disk",
			label: "磁盘",
			value: nonLiveState ? getNonLiveMetricValue(nonLiveState) : formatMetricPercent(system.info.dp),
			helper: nonLiveState ? getNonLiveMetricHelper(nonLiveState) : getDiskSummary(systemStats, smartTotalCapacity),
			badges: [getDiskTypeLabel(smartDisks), temperatures.disk && `温度 ${temperatures.disk}`].filter(Boolean),
			state: nonLiveState ?? getMetricState(system.info.dp, online),
		},
		{
			key: "network",
			label: "网络",
			value: nonLiveState ? getNonLiveMetricValue(nonLiveState) : formatNetworkRate(bandwidth),
			helper: nonLiveState
				? getNonLiveMetricHelper(nonLiveState)
				: getNetworkUsagePercentSummary(bandwidth, networkSummary.linkSpeed),
			badges: [networkSummary.linkSpeed > 0 ? networkSummary.speed : "", networkSummary.ipMethodLabel].filter(Boolean),
			state: nonLiveState ?? (online ? "ok" : "offline"),
		},
		{
			key: "gpu",
			label: "GPU",
			value: nonLiveState
				? getNonLiveMetricValue(nonLiveState)
				: hasGpu
					? getGpuOverviewValue(lastGpus, system.info.g)
					: "未发现",
			helper: nonLiveState
				? getNonLiveMetricHelper(nonLiveState)
				: hasGpu
					? getGpuRuntimeSummary(lastGpus)
					: "未采集到 GPU 数据",
			badges: hasGpu
				? [getPrimaryGpuTypeLabel(lastGpus), temperatures.gpu && `温度 ${temperatures.gpu}`].filter(Boolean)
				: undefined,
			state: nonLiveState ?? (hasGpu ? getMetricState(system.info.g, online) : "muted"),
			disabledReason: !hasGpu ? "这台机器暂未采集到 GPU 数据。" : undefined,
		},
		{
			key: "containers",
			label: "容器",
			value: nonLiveState
				? getNonLiveMetricValue(nonLiveState)
				: hasContainerRuntime
					? `${containerCount} 个`
					: "未发现",
			helper: nonLiveState
				? getNonLiveMetricHelper(nonLiveState)
				: hasContainerRuntime
					? getContainerRuntimeLabel(details, system)
					: "未采集到容器运行时",
			state: nonLiveState ?? (hasContainerRuntime ? "ok" : "muted"),
			disabledReason: !hasContainerRuntime ? "这台机器暂未采集到容器运行时。" : undefined,
		},
	]
}

export function hasCollectedContainerRuntime(details: SystemDetailsRecord | null | undefined, system: SystemRecord) {
	return Boolean(
		details?.container_runtime_name?.trim() ||
			details?.container_runtime_version?.trim() ||
			details?.podman ||
			system.info?.p
	)
}

function formatMetricPercent(value?: number) {
	return isFiniteMetric(value) ? formatPercent(value) : "未采集"
}

function getMetricState(value: number | undefined, online: boolean): MetricState {
	if (!online) {
		return "offline"
	}
	if (!isFiniteMetric(value)) {
		return "muted"
	}
	return getLoadState(value)
}

function isFiniteMetric(value: number | undefined) {
	return typeof value === "number" && Number.isFinite(value)
}

function getNonLiveMetricState(status: SystemRecord["status"]): MetricState | null {
	if (status === SystemStatus.Up) {
		return null
	}
	if (status === SystemStatus.Paused) {
		return "paused"
	}
	if (status === SystemStatus.Pending) {
		return "pending"
	}
	return "offline"
}

function getNonLiveMetricValue(state: MetricState) {
	switch (state) {
		case "paused":
			return "暂停"
		case "pending":
			return "待接入"
		case "offline":
			return "离线"
		default:
			return "未采集"
	}
}

function getNonLiveMetricHelper(state: MetricState) {
	switch (state) {
		case "paused":
			return "监控已暂停，指标不会继续刷新。"
		case "pending":
			return "等待 Agent 首次接入，尚未采集指标。"
		case "offline":
			return "设备离线，历史图表仅供参考。"
		default:
			return "当前没有可展示的实时指标。"
	}
}
