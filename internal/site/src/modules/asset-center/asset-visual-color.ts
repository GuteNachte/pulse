import type { AssetEnrichmentSuggestionRecord, AssetRecord } from "../../types"

export function getAssetVisualColor(asset: AssetRecord) {
	return firstNonEmpty(getMetadataString(asset.metadata, "color"), getMetadataString(asset.metadata, "device_color"))
}

export function getAssetOfficialColorOptions(asset: AssetRecord, suggestions: AssetEnrichmentSuggestionRecord[] = []) {
	const metadata = asset.metadata ?? {}
	return mergeAssetColorOptions([
		...parseAssetColorOptions(
			firstNonEmpty(getMetadataString(metadata, "colors_available"), getMetadataString(metadata, "official_colors"))
		),
		...suggestions.flatMap((suggestion) => getOfficialColorOptionsFromSuggestion(suggestion)),
	])
}

export function mergeOfficialColorOptions(options: string[], current?: string) {
	const result = [...options]
	const value = current?.trim()
	if (value && !options.some((option) => normalizeComparableText(option) === normalizeComparableText(value))) {
		result.unshift(value)
	}
	return result
}

export function isOfficialColorRequiredForAssetType(type: AssetRecord["type"]) {
	return ["phone", "tablet", "wearable", "handheld", "ebook", "game_console", "tv", "speaker"].includes(type)
}

export function getAssetVisualGenerationBlockReason(asset: AssetRecord) {
	if (!asset.name?.trim()) return "收集候选图至少需要资产名称。"
	return ""
}

export function getAssetVisualSearchAdvice(asset: AssetRecord) {
	const result: string[] = []
	if (!asset.name?.trim()) result.push("资产名称")
	if (asset.type === "internet" || asset.type === "web_endpoint") {
		if (!asset.vendor?.trim()) result.push("运营商 / 服务商")
		return result
	}
	if (!asset.vendor?.trim()) result.push("厂商 / 品牌")
	if (!asset.model?.trim() && !(asset.type === "phone" && getMetadataString(asset.metadata, "internal_model"))) {
		result.push("型号 / 规格")
	}
	return result
}

function getOfficialColorOptionsFromSuggestion(suggestion: AssetEnrichmentSuggestionRecord) {
	if (suggestion.status !== "pending" || suggestion.target_collection !== "assets") return []
	const field = suggestion.target_field.replace(/^metadata\./, "")
	if (field !== "colors_available" && field !== "official_colors") return []
	return parseAssetColorOptions(suggestion.recommended_value)
}

function parseAssetColorOptions(raw: string) {
	const normalized = raw
		.replace(/[，、/／|；;\n]+/g, ",")
		.split(",")
		.map((item) => item.trim().replace(/^[[\]【】()（）"'“”]+|[[\]【】()（）"'“”]+$/g, ""))
		.filter(Boolean)
	return mergeAssetColorOptions(normalized)
}

function mergeAssetColorOptions(options: string[]) {
	const seen = new Set<string>()
	const result: string[] = []
	for (const option of options) {
		const value = option.trim()
		const key = normalizeComparableText(value)
		if (!value || !key || seen.has(key)) continue
		seen.add(key)
		result.push(value)
	}
	return result
}

function getMetadataString(metadata: Record<string, unknown> | undefined, key: string) {
	const value = metadata?.[key]
	if (typeof value === "string") return value.trim()
	if (typeof value === "number" && Number.isFinite(value)) return String(value)
	return ""
}

function firstNonEmpty(...values: string[]) {
	return values.find((value) => value.trim())?.trim() ?? ""
}

function normalizeComparableText(value: string) {
	return value.trim().toLowerCase()
}
