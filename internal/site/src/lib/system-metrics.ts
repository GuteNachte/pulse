import type { SystemRecord } from "@/types"
import { SystemStatus } from "./enums"
import { decimalString, formatBytes } from "./utils"
import type { $userSettings } from "./stores"

export type SystemMetricKey = "cpu" | "mp" | "dp" | "g"

export type SystemMetricDisplayState = "ok" | "warning" | "danger" | "missing" | "offline" | "paused" | "pending"

export type SystemMetricDisplay = {
	value: string
	progress: number
	state: SystemMetricDisplayState
}

export function getSystemMetricDisplay(system: SystemRecord, key: SystemMetricKey): SystemMetricDisplay {
	const nonLiveState = getNonLiveSystemMetricState(system)
	if (nonLiveState) {
		return { value: getNonLiveSystemMetricLabel(nonLiveState), progress: 0, state: nonLiveState }
	}

	const value = system.info?.[key]
	if (!isFiniteMetric(value)) {
		return { value: "未采集", progress: 0, state: "missing" }
	}

	return {
		value: `${decimalString(value, value >= 10 ? 1 : 2)}%`,
		progress: value,
		state: getMetricLoadState(value),
	}
}

export function getSystemNetworkDisplay(
	system: SystemRecord,
	unit: typeof $userSettings.value.unitNet
): SystemMetricDisplay {
	const nonLiveState = getNonLiveSystemMetricState(system)
	if (nonLiveState) {
		return { value: getNonLiveSystemMetricLabel(nonLiveState), progress: 0, state: nonLiveState }
	}

	const bytesPerSecond = getSystemNetworkBytesPerSecond(system)
	if (!isFiniteMetric(bytesPerSecond)) {
		return { value: "未采集", progress: 0, state: "missing" }
	}

	const { value, unit: formattedUnit } = formatBytes(bytesPerSecond, true, unit, false)
	return {
		value: `${decimalString(value, value >= 100 ? 0 : 1)} ${formattedUnit}`,
		progress: 0,
		state: "ok",
	}
}

export function getSystemMetricStateLabel(state: SystemMetricDisplayState) {
	switch (state) {
		case "offline":
			return "离线"
		case "paused":
			return "暂停"
		case "pending":
			return "待接入"
		case "missing":
			return "未采集"
		case "warning":
			return "偏高"
		case "danger":
			return "过高"
		default:
			return "正常"
	}
}

export function isFiniteMetric(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value)
}

function getNonLiveSystemMetricState(system: SystemRecord): SystemMetricDisplayState | null {
	if (system.status === SystemStatus.Up) {
		return null
	}
	if (system.status === SystemStatus.Paused) {
		return "paused"
	}
	if (system.status === SystemStatus.Pending) {
		return "pending"
	}
	return "offline"
}

function getNonLiveSystemMetricLabel(state: SystemMetricDisplayState) {
	switch (state) {
		case "paused":
			return "暂停"
		case "pending":
			return "待接入"
		default:
			return "离线"
	}
}

function getMetricLoadState(value: number): SystemMetricDisplayState {
	if (value >= 90) {
		return "danger"
	}
	if (value >= 75) {
		return "warning"
	}
	return "ok"
}

function getSystemNetworkBytesPerSecond(system: SystemRecord) {
	if (isFiniteMetric(system.info?.bb)) {
		return system.info.bb
	}
	if (isFiniteMetric(system.info?.b)) {
		return system.info.b * 1024 * 1024
	}
	return undefined
}
