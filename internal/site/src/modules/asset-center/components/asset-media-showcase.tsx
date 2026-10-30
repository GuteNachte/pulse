import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon, ImageIcon } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { pb } from "@/lib/api"
import { getAssetMediaShowcaseActiveItem, getAssetMediaShowcaseLayout } from "./asset-media-showcase-items"

export type AssetMediaShowcaseItem = { id: string; url: string; title?: string }
export type AssetMediaShowcaseGalleryItem = AssetMediaShowcaseItem & { movable?: boolean }

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
			className="absolute inset-0 block h-full w-full object-contain"
		/>
	)
}

export function AssetMediaShowcase({
	covers,
	gallery = [],
	onMoveGallery,
	fallbackIcon: FallbackIcon = ImageIcon,
}: {
	covers: AssetMediaShowcaseItem[]
	gallery?: AssetMediaShowcaseGalleryItem[]
	onMoveGallery?: (placementId: string, direction: -1 | 1) => void
	/** 无图占位图标：详情页按资产类型传设备图标 */
	fallbackIcon?: LucideIcon
}) {
	const { primary, thumbnails } = getAssetMediaShowcaseLayout(covers)
	const [thumbnailPage, setThumbnailPage] = useState(0)
	// 2026-10-06 显示精修：点击主图全屏预览（图片经鉴权加载，直接复用展示组件取流）
	const [lightboxOpen, setLightboxOpen] = useState(false)
	const [activeImageId, setActiveImageId] = useState<string>()
	// 缩略图排 = 其余封面 + 画廊（画廊项带排序按钮）；封面永远第一
	const galleryThumbnails: AssetMediaShowcaseGalleryItem[] = useMemo(() => {
		const rest = [...thumbnails.map((item) => ({ ...item })), ...gallery]
		return rest
	}, [gallery, thumbnails])
	const galleryPageSize = 4
	const thumbnailPageCount = Math.max(1, Math.ceil(galleryThumbnails.length / galleryPageSize))
	const visibleThumbnails = useMemo(
		() => galleryThumbnails.slice(thumbnailPage * galleryPageSize, thumbnailPage * galleryPageSize + galleryPageSize),
		[galleryThumbnails, thumbnailPage]
	)

	useEffect(() => {
		setThumbnailPage((current) => Math.min(current, thumbnailPageCount - 1))
	}, [thumbnailPageCount])
	useEffect(() => {
		setActiveImageId(primary?.id)
	}, [primary?.id])

	// 无封面但有画廊图时，画廊首张顶上作为主图
	const effectivePrimary = primary ?? gallery[0]
	const activeItem = getAssetMediaShowcaseActiveItem(effectivePrimary, galleryThumbnails, activeImageId)
	if (!effectivePrimary) {
		return (
			<div className="grid gap-2">
				<div
					data-testid="asset-media-main-preview"
					className="grid aspect-[16/9] place-items-center overflow-hidden rounded-lg border border-border/70 bg-surface-soft"
				>
					<div className="grid place-items-center gap-2 text-muted-foreground">
						<FallbackIcon className="size-6" />
						<span className="text-xs">暂无图片</span>
					</div>
				</div>
			</div>
		)
	}
	const displayedItem = activeItem ?? effectivePrimary

	return (
		<>
			<div className="grid gap-2">
				<button
					type="button"
					data-testid="asset-media-main-preview"
					data-media-id={displayedItem.id}
					aria-label="查看大图"
					onClick={() => setLightboxOpen(true)}
					className="group relative grid aspect-[16/9] w-full cursor-zoom-in place-items-center overflow-hidden rounded-lg border border-border/70 bg-black p-0 leading-none"
				>
					<MediaShowcaseImage key={displayedItem.url} item={displayedItem} cover />
					<span className="pointer-events-none absolute bottom-2 end-2 rounded bg-black/60 px-2 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
						点击查看大图
					</span>
				</button>
				{galleryThumbnails.length > 0 && (
					<div className="relative">
						<div className="grid grid-cols-4 gap-2">
							{visibleThumbnails.map((item) => {
								const galleryIndex = gallery.findIndex((entry) => entry.id === item.id)
								const movable = Boolean(item.movable && onMoveGallery && galleryIndex >= 0)
								return (
									<div key={item.id} className="relative">
										<button
											type="button"
											aria-label={`查看图片：${item.title || item.id}`}
											aria-pressed={activeItem?.id === item.id}
											onClick={() => setActiveImageId(item.id)}
											className={`relative aspect-[16/9] w-full overflow-hidden rounded border bg-black p-0 leading-none ${activeItem?.id === item.id ? "border-primary ring-1 ring-primary/40" : "border-border/70"}`}
										>
											<span className="grid h-full w-full place-items-center">
												<MediaShowcaseImage key={item.url} item={item} />
											</span>
										</button>
										{movable && (
											<span className="absolute bottom-1 end-1 flex items-center gap-0.5">
												<button
													type="button"
													aria-label="图片前移"
													disabled={galleryIndex <= 0}
													onClick={() => onMoveGallery?.(item.id, -1)}
													className="grid size-5 place-items-center rounded bg-card/95 border border-border/70 text-muted-foreground hover:text-foreground disabled:opacity-40"
												>
													<ChevronUpIcon className="size-3" />
												</button>
												<button
													type="button"
													aria-label="图片后移"
													disabled={galleryIndex >= gallery.length - 1}
													onClick={() => onMoveGallery?.(item.id, 1)}
													className="grid size-5 place-items-center rounded bg-card/95 border border-border/70 text-muted-foreground hover:text-foreground disabled:opacity-40"
												>
													<ChevronDownIcon className="size-3" />
												</button>
											</span>
										)}
									</div>
								)
							})}
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
			<Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
				{/* 2026-10-09 图片专项：放大预览改为窗口化（不占满全屏），关闭按钮复用弹窗自带的右上角按钮，不再叠加第二个圆形关闭 */}
				<DialogContent className="w-[min(92vw,1040px)] max-w-none gap-0 overflow-hidden p-3 sm:p-4">
					<DialogTitle className="sr-only">{displayedItem.title || "资产图片"}</DialogTitle>
					<DialogDescription className="sr-only">按 Esc 或点击弹窗外关闭</DialogDescription>
					<div className="grid h-[min(68dvh,560px)] w-full place-items-center overflow-hidden rounded-md bg-black/90">
						<MediaShowcaseImage key={displayedItem.url} item={displayedItem} cover />
					</div>
				</DialogContent>
			</Dialog>
		</>
	)
}
