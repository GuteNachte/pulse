import { formatAITaskSummary, getReferenceSkipReasonSummary } from "./asset-ai-task-summary.ts"
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
		phase: "reference_collecting",
		phase_label: "正在收集参考图",
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
	"设备图片 Agent · 历史生图 2 张（不再作为主图） · 已收集设备图 2 张 · 跳过 1 张：参考图大小超过模型输入上限。"
)

assertEqual(
	formatAITaskSummary(readyEnrichmentTask),
	"agnes / agnes-2.0-flash · 可追溯来源 4 个 · 来源发现 1 次 / 命中 4 个 · AI 尝试 2 次 · AI 建议 17 条 · 总建议 24 条"
)

// 2026-10-14 参数填写 Agent：粘贴文本分类的执行记录（candidates/unrecognized 口径）
const pasteEnrichmentTask = {
	kind: "asset_enrichment",
	status: "ready",
	provider: "siliconflow",
	model: "deepseek-v4-flash",
	input_summary: { mode: "paste" },
	output_summary: { paste: true, candidates: 12, unrecognized: 3 },
} as unknown as AITaskRecord

assertEqual(formatAITaskSummary(pasteEnrichmentTask), "siliconflow / deepseek-v4-flash · 分类参数 12 条 · 未识别 3 项")

assertEqual(formatAITaskSummary(failedEnrichmentTask), "模型请求暂时失败。 · AI 尝试 3 次")

assertEqual(formatAITaskSummary(failedVisualTask), "参考图全部不可读取。 · 跳过 1 张：参考图响应不是图片。")

assertEqual(formatAITaskSummary(runningVisualTask), "设备图片 Agent · 正在收集参考图 · 55%")

assertEqual(
	formatAITaskSummary(readyVisualTaskWithModelRejections),
	"设备图片 Agent · 历史生图 2 张（不再作为主图） · 已收集设备图 2 张 · 模型跳过 2 个候选：模型返回的 URL 不是可验证图片。"
)

assertEqual(
	formatAITaskSummary(legacyReadyVisualTaskWithThemeImages),
	"设备图片 Agent · 历史生图 2 张（不再作为主图） · 已收集设备图 2 张"
)
