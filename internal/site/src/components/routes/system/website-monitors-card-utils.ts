import type { WebsiteMonitorCheckRecord, WebsiteMonitorRecord } from "@/types"
import { getLatestChecksByTarget, monitorTargetsFromRecord } from "../websites/target-utils"

export type SystemWebsiteMonitorsSummary = {
	total: number
	up: number
	down: number
	paused: number
	unknown: number
}

export function groupWebsiteChecksByMonitor(checks: WebsiteMonitorCheckRecord[]) {
	const map = new Map<string, WebsiteMonitorCheckRecord[]>()
	for (const check of checks) {
		const list = map.get(check.monitor) ?? []
		list.push(check)
		map.set(check.monitor, list)
	}
	return map
}

export function getSystemWebsiteMonitorsSummary(monitors: WebsiteMonitorRecord[]): SystemWebsiteMonitorsSummary {
	const summary: SystemWebsiteMonitorsSummary = {
		total: monitors.length,
		up: 0,
		down: 0,
		paused: 0,
		unknown: 0,
	}

	for (const monitor of monitors) {
		if (monitor.enabled === false) {
			summary.paused += 1
			continue
		}
		if (monitor.last_status === "up") {
			summary.up += 1
		} else if (monitor.last_status === "down") {
			summary.down += 1
		} else {
			summary.unknown += 1
		}
	}

	return summary
}

export function getSystemWebsiteMonitorRowViewModel({
	monitor,
	checks,
}: {
	monitor: WebsiteMonitorRecord
	checks: WebsiteMonitorCheckRecord[]
}) {
	const targets = monitorTargetsFromRecord(monitor)
	const latestChecks = getLatestChecksByTarget(checks)
	const latestLatency =
		monitor.last_latency_ms ||
		Object.values(latestChecks).find((check) => typeof check.latency_ms === "number" && check.latency_ms > 0)
			?.latency_ms

	return {
		targets,
		latestLatency,
		targetCount: targets.filter((target) => target.url).length,
		description: monitor.description || targets[0]?.url || monitor.url || "暂无介绍",
	}
}
