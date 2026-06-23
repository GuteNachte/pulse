import { decimalString, formatBytes, toFixedFloat } from "@/lib/utils"
import type { ChartData, SystemRecord, SystemStatsRecord } from "@/types"

export type NasStorageItem = {
	name: string
	usedGb?: number
	totalGb?: number
	percent?: number
}

export type NasSummaryViewModel = {
	storageItem: NasStorageItem
	highestStoragePct?: number
	containerCount: number
	storageBadgeVariant: "danger" | "warning" | "success" | "outline"
	containerValue: string
	containerDetail: string
}

export function shouldShowNasSummary(system: SystemRecord) {
	return system.is_nas === true
}

export function getNasSummaryViewModel({
	systemStats,
	containerData,
	hasContainers,
}: {
	systemStats: SystemStatsRecord[]
	containerData: ChartData["containerData"]
	hasContainers: boolean
}): NasSummaryViewModel {
	const latestStats = systemStats.at(-1)?.stats
	const storageItem = {
		name: "根分区",
		usedGb: latestStats?.du,
		totalGb: latestStats?.d,
		percent: latestStats?.dp,
	}
	const highestStoragePct = storageItem.percent
	const latestContainers = containerData.at(-1)
	const containerCount = latestContainers ? Object.keys(latestContainers).filter((key) => key !== "created").length : 0

	return {
		storageItem,
		highestStoragePct,
		containerCount,
		storageBadgeVariant: getStorageBadgeVariant(highestStoragePct),
		containerValue: hasContainers ? `${containerCount} 个` : "未发现",
		containerDetail: hasContainers ? "来自容器采集记录" : "未采集到 Docker / Podman",
	}
}

export function formatStoragePercent(percent?: number) {
	if (percent === undefined) {
		return "等待数据"
	}
	return `${decimalString(percent, percent >= 10 ? 1 : 2)}%`
}

export function formatStorageDetail(usedGb?: number, totalGb?: number) {
	if (!usedGb || !totalGb) {
		return "等待数据"
	}
	const used = formatGb(usedGb)
	const total = formatGb(totalGb)
	return `${used} / ${total}`
}

export function getStorageColor(percent: number) {
	if (percent >= 85) return "bg-red-500"
	if (percent >= 70) return "bg-yellow-500"
	return "bg-green-500"
}

function getStorageBadgeVariant(percent?: number) {
	if (percent === undefined) return "outline"
	if (percent >= 85) return "danger"
	if (percent >= 70) return "warning"
	return "success"
}

function formatGb(value: number) {
	const formatted = formatBytes(value * 1024 ** 3)
	return `${toFixedFloat(formatted.value, formatted.value >= 10 ? 1 : 2)} ${formatted.unit}`
}
