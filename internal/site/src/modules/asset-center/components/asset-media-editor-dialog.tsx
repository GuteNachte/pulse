import { CheckIcon, GripIcon, RotateCcwIcon, ZoomInIcon } from "lucide-react"
import { useEffect, useRef, useState, type PointerEvent, type SyntheticEvent, type WheelEvent } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import Slider from "@/components/ui/slider"
import {
	assetMediaCropPresets,
	changeAssetMediaCropZoom,
	createContainedAssetMediaPlacement,
	getAssetMediaPlacementStyle,
	moveAssetMediaPlacement,
	scaleAssetMediaPlacement,
	type AssetMediaCropPreset,
	type AssetMediaPlacement,
} from "./asset-media-crop"

type DragState = { startX: number; startY: number; placement: AssetMediaPlacement }

export function AssetMediaEditorDialog({
	open,
	onOpenChange,
	url,
	title,
	readOnly,
	saving,
	onSave,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	url?: string
	title: string
	readOnly: boolean
	saving: boolean
	onSave: (placement: AssetMediaPlacement, ratio: AssetMediaCropPreset) => void
}) {
	const [zoom, setZoom] = useState(1)
	const [imageSize, setImageSize] = useState<{ width: number; height: number }>()
	const [stageSize, setStageSize] = useState<{ width: number; height: number }>()
	const [stageNode, setStageNode] = useState<HTMLDivElement | null>(null)
	const [placement, setPlacement] = useState<AssetMediaPlacement>()
	const dragRef = useRef<DragState | null>(null)
	const preset = assetMediaCropPresets[0]

	useEffect(() => {
		if (!open) return
		setZoom(1)
		setImageSize(undefined)
		setPlacement(undefined)
	}, [open, url])
	useEffect(() => {
		if (!open || !url) return
		let cancelled = false
		const image = new Image()
		const updateSize = () => {
			if (!cancelled && image.naturalWidth > 0 && image.naturalHeight > 0) {
				setImageSize({ width: image.naturalWidth, height: image.naturalHeight })
			}
		}
		image.onload = updateSize
		image.src = url
		if (image.complete) updateSize()
		return () => {
			cancelled = true
		}
	}, [open, url])
	useEffect(() => {
		if (!open || !stageNode) return
		const update = () => setStageSize({ width: stageNode.clientWidth, height: stageNode.clientHeight })
		update()
		const observer = new ResizeObserver(update)
		observer.observe(stageNode)
		return () => observer.disconnect()
	}, [open, stageNode])
	useEffect(() => {
		if (!imageSize) return
		setZoom(1)
		setPlacement(createContainedAssetMediaPlacement(imageSize.width, imageSize.height, preset.ratio))
	}, [imageSize?.height, imageSize?.width, preset.ratio])

	function onImageLoad(event: SyntheticEvent<HTMLImageElement>) {
		if (event.currentTarget.naturalWidth > 0 && event.currentTarget.naturalHeight > 0) {
			setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })
		}
	}
	function startMove(event: PointerEvent<HTMLDivElement>) {
		if (!placement || readOnly || saving) return
		event.currentTarget.setPointerCapture(event.pointerId)
		dragRef.current = { startX: event.clientX, startY: event.clientY, placement }
	}
	function move(event: PointerEvent<HTMLDivElement>) {
		const drag = dragRef.current
		if (!drag || !stageSize?.width || !stageSize.height) return
		setPlacement(
			moveAssetMediaPlacement(
				drag.placement,
				(event.clientX - drag.startX) / stageSize.width,
				(event.clientY - drag.startY) / stageSize.height
			)
		)
	}
	function updateZoom(nextZoom: number) {
		setZoom((current) => {
			const next = Math.min(4, Math.max(0.25, nextZoom))
			setPlacement((currentPlacement) =>
				currentPlacement
					? moveAssetMediaPlacement(scaleAssetMediaPlacement(currentPlacement, next / current), 0, 0)
					: currentPlacement
			)
			return next
		})
	}
	function zoomWithWheel(event: WheelEvent<HTMLDivElement>) {
		if (readOnly || saving || !placement) return
		event.preventDefault()
		updateZoom(changeAssetMediaCropZoom(zoom, event.deltaY))
	}
	function reset() {
		setZoom(1)
		setPlacement(
			imageSize ? createContainedAssetMediaPlacement(imageSize.width, imageSize.height, preset.ratio) : undefined
		)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="grid h-[min(92dvh,52rem)] max-w-5xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
				<DialogHeader className="border-b border-border/70 px-5 py-4 sm:px-6">
					<DialogTitle>编辑图片</DialogTitle>
					<DialogDescription>{title} · 固定 16:9 白底画布，空白区域会按白色保存。</DialogDescription>
				</DialogHeader>
				<div className="grid min-h-0 gap-4 overflow-y-auto p-4 sm:grid-cols-[minmax(0,1fr)_12rem] sm:p-6">
					<div className="grid min-h-0 place-items-center rounded-lg border border-border/70 bg-surface-soft p-3">
						<div
							ref={setStageNode}
							data-testid="asset-media-crop-frame"
							className="relative w-full max-w-3xl touch-none cursor-move overflow-hidden rounded-md border-2 border-primary/70 bg-white shadow-sm"
							style={{ aspectRatio: preset.ratio }}
							onPointerDown={startMove}
							onPointerMove={move}
							onPointerUp={() => {
								dragRef.current = null
							}}
							onPointerCancel={() => {
								dragRef.current = null
							}}
							onWheel={zoomWithWheel}
						>
							{url && placement && (
								<img
									src={url}
									alt={`${title} 画布预览`}
									className="pointer-events-none absolute max-w-none select-none object-contain"
									style={getAssetMediaPlacementStyle(placement)}
									draggable={false}
									onLoad={onImageLoad}
								/>
							)}
							<div className="pointer-events-none absolute inset-0 border border-white/80 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.18)]" />
							<div className="pointer-events-none absolute left-1/2 top-1/2 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/80 bg-black/55 text-white shadow-sm">
								<GripIcon className="size-4" />
							</div>
						</div>
					</div>
					<div className="grid content-start gap-5 rounded-lg border border-border/70 bg-card p-4">
						<div className="grid gap-2">
							<div className="text-sm font-medium">输出比例</div>
							<div className="rounded-md border border-border/70 bg-surface-soft px-3 py-2 text-sm font-medium text-foreground">
								16:9
							</div>
						</div>
						<div className="grid gap-2">
							<div className="flex items-center justify-between text-sm font-medium">
								<span>缩放</span>
								<span className="text-xs text-muted-foreground">{zoom.toFixed(2)}×</span>
							</div>
							<Slider
								min={0.25}
								max={4}
								step={0.05}
								value={[zoom]}
								onValueChange={([value]) => updateZoom(value)}
								disabled={readOnly || saving || !placement}
							/>
							<div className="flex items-start gap-1 text-xs leading-5 text-muted-foreground">
								<ZoomInIcon className="mt-0.5 size-3.5 shrink-0" />
								滚轮或滑块缩放，拖动画布调整图片位置
							</div>
						</div>
						<Button type="button" size="sm" variant="outline" onClick={reset} disabled={readOnly || saving}>
							<RotateCcwIcon className="mr-1.5 size-3.5" />
							重置
						</Button>
					</div>
				</div>
				<div className="flex items-center justify-end gap-2 border-t border-border/70 px-5 py-4 sm:px-6">
					<Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
						取消
					</Button>
					<Button
						type="button"
						onClick={() => placement && onSave(placement, "16:9")}
						disabled={readOnly || saving || !placement}
					>
						<CheckIcon className="mr-1.5 size-3.5" />
						保存到图片库
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	)
}
