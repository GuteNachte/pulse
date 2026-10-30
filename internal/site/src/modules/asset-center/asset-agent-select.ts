import type { AssetType } from "@/types"
import { getAssetFormSections } from "./asset-schema.ts"
import { getAssetTypeSpec } from "./asset-type-specs.ts"

// 2026-10-20 用户反馈「Agent 写入失败」：交换机严格模板只接受固定选项值（web/smart/enabled…），
// 而粘贴文本通常是「Web轻管理」「轻管理」这类中文描述。写入前按字段的可选项把描述归一成存储值。
type SelectOption = { value: string; label: string }

function agentFieldOptions(assetType: AssetType, fieldKey: string): SelectOption[] | undefined {
	const typeSpecField = getAssetTypeSpec(assetType)
		?.sections.flatMap((section) => section.fields)
		.find((field) => field.key === fieldKey)
	if (typeSpecField?.options && typeSpecField.options.length > 0) return [...typeSpecField.options]
	const formField = getAssetFormSections(assetType)
		.flatMap((section) => section.fields)
		.find((field) => field.key === fieldKey)
	return formField?.options
}

export function normalizeAgentSelectValue(assetType: AssetType, fieldKey: string, value: string): string {
	const options = agentFieldOptions(assetType, fieldKey)
	if (!options || options.length === 0) return value
	const trimmed = value.trim()
	if (!trimmed) return trimmed
	const lower = trimmed.toLowerCase()
	const exact = options.find((option) => option.value === trimmed || option.label === trimmed)
	if (exact) return exact.value
	// 「Web轻管理」包含选项标签 Web → web；「已启用 / 未启用」等完整标签也能命中
	const labelMatches = options.filter((option) => option.label && lower.includes(option.label.toLowerCase()))
	if (labelMatches.length === 1) return labelMatches[0].value
	// 反向：选项标签包含用户输入（如「轻管理交换机」里的轻管理已由上面命中，这里兜底简短输入）
	const valueMatches = options.filter((option) => option.label?.toLowerCase().includes(lower))
	if (valueMatches.length === 1) return valueMatches[0].value
	return trimmed
}

export function assetAgentWriteError(error: unknown, fallback: string) {
	const message = (error as { data?: { message?: string } })?.data?.message?.trim()
	if (message) return message.replace(/。\.$/, "。")
	if (error instanceof Error && error.message.trim()) return error.message.trim()
	return fallback
}

// 2026-10-20 用户反馈「参数名不要带单位」：Agent 结果里把预设字段标签末尾的单位去掉
//（交换容量 Gbps → 交换容量），单位保留在值里（60Gbps / 60 Gbps）；详情页的字段定义仍保留单位。
const agentLabelUnitPattern = /^(.*\S)\s+(Gbps|Mbps|Kbps|GHz|MHz|kV|GB|TB|MB|kg|mm|cm|dB|rpm|W|V|℃|°C|个|口|年|月)$/i

export function formatAgentCandidateLabel(label: string) {
	const trimmed = label.trim()
	const matched = trimmed.match(agentLabelUnitPattern)
	return matched ? matched[1] : trimmed
}
