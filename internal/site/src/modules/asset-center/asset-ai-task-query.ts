import type { AITaskRecord } from "../../types"
import { escapePocketBaseFilterValue } from "./asset-query.ts"

type AITaskCollection = {
	getList: (
		page: number,
		perPage: number,
		options: { filter: string; sort: string; requestKey: null }
	) => Promise<{ items: AITaskRecord[] }>
}

const latestTaskKinds = ["asset_enrichment", "asset_visual"] as const

export async function loadLatestAITasksByKind(collection: AITaskCollection, options?: { assetId?: string }) {
	const results = await Promise.all(
		latestTaskKinds.map(async (kind) => {
			const page = await collection.getList(1, 1, {
				filter: buildLatestAITaskFilter(kind, options?.assetId),
				sort: "-created",
				requestKey: null,
			})
			return page.items
		})
	)
	return results
		.flat()
		.sort((left, right) => new Date(right.created || 0).getTime() - new Date(left.created || 0).getTime())
}

function buildLatestAITaskFilter(kind: (typeof latestTaskKinds)[number], assetId?: string) {
	const kindFilter = `kind="${kind}"`
	if (!assetId) return kindFilter
	return `asset="${escapePocketBaseFilterValue(assetId)}" && ${kindFilter}`
}
