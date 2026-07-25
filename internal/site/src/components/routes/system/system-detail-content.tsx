import type { ChartData, GPUData, SystemDetailsRecord, SystemRecord } from "@/types"
import { GpuIcon } from "../../ui/icons"
import ContainersTable from "../../containers-table/containers-table"
import OperationHistoryCard from "../../operation-history-card"
import type { DetailView } from "@/components/mobile/mobile-system-detail"
import { CpuChart, ContainerCpuChart } from "./charts/cpu-charts"
import { MemoryChart, ContainerMemoryChart, SwapChart } from "./charts/memory-charts"
import { RootDiskCharts } from "./charts/disk-charts"
import { BandwidthChart, ContainerNetworkChart } from "./charts/network-charts"
import { TemperatureChart, BatteryChart } from "./charts/sensor-charts"
import { GpuPowerChart, GpuDetailCharts } from "./charts/gpu-charts"
import { LazyMonitoredServicesTable, LazySmartTable } from "./lazy-tables"
import { LoadAverageChart } from "./charts/load-average-chart"
import { CpuCoresDetailContent } from "./cpu-sheet"
import { NetworkDetailContent, PrimaryNetworkInterfaceInfoCard } from "./network-sheet"
import { SystemWebsiteMonitorsCard } from "./website-monitors-card"
import { ContainersUnavailableCard, DetailUnavailableCard, MetricEmptyCard } from "./status-summary-cards"
import type { useSystemData } from "./use-system-data"
import AgentHealthCard from "./agent-health-card"

export type SystemDetailContentProps = {
	view: DetailView
	system: SystemRecord
	systemStats: ChartData["systemStats"]
	chartData: ChartData
	systemData: ReturnType<typeof useSystemData>
	grid: boolean
	showMax: boolean
	isLongerChart: boolean
	maxValues: boolean
	dataEmpty: boolean
	isPodman: boolean
	hasContainers: boolean
	hasContainersTable: boolean
	hasGpu: boolean
	hasGpuData: boolean
	hasGpuPowerData: boolean
	lastGpus?: Record<string, GPUData> | null
	maybeHasSmartData: boolean
	details?: SystemDetailsRecord | null
	hasSoftwareServices: boolean
	pageBottomExtraMargin: number
	setPageBottomExtraMargin: (value: number) => void
	compactMobile?: boolean
}

export function SystemDetailContent({
	view,
	system,
	systemStats,
	chartData,
	systemData,
	grid,
	showMax,
	isLongerChart,
	maxValues,
	dataEmpty,
	isPodman,
	hasContainers,
	hasContainersTable,
	hasGpu,
	hasGpuData,
	hasGpuPowerData,
	lastGpus,
	maybeHasSmartData,
	details,
	hasSoftwareServices,
	pageBottomExtraMargin,
	setPageBottomExtraMargin,
	compactMobile,
}: SystemDetailContentProps) {
	const coreProps = { chartData, grid, dataEmpty, showMax, isLongerChart, maxValues }
	const hasNetworkDetail = hasCollectedNetworkDetail(chartData, details)

	return (
		<section className="grid pulse-card-gap">
			{view === "overview" && (
				<div className="grid pulse-card-gap xl:grid-cols-2">
					<CpuChart {...coreProps} />
					<LoadAverageChart chartData={chartData} grid={grid} dataEmpty={dataEmpty} />
					{!compactMobile && (
						<>
							<TemperatureChart {...coreProps} setPageBottomExtraMargin={setPageBottomExtraMargin} />
							<BatteryChart {...coreProps} />
						</>
					)}
					{pageBottomExtraMargin > 0 && <div style={{ marginBottom: pageBottomExtraMargin }}></div>}
				</div>
			)}

			{view === "overview" && !compactMobile && (
				<CpuCoresDetailContent chartData={chartData} dataEmpty={dataEmpty} grid={grid} maxValues={maxValues} />
			)}

			{view === "memory" && (
				<div className="grid pulse-card-gap">
					<MemoryChart {...coreProps} />
					<SwapChart chartData={chartData} grid={grid} dataEmpty={dataEmpty} systemStats={systemStats} />
				</div>
			)}

			{view === "disk" && (
				<div className="grid pulse-card-gap">
					<RootDiskCharts systemData={systemData} />
					{maybeHasSmartData && <LazySmartTable systemId={system.id} os={details?.os} />}
				</div>
			)}

			{view === "network" && (
				<div className="grid pulse-card-gap">
					{hasNetworkDetail ? (
						<>
							<PrimaryNetworkInterfaceInfoCard details={details} chartData={chartData} />
							<BandwidthChart {...coreProps} systemStats={systemStats} />
							<NetworkDetailContent chartData={chartData} dataEmpty={dataEmpty} grid={grid} maxValues={maxValues} />
						</>
					) : (
						<DetailUnavailableCard
							title="网络详情未采集"
							description="这台机器当前没有上报网卡流量或网卡详情。恢复采集后会显示 IPv4、IPv6、网关、DNS、链路速率和流量图。"
						/>
					)}
				</div>
			)}

			{view === "containers" && (
				<div className="grid pulse-card-gap">
					{hasContainers ? (
						<>
							<div className="grid grid-cols-1 pulse-card-gap xl:grid-cols-2">
								<ContainerCpuChart chartData={chartData} grid={grid} dataEmpty={dataEmpty} isPodman={isPodman} />
								<ContainerMemoryChart chartData={chartData} grid={grid} dataEmpty={dataEmpty} isPodman={isPodman} />
							</div>
							<ContainerNetworkChart chartData={chartData} grid={grid} dataEmpty={dataEmpty} isPodman={isPodman} />
							{hasContainersTable && <ContainersTable systemId={system.id} />}
						</>
					) : (
						<ContainersUnavailableCard system={system} />
					)}
				</div>
			)}

			{view === "gpu" && (
				<div className="grid grid-cols-1 pulse-card-gap xl:grid-cols-2">
					{hasGpuData && lastGpus && (
						<GpuDetailCharts
							chartData={chartData}
							grid={grid}
							dataEmpty={dataEmpty}
							lastGpus={lastGpus as Record<string, GPUData>}
						/>
					)}
					{hasGpuPowerData && <GpuPowerChart chartData={chartData} grid={grid} dataEmpty={dataEmpty} />}
					{!hasGpu && <MetricEmptyCard title="未采集到 GPU 数据" icon={GpuIcon} />}
				</div>
			)}

			{view === "services" && hasSoftwareServices && <LazyMonitoredServicesTable systemId={system.id} onlyConfigured />}

			{view === "websites" && <SystemWebsiteMonitorsCard systemId={system.id} />}

			{view === "history" && (
				<div className="grid pulse-card-gap">
					<AgentHealthCard system={system} />
					<OperationHistoryCard systemId={system.id} />
				</div>
			)}
		</section>
	)
}

function hasCollectedNetworkDetail(chartData: ChartData, details?: SystemDetailsRecord | null) {
	const latestInterfaces = chartData.systemStats.at(-1)?.stats?.ni ?? {}
	return Object.keys(latestInterfaces).length > 0 || Boolean(details?.network_interfaces?.length)
}
