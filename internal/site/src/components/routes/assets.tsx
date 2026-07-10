import {
	BoxesIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	FileInputIcon,
	FileOutputIcon,
	HashIcon,
	MapPinIcon,
	PlusIcon,
	SearchIcon,
} from "lucide-react"
import { memo, useEffect, useMemo, useState } from "react"
import {
	AssetListItem,
	AssetPreviewPanel,
	getAssetIpLabel,
	getAssetNetworkLabel,
} from "@/modules/asset-center/components/asset-card"
import {
	AssetFormField,
	AssetFormSection,
	AssetInput,
	AssetMetaTag,
} from "@/modules/asset-center/components/asset-form-fields"
import { AssetLocationSettingsDialog } from "@/modules/asset-center/components/asset-location-settings-dialog"
import { AssetImportDialog } from "@/modules/asset-center/components/asset-import-dialog"
import { AssetNumberingSettingsDialog } from "@/modules/asset-center/components/asset-numbering-settings-dialog"
import { AssetExportDialog } from "@/modules/asset-center/components/asset-export-dialog"
import { QuickAssetCreateFields } from "@/modules/asset-center/components/asset-quick-create-fields"
import { AssetTypePicker, AssetTypeRail } from "@/modules/asset-center/components/asset-type-picker"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/use-toast"
import { isReadOnlyUser, pb } from "@/lib/api"
import { pageTitle } from "@/lib/branding"
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
	getFocusedAssetFormSections,
	shouldReplaceAssetNameWithSuggestion,
} from "@/modules/asset-center/asset-form"
import {
	buildNextAssetTag,
	loadAssetNumberingSettings,
	normalizeAssetNumberingSettings,
	saveAssetNumberingSettings,
	type AssetNumberingSettings,
} from "@/modules/asset-center/asset-numbering"
import {
	buildArchivedLocationPayload,
	buildLocationPath,
	buildPresetLocationPayload,
	getLooseLocationGroups,
} from "@/modules/asset-center/asset-location"
import type { AssetLocationPresetSelection } from "@/modules/asset-center/asset-location-dialog"
import {
	buildAssetCenterSnapshot,
	buildAssetExportCsv,
	downloadTextFile,
	formatAssetExportTimestamp,
} from "@/modules/asset-center/asset-export"
import { buildAssetImportCsvTemplate, buildAssetImportJsonExample } from "@/modules/asset-center/asset-import-templates"
import {
	buildAssetLocationOptions,
	buildMonitoredAssetIds,
	filterAssets,
	getAssetListCounts,
	groupMaintenanceByAsset,
	hasAssetListFilters,
	type AssetLifecycleFilter,
	type AssetMonitorFilter,
	type AssetProfileFilter,
} from "@/modules/asset-center/asset-list"
import {
	ASSET_TYPE_OPTIONS,
	STATUS_OPTIONS,
	getAssetCompleteness,
	getAssetFormSections,
	getMetadataString,
	isPhoneVariantSpecRequired,
	type AssetFieldDefinition,
	type AssetFieldSection,
} from "@/modules/asset-center/asset-schema"
import { syncPrimaryInterface } from "@/modules/asset-center/asset-interface-sync"
import type {
	AssetInterfaceRecord,
	AssetAttachmentRecord,
	AssetLocationRecord,
	AssetMaintenanceRecord,
	AssetRelationRecord,
	AssetRecord,
	AssetStatus,
	AssetType,
	SystemRecord,
	WebsiteMonitorRecord,
} from "@/types"

type AssetFormStep = "type" | "details"
type AssetFormMode = "quick" | "full"

const monitorFilterValues: AssetMonitorFilter[] = ["all", "monitored", "unmonitored", "monitorable"]
const profileFilterValues: AssetProfileFilter[] = ["all", "complete", "usable", "attention", "incomplete", "critical"]
const lifecycleFilterValues: AssetLifecycleFilter[] = [
	"all",
	"attention",
	"warranty-expired",
	"warranty-soon",
	"warranty-missing",
	"warranty-ok",
	"maintained",
	"unmaintained",
]
const assetTypeValues = ASSET_TYPE_OPTIONS.map((option) => option.value)
const assetStatusValues = STATUS_OPTIONS.map((option) => option.value)
export default memo(function AssetsPage() {
	const [assets, setAssets] = useState<AssetRecord[]>([])
	const [locations, setLocations] = useState<AssetLocationRecord[]>([])
	const [maintenance, setMaintenance] = useState<AssetMaintenanceRecord[]>([])
	const [systems, setSystems] = useState<SystemRecord[]>([])
	const [websites, setWebsites] = useState<WebsiteMonitorRecord[]>([])
	const [loading, setLoading] = useState(true)
	const [saving, setSaving] = useState(false)
	const [identifyingAssetId, setIdentifyingAssetId] = useState("")
	const [dialogOpen, setDialogOpen] = useState(false)
	const [locationDialogOpen, setLocationDialogOpen] = useState(false)
	const [numberingDialogOpen, setNumberingDialogOpen] = useState(false)
	const [importDialogOpen, setImportDialogOpen] = useState(false)
	const [exportDialogOpen, setExportDialogOpen] = useState(false)
	const [formStep, setFormStep] = useState<AssetFormStep>("type")
	const [formMode, setFormMode] = useState<AssetFormMode>("quick")
	const [editing, setEditing] = useState<AssetRecord | null>(null)
	const [profileFocus, setProfileFocus] = useState(false)
	const [form, setForm] = useState<AssetFormState>(emptyAssetForm)
	const [numberingForm, setNumberingForm] = useState<AssetNumberingSettings>(() => loadAssetNumberingSettings())
	const [importText, setImportText] = useState("")
	const [importPreviewRows, setImportPreviewRows] = useState<AssetImportPreviewRow[]>([])
	const [activeAssetId, setActiveAssetId] = useState("")
	const initialFilters = useMemo(getInitialAssetFiltersFromUrl, [])
	const [search, setSearch] = useState(initialFilters.search)
	const [typeFilter, setTypeFilter] = useState<AssetType | "all">(initialFilters.typeFilter)
	const [statusFilter, setStatusFilter] = useState<AssetStatus | "all">(initialFilters.statusFilter)
	const [locationFilter, setLocationFilter] = useState(initialFilters.locationFilter)
	const [monitorFilter, setMonitorFilter] = useState<AssetMonitorFilter>(initialFilters.monitorFilter)
	const [profileFilter, setProfileFilter] = useState<AssetProfileFilter>(initialFilters.profileFilter)
	const [lifecycleFilter, setLifecycleFilter] = useState<AssetLifecycleFilter>(initialFilters.lifecycleFilter)
	const readOnly = isReadOnlyUser()
	const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets])

	useEffect(() => {
		document.title = pageTitle("资产中心")
		loadAssets()
	}, [])

	useEffect(() => {
		if (loading) return
		const params = new URLSearchParams(window.location.search)
		const editAssetId = params.get("edit")
		if (!editAssetId) return
		const focus = params.get("focus")
		const target = assetsById.get(editAssetId)
		params.delete("edit")
		params.delete("focus")
		const nextSearch = params.toString()
		window.history.replaceState(null, "", `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`)
		if (!target) {
			toast({ title: "未找到要编辑的资产", description: "该资产可能已删除或没有权限查看。", variant: "destructive" })
			return
		}
		openEditDialog(target, { profileFocus: focus === "profile" })
	}, [assetsById, loading])

	async function loadAssets() {
		setLoading(true)
		try {
			const [records, locationRecords, maintenanceRecords, systemRecords, websiteRecords] = await Promise.all([
				pb.collection<AssetRecord>("assets").getFullList({
					sort: "type,name",
					requestKey: null,
				}),
				pb.collection<AssetLocationRecord>("asset_locations").getFullList({
					sort: "sort_order,kind,name",
					requestKey: null,
				}),
				pb.collection<AssetMaintenanceRecord>("asset_maintenance").getFullList({
					fields: "id,asset,kind,title,event_date,created",
					requestKey: null,
				}),
				pb.collection<SystemRecord>("systems").getFullList({
					fields: "id,asset,name,display_name",
					requestKey: null,
				}),
				pb.collection<WebsiteMonitorRecord>("website_monitors").getFullList({
					fields: "id,asset,name,last_status,enabled",
					requestKey: null,
				}),
			])
			setAssets(records)
			setLocations(locationRecords)
			setMaintenance(maintenanceRecords)
			setSystems(systemRecords)
			setWebsites(websiteRecords)
		} catch (error) {
			console.error("load assets", error)
			toast({ title: "资产读取失败", description: "请检查 Hub 日志和资产集合迁移。", variant: "destructive" })
		} finally {
			setLoading(false)
		}
	}

	const physicalParents = useMemo(
		() => assets.filter((asset) => !["internet", "vm", "web_endpoint"].includes(asset.type)),
		[assets]
	)
	const monitoredAssetIds = useMemo(() => buildMonitoredAssetIds(systems, websites), [systems, websites])
	const locationOptions = useMemo(() => buildAssetLocationOptions(assets, locations), [assets, locations])
	const formLocationOptions = useMemo(
		() => buildAssetLocationOptions(assets, locations, { includePresets: true }),
		[assets, locations]
	)

	const looseLocationGroups = useMemo(() => getLooseLocationGroups(assets, locations), [assets, locations])
	const maintenanceByAsset = useMemo(() => groupMaintenanceByAsset(maintenance), [maintenance])

	const filteredAssets = useMemo(() => {
		return filterAssets({
			assets,
			search,
			typeFilter,
			statusFilter,
			locationFilter,
			monitorFilter,
			lifecycleFilter,
			profileFilter,
			monitoredAssetIds,
			maintenanceByAsset,
		})
	}, [
		assets,
		lifecycleFilter,
		locationFilter,
		maintenanceByAsset,
		monitorFilter,
		monitoredAssetIds,
		profileFilter,
		search,
		statusFilter,
		typeFilter,
	])

	const counts = useMemo(() => {
		return getAssetListCounts({
			assets,
			locationCount: locationOptions.values.length,
			looseLocationCount: looseLocationGroups.length,
			monitoredAssetIds,
		})
	}, [assets, locationOptions.values.length, looseLocationGroups.length, monitoredAssetIds])
	const activeAsset = useMemo(() => {
		return filteredAssets.find((asset) => asset.id === activeAssetId) ?? filteredAssets[0]
	}, [activeAssetId, filteredAssets])
	const filteredInsights = useMemo(() => {
		const locationSet = new Set<string>()
		let withIp = 0
		let withNetwork = 0
		let monitored = 0
		let profileAttention = 0
		for (const asset of filteredAssets) {
			if (asset.location?.trim()) locationSet.add(asset.location.trim())
			if (getAssetIpLabel(asset) !== "未填写") withIp += 1
			if (getAssetNetworkLabel(asset) !== "未填写") withNetwork += 1
			if (monitoredAssetIds.has(asset.id)) monitored += 1
			if (getAssetCompleteness(asset).score < 70) profileAttention += 1
		}
		return {
			locations: locationSet.size,
			withIp,
			withNetwork,
			monitored,
			profileAttention,
		}
	}, [filteredAssets, monitoredAssetIds])
	const activeAssetParent = activeAsset?.parent_asset ? assetsById.get(activeAsset.parent_asset) : undefined
	const numberingSettings = useMemo(() => normalizeAssetNumberingSettings(numberingForm), [numberingForm])
	const nextAssetTagPreview = useMemo(() => buildNextAssetTag(assets, numberingSettings), [assets, numberingSettings])

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

	const hasActiveFilters = hasAssetListFilters({
		search,
		typeFilter,
		statusFilter,
		locationFilter,
		monitorFilter,
		profileFilter,
		lifecycleFilter,
	})
	const formSections = useMemo(() => getAssetFormSections(form.type), [form.type])
	const editingCompleteness = useMemo(() => (editing ? getAssetCompleteness(editing) : undefined), [editing])
	const focusedFormSections = useMemo(() => {
		return getFocusedAssetFormSections({
			formSections,
			profileFocus,
			missingFields: editingCompleteness?.missing ?? [],
		})
	}, [editingCompleteness, formSections, profileFocus])
	const advancedCreateSections = useMemo(
		() => getAdvancedCreateFormSections(focusedFormSections, form.type),
		[focusedFormSections, form.type]
	)

	function resetFilters() {
		setSearch("")
		setTypeFilter("all")
		setStatusFilter("all")
		setLocationFilter("all")
		setMonitorFilter("all")
		setProfileFilter("all")
		setLifecycleFilter("all")
		window.history.replaceState(null, "", window.location.pathname)
	}

	function openCreateDialog() {
		setEditing(null)
		setProfileFocus(false)
		setForm(emptyAssetForm)
		setFormMode("quick")
		setFormStep("type")
		setDialogOpen(true)
	}

	function openImportDialog() {
		setImportText("")
		setImportPreviewRows([])
		setImportDialogOpen(true)
	}

	function openNumberingSettingsDialog() {
		setNumberingForm(loadAssetNumberingSettings())
		setNumberingDialogOpen(true)
	}

	function saveNumberingSettings() {
		const normalized = normalizeAssetNumberingSettings(numberingForm)
		const nextForm: AssetNumberingSettings = {
			prefix: normalized.prefix,
			digits: String(normalized.digits),
			nextSequence: String(normalized.nextSequence),
		}
		saveAssetNumberingSettings(nextForm)
		setNumberingForm(nextForm)
		setNumberingDialogOpen(false)
		toast({
			title: "编号已保存",
			description: `下一个编号：${buildNextAssetTag(assets, normalized)}`,
		})
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

	async function exportFullAssetSnapshot() {
		setSaving(true)
		try {
			const [interfaceRecords, relationRecords, locationRecords, maintenanceRecords, attachmentRecords] =
				await Promise.all([
					pb.collection<AssetInterfaceRecord>("asset_interfaces").getFullList({
						sort: "asset,name",
						requestKey: null,
					}),
					pb.collection<AssetRelationRecord>("asset_relations").getFullList({
						sort: "source_asset,target_asset,kind",
						requestKey: null,
					}),
					pb.collection<AssetLocationRecord>("asset_locations").getFullList({
						sort: "sort_order,kind,name",
						requestKey: null,
					}),
					pb.collection<AssetMaintenanceRecord>("asset_maintenance").getFullList({
						sort: "asset,-event_date,-created",
						requestKey: null,
					}),
					pb.collection<AssetAttachmentRecord>("asset_attachments").getFullList({
						sort: "asset,kind,title",
						requestKey: null,
					}),
				])
			const exportedAt = new Date()
			downloadTextFile(
				`pulse-asset-center-${formatAssetExportTimestamp(exportedAt)}.json`,
				buildAssetCenterSnapshot({
					exportedAt,
					assets,
					assetInterfaces: interfaceRecords,
					assetRelations: relationRecords,
					assetLocations: locationRecords,
					assetMaintenance: maintenanceRecords,
					assetAttachments: attachmentRecords,
				}),
				"application/json;charset=utf-8"
			)
			setExportDialogOpen(false)
			toast({ title: "资产中心快照已导出", description: "已包含资产、接口、关系、位置、维护记录和附件索引。" })
		} catch (error) {
			console.error("export asset snapshot", error)
			toast({ title: "资产导出失败", description: "请检查资产集合权限或 Hub 日志。", variant: "destructive" })
		} finally {
			setSaving(false)
		}
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

	function openEditDialog(asset: AssetRecord, options?: { profileFocus?: boolean }) {
		setEditing(asset)
		setProfileFocus(Boolean(options?.profileFocus))
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
		setDialogOpen(open)
		if (!open) {
			setProfileFocus(false)
		}
	}

	async function saveAsset() {
		const name = form.name.trim() || buildSuggestedAssetName(form)
		if (!name) {
			toast({
				title: "型号不能为空",
				description: "名称可以留空自动生成，但必须填写型号和内部型号作为资产识别线索。",
				variant: "destructive",
			})
			return
		}
		if (!editing) {
			const createErrors = validateNewAssetRequiredFields(form, assets)
			if (createErrors.length > 0) {
				toast({
					title: "关键建档字段未填完整",
					description: createErrors.join("、"),
					variant: "destructive",
				})
				return
			}
		} else {
			const variantErrors = validatePhoneVariantRequiredFields(form)
			if (variantErrors.length > 0) {
				toast({
					title: "手机规格未填完整",
					description: variantErrors.join("、"),
					variant: "destructive",
				})
				return
			}
		}
		if (form.type === "vm" && !form.parent_asset) {
			toast({
				title: "虚拟机需要选择宿主资产",
				description: "先添加物理主机、NAS 或服务器，再把虚拟机挂到宿主下面。",
				variant: "destructive",
			})
			return
		}
		const user = pb.authStore.record?.id
		if (!user) {
			return
		}
		const normalizedMetadata = normalizeMetadata(form.metadata, form.type)
		const canonicalIpv4 = getAssetFormIpv4(form)
		if (!editing && canonicalIpv4 && !normalizedMetadata.fixed_ipv4) {
			normalizedMetadata.fixed_ipv4 = canonicalIpv4
		}
		if (!editing && !String(normalizedMetadata.asset_tag ?? "").trim()) {
			normalizedMetadata.asset_tag = buildNextAssetTag(assets, numberingSettings)
		}
		const payload = {
			user,
			name,
			type: form.type,
			status: form.status,
			parent_asset: form.type === "vm" ? form.parent_asset : "",
			vendor: form.vendor.trim(),
			model: form.model.trim(),
			serial_number: form.serial_number.trim(),
			management_ip: form.management_ip.trim() || canonicalIpv4,
			location: form.location.trim(),
			role: form.role.trim(),
			notes: form.notes.trim(),
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
				await syncPrimaryInterface(user, assetId, form)
			}
			await loadAssets()
			setDialogOpen(false)
			toast({ title: editing ? "资产已更新" : "资产已添加", description: name })
		} catch (error) {
			console.error("save asset", error)
			toast({ title: "资产保存失败", description: "请检查字段和权限。", variant: "destructive" })
		} finally {
			setSaving(false)
		}
	}

	async function deleteAsset(asset: AssetRecord) {
		if (!window.confirm(`确认删除资产「${asset.name}」？关联监控不会自动删除，但资产关系会失效。`)) {
			return
		}
		try {
			await pb.collection("assets").delete(asset.id)
			await loadAssets()
			toast({ title: "资产已删除", description: asset.name })
		} catch (error) {
			console.error("delete asset", error)
			toast({ title: "资产删除失败", description: "请先清理关联关系或检查权限。", variant: "destructive" })
		}
	}

	async function identifyAsset(asset: AssetRecord) {
		if (readOnly || identifyingAssetId) {
			return
		}
		setIdentifyingAssetId(asset.id)
		try {
			await pb.send(`/api/pulse/assets/${asset.id}/enrichment-reports`, { method: "POST" })
			toast({
				title: "智能识别报告已生成",
				description: "进入资产档案查看并确认建议；联网资料源未接入时不会伪造规格。",
			})
		} catch (error) {
			console.error("identify asset", error)
			toast({ title: "智能识别失败", description: "请检查资产、权限或 Hub 日志。", variant: "destructive" })
		} finally {
			setIdentifyingAssetId("")
		}
	}

	function openLocationCreateDialog() {
		setLocationDialogOpen(true)
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
				createdOrExisting.set(rootName, rootLocation)
				createdCount += 1
			}
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
								sortOrder: rootLocation.sort_order ? rootLocation.sort_order + 1 : 100,
							},
							rootLocation.id
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

	return (
		<div className="grid gap-4">
			<section className="rounded-lg border border-border/70 bg-card p-2 shadow-none">
				<div className="grid gap-4 rounded-md bg-surface-soft p-4">
					<div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
						<div className="flex min-w-0 items-center gap-3">
							<div className="grid size-10 shrink-0 place-items-center rounded-md border border-border/70 bg-card text-muted-foreground">
								<BoxesIcon className="size-5" />
							</div>
							<div className="min-w-0">
								<h1 className="truncate text-2xl font-semibold text-foreground">资产中心</h1>
								<p className="mt-1 text-sm text-muted-foreground">统一管理家庭硬件资产，并把可采集设备接入监控</p>
							</div>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<Button variant="outline" onClick={openLocationCreateDialog} disabled={readOnly} className="gap-2">
								<MapPinIcon className="size-4" />
								位置
							</Button>
							<Button variant="outline" onClick={openNumberingSettingsDialog} disabled={readOnly} className="gap-2">
								<HashIcon className="size-4" />
								编号
							</Button>
							<Button variant="outline" onClick={openImportDialog} disabled={readOnly} className="gap-2">
								<FileInputIcon className="size-4" />
								导入
							</Button>
							<Button variant="outline" onClick={() => setExportDialogOpen(true)} className="gap-2">
								<FileOutputIcon className="size-4" />
								导出
							</Button>
							<Button onClick={openCreateDialog} disabled={readOnly} className="gap-2">
								<PlusIcon className="size-4" />
								添加资产
							</Button>
						</div>
					</div>
					<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
						<SummaryPill label="总资产" value={counts.total} />
						<SummaryPill label="已监控" value={counts.monitored} />
						<SummaryPill label="位置数" value={counts.locations} />
						<SummaryPill label="需关注" value={counts.attention} />
						<SummaryPill label="待补资料" value={counts.profileAttention} />
					</div>
				</div>
			</section>

			<Card className="overflow-hidden border-border/70 bg-card shadow-none">
				<CardHeader className="border-b border-border/70 bg-surface-soft px-4 py-3">
					<div className="flex min-w-0 flex-wrap items-center gap-2">
						<div className="mr-auto min-w-40">
							<CardTitle className="text-lg">资产清单</CardTitle>
							<div className="mt-1 text-xs text-muted-foreground">
								当前显示 {filteredAssets.length} / {assets.length} 个资产
							</div>
						</div>
						<div className="grid w-full gap-2 lg:contents">
							<div className="relative min-w-0 lg:w-72 xl:w-80">
								<SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									value={search}
									onChange={(event) => setSearch(event.target.value)}
									placeholder="搜索资产、型号、IP、MAC"
									className="h-9 ps-9"
								/>
							</div>
							<select
								value={typeFilter}
								onChange={(event) => setTypeFilter(event.target.value as AssetType | "all")}
								className="h-9 min-w-0 rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-ring/70 focus:ring-2 focus:ring-ring/15 lg:w-36 xl:w-40"
							>
								<option value="all">全部类型</option>
								{ASSET_TYPE_OPTIONS.map((item) => (
									<option key={item.value} value={item.value}>
										{item.label}
									</option>
								))}
							</select>
							<select
								value={statusFilter}
								onChange={(event) => setStatusFilter(event.target.value as AssetStatus | "all")}
								className="h-9 min-w-0 rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-ring/70 focus:ring-2 focus:ring-ring/15 lg:w-28 xl:w-32"
							>
								<option value="all">全部状态</option>
								<option value="active">在用</option>
								<option value="planned">规划</option>
								<option value="inactive">停用</option>
								<option value="retired">退役</option>
							</select>
							<select
								value={locationFilter}
								onChange={(event) => setLocationFilter(event.target.value)}
								className="h-9 min-w-0 rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-ring/70 focus:ring-2 focus:ring-ring/15 lg:w-28 xl:w-36"
							>
								<option value="all">全部位置</option>
								{locationOptions.values.map((location) => (
									<option key={location} value={location}>
										{location}
									</option>
								))}
								{locationOptions.hasEmptyLocation && <option value="__empty__">未填写位置</option>}
							</select>
						</div>
						<div className="grid w-full gap-2 lg:contents">
							<select
								value={monitorFilter}
								onChange={(event) => setMonitorFilter(event.target.value as AssetMonitorFilter)}
								className="h-9 min-w-0 rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-ring/70 focus:ring-2 focus:ring-ring/15 lg:w-28 xl:w-36"
							>
								<option value="all">全部监控</option>
								<option value="monitored">已接入监控</option>
								<option value="unmonitored">未接入监控</option>
								<option value="monitorable">可接入未接入</option>
							</select>
							<select
								value={lifecycleFilter}
								onChange={(event) => setLifecycleFilter(event.target.value as AssetLifecycleFilter)}
								className="h-9 min-w-0 rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-ring/70 focus:ring-2 focus:ring-ring/15 lg:w-32 xl:w-40"
							>
								<option value="all">全部生命周期</option>
								<option value="attention">需关注</option>
								<option value="warranty-expired">保修已过期</option>
								<option value="warranty-soon">保修临近</option>
								<option value="warranty-ok">保修有效</option>
								<option value="warranty-missing">未填保修</option>
								<option value="maintained">有维护记录</option>
								<option value="unmaintained">无维护记录</option>
							</select>
							<select
								value={profileFilter}
								onChange={(event) => setProfileFilter(event.target.value as AssetProfileFilter)}
								className="h-9 min-w-0 rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-ring/70 focus:ring-2 focus:ring-ring/15 lg:w-28 xl:w-36"
							>
								<option value="all">全部资料</option>
								<option value="complete">资料完整</option>
								<option value="usable">资料可用</option>
								<option value="attention">需补资料</option>
								<option value="incomplete">资料待补</option>
								<option value="critical">缺口较大</option>
							</select>
							<Button variant="outline" onClick={resetFilters} disabled={!hasActiveFilters} className="gap-2">
								清除筛选
							</Button>
						</div>
					</div>
				</CardHeader>
				<CardContent className="p-4">
					{loading ? (
						<EmptyState loading loadingText="正在读取资产" emptyText="暂无资产" />
					) : filteredAssets.length === 0 ? (
						<EmptyState loading={false} loadingText="正在读取资产" emptyText="暂无匹配资产" />
					) : (
						<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
							<div className="min-w-0 overflow-hidden rounded-lg border border-border/70">
								<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-surface-soft px-3 py-2">
									<div className="flex min-h-9 min-w-0 flex-wrap items-center gap-2 text-sm text-foreground">
										<span className="font-medium">当前筛选 {filteredAssets.length}</span>
										<ListInsight label="位置" value={filteredInsights.locations} />
										<ListInsight label="有 IP" value={filteredInsights.withIp} />
										<ListInsight label="有接入" value={filteredInsights.withNetwork} />
										<ListInsight label="已监控" value={filteredInsights.monitored} />
										<ListInsight label="待补" value={filteredInsights.profileAttention} tone="warning" />
									</div>
								</div>
								<div className="max-h-[calc(100vh-18rem)] min-h-[24rem] overflow-y-auto bg-card">
									{filteredAssets.map((asset) => (
										<AssetListItem
											key={asset.id}
											asset={asset}
											parent={asset.parent_asset ? assetsById.get(asset.parent_asset) : undefined}
											monitored={monitoredAssetIds.has(asset.id)}
											maintenanceCount={maintenanceByAsset.get(asset.id)?.length ?? 0}
											active={activeAsset?.id === asset.id}
											onActivate={() => setActiveAssetId(asset.id)}
										/>
									))}
								</div>
							</div>
							<AssetPreviewPanel
								asset={activeAsset}
								parent={activeAssetParent}
								monitored={activeAsset ? monitoredAssetIds.has(activeAsset.id) : false}
								maintenanceCount={activeAsset ? (maintenanceByAsset.get(activeAsset.id)?.length ?? 0) : 0}
								readOnly={readOnly}
							/>
						</div>
					)}
				</CardContent>
			</Card>

			<Dialog open={dialogOpen} onOpenChange={handleAssetDialogOpenChange}>
				<DialogContent className="flex max-h-[88vh] max-w-5xl flex-col overflow-hidden">
					<DialogHeader>
						<DialogTitle>{editing ? "编辑资产" : formStep === "type" ? "选择资产类型" : "添加资产"}</DialogTitle>
						<DialogDescription>
							{profileFocus
								? "优先补齐当前资产缺失的长期档案字段；完整档案仍可随时切回查看。"
								: "先确定硬件类型，再维护长期稳定参数；监控、拓扑和告警后续从资产中心选择对象。"}
						</DialogDescription>
					</DialogHeader>
					{formStep === "type" ? (
						<AssetTypePicker selectedType={form.type} onSelect={(type) => selectType(type)} />
					) : (
						<div className="min-h-0 overflow-y-auto pr-1">
							<div className={cn("grid gap-4", editing && "lg:grid-cols-[13rem_minmax(0,1fr)]")}>
								{editing && <AssetTypeRail selectedType={form.type} onSelect={(type) => setFormValue("type", type)} />}
								<div className="grid content-start gap-4">
									{profileFocus && editingCompleteness && (
										<div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
											<div className="flex flex-wrap items-start justify-between gap-3">
												<div className="min-w-0">
													<div className="text-sm font-medium">待补字段优先</div>
													<div className="mt-1 flex flex-wrap gap-1.5">
														{editingCompleteness.missing.length > 0 ? (
															editingCompleteness.missing.map((field) => (
																<AssetMetaTag key={field} tone="warning">
																	{field}
																</AssetMetaTag>
															))
														) : (
															<AssetMetaTag tone="ok">关键字段已补齐</AssetMetaTag>
														)}
													</div>
												</div>
												<Button
													type="button"
													variant="outline"
													size="sm"
													className="shrink-0 border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
													onClick={() => setProfileFocus(false)}
												>
													查看完整字段
												</Button>
											</div>
										</div>
									)}
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
										focusedFormSections.map((section) => (
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
							</div>
						</div>
					)}
					<DialogFooter>
						{formStep === "details" && !editing && (
							<Button variant="outline" onClick={() => setFormStep("type")} disabled={saving}>
								返回类型
							</Button>
						)}
						<Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
							取消
						</Button>
						{formStep === "type" ? (
							<Button onClick={() => setFormStep("details")}>继续填写</Button>
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
				nextAssetTagPreview={nextAssetTagPreview}
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
			/>

			<AssetExportDialog
				open={exportDialogOpen}
				assetCount={filteredAssets.length}
				saving={saving}
				onOpenChange={setExportDialogOpen}
				onExportCsv={exportFilteredCsv}
				onExportSnapshot={exportFullAssetSnapshot}
			/>
		</div>
	)

	function selectType(type: AssetType) {
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
		setFormStep("details")
	}

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
	const ipv4 = getAssetFormIpv4(form)
	if (!ipv4) {
		errors.push("IPv4 地址")
	} else if (!isValidIpv4(ipv4)) {
		errors.push("IPv4 地址格式不正确")
	}
	if (!form.vendor.trim()) errors.push("厂商 / 品牌")
	if (!form.model.trim()) errors.push("型号 / 规格")
	if (!form.metadata.internal_model?.trim()) errors.push("内部型号 / 搜索代码")
	if (isPhoneVariantSpecRequired(form.type)) {
		if (!isPositiveNumberString(form.metadata.memory_gb)) errors.push("运行内存")
		if (!isPositiveNumberString(form.metadata.storage_gb)) errors.push("存储容量")
	}
	if (!form.location.trim()) errors.push("位置")
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

function SummaryPill({ label, value }: { label: string; value: number }) {
	return (
		<div className="rounded-md border border-border/70 bg-card px-3 py-2">
			<div className="text-xs text-muted-foreground">{label}</div>
			<div className="mt-1 font-mono text-lg font-semibold tabular-nums">{value}</div>
		</div>
	)
}

function ListInsight({
	label,
	value,
	tone = "neutral",
}: {
	label: string
	value: number
	tone?: "neutral" | "warning"
}) {
	return (
		<span
			className={cn(
				"inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs",
				tone === "warning"
					? "border-amber-200 bg-amber-50 text-amber-800"
					: "border-border/70 bg-card text-muted-foreground"
			)}
		>
			<span>{label}</span>
			<span className="font-mono font-semibold tabular-nums text-foreground">{value}</span>
		</span>
	)
}

function getInitialAssetFiltersFromUrl() {
	const params = new URLSearchParams(window.location.search)
	const type = params.get("type")
	const status = params.get("status")
	const monitor = params.get("monitor")
	const profile = params.get("profile")
	const lifecycle = params.get("lifecycle")
	const location = params.get("location")
	return {
		search: params.get("q") ?? "",
		typeFilter: isAssetTypeFilter(type) ? type : "all",
		statusFilter: isAssetStatusFilter(status) ? status : "all",
		locationFilter: location?.trim() || "all",
		monitorFilter: isMonitorFilter(monitor) ? monitor : "all",
		profileFilter: isProfileFilter(profile) ? profile : "all",
		lifecycleFilter: isLifecycleFilter(lifecycle) ? lifecycle : "all",
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

function isProfileFilter(value: string | null): value is AssetProfileFilter {
	return Boolean(value && profileFilterValues.includes(value as AssetProfileFilter))
}

function isLifecycleFilter(value: string | null): value is AssetLifecycleFilter {
	return Boolean(value && lifecycleFilterValues.includes(value as AssetLifecycleFilter))
}
