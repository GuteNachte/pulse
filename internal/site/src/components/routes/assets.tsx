import {
	ArchiveIcon,
	ArrowLeftIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	FileInputIcon,
	FileOutputIcon,
	PlusIcon,
	SlidersHorizontalIcon,
} from "lucide-react"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AssetPreviewPanel } from "@/modules/asset-center/components/asset-card"
import { AssetCenterSidebar } from "@/modules/asset-center/components/asset-center-sidebar"
import { AssetListRows, AssetListSkeleton } from "@/modules/asset-center/components/asset-list-rows"
import { AssetCustomParamsRows } from "@/modules/asset-center/components/asset-custom-params-rows"
import { AssetFormField, AssetFormSection, AssetInput } from "@/modules/asset-center/components/asset-form-fields"
import { AssetLocationSettingsDialog } from "@/modules/asset-center/components/asset-location-settings-dialog"
import { AssetImportDialog } from "@/modules/asset-center/components/asset-import-dialog"
import { AssetNumberingSettingsDialog } from "@/modules/asset-center/components/asset-numbering-settings-dialog"
import { AssetExportDialog } from "@/modules/asset-center/components/asset-export-dialog"
import { QuickAssetCreateFields } from "@/modules/asset-center/components/asset-quick-create-fields"
import { AssetTypePicker, AssetTypeRail } from "@/modules/asset-center/components/asset-type-picker"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { toast } from "@/components/ui/use-toast"
import { isAdmin, isReadOnlyUser, pb } from "@/lib/api"
import { pageTitle } from "@/lib/branding"
import { createLatestRequestGuard } from "@/lib/latest-request-guard"
import { formatPocketBaseError } from "@/lib/pocketbase-error"
import { cn } from "@/lib/utils"
import {
	buildAssetPayload,
	buildImportPreviewRow,
	metadataToStringMap,
	normalizeMetadata,
	parseAssetImportRows,
	withBatchImportDuplicateChecks,
	type AssetFormState,
	type AssetImportPreviewRow,
} from "@/modules/asset-center/asset-import"
import {
	buildSuggestedAssetName,
	emptyAssetForm,
	getAssetFormFieldValue,
	shouldReplaceAssetNameWithSuggestion,
} from "@/modules/asset-center/asset-form"
import {
	buildNextAssetTag,
	defaultAssetNumberingSettings,
	normalizeAssetNumberingSettings,
	type AssetNumberingSettings,
} from "@/modules/asset-center/asset-numbering"
import {
	loadDurableAssetNumberingSettings,
	saveDurableAssetNumberingSettings,
} from "@/modules/asset-center/asset-numbering-client"
import {
	buildArchivedLocationPayload,
	buildLocationPath,
	buildPresetLocationPayload,
	getLooseLocationGroups,
} from "@/modules/asset-center/asset-location"
import type { AssetLocationPresetSelection } from "@/modules/asset-center/asset-location-dialog"
import { buildAssetExportCsv, downloadTextFile, formatAssetExportTimestamp } from "@/modules/asset-center/asset-export"
import { downloadAssetMigrationPackage } from "@/modules/asset-center/asset-migration-client"
import type { AssetMigrationResult } from "@/modules/asset-center/asset-migration"
import { buildAssetImportCsvTemplate, buildAssetImportJsonExample } from "@/modules/asset-center/asset-import-templates"
import {
	buildAssetLocationOptions,
	buildAssetMonitorStateMap,
	buildMonitoredAssetIdsFromBindings,
	filterAssets,
	getAssetListCounts,
	sortAssetsByListOrder,
	type AssetMonitorFilter,
} from "@/modules/asset-center/asset-list"
import {
	ASSET_TYPE_OPTIONS,
	STATUS_OPTIONS,
	getAssetFormSections,
	isComputeDeviceType,
	getMetadataString,
	isPhoneVariantSpecRequired,
	type AssetBuildMode,
	type AssetFieldDefinition,
	type AssetFieldSection,
} from "@/modules/asset-center/asset-schema"
import {
	getAssetTypeOptionLabel,
	normalizeInternetProvider,
	validateInternetAssetValues,
	validateOntAssetValues,
} from "@/modules/asset-center/asset-type-specs"
import { syncPrimaryInterface } from "@/modules/asset-center/asset-interface-sync"
import { validateNewOntRequiredFields } from "@/modules/asset-center/asset-profile-validation"
import type { AssetLocationRecord, AssetMonitorBindingRecord, AssetRecord, AssetStatus, AssetType } from "@/types"

type AssetFormStep = "type" | "fetch" | "details"
type AssetFormMode = "quick" | "full"

const monitorFilterValues: AssetMonitorFilter[] = [
	"all",
	"monitored",
	"unmonitored",
	"monitorable",
	"healthy",
	"error",
	"pending",
	"paused",
	"unbound",
	"unsupported",
]
const assetTypeValues = ASSET_TYPE_OPTIONS.map((option) => option.value)
const assetStatusValues = STATUS_OPTIONS.map((option) => option.value)
export default memo(function AssetsPage() {
	const [assets, setAssets] = useState<AssetRecord[]>([])
	const [locations, setLocations] = useState<AssetLocationRecord[]>([])
	const [monitorBindings, setMonitorBindings] = useState<AssetMonitorBindingRecord[]>([])
	const [loading, setLoading] = useState(true)
	const [saving, setSaving] = useState(false)
	const [dialogOpen, setDialogOpen] = useState(false)
	const [locationDialogOpen, setLocationDialogOpen] = useState(false)
	const [numberingDialogOpen, setNumberingDialogOpen] = useState(false)
	const [importDialogOpen, setImportDialogOpen] = useState(false)
	const [exportDialogOpen, setExportDialogOpen] = useState(false)
	const [formStep, setFormStep] = useState<AssetFormStep>("type")
	// 2026-10-07 计算设备装机方式（品牌整机/自组装）：添加计算设备时必选，随 metadata.build_mode 写入
	const [buildModeDraft, setBuildModeDraft] = useState<AssetBuildMode | "">("")
	// 2026-10-04 自动获取链路状态（docs/asset-create-flow-redesign.md）：
	// 后端只搜不建库，勾选参数回填表单后随正常创建保存

	const [formMode, setFormMode] = useState<AssetFormMode>("quick")
	const [editing, setEditing] = useState<AssetRecord | null>(null)
	const [form, setForm] = useState<AssetFormState>(emptyAssetForm)
	const [numberingForm, setNumberingForm] = useState<AssetNumberingSettings>(defaultAssetNumberingSettings)
	const [importText, setImportText] = useState("")
	const [importPreviewRows, setImportPreviewRows] = useState<AssetImportPreviewRow[]>([])
	const [activeAssetId, setActiveAssetId] = useState("")
	const loadGuardRef = useRef(createLatestRequestGuard())
	const initialFilters = useMemo(getInitialAssetFiltersFromUrl, [])

	const [search, setSearch] = useState(initialFilters.search)
	const [typeFilter, setTypeFilter] = useState<AssetType | "all">(initialFilters.typeFilter)
	const [statusFilter, setStatusFilter] = useState<AssetStatus | "all">(initialFilters.statusFilter)
	const [locationFilter, setLocationFilter] = useState(initialFilters.locationFilter)
	const [monitorFilter, setMonitorFilter] = useState<AssetMonitorFilter>(initialFilters.monitorFilter)
	const [typeGroupFilter, setTypeGroupFilter] = useState("all")
	const [filterDialogOpen, setFilterDialogOpen] = useState(false)
	const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
	const readOnly = isReadOnlyUser()
	const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets])

	useEffect(() => {
		if (loading) return
		const params = new URLSearchParams(window.location.search)
		const editAssetId = params.get("edit")
		if (!editAssetId) return
		const target = assetsById.get(editAssetId)
		params.delete("edit")
		const nextSearch = params.toString()
		window.history.replaceState(null, "", `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`)
		if (!target) {
			toast({ title: "未找到要编辑的资产", description: "该资产可能已删除或没有权限查看。", variant: "destructive" })
			return
		}
		openEditDialog(target)
	}, [assetsById, loading])

	const loadAssets = useCallback(async () => {
		const loadToken = loadGuardRef.current.begin()
		setLoading(true)
		try {
			const [records, locationRecords, bindingRecords] = await Promise.all([
				pb.collection<AssetRecord>("assets").getFullList({
					sort: "type,name",
					requestKey: null,
				}),
				pb.collection<AssetLocationRecord>("asset_locations").getFullList({
					sort: "sort_order,kind,name",
					requestKey: null,
				}),
				pb.collection<AssetMonitorBindingRecord>("asset_monitor_bindings").getFullList({
					fields: "id,user,asset,provider,target_id,state,last_checked,last_error",
					requestKey: null,
				}),
			])
			if (!loadGuardRef.current.isCurrent(loadToken)) return
			setAssets(records)
			setLocations(locationRecords)
			setMonitorBindings(bindingRecords)
		} catch (error) {
			if (!loadGuardRef.current.isCurrent(loadToken)) return
			console.error("load assets", error)
			toast({ title: "资产读取失败", description: "请检查 Hub 日志和资产集合迁移。", variant: "destructive" })
		} finally {
			if (loadGuardRef.current.isCurrent(loadToken)) setLoading(false)
		}
	}, [])

	useEffect(() => {
		document.title = pageTitle("资产中心")
		loadAssets()
	}, [loadAssets])

	useEffect(() => {
		let cancelled = false
		loadDurableAssetNumberingSettings()
			.then((settings) => {
				if (!cancelled) setNumberingForm(settings)
			})
			.catch((error) => console.warn("load asset numbering settings", error))
		return () => {
			cancelled = true
		}
	}, [])

	const physicalParents = useMemo(
		() => assets.filter((asset) => !["internet", "vm", "web_endpoint"].includes(asset.type)),
		[assets]
	)
	const monitoredAssetIds = useMemo(() => buildMonitoredAssetIdsFromBindings(monitorBindings), [monitorBindings])
	const monitorStateByAsset = useMemo(
		() => buildAssetMonitorStateMap(assets, monitorBindings),
		[assets, monitorBindings]
	)
	const locationOptions = useMemo(() => buildAssetLocationOptions(assets, locations), [assets, locations])
	const formLocationOptions = useMemo(
		() => buildAssetLocationOptions(assets, locations, { includePresets: true }),
		[assets, locations]
	)

	const looseLocationGroups = useMemo(() => getLooseLocationGroups(assets, locations), [assets, locations])
	const looseLocationNames = useMemo(
		() => new Set(looseLocationGroups.map((group) => group.name)),
		[looseLocationGroups]
	)
	const looseLocationAssetCount = useMemo(
		() => looseLocationGroups.reduce((sum, group) => sum + group.count, 0),
		[looseLocationGroups]
	)

	const filteredAssets = useMemo(() => {
		// 2026-10-04 产品决策：清单默认按编号排序（编号小的在前，未编号排最后）
		return sortAssetsByListOrder(
			filterAssets({
				assets,
				search,
				typeFilter,
				statusFilter,
				locationFilter,
				monitorFilter,
				typeGroupFilter,
				monitoredAssetIds,
				monitorStateByAsset,
				looseLocationNames,
			})
		)
	}, [
		assets,
		locationFilter,
		looseLocationNames,
		monitorFilter,
		monitoredAssetIds,
		monitorStateByAsset,
		search,
		statusFilter,
		typeFilter,
		typeGroupFilter,
	])

	const counts = useMemo(() => {
		return getAssetListCounts({
			assets,
			locationCount: locationOptions.values.length,
			looseLocationAssetCount: looseLocationAssetCount,
			monitoredAssetIds,
		})
	}, [assets, locationOptions.values.length, looseLocationGroups.length, monitoredAssetIds])
	const activeAsset = useMemo(() => {
		return filteredAssets.find((asset) => asset.id === activeAssetId) ?? filteredAssets[0]
	}, [activeAssetId, filteredAssets])
	const activeCount = useMemo(() => assets.filter((asset) => (asset.status || "active") === "active").length, [assets])
	const numberingSettings = useMemo(() => normalizeAssetNumberingSettings(numberingForm), [numberingForm])
	// 自动编号预览跟随当前新增流程的资产类型（按大类取号）
	const nextAssetTagPreview = useMemo(
		() => buildNextAssetTag(assets, numberingSettings, form.type),
		[assets, form.type, numberingSettings]
	)

	useEffect(() => {
		if (loading) return
		if (filteredAssets.length === 0) {
			if (activeAssetId) setActiveAssetId("")
			return
		}
		if (!filteredAssets.some((asset) => asset.id === activeAssetId)) {
			setActiveAssetId(filteredAssets[0].id)
		}
	}, [activeAssetId, filteredAssets, loading])

	const formSections = useMemo(() => getAssetFormSections(form.type), [form.type])
	// 2026-10-04 自定义自由模板：自由参数行管理 schema 之外的所有 metadata 键
	const customCoveredKeys = useMemo(() => {
		const keys = new Set<string>(["asset_tag"])
		for (const section of getAssetFormSections("custom")) {
			for (const field of section.fields) {
				if (field.source === "metadata") keys.add(field.key)
			}
		}
		return keys
	}, [])
	const advancedCreateSections = useMemo(
		() => getAdvancedCreateFormSections(formSections, form.type),
		[formSections, form.type]
	)

	function openCreateDialog() {
		setEditing(null)
		setForm(emptyAssetForm)
		setFormMode("quick")
		setFormStep("type")
		setBuildModeDraft("")
		setDialogOpen(true)
	}

	function openImportDialog() {
		setImportText("")
		setImportPreviewRows([])
		setImportDialogOpen(true)
	}

	async function saveNumberingSettings() {
		const normalized = normalizeAssetNumberingSettings(numberingForm)
		const nextForm: AssetNumberingSettings = {
			digits: String(normalized.digits),
			sequences: Object.fromEntries(Object.entries(normalized.sequences).map(([code, seq]) => [code, String(seq)])),
		}
		setSaving(true)
		try {
			await saveDurableAssetNumberingSettings(nextForm)
			setNumberingForm(nextForm)
			setNumberingDialogOpen(false)
			toast({ title: "编号已保存", description: "各大类将按新序号继续编号。" })
		} catch (error) {
			console.error("save asset numbering settings", error)
			toast({ title: "编号保存失败", description: "请检查用户设置权限。", variant: "destructive" })
		} finally {
			setSaving(false)
		}
	}

	function downloadImportCsvTemplate() {
		downloadTextFile("pulse-assets-import-template.csv", buildAssetImportCsvTemplate(), "text/csv;charset=utf-8")
		toast({ title: "CSV 导入模板已生成", description: "可直接用表格软件填写后再导入预览。" })
	}

	function downloadImportJsonExample() {
		downloadTextFile(
			"pulse-assets-import-example.json",
			buildAssetImportJsonExample(),
			"application/json;charset=utf-8"
		)
		toast({ title: "JSON 导入示例已生成", description: "适合维护带 metadata 的复杂资产样例。" })
	}

	function exportFilteredCsv() {
		if (filteredAssets.length === 0) {
			toast({ title: "没有可导出的资产", variant: "destructive" })
			return
		}
		downloadTextFile(
			`pulse-assets-${formatAssetExportTimestamp(new Date())}.csv`,
			buildAssetExportCsv(filteredAssets, monitoredAssetIds),
			"text/csv;charset=utf-8"
		)
		setExportDialogOpen(false)
		toast({ title: "资产清单已导出", description: `已导出当前筛选的 ${filteredAssets.length} 个资产。` })
	}

	async function exportFullAssetMigrationPackage() {
		setSaving(true)
		try {
			await downloadAssetMigrationPackage()
			setExportDialogOpen(false)
			toast({ title: "资产迁移包已导出", description: "已包含资产主数据、附件和设备图片，可用于恢复。" })
		} catch (error) {
			console.error("export asset migration package", error)
			toast({ title: "资产导出失败", description: "请检查资产集合权限或 Hub 日志。", variant: "destructive" })
		} finally {
			setSaving(false)
		}
	}

	async function handleAssetMigrationApplied(result: AssetMigrationResult) {
		await loadAssets()
		setImportDialogOpen(false)
		toast({
			title: "资产迁移完成",
			description: `新增 ${result.created}，合并 ${result.merged}，覆盖 ${result.replaced}，跳过 ${result.skipped}。`,
		})
	}

	function loadImportFile(file: File | null) {
		if (!file) return
		const reader = new FileReader()
		reader.onload = () => {
			setImportText(typeof reader.result === "string" ? reader.result : "")
			setImportPreviewRows([])
		}
		reader.onerror = () => {
			toast({ title: "文件读取失败", description: file.name, variant: "destructive" })
		}
		reader.readAsText(file, "utf-8")
	}

	function openEditDialog(asset: AssetRecord) {
		setEditing(asset)
		setFormMode("full")
		setForm({
			name: asset.name,
			type: asset.type,
			status: asset.status || "active",
			parent_asset: asset.parent_asset || "",
			vendor: asset.vendor || "",
			model: asset.model || "",
			serial_number: asset.serial_number || "",
			management_ip: asset.management_ip || "",
			location: asset.location || "",
			role: asset.role || "",
			notes: asset.notes || "",
			metadata: metadataToStringMap(asset.metadata),
		})
		setFormStep("details")
		setDialogOpen(true)
	}

	function handleAssetDialogOpenChange(open: boolean) {
		// 2026-10-07 梳理②：获取/填写步骤点 X、ESC 或遮罩先回到类型选择页，再关一次才真正关闭
		if (!open && !editing && formStep !== "type") {
			goBackToTypeStep()
			return
		}
		setDialogOpen(open)
	}

	// 回到类型选择页：清掉获取状态与装机方式草稿，重新选类型从零开始
	function goBackToTypeStep() {
		setBuildModeDraft("")
		setFormStep("type")
	}

	async function saveAsset() {
		await saveAssetForm(form)
	}

	// 2026-10-04 自动获取路径：勾选参数回填表单状态后走同一套保存，强校验原样生效；返回创建的资产 id（失败 null）
	async function saveAssetForm(formState: AssetFormState): Promise<string | null> {
		const name = formState.name.trim() || (formState.type === "internet" ? "" : buildSuggestedAssetName(formState))
		if (!name) {
			toast({
				title:
					formState.type === "internet"
						? "资源名称不能为空"
						: formState.type === "web_endpoint"
							? "服务名称不能为空"
							: "型号不能为空",
				description:
					formState.type === "internet"
						? "请填写便于识别的宽带资源名称，例如“宽带”。"
						: formState.type === "web_endpoint"
							? "互联网服务监控需要填写服务名称。"
							: "名称可以留空自动生成，但必须填写型号和内部型号作为资产识别线索。",
				variant: "destructive",
			})
			return null
		}
		if (formState.type === "internet") {
			const errors = validateInternetAssetValues({
				name,
				provider: formState.vendor,
				status: formState.status,
				accessTechnology: formState.metadata.access_technology ?? "",
				authMode: formState.metadata.auth_mode ?? "",
				downMbps: Number(formState.metadata.down_mbps),
				upMbps: Number(formState.metadata.up_mbps),
			})
			if (errors.length > 0) {
				toast({ title: "宽带资料未填完整", description: errors.join("、"), variant: "destructive" })
				return null
			}
		}
		if (formState.type === "ont") {
			const errors = validateOntAssetValues({
				name,
				vendor: formState.vendor,
				model: formState.model,
				status: formState.status,
				location: formState.location,
				carrier: formState.metadata.carrier ?? "",
				operatingRole: formState.metadata.operating_role ?? "",
			})
			if (errors.length > 0) {
				toast({ title: "光猫 / ONT 资料未填完整", description: errors.join("、"), variant: "destructive" })
				return null
			}
		}
		if (!editing) {
			const createErrors = validateNewAssetRequiredFields(formState, assets)
			if (createErrors.length > 0) {
				toast({
					title: "关键建档字段未填完整",
					description: createErrors.join("、"),
					variant: "destructive",
				})
				return null
			}
		} else {
			const variantErrors = validatePhoneVariantRequiredFields(formState)
			if (variantErrors.length > 0) {
				toast({
					title: "手机规格未填完整",
					description: variantErrors.join("、"),
					variant: "destructive",
				})
				return null
			}
		}
		if (formState.type === "vm" && !formState.parent_asset) {
			toast({
				title: "虚拟机需要选择宿主资产",
				description: "先添加物理主机、NAS 或服务器，再把虚拟机挂到宿主下面。",
				variant: "destructive",
			})
			return null
		}
		const user = pb.authStore.record?.id
		if (!user) {
			return null
		}
		const normalizedMetadata = normalizeMetadata(formState.metadata, formState.type)
		const canonicalIpv4 = getAssetFormIpv4(formState)
		if (!editing && formState.type !== "internet" && canonicalIpv4 && !normalizedMetadata.fixed_ipv4) {
			normalizedMetadata.fixed_ipv4 = canonicalIpv4
		}
		if (!editing && !String(normalizedMetadata.asset_tag ?? "").trim()) {
			normalizedMetadata.asset_tag = buildNextAssetTag(assets, numberingSettings, formState.type)
		}
		const normalizedRole =
			formState.type === "ont"
				? getAssetTypeOptionLabel("ont", "operating_role", formState.metadata.operating_role ?? "")
				: formState.role.trim()
		const payload = {
			user,
			name,
			type: formState.type,
			status: formState.status,
			parent_asset: formState.type === "vm" ? formState.parent_asset : "",
			vendor: formState.type === "internet" ? normalizeInternetProvider(formState.vendor) : formState.vendor.trim(),
			model: formState.model.trim(),
			serial_number: formState.serial_number.trim(),
			management_ip: formState.type === "internet" ? "" : formState.management_ip.trim() || canonicalIpv4,
			location: formState.location.trim(),
			role: normalizedRole,
			notes: formState.notes.trim(),
			metadata: normalizedMetadata,
		}
		setSaving(true)
		try {
			let assetId = editing?.id
			if (editing) {
				await pb.collection("assets").update(editing.id, payload)
			} else {
				const created = await pb.collection<AssetRecord>("assets").create(payload)
				assetId = created.id
			}
			if (assetId) {
				await syncPrimaryInterface(user, assetId, formState)
				if (formState.type === "internet") {
					try {
						await pb.send(`/api/pulse/assets/${assetId}/internet-addresses/refresh`, { method: "POST" })
					} catch (error) {
						console.warn("refresh internet public addresses", error)
					}
				}
			}
			await loadAssets()
			setDialogOpen(false)
			toast({ title: editing ? "资产已更新" : "资产已添加", description: name })
			return assetId ?? null
		} catch (error) {
			console.error("save asset", error)
			// 2026-10-18 修复：通用提示会掩盖后端真实原因（如严格模板字段不允许），
			// PocketBase 返回的字段校验信息直接展示给用户
			const description = formatPocketBaseError(error)
			toast({ title: "资产保存失败", description, variant: "destructive" })
			return null
		} finally {
			setSaving(false)
		}
	}

	async function archiveLooseLocations() {
		if (looseLocationGroups.length === 0) return
		const user = pb.authStore.record?.id
		if (!user) return
		setSaving(true)
		try {
			await Promise.all(
				looseLocationGroups.map((group, index) =>
					pb
						.collection("asset_locations")
						.create(buildArchivedLocationPayload(user, group, locations.length + index + 1))
				)
			)
			await loadAssets()
			toast({ title: "位置已归档", description: `已新增 ${looseLocationGroups.length} 个位置主数据。` })
		} catch (error) {
			console.error("archive asset locations", error)
			toast({ title: "位置归档失败", description: "请检查权限或是否存在重复位置。", variant: "destructive" })
		} finally {
			setSaving(false)
		}
	}

	async function createLocationPresetFromSelection(selection: AssetLocationPresetSelection) {
		const user = pb.authStore.record?.id
		if (!user) return
		const { rootName, rootPreset, secondName, secondPreset } = selection
		setSaving(true)
		try {
			const createdOrExisting = new Map<string, AssetLocationRecord>()
			for (const location of locations) {
				const path = buildLocationPath(location, locations)
				if (path) createdOrExisting.set(path, location)
			}
			let createdCount = 0
			let rootLocation = createdOrExisting.get(rootName)
			if (!rootLocation) {
				rootLocation = await pb.collection<AssetLocationRecord>("asset_locations").create(
					buildPresetLocationPayload(
						user,
						rootPreset ?? {
							name: rootName,
							kind: "area",
							sortOrder: rootName === "公司" ? 20 : 10,
							notes: `${rootName}一级位置。`,
						}
					)
				)
				createdCount += 1
			}
			if (!rootLocation) throw new Error("位置主数据创建失败")
			createdOrExisting.set(rootName, rootLocation)
			const parentLocation = rootLocation
			if (secondName) {
				const secondPath = `${rootName} / ${secondName}`
				if (!createdOrExisting.has(secondPath)) {
					const created = await pb.collection<AssetLocationRecord>("asset_locations").create(
						buildPresetLocationPayload(
							user,
							secondPreset ?? {
								name: secondName,
								kind: "room",
								parentName: rootName,
								sortOrder: parentLocation.sort_order ? parentLocation.sort_order + 1 : 100,
							},
							parentLocation.id
						)
					)
					createdOrExisting.set(secondPath, created)
					createdCount += 1
				}
			}
			await loadAssets()
			setLocationDialogOpen(false)
			toast({
				title: createdCount > 0 ? "位置预设已添加" : "位置预设已存在",
				description: secondName ? `${rootName} / ${secondName}` : rootName,
			})
		} catch (error) {
			console.error("create asset location preset", error)
			toast({ title: "位置预设添加失败", description: "请检查权限或是否存在重复位置。", variant: "destructive" })
		} finally {
			setSaving(false)
		}
	}

	function previewImportAssets() {
		try {
			const rows = parseAssetImportRows(importText)
			const previewRows = withBatchImportDuplicateChecks(
				rows.map((row, index) => buildImportPreviewRow(row, index, assets))
			)
			setImportPreviewRows(previewRows)
			const validCount = previewRows.filter((row) => row.errors.length === 0).length
			toast({ title: "导入预览已生成", description: `可导入 ${validCount} / ${previewRows.length} 条。` })
		} catch (error) {
			setImportPreviewRows([])
			toast({
				title: "导入内容无法解析",
				description: error instanceof Error ? error.message : "请检查 JSON 或 CSV 内容。",
				variant: "destructive",
			})
		}
	}

	async function importAssets() {
		const user = pb.authStore.record?.id
		if (!user) return
		const validRows = importPreviewRows.filter((row) => row.errors.length === 0)
		if (validRows.length === 0) {
			toast({ title: "没有可导入资产", variant: "destructive" })
			return
		}
		setSaving(true)
		const createdAssetIds: string[] = []
		try {
			for (const row of validRows) {
				const payload = buildAssetPayload(user, row.form)
				const created = await pb.collection<AssetRecord>("assets").create(payload)
				createdAssetIds.push(created.id)
				await syncPrimaryInterface(user, created.id, row.form)
			}
			await loadAssets()
			setImportDialogOpen(false)
			toast({ title: "资产导入完成", description: `已导入 ${validRows.length} 个资产。` })
		} catch (error) {
			console.error("import assets", error)
			await Promise.allSettled(createdAssetIds.map((id) => pb.collection("assets").delete(id)))
			await loadAssets()
			toast({
				title: "资产导入失败，已回滚",
				description: "本批次已创建的资产已删除，请修正内容后重新导入。",
				variant: "destructive",
			})
		} finally {
			setSaving(false)
		}
	}

	function selectAsset(assetId: string) {
		setActiveAssetId(assetId)
		if (!window.matchMedia("(min-width: 1280px)").matches) setPreviewDialogOpen(true)
	}

	function clearAssetFilters() {
		setSearch("")
		setTypeFilter("all")
		setStatusFilter("all")
		setLocationFilter("all")
		setMonitorFilter("all")
		setTypeGroupFilter("all")
	}

	const sidebarProps = {
		assets,
		monitorStateByAsset,
		search,
		onSearchChange: setSearch,
		statusFilter,
		onStatusChange: setStatusFilter,
		monitorFilter,
		onMonitorChange: setMonitorFilter,
		typeGroupFilter,
		onTypeGroupChange: setTypeGroupFilter,
		locationFilter,
		onLocationChange: setLocationFilter,
		looseLocationAssetCount: looseLocationAssetCount,
	}

	return (
		<div className="grid pulse-card-gap">
			<section className="rounded-lg border border-border/70 bg-card px-3 py-3 shadow-none">
				<div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
					<div className="flex min-w-0 items-center gap-2.5">
						<div className="grid size-8 shrink-0 place-items-center rounded-md border border-border/70 bg-card text-muted-foreground">
							<ArchiveIcon className="size-4" />
						</div>
						<h1 className="shrink-0 text-lg font-semibold text-foreground">资产中心</h1>
						<section aria-label="资产概览" className="flex min-w-0 flex-wrap items-center gap-1.5">
							<SummaryPill label="总资产" value={counts.total} />
							<SummaryPill label="在用" value={activeCount} />
							<SummaryPill label="已监控" value={counts.monitored} />
						</section>
					</div>
					{/* 2026-10-03 产品决策：资产管理操作仅管理员可见（所有账户可查看资产）；导出所有账户可用。
					    2026-10-07 梳理①：页头收掉「位置」「编号」设置入口——编号全自动、位置添加时可选预设/自定义，
					    导入导出相邻、添加资产放最右。 */}
					<div className="flex flex-wrap items-center gap-2">
						{isAdmin() && (
							<>
								<Button variant="outline" size="sm" className="h-8 min-h-8 gap-1.5" onClick={openImportDialog}>
									<FileInputIcon className="size-3.5" />
									导入
								</Button>
								<Button
									variant="outline"
									size="sm"
									className="h-8 min-h-8 gap-1.5"
									onClick={() => setExportDialogOpen(true)}
								>
									<FileOutputIcon className="size-3.5" />
									导出
								</Button>
								<Button size="sm" className="h-8 min-h-8 gap-1.5" onClick={openCreateDialog}>
									<PlusIcon className="size-3.5" />
									添加资产
								</Button>
							</>
						)}
						{!isAdmin() && (
							<Button
								variant="outline"
								size="sm"
								className="h-8 min-h-8 gap-1.5"
								onClick={() => setExportDialogOpen(true)}
							>
								<FileOutputIcon className="size-3.5" />
								导出
							</Button>
						)}
					</div>
				</div>
			</section>

			<div className="grid items-start pulse-card-gap lg:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,1fr)_360px]">
				<AssetCenterSidebar {...sidebarProps} className="hidden lg:grid" />

				<section className="min-w-0 overflow-hidden rounded-lg border border-border/70 bg-card">
					<div className="flex min-h-11 flex-wrap items-center gap-2 border-b border-border/70 px-3 py-2">
						<div className="mr-auto min-w-0">
							<div className="text-sm font-semibold text-foreground">资产清单</div>
							<div className="text-xs text-muted-foreground">
								当前显示 {filteredAssets.length} / {assets.length} 个资产
							</div>
						</div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-8 gap-1.5 lg:hidden"
							onClick={() => setFilterDialogOpen(true)}
						>
							<SlidersHorizontalIcon className="size-3.5" />
							筛选
						</Button>
					</div>
					{loading ? (
						<AssetListSkeleton />
					) : filteredAssets.length === 0 ? (
						<div className="p-4">
							<EmptyState loading={false} loadingText="正在读取资产" emptyText="没有匹配的设备">
								<Button variant="outline" size="sm" onClick={clearAssetFilters}>
									清除筛选
								</Button>
							</EmptyState>
						</div>
					) : (
						<AssetListRows assets={filteredAssets} activeAssetId={activeAsset?.id} onSelect={selectAsset} />
					)}
				</section>

				<div className="hidden xl:block">
					<AssetPreviewPanel
						asset={activeAsset}
						monitored={activeAsset ? monitoredAssetIds.has(activeAsset.id) : false}
						monitorState={activeAsset ? monitorStateByAsset.get(activeAsset.id) : undefined}
					/>
				</div>
			</div>

			<Dialog open={filterDialogOpen} onOpenChange={setFilterDialogOpen}>
				<DialogContent className="max-w-sm">
					<DialogHeader>
						<DialogTitle>筛选资产</DialogTitle>
						<DialogDescription>按状态、监控、位置和类型筛选资产清单。</DialogDescription>
					</DialogHeader>
					<AssetCenterSidebar {...sidebarProps} className="border-0 p-0" />
				</DialogContent>
			</Dialog>

			<Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
				<DialogContent className="max-w-sm">
					<DialogHeader>
						<DialogTitle>资产预览</DialogTitle>
					</DialogHeader>
					<AssetPreviewPanel
						asset={activeAsset}
						monitored={activeAsset ? monitoredAssetIds.has(activeAsset.id) : false}
						monitorState={activeAsset ? monitorStateByAsset.get(activeAsset.id) : undefined}
					/>
				</DialogContent>
			</Dialog>

			<Dialog open={dialogOpen} onOpenChange={handleAssetDialogOpenChange}>
				<DialogContent
					className={cn(
						"flex max-h-[88vh] flex-col overflow-hidden",
						// 2026-10-07 梳理②：类型选择页保持大宽度（分组卡片多列），建档页收窄聚焦
						!editing && formStep === "type" ? "max-w-5xl" : "max-w-2xl"
					)}
				>
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							{!editing && formStep !== "type" && (
								<button
									type="button"
									onClick={goBackToTypeStep}
									title="返回选择类型"
									className="grid size-7 shrink-0 place-items-center rounded-md border border-border/70 bg-card text-muted-foreground transition-colors hover:text-foreground"
								>
									<ArrowLeftIcon className="size-4" />
								</button>
							)}
							{editing ? "编辑资产" : formStep === "type" ? "选择资产类型" : "添加资产"}
						</DialogTitle>
						<DialogDescription>
							先确定硬件类型，再维护长期稳定参数；监控、拓扑和告警后续从资产中心选择对象。
						</DialogDescription>
					</DialogHeader>
					{formStep === "type" ? (
						<AssetTypePicker selectedType={form.type} onSelect={(type) => selectType(type)} />
					) : formStep === "fetch" && !editing ? (
						<>
							{/* 2026-10-07 梳理②：建档字段全必填，装机方式（计算设备）在表单内选择；AI 获取挪到建档后 */}
							<QuickAssetCreateFields
								form={form}
								locationOptions={formLocationOptions.values}
								nextAssetTagPreview={nextAssetTagPreview}
								onFormValue={setFormValue}
								onMetadataValue={setMetadataValue}
								buildModeDraft={buildModeDraft}
								onBuildModeChange={setBuildModeDraft}
							/>
						</>
					) : (
						<div className="min-h-0 overflow-y-auto pr-1">
							<div className={cn("grid pulse-card-gap", editing && "lg:grid-cols-[13rem_minmax(0,1fr)]")}>
								{editing && <AssetTypeRail selectedType={form.type} onSelect={(type) => setFormValue("type", type)} />}
								<div className="grid content-start pulse-card-gap">
									{form.type === "vm" && (
										<AssetFormSection title="宿主关系">
											<AssetFormField label="宿主资产" required>
												<select
													value={form.parent_asset}
													onChange={(event) => setFormValue("parent_asset", event.target.value)}
													className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
												>
													<option value="">选择宿主资产</option>
													{physicalParents.map((asset) => (
														<option key={asset.id} value={asset.id}>
															{asset.name}
														</option>
													))}
												</select>
											</AssetFormField>
										</AssetFormSection>
									)}
									{!editing ? (
										<>
											<QuickAssetCreateFields
												form={form}
												locationOptions={formLocationOptions.values}
												nextAssetTagPreview={nextAssetTagPreview}
												onFormValue={setFormValue}
												onMetadataValue={setMetadataValue}
												buildModeDraft={buildModeDraft}
												onBuildModeChange={setBuildModeDraft}
											/>
											<div className="rounded-lg border border-border/70 bg-card">
												<button
													type="button"
													onClick={() => setFormMode((current) => (current === "full" ? "quick" : "full"))}
													className="flex min-h-11 w-full items-center justify-between gap-3 px-3 text-left"
													aria-expanded={formMode === "full"}
												>
													<span className="flex items-center gap-2 text-sm font-medium text-foreground">
														{formMode === "full" ? (
															<ChevronDownIcon className="size-4 text-muted-foreground" />
														) : (
															<ChevronRightIcon className="size-4 text-muted-foreground" />
														)}
														更多参数
													</span>
													<span className="text-xs text-muted-foreground">
														{formMode === "full" ? "收起" : `${countAssetFormFields(advancedCreateSections)} 项可选`}
													</span>
												</button>
												{formMode === "full" && (
													<div className="grid gap-3 border-t border-border/70 bg-surface-soft p-3">
														{advancedCreateSections.map((section) => (
															<AssetFormSection key={section.title} title={section.title}>
																{section.fields.map((field) => (
																	<AssetInput
																		key={`${field.source}:${field.key}`}
																		field={field}
																		value={getAssetFormFieldValue(form, field)}
																		locationOptions={formLocationOptions.values}
																		nextAssetTagPreview={nextAssetTagPreview}
																		onChange={(value) => setFieldValue(field, value)}
																	/>
																))}
															</AssetFormSection>
														))}
													</div>
												)}
											</div>
										</>
									) : (
										formSections.map((section) => (
											<AssetFormSection key={section.title} title={section.title}>
												{section.fields.map((field) => (
													<AssetInput
														key={`${field.source}:${field.key}`}
														field={field}
														value={getAssetFormFieldValue(form, field)}
														locationOptions={formLocationOptions.values}
														nextAssetTagPreview={nextAssetTagPreview}
														onChange={(value) => setFieldValue(field, value)}
													/>
												))}
											</AssetFormSection>
										))
									)}
								</div>
								{/* 2026-10-04 自定义自由模板：核心字段之外全是自由参数行 */}
								{form.type === "custom" && (
									<AssetFormSection title="自定义参数行">
										<AssetCustomParamsRows
											metadata={form.metadata}
											coveredKeys={customCoveredKeys}
											onChange={(metadata) => setForm((current) => ({ ...current, metadata }))}
										/>
									</AssetFormSection>
								)}
							</div>
						</div>
					)}
					<DialogFooter>
						{/* 2026-10-07 梳理②：类型页=选子类+下一步；建档页=保存资产；返回走左上角箭头 */}
						{editing && (
							<Button variant="outline" disabled={saving} onClick={() => setDialogOpen(false)}>
								取消
							</Button>
						)}
						{formStep === "type" ? (
							<Button onClick={() => setFormStep(form.type === "custom" ? "details" : "fetch")} disabled={!form.type}>
								下一步
							</Button>
						) : formStep === "fetch" ? (
							<Button
								onClick={() => {
									// 计算设备必须先选装机方式，随 metadata 一并入库
									if (!requireBuildMode()) return
									saveAssetForm({ ...form, metadata: { ...form.metadata, build_mode: buildModeDraft } })
								}}
								disabled={saving || readOnly}
							>
								{saving ? "保存中" : "保存资产"}
							</Button>
						) : (
							<Button onClick={saveAsset} disabled={saving || readOnly}>
								{saving ? "保存中" : "保存资产"}
							</Button>
						)}
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<AssetLocationSettingsDialog
				open={locationDialogOpen}
				onOpenChange={setLocationDialogOpen}
				locations={locations}
				looseLocationGroups={looseLocationGroups}
				saving={saving}
				readOnly={readOnly}
				onArchiveLooseLocations={archiveLooseLocations}
				onCreatePreset={createLocationPresetFromSelection}
				onValidationError={(title) => toast({ title, variant: "destructive" })}
			/>

			<AssetNumberingSettingsDialog
				open={numberingDialogOpen}
				onOpenChange={setNumberingDialogOpen}
				form={numberingForm}
				readOnly={readOnly}
				onChange={setNumberingForm}
				onSave={saveNumberingSettings}
			/>

			<AssetImportDialog
				open={importDialogOpen}
				onOpenChange={setImportDialogOpen}
				value={importText}
				previewRows={importPreviewRows}
				saving={saving}
				onValueChange={setImportText}
				onLoadFile={loadImportFile}
				onDownloadCsvTemplate={downloadImportCsvTemplate}
				onDownloadJsonExample={downloadImportJsonExample}
				onPreview={previewImportAssets}
				onImport={importAssets}
				onMigrationApplied={handleAssetMigrationApplied}
			/>

			<AssetExportDialog
				open={exportDialogOpen}
				assetCount={filteredAssets.length}
				saving={saving}
				onOpenChange={setExportDialogOpen}
				onExportCsv={exportFilteredCsv}
				onExportPackage={exportFullAssetMigrationPackage}
			/>
		</div>
	)

	// 计算设备必须先选装机方式（品牌整机/自组装）；已选或非计算设备时返回 true
	function requireBuildMode() {
		if (!isComputeDeviceType(form.type) || buildModeDraft) return true
		toast({
			title: "请先选择装机方式",
			description: "品牌整机或自组装；自组装可维护配件清单。",
			variant: "destructive",
		})
		return false
	}

	function selectType(type: AssetType) {
		// 2026-10-07 梳理②：点击子类仅选中，点「下一步」才进入建档
		setBuildModeDraft("")
		setForm((current) =>
			applySuggestedAssetName(
				{
					...current,
					type,
					parent_asset: type === "vm" ? current.parent_asset : "",
				},
				current
			)
		)
	}

	// 从获取步骤返回改类型：没有草稿，直接重置即可

	function setFieldValue(field: AssetFieldDefinition, value: string) {
		if (field.source === "asset") {
			setFormValue(field.key as keyof AssetFormState, value as AssetFormState[keyof AssetFormState])
			return
		}
		setMetadataValue(field.key, value)
	}

	function setMetadataValue(key: string, value: string) {
		setForm((current) =>
			applySuggestedAssetName(
				{
					...current,
					metadata: {
						...current.metadata,
						[key]: value,
					},
				},
				current
			)
		)
	}

	function setFormValue<K extends keyof AssetFormState>(key: K, value: AssetFormState[K]) {
		setForm((current) => {
			const next = {
				...current,
				[key]: value,
				...(key === "type" && value !== "vm" ? { parent_asset: "" } : {}),
			}
			return key === "name" ? next : applySuggestedAssetName(next, current)
		})
	}

	function applySuggestedAssetName(next: AssetFormState, previous: AssetFormState) {
		if (!shouldReplaceAssetNameWithSuggestion(previous)) {
			return next
		}
		const suggested = buildSuggestedAssetName(next)
		return suggested ? { ...next, name: suggested } : next
	}
})

const quickCreateFieldKeys = new Set([
	"asset:name",
	"asset:type",
	"asset:vendor",
	"asset:model",
	"asset:management_ip",
	"asset:location",
	"metadata:fixed_ipv4",
	"metadata:internal_model",
	"metadata:color",
	"metadata:device_color",
	"metadata:asset_tag",
	"metadata:url",
])

const phoneVariantQuickFieldKeys = new Set(["metadata:memory_gb", "metadata:storage_gb"])

function getAdvancedCreateFormSections(sections: AssetFieldSection[], type: AssetType) {
	return sections
		.map((section) => ({
			...section,
			fields: section.fields.filter((field) => {
				const key = `${field.source}:${field.key}`
				return (
					!quickCreateFieldKeys.has(key) && !(isPhoneVariantSpecRequired(type) && phoneVariantQuickFieldKeys.has(key))
				)
			}),
		}))
		.filter((section) => section.fields.length > 0)
}

function countAssetFormFields(sections: AssetFieldSection[]) {
	return sections.reduce((total, section) => total + section.fields.length, 0)
}

function validateNewAssetRequiredFields(form: AssetFormState, existingAssets: AssetRecord[]) {
	const errors: string[] = []
	if (form.type === "internet") {
		if (!form.vendor.trim()) errors.push("运营商")
		if (!isPositiveNumberString(form.metadata.down_mbps)) errors.push("下行带宽")
		if (!isPositiveNumberString(form.metadata.up_mbps)) errors.push("上行带宽")
		return errors
	}
	if (form.type === "ont") {
		return validateNewOntRequiredFields({
			vendor: form.vendor,
			model: form.model,
			managementIp: form.management_ip,
			fixedIpv4: form.metadata.fixed_ipv4 ?? "",
			carrier: form.metadata.carrier ?? "",
			operatingRole: form.metadata.operating_role ?? "",
		})
	}
	if (form.type === "web_endpoint") {
		if (!form.name.trim()) errors.push("服务名称")
		if (!hasServiceURL(form.metadata)) errors.push("至少一个服务 URL")
		return errors
	}
	// 2026-10-04 自定义自由模板：不联网兜底类型只必填名称（上方已拦截），其余全选填
	if (form.type === "custom") {
		return []
	}
	// 2026-10-07 梳理②：建档字段全必填；IPv4 恢复建档必填（用户定稿）
	const ipv4 = getAssetFormIpv4(form)
	if (!ipv4) {
		errors.push("IPv4 地址")
	} else if (!isValidIpv4(ipv4)) {
		errors.push("IPv4 地址格式不正确")
	}
	const mac = form.metadata.mac?.trim() ?? ""
	if (!mac) {
		errors.push("MAC 地址")
	} else if (!isValidMac(mac)) {
		errors.push("MAC 地址格式不正确")
	}
	if (!form.vendor.trim()) errors.push("品牌")
	if (!form.model.trim()) errors.push("型号 / 规格")
	if (!form.role.trim()) errors.push("用途")
	if (!form.location.trim()) errors.push("位置")
	if (!form.metadata.color?.trim()) errors.push("外观颜色")
	if (form.type === "phone" && !form.metadata.internal_model?.trim()) errors.push("内部型号 / 搜索代码")
	if (isPhoneVariantSpecRequired(form.type)) {
		if (!isPositiveNumberString(form.metadata.memory_gb)) errors.push("运行内存")
		if (!isPositiveNumberString(form.metadata.storage_gb)) errors.push("存储容量")
	}
	const assetTag = form.metadata.asset_tag?.trim()
	if (assetTag && existingAssets.some((asset) => getMetadataString(asset.metadata, "asset_tag") === assetTag)) {
		errors.push("资产编号已存在")
	}
	return errors
}

function validatePhoneVariantRequiredFields(form: AssetFormState) {
	if (!isPhoneVariantSpecRequired(form.type)) return []
	const errors: string[] = []
	if (!isPositiveNumberString(form.metadata.memory_gb)) errors.push("运行内存")
	if (!isPositiveNumberString(form.metadata.storage_gb)) errors.push("存储容量")
	return errors
}

function isPositiveNumberString(value: string | undefined) {
	if (!value?.trim()) return false
	const number = Number(value)
	return Number.isFinite(number) && number > 0
}

function getAssetFormIpv4(form: AssetFormState) {
	return form.management_ip.trim() || form.metadata.fixed_ipv4?.trim() || ""
}

function hasServiceURL(metadata: AssetFormState["metadata"]) {
	return Boolean(metadata.url?.trim() || metadata.internal_url?.trim() || metadata.external_url?.trim())
}

function isValidIpv4(value: string) {
	const parts = value.trim().split(".")
	return (
		parts.length === 4 &&
		parts.every((part) => {
			if (!/^\d{1,3}$/.test(part)) return false
			if (part.length > 1 && part.startsWith("0")) return false
			const number = Number(part)
			return Number.isInteger(number) && number >= 0 && number <= 255
		})
	)
}

function isValidMac(value: string) {
	return /^(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/.test(value.trim())
}

function SummaryPill({ label, value }: { label: string; value: number }) {
	return (
		<div className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/70 bg-card px-2.5">
			<span className="text-xs text-muted-foreground">{label}</span>
			<span className="font-mono text-sm font-semibold tabular-nums text-foreground">{value}</span>
		</div>
	)
}

function getInitialAssetFiltersFromUrl() {
	const params = new URLSearchParams(window.location.search)
	const type = params.get("type")
	const status = params.get("status")
	const monitor = params.get("monitor")
	const location = params.get("location")
	return {
		search: params.get("q") ?? "",
		typeFilter: isAssetTypeFilter(type) ? type : "all",
		statusFilter: isAssetStatusFilter(status) ? status : "all",
		locationFilter: location?.trim() || "all",
		monitorFilter: isMonitorFilter(monitor) ? monitor : "all",
	}
}

function isAssetTypeFilter(value: string | null): value is AssetType | "all" {
	return value === "all" || Boolean(value && assetTypeValues.includes(value as AssetType))
}

function isAssetStatusFilter(value: string | null): value is AssetStatus | "all" {
	return value === "all" || Boolean(value && assetStatusValues.includes(value as AssetStatus))
}

function isMonitorFilter(value: string | null): value is AssetMonitorFilter {
	return Boolean(value && monitorFilterValues.includes(value as AssetMonitorFilter))
}
