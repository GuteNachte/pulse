import type { AssetVisualRecord } from "../../types"
import { escapePocketBaseFilterValue } from "./asset-query.ts"

type AssetVisualCollection = {
	getList: (
		page: number,
		perPage: number,
		options: { filter: string; sort: string; fields: string; requestKey: null }
	) => Promise<{ items: AssetVisualRecord[] }>
}

const assetVisualDisplayFields = "id,asset,kind,status,primary,files,frames,metadata,created,updated"

export type AssetVisualFileURLBuilder = (recordId: string, file: string) => string

export async function loadDisplayAssetVisuals(
	collection: AssetVisualCollection,
	assetId: string,
	buildFileURL?: AssetVisualFileURLBuilder
) {
	const escapedAssetId = escapePocketBaseFilterValue(assetId)
	const [referenceVisualPage, manualVisualPage, candidateVisualPage] = await Promise.all([
		collection.getList(1, 1, {
			filter: `asset="${escapedAssetId}" && status="ready" && kind="official_reference" && primary=true`,
			sort: "-created",
			fields: assetVisualDisplayFields,
			requestKey: null,
		}),
		collection.getList(1, 1, {
			filter: `asset="${escapedAssetId}" && status="ready" && kind="manual"`,
			sort: "-primary,-created",
			fields: assetVisualDisplayFields,
			requestKey: null,
		}),
		collection.getList(1, 3, {
			filter: `asset="${escapedAssetId}" && status="ready" && kind="official_reference" && primary=false`,
			sort: "-created",
			fields: assetVisualDisplayFields,
			requestKey: null,
		}),
	])
	return resolveAssetVisualFrameURLs(
		[...referenceVisualPage.items, ...manualVisualPage.items, ...candidateVisualPage.items],
		buildFileURL
	)
}

export function resolveAssetVisualFrameURLs(visuals: AssetVisualRecord[], buildFileURL?: AssetVisualFileURLBuilder) {
	if (!buildFileURL) return visuals
	return visuals.map((visual) => {
		if (!visual.frames?.length) return visual
		return {
			...visual,
			frames: visual.frames.map((frame) => {
				const file = frame.file?.trim()
				if (!file) return frame
				return {
					...frame,
					url: buildFileURL(frame.file_record_id?.trim() || visual.id, file),
				}
			}),
		}
	})
}
