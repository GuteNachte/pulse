import type { AITaskRecord, AITaskStatus } from "../../types"

export function formatAITaskStatusLabel(status?: AITaskStatus) {
	switch (status) {
		case "ready":
			return "成功"
		case "applied":
			return "已处理"
		case "failed":
			return "失败"
		case "running":
			return "运行中"
		case "queued":
			return "排队中"
		default:
			return "未知"
	}
}

export function formatAssetDetailTaskStatusLabel(status?: AITaskStatus) {
	switch (status) {
		case "queued":
			return "排队中"
		case "running":
			return "生成中"
		case "ready":
			return "已完成"
		case "failed":
			return "失败"
		case "applied":
			return "已应用"
		default:
			return "未开始"
	}
}

export function formatAITaskSummary(task: AITaskRecord) {
	if (task.status === "failed") {
		return formatFailedAITaskSummary(task)
	}
	if (task.kind === "asset_enrichment") {
		const suggestions = numberFromRecord(task.output_summary, "ai_suggestions")
		const total = numberFromRecord(task.output_summary, "total_suggestions")
		const sourceCount = numberFromRecord(task.input_summary, "source_count")
		const attempts = numberFromRecord(task.output_summary, "ai_attempts")
		const discoveryAttempts = numberFromRecord(task.output_summary, "source_discovery_attempts")
		const discoveredSources = numberFromRecord(task.output_summary, "source_discovery_source_count")
		const parts = [`${task.provider || "未知服务"} / ${task.model || "未知模型"}`]
		if (sourceCount > 0) parts.push(`可追溯来源 ${sourceCount} 个`)
		if (discoveryAttempts > 0) parts.push(`来源发现 ${discoveryAttempts} 次 / 命中 ${discoveredSources} 个`)
		if (attempts > 0) parts.push(`AI 尝试 ${attempts} 次`)
		parts.push(`AI 建议 ${suggestions} 条`, `总建议 ${total} 条`)
		return parts.join(" · ")
	}
	if (task.kind === "asset_visual") {
		if (task.status === "running" || task.status === "queued") {
			const phaseLabel = stringFromUnknown(task.output_summary?.phase_label).trim()
			const progress = numberFromRecord(task.output_summary, "progress_percent")
			const suffix = formatAssetVisualDiagnosticsSuffix(task.output_summary, " · ")
			if (phaseLabel) {
				return `设备图片 Agent · ${phaseLabel}${progress > 0 ? ` · ${Math.round(progress)}%` : ""}${suffix}`
			}
		}
		const collected = numberFromRecord(task.output_summary, "collected_images")
		const generated = getAssetVisualGeneratedImageCount(task.output_summary)
		const referenceInputCount = numberFromRecord(task.output_summary, "reference_input_count")
		const legacyFrames = numberFromRecord(task.output_summary, "generated_frames")
		const suffix = formatAssetVisualDiagnosticsSuffix(task.output_summary, " · ")
		if (collected > 0 || generated > 0) {
			if (generated <= 0) {
				return `设备图片 Agent · 参考图已收集 ${collected} 张，未生成统一图${suffix}`
			}
			const inputText = referenceInputCount > 0 ? ` · 可用输入 ${referenceInputCount} 张` : ""
			return `设备图片 Agent · 参考图 ${collected} 张 · 统一图 ${generated} 张${inputText}${suffix}`
		}
		if (legacyFrames > 0) {
			return `${task.provider || "未知服务"} / ${task.model || "未知模型"} · 历史生成 ${legacyFrames} 帧${suffix}`
		}
		return `${task.provider || "未知服务"} / ${task.model || "未知模型"} · 尚未产出图片${suffix}`
	}
	return `${task.provider || "未知服务"} / ${task.model || "未知模型"}`
}

export function formatAssetVisualTaskMeta(task?: AITaskRecord) {
	if (!task) return ""
	const suffix = formatAssetVisualDiagnosticsSuffix(task.output_summary, "，")
	if (task.status === "failed") {
		const diagnosticText = formatAssetVisualDiagnosticsText(task.output_summary, "，")
		if (!task.error) return diagnosticText ? `图片失败：${diagnosticText}` : "图片失败"
		return `图片失败：${task.error}${diagnosticText ? formatSentenceJoiner(task.error) + diagnosticText : ""}`
	}
	const collected = numberFromRecord(task.output_summary, "collected_images")
	const generated = getAssetVisualGeneratedImageCount(task.output_summary)
	const referenceInputCount = numberFromRecord(task.output_summary, "reference_input_count")
	if (task.status === "running" || task.status === "queued") {
		const phaseLabel = stringFromUnknown(task.output_summary?.phase_label).trim()
		const progress = numberFromRecord(task.output_summary, "progress_percent")
		if (phaseLabel) return `图片生成中：${phaseLabel}${progress > 0 ? ` ${Math.round(progress)}%` : ""}${suffix}`
	}
	if (task.status === "ready" && (collected > 0 || generated > 0)) {
		if (generated <= 0) {
			return `参考图已收集：${collected} 张，未生成统一图${suffix}`
		}
		const inputText = referenceInputCount > 0 ? `，可用输入 ${referenceInputCount}` : ""
		return `图片成功：参考 ${collected} / 生成 ${generated}${inputText}${suffix}`
	}
	return `图片 ${formatAssetDetailTaskStatusLabel(task.status)}${suffix}`
}

function formatFailedAITaskSummary(task: AITaskRecord) {
	const parts = [task.error || "任务失败，未返回具体错误。"]
	if (task.kind === "asset_enrichment") {
		const attempts = numberFromRecord(task.output_summary, "ai_attempts")
		if (attempts > 0) parts.push(`AI 尝试 ${attempts} 次`)
	}
	if (task.kind === "asset_visual") {
		const diagnosticText = formatAssetVisualDiagnosticsText(task.output_summary, "，")
		if (diagnosticText) parts.push(diagnosticText)
	}
	return parts.join(" · ")
}

export function getReferenceSkipReasonSummary(record: Record<string, unknown> | undefined) {
	const reasons = getReferenceSkipReasons(record)
	if (reasons.length === 0) return { count: 0, text: "" }
	const firstReasons = uniqueStrings(reasons.map((item) => item.reason)).slice(0, 2)
	return {
		count: reasons.length,
		text: `跳过 ${reasons.length} 张：${firstReasons.join("；")}`,
	}
}

function getReferenceSkipReasons(record: Record<string, unknown> | undefined) {
	const raw = record?.reference_skip_reasons
	if (!Array.isArray(raw)) return []
	return raw.flatMap((item) => {
		if (!isRecord(item)) return []
		const reason = stringFromUnknown(item.reason).trim()
		if (!reason) return []
		return [{ reason }]
	})
}

function getImageModelOutputRejectionSummary(record: Record<string, unknown> | undefined) {
	const rejections = getImageModelOutputRejections(record)
	const reportedCount = numberFromRecord(record, "image_model_output_rejected")
	const count = reportedCount > 0 ? reportedCount : rejections.length
	if (count === 0) return { count: 0, text: "" }
	const firstReasons = uniqueStrings(rejections.map((item) => item.reason)).slice(0, 2)
	return {
		count,
		text: firstReasons.length > 0 ? `模型跳过 ${count} 个候选：${firstReasons.join("；")}` : `模型跳过 ${count} 个候选`,
	}
}

function getImageModelOutputRejections(record: Record<string, unknown> | undefined) {
	const raw = record?.image_model_output_rejections
	if (!Array.isArray(raw)) return []
	return raw.flatMap((item) => {
		if (!isRecord(item)) return []
		const reason = stringFromUnknown(item.reason).trim()
		if (!reason) return []
		return [{ reason }]
	})
}

function formatAssetVisualDiagnosticsSuffix(record: Record<string, unknown> | undefined, separator: string) {
	const text = formatAssetVisualDiagnosticsText(record, separator)
	return text ? `${separator}${text}` : ""
}

function formatAssetVisualDiagnosticsText(record: Record<string, unknown> | undefined, separator: string) {
	return [
		getReferenceSkipReasonSummary(record).text,
		getImageModelOutputRejectionSummary(record).text,
		getImageModelRequestSummary(record).text,
	]
		.filter(Boolean)
		.join(separator)
}

function getImageModelRequestSummary(record: Record<string, unknown> | undefined) {
	const responseFormat = stringFromUnknown(record?.image_model_response_format).trim()
	const fallbackResponseFormat = stringFromUnknown(record?.image_model_fallback_response_format).trim()
	const timeoutSeconds = numberFromRecord(record, "image_model_timeout_seconds")
	const inputCount = firstPositiveNumber(
		numberFromRecord(record, "image_model_reference_input_count"),
		numberFromRecord(record, "reference_input_count")
	)
	const payloadBytes = numberFromRecord(record, "image_model_reference_payload_bytes")
	if (!responseFormat && timeoutSeconds <= 0 && payloadBytes <= 0) {
		return { text: "" }
	}
	const parts: string[] = []
	if (inputCount > 0) parts.push(`输入 ${inputCount} 张`)
	if (payloadBytes > 0) parts.push(`请求 ${formatBytes(payloadBytes)}`)
	if (responseFormat) parts.push(`输出 ${responseFormat}`)
	if (fallbackResponseFormat) parts.push(`备用 ${fallbackResponseFormat}`)
	if (timeoutSeconds > 0) parts.push(`超时 ${Math.round(timeoutSeconds)} 秒`)
	return { text: `模型请求：${parts.join(" / ")}` }
}

function formatBytes(value: number) {
	if (!Number.isFinite(value) || value <= 0) return "0 B"
	if (value >= 1024 * 1024) return `${formatOneDecimal(value / 1024 / 1024)} MB`
	if (value >= 1024) return `${formatOneDecimal(value / 1024)} KB`
	return `${Math.round(value)} B`
}

function formatOneDecimal(value: number) {
	const rounded = Math.round(value * 10) / 10
	return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function numberFromRecord(record: Record<string, unknown> | undefined, key: string) {
	const value = record?.[key]
	return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function getAssetVisualGeneratedImageCount(record: Record<string, unknown> | undefined) {
	return firstPositiveNumber(
		numberFromRecord(record, "generated_images"),
		numberFromRecord(record, "theme_images"),
		numberFromRecord(record, "image_model_output_selected")
	)
}

function firstPositiveNumber(...values: number[]) {
	for (const value of values) {
		if (value > 0) return value
	}
	return 0
}

function stringFromUnknown(value: unknown) {
	return typeof value === "string" ? value : ""
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function uniqueStrings(values: string[]) {
	const result: string[] = []
	const seen = new Set<string>()
	for (const value of values) {
		const key = value.trim()
		if (!key || seen.has(key)) continue
		seen.add(key)
		result.push(key)
	}
	return result
}

function formatSentenceJoiner(value: string) {
	return /[。.!！?？]$/.test(value.trim()) ? "" : "，"
}
