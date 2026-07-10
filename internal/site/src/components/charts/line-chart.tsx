import { type ReactNode, useEffect, useMemo, useState } from "react"
import { CartesianGrid, Line, LineChart, YAxis } from "recharts"
import {
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
	ChartTooltipContent,
	xAxis,
} from "@/components/ui/chart"
import { getChartRenderPointLimit, limitChartRecords } from "@/lib/chart-sampling"
import { useIntersectionObserver } from "@/lib/use-intersection-observer"
import { chartMargin, cn, formatShortDate } from "@/lib/utils"
import type { ChartData, SystemStatsRecord } from "@/types"
import { useYAxisWidth } from "./hooks"
import type { AxisDomain } from "recharts/types/util/types"

export type DataPoint<T = SystemStatsRecord> = {
	label: string
	dataKey: (data: T) => number | null | undefined
	color: number | string
	stackId?: string | number
	order?: number
	strokeOpacity?: number
	activeDot?: boolean
}

export default function LineChartDefault({
	chartData,
	customData,
	max,
	maxToggled,
	tickFormatter,
	contentFormatter,
	dataPoints,
	domain,
	legend,
	itemSorter,
	showTotal = false,
	reverseStackOrder = false,
	hideYAxis = false,
	filter,
	truncate = false,
	chartProps,
}: {
	chartData: ChartData
	// biome-ignore lint/suspicious/noExplicitAny: accepts different data source types (systemStats or containerData)
	customData?: any[]
	max?: number
	maxToggled?: boolean
	tickFormatter: (value: number, index: number) => string
	// biome-ignore lint/suspicious/noExplicitAny: recharts tooltip item interop
	contentFormatter: (item: any, key: string) => ReactNode
	// biome-ignore lint/suspicious/noExplicitAny: accepts DataPoint with different generic types
	dataPoints?: DataPoint<any>[]
	domain?: AxisDomain
	legend?: boolean
	showTotal?: boolean
	// biome-ignore lint/suspicious/noExplicitAny: recharts tooltip item interop
	itemSorter?: (a: any, b: any) => number
	reverseStackOrder?: boolean
	hideYAxis?: boolean
	filter?: string
	truncate?: boolean
	chartProps?: Omit<React.ComponentProps<typeof LineChart>, "data" | "margin">
}) {
	const { yAxisWidth, updateYAxisWidth } = useYAxisWidth()
	const { isIntersecting, ref } = useIntersectionObserver({ freeze: false })
	const sourceData = customData ?? chartData.systemStats
	const sampledSourceData = useMemo(
		() => limitChartRecords(sourceData, getChartRenderPointLimit(chartData.chartTime)),
		[sourceData, chartData.chartTime]
	)
	const [displayData, setDisplayData] = useState(sampledSourceData)
	const [displayMaxToggled, setDisplayMaxToggled] = useState(maxToggled)

	// Reduce chart redraws by only updating while visible or when chart time changes
	useEffect(() => {
		const shouldPrimeData = sampledSourceData.length && !displayData.length
		const sourceChanged = sampledSourceData !== displayData
		const shouldUpdate = shouldPrimeData || (sourceChanged && isIntersecting)
		if (shouldUpdate) {
			setDisplayData(sampledSourceData)
		}
		if (isIntersecting && maxToggled !== displayMaxToggled) {
			setDisplayMaxToggled(maxToggled)
		}
	}, [displayData, displayMaxToggled, isIntersecting, maxToggled, sampledSourceData])

	// Use a stable key derived from data point identities and visual properties
	const linesKey = dataPoints?.map((d) => `${d.label}:${d.strokeOpacity ?? ""}`).join("\0")
	const resolvedChartMargin = useMemo(() => {
		const baseMargin = hideYAxis ? { ...chartMargin, left: 5 } : chartMargin
		return legend ? { ...baseMargin, bottom: Math.max(baseMargin.bottom ?? 0, 30) } : baseMargin
	}, [hideYAxis, legend])

	const Lines = useMemo(() => {
		return dataPoints?.map((dataPoint, i) => {
			let { color } = dataPoint
			if (typeof color === "number") {
				color = `var(--chart-${color})`
			}
			return (
				<Line
					key={dataPoint.label}
					dataKey={dataPoint.dataKey}
					name={dataPoint.label}
					type="monotoneX"
					dot={false}
					strokeWidth={1.5}
					stroke={color}
					strokeOpacity={dataPoint.strokeOpacity}
					isAnimationActive={false}
					// stackId={dataPoint.stackId}
					order={dataPoint.order || i}
					activeDot={dataPoint.activeDot ?? true}
				/>
			)
		})
	}, [linesKey, displayMaxToggled])

	return useMemo(() => {
		if (displayData.length === 0) {
			return null
		}
		return (
			<ChartContainer
				ref={ref}
				className={cn("h-full w-full absolute aspect-auto bg-transparent opacity-0 transition-opacity", {
					"opacity-100": yAxisWidth || hideYAxis,
					"ps-4": hideYAxis,
				})}
			>
				<LineChart
					reverseStackOrder={reverseStackOrder}
					accessibilityLayer
					data={displayData}
					margin={resolvedChartMargin}
					{...chartProps}
				>
					<CartesianGrid vertical={false} />
					{!hideYAxis && (
						<YAxis
							direction="ltr"
							orientation={chartData.orientation}
							className=""
							width={yAxisWidth}
							domain={domain ?? [0, max ?? "auto"]}
							tickFormatter={(value, index) => updateYAxisWidth(tickFormatter(value, index))}
							tickLine={false}
							axisLine={false}
						/>
					)}
					{xAxis(chartData)}
					<ChartTooltip
						animationEasing="ease-out"
						animationDuration={150}
						// @ts-expect-error
						itemSorter={itemSorter}
						content={
							<ChartTooltipContent
								labelFormatter={(_, data) => formatShortDate(data[0].payload.created)}
								contentFormatter={contentFormatter}
								showTotal={showTotal}
								filter={filter}
								truncate={truncate}
							/>
						}
					/>
					{Lines}
					{legend && <ChartLegend content={<ChartLegendContent />} />}
				</LineChart>
			</ChartContainer>
		)
	}, [displayData, yAxisWidth, filter, Lines, resolvedChartMargin])
}
