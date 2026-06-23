import { decimalString, formatBytes, formatTemperature, toFixedFloat } from "@/lib/utils"
import type { ChartData, GPUData, SystemDetailsRecord, SystemRecord } from "@/types"
import type { Unit } from "@/lib/enums"

export function systemSupportsSoftwareServices(system: SystemRecord) {
	const cap = system.info?.cap
	const platform = (cap?.platform || system.info?.os || "").toString().toLowerCase()
	if (platform !== "windows") {
		return false
	}
	const collection = new Set(cap?.collection ?? [])
	const operations = new Set(cap?.operations ?? [])
	return collection.has("software_monitor") || (collection.has("windows_services") && operations.has("service_control"))
}

export function formatPercent(value?: number) {
	return `${toFixedFloat(value ?? 0, 1)}%`
}

export function formatNetworkRate(value: number) {
	const formatted = formatBytes(value, true)
	return `${decimalString(formatted.value, formatted.value >= 100 ? 0 : 1)} ${formatted.unit}`
}

export function getCpuFrequencySummary(
	details: SystemDetailsRecord | null | undefined,
	system: SystemRecord,
	systemStats: ChartData["systemStats"]
) {
	const baseMhz = details?.cpu_frequency_mhz || parseCpuFrequencyMhz(details?.cpu || system.info.m)
	if (baseMhz > 0) {
		const latestCpu = systemStats.at(-1)?.stats.cpu ?? system.info.cpu
		if (typeof latestCpu !== "number" || !Number.isFinite(latestCpu)) {
			return `总 ${formatFrequencyGhz(baseMhz)}`
		}
		const usedMhz = baseMhz * (latestCpu / 100)
		return `已用 ${formatFrequencyGhz(usedMhz)} / 总 ${formatFrequencyGhz(baseMhz)}`
	}
	return formatCpuTopology(system.info.c, system.info.t)
}

export function getCpuVendorLabel(details: SystemDetailsRecord | null | undefined) {
	const vendor = details?.cpu_vendor?.trim()
	return vendor || ""
}

export function getMemorySummary(
	systemStats: ChartData["systemStats"],
	details: SystemDetailsRecord | null | undefined
) {
	const latestStats = systemStats.at(-1)?.stats
	const installedBytes = getInstalledMemoryBytesFromModules(details) || details?.memory || 0
	const totalBytes = installedBytes || (latestStats?.m ? latestStats.m * 1024 ** 3 : 0)
	const usedBytes = latestStats?.mu ? latestStats.mu * 1024 ** 3 : 0
	if (usedBytes > 0 && totalBytes > 0) {
		return `已用 ${formatCapacityBytes(usedBytes)} / 总 ${formatCapacityBytes(totalBytes)}`
	}
	return totalBytes > 0 ? `总 ${formatCapacityBytes(totalBytes)}` : "内存容量未采集"
}

export function getMemoryTypeLabel(details: SystemDetailsRecord | null | undefined) {
	const labels = new Set(
		(details?.memory_modules ?? [])
			.map((module) => normalizeMemoryType(module.memory_type))
			.filter((label): label is string => Boolean(label))
	)
	if (labels.size === 0) {
		return ""
	}
	return Array.from(labels).join(" / ")
}

function normalizeMemoryType(value?: string) {
	const normalized = value?.trim()
	if (!normalized) {
		return ""
	}
	const match = normalized.match(/\b(LPDDR|DDR)\s*-?\s*(\d)\b/i)
	if (match) {
		return `${match[1].toUpperCase()}${match[2]}`
	}
	return normalized.toUpperCase()
}

export function getNetworkUsageSummary(rateBytesPerSecond: number, linkSpeedBitsPerSecond?: number) {
	if (!linkSpeedBitsPerSecond || linkSpeedBitsPerSecond <= 0) {
		return "链路容量未采集"
	}
	const usagePct = (rateBytesPerSecond * 8 * 100) / linkSpeedBitsPerSecond
	return `占用 ${formatNetworkUsagePercent(usagePct)} / 总 ${formatLinkSpeed(linkSpeedBitsPerSecond)}`
}

export function getNetworkUsagePercentSummary(rateBytesPerSecond: number, linkSpeedBitsPerSecond?: number) {
	if (!linkSpeedBitsPerSecond || linkSpeedBitsPerSecond <= 0) {
		return "链路容量未采集"
	}
	const usagePct = (rateBytesPerSecond * 8 * 100) / linkSpeedBitsPerSecond
	return `负载 ${formatNetworkUsagePercent(usagePct)}`
}

export function getNetworkSummary(
	details: SystemDetailsRecord | null | undefined,
	systemStats: ChartData["systemStats"]
) {
	const activeInterface = getPrimaryNetworkInterface(details, systemStats)
	if (!activeInterface) {
		return { speed: "", label: "", linkSpeed: 0, ipMethodLabel: "" }
	}
	const linkSpeed = activeInterface.link_speed ?? 0
	const speed = linkSpeed ? formatLinkSpeed(linkSpeed) : "速率未知"
	const ipMethodLabel = getIPMethodLabel(activeInterface.ip_method)
	const displayName = activeInterface.display_name?.trim()
	const interfaceLabel = [activeInterface.name, displayName && displayName !== activeInterface.name ? displayName : ""]
		.filter(Boolean)
		.join(" · ")
	const label = [interfaceLabel, speed].filter(Boolean).join(" · ")
	return { speed, label, linkSpeed, ipMethodLabel }
}

export function getPrimaryNetworkInterface(
	details: SystemDetailsRecord | null | undefined,
	systemStats: ChartData["systemStats"]
) {
	const activeInterfaceName = getActiveNetworkInterfaceName(systemStats)
	const interfaces = details?.network_interfaces ?? []
	return (
		interfaces.find((item) => item.name === activeInterfaceName) ??
		interfaces.find((item) => item.link_speed && item.status?.toLowerCase() !== "disabled") ??
		interfaces[0]
	)
}

function getIPMethodLabel(value?: string) {
	switch (value?.trim().toLowerCase()) {
		case "dhcp":
			return "DHCP"
		case "static":
			return "静态 IP"
		default:
			return ""
	}
}

export function getDiskSummary(systemStats: ChartData["systemStats"], smartTotalCapacity: number) {
	const latestStats = systemStats.at(-1)?.stats
	const fallbackTotal = latestStats?.d ? latestStats.d * 1024 ** 3 : 0
	const totalBytes = smartTotalCapacity > 0 ? smartTotalCapacity : fallbackTotal
	const usedBytes = latestStats?.du ? latestStats.du * 1024 ** 3 : 0
	if (usedBytes > 0 && totalBytes > 0) {
		return `已用 ${formatCapacityBytes(usedBytes)} / 总 ${formatCapacityBytes(totalBytes)}`
	}
	return totalBytes > 0 ? `总 ${formatCapacityBytes(totalBytes)}` : formatCapacityBytes(totalBytes)
}

export function getDiskTypeLabel(disks: { model?: string; name?: string; type?: string; media_type?: string }[]) {
	const labels = new Set(disks.map(getSingleDiskTypeLabel).filter(Boolean))
	if (labels.size === 0) {
		return ""
	}
	if (labels.size === 1) {
		return Array.from(labels)[0]
	}
	return Array.from(labels).join(" / ")
}

export type HardwareTemperatureSummary = {
	cpu?: string
	gpu?: string
	disk?: string
}

export function getHardwareTemperatureSummary({
	systemStats,
	gpus,
	smartDisks,
	unitTemp,
}: {
	systemStats: ChartData["systemStats"]
	gpus?: Record<string, GPUData> | null
	smartDisks: { model?: string; name?: string; type?: string; media_type?: string; temp?: number }[]
	unitTemp?: Unit
}): HardwareTemperatureSummary {
	const latestTemps = getLatestTemperatures(systemStats)
	return {
		cpu: formatHardwareTemperature(findCpuTemperature(latestTemps), unitTemp),
		gpu: formatHardwareTemperature(findGpuTemperature(latestTemps, gpus), unitTemp),
		disk: formatHardwareTemperature(findDiskTemperature(smartDisks), unitTemp),
	}
}

function getSingleDiskTypeLabel(disk: { media_type?: string }) {
	const mediaType = disk.media_type?.trim().toLowerCase() ?? ""
	if (mediaType === "nvme") {
		return "NVMe"
	}
	if (mediaType === "ssd") {
		return "SSD"
	}
	if (mediaType === "hdd") {
		return "HDD"
	}
	return ""
}

function getLatestTemperatures(systemStats: ChartData["systemStats"]) {
	for (let i = systemStats.length - 1; i >= 0; i--) {
		const temps = systemStats[i].stats?.t
		if (temps && Object.keys(temps).length > 0) {
			return temps
		}
	}
	return {}
}

function findCpuTemperature(temperatures: Record<string, number>) {
	const cpuEntries = Object.entries(temperatures).filter(([name, value]) => {
		if (!isValidTemperature(value)) return false
		const normalized = name.toLowerCase()
		if (
			normalized.includes("gpu") ||
			normalized.includes("nvme") ||
			normalized.includes("ssd") ||
			normalized.includes("hdd")
		) {
			return false
		}
		return /\b(cpu|package|core|tctl|tdie|ccd)\b/.test(normalized)
	})
	return getHighestTemperature(cpuEntries)
}

function findGpuTemperature(temperatures: Record<string, number>, gpus?: Record<string, GPUData> | null) {
	const gpuNames = Object.values(gpus ?? {})
		.map((gpu) => normalizeHardwareName(gpu.n))
		.filter(Boolean)
	const entries = Object.entries(temperatures).filter(([name, value]) => {
		if (!isValidTemperature(value)) return false
		const normalized = normalizeHardwareName(name)
		if (!normalized) return false
		return (
			gpuNames.some((gpuName) => normalized.includes(gpuName) || gpuName.includes(normalized)) ||
			/\b(gpu|nvidia|geforce|rtx|gtx|radeon|intel graphics|arc)\b/.test(name.toLowerCase())
		)
	})
	return getHighestTemperature(entries)
}

function findDiskTemperature(disks: { temp?: number }[]) {
	const values = disks.map((disk) => disk.temp).filter(isValidTemperature)
	if (!values.length) {
		return undefined
	}
	return Math.max(...values)
}

function getHighestTemperature(entries: [string, number][]) {
	if (!entries.length) {
		return undefined
	}
	return entries.reduce((highest, current) => (current[1] > highest[1] ? current : highest))[1]
}

function formatHardwareTemperature(value: number | undefined, unitTemp?: Unit) {
	if (!isValidTemperature(value)) {
		return undefined
	}
	const formatted = formatTemperature(value, unitTemp)
	return `${decimalString(formatted.value, formatted.value >= 100 ? 1 : 2)} ${formatted.unit}`
}

function isValidTemperature(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value > 0 && value < 200
}

function normalizeHardwareName(value?: string) {
	return (value ?? "")
		.toLowerCase()
		.replace(/\([^)]*\)/g, " ")
		.replace(/[^a-z0-9]+/g, " ")
		.replace(/\b(nvidia|amd|ati|intel|graphics|controller|corporation|inc|ltd)\b/g, " ")
		.replace(/\s+/g, " ")
		.trim()
}

export function getGpuRuntimeSummary(gpus?: Record<string, GPUData> | null) {
	const gpuList = Object.values(gpus ?? {}).filter((gpu) => formatGpuName(gpu.n))
	if (!gpuList.length) {
		return "显存未采集"
	}

	const totalMemory = gpuList.reduce((sum, gpu) => sum + (gpu.mt ?? 0), 0)
	const usedMemory = gpuList.reduce((sum, gpu) => sum + (gpu.mu ?? 0), 0)
	if (totalMemory > 0) {
		return `显存 ${usedMemory > 0 ? formatGpuMemory(usedMemory) : "0 MB"} / ${formatGpuMemory(totalMemory)}`
	}
	if (usedMemory > 0) {
		return `显存 ${formatGpuMemory(usedMemory)}`
	}
	return gpuList.some((gpu) => gpu.gt === "integrated") ? "共享显存无稳定数据源" : "显存未采集"
}

export function getGpuOverviewValue(gpus: Record<string, GPUData> | null | undefined, fallbackUsage?: number) {
	const gpuList = Object.values(gpus ?? {}).filter((gpu) => formatGpuName(gpu.n))
	if (gpuList.length > 1) {
		return `${gpuList.length} 张 GPU`
	}
	const usage = gpuList[0]?.u ?? fallbackUsage
	return typeof usage === "number" && Number.isFinite(usage) ? formatPercent(usage) : "未采集"
}

export function getPrimaryGpuTypeLabel(gpus?: Record<string, GPUData> | null) {
	const labels = new Set(
		Object.values(gpus ?? {})
			.filter((gpu) => formatGpuName(gpu.n))
			.map(getGpuTypeLabel)
			.filter(Boolean)
	)
	if (labels.size === 0) {
		return ""
	}
	if (labels.size === 1) {
		return Array.from(labels)[0]
	}
	return Array.from(labels).join(" / ")
}

export function getGpuTypeLabel(gpu: Pick<GPUData, "n" | "gt">) {
	if (gpu.gt === "discrete") {
		return "独显"
	}
	if (gpu.gt === "integrated") {
		return "核显"
	}
	return ""
}

export function getContainerRuntimeLabel(details: SystemDetailsRecord | null | undefined, system: SystemRecord) {
	const name = details?.container_runtime_name || (details?.podman || system.info.p ? "Podman" : "Docker")
	const version = details?.container_runtime_version?.trim()
	return version ? `${name} 版本 ${version}` : `${name} 可用`
}

export function getLoadState(value?: number): "ok" | "warning" | "danger" {
	const normalized = value ?? 0
	if (normalized >= 90) {
		return "danger"
	}
	if (normalized >= 75) {
		return "warning"
	}
	return "ok"
}

function parseCpuFrequencyMhz(value?: string) {
	const match = value?.match(/@\s*([\d.]+)\s*([GMK]?Hz)/i)
	if (!match) {
		return 0
	}
	const frequency = Number(match[1])
	if (!Number.isFinite(frequency) || frequency <= 0) {
		return 0
	}
	const unit = match[2].toLowerCase()
	if (unit === "ghz") {
		return frequency * 1000
	}
	if (unit === "khz") {
		return frequency / 1000
	}
	return frequency
}

function formatFrequencyGhz(valueMhz: number) {
	const valueGhz = valueMhz / 1000
	return `${decimalString(valueGhz, valueGhz >= 10 ? 1 : 2)} GHz`
}

function getInstalledMemoryBytesFromModules(details: SystemDetailsRecord | null | undefined) {
	return (details?.memory_modules ?? []).reduce((sum, module) => sum + (module.capacity ?? 0), 0)
}

function formatNetworkUsagePercent(value: number) {
	if (!Number.isFinite(value) || value <= 0) {
		return "0%"
	}
	if (value < 0.1) {
		return "<0.1%"
	}
	return `${decimalString(value, value >= 10 ? 1 : 2)}%`
}

function getActiveNetworkInterfaceName(systemStats: ChartData["systemStats"]) {
	const interfaces = systemStats.at(-1)?.stats.ni ?? {}
	return Object.entries(interfaces)
		.sort(([, a], [, b]) => (b[0] ?? 0) + (b[1] ?? 0) - ((a[0] ?? 0) + (a[1] ?? 0)))
		.at(0)?.[0]
}

function formatLinkSpeed(value: number) {
	const units = ["bps", "Kbps", "Mbps", "Gbps", "Tbps"]
	let speed = value
	let unitIndex = 0
	while (speed >= 1000 && unitIndex < units.length - 1) {
		speed /= 1000
		unitIndex++
	}
	return `${decimalString(speed, speed >= 100 ? 0 : speed >= 10 ? 1 : 2)} ${units[unitIndex]}`
}

function formatCapacityBytes(value?: number) {
	if (!value || value <= 0) {
		return "容量未知"
	}
	const formatted = formatBytes(value)
	return `${toFixedFloat(formatted.value, formatted.value >= 10 ? 1 : 2)} ${formatted.unit}`
}

function formatCpuTopology(cores?: number, threads?: number) {
	const parts: string[] = []
	if (cores && cores > 0) {
		parts.push(`${cores} 核`)
	}
	if (threads && threads > 0) {
		parts.push(`${threads} 线程`)
	}
	return parts.length ? parts.join(" / ") : "CPU 信息未采集"
}

function formatGpuName(value?: string) {
	const name = value?.trim()
	if (!name || /^windows gpu \d+$/i.test(name) || /^gpu \d+$/i.test(name)) {
		return ""
	}
	return name
}

function formatGpuMemory(valueMb: number) {
	const formatted = formatBytes(valueMb * 1024 ** 2)
	return `${toFixedFloat(formatted.value, formatted.value >= 10 ? 1 : 2)} ${formatted.unit}`
}
