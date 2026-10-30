import type { AssetMonitorListItem } from "@/types"

export type MonitorStateFilter = "all" | "unbound" | "pending" | "healthy" | "error" | "paused"

export type MonitorListFilters = {
	search: string
	stateFilter: MonitorStateFilter
	providerFilter: string
}

// 2026-10-21 用户要求：进入资产监控页默认看到的是「正在监控」的资产。
// 有接入记录（binding）的进主列表；可监控但未绑定的进折叠区；暂不支持的不再展示。
export function splitMonitorItems(items: AssetMonitorListItem[]) {
	const monitored: AssetMonitorListItem[] = []
	const unbound: AssetMonitorListItem[] = []
	for (const item of items) {
		if (item.binding) {
			monitored.push(item)
		} else if (item.state === "unbound") {
			unbound.push(item)
		}
	}
	return { monitored, unbound }
}

export function filterMonitorItems(items: AssetMonitorListItem[], filters: MonitorListFilters) {
	const keyword = filters.search.trim().toLowerCase()
	return items.filter((item) => {
		if (filters.stateFilter !== "all" && item.state !== filters.stateFilter) return false
		if (filters.providerFilter !== "all" && item.provider !== filters.providerFilter) return false
		if (!keyword) return true
		return [item.asset.name, item.asset.model, item.asset.management_ip, item.asset.location]
			.filter(Boolean)
			.join(" ")
			.toLowerCase()
			.includes(keyword)
	})
}

export function countMonitoredBindings(counts: { pending: number; healthy: number; error: number; paused: number }) {
	return counts.pending + counts.healthy + counts.error + counts.paused
}

// 2026-10-21 左侧列表实时预览：Agent 行显示 CPU/内存/GPU/硬盘四条占用条与上传/下载网速。
export type AgentRowMetrics = {
	cpu: number
	mem: number
	disk: number
	gpu: number | null
	upload: number
	download: number
}

function summaryNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null
}

export function getAgentMetrics(item: AssetMonitorListItem): AgentRowMetrics | null {
	if (item.provider !== "agent" || !item.binding) return null
	const summary = item.summary ?? {}
	const cpu = summaryNumber(summary.cpu)
	const mem = summaryNumber(summary.mem)
	const disk = summaryNumber(summary.disk)
	const upload = summaryNumber(summary.upload)
	const download = summaryNumber(summary.download)
	if (cpu === null || mem === null || disk === null || upload === null || download === null) return null
	const gpuSupported = summary.gpu_supported === true
	const gpu = gpuSupported ? summaryNumber(summary.gpu) : null
	if (gpuSupported && gpu === null) return null
	return { cpu, mem, disk, gpu, upload, download }
}

export function getWebsiteMetrics(item: AssetMonitorListItem): { uptime24h: number; latencyMs: number } | null {
	if (item.provider !== "website" || !item.binding) return null
	const summary = item.summary ?? {}
	const uptime24h = summaryNumber(summary.uptime_24h)
	const latencyMs = summaryNumber(summary.last_latency_ms)
	if (uptime24h === null || latencyMs === null) return null
	return { uptime24h, latencyMs }
}

export type MetricTone = "ok" | "warn" | "crit"

// 占用度配色：<60% 正常绿，60–85% 注意琥珀，≥85% 告警红。
export function metricTone(value: number): MetricTone {
	if (value >= 85) return "crit"
	if (value >= 60) return "warn"
	return "ok"
}
