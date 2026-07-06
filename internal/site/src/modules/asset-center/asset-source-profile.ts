import type { AssetRecord } from "@/types"
import {
	getAssetFormSections,
	getMetadataString,
	type AssetFieldCapture,
	type AssetFieldDefinition,
} from "./asset-schema"

export type AssetSourceProfileGroup = {
	capture: AssetFieldCapture
	label: string
	brief: string
	total: number
	filled: number
	examples: string[]
	missing: string[]
}

const sourceProfiles: Record<AssetFieldCapture, { label: string; brief: string }> = {
	manual: {
		label: "手动主档",
		brief: "长期稳定信息，以资产中心为准",
	},
	agent_required: {
		label: "建档线索",
		brief: "用于 Agent 接入、资产绑定和后续补全",
	},
	agent_collectable: {
		label: "本地采集",
		brief: "来自 Agent 或局域网采集，只生成待确认建议",
	},
	future_collectable: {
		label: "资料补全 / 专项识别",
		brief: "由资料补全 Agent 或专项识别生成候选",
	},
}

const sourceOrder: AssetFieldCapture[] = ["manual", "agent_required", "agent_collectable", "future_collectable"]

export function getAssetSourceProfile(asset: AssetRecord): AssetSourceProfileGroup[] {
	const seen = new Set<string>()
	const groups = new Map<AssetFieldCapture, { fields: AssetFieldDefinition[]; filled: string[]; missing: string[] }>()

	for (const section of getAssetFormSections(asset.type)) {
		for (const field of section.fields) {
			if (field.key === "notes") continue
			const identity = `${field.source}:${field.key}`
			if (seen.has(identity)) continue
			seen.add(identity)
			const capture = field.capture ?? "manual"
			const group = groups.get(capture) ?? { fields: [], filled: [], missing: [] }
			const hasValue = Boolean(getAssetSourceFieldValue(asset, field))
			group.fields.push(field)
			if (hasValue) {
				group.filled.push(field.label)
			} else {
				group.missing.push(field.label)
			}
			groups.set(capture, group)
		}
	}

	return sourceOrder
		.map((capture) => {
			const profile = sourceProfiles[capture]
			const group = groups.get(capture) ?? { fields: [], filled: [], missing: [] }
			return {
				capture,
				label: profile.label,
				brief: profile.brief,
				total: group.fields.length,
				filled: group.filled.length,
				examples: group.fields.slice(0, 4).map((field) => field.label),
				missing: group.missing.slice(0, 4),
			}
		})
		.filter((group) => group.total > 0)
}

function getAssetSourceFieldValue(asset: AssetRecord, field: AssetFieldDefinition) {
	if (field.source === "metadata") {
		return getMetadataString(asset.metadata, field.key)
	}
	const value = (asset as unknown as Record<string, unknown>)[field.key]
	if (typeof value === "string") return value.trim()
	if (typeof value === "number") return Number.isFinite(value) ? String(value) : ""
	if (typeof value === "boolean") return value ? "true" : ""
	return ""
}
