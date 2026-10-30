import { strict as assert } from "node:assert"
import { dedupeAssetMediaShowcaseVersions } from "./asset-media.ts"

// 2026-10-09 图片专项修复：同一版本同时出现在封面与图库时，图库重复项被剔除（封面优先）
const duplicated = dedupeAssetMediaShowcaseVersions(
	[{ id: "cover-b", version: "vb" }],
	[
		{ id: "gallery-a", version: "va" },
		{ id: "gallery-b", version: "vb" },
	]
)
assert.deepEqual(
	duplicated.covers.map((item) => item.id),
	["cover-b"]
)
assert.deepEqual(
	duplicated.gallery.map((item) => item.id),
	["gallery-a"]
)

// 封面自身重复（多个可见封面位）只保留第一个
const doubleCovers = dedupeAssetMediaShowcaseVersions(
	[
		{ id: "cover-1", version: "v1" },
		{ id: "cover-2", version: "v1" },
	],
	[]
)
assert.deepEqual(
	doubleCovers.covers.map((item) => item.id),
	["cover-1"]
)

// 图库内部重复同样收敛
const doubleGallery = dedupeAssetMediaShowcaseVersions(
	[],
	[
		{ id: "g1", version: "v9" },
		{ id: "g2", version: "v9" },
	]
)
assert.deepEqual(
	doubleGallery.gallery.map((item) => item.id),
	["g1"]
)
