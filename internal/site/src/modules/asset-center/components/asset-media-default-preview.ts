export type AssetMediaPreview = { url: string; alt: string }

export function getAssetMediaDefaultPreview(
	covers: Array<{ id: string; url: string }>,
	fallbackPreview: AssetMediaPreview | undefined
): AssetMediaPreview | undefined {
	const cover = covers[0]
	return cover?.url ? { url: cover.url, alt: "资产中心当前图片" } : fallbackPreview
}
