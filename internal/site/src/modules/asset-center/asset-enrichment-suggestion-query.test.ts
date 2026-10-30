import {
	loadLatestReportSuggestions,
	loadPendingOfficialColorSuggestions,
} from "./asset-enrichment-suggestion-query.ts"
import type { AssetEnrichmentSuggestionRecord } from "../../types"

function assertDeepEqual(actual: unknown, expected: unknown) {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
	}
}

const calls: Array<{ options: Record<string, unknown> }> = []
const pagedCalls: Array<{ page: number; perPage: number; options: Record<string, unknown> }> = []
const fakeCollection = {
	getFullList(options: Record<string, unknown>) {
		calls.push({ options })
		return Promise.resolve([
			{
				id: "suggestion-1",
				report: "report-1",
				target_field: "metadata.cpu_model",
			} as unknown as AssetEnrichmentSuggestionRecord,
		])
	},
	getList(page: number, perPage: number, options: Record<string, unknown>) {
		pagedCalls.push({ page, perPage, options })
		return Promise.resolve({
			items: [
				{
					id: "color-suggestion-1",
					asset: "asset-1",
					status: "pending",
					target_field: "metadata.colors_available",
				} as unknown as AssetEnrichmentSuggestionRecord,
			],
		})
	},
}

const noReportSuggestions = await loadLatestReportSuggestions(fakeCollection, undefined)
assertDeepEqual(noReportSuggestions, [])
assertDeepEqual(calls, [])

const suggestions = await loadLatestReportSuggestions(fakeCollection, "report-1")

assertDeepEqual(
	calls.map((call) => ({ filter: call.options.filter, sort: call.options.sort })),
	[{ filter: 'report="report-1"', sort: "target_collection,target_field,created" }]
)
assertDeepEqual(
	suggestions.map((suggestion) => suggestion.id),
	["suggestion-1"]
)

calls.length = 0
await loadLatestReportSuggestions(fakeCollection, 'report"bad\\id')

assertDeepEqual(
	calls.map((call) => call.options.filter),
	['report="report\\"bad\\\\id"']
)

pagedCalls.length = 0
const colorSuggestions = await loadPendingOfficialColorSuggestions(fakeCollection, "asset-1")

assertDeepEqual(
	pagedCalls.map((call) => ({
		page: call.page,
		perPage: call.perPage,
		filter: call.options.filter,
		sort: call.options.sort,
	})),
	[
		{
			page: 1,
			perPage: 20,
			filter:
				'asset="asset-1" && status="pending" && target_collection="assets" && (target_field="metadata.colors_available" || target_field="metadata.official_colors" || target_field="colors_available" || target_field="official_colors")',
			sort: "-created",
		},
	]
)
assertDeepEqual(
	colorSuggestions.map((suggestion) => suggestion.id),
	["color-suggestion-1"]
)

pagedCalls.length = 0
await loadPendingOfficialColorSuggestions(fakeCollection, 'asset"bad\\id')

assertDeepEqual(
	pagedCalls.map((call) => call.options.filter),
	[
		'asset="asset\\"bad\\\\id" && status="pending" && target_collection="assets" && (target_field="metadata.colors_available" || target_field="metadata.official_colors" || target_field="colors_available" || target_field="official_colors")',
	]
)
