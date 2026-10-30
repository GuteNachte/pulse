export type TemperatureCategory = "cpu" | "motherboard" | "disk" | "gpu" | "other"

export type TemperatureSensor = {
	key: string
	label: string
	category: TemperatureCategory
}

export const TEMPERATURE_CATEGORY_LABELS: Record<TemperatureCategory, string> = {
	cpu: "CPU",
	motherboard: "主板",
	disk: "硬盘",
	gpu: "显卡",
	other: "其他",
}

/**
 * Classifies a raw sensor key from hwmon (Linux) or LibreHardwareMonitor
 * (Windows) into the component it belongs to. The order matters: CPU-specific
 * inputs on the nct6687 Super I/O chip must be claimed before the generic
 * motherboard patterns.
 */
export function getTemperatureCategory(key: string): TemperatureCategory {
	const normalized = key.trim().toLowerCase()
	if (!normalized) {
		return "other"
	}
	if (
		normalized.includes("gpu") ||
		normalized.includes("geforce") ||
		normalized.includes("nvidia") ||
		normalized.includes("radeon") ||
		normalized.includes("amdgpu") ||
		normalized === "i915" ||
		normalized.includes("intel graphics") ||
		normalized.includes("arc a")
	) {
		return "gpu"
	}
	if (
		normalized.includes("nvme") ||
		normalized.includes("drivetemp") ||
		normalized.includes("composite") ||
		normalized.includes("sata") ||
		normalized.includes("scsi") ||
		normalized.includes("hdd") ||
		normalized.includes("ssd")
	) {
		return "disk"
	}
	if (
		normalized.includes("coretemp") ||
		normalized.includes("k10temp") ||
		normalized.includes("peci") ||
		normalized.includes("diode") ||
		normalized.includes("tctl") ||
		normalized.includes("tdie") ||
		normalized.includes("ccd") ||
		normalized.includes("package") ||
		normalized.includes("core_") ||
		normalized.includes("cpu")
	) {
		return "cpu"
	}
	if (
		normalized.includes("nct") ||
		normalized.includes("pch") ||
		normalized.includes("chipset") ||
		normalized.includes("thermistor") ||
		normalized.includes("acpitz") ||
		normalized.includes("thermalzone") ||
		normalized.includes("board") ||
		normalized.includes("superio") ||
		normalized.includes("ite8") ||
		normalized.includes("winbond")
	) {
		return "motherboard"
	}
	return "other"
}

/** Turns a raw sensor key into a short Chinese label. */
export function getTemperatureLabel(key: string): string {
	const raw = key.trim()
	const normalized = raw.toLowerCase()

	const core = normalized.match(/coretemp[_-]?core[_-]?(\d+)/)
	if (core) {
		return `CPU 核心 ${Number(core[1])}`
	}
	if (normalized.includes("coretemp") && normalized.includes("package")) {
		return "CPU 封装"
	}
	if (normalized.includes("k10temp") && normalized.includes("tctl")) {
		return "CPU Tctl"
	}
	if (normalized.includes("k10temp") && normalized.includes("tdie")) {
		return "CPU Tdie"
	}
	if (normalized.includes("peci")) {
		return "CPU PECI"
	}
	if (normalized.includes("diode")) {
		return "CPU 二极管"
	}
	const ccd = normalized.match(/ccd[_-]?(\d+)/)
	if (ccd) {
		return `CPU CCD ${Number(ccd[1])}`
	}
	if (normalized.includes("ccd")) {
		return "CPU CCD"
	}
	if (normalized === "i915") {
		return "Intel 核显"
	}
	if (normalized.includes("geforce") || /\b(rtx|gtx)\b/.test(normalized)) {
		const model = raw.match(/(?:RTX|GTX)\s*[\w\s]+/i)?.[0]?.trim()
		return model ? `NVIDIA ${model}` : "NVIDIA 显卡"
	}
	if (normalized.includes("nvidia")) {
		return "NVIDIA 显卡"
	}
	if (normalized.includes("amdgpu") || normalized.includes("radeon")) {
		return "AMD 显卡"
	}
	if (normalized.includes("gpu")) {
		return "显卡"
	}

	if (normalized === "nvme_composite") {
		return "NVMe 固态硬盘"
	}
	const nvmeComposite = normalized.match(/nvme[_-]?composite[_-]?(\d+)/)
	if (nvmeComposite) {
		return `NVMe 硬盘 ${Number(nvmeComposite[1])}`
	}
	const nvmeSensor = normalized.match(/nvme[_-]?sensor[_-]?(.+)$/)
	if (nvmeSensor) {
		const suffix = nvmeSensor[1].replace(/\./g, "-").replace(/_/g, "-")
		return `NVMe 传感器 ${suffix}`
	}
	if (normalized.includes("nvme")) {
		return "NVMe 固态硬盘"
	}
	if (normalized.includes("drivetemp")) {
		return "硬盘温度"
	}

	if (normalized.includes("pch") || normalized.includes("chipset")) {
		return "主板芯片组"
	}
	const thermistor = normalized.match(/thermistor[_-]?(\d+)/)
	if (thermistor) {
		return `主板温度 ${Number(thermistor[1])}`
	}
	if (normalized.includes("thermistor")) {
		return "主板温度"
	}
	const thermalZone = normalized.match(/thermalzone\\?tz(\d+)/)
	if (thermalZone) {
		return `主板温区 ${Number(thermalZone[1])}`
	}
	if (normalized.includes("acpitz")) {
		return "主板温区（ACPI）"
	}
	if (normalized.includes("thermalzone")) {
		return "主板温区"
	}
	if (normalized.includes("nct")) {
		return "主板传感器"
	}
	if (normalized.includes("package")) {
		return "CPU 封装"
	}
	return "其他传感器"
}

/**
 * Builds a stable, unique label for every sensor. Duplicate base labels get a
 * numeric suffix so the legend stays readable.
 */
export function buildTemperatureSensors(keys: string[]): TemperatureSensor[] {
	const seen = new Map<string, number>()
	return [...new Set(keys)]
		.filter((key) => key.trim().length > 0)
		.sort((a, b) => a.localeCompare(b))
		.map((key) => {
			const base = getTemperatureLabel(key)
			const count = seen.get(base) ?? 0
			seen.set(base, count + 1)
			return {
				key,
				label: count > 0 ? `${base} ${count + 1}` : base,
				category: getTemperatureCategory(key),
			}
		})
}
