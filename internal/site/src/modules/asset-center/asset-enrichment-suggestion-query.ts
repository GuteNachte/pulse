import type { AssetEnrichmentSuggestionRecord } from "../../types"
import { escapePocketBaseFilterValue } from "./asset-query.ts"

type AssetEnrichmentSuggestionCollection = {
	getFullList: (options: {
		filter: string
		sort: string
		requestKey: null
	}) => Promise<AssetEnrichmentSuggestionRecord[]>
}

type PagedAssetEnrichmentSuggestionCollection = {
	getList: (
		page: number,
		perPage: number,
		options: {
			filter: string
			sort: string
			requestKey: null
		}
	) => Promise<{ items: AssetEnrichmentSuggestionRecord[] }>
}

export async function loadLatestReportSuggestions(
	collection: AssetEnrichmentSuggestionCollection,
	reportId: string | undefined
) {
	if (!reportId) return []
	return await collection.getFullList({
		filter: `report="${escapePocketBaseFilterValue(reportId)}"`,
		sort: "target_collection,target_field,created",
		requestKey: null,
	})
}

export async function loadPendingOfficialColorSuggestions(
	collection: PagedAssetEnrichmentSuggestionCollection,
	assetId: string | undefined
) {
	if (!assetId) return []
	const escapedAssetId = escapePocketBaseFilterValue(assetId)
	const page = await collection.getList(1, 20, {
		filter: `asset="${escapedAssetId}" && status="pending" && target_collection="assets" && (target_field="metadata.colors_available" || target_field="metadata.official_colors" || target_field="colors_available" || target_field="official_colors")`,
		sort: "-created",
		requestKey: null,
	})
	return page.items
}
