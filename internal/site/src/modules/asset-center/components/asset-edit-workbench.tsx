import { useEffect, useMemo, useState, type FormEvent } from "react"
import { ListChecksIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import type {
	AITaskRecord,
	AssetAttachmentRecord,
	AssetEnrichmentSuggestionRecord,
	AssetInterfaceRecord,
	AssetLocationRecord,
	AssetMaintenanceRecord,
	AssetRecord,
	AssetRelationRecord,
	AssetVisualRecord,
} from "@/types"
import { AssetEditActionBar } from "./asset-edit-action-bar"
import { AssetCandidateTextField, AssetProfileEditField } from "./asset-edit-profile-fields"
import { SelectField } from "./asset-detail-form-fields"
import { AssetEditVisualPanel } from "./asset-edit-visual-panel"
import { AssetInterfaceManager } from "./asset-interface-manager"
import {
	InternetAddressAutoRefreshControls,
	type InternetAddressAutoRefreshSettings,
} from "./internet-address-auto-refresh-controls"
import {
	AssetLocationInput,
	AssetTagInput,
	OfficialColorField,
	PHONE_MEMORY_OPTIONS,
	PHONE_STORAGE_OPTIONS,
	PhoneVariantSpecField,
} from "./asset-form-fields"
import {
	buildAssetProfileEditSections,
	getAssetConnectionFieldKeys,
	getRequiredAssetProfileFieldKeys,
} from "../asset-edit-profile-sections"
import { formatAssetVisualTaskMeta } from "../asset-ai-task-summary"
import { buildAssetEnrichmentCandidateMap } from "../asset-enrichment-candidates"
import {
	buildAssetTagCandidates,
	buildNextAssetTag,
	loadAssetNumberingSettings,
	normalizeAssetNumberingSettings,
} from "../asset-numbering"
import { buildAssetLocationOptions } from "../asset-list"
import { isAssetLocationNotApplicable } from "../asset-location"
import { getEditableAssetTypeOptions } from "../asset-profiles"
import { getAssetTypeCapabilities, getAssetTypeSpec, internetAssetTypeSpec } from "../asset-type-specs"
import {
	formatInternetAddressTimestamp,
	getInternetAddressAutoRefreshSettings,
	getInternetAddressDisplayState,
} from "../asset-internet-address-status"
import {
	HOST_ASSET_TYPES,
	getAssetFormSections,
	getMetadataNumber,
	getMetadataString,
	isPhoneVariantSpecRequired,
} from "../asset-schema"
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
	defaultMediaPreview?: { url: string; alt: string }
	readOnly: boolean
	saving: boolean
	visualGenerationStage: "idle" | "running" | "ready" | "failed"
	visualGenerationMessage: string
	internetAddressRefreshing: boolean
	latestSuggestions: AssetEnrichmentSuggestionRecord[]
	onSaveProfile: (event: FormEvent<HTMLFormElement>) => void
	onRunSmartRecognition: () => void
	onRefreshInternetAddresses: () => void
	onAddInterface: () => void
	onEditInterface: (record: AssetInterfaceRecord) => void
	onDeleteInterface: (record: AssetInterfaceRecord) => void
	onGenerateVisual: () => void
	onImportVisualCandidate: (visualId: string, frameIndex: number) => Promise<string>
}

export function AssetEditWorkbench({
	asset,
	state,
	defaultMediaPreview,
	readOnly,
	saving,
	visualGenerationStage,
	visualGenerationMessage,
	internetAddressRefreshing,
	latestSuggestions,
	onSaveProfile,
	onRunSmartRecognition,
	onRefreshInternetAddresses,
	onAddInterface,
	onEditInterface,
	onDeleteInterface,
	onGenerateVisual,
	onImportVisualCandidate,
}: AssetEditWorkbenchProps) {
	const metadata = asset.metadata ?? {}
	const [selectedType, setSelectedType] = useState<AssetRecord["type"]>(asset.type)
	const [nameValue, setNameValue] = useState(asset.name || "")
	const [statusValue, setStatusValue] = useState(asset.status || "active")
	const [locationValue, setLocationValue] = useState(asset.location || "")
	const [assetTagValue, setAssetTagValue] = useState(getMetadataString(metadata, "asset_tag"))
	const [internetAddressSettingsDraft, setInternetAddressSettingsDraft] = useState<InternetAddressAutoRefreshSettings>(
		() => getInternetAddressAutoRefreshSettings(metadata)
	)
	const [fixedIpv4Value, setFixedIpv4Value] = useState(
		getMetadataString(metadata, "fixed_ipv4") || asset.management_ip || ""
	)
	const officialColorOptions = useMemo(
		() => getAssetOfficialColorOptions(asset, state.officialColorSuggestions),
		[asset, state.officialColorSuggestions]
	)
	const visualBlockReason = getAssetVisualGenerationBlockReason(asset)
	useEffect(() => {
		setSelectedType(asset.type)
		setNameValue(asset.name || "")
		setStatusValue(asset.status || "active")
		setLocationValue(asset.location || "")
		setAssetTagValue(getMetadataString(asset.metadata, "asset_tag"))
		setFixedIpv4Value(getMetadataString(asset.metadata, "fixed_ipv4") || asset.management_ip || "")
		setInternetAddressSettingsDraft(getInternetAddressAutoRefreshSettings(asset.metadata ?? {}))
	}, [asset.id, asset.location, asset.metadata, asset.name, asset.status, asset.type])
	const locationOptions = useMemo(
		() => buildAssetLocationOptions(state.assets, state.locations, { includePresets: true }).values,
		[state.assets, state.locations]
	)
	const assetTagCandidates = useMemo(
		() => buildAssetTagCandidates(state.assets, normalizeAssetNumberingSettings(loadAssetNumberingSettings())),
		[state.assets]
	)
	const nextAssetTagPreview =
		assetTagCandidates[0] ??
		buildNextAssetTag(state.assets, normalizeAssetNumberingSettings(loadAssetNumberingSettings()))
	const isInternetService = selectedType === "web_endpoint"
	const isInternetResource = selectedType === "internet"
	const isOnt = selectedType === "ont"
	const locationNotApplicable = isAssetLocationNotApplicable(selectedType)
	const capabilities = getAssetTypeCapabilities(selectedType)
	const formSections = buildAssetProfileEditSections(selectedType, getRequiredAssetProfileFieldKeys(selectedType))
	const enrichmentCandidates = useMemo(() => buildAssetEnrichmentCandidateMap(latestSuggestions), [latestSuggestions])
	const universalArchiveFields = useMemo(
		() =>
			new Map(
				getAssetFormSections(selectedType)
					.flatMap((section) => section.fields)
					.map((field) => [field.key, field])
			),
		[selectedType]
	)
	const editableTypeOptions = getEditableAssetTypeOptions(selectedType)
	const statusField = universalArchiveFields.get("status")
	const selectedTypeSpec = getAssetTypeSpec(selectedType)
	const statusOptions = selectedTypeSpec ? [...selectedTypeSpec.statusOptions] : (statusField?.options ?? [])
	const connectionFieldKeys = getAssetConnectionFieldKeys(selectedType)
	const renderUniversalArchiveField = (key: string) => {
		const field = universalArchiveFields.get(key)
		return field ? (
			<AssetProfileEditField
				key={`universal-archive-${key}`}
				field={field}
				asset={asset}
				locationOptions={locationOptions}
				nextAssetTagPreview={nextAssetTagPreview}
				candidates={enrichmentCandidates}
			/>
		) : null
	}

	return (
		<DialogContent className="grid h-[min(92dvh,62rem)] w-[calc(100vw-2rem)] max-w-[96rem] grid-rows-[minmax(0,1fr)] gap-0 overflow-hidden p-0 lg:top-[46%]">
			<DialogHeader className="sr-only">
				<DialogTitle>编辑资产</DialogTitle>
				<DialogDescription>主档、类型专属参数、智能匹配和候选图片在同一工作台维护。</DialogDescription>
			</DialogHeader>
			<form
				onSubmit={onSaveProfile}
				className="-mt-3 grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-y-auto lg:overflow-hidden"
			>
				<input
					type="hidden"
					name="public_ip_auto_refresh"
					value={internetAddressSettingsDraft.enabled ? "yes" : "no"}
				/>
				<input
					type="hidden"
					name="public_ip_refresh_interval_minutes"
					value={internetAddressSettingsDraft.intervalMinutes}
				/>
				<AssetEditActionBar
					readOnly={readOnly}
					saving={saving}
					assetTagControl={
						<AssetTagInput
							id="asset-detail-edit-asset-tag"
							name="asset_tag"
							value={assetTagValue}
							onChange={setAssetTagValue}
							assetTagCandidates={assetTagCandidates}
						/>
					}
					archiveCounts={
						<>
							{capabilities.showInterfaces ? (
								<AssetEditHeaderCount label="接口" value={state.interfaces.length} />
							) : null}
							<AssetEditHeaderCount label="关系" value={state.relations.length} />
							<AssetEditHeaderCount label="维护" value={state.maintenance.length} />
							<AssetEditHeaderCount label="附件" value={state.attachments.length} />
						</>
					}
				/>
				<div className="grid min-h-0 lg:grid-cols-[minmax(0,1.15fr)_minmax(28rem,0.85fr)]">
					<div className="grid content-start gap-2 p-2 sm:p-3 lg:min-h-0 lg:overflow-y-auto lg:pe-3 [&_input]:h-8 [&_input]:px-2 [&_select]:h-8 [&_select]:px-2">
						<section className="rounded-md border border-border/70 bg-card p-2">
							<div className="mb-1 flex items-center justify-between gap-2">
								<div className="min-w-0">
									<div className="text-sm font-semibold text-foreground">
										{isInternetResource ? "基础资料" : "通用档案"}
									</div>
									{!isInternetResource ? (
										<div className="mt-0.5 text-xs text-muted-foreground">
											身份、状态、位置和用途；网络接入信息在下方维护。
										</div>
									) : null}
								</div>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={onRunSmartRecognition}
									disabled={readOnly || saving}
									className="shrink-0 gap-2"
								>
									<ListChecksIcon className="size-3.5" />
									智能匹配
								</Button>
							</div>
							<div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
								<AssetCandidateTextField name="name" label="资产名称" value={nameValue} onChange={setNameValue} />
								{isInternetResource ? (
									<input type="hidden" name="type" value={selectedType} />
								) : (
									<SelectField
										name="type"
										label="所属类型"
										options={editableTypeOptions.map((item) => ({ value: item.type, label: item.label }))}
										value={selectedType}
										onChange={(value) => setSelectedType(value as AssetRecord["type"])}
									/>
								)}
								{isInternetResource && (
									<SelectField
										name="vendor"
										label="运营商"
										options={[...internetAssetTypeSpec.providerOptions]}
										defaultValue={asset.vendor}
									/>
								)}
								{!isInternetService && !isInternetResource && (
									<>
										<AssetCandidateTextField
											name="vendor"
											label="厂商 / 品牌"
											defaultValue={asset.vendor}
											candidates={enrichmentCandidates.vendor}
										/>
										<AssetCandidateTextField
											name="model"
											label="型号 / 规格"
											defaultValue={asset.model}
											candidates={enrichmentCandidates.model}
										/>
										{renderUniversalArchiveField("serial_number")}
										{selectedType === "phone" && (
											<AssetCandidateTextField
												name="internal_model"
												label="内部型号 / 搜索代码"
												defaultValue={getMetadataString(metadata, "internal_model")}
												candidates={enrichmentCandidates.internal_model}
											/>
										)}
										{!HOST_ASSET_TYPES.includes(selectedType) && (
											<OfficialColorField
												name="color"
												label="外观颜色"
												defaultValue={getAssetVisualColor(asset)}
												options={officialColorOptions}
												requireOfficial={isOfficialColorRequiredForAssetType(selectedType)}
											/>
										)}
									</>
								)}
								{!isInternetService && (
									<>
										{(statusField || isInternetResource) && (
											<SelectField
												name="status"
												label={statusField?.label ?? "使用状态"}
												options={statusOptions}
												value={statusValue}
												onChange={(value) => setStatusValue(value as NonNullable<AssetRecord["status"]>)}
											/>
										)}
									{isOnt ? (
										<>
											{renderUniversalArchiveField("carrier")}
											{renderUniversalArchiveField("operating_role")}
										</>
									) : null}
									{capabilities.showRole && !isOnt ? renderUniversalArchiveField("role") : null}
										{capabilities.showHardware ? renderUniversalArchiveField("official_url") : null}
									</>
								)}
								{isPhoneVariantSpecRequired(selectedType) && (
									<>
										<PhoneVariantSpecField
											name="memory_gb"
											label="运行内存 GB"
											defaultValue={String(getMetadataNumber(metadata, "memory_gb") ?? "")}
											options={PHONE_MEMORY_OPTIONS}
											customPlaceholder="例如 10"
										/>
										<PhoneVariantSpecField
											name="storage_gb"
											label="存储容量 GB"
											defaultValue={String(getMetadataNumber(metadata, "storage_gb") ?? "")}
											options={PHONE_STORAGE_OPTIONS}
											customPlaceholder="例如 384"
										/>
									</>
								)}
								{capabilities.showLocation ? (
									<div className="grid gap-2">
										<Label>位置</Label>
										<AssetLocationInput
											idPrefix="asset-detail-edit-location"
											value={locationValue}
											locationOptions={locationOptions}
											onChange={setLocationValue}
											allowNone={locationNotApplicable}
										/>
										<input type="hidden" name="location" value={locationValue} />
									</div>
								) : null}
							</div>
						</section>

						{connectionFieldKeys.length > 0 && (
							<section className="rounded-md border border-border/70 bg-card p-2">
								<div className="mb-1">
									<div className="text-sm font-semibold text-foreground">接入信息</div>
									<div className="mt-0.5 text-xs text-muted-foreground">网络身份与本机管理入口。</div>
								</div>
								<div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
									<div className="grid gap-2">
										<Label htmlFor="fixed_ipv4">IPv4</Label>
										<Input
											id="fixed_ipv4"
											name="fixed_ipv4"
											value={fixedIpv4Value}
											placeholder="192.168.1.90"
											onChange={(event) => setFixedIpv4Value(event.target.value)}
										/>
									</div>
									{connectionFieldKeys
										.filter((key) => key !== "fixed_ipv4")
										.map((key) => renderUniversalArchiveField(key))}
								</div>
								{!isInternetService && <input type="hidden" name="management_ip" value={fixedIpv4Value} />}
								{!isInternetService && !isInternetResource ? (
									<div className="mt-3">
										<AssetInterfaceManager
											interfaces={state.interfaces}
											readOnly={readOnly}
											compact
											onAdd={onAddInterface}
											onEdit={onEditInterface}
											onDelete={onDeleteInterface}
										/>
									</div>
								) : null}
							</section>
						)}

						{formSections.map((section) => (
							<section key={section.title} className="rounded-md border border-border/70 bg-card p-2">
								<div className="mb-1 flex flex-wrap items-center justify-between gap-2">
									<div className="text-sm font-semibold text-foreground">{section.title}</div>
									{section.title === "动态公网地址" ? (
										<InternetAddressAutoRefreshControls
											settings={internetAddressSettingsDraft}
											disabled={readOnly || saving || internetAddressRefreshing}
											refreshing={internetAddressRefreshing}
											onChange={setInternetAddressSettingsDraft}
											onRefresh={onRefreshInternetAddresses}
										/>
									) : null}
								</div>
								{section.title === "动态公网地址" ? <InternetAddressStatusPanel metadata={metadata} /> : null}
								<div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
									{section.fields.map((field) => (
										<AssetProfileEditField
											key={`${section.title}-${field.key}`}
											field={field}
											asset={asset}
											locationOptions={locationOptions}
											nextAssetTagPreview={nextAssetTagPreview}
											candidates={enrichmentCandidates}
										/>
									))}
									{section.title === "外观尺寸" && HOST_ASSET_TYPES.includes(selectedType) && (
										<OfficialColorField
											name="color"
											label="外观颜色"
											defaultValue={getAssetVisualColor(asset)}
											options={officialColorOptions}
											requireOfficial={isOfficialColorRequiredForAssetType(selectedType)}
										/>
									)}
								</div>
							</section>
						))}
					</div>

					<aside className="grid content-start gap-3 border-t border-border/70 bg-surface-soft p-3 sm:p-4 lg:min-h-0 lg:overflow-y-auto lg:border-s lg:border-t-0">
						<AssetEditVisualPanel
							assetId={asset.id}
							assetType={selectedType}
							visuals={state.visuals}
							defaultMediaPreview={defaultMediaPreview}
							visualBlockReason={visualBlockReason}
							visualGenerationStage={visualGenerationStage}
							visualGenerationMessage={visualGenerationMessage}
							taskSummary={getAssetVisualTaskMeta(state.aiTasks, state.visuals)}
							readOnly={readOnly}
							saving={saving}
							onGenerateVisual={onGenerateVisual}
							onImportVisualCandidate={onImportVisualCandidate}
						/>
					</aside>
				</div>
			</form>
		</DialogContent>
	)
}

function InternetAddressStatusPanel({ metadata }: { metadata: Record<string, unknown> }) {
	const states = (["ipv4", "ipv6"] as const).map((protocol) => ({
		protocol,
		state: getInternetAddressDisplayState(metadata, protocol),
	}))
	const checkedAt = states[0].state.checkedAt
	const nextCheckAt = states[0].state.nextCheckAt
	return (
		<div className="mb-2 grid gap-2 rounded-md border border-border/70 bg-surface-soft px-3 py-2">
			<div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
				<span>上次更新：{formatInternetAddressTimestamp(checkedAt)}</span>
				<span>下次更新：{nextCheckAt ? formatInternetAddressTimestamp(nextCheckAt) : "自动更新已关闭"}</span>
			</div>
			{states.some(({ state }) => state.error) ? (
				<div className="grid gap-1 text-[11px] text-destructive">
					{states.map(({ protocol, state }) =>
						state.error ? (
							<span key={protocol}>
								{protocol.toUpperCase()}：{state.error}
							</span>
						) : null
					)}
				</div>
			) : null}
		</div>
	)
}

function AssetEditHeaderCount({ label, value }: { label: string; value: number }) {
	return (
		<span className="rounded border border-border/70 bg-surface-soft px-1.5 py-1">
			<b className="me-1 font-mono text-foreground">{value}</b>
			{label}
		</span>
	)
}

function getAssetVisualTaskMeta(tasks: AITaskRecord[], visuals: AssetVisualRecord[]) {
	const latestTask = tasks.find((task) => task.kind === "asset_visual")
	if (latestTask) {
		return formatAssetVisualTaskMeta(latestTask)
	}
	return visuals.length ? `${visuals.length} 组图片` : "未收集"
}
