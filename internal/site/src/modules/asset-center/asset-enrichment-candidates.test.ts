import { buildAssetEnrichmentCandidateMap } from "./asset-enrichment-candidates.ts"
import type { AssetEnrichmentSuggestionRecord } from "../../types"

function assertDeepEqual(actual: unknown, expected: unknown) {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
	}
}

const candidates = buildAssetEnrichmentCandidateMap([
	{
		target_field: "metadata.cpu_model",
		target_collection: "assets",
		collected_value: "AMD Ryzen 9 6900HX",
		status: "pending",
	} as AssetEnrichmentSuggestionRecord,
	{
		target_field: "metadata.cpu_model",
		target_collection: "assets",
		online_value: "AMD Ryzen 9 6900HX",
		status: "pending",
	} as AssetEnrichmentSuggestionRecord,
	{
		target_field: "metadata.cpu_model",
		target_collection: "assets",
		online_value: "Ryzen 9 6900HX",
		status: "pending",
	} as AssetEnrichmentSuggestionRecord,
	{
		target_field: "metadata.memory_gb",
		target_collection: "assets",
		collected_value: "32",
		status: "accepted",
	} as AssetEnrichmentSuggestionRecord,
	{
		target_field: "metadata.primary_nic_speed_mbps",
		target_collection: "assets",
		collected_value: "2500000000",
		status: "pending",
	} as AssetEnrichmentSuggestionRecord,
	{
		target_field: "metadata.memory_detail",
		target_collection: "assets",
		collected_value: "Hynix HMCG78AGBSA095N 16GB 5600MHz / Hynix HMCG78AGBSA095N 16GB 5600MHz",
		status: "pending",
	} as AssetEnrichmentSuggestionRecord,
])

assertDeepEqual(candidates.cpu_model, [
	{ value: "AMD Ryzen 9 6900HX", sources: ["local", "online"] },
	{ value: "Ryzen 9 6900HX", sources: ["online"] },
])
assertDeepEqual(candidates.memory_gb, undefined)
assertDeepEqual(candidates.primary_nic_speed_mbps, [{ value: "2500", sources: ["local"] }])
assertDeepEqual(candidates.memory_detail, [{ value: "16 GB x 2", sources: ["local"] }])
