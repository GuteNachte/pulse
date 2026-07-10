import {
	getEnrichmentOnlineEmptyText,
	getEnrichmentOnlineSummary,
	getEnrichmentReportStatusLabel,
	getEnrichmentSuggestionSourceLinks,
} from "./asset-enrichment-report.ts"
import type { AssetEnrichmentReportRecord, AssetEnrichmentSuggestionRecord } from "../../types"

function assertDeepEqual(actual: unknown, expected: unknown) {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
	}
}

const report = {
	status: "partially_applied",
	source_summary: {
		online_match: {
			status: "ready",
			query: "Redmi K50 22041211AC",
			providers: ["official_url", "product_url"],
			errors: ["备用来源超时"],
			sources: [
				{
					provider: "official_url",
					type: "official_product",
					title: "Redmi K50",
					url: "https://www.mi.com/redmi-k50/",
					snippet: "官方产品资料",
					confidence: 98,
				},
				{ provider: "broken" },
			],
			ai_extractor: {
				status: "ready",
				provider: "openai-compatible",
				model: "agnes-text",
				suggestions: 12,
			},
		},
	},
} as unknown as AssetEnrichmentReportRecord

assertDeepEqual(getEnrichmentReportStatusLabel(report.status), "部分处理")
assertDeepEqual(getEnrichmentOnlineSummary(report), {
	status: "ready",
	query: "Redmi K50 22041211AC",
	detail: "",
	providers: ["official_url", "product_url"],
	errors: ["备用来源超时"],
	sources: [
		{
			provider: "official_url",
			type: "official_product",
			title: "Redmi K50",
			url: "https://www.mi.com/redmi-k50/",
			snippet: "官方产品资料",
			confidence: 98,
		},
	],
	aiExtractor: {
		status: "ready",
		provider: "openai-compatible",
		model: "agnes-text",
		suggestions: 12,
		error: "",
	},
})
assertDeepEqual(getEnrichmentOnlineEmptyText(undefined), "本报告没有资料来源摘要。")

const suggestion = {
	metadata: {
		source_urls: ["https://www.mi.com/redmi-k50/", "  https://www.mi.com/support/  "],
		source_titles: ["产品页"],
	},
} as unknown as AssetEnrichmentSuggestionRecord

assertDeepEqual(getEnrichmentSuggestionSourceLinks(suggestion), [
	{ url: "https://www.mi.com/redmi-k50/", title: "产品页" },
	{ url: "https://www.mi.com/support/", title: "https://www.mi.com/support/" },
])
