import {
	getAssetOfficialColorOptions,
	getAssetVisualColor,
	getAssetVisualGenerationBlockReason,
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
	type: "phone",
	model: "Redmi K50",
	metadata: {
		internal_model: "22041211AC",
		colors_available: "墨羽黑、银迹 / 墨羽黑",
		device_color: "墨羽黑",
	},
} as AssetRecord

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
assertEqual(getAssetVisualGenerationBlockReason(phone, "幽芒", ["墨羽黑", "幽芒"]), "")
assertEqual(
	getAssetVisualGenerationBlockReason(phone, "蓝色", ["墨羽黑", "幽芒"]),
	"当前配色不是已采集的官方配色，请从官方配色列表选择。"
)
assertEqual(
	getAssetVisualGenerationBlockReason({ ...phone, metadata: {} }, "", []),
	"收集设备图需要先保存型号 / 规格和内部型号 / 搜索代码。"
)
