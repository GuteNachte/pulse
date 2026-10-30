import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react"
import { CheckIcon, CropIcon, GripVerticalIcon, StarIcon, Trash2Icon, UploadIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/use-toast"
import { OperationConfirmDialog } from "@/components/operation-confirm-dialog"
import { pb } from "@/lib/api"
import { getOperationErrorMessage } from "@/lib/operation-feedback"
import { cn } from "@/lib/utils"
import { getAssetMediaRequestKey, notifyAssetMediaChanged, subscribeAssetMediaChanged } from "../asset-media-events"
import { getAssetMediaOperationFeedback, type AssetMediaOperation } from "../asset-media-operation-feedback"
import { AssetMediaEditorDialog, type AssetMediaAdjustments } from "./asset-media-editor-dialog"
import type { AssetMediaCropPreset, AssetMediaPlacement } from "./asset-media-crop"
import { getAssetMediaOriginalVersionId } from "./asset-media-original-version"
import {
	getAssetMediaCoverActionLabel,
	getNextAssetMediaCoverVisibility,
	isAssetMediaCoverVersion,
	isAssetMediaGalleryVersion,
} from "./asset-media-placement"
import { getAssetMediaInitialSelection } from "./asset-media-selection"
import {
	ASSET_MEDIA_ALBUMS,
	buildAssetMediaAlbumChips,
	matchAssetMediaAlbumChip,
	normalizeAssetMediaAlbum,
	type AlbumFilterKey,
} from "../asset-media-album"

type MediaResponse = {
	media: Array<{
		id: string
		state: string
		source_title?: string
		source_kind?: string
		active_version?: string
		album?: string
	}>
	versions: Array<{ id: string; media: string; parent_version?: string }>
	placements: Array<{
		id: string
		media: string
		version: string
		role: string
		visible?: boolean
		sort_order?: number
	}>
}
type MediaSaveResponse = { media: { id: string }; version: { id: string } }

type AssetMediaObjectState =
	| { status: "idle" | "loading" | "error"; url?: undefined }
	| { status: "ready"; url: string }

function useAssetMediaObjectURL(versionId: string | undefined) {
	const [state, setState] = useState<AssetMediaObjectState>({ status: versionId ? "loading" : "idle" })
	useEffect(() => {
		if (!versionId) {
			setState({ status: "idle" })
			return
		}
		let active = true
		let objectURL = ""
		setState({ status: "loading" })
		fetch(`/api/pulse/asset-media/object?version=${versionId}`, { headers: { Authorization: pb.authStore.token } })
			.then(async (response) => {
				if (!response.ok) throw new Error("媒体读取失败")
				objectURL = URL.createObjectURL(await response.blob())
				if (active) setState({ status: "ready", url: objectURL })
			})
			.catch(() => active && setState({ status: "error" }))
		return () => {
			active = false
			if (objectURL) URL.revokeObjectURL(objectURL)
		}
	}, [versionId])
	return state
}

function AssetMediaImage({ versionId, alt }: { versionId: string; alt: string }) {
	const mediaObject = useAssetMediaObjectURL(versionId)
	return mediaObject.status === "ready" ? (
		<img className="absolute inset-0 h-full w-full object-contain" src={mediaObject.url} alt={alt} />
	) : mediaObject.status === "error" ? (
		<div className="absolute inset-0 grid h-full place-items-center text-[10px] text-muted-foreground">
			图片读取失败
		</div>
	) : (
		<div className="absolute inset-0 grid h-full place-items-center text-[10px] text-muted-foreground">图片加载中</div>
	)
}

// 2026-10-09 图片专项（行式列表版）：一行一张图——缩略图 + 标题 + 删除；
// 图库项在右侧提供拖动手柄（拖动排序），封面显示「封面」标记（封面位置固定在最前）。
function AssetMediaRow({
	media,
	versionId,
	selected,
	cover,
	gallery,
	dragging,
	readOnly,
	busy,
	onSelect,
	onRemove,
	onDragStart,
	onDragEnd,
	onDragOverRow,
}: {
	media: MediaResponse["media"][number]
	versionId?: string
	selected: boolean
	cover: boolean
	gallery: boolean
	dragging: boolean
	readOnly: boolean
	busy: boolean
	onSelect: () => void
	onRemove: () => void
	onDragStart: (event: DragEvent<HTMLButtonElement>) => void
	onDragEnd: () => void
	onDragOverRow: () => void
}) {
	const title = media.source_title || "本地图片"
	// 2026-10-09 图片专项：显示图片归属的部件（相册）——组装机配图一眼可见是哪个配件
	const albumKey = normalizeAssetMediaAlbum(media.album)
	const componentAlbumLabel =
		albumKey && albumKey !== "whole" ? ASSET_MEDIA_ALBUMS.find((item) => item.value === albumKey)?.label : undefined
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: 图片拖拽排序的目标行，点击语义由内部按钮承担
		<div
			data-testid="asset-media-row"
			className={cn(
				"flex items-center gap-2 rounded border p-1.5 text-xs transition-colors",
				selected ? "border-primary bg-primary/5" : "border-border/70",
				dragging && "opacity-60"
			)}
			onDragOver={(event) => {
				if (!gallery) return
				event.preventDefault()
				onDragOverRow()
			}}
			onDrop={(event) => event.preventDefault()}
		>
			<button
				type="button"
				className="flex min-w-0 flex-1 items-center gap-2 text-left"
				onClick={onSelect}
				title={title}
			>
				<span className="relative block aspect-[16/9] w-28 shrink-0 overflow-hidden rounded border border-border/60 bg-black">
					{versionId && <AssetMediaImage versionId={versionId} alt={title} />}
					{/* 2026-10-09 图片专项：封面标识固定在缩略图左上角 */}
					{cover ? (
						<span className="absolute start-0 top-0 z-10 rounded border border-primary/40 bg-primary/10 px-1 py-px text-[10px] text-foreground">
							封面
						</span>
					) : null}
				</span>
				<span className="min-w-0 flex-1">
					{/* 2026-10-09 图片专项：图片库里的图是用户自己起的短编号名，正常显示即可 */}
					<span data-testid="asset-media-thumbnail-title" className="block truncate">
						{title}
					</span>
					{componentAlbumLabel ? (
						<span className="mt-0.5 inline-block rounded border border-border/70 bg-surface-soft px-1 py-px text-[10px] text-muted-foreground">
							{componentAlbumLabel}
						</span>
					) : null}
				</span>
			</button>
			<Button
				data-testid="asset-media-thumbnail-delete"
				size="icon"
				variant="ghost"
				className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
				disabled={readOnly || busy}
				aria-label={`删除图片 ${title}`}
				onClick={onRemove}
			>
				<Trash2Icon className="size-3.5" />
			</Button>
			<button
				type="button"
				data-testid="asset-media-thumbnail-drag-handle"
				draggable={!readOnly && !busy && !cover}
				onDragStart={onDragStart}
				onDragEnd={onDragEnd}
				aria-label={cover ? `封面固定在第一位 ${title}` : `拖动排序 ${title}`}
				title={cover ? "封面固定在第一位" : "按住拖动调整顺序"}
				disabled={cover}
				className={cn(
					"grid size-7 shrink-0 place-items-center rounded border transition-colors",
					cover
						? "cursor-not-allowed border-border/50 bg-card text-muted-foreground/40"
						: "cursor-grab border-border/70 bg-card text-muted-foreground hover:text-foreground active:cursor-grabbing"
				)}
			>
				<GripVerticalIcon className="size-3.5" />
			</button>
		</div>
	)
}

export function AssetMediaWorkspace({
	assetId,
	readOnly,
	fallbackPreview,
	preferredMediaId,
	showAlbumControls = false,
}: {
	assetId: string
	readOnly: boolean
	fallbackPreview?: { url: string; alt: string }
	preferredMediaId?: string
	/** 2026-10-09 图片专项：只有组装机需要部件相册（品牌机与其他资产全部图默认整机） */
	showAlbumControls?: boolean
}) {
	const [data, setData] = useState<MediaResponse>({ media: [], versions: [], placements: [] })
	const [albumFilter, setAlbumFilter] = useState<AlbumFilterKey>("all")
	const [uploadAlbum, setUploadAlbum] = useState<Exclude<AlbumFilterKey, "all">>("whole")
	const [busy, setBusy] = useState(false)
	const [selectedId, setSelectedId] = useState<string | null>(null)
	const [editorOpen, setEditorOpen] = useState(false)
	const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null)
	// 2026-10-10 图片编辑专项：一键还原原图的二次确认
	const [pendingRestore, setPendingRestore] = useState<{ id: string; title: string } | null>(null)
	// 拖动排序：拖动期间的本地顺序覆盖（松手后按新顺序重写图库排序值）
	const [dragMediaId, setDragMediaId] = useState<string>()
	const [orderOverride, setOrderOverride] = useState<string[]>()
	const input = useRef<HTMLInputElement>(null)
	const appliedPreferredMediaId = useRef<string | undefined>(undefined)
	const load = async () =>
		setData(
			await pb.send(`/api/pulse/assets/${assetId}/media`, {
				method: "GET",
				requestKey: getAssetMediaRequestKey("workspace", assetId),
			})
		)
	useEffect(() => {
		load().catch(() => undefined)
		return subscribeAssetMediaChanged(assetId, load)
	}, [assetId])
	useEffect(() => {
		if (!preferredMediaId) {
			appliedPreferredMediaId.current = undefined
		} else if (
			appliedPreferredMediaId.current !== preferredMediaId &&
			data.media.some((item) => item.id === preferredMediaId)
		) {
			appliedPreferredMediaId.current = preferredMediaId
			setSelectedId(preferredMediaId)
			return
		}
		setSelectedId((current) =>
			current && data.media.some((item) => item.id === current)
				? current
				: getAssetMediaInitialSelection(data.media, data.placements)
		)
	}, [data.media, data.placements, preferredMediaId])
	const runMediaOperation = async (operation: AssetMediaOperation, task: () => Promise<void>) => {
		const feedback = getAssetMediaOperationFeedback(operation)
		const pendingToast = toast({ title: feedback.pendingTitle })
		setBusy(true)
		try {
			await task()
			pendingToast.update({
				id: pendingToast.id,
				open: true,
				title: feedback.successTitle,
				description: feedback.successDescription,
			})
			return true
		} catch (error) {
			console.error(`asset media operation failed: ${operation}`, error)
			pendingToast.update({
				id: pendingToast.id,
				open: true,
				title: feedback.failureTitle,
				description: getOperationErrorMessage(error, feedback.failureDescription),
				variant: "destructive",
			})
			return false
		} finally {
			setBusy(false)
		}
	}
	const upload = (file?: File) => {
		if (!file) return Promise.resolve(false)
		return runMediaOperation("upload", async () => {
			const body = new FormData()
			body.append("file", file)
			body.append("album", uploadAlbum)
			await pb.send(`/api/pulse/assets/${assetId}/media/upload`, { method: "POST", body })
			await notifyAssetMediaChanged(assetId)
		})
	}
	const place = (mediaId: string, versionId: string, role: "cover" | "gallery", visible = true) => {
		const operation = role === "gallery" ? "add-gallery" : visible ? "set-cover" : "unset-cover"
		return runMediaOperation(operation, async () => {
			await pb.send(`/api/pulse/assets/${assetId}/media/${mediaId}/placements`, {
				method: "POST",
				body: { version: versionId, role, visible },
			})
			await notifyAssetMediaChanged(assetId)
		})
	}
	const saveVersion = async (
		mediaId: string,
		versionId: string,
		placement: AssetMediaPlacement,
		ratio: AssetMediaCropPreset,
		adjustments: AssetMediaAdjustments
	) => {
		const saved = await runMediaOperation("save-edit", async () => {
			const created = await pb.send<MediaSaveResponse>(`/api/pulse/assets/${assetId}/media/${mediaId}/versions`, {
				method: "POST",
				body: {
					parent_version: versionId,
					placement,
					ratio,
					brightness: adjustments.brightness,
					contrast: adjustments.contrast,
				},
			})
			await notifyAssetMediaChanged(assetId)
			setSelectedId(created.media.id)
		})
		if (saved) setEditorOpen(false)
		return saved
	}
	// 2026-10-10 图片编辑专项：一键还原原图——展示位转回源图、编辑图移出图片库
	const restoreOriginal = async (mediaId: string) =>
		runMediaOperation("restore-original", async () => {
			const result = await pb.send<{ media: { id: string } }>(
				`/api/pulse/assets/${assetId}/media/${mediaId}/restore-original`,
				{ method: "POST" }
			)
			await notifyAssetMediaChanged(assetId)
			setSelectedId(result.media?.id ?? null)
			toast({ title: "已还原原图", description: "展示位已切回原图，编辑图已移出图片库。" })
		})
	const remove = async (mediaId: string) =>
		runMediaOperation("delete", async () => {
			await pb.send(`/api/pulse/assets/${assetId}/media/${mediaId}`, { method: "DELETE" })
			if (selectedId === mediaId) setSelectedId(null)
			await notifyAssetMediaChanged(assetId)
		})
	const setAlbum = async (mediaId: string, album: AssetAlbumValue) =>
		runMediaOperation("upload", async () => {
			await pb.send(`/api/pulse/assets/${assetId}/media/${mediaId}/album`, {
				method: "POST",
				body: { album },
			})
			await notifyAssetMediaChanged(assetId)
		})
	// 图库顺序只对整机相册的图库项有意义（与展示区口径一致）
	const visibleGalleryPlacements = data.placements
		.filter((item) => item.role === "gallery" && item.visible !== false)
		.sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
	const galleryOrder = visibleGalleryPlacements.map((item) => item.media)
	const isWholeAlbumMediaById = (mediaId: string) => {
		const item = data.media.find((entry) => entry.id === mediaId)
		const album = normalizeAssetMediaAlbum(item?.album)
		return album === "" || album === "whole"
	}
	// 列表顺序：封面 → 图库（按排序值）→ 其余；拖动期间用本地顺序覆盖
	const visibleMedia = useMemo(() => {
		const filtered = data.media.filter((media) => matchAssetMediaAlbumChip(media.album, albumFilter))
		const byId = new Map(filtered.map((item) => [item.id, item]))
		if (orderOverride) {
			return orderOverride
				.map((id) => byId.get(id))
				.filter((item): item is MediaResponse["media"][number] => Boolean(item))
		}
		const galleryRank = new Map(galleryOrder.map((id, index) => [id, index]))
		const covers = filtered.filter((item) => isAssetMediaCoverVersion(data.placements, item.active_version))
		const galleries = filtered
			.filter(
				(item) =>
					!isAssetMediaCoverVersion(data.placements, item.active_version) &&
					isAssetMediaGalleryVersion(data.placements, item.active_version) &&
					isWholeAlbumMediaById(item.id)
			)
			.sort((left, right) => (galleryRank.get(left.id) ?? 999) - (galleryRank.get(right.id) ?? 999))
		const rest = filtered.filter(
			(item) =>
				!isAssetMediaCoverVersion(data.placements, item.active_version) &&
				!(isAssetMediaGalleryVersion(data.placements, item.active_version) && isWholeAlbumMediaById(item.id))
		)
		return [...covers, ...galleries, ...rest]
	}, [data, albumFilter, orderOverride])

	function moveDraggedOver(targetId: string) {
		if (!dragMediaId || dragMediaId === targetId) return
		setOrderOverride((current) => {
			const ids = (current ?? visibleMedia.map((item) => item.id)).slice()
			const from = ids.indexOf(dragMediaId)
			const to = ids.indexOf(targetId)
			if (from < 0 || to < 0 || from === to) return current
			ids.splice(from, 1)
			ids.splice(to, 0, dragMediaId)
			return ids
		})
	}

	async function commitGalleryOrder() {
		const ordered = orderOverride
		setDragMediaId(undefined)
		if (!ordered) return
		setBusy(true)
		try {
			// 与拖动后的列表顺序对齐：可见图库位整体重写排序值（自动摆放序号可能相同）
			const galleryByMedia = new Map(visibleGalleryPlacements.map((item) => [item.media, item]))
			const orderedGalleryIds = ordered.filter((id) => galleryByMedia.has(id))
			for (let order = 0; order < orderedGalleryIds.length; order += 1) {
				const placement = galleryByMedia.get(orderedGalleryIds[order])
				if (!placement) continue
				await pb.send(`/api/pulse/assets/${assetId}/media/${placement.media}/placements`, {
					method: "POST",
					body: { role: "gallery", version: placement.version, visible: true, sort_order: order },
				})
			}
			await notifyAssetMediaChanged(assetId)
		} catch (error) {
			console.error("reorder gallery media", error)
			toast({ title: "图片排序失败", description: "请稍后再试。", variant: "destructive" })
		} finally {
			setBusy(false)
			setOrderOverride(undefined)
		}
	}

	const selected = data.media.find((item) => item.id === selectedId)
	const getOriginalVersion = (mediaId: string) => getAssetMediaOriginalVersionId(data.versions, mediaId)
	const getDisplayVersion = (mediaId: string, activeVersion?: string) => getOriginalVersion(mediaId) ?? activeVersion
	const selectedOriginalVersion = selected ? getAssetMediaOriginalVersionId(data.versions, selected.id) : undefined
	const selectedIsCover = isAssetMediaCoverVersion(data.placements, selected?.active_version)
	const selectedIsGallery = isAssetMediaGalleryVersion(data.placements, selected?.active_version)
	const selectedMediaObject = useAssetMediaObjectURL(selectedOriginalVersion)
	const preview =
		selectedOriginalVersion && selectedMediaObject.status === "ready" ? (
			<img
				className="absolute inset-0 h-full w-full object-contain"
				src={selectedMediaObject.url}
				alt={selected?.source_title || "资产图片"}
			/>
		) : selectedOriginalVersion && selectedMediaObject.status === "error" ? (
			<div className="absolute inset-0 grid h-full place-items-center text-[10px] text-muted-foreground">
				图片读取失败
			</div>
		) : selectedOriginalVersion ? (
			<div className="absolute inset-0 grid h-full place-items-center text-[10px] text-muted-foreground">
				图片加载中
			</div>
		) : fallbackPreview ? (
			<img
				className="absolute inset-0 h-full w-full object-contain"
				src={fallbackPreview.url}
				alt={fallbackPreview.alt}
			/>
		) : null
	return (
		<div className="flex h-full min-h-0 flex-col gap-3">
			<div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
				<div className="flex min-h-0 min-w-0 flex-col gap-2 rounded-md border border-border/70 bg-card p-2.5">
					<div className="flex items-center justify-between gap-2">
						<div className="flex items-center gap-2">
							<div className="text-xs font-medium">图片库</div>
							{/* 2026-10-09 图片专项：相册归组只对组装机开放（品牌机整机即全部） */}
							{showAlbumControls ? (
								<select
									value={uploadAlbum}
									onChange={(event) => {
										const v = normalizeAssetMediaAlbum(event.target.value)
										setUploadAlbum(v === "" ? "whole" : v)
									}}
									disabled={readOnly || busy}
									title="新上传图片归入的相册"
									className="h-6 rounded border border-border/70 bg-card px-1 text-[11px]"
								>
									{ASSET_MEDIA_ALBUMS.map((item) => (
										<option key={item.value} value={item.value}>
											{item.label}
										</option>
									))}
								</select>
							) : null}
						</div>
						<Button size="sm" variant="outline" disabled={readOnly || busy} onClick={() => input.current?.click()}>
							<UploadIcon className="mr-1 size-3.5" />
							上传图片
						</Button>
					</div>
					<input
						ref={input}
						type="file"
						accept="image/jpeg,image/png,image/webp"
						className="hidden"
						onChange={(event) => {
							const file = event.target.files?.[0]
							event.currentTarget.value = ""
							upload(file).catch(() => undefined)
						}}
					/>
					{data.media.length ? (
						<>
							{(() => {
								const chips = buildAssetMediaAlbumChips(data.media.map((item) => item.album))
								if (showAlbumControls && chips.length > 1) {
									return (
										<div className="flex flex-wrap items-center gap-1">
											{chips.map((chip) => (
												<button
													key={chip.key}
													type="button"
													onClick={() => setAlbumFilter(chip.key)}
													className={
														chip.key === albumFilter
															? "rounded-full border border-primary/50 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-foreground"
															: "rounded-full border border-border/70 bg-card px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
													}
												>
													{chip.label}
												</button>
											))}
										</div>
									)
								}
								return null
							})()}
							<div className="grid min-h-0 flex-1 content-start gap-1.5 overflow-y-auto">
								{visibleMedia.map((media) => {
									const gallery =
										isAssetMediaGalleryVersion(data.placements, media.active_version) && isWholeAlbumMediaById(media.id)
									return (
										<AssetMediaRow
											key={media.id}
											media={media}
											versionId={getDisplayVersion(media.id, media.active_version)}
											selected={selectedId === media.id}
											cover={isAssetMediaCoverVersion(data.placements, media.active_version)}
											gallery={gallery}
											dragging={dragMediaId === media.id}
											readOnly={readOnly}
											busy={busy}
											onSelect={() => setSelectedId(media.id)}
											onRemove={() => setPendingDelete({ id: media.id, title: media.source_title || "本地图片" })}
											onDragStart={(event) => {
												event.dataTransfer.effectAllowed = "move"
												event.dataTransfer.setData("text/plain", media.id)
												setDragMediaId(media.id)
											}}
											onDragEnd={() => commitGalleryOrder().catch(() => undefined)}
											onDragOverRow={() => moveDraggedOver(media.id)}
										/>
									)
								})}
							</div>
						</>
					) : (
						<div className="rounded border border-dashed border-border/70 px-3 py-5 text-center text-xs text-muted-foreground">
							上传图片，或到「收集图片」搜索候选图入库。
						</div>
					)}
				</div>
				{data.media.length ? (
					<div className="min-h-0">
						<AssetMediaPreview
							preview={preview}
							selected={selected}
							isCover={selectedIsCover}
							isGallery={selectedIsGallery}
							readOnly={readOnly}
							busy={busy}
							selectedURL={selectedMediaObject.url}
							album={selected?.album}
							showAlbum={showAlbumControls}
							onAlbumChange={(album) => selected && setAlbum(selected.id, album).catch(() => undefined)}
							onRemove={() =>
								selected && setPendingDelete({ id: selected.id, title: selected.source_title || "本地图片" })
							}
							onEdit={() => setEditorOpen(true)}
							onRestoreOriginal={
								selected && selected.source_kind === "edit"
									? () =>
											selected &&
											setPendingRestore({
												id: selected.id,
												title: selected.source_title || "编辑图片",
											})
									: undefined
							}
							onPlace={(role, visible) =>
								selected?.active_version &&
								place(selected.id, selected.active_version, role, visible).catch(() => undefined)
							}
						/>
					</div>
				) : null}
			</div>
			<AssetMediaEditorDialog
				open={editorOpen}
				onOpenChange={setEditorOpen}
				url={selectedMediaObject.url}
				title={selected?.source_title || "资产图片"}
				readOnly={readOnly}
				saving={busy}
				onSave={(placement, ratio, adjustments) =>
					selectedOriginalVersion &&
					selected &&
					saveVersion(selected.id, selectedOriginalVersion, placement, ratio, adjustments).catch(() => undefined)
				}
			/>
			<OperationConfirmDialog
				open={Boolean(pendingRestore)}
				onOpenChange={(open) => {
					if (!open && !busy) setPendingRestore(null)
				}}
				title="还原原图？"
				description={
					pendingRestore
						? `“${pendingRestore.title}”会移出图片库，展示位（封面/图库）切回原图；原图文件从未被修改。`
						: undefined
				}
				confirmLabel="还原原图"
				running={busy}
				progressTitle="正在还原原图"
				progressDescription="正在把展示位切回原图并移出编辑图。"
				onConfirm={async () => {
					if (!pendingRestore) return
					await restoreOriginal(pendingRestore.id)
					setPendingRestore(null)
				}}
			/>
			<OperationConfirmDialog
				open={Boolean(pendingDelete)}
				onOpenChange={(open) => {
					if (!open && !busy) setPendingDelete(null)
				}}
				title="确认删除图片？"
				description={
					pendingDelete ? `将删除“${pendingDelete.title}”及其编辑版本和展示关系，此操作无法撤销。` : undefined
				}
				confirmLabel="确认删除"
				confirmVariant="destructive"
				running={busy}
				progressTitle="正在删除图片"
				progressDescription="正在移除图片、编辑版本和展示关系。"
				onConfirm={async () => {
					if (!pendingDelete) return
					if (await remove(pendingDelete.id)) setPendingDelete(null)
				}}
			/>
		</div>
	)
}

function AssetMediaPreview({
	preview,
	selected,
	isCover,
	isGallery,
	readOnly,
	busy,
	selectedURL,
	album,
	showAlbum,
	onAlbumChange,
	onRemove,
	onEdit,
	onRestoreOriginal,
	onPlace,
}: {
	preview: ReactNode
	selected?: MediaResponse["media"][number]
	isCover: boolean
	isGallery: boolean
	readOnly: boolean
	busy: boolean
	selectedURL?: string
	album?: string
	showAlbum?: boolean
	onAlbumChange?: (
		album: "whole" | "cpu" | "motherboard" | "memory" | "storage" | "gpu" | "psu" | "case" | "cooler" | "nic" | "other"
	) => void
	onRemove: () => void
	onEdit: () => void
	// 2026-10-10 图片编辑专项：编辑生成的图（source_kind=edit）才显示「还原原图」
	onRestoreOriginal?: () => void
	onPlace: (role: "cover" | "gallery", visible?: boolean) => void
}) {
	if (!preview) return null
	return (
		<div className="grid gap-2 rounded-md border border-border/70 bg-card p-2.5">
			<div className="flex items-center justify-between gap-2 text-xs">
				<span className="truncate font-medium">{selected?.source_title || "当前预览"}</span>
				{showAlbum && selected && onAlbumChange ? (
					<label className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
						相册
						<select
							value={normalizeAssetMediaAlbum(album)}
							onChange={(event) =>
								onAlbumChange(event.target.value as Parameters<NonNullable<typeof onAlbumChange>>[0])
							}
							disabled={readOnly || busy}
							className="h-6 rounded border border-border/70 bg-card px-1 text-[11px]"
						>
							<option value="">未分组</option>
							{ASSET_MEDIA_ALBUMS.map((item) => (
								<option key={item.value} value={item.value}>
									{item.label}
								</option>
							))}
						</select>
					</label>
				) : null}
			</div>
			<div className="relative grid aspect-[16/9] place-items-center overflow-hidden rounded border border-border/60 bg-black">
				{preview}
			</div>
			{selected && (
				<div className="flex flex-wrap items-center gap-1">
					<Button
						data-testid="asset-media-edit"
						size="sm"
						variant="outline"
						disabled={readOnly || busy || !selectedURL}
						onClick={onEdit}
					>
						<CropIcon className="mr-1 size-3.5" />
						编辑
					</Button>
					{onRestoreOriginal && (
						<Button
							data-testid="asset-media-restore-original"
							size="sm"
							variant="outline"
							disabled={readOnly || busy}
							onClick={onRestoreOriginal}
						>
							还原原图
						</Button>
					)}
					{/* 2026-10-09 图片专项：封面图不再提供"加入图库"——封面已在展示区，加入会让同一张图重复出现 */}
					{!isGallery && !isCover && (
						<Button size="sm" variant="outline" disabled={readOnly || busy} onClick={() => onPlace("gallery")}>
							加入图库
						</Button>
					)}
					<Button
						size="sm"
						variant={isCover ? "default" : "outline"}
						disabled={readOnly || busy}
						onClick={() => onPlace("cover", getNextAssetMediaCoverVisibility(isCover))}
					>
						{isCover ? <CheckIcon className="mr-1 size-3.5" /> : <StarIcon className="mr-1 size-3.5" />}
						{getAssetMediaCoverActionLabel(isCover)}
					</Button>
					<Button size="sm" variant="ghost" className="ms-auto" disabled={readOnly || busy} onClick={onRemove}>
						<Trash2Icon className="mr-1 size-3.5" />
						删除
					</Button>
				</div>
			)}
		</div>
	)
}

type AssetAlbumValue = string
