import { strict as assert } from "node:assert"
import { getAssetMediaDefaultPreview } from "./asset-media-default-preview.ts"

const visualFallback = { url: "https://example.test/visual.png", alt: "当前图片预览" }

assert.deepEqual(
	getAssetMediaDefaultPreview(
		[{ id: "cover-1", url: "/api/pulse/asset-media/object?version=cover-1" }],
		visualFallback
	),
	{ url: "/api/pulse/asset-media/object?version=cover-1", alt: "资产中心当前图片" }
)
assert.deepEqual(getAssetMediaDefaultPreview([], visualFallback), visualFallback)
