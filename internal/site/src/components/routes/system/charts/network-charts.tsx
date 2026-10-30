import { t } from "@lingui/core/macro"
import AreaChartDefault from "@/components/charts/area-chart"
import { $userSettings } from "@/lib/stores"
import { decimalString, formatBytes, toFixedFloat } from "@/lib/utils"
import { pinnedAxisDomain } from "@/components/ui/chart"
import type { ChartData, ContainerStats, SystemStatsRecord } from "@/types"
import { ChartCard, SelectAvgMax } from "../chart-card"
import { dockerOrPodman } from "../chart-data"

export function BandwidthChart({
	chartData,
	grid,
	dataEmpty,
	showMax,
	isLongerChart,
	maxValues,
	systemStats,
}: {
	chartData: ChartData
	grid: boolean
	dataEmpty: boolean
	showMax: boolean
	isLongerChart: boolean
	maxValues: boolean
	systemStats: SystemStatsRecord[]
}) {
	const userSettings = $userSettings.get()

	return (
		<div id="bandwidth-detail-monitor" className="scroll-mt-24">
			<ChartCard
				empty={dataEmpty}
				grid={grid}
				title={t`Bandwidth`}
				cornerEl={isLongerChart ? <SelectAvgMax max={maxValues} /> : null}
				description={t`Network traffic of public interfaces`}
			>
				<AreaChartDefault
					chartData={chartData}
					maxToggled={showMax}
					dataPoints={[
						{
							label: t`Sent`,
							dataKey(data: SystemStatsRecord) {
								if (showMax) {
									return data?.stats?.bm?.[0] ?? (data?.stats?.nsm ?? 0) * 1024 * 1024
								}
								return data?.stats?.b?.[0] ?? (data?.stats?.ns ?? 0) * 1024 * 1024
							},
							color: 5,
							opacity: 0.2,
						},
						{
							label: t`Received`,
							dataKey(data: SystemStatsRecord) {
								if (showMax) {
									return data?.stats?.bm?.[1] ?? (data?.stats?.nrm ?? 0) * 1024 * 1024
								}
								return data?.stats?.b?.[1] ?? (data?.stats?.nr ?? 0) * 1024 * 1024
							},
							color: 2,
							opacity: 0.2,
						},
					]
						// try to place the lesser number in front for better visibility
						.sort(() => (systemStats.at(-1)?.stats.b?.[1] ?? 0) - (systemStats.at(-1)?.stats.b?.[0] ?? 0))}
					tickFormatter={(val) => {
						const { value, unit } = formatBytes(val, true, userSettings.unitNet, false)
						return `${toFixedFloat(value, value >= 10 ? 0 : 1)} ${unit}`
					}}
					contentFormatter={(data) => {
						const { value, unit } = formatBytes(data.value, true, userSettings.unitNet, false)
						return `${decimalString(value, value >= 100 ? 1 : 2)} ${unit}`
					}}
					showTotal={true}
				/>
			</ChartCard>
		</div>
	)
}

export function ContainerNetworkChart({
	chartData,
	grid,
	dataEmpty,
	isPodman,
}: {
	chartData: ChartData
	grid: boolean
	dataEmpty: boolean
	isPodman: boolean
}) {
	const userSettings = $userSettings.get()

	return (
		<ChartCard
			empty={dataEmpty}
			grid={grid}
			title={dockerOrPodman(t`Docker Network I/O`, isPodman)}
			description={dockerOrPodman(t`Total network traffic of docker containers`, isPodman)}
		>
			<AreaChartDefault
				chartData={chartData}
				customData={chartData.containerData}
				dataPoints={[
					{
						label: t`Total`,
						dataKey: (data) =>
							Object.entries(data).reduce((total, [key, value]) => {
								if (key === "created" || !value || typeof value !== "object") {
									return total
								}
								const container = value as ContainerStats
								const sent = container.b?.[0] ?? (container.ns ?? 0) * 1024 * 1024
								const recv = container.b?.[1] ?? (container.nr ?? 0) * 1024 * 1024
								return total + sent + recv
							}, 0),
						color: 5,
						opacity: 0.4,
					},
				]}
				tickFormatter={(val) => {
					const { value, unit } = formatBytes(val, true, userSettings.unitNet, false)
					return `${toFixedFloat(value, value >= 10 ? 0 : 1)} ${unit}`
				}}
				contentFormatter={(item) => {
					const { value, unit } = formatBytes(item.value, true, userSettings.unitNet, false)
					return `${decimalString(value, value >= 100 ? 1 : 2)} ${unit}`
				}}
				domain={pinnedAxisDomain()}
			/>
		</ChartCard>
	)
}
