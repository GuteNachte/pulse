import { useEffect, useMemo, useState, type FormEvent } from "react"
import { Input } from "@/components/ui/input"
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import type {
	AITaskRecord,
	AssetAttachmentRecord,
	AssetEnrichmentReportRecord,
	AssetEnrichmentSuggestionRecord,
	AssetInterfaceRecord,
	AssetLocationRecord,
	AssetMaintenanceRecord,
	AssetRecord,
	AssetRelationRecord,
	AssetVisualRecord,
} from "@/types"
import { AssetEditActionBar } from "./asset-edit-action-bar"
import { AssetProfileEditField } from "./asset-edit-profile-fields"
import { SelectField, TextField } from "./asset-detail-form-fields"
import { AssetEditVisualPanel } from "./asset-edit-visual-panel"
import { AssetSuggestionWorkbench } from "./asset-suggestion-workbench"
import {
	AssetLocationInput,
	AssetTagInput,
	OfficialColorField,
	PHONE_MEMORY_OPTIONS,
	PHONE_STORAGE_OPTIONS,
	PhoneVariantSpecField,
} from "./asset-form-fields"
import { buildAssetProfileEditSections, getRequiredAssetProfileFieldKeys } from "../asset-edit-profile-sections"
import { formatAssetVisualTaskMeta } from "../asset-ai-task-summary"
import { buildNextAssetTag, loadAssetNumberingSettings, normalizeAssetNumberingSettings } from "../asset-numbering"
import { buildAssetLocationOptions } from "../asset-list"
import { getEditableAssetTypeOptions } from "../asset-profiles"
import { getMetadataNumber, getMetadataString, isPhoneVariantSpecRequired } from "../asset-schema"
import type { AssetRecognitionRequirement } from "../asset-profile-validation"
import {
	getAssetOfficialColorOptions,
	getAssetVisualColor,
	getAssetVisualGenerationBlockReason,
	isOfficialColorRequiredForAssetType,
} from "../asset-visual-color"

type AssetEditWorkbenchState = {
	assets: AssetRecord[]
	interfaces: AssetInterfaceRecord[]
	relations: AssetRelationRecord[]
	locations: AssetLocationRecord[]
	maintenance: AssetMaintenanceRecord[]
	attachments: AssetAttachmentRecord[]
	visuals: AssetVisualRecord[]
	aiTasks: AITaskRecord[]
	officialColorSuggestions: AssetEnrichmentSuggestionRecord[]
}

type AssetEditWorkbenchProps = {
	asset: AssetRecord
	state: AssetEditWorkbenchState
	readOnly: boolean
	saving: boolean
	recognitionStage: "idle" | "blocked" | "running" | "ready" | "failed"
	recognitionMessage: string
	visualGenerationStage: "idle" | "running" | "ready" | "failed"
	visualGenerationMessage: string
	recognitionRequirements: AssetRecognitionRequirement[]
	latestReport?: AssetEnrichmentReportRecord
	latestSuggestions: AssetEnrichmentSuggestionRecord[]
	actionableSuggestions: AssetEnrichmentSuggestionRecord[]
	visualColor: string
	onVisualColorChange: (value: string) => void
	onSaveProfile: (event: FormEvent<HTMLFormElement>) => void
	onRunSmartRecognition: () => void
	onAcceptSuggestion: (suggestion: AssetEnrichmentSuggestionRecord) => void
	onAcceptAllSuggestions: () => void
	onGenerateVisual: () => void
	onSelectVisualCandidate: (visualId: string, frameIndex: number) => void
	onOpenInterface: () => void
	onOpenRelation: () => void
	onOpenMaintenance: () => void
	onOpenAttachment: () => void
	onDelete: () => void
}

export function AssetEditWorkbench({
	asset,
	state,
	readOnly,
	saving,
	recognitionStage,
	recognitionMessage,
	visualGenerationStage,
	visualGenerationMessage,
	recognitionRequirements,
	latestReport,
	latestSuggestions,
	actionableSuggestions,
	visualColor,
	onVisualColorChange,
	onSaveProfile,
	onRunSmartRecognition,
	onAcceptSuggestion,
	onAcceptAllSuggestions,
	onGenerateVisual,
	onSelectVisualCandidate,
	onOpenInterface,
	onOpenRelation,
	onOpenMaintenance,
	onOpenAttachment,
	onDelete,
}: AssetEditWorkbenchProps) {
	const metadata = asset.metadata ?? {}
	const [selectedType, setSelectedType] = useState<AssetRecord["type"]>(asset.type)
	const [locationValue, setLocationValue] = useState(asset.location || "")
	const [assetTagValue, setAssetTagValue] = useState(getMetadataString(metadata, "asset_tag"))
	const [fixedIpv4Value, setFixedIpv4Value] = useState(
		getMetadataString(metadata, "fixed_ipv4") || asset.management_ip || ""
	)
	const officialColorOptions = useMemo(
		() => getAssetOfficialColorOptions(asset, state.officialColorSuggestions),
		[asset, state.officialColorSuggestions]
	)
	const visualBlockReason = getAssetVisualGenerationBlockReason(asset, visualColor, officialColorOptions)
	const visualGenerationRunning = visualGenerationStage === "running"
	useEffect(() => {
		setSelectedType(asset.type)
		setLocationValue(asset.location || "")
		setAssetTagValue(getMetadataString(asset.metadata, "asset_tag"))
		setFixedIpv4Value(getMetadataString(asset.metadata, "fixed_ipv4") || asset.management_ip || "")
	}, [asset.id, asset.location, asset.metadata, asset.type])
	const locationOptions = useMemo(
		() => buildAssetLocationOptions(state.assets, state.locations, { includePresets: true }).values,
		[state.assets, state.locations]
	)
	const nextAssetTagPreview = useMemo(
		() => buildNextAssetTag(state.assets, normalizeAssetNumberingSettings(loadAssetNumberingSettings())),
		[state.assets]
	)
	const missingRequirements = recognitionRequirements.filter((item) => !item.ok)
	const requiredFieldKeys = getRequiredAssetProfileFieldKeys(selectedType)
	const formSections = buildAssetProfileEditSections(selectedType, requiredFieldKeys)
	const editableTypeOptions = getEditableAssetTypeOptions(selectedType)

	return (
		<DialogContent className="flex max-h-[92vh] max-w-6xl flex-col overflow-hidden">
			<DialogHeader className="shrink-0">
				<DialogTitle>编辑资产</DialogTitle>
				<DialogDescription>
					主档、智能匹配、参数替换、设备图片收集和资产子档案都在这里处理；外层详情页只负责查看。
				</DialogDescription>
			</DialogHeader>
			<form onSubmit={onSaveProfile} className="min-h-0 overflow-y-auto pr-1">
				<AssetEditActionBar
					readOnly={readOnly}
					saving={saving}
					visualBlockReason={visualBlockReason}
					visualGenerationRunning={visualGenerationRunning}
					actionableSuggestions={actionableSuggestions}
					onRunSmartRecognition={onRunSmartRecognition}
					onAcceptSuggestion={onAcceptSuggestion}
					onAcceptAllSuggestions={onAcceptAllSuggestions}
					onGenerateVisual={onGenerateVisual}
					onOpenInterface={onOpenInterface}
					onOpenRelation={onOpenRelation}
					onOpenMaintenance={onOpenMaintenance}
					onOpenAttachment={onOpenAttachment}
					onDelete={onDelete}
				/>
				<div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
					<div className="grid gap-3">
						<section className="rounded-lg border border-border/70 bg-surface-soft p-3">
							<div className="mb-3 flex items-center justify-between gap-3">
								<div className="min-w-0">
									<div className="text-sm font-semibold text-foreground">必填参数</div>
									<div className="mt-1 text-xs text-muted-foreground">识别、找图和本地采集都会优先读取这些参数。</div>
								</div>
							</div>
							<div className="grid gap-3 sm:grid-cols-2">
								<TextField name="name" label="资产名称" required defaultValue={asset.name} />
								<SelectField
									name="type"
									label="所属类型"
									options={editableTypeOptions.map((item) => ({ value: item.type, label: item.label }))}
									value={selectedType}
									onChange={(value) => setSelectedType(value as AssetRecord["type"])}
								/>
								<TextField name="vendor" label="厂商 / 品牌" required defaultValue={asset.vendor} />
								<TextField name="model" label="型号 / 规格" required defaultValue={asset.model} />
								<TextField
									name="internal_model"
									label="内部型号 / 搜索代码"
									required
									defaultValue={getMetadataString(metadata, "internal_model")}
								/>
								<OfficialColorField
									name="color"
									label="外观颜色"
									defaultValue={getAssetVisualColor(asset)}
									options={officialColorOptions}
									requireOfficial={isOfficialColorRequiredForAssetType(selectedType)}
								/>
								{isPhoneVariantSpecRequired(selectedType) && (
									<>
										<PhoneVariantSpecField
											name="memory_gb"
											label="运行内存 GB"
											required
											defaultValue={String(getMetadataNumber(metadata, "memory_gb") ?? "")}
											options={PHONE_MEMORY_OPTIONS}
											customPlaceholder="例如 10"
										/>
										<PhoneVariantSpecField
											name="storage_gb"
											label="存储容量 GB"
											required
											defaultValue={String(getMetadataNumber(metadata, "storage_gb") ?? "")}
											options={PHONE_STORAGE_OPTIONS}
											customPlaceholder="例如 384"
										/>
									</>
								)}
								<div className="grid gap-2">
									<Label htmlFor="asset-detail-edit-asset-tag">
										资产编号<span className="ms-1 text-destructive">*</span>
									</Label>
									<AssetTagInput
										id="asset-detail-edit-asset-tag"
										name="asset_tag"
										value={assetTagValue}
										onChange={setAssetTagValue}
										nextAssetTagPreview={nextAssetTagPreview}
										required
									/>
								</div>
								<div className="grid gap-2">
									<Label>
										位置<span className="ms-1 text-destructive">*</span>
									</Label>
									<AssetLocationInput
										idPrefix="asset-detail-edit-location"
										value={locationValue}
										locationOptions={locationOptions}
										onChange={setLocationValue}
									/>
									<input type="hidden" name="location" value={locationValue} />
								</div>
								<input type="hidden" name="management_ip" value={fixedIpv4Value} />
								<div className="grid gap-2">
									<Label htmlFor="fixed_ipv4">
										IPv4<span className="ms-1 text-destructive">*</span>
									</Label>
									<Input
										id="fixed_ipv4"
										name="fixed_ipv4"
										required
										value={fixedIpv4Value}
										placeholder="192.168.1.90"
										onChange={(event) => setFixedIpv4Value(event.target.value)}
									/>
								</div>
							</div>
						</section>

						{formSections.map((section) => (
							<section key={section.title} className="rounded-lg border border-border/70 bg-surface-soft p-3">
								<div className="mb-3 text-sm font-semibold text-foreground">{section.title}</div>
								<div className="grid gap-3 sm:grid-cols-2">
									{section.fields.map((field) => (
										<AssetProfileEditField
											key={`${section.title}-${field.key}`}
											field={field}
											asset={asset}
											locationOptions={locationOptions}
											nextAssetTagPreview={nextAssetTagPreview}
										/>
									))}
								</div>
							</section>
						))}

						<section className="rounded-lg border border-border/70 bg-surface-soft p-3">
							<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
								<div className="min-w-0">
									<div className="text-sm font-semibold text-foreground">智能匹配</div>
									<div className="mt-1 text-xs text-muted-foreground">缺少必填参数时不会启动 Agent。</div>
								</div>
							</div>
							<div className="grid gap-3">
								<div className="grid gap-2 sm:grid-cols-2">
									{recognitionRequirements.map((item) => (
										<div
											key={item.label}
											className={cn(
												"flex min-w-0 items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-xs",
												item.ok ? "border-emerald-500/20 bg-card" : "border-amber-500/25 bg-amber-500/5"
											)}
										>
											<span className="text-muted-foreground">{item.label}</span>
											<span className="truncate font-medium text-foreground">{item.value || "未填写"}</span>
										</div>
									))}
								</div>
								{recognitionMessage && (
									<div
										className={cn(
											"rounded-md border px-3 py-2 text-xs leading-5",
											recognitionStage === "blocked" || recognitionStage === "failed"
												? "border-amber-500/25 bg-amber-500/5 text-amber-700 dark:text-amber-200"
												: "border-border/70 bg-card text-muted-foreground"
										)}
									>
										{saving && recognitionStage === "running" ? "处理中： " : ""}
										{recognitionMessage}
									</div>
								)}
								{missingRequirements.length > 0 && recognitionStage !== "blocked" && (
									<div className="rounded-md border border-dashed border-border/70 bg-card px-3 py-2 text-xs text-muted-foreground">
										待补齐：{missingRequirements.map((item) => item.label).join("、")}
									</div>
								)}
								<AssetSuggestionWorkbench
									latestReport={latestReport}
									suggestions={latestSuggestions}
									actionableSuggestions={actionableSuggestions}
									readOnly={readOnly}
									saving={saving}
								/>
							</div>
						</section>
					</div>

					<div className="grid content-start gap-3">
						<AssetEditVisualPanel
							assetType={asset.type}
							visuals={state.visuals}
							visualColor={visualColor}
							officialColorOptions={officialColorOptions}
							visualBlockReason={visualBlockReason}
							visualGenerationStage={visualGenerationStage}
							visualGenerationMessage={visualGenerationMessage}
							taskSummary={getAssetVisualTaskMeta(state.aiTasks, state.visuals)}
							readOnly={readOnly}
							saving={saving}
							onVisualColorChange={onVisualColorChange}
							onSelectVisualCandidate={onSelectVisualCandidate}
						/>

						<section className="rounded-lg border border-border/70 bg-surface-soft p-3">
							<div className="mb-2 text-sm font-semibold text-foreground">子档案数量</div>
							<div className="grid grid-cols-4 gap-2 text-center text-xs">
								<AssetEditCount label="接口" value={state.interfaces.length} />
								<AssetEditCount label="关系" value={state.relations.length} />
								<AssetEditCount label="维护" value={state.maintenance.length} />
								<AssetEditCount label="附件" value={state.attachments.length} />
							</div>
						</section>
					</div>
				</div>
			</form>
		</DialogContent>
	)
}

function AssetEditCount({ label, value }: { label: string; value: number }) {
	return (
		<div className="rounded-md border border-border/70 bg-card px-2 py-2">
			<div className="font-mono text-sm font-semibold tabular-nums text-foreground">{value}</div>
			<div className="mt-0.5 text-muted-foreground">{label}</div>
		</div>
	)
}

function getAssetVisualTaskMeta(tasks: AITaskRecord[], visuals: AssetVisualRecord[]) {
	const latestTask = tasks.find((task) => task.kind === "asset_visual")
	if (latestTask) {
		return formatAssetVisualTaskMeta(latestTask)
	}
	return visuals.length ? `${visuals.length} 组图片` : "未收集"
}
