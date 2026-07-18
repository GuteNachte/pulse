import type { AssetVisualRecord } from "../../types"
import { escapePocketBaseFilterValue } from "./asset-query.ts"

type AssetVisualCollection = {
	getList: (
		page: number,
		perPage: number,
		options: { filter: string; sort: string; fields: string; requestKey: null }
	) => Promise<{ items: AssetVisualRecord[] }>
}

const assetVisualDisplayFields = "id,asset,kind,status,primary,files,frames,metadata,created,updated"

export type AssetVisualFileURLBuilder = (recordId: string, file: string) => string

export function getAssetVisualCandidateLimit(assetType: string) {
	return assetType === "internet" || assetType === "web_endpoint" ? 4 : 15
}

export function getAssetVisualCrop(frame: { crop?: unknown } | undefined) {
	const crop = frame?.crop
	if (!crop || typeof crop !== "object") return undefined
	const values = crop as Record<string, unknown>
	const x = Number(values.x)
	const y = Number(values.y)
	const width = Number(values.width)
	const height = Number(values.height)
	if (
		![x, y, width, height].every(Number.isFinite) ||
		x < 0 ||
		y < 0 ||
		width <= 0 ||
		height <= 0 ||
		x + width > 1 ||
		y + height > 1
	) {
		return undefined
	}
	return { x, y, width, height }
}

export async function loadDisplayAssetVisuals(
	collection: AssetVisualCollection,
	assetId: string,
	buildFileURL?: AssetVisualFileURLBuilder
) {
	const escapedAssetId = escapePocketBaseFilterValue(assetId)
	const [referenceVisualPage, manualVisualPage, candidateVisualPage] = await Promise.all([
		collection.getList(1, 1, {
			filter: `asset="${escapedAssetId}" && status="ready" && kind="official_reference" && primary=true`,
			sort: "-created",
			fields: assetVisualDisplayFields,
			requestKey: null,
		}),
		collection.getList(1, 1, {
			filter: `asset="${escapedAssetId}" && status="ready" && kind="manual"`,
			sort: "-primary,-created",
			fields: assetVisualDisplayFields,
			requestKey: null,
		}),
		collection.getList(1, 3, {
			filter: `asset="${escapedAssetId}" && status="ready" && kind="official_reference" && primary=false`,
			sort: "-created",
			fields: assetVisualDisplayFields,
			requestKey: null,
		}),
	])
	return resolveAssetVisualFrameURLs(
		[...referenceVisualPage.items, ...manualVisualPage.items, ...candidateVisualPage.items],
		buildFileURL
	)
}

export function resolveAssetVisualFrameURLs(visuals: AssetVisualRecord[], buildFileURL?: AssetVisualFileURLBuilder) {
	if (!buildFileURL) return visuals
	return visuals.map((visual) => {
		if (!visual.frames?.length) return visual
		return {
			...visual,
			frames: visual.frames.map((frame) => {
				const file = frame.file?.trim()
				if (!file) return frame
				return {
					...frame,
					url: buildFileURL(frame.file_record_id?.trim() || visual.id, file),
				}
			}),
		}
	})
}

export function getDisplayAssetVisualFrames(visual: AssetVisualRecord | undefined) {
	const frames = visual?.frames?.filter(isDisplayableAssetVisualFrame) ?? []
	return frames.slice(0, 1)
}

export function getAssetDisplayVisual(visuals: AssetVisualRecord[]) {
	return (
		visuals.find(isFinalReferenceAssetVisual) ??
		visuals.find((item) => item.kind === "manual" && item.status === "ready" && item.primary !== false) ??
		visuals.find((item) => item.kind === "manual" && item.status === "ready")
	)
}

export function getAssetVisualStageLayout(
	hasVisual: boolean,
	_useLandscapeImageLayout: boolean,
	_isProviderLogo = false
) {
	return {
		stageClassName: "aspect-[16/9]",
		imageClassName: hasVisual ? "object-contain p-1 sm:p-2" : "",
		maxWidth: "100%",
	}
}

export type AssetVisualCandidateFrame = {
	visualId: string
	index: number
	label: string
	url: string
	sourceTitle?: string
	sourceUrl?: string
	sourceProvider?: string
	color?: string
}

export function getLatestAssetVisualCandidateSet(visuals: AssetVisualRecord[]) {
	return visuals.find((item) => {
		const metadata = item.metadata ?? {}
		return (
			item.kind === "official_reference" &&
			item.status === "ready" &&
			item.primary !== true &&
			metadata.visual_role === "candidate_set"
		)
	})
}

export function getAssetVisualCandidateFrames(visual: AssetVisualRecord | undefined): AssetVisualCandidateFrame[] {
	if (!visual?.frames?.length) return []
	return visual.frames
		.map((frame, fallbackIndex): AssetVisualCandidateFrame | undefined => {
			if (!isDisplayableAssetVisualFrame(frame) || !frame.url) return undefined
			const index = typeof frame.index === "number" ? frame.index : fallbackIndex
			return {
				visualId: visual.id,
				index,
				label: frame.label || `候选 ${index + 1}`,
				url: frame.url,
				color: frame.color,
				sourceProvider: frame.provider,
				sourceTitle: frame.source_title,
				sourceUrl: frame.source_url,
			}
		})
		.filter((item): item is AssetVisualCandidateFrame => Boolean(item))
		.slice(0, 15)
}

export function groupAssetVisualCandidateFramesByColor(frames: AssetVisualCandidateFrame[]) {
	const groups: Array<{ color: string; frames: AssetVisualCandidateFrame[] }> = []
	const groupMap = new Map<string, AssetVisualCandidateFrame[]>()
	for (const frame of frames) {
		const color = frame.color?.trim() || "未识别颜色"
		const existing = groupMap.get(color)
		if (existing) {
			existing.push(frame)
			continue
		}
		const list = [frame]
		groupMap.set(color, list)
		groups.push({ color, frames: list })
	}
	return groups
}

function isFinalReferenceAssetVisual(visual: AssetVisualRecord) {
	const metadata = visual.metadata ?? {}
	return (
		visual.kind === "official_reference" &&
		visual.status === "ready" &&
		visual.primary === true &&
		metadata.visual_role === "final_reference" &&
		!metadata.superseded_by
	)
}

export function isDisplayableAssetVisualFrame(frame: NonNullable<AssetVisualRecord["frames"]>[number] | undefined) {
	if (!frame?.url) return false
	if (frame.presentation === "provider_logo") return true
	const lower = frame.url.toLowerCase()
	if (lower.startsWith("data:image/") && lower.includes(";base64,")) return true
	const rejected = [
		"appdownload",
		"download.png",
		"qrcode",
		"qr-code",
		"/qr",
		"wechat",
		"weixin",
		"favicon",
		"logo",
		"icon",
		"sprite",
		"avatar",
		"placeholder",
		"loading",
		"blank",
		"appstore",
		"googleplay",
		"playstore",
		"share",
	]
	return !rejected.some((marker) => lower.includes(marker))
}
