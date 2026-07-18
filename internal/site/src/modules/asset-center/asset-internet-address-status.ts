type InternetAddressRefreshResult = {
	ipv4?: string
	ipv6?: string
	ipv4_error?: string
	ipv6_error?: string
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
	if (failures.length === 0) return { title: "公网地址已刷新" }
	if (successes.length > 0) return { title: "公网地址部分刷新", description: failures.join("；") }
	return { title: "刷新公网地址失败", description: failures.join("；"), variant: "destructive" }
}
