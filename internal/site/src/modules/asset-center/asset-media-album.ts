// 2026-10-07 计算设备⑥（docs/pc-asset-design.md 五）：图库相册分组逻辑——
// 相册 = 整机（whole）+ 与配件分类同名词的硬件相册；空 = 未分组（旧数据不动）。
// 归组规则：上传/收集图片默认整机；配件图（二期按配件上下文入库）带对应配件相册。

export type AssetMediaAlbum =
	| "whole"
	| "cpu"
	| "motherboard"
	| "memory"
	| "storage"
	| "gpu"
	| "psu"
	| "case"
	| "cooler"
	| "nic"
	| "other"

export const ASSET_MEDIA_ALBUMS: { value: AssetMediaAlbum; label: string }[] = [
	{ value: "whole", label: "整机" },
	{ value: "cpu", label: "CPU" },
	{ value: "motherboard", label: "主板" },
	{ value: "memory", label: "内存" },
	{ value: "storage", label: "存储" },
	{ value: "gpu", label: "显卡" },
	{ value: "psu", label: "电源" },
	{ value: "case", label: "机箱" },
	{ value: "cooler", label: "散热器" },
	{ value: "nic", label: "网卡" },
	{ value: "other", label: "其他" },
]

const albumLabels = new Map(ASSET_MEDIA_ALBUMS.map((album) => [album.value, album.label]))

// 非法值归空（未分组），与 Hub 端 normalizeAssetMediaAlbum 同口径
export function normalizeAssetMediaAlbum(album: string | undefined | null): AssetMediaAlbum | "" {
	if (!album) return ""
	return albumLabels.has(album as AssetMediaAlbum) ? (album as AssetMediaAlbum) : ""
}

export type AlbumFilterKey = "all" | "ungrouped" | AssetMediaAlbum

// 图库过滤 chips：全部 + 未分组（仅有未分组图时）+ 按图库里实际出现的相册去重
export function buildAssetMediaAlbumChips(albums: (string | undefined)[]): { key: AlbumFilterKey; label: string }[] {
	const chips: { key: AlbumFilterKey; label: string }[] = [{ key: "all", label: "全部" }]
	const seen = new Set<AlbumFilterKey>()
	let hasUngrouped = false
	for (const album of albums) {
		const normalized = normalizeAssetMediaAlbum(album)
		if (!normalized) {
			hasUngrouped = true
			continue
		}
		seen.add(normalized)
	}
	if (hasUngrouped) chips.push({ key: "ungrouped", label: "未分组" })
	// 按 ASSET_MEDIA_ALBUMS 固定顺序输出
	for (const album of ASSET_MEDIA_ALBUMS) {
		if (seen.has(album.value)) chips.push({ key: album.value, label: album.label })
	}
	return chips
}

export function matchAssetMediaAlbumChip(album: string | undefined | null, key: AlbumFilterKey) {
	if (key === "all") return true
	const normalized = normalizeAssetMediaAlbum(album)
	if (key === "ungrouped") return normalized === ""
	return normalized === key
}
