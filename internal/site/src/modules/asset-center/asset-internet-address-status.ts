type InternetAddressRefreshResult = {
	ipv4?: string
	ipv6?: string
	ipv4_error?: string
	ipv6_error?: string
}

export const internetAddressRefreshIntervalOptions = [
	{ value: 15, label: "15 分钟" },
	{ value: 30, label: "30 分钟" },
	{ value: 60, label: "1 小时" },
	{ value: 360, label: "6 小时" },
	{ value: 720, label: "12 小时" },
	{ value: 1440, label: "24 小时" },
] as const

const allowedInternetAddressRefreshIntervals = new Set<number>(
	internetAddressRefreshIntervalOptions.map((option) => option.value)
)

export type InternetAddressRefreshFeedback = {
	title: string
	description?: string
	variant?: "destructive"
}

export function getInternetAddressRefreshFeedback(value: unknown): InternetAddressRefreshFeedback {
	const result = (value ?? {}) as InternetAddressRefreshResult
	const failures = [
		result.ipv4_error ? `IPv4：${result.ipv4_error}` : "",
		result.ipv6_error ? `IPv6：${result.ipv6_error}` : "",
	].filter(Boolean)
	const successes = [result.ipv4, result.ipv6].filter(Boolean)
	if (failures.length === 0) return { title: "公网地址已刷新" }
	if (successes.length > 0) return { title: "公网地址部分刷新", description: failures.join("；") }
	return { title: "刷新公网地址失败", description: failures.join("；"), variant: "destructive" }
}

export function getInternetAddressDisplayState(metadata: Record<string, unknown>, protocol: "ipv4" | "ipv6") {
	const prefix = `public_${protocol}`
	return {
		address: readMetadataText(metadata, prefix),
		checkedAt: readMetadataText(metadata, "public_ip_checked_at"),
		nextCheckAt: readMetadataText(metadata, "public_ip_next_check_at"),
		error: readMetadataText(metadata, `${prefix}_error`),
	}
}

export function getInternetAddressAutoRefreshSettings(metadata: Record<string, unknown>) {
	const rawInterval = Number(metadata.public_ip_refresh_interval_minutes)
	const intervalMinutes = allowedInternetAddressRefreshIntervals.has(rawInterval) ? rawInterval : 30
	return {
		enabled: readMetadataText(metadata, "public_ip_auto_refresh") !== "no",
		intervalMinutes,
	}
}

export function formatInternetAddressTimestamp(value: string) {
	if (!value) return "尚未更新"
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return value
	const parts = new Intl.DateTimeFormat("zh-CN", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).formatToParts(date)
	const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ""
	return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`
}

function readMetadataText(metadata: Record<string, unknown>, key: string) {
	return typeof metadata[key] === "string" ? metadata[key].trim() : ""
}
