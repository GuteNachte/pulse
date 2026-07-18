export type AssetMediaPlacement = {
	id: string
	media: string
	version: string
	role: "cover" | "gallery"
	visible?: boolean
	sort_order?: number
}

export function selectAssetMediaCover(placements: AssetMediaPlacement[]) {
	return placements.find((item) => item.role === "cover" && item.visible !== false)
}

export function selectVisibleAssetMediaGallery(placements: AssetMediaPlacement[]) {
	return placements
		.filter((item) => item.role === "gallery" && item.visible !== false)
		.sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
}

export function canDeleteAssetMediaVersion(versionId: string, placements: AssetMediaPlacement[]) {
	return !placements.some((item) => item.version === versionId)
}
