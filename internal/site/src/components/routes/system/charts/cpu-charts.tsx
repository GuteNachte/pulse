import { t } from "@lingui/core/macro"
import AreaChartDefault from "@/components/charts/area-chart"
import { percentTickString, percentValueString } from "@/lib/utils"
import type { ChartData } from "@/types"
import { pinnedAxisDomain } from "@/components/ui/chart"
import { ChartCard, SelectAvgMax } from "../chart-card"
import { dockerOrPodman } from "../chart-data"

export function CpuChart({
	chartData,
	grid,
	dataEmpty,
	showMax,
	isLongerChart,
	maxValues,
}: {
	chartData: ChartData
	grid: boolean
	dataEmpty: boolean
	showMax: boolean
	isLongerChart: boolean
	maxValues: boolean
}) {
	return (
		<div id="cpu-detail-monitor" className="scroll-mt-24">
			<ChartCard
				empty={dataEmpty}
				grid={grid}
				title={t`CPU Usage`}
				description={t`Average system-wide CPU utilization`}
				cornerEl={isLongerChart ? <SelectAvgMax max={maxValues} /> : null}
			>
				<AreaChartDefault
					chartData={chartData}
					maxToggled={showMax}
					dataPoints={[
						{
							label: t`CPU Usage`,
							dataKey: ({ stats }) => (showMax ? stats?.cpum : stats?.cpu),
							color: 1,
							opacity: 0.4,
						},
					]}
					tickFormatter={(val) => percentTickString(val)}
					contentFormatter={({ value }) => percentValueString(value)}
					domain={pinnedAxisDomain()}
				/>
			</ChartCard>
		</div>
	)
}

export function ContainerCpuChart({
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
	return (
		<ChartCard
			empty={dataEmpty}
			grid={grid}
			title={dockerOrPodman(t`Docker CPU Usage`, isPodman)}
			description={t`Total CPU utilization of containers`}
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
								return total + (Number(value.c) || 0)
							}, 0),
						color: 1,
						opacity: 0.4,
					},
				]}
				tickFormatter={(val) => percentTickString(val)}
				contentFormatter={({ value }) => percentValueString(value)}
				domain={pinnedAxisDomain()}
			/>
		</ChartCard>
	)
}
