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
