import { normalizeOptionalURL, resolveFormIconURL, splitURL } from "./target-utils.ts"
import { createEmptyForm, type MonitorForm, type TargetKind, type TargetScope } from "./types.ts"
import type { AssetRecord } from "../../../types.ts"

type MonitorFormAssetOptions = {
	base?: MonitorForm
	system?: string
	interval_seconds?: number
	timeout_seconds?: number
	enabled?: boolean
}

export function createMonitorFormFromEndpointAsset(asset: AssetRecord, options?: MonitorFormAssetOptions): MonitorForm {
	const base = options?.base ?? createEmptyForm()
	const targets = monitorTargetsFromEndpointAsset(asset)
	const iconSource = targets.some((target) => target.kind.startsWith("internal"))
		? "internal"
		: targets.some((target) => target.kind.startsWith("external"))
			? "external"
			: base.icon_source
	const nextForm: MonitorForm = {
		...base,
		id: base.id,
		system: options?.system ?? base.system,
		asset: asset.id,
		name: asset.name || base.name,
		description: firstNonEmpty(asset.notes, asset.role, base.description),
		targets: targets.length ? targets : base.targets,
		icon_source: iconSource,
		group: firstNonEmpty(asset.location, asset.role, base.group),
		interval_seconds: options?.interval_seconds ?? base.interval_seconds,
		timeout_seconds: options?.timeout_seconds ?? base.timeout_seconds,
		enabled: options?.enabled ?? base.enabled,
	}
	return { ...nextForm, icon_url: resolveFormIconURL(nextForm) }
}

export function monitorTargetsFromEndpointAsset(asset: AssetRecord): MonitorForm["targets"] {
	const internalURL = normalizeOptionalURL(metadataString(asset, "internal_url"))
	const externalURL = normalizeOptionalURL(metadataString(asset, "external_url"))
	const defaultURL = normalizeOptionalURL(metadataString(asset, "url"))
	const candidates: Array<{ scope: TargetScope; url: string }> = []
	if (internalURL) {
		candidates.push({ scope: "internal", url: internalURL })
	}
	if (externalURL) {
		candidates.push({ scope: "external", url: externalURL })
	}
	if (!candidates.length && defaultURL) {
		candidates.push({ scope: defaultScopeFromAsset(asset), url: defaultURL })
	}

	const seenURLs = new Set<string>()
	return candidates.flatMap((candidate) => {
		if (!candidate.url || seenURLs.has(candidate.url)) return []
		seenURLs.add(candidate.url)
		const kind = targetKindForURL(candidate.url, candidate.scope)
		const parts = splitURL(candidate.url, candidate.scope === "internal" ? "http://" : "https://")
		return [{ id: kind, kind, protocol: parts.protocol, address: parts.address }]
	})
}

function targetKindForURL(rawURL: string, scope: TargetScope): TargetKind {
	return `${scope}-${urlLooksIPv6(rawURL) ? "ipv6" : "ipv4"}` as TargetKind
}

function urlLooksIPv6(rawURL: string) {
	try {
		return new URL(rawURL).hostname.includes(":")
	} catch {
		return rawURL.includes("[") && rawURL.includes("]")
	}
}

function defaultScopeFromAsset(asset: AssetRecord): TargetScope {
	const scope = metadataString(asset, "endpoint_scope").toLowerCase()
	return scope.includes("外") || scope.includes("public") || scope.includes("external") ? "external" : "internal"
}

function metadataString(asset: AssetRecord, key: string) {
	const value = asset.metadata?.[key]
	if (typeof value === "string") return value.trim()
	if (typeof value === "number" && Number.isFinite(value)) return String(value)
	return ""
}

function firstNonEmpty(...values: Array<string | undefined>) {
	return values.map((value) => value?.trim() ?? "").find(Boolean) ?? ""
}
