import type { AssetRecord } from "@/types"
import { getMetadataString } from "./asset-schema.ts"

export type AssetNumberingSettings = {
	prefix: string
	digits: string
	nextSequence: string
}

export type NormalizedAssetNumberingSettings = {
	prefix: string
	digits: number
	nextSequence: number
}

export const assetNumberingStorageKey = "pulse.asset-center.numbering"

export const defaultAssetNumberingSettings: AssetNumberingSettings = {
	prefix: "ASSET-",
	digits: "4",
	nextSequence: "1",
}

export function loadAssetNumberingSettings(): AssetNumberingSettings {
	if (typeof window === "undefined") return defaultAssetNumberingSettings
	try {
		const raw = window.localStorage.getItem(assetNumberingStorageKey)
		if (!raw) return defaultAssetNumberingSettings
		const parsed = JSON.parse(raw) as Partial<AssetNumberingSettings>
		return {
			prefix: typeof parsed.prefix === "string" ? parsed.prefix : defaultAssetNumberingSettings.prefix,
			digits: typeof parsed.digits === "string" ? parsed.digits : defaultAssetNumberingSettings.digits,
			nextSequence:
				typeof parsed.nextSequence === "string" ? parsed.nextSequence : defaultAssetNumberingSettings.nextSequence,
		}
	} catch {
		return defaultAssetNumberingSettings
	}
}

export function saveAssetNumberingSettings(settings: AssetNumberingSettings) {
	if (typeof window === "undefined") return
	window.localStorage.setItem(assetNumberingStorageKey, JSON.stringify(settings))
}

export function resolveAssetNumberingSettings(
	server: Partial<AssetNumberingSettings> | null | undefined,
	legacy: Partial<AssetNumberingSettings> | null | undefined
): AssetNumberingSettings {
	const source = server ?? legacy ?? defaultAssetNumberingSettings
	return {
		prefix: typeof source.prefix === "string" ? source.prefix : defaultAssetNumberingSettings.prefix,
		digits: typeof source.digits === "string" ? source.digits : defaultAssetNumberingSettings.digits,
		nextSequence:
			typeof source.nextSequence === "string" ? source.nextSequence : defaultAssetNumberingSettings.nextSequence,
	}
}

export function normalizeAssetNumberingSettings(settings: AssetNumberingSettings): NormalizedAssetNumberingSettings {
	return {
		prefix: settings.prefix.trim() || defaultAssetNumberingSettings.prefix,
		digits: clampInteger(settings.digits, 1, 12, Number(defaultAssetNumberingSettings.digits)),
		nextSequence: clampInteger(settings.nextSequence, 1, 999999999, Number(defaultAssetNumberingSettings.nextSequence)),
	}
}

export function buildNextAssetTag(assets: AssetRecord[], settings: NormalizedAssetNumberingSettings) {
	return buildAssetTagCandidates(assets, settings, 1)[0] ?? formatAssetTag(settings.nextSequence, settings)
}

export function buildAssetTagCandidates(assets: AssetRecord[], settings: NormalizedAssetNumberingSettings, count = 5) {
	const used = new Set<string>()
	let next = settings.nextSequence
	const pattern = new RegExp(`^${escapeRegExp(settings.prefix)}(\\d+)$`)
	for (const asset of assets) {
		const tag = getMetadataString(asset.metadata, "asset_tag")
		if (!tag) continue
		used.add(tag)
		const match = tag.match(pattern)
		if (match) {
			next = Math.max(next, Number(match[1]) + 1)
		}
	}
	const candidates: string[] = []
	while (candidates.length < Math.max(0, Math.trunc(count))) {
		const candidate = formatAssetTag(next, settings)
		if (!used.has(candidate)) candidates.push(candidate)
		next += 1
	}
	return candidates
}

function formatAssetTag(sequence: number, settings: NormalizedAssetNumberingSettings) {
	return `${settings.prefix}${String(sequence).padStart(settings.digits, "0")}`
}

function clampInteger(value: string, min: number, max: number, fallback: number) {
	const number = Number(value)
	if (!Number.isFinite(number)) return fallback
	return Math.min(max, Math.max(min, Math.trunc(number)))
}

function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
