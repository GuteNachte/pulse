import type { AssetVisualRecord } from "../../types"
import { escapePocketBaseFilterValue } from "./asset-query.ts"

type AssetVisualCollection = {
	getList: (
		page: number,
		perPage: number,
		options: { filter: string; sort: string; fields: string; requestKey: null }
	) => Promise<{ items: AssetVisualRecord[] }>
}

const assetVisualDisplayFields = "id,asset,kind,status,primary,frames,metadata,created,updated"

export async function loadDisplayAssetVisuals(collection: AssetVisualCollection, assetId: string) {
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
	return [...referenceVisualPage.items, ...manualVisualPage.items, ...candidateVisualPage.items]
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

export type AssetVisualCandidateFrame = {
	visualId: string
	index: number
	label: string
	url: string
	sourceTitle?: string
	sourceUrl?: string
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
		.map((frame, fallbackIndex) => {
			if (!isDisplayableAssetVisualFrame(frame) || !frame.url) return undefined
			const index = typeof frame.index === "number" ? frame.index : fallbackIndex
			return {
				visualId: visual.id,
				index,
				label: frame.label || `候选 ${index + 1}`,
				url: frame.url,
				color: frame.color,
				sourceTitle: frame.source_title,
				sourceUrl: frame.source_url,
			}
		})
		.filter((item): item is AssetVisualCandidateFrame => Boolean(item))
		.slice(0, 10)
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
