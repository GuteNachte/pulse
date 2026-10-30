import type { SystemRecord } from "@/types"

export type SystemIPSource = "target" | "connect" | "observed" | "reported"

export type SystemIPDisplay = {
	value: string
	source: SystemIPSource
	sourceLabel: string
	label: string
}

type SystemIPRecord = Pick<SystemRecord, "info"> &
	Partial<Pick<SystemRecord, "target_ip" | "connect_ip" | "reported_ips">>

export function getSystemIPAddress(system?: SystemIPRecord | null) {
	return getSystemIPDisplay(system)?.value ?? ""
}

export function getSystemIPAddressLabel(system?: SystemIPRecord | null) {
	return getSystemIPDisplay(system)?.label ?? ""
}

export function getSystemIPDisplay(system?: SystemIPRecord | null): SystemIPDisplay | null {
	const candidates: Array<{ source: SystemIPSource; value: string }> = []
	for (const [source, rawValue] of [
		["target", system?.target_ip],
		["connect", system?.connect_ip],
		["observed", system?.info?.ip],
	] as const) {
		const value = normalizeIPValue(rawValue)
		if (value) candidates.push({ source, value })
	}
	for (const rawValue of system?.reported_ips ?? []) {
		const value = normalizeIPValue(rawValue)
		if (value) candidates.push({ source: "reported", value })
	}
	const selected =
		candidates.find(({ value }) => isPrivateIPv4(value)) ??
		candidates.find(({ value }) => !isLoopbackIP(value)) ??
		candidates[0]
	if (!selected) return null
	const sourceLabel = getSystemIPSourceLabel(selected.source)
	return {
		value: selected.value,
		source: selected.source,
		sourceLabel,
		label: `${sourceLabel} ${selected.value}`,
	}
}

export function getSystemIPSourceLabel(source: SystemIPSource) {
	switch (source) {
		case "target":
			return "目标 IP"
		case "connect":
			return "连接 IP"
		case "observed":
			return "采集 IP"
		case "reported":
			return "上报 IP"
	}
}

function parseIPv4(value: string): number[] | null {
	const parts = value.split(".")
	if (parts.length !== 4) return null
	const octets = parts.map(Number)
	if (octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null
	return octets
}

function isPrivateIPv4(value: string) {
	const octets = parseIPv4(value)
	if (!octets) return false
	return (
		octets[0] === 10 ||
		(octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
		(octets[0] === 192 && octets[1] === 168)
	)
}

function isLoopbackIP(value: string) {
	if (value === "::1") return true
	const octets = parseIPv4(value)
	return Boolean(octets && octets[0] === 127)
}

function normalizeIPValue(value?: string) {
	return value?.trim() || ""
}
