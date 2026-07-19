import { ChevronLeftIcon, ChevronRightIcon, ImageIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { pb } from "@/lib/api"
import { getAssetMediaShowcaseActiveItem, getAssetMediaShowcaseLayout } from "./asset-media-showcase-items"

export type AssetMediaShowcaseItem = { id: string; url: string; title?: string }

type MediaShowcaseImageState = { status: "loading" } | { status: "ready"; url: string } | { status: "error" }

function MediaShowcaseImage({ item, cover }: { item: AssetMediaShowcaseItem; cover?: boolean }) {
	const [state, setState] = useState<MediaShowcaseImageState>({ status: "loading" })

	useEffect(() => {
		let active = true
		let objectURL = ""
		const controller = new AbortController()
		setState({ status: "loading" })

		fetch(item.url, {
			headers: { Authorization: pb.authStore.token },
			signal: controller.signal,
		})
			.then(async (response) => {
				if (!response.ok) throw new Error("媒体读取失败")
				const blob = await response.blob()
				if (!active) return
				objectURL = URL.createObjectURL(blob)
				setState({ status: "ready", url: objectURL })
			})
			.catch(() => {
				if (active && !controller.signal.aborted) setState({ status: "error" })
			})

		return () => {
			active = false
			controller.abort()
			if (objectURL) URL.revokeObjectURL(objectURL)
		}
	}, [item.url])

	if (state.status === "loading") {
		return <div className="grid h-full place-items-center text-xs text-muted-foreground">图片加载中</div>
	}
	if (state.status === "error") {
		return <div className="grid h-full place-items-center text-xs text-muted-foreground">图片读取失败</div>
	}
	return (
		<img
			src={state.url}
			alt={item.title || (cover ? "资产封面" : "资产图片")}
			className="block h-full w-full object-contain"
		/>
	)
}

export function AssetMediaShowcase({ covers }: { covers: AssetMediaShowcaseItem[] }) {
	const { primary, thumbnails } = getAssetMediaShowcaseLayout(covers)
	const [thumbnailPage, setThumbnailPage] = useState(0)
	const [activeImageId, setActiveImageId] = useState<string>()
	const thumbnailPageCount = Math.max(1, Math.ceil(thumbnails.length / 4))
	const visibleThumbnails = useMemo(
		() => thumbnails.slice(thumbnailPage * 4, thumbnailPage * 4 + 4),
		[thumbnailPage, thumbnails]
	)

	useEffect(() => {
		setThumbnailPage((current) => Math.min(current, thumbnailPageCount - 1))
	}, [thumbnailPageCount])
	useEffect(() => {
		setActiveImageId(primary?.id)
	}, [primary?.id])

	const activeItem = getAssetMediaShowcaseActiveItem(primary, thumbnails, activeImageId)
	if (!primary) {
		return (
			<div className="grid gap-2">
				<div
					data-testid="asset-media-main-preview"
					className="grid aspect-[16/9] place-items-center overflow-hidden rounded-lg border border-border/70 bg-surface-soft"
				>
					<div className="grid place-items-center gap-2 text-muted-foreground">
						<ImageIcon className="size-5" />
						<span className="text-xs">暂无图片</span>
					</div>
				</div>
			</div>
		)
	}
	const displayedItem = activeItem ?? primary

	return (
		<div className="grid gap-2">
			<div
				data-testid="asset-media-main-preview"
				data-media-id={displayedItem.id}
				className="relative grid aspect-[16/9] place-items-center overflow-hidden rounded-lg border border-border/70 bg-surface-soft"
			>
				<MediaShowcaseImage key={displayedItem.url} item={displayedItem} cover />
			</div>
			{thumbnails.length > 0 && (
				<div className="relative">
					<div className="grid grid-cols-4 gap-2">
						{visibleThumbnails.map((item) => (
							<button
								key={item.id}
								type="button"
								aria-label={`查看图片：${item.title || item.id}`}
								aria-pressed={activeItem?.id === item.id}
								onClick={() => setActiveImageId(item.id)}
								className={`aspect-[16/9] overflow-hidden rounded border bg-surface-soft p-0 leading-none ${activeItem?.id === item.id ? "border-primary ring-1 ring-primary/40" : "border-border/70"}`}
							>
								<span className="grid h-full w-full place-items-center">
									<MediaShowcaseImage key={item.url} item={item} />
								</span>
							</button>
						))}
					</div>
					{thumbnailPageCount > 1 && (
						<>
							<Button
								type="button"
								size="icon"
								variant="outline"
								className="absolute start-1 top-1/2 size-7 -translate-y-1/2 rounded-full bg-card/95"
								aria-label="上一组图片"
								onClick={() => setThumbnailPage((current) => Math.max(0, current - 1))}
								disabled={thumbnailPage === 0}
							>
								<ChevronLeftIcon className="size-4" />
							</Button>
							<Button
								type="button"
								size="icon"
								variant="outline"
								className="absolute end-1 top-1/2 size-7 -translate-y-1/2 rounded-full bg-card/95"
								aria-label="下一组图片"
								onClick={() => setThumbnailPage((current) => Math.min(thumbnailPageCount - 1, current + 1))}
								disabled={thumbnailPage === thumbnailPageCount - 1}
							>
								<ChevronRightIcon className="size-4" />
							</Button>
						</>
					)}
				</div>
			)}
		</div>
	)
}
