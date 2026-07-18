import { useEffect, useState } from "react"
import { removeEdgeConnectedPlainBackground } from "./asset-visual-background"

const previewMaximumEdge = 1600

export function useAssetVisualPreviewURL(url: string | undefined, removePlainBackground = true) {
	const [previewURL, setPreviewURL] = useState(url)

	useEffect(() => {
		setPreviewURL(url)
		if (!url || !removePlainBackground) return
		let cancelled = false
		const image = new Image()
		image.decoding = "async"
		image.onload = () => {
			if (cancelled || !image.naturalWidth || !image.naturalHeight) return
			try {
				const scale = Math.min(1, previewMaximumEdge / Math.max(image.naturalWidth, image.naturalHeight))
				const width = Math.max(1, Math.round(image.naturalWidth * scale))
				const height = Math.max(1, Math.round(image.naturalHeight * scale))
				const canvas = document.createElement("canvas")
				canvas.width = width
				canvas.height = height
				const context = canvas.getContext("2d", { willReadFrequently: true })
				if (!context) return
				context.drawImage(image, 0, 0, width, height)
				const imageData = context.getImageData(0, 0, width, height)
				if (!removeEdgeConnectedPlainBackground(imageData.data, width, height)) return
				context.putImageData(imageData, 0, 0)
				if (!cancelled) setPreviewURL(canvas.toDataURL("image/png"))
			} catch {
				// Keep the locally archived original when a browser cannot read the image pixels.
			}
		}
		image.src = url
		return () => {
			cancelled = true
		}
	}, [removePlainBackground, url])

	return previewURL
}
