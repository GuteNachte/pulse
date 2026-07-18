import { ImageIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { AssetVisualRecord } from "@/types"
import {
	getAssetDisplayVisual,
	getAssetVisualCrop,
	getAssetVisualStageLayout,
	getDisplayAssetVisualFrames,
} from "../asset-visual-query"
import { useAssetVisualPreviewURL } from "./asset-visual-preview"

export function AssetVisualCard({ visuals }: { visuals: AssetVisualRecord[] }) {
	const latestVisual = getAssetDisplayVisual(visuals)
	const frames = useMemo(() => getDisplayAssetVisualFrames(latestVisual), [latestVisual])
	const activeFrame = frames[0]
	const activeCrop = getAssetVisualCrop(activeFrame)
	const previewURL = useAssetVisualPreviewURL(activeFrame?.url)
	const [activeImageSize, setActiveImageSize] = useState<{ width: number; height: number } | null>(null)
	const activeImageRatio =
		activeImageSize && activeImageSize.height > 0 ? activeImageSize.width / activeImageSize.height : 0
	const useLandscapeImageLayout = activeImageRatio > 1.12
	const isProviderLogo = activeFrame?.presentation === "provider_logo"
	const visualStageLayout = getAssetVisualStageLayout(
		Boolean(activeFrame?.url),
		useLandscapeImageLayout,
		isProviderLogo
	)

	useEffect(() => {
		setActiveImageSize(null)
	}, [activeFrame?.url])

	return (
		<Card className="overflow-hidden border-border/70 bg-card shadow-none">
			<CardContent className="p-2">
				<div
					className={cn(
						"relative isolate mx-auto grid w-full select-none place-items-center overflow-hidden rounded-md border border-border/70 bg-[#e5e7e5]",
						visualStageLayout.stageClassName
					)}
					style={{ maxWidth: visualStageLayout.maxWidth }}
				>
					{activeFrame?.url ? (
						<img
							src={previewURL}
							alt="设备全貌图"
							className={cn("relative z-10 h-full w-full", visualStageLayout.imageClassName)}
							style={
								activeCrop
									? {
											width: `${100 / activeCrop.width}%`,
											height: `${100 / activeCrop.height}%`,
											maxWidth: "none",
											left: `${(-activeCrop.x / activeCrop.width) * 100}%`,
											top: `${(-activeCrop.y / activeCrop.height) * 100}%`,
										}
									: undefined
							}
							onLoad={(event) =>
								setActiveImageSize({
									width: event.currentTarget.naturalWidth,
									height: event.currentTarget.naturalHeight,
								})
							}
							draggable={false}
						/>
					) : (
						<div className="grid place-items-center gap-2 text-center text-muted-foreground">
							<div className="grid size-12 place-items-center rounded-md border border-border/70 bg-card">
								<ImageIcon className="size-5" />
							</div>
						</div>
					)}
				</div>
			</CardContent>
		</Card>
	)
}
