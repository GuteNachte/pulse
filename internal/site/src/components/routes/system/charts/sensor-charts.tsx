import { t } from "@lingui/core/macro"
import AreaChartDefault from "@/components/charts/area-chart"
import { batteryStateTranslations } from "@/lib/i18n"
import { $userSettings } from "@/lib/stores"
import { cn, decimalString, formatTemperature, percentTickString, percentValueString, toFixedFloat } from "@/lib/utils"
import type { ChartData, SystemStatsRecord } from "@/types"
import type { Unit } from "@/lib/enums"
import { ChartCard } from "../chart-card"
import {
	buildTemperatureSensors,
	TEMPERATURE_CATEGORY_LABELS,
	type TemperatureCategory,
	type TemperatureSensor,
} from "../temperature-sensors"
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
	category,
	title,
}: {
	chartData: ChartData
	grid: boolean
	dataEmpty: boolean
	setPageBottomExtraMargin?: (margin: number) => void
	category: TemperatureCategory
	title?: string
}) {
	const showTempChart = chartData.systemStats.at(-1)?.stats.t

	const userSettings = useStore($userSettings)

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

	const sensors = useMemo(() => {
		const keys = new Set<string>()
		for (const data of statsRef.current) {
			const temps = data.stats?.t
			if (!temps) continue
			for (const key of Object.keys(temps)) {
				keys.add(key)
			}
		}
		return buildTemperatureSensors([...keys])
	}, [sensorNamesKey])

	const categorySensors = useMemo(() => sensors.filter((sensor) => sensor.category === category), [sensors, category])
	const latestTemperatureSummary = getLatestTemperatureSummary(chartData, userSettings.unitTemp, categorySensors)

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

	const labelByKey = useMemo(
		() => new Map(categorySensors.map((sensor) => [sensor.key, sensor.label])),
		[categorySensors]
	)

	const dataPoints = useMemo(
		() =>
			sortedKeys
				.filter((key) => labelByKey.has(key))
				.map((key) => ({
					label: labelByKey.get(key) ?? key,
					dataKey: dataKeys[key],
					color: colorMap[key],
				})),
		[sortedKeys, dataKeys, colorMap, labelByKey]
	)

	const chartRef = useRef<HTMLDivElement>(null)
	const [addMargin, setAddMargin] = useState(false)
	const marginPx = (dataPoints.length - 13) * 18

	useEffect(() => {
		if (setPageBottomExtraMargin && dataPoints.length > 13 && chartRef.current) {
			const checkPosition = () => {
				if (!chartRef.current) return
				// 桌面端整页滚动已改为内容区内部滚动，页底距离要相对最近的滚动容器计算
				const scroller = chartRef.current.closest(".overflow-y-auto") ?? document.documentElement
				const scrollerRect = scroller.getBoundingClientRect()
				const rect = chartRef.current.getBoundingClientRect()
				const base = scrollerRect.bottom
				const actualBottom = addMargin ? base - marginPx : base
				const distanceToBottom = actualBottom - rect.bottom

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

	if (!showTempChart || categorySensors.length === 0) {
		return null
	}

	const legend = dataPoints.length <= 6
	const cardTitle = title ?? (category === "cpu" ? "CPU 温度" : `${TEMPERATURE_CATEGORY_LABELS[category]}温度`)

	return (
		<div ref={chartRef} className={cn("odd:last-of-type:col-span-full", { "col-span-full": !grid })}>
			<ChartCard
				empty={dataEmpty}
				grid={grid}
				title={cardTitle}
				description="按部件分组的传感器温度"
				titleSuffix={latestTemperatureSummary}
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
				></LineChartDefault>
			</ChartCard>
		</div>
	)
}

function getLatestTemperatureSummary(chartData: ChartData, unitTemp: Unit | undefined, sensors: TemperatureSensor[]) {
	if (!sensors.length) {
		return null
	}
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

	const sensorKeys = new Set(sensors.map((sensor) => sensor.key))
	const labelByKey = new Map(sensors.map((sensor) => [sensor.key, sensor.label]))
	const entries = Object.entries(latestTemps)
		.filter(([key, value]) => sensorKeys.has(key) && Number.isFinite(value))
		.sort((a, b) => b[1] - a[1])
	const [primary] = entries
	if (!primary) {
		return null
	}
	const [sensorKey, sensorValue] = primary
	const { value, unit } = formatTemperature(sensorValue, unitTemp)
	const remaining = entries.length - 1

	return (
		<div className="flex min-w-0 flex-wrap items-center gap-1.5">
			<Badge variant="outline" className="h-6 max-w-72 rounded-md px-2 text-[11px] font-medium text-muted-foreground">
				<span className="truncate">{labelByKey.get(sensorKey) ?? "其他传感器"}</span>
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
