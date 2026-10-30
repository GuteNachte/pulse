import { t } from "@lingui/core/macro"
import type { DataPoint } from "@/components/charts/area-chart"
import type { ChartData, SystemStatsRecord } from "@/types"

type DiskMetricFn = (record: SystemStatsRecord) => number

export type DiskIoDataFns = {
	read: DiskMetricFn
	readMax: DiskMetricFn
	write: DiskMetricFn
	writeMax: DiskMetricFn
	extraRead: (name: string) => DiskMetricFn
	extraReadMax: (name: string) => DiskMetricFn
	extraWrite: (name: string) => DiskMetricFn
	extraWriteMax: (name: string) => DiskMetricFn
	readTime: DiskMetricFn
	readTimeMax: DiskMetricFn
	writeTime: DiskMetricFn
	writeTimeMax: DiskMetricFn
	extraReadTime: (name: string) => DiskMetricFn
	extraReadTimeMax: (name: string) => DiskMetricFn
	extraWriteTime: (name: string) => DiskMetricFn
	extraWriteTimeMax: (name: string) => DiskMetricFn
	rAwait: DiskMetricFn
	rAwaitMax: DiskMetricFn
	wAwait: DiskMetricFn
	wAwaitMax: DiskMetricFn
	extraRAwait: (name: string) => DiskMetricFn
	extraRAwaitMax: (name: string) => DiskMetricFn
	extraWAwait: (name: string) => DiskMetricFn
	extraWAwaitMax: (name: string) => DiskMetricFn
	weightedIO: DiskMetricFn
	weightedIOMax: DiskMetricFn
	extraWeightedIO: (name: string) => DiskMetricFn
	extraWeightedIOMax: (name: string) => DiskMetricFn
}

export type DiskIoMetricFns = {
	readFn: DiskMetricFn
	writeFn: DiskMetricFn
	readTimeFn: DiskMetricFn
	writeTimeFn: DiskMetricFn
	rAwaitFn: DiskMetricFn
	wAwaitFn: DiskMetricFn
	weightedIOFn: DiskMetricFn
}

export type DiskIoMetricAvailability = {
	hasUtilization: boolean
	hasAwait: boolean
	hasWeightedIO: boolean
}

export function getDiskIoMetricFns({
	dataFns,
	extraFsName,
	showMax,
}: {
	dataFns: DiskIoDataFns
	extraFsName?: string
	showMax: boolean
}): DiskIoMetricFns {
	if (extraFsName) {
		return {
			readFn: showMax ? dataFns.extraReadMax(extraFsName) : dataFns.extraRead(extraFsName),
			writeFn: showMax ? dataFns.extraWriteMax(extraFsName) : dataFns.extraWrite(extraFsName),
			readTimeFn: showMax ? dataFns.extraReadTimeMax(extraFsName) : dataFns.extraReadTime(extraFsName),
			writeTimeFn: showMax ? dataFns.extraWriteTimeMax(extraFsName) : dataFns.extraWriteTime(extraFsName),
			rAwaitFn: showMax ? dataFns.extraRAwaitMax(extraFsName) : dataFns.extraRAwait(extraFsName),
			wAwaitFn: showMax ? dataFns.extraWAwaitMax(extraFsName) : dataFns.extraWAwait(extraFsName),
			weightedIOFn: showMax ? dataFns.extraWeightedIOMax(extraFsName) : dataFns.extraWeightedIO(extraFsName),
		}
	}

	return {
		readFn: showMax ? dataFns.readMax : dataFns.read,
		writeFn: showMax ? dataFns.writeMax : dataFns.write,
		readTimeFn: showMax ? dataFns.readTimeMax : dataFns.readTime,
		writeTimeFn: showMax ? dataFns.writeTimeMax : dataFns.writeTime,
		rAwaitFn: showMax ? dataFns.rAwaitMax : dataFns.rAwait,
		wAwaitFn: showMax ? dataFns.wAwaitMax : dataFns.wAwait,
		weightedIOFn: showMax ? dataFns.weightedIOMax : dataFns.weightedIO,
	}
}

export function getDiskIoMetricAvailability(chartData: ChartData): DiskIoMetricAvailability {
	let hasUtilization = false
	let hasAwait = false
	let hasWeightedIO = false

	for (const record of chartData.systemStats ?? []) {
		const dios = record.stats?.dios
		if ((dios?.at(2) ?? 0) > 0) hasUtilization = true
		if ((dios?.at(3) ?? 0) > 0) hasAwait = true
		if ((dios?.at(5) ?? 0) > 0) hasWeightedIO = true
		if (hasUtilization && hasAwait && hasWeightedIO) {
			break
		}
	}

	return { hasUtilization, hasAwait, hasWeightedIO }
}

export function buildDiskThroughputDataPoints(metricFns: Pick<DiskIoMetricFns, "readFn" | "writeFn">) {
	return [
		{
			label: t`Write`,
			dataKey: metricFns.writeFn,
			color: 3,
			opacity: 0.4,
			stackId: 0,
			order: 0,
		},
		{
			label: t`Read`,
			dataKey: metricFns.readFn,
			color: 1,
			opacity: 0.4,
			stackId: 0,
			order: 1,
		},
	] as DataPoint[]
}

export function buildDiskIoTimeDataPoints(metricFns: Pick<DiskIoMetricFns, "readTimeFn" | "writeTimeFn">) {
	return [
		{
			label: t`Write`,
			dataKey: metricFns.writeTimeFn,
			color: 3,
			opacity: 0.4,
			stackId: 0,
			order: 0,
		},
		{
			label: t`Read`,
			dataKey: metricFns.readTimeFn,
			color: 1,
			opacity: 0.4,
			stackId: 0,
			order: 1,
		},
	] as DataPoint[]
}

export function buildDiskQueueDepthDataPoints(label: string, weightedIOFn: DiskMetricFn) {
	return [
		{
			label,
			dataKey: weightedIOFn,
			color: 1,
			opacity: 0.4,
		},
	] as DataPoint[]
}

export function buildDiskAwaitDataPoints(metricFns: Pick<DiskIoMetricFns, "rAwaitFn" | "wAwaitFn">) {
	return [
		{
			label: t`Write`,
			dataKey: metricFns.wAwaitFn,
			color: 3,
			opacity: 0.3,
		},
		{
			label: t`Read`,
			dataKey: metricFns.rAwaitFn,
			color: 1,
			opacity: 0.3,
		},
	] as DataPoint[]
}
