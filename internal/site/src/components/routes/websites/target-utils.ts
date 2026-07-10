import type { WebsiteMonitorCheckRecord, WebsiteMonitorRecord } from "@/types"
import type {
	IconSource,
	MonitorForm,
	MonitorTargetForm,
	MonitorTargetPayload,
	TargetIPVersion,
	TargetKind,
	TargetScope,
	URLProtocol,
} from "./types.ts"
import { targetKindOptions } from "./types.ts"

export function monitorTargetsForForm(monitor: WebsiteMonitorRecord): MonitorTargetForm[] {
	const targets = monitorTargetsFromRecord(monitor)
	if (targets.length) {
		return targets.map((target, index) => {
			const kind = targetKindFromPayload(target, index)
			const parts = splitURL(target.url, targetKindScope(kind) === "internal" ? "http://" : "https://")
			return {
				id: kind,
				kind,
				protocol: parts.protocol,
				address: parts.address,
			}
		})
	}
	return [{ id: "internal-ipv4", kind: "internal-ipv4", protocol: "http://", address: "" }]
}

export function monitorTargetsFromRecord(monitor: WebsiteMonitorRecord): MonitorTargetPayload[] {
	const parsed = parseMonitorTargets(monitor.targets)
	if (parsed.length) {
		return parsed
	}
	const fallback: MonitorTargetPayload[] = []
	if (monitor.internal_url || monitor.url) {
		fallback.push({
			id: "internal-ipv4",
			label: "内网 IPv4",
			url: monitor.internal_url || monitor.url || "",
			scope: "internal",
			ip_version: "IPv4",
		})
	}
	if (monitor.external_url) {
		fallback.push({
			id: "external-ipv4",
			label: "外网 IPv4",
			url: monitor.external_url,
			scope: "external",
			ip_version: "IPv4",
		})
	}
	return fallback.filter((target) => target.url)
}

export function parseMonitorTargets(raw?: string): MonitorTargetPayload[] {
	if (!raw?.trim()) {
		return []
	}
	try {
		const parsed = JSON.parse(raw) as Array<Partial<MonitorTargetPayload>>
		if (!Array.isArray(parsed)) {
			return []
		}
		const seenURLs = new Set<string>()
		const seenIDs = new Set<string>()
		return parsed.flatMap((item, index) => {
			const url = normalizeOptionalURL(item.url ?? "")
			if (!url || seenURLs.has(url)) {
				return []
			}
			seenURLs.add(url)
			const kind = targetKindFromPayload(item, index)
			const label = targetKindLabel(kind)
			const id = uniqueTargetID(kind, seenIDs)
			return [{ id, label, url, scope: targetKindScope(kind), ip_version: targetKindIPVersion(kind) }]
		})
	} catch {
		return []
	}
}

export function buildTargetPayload(targets: MonitorTargetForm[]): MonitorTargetPayload[] {
	const seenURLs = new Set<string>()
	const seenIDs = new Set<string>()
	return targets.flatMap((target, index) => {
		const url = buildURL(target.protocol, target.address)
		if (!url || seenURLs.has(url)) {
			return []
		}
		seenURLs.add(url)
		const kind = target.kind || targetKindFromID(target.id, index)
		const id = uniqueTargetID(kind, seenIDs)
		return [
			{ id, label: targetKindLabel(kind), url, scope: targetKindScope(kind), ip_version: targetKindIPVersion(kind) },
		]
	})
}

export function isInternalTarget(target: Pick<MonitorTargetPayload, "id" | "scope">) {
	return target.scope === "internal" || target.id.startsWith("internal")
}

export function isExternalTarget(target: Pick<MonitorTargetPayload, "id" | "scope">) {
	return target.scope === "external" || target.id.startsWith("external")
}

export function getTargetURLSet(targets: MonitorTargetPayload[]) {
	const internalURL = targets.find(isInternalTarget)?.url || ""
	const externalURL = targets.find(isExternalTarget)?.url || ""
	const fallbackURL = internalURL || externalURL || targets[0]?.url || ""
	return { internalURL, externalURL, fallbackURL }
}

export function targetKindFromPayload(item: Partial<MonitorTargetPayload>, index: number): TargetKind {
	const existing = targetKindFromID(item.id, index)
	const scope = item.scope || targetKindScope(existing)
	const ipVersion = item.ip_version || targetKindIPVersion(existing)
	return targetKindFromParts(scope, ipVersion)
}

export function targetKindFromID(id: string | undefined, index: number): TargetKind {
	const normalized = (id || "").toLowerCase()
	if (normalized.includes("external") || normalized === "外网") {
		return normalized.includes("ipv6") || normalized.includes("6") ? "external-ipv6" : "external-ipv4"
	}
	if (normalized.includes("internal") || normalized === "内网") {
		return normalized.includes("ipv6") || normalized.includes("6") ? "internal-ipv6" : "internal-ipv4"
	}
	return targetKindOptions[index % targetKindOptions.length]?.value ?? "internal-ipv4"
}

export function targetKindFromParts(scope: string | undefined, ipVersion: string | undefined): TargetKind {
	const normalizedScope: TargetScope = scope === "external" ? "external" : "internal"
	const normalizedVersion: TargetIPVersion = String(ipVersion).toLowerCase() === "ipv6" ? "IPv6" : "IPv4"
	return `${normalizedScope}-${normalizedVersion.toLowerCase()}` as TargetKind
}

export function targetKindScope(kind?: TargetKind): TargetScope {
	return kind?.startsWith("external") ? "external" : "internal"
}

export function targetKindIPVersion(kind?: TargetKind): TargetIPVersion {
	return kind?.endsWith("ipv6") ? "IPv6" : "IPv4"
}

export function targetKindLabel(kind?: TargetKind) {
	const found = targetKindOptions.find((option) => option.value === kind)
	return found?.label ?? "内网 IPv4"
}

export function compactTargetLabel(label: string) {
	return label.replace(/\s*IPv[46]\s*$/i, "")
}

export function nextAvailableTargetKind(targets: MonitorTargetForm[]): TargetKind {
	const used = new Set(targets.map((target) => target.kind))
	return (
		targetKindOptions.find((option) => !used.has(option.value))?.value ??
		targetKindOptions[targets.length % targetKindOptions.length].value
	)
}

export function uniqueTargetID(id: string, seen: Set<string>) {
	let next = id
	let suffix = 2
	while (seen.has(next)) {
		next = `${id}-${suffix}`
		suffix += 1
	}
	seen.add(next)
	return next
}

export function splitURL(raw: string, fallbackProtocol: URLProtocol): { protocol: URLProtocol; address: string } {
	const trimmed = raw.trim()
	if (!trimmed) {
		return { protocol: fallbackProtocol, address: "" }
	}
	if (trimmed.startsWith("http://")) {
		return { protocol: "http://", address: trimmed.slice("http://".length) }
	}
	if (trimmed.startsWith("https://")) {
		return { protocol: "https://", address: trimmed.slice("https://".length) }
	}
	return { protocol: fallbackProtocol, address: trimmed }
}

export function buildURL(protocol: URLProtocol, address: string) {
	const trimmed = address.trim()
	if (!trimmed) {
		return ""
	}
	return normalizeURL(`${protocol}${trimmed}`)
}

export function normalizeURL(raw: string) {
	const trimmed = raw.trim()
	if (!trimmed || trimmed === "http://" || trimmed === "https://") {
		return ""
	}
	try {
		const url = new URL(trimmed)
		return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : ""
	} catch {
		return ""
	}
}

export function normalizeOptionalURL(raw: string) {
	return raw.trim() ? normalizeURL(raw) : ""
}

export function deriveFaviconURL(raw: string) {
	const normalized = normalizeOptionalURL(raw)
	if (!normalized) {
		return ""
	}
	try {
		const url = new URL(normalized)
		return `${url.origin}/favicon.ico`
	} catch {
		return ""
	}
}

export function inferIconSource(iconURL: string | undefined, internalURL: string, externalURL: string): IconSource {
	const normalizedIcon = normalizeOptionalURL(iconURL ?? "")
	if (!normalizedIcon) {
		return "internal"
	}
	if (normalizedIcon === deriveFaviconURL(internalURL)) {
		return "internal"
	}
	if (normalizedIcon === deriveFaviconURL(externalURL)) {
		return "external"
	}
	return "custom"
}

export function resolveIconURL(form: MonitorForm, internalURL: string, externalURL: string, fallbackURL: string) {
	if (form.icon_source === "internal") {
		return deriveFaviconURL(internalURL || fallbackURL)
	}
	if (form.icon_source === "external") {
		return deriveFaviconURL(externalURL || fallbackURL)
	}
	return normalizeOptionalURL(form.icon_url) || deriveFaviconURL(internalURL || externalURL || fallbackURL)
}

export function resolveFormIconURL(form: MonitorForm) {
	const targetPayload = buildTargetPayload(form.targets)
	const { internalURL, externalURL, fallbackURL } = getTargetURLSet(targetPayload)
	return resolveIconURL(form, internalURL, externalURL, fallbackURL)
}

export function canLoadImage(url: string) {
	return new Promise<boolean>((resolve) => {
		const image = new Image()
		const timer = window.setTimeout(() => {
			image.onload = null
			image.onerror = null
			resolve(false)
		}, 5000)
		image.onload = () => {
			window.clearTimeout(timer)
			resolve(true)
		}
		image.onerror = () => {
			window.clearTimeout(timer)
			resolve(false)
		}
		image.src = url
	})
}

export function getSummary(monitors: WebsiteMonitorRecord[]) {
	const up = monitors.filter((item) => item.last_status === "up").length
	const down = monitors.filter((item) => item.last_status === "down").length
	const latencyItems = monitors.filter((item) => typeof item.last_latency_ms === "number" && item.last_latency_ms > 0)
	const uptimeItems = monitors.filter((item) => typeof item.uptime_24h === "number")
	return {
		up,
		down,
		latency: latencyItems.length
			? Math.round(latencyItems.reduce((sum, item) => sum + (item.last_latency_ms ?? 0), 0) / latencyItems.length)
			: 0,
		uptime: uptimeItems.length
			? (uptimeItems.reduce((sum, item) => sum + (item.uptime_24h ?? 0), 0) / uptimeItems.length).toFixed(1)
			: "",
	}
}

export function getLatestChecksByTarget(checks: WebsiteMonitorCheckRecord[]) {
	const latest: Record<string, WebsiteMonitorCheckRecord> = {}
	for (const check of checks) {
		const target = check.target || "internal"
		if (!latest[target]) {
			latest[target] = check
		}
	}
	return latest
}

export function getCheckTimelineSlots(checks: WebsiteMonitorCheckRecord[], limit: number, targetKeys: string[]) {
	const slots: Array<Record<string, WebsiteMonitorCheckRecord>> = []
	const ordered = [...checks].reverse()
	let slot: Record<string, WebsiteMonitorCheckRecord> = {}
	let seenTargets = new Set<string>()
	for (const check of ordered) {
		const target = check.target || "internal"
		if (seenTargets.has(target) || (targetKeys.length > 0 && seenTargets.size >= targetKeys.length)) {
			slots.push(slot)
			slot = {}
			seenTargets = new Set<string>()
		}
		slot[target] = check
		seenTargets.add(target)
		if (targetKeys.length > 0 && seenTargets.size >= targetKeys.length) {
			slots.push(slot)
			slot = {}
			seenTargets = new Set<string>()
		}
	}
	if (seenTargets.size > 0) {
		slots.push(slot)
	}
	return slots.slice(-limit)
}

export function targetLabel(target?: string, targets?: MonitorTargetPayload[]) {
	const configured = targets?.find((item) => item.id === target)
	if (configured) {
		return configured.label
	}
	switch (target) {
		case "internal-ipv4":
			return "内网 IPv4"
		case "internal-ipv6":
			return "内网 IPv6"
		case "external-ipv4":
			return "外网 IPv4"
		case "external-ipv6":
			return "外网 IPv6"
		case "external":
			return "外网"
		case "internal":
		case undefined:
		case "":
			return "内网"
		default:
			return target
	}
}
