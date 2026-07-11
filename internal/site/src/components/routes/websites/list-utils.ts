import { getSystemDisplayName } from "@/lib/system-roles"
import type { SystemRecord, WebsiteMonitorRecord } from "@/types"
import { isMonitorStale } from "./format"
import { monitorTargetsFromRecord } from "./target-utils"
import type { StatusFilter } from "./types"

export type WebsiteSystemOption = Pick<SystemRecord, "id" | "asset"> & { name: string }

export function buildWebsiteStatusCounts(monitors: WebsiteMonitorRecord[]) {
	return {
		all: monitors.length,
		up: monitors.filter((monitor) => monitor.last_status === "up").length,
		down: monitors.filter((monitor) => monitor.last_status === "down").length,
		unknown: monitors.filter((monitor) => monitor.last_status !== "up" && monitor.last_status !== "down").length,
		stale: monitors.filter((monitor) => isMonitorStale(monitor)).length,
	}
}

export function buildWebsiteSystemOptions(availableSystemsById: Record<string, SystemRecord>) {
	return Object.values(availableSystemsById)
		.filter(Boolean)
		.map(
			(system): WebsiteSystemOption => ({
				id: system.id,
				name: getSystemDisplayName(system, system.id),
				asset: system.asset,
			})
		)
		.sort((a, b) => a.name.localeCompare(b.name))
}

export function filterWebsiteMonitors({
	monitors,
	availableSystemsById,
	search,
	statusFilter,
	systemFilter,
}: {
	monitors: WebsiteMonitorRecord[]
	availableSystemsById: Record<string, SystemRecord>
	search: string
	statusFilter: StatusFilter
	systemFilter: string
}) {
	const keyword = search.trim().toLowerCase()
	return monitors.filter((monitor) => {
		if (systemFilter && monitor.system !== systemFilter) {
			return false
		}
		if (statusFilter === "stale") {
			if (!isMonitorStale(monitor)) {
				return false
			}
		} else if (statusFilter === "unknown") {
			if (monitor.last_status === "up" || monitor.last_status === "down") {
				return false
			}
		} else if (statusFilter !== "all" && monitor.last_status !== statusFilter) {
			return false
		}
		if (!keyword) {
			return true
		}
		const targets = monitorTargetsFromRecord(monitor)
		const systemName = monitor.system ? getSystemDisplayName(availableSystemsById[monitor.system], "") : ""
		return [
			monitor.name,
			monitor.description,
			monitor.group,
			monitor.expected_content,
			systemName,
			monitor.url,
			...targets.map((target) => `${target.label} ${target.url}`),
		]
			.filter(Boolean)
			.some((value) => String(value).toLowerCase().includes(keyword))
	})
}
