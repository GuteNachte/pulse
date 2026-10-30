import { normalizeAssetMediaAlbum } from "./asset-media-album.ts"

export type AssetMediaPlacement = {
	id: string
	media: string
	version: string
	role: "cover" | "gallery"
	visible?: boolean
	sort_order?: number
}

// 2026-10-08 梳理⑤：封面/画廊只显示整机相册——整机相册（whole）与未分组（旧数据）参与展示，
// 配件相册（CPU/内存/存储…）的图归配件编辑弹窗与图片库分节查看，不混入整机画廊。
export function isWholeAlbumMedia(album: string | undefined | null) {
	const normalized = normalizeAssetMediaAlbum(album)
	return normalized === "" || normalized === "whole"
}

export function filterWholeAlbumPlacements<T extends { media: string }>(
	placements: T[],
	mediaAlbumById: Map<string, string>
): T[] {
	return placements.filter((item) => isWholeAlbumMedia(mediaAlbumById.get(item.media)))
}

// 2026-10-09 图片专项修复：封面/图库互斥的显示层兜底——同一版本（同一张图）在
// 封面与图库中只出现一次，封面优先；存量"同一张图既有封面位又有图库位"的脏数据
// 在这里被收敛，保证大图与下面一排都不重复。
export function dedupeAssetMediaShowcaseVersions<C extends { version: string }, G extends { version: string }>(
	covers: C[],
	gallery: G[]
): { covers: C[]; gallery: G[] } {
	const seen = new Set<string>()
	const uniqueCovers = covers.filter((item) => {
		if (seen.has(item.version)) return false
		seen.add(item.version)
		return true
	})
	const uniqueGallery = gallery.filter((item) => {
		if (seen.has(item.version)) return false
		seen.add(item.version)
		return true
	})
	return { covers: uniqueCovers, gallery: uniqueGallery }
}
