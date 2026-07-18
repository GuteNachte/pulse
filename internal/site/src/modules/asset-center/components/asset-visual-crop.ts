import type { AssetVisualCrop } from "@/types"

const minimumCropSize = 0.1

export type AssetVisualMediaBounds = {
	left: number
	top: number
	width: number
	height: number
}

export function clampAssetVisualCrop(crop: AssetVisualCrop): AssetVisualCrop {
	const width = Math.min(1, Math.max(minimumCropSize, crop.width))
	const height = Math.min(1, Math.max(minimumCropSize, crop.height))
	return {
		width,
		height,
		x: Math.min(1 - width, Math.max(0, crop.x)),
		y: Math.min(1 - height, Math.max(0, crop.y)),
	}
}

export function resetAssetVisualCrop() {
	return undefined
}

export function getAssetVisualMediaBounds(
	containerWidth: number,
	containerHeight: number,
	imageWidth: number,
	imageHeight: number
): AssetVisualMediaBounds | undefined {
	if (containerWidth <= 0 || containerHeight <= 0 || imageWidth <= 0 || imageHeight <= 0) return undefined
	const scale = Math.min(containerWidth / imageWidth, containerHeight / imageHeight)
	const width = imageWidth * scale
	const height = imageHeight * scale
	return {
		left: (containerWidth - width) / 2,
		top: (containerHeight - height) / 2,
		width,
		height,
	}
}
