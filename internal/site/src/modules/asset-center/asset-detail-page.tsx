import { getPagePath } from "@nanostores/router"
import { ArrowLeftIcon, CalendarClockIcon, LinkIcon, NetworkIcon, PaperclipIcon, PencilIcon } from "lucide-react"
import { lazy, memo, Suspense, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react"
import { $router, Link } from "@/components/router"
import { Badge } from "@/components/ui/badge"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/use-toast"
import { isPocketBaseAutoCancel, isReadOnlyUser, pb } from "@/lib/api"
import { pageTitle } from "@/lib/branding"
import { cn } from "@/lib/utils"
import { getAssetIcon } from "./components/asset-card"
import { AssetDetailActionMenu } from "./components/asset-detail-action-menu"
import { AssetEditWorkbench } from "./components/asset-edit-workbench"
import { AssetInterfaceManager } from "./components/asset-interface-manager"
import { getAssetMediaDefaultPreview } from "./components/asset-media-default-preview"
import { AssetShowcaseTags } from "./components/asset-showcase-tags"
import { AssetShowcaseWorkspace } from "./components/asset-showcase-workspace"
import type { InternetAddressAutoRefreshSettings } from "./components/internet-address-auto-refresh-controls"
import { SelectField, TextAreaField, TextField } from "./components/asset-detail-form-fields"
import { getAssetMediaRequestKey, notifyAssetMediaChanged, subscribeAssetMediaChanged } from "./asset-media-events"
import {
	getAssetFormSections,
	getAssetTypeLabel,
	getMetadataString,
	getStatusLabel,
	isPhoneVariantSpecRequired,
} from "./asset-schema"
import {
	getInternetStatusLabel,
	normalizeInternetProvider,
	validateInternetAssetValues,
	validateOntAssetValues,
} from "./asset-type-specs"
import { formatAssetVisualTaskMeta as formatAssetVisualTaskSummary } from "./asset-ai-task-summary"
import { loadLatestAITasksByKind } from "./asset-ai-task-query"
import { createAssetDetailLoadGuard, type AssetDetailLoadToken } from "./asset-detail-load-guard"
import {
	applyAssetDetailEditCatalog,
	applyAssetDetailPrimaryData,
	applyAssetDetailSecondaryData,
	emptyAssetDetailState,
	loadAssetDetailPrimaryData,
	loadAssetDetailSecondaryData,
	type AssetDetailState,
} from "./asset-detail-data"
import { loadAssetEditCatalog } from "./asset-edit-catalog-query"
import { getInternetAddressRefreshFeedback } from "./asset-internet-address-status"
import { getAssetRecognitionRequirements } from "./asset-profile-validation"
import { getAssetVisualSearchAdvice } from "./asset-visual-color"
import {
	buildRelationMetadata,
	emptyRelationForm,
	getAssetInterfaceOptions,
	getEmptyRelationFormForGuide,
	getMetadataNotes,
	getPeerInterfaceOptions,
	getRelationTargetOptions,
	interfaceKindOptions,
	relationGuides,
	relationKindOptions,
	relationLinkKindOptions,
	type RelationFormState,
} from "./asset-detail-relations"

import type {
	AssetChangeRecord,
	AssetAttachmentKind,
	AssetAttachmentRecord,
	AssetVisualRecord,
	AssetInterfaceKind,
	AssetInterfaceRecord,
	AssetEnrichmentReportRecord,
	AssetEnrichmentSuggestionRecord,
	AITaskRecord,
	AssetMaintenanceKind,
	AssetMaintenanceRecord,
	AssetRecord,
	AssetLocationRecord,
	AssetRelationKind,
	AssetRelationRecord,
} from "@/types"

const AssetEnrichmentReportDialog = lazy(() =>
	import("./components/asset-enrichment-report-dialog").then((module) => ({
		default: module.AssetEnrichmentReportDialog,
	}))
)

const maintenanceKindOptions: { value: AssetMaintenanceKind; label: string }[] = [
	{ value: "purchase", label: "购买" },
	{ value: "online", label: "上线" },
	{ value: "maintenance", label: "维护" },
	{ value: "repair", label: "维修" },
	{ value: "upgrade", label: "升级" },
	{ value: "replacement", label: "更换" },
	{ value: "warranty", label: "保修" },
	{ value: "retire", label: "退役" },
	{ value: "note", label: "备注" },
]

const attachmentKindOptions: { value: AssetAttachmentKind; label: string }[] = [
	{ value: "photo", label: "设备照片" },
	{ value: "invoice", label: "发票 / 收据" },
	{ value: "warranty", label: "保修凭证" },
	{ value: "manual", label: "说明书" },
	{ value: "config", label: "配置备份" },
	{ value: "document", label: "文档" },
	{ value: "other", label: "其他" },
]

export default memo(function AssetDetailPage({ id }: { id: string }) {
	const [state, setState] = useState<AssetDetailState>(emptyAssetDetailState)
	const [assetMedia, setAssetMedia] = useState<{
		covers: { id: string; url: string }[]
		gallery: { id: string; url: string }[]
	}>({ covers: [], gallery: [] })
	useEffect(() => {
		let active = true
		const loadAssetMedia = async () => {
			try {
				const result = await pb.send<{
					versions: { id: string }[]
					placements: {
						id: string
						version: string
						role: string
						visible?: boolean
						sort_order?: number
					}[]
				}>(`/api/pulse/assets/${id}/media`, {
					method: "GET",
					requestKey: getAssetMediaRequestKey("detail", id),
				})
				if (!active) return
				const versionIds = new Set(result.versions.map((item) => item.id))
				const display = (role: string) =>
					result.placements
						.filter((item) => item.role === role && item.visible !== false && versionIds.has(item.version))
						.sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
						.map((item) => ({ id: item.id, url: `/api/pulse/asset-media/object?version=${item.version}` }))
				setAssetMedia({ covers: display("cover"), gallery: display("gallery") })
			} catch (error) {
				if (active && !isPocketBaseAutoCancel(error)) setAssetMedia({ covers: [], gallery: [] })
			}
		}

		loadAssetMedia().catch(() => undefined)
		const unsubscribe = subscribeAssetMediaChanged(id, loadAssetMedia)
		return () => {
			active = false
			unsubscribe()
		}
	}, [id])
	const [loading, setLoading] = useState(true)
	const [interfaceManagerOpen, setInterfaceManagerOpen] = useState(false)
	const [interfaceDialogOpen, setInterfaceDialogOpen] = useState(false)
	const [interfaceKindDraft, setInterfaceKindDraft] = useState<AssetInterfaceKind>("ethernet")
	const [relationDialogOpen, setRelationDialogOpen] = useState(false)
	const [maintenanceDialogOpen, setMaintenanceDialogOpen] = useState(false)
	const [attachmentDialogOpen, setAttachmentDialogOpen] = useState(false)
	const [enrichmentReportDialogOpen, setEnrichmentReportDialogOpen] = useState(false)
	const [managementDialogOpen, setManagementDialogOpen] = useState(false)
	const [visualGenerationStage, setVisualGenerationStage] = useState<"idle" | "running" | "ready" | "failed">("idle")
	const [visualGenerationMessage, setVisualGenerationMessage] = useState("")
	const [editingInterface, setEditingInterface] = useState<AssetInterfaceRecord | null>(null)
	const [editingRelation, setEditingRelation] = useState<AssetRelationRecord | null>(null)
	const [relationForm, setRelationForm] = useState<RelationFormState>(emptyRelationForm)
	const [editingMaintenance, setEditingMaintenance] = useState<AssetMaintenanceRecord | null>(null)
	const [saving, setSaving] = useState(false)
	const [internetAddressRefreshing, setInternetAddressRefreshing] = useState(false)
	const secondaryLoadRef = useRef<Promise<void> | null>(null)
	const editCatalogLoadRef = useRef<Promise<void> | null>(null)
	const interfaceDialogCloseGuardRef = useRef(false)
	const detailLoadGuardRef = useRef(createAssetDetailLoadGuard())
	const readOnly = isReadOnlyUser()
	const assetMap = useMemo(() => new Map(state.assets.map((asset) => [asset.id, asset])), [state.assets])
	const asset = state.asset

	useEffect(() => {
		loadDetail()
	}, [id])

	useEffect(() => {
		if (!asset) return
		setVisualGenerationStage("idle")
		setVisualGenerationMessage("")
	}, [asset?.id])

	const selectedRelationGuide = useMemo(
		() => relationGuides.find((guide) => guide.id === relationForm.guide),
		[relationForm.guide]
	)
	const relationTargetOptions = useMemo(
		() =>
			getRelationTargetOptions(
				state.assets,
				asset?.id ?? id,
				asset?.type === "internet" ? "internet" : relationForm.guide
			),
		[asset?.id, asset?.type, id, relationForm.guide, state.assets]
	)
	const relationPeerInterfaceOptions = useMemo(
		() =>
			getPeerInterfaceOptions(
				state.allInterfaces,
				state.assets,
				asset?.id ?? id,
				relationForm.target_asset,
				asset?.type === "internet" ? "internet" : relationForm.guide
			),
		[asset?.id, asset?.type, id, relationForm.guide, relationForm.target_asset, state.allInterfaces, state.assets]
	)
	const latestEnrichmentSuggestions = useMemo(() => {
		const latestReport = state.enrichmentReports[0]
		return latestReport ? state.enrichmentSuggestions.filter((item) => item.report === latestReport.id) : []
	}, [state.enrichmentReports, state.enrichmentSuggestions])
	const recognitionRequirements = useMemo(() => (asset ? getAssetRecognitionRequirements(asset) : []), [asset])

	async function loadDetail(options?: {
		waitSecondary?: boolean
		waitEditCatalog?: boolean
		preserveContent?: boolean
	}) {
		const loadToken = detailLoadGuardRef.current.begin(id)
		const preserveContent = options?.preserveContent === true
		if (!preserveContent) {
			setLoading(true)
		}
		try {
			const {
				asset: assetRecord,
				interfaces,
				allInterfaces,
				relations,
			} = await loadAssetDetailPrimaryData(
				{
					assets: pb.collection<AssetRecord>("assets"),
					interfaces: pb.collection<AssetInterfaceRecord>("asset_interfaces"),
					relations: pb.collection<AssetRelationRecord>("asset_relations"),
				},
				id
			)
			if (!detailLoadGuardRef.current.isCurrent(loadToken)) return
			setState((current) =>
				applyAssetDetailPrimaryData(
					current,
					{ asset: assetRecord, interfaces, allInterfaces, relations },
					{ preserveSecondaryData: preserveContent }
				)
			)
			document.title = pageTitle(`${assetRecord.name} / 资产详情`)
			if (!preserveContent) {
				setLoading(false)
			}
			const secondaryLoad = startSecondaryDetailDataLoad({
				assetId: id,
				loadToken,
			})
			if (options?.waitSecondary) {
				await secondaryLoad
			} else {
				secondaryLoad.catch((error) => {
					console.error("load secondary asset detail", error)
				})
			}
			if (options?.waitEditCatalog || managementDialogOpen) {
				await startAssetEditCatalogDataLoad({
					assetId: assetRecord.id,
					fallbackAsset: assetRecord,
					interfaces,
					loadToken,
				})
			}
		} catch (error) {
			if (!detailLoadGuardRef.current.isCurrent(loadToken)) return
			if (!isPocketBaseAutoCancel(error)) {
				console.error("load asset detail", error)
				toast({ title: "资产详情读取失败", description: "请检查资产是否存在。", variant: "destructive" })
			}
			if (!preserveContent) {
				setLoading(false)
			}
		}
	}

	function startSecondaryDetailDataLoad(options: { assetId: string; loadToken: AssetDetailLoadToken }) {
		let secondaryLoad: Promise<void>
		secondaryLoad = loadSecondaryDetailData(options).finally(() => {
			if (secondaryLoadRef.current === secondaryLoad) {
				secondaryLoadRef.current = null
			}
		})
		secondaryLoadRef.current = secondaryLoad
		return secondaryLoad
	}

	function startAssetEditCatalogDataLoad(options: {
		assetId: string
		fallbackAsset: AssetRecord
		interfaces: AssetInterfaceRecord[]
		loadToken: AssetDetailLoadToken
	}) {
		let catalogLoad: Promise<void>
		catalogLoad = loadAssetEditCatalogData(options).finally(() => {
			if (editCatalogLoadRef.current === catalogLoad) {
				editCatalogLoadRef.current = null
			}
		})
		editCatalogLoadRef.current = catalogLoad
		return catalogLoad
	}

	async function ensureAssetEditCatalogLoaded() {
		if (!asset || state.editCatalogLoaded) return
		if (editCatalogLoadRef.current) {
			await editCatalogLoadRef.current
			return
		}
		await startAssetEditCatalogDataLoad({
			assetId: asset.id,
			fallbackAsset: asset,
			interfaces: state.interfaces,
			loadToken: detailLoadGuardRef.current.current() ?? detailLoadGuardRef.current.begin(asset.id),
		})
	}

	async function loadAssetEditCatalogData({
		assetId,
		fallbackAsset,
		interfaces,
		loadToken,
	}: {
		assetId: string
		fallbackAsset: AssetRecord
		interfaces: AssetInterfaceRecord[]
		loadToken: AssetDetailLoadToken
	}) {
		try {
			const {
				assets,
				interfaces: allInterfaces,
				locations,
			} = await loadAssetEditCatalog({
				assets: pb.collection<AssetRecord>("assets"),
				interfaces: pb.collection<AssetInterfaceRecord>("asset_interfaces"),
				locations: pb.collection<AssetLocationRecord>("asset_locations"),
			})
			setState((current) => {
				if (!detailLoadGuardRef.current.isCurrent(loadToken) || current.asset?.id !== assetId) return current
				return applyAssetDetailEditCatalog(current, {
					assetId,
					fallbackAsset,
					fallbackInterfaces: interfaces,
					assets,
					interfaces: allInterfaces,
					locations,
				})
			})
		} catch (error) {
			if (!isPocketBaseAutoCancel(error)) {
				console.warn("load asset edit catalog", error)
			}
		}
	}

	async function loadSecondaryDetailData({ assetId, loadToken }: { assetId: string; loadToken: AssetDetailLoadToken }) {
		try {
			const data = await loadAssetDetailSecondaryData(
				{
					maintenance: pb.collection<AssetMaintenanceRecord>("asset_maintenance"),
					attachments: pb.collection<AssetAttachmentRecord>("asset_attachments"),
					visuals: pb.collection<AssetVisualRecord>("asset_visuals"),
					buildAssetVisualFileURL: (recordId, file) =>
						pb.files.getURL({ id: recordId, collectionName: "asset_visuals" }, file),
					aiTasks: pb.collection<AITaskRecord>("ai_tasks"),
					changes: pb.collection<AssetChangeRecord>("asset_changes"),
					enrichmentReports: pb.collection<AssetEnrichmentReportRecord>("asset_enrichment_reports"),
					suggestions: pb.collection<AssetEnrichmentSuggestionRecord>("asset_enrichment_suggestions"),
				},
				assetId
			)
			setState((current) =>
				detailLoadGuardRef.current.isCurrent(loadToken)
					? applyAssetDetailSecondaryData(current, assetId, data)
					: current
			)
		} catch (error) {
			if (!isPocketBaseAutoCancel(error)) {
				console.warn("load secondary asset detail", error)
			}
		}
	}

	async function saveInterface(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault()
		if (!asset) return
		const form = new FormData(event.currentTarget)
		const name = form.get("name")?.toString().trim() || ""
		if (!name) {
			toast({ title: "接口名称不能为空", variant: "destructive" })
			return
		}
		const user = pb.authStore.record?.id
		if (!user) return
		const primary = form.get("primary") === "yes"
		const kind = form.get("kind")?.toString() || "ethernet"
		const payload = {
			user,
			asset: asset.id,
			name,
			kind,
			mac: form.get("mac")?.toString().trim(),
			ipv4: form.get("ipv4")?.toString().trim(),
			ipv6: form.get("ipv6")?.toString().trim(),
			speed_mbps: Number(form.get("speed_mbps")) || undefined,
			connected: form.get("connected") === "yes",
			primary,
			source: editingInterface?.source || "manual",
			metadata: {
				enabled: form.get("enabled") !== "no",
				role: form.get("interface_role")?.toString() || "",
				...(kind === "wifi"
					? {
							wifi_standard: form.get("wifi_standard")?.toString() || "",
							band: form.get("band")?.toString() || "",
						}
					: {}),
				connection_note: form.get("connection_note")?.toString().trim() || "",
				notes: form.get("notes")?.toString().trim() || "",
			},
		}
		setSaving(true)
		try {
			const saved = editingInterface
				? await pb.collection<AssetInterfaceRecord>("asset_interfaces").update(editingInterface.id, payload)
				: await pb.collection<AssetInterfaceRecord>("asset_interfaces").create(payload)
			if (primary) {
				await clearOtherPrimaryInterfaces(asset.id, saved.id)
			}
			closeInterfaceDialog()
			await loadDetail({ preserveContent: true })
			toast({ title: editingInterface ? "接口已更新" : "接口已添加", description: name })
		} catch (error) {
			console.error("save asset interface", error)
			toast({ title: "接口保存失败", description: "请检查字段和权限。", variant: "destructive" })
		} finally {
			setSaving(false)
		}
	}

	async function generateTurntableVisual() {
		if (!asset || readOnly) return
		const searchAdvice = getAssetVisualSearchAdvice(asset)
		if (
			searchAdvice.length > 0 &&
			!window.confirm(`补充“${searchAdvice.join("、")}”可提高图片搜索准确度。仍然获取图片吗？`)
		) {
			setVisualGenerationStage("idle")
			setVisualGenerationMessage(`建议补充：${searchAdvice.join("、")}`)
			return
		}
		setVisualGenerationStage("running")
		setVisualGenerationMessage("设备图片 Agent 正在生成检索关键词并收集最多 15 张高适配候选图。")
		setSaving(true)
		try {
			const response = await pb.send<{ status?: string; message?: string; task?: AITaskRecord }>(
				`/api/pulse/assets/${asset.id}/visuals/turntable`,
				{
					method: "POST",
					body: { async: true, broad_search: true },
				}
			)
			await loadDetail({ waitSecondary: true, preserveContent: true })
			if (response.status === "running" || response.status === "queued") {
				setSaving(false)
				setVisualGenerationMessage(
					response.task ? formatAssetVisualTaskSummary(response.task) : "设备图片 Agent 已开始后台收集。"
				)
				await pollAssetVisualGeneration(response.task?.id)
				return
			}
			if (response.status === "blocked" || response.status === "failed") {
				setVisualGenerationStage("failed")
				setVisualGenerationMessage(response.message || "设备图片未收集成功，请检查资产名称或参考图来源。")
				toast({
					title: "设备图片未收集成功",
					description: response.message || "请检查资产名称或参考图来源。",
				})
			} else if (response.status === "no_sources") {
				const isServiceAsset = asset.type === "internet" || asset.type === "web_endpoint"
				const message = isServiceAsset
					? "暂未找到可本地归档的服务商 Logo。请检查运营商或服务商名称后再次获取。"
					: "暂未找到足够适配的候选图。可补充厂商、型号或内部型号后再次获取。"
				setVisualGenerationStage("failed")
				setVisualGenerationMessage(message)
				toast({
					title: isServiceAsset ? "未找到可用服务商 Logo" : "未找到可用设备图片",
					description: message,
				})
			} else {
				setVisualGenerationStage("ready")
				setVisualGenerationMessage("候选图已收集。请在右侧候选区选择要显示在详情页的主图。")
				toast({ title: "候选图已收集", description: "请在编辑窗口右侧选择要显示的主图。" })
			}
		} catch (error) {
			console.error("collect asset visual images", error)
			setVisualGenerationStage("failed")
			setVisualGenerationMessage("设备图片收集失败。请检查资产信息、参考图来源或 Hub 日志。")
			toast({
				title: "设备图片收集失败",
				description: "请检查资产信息、参考图来源或 Hub 日志。",
				variant: "destructive",
			})
		} finally {
			setSaving(false)
		}
	}

	async function pollAssetVisualGeneration(taskId?: string) {
		if (!asset) return
		for (let attempt = 0; attempt < 90; attempt++) {
			await wait(2000)
			const task = await loadAssetVisualTask(taskId, asset.id)
			if (task) {
				setVisualGenerationMessage(formatAssetVisualTaskSummary(task))
				if (task.status === "ready") {
					setVisualGenerationStage("ready")
					await loadDetail({ waitSecondary: true, preserveContent: true })
					setVisualGenerationMessage("候选图已收集。请在右侧候选区选择要显示在详情页的主图。")
					toast({ title: "候选图已收集", description: "请在编辑窗口右侧选择要显示的主图。" })
					return
				}
				if (task.status === "failed") {
					setVisualGenerationStage("failed")
					await loadDetail({ waitSecondary: true, preserveContent: true })
					toast({
						title: "设备图片收集失败",
						description: task.error || "请检查官方配色、参考图来源或 Hub 日志。",
						variant: "destructive",
					})
					return
				}
			}
			if (attempt % 3 === 2) {
				await loadDetail({ waitSecondary: true, preserveContent: true })
			}
		}
		setVisualGenerationMessage("设备图片 Agent 仍在后台运行，可以稍后回到编辑窗口查看最新进度。")
	}

	async function loadAssetVisualTask(taskId: string | undefined, assetId: string) {
		try {
			if (taskId) {
				return await pb.collection<AITaskRecord>("ai_tasks").getOne(taskId, { requestKey: null })
			}
			const tasks = await loadLatestAITasksByKind(pb.collection<AITaskRecord>("ai_tasks"), { assetId })
			return tasks.find((task) => task.kind === "asset_visual")
		} catch (error) {
			if (!isPocketBaseAutoCancel(error)) {
				console.warn("load asset visual task", error)
			}
			return undefined
		}
	}

	async function importAssetVisualCandidate(visualId: string, frameIndex: number) {
		if (!asset) throw new Error("资产不存在")
		try {
			const result = await pb.send<{ media: { id: string }; version: { id: string } }>(
				`/api/pulse/assets/${asset.id}/media/import-visual`,
				{ method: "POST", body: { visual_id: visualId, frame_index: frameIndex } }
			)
			await notifyAssetMediaChanged(asset.id)
			toast({ title: "已加入图片库", description: "候选图片已归档到本地媒体库。" })
			return result.media.id
		} catch (error) {
			toast({
				title: "加入图片库失败",
				description: error instanceof Error ? error.message : "请稍后重试",
				variant: "destructive",
			})
			throw error
		}
	}

	async function saveAssetProfile(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault()
		if (!asset || readOnly) return
		const form = new FormData(event.currentTarget)
		const metadata = { ...(asset.metadata ?? {}) }
		const name = form.get("name")?.toString().trim() || asset.name
		const fixedIpv4 = form.get("fixed_ipv4")?.toString().trim() || ""
		const managementIp = form.get("management_ip")?.toString().trim() || fixedIpv4
		const targetType = (form.get("type")?.toString() as AssetRecord["type"] | undefined) || asset.type
		const schemaFields = getAssetFormSections(targetType).flatMap((section) => section.fields)
		for (const field of schemaFields) {
			const value = form.get(field.key)
			if (value === null || field.source !== "metadata") continue
			const normalized = value.toString().trim()
			metadata[field.key] = field.type === "number" && normalized ? Number(normalized) : normalized
		}
		metadata.color = form.get("color")?.toString().trim() || ""
		if (targetType !== "ont") metadata.device_color = metadata.color
		metadata.asset_tag = form.get("asset_tag")?.toString().trim() || metadata.asset_tag || ""
		metadata.fixed_ipv4 = fixedIpv4
		const colorsAvailable = form.get("colors_available")?.toString().trim()
		if (colorsAvailable) {
			metadata.colors_available = colorsAvailable
			metadata.official_colors = colorsAvailable
		}
		if (isPhoneVariantSpecRequired(targetType)) {
			metadata.memory_gb = Number(form.get("memory_gb")?.toString().trim())
			metadata.storage_gb = Number(form.get("storage_gb")?.toString().trim())
		}
		if (targetType === "internet") {
			metadata.public_ip_auto_refresh = form.get("public_ip_auto_refresh") === "no" ? "no" : "yes"
			metadata.public_ip_refresh_interval_minutes = Number(
				form.get("public_ip_refresh_interval_minutes")?.toString() || 30
			)
			const errors = validateInternetAssetValues({
				name,
				provider: form.get("vendor")?.toString() ?? "",
				status: (form.get("status")?.toString() as AssetRecord["status"]) ?? asset.status ?? "active",
				accessTechnology: String(metadata.access_technology ?? ""),
				authMode: String(metadata.auth_mode ?? ""),
				downMbps: Number(metadata.down_mbps),
				upMbps: Number(metadata.up_mbps),
			})
			if (errors.length > 0) {
				toast({ title: "宽带资料未填完整", description: errors.join("、"), variant: "destructive" })
				return
			}
		}
		if (targetType === "ont") {
			const errors = validateOntAssetValues({
				name,
				vendor: form.get("vendor")?.toString() ?? "",
				model: form.get("model")?.toString() ?? "",
				status: (form.get("status")?.toString() as AssetRecord["status"]) ?? asset.status ?? "active",
				location: form.get("location")?.toString() ?? "",
				carrier: String(metadata.carrier ?? ""),
				operatingRole: String(metadata.operating_role ?? ""),
			})
			if (errors.length > 0) {
				toast({ title: "光猫 / ONT 资料未填完整", description: errors.join("、"), variant: "destructive" })
				return
			}
		}
		const normalizedRole = form.get("role")?.toString().trim() || ""
		setSaving(true)
		try {
			await pb.collection("assets").update(asset.id, {
				name,
				type: targetType,
				status: form.get("status")?.toString() || asset.status || "active",
				vendor:
					targetType === "internet"
						? normalizeInternetProvider(form.get("vendor")?.toString() ?? "")
						: form.get("vendor")?.toString().trim() || "",
				model: form.get("model")?.toString().trim() || "",
				serial_number: form.get("serial_number")?.toString().trim() || "",
				management_ip: managementIp,
				location: targetType === "internet" ? asset.location || "" : form.get("location")?.toString().trim() || "",
				role: normalizedRole,
				notes: form.get("notes")?.toString().trim() || "",
				metadata,
			})
			if (targetType === "internet") {
				try {
					await pb.send(`/api/pulse/assets/${asset.id}/internet-addresses/refresh`, { method: "POST" })
				} catch (error) {
					console.warn("refresh internet public addresses", error)
				}
			}
			await loadDetail({ waitSecondary: true, preserveContent: true })
			toast({ title: "资产主档已保存", description: name })
		} catch (error) {
			console.error("save asset profile", error)
			toast({ title: "资产保存失败", description: "请检查字段、权限或重复主数据。", variant: "destructive" })
		} finally {
			setSaving(false)
		}
	}

	async function runSmartRecognition() {
		if (!asset || readOnly || saving) return
		const missing = recognitionRequirements.filter((item) => !item.ok)
		if (missing.length > 0) {
			toast({
				title: "智能匹配缺少必填参数",
				description: missing.map((item) => item.label).join("、"),
				variant: "destructive",
			})
			return
		}
		setSaving(true)
		try {
			await pb.send(`/api/pulse/assets/${asset.id}/enrichment-reports`, { method: "POST" })
			await loadDetail({ waitSecondary: true, preserveContent: true })
			toast({ title: "智能匹配完成", description: "新的参数候选已整理到对应参数框的箭头菜单中。" })
		} catch (error) {
			console.error("run smart asset recognition", error)
			toast({ title: "智能匹配失败", description: "请检查 Agnes 配置、资产参数或 Hub 日志。", variant: "destructive" })
		} finally {
			setSaving(false)
		}
	}

	async function refreshInternetAddresses() {
		if (asset?.type !== "internet" || readOnly || internetAddressRefreshing) return
		setInternetAddressRefreshing(true)
		try {
			const result = await pb.send(`/api/pulse/assets/${asset.id}/internet-addresses/refresh`, { method: "POST" })
			await loadDetail({ waitSecondary: true, preserveContent: true })
			toast(getInternetAddressRefreshFeedback(result))
		} catch (error) {
			console.error("refresh internet public addresses", error)
			toast({ title: "刷新公网地址失败", description: "请检查网络连接或稍后重试。", variant: "destructive" })
		} finally {
			setInternetAddressRefreshing(false)
		}
	}

	async function updateInternetAddressSettings(settings: InternetAddressAutoRefreshSettings) {
		if (asset?.type !== "internet" || readOnly || internetAddressRefreshing) return
		setInternetAddressRefreshing(true)
		try {
			await pb.send(`/api/pulse/assets/${asset.id}/internet-addresses/settings`, {
				method: "POST",
				body: { enabled: settings.enabled, interval_minutes: settings.intervalMinutes },
			})
			await loadDetail({ waitSecondary: true, preserveContent: true })
			toast({
				title: settings.enabled ? "公网地址自动更新已开启" : "公网地址自动更新已关闭",
				description: settings.enabled ? "已立即刷新并重新计算下次更新时间。" : "仍可随时手动刷新。",
			})
		} catch (error) {
			console.error("update internet public address settings", error)
			toast({ title: "自动更新设置失败", description: "请稍后重试。", variant: "destructive" })
		} finally {
			setInternetAddressRefreshing(false)
		}
	}

	async function acceptEnrichmentSuggestionDirect(suggestion: AssetEnrichmentSuggestionRecord, confirm = false) {
		if (readOnly) {
			toast({ title: "只读账号不能更新资产主档", variant: "destructive" })
			return
		}
		if (confirm) {
			const confirmed = window.confirm(
				`确认写入「${suggestion.target_label}」？\n\n当前值：${suggestion.current_value || "未填写"}\n推荐值：${suggestion.recommended_value}\n\n此操作会进入资产变更历史。`
			)
			if (!confirmed) return
		}
		setSaving(true)
		try {
			await pb.send(`/api/pulse/asset-enrichment-suggestions/${suggestion.id}/accept`, { method: "POST" })
			await loadDetail({ waitSecondary: true })
			toast({ title: "参数已替换", description: suggestion.target_label })
		} catch (error) {
			console.error("accept asset enrichment suggestion", error)
			toast({ title: "参数替换失败", description: "请重新生成报告或检查主数据重复约束。", variant: "destructive" })
		} finally {
			setSaving(false)
		}
	}

	async function deleteAsset() {
		if (!asset || readOnly) return
		if (!window.confirm(`确认删除资产「${asset.name}」？关联监控不会自动删除，但资产关系会失效。`)) {
			return
		}
		setSaving(true)
		try {
			await pb.collection("assets").delete(asset.id)
			toast({ title: "资产已删除", description: asset.name })
			window.location.href = getPagePath($router, "assets")
		} catch (error) {
			console.error("delete asset", error)
			toast({ title: "资产删除失败", description: "请先清理关联关系或检查权限。", variant: "destructive" })
		} finally {
			setSaving(false)
		}
	}

	async function acceptEnrichmentSuggestion(suggestion: AssetEnrichmentSuggestionRecord) {
		await acceptEnrichmentSuggestionDirect(suggestion, true)
	}

	async function rejectEnrichmentSuggestion(suggestion: AssetEnrichmentSuggestionRecord) {
		if (readOnly) return
		setSaving(true)
		try {
			await pb.send(`/api/pulse/asset-enrichment-suggestions/${suggestion.id}/reject`, { method: "POST" })
			await loadDetail({ waitSecondary: true })
			toast({ title: "补全建议已忽略", description: suggestion.target_label })
		} catch (error) {
			console.error("reject asset enrichment suggestion", error)
			toast({ title: "补全建议忽略失败", description: "请检查权限或 Hub 日志。", variant: "destructive" })
		} finally {
			setSaving(false)
		}
	}

	async function saveRelation(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault()
		if (!asset) return
		const form = new FormData(event.currentTarget)
		await ensureAssetEditCatalogLoaded()
		const target = form.get("target_asset")?.toString() || ""
		if (!target) {
			toast({ title: "请选择目标资产", variant: "destructive" })
			return
		}
		const kind = (form.get("kind")?.toString() || "connected_to") as AssetRelationKind
		const currentInterface = form.get("current_interface")?.toString() || ""
		const peerInterface = form.get("peer_interface")?.toString() || ""
		const linkKind = form.get("link_kind")?.toString() || ""
		const selectedCurrentInterface = currentInterface
			? state.allInterfaces.find((item) => item.id === currentInterface)
			: undefined
		if (currentInterface && selectedCurrentInterface?.asset !== asset.id) {
			toast({ title: "本资产接口无效", description: "请选择当前资产下的接口。", variant: "destructive" })
			return
		}
		const selectedPeerInterface = peerInterface
			? state.allInterfaces.find((item) => item.id === peerInterface)
			: undefined
		if (peerInterface && selectedPeerInterface?.asset !== target) {
			toast({
				title: "对端接口和目标资产不匹配",
				description: "请重新选择目标资产或对端接口。",
				variant: "destructive",
			})
			return
		}
		const sourceAsset = editingRelation?.source_asset && editingRelation.source_asset !== asset.id ? target : asset.id
		const targetAsset = editingRelation?.source_asset && editingRelation.source_asset !== asset.id ? asset.id : target
		const sourceInterface = sourceAsset === asset.id ? currentInterface : peerInterface
		const targetInterface = targetAsset === asset.id ? currentInterface : peerInterface
		const duplicate = state.relations.some(
			(relation) =>
				relation.id !== editingRelation?.id &&
				relation.source_asset === sourceAsset &&
				relation.target_asset === targetAsset &&
				relation.kind === kind &&
				getMetadataString(relation.metadata, "source_interface") === sourceInterface &&
				getMetadataString(relation.metadata, "target_interface") === targetInterface
		)
		if (duplicate) {
			toast({ title: "关系已存在", description: "同一目标、类型和端点不要重复添加。", variant: "destructive" })
			return
		}
		const user = pb.authStore.record?.id
		if (!user) return
		const payload = {
			user,
			source_asset: sourceAsset,
			target_asset: targetAsset,
			kind,
			label: form.get("label")?.toString().trim(),
			metadata: buildRelationMetadata({
				relation: editingRelation,
				currentAssetId: asset.id,
				sourceAsset,
				targetAsset,
				currentInterface,
				peerInterface,
				linkKind,
				notes: form.get("notes")?.toString().trim() || "",
			}),
		}
		setSaving(true)
		try {
			if (editingRelation) {
				await pb.collection("asset_relations").update(editingRelation.id, payload)
			} else {
				await pb.collection("asset_relations").create(payload)
			}
			setEditingRelation(null)
			setRelationDialogOpen(false)
			await loadDetail()
			toast({ title: editingRelation ? "关系已更新" : "关系已添加", description: assetMap.get(target)?.name })
		} catch (error) {
			console.error("save asset relation", error)
			toast({ title: "关系保存失败", description: "请检查字段和权限。", variant: "destructive" })
		} finally {
			setSaving(false)
		}
	}

	async function saveMaintenance(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault()
		if (!asset) return
		const form = new FormData(event.currentTarget)
		const title = form.get("title")?.toString().trim() || ""
		if (!title) {
			toast({ title: "记录标题不能为空", variant: "destructive" })
			return
		}
		const user = pb.authStore.record?.id
		if (!user) return
		const payload = {
			user,
			asset: asset.id,
			kind: form.get("kind")?.toString() || "note",
			title,
			event_date: normalizeDateInput(form.get("event_date")?.toString()),
			actor: form.get("actor")?.toString().trim(),
			cost: form.get("cost")?.toString().trim(),
			notes: form.get("notes")?.toString().trim(),
			metadata: editingMaintenance?.metadata ?? {},
		}
		setSaving(true)
		try {
			if (editingMaintenance) {
				await pb.collection("asset_maintenance").update(editingMaintenance.id, payload)
			} else {
				await pb.collection("asset_maintenance").create(payload)
			}
			setEditingMaintenance(null)
			setMaintenanceDialogOpen(false)
			await loadDetail()
			toast({ title: editingMaintenance ? "维护记录已更新" : "维护记录已添加", description: title })
		} catch (error) {
			console.error("save asset maintenance", error)
			toast({ title: "维护记录保存失败", description: "请检查字段和权限。", variant: "destructive" })
		} finally {
			setSaving(false)
		}
	}

	async function clearOtherPrimaryInterfaces(assetId: string, keepId: string) {
		const records = state.interfaces.filter((item) => item.asset === assetId && item.id !== keepId && item.primary)
		await Promise.all(records.map((record) => pb.collection("asset_interfaces").update(record.id, { primary: false })))
	}

	function openInterfaceManager() {
		setInterfaceManagerOpen(true)
	}

	function openAddInterfaceDialog() {
		interfaceDialogCloseGuardRef.current = managementDialogOpen
		setEditingInterface(null)
		setInterfaceKindDraft("ethernet")
		setInterfaceDialogOpen(true)
	}

	function openEditInterfaceDialog(record: AssetInterfaceRecord) {
		interfaceDialogCloseGuardRef.current = managementDialogOpen
		setEditingInterface(record)
		setInterfaceKindDraft(record.kind)
		setInterfaceDialogOpen(true)
	}

	function closeInterfaceDialog() {
		setInterfaceDialogOpen(false)
		setEditingInterface(null)
		window.setTimeout(() => {
			const releaseGuard = () => {
				interfaceDialogCloseGuardRef.current = false
				document.removeEventListener("pointerdown", releaseGuard, true)
				document.removeEventListener("keydown", releaseGuard, true)
			}
			document.addEventListener("pointerdown", releaseGuard, true)
			document.addEventListener("keydown", releaseGuard, true)
		}, 0)
	}

	async function deleteInterface(record: AssetInterfaceRecord) {
		if (readOnly) return
		const stateText = [record.connected ? "当前接入" : "", record.primary ? "主接口" : ""].filter(Boolean).join("、")
		if (
			!window.confirm(`确定删除网卡“${record.name}”吗？${stateText ? `它是${stateText}，删除后对应标识会消失。` : ""}`)
		) {
			return
		}
		try {
			await pb.collection("asset_interfaces").delete(record.id)
			await loadDetail({ preserveContent: true })
			toast({ title: "网卡已删除", description: record.name })
		} catch (error) {
			console.error("delete asset interface", error)
			toast({ title: "网卡删除失败", description: "请检查权限或稍后重试。", variant: "destructive" })
		}
	}

	function openAddRelationDialog() {
		ensureAssetEditCatalogLoaded().catch((error) => {
			if (!isPocketBaseAutoCancel(error)) {
				console.warn("ensure asset relation catalog", error)
			}
		})
		setEditingRelation(null)
		setRelationForm(getEmptyRelationFormForGuide(asset?.type === "internet" ? "internet" : undefined))
		setRelationDialogOpen(true)
	}

	function updateRelationFormValue<K extends keyof RelationFormState>(key: K, value: RelationFormState[K]) {
		setRelationForm((current) => ({ ...current, [key]: value }))
	}

	function updateRelationTarget(targetAsset: string) {
		setRelationForm((current) => {
			const peerInterface = state.allInterfaces.find((item) => item.id === current.peer_interface)
			return {
				...current,
				target_asset: targetAsset,
				peer_interface: peerInterface?.asset === targetAsset ? current.peer_interface : "",
			}
		})
	}

	function openAddMaintenanceDialog() {
		setEditingMaintenance(null)
		setMaintenanceDialogOpen(true)
	}

	function openAddAttachmentDialog() {
		setAttachmentDialogOpen(true)
	}

	async function saveAttachment(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const user = pb.authStore.record?.id
		if (!user || !asset) return
		const formData = new FormData(event.currentTarget)
		const title = String(formData.get("title") || "").trim()
		const files = formData.getAll("files").filter((file) => file instanceof File && file.size > 0) as File[]
		if (!title) {
			toast({ title: "附件标题不能为空", variant: "destructive" })
			return
		}
		if (files.length === 0) {
			toast({ title: "请选择要上传的文件", variant: "destructive" })
			return
		}
		formData.set("user", user)
		formData.set("asset", asset.id)
		formData.set("title", title)
		setSaving(true)
		try {
			await pb.collection("asset_attachments").create(formData)
			await loadDetail()
			setAttachmentDialogOpen(false)
			toast({ title: "资产附件已上传", description: title })
		} catch (error) {
			console.error("save asset attachment", error)
			toast({ title: "附件上传失败", description: "请检查文件大小、格式和权限。", variant: "destructive" })
		} finally {
			setSaving(false)
		}
	}

	if (loading) {
		return <EmptyState loading loadingText="正在读取资产详情" emptyText="暂无资产" />
	}

	if (!asset) {
		return (
			<EmptyState loading={false} loadingText="正在读取资产详情" emptyText="资产不存在或没有权限查看">
				<Button asChild variant="outline">
					<Link href={getPagePath($router, "assets")}>返回资产中心</Link>
				</Button>
			</EmptyState>
		)
	}
	const AssetIcon = getAssetIcon(asset.type)
	const assetTag = getMetadataString(asset.metadata, "asset_tag")
	return (
		<div className="grid pulse-card-gap">
			<section className="rounded-lg border border-border/70 bg-card px-4 py-3 shadow-none">
				<div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
					<div className="min-w-0">
						<Button
							asChild
							variant="ghost"
							size="sm"
							className="-ms-2 h-7 w-fit gap-1.5 px-2 text-xs text-muted-foreground"
						>
							<Link href={getPagePath($router, "assets")}>
								<ArrowLeftIcon className="size-3.5" />
								资产中心
							</Link>
						</Button>
						<div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-2">
							<div className="grid size-9 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft text-muted-foreground">
								<AssetIcon className="size-4" />
							</div>
							<h1 className="max-w-[min(24rem,70vw)] truncate text-xl font-semibold text-foreground">{asset.name}</h1>
							{assetTag && (
								<span className="inline-flex h-6 max-w-[10rem] shrink-0 items-center rounded-md border border-border/70 bg-surface-soft px-2 font-mono text-[11px] font-medium text-muted-foreground">
									{assetTag}
								</span>
							)}
							<Badge variant="secondary" className="h-6 rounded-md px-2 text-[11px]">
								{getAssetTypeLabel(asset.type)}
							</Badge>
							<StatusBadge status={asset.status || "active"} internet={asset.type === "internet"} />
						</div>
					</div>
					<div className="ms-auto min-w-0 shrink-0">
						<AssetDetailActionMenu
							readOnly={readOnly}
							editAction={
								<Button
									variant="outline"
									size="sm"
									className="h-9 min-h-9 shrink-0 gap-1.5 px-2.5"
									onClick={() => {
										setManagementDialogOpen(true)
										ensureAssetEditCatalogLoaded().catch((error) => {
											if (!isPocketBaseAutoCancel(error)) {
												console.warn("ensure asset edit catalog", error)
											}
										})
									}}
								>
									<PencilIcon data-icon="inline-start" className="size-3.5" />
									编辑
								</Button>
							}
							onOpenInterface={openInterfaceManager}
							onOpenRelation={openAddRelationDialog}
							onOpenMaintenance={openAddMaintenanceDialog}
							onOpenAttachment={openAddAttachmentDialog}
							onDelete={deleteAsset}
							showInterface={asset.type !== "internet"}
							relationLabel={asset.type === "internet" ? "接入关系" : "关系"}
						/>
					</div>
				</div>
				<div className="mt-3 border-t border-border/70 pt-3">
					<AssetShowcaseTags asset={asset} />
				</div>
			</section>

			<AssetShowcaseWorkspace
				asset={asset}
				media={assetMedia}
				assets={state.assets}
				interfaces={state.allInterfaces}
				relations={state.relations}
				readOnly={readOnly}
				internetAddressRefreshing={internetAddressRefreshing}
				onRefreshInternetAddresses={refreshInternetAddresses}
				onUpdateInternetAddressSettings={updateInternetAddressSettings}
			/>

			<Dialog
				open={managementDialogOpen}
				onOpenChange={(open) => {
					if (!open && interfaceDialogOpen) return
					if (!open && interfaceDialogCloseGuardRef.current) return
					setManagementDialogOpen(open)
				}}
			>
				<AssetEditWorkbench
					asset={asset}
					state={state}
					nestedDialogOpen={interfaceDialogOpen}
					defaultMediaPreview={getAssetMediaDefaultPreview(assetMedia.covers, undefined)}
					readOnly={readOnly}
					saving={saving}
					visualGenerationStage={visualGenerationStage}
					visualGenerationMessage={visualGenerationMessage}
					internetAddressRefreshing={internetAddressRefreshing}
					latestSuggestions={latestEnrichmentSuggestions}
					onSaveProfile={saveAssetProfile}
					onRunSmartRecognition={runSmartRecognition}
					onRefreshInternetAddresses={refreshInternetAddresses}
					onAddInterface={openAddInterfaceDialog}
					onEditInterface={openEditInterfaceDialog}
					onDeleteInterface={(record) => {
						deleteInterface(record).catch((error) => console.error("delete asset interface", error))
					}}
					onGenerateVisual={() =>
						generateTurntableVisual().catch((error) => console.error("collect asset visual images", error))
					}
					onImportVisualCandidate={importAssetVisualCandidate}
				/>
			</Dialog>

			{enrichmentReportDialogOpen && (
				<Suspense fallback={null}>
					<AssetEnrichmentReportDialog
						reports={state.enrichmentReports}
						suggestions={state.enrichmentSuggestions}
						reportDialogOpen={enrichmentReportDialogOpen}
						onReportDialogOpenChange={setEnrichmentReportDialogOpen}
						readOnly={readOnly}
						saving={saving}
						onAccept={acceptEnrichmentSuggestion}
						onReject={rejectEnrichmentSuggestion}
					/>
				</Suspense>
			)}

			<Dialog open={interfaceManagerOpen} onOpenChange={setInterfaceManagerOpen}>
				<DialogContent className="max-w-3xl">
					<DialogHeader>
						<DialogTitle>{asset.type === "switch" ? "网口设置" : "网卡管理"}</DialogTitle>
						<DialogDescription>
							{asset.type === "switch"
								? "逐口维护端口角色、支持速率、协商速率、启用与接线状态。"
								: "维护这个资产的全部网卡、接入方式、速率和当前接入状态。"}
						</DialogDescription>
					</DialogHeader>
					<AssetInterfaceManager
						interfaces={state.interfaces}
						assetType={asset.type}
						readOnly={readOnly}
						onAdd={openAddInterfaceDialog}
						onEdit={openEditInterfaceDialog}
						onDelete={(record) => {
							deleteInterface(record).catch((error) => console.error("delete asset interface", error))
						}}
					/>
				</DialogContent>
			</Dialog>

			<Dialog
				open={interfaceDialogOpen}
				onOpenChange={(open) => {
					if (open) {
						setInterfaceDialogOpen(true)
					} else {
						closeInterfaceDialog()
					}
				}}
			>
				<DialogContent className="max-w-2xl">
					<form key={editingInterface?.id ?? "new-interface"} onSubmit={saveInterface} className="grid gap-4">
						<DialogHeader>
							<DialogTitle>{editingInterface ? "编辑接口" : "添加接口"}</DialogTitle>
							<DialogDescription>接口只负责网络身份：名称、类型、IP、MAC、速率和是否作为主接口。</DialogDescription>
						</DialogHeader>
						<div className="grid gap-3">
							<DialogFormSection
								icon={<NetworkIcon className="size-4" />}
								title="接口身份"
								description="决定这个端口在资产、拓扑和后续监控里怎么被识别。"
							>
								<TextField
									name="name"
									label="接口名称"
									placeholder="主网卡 / LAN1 / Wi-Fi"
									required
									defaultValue={editingInterface?.name}
								/>
								<SelectField
									name="kind"
									label="网络接入方式"
									options={interfaceKindOptions}
									value={interfaceKindDraft}
									onChange={(value) => setInterfaceKindDraft(value as AssetInterfaceKind)}
								/>
								<SelectField
									name="enabled"
									label="启用状态"
									options={[
										{ value: "yes", label: "启用" },
										{ value: "no", label: "未启用" },
									]}
									defaultValue={editingInterface?.metadata?.enabled === false ? "no" : "yes"}
								/>
								<SelectField
									name="interface_role"
									label="接口角色"
									options={[
										{ value: "uplink", label: "上联" },
										{ value: "downlink", label: "下联" },
										{ value: "lan", label: "LAN" },
										{ value: "radio", label: "无线频段" },
									]}
									defaultValue={getMetadataString(editingInterface?.metadata, "role") || "lan"}
								/>
								{interfaceKindDraft === "wifi" ? (
									<>
										<SelectField
											name="wifi_standard"
											label="无线标准"
											placeholder="选择标准"
											options={[
												{ value: "Wi-Fi 4", label: "Wi-Fi 4" },
												{ value: "Wi-Fi 5", label: "Wi-Fi 5" },
												{ value: "Wi-Fi 6", label: "Wi-Fi 6" },
												{ value: "Wi-Fi 6E", label: "Wi-Fi 6E" },
												{ value: "Wi-Fi 7", label: "Wi-Fi 7" },
											]}
											defaultValue={getMetadataString(editingInterface?.metadata, "wifi_standard")}
										/>
										<SelectField
											name="band"
											label="无线频段"
											placeholder="选择频段"
											options={[
												{ value: "2.4 GHz", label: "2.4 GHz" },
												{ value: "5 GHz", label: "5 GHz" },
												{ value: "6 GHz", label: "6 GHz" },
											]}
											defaultValue={getMetadataString(editingInterface?.metadata, "band")}
										/>
									</>
								) : null}
								<SelectField
									name="connected"
									label="当前接入"
									options={yesNoOptions()}
									defaultValue={editingInterface?.connected === false ? "no" : "yes"}
								/>
								<SelectField
									name="primary"
									label="主接口"
									options={yesNoOptions()}
									defaultValue={editingInterface?.primary ? "yes" : "no"}
								/>
							</DialogFormSection>
							<DialogFormSection
								icon={<NetworkIcon className="size-4" />}
								title="网络参数"
								description="这些字段会被网络拓扑和资产识别复用，尽量填写长期稳定值。"
							>
								<TextField
									name="mac"
									label="MAC"
									placeholder="AA:BB:CC:DD:EE:FF"
									defaultValue={editingInterface?.mac}
								/>
								<TextField
									name="speed_mbps"
									label="网卡速率 Mbps"
									type="number"
									placeholder="2500"
									defaultValue={editingInterface?.speed_mbps ? String(editingInterface.speed_mbps) : ""}
								/>
								<TextField name="ipv4" label="IPv4" placeholder="192.168.1.10" defaultValue={editingInterface?.ipv4} />
								<TextField name="ipv6" label="IPv6" placeholder="可选" defaultValue={editingInterface?.ipv6} />
								<TextField
									name="connection_note"
									label="接线说明"
									placeholder="例如 交换机（待建档）"
									defaultValue={getMetadataString(editingInterface?.metadata, "connection_note")}
								/>
								<TextAreaField
									name="notes"
									label="备注"
									className="sm:col-span-2"
									defaultValue={getMetadataNotes(editingInterface?.metadata)}
								/>
							</DialogFormSection>
						</div>
						<DialogFooter>
							<Button variant="outline" onClick={closeInterfaceDialog} disabled={saving}>
								取消
							</Button>
							<Button type="submit" disabled={saving || readOnly}>
								{saving ? "保存中" : editingInterface ? "保存接口" : "添加接口"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			<Dialog
				open={relationDialogOpen}
				onOpenChange={(open) => {
					setRelationDialogOpen(open)
					if (!open) {
						setEditingRelation(null)
						setRelationForm(emptyRelationForm)
					}
				}}
			>
				<DialogContent className="max-w-2xl">
					<form key={editingRelation?.id ?? "new-relation"} onSubmit={saveRelation} className="grid gap-4">
						<DialogHeader>
							<DialogTitle>{editingRelation ? "编辑关系" : "添加关系"}</DialogTitle>
							<DialogDescription>
								{selectedRelationGuide
									? `${selectedRelationGuide.label}：${selectedRelationGuide.description}。保存后会写入资产关系主数据。`
									: "关系只负责资产之间的连接、承载、依赖、归属和供电，不记录运行状态。"}
							</DialogDescription>
						</DialogHeader>
						{!editingRelation && (
							<div className="grid gap-2 rounded-lg border border-border/70 bg-surface-soft p-3">
								<div className="text-xs font-medium text-muted-foreground">常用关系场景</div>
								<div className="grid gap-2 sm:grid-cols-2">
									{relationGuides
										.filter((guide) => (asset.type === "internet" ? guide.id === "internet" : guide.id !== "internet"))
										.map((guide) => (
											<button
												key={guide.id}
												type="button"
												onClick={() => setRelationForm(getEmptyRelationFormForGuide(guide.id))}
												className={cn(
													"rounded-md border px-3 py-2 text-left transition-colors",
													relationForm.guide === guide.id
														? "border-foreground/25 bg-card text-foreground shadow-xs"
														: "border-border/70 bg-card/70 text-muted-foreground hover:bg-card"
												)}
											>
												<div className="text-sm font-medium">{guide.label}</div>
												<div className="mt-1 text-xs leading-5">{guide.description}</div>
											</button>
										))}
								</div>
							</div>
						)}
						<div className="grid gap-3">
							<DialogFormSection
								icon={<LinkIcon className="size-4" />}
								title="关系端点"
								description="先确定连接对象，再选择两端接口；拓扑会优先使用这里的端点。"
							>
								{asset.type === "internet" ? (
									<div className="grid gap-2">
										<Label>关系类型</Label>
										<div className="flex h-10 items-center rounded-md border border-border/70 bg-surface-soft px-3 text-sm">
											网络连接
										</div>
										<input type="hidden" name="kind" value="connected_to" />
									</div>
								) : (
									<SelectField
										name="kind"
										label="关系类型"
										options={relationKindOptions}
										value={relationForm.kind}
										onChange={(value) => updateRelationFormValue("kind", value as AssetRelationKind)}
									/>
								)}
								<SelectField
									name="target_asset"
									label="目标资产"
									options={relationTargetOptions}
									placeholder="选择目标资产"
									value={relationForm.target_asset}
									onChange={updateRelationTarget}
								/>
								{asset.type !== "internet" ? (
									<SelectField
										name="current_interface"
										label="本资产接口"
										options={getAssetInterfaceOptions(state.allInterfaces, asset.id)}
										value={relationForm.current_interface}
										onChange={(value) => updateRelationFormValue("current_interface", value)}
									/>
								) : null}
								<SelectField
									name="peer_interface"
									label="对端接口"
									options={relationPeerInterfaceOptions}
									value={relationForm.peer_interface}
									onChange={(value) => updateRelationFormValue("peer_interface", value)}
								/>
							</DialogFormSection>
							<DialogFormSection
								icon={<NetworkIcon className="size-4" />}
								title="显示与链路"
								description="只影响这条关系在拓扑和资产详情里的显示方式。"
							>
								{asset.type === "internet" ? (
									<div className="grid gap-2">
										<Label>链路类型</Label>
										<div className="flex h-10 items-center rounded-md border border-border/70 bg-surface-soft px-3 text-sm">
											外网链路
										</div>
										<input type="hidden" name="link_kind" value="internet" />
									</div>
								) : (
									<SelectField
										name="link_kind"
										label="链路类型"
										options={relationLinkKindOptions}
										value={relationForm.link_kind}
										onChange={(value) => updateRelationFormValue("link_kind", value)}
									/>
								)}
								<TextField
									name="label"
									label="显示名称"
									placeholder={selectedRelationGuide?.labelPlaceholder ?? "例如 LAN1 -> 主机"}
									defaultValue={relationForm.label}
								/>
								<TextAreaField name="notes" label="备注" className="sm:col-span-2" defaultValue={relationForm.notes} />
							</DialogFormSection>
						</div>
						<DialogFooter>
							<Button variant="outline" onClick={() => setRelationDialogOpen(false)} disabled={saving}>
								取消
							</Button>
							<Button type="submit" disabled={saving || readOnly}>
								{saving ? "保存中" : editingRelation ? "保存关系" : "添加关系"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			<Dialog
				open={maintenanceDialogOpen}
				onOpenChange={(open) => {
					setMaintenanceDialogOpen(open)
					if (!open) setEditingMaintenance(null)
				}}
			>
				<DialogContent className="max-w-2xl">
					<form key={editingMaintenance?.id ?? "new-maintenance"} onSubmit={saveMaintenance} className="grid gap-4">
						<DialogHeader>
							<DialogTitle>{editingMaintenance ? "编辑维护记录" : "添加维护记录"}</DialogTitle>
							<DialogDescription>维护记录只记录生命周期事件，不混入实时监控状态。</DialogDescription>
						</DialogHeader>
						<DialogFormSection
							icon={<CalendarClockIcon className="size-4" />}
							title="事件信息"
							description="把购买、上线、维修、升级、保修、退役等长期事件归档到资产。"
						>
							<SelectField
								name="kind"
								label="记录类型"
								options={maintenanceKindOptions}
								defaultValue={editingMaintenance?.kind || "maintenance"}
							/>
							<TextField
								name="event_date"
								label="日期"
								type="date"
								defaultValue={getDateInputValue(editingMaintenance?.event_date)}
							/>
							<TextField
								name="title"
								label="标题"
								placeholder="例如 更换 SSD / 保修到期 / 初次上线"
								required
								defaultValue={editingMaintenance?.title}
							/>
							<TextField
								name="actor"
								label="处理人 / 来源"
								placeholder="例如 自己 / 售后 / 京东"
								defaultValue={editingMaintenance?.actor}
							/>
							<TextField name="cost" label="费用 / 金额" placeholder="可选" defaultValue={editingMaintenance?.cost} />
							<TextAreaField
								name="notes"
								label="备注"
								className="sm:col-span-2"
								defaultValue={editingMaintenance?.notes}
							/>
						</DialogFormSection>
						<DialogFooter>
							<Button variant="outline" onClick={() => setMaintenanceDialogOpen(false)} disabled={saving}>
								取消
							</Button>
							<Button type="submit" disabled={saving || readOnly}>
								{saving ? "保存中" : editingMaintenance ? "保存记录" : "添加记录"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			<Dialog open={attachmentDialogOpen} onOpenChange={setAttachmentDialogOpen}>
				<DialogContent className="max-w-2xl">
					<form onSubmit={saveAttachment} className="grid gap-4">
						<DialogHeader>
							<DialogTitle>上传资产附件</DialogTitle>
							<DialogDescription>附件入口只保存可追溯材料：照片、发票、保修凭证、说明书和配置备份。</DialogDescription>
						</DialogHeader>
						<DialogFormSection
							icon={<PaperclipIcon className="size-4" />}
							title="附件归档"
							description="上传后会进入资产附件主数据，后续可作为保修、盘点和配置备份依据。"
						>
							<SelectField name="kind" label="附件类型" options={attachmentKindOptions} defaultValue="document" />
							<TextField name="title" label="标题" placeholder="例如 购买发票 / 设备铭牌 / 路由器配置备份" required />
							<div className="grid gap-2 sm:col-span-2">
								<Label htmlFor="asset-attachment-files">
									文件<span className="ms-1 text-destructive">*</span>
								</Label>
								<Input id="asset-attachment-files" name="files" type="file" multiple required />
								<div className="text-xs leading-5 text-muted-foreground">
									单个文件最大 20 MB，支持图片、PDF、文本、JSON、ZIP 和 YAML。
								</div>
							</div>
							<TextAreaField name="notes" label="备注" className="sm:col-span-2" />
						</DialogFormSection>
						<DialogFooter>
							<Button variant="outline" onClick={() => setAttachmentDialogOpen(false)} disabled={saving}>
								取消
							</Button>
							<Button type="submit" disabled={saving || readOnly}>
								{saving ? "上传中" : "上传附件"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</div>
	)
})

function DialogFormSection({
	icon,
	title,
	description,
	children,
}: {
	icon: ReactNode
	title: string
	description: string
	children: ReactNode
}) {
	return (
		<section className="rounded-lg border border-border/70 bg-surface-soft p-3">
			<div className="mb-3 flex min-w-0 items-start gap-2">
				<span className="grid size-8 shrink-0 place-items-center rounded-md border border-border/70 bg-card text-muted-foreground">
					{icon}
				</span>
				<div className="min-w-0">
					<div className="text-sm font-semibold text-foreground">{title}</div>
					<div className="mt-1 text-xs leading-5 text-muted-foreground">{description}</div>
				</div>
			</div>
			<div className="grid gap-3 sm:grid-cols-2">{children}</div>
		</section>
	)
}

function StatusBadge({
	status,
	internet = false,
}: {
	status: "active" | "inactive" | "retired" | "planned"
	internet?: boolean
}) {
	return (
		<span
			className={cn(
				"inline-flex min-h-6 items-center rounded-md border px-2 text-xs font-medium",
				status === "active"
					? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
					: status === "planned"
						? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
						: "border-border/70 bg-card text-muted-foreground"
			)}
		>
			{internet ? getInternetStatusLabel(status) : getStatusLabel(status)}
		</span>
	)
}

function yesNoOptions() {
	return [
		{ value: "yes", label: "是" },
		{ value: "no", label: "否" },
	]
}

function wait(ms: number) {
	return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function getDateInputValue(value?: string) {
	if (!value) return ""
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return value.slice(0, 10)
	return date.toISOString().slice(0, 10)
}

function normalizeDateInput(value?: string) {
	const trimmed = value?.trim()
	if (!trimmed) return undefined
	return `${trimmed} 00:00:00.000Z`
}
