import { removeEdgeConnectedPlainBackground } from "./asset-visual-background.ts"

function assertEqual(actual: unknown, expected: unknown) {
	if (actual !== expected) throw new Error(`Expected ${expected}, received ${actual}`)
}

const pixels = new Uint8ClampedArray([
	255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 48, 48, 48, 255, 255, 255, 255, 255,
	255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
])

assertEqual(removeEdgeConnectedPlainBackground(pixels, 3, 3), true)
assertEqual(pixels[3], 0)
assertEqual(pixels[4 * 4 + 3], 255)
