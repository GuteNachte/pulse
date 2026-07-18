import type { AssetEnrichmentSuggestionRecord } from "../../types"
import { normalizeMemorySpecification } from "./asset-memory-spec.ts"

export type AssetEnrichmentCandidateSource = "local" | "online"

export type AssetEnrichmentCandidate = {
	value: string
	sources: AssetEnrichmentCandidateSource[]
}

export function buildAssetEnrichmentCandidateMap(suggestions: AssetEnrichmentSuggestionRecord[]) {
	const candidates = new Map<string, AssetEnrichmentCandidate[]>()
	for (const suggestion of suggestions) {
		if (suggestion.status !== "pending" || suggestion.target_collection !== "assets") continue
		const field = suggestion.target_field.replace(/^metadata\./, "").trim()
		if (!field) continue
		addCandidate(candidates, field, suggestion.collected_value, "local")
		addCandidate(candidates, field, suggestion.online_value, "online")
	}
	return Object.fromEntries(candidates)
}

function addCandidate(
	candidates: Map<string, AssetEnrichmentCandidate[]>,
	field: string,
	value: string | undefined,
	source: AssetEnrichmentCandidateSource
) {
	const normalizedValue = normalizeCandidateValue(field, value)
	if (!normalizedValue) return
	const values = candidates.get(field) ?? []
	const matching = values.find((item) => item.value.toLocaleLowerCase() === normalizedValue.toLocaleLowerCase())
	if (matching) {
		if (!matching.sources.includes(source)) matching.sources.push(source)
	} else {
		values.push({ value: normalizedValue, sources: [source] })
	}
	candidates.set(field, values)
}

function normalizeCandidateValue(field: string, value: string | undefined) {
	const normalizedValue = value?.trim()
	if (field === "memory_detail") return normalizeMemorySpecification(normalizedValue)
	if (!normalizedValue || !field.endsWith("_mbps") || !/^\d+$/.test(normalizedValue)) return normalizedValue
	const speed = Number(normalizedValue)
	return Number.isSafeInteger(speed) && speed >= 1_000_000 ? String(Math.round(speed / 1_000_000)) : normalizedValue
}
