import { t } from "@lingui/core/macro"
import { useStore } from "@nanostores/react"
import { MoreHorizontalIcon } from "lucide-react"
import { memo, useRef, useState } from "react"
import AreaChartDefault from "@/components/charts/area-chart"
import { Button } from "@/components/ui/button"
import { Sheet, SheetTrigger } from "@/components/ui/sheet"
import { DialogTitle } from "@/components/ui/dialog"
import { $userSettings } from "@/lib/stores"
import { decimalString, formatBytes, percentTickString, percentValueString, toFixedFloat } from "@/lib/utils"
import { ChartCard, SelectAvgMax } from "@/components/routes/system/chart-card"
import type { SystemData } from "@/components/routes/system/use-system-data"
import { diskDataFns, DiskUtilizationChart } from "./charts/disk-charts"
import { pinnedAxisDomain } from "@/components/ui/chart"
import {
	buildDiskAwaitDataPoints,
	buildDiskIoTimeDataPoints,
	buildDiskQueueDepthDataPoints,
	buildDiskThroughputDataPoints,
	getDiskIoMetricAvailability,
	getDiskIoMetricFns,
} from "./disk-io-sheet-utils"
import { SystemDetailSheetContent } from "./detail-sheet-layout"

export default memo(function DiskIOSheet({
	systemData,
	extraFsName,
	title,
	description,
}: {
	systemData: SystemData
	extraFsName?: string
	title: string
	description: string
}) {
	const { chartData, grid, dataEmpty, showMax, maxValues, isLongerChart } = systemData
	const userSettings = useStore($userSettings)

	const [sheetOpen, setSheetOpen] = useState(false)

	const hasOpened = useRef(false)

	if (sheetOpen && !hasOpened.current) {
		hasOpened.current = true
	}

	const metricFns = getDiskIoMetricFns({ dataFns: diskDataFns, extraFsName, showMax })
	const { hasUtilization, hasAwait, hasWeightedIO } = getDiskIoMetricAvailability(chartData)

	const maxValSelect = isLongerChart ? <SelectAvgMax max={maxValues} /> : null

	const chartProps = { syncId: "io" }

	const queueDepthTranslation = t({ message: "Queue Depth", context: "Disk I/O average queue depth" })

	return (
		<Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
			<DialogTitle className="sr-only">{title}</DialogTitle>
			<SheetTrigger asChild>
				<Button
					title={t`View more`}
					variant="outline"
					size="icon"
					className="shrink-0 max-sm:absolute max-sm:top-0 max-sm:end-0"
				>
					<MoreHorizontalIcon />
				</Button>
			</SheetTrigger>
			{hasOpened.current && (
				<SystemDetailSheetContent title={title} description={description}>
					<ChartCard
						className="min-h-auto"
						empty={dataEmpty}
						grid={grid}
						title={title}
						description={description}
						cornerEl={maxValSelect}
						// legend={true}
					>
						<AreaChartDefault
							chartData={chartData}
							maxToggled={showMax}
							chartProps={chartProps}
							showTotal={true}
							domain={pinnedAxisDomain()}
							itemSorter={(a, b) => a.order - b.order}
							reverseStackOrder={true}
							dataPoints={buildDiskThroughputDataPoints(metricFns)}
							tickFormatter={(val) => {
								const { value, unit } = formatBytes(val, true, userSettings.unitDisk, false)
								return `${toFixedFloat(value, value >= 10 ? 0 : 1)} ${unit}`
							}}
							contentFormatter={({ value }) => {
								const { value: convertedValue, unit } = formatBytes(value, true, userSettings.unitDisk, false)
								return `${decimalString(convertedValue, convertedValue >= 100 ? 1 : 2)} ${unit}`
							}}
						/>
					</ChartCard>

					{hasUtilization && <DiskUtilizationChart systemData={systemData} extraFsName={extraFsName} />}

					<ChartCard
						empty={dataEmpty}
						grid={grid}
						title={t({ message: "I/O Time", context: "Disk I/O total time spent on read/write" })}
						description={t({
							message: "Total time spent on read/write (can exceed 100%)",
							context: "Disk I/O",
						})}
						className="min-h-auto"
						cornerEl={maxValSelect}
					>
						<AreaChartDefault
							chartData={chartData}
							domain={pinnedAxisDomain()}
							tickFormatter={(val) => percentTickString(val)}
							contentFormatter={({ value }) => percentValueString(value)}
							maxToggled={showMax}
							chartProps={chartProps}
							showTotal={true}
							itemSorter={(a, b) => a.order - b.order}
							reverseStackOrder={true}
							dataPoints={buildDiskIoTimeDataPoints(metricFns)}
						/>
					</ChartCard>

					{hasWeightedIO && (
						<ChartCard
							empty={dataEmpty}
							grid={grid}
							title={queueDepthTranslation}
							description={t`Average number of I/O operations waiting to be serviced`}
							className="min-h-auto"
							cornerEl={maxValSelect}
						>
							<AreaChartDefault
								chartData={chartData}
								domain={pinnedAxisDomain()}
								tickFormatter={(val) => `${toFixedFloat(val, 2)}`}
								contentFormatter={({ value }) => decimalString(value, value < 10 ? 3 : 2)}
								maxToggled={showMax}
								chartProps={chartProps}
								dataPoints={buildDiskQueueDepthDataPoints(queueDepthTranslation, metricFns.weightedIOFn)}
							/>
						</ChartCard>
					)}

					{hasAwait && (
						<ChartCard
							empty={dataEmpty}
							grid={grid}
							title={t({ message: "I/O Await", context: "Disk I/O average operation time (iostat await)" })}
							description={t({
								message: "Average queue to completion time per operation",
								context: "Disk I/O average operation time (iostat await)",
							})}
							className="min-h-auto"
							cornerEl={maxValSelect}
							// legend={true}
						>
							<AreaChartDefault
								chartData={chartData}
								domain={pinnedAxisDomain()}
								tickFormatter={(val) => `${toFixedFloat(val, 2)} ms`}
								contentFormatter={({ value }) => `${decimalString(value)} ms`}
								maxToggled={showMax}
								chartProps={chartProps}
								dataPoints={buildDiskAwaitDataPoints(metricFns)}
							/>
						</ChartCard>
					)}
				</SystemDetailSheetContent>
			)}
		</Sheet>
	)
})
