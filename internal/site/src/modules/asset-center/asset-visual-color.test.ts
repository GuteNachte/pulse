import {
	getAssetOfficialColorOptions,
	getAssetVisualColor,
	getAssetVisualGenerationBlockReason,
	getAssetVisualSearchAdvice,
	isOfficialColorRequiredForAssetType,
	mergeOfficialColorOptions,
} from "./asset-visual-color.ts"
import type { AssetEnrichmentSuggestionRecord, AssetRecord } from "../../types"

function assertEqual(actual: unknown, expected: unknown) {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
	}
}

const phone = {
	id: "asset-redmi-k50",
	name: "Redmi K50",
	type: "phone",
	model: "Redmi K50",
	metadata: {
		internal_model: "22041211AC",
		colors_available: "墨羽黑、银迹 / 墨羽黑",
		device_color: "墨羽黑",
	},
} as unknown as AssetRecord

const suggestions = [
	{
		status: "pending",
		target_collection: "assets",
		target_field: "metadata.colors_available",
		recommended_value: "幽芒, 银迹",
	},
	{
		status: "accepted",
		target_collection: "assets",
		target_field: "metadata.colors_available",
		recommended_value: "不应出现",
	},
	{
		status: "pending",
		target_collection: "asset_interfaces",
		target_field: "metadata.colors_available",
		recommended_value: "不应出现",
	},
] as AssetEnrichmentSuggestionRecord[]

assertEqual(getAssetVisualColor(phone), "墨羽黑")
assertEqual(getAssetOfficialColorOptions(phone, suggestions), ["墨羽黑", "银迹", "幽芒"])
assertEqual(mergeOfficialColorOptions(["墨羽黑"], "银迹"), ["银迹", "墨羽黑"])
assertEqual(isOfficialColorRequiredForAssetType("phone"), true)
assertEqual(isOfficialColorRequiredForAssetType("router"), false)
assertEqual(getAssetVisualGenerationBlockReason(phone), "")
assertEqual(getAssetVisualGenerationBlockReason({ ...phone, model: "", metadata: {} }), "")
assertEqual(getAssetVisualGenerationBlockReason({ ...phone, name: "" }), "收集候选图至少需要资产名称。")
assertEqual(getAssetVisualSearchAdvice({ ...phone, name: "", model: "", metadata: {} }), [
	"资产名称",
	"厂商 / 品牌",
	"型号 / 规格",
])
assertEqual(getAssetVisualSearchAdvice({ ...phone, type: "internet", name: "宽带", vendor: "" }), ["运营商 / 服务商"])
