import { alertInfo } from "@/lib/alerts"
import { formatDuration, formatShortDate, toFixedFloat } from "@/lib/utils"
import type { AlertsHistoryRecord } from "@/types"

export type AlertSeverity = "critical" | "warning" | "info"
export type AlertLifecycleState = "current" | "recovered"

export function alertDisplayName(record: AlertsHistoryRecord) {
	return alertInfo[record.name]?.name().replace("cpu", "CPU") || record.name
}

export function alertSourceLabel(record: AlertsHistoryRecord) {
	if (record.name === "Status") {
		return "机器"
	}
	if (record.name.startsWith("网站：")) {
		return "网站"
	}
	if (record.name.startsWith("编排：")) {
		return "编排"
	}
	if (record.name.startsWith("容器：")) {
		return "容器"
	}
	if (record.name.startsWith("服务：")) {
		return "服务"
	}
	if (record.name.startsWith("软件：")) {
		return "软件"
	}
	if (record.name === "Temperature" || record.name === "Battery" || record.name === "Disk") {
		return "硬件"
	}
	return "资源"
}

export function alertLifecycleState(record: AlertsHistoryRecord): AlertLifecycleState {
	return record.resolved ? "recovered" : "current"
}

export function alertStateLabel(record: AlertsHistoryRecord) {
	if (alertLifecycleState(record) === "recovered") {
		return "已恢复"
	}
	if (alertIsSilenced(record)) {
		return "静默中"
	}
	if (alertIsAcknowledged(record)) {
		return "已确认"
	}
	return "未恢复"
}

export function alertSeverity(record: AlertsHistoryRecord): AlertSeverity {
	if (record.name === "Status" || record.name.startsWith("网站：") || record.name.startsWith("容器：")) {
		return "critical"
	}
	if (record.name.startsWith("编排：") || record.name.startsWith("服务：") || record.name.startsWith("软件：")) {
		return "warning"
	}
	const value = Number((record as AlertsHistoryRecord & { value?: number }).value ?? record.val ?? 0)
	if (record.name === "Temperature" && value >= 85) {
		return "critical"
	}
	if (
		(record.name === "CPU" || record.name === "Memory" || record.name === "Disk" || record.name === "GPU") &&
		value >= 95
	) {
		return "critical"
	}
	return "warning"
}

export function alertSeverityLabel(record: AlertsHistoryRecord) {
	switch (alertSeverity(record)) {
		case "critical":
			return "严重"
		case "warning":
			return "警告"
		default:
			return "信息"
	}
}

export function alertValueLabel(record: AlertsHistoryRecord) {
	const raw = Number((record as AlertsHistoryRecord & { value?: number }).value ?? record.val ?? 0)
	if (record.name === "Status") {
		return "离线"
	}
	if (record.name.startsWith("网站：")) {
		return `异常 ${toFixedFloat(raw, 0)} 个地址`
	}
	if (record.name.startsWith("容器：") || record.name.startsWith("服务：") || record.name.startsWith("软件：")) {
		return "状态异常"
	}
	if (record.name.startsWith("编排：")) {
		return `异常 ${toFixedFloat(raw, 0)} 个容器`
	}
	const unit = alertInfo[record.name]?.unit ?? ""
	return `${toFixedFloat(raw, raw < 10 ? 2 : 1)}${unit}`
}

export function alertSystemName(record: AlertsHistoryRecord) {
	return record.expand?.system?.display_name || record.expand?.system?.name || record.system || "未知机器"
}

export function alertAssetName(record: AlertsHistoryRecord) {
	return record.expand?.asset?.name || record.asset || ""
}

export function alertCreatedLabel(record: AlertsHistoryRecord) {
	return formatShortDate(record.created)
}

export function alertResolvedLabel(record: AlertsHistoryRecord) {
	return record.resolved ? formatShortDate(record.resolved) : "未恢复"
}

export function alertDurationLabel(record: AlertsHistoryRecord) {
	return formatDuration(record.created, record.resolved) || "进行中"
}

export function alertIsAcknowledged(record: AlertsHistoryRecord) {
	return Boolean(record.acknowledged_at || record.acknowledged_by)
}

export function alertIsSilenced(record: AlertsHistoryRecord, now = new Date()) {
	if (!record.silenced_until) {
		return false
	}
	const until = new Date(record.silenced_until)
	return Number.isFinite(until.getTime()) && until.getTime() > now.getTime()
}

export function alertSilencedUntilLabel(record: AlertsHistoryRecord) {
	return record.silenced_until ? formatShortDate(record.silenced_until) : ""
}
