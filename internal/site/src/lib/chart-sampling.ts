import type { ChartTimes } from "@/types"

type ChartRecord = {
	created?: string | number | null
}

const DATA_POINT_LIMITS: Record<ChartTimes, number> = {
	"1m": 120,
	"1h": 240,
	"12h": 288,
	"24h": 288,
	"1w": 336,
	"30d": 360,
}

const RENDER_POINT_LIMITS: Record<ChartTimes, number> = {
	"1m": 90,
	"1h": 120,
	"12h": 144,
	"24h": 144,
	"1w": 168,
	"30d": 180,
}

export function getChartDataPointLimit(chartTime: ChartTimes) {
	return DATA_POINT_LIMITS[chartTime] ?? 240
}

export function getChartRenderPointLimit(chartTime: ChartTimes) {
	return RENDER_POINT_LIMITS[chartTime] ?? 144
}

export function limitChartRecords<T extends ChartRecord>(records: T[], maxPoints: number): T[] {
	const limit = Math.floor(maxPoints)
	if (!Number.isFinite(limit) || limit <= 0) {
		return []
	}
	if (records.length <= limit) {
		return records
	}
	if (limit === 1) {
		return [records[records.length - 1]]
	}

	const selected = new Set<number>([0, records.length - 1])
	const nullIndexes: number[] = []
	const dataIndexes: number[] = []

	for (let i = 1; i < records.length - 1; i++) {
		if (records[i].created === null) {
			nullIndexes.push(i)
		} else {
			dataIndexes.push(i)
		}
	}

	const nullBudget = Math.min(nullIndexes.length, Math.max(0, Math.floor(limit / 4) - selected.size))
	addEvenlySpacedIndexes(selected, nullIndexes, nullBudget)
	addEvenlySpacedIndexes(selected, dataIndexes, limit - selected.size)

	return Array.from(selected)
		.sort((a, b) => a - b)
		.map((index) => records[index])
}

function addEvenlySpacedIndexes(selected: Set<number>, indexes: number[], budget: number) {
	if (budget <= 0 || indexes.length === 0) {
		return
	}
	if (indexes.length <= budget) {
		for (const index of indexes) {
			selected.add(index)
		}
		return
	}
	if (budget === 1) {
		selected.add(indexes[indexes.length - 1])
		return
	}

	for (let i = 0; i < budget; i++) {
		const sourceIndex = Math.round((i * (indexes.length - 1)) / (budget - 1))
		selected.add(indexes[sourceIndex])
	}
}
