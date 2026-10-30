import { t } from "@lingui/core/macro"
import type { DataPoint } from "@/components/charts/area-chart"
import { compareSemVer, parseSemVer } from "@/lib/utils"
import type { ChartData, SemVer, SystemStatsRecord } from "@/types"

const minAgentVersion = parseSemVer("0.15.3")

export function supportsCpuBreakdown(agentVersion: SemVer) {
	return compareSemVer(agentVersion, minAgentVersion) >= 0
}

export function getCpuCoreCount(chartData: ChartData) {
	return chartData.systemStats.at(-1)?.stats?.cpus?.length ?? 0
}

export function hasCpuTimeBreakdown(chartData: ChartData) {
	return (chartData.systemStats.at(-1)?.stats?.cpub?.length ?? 0) > 0
}

export function getHighestCpuCorePct(chartData: ChartData, numCores: number) {
	let highestCpuCorePct = 1
	for (let i = 0; i < numCores; i++) {
		for (let j = 0; j < chartData.systemStats.length; j++) {
			const pct = chartData.systemStats[j].stats?.cpus?.[i] ?? 0
			if (pct > highestCpuCorePct) {
				highestCpuCorePct = pct
			}
		}
	}
	return highestCpuCorePct
}

export function buildCpuBreakdownDataPoints() {
	return [
		{
			label: "System",
			dataKey: ({ stats }: SystemStatsRecord) => stats?.cpub?.[1],
			color: 3,
			opacity: 0.35,
			stackId: "a",
		},
		{
			label: "User",
			dataKey: ({ stats }: SystemStatsRecord) => stats?.cpub?.[0],
			color: 1,
			opacity: 0.35,
			stackId: "a",
		},
		{
			label: "IOWait",
			dataKey: ({ stats }: SystemStatsRecord) => stats?.cpub?.[2],
			color: 4,
			opacity: 0.35,
			stackId: "a",
		},
		{
			label: "Steal",
			dataKey: ({ stats }: SystemStatsRecord) => stats?.cpub?.[3],
			color: 5,
			opacity: 0.35,
			stackId: "a",
		},
		{
			label: "Idle",
			dataKey: ({ stats }: SystemStatsRecord) => stats?.cpub?.[4],
			color: 2,
			opacity: 0.35,
			stackId: "a",
		},
		{
			label: t`Other`,
			dataKey: ({ stats }: SystemStatsRecord) => {
				const total = stats?.cpub?.reduce((acc, curr) => acc + curr, 0) ?? 0
				return total > 0 ? 100 - total : null
			},
			color: `hsl(80, 65%, 52%)`,
			opacity: 0.35,
			stackId: "a",
		},
	] as DataPoint[]
}

export function getCpuCoreColor(
	coreIndex: number,
	numCores: number,
	saturation = "var(--chart-saturation)",
	lightness = "var(--chart-lightness)"
) {
	return `hsl(${226 + (((coreIndex * 360) / Math.max(1, numCores)) % 360)}, ${saturation}, ${lightness})`
}

export function buildCpuCoreDataPoints(numCores: number) {
	return Array.from({ length: numCores }).map((_, i) => ({
		label: `CPU ${i}`,
		dataKey: ({ stats }: SystemStatsRecord) => stats?.cpus?.[i] ?? 1 / (stats?.cpus?.length ?? 1),
		color: getCpuCoreColor(i, numCores),
		opacity: 0.35,
		stackId: "a",
	})) as DataPoint[]
}

export function buildSingleCpuCoreDataPoint(coreIndex: number, numCores: number) {
	return [
		{
			label: t`Usage`,
			dataKey: ({ stats }: SystemStatsRecord) => stats?.cpus?.[coreIndex],
			color: getCpuCoreColor(coreIndex, numCores, "65%", "52%"),
			opacity: 0.35,
		},
	] as DataPoint[]
}
