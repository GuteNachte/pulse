export const ASSET_MEDIA_CHANGED_EVENT = "asset-media-changed"

type AssetMediaChangedDetail = {
	assetId: string
	refreshes: Promise<void>[]
}

type AssetMediaRefresh = () => void | Promise<void>
type AssetMediaRequestScope = "detail" | "workspace"

function getBrowserEventTarget() {
	return window
}

export function getAssetMediaRequestKey(scope: AssetMediaRequestScope, assetId: string) {
	return `asset-media-${scope}-${assetId}`
}

export async function notifyAssetMediaChanged(assetId: string, target: EventTarget = getBrowserEventTarget()) {
	const detail: AssetMediaChangedDetail = { assetId, refreshes: [] }
	target.dispatchEvent(new CustomEvent<AssetMediaChangedDetail>(ASSET_MEDIA_CHANGED_EVENT, { detail }))
	await Promise.allSettled(detail.refreshes)
}

export function subscribeAssetMediaChanged(
	assetId: string,
	refresh: AssetMediaRefresh,
	target: EventTarget = getBrowserEventTarget()
) {
	const handleChange = (event: Event) => {
		const detail = (event as CustomEvent<AssetMediaChangedDetail>).detail
		if (detail?.assetId !== assetId) return
		detail.refreshes.push(Promise.resolve(refresh()))
	}

	target.addEventListener(ASSET_MEDIA_CHANGED_EVENT, handleChange)
	return () => target.removeEventListener(ASSET_MEDIA_CHANGED_EVENT, handleChange)
}
