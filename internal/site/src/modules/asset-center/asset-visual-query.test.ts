import { loadDisplayAssetVisuals, resolveAssetVisualFrameURLs } from "./asset-visual-query.ts"
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
