import type { SystemDetailsRecord, SystemRecord } from "@/types"

export function formatMemoryModuleSummary(detail?: SystemDetailsRecord) {
	const modules = detail?.memory_modules ?? []
	if (modules.length === 0) return ""
	const speeds = [...new Set(modules.map((item) => item.configured_mhz || item.speed_mhz).filter(Boolean))]
	const types = [...new Set(modules.map((item) => item.memory_type).filter(Boolean))]
	return [`${modules.length} 条`, types[0], speeds[0] ? `${speeds[0]} MHz` : ""].filter(Boolean).join(" · ")
}

export function formatCollectedNicSummary(detail: SystemDetailsRecord) {
	return (detail.network_interfaces ?? [])
		.map((item) => {
			const name = item.display_name || item.name
			if (!name) return ""
			const speedMbps = normalizeCollectedNetworkSpeedMbps(item.link_speed)
			return `${name}${speedMbps ? ` ${formatSpeed(speedMbps)}` : ""}`
		})
		.filter(Boolean)
		.slice(0, 4)
		.join(" / ")
}

export function getSystemDisplayName(system: SystemRecord) {
	return system.display_name || system.name || system.id
}

export function formatSpeed(value?: number) {
	if (!value) return ""
	if (value >= 1000) {
		const gbps = value / 1000
		return `${Number.isInteger(gbps) ? gbps.toFixed(0) : gbps.toFixed(1)}G`
	}
	return `${value}M`
}

export function normalizeNetworkInterfaceSummary(value: string | undefined) {
	const text = value?.trim() ?? ""
	if (!text) return ""
	return text.replace(/\b(\d{7,})\s*Mbps\b/gi, (_match, rawSpeed: string) => {
		const speedMbps = Number(rawSpeed) / 1_000_000
		if (!Number.isFinite(speedMbps) || speedMbps <= 0) return _match
		const formattedSpeed = Number.isInteger(speedMbps) ? String(speedMbps) : String(Number(speedMbps.toFixed(1)))
		return `${formattedSpeed} Mbps`
	})
}

function normalizeCollectedNetworkSpeedMbps(value?: number) {
	if (!value) return 0
	return value >= 1_000_000 ? value / 1_000_000 : value
}
