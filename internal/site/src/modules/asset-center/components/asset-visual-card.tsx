import { ImageIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { useTheme } from "@/components/theme-provider"
import { cn } from "@/lib/utils"
import type { AssetVisualRecord } from "@/types"
import { getAssetDisplayVisual, getDisplayAssetVisualFrames } from "../asset-visual-query"

export function AssetVisualCard({ visuals }: { visuals: AssetVisualRecord[] }) {
	const { theme } = useTheme()
	const [systemTheme, setSystemTheme] = useState<"dark" | "light">(() =>
		typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
	)
	const latestVisual = getAssetDisplayVisual(visuals)
	const frames = useMemo(() => getDisplayAssetVisualFrames(latestVisual), [latestVisual])
	const activeFrame = frames[0]
	const [activeImageSize, setActiveImageSize] = useState<{ width: number; height: number } | null>(null)
	const effectiveTheme = theme === "system" ? systemTheme : theme
	const isDarkVisualStage = effectiveTheme === "dark" && Boolean(activeFrame?.url)
	const activeImageRatio =
		activeImageSize && activeImageSize.height > 0 ? activeImageSize.width / activeImageSize.height : 0
	const useLandscapeImageLayout = activeImageRatio > 1.12
	const visualStageRatio = useLandscapeImageLayout ? "aspect-[4/3]" : "aspect-[3/4]"
	const visualImageFit = useLandscapeImageLayout ? "object-cover p-0" : "object-contain p-1 sm:p-2"

	useEffect(() => {
		if (theme !== "system" || typeof window === "undefined") return
		const media = window.matchMedia("(prefers-color-scheme: dark)")
		const syncSystemTheme = () => setSystemTheme(media.matches ? "dark" : "light")
		syncSystemTheme()
		media.addEventListener("change", syncSystemTheme)
		return () => media.removeEventListener("change", syncSystemTheme)
	}, [theme])

	useEffect(() => {
		setActiveImageSize(null)
	}, [activeFrame?.url])

	return (
		<Card className="overflow-hidden border-border/70 bg-card shadow-none">
			<CardContent className="p-2">
				<div
					className={cn(
						"relative isolate mx-auto grid w-full select-none place-items-center overflow-hidden rounded-md border border-border/70 bg-card dark:bg-background",
						visualStageRatio,
						isDarkVisualStage &&
							"border-white/10 bg-[#050506] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05),inset_0_-80px_120px_rgba(0,0,0,0.55)]"
					)}
					style={{
						maxWidth: useLandscapeImageLayout ? "100%" : "min(100%, calc((100vh - 10rem) * 0.75), 24rem)",
					}}
				>
					{activeFrame?.url ? (
						<>
							{isDarkVisualStage && (
								<>
									<div
										aria-hidden="true"
										className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(10,10,12,0.30)_38%,rgba(5,5,6,0.86)_100%)]"
									/>
									<div
										aria-hidden="true"
										className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),transparent_28%,rgba(0,0,0,0.36)_100%)]"
									/>
								</>
							)}
							<img
								src={activeFrame.url}
								alt="设备全貌图"
								className={cn(
									"relative z-10 h-full w-full",
									visualImageFit,
									isDarkVisualStage && "brightness-110 contrast-110 drop-shadow-[0_30px_52px_rgba(0,0,0,0.72)]"
								)}
								onLoad={(event) =>
									setActiveImageSize({
										width: event.currentTarget.naturalWidth,
										height: event.currentTarget.naturalHeight,
									})
								}
								draggable={false}
							/>
						</>
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
