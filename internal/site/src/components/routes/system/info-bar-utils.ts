import { Os } from "@/lib/enums"
import { formatBytes, toFixedFloat } from "@/lib/utils"
import type { ChartData, GPUData, SystemDetailsRecord } from "@/types"

export function formatCpuModel(value?: string) {
	return value?.replace(/\s+with\s+Radeon\s+Graphics$/i, "").trim()
}

export function getVirtualizationInfo(systemRole: string | undefined, details: SystemDetailsRecord | null | undefined) {
	if (systemRole !== "virtualization") {
		return null
	}
	const virtualization = details?.virtualization
	if (!virtualization?.type || virtualization.type === "none") {
		return null
	}
	return {
		shortLabel: virtualization.role === "host" ? "虚拟化宿主机" : "虚拟机",
		label: virtualization.name || getVirtualizationLabel(virtualization.type, virtualization.role),
		showTag: virtualization.role === "host",
	}
}

function getVirtualizationLabel(type: string, role?: string) {
	const labels: Record<string, string> = {
		hyperv: "Hyper-V",
		kvm: "KVM/QEMU",
		vmware: "VMware",
		virtualbox: "VirtualBox",
		xen: "Xen",
		parallels: "Parallels",
		bhyve: "bhyve",
		proxmox: "Proxmox",
	}
	const base = labels[type] || type
	return `${base} ${role === "host" ? "宿主机" : "虚拟机"}`
}

export function getMemoryHardwareInfo(details: SystemDetailsRecord | null | undefined) {
	const modules = (details?.memory_modules ?? []).filter((module) => (module.capacity ?? 0) > 0)
	const moduleBytes = modules.reduce((sum, module) => sum + (module.capacity ?? 0), 0)
	const total = moduleBytes || details?.memory
	if (!total || modules.length === 0) {
		return null
	}

	const totalValue = formatBytes(total, false, undefined, false)
	const totalLabel = `${toFixedFloat(totalValue.value, totalValue.value >= 10 ? 1 : 2)} ${totalValue.unit}`
	const moduleCount = modules.length
	const moduleTotalValue = formatBytes(moduleBytes, false, undefined, false)
	const moduleTotalLabel = `${toFixedFloat(moduleTotalValue.value, moduleTotalValue.value >= 10 ? 1 : 2)} ${moduleTotalValue.unit}`

	const types = uniqueValues(modules.map((module) => module.memory_type))
	const speeds = uniqueValues(
		modules
			.map((module) => module.configured_mhz || module.speed_mhz)
			.filter((speed): speed is number => Boolean(speed && speed > 0))
			.map((speed) => `${speed} MT/s`)
	)
	const perModule = modules
		.map((module) => {
			const size = module.capacity ? formatBytes(module.capacity, false, undefined, false) : null
			const sizeText = size ? `${toFixedFloat(size.value, size.value >= 10 ? 1 : 2)} ${size.unit}` : ""
			const typeText = module.memory_type || ""
			const speed = module.configured_mhz || module.speed_mhz
			const speedText = speed ? `${speed} MT/s` : ""
			const modelText = uniqueValues([module.manufacturer, module.part_number]).join(" ")
			return [module.locator || "内存条", modelText || [sizeText, typeText, speedText].filter(Boolean).join(" / ")]
				.filter(Boolean)
				.join("：")
		})
		.filter(Boolean)

	return {
		summary: [`${moduleCount} 条`, moduleTotalLabel, types.join("/"), speeds.join("/")].filter(Boolean).join(" / "),
		label: perModule.join("\n"),
	}
}

function uniqueValues(values: Array<string | undefined | null>) {
	return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))]
}

export function getPrimaryNetworkHardwareInfo(details: SystemDetailsRecord | null | undefined, chartData: ChartData) {
	const interfaces = details?.network_interfaces ?? []
	const activeInterfaceName = getActiveNetworkInterfaceName(chartData)
	const activeInterface =
		interfaces.find((item) => item.name === activeInterfaceName) ??
		interfaces.find((item) => item.link_speed && item.status?.toLowerCase() !== "disabled") ??
		interfaces[0]
	if (!activeInterface) {
		return null
	}
	const displayName = activeInterface.display_name?.trim()
	const value = displayName && displayName !== activeInterface.name ? displayName : activeInterface.name
	const label = [
		activeInterface.name ? `接口：${activeInterface.name}` : "",
		activeInterface.link_speed ? `速率：${formatLinkSpeed(activeInterface.link_speed)}` : "速率：未知",
		activeInterface.status ? `状态：${activeInterface.status}` : "",
	]
		.filter(Boolean)
		.join("\n")
	return { value, label }
}

function getActiveNetworkInterfaceName(chartData: ChartData) {
	const interfaces = chartData.systemStats.at(-1)?.stats.ni ?? {}
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
	return `${toFixedFloat(speed, speed >= 100 ? 0 : speed >= 10 ? 1 : 2)} ${units[unitIndex]}`
}

export function getPrimaryGpuHardwareInfo(chartData: ChartData) {
	const gpus = Object.values(chartData.systemStats.at(-1)?.stats.g ?? {}).filter((gpu) => formatGpuName(gpu.n))
	if (gpus.length === 0) {
		return null
	}

	const primaryGpu = selectPrimaryGpu(gpus)
	const label = gpus.map(formatGpuHardwareLabel).filter(Boolean).join("\n\n")

	return {
		value: gpus.length > 1 ? `${gpus.length} 张 GPU` : formatGpuName(primaryGpu.n),
		label,
	}
}

function selectPrimaryGpu(gpus: GPUData[]) {
	return gpus.reduce((primary, gpu) => (gpuScore(gpu) > gpuScore(primary) ? gpu : primary), gpus[0])
}

function gpuScore(gpu: GPUData) {
	return (gpu.mt ?? 0) * 1000 + (gpu.mu ?? 0) + (gpu.p ?? 0) + (gpu.u ?? 0)
}

function formatGpuHardwareLabel(gpu: GPUData) {
	const name = formatGpuName(gpu.n)
	if (!name) {
		return ""
	}
	const engines = Object.entries(gpu.e ?? {})
		.filter(([, value]) => Number.isFinite(value))
		.slice(0, 6)
	const engineText = engines.map(([key, value]) => `${key} ${toFixedFloat(value, 1)}%`).join(" / ")

	return [
		`型号：${name}`,
		Number.isFinite(gpu.u) ? `占用：${toFixedFloat(gpu.u, 1)}%` : "",
		formatGpuMemoryUsage(gpu),
		formatGpuPower("功耗", gpu.p),
		formatGpuPower("封装功耗", gpu.pp),
		engineText ? `引擎：${engineText}${Object.keys(gpu.e ?? {}).length > engines.length ? " / ..." : ""}` : "",
	]
		.filter(Boolean)
		.join("\n")
}

function formatGpuName(value?: string) {
	const name = value?.trim()
	if (!name || /^windows gpu \d+$/i.test(name) || /^gpu \d+$/i.test(name)) {
		return ""
	}
	return name
}

function formatGpuMemoryUsage(gpu: GPUData) {
	const usedMb = gpu.mu
	const totalMb = gpu.mt
	const hasUsed = typeof usedMb === "number" && Number.isFinite(usedMb) && usedMb > 0
	const hasTotal = typeof totalMb === "number" && Number.isFinite(totalMb) && totalMb > 0
	if (hasUsed && hasTotal) {
		return `显存：${formatGpuMemory(usedMb)} / ${formatGpuMemory(totalMb)}`
	}
	if (hasTotal) {
		return `显存：0 MB / ${formatGpuMemory(totalMb)}`
	}
	if (hasUsed) {
		return `显存：${formatGpuMemory(usedMb)}`
	}
	if (gpu.gt === "integrated") {
		return "显存：共享显存无稳定数据源"
	}
	return ""
}

function formatGpuMemory(valueMb: number) {
	const formatted = formatBytes(valueMb * 1024 ** 2, false, undefined, false)
	return `${toFixedFloat(formatted.value, formatted.value >= 10 ? 1 : 2)} ${formatted.unit}`
}

function formatGpuPower(label: string, value?: number) {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return ""
	}
	return `${label}：${toFixedFloat(value, 1)} W`
}

export function formatCpuTopology(cores?: number, threads?: number, arch?: string) {
	const parts: string[] = []
	if (cores && cores > 0) {
		parts.push(`${cores} 核`)
	}
	if (threads && threads > 0) {
		parts.push(`${threads} 线程`)
	}
	if (arch) {
		parts.push(arch)
	}
	return parts.length ? parts.join(" / ") : undefined
}

export function resolveSystemOs(os?: Os) {
	return os ?? Os.Linux
}
