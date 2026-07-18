type InternetAddressRefreshResult = {
	ipv4?: string
	ipv6?: string
	ipv4_error?: string
	ipv6_error?: string
	ipv4_candidate?: string
	ipv6_candidate?: string
}

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
	const candidates = [result.ipv4_candidate, result.ipv6_candidate].filter(Boolean)
	if (candidates.length > 0) {
		return { title: "检测到新公网地址", description: "已保留手动确认值，请确认后再更新。" }
	}
	if (failures.length === 0) return { title: "公网地址已刷新" }
	if (successes.length > 0) return { title: "公网地址部分刷新", description: failures.join("；") }
	return { title: "刷新公网地址失败", description: failures.join("；"), variant: "destructive" }
}

export function getInternetAddressDisplayState(metadata: Record<string, unknown>, protocol: "ipv4" | "ipv6") {
	const prefix = `public_${protocol}`
	const read = (key: string) => (typeof metadata[key] === "string" ? metadata[key].trim() : "")
	const source = read(`${prefix}_source`)
	const candidate = read(`${prefix}_candidate`)
	return {
		address: read(prefix),
		sourceLabel: source === "manual" ? "手动确认" : "动态地址",
		candidate,
		checkedAt: read("public_ip_checked_at"),
		needsConfirmation: Boolean(candidate),
	}
}
