export const assetMediaCropPresets = [{ id: "16:9", label: "16:9", ratio: 16 / 9 }] as const

export type AssetMediaCropPreset = (typeof assetMediaCropPresets)[number]["id"]

export type AssetMediaPlacement = {
	x: number
	y: number
	width: number
	height: number
}

const minimumVisiblePlacement = 0.05

export function createContainedAssetMediaPlacement(
	imageWidth: number,
	imageHeight: number,
	canvasRatio: number
): AssetMediaPlacement | undefined {
	if (imageWidth <= 0 || imageHeight <= 0 || canvasRatio <= 0) return undefined
	const imageRatio = imageWidth / imageHeight
	if (imageRatio >= canvasRatio) {
		const height = canvasRatio / imageRatio
		return { x: 0, y: (1 - height) / 2, width: 1, height }
	}
	const width = imageRatio / canvasRatio
	return { x: (1 - width) / 2, y: 0, width, height: 1 }
}

export function scaleAssetMediaPlacement(placement: AssetMediaPlacement, factor: number): AssetMediaPlacement {
	const safeFactor = Number.isFinite(factor) && factor > 0 ? factor : 1
	const centerX = placement.x + placement.width / 2
	const centerY = placement.y + placement.height / 2
	const width = placement.width * safeFactor
	const height = placement.height * safeFactor
	return {
		x: centerX - width / 2,
		y: centerY - height / 2,
		width,
		height,
	}
}

export function moveAssetMediaPlacement(placement: AssetMediaPlacement, dx: number, dy: number): AssetMediaPlacement {
	return {
		...placement,
		x: Math.min(1 - minimumVisiblePlacement, Math.max(minimumVisiblePlacement - placement.width, placement.x + dx)),
		y: Math.min(1 - minimumVisiblePlacement, Math.max(minimumVisiblePlacement - placement.height, placement.y + dy)),
	}
}

export function getAssetMediaPlacementStyle(placement: AssetMediaPlacement): {
	left: string
	top: string
	width: string
	height: string
} {
	return {
		left: `${placement.x * 100}%`,
		top: `${placement.y * 100}%`,
		width: `${placement.width * 100}%`,
		height: `${placement.height * 100}%`,
	}
}

export function changeAssetMediaCropZoom(zoom: number, wheelDeltaY: number): number {
	const direction = Math.sign(wheelDeltaY)
	if (direction === 0) return zoom
	return Math.min(4, Math.max(0.25, Math.round((zoom - direction * 0.1) * 100) / 100))
}
