import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { AssetRecord } from "@/types"
import {
	AssetLocationInput,
	AssetTagInput,
	PHONE_MEMORY_OPTIONS,
	PHONE_STORAGE_OPTIONS,
	PhoneVariantSpecField,
} from "./asset-form-fields"
import { SelectField, TextAreaField } from "./asset-detail-form-fields"
import { getMetadataNumber, getMetadataString, type AssetFieldDefinition } from "../asset-schema"
import type { AssetEnrichmentCandidate } from "../asset-enrichment-candidates"
import { normalizeMemorySpecification } from "../asset-memory-spec.ts"
import { normalizeNetworkInterfaceSummary } from "../asset-runtime-hardware.ts"

export type AssetFieldCandidates = Record<string, AssetEnrichmentCandidate[]>

export function AssetCandidateTextField({
	name,
	label,
	defaultValue,
	value,
	onChange,
	placeholder,
	type = "text",
	candidates,
}: {
	name: string
	label: string
	defaultValue?: string
	value?: string
	onChange?: (value: string) => void
	placeholder?: string
	type?: string
	candidates?: AssetEnrichmentCandidate[]
}) {
	return (
		<div className="grid gap-2">
			<Label htmlFor={`asset-detail-edit-field-${name}`}>{label}</Label>
			<AssetFieldValueInput
				field={{ key: name, label, source: "metadata", type: type as AssetFieldDefinition["type"] }}
				defaultValue={defaultValue ?? ""}
				value={value}
				onChange={onChange}
				placeholder={placeholder}
				candidates={candidates}
			/>
		</div>
	)
}

export function AssetProfileEditField({
	field,
	asset,
	locationOptions,
	nextAssetTagPreview,
	candidates = {},
}: {
	field: AssetFieldDefinition
	asset: AssetRecord
	locationOptions: string[]
	nextAssetTagPreview: string
	candidates?: AssetFieldCandidates
}) {
	const metadata = asset.metadata ?? {}
	const defaultValue = getAssetProfileEditFieldDefaultValue(asset, field)
	const className = field.span === "full" || field.key === "notes" ? "sm:col-span-2 xl:col-span-3" : undefined
	const fieldCandidates = candidates[field.key]

	if (field.key === "notes") {
		return <TextAreaField name="notes" label={field.label} defaultValue={asset.notes} className={className} />
	}
	if (field.key === "location") {
		return (
			<div className={cn("grid gap-2", className)}>
				<Label>{field.label}</Label>
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
				required={false}
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
				required={false}
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
			<Label htmlFor={`asset-detail-edit-field-${field.key}`}>{field.label}</Label>
			<AssetFieldValueInput field={field} defaultValue={defaultValue} candidates={fieldCandidates} />
		</div>
	)
}

function AssetFieldValueInput({
	field,
	defaultValue,
	value: controlledValue,
	onChange,
	candidates,
	placeholder,
}: {
	field: AssetFieldDefinition
	defaultValue: string
	value?: string
	onChange?: (value: string) => void
	candidates?: AssetEnrichmentCandidate[]
	placeholder?: string
}) {
	const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue)
	const [mode, setMode] = useState<"custom" | "candidate">("custom")
	const value = controlledValue ?? uncontrolledValue
	useEffect(() => {
		setUncontrolledValue(defaultValue)
		setMode("custom")
	}, [defaultValue])
	const options = candidates ?? []
	const selectValue = mode === "custom" ? "__custom__" : value
	const showCandidatePicker = options.length > 0 && shouldShowAssetCandidatePicker(field)
	const input = (
		<Input
			id={`asset-detail-edit-field-${field.key}`}
			name={field.key}
			type={field.type === "number" || field.type === "date" || field.type === "url" ? field.type : "text"}
			min={field.type === "number" && ["down_mbps", "up_mbps"].includes(field.key) ? "1" : undefined}
			value={value}
			placeholder={placeholder ?? field.placeholder}
			pattern={field.pattern}
			title={field.title}
			readOnly={field.readOnly || (showCandidatePicker && mode !== "custom")}
			onChange={(event) => {
				setUncontrolledValue(event.target.value)
				onChange?.(event.target.value)
			}}
			className={
				showCandidatePicker
					? "min-w-0 rounded-md border-0 bg-transparent pe-8 shadow-none focus-visible:ring-0"
					: undefined
			}
		/>
	)

	if (!showCandidatePicker) return input

	return (
		<div className="relative min-w-0 rounded-md border border-input bg-card focus-within:border-ring/70 focus-within:ring-2 focus-within:ring-ring/15">
			{input}
			<Select
				value={selectValue}
				onValueChange={(nextValue) => {
					if (nextValue === "__custom__") {
						setMode("custom")
						return
					}
					setUncontrolledValue(nextValue)
					onChange?.(nextValue)
					setMode("candidate")
				}}
			>
				<SelectTrigger
					aria-label={`${field.label}数据来源`}
					className="absolute inset-y-0 end-0 h-auto w-8 rounded-none border-0 bg-transparent px-0 shadow-none focus:border-0 focus:ring-0 [&>svg]:size-3.5"
				/>
				<SelectContent align="end" className="w-72">
					<SelectGroup>
						{options.length === 0 ? (
							<SelectItem value="__empty__" disabled>
								无采集候选
							</SelectItem>
						) : (
							options.map((candidate) => (
								<SelectItem key={candidate.value} value={candidate.value} className="min-h-12">
									<div className="grid min-w-0 gap-0.5">
										<span className="truncate">{candidate.value}</span>
										<span className="text-xs font-normal text-muted-foreground">
											{formatCandidateSource(candidate.sources)}
										</span>
									</div>
								</SelectItem>
							))
						)}
						<SelectItem value="__custom__">自定义</SelectItem>
					</SelectGroup>
				</SelectContent>
			</Select>
		</div>
	)
}

function shouldShowAssetCandidatePicker(field: AssetFieldDefinition) {
	if (field.key === "name") return false
	if (field.capture === "manual") return false
	return !new Set([
		"fixed_ipv4",
		"fixed_ipv6",
		"management_ip",
		"public_ipv4",
		"public_ipv6",
		"purchase_date",
		"purchase_price_cny",
		"renewal_date",
		"recurring_price_cny",
	]).has(field.key)
}

function formatCandidateSource(sources: AssetEnrichmentCandidate["sources"]) {
	if (sources.length > 1) return "本地 + 联网"
	return sources[0] === "online" ? "联网资料" : "本地采集"
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
		case "memory_detail":
			return normalizeMemorySpecification(getMetadataString(asset.metadata, field.key))
		case "nic_detail":
			return normalizeNetworkInterfaceSummary(getMetadataString(asset.metadata, field.key))
		default:
			return getMetadataString(asset.metadata, field.key)
	}
}
