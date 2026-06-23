import { t } from "@lingui/core/macro"
import AreaChartDefault from "@/components/charts/area-chart"
import { batteryStateTranslations } from "@/lib/i18n"
import { $temperatureFilter, $userSettings } from "@/lib/stores"
import { cn, decimalString, formatTemperature, percentTickString, percentValueString, toFixedFloat } from "@/lib/utils"
import type { ChartData, SystemStatsRecord } from "@/types"
import type { Unit } from "@/lib/enums"
import { ChartCard, FilterBar } from "../chart-card"
import LineChartDefault from "@/components/charts/line-chart"
import { useStore } from "@nanostores/react"
import { useRef, useMemo, useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"

export function BatteryChart({
	chartData,
	grid,
	dataEmpty,
	maxValues,
}: {
	chartData: ChartData
	grid: boolean
	dataEmpty: boolean
	maxValues: boolean
}) {
	const showBatteryChart = chartData.systemStats.at(-1)?.stats.bat

	if (!showBatteryChart) {
		return null
	}

	return (
		<ChartCard
			empty={dataEmpty}
			grid={grid}
			title={t`Battery`}
			description={`${t({
				message: "Current state",
				comment: "Context: Battery state",
			})}: ${batteryStateTranslations[chartData.systemStats.at(-1)?.stats.bat?.[1] ?? 0]()}`}
		>
			<AreaChartDefault
				chartData={chartData}
				maxToggled={maxValues}
				dataPoints={[
					{
						label: t`Charge`,
						dataKey: ({ stats }) => stats?.bat?.[0],
						color: 1,
						opacity: 0.35,
					},
				]}
				domain={[0, 100]}
				tickFormatter={(val) => percentTickString(val, 0)}
				contentFormatter={({ value }) => percentValueString(value, 0)}
			/>
		</ChartCard>
	)
}

export function TemperatureChart({
	chartData,
	grid,
	dataEmpty,
	setPageBottomExtraMargin,
}: {
	chartData: ChartData
	grid: boolean
	dataEmpty: boolean
	setPageBottomExtraMargin?: (margin: number) => void
}) {
	const showTempChart = chartData.systemStats.at(-1)?.stats.t

	const filter = useStore($temperatureFilter)
	const userSettings = useStore($userSettings)
	const latestTemperatureSummary = getLatestTemperatureSummary(chartData, userSettings.unitTemp)

	const statsRef = useRef(chartData.systemStats)
	statsRef.current = chartData.systemStats

	// Derive sensor names key from latest data point
	let sensorNamesKey = ""
	for (let i = chartData.systemStats.length - 1; i >= 0; i--) {
		const t = chartData.systemStats[i].stats?.t
		if (t) {
			sensorNamesKey = Object.keys(t).sort().join("\0")
			break
		}
	}

	// Only recompute colors and dataKey functions when sensor names change
	const { colorMap, dataKeys, sortedKeys } = useMemo(() => {
		const stats = statsRef.current
		const tempSums = {} as Record<string, number>
		for (const data of stats) {
			const t = data.stats?.t
			if (!t) continue
			for (const key of Object.keys(t)) {
				tempSums[key] = (tempSums[key] ?? 0) + t[key]
			}
		}
		const sorted = Object.keys(tempSums).sort((a, b) => tempSums[b] - tempSums[a])
		const colorMap = {} as Record<string, string>
		const dataKeys = {} as Record<string, (d: SystemStatsRecord) => number | undefined>
		for (let i = 0; i < sorted.length; i++) {
			const key = sorted[i]
			colorMap[key] = `hsl(${((i * 360) / sorted.length) % 360}, 60%, 55%)`
			dataKeys[key] = (d: SystemStatsRecord) => d.stats?.t?.[key]
		}
		return { colorMap, dataKeys, sortedKeys: sorted }
	}, [sensorNamesKey])

	const dataPoints = useMemo(() => {
		return sortedKeys.map((key) => {
			const filterTerms = filter
				? filter
						.toLowerCase()
						.split(" ")
						.filter((term) => term.length > 0)
				: []
			const filtered = filterTerms.length > 0 && !filterTerms.some((term) => key.toLowerCase().includes(term))
			const strokeOpacity = filtered ? 0.1 : 1
			return {
				label: key,
				dataKey: dataKeys[key],
				color: colorMap[key],
				strokeOpacity,
				activeDot: !filtered,
			}
		})
	}, [sortedKeys, filter, dataKeys, colorMap])

	// test with lots of data points
	// const totalPoints = 50
	// if (dataPoints.length > 0 && dataPoints.length < totalPoints) {
	// 	let i = 0
	// 	while (dataPoints.length < totalPoints) {
	// 		dataPoints.push({
	// 			label: `Test ${++i}`,
	// 			dataKey: () => 0,
	// 			color: "red",
	// 			strokeOpacity: 1,
	// 		})
	// 	}
	// }

	const chartRef = useRef<HTMLDivElement>(null)
	const [addMargin, setAddMargin] = useState(false)
	const marginPx = (dataPoints.length - 13) * 18

	useEffect(() => {
		if (setPageBottomExtraMargin && dataPoints.length > 13 && chartRef.current) {
			const checkPosition = () => {
				if (!chartRef.current) return
				const rect = chartRef.current.getBoundingClientRect()
				const actualScrollHeight = addMargin
					? document.documentElement.scrollHeight - marginPx
					: document.documentElement.scrollHeight
				const distanceToBottom = actualScrollHeight - (rect.bottom + window.scrollY)

				if (distanceToBottom < 250) {
					setAddMargin(true)
					setPageBottomExtraMargin(marginPx)
				} else {
					setAddMargin(false)
					setPageBottomExtraMargin(0)
				}
			}
			checkPosition()
			const timer = setTimeout(checkPosition, 500)
			return () => {
				clearTimeout(timer)
			}
		} else if (addMargin) {
			setAddMargin(false)
			if (setPageBottomExtraMargin) setPageBottomExtraMargin(0)
		}
	}, [dataPoints.length, addMargin, marginPx, setPageBottomExtraMargin])

	if (!showTempChart) {
		return null
	}

	const legend = dataPoints.length < 12

	return (
		<div ref={chartRef} className={cn("odd:last-of-type:col-span-full", { "col-span-full": !grid })}>
			<ChartCard
				empty={dataEmpty}
				grid={grid}
				title={t`Temperature`}
				description={t`Temperatures of system sensors`}
				titleSuffix={latestTemperatureSummary}
				cornerEl={<FilterBar store={$temperatureFilter} />}
				legend={legend}
			>
				<LineChartDefault
					chartData={chartData}
					itemSorter={(a, b) => b.value - a.value}
					domain={["auto", "auto"]}
					legend={legend}
					tickFormatter={(val) => {
						const { value, unit } = formatTemperature(val, userSettings.unitTemp)
						return `${toFixedFloat(value, 2)} ${unit}`
					}}
					contentFormatter={(item) => {
						const { value, unit } = formatTemperature(item.value, userSettings.unitTemp)
						return `${decimalString(value)} ${unit}`
					}}
					dataPoints={dataPoints}
					filter={filter}
				></LineChartDefault>
			</ChartCard>
		</div>
	)
}

function getLatestTemperatureSummary(chartData: ChartData, unitTemp?: Unit) {
	let latestTemps: Record<string, number> | undefined
	for (let i = chartData.systemStats.length - 1; i >= 0; i--) {
		const temps = chartData.systemStats[i].stats?.t
		if (temps && Object.keys(temps).length > 0) {
			latestTemps = temps
			break
		}
	}
	if (!latestTemps) {
		return null
	}

	const entries = Object.entries(latestTemps)
		.filter(([, value]) => Number.isFinite(value))
		.sort((a, b) => b[1] - a[1])
	const [primary] = entries
	if (!primary) {
		return null
	}
	const [sensorName, sensorValue] = primary
	const { value, unit } = formatTemperature(sensorValue, unitTemp)
	const remaining = entries.length - 1

	return (
		<div className="flex min-w-0 flex-wrap items-center gap-1.5">
			<Badge variant="outline" className="h-6 max-w-72 rounded-md px-2 text-[11px] font-medium text-muted-foreground">
				<span className="truncate">{sensorName}</span>
				<span className="ml-1 tabular-nums text-foreground">
					{decimalString(value, value >= 100 ? 1 : 2)} {unit}
				</span>
			</Badge>
			{remaining > 0 && (
				<Badge variant="outline" className="h-6 rounded-md px-2 text-[11px] font-medium text-muted-foreground">
					另 {remaining} 个
				</Badge>
			)}
		</div>
	)
}
