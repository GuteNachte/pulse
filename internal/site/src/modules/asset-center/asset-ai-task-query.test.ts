import { loadLatestAITasksByKind } from "./asset-ai-task-query.ts"
import type { AITaskRecord } from "../../types"

function assertDeepEqual(actual: unknown, expected: unknown) {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
	}
}

const calls: Array<{ page: number; perPage: number; options: Record<string, unknown> }> = []
const fakeCollection = {
	getList(page: number, perPage: number, options: Record<string, unknown>) {
		calls.push({ page, perPage, options })
		const kind =
			typeof options.filter === "string" && options.filter.includes("asset_visual")
				? "asset_visual"
				: "asset_enrichment"
		return Promise.resolve({
			items: [
				{
					id: `${kind}-latest`,
					kind,
					status: "ready",
					created: kind === "asset_visual" ? "2026-07-07 12:00:00.000Z" : "2026-07-07 11:00:00.000Z",
				} as unknown as AITaskRecord,
			],
		})
	},
}

const tasks = await loadLatestAITasksByKind(fakeCollection)

assertDeepEqual(
	calls.map((call) => ({
		page: call.page,
		perPage: call.perPage,
		filter: call.options.filter,
		sort: call.options.sort,
	})),
	[
		{ page: 1, perPage: 1, filter: 'kind="asset_enrichment"', sort: "-created" },
		{ page: 1, perPage: 1, filter: 'kind="asset_visual"', sort: "-created" },
	]
)

assertDeepEqual(
	tasks.map((task) => task.id),
	["asset_visual-latest", "asset_enrichment-latest"]
)

calls.length = 0
await loadLatestAITasksByKind(fakeCollection, { assetId: "asset-123" })

assertDeepEqual(
	calls.map((call) => ({ filter: call.options.filter, sort: call.options.sort })),
	[
		{ filter: 'asset="asset-123" && kind="asset_enrichment"', sort: "-created" },
		{ filter: 'asset="asset-123" && kind="asset_visual"', sort: "-created" },
	]
)

calls.length = 0
await loadLatestAITasksByKind(fakeCollection, { assetId: 'asset"bad\\id' })

assertDeepEqual(
	calls.map((call) => call.options.filter),
	['asset="asset\\"bad\\\\id" && kind="asset_enrichment"', 'asset="asset\\"bad\\\\id" && kind="asset_visual"']
)
