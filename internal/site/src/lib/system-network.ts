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
	const candidates: Array<[SystemIPSource, string | undefined]> = [
		["target", system?.target_ip],
		["connect", system?.connect_ip],
		["observed", system?.info?.ip],
		["reported", firstReportedIP(system?.reported_ips)],
	]
	for (const [source, rawValue] of candidates) {
		const value = normalizeIPValue(rawValue)
		if (value) {
			const sourceLabel = getSystemIPSourceLabel(source)
			return {
				value,
				source,
				sourceLabel,
				label: `${sourceLabel} ${value}`,
			}
		}
	}
	return null
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

function firstReportedIP(values?: string[]) {
	return values?.map(normalizeIPValue).find(Boolean)
}

function normalizeIPValue(value?: string) {
	return value?.trim() || ""
}
