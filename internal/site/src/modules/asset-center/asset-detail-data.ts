import type {
	AITaskRecord,
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
import { loadLatestAITasksByKind } from "./asset-ai-task-query.ts"
import {
	loadLatestReportSuggestions,
	loadPendingOfficialColorSuggestions,
} from "./asset-enrichment-suggestion-query.ts"
import { escapePocketBaseFilterValue } from "./asset-query.ts"
import { loadDisplayAssetVisuals } from "./asset-visual-query.ts"

export type AssetDetailState = {
	asset?: AssetRecord
	assets: AssetRecord[]
	interfaces: AssetInterfaceRecord[]
	allInterfaces: AssetInterfaceRecord[]
	editCatalogLoaded: boolean
	relations: AssetRelationRecord[]
	locations: AssetLocationRecord[]
	maintenance: AssetMaintenanceRecord[]
	attachments: AssetAttachmentRecord[]
	visuals: AssetVisualRecord[]
	aiTasks: AITaskRecord[]
	changes: AssetChangeRecord[]
	enrichmentReports: AssetEnrichmentReportRecord[]
	enrichmentSuggestions: AssetEnrichmentSuggestionRecord[]
	officialColorSuggestions: AssetEnrichmentSuggestionRecord[]
}

export const emptyAssetDetailState: AssetDetailState = {
	assets: [],
	interfaces: [],
	allInterfaces: [],
	editCatalogLoaded: false,
	relations: [],
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

type PrimaryAssetCollection = {
	getOne: (id: string, options: { requestKey: null }) => Promise<AssetRecord>
}

type FilteredCollection<T> = {
	getFullList: (options: { filter: string; sort: string; requestKey: null }) => Promise<T[]>
}

type PagedCollection<T> = {
	getList: (
		page: number,
		perPage: number,
		options: { filter: string; sort: string; requestKey: null }
	) => Promise<{ items: T[] }>
}

export type AssetDetailPrimaryData = {
	asset: AssetRecord
	interfaces: AssetInterfaceRecord[]
	relations: AssetRelationRecord[]
}

export async function loadAssetDetailPrimaryData(
	collections: {
		assets: PrimaryAssetCollection
		interfaces: FilteredCollection<AssetInterfaceRecord>
		relations: FilteredCollection<AssetRelationRecord>
	},
	assetId: string
): Promise<AssetDetailPrimaryData> {
	const [asset, interfaces, relations] = await Promise.all([
		collections.assets.getOne(assetId, { requestKey: null }),
		collections.interfaces.getFullList({
			filter: `asset="${escapePocketBaseFilterValue(assetId)}"`,
			sort: "-primary,kind,name",
			requestKey: null,
		}),
		collections.relations.getFullList({
			filter: `source_asset="${escapePocketBaseFilterValue(assetId)}" || target_asset="${escapePocketBaseFilterValue(assetId)}"`,
			sort: "kind,created",
			requestKey: null,
		}),
	])
	return { asset, interfaces, relations }
}

export type AssetDetailSecondaryData = {
	maintenance: AssetMaintenanceRecord[]
	attachments: AssetAttachmentRecord[]
	visuals: AssetVisualRecord[]
	aiTasks: AITaskRecord[]
	changes: AssetChangeRecord[]
	enrichmentReports: AssetEnrichmentReportRecord[]
	enrichmentSuggestions: AssetEnrichmentSuggestionRecord[]
	officialColorSuggestions: AssetEnrichmentSuggestionRecord[]
}

type LatestAITaskCollection = {
	getList: (
		page: number,
		perPage: number,
		options: { filter: string; sort: string; fields: string; requestKey: null }
	) => Promise<{ items: AITaskRecord[] }>
}

type SuggestionCollection = FilteredCollection<AssetEnrichmentSuggestionRecord> &
	PagedCollection<AssetEnrichmentSuggestionRecord>

export async function loadAssetDetailSecondaryData(
	collections: {
		maintenance: FilteredCollection<AssetMaintenanceRecord>
		attachments: FilteredCollection<AssetAttachmentRecord>
		visuals: { getList: Parameters<typeof loadDisplayAssetVisuals>[0]["getList"] }
		aiTasks: LatestAITaskCollection
		changes: PagedCollection<AssetChangeRecord>
		enrichmentReports: PagedCollection<AssetEnrichmentReportRecord>
		suggestions: SuggestionCollection
	},
	assetId: string
): Promise<AssetDetailSecondaryData> {
	const [maintenance, attachments, visuals, aiTasks, changes, enrichmentReports] = await Promise.all([
		collections.maintenance.getFullList({
			filter: `asset="${escapePocketBaseFilterValue(assetId)}"`,
			sort: "-event_date,-created",
			requestKey: null,
		}),
		collections.attachments.getFullList({
			filter: `asset="${escapePocketBaseFilterValue(assetId)}"`,
			sort: "kind,title",
			requestKey: null,
		}),
		loadDisplayAssetVisuals(collections.visuals, assetId),
		loadLatestAITasksByKind(collections.aiTasks, { assetId }),
		collections.changes.getList(1, 20, {
			filter: `asset="${escapePocketBaseFilterValue(assetId)}"`,
			sort: "-created",
			requestKey: null,
		}),
		collections.enrichmentReports.getList(1, 10, {
			filter: `asset="${escapePocketBaseFilterValue(assetId)}"`,
			sort: "-created",
			requestKey: null,
		}),
	])

	const [enrichmentSuggestions, officialColorSuggestions] = await Promise.all([
		loadLatestReportSuggestions(collections.suggestions, enrichmentReports.items[0]?.id),
		loadPendingOfficialColorSuggestions(collections.suggestions, assetId),
	])

	return {
		maintenance,
		attachments,
		visuals,
		aiTasks,
		changes: changes.items,
		enrichmentReports: enrichmentReports.items,
		enrichmentSuggestions,
		officialColorSuggestions,
	}
}

export function applyAssetDetailSecondaryData(
	state: AssetDetailState,
	assetId: string,
	data: AssetDetailSecondaryData
): AssetDetailState {
	if (state.asset?.id !== assetId) return state
	return { ...state, ...data }
}

export function applyAssetDetailEditCatalog(
	state: AssetDetailState,
	options: {
		assetId: string
		fallbackAsset: AssetRecord
		fallbackInterfaces: AssetInterfaceRecord[]
		assets: AssetRecord[]
		interfaces: AssetInterfaceRecord[]
		locations: AssetLocationRecord[]
	}
): AssetDetailState {
	if (state.asset?.id !== options.assetId) return state
	const assets = options.assets.some((item) => item.id === options.assetId)
		? options.assets
		: [options.fallbackAsset, ...options.assets]
	const allInterfaces = options.interfaces.length > 0 ? options.interfaces : options.fallbackInterfaces
	return {
		...state,
		assets,
		allInterfaces,
		locations: options.locations,
		editCatalogLoaded: true,
	}
}
