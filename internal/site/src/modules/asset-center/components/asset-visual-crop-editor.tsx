import { CheckIcon, CropIcon, RotateCcwIcon, XIcon } from "lucide-react"
import { useEffect, useRef, useState, type PointerEvent, type SyntheticEvent } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { AssetVisualCrop } from "@/types"
import { getAssetVisualCrop, getAssetVisualStageLayout } from "../asset-visual-query"
import { clampAssetVisualCrop, getAssetVisualMediaBounds, resetAssetVisualCrop } from "./asset-visual-crop"
import { useAssetVisualPreviewURL } from "./asset-visual-preview"

const defaultAssetVisualCrop: AssetVisualCrop = { x: 0, y: 0, width: 1, height: 1 }

type DragState = {
	mode: "move" | "resize"
	startX: number
	startY: number
	crop: AssetVisualCrop
}

export function AssetVisualCropEditor({
	url,
	crop: savedCrop,
	readOnly,
	saving,
	isProviderLogo = false,
	onSave,
}: {
	url?: string
	crop?: unknown
	readOnly: boolean
	saving: boolean
	isProviderLogo?: boolean
	onSave: (crop: AssetVisualCrop | undefined) => void
}) {
	const initialCrop = getAssetVisualCrop({ crop: savedCrop })
	const previewURL = useAssetVisualPreviewURL(url)
	const [editing, setEditing] = useState(false)
	const [crop, setCrop] = useState<AssetVisualCrop>(initialCrop ?? defaultAssetVisualCrop)
	const [imageSize, setImageSize] = useState<{ width: number; height: number }>()
	const [stageSize, setStageSize] = useState<{ width: number; height: number }>()
	const stageRef = useRef<HTMLDivElement>(null)
	const dragRef = useRef<DragState | null>(null)

	useEffect(() => {
		setEditing(false)
		setCrop(initialCrop ?? defaultAssetVisualCrop)
	}, [url, initialCrop?.height, initialCrop?.width, initialCrop?.x, initialCrop?.y])

	useEffect(() => {
		const stage = stageRef.current
		if (!stage) return
		const updateStageSize = () => {
			setStageSize({ width: stage.clientWidth, height: stage.clientHeight })
		}
		updateStageSize()
		const observer = new ResizeObserver(updateStageSize)
		observer.observe(stage)
		return () => observer.disconnect()
	}, [url])

	if (!url) return null
	const mediaBounds = getAssetVisualMediaBounds(
		stageSize?.width ?? 0,
		stageSize?.height ?? 0,
		imageSize?.width ?? 0,
		imageSize?.height ?? 0
	)
	const imageRatio = imageSize && imageSize.height > 0 ? imageSize.width / imageSize.height : 0
	const visualStageLayout = getAssetVisualStageLayout(Boolean(url), imageRatio > 1.12, isProviderLogo)
	const hasCrop = crop.x !== 0 || crop.y !== 0 || crop.width !== 1 || crop.height !== 1
	const isFullImageCrop = crop.x <= 0.02 && crop.y <= 0.02 && crop.width >= 0.98 && crop.height >= 0.98
	const previewStyle =
		!editing && hasCrop
			? {
					width: `${100 / crop.width}%`,
					height: `${100 / crop.height}%`,
					maxWidth: "none",
					left: `${(-crop.x / crop.width) * 100}%`,
					top: `${(-crop.y / crop.height) * 100}%`,
				}
			: undefined
	const cropBoxStyle = mediaBounds
		? (() => {
				const inset = isFullImageCrop ? 20 : 0
				return {
					left: mediaBounds.left + crop.x * mediaBounds.width + inset,
					top: mediaBounds.top + crop.y * mediaBounds.height + inset,
					width: crop.width * mediaBounds.width - inset * 2,
					height: crop.height * mediaBounds.height - inset * 2,
				}
			})()
		: undefined

	function handleImageLoad(event: SyntheticEvent<HTMLImageElement>) {
		setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })
	}

	function startDrag(event: PointerEvent<Element>, mode: DragState["mode"]) {
		if (!editing || readOnly || saving) return
		event.preventDefault()
		event.currentTarget.setPointerCapture(event.pointerId)
		dragRef.current = { mode, startX: event.clientX, startY: event.clientY, crop }
	}

	function moveDrag(event: PointerEvent<HTMLDivElement>) {
		const drag = dragRef.current
		const stageBounds = stageRef.current?.getBoundingClientRect()
		const bounds =
			mediaBounds && stageBounds
				? {
						left: stageBounds.left + mediaBounds.left,
						top: stageBounds.top + mediaBounds.top,
						width: mediaBounds.width,
						height: mediaBounds.height,
					}
				: undefined
		if (!drag || !bounds) return
		const dx = (event.clientX - drag.startX) / bounds.width
		const dy = (event.clientY - drag.startY) / bounds.height
		setCrop(
			clampAssetVisualCrop(
				drag.mode === "move"
					? { ...drag.crop, x: drag.crop.x + dx, y: drag.crop.y + dy }
					: { ...drag.crop, width: drag.crop.width + dx, height: drag.crop.height + dy }
			)
		)
	}

	function endDrag() {
		dragRef.current = null
	}

	return (
		<div className="grid gap-2">
			<div
				ref={stageRef}
				className={cn(
					"relative isolate mx-auto grid w-full place-items-center overflow-hidden rounded-md border border-border/70",
					editing ? "bg-card" : "bg-[#e5e7e5]",
					visualStageLayout.stageClassName
				)}
				style={{ maxWidth: visualStageLayout.maxWidth, aspectRatio: imageRatio || undefined }}
				onPointerMove={moveDrag}
				onPointerUp={endDrag}
				onPointerCancel={endDrag}
			>
				<img
					src={editing ? url : previewURL}
					alt="主图裁剪预览"
					className={cn("relative z-10 h-full w-full", editing ? "object-contain" : visualStageLayout.imageClassName)}
					style={previewStyle}
					onLoad={handleImageLoad}
					draggable={false}
				/>
				{editing && cropBoxStyle && (
					<div
						className="absolute z-20 box-border cursor-move border-4 border-white outline outline-1 outline-black/70 shadow-[0_0_0_999px_rgba(0,0,0,0.42)]"
						style={cropBoxStyle}
						onPointerDown={(event) => startDrag(event, "move")}
					>
						<button
							type="button"
							aria-label="调整裁剪范围"
							className="absolute -bottom-2 -right-2 size-4 cursor-se-resize rounded-sm border-2 border-background bg-primary shadow-sm"
							onPointerDown={(event) => {
								event.stopPropagation()
								startDrag(event, "resize")
							}}
						/>
					</div>
				)}
			</div>
			<div className="flex flex-wrap items-center justify-end gap-2">
				{editing ? (
					<>
						<Button
							type="button"
							size="icon"
							variant="outline"
							title="重置裁剪"
							onClick={() => {
								setCrop(defaultAssetVisualCrop)
								onSave(resetAssetVisualCrop())
							}}
							disabled={readOnly || saving}
						>
							<RotateCcwIcon className="size-3.5" />
						</Button>
						<Button
							type="button"
							size="icon"
							variant="outline"
							title="取消裁剪"
							onClick={() => {
								setCrop(initialCrop ?? defaultAssetVisualCrop)
								setEditing(false)
							}}
							disabled={saving}
						>
							<XIcon className="size-3.5" />
						</Button>
						<Button
							type="button"
							size="sm"
							className="gap-2"
							onClick={() => onSave(crop)}
							disabled={readOnly || saving}
						>
							<CheckIcon className="size-3.5" />
							保存裁剪
						</Button>
					</>
				) : (
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="gap-2"
						onClick={() => setEditing(true)}
						disabled={readOnly || saving}
					>
						<CropIcon className="size-3.5" />
						编辑图片
					</Button>
				)}
			</div>
		</div>
	)
}
