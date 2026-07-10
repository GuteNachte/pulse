import type { AssetEnrichmentReportRecord, AssetEnrichmentSuggestionRecord } from "../../types"

export type EnrichmentOnlineSource = {
	provider: string
	type: string
	title: string
	url: string
	snippet: string
	confidence: number
}

export type EnrichmentOnlineSummary = {
	status: string
	query: string
	detail: string
	providers: string[]
	errors: string[]
	sources: EnrichmentOnlineSource[]
	aiExtractor?: {
		status: string
		provider: string
		model: string
		suggestions: number
		error: string
	}
}

export function getEnrichmentReportStatusLabel(status?: AssetEnrichmentReportRecord["status"]) {
	switch (status) {
		case "applied":
			return "已全部写入"
		case "partially_applied":
			return "部分处理"
		case "dismissed":
			return "已忽略"
		case "failed":
			return "失败"
		case "draft":
			return "草稿"
		default:
			return "待确认"
	}
}

export function getEnrichmentSuggestionStatusLabel(status?: AssetEnrichmentSuggestionRecord["status"]) {
	switch (status) {
		case "accepted":
			return "已写入"
		case "rejected":
			return "已忽略"
		case "stale":
			return "已过期"
		default:
			return "待确认"
	}
}

export function getEnrichmentSourceLabel(source?: AssetEnrichmentSuggestionRecord["source"]) {
	switch (source) {
		case "online":
			return "资料匹配"
		case "comparison":
			return "对比报告"
		case "manual":
			return "手动"
		default:
			return "本地采集"
	}
}

export function getEnrichmentOnlineSummary(report: AssetEnrichmentReportRecord): EnrichmentOnlineSummary | undefined {
	const sourceSummary = asRecord(report.source_summary)
	const onlineMatch = asRecord(sourceSummary?.online_match)
	if (!onlineMatch) return undefined
	const sources = getRecordArray(onlineMatch.sources)
		.map((source) => ({
			provider: getRecordString(source, "provider"),
			type: getRecordString(source, "type"),
			title: getRecordString(source, "title"),
			url: getRecordString(source, "url"),
			snippet: getRecordString(source, "snippet"),
			confidence: getRecordNumber(source, "confidence"),
		}))
		.filter((source) => source.url || source.title)
	const aiExtractor = asRecord(onlineMatch.ai_extractor)
	return {
		status: getRecordString(onlineMatch, "status"),
		query: getRecordString(onlineMatch, "query"),
		detail: getRecordString(onlineMatch, "detail"),
		providers: getRecordStringArray(onlineMatch, "providers"),
		errors: getRecordStringArray(onlineMatch, "errors"),
		sources,
		aiExtractor: aiExtractor
			? {
					status: getRecordString(aiExtractor, "status"),
					provider: getRecordString(aiExtractor, "provider"),
					model: getRecordString(aiExtractor, "model"),
					suggestions: getRecordNumber(aiExtractor, "suggestions"),
					error: getRecordString(aiExtractor, "error"),
				}
			: undefined,
	}
}

export function getEnrichmentOnlineStatusLabel(status?: string) {
	switch (status) {
		case "ready":
			return "已命中"
		case "no_match":
			return "未命中"
		case "not_configured":
			return "未配置"
		default:
			return "未查询"
	}
}

export function getEnrichmentOnlineEmptyText(summary?: EnrichmentOnlineSummary) {
	if (!summary) return "本报告没有资料来源摘要。"
	if (summary.status === "not_configured") return "资料补全 Agent 未获得可追溯来源，也没有可用的官方资料页。"
	if (summary.status === "no_match") {
		return "没有命中可追溯资料。可补充更准确的详细型号、内部型号或厂家资料页后重新收集。"
	}
	return "本次没有可展示的资料来源。"
}

export function getOnlineProviderLabel(provider?: string) {
	switch (provider) {
		case "support_url":
			return "支持页"
		case "product_url":
			return "产品页"
		case "official_url":
			return "官网资料"
		case "wikidata":
			return "Wikidata"
		case "duckduckgo":
		case "brave":
			return "资料来源"
		case "openai-compatible":
			return "AI 提取"
		default:
			return provider || "来源"
	}
}

export function getEnrichmentAIStatusLabel(status?: string) {
	switch (status) {
		case "ready":
			return "已提取"
		case "failed":
			return "失败"
		case "disabled":
			return "未启用"
		default:
			return "未配置"
	}
}

export function getOnlineSourceTypeLabel(type?: string) {
	switch (type) {
		case "official_support":
			return "官方支持"
		case "official_product":
			return "官方产品"
		case "structured_profile":
			return "结构资料"
		case "spec_database":
			return "规格库"
		case "web_result":
			return "网页结果"
		default:
			return type || "资料"
	}
}

export function getEnrichmentSuggestionSourceLinks(suggestion: AssetEnrichmentSuggestionRecord) {
	const urls = getMetadataStringArray(suggestion.metadata, "source_urls")
	const titles = getMetadataStringArray(suggestion.metadata, "source_titles")
	return urls.map((url, index) => ({
		url,
		title: titles[index] || url,
	}))
}

export function getMetadataStringArray(metadata: Record<string, unknown> | undefined, key: string) {
	if (!metadata) return []
	const value = metadata[key]
	if (Array.isArray(value)) {
		return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
	}
	if (typeof value === "string" && value.trim()) return [value.trim()]
	return []
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function getRecordArray(value: unknown) {
	return Array.isArray(value) ? value.map(asRecord).filter(Boolean) : []
}

function getRecordString(record: Record<string, unknown>, key: string) {
	const value = record[key]
	return typeof value === "string" ? value.trim() : ""
}

function getRecordNumber(record: Record<string, unknown>, key: string) {
	const value = record[key]
	return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function getRecordStringArray(record: Record<string, unknown>, key: string) {
	const value = record[key]
	if (Array.isArray(value)) {
		return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
	}
	return []
}
