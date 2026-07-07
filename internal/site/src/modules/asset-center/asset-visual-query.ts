import type { AssetVisualRecord } from "../../types"
import { escapePocketBaseFilterValue } from "./asset-query.ts"

type AssetVisualCollection = {
	getList: (
		page: number,
		perPage: number,
		options: { filter: string; sort: string; requestKey: null }
	) => Promise<{ items: AssetVisualRecord[] }>
}

export async function loadDisplayAssetVisuals(collection: AssetVisualCollection, assetId: string) {
	const escapedAssetId = escapePocketBaseFilterValue(assetId)
	const [aiVisualPage, manualVisualPage] = await Promise.all([
		collection.getList(1, 1, {
			filter: `asset="${escapedAssetId}" && status="ready" && kind="ai_turntable" && primary=true`,
			sort: "-created",
			requestKey: null,
		}),
		collection.getList(1, 1, {
			filter: `asset="${escapedAssetId}" && status="ready" && kind="manual"`,
			sort: "-primary,-created",
			requestKey: null,
		}),
	])
	return [...aiVisualPage.items, ...manualVisualPage.items]
}
