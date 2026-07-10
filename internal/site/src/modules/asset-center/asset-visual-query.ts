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
	const [referenceVisualPage, manualVisualPage, candidateVisualPage] = await Promise.all([
		collection.getList(1, 1, {
			filter: `asset="${escapedAssetId}" && status="ready" && kind="official_reference" && primary=true`,
			sort: "-created",
			requestKey: null,
		}),
		collection.getList(1, 1, {
			filter: `asset="${escapedAssetId}" && status="ready" && kind="manual"`,
			sort: "-primary,-created",
			requestKey: null,
		}),
		collection.getList(1, 3, {
			filter: `asset="${escapedAssetId}" && status="ready" && kind="official_reference" && primary=false`,
			sort: "-created",
			requestKey: null,
		}),
	])
	return [...referenceVisualPage.items, ...manualVisualPage.items, ...candidateVisualPage.items]
}

export function getDisplayAssetVisualFrames(visual: AssetVisualRecord | undefined) {
	const frames = visual?.frames?.filter(isDisplayableAssetVisualFrame) ?? []
	return frames.slice(0, 1)
}

export function isDisplayableAssetVisualFrame(frame: NonNullable<AssetVisualRecord["frames"]>[number] | undefined) {
	if (!frame?.url) return false
	const lower = frame.url.toLowerCase()
	if (lower.startsWith("data:image/") && lower.includes(";base64,")) return true
	const rejected = [
		"appdownload",
		"download.png",
		"qrcode",
		"qr-code",
		"/qr",
		"wechat",
		"weixin",
		"favicon",
		"logo",
		"icon",
		"sprite",
		"avatar",
		"placeholder",
		"loading",
		"blank",
		"appstore",
		"googleplay",
		"playstore",
		"share",
	]
	return !rejected.some((marker) => lower.includes(marker))
}
