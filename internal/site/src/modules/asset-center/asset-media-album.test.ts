import assert from "node:assert/strict"
import {
	ASSET_MEDIA_ALBUMS,
	buildAssetMediaAlbumChips,
	matchAssetMediaAlbumChip,
	normalizeAssetMediaAlbum,
} from "./asset-media-album.ts"

// 2026-10-07 计算设备⑥：图库相册分组契约（docs/pc-asset-design.md 五）
// 相册 = 整机 + 配件分类同名词；非法值归未分组；chips 按固定顺序去重。

assert.deepEqual(
	ASSET_MEDIA_ALBUMS.map((album) => album.value),
	["whole", "cpu", "motherboard", "memory", "storage", "gpu", "psu", "case", "cooler", "nic", "other"]
)
assert.deepEqual(
	ASSET_MEDIA_ALBUMS.map((album) => album.label),
	["整机", "CPU", "主板", "内存", "存储", "显卡", "电源", "机箱", "散热器", "网卡", "其他"]
)

assert.equal(normalizeAssetMediaAlbum("gpu"), "gpu")
assert.equal(normalizeAssetMediaAlbum("bogus"), "")
assert.equal(normalizeMediaAlbumCompat(), "")

function normalizeMediaAlbumCompat() {
	return normalizeAssetMediaAlbum(null)
}

// chips：全部 + 未分组（仅有未分组图时）+ 实际出现过的相册（固定顺序）
const chips = buildAssetMediaAlbumChips(["memory", "whole", undefined, "memory", "bogus"])
assert.deepEqual(
	chips.map((chip) => chip.key),
	["all", "ungrouped", "whole", "memory"]
)
assert.deepEqual(
	chips.map((chip) => chip.label),
	["全部", "未分组", "整机", "内存"]
)

const chipsNoUngrouped = buildAssetMediaAlbumChips(["whole", "cpu"])
assert.deepEqual(
	chipsNoUngrouped.map((chip) => chip.key),
	["all", "whole", "cpu"]
)

// 匹配：all 全过；ungrouped 只匹配空/非法；相册精确匹配
for (const album of ["whole", "memory", undefined, "bogus"]) {
	assert.equal(matchAssetMediaAlbumChip(album, "all"), true)
}
assert.equal(matchAssetMediaAlbumChip(undefined, "ungrouped"), true)
assert.equal(matchAssetMediaAlbumChip("bogus", "ungrouped"), true)
assert.equal(matchAssetMediaAlbumChip("whole", "ungrouped"), false)
assert.equal(matchAssetMediaAlbumChip("memory", "memory"), true)
assert.equal(matchAssetMediaAlbumChip("memory", "cpu"), false)

console.log("asset media album contract passed")
