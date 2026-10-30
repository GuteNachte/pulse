import type { AssetFormState } from "@/modules/asset-center/asset-import"
import { buildFixedSpecAssetName } from "@/modules/asset-center/asset-schema"
import type { AssetFieldDefinition } from "@/modules/asset-center/asset-schema"

export const emptyAssetForm: AssetFormState = {
	name: "",
	type: "physical_host",
	status: "active",
	parent_asset: "",
	vendor: "",
	model: "",
	serial_number: "",
	management_ip: "",
	location: "",
	role: "",
	notes: "",
	metadata: {},
}

const ROOT_FIELD_KEYS = new Set([
	"name",
	"status",
	"parent_asset",
	"vendor",
	"model",
	"serial_number",
	"management_ip",
	"location",
	"role",
	"notes",
])

export function getAssetFormFieldValue(form: AssetFormState, field: AssetFieldDefinition) {
	if (field.source === "metadata") {
		return form.metadata[field.key] ?? ""
	}
	if (!ROOT_FIELD_KEYS.has(field.key)) {
		return ""
	}
	const value = form[field.key as keyof AssetFormState]
	return typeof value === "string" ? value : ""
}

export function buildSuggestedAssetName(form: AssetFormState) {
	if (form.type === "internet") {
		return ""
	}
	const internalModel = form.type === "phone" ? form.metadata.internal_model : undefined
	const fixedSpecName = buildFixedSpecAssetName(form.type, form.model, internalModel)
	if (fixedSpecName) return fixedSpecName
	const model = form.model.trim()
	const normalizedInternalModel = internalModel?.trim() ?? ""
	if (!model) return ""
	if (
		!normalizedInternalModel ||
		model.includes(`(${normalizedInternalModel})`) ||
		model.includes(`（${normalizedInternalModel}）`)
	) {
		return model
	}
	return `${model} (${normalizedInternalModel})`
}

export function shouldReplaceAssetNameWithSuggestion(current: AssetFormState) {
	const currentName = current.name.trim()
	return !currentName || currentName === buildSuggestedAssetName(current)
}
