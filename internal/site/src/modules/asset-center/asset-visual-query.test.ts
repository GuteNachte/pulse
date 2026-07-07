import { loadDisplayAssetVisuals } from "./asset-visual-query.ts"
import type { AssetVisualRecord } from "../../types"

function assertDeepEqual(actual: unknown, expected: unknown) {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
	}
}

const calls: Array<{ page: number; perPage: number; options: Record<string, unknown> }> = []
const fakeCollection = {
	getList(page: number, perPage: number, options: Record<string, unknown>) {
		calls.push({ page, perPage, options })
		const filter = String(options.filter)
		const id = filter.includes('kind="ai_turntable"') ? "visual-ai" : "visual-manual"
		return Promise.resolve({
			items: [
				{
					id,
					asset: "asset-123",
					kind: filter.includes('kind="ai_turntable"') ? "ai_turntable" : "manual",
					status: "ready",
				} as unknown as AssetVisualRecord,
			],
		})
	},
}

const visuals = await loadDisplayAssetVisuals(fakeCollection, "asset-123")

assertDeepEqual(
	calls.map((call) => ({
		page: call.page,
		perPage: call.perPage,
		filter: call.options.filter,
		sort: call.options.sort,
	})),
	[
		{
			page: 1,
			perPage: 1,
			filter: 'asset="asset-123" && status="ready" && kind="ai_turntable" && primary=true',
			sort: "-created",
		},
		{
			page: 1,
			perPage: 1,
			filter: 'asset="asset-123" && status="ready" && kind="manual"',
			sort: "-primary,-created",
		},
	]
)
assertDeepEqual(
	visuals.map((visual) => visual.id),
	["visual-ai", "visual-manual"]
)

calls.length = 0
await loadDisplayAssetVisuals(fakeCollection, 'asset"bad\\id')

assertDeepEqual(
	calls.map((call) => call.options.filter),
	[
		'asset="asset\\"bad\\\\id" && status="ready" && kind="ai_turntable" && primary=true',
		'asset="asset\\"bad\\\\id" && status="ready" && kind="manual"',
	]
)
