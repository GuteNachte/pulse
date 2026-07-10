import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import type { AssetRecord } from "@/types"
import {
	AssetFieldCaptureTag,
	AssetLocationInput,
	AssetTagInput,
	PHONE_MEMORY_OPTIONS,
	PHONE_STORAGE_OPTIONS,
	PhoneVariantSpecField,
} from "./asset-form-fields"
import { SelectField, TextAreaField } from "./asset-detail-form-fields"
import { getMetadataNumber, getMetadataString, type AssetFieldDefinition } from "../asset-schema"

export function AssetProfileEditField({
	field,
	asset,
	locationOptions,
	nextAssetTagPreview,
}: {
	field: AssetFieldDefinition
	asset: AssetRecord
	locationOptions: string[]
	nextAssetTagPreview: string
}) {
	const metadata = asset.metadata ?? {}
	const defaultValue = getAssetProfileEditFieldDefaultValue(asset, field)
	const className = field.span === "full" || field.key === "notes" ? "sm:col-span-2" : undefined

	if (field.key === "notes") {
		return <TextAreaField name="notes" label={field.label} defaultValue={asset.notes} className={className} />
	}
	if (field.key === "location") {
		return (
			<div className={cn("grid gap-2", className)}>
				<Label>
					{field.label}
					{field.required && <span className="ms-1 text-destructive">*</span>}
				</Label>
				<AssetLocationInput
					idPrefix={`asset-detail-edit-field-${field.key}`}
					value={asset.location || ""}
					locationOptions={locationOptions}
					onChange={() => undefined}
				/>
			</div>
		)
	}
	if (field.key === "asset_tag") {
		return (
			<div className={cn("grid gap-2", className)}>
				<Label htmlFor="asset-detail-edit-field-asset-tag">{field.label}</Label>
				<AssetTagInput
					id="asset-detail-edit-field-asset-tag"
					name={field.key}
					value={getMetadataString(metadata, field.key)}
					onChange={() => undefined}
					nextAssetTagPreview={nextAssetTagPreview}
				/>
			</div>
		)
	}
	if (field.key === "memory_gb") {
		return (
			<PhoneVariantSpecField
				name={field.key}
				label={field.label}
				required={field.required}
				defaultValue={String(getMetadataNumber(metadata, field.key) ?? "")}
				options={PHONE_MEMORY_OPTIONS}
				customPlaceholder="例如 10"
			/>
		)
	}
	if (field.key === "storage_gb") {
		return (
			<PhoneVariantSpecField
				name={field.key}
				label={field.label}
				required={field.required}
				defaultValue={String(getMetadataNumber(metadata, field.key) ?? "")}
				options={PHONE_STORAGE_OPTIONS}
				customPlaceholder="例如 384"
			/>
		)
	}
	if (field.type === "select" && field.options) {
		return (
			<SelectField
				name={field.key}
				label={field.label}
				options={field.options}
				defaultValue={defaultValue}
				placeholder="未设置"
			/>
		)
	}
	return (
		<div className={cn("grid gap-2", className)}>
			<Label htmlFor={`asset-detail-edit-field-${field.key}`} className="flex min-w-0 flex-wrap items-center gap-1.5">
				<span>
					{field.label}
					{field.required && <span className="ms-1 text-destructive">*</span>}
				</span>
				<AssetFieldCaptureTag capture={field.capture} required={field.required} />
			</Label>
			<Input
				id={`asset-detail-edit-field-${field.key}`}
				name={field.key}
				type={field.type === "number" || field.type === "date" || field.type === "url" ? field.type : "text"}
				defaultValue={defaultValue}
				placeholder={field.placeholder}
			/>
		</div>
	)
}

function getAssetProfileEditFieldDefaultValue(asset: AssetRecord, field: AssetFieldDefinition) {
	switch (field.key) {
		case "name":
			return asset.name || ""
		case "status":
			return asset.status || "active"
		case "vendor":
			return asset.vendor || ""
		case "model":
			return asset.model || ""
		case "serial_number":
			return asset.serial_number || ""
		case "management_ip":
			return asset.management_ip || ""
		case "location":
			return asset.location || ""
		case "role":
			return asset.role || ""
		case "notes":
			return asset.notes || ""
		default:
			return getMetadataString(asset.metadata, field.key)
	}
}
