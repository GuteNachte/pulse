import { clampAssetVisualCrop, getAssetVisualMediaBounds, resetAssetVisualCrop } from "./asset-visual-crop.ts"

function assertDeepEqual(actual: unknown, expected: unknown) {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
	}
}

assertDeepEqual(clampAssetVisualCrop({ x: -0.2, y: 0.8, width: 0.05, height: 0.4 }), {
	width: 0.1,
	height: 0.4,
	x: 0,
	y: 0.6,
})
assertDeepEqual(resetAssetVisualCrop(), undefined)

assertDeepEqual(getAssetVisualMediaBounds(400, 300, 1600, 900), {
	left: 0,
	top: 37.5,
	width: 400,
	height: 225,
})

assertDeepEqual(getAssetVisualMediaBounds(400, 300, 900, 1600), {
	left: 115.625,
	top: 0,
	width: 168.75,
	height: 300,
})
