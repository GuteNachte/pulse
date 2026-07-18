import {
	getAssetDisplayVisual,
	getAssetVisualCandidateFrames,
	getAssetVisualCandidateLimit,
	getAssetVisualCrop,
	getAssetVisualStageLayout,
	getDisplayAssetVisualFrames,
	getLatestAssetVisualCandidateSet,
	groupAssetVisualCandidateFramesByColor,
	isDisplayableAssetVisualFrame,
	loadDisplayAssetVisuals,
	resolveAssetVisualFrameURLs,
} from "./asset-visual-query.ts"
import type { AssetVisualRecord } from "../../types"

function assertDeepEqual(actual: unknown, expected: unknown) {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
	}
}

assertDeepEqual(getAssetVisualStageLayout(false, false), {
	stageClassName: "aspect-[16/9]",
	imageClassName: "",
	maxWidth: "100%",
})

assertDeepEqual(getAssetVisualStageLayout(true, false), {
	stageClassName: "aspect-[16/9]",
	imageClassName: "object-contain p-1 sm:p-2",
	maxWidth: "100%",
})

assertDeepEqual(getAssetVisualStageLayout(true, true), {
	stageClassName: "aspect-[16/9]",
	imageClassName: "object-contain p-1 sm:p-2",
	maxWidth: "100%",
})

assertDeepEqual(getAssetVisualStageLayout(true, true, true), {
	stageClassName: "aspect-[16/9]",
	imageClassName: "object-contain p-1 sm:p-2",
	maxWidth: "100%",
})

assertDeepEqual(getAssetVisualCandidateLimit("internet"), 4)
assertDeepEqual(getAssetVisualCandidateLimit("phone"), 15)

assertDeepEqual(getAssetVisualCrop({ crop: { x: 0.1, y: 0.2, width: 0.7, height: 0.6 } } as never), {
	x: 0.1,
	y: 0.2,
	width: 0.7,
	height: 0.6,
})
assertDeepEqual(getAssetVisualCrop({ crop: { x: 0.5, y: 0.2, width: 0.7, height: 0.6 } } as never), undefined)

const calls: Array<{ page: number; perPage: number; options: Record<string, unknown> }> = []
const fakeCollection = {
	getList(page: number, perPage: number, options: Record<string, unknown>) {
		calls.push({ page, perPage, options })
		const filter = String(options.filter)
		const id = filter.includes("primary=false")
			? "visual-candidates"
			: filter.includes('kind="official_reference"')
				? "visual-reference"
				: "visual-manual"
		return Promise.resolve({
			items: [
				{
					id,
					asset: "asset-123",
					kind: filter.includes('kind="official_reference"') ? "official_reference" : "manual",
					status: "ready",
				} as unknown as AssetVisualRecord,
			],
		})
	},
}

const visuals = await loadDisplayAssetVisuals(fakeCollection, "asset-123")

assertDeepEqual(
	calls.map((call) => ({
		page: call.page,
		perPage: call.perPage,
		filter: call.options.filter,
		sort: call.options.sort,
		fields: call.options.fields,
	})),
	[
		{
			page: 1,
			perPage: 1,
			filter: 'asset="asset-123" && status="ready" && kind="official_reference" && primary=true',
			sort: "-created",
			fields: "id,asset,kind,status,primary,files,frames,metadata,created,updated",
		},
		{
			page: 1,
			perPage: 1,
			filter: 'asset="asset-123" && status="ready" && kind="manual"',
			sort: "-primary,-created",
			fields: "id,asset,kind,status,primary,files,frames,metadata,created,updated",
		},
		{
			page: 1,
			perPage: 3,
			filter: 'asset="asset-123" && status="ready" && kind="official_reference" && primary=false',
			sort: "-created",
			fields: "id,asset,kind,status,primary,files,frames,metadata,created,updated",
		},
	]
)

const locallyStoredVisual = {
	id: "visual-final-reference",
	asset: "asset-123",
	kind: "official_reference",
	status: "ready",
	files: ["asset-visual-01_local.jpg"],
	frames: [
		{
			index: 0,
			file: "asset-visual-01_local.jpg",
			file_record_id: "visual-candidate-set",
			source_image_url: "https://cdn.example.com/redmi-k50-black.jpg",
		},
	],
} as unknown as AssetVisualRecord

assertDeepEqual(
	resolveAssetVisualFrameURLs(
		[locallyStoredVisual],
		(recordId, file) => `/api/files/asset_visuals/${recordId}/${file}`
	)[0]?.frames?.[0]?.url,
	"/api/files/asset_visuals/visual-candidate-set/asset-visual-01_local.jpg"
)
assertDeepEqual(
	visuals.map((visual) => visual.id),
	["visual-reference", "visual-manual", "visual-candidates"]
)

calls.length = 0
await loadDisplayAssetVisuals(fakeCollection, 'asset"bad\\id')

assertDeepEqual(
	calls.map((call) => call.options.filter),
	[
		'asset="asset\\"bad\\\\id" && status="ready" && kind="official_reference" && primary=true',
		'asset="asset\\"bad\\\\id" && status="ready" && kind="manual"',
		'asset="asset\\"bad\\\\id" && status="ready" && kind="official_reference" && primary=false',
	]
)

const selectedColorVisual = {
	id: "visual-old-two-frame",
	asset: "asset-123",
	kind: "official_reference",
	status: "ready",
	frames: [
		{
			index: 0,
			theme: "day",
			label: "白天",
			url: "https://cdn.example.com/redmi-k50-blue.jpg",
		},
		{
			index: 1,
			theme: "night",
			label: "夜晚",
			url: "https://cdn.example.com/redmi-k50-black.jpg",
		},
	],
} as unknown as AssetVisualRecord

assertDeepEqual(
	getDisplayAssetVisualFrames(selectedColorVisual).map((frame) => frame.url),
	["https://cdn.example.com/redmi-k50-blue.jpg"]
)

const visualWithRejectedFirstFrame = {
	id: "visual-rejected-first-frame",
	asset: "asset-123",
	kind: "official_reference",
	status: "ready",
	frames: [
		{
			index: 0,
			url: "https://cdn.example.com/logo.png",
		},
		{
			index: 1,
			url: "https://cdn.example.com/redmi-k50-black.jpg",
		},
	],
} as unknown as AssetVisualRecord

assertDeepEqual(
	getDisplayAssetVisualFrames(visualWithRejectedFirstFrame).map((frame) => frame.url),
	["https://cdn.example.com/redmi-k50-black.jpg"]
)

assertDeepEqual(
	isDisplayableAssetVisualFrame({
		url: "https://cdn.example.com/china-unicom-logo.png",
		presentation: "provider_logo",
	} as never),
	true
)

const finalReferenceVisual = {
	id: "visual-final-reference",
	asset: "asset-123",
	kind: "official_reference",
	status: "ready",
	primary: true,
	metadata: { visual_role: "final_reference" },
} as unknown as AssetVisualRecord
const manualVisual = {
	id: "visual-manual",
	asset: "asset-123",
	kind: "manual",
	status: "ready",
	primary: true,
} as unknown as AssetVisualRecord

assertDeepEqual(getAssetDisplayVisual([manualVisual, finalReferenceVisual])?.id, "visual-final-reference")

const candidateSet = {
	id: "visual-candidate-set",
	asset: "asset-123",
	kind: "official_reference",
	status: "ready",
	primary: false,
	metadata: { visual_role: "candidate_set" },
	frames: Array.from({ length: 16 }, (_, index) => ({
		index,
		label: `候选 ${index + 1}`,
		url: `https://cdn.example.com/device-${index + 1}.jpg`,
		color: index < 2 ? "墨羽" : "幽芒",
	})),
} as unknown as AssetVisualRecord

assertDeepEqual(getLatestAssetVisualCandidateSet([manualVisual, candidateSet])?.id, "visual-candidate-set")
const candidateFrames = getAssetVisualCandidateFrames(candidateSet)
assertDeepEqual(candidateFrames.length, 15)
assertDeepEqual(
	groupAssetVisualCandidateFramesByColor(candidateFrames).map((group) => [group.color, group.frames.length]),
	[
		["墨羽", 2],
		["幽芒", 13],
	]
)

const tracedCandidateSet = {
	id: "visual-traced-candidate-set",
	asset: "asset-123",
	kind: "official_reference",
	status: "ready",
	metadata: { visual_role: "candidate_set" },
	frames: [
		{
			index: 0,
			label: "候选 1",
			url: "https://cdn.example.com/redmi-k50-black.jpg",
			provider: "bing_images",
			source_title: "Redmi K50 墨羽",
		},
	],
} as unknown as AssetVisualRecord

assertDeepEqual(getAssetVisualCandidateFrames(tracedCandidateSet)[0]?.sourceProvider, "bing_images")
