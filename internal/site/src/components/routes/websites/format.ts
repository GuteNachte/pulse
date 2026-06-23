import type { WebsiteMonitorFailureCategory } from "@/types"

export function statusLabel(status?: string) {
	if (status === "up") {
		return "正常"
	}
	if (status === "down") {
		return "异常"
	}
	return "待检测"
}

export function statusTextClass(status?: string) {
	if (status === "up") {
		return "text-emerald-600 dark:text-emerald-300"
	}
	if (status === "down") {
		return "text-red-600 dark:text-red-300"
	}
	return "text-amber-600 dark:text-amber-300"
}

export function statusDotClass(status?: string) {
	if (status === "up") {
		return "bg-emerald-500"
	}
	if (status === "down") {
		return "bg-red-500"
	}
	return "bg-amber-500"
}

export function statusBarBgClass(status?: string) {
	if (status === "up") {
		return "bg-emerald-500"
	}
	if (status === "down") {
		return "bg-red-500"
	}
	return "bg-amber-500"
}

export function isMonitorStale(monitor: { last_checked?: string; interval_seconds?: number }, now = Date.now()) {
	if (!monitor.last_checked) {
		return false
	}
	const checkedAt = new Date(monitor.last_checked).getTime()
	if (!Number.isFinite(checkedAt)) {
		return true
	}
	const intervalSeconds = Math.max(Number(monitor.interval_seconds) || 300, 60)
	const staleAfterMs = Math.max(intervalSeconds * 2, intervalSeconds + 300) * 1000
	return now - checkedAt > staleAfterMs
}

export function formatMonitorFreshness(
	monitor: { last_checked?: string; interval_seconds?: number },
	now = Date.now()
) {
	if (!monitor.last_checked) {
		return "尚未检测"
	}
	const checkedAt = new Date(monitor.last_checked).getTime()
	if (!Number.isFinite(checkedAt)) {
		return "检测时间异常"
	}
	const ageMs = Math.max(now - checkedAt, 0)
	const minutes = Math.round(ageMs / 60_000)
	if (minutes < 1) {
		return "刚刚检测"
	}
	if (minutes < 60) {
		return `${minutes} 分钟前检测`
	}
	const hours = Math.round(minutes / 60)
	if (hours < 24) {
		return `${hours} 小时前检测`
	}
	const days = Math.round(hours / 24)
	return `${days} 天前检测`
}

export function failureCategoryLabel(category?: WebsiteMonitorFailureCategory | string) {
	switch (category) {
		case "dns":
			return "DNS"
		case "tcp":
			return "TCP"
		case "tls":
			return "TLS"
		case "http":
			return "HTTP"
		case "timeout":
			return "超时"
		case "redirect":
			return "重定向"
		case "content":
			return "内容"
		case "network":
			return "网络"
		case "unknown":
			return "未知"
		default:
			return ""
	}
}

export function failureCategoryTone(category?: WebsiteMonitorFailureCategory | string) {
	switch (category) {
		case "dns":
		case "tls":
		case "http":
			return "danger"
		case "timeout":
		case "tcp":
		case "network":
		case "redirect":
			return "warning"
		default:
			return "outline"
	}
}

export function formatLatency(value?: number) {
	return value && value > 0 ? `${value} ms` : "--"
}

export function formatDate(value?: string) {
	if (!value) {
		return "--"
	}
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) {
		return value
	}
	return date.toLocaleString("zh-CN", { hour12: false })
}

export function formatTime(value?: string) {
	if (!value) {
		return "--"
	}
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) {
		return "--"
	}
	return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })
}

export function formatMonitorError(error?: string) {
	const raw = error?.trim()
	if (!raw) {
		return ""
	}
	const normalized = raw.toLowerCase()
	if (normalized.includes("network is unreachable")) {
		return "网络不可达"
	}
	if (normalized.includes("connection refused")) {
		return "连接被拒绝"
	}
	if (
		normalized.includes("i/o timeout") ||
		normalized.includes("client.timeout") ||
		normalized.includes("context deadline exceeded")
	) {
		return "请求超时"
	}
	if (normalized.includes("no such host")) {
		return "域名解析失败"
	}
	if (normalized.includes("server misbehaving")) {
		return "DNS 服务异常"
	}
	if (normalized.includes("certificate") || normalized.includes("x509:") || normalized.includes("tls:")) {
		return "证书异常"
	}
	if (normalized.includes("too many redirects")) {
		return "重定向过多"
	}
	if (normalized.includes("unsupported protocol scheme")) {
		return "地址协议不支持"
	}
	if (normalized.includes("invalid url") || normalized.includes("missing protocol scheme")) {
		return "地址格式无效"
	}
	if (normalized.includes("connection reset by peer")) {
		return "连接被重置"
	}
	if (normalized === "eof" || normalized.includes(": eof")) {
		return "连接提前关闭"
	}
	return raw.length > 40 ? "检测失败" : raw
}
