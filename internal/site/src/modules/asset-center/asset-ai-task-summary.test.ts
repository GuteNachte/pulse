import {
	formatAITaskSummary,
	formatAssetVisualTaskMeta,
	getReferenceSkipReasonSummary,
} from "./asset-ai-task-summary.ts"
import type { AITaskRecord } from "../../types"

function assertDeepEqual(actual: unknown, expected: unknown) {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
	}
}

function assertEqual(actual: unknown, expected: unknown) {
	if (actual !== expected) {
		throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
	}
}

const readyVisualTask = {
	kind: "asset_visual",
	status: "ready",
	provider: "agnes",
	model: "agnes-image-2.1-flash",
	output_summary: {
		collected_images: 2,
		generated_images: 2,
		reference_input_count: 1,
		reference_skip_reasons: [
			{
				url: "https://example.test/official-redmi-k50-large.jpg",
				reason: "参考图大小超过模型输入上限。",
			},
		],
	},
} as unknown as AITaskRecord

const readyEnrichmentTask = {
	kind: "asset_enrichment",
	status: "ready",
	provider: "agnes",
	model: "agnes-2.0-flash",
	input_summary: {
		source_count: 4,
	},
	output_summary: {
		ai_attempts: 2,
		ai_suggestions: 17,
		source_discovery_attempts: 1,
		source_discovery_source_count: 4,
		total_suggestions: 24,
	},
} as unknown as AITaskRecord

const failedEnrichmentTask = {
	kind: "asset_enrichment",
	status: "failed",
	provider: "agnes",
	model: "agnes-2.0-flash",
	error: "模型请求暂时失败。",
	output_summary: {
		ai_attempts: 3,
	},
} as unknown as AITaskRecord

const failedVisualTask = {
	kind: "asset_visual",
	status: "failed",
	provider: "agnes",
	model: "agnes-image-2.1-flash",
	error: "参考图全部不可读取。",
	output_summary: {
		reference_skip_reasons: [
			{
				url: "https://example.test/not-image.jpg",
				reason: "参考图响应不是图片。",
			},
		],
	},
} as unknown as AITaskRecord

const runningVisualTask = {
	kind: "asset_visual",
	status: "running",
	provider: "agnes",
	model: "agnes-image-2.1-flash",
	output_summary: {
		phase: "image_model_day",
		phase_label: "正在生成白天图",
		progress_percent: 55,
		collected_images: 2,
	},
} as unknown as AITaskRecord

const readyVisualTaskWithModelRejections = {
	kind: "asset_visual",
	status: "ready",
	provider: "agnes",
	model: "agnes-image-2.1-flash",
	output_summary: {
		collected_images: 2,
		generated_images: 2,
		image_model_output_candidates: 4,
		image_model_output_selected: 2,
		image_model_output_rejected: 2,
		image_model_output_rejections: [
			{
				source: "url",
				url: "https://example.test/products/redmi-k50",
				reason: "模型返回的 URL 不是可验证图片。",
			},
			{
				source: "url",
				url: "https://example.test/products/redmi-k50",
				reason: "模型返回的 URL 不是可验证图片。",
			},
		],
	},
} as unknown as AITaskRecord

const legacyReadyVisualTaskWithThemeImages = {
	kind: "asset_visual",
	status: "ready",
	provider: "agnes",
	model: "agnes-image-2.1-flash",
	output_summary: {
		collected_images: 2,
		theme_images: 2,
	},
} as unknown as AITaskRecord

assertDeepEqual(getReferenceSkipReasonSummary(readyVisualTask.output_summary), {
	count: 1,
	text: "跳过 1 张：参考图大小超过模型输入上限。",
})

assertEqual(
	formatAITaskSummary(readyVisualTask),
	"设备图片 Agent · 参考图 2 张 · 统一图 2 张 · 可用输入 1 张 · 跳过 1 张：参考图大小超过模型输入上限。"
)

assertEqual(
	formatAssetVisualTaskMeta(readyVisualTask),
	"图片成功：参考 2 / 生成 2，可用输入 1，跳过 1 张：参考图大小超过模型输入上限。"
)

assertEqual(
	formatAITaskSummary(readyEnrichmentTask),
	"agnes / agnes-2.0-flash · 可追溯来源 4 个 · 来源发现 1 次 / 命中 4 个 · AI 尝试 2 次 · AI 建议 17 条 · 总建议 24 条"
)

assertEqual(formatAITaskSummary(failedEnrichmentTask), "模型请求暂时失败。 · AI 尝试 3 次")

assertEqual(formatAITaskSummary(failedVisualTask), "参考图全部不可读取。 · 跳过 1 张：参考图响应不是图片。")

assertEqual(
	formatAssetVisualTaskMeta(failedVisualTask),
	"图片失败：参考图全部不可读取。跳过 1 张：参考图响应不是图片。"
)

assertEqual(formatAITaskSummary(runningVisualTask), "设备图片 Agent · 正在生成白天图 · 55%")

assertEqual(formatAssetVisualTaskMeta(runningVisualTask), "图片生成中：正在生成白天图 55%")

assertEqual(
	formatAITaskSummary(readyVisualTaskWithModelRejections),
	"设备图片 Agent · 参考图 2 张 · 统一图 2 张 · 模型跳过 2 个候选：模型返回的 URL 不是可验证图片。"
)

assertEqual(
	formatAssetVisualTaskMeta(readyVisualTaskWithModelRejections),
	"图片成功：参考 2 / 生成 2，模型跳过 2 个候选：模型返回的 URL 不是可验证图片。"
)

assertEqual(formatAITaskSummary(legacyReadyVisualTaskWithThemeImages), "设备图片 Agent · 参考图 2 张 · 统一图 2 张")

assertEqual(formatAssetVisualTaskMeta(legacyReadyVisualTaskWithThemeImages), "图片成功：参考 2 / 生成 2")
