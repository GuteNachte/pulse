import type { SystemRecord } from "@/types"
import { SystemStatus } from "./enums"
import { getSystemIPAddressLabel } from "./system-network"
import { getPrimaryUseLabel, getSystemDisplayName, getSystemHostname, getSystemRoleDisplayLabel } from "./system-roles"

export type SystemStatusTone = "neutral" | "success" | "warning" | "danger" | "info"
export type SystemStatusFilter = "all" | SystemRecord["status"]

export type SystemInventoryFilters = {
	query?: string
	status?: SystemStatusFilter
	role?: string
	primaryUse?: string
}

export function getSystemStatusLabel(status?: SystemRecord["status"]) {
	if (status === SystemStatus.Up) {
		return "在线"
	}
	if (status === SystemStatus.Down) {
		return "离线"
	}
	if (status === SystemStatus.Paused) {
		return "暂停"
	}
	if (status === SystemStatus.Pending) {
		return "待接入"
	}
	return "未知"
}

export function getSystemStatusTone(status?: SystemRecord["status"]): SystemStatusTone {
	if (status === SystemStatus.Up) {
		return "success"
	}
	if (status === SystemStatus.Down) {
		return "danger"
	}
	if (status === SystemStatus.Paused || status === SystemStatus.Pending) {
		return "warning"
	}
	return "neutral"
}

export function buildSystemStatusCounts(systems: SystemRecord[]) {
	const counts = {
		all: systems.length,
		up: 0,
		down: 0,
		paused: 0,
		pending: 0,
	}
	for (const system of systems) {
		if (system.status === SystemStatus.Up) {
			counts.up += 1
		} else if (system.status === SystemStatus.Down) {
			counts.down += 1
		} else if (system.status === SystemStatus.Paused) {
			counts.paused += 1
		} else if (system.status === SystemStatus.Pending) {
			counts.pending += 1
		}
	}
	return counts
}

export function filterSystemsForInventory(systems: SystemRecord[], filters: SystemInventoryFilters) {
	const keyword = filters.query?.trim().toLowerCase() ?? ""
	return systems.filter((system) => {
		if (filters.status && filters.status !== "all" && system.status !== filters.status) {
			return false
		}
		if (filters.role && filters.role !== "all" && (system.role || "physical") !== filters.role) {
			return false
		}
		if (
			filters.primaryUse &&
			filters.primaryUse !== "all" &&
			(system.primary_use || "production") !== filters.primaryUse
		) {
			return false
		}
		if (!keyword) {
			return true
		}
		return getSystemSearchText(system).includes(keyword)
	})
}

export function compareSystemsByAttention(a: SystemRecord, b: SystemRecord) {
	return (
		getSystemAttentionRank(a) - getSystemAttentionRank(b) ||
		new Date(b.updated || 0).getTime() - new Date(a.updated || 0).getTime() ||
		getSystemDisplayName(a).localeCompare(getSystemDisplayName(b))
	)
}

export function getSystemSearchText(system: SystemRecord) {
	return [
		getSystemDisplayName(system),
		getSystemHostname(system, ""),
		system.name,
		system.description,
		getSystemRoleDisplayLabel(system.role, system.custom_role, system.name),
		getPrimaryUseLabel(system.primary_use),
		system.is_nas ? "NAS" : "",
		system.is_local ? "Hub" : "",
		getSystemStatusLabel(system.status),
		getSystemIPAddressLabel(system),
		system.target_ip,
		system.connect_ip,
		system.info?.ip,
		...(system.reported_ips ?? []),
		system.info?.m,
		system.info?.o,
		system.info?.v,
		system.agent_profile,
	]
		.filter(Boolean)
		.join(" ")
		.toLowerCase()
}

function getSystemAttentionRank(system: SystemRecord) {
	if (system.status === SystemStatus.Down) {
		return 0
	}
	if (system.status === SystemStatus.Pending) {
		return 1
	}
	if (system.status === SystemStatus.Paused) {
		return 2
	}
	return 3
}
