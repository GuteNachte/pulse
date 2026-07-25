import { strict as assert } from "node:assert"
import {
	getAssetMediaCoverActionLabel,
	getAssetMediaCoverButtonLabel,
	getAssetMediaCoverIconClassName,
	getNextAssetMediaCoverVisibility,
	isAssetMediaCoverVersion,
	isAssetMediaGalleryVersion,
} from "./asset-media-placement.ts"

assert.equal(isAssetMediaCoverVersion([{ role: "cover", version: "v1", visible: true }], "v1"), true)
assert.equal(isAssetMediaCoverVersion([{ role: "cover", version: "v1", visible: false }], "v1"), false)
assert.equal(isAssetMediaCoverVersion([{ role: "gallery", version: "v1", visible: true }], "v1"), false)
assert.equal(isAssetMediaGalleryVersion([{ role: "gallery", version: "v1", visible: true }], "v1"), true)
assert.equal(isAssetMediaGalleryVersion([{ role: "gallery", version: "v1", visible: false }], "v1"), false)
assert.equal(getNextAssetMediaCoverVisibility(true), false)
assert.equal(getNextAssetMediaCoverVisibility(false), true)
assert.equal(getAssetMediaCoverActionLabel(true), "取消封面")
assert.equal(getAssetMediaCoverActionLabel(false), "设为封面")
assert.equal(getAssetMediaCoverButtonLabel(), "封面")
assert.equal(getAssetMediaCoverIconClassName(true), "size-3 fill-primary text-primary")
assert.equal(getAssetMediaCoverIconClassName(false), "size-3 text-muted-foreground")
