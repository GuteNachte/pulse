import { strict as assert } from "node:assert"
import { canDeleteAssetMediaVersion, selectAssetMediaCover, selectVisibleAssetMediaGallery } from "./asset-media.ts"

const placements = [
	{ id: "cover", media: "m1", version: "v1", role: "cover" as const, visible: true },
	{ id: "gallery-2", media: "m1", version: "v3", role: "gallery" as const, sort_order: 2 },
	{ id: "gallery-1", media: "m1", version: "v2", role: "gallery" as const, sort_order: 1 },
]
assert.equal(selectAssetMediaCover(placements)?.version, "v1")
assert.deepEqual(
	selectVisibleAssetMediaGallery(placements).map((item) => item.version),
	["v2", "v3"]
)
assert.equal(canDeleteAssetMediaVersion("v1", placements), false)
assert.equal(canDeleteAssetMediaVersion("v4", placements), true)
