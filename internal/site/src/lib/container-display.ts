import { ContainerHealth, ContainerHealthLabels, Unit } from "@/lib/enums"
import { decimalString, formatBytes } from "@/lib/utils"

export function isContainerRunningStatus(status?: string) {
	const normalized = (status ?? "").trim().toLowerCase()
	return normalized.startsWith("up") || normalized.includes("running")
}

export function formatContainerMetricNumber(value: unknown, digits = 2) {
	const numeric = Number(value)
	if (!Number.isFinite(numeric)) {
		return "未采集"
	}
	return decimalString(numeric, numeric >= 10 ? 1 : digits)
}

export function formatContainerCpu(value: unknown) {
	const formatted = formatContainerMetricNumber(value)
	return formatted === "未采集" ? formatted : `${formatted}%`
}

export function formatContainerMemory(value: unknown) {
	const bytes = Number(value)
	if (!Number.isFinite(bytes) || bytes < 0) {
		return "未采集"
	}
	const formatted = formatBytes(bytes, false, Unit.Bytes, true)
	return `${decimalString(formatted.value, formatted.value >= 10 ? 1 : 2)} ${formatted.unit}`
}

export function formatContainerNetwork(value: unknown) {
	const bytes = Number(value)
	if (!Number.isFinite(bytes) || bytes < 0) {
		return "未采集"
	}
	const formatted = formatBytes(bytes, true, Unit.Bytes, false)
	return `${decimalString(formatted.value, formatted.value >= 10 ? 1 : 2)} ${formatted.unit}`
}

export function formatContainerHealth(value: unknown) {
	const health = Number(value)
	if (!Number.isInteger(health) || health < ContainerHealth.None || health > ContainerHealth.Unhealthy) {
		return "未知"
	}
	return ContainerHealthLabels[health as ContainerHealth] || "未知"
}

export function getProtectedContainerReason(container: { name?: string; image?: string }) {
	const name = (container.name ?? "").toLowerCase()
	const image = (container.image ?? "").toLowerCase()
	if (
		name.includes("pulse-hub") ||
		image.includes("pulse-hub") ||
		name.includes("pulse-agent") ||
		image.includes("pulse-agent")
	) {
		return "Pulse 相关容器不能从容器页操作，Agent 更新请到设置页处理。"
	}
	return ""
}
