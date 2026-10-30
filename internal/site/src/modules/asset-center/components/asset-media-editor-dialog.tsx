import { CheckIcon, GripIcon, RotateCcwIcon, ZoomInIcon } from "lucide-react"
import { useEffect, useRef, useState, type PointerEvent, type SyntheticEvent, type WheelEvent } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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

// 2026-10-10 图片编辑专项：亮度/对比度调节（-100~100，0 = 不调节）
export type AssetMediaAdjustments = { brightness: number; contrast: number }

export function assetMediaAdjustmentsFilterCss(adjustments: AssetMediaAdjustments): string {
	const brightness = 1 + adjustments.brightness / 100
	const contrast = 1 + adjustments.contrast / 100
	return `brightness(${brightness.toFixed(3)}) contrast(${contrast.toFixed(3)})`
}

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
	onSave: (placement: AssetMediaPlacement, ratio: AssetMediaCropPreset, adjustments: AssetMediaAdjustments) => void
}) {
	const [zoom, setZoom] = useState(1)
	const [adjustments, setAdjustments] = useState<AssetMediaAdjustments>({ brightness: 0, contrast: 0 })
	const [imageSize, setImageSize] = useState<{ width: number; height: number }>()
	const [stageSize, setStageSize] = useState<{ width: number; height: number }>()
	const [stageNode, setStageNode] = useState<HTMLDivElement | null>(null)
	const [placement, setPlacement] = useState<AssetMediaPlacement>()
	const dragRef = useRef<DragState | null>(null)
	// 2026-10-10 图片编辑专项：输出比例固定 16:9（用户确认不需要切换 4:3 / 1:1）
	const preset = assetMediaCropPresets[0]

	useEffect(() => {
		if (!open) return
		setZoom(1)
		setAdjustments({ brightness: 0, contrast: 0 })
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
				// 2026-10-10 图片编辑专项：placement 随预加载直接初始化——依赖 open 必触发，
				// 修复同图第二次打开时 placement effect 依赖值与上次相同被跳过导致的黑屏死锁
				setPlacement(createContainedAssetMediaPlacement(image.naturalWidth, image.naturalHeight, preset.ratio))
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
		setAdjustments({ brightness: 0, contrast: 0 })
		setPlacement(
			imageSize ? createContainedAssetMediaPlacement(imageSize.width, imageSize.height, preset.ratio) : undefined
		)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="grid h-[min(92dvh,52rem)] max-w-7xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
				<DialogHeader className="border-b border-border/70 px-5 py-4 sm:px-6">
					<DialogTitle>编辑图片</DialogTitle>
				</DialogHeader>
				<div className="grid min-h-0 pulse-card-gap overflow-y-auto p-4 sm:grid-cols-[minmax(0,1fr)_12rem] sm:p-6">
					<div
						className="relative grid min-h-0 w-full place-items-center overflow-hidden rounded-lg border border-border/70 bg-surface-soft p-3"
						style={{ aspectRatio: "16/9" }}
					>
						<div
							ref={setStageNode}
							data-testid="asset-media-crop-frame"
							className="relative h-[78%] w-auto touch-none cursor-move rounded-md border-2 border-primary/70 bg-black shadow-sm"
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
									style={{
										...getAssetMediaPlacementStyle(placement),
										// 2026-10-10 图片编辑专项：亮度/对比度实时预览（与后端渲染近似）
										filter: assetMediaAdjustmentsFilterCss(adjustments),
									}}
									draggable={false}
									onLoad={onImageLoad}
								/>
							)}
							{/* 2026-10-10 图片编辑专项：裁剪预览——画布外区域盖半透明暗罩，
					    图片溢出画布的部分实时以暗化方式可见，用户能精准看到被裁掉的内容 */}
							<div
								aria-hidden
								className="pointer-events-none absolute inset-0 z-10"
								style={{ boxShadow: "0 0 0 999px rgba(0, 0, 0, 0.62)" }}
							/>
							<div className="pointer-events-none absolute inset-0 z-20 border border-white/80 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.18)]" />
							<div className="pointer-events-none absolute left-1/2 top-1/2 z-20 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/80 bg-black/55 text-white shadow-sm">
								<GripIcon className="size-4" />
							</div>
						</div>
					</div>
					<div className="grid content-start gap-5 rounded-lg border border-border/70 bg-card p-4">
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
						<div className="grid gap-2">
							<div className="flex items-center justify-between text-sm font-medium">
								<span>亮度</span>
								<span className="text-xs tabular-nums text-muted-foreground">
									{adjustments.brightness > 0 ? `+${adjustments.brightness}` : adjustments.brightness}
								</span>
							</div>
							<Slider
								min={-100}
								max={100}
								step={5}
								value={[adjustments.brightness]}
								onValueChange={([value]) => setAdjustments((current) => ({ ...current, brightness: value }))}
								disabled={readOnly || saving || !placement}
							/>
						</div>
						<div className="grid gap-2">
							<div className="flex items-center justify-between text-sm font-medium">
								<span>对比度</span>
								<span className="text-xs tabular-nums text-muted-foreground">
									{adjustments.contrast > 0 ? `+${adjustments.contrast}` : adjustments.contrast}
								</span>
							</div>
							<Slider
								min={-100}
								max={100}
								step={5}
								value={[adjustments.contrast]}
								onValueChange={([value]) => setAdjustments((current) => ({ ...current, contrast: value }))}
								disabled={readOnly || saving || !placement}
							/>
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
						onClick={() => placement && onSave(placement, preset.id, adjustments)}
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
