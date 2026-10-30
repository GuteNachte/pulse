import { t } from "@lingui/core/macro"
import { MoreHorizontalIcon } from "lucide-react"
import { memo, useRef, useState, type ReactElement } from "react"
import AreaChartDefault from "@/components/charts/area-chart"
import { Button } from "@/components/ui/button"
import { Sheet, SheetTrigger } from "@/components/ui/sheet"
import { DialogTitle } from "@/components/ui/dialog"
import { percentTickString, percentValueString } from "@/lib/utils"
import type { ChartData } from "@/types"
import { ChartCard } from "./chart-card"
import {
	buildCpuBreakdownDataPoints,
	buildCpuCoreDataPoints,
	buildSingleCpuCoreDataPoint,
	getCpuCoreCount,
	getHighestCpuCorePct,
	hasCpuTimeBreakdown,
	supportsCpuBreakdown,
} from "./cpu-sheet-utils"
import { SystemDetailSheetContent } from "./detail-sheet-layout"

export default memo(function CpuCoresSheet({
	chartData,
	dataEmpty,
	grid,
	maxValues,
	open,
	onOpenChange,
	hideTrigger,
	trigger,
	fallback,
}: {
	chartData: ChartData
	dataEmpty: boolean
	grid: boolean
	maxValues: boolean
	open?: boolean
	onOpenChange?: (open: boolean) => void
	hideTrigger?: boolean
	trigger?: ReactElement
	fallback?: ReactElement
}) {
	const [internalOpen, setInternalOpen] = useState(false)
	const cpuCoresOpen = open ?? internalOpen
	const setCpuCoresOpen = onOpenChange ?? setInternalOpen
	const hasOpened = useRef(false)

	const supportsBreakdown = supportsCpuBreakdown(chartData.agentVersion)

	if (!supportsBreakdown) {
		return fallback ?? null
	}

	if (cpuCoresOpen && !hasOpened.current) {
		hasOpened.current = true
	}

	return (
		<Sheet modal={false} open={cpuCoresOpen} onOpenChange={setCpuCoresOpen}>
			<DialogTitle className="sr-only">{t`CPU Usage`}</DialogTitle>
			{!hideTrigger && (
				<SheetTrigger asChild>
					{trigger ?? (
						<Button
							title={t`View more`}
							variant="outline"
							size="icon"
							className="shrink-0 max-sm:absolute max-sm:top-0 max-sm:end-0"
						>
							<MoreHorizontalIcon />
						</Button>
					)}
				</SheetTrigger>
			)}
			{hasOpened.current && (
				<SystemDetailSheetContent title={t`CPU Usage`} description={t`CPU time breakdown and per-core utilization`}>
					<CpuCoresDetailContent chartData={chartData} dataEmpty={dataEmpty} grid={grid} maxValues={maxValues} />
				</SystemDetailSheetContent>
			)}
		</Sheet>
	)
})

export function CpuCoresDetailContent({
	chartData,
	dataEmpty,
	grid,
	maxValues,
	fallback,
}: {
	chartData: ChartData
	dataEmpty: boolean
	grid: boolean
	maxValues: boolean
	fallback?: ReactElement
}) {
	const supportsBreakdown = supportsCpuBreakdown(chartData.agentVersion)

	if (!supportsBreakdown) {
		return fallback ?? null
	}

	const numCores = getCpuCoreCount(chartData)
	const hasBreakdown = hasCpuTimeBreakdown(chartData)
	const highestCpuCorePct = getHighestCpuCorePct(chartData, numCores)
	const breakdownDataPoints = buildCpuBreakdownDataPoints()

	return (
		<div className="grid gap-4">
			{hasBreakdown && (
				<ChartCard
					key="cpu-breakdown"
					empty={dataEmpty}
					grid={grid}
					title={t`CPU Time Breakdown`}
					description={t`Percentage of time spent in each state`}
					legend={true}
					className="min-h-auto"
				>
					<AreaChartDefault
						chartData={chartData}
						maxToggled={maxValues}
						legend={true}
						dataPoints={breakdownDataPoints}
						tickFormatter={(val) => percentTickString(val)}
						contentFormatter={({ value }) => percentValueString(value)}
						reverseStackOrder={true}
						itemSorter={() => 1}
						domain={[0, 100]}
					/>
				</ChartCard>
			)}

			{numCores > 0 && (
				<ChartCard
					key="cpu-cores-all"
					empty={dataEmpty}
					grid={grid}
					title={t`CPU Cores`}
					legend={numCores < 10}
					description={t`Per-core average utilization`}
					className="min-h-auto"
				>
					<AreaChartDefault
						hideYAxis={true}
						chartData={chartData}
						maxToggled={maxValues}
						legend={numCores < 10}
						dataPoints={buildCpuCoreDataPoints(numCores)}
						tickFormatter={(val) => percentTickString(val, 0)}
						contentFormatter={({ value }) => percentValueString(value, 0)}
						reverseStackOrder={true}
						itemSorter={() => 1}
					/>
				</ChartCard>
			)}

			{numCores > 0 && (
				<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
					{Array.from({ length: numCores }).map((_, i) => (
						<ChartCard
							key={`cpu-core-${i}`}
							empty={dataEmpty}
							grid={true}
							title={`CPU ${i}`}
							description={t`Per-core average utilization`}
							legend={false}
							className="min-h-auto odd:last-of-type:col-span-1"
						>
							<AreaChartDefault
								chartData={chartData}
								maxToggled={maxValues}
								domain={[0, highestCpuCorePct]}
								dataPoints={buildSingleCpuCoreDataPoint(i, numCores)}
								tickFormatter={(val) => percentTickString(val, 0)}
								contentFormatter={({ value }) => percentValueString(value, 0)}
							/>
						</ChartCard>
					))}
				</div>
			)}
		</div>
	)
}
