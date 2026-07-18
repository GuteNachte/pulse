import { useEffect, useRef, useState, type ReactNode } from "react"
import { CheckIcon, CropIcon, StarIcon, Trash2Icon, UploadIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/use-toast"
import { OperationConfirmDialog } from "@/components/operation-confirm-dialog"
import { pb } from "@/lib/api"
import { getOperationErrorMessage } from "@/lib/operation-feedback"
import { getAssetMediaRequestKey, notifyAssetMediaChanged, subscribeAssetMediaChanged } from "../asset-media-events"
import { getAssetMediaOperationFeedback, type AssetMediaOperation } from "../asset-media-operation-feedback"
import { AssetMediaEditorDialog } from "./asset-media-editor-dialog"
import type { AssetMediaCropPreset, AssetMediaPlacement } from "./asset-media-crop"
import { getAssetMediaOriginalVersionId } from "./asset-media-original-version"
import {
	getAssetMediaCoverActionLabel,
	getAssetMediaCoverButtonLabel,
	getAssetMediaCoverIconClassName,
	getNextAssetMediaCoverVisibility,
	isAssetMediaCoverVersion,
	isAssetMediaGalleryVersion,
} from "./asset-media-placement"
import { getAssetMediaInitialSelection } from "./asset-media-selection"

type MediaResponse = {
	media: Array<{ id: string; state: string; source_title?: string; active_version?: string }>
	versions: Array<{ id: string; media: string; parent_version?: string }>
	placements: Array<{ role: string; version: string; visible?: boolean }>
}
type MediaSaveResponse = { media: { id: string }; version: { id: string } }
const assetMediaThumbnailActionClassName = "h-6 min-h-6 w-full px-1 text-[10px]"

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
		<img className="h-full w-full object-contain" src={mediaObject.url} alt={alt} />
	) : mediaObject.status === "error" ? (
		<div className="grid h-full place-items-center text-[10px] text-muted-foreground">图片读取失败</div>
	) : (
		<div className="grid h-full place-items-center text-[10px] text-muted-foreground">图片加载中</div>
	)
}

function AssetMediaThumbnail({
	media,
	versionId,
	selected,
	cover,
	readOnly,
	busy,
	onSelect,
	onToggleCover,
	onRemove,
}: {
	media: MediaResponse["media"][number]
	versionId?: string
	selected: boolean
	cover: boolean
	readOnly: boolean
	busy: boolean
	onSelect: () => void
	onToggleCover: () => void
	onRemove: () => void
}) {
	const title = media.source_title || "本地图片"
	const coverActionLabel = getAssetMediaCoverActionLabel(cover)
	return (
		<div className={`overflow-hidden rounded border text-xs ${selected ? "border-primary" : "border-border/70"}`}>
			<button type="button" className="block w-full text-left" onClick={onSelect}>
				<div className="aspect-[16/9] bg-surface-soft">
					{versionId && <AssetMediaImage versionId={versionId} alt={title} />}
				</div>
				<span data-testid="asset-media-thumbnail-title" className="block truncate px-2 pb-1 pt-2">
					{title}
				</span>
			</button>
			<div className="grid grid-cols-2 gap-1 px-1.5 pb-1.5">
				<Button
					data-testid="asset-media-thumbnail-cover-toggle"
					className={assetMediaThumbnailActionClassName}
					size="sm"
					variant="outline"
					disabled={readOnly || busy}
					aria-label={`${coverActionLabel} ${title}`}
					onClick={onToggleCover}
				>
					<StarIcon className={getAssetMediaCoverIconClassName(cover)} />
					{getAssetMediaCoverButtonLabel()}
				</Button>
				<Button
					data-testid="asset-media-thumbnail-delete"
					className={assetMediaThumbnailActionClassName}
					size="sm"
					variant="ghost"
					disabled={readOnly || busy}
					aria-label={`删除图片 ${title}`}
					onClick={onRemove}
				>
					<Trash2Icon className="mr-1 size-3" />
					删除
				</Button>
			</div>
		</div>
	)
}

export function AssetMediaWorkspace({
	assetId,
	readOnly,
	fallbackPreview,
	previewOverride,
	preferredMediaId,
	onLibrarySelection,
}: {
	assetId: string
	readOnly: boolean
	fallbackPreview?: { url: string; alt: string }
	previewOverride?: { url: string; alt: string }
	preferredMediaId?: string
	onLibrarySelection?: () => void
}) {
	const [data, setData] = useState<MediaResponse>({ media: [], versions: [], placements: [] })
	const [busy, setBusy] = useState(false)
	const [selectedId, setSelectedId] = useState<string | null>(null)
	const [editorOpen, setEditorOpen] = useState(false)
	const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null)
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
		ratio: AssetMediaCropPreset
	) => {
		const saved = await runMediaOperation("save-edit", async () => {
			const created = await pb.send<MediaSaveResponse>(`/api/pulse/assets/${assetId}/media/${mediaId}/versions`, {
				method: "POST",
				body: { parent_version: versionId, placement, ratio },
			})
			await notifyAssetMediaChanged(assetId)
			setSelectedId(created.media.id)
		})
		if (saved) setEditorOpen(false)
		return saved
	}
	const remove = async (mediaId: string) =>
		runMediaOperation("delete", async () => {
			await pb.send(`/api/pulse/assets/${assetId}/media/${mediaId}`, { method: "DELETE" })
			if (selectedId === mediaId) setSelectedId(null)
			await notifyAssetMediaChanged(assetId)
		})
	const selected = data.media.find((item) => item.id === selectedId)
	const getOriginalVersion = (mediaId: string) => getAssetMediaOriginalVersionId(data.versions, mediaId)
	const getDisplayVersion = (mediaId: string, activeVersion?: string) => getOriginalVersion(mediaId) ?? activeVersion
	const isCoverMedia = (activeVersion?: string) => isAssetMediaCoverVersion(data.placements, activeVersion)
	const selectedOriginalVersion = selected ? getAssetMediaOriginalVersionId(data.versions, selected.id) : undefined
	const selectedIsCover = isAssetMediaCoverVersion(data.placements, selected?.active_version)
	const selectedIsGallery = isAssetMediaGalleryVersion(data.placements, selected?.active_version)
	const selectedMediaObject = useAssetMediaObjectURL(selectedOriginalVersion)
	const preview = previewOverride ? (
		<img className="h-full w-full object-contain" src={previewOverride.url} alt={previewOverride.alt} />
	) : selectedOriginalVersion && selectedMediaObject.status === "ready" ? (
		<img
			className="h-full w-full object-contain"
			src={selectedMediaObject.url}
			alt={selected?.source_title || "资产图片"}
		/>
	) : selectedOriginalVersion && selectedMediaObject.status === "error" ? (
		<div className="grid h-full place-items-center text-[10px] text-muted-foreground">图片读取失败</div>
	) : selectedOriginalVersion ? (
		<div className="grid h-full place-items-center text-[10px] text-muted-foreground">图片加载中</div>
	) : fallbackPreview ? (
		<img className="h-full w-full object-contain" src={fallbackPreview.url} alt={fallbackPreview.alt} />
	) : null
	return (
		<div className="rounded-md border border-border/70 bg-card p-2.5">
			<div className="mb-2 flex items-center justify-between gap-2">
				<div className="text-xs font-medium">图片库</div>
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
					<div className="grid grid-cols-3 gap-2">
						{data.media.map((media) => {
							const cover = isCoverMedia(media.active_version)
							return (
								<AssetMediaThumbnail
									key={media.id}
									media={media}
									versionId={getDisplayVersion(media.id, media.active_version)}
									selected={selectedId === media.id}
									cover={cover}
									readOnly={readOnly}
									busy={busy}
									onSelect={() => {
										onLibrarySelection?.()
										setSelectedId(media.id)
									}}
									onToggleCover={() =>
										media.active_version &&
										place(media.id, media.active_version, "cover", getNextAssetMediaCoverVisibility(cover)).catch(
											() => undefined
										)
									}
									onRemove={() => setPendingDelete({ id: media.id, title: media.source_title || "本地图片" })}
								/>
							)
						})}
					</div>
					<AssetMediaPreview
						preview={preview}
						selected={previewOverride ? undefined : selected}
						isCover={selectedIsCover}
						isGallery={selectedIsGallery}
						readOnly={readOnly}
						busy={busy}
						selectedURL={selectedMediaObject.url}
						onRemove={() =>
							selected && setPendingDelete({ id: selected.id, title: selected.source_title || "本地图片" })
						}
						onEdit={() => setEditorOpen(true)}
						onPlace={(role, visible) =>
							selected?.active_version &&
							place(selected.id, selected.active_version, role, visible).catch(() => undefined)
						}
					/>
					<AssetMediaEditorDialog
						open={editorOpen}
						onOpenChange={setEditorOpen}
						url={selectedMediaObject.url}
						title={selected?.source_title || "资产图片"}
						readOnly={readOnly}
						saving={busy}
						onSave={(placement, ratio) =>
							selectedOriginalVersion &&
							selected &&
							saveVersion(selected.id, selectedOriginalVersion, placement, ratio).catch(() => undefined)
						}
					/>
				</>
			) : (
				<div className="grid gap-3">
					<div className="rounded border border-dashed border-border/70 px-3 py-5 text-center text-xs text-muted-foreground">
						上传图片或从候选图加入图片库。
					</div>
					<AssetMediaPreview
						preview={preview}
						isCover={false}
						isGallery={false}
						readOnly={readOnly}
						busy={busy}
						onRemove={() => undefined}
						onEdit={() => undefined}
						onPlace={() => undefined}
					/>
				</div>
			)}
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
	onRemove,
	onEdit,
	onPlace,
}: {
	preview: ReactNode
	selected?: MediaResponse["media"][number]
	isCover: boolean
	isGallery: boolean
	readOnly: boolean
	busy: boolean
	selectedURL?: string
	onRemove: () => void
	onEdit: () => void
	onPlace: (role: "cover" | "gallery", visible?: boolean) => void
}) {
	if (!preview) return null
	return (
		<div className="mt-3 grid gap-2 rounded border border-border/70 p-2.5">
			<div className="flex items-center justify-between gap-2 text-xs">
				<span className="truncate font-medium">{selected?.source_title || "当前预览"}</span>
				{selected && (
					<Button size="sm" variant="ghost" disabled={readOnly || busy} onClick={onRemove}>
						<Trash2Icon className="mr-1 size-3.5" />
						删除
					</Button>
				)}
			</div>
			<div className="grid aspect-[16/9] place-items-center overflow-hidden rounded border border-border/60 bg-white">
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
						编辑图片
					</Button>
					{!isGallery && (
						<Button size="sm" variant="outline" disabled={readOnly || busy} onClick={() => onPlace("gallery")}>
							加入图库
						</Button>
					)}
					<Button
						className="ms-auto"
						size="sm"
						variant={isCover ? "default" : "outline"}
						disabled={readOnly || busy}
						onClick={() => onPlace("cover", getNextAssetMediaCoverVisibility(isCover))}
					>
						{isCover ? <CheckIcon className="mr-1 size-3.5" /> : <StarIcon className="mr-1 size-3.5" />}
						{getAssetMediaCoverActionLabel(isCover)}
					</Button>
				</div>
			)}
		</div>
	)
}
