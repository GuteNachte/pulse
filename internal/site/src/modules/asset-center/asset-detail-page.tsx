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
import { AssetEditWorkbench } from "./components/asset-edit-workbench"
import { AssetShowcaseTags } from "./components/asset-showcase-tags"
import { AssetShowcaseWorkspace } from "./components/asset-showcase-workspace"
import { SelectField, TextAreaField, TextField } from "./components/asset-detail-form-fields"
import {
	HOST_ASSET_TYPES,
	NETWORK_ASSET_TYPES,
	getAssetFormSections,
	getAssetTypeLabel,
	getMetadataString,
	getStatusLabel,
	type AssetLifecycleTone,
	isPhoneVariantSpecRequired,
} from "./asset-schema"
import {
	formatAssetDetailTaskStatusLabel,
	formatAssetVisualTaskMeta as formatAssetVisualTaskSummary,
} from "./asset-ai-task-summary"
import { loadLatestAITasksByKind } from "./asset-ai-task-query"
import { createAssetDetailLoadGuard, type AssetDetailLoadToken } from "./asset-detail-load-guard"
import { loadAssetEditCatalog } from "./asset-edit-catalog-query"
import { loadLatestReportSuggestions, loadPendingOfficialColorSuggestions } from "./asset-enrichment-suggestion-query"
import { getAssetRecognitionRequirements, validateAssetProfileForm } from "./asset-profile-validation"
import { escapePocketBaseFilterValue } from "./asset-query"
import { loadDisplayAssetVisuals } from "./asset-visual-query"
import { getAssetVisualColor } from "./asset-visual-color"
import {
	formatCollectedNicSummary,
	formatMemoryModuleSummary,
	formatSpeed,
	getSystemDisplayName,
} from "./asset-runtime-hardware"
import type {
	AssetChangeAction,
	AssetChangeRecord,
	AssetChangeSourceCollection,
	AssetAttachmentKind,
	AssetAttachmentRecord,
	AssetVisualRecord,
	AssetInterfaceKind,
	AssetInterfaceRecord,
	AssetInterfaceSource,
	AssetEnrichmentReportRecord,
	AssetEnrichmentSuggestionRecord,
	AITaskRecord,
	AssetMaintenanceKind,
	AssetMaintenanceRecord,
	AssetLocationRecord,
	AssetRecord,
	AssetRelationKind,
	AssetRelationRecord,
	NetworkInterfaceDetails,
	SystemDetailsRecord,
	SystemRecord,
} from "@/types"

type AssetDetailState = {
	asset?: AssetRecord
	assets: AssetRecord[]
	interfaces: AssetInterfaceRecord[]
	allInterfaces: AssetInterfaceRecord[]
	editCatalogLoaded: boolean
	relations: AssetRelationRecord[]
	locations: AssetLocationRecord[]
	maintenance: AssetMaintenanceRecord[]
	attachments: AssetAttachmentRecord[]
	visuals: AssetVisualRecord[]
	aiTasks: AITaskRecord[]
	changes: AssetChangeRecord[]
	enrichmentReports: AssetEnrichmentReportRecord[]
	enrichmentSuggestions: AssetEnrichmentSuggestionRecord[]
	officialColorSuggestions: AssetEnrichmentSuggestionRecord[]
}

const AssetEnrichmentReportDialog = lazy(() =>
	import("./components/asset-enrichment-report-dialog").then((module) => ({
		default: module.AssetEnrichmentReportDialog,
	}))
)

function getNetworkTopologyFocusHref(params: { asset?: string; relation?: string }) {
	const search = new URLSearchParams()
	if (params.relation) search.set("relation", params.relation)
	if (params.asset) search.set("asset", params.asset)
	const query = search.toString()
	return `${getPagePath($router, "network")}${query ? `?${query}` : ""}`
}

const emptyState: AssetDetailState = {
	assets: [],
	interfaces: [],
	allInterfaces: [],
	editCatalogLoaded: false,
	relations: [],
	locations: [],
	maintenance: [],
	attachments: [],
	visuals: [],
	aiTasks: [],
	changes: [],
	enrichmentReports: [],
	enrichmentSuggestions: [],
	officialColorSuggestions: [],
}

const interfaceKindOptions: { value: AssetInterfaceKind; label: string }[] = [
	{ value: "ethernet", label: "有线" },
	{ value: "wifi", label: "无线" },
	{ value: "wan", label: "WAN" },
	{ value: "lan", label: "LAN" },
	{ value: "management", label: "管理口" },
	{ value: "virtual", label: "虚拟接口" },
	{ value: "custom", label: "自定义" },
]

const relationKindOptions: { value: AssetRelationKind; label: string }[] = [
	{ value: "connected_to", label: "网络连接" },
	{ value: "hosted_on", label: "运行在" },
	{ value: "monitors", label: "监控" },
	{ value: "depends_on", label: "依赖" },
	{ value: "owns", label: "归属" },
	{ value: "located_in", label: "位于" },
	{ value: "powered_by", label: "供电于" },
	{ value: "custom", label: "自定义" },
]

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

const relationLinkKindOptions = [
	{ value: "", label: "自动判断" },
	{ value: "ethernet", label: "有线链路" },
	{ value: "wifi", label: "无线链路" },
	{ value: "internet", label: "外网链路" },
	{ value: "custom", label: "自定义链路" },
]

type RelationGuideId = "network" | "wifi" | "power" | "host"

type RelationFormState = {
	kind: AssetRelationKind
	target_asset: string
	current_interface: string
	peer_interface: string
	link_kind: string
	label: string
	notes: string
	guide?: RelationGuideId
}

const emptyRelationForm: RelationFormState = {
	kind: "connected_to",
	target_asset: "",
	current_interface: "",
	peer_interface: "",
	link_kind: "",
	label: "",
	notes: "",
}

const relationGuides: {
	id: RelationGuideId
	label: string
	description: string
	kind: AssetRelationKind
	linkKind: string
	labelPlaceholder: string
}[] = [
	{
		id: "network",
		label: "连接网络设备",
		description: "路由器、交换机、网关、光猫和外网入口",
		kind: "connected_to",
		linkKind: "ethernet",
		labelPlaceholder: "例如 LAN1 -> 主机",
	},
	{
		id: "wifi",
		label: "连接无线 / AP",
		description: "无线 AP、路由器 Wi-Fi 或无线回程",
		kind: "connected_to",
		linkKind: "wifi",
		labelPlaceholder: "例如 5G Wi-Fi",
	},
	{
		id: "power",
		label: "绑定供电来源",
		description: "UPS、智能插座或电源链路",
		kind: "powered_by",
		linkKind: "custom",
		labelPlaceholder: "例如 UPS 输出 1",
	},
	{
		id: "host",
		label: "绑定宿主资产",
		description: "虚拟机、服务或设备运行在某台主机上",
		kind: "hosted_on",
		linkKind: "custom",
		labelPlaceholder: "例如 PVE 宿主",
	},
]

export default memo(function AssetDetailPage({ id }: { id: string }) {
	const [state, setState] = useState<AssetDetailState>(emptyState)
	const [loading, setLoading] = useState(true)
	const [interfaceDialogOpen, setInterfaceDialogOpen] = useState(false)
	const [relationDialogOpen, setRelationDialogOpen] = useState(false)
	const [maintenanceDialogOpen, setMaintenanceDialogOpen] = useState(false)
	const [attachmentDialogOpen, setAttachmentDialogOpen] = useState(false)
	const [enrichmentReportDialogOpen, setEnrichmentReportDialogOpen] = useState(false)
	const [managementDialogOpen, setManagementDialogOpen] = useState(false)
	const [recognitionStage, setRecognitionStage] = useState<"idle" | "blocked" | "running" | "ready" | "failed">("idle")
	const [recognitionMessage, setRecognitionMessage] = useState("")
	const [visualGenerationStage, setVisualGenerationStage] = useState<"idle" | "running" | "ready" | "failed">("idle")
	const [visualGenerationMessage, setVisualGenerationMessage] = useState("")
	const [visualColor, setVisualColor] = useState("")
	const [fileToken, setFileToken] = useState("")
	const [editingInterface, setEditingInterface] = useState<AssetInterfaceRecord | null>(null)
	const [editingRelation, setEditingRelation] = useState<AssetRelationRecord | null>(null)
	const [relationForm, setRelationForm] = useState<RelationFormState>(emptyRelationForm)
	const [editingMaintenance, setEditingMaintenance] = useState<AssetMaintenanceRecord | null>(null)
	const [saving, setSaving] = useState(false)
	const secondaryLoadRef = useRef<Promise<void> | null>(null)
	const editCatalogLoadRef = useRef<Promise<void> | null>(null)
	const detailLoadGuardRef = useRef(createAssetDetailLoadGuard())
	const readOnly = isReadOnlyUser()
	const assetMap = useMemo(() => new Map(state.assets.map((asset) => [asset.id, asset])), [state.assets])
	const asset = state.asset

	useEffect(() => {
		loadDetail()
	}, [id])

	useEffect(() => {
		if (!asset) return
		setVisualColor(getAssetVisualColor(asset))
		setRecognitionStage("idle")
		setRecognitionMessage("")
		setVisualGenerationStage("idle")
		setVisualGenerationMessage("")
	}, [asset?.id])

	const selectedRelationGuide = useMemo(
		() => relationGuides.find((guide) => guide.id === relationForm.guide),
		[relationForm.guide]
	)
	const relationTargetOptions = useMemo(
		() => getRelationTargetOptions(state.assets, asset?.id ?? id, relationForm.guide),
		[asset?.id, id, relationForm.guide, state.assets]
	)
	const relationPeerInterfaceOptions = useMemo(
		() => getPeerInterfaceOptions(state.allInterfaces, state.assets, asset?.id ?? id, relationForm.target_asset),
		[asset?.id, id, relationForm.target_asset, state.allInterfaces, state.assets]
	)
	const latestEnrichmentReport = state.enrichmentReports[0]
	const latestEnrichmentSuggestions = useMemo(
		() =>
			latestEnrichmentReport
				? state.enrichmentSuggestions.filter((item) => item.report === latestEnrichmentReport.id)
				: [],
		[latestEnrichmentReport, state.enrichmentSuggestions]
	)
	const actionableEnrichmentSuggestions = useMemo(
		() => latestEnrichmentSuggestions.filter(isActionableEnrichmentSuggestion),
		[latestEnrichmentSuggestions]
	)
	const recognitionRequirements = useMemo(() => (asset ? getAssetRecognitionRequirements(asset) : []), [asset])

	async function loadDetail(options?: { waitSecondary?: boolean; waitEditCatalog?: boolean }) {
		const loadToken = detailLoadGuardRef.current.begin(id)
		setLoading(true)
		try {
			const [assetRecord, interfaces, relations] = await Promise.all([
				pb.collection<AssetRecord>("assets").getOne(id, { requestKey: null }),
				pb.collection<AssetInterfaceRecord>("asset_interfaces").getFullList({
					filter: `asset="${id}"`,
					sort: "-primary,kind,name",
					requestKey: null,
				}),
				pb.collection<AssetRelationRecord>("asset_relations").getFullList({
					filter: `source_asset="${id}" || target_asset="${id}"`,
					sort: "kind,created",
					requestKey: null,
				}),
			])
			if (!detailLoadGuardRef.current.isCurrent(loadToken)) return
			setState({
				...emptyState,
				asset: assetRecord,
				assets: [assetRecord],
				interfaces,
				allInterfaces: interfaces,
				relations,
			})
			setFileToken("")
			document.title = pageTitle(`${assetRecord.name} / 资产详情`)
			setLoading(false)
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
			setLoading(false)
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
				const catalogAssets = assets.some((item) => item.id === assetId) ? assets : [fallbackAsset, ...assets]
				const catalogInterfaces = allInterfaces.length > 0 ? allInterfaces : interfaces
				return {
					...current,
					assets: catalogAssets,
					allInterfaces: catalogInterfaces,
					locations,
					editCatalogLoaded: true,
				}
			})
		} catch (error) {
			if (!isPocketBaseAutoCancel(error)) {
				console.warn("load asset edit catalog", error)
			}
		}
	}

	async function loadSecondaryDetailData({ assetId, loadToken }: { assetId: string; loadToken: AssetDetailLoadToken }) {
		try {
			const [maintenance, attachments, visuals, aiTasks, changes, enrichmentReports] = await Promise.all([
				pb.collection<AssetMaintenanceRecord>("asset_maintenance").getFullList({
					filter: `asset="${assetId}"`,
					sort: "-event_date,-created",
					requestKey: null,
				}),
				pb.collection<AssetAttachmentRecord>("asset_attachments").getFullList({
					filter: `asset="${assetId}"`,
					sort: "kind,title",
					requestKey: null,
				}),
				loadDisplayAssetVisuals(pb.collection<AssetVisualRecord>("asset_visuals"), assetId),
				loadLatestAITasksByKind(pb.collection<AITaskRecord>("ai_tasks"), { assetId }),
				pb.collection<AssetChangeRecord>("asset_changes").getList(1, 20, {
					filter: `asset="${assetId}"`,
					sort: "-created",
					requestKey: null,
				}),
				pb.collection<AssetEnrichmentReportRecord>("asset_enrichment_reports").getList(1, 10, {
					filter: `asset="${assetId}"`,
					sort: "-created",
					requestKey: null,
				}),
			])
			const [enrichmentSuggestions, officialColorSuggestions] = await Promise.all([
				loadLatestReportSuggestions(
					pb.collection<AssetEnrichmentSuggestionRecord>("asset_enrichment_suggestions"),
					enrichmentReports.items[0]?.id
				),
				loadPendingOfficialColorSuggestions(
					pb.collection<AssetEnrichmentSuggestionRecord>("asset_enrichment_suggestions"),
					assetId
				),
			])
			setState((current) => {
				if (!detailLoadGuardRef.current.isCurrent(loadToken) || current.asset?.id !== assetId) return current
				return {
					...current,
					maintenance,
					attachments,
					visuals,
					aiTasks,
					changes: changes.items,
					enrichmentReports: enrichmentReports.items,
					enrichmentSuggestions,
					officialColorSuggestions,
				}
			})
			if (attachments.some((item) => item.files?.length > 0) && detailLoadGuardRef.current.isCurrent(loadToken)) {
				pb.files
					.getToken({ requestKey: null })
					.then((token) => {
						if (detailLoadGuardRef.current.isCurrent(loadToken)) setFileToken(token)
					})
					.catch((error) => {
						if (!isPocketBaseAutoCancel(error)) {
							console.warn("load asset file token", error)
						}
						if (detailLoadGuardRef.current.isCurrent(loadToken)) setFileToken("")
					})
			} else if (detailLoadGuardRef.current.isCurrent(loadToken)) {
				setFileToken("")
			}
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
		const payload = {
			user,
			asset: asset.id,
			name,
			kind: form.get("kind")?.toString() || "ethernet",
			mac: form.get("mac")?.toString().trim(),
			ipv4: form.get("ipv4")?.toString().trim(),
			ipv6: form.get("ipv6")?.toString().trim(),
			speed_mbps: Number(form.get("speed_mbps")) || undefined,
			connected: form.get("connected") === "yes",
			primary,
			source: editingInterface?.source || "manual",
			metadata: { notes: form.get("notes")?.toString().trim() || "" },
		}
		setSaving(true)
		try {
			const saved = editingInterface
				? await pb.collection<AssetInterfaceRecord>("asset_interfaces").update(editingInterface.id, payload)
				: await pb.collection<AssetInterfaceRecord>("asset_interfaces").create(payload)
			if (primary) {
				await clearOtherPrimaryInterfaces(asset.id, saved.id)
			}
			setEditingInterface(null)
			setInterfaceDialogOpen(false)
			await loadDetail()
			toast({ title: editingInterface ? "接口已更新" : "接口已添加", description: name })
		} catch (error) {
			console.error("save asset interface", error)
			toast({ title: "接口保存失败", description: "请检查字段和权限。", variant: "destructive" })
		} finally {
			setSaving(false)
		}
	}

	async function applyCollectionSuggestion(diff: AssetCollectionDiff) {
		if (!diff.writeback) return
		if (readOnly) {
			toast({ title: "只读账号不能更新资产主档", variant: "destructive" })
			return
		}
		const confirmed = window.confirm(
			`确认把「${diff.label}」更新到资产主档？\n\n当前值：${diff.archiveValue}\n建议值：${diff.collectedValue}\n\n此操作会写入 ${diff.writeback.targetLabel}，并进入资产变更历史。`
		)
		if (!confirmed) return
		setSaving(true)
		try {
			const payload =
				diff.writeback.collection === "assets" && diff.writeback.field.startsWith("metadata.")
					? {
							metadata: {
								...(asset?.metadata ?? {}),
								[diff.writeback.field.slice("metadata.".length)]: diff.writeback.value,
							},
						}
					: { [diff.writeback.field]: diff.writeback.value }
			if (diff.writeback.collection === "assets") {
				await pb.collection<AssetRecord>("assets").update(diff.writeback.recordId, payload)
			} else {
				await pb.collection<AssetInterfaceRecord>("asset_interfaces").update(diff.writeback.recordId, payload)
			}
			await loadDetail()
			toast({ title: "采集建议已写入主档", description: `${diff.label} 已更新。` })
		} catch (error) {
			console.error("apply asset collection suggestion", error)
			toast({ title: "采集建议写入失败", description: "请检查字段、权限或主数据校验规则。", variant: "destructive" })
		} finally {
			setSaving(false)
		}
	}

	async function generateEnrichmentReport() {
		if (!asset || readOnly) return
		setSaving(true)
		try {
			await pb.send(`/api/pulse/assets/${asset.id}/enrichment-reports`, { method: "POST" })
			await loadDetail({ waitSecondary: true })
			toast({
				title: "智能识别报告已生成",
				description: "官方颜色、采集值、建档线索和可追溯资料会整理为待确认建议。",
			})
		} catch (error) {
			console.error("generate asset enrichment report", error)
			toast({ title: "智能识别失败", description: "请检查资产、Agent 绑定或 Hub 日志。", variant: "destructive" })
		} finally {
			setSaving(false)
		}
	}

	async function generateAndOpenEnrichmentReport() {
		await generateEnrichmentReport()
		setEnrichmentReportDialogOpen(true)
	}

	async function generateTurntableVisual(options?: { color?: string }) {
		if (!asset || readOnly) return
		const color = options?.color ?? getAssetVisualColor(asset)
		setVisualGenerationStage("running")
		setVisualGenerationMessage("正在从官方 / 可追溯来源收集合适的设备图片。")
		setSaving(true)
		try {
			const response = await pb.send<{ status?: string; message?: string; task?: AITaskRecord }>(
				`/api/pulse/assets/${asset.id}/visuals/turntable`,
				{
					method: "POST",
					body: { async: true, color: color.trim() },
				}
			)
			await loadDetail({ waitSecondary: true })
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
				setVisualGenerationMessage(response.message || "设备图片未收集成功，请检查官方配色或参考图来源。")
				toast({
					title: "设备图片未收集成功",
					description: response.message || "请先补齐官方配色或参考图来源。",
				})
			} else if (response.status === "no_sources") {
				setVisualGenerationStage("failed")
				setVisualGenerationMessage("没有找到可追溯设备图片。请先补充厂家资料页、官方图片 URL，或运行资料补全 Agent。")
				toast({
					title: "未找到可用设备图片",
					description: "请先补充厂家资料页、官方图片 URL，或运行资料补全 Agent 后再收集。",
				})
			} else {
				setVisualGenerationStage("ready")
				setVisualGenerationMessage("候选图已收集。请在右侧候选区选择要显示在详情页的主图。")
				toast({ title: "候选图已收集", description: "请在编辑窗口右侧选择要显示的主图。" })
			}
		} catch (error) {
			console.error("collect asset visual images", error)
			setVisualGenerationStage("failed")
			setVisualGenerationMessage("设备图片收集失败。请检查官方配色、参考图来源或 Hub 日志。")
			toast({
				title: "设备图片收集失败",
				description: "请检查官方配色、参考图来源或 Hub 日志。",
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
					await loadDetail({ waitSecondary: true })
					setVisualGenerationMessage("候选图已收集。请在右侧候选区选择要显示在详情页的主图。")
					toast({ title: "候选图已收集", description: "请在编辑窗口右侧选择要显示的主图。" })
					return
				}
				if (task.status === "failed") {
					setVisualGenerationStage("failed")
					await loadDetail({ waitSecondary: true })
					toast({
						title: "设备图片收集失败",
						description: task.error || "请检查官方配色、参考图来源或 Hub 日志。",
						variant: "destructive",
					})
					return
				}
			}
			if (attempt % 3 === 2) {
				await loadDetail({ waitSecondary: true })
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

	async function selectAssetVisualCandidate(visualId: string, frameIndex: number) {
		if (!asset || readOnly) return
		setSaving(true)
		try {
			await pb.send(`/api/pulse/assets/${asset.id}/visuals/${visualId}/select`, {
				method: "POST",
				body: { frame_index: frameIndex },
			})
			await loadDetail({ waitSecondary: true })
			setVisualGenerationStage("ready")
			setVisualGenerationMessage("已选择设备主图。详情页会显示你选中的这一张。")
			toast({ title: "设备主图已更新", description: "详情页会显示你选中的候选图。" })
		} catch (error) {
			console.error("select asset visual candidate", error)
			toast({ title: "选择主图失败", description: "请检查候选图是否仍可用。", variant: "destructive" })
		} finally {
			setSaving(false)
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
		const requiredErrors = validateAssetProfileForm({
			type: targetType,
			name,
			vendor: form.get("vendor")?.toString().trim() || "",
			model: form.get("model")?.toString().trim() || "",
			internalModel: form.get("internal_model")?.toString().trim() || "",
			color: form.get("color")?.toString().trim() || "",
			assetTag: form.get("asset_tag")?.toString().trim() || "",
			location: form.get("location")?.toString().trim() || "",
			ipv4: managementIp,
			memoryGb: form.get("memory_gb")?.toString().trim() || "",
			storageGb: form.get("storage_gb")?.toString().trim() || "",
		})
		if (requiredErrors.length > 0) {
			toast({
				title: "资产主档未填完整",
				description: requiredErrors.join("、"),
				variant: "destructive",
			})
			return
		}
		const schemaFields = getAssetFormSections(targetType).flatMap((section) => section.fields)
		for (const field of schemaFields) {
			const value = form.get(field.key)
			if (value === null || field.source !== "metadata") continue
			const normalized = value.toString().trim()
			metadata[field.key] = field.type === "number" && normalized ? Number(normalized) : normalized
		}
		metadata.internal_model = form.get("internal_model")?.toString().trim() || metadata.internal_model || ""
		metadata.color = form.get("color")?.toString().trim() || ""
		metadata.device_color = metadata.color
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
		setSaving(true)
		try {
			await pb.collection("assets").update(asset.id, {
				name,
				type: targetType,
				status: form.get("status")?.toString() || asset.status || "active",
				vendor: form.get("vendor")?.toString().trim() || "",
				model: form.get("model")?.toString().trim() || "",
				serial_number: form.get("serial_number")?.toString().trim() || "",
				management_ip: managementIp,
				location: form.get("location")?.toString().trim() || "",
				role: form.get("role")?.toString().trim() || "",
				notes: form.get("notes")?.toString().trim() || "",
				metadata,
			})
			await loadDetail({ waitSecondary: true })
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
			setRecognitionStage("blocked")
			setRecognitionMessage(`缺少：${missing.map((item) => item.label).join("、")}`)
			toast({
				title: "智能匹配缺少必填参数",
				description: missing.map((item) => item.label).join("、"),
				variant: "destructive",
			})
			return
		}
		setRecognitionStage("running")
		setRecognitionMessage("正在调用资料补全 Agent，读取本地采集、可追溯资料和 AI 结构化结果。")
		setSaving(true)
		try {
			await pb.send(`/api/pulse/assets/${asset.id}/enrichment-reports`, { method: "POST" })
			setRecognitionMessage("识别完成，正在刷新待替换参数。")
			await loadDetail({ waitSecondary: true })
			setRecognitionStage("ready")
			setRecognitionMessage("已生成智能识别报告，可在下方逐项替换或一键替换。")
			toast({ title: "智能匹配完成", description: "新的参数建议已经整理到编辑工作台。" })
		} catch (error) {
			console.error("run smart asset recognition", error)
			setRecognitionStage("failed")
			setRecognitionMessage("识别失败。请检查 Agnes 配置、资产参数或 Hub 日志。")
			toast({ title: "智能匹配失败", description: "请检查 Agnes 配置、资产参数或 Hub 日志。", variant: "destructive" })
		} finally {
			setSaving(false)
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

	async function acceptAllActionableSuggestions() {
		if (readOnly || saving || actionableEnrichmentSuggestions.length === 0) return
		const confirmed = window.confirm(
			`确认一键替换 ${actionableEnrichmentSuggestions.length} 个参数？\n\nHub 会先校验全部建议。任一建议过期、字段不允许或违反主数据重复约束时，不会写入任何参数。`
		)
		if (!confirmed) return
		setSaving(true)
		try {
			await pb.send("/api/pulse/asset-enrichment-suggestions/accept-batch", {
				method: "POST",
				body: { suggestion_ids: actionableEnrichmentSuggestions.map((suggestion) => suggestion.id) },
			})
			await loadDetail({ waitSecondary: true })
			toast({ title: "一键替换完成", description: `已处理 ${actionableEnrichmentSuggestions.length} 个参数。` })
		} catch (error) {
			console.error("accept all asset enrichment suggestions", error)
			toast({
				title: "一键替换失败",
				description: "未写入任何参数，请重新生成报告或检查主数据重复约束。",
				variant: "destructive",
			})
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
		await ensureAssetEditCatalogLoaded()
		const form = new FormData(event.currentTarget)
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

	async function deleteInterface(record: AssetInterfaceRecord) {
		if (!window.confirm(`确认删除接口「${record.name}」？拓扑里使用这个接口的信息会失效。`)) return
		try {
			await pb.collection("asset_interfaces").delete(record.id)
			await loadDetail()
			toast({ title: "接口已删除", description: record.name })
		} catch (error) {
			console.error("delete asset interface", error)
			toast({ title: "接口删除失败", variant: "destructive" })
		}
	}

	async function deleteRelation(record: AssetRelationRecord) {
		const peer = assetMap.get(record.source_asset === id ? record.target_asset : record.source_asset)
		if (!window.confirm(`确认删除和「${peer?.name ?? "目标资产"}」的关系？`)) return
		try {
			await pb.collection("asset_relations").delete(record.id)
			await loadDetail()
			toast({ title: "关系已删除", description: peer?.name })
		} catch (error) {
			console.error("delete asset relation", error)
			toast({ title: "关系删除失败", variant: "destructive" })
		}
	}

	async function deleteMaintenance(record: AssetMaintenanceRecord) {
		if (!window.confirm(`确认删除记录「${record.title}」？`)) return
		try {
			await pb.collection("asset_maintenance").delete(record.id)
			await loadDetail()
			toast({ title: "维护记录已删除", description: record.title })
		} catch (error) {
			console.error("delete asset maintenance", error)
			toast({ title: "维护记录删除失败", variant: "destructive" })
		}
	}

	async function clearOtherPrimaryInterfaces(assetId: string, keepId: string) {
		const records = state.interfaces.filter((item) => item.asset === assetId && item.id !== keepId && item.primary)
		await Promise.all(records.map((record) => pb.collection("asset_interfaces").update(record.id, { primary: false })))
	}

	function openAddInterfaceDialog() {
		setEditingInterface(null)
		setInterfaceDialogOpen(true)
	}

	function openEditInterfaceDialog(record: AssetInterfaceRecord) {
		setEditingInterface(record)
		setInterfaceDialogOpen(true)
	}

	function openAddRelationDialog() {
		ensureAssetEditCatalogLoaded().catch((error) => {
			if (!isPocketBaseAutoCancel(error)) {
				console.warn("ensure asset relation catalog", error)
			}
		})
		setEditingRelation(null)
		setRelationForm(getEmptyRelationFormForGuide())
		setRelationDialogOpen(true)
	}

	function openGuidedRelationDialog(guideId: RelationGuideId) {
		ensureAssetEditCatalogLoaded().catch((error) => {
			if (!isPocketBaseAutoCancel(error)) {
				console.warn("ensure asset relation catalog", error)
			}
		})
		setEditingRelation(null)
		setRelationForm(getEmptyRelationFormForGuide(guideId))
		setRelationDialogOpen(true)
	}

	function openEditRelationDialog(record: AssetRelationRecord) {
		ensureAssetEditCatalogLoaded().catch((error) => {
			if (!isPocketBaseAutoCancel(error)) {
				console.warn("ensure asset relation catalog", error)
			}
		})
		setEditingRelation(record)
		setRelationForm(getRelationFormFromRecord(record, asset?.id ?? id))
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

	function openEditMaintenanceDialog(record: AssetMaintenanceRecord) {
		setEditingMaintenance(record)
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

	async function deleteAttachment(record: AssetAttachmentRecord) {
		if (!window.confirm(`确认删除附件「${record.title}」？文件会一起从资产档案中移除。`)) {
			return
		}
		try {
			await pb.collection("asset_attachments").delete(record.id)
			await loadDetail()
			toast({ title: "资产附件已删除", description: record.title })
		} catch (error) {
			console.error("delete asset attachment", error)
			toast({ title: "附件删除失败", variant: "destructive" })
		}
	}

	if (loading) {
		return <EmptyState loading loadingText="正在读取资产详情" emptyText="暂无资产" />
	}

	if (!asset) {
		return (
			<EmptyState
				loading={false}
				loadingText="正在读取资产详情"
				emptyText="资产不存在或没有权限查看"
				action={
					<Button asChild variant="outline">
						<Link href={getPagePath($router, "assets")}>返回资产中心</Link>
					</Button>
				}
			/>
		)
	}
	const AssetIcon = getAssetIcon(asset.type)
	const assetTag = getMetadataString(asset.metadata, "asset_tag")
	return (
		<div className="grid gap-4">
			<section className="rounded-lg border border-border/70 bg-card p-1.5 shadow-none">
				<div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md bg-surface-soft px-3 py-2">
					<div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1.5">
						<Button asChild variant="ghost" size="sm" className="-ms-2 h-7 w-fit gap-1.5 px-2 text-xs">
							<Link href={getPagePath($router, "assets")}>
								<ArrowLeftIcon className="size-3.5" />
								资产中心
							</Link>
						</Button>
						<div className="grid size-8 shrink-0 place-items-center rounded-md border border-border/70 bg-card text-muted-foreground">
							<AssetIcon className="size-4" />
						</div>
						<h1 className="max-w-[18rem] truncate text-lg font-semibold text-foreground">{asset.name}</h1>
						{assetTag && (
							<span className="inline-flex h-5 max-w-[9rem] shrink-0 items-center rounded-md border border-border/70 bg-card px-1.5 text-[11px] font-medium text-muted-foreground">
								{assetTag}
							</span>
						)}
						<Badge variant="secondary" className="h-5 rounded-md px-1.5 text-[11px]">
							{getAssetTypeLabel(asset.type)}
						</Badge>
						<StatusBadge status={asset.status || "active"} />
						<AssetShowcaseTags asset={asset} />
					</div>
					<Button
						variant="outline"
						size="sm"
						className="h-7 shrink-0 gap-1.5 px-2 text-xs"
						onClick={() => {
							setManagementDialogOpen(true)
							ensureAssetEditCatalogLoaded().catch((error) => {
								if (!isPocketBaseAutoCancel(error)) {
									console.warn("ensure asset edit catalog", error)
								}
							})
						}}
					>
						<PencilIcon className="size-3.5" />
						编辑
					</Button>
				</div>
			</section>

			<AssetShowcaseWorkspace asset={asset} visuals={state.visuals} />

			<Dialog open={managementDialogOpen} onOpenChange={setManagementDialogOpen}>
				<AssetEditWorkbench
					asset={asset}
					state={state}
					readOnly={readOnly}
					saving={saving}
					recognitionStage={recognitionStage}
					recognitionMessage={recognitionMessage}
					visualGenerationStage={visualGenerationStage}
					visualGenerationMessage={visualGenerationMessage}
					recognitionRequirements={recognitionRequirements}
					latestReport={latestEnrichmentReport}
					latestSuggestions={latestEnrichmentSuggestions}
					actionableSuggestions={actionableEnrichmentSuggestions}
					visualColor={visualColor}
					onVisualColorChange={setVisualColor}
					onSaveProfile={saveAssetProfile}
					onRunSmartRecognition={runSmartRecognition}
					onAcceptSuggestion={(suggestion) => acceptEnrichmentSuggestionDirect(suggestion)}
					onAcceptAllSuggestions={acceptAllActionableSuggestions}
					onGenerateVisual={() =>
						generateTurntableVisual({ color: visualColor }).catch((error) =>
							console.error("collect asset visual images", error)
						)
					}
					onSelectVisualCandidate={selectAssetVisualCandidate}
					onOpenInterface={() => {
						setManagementDialogOpen(false)
						openAddInterfaceDialog()
					}}
					onOpenRelation={() => {
						setManagementDialogOpen(false)
						openAddRelationDialog()
					}}
					onOpenMaintenance={() => {
						setManagementDialogOpen(false)
						openAddMaintenanceDialog()
					}}
					onOpenAttachment={() => {
						setManagementDialogOpen(false)
						openAddAttachmentDialog()
					}}
					onDelete={deleteAsset}
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

			<Dialog
				open={interfaceDialogOpen}
				onOpenChange={(open) => {
					setInterfaceDialogOpen(open)
					if (!open) setEditingInterface(null)
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
									label="接口类型"
									options={interfaceKindOptions}
									defaultValue={editingInterface?.kind || "ethernet"}
								/>
								<SelectField
									name="connected"
									label="连接状态"
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
									label="速率 Mbps"
									type="number"
									placeholder="2500"
									defaultValue={editingInterface?.speed_mbps ? String(editingInterface.speed_mbps) : ""}
								/>
								<TextField name="ipv4" label="IPv4" placeholder="192.168.1.10" defaultValue={editingInterface?.ipv4} />
								<TextField name="ipv6" label="IPv6" placeholder="可选" defaultValue={editingInterface?.ipv6} />
								<TextAreaField
									name="notes"
									label="备注"
									className="sm:col-span-2"
									defaultValue={getMetadataNotes(editingInterface?.metadata)}
								/>
							</DialogFormSection>
						</div>
						<DialogFooter>
							<Button variant="outline" onClick={() => setInterfaceDialogOpen(false)} disabled={saving}>
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
									{relationGuides.map((guide) => (
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
								<SelectField
									name="kind"
									label="关系类型"
									options={relationKindOptions}
									value={relationForm.kind}
									onChange={(value) => updateRelationFormValue("kind", value as AssetRelationKind)}
								/>
								<SelectField
									name="target_asset"
									label="目标资产"
									options={relationTargetOptions}
									placeholder="选择目标资产"
									value={relationForm.target_asset}
									onChange={updateRelationTarget}
								/>
								<SelectField
									name="current_interface"
									label="本资产接口"
									options={getAssetInterfaceOptions(state.allInterfaces, asset.id)}
									value={relationForm.current_interface}
									onChange={(value) => updateRelationFormValue("current_interface", value)}
								/>
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
								<SelectField
									name="link_kind"
									label="链路类型"
									options={relationLinkKindOptions}
									value={relationForm.link_kind}
									onChange={(value) => updateRelationFormValue("link_kind", value)}
								/>
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

function uniqueIds(ids: string[]) {
	return [...new Set(ids.filter(Boolean))]
}

function uniqueAssetRecords(records: AssetRecord[]) {
	const seen = new Set<string>()
	return records.filter((record) => {
		if (!record.id || seen.has(record.id)) return false
		seen.add(record.id)
		return true
	})
}

function getAssetIdsFilter(assetIds: string[]) {
	return uniqueIds(assetIds)
		.map((assetId) => `asset="${escapePocketBaseFilterValue(assetId)}"`)
		.join(" || ")
}

type AssetCollectionDiff = {
	key: string
	label: string
	archiveValue: string
	collectedValue: string
	source: string
	confidence: number
	recommendation: string
	writeback?: AssetCollectionWriteback
}

type AssetCollectionWriteback = {
	collection: "assets" | "asset_interfaces"
	recordId: string
	field: string
	value: string | number
	targetLabel: string
}

function EmptyBlock({ icon, text }: { icon: ReactNode; text: string }) {
	return (
		<div className="grid place-items-center rounded-lg border border-dashed border-border/70 bg-surface-soft p-6 text-center">
			<div className="grid size-10 place-items-center rounded-md border border-border/70 bg-card text-muted-foreground">
				{icon}
			</div>
			<div className="mt-3 text-sm text-muted-foreground">{text}</div>
		</div>
	)
}

function MetaTag({ children }: { children: ReactNode }) {
	return (
		<span className="rounded-md border border-border/70 bg-card px-1.5 py-0.5 text-[11px] text-muted-foreground">
			{children}
		</span>
	)
}

function SummaryMini({ label, value }: { label: string; value: number | string }) {
	return (
		<div className="rounded-md border border-border/70 bg-card px-2.5 py-2">
			<div className="text-[11px] text-muted-foreground">{label}</div>
			<div className="mt-1 font-mono text-base font-semibold tabular-nums text-foreground">{value}</div>
		</div>
	)
}

function ConfidenceTag({ confidence }: { confidence: number }) {
	const tone = confidence >= 90 ? "ok" : confidence >= 75 ? "warning" : "neutral"
	return <ToneTag tone={tone}>置信度 {confidence}%</ToneTag>
}

function getAssetVisualStatusLabel(status?: AssetVisualRecord["status"]) {
	switch (status) {
		case "ready":
			return "待确认"
		case "accepted":
			return "已设为主视觉"
		case "rejected":
			return "已忽略"
		case "failed":
			return "收集失败"
		default:
			return "草稿"
	}
}

function getAssetEnrichmentTaskMeta(tasks: AITaskRecord[], reports: AssetEnrichmentReportRecord[]) {
	const latestTask = tasks.find((task) => task.kind === "asset_enrichment")
	if (latestTask) {
		return `Agent ${formatAssetDetailTaskStatusLabel(latestTask.status)}`
	}
	return reports.length ? `${reports.length} 份报告` : "未生成"
}

function ToneTag({ children, tone }: { children: ReactNode; tone: AssetLifecycleTone }) {
	return (
		<span
			className={cn(
				"rounded-md border px-2 py-1 text-xs font-medium",
				tone === "danger"
					? "border-red-200 bg-red-50 text-red-700"
					: tone === "warning"
						? "border-amber-200 bg-amber-50 text-amber-700"
						: tone === "ok"
							? "border-emerald-200 bg-emerald-50 text-emerald-700"
							: "border-border/70 bg-card text-muted-foreground"
			)}
		>
			{children}
		</span>
	)
}

function StatusBadge({ status }: { status: "active" | "inactive" | "retired" | "planned" }) {
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
			{getStatusLabel(status)}
		</span>
	)
}

function SystemStatusBadge({ status }: { status: SystemRecord["status"] }) {
	return (
		<span
			className={cn(
				"inline-flex min-h-6 items-center rounded-md border px-2 text-xs font-medium",
				status === "up"
					? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
					: status === "pending"
						? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
						: "border-border/70 bg-card text-muted-foreground"
			)}
		>
			{systemStatusLabel(status)}
		</span>
	)
}

function systemStatusLabel(status?: SystemRecord["status"]) {
	switch (status) {
		case "up":
			return "在线"
		case "pending":
			return "待接入"
		case "paused":
			return "暂停"
		default:
			return "离线"
	}
}

function yesNoOptions() {
	return [
		{ value: "yes", label: "是" },
		{ value: "no", label: "否" },
	]
}

function buildCollectionDiffs(
	asset: AssetRecord,
	interfaces: AssetInterfaceRecord[],
	systems: SystemRecord[],
	systemDetails: SystemDetailsRecord[]
) {
	const diffs: AssetCollectionDiff[] = []
	const detailBySystem = new Map(systemDetails.map((detail) => [detail.system || detail.id, detail]))
	const systemPairs = systems.map((system) => ({ system, detail: detailBySystem.get(system.id) }))
	for (const { system, detail } of systemPairs) {
		const collectedName = firstNonEmpty(detail?.hostname, system.display_name, system.name)
		if (asset.name && collectedName && normalizeComparableText(asset.name) !== normalizeComparableText(collectedName)) {
			diffs.push({
				key: `name-${system.id}`,
				label: "主机识别名称",
				archiveValue: asset.name,
				collectedValue: collectedName,
				source: getSystemDisplayName(system),
				confidence: 80,
				recommendation:
					"Agent 上报的主机名和资产名称不同。建议确认这是否只是显示名差异；确认后再手动更新资产名称或保留当前主档。",
				writeback: {
					collection: "assets",
					recordId: asset.id,
					field: "name",
					value: collectedName,
					targetLabel: "资产档案 / 资产名称",
				},
			})
		}
		if ((HOST_ASSET_TYPES.includes(asset.type) || asset.type === "vm") && detail) {
			const source = getSystemDisplayName(system)
			addMetadataCollectionDiff(diffs, asset, {
				field: "cpu_vendor",
				label: "CPU 厂商",
				collectedValue: detail.cpu_vendor,
				source,
				confidence: 90,
				recommendation: "Agent 已采集到 CPU 厂商。该字段通常稳定，可确认后写入资产主档。",
			})
			addMetadataCollectionDiff(diffs, asset, {
				field: "cpu_model",
				label: "CPU 型号",
				collectedValue: detail.cpu,
				source,
				confidence: 90,
				recommendation: "Agent 已采集到 CPU 型号。该字段通常稳定，可确认后写入资产主档。",
			})
			const memoryGb = bytesToRoundedGb(detail.memory)
			addMetadataCollectionDiff(diffs, asset, {
				field: "memory_gb",
				label: "内存容量",
				collectedValue: memoryGb,
				displayValue: memoryGb ? `${memoryGb} GB` : "",
				source,
				confidence: 85,
				recommendation: "Agent 已采集到内存总容量。确认当前内存配置就是长期配置后，可写入资产主档。",
			})
			addMetadataCollectionDiff(diffs, asset, {
				field: "memory_detail",
				label: "内存条摘要",
				collectedValue: formatMemoryModuleSummary(detail),
				source,
				confidence: 80,
				recommendation: "Agent 已采集到内存条摘要。它适合做主档备注；更精确的颗粒和套条信息后续由专项识别 Agent 补齐。",
			})
			const primaryNicSpeed = getPrimaryCollectedNicSpeed(detail)
			addMetadataCollectionDiff(diffs, asset, {
				field: "primary_nic_speed_mbps",
				label: "主网卡速率",
				collectedValue: primaryNicSpeed,
				displayValue: primaryNicSpeed ? formatSpeed(primaryNicSpeed) : "",
				source,
				confidence: 80,
				recommendation:
					"Agent 已采集到物理网卡链路速率。该值会受交换机端口和线材协商影响，确认长期接入方式后再写入主档。",
			})
			addMetadataCollectionDiff(diffs, asset, {
				field: "nic_detail",
				label: "物理网卡摘要",
				collectedValue: formatCollectedNicSummary(detail),
				source,
				confidence: 75,
				recommendation: "Agent 已采集到物理网卡摘要。芯片级品牌和型号后续仍建议通过专项识别 Agent 精准补齐。",
			})
		}
	}

	const collectedIps = getCollectedIpValues(systemPairs)
	if (asset.management_ip && collectedIps.length > 0 && !hasNormalizedValue(collectedIps, asset.management_ip)) {
		diffs.push({
			key: "management-ip",
			label: "IPv4",
			archiveValue: asset.management_ip,
			collectedValue: collectedIps.join(" / "),
			source: systems.length === 1 ? getSystemDisplayName(systems[0]) : "绑定 Agent",
			confidence: 85,
			recommendation:
				"Agent 上报的地址不包含资产主档里的 IPv4。建议核对 DHCP 保留和当前接入网卡后，再决定是否更新资产主档。",
			writeback: {
				collection: "assets",
				recordId: asset.id,
				field: "management_ip",
				value: collectedIps[0],
				targetLabel: "资产档案 / IPv4",
			},
		})
	}

	const collectedInterfaces = systemPairs.flatMap(({ system, detail }) =>
		(detail?.network_interfaces ?? []).map((networkInterface) => ({
			system,
			networkInterface,
		}))
	)
	for (const assetInterface of interfaces) {
		if (collectedInterfaces.length === 0) continue
		const matched = findCollectedInterface(assetInterface, collectedInterfaces)
		const archiveInterfaceName = assetInterface.name || getInterfaceKindLabel(assetInterface.kind)
		if (!matched) {
			if (assetInterface.mac && collectedInterfaces.some((item) => item.networkInterface.mac)) {
				diffs.push({
					key: `interface-mac-missing-${assetInterface.id}`,
					label: `${archiveInterfaceName} MAC`,
					archiveValue: assetInterface.mac,
					collectedValue: "Agent 未发现匹配网卡",
					source: "绑定 Agent",
					confidence: 65,
					recommendation:
						"资产接口里的 MAC 没有在当前 Agent 物理网卡采集中匹配到。建议先确认是否换过网卡、禁用了接口，或当前 Agent 采集权限不足。",
				})
			}
			continue
		}
		const source = getSystemDisplayName(matched.system)
		const collected = matched.networkInterface
		if (assetInterface.mac && collected.mac && normalizeMac(assetInterface.mac) !== normalizeMac(collected.mac)) {
			diffs.push({
				key: `interface-mac-${assetInterface.id}-${matched.system.id}`,
				label: `${archiveInterfaceName} MAC`,
				archiveValue: assetInterface.mac,
				collectedValue: collected.mac,
				source,
				confidence: 90,
				recommendation:
					"同一接口的 Agent 采集 MAC 与资产接口主档不同。建议确认是否更换过网卡或接口匹配是否正确，确认后再写入资产接口。",
				writeback: {
					collection: "asset_interfaces",
					recordId: assetInterface.id,
					field: "mac",
					value: collected.mac,
					targetLabel: "资产接口 / MAC",
				},
			})
		}
		if (assetInterface.ipv4 && collected.ipv4?.length && !hasNormalizedValue(collected.ipv4, assetInterface.ipv4)) {
			diffs.push({
				key: `interface-ipv4-${assetInterface.id}-${matched.system.id}`,
				label: `${archiveInterfaceName} IPv4`,
				archiveValue: assetInterface.ipv4,
				collectedValue: collected.ipv4.join(" / "),
				source,
				confidence: 90,
				recommendation:
					"同一接口的 Agent 采集 IPv4 与资产接口主档不同。建议确认固定地址是否已变更，确认后再手动更新资产接口。",
				writeback: {
					collection: "asset_interfaces",
					recordId: assetInterface.id,
					field: "ipv4",
					value: collected.ipv4[0],
					targetLabel: "资产接口 / IPv4",
				},
			})
		}
		if (assetInterface.ipv6 && collected.ipv6?.length && !hasNormalizedValue(collected.ipv6, assetInterface.ipv6)) {
			diffs.push({
				key: `interface-ipv6-${assetInterface.id}-${matched.system.id}`,
				label: `${archiveInterfaceName} IPv6`,
				archiveValue: assetInterface.ipv6,
				collectedValue: collected.ipv6.join(" / "),
				source,
				confidence: 75,
				recommendation: "IPv6 可能随前缀、隐私地址或网络策略变化。建议只在你确定该 IPv6 是长期固定地址时写回资产接口。",
				writeback: {
					collection: "asset_interfaces",
					recordId: assetInterface.id,
					field: "ipv6",
					value: collected.ipv6[0],
					targetLabel: "资产接口 / IPv6",
				},
			})
		}
		if (
			assetInterface.speed_mbps &&
			collected.link_speed &&
			Number(assetInterface.speed_mbps) !== Number(collected.link_speed)
		) {
			diffs.push({
				key: `interface-speed-${assetInterface.id}-${matched.system.id}`,
				label: `${archiveInterfaceName} 链路速率`,
				archiveValue: formatSpeed(assetInterface.speed_mbps),
				collectedValue: formatSpeed(collected.link_speed),
				source,
				confidence: 85,
				recommendation:
					"Agent 采集到的链路速率和资产接口档案不同。建议检查交换机端口协商、线材和网卡设置后，再更新接口速率主档。",
				writeback: {
					collection: "asset_interfaces",
					recordId: assetInterface.id,
					field: "speed_mbps",
					value: collected.link_speed,
					targetLabel: "资产接口 / 链路速率",
				},
			})
		}
	}
	return diffs
}

function addMetadataCollectionDiff(
	diffs: AssetCollectionDiff[],
	asset: AssetRecord,
	options: {
		field: string
		label: string
		collectedValue?: string | number
		displayValue?: string
		source: string
		confidence: number
		recommendation: string
	}
) {
	const collectedValue = normalizeCollectedMetadataValue(options.collectedValue)
	if (collectedValue === undefined) return
	const archiveValue = normalizeCollectedMetadataValue(asset.metadata?.[options.field])
	if (metadataValuesEqual(archiveValue, collectedValue)) return
	const collectedDisplay = options.displayValue || formatMetadataSuggestionValue(collectedValue)
	if (!collectedDisplay) return
	diffs.push({
		key: `metadata-${options.field}-${normalizeComparableText(options.source) || "agent"}`,
		label: options.label,
		archiveValue: archiveValue === undefined ? "未填写" : formatMetadataSuggestionValue(archiveValue),
		collectedValue: collectedDisplay,
		source: options.source,
		confidence: options.confidence,
		recommendation: options.recommendation,
		writeback: {
			collection: "assets",
			recordId: asset.id,
			field: `metadata.${options.field}`,
			value: collectedValue,
			targetLabel: `资产档案 / ${options.label}`,
		},
	})
}

function normalizeCollectedMetadataValue(value: unknown) {
	if (typeof value === "number") {
		return Number.isFinite(value) && value > 0 ? value : undefined
	}
	if (typeof value !== "string") return undefined
	const trimmed = value.trim()
	return trimmed ? trimmed : undefined
}

function metadataValuesEqual(left?: string | number, right?: string | number) {
	if (left === undefined || right === undefined) return false
	if (typeof left === "number" || typeof right === "number") {
		return Number(left) === Number(right)
	}
	return normalizeComparableText(left) === normalizeComparableText(right)
}

function formatMetadataSuggestionValue(value: string | number) {
	if (typeof value === "number") {
		return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "")
	}
	return value
}

function bytesToRoundedGb(value?: number) {
	if (!value || !Number.isFinite(value)) return undefined
	const gb = value / 1024 ** 3
	if (gb <= 0) return undefined
	return Math.round(gb)
}

function getPrimaryCollectedNicSpeed(detail: SystemDetailsRecord) {
	const speeds = (detail.network_interfaces ?? [])
		.map((item) => item.link_speed)
		.filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0)
	return speeds.length ? Math.max(...speeds) : undefined
}

function getCollectedIpValues(systemPairs: { system: SystemRecord; detail?: SystemDetailsRecord }[]) {
	const values = new Set<string>()
	for (const { system, detail } of systemPairs) {
		for (const value of [system.info?.ip, system.target_ip, system.connect_ip, ...(system.reported_ips ?? [])]) {
			addNormalizedDisplayValue(values, value)
		}
		for (const networkInterface of detail?.network_interfaces ?? []) {
			for (const value of networkInterface.ipv4 ?? []) addNormalizedDisplayValue(values, value)
			for (const value of networkInterface.ipv6 ?? []) addNormalizedDisplayValue(values, value)
		}
	}
	return [...values]
}

function findCollectedInterface(
	assetInterface: AssetInterfaceRecord,
	collectedInterfaces: { system: SystemRecord; networkInterface: NetworkInterfaceDetails }[]
) {
	const mac = normalizeMac(assetInterface.mac)
	if (mac) {
		return collectedInterfaces.find((item) => normalizeMac(item.networkInterface.mac) === mac)
	}
	if (assetInterface.ipv4) {
		const ipv4 = normalizeIpValue(assetInterface.ipv4)
		const matched = collectedInterfaces.find((item) =>
			(item.networkInterface.ipv4 ?? []).some((value) => normalizeIpValue(value) === ipv4)
		)
		if (matched) return matched
	}
	if (assetInterface.ipv6) {
		const ipv6 = normalizeIpValue(assetInterface.ipv6)
		const matched = collectedInterfaces.find((item) =>
			(item.networkInterface.ipv6 ?? []).some((value) => normalizeIpValue(value) === ipv6)
		)
		if (matched) return matched
	}
	if (assetInterface.primary && collectedInterfaces.length === 1) return collectedInterfaces[0]
	return undefined
}

function firstNonEmpty(...values: (string | undefined)[]) {
	return values.find((value) => value?.trim())?.trim() ?? ""
}

function wait(ms: number) {
	return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function isActionableEnrichmentSuggestion(suggestion: AssetEnrichmentSuggestionRecord) {
	if (suggestion.status !== "pending") return false
	const recommended = suggestion.recommended_value?.trim()
	if (!recommended) return false
	const current = suggestion.current_value?.trim()
	return !current || suggestion.conflict || normalizeComparableText(current) !== normalizeComparableText(recommended)
}

function normalizeComparableText(value: string) {
	return value.trim().toLowerCase()
}

function normalizeMac(value?: string) {
	return value?.replace(/[^a-fA-F0-9]/g, "").toLowerCase() ?? ""
}

function normalizeIpValue(value?: string) {
	return value?.trim().toLowerCase().replace(/\s+/g, "").split("%")[0] ?? ""
}

function hasNormalizedValue(values: string[], target: string) {
	const normalizedTarget = normalizeIpValue(target)
	return values.some((value) => normalizeIpValue(value) === normalizedTarget)
}

function addNormalizedDisplayValue(values: Set<string>, value?: string) {
	const normalized = normalizeIpValue(value)
	if (!normalized) return
	values.add(value?.trim() || normalized)
}

function getInterfaceKindLabel(kind?: AssetInterfaceKind) {
	return interfaceKindOptions.find((item) => item.value === kind)?.label ?? kind ?? "未知"
}

function getRelationKindLabel(kind?: AssetRelationKind) {
	return relationKindOptions.find((item) => item.value === kind)?.label ?? kind ?? "未知"
}

function getMaintenanceKindLabel(kind?: AssetMaintenanceKind) {
	return maintenanceKindOptions.find((item) => item.value === kind)?.label ?? kind ?? "未知"
}

function getAttachmentKindLabel(kind?: AssetAttachmentKind) {
	return attachmentKindOptions.find((item) => item.value === kind)?.label ?? kind ?? "附件"
}

function getAssetChangeActionLabel(action?: AssetChangeAction) {
	switch (action) {
		case "create":
			return "新增"
		case "update":
			return "更新"
		case "delete":
			return "删除"
		default:
			return "变更"
	}
}

function getAssetChangeSourceLabel(source?: AssetChangeSourceCollection) {
	switch (source) {
		case "assets":
			return "资产档案"
		case "asset_interfaces":
			return "网络接口"
		case "asset_relations":
			return "资产关系"
		case "asset_maintenance":
			return "维护记录"
		case "asset_attachments":
			return "资产附件"
		default:
			return "资产数据"
	}
}

function isImageAttachment(fileName: string) {
	return /\.(apng|avif|gif|jpe?g|png|webp)$/i.test(fileName)
}

function getReadableFileName(fileName: string) {
	return fileName.replace(/_[a-z0-9]{6,}(?=\.[^.]+$|$)/i, "")
}

function getInterfaceSourceLabel(source?: AssetInterfaceSource) {
	switch (source) {
		case "manual":
			return "手动"
		case "agent":
			return "Agent"
		case "snmp":
			return "SNMP"
		case "import":
			return "导入"
		default:
			return "未知"
	}
}

function formatDate(value: string) {
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return value
	return date.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" })
}

function getMetadataNotes(metadata?: Record<string, unknown>) {
	const notes = metadata?.notes
	return typeof notes === "string" ? notes : ""
}

function getDateInputValue(value?: string) {
	if (!value) return ""
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return value.slice(0, 10)
	return date.toISOString().slice(0, 10)
}

function getEmptyRelationFormForGuide(guideId?: RelationGuideId): RelationFormState {
	const guide = relationGuides.find((item) => item.id === guideId)
	if (!guide) {
		return { ...emptyRelationForm }
	}
	return {
		...emptyRelationForm,
		guide: guide.id,
		kind: guide.kind,
		link_kind: guide.linkKind,
	}
}

function getRelationFormFromRecord(relation: AssetRelationRecord, currentAssetId: string): RelationFormState {
	return {
		kind: relation.kind || "connected_to",
		target_asset: getRelationPeerAssetId(relation, currentAssetId),
		current_interface: getRelationCurrentInterfaceId(relation, currentAssetId),
		peer_interface: getRelationPeerInterfaceId(relation, currentAssetId),
		link_kind: getMetadataString(relation.metadata, "link_kind"),
		label: relation.label || "",
		notes: getMetadataNotes(relation.metadata),
	}
}

function getRelationTargetOptions(assets: AssetRecord[], currentAssetId: string, guideId?: RelationGuideId) {
	return assets
		.filter((asset) => asset.id !== currentAssetId)
		.filter((asset) => isRelationGuideTarget(asset, guideId))
		.map((asset) => ({ value: asset.id, label: `${asset.name} · ${getAssetTypeLabel(asset.type)}` }))
}

function isRelationGuideTarget(asset: AssetRecord, guideId?: RelationGuideId) {
	if (!guideId) return true
	switch (guideId) {
		case "network":
			return asset.type === "internet" || NETWORK_ASSET_TYPES.includes(asset.type)
		case "wifi":
			return asset.type === "ap" || asset.type === "router" || asset.type === "gateway"
		case "power":
			return asset.type === "ups" || asset.type === "plug"
		case "host":
			return HOST_ASSET_TYPES.includes(asset.type)
		default:
			return true
	}
}

function getRelationPeerAssetId(relation: AssetRelationRecord | null, assetId: string) {
	if (!relation) return ""
	return relation.source_asset === assetId ? relation.target_asset : relation.source_asset
}

function getRelationCurrentInterfaceId(relation: AssetRelationRecord | null, assetId: string) {
	if (!relation) return ""
	const metadataKey = relation.source_asset === assetId ? "source_interface" : "target_interface"
	return getMetadataString(relation.metadata, metadataKey)
}

function getRelationPeerInterfaceId(relation: AssetRelationRecord | null, assetId: string) {
	if (!relation) return ""
	const metadataKey = relation.source_asset === assetId ? "target_interface" : "source_interface"
	return getMetadataString(relation.metadata, metadataKey)
}

function getAssetInterfaceOptions(interfaces: AssetInterfaceRecord[], assetId: string) {
	return [
		{ value: "", label: "不指定" },
		...interfaces
			.filter((item) => item.asset === assetId)
			.map((item) => ({ value: item.id, label: getInterfaceOptionLabel(item) })),
	]
}

function getPeerInterfaceOptions(
	interfaces: AssetInterfaceRecord[],
	assets: AssetRecord[],
	currentAssetId: string,
	targetAssetId: string
) {
	const assetMap = new Map(assets.map((item) => [item.id, item]))
	const peerInterfaces = interfaces.filter((item) =>
		targetAssetId ? item.asset === targetAssetId : item.asset !== currentAssetId
	)
	return [
		{ value: "", label: "不指定" },
		...peerInterfaces.map((item) => ({
			value: item.id,
			label: `${assetMap.get(item.asset)?.name ?? "未知资产"} · ${getInterfaceOptionLabel(item)}`,
		})),
	]
}

function getInterfaceOptionLabel(item: AssetInterfaceRecord) {
	return [
		item.name || getInterfaceKindLabel(item.kind),
		item.speed_mbps ? formatSpeed(item.speed_mbps) : "",
		item.ipv4 || item.mac || "",
	]
		.filter(Boolean)
		.join(" · ")
}

function buildRelationMetadata({
	relation,
	currentAssetId,
	sourceAsset,
	targetAsset,
	currentInterface,
	peerInterface,
	linkKind,
	notes,
}: {
	relation: AssetRelationRecord | null
	currentAssetId: string
	sourceAsset: string
	targetAsset: string
	currentInterface: string
	peerInterface: string
	linkKind: string
	notes: string
}) {
	const metadata = { ...(relation?.metadata ?? {}) }
	const sourceInterface = sourceAsset === currentAssetId ? currentInterface : peerInterface
	const targetInterface = targetAsset === currentAssetId ? currentInterface : peerInterface
	setMetadataString(metadata, "source_interface", sourceInterface)
	setMetadataString(metadata, "target_interface", targetInterface)
	setMetadataString(metadata, "link_kind", linkKind)
	setMetadataString(metadata, "notes", notes)
	return metadata
}

function setMetadataString(metadata: Record<string, unknown>, key: string, value: string) {
	if (value) {
		metadata[key] = value
	} else {
		delete metadata[key]
	}
}

function getRelationEndpointLabel(
	relation: AssetRelationRecord,
	assetMap: Map<string, AssetRecord>,
	interfaceMap: Map<string, AssetInterfaceRecord>
) {
	const sourceInterface = interfaceMap.get(getMetadataString(relation.metadata, "source_interface"))
	const targetInterface = interfaceMap.get(getMetadataString(relation.metadata, "target_interface"))
	if (!sourceInterface && !targetInterface) return ""
	const sourceAsset = assetMap.get(relation.source_asset)
	const targetAsset = assetMap.get(relation.target_asset)
	return `端点：${getEndpointLabel(sourceAsset, sourceInterface)} -> ${getEndpointLabel(targetAsset, targetInterface)}`
}

function getEndpointLabel(asset?: AssetRecord, assetInterface?: AssetInterfaceRecord) {
	return [
		asset?.name,
		assetInterface ? assetInterface.name || getInterfaceKindLabel(assetInterface.kind) : "未指定接口",
	]
		.filter(Boolean)
		.join(" ")
}

function normalizeDateInput(value?: string) {
	const trimmed = value?.trim()
	if (!trimmed) return undefined
	return `${trimmed} 00:00:00.000Z`
}
