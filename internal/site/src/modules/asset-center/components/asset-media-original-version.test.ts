import { strict as assert } from "node:assert"
import { getAssetMediaOriginalVersionId } from "./asset-media-original-version.ts"

const versions = [
	{ id: "original", media: "media-1" },
	{ id: "render-1", media: "media-1", parent_version: "original" },
]

assert.equal(getAssetMediaOriginalVersionId(versions, "media-1"), "original")
