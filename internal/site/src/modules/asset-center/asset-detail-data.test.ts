import {
	applyAssetDetailEditCatalog,
	applyAssetDetailPrimaryData,
	applyAssetDetailSecondaryData,
	loadAssetDetailPrimaryData,
	loadAssetDetailSecondaryData,
} from "./asset-detail-data.ts"
import type {
	AssetAttachmentRecord,
	AssetChangeRecord,
	AssetEnrichmentReportRecord,
	AssetEnrichmentSuggestionRecord,
	AssetInterfaceRecord,
	AssetLocationRecord,
	AssetMaintenanceRecord,
	AssetRecord,
	AssetRelationRecord,
	AssetVisualRecord,
} from "../../types"

function assertDeepEqual(actual: unknown, expected: unknown) {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
	}
}

const calls: Array<{ collection: string; options: Record<string, unknown> }> = []
const escapedAssetId = 'asset"bad\\id'
const primaryAsset = { id: escapedAssetId, name: "RedmiK50" } as unknown as AssetRecord
const primaryInterfaces = [
	{ id: "interface-1", asset: escapedAssetId },
	{ id: "peer-interface", asset: "asset-2" },
] as unknown as AssetInterfaceRecord[]
const relations = [
	{
		id: "relation-1",
		source_asset: "asset-2",
		target_asset: 'asset"bad\\id',
		metadata: { source_interface: "peer-interface", target_interface: "interface-1" },
	},
] as unknown as AssetRelationRecord[]

const primary = await loadAssetDetailPrimaryData(
	{
		assets: {
			getOne(id, options) {
				calls.push({ collection: "assets", options: { id, ...options } })
				return Promise.resolve(primaryAsset)
			},
		},
		interfaces: {
			getFullList(options) {
				calls.push({ collection: "asset_interfaces", options })
				return Promise.resolve(primaryInterfaces)
			},
		},
		relations: {
			getFullList(options) {
				calls.push({ collection: "asset_relations", options })
				return Promise.resolve(relations)
			},
		},
	},
	escapedAssetId
)

assertDeepEqual(primary, {
	asset: primaryAsset,
	interfaces: [primaryInterfaces[0]],
	allInterfaces: primaryInterfaces,
	relations,
})
assertDeepEqual(
	calls.map((call) => ({ collection: call.collection, filter: call.options.filter, sort: call.options.sort })),
	[
		{ collection: "assets", filter: undefined, sort: undefined },
		{
			collection: "asset_relations",
			filter: 'source_asset="asset\\"bad\\\\id" || target_asset="asset\\"bad\\\\id"',
			sort: "kind,created",
		},
		{
			collection: "asset_interfaces",
			filter: 'asset="asset\\"bad\\\\id" || id="peer-interface" || id="interface-1"',
			sort: "-primary,kind,name",
		},
	]
)

const asset = { id: "asset-1", name: "RedmiK50" } as unknown as AssetRecord
const interfaces = [
	{ id: "interface-1", asset: "asset-1" },
	{ id: "peer-interface", asset: "asset-2" },
] as unknown as AssetInterfaceRecord[]
const baseState = {
	asset,
	assets: [asset],
	interfaces,
	allInterfaces: interfaces,
	editCatalogLoaded: false,
	relations,
	locations: [],
	maintenance: [],
	attachments: [],
	visuals: [],
	aiTasks: [],
	changes: [],
	enrichmentReports: [],
	enrichmentSuggestions: [],
	officialColorSuggestions: [],
}

const secondary = {
	maintenance: [{ id: "maintenance-1" }] as unknown as AssetMaintenanceRecord[],
	attachments: [{ id: "attachment-1" }] as unknown as AssetAttachmentRecord[],
	visuals: [{ id: "visual-1" }] as unknown as AssetVisualRecord[],
	aiTasks: [],
	changes: [{ id: "change-1" }] as unknown as AssetChangeRecord[],
	enrichmentReports: [{ id: "report-1" }] as unknown as AssetEnrichmentReportRecord[],
	enrichmentSuggestions: [{ id: "suggestion-1" }] as unknown as AssetEnrichmentSuggestionRecord[],
	officialColorSuggestions: [],
}

const merged = applyAssetDetailSecondaryData(baseState, "asset-1", secondary)
assertDeepEqual(
	merged.maintenance.map((item) => item.id),
	["maintenance-1"]
)
assertDeepEqual(
	merged.enrichmentReports.map((item) => item.id),
	["report-1"]
)
if (applyAssetDetailSecondaryData(baseState, "asset-2", secondary) !== baseState) {
	throw new Error("Secondary data for another asset must not replace the current page state.")
}

const refreshedAsset = { id: "asset-1", name: "RedmiK50 已更新" } as unknown as AssetRecord
const refreshedInterfaces = [{ id: "interface-2", asset: "asset-1" }] as unknown as AssetInterfaceRecord[]
const refreshedRelations = [{ id: "relation-2", source_asset: "asset-1" }] as unknown as AssetRelationRecord[]
const refreshState = applyAssetDetailPrimaryData(
	{ ...baseState, ...secondary, editCatalogLoaded: true },
	{
		asset: refreshedAsset,
		interfaces: refreshedInterfaces,
		allInterfaces: refreshedInterfaces,
		relations: refreshedRelations,
	},
	{ preserveSecondaryData: true }
)
assertDeepEqual(refreshState.asset?.name, "RedmiK50 已更新")
assertDeepEqual(
	refreshState.interfaces.map((item) => item.id),
	["interface-2"]
)
assertDeepEqual(
	refreshState.relations.map((item) => item.id),
	["relation-2"]
)
assertDeepEqual(
	refreshState.visuals.map((item) => item.id),
	["visual-1"]
)
assertDeepEqual(
	refreshState.enrichmentReports.map((item) => item.id),
	["report-1"]
)

const catalogState = applyAssetDetailEditCatalog(baseState, {
	assetId: "asset-1",
	fallbackAsset: asset,
	fallbackInterfaces: interfaces,
	assets: [{ id: "asset-2" } as unknown as AssetRecord],
	interfaces: [],
	locations: [{ id: "location-1" }] as unknown as AssetLocationRecord[],
})
assertDeepEqual(
	catalogState.assets.map((item) => item.id),
	["asset-1", "asset-2"]
)
assertDeepEqual(
	catalogState.allInterfaces.map((item) => item.id),
	["interface-1", "peer-interface"]
)
if (
	applyAssetDetailEditCatalog(baseState, {
		assetId: "asset-2",
		fallbackAsset: asset,
		fallbackInterfaces: interfaces,
		assets: [],
		interfaces: [],
		locations: [],
	}) !== baseState
) {
	throw new Error("Edit catalog data for another asset must not replace the current page state.")
}

const secondaryCalls: Array<{ collection: string; options: Record<string, unknown> }> = []
const emptyFullList = (collection: string) => ({
	getFullList(options: Record<string, unknown>) {
		secondaryCalls.push({ collection, options })
		return Promise.resolve([])
	},
})
const emptyPagedList = (collection: string) => ({
	getList(_page: number, _perPage: number, options: Record<string, unknown>) {
		secondaryCalls.push({ collection, options })
		return Promise.resolve({ items: [] })
	},
})

await loadAssetDetailSecondaryData(
	{
		maintenance: emptyFullList("asset_maintenance"),
		attachments: emptyFullList("asset_attachments"),
		visuals: emptyPagedList("asset_visuals"),
		aiTasks: emptyPagedList("ai_tasks"),
		changes: emptyPagedList("asset_changes"),
		enrichmentReports: emptyPagedList("asset_enrichment_reports"),
		suggestions: {
			...emptyFullList("asset_enrichment_suggestions"),
			...emptyPagedList("asset_enrichment_suggestions"),
		},
	},
	'asset"bad\\id'
)

const maintenanceCall = secondaryCalls.find((call) => call.collection === "asset_maintenance")
if (maintenanceCall?.options.filter !== 'asset="asset\\"bad\\\\id"') {
	throw new Error("Secondary collection filters must escape asset IDs.")
}
const reportCall = secondaryCalls.find((call) => call.collection === "asset_enrichment_reports")
if (reportCall?.options.sort !== "-created") {
	throw new Error("Secondary reports must load newest reports first.")
}
