import {
	getAssetDisplayVisual,
	getAssetVisualCandidateFrames,
	getDisplayAssetVisualFrames,
	getLatestAssetVisualCandidateSet,
	groupAssetVisualCandidateFramesByColor,
	loadDisplayAssetVisuals,
} from "./asset-visual-query.ts"
import type { AssetVisualRecord } from "../../types"

function assertDeepEqual(actual: unknown, expected: unknown) {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
	}
}

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
			fields: "id,asset,kind,status,primary,frames,metadata,created,updated",
		},
		{
			page: 1,
			perPage: 1,
			filter: 'asset="asset-123" && status="ready" && kind="manual"',
			sort: "-primary,-created",
			fields: "id,asset,kind,status,primary,frames,metadata,created,updated",
		},
		{
			page: 1,
			perPage: 3,
			filter: 'asset="asset-123" && status="ready" && kind="official_reference" && primary=false',
			sort: "-created",
			fields: "id,asset,kind,status,primary,frames,metadata,created,updated",
		},
	]
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
	frames: Array.from({ length: 11 }, (_, index) => ({
		index,
		label: `候选 ${index + 1}`,
		url: `https://cdn.example.com/device-${index + 1}.jpg`,
		color: index < 2 ? "墨羽" : "幽芒",
	})),
} as unknown as AssetVisualRecord

assertDeepEqual(getLatestAssetVisualCandidateSet([manualVisual, candidateSet])?.id, "visual-candidate-set")
const candidateFrames = getAssetVisualCandidateFrames(candidateSet)
assertDeepEqual(candidateFrames.length, 10)
assertDeepEqual(
	groupAssetVisualCandidateFramesByColor(candidateFrames).map((group) => [group.color, group.frames.length]),
	[
		["墨羽", 2],
		["幽芒", 8],
	]
)
