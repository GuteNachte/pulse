export function isAssetMediaCoverVersion(
	placements: Array<{ role: string; version: string; visible?: boolean }>,
	versionId: string | undefined
): boolean {
	return Boolean(
		versionId &&
			placements.some(
				(placement) => placement.role === "cover" && placement.version === versionId && placement.visible !== false
			)
	)
}

export function isAssetMediaGalleryVersion(
	placements: Array<{ role: string; version: string; visible?: boolean }>,
	versionId: string | undefined
): boolean {
	return Boolean(
		versionId &&
			placements.some(
				(placement) => placement.role === "gallery" && placement.version === versionId && placement.visible !== false
			)
	)
}

export function getNextAssetMediaCoverVisibility(isCover: boolean): boolean {
	return !isCover
}

export function getAssetMediaCoverActionLabel(isCover: boolean): "取消封面" | "设为封面" {
	return isCover ? "取消封面" : "设为封面"
}

export function getAssetMediaCoverButtonLabel(): "封面" {
	return "封面"
}

export function getAssetMediaCoverIconClassName(isCover: boolean): string {
	return isCover ? "size-3 fill-primary text-primary" : "size-3 text-muted-foreground"
}
