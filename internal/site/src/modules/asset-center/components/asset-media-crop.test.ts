import { strict as assert } from "node:assert"
import {
	assetMediaCropPresets,
	changeAssetMediaCropZoom,
	createContainedAssetMediaPlacement,
	getAssetMediaPlacementStyle,
	moveAssetMediaPlacement,
	scaleAssetMediaPlacement,
} from "./asset-media-crop.ts"

assert.deepEqual(assetMediaCropPresets, [{ id: "16:9", label: "16:9", ratio: 16 / 9 }])

assert.deepEqual(createContainedAssetMediaPlacement(1600, 900, 16 / 9), {
	x: 0,
	y: 0,
	width: 1,
	height: 1,
})
assert.deepEqual(createContainedAssetMediaPlacement(1000, 1000, 16 / 9), {
	x: 0.21875,
	y: 0,
	width: 0.5625,
	height: 1,
})
assert.deepEqual(createContainedAssetMediaPlacement(900, 1600, 16 / 9), {
	x: 0.341796875,
	y: 0,
	width: 0.31640625,
	height: 1,
})

assert.deepEqual(scaleAssetMediaPlacement({ x: 0.21875, y: 0, width: 0.5625, height: 1 }, 0.5), {
	x: 0.359375,
	y: 0.25,
	width: 0.28125,
	height: 0.5,
})
assert.deepEqual(scaleAssetMediaPlacement({ x: 0, y: 0, width: 1, height: 1 }, 2), {
	x: -0.5,
	y: -0.5,
	width: 2,
	height: 2,
})

const moved = moveAssetMediaPlacement({ x: 0.2, y: 0.1, width: 0.6, height: 0.8 }, -0.7, 0)
assert.equal(moved.x < 0, true)
assert.equal(moved.x + moved.width >= 0.05, true)
assert.deepEqual(moveAssetMediaPlacement({ x: 0, y: 0, width: 1, height: 1 }, 2, 2), {
	x: 0.95,
	y: 0.95,
	width: 1,
	height: 1,
})

assert.deepEqual(getAssetMediaPlacementStyle({ x: -0.25, y: 0.1, width: 1.5, height: 0.8 }), {
	left: "-25%",
	top: "10%",
	width: "150%",
	height: "80%",
})

assert.equal(changeAssetMediaCropZoom(1, -1), 1.1)
assert.equal(changeAssetMediaCropZoom(1, 1), 0.9)
assert.equal(changeAssetMediaCropZoom(0.25, 1), 0.25)
assert.equal(changeAssetMediaCropZoom(4, -1), 4)
