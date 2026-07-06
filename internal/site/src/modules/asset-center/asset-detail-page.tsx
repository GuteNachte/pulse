import { getPagePath } from "@nanostores/router"
import {
	AlertTriangleIcon,
	ArrowLeftIcon,
	BatteryIcon,
	BellIcon,
	BoxesIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	ContainerIcon,
	CpuIcon,
	DownloadIcon,
	ExternalLinkIcon,
	ImageIcon,
	Globe2Icon,
	HardDriveIcon,
	CalendarClockIcon,
	LinkIcon,
	ListChecksIcon,
	MonitorIcon,
	NetworkIcon,
	PaperclipIcon,
	PencilIcon,
	PlusIcon,
	SendIcon,
	ThermometerIcon,
	Trash2Icon,
	UploadIcon,
} from "lucide-react"
import { memo, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react"
import { $router, Link } from "@/components/router"
import { Badge } from "@/components/ui/badge"
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
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/use-toast"
import { useTheme } from "@/components/theme-provider"
import {
	alertCreatedLabel,
	alertDisplayName,
	alertSeverity,
	alertSeverityLabel,
	alertSourceLabel,
	alertStateLabel,
	alertSystemName,
	alertValueLabel,
} from "@/lib/alert-display"
import { AlertContent } from "@/components/alerts/alerts-sheet"
import { formatPolicyCoverage, getPoliciesForAsset } from "@/components/alerts/alert-rules-overview"
import { alertInfo } from "@/lib/alerts"
import { isPocketBaseAutoCancel, isReadOnlyUser, pb } from "@/lib/api"
import { pageTitle } from "@/lib/branding"
import { batteryStateTranslations } from "@/lib/i18n"
import { cn, decimalString, formatTemperature } from "@/lib/utils"
import { getAssetIcon } from "./components/asset-card"
import {
	AssetFieldCaptureTag,
	AssetLocationInput,
	AssetTagInput,
	PHONE_MEMORY_OPTIONS,
	PHONE_STORAGE_OPTIONS,
	PhoneVariantSpecInput,
} from "./components/asset-form-fields"
import { buildNextAssetTag, loadAssetNumberingSettings, normalizeAssetNumberingSettings } from "./asset-numbering"
import { buildAssetLocationOptions } from "./asset-list"
import {
	HOST_ASSET_TYPES,
	NETWORK_ASSET_TYPES,
	ASSET_TYPE_OPTIONS,
	STATUS_OPTIONS,
	getAssetCompleteness,
	getAssetFormSections,
	getAssetTypeLabel,
	getAssetWarrantyStatus,
	getLatestMaintenanceRecord,
	getMetadataNumber,
	getMetadataString,
	getStatusLabel,
	type AssetFieldDefinition,
	type AssetLifecycleTone,
	isPhoneVariantSpecRequired,
} from "./asset-schema"
import { getAssetSourceProfile } from "./asset-source-profile"
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
	AlertNotificationStateRecord,
	AlertPolicyRecord,
	AlertRecord,
	AlertsHistoryRecord,
	ContainerRecord,
	GPUData,
	NetworkInterfaceDetails,
	NotificationFailureRecord,
	SmartDeviceRecord,
	SystemDetailsRecord,
	SystemRecord,
	SystemStatsRecord,
	WebsiteMonitorRecord,
} from "@/types"

type AssetDetailState = {
	asset?: AssetRecord
	assets: AssetRecord[]
	interfaces: AssetInterfaceRecord[]
	allInterfaces: AssetInterfaceRecord[]
	relations: AssetRelationRecord[]
	locations: AssetLocationRecord[]
	maintenance: AssetMaintenanceRecord[]
	attachments: AssetAttachmentRecord[]
	visuals: AssetVisualRecord[]
	aiTasks: AITaskRecord[]
	changes: AssetChangeRecord[]
	enrichmentReports: AssetEnrichmentReportRecord[]
	enrichmentSuggestions: AssetEnrichmentSuggestionRecord[]
	systems: SystemRecord[]
	systemDetails: SystemDetailsRecord[]
	smartDevices: SmartDeviceRecord[]
	containers: ContainerRecord[]
	systemStats: SystemStatsRecord[]
	websites: WebsiteMonitorRecord[]
	alerts: AlertsHistoryRecord[]
	assetAlerts: AlertRecord[]
	alertPolicies: AlertPolicyRecord[]
	notificationFailures: NotificationFailureRecord[]
	notificationStates: AlertNotificationStateRecord[]
}

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
	relations: [],
	locations: [],
	maintenance: [],
	attachments: [],
	visuals: [],
	aiTasks: [],
	changes: [],
	enrichmentReports: [],
	enrichmentSuggestions: [],
	systems: [],
	systemDetails: [],
	smartDevices: [],
	containers: [],
	systemStats: [],
	websites: [],
	alerts: [],
	assetAlerts: [],
	alertPolicies: [],
	notificationFailures: [],
	notificationStates: [],
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
	const [officialColorStage, setOfficialColorStage] = useState<"idle" | "blocked" | "running" | "ready" | "failed">(
		"idle"
	)
	const [officialColorMessage, setOfficialColorMessage] = useState("")
	const [visualGenerationStage, setVisualGenerationStage] = useState<"idle" | "running" | "ready" | "failed">("idle")
	const [visualGenerationMessage, setVisualGenerationMessage] = useState("")
	const [visualColor, setVisualColor] = useState("")
	const [visualFrameCount, setVisualFrameCount] = useState(2)
	const [fileToken, setFileToken] = useState("")
	const [editingInterface, setEditingInterface] = useState<AssetInterfaceRecord | null>(null)
	const [editingRelation, setEditingRelation] = useState<AssetRelationRecord | null>(null)
	const [relationForm, setRelationForm] = useState<RelationFormState>(emptyRelationForm)
	const [editingMaintenance, setEditingMaintenance] = useState<AssetMaintenanceRecord | null>(null)
	const [saving, setSaving] = useState(false)
	const secondaryLoadRef = useRef<Promise<void> | null>(null)
	const readOnly = isReadOnlyUser()
	const assetMap = useMemo(() => new Map(state.assets.map((asset) => [asset.id, asset])), [state.assets])
	const asset = state.asset

	useEffect(() => {
		loadDetail()
	}, [id])

	useEffect(() => {
		if (!asset) return
		setVisualColor(getAssetVisualColor(asset))
		setVisualFrameCount(2)
		setRecognitionStage("idle")
		setRecognitionMessage("")
		setOfficialColorStage("idle")
		setOfficialColorMessage("")
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

	async function loadDetail(options?: { waitSecondary?: boolean }) {
		setLoading(true)
		try {
			const [assetRecord, interfaces, relations, systems] = await Promise.all([
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
				pb.collection<SystemRecord>("systems").getFullList({
					filter: `asset="${id}"`,
					sort: "name",
					requestKey: null,
				}),
			])
			setState({
				...emptyState,
				asset: assetRecord,
				assets: [assetRecord],
				interfaces,
				allInterfaces: interfaces,
				relations,
				systems,
			})
			setFileToken("")
			document.title = pageTitle(`${assetRecord.name} / 资产详情`)
			setLoading(false)
			const secondaryLoad = startSecondaryDetailDataLoad({
				assetId: id,
				fallbackAsset: assetRecord,
				relations,
				systems,
			})
			if (options?.waitSecondary) {
				await secondaryLoad
			} else {
				secondaryLoad.catch((error) => {
					console.error("load secondary asset detail", error)
				})
			}
		} catch (error) {
			if (!isPocketBaseAutoCancel(error)) {
				console.error("load asset detail", error)
				toast({ title: "资产详情读取失败", description: "请检查资产是否存在。", variant: "destructive" })
			}
			setLoading(false)
		}
	}

	function startSecondaryDetailDataLoad(options: {
		assetId: string
		fallbackAsset: AssetRecord
		relations: AssetRelationRecord[]
		systems: SystemRecord[]
	}) {
		let secondaryLoad: Promise<void>
		secondaryLoad = loadSecondaryDetailData(options).finally(() => {
			if (secondaryLoadRef.current === secondaryLoad) {
				secondaryLoadRef.current = null
			}
		})
		secondaryLoadRef.current = secondaryLoad
		return secondaryLoad
	}

	async function ensureSecondaryDetailDataLoaded() {
		if (!asset) return
		if (
			state.assets.length > 1 &&
			state.allInterfaces.length >= state.interfaces.length &&
			state.locations.length > 0
		) {
			return
		}
		if (secondaryLoadRef.current) {
			await secondaryLoadRef.current
			return
		}
		await startSecondaryDetailDataLoad({
			assetId: asset.id,
			fallbackAsset: asset,
			relations: state.relations,
			systems: state.systems,
		})
	}

	async function loadSecondaryDetailData({
		assetId,
		fallbackAsset,
		relations,
		systems,
	}: {
		assetId: string
		fallbackAsset: AssetRecord
		relations: AssetRelationRecord[]
		systems: SystemRecord[]
	}) {
		try {
			const [
				assets,
				allInterfaces,
				locations,
				maintenance,
				attachments,
				visuals,
				aiTasks,
				changes,
				enrichmentReports,
				enrichmentSuggestions,
			] = await Promise.all([
				pb.collection<AssetRecord>("assets").getFullList({ sort: "type,name", requestKey: null }),
				pb.collection<AssetInterfaceRecord>("asset_interfaces").getFullList({
					sort: "asset,-primary,kind,name",
					requestKey: null,
				}),
				pb.collection<AssetLocationRecord>("asset_locations").getFullList({
					sort: "sort_order,name",
					requestKey: null,
				}),
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
				pb.collection<AssetVisualRecord>("asset_visuals").getFullList({
					filter: `asset="${assetId}"`,
					sort: "-primary,-created",
					requestKey: null,
				}),
				pb.collection<AITaskRecord>("ai_tasks").getFullList({
					filter: `asset="${assetId}"`,
					sort: "-created",
					requestKey: null,
				}),
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
				pb.collection<AssetEnrichmentSuggestionRecord>("asset_enrichment_suggestions").getFullList({
					filter: `asset="${assetId}"`,
					sort: "-created",
					requestKey: null,
				}),
			])
			const assetsForDerivedData = assets.length > 0 ? assets : [fallbackAsset]
			const allInterfacesForState = allInterfaces.length > 0 ? allInterfaces : []
			const websiteAssetIds = getAssetWebsiteEndpointIds(assetId, assetsForDerivedData, relations)
			const detailAssetIds = uniqueIds([assetId, ...websiteAssetIds])
			const [websites, alerts, assetAlerts, notificationFailures, notificationStates, systemDetails, runtimeSummary] =
				await Promise.all([
					loadAssetWebsiteMonitors(websiteAssetIds),
					loadAssetAlertHistory(detailAssetIds),
					loadAssetActiveAlerts(assetId),
					loadAssetNotificationFailures(detailAssetIds),
					loadAssetNotificationStates(detailAssetIds),
					loadSystemDetails(systems),
					loadAssetRuntimeSummary(systems),
				])
			const alertPolicies = await loadAlertPolicies()
			setState((current) => {
				if (current.asset?.id !== assetId) return current
				return {
					...current,
					assets: assetsForDerivedData,
					maintenance,
					attachments,
					visuals,
					aiTasks,
					changes: changes.items,
					enrichmentReports: enrichmentReports.items,
					enrichmentSuggestions,
					allInterfaces: allInterfacesForState,
					locations,
					systems,
					systemDetails,
					smartDevices: runtimeSummary.smartDevices,
					containers: runtimeSummary.containers,
					systemStats: runtimeSummary.systemStats,
					websites,
					alerts,
					assetAlerts,
					alertPolicies,
					notificationFailures,
					notificationStates,
				}
			})
			if (attachments.some((item) => item.files?.length > 0)) {
				pb.files
					.getToken({ requestKey: null })
					.then(setFileToken)
					.catch((error) => {
						if (!isPocketBaseAutoCancel(error)) {
							console.warn("load asset file token", error)
						}
						setFileToken("")
					})
			} else {
				setFileToken("")
			}
		} catch (error) {
			if (!isPocketBaseAutoCancel(error)) {
				console.warn("load secondary asset detail", error)
			}
		}
	}

	async function loadAssetAlertHistory(assetIds: string[]) {
		const filter = getAssetIdsFilter(assetIds)
		if (!filter) return []
		try {
			const records = await pb.collection<AlertsHistoryRecord>("alerts_history").getList(1, 20, {
				filter,
				sort: "-created",
				expand: "system,asset",
				fields:
					"id,alert_id,name,value,val,created,resolved,acknowledged_at,acknowledged_by,silenced_until,silenced_by,silence_reason,expand.system.name,expand.system.display_name,expand.asset.name,expand.asset.type,system,asset",
				requestKey: null,
			})
			return records.items
		} catch {
			return []
		}
	}

	async function loadAssetWebsiteMonitors(assetIds: string[]) {
		if (!assetIds.length) return []
		const filter = assetIds.map((assetId) => `asset="${escapePocketBaseFilterValue(assetId)}"`).join(" || ")
		try {
			return await pb.collection<WebsiteMonitorRecord>("website_monitors").getFullList({
				filter,
				sort: "name",
				requestKey: null,
			})
		} catch {
			return []
		}
	}

	async function loadAssetActiveAlerts(assetId: string) {
		try {
			return await pb.collection<AlertRecord>("alerts").getFullList({
				filter: `asset="${escapePocketBaseFilterValue(assetId)}"`,
				sort: "name,system",
				fields: "id,name,system,asset,value,min,triggered",
				requestKey: null,
			})
		} catch {
			return []
		}
	}

	async function loadAssetNotificationFailures(assetIds: string[]) {
		const filter = getAssetIdsFilter(assetIds)
		if (!filter) return []
		try {
			return await pb.collection<NotificationFailureRecord>("notification_failures").getFullList({
				filter,
				sort: "-updated",
				expand: "asset",
				fields: "id,title,target,fingerprint,error,count,created,updated,asset,expand.asset.name,expand.asset.type",
				requestKey: null,
			})
		} catch {
			return []
		}
	}

	async function loadAssetNotificationStates(assetIds: string[]) {
		const filter = getAssetIdsFilter(assetIds)
		if (!filter) return []
		try {
			return await pb.collection<AlertNotificationStateRecord>("alert_notification_states").getFullList({
				filter,
				sort: "-updated",
				expand: "asset",
				fields:
					"id,user,system,asset,alert_id,title,status,last_error,suppressed_count,last_attempt_at,last_sent_at,last_suppressed_at,next_allowed_at,last_resolved_at,created,updated,expand.asset.name,expand.asset.type",
				requestKey: null,
			})
		} catch {
			return []
		}
	}

	async function loadAlertPolicies() {
		try {
			const response = await pb.send<{ items: AlertPolicyRecord[] }>("/api/pulse/alert-policies", { method: "GET" })
			return response.items
		} catch {
			return []
		}
	}

	async function loadSystemDetails(systems: SystemRecord[]) {
		if (systems.length === 0) return []
		const filter = systems.map((system) => `system="${escapePocketBaseFilterValue(system.id)}"`).join(" || ")
		try {
			return await pb.collection<SystemDetailsRecord>("system_details").getFullList({
				filter,
				fields:
					"id,system,hostname,kernel,cores,threads,cpu,cpu_vendor,cpu_frequency_mhz,os_name,memory,memory_modules,container_runtime_name,container_runtime_version,network_interfaces,virtualization",
				requestKey: null,
			})
		} catch {
			return []
		}
	}

	async function loadAssetRuntimeSummary(systems: SystemRecord[]) {
		if (systems.length === 0) {
			return {
				smartDevices: [] as SmartDeviceRecord[],
				containers: [] as ContainerRecord[],
				systemStats: [] as SystemStatsRecord[],
			}
		}
		const systemFilter = systems.map((system) => `system="${escapePocketBaseFilterValue(system.id)}"`).join(" || ")
		const systemStats = await Promise.all(
			systems.map(async (system) => {
				const baseFilter = `system="${escapePocketBaseFilterValue(system.id)}"`
				try {
					return await pb.collection<SystemStatsRecord>("system_stats").getFirstListItem(`${baseFilter} && type="1m"`, {
						sort: "-created",
						fields: "id,system,stats,created",
						requestKey: null,
					})
				} catch {
					try {
						return await pb.collection<SystemStatsRecord>("system_stats").getFirstListItem(baseFilter, {
							sort: "-created",
							fields: "id,system,stats,created",
							requestKey: null,
						})
					} catch {
						return undefined
					}
				}
			})
		)
		try {
			const [smartDevices, containers] = await Promise.all([
				pb.collection<SmartDeviceRecord>("smart_devices").getFullList({
					filter: systemFilter,
					sort: "system,name",
					fields: "id,system,name,model,state,capacity,temp,type,media_type,hours,cycles,updated",
					requestKey: null,
				}),
				pb.collection<ContainerRecord>("containers").getFullList({
					filter: systemFilter,
					sort: "system,name",
					fields: "id,system,name,image,status,health,cpu,memory,net,stack_project,stack_service,updated",
					requestKey: null,
				}),
			])
			return {
				smartDevices,
				containers,
				systemStats: systemStats.filter(Boolean) as SystemStatsRecord[],
			}
		} catch {
			return {
				smartDevices: [] as SmartDeviceRecord[],
				containers: [] as ContainerRecord[],
				systemStats: systemStats.filter(Boolean) as SystemStatsRecord[],
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
			toast({ title: "智能识别报告已生成", description: "采集值、建档线索和可追溯资料会整理为待确认建议。" })
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

	async function generateTurntableVisual(options?: { color?: string; frameCount?: number }) {
		if (!asset || readOnly) return
		const color = options?.color ?? getAssetVisualColor(asset)
		setVisualGenerationStage("running")
		setVisualGenerationMessage("正在收集官方 / 可追溯参考图，并调用 Agnes 图片模型生成白天 / 夜晚两张统一图。")
		setSaving(true)
		try {
			const response = await pb.send<{ status?: string; message?: string }>(
				`/api/pulse/assets/${asset.id}/visuals/turntable`,
				{
					method: "POST",
					body: { color: color.trim(), frame_count: options?.frameCount ?? 2 },
				}
			)
			await loadDetail({ waitSecondary: true })
			if (response.status === "blocked" || response.status === "failed") {
				setVisualGenerationStage("failed")
				setVisualGenerationMessage(response.message || "统一全貌图未生成，请检查官方配色、参考图来源或图片模型配置。")
				toast({
					title: "统一全貌图未生成",
					description: response.message || "请先补齐官方配色、参考图来源或图片模型配置。",
				})
			} else if (response.status === "no_sources") {
				setVisualGenerationStage("failed")
				setVisualGenerationMessage("没有找到可追溯设备图片。请先补充厂家支持页、官方图片 URL，或运行资料补全 Agent。")
				toast({
					title: "未找到可用设备图片",
					description: "请先补充厂家支持页、官方图片 URL，或运行资料补全 Agent 后再收集。",
				})
			} else {
				setVisualGenerationStage("ready")
				setVisualGenerationMessage("统一全貌图已生成。已基于参考图统一背景、比例和摆放。")
				toast({ title: "统一全貌图已生成", description: "已基于参考图统一背景、比例和摆放。" })
			}
		} catch (error) {
			console.error("collect asset visual images", error)
			setVisualGenerationStage("failed")
			setVisualGenerationMessage("统一全貌图生成失败。请检查官方配色、参考图来源、图片模型配置或 Hub 日志。")
			toast({
				title: "统一全貌图生成失败",
				description: "请检查官方配色、参考图来源、图片模型配置或 Hub 日志。",
				variant: "destructive",
			})
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
		metadata.internal_model = form.get("internal_model")?.toString().trim() || ""
		metadata.color = form.get("color")?.toString().trim() || ""
		metadata.device_color = metadata.color
		metadata.asset_tag = form.get("asset_tag")?.toString().trim() || ""
		metadata.fixed_ipv4 = fixedIpv4
		const colorsAvailable = form.get("colors_available")?.toString().trim()
		if (colorsAvailable) {
			metadata.colors_available = colorsAvailable
			metadata.official_colors = colorsAvailable
		}
		metadata.support_url = form.get("support_url")?.toString().trim() || ""
		metadata.management_url = form.get("management_url")?.toString().trim() || ""
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
		setRecognitionMessage("正在调用资料补全 Agent，读取本地采集、联网资料和 AI 结构化结果。")
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

	async function fetchOfficialColors() {
		if (!asset || readOnly || saving) return
		const missing = getOfficialColorFetchRequirements(asset)
		if (missing.length > 0) {
			setOfficialColorStage("blocked")
			setOfficialColorMessage(`缺少：${missing.join("、")}`)
			toast({
				title: "官方颜色获取缺少参数",
				description: missing.join("、"),
				variant: "destructive",
			})
			return
		}
		setOfficialColorStage("running")
		setOfficialColorMessage("正在调用资料补全 Agent，从官网、支持页和官方图片来源提取官方配色。")
		setSaving(true)
		try {
			await pb.send(`/api/pulse/assets/${asset.id}/enrichment-reports`, {
				method: "POST",
				body: { focus: "official_colors" },
			})
			await loadDetail({ waitSecondary: true })
			setOfficialColorStage("ready")
			setOfficialColorMessage("已生成官方配色候选，请在下拉框选择并保存主档。")
			toast({ title: "官方颜色已获取", description: "请选择官方配色后保存主档，再生成统一全貌图。" })
		} catch (error) {
			console.error("fetch official asset colors", error)
			setOfficialColorStage("failed")
			setOfficialColorMessage("获取失败。请检查 Agnes 配置、厂家支持页、型号或 Hub 日志。")
			toast({
				title: "官方颜色获取失败",
				description: "请检查 Agnes 配置、厂家支持页、型号或 Hub 日志。",
				variant: "destructive",
			})
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
			`确认一键替换 ${actionableEnrichmentSuggestions.length} 个参数？\n\n这会把当前待确认建议全部覆盖写入资产主档或对应子档案，并进入变更历史。`
		)
		if (!confirmed) return
		setSaving(true)
		try {
			for (const suggestion of actionableEnrichmentSuggestions) {
				await pb.send(`/api/pulse/asset-enrichment-suggestions/${suggestion.id}/accept`, { method: "POST" })
			}
			await loadDetail({ waitSecondary: true })
			toast({ title: "一键替换完成", description: `已处理 ${actionableEnrichmentSuggestions.length} 个参数。` })
		} catch (error) {
			console.error("accept all asset enrichment suggestions", error)
			toast({ title: "一键替换失败", description: "部分参数可能已写入，请刷新后核对。", variant: "destructive" })
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
		setEditingRelation(null)
		setRelationForm(getEmptyRelationFormForGuide())
		setRelationDialogOpen(true)
	}

	function openGuidedRelationDialog(guideId: RelationGuideId) {
		setEditingRelation(null)
		setRelationForm(getEmptyRelationFormForGuide(guideId))
		setRelationDialogOpen(true)
	}

	function openEditRelationDialog(record: AssetRelationRecord) {
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
						<h1 className="max-w-[18rem] truncate text-lg font-semibold tracking-[-0.02em] text-foreground">
							{asset.name}
						</h1>
						<Badge variant="secondary" className="h-5 rounded-md px-1.5 text-[11px]">
							{getAssetTypeLabel(asset.type)}
						</Badge>
						<StatusBadge status={asset.status || "active"} />
						<span className="max-w-[18rem] truncate text-xs text-muted-foreground">
							{[asset.vendor, asset.model].filter(Boolean).join(" · ") || "基础档案"}
						</span>
						<AssetShowcaseTags asset={asset} />
					</div>
					<Button
						variant="outline"
						size="sm"
						className="h-7 shrink-0 gap-1.5 px-2 text-xs"
						onClick={() => {
							setManagementDialogOpen(true)
							ensureSecondaryDetailDataLoaded().catch((error) => {
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
					officialColorStage={officialColorStage}
					officialColorMessage={officialColorMessage}
					visualGenerationStage={visualGenerationStage}
					visualGenerationMessage={visualGenerationMessage}
					recognitionRequirements={recognitionRequirements}
					latestReport={latestEnrichmentReport}
					latestSuggestions={latestEnrichmentSuggestions}
					actionableSuggestions={actionableEnrichmentSuggestions}
					visualColor={visualColor}
					visualFrameCount={visualFrameCount}
					onVisualColorChange={setVisualColor}
					onSaveProfile={saveAssetProfile}
					onRunSmartRecognition={runSmartRecognition}
					onFetchOfficialColors={fetchOfficialColors}
					onAcceptSuggestion={(suggestion) => acceptEnrichmentSuggestionDirect(suggestion)}
					onAcceptAllSuggestions={acceptAllActionableSuggestions}
					onGenerateVisual={() =>
						generateTurntableVisual({ color: visualColor, frameCount: visualFrameCount }).catch((error) =>
							console.error("collect asset visual images", error)
						)
					}
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

type AssetShowcaseTag = {
	label: string
	value: string
	tone?: "neutral" | "strong"
}

function AssetShowcaseTags({ asset }: { asset: AssetRecord }) {
	const tags = buildAssetShowcaseTags(asset)
	if (tags.length === 0) return null
	return (
		<div className="flex min-w-0 flex-wrap gap-1">
			{tags.map((tag) => (
				<span
					key={`${tag.label}-${tag.value}`}
					className={cn(
						"inline-flex h-5 max-w-full items-center gap-1 rounded-md border px-1.5 text-[11px]",
						tag.tone === "strong"
							? "border-primary/25 bg-primary/10 text-primary"
							: "border-border/70 bg-card text-muted-foreground"
					)}
				>
					<span className="shrink-0 text-[10px] text-muted-foreground">{tag.label}</span>
					<span className="min-w-0 truncate font-medium text-foreground">{tag.value}</span>
				</span>
			))}
		</div>
	)
}

function AssetShowcaseWorkspace({ asset, visuals }: { asset: AssetRecord; visuals: AssetVisualRecord[] }) {
	const parameterGroups = useMemo(() => buildAssetParameterGroups(asset), [asset])
	const expandableGroups = useMemo(() => parameterGroups.filter(isParameterGroupExpandable), [parameterGroups])
	const [selectedGroupId, setSelectedGroupId] = useState(() => expandableGroups[0]?.id ?? "")
	const selectedGroup = expandableGroups.find((group) => group.id === selectedGroupId) ?? expandableGroups[0]

	useEffect(() => {
		if (expandableGroups.length === 0) {
			if (selectedGroupId) setSelectedGroupId("")
			return
		}
		if (!expandableGroups.some((group) => group.id === selectedGroupId)) {
			setSelectedGroupId(expandableGroups[0].id)
		}
	}, [expandableGroups, selectedGroupId])

	return (
		<section className="grid gap-3 xl:grid-cols-[minmax(0,3fr)_minmax(0,4fr)_minmax(0,3fr)] xl:items-start">
			<AssetVisualCard visuals={visuals} />
			<AssetOverviewColumn
				asset={asset}
				parameterGroups={parameterGroups}
				selectedGroupId={selectedGroup?.id ?? ""}
				onSelectGroup={setSelectedGroupId}
			/>
			<AssetParameterDetailPanel group={selectedGroup} />
		</section>
	)
}

type AssetParameterRow = {
	label: string
	value: string
	href?: string
	capture?: AssetFieldDefinition["capture"]
	section?: string
}

type AssetParameterGroup = {
	id: string
	title: string
	summary: string
	icon: ReactNode
	rows: AssetParameterRow[]
}

function AssetOverviewColumn({
	asset,
	parameterGroups,
	selectedGroupId,
	onSelectGroup,
}: {
	asset: AssetRecord
	parameterGroups: AssetParameterGroup[]
	selectedGroupId: string
	onSelectGroup: (groupId: string) => void
}) {
	const identityRows = buildAssetIdentityRows(asset)
	const assetTag = getMetadataString(asset.metadata, "asset_tag")
	return (
		<div className="grid gap-4">
			<Card className="border-border/70 bg-card shadow-none">
				<CardHeader className="border-b border-border/70 bg-surface-soft px-3 py-2.5">
					<CardTitle className="truncate text-base tracking-[-0.02em]">
						资产信息{assetTag ? <span className="text-muted-foreground">（{assetTag}）</span> : null}
					</CardTitle>
				</CardHeader>
				<CardContent className="grid gap-2 p-3 sm:grid-cols-2">
					{identityRows.map((row) => (
						<CompactParameterRow key={row.label} row={row} />
					))}
				</CardContent>
			</Card>

			<Card className="border-border/70 bg-card shadow-none">
				<CardHeader className="border-b border-border/70 bg-surface-soft px-3 py-2.5">
					<CardTitle className="text-base tracking-[-0.02em]">硬件参数</CardTitle>
				</CardHeader>
				<CardContent className="grid gap-2 p-3 sm:grid-cols-2">
					{parameterGroups.length > 0 ? (
						parameterGroups.map((group) => {
							const expandable = isParameterGroupExpandable(group)
							if (!expandable) {
								return <InlineParameterGroup key={group.id} group={group} />
							}
							return (
								<button
									type="button"
									key={group.id}
									onClick={() => onSelectGroup(group.id)}
									className={cn(
										"grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-border/70 bg-surface-soft px-2 py-1.5 text-left transition-colors hover:border-blue-400/60 hover:bg-blue-50/60 dark:hover:bg-blue-950/20",
										group.id === selectedGroupId &&
											"border-blue-500/70 bg-blue-50 text-blue-950 dark:bg-blue-950/30 dark:text-blue-50"
									)}
								>
									<span className="grid size-7 place-items-center rounded-md border border-border/70 bg-card text-muted-foreground">
										{group.icon}
									</span>
									<span className="min-w-0">
										<span className="block truncate text-xs font-medium text-foreground">{group.title}</span>
										<span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{group.summary}</span>
									</span>
									<ChevronRightIcon className="size-3.5 text-muted-foreground" />
								</button>
							)
						})
					) : (
						<div className="sm:col-span-2">
							<EmptyBlock icon={<ListChecksIcon className="size-5" />} text="暂无已确认的硬件参数。" />
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	)
}

function AssetParameterDetailPanel({ group }: { group?: AssetParameterGroup }) {
	const rowSections = group ? groupRowsBySection(group.rows) : []
	return (
		<Card className="border-border/70 bg-card shadow-none">
			<CardHeader className="border-b border-border/70 bg-surface-soft px-4 py-3">
				<div className="flex min-w-0 items-center gap-2">
					<span className="grid size-8 shrink-0 place-items-center rounded-md border border-border/70 bg-card text-muted-foreground">
						{group?.icon ?? <ListChecksIcon className="size-4" />}
					</span>
					<CardTitle className="truncate text-lg tracking-[-0.02em]">{group?.title ?? "参数详情"}</CardTitle>
				</div>
			</CardHeader>
			<CardContent className="grid gap-3 p-4">
				{group ? (
					rowSections.map((section) => (
						<section key={`${group.id}-${section.title}`} className="grid gap-2">
							{section.title && (
								<div className="px-0.5 text-xs font-semibold text-muted-foreground">{section.title}</div>
							)}
							<div className="grid gap-2">
								{section.rows.map((row) => (
									<ParameterDetailRow key={`${group.id}-${section.title}-${row.label}`} row={row} />
								))}
							</div>
						</section>
					))
				) : (
					<EmptyBlock icon={<ListChecksIcon className="size-5" />} text="参数较少的硬件大项已在中间直接显示。" />
				)}
			</CardContent>
		</Card>
	)
}

function InlineParameterGroup({ group }: { group: AssetParameterGroup }) {
	return (
		<div className="grid min-w-0 gap-2 rounded-md border border-border/70 bg-surface-soft px-2 py-2">
			<div className="flex min-w-0 items-center gap-2">
				<span className="grid size-7 shrink-0 place-items-center rounded-md border border-border/70 bg-card text-muted-foreground">
					{group.icon}
				</span>
				<span className="min-w-0 truncate text-xs font-medium text-foreground">{group.title}</span>
			</div>
			<div className="grid gap-1">
				{group.rows.map((row) => (
					<div
						key={`${group.id}-${row.label}`}
						className="grid min-w-0 grid-cols-[4rem_minmax(0,1fr)] items-baseline gap-2"
					>
						<span className="truncate text-[11px] text-muted-foreground">{row.label}</span>
						<span className="min-w-0 break-words text-xs font-medium text-foreground">{row.value}</span>
					</div>
				))}
			</div>
		</div>
	)
}

function groupRowsBySection(rows: AssetParameterRow[]) {
	const sections: { title: string; rows: AssetParameterRow[] }[] = []
	for (const row of rows) {
		const title = row.section ?? ""
		let section = sections.find((item) => item.title === title)
		if (!section) {
			section = { title, rows: [] }
			sections.push(section)
		}
		section.rows.push(row)
	}
	return sections
}

function isParameterGroupExpandable(group: AssetParameterGroup) {
	const sections = groupRowsBySection(group.rows)
	const meaningfulSectionCount = sections.filter((section) => section.title).length
	return group.rows.length > 4 || (group.rows.length > 3 && meaningfulSectionCount > 1)
}

function CompactParameterRow({ row }: { row: AssetParameterRow }) {
	return (
		<div className="grid min-h-10 grid-cols-[4.25rem_minmax(0,1fr)] items-center gap-2 rounded-md border border-border/70 bg-surface-soft px-2 py-1.5">
			<div className="truncate text-[11px] text-muted-foreground">{row.label}</div>
			<div className="min-w-0 truncate text-xs font-medium text-foreground">{row.value}</div>
		</div>
	)
}

function ParameterDetailRow({ row }: { row: AssetParameterRow }) {
	const value = row.href ? (
		<a
			href={row.href}
			target="_blank"
			rel="noreferrer"
			className="inline-flex min-w-0 max-w-full items-center gap-1.5 break-all text-sm font-medium text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
		>
			<span className="min-w-0 break-all">{row.value}</span>
			<ExternalLinkIcon className="size-3.5 shrink-0" />
		</a>
	) : (
		<div className="min-w-0 break-words text-sm font-medium text-foreground">{row.value}</div>
	)
	return (
		<div className="grid gap-1 rounded-md border border-border/70 bg-surface-soft px-3 py-2">
			<div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
				<span>{row.label}</span>
				<AssetFieldCaptureTag capture={row.capture} />
			</div>
			{value}
		</div>
	)
}

function buildAssetIdentityRows(asset: AssetRecord): AssetParameterRow[] {
	const metadata = asset.metadata ?? {}
	return [
		{ label: "资产名称", value: asset.name },
		{ label: "所属类型", value: getAssetTypeLabel(asset.type) },
		{ label: "状态", value: getStatusLabel(asset.status || "active") },
		{ label: "厂商", value: asset.vendor },
		{ label: "型号", value: asset.model },
		{ label: "内部型号", value: getMetadataString(metadata, "internal_model") },
		{ label: "固定 IP", value: firstNonEmpty(asset.management_ip, getMetadataString(metadata, "fixed_ipv4")) },
		{ label: "主 MAC", value: getMetadataString(metadata, "mac") },
		{
			label: "颜色",
			value: firstNonEmpty(getMetadataString(metadata, "color"), getMetadataString(metadata, "device_color")),
		},
		{ label: "位置", value: asset.location },
		{ label: "用途", value: asset.role },
	].filter((row) => row.value)
}

function buildAssetParameterGroups(asset: AssetRecord): AssetParameterGroup[] {
	const archiveGroups = buildArchiveDetailSections(asset)
		.filter((section) => !hiddenArchiveParameterGroupTitles.has(section.title))
		.flatMap((section) =>
			splitArchiveSectionIntoParameterGroups(section).map((group, index) => ({
				...group,
				id: `archive-${normalizeGroupId(group.title)}-${index}`,
			}))
		)
	const hostGroups = HOST_ASSET_TYPES.includes(asset.type)
		? buildHostHardwareProfileGroups(asset)
				.filter((group) => group.rows.length > 0)
				.map((group, index) => ({
					id: `host-${normalizeGroupId(group.title)}-${index}`,
					title: group.title,
					icon: group.icon,
					rows: group.rows.map((row) => ({
						label: row.label,
						value: row.value,
						href: row.href,
						capture: row.capture,
						section: row.section,
					})),
					summary: getParameterGroupSummary(group.rows),
				}))
		: []
	return dedupeParameterGroups([...archiveGroups, ...hostGroups])
}

const hiddenArchiveParameterGroupTitles = new Set(["基础身份", "硬件识别", "固定地址", "接入信息", "生命周期", "备注"])

function splitArchiveSectionIntoParameterGroups(section: ArchiveDetailSection): Omit<AssetParameterGroup, "id">[] {
	if (section.title !== "硬件性能") {
		const rows = section.rows.map(archiveRowToParameterRow)
		return [
			{
				title: normalizeArchiveSectionTitle(section.title),
				icon: getParameterGroupIcon(section.title),
				rows,
				summary: getParameterGroupSummary(rows),
			},
		]
	}
	const buckets = [
		{
			title: "处理器",
			keys: [
				"cpu_model",
				"cpu_vendor",
				"cpu_process",
				"cpu_architecture",
				"cpu_cores",
				"cpu_frequency",
				"gpu_model",
				"gpu_detail",
			],
			icon: <CpuIcon className="size-4" />,
		},
		{
			title: "内存",
			keys: ["memory_gb", "memory_detail", "memory_type"],
			icon: <HardDriveIcon className="size-4" />,
		},
		{
			title: "存储",
			keys: ["storage_gb", "storage_detail", "storage_options"],
			icon: <HardDriveIcon className="size-4" />,
		},
	]
	return buckets.flatMap((bucket) => {
		const rows = section.rows.filter((row) => bucket.keys.includes(row.field.key)).map(archiveRowToParameterRow)
		if (rows.length === 0) return []
		return [{ title: bucket.title, icon: bucket.icon, rows, summary: getParameterGroupSummary(rows) }]
	})
}

function archiveRowToParameterRow(row: ArchiveDetailRow): AssetParameterRow {
	const isUrl = row.field.type === "url" && /^https?:\/\//i.test(row.value)
	const display = formatAssetParameterRowDisplay(row.field, row.value)
	return {
		label: display.label,
		value: display.value,
		href: isUrl ? row.value : undefined,
		capture: row.field.capture,
		section: getArchiveRowDetailSection(row.field.key),
	}
}

const assetDisplayUnitByFieldKey = new Map<string, string>([
	["battery_capacity_mah", "mAh"],
	["capacity_w", "W"],
	["charging_power_w", "W"],
	["default_port_speed_mbps", "Mbps"],
	["disk_gb", "GB"],
	["down_mbps", "Mbps"],
	["gpu_vram_gb", "GB"],
	["memory_gb", "GB"],
	["memory_speed_mhz", "MHz"],
	["primary_nic_speed_mbps", "Mbps"],
	["screen_refresh_rate", "Hz"],
	["storage_gb", "GB"],
	["touch_sampling_rate", "Hz"],
	["up_mbps", "Mbps"],
])

const assetDisplayLabelUnits = [
	"mAh",
	"Mbps",
	"MHz",
	"GHz",
	"Hz",
	"GB",
	"TB",
	"MB",
	"KB",
	"VA",
	"W",
	"mm",
	"cm",
	"kg",
	"g",
]

function formatAssetParameterRowDisplay(field: AssetFieldDefinition, value: string) {
	const unit = getAssetParameterDisplayUnit(field)
	if (!unit) return { label: field.label, value }
	return {
		label: stripAssetParameterLabelUnit(field.label, unit),
		value: formatAssetParameterValueWithUnit(value, unit),
	}
}

function getAssetParameterDisplayUnit(field: AssetFieldDefinition) {
	const unitFromKey = assetDisplayUnitByFieldKey.get(field.key)
	if (unitFromKey) return unitFromKey
	return assetDisplayLabelUnits.find((unit) => new RegExp(`\\s${escapeRegExp(unit)}$`, "i").test(field.label))
}

function stripAssetParameterLabelUnit(label: string, unit: string) {
	return label.replace(new RegExp(`\\s*${escapeRegExp(unit)}$`, "i"), "").trim()
}

function formatAssetParameterValueWithUnit(value: string, unit: string) {
	const trimmed = value.trim()
	if (!trimmed) return trimmed
	const numericUnitPattern = new RegExp(`(\\d(?:[\\d.,]*))\\s*${escapeRegExp(unit)}(?=$|[\\s,/，、;；)])`, "gi")
	const normalized = trimmed.replace(numericUnitPattern, (_match, number) => `${number} ${unit}`)
	if (normalized !== trimmed) return normalized
	if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return `${trimmed} ${unit}`
	return trimmed
}

function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

const archiveParameterDetailSectionMap = new Map<string, string>([
	["cpu_model", "处理器"],
	["cpu_vendor", "处理器"],
	["cpu_process", "处理器"],
	["cpu_architecture", "处理器"],
	["cpu_cores", "处理器"],
	["cpu_frequency", "处理器"],
	["gpu_model", "图形"],
	["gpu_detail", "图形"],
	["memory_gb", "内存"],
	["memory_detail", "内存"],
	["memory_type", "内存"],
	["storage_gb", "存储"],
	["storage_detail", "存储"],
	["storage_options", "存储"],
	["screen_size", "面板"],
	["display_type", "面板"],
	["display_resolution", "显示"],
	["screen_refresh_rate", "显示"],
	["touch_sampling_rate", "显示"],
	["display_brightness", "显示"],
	["display_color_depth", "显示"],
	["hdr_support", "显示"],
	["display_protection", "耐用性"],
	["battery_capacity_mah", "电池"],
	["battery_type", "电池"],
	["charging_power_w", "有线充电"],
	["wireless_charging", "无线充电"],
	["battery_life_note", "续航"],
	["camera_summary", "摘要"],
	["rear_camera_detail", "后置影像"],
	["rear_main_camera", "后置影像"],
	["rear_ultrawide_camera", "后置影像"],
	["rear_macro_camera", "后置影像"],
	["rear_telephoto_camera", "后置影像"],
	["front_camera_detail", "前置影像"],
	["video_recording", "视频"],
	["image_stabilization", "防抖 / 对焦"],
	["mobile_network", "蜂窝"],
	["sim_detail", "蜂窝"],
	["wifi_standard", "无线"],
	["bluetooth_version", "无线"],
	["positioning", "定位"],
	["usb_detail", "接口"],
	["nfc", "近场 / 红外"],
	["infrared", "近场 / 红外"],
	["dimensions", "尺寸重量"],
	["weight", "尺寸重量"],
	["body_material", "外观"],
	["colors_available", "外观"],
	["water_resistance", "防护"],
	["speaker_detail", "音频"],
	["audio_detail", "音频"],
	["biometrics", "识别"],
	["sensor_detail", "传感器"],
	["cooling_system", "散热"],
	["official_image_url", "资料来源"],
	["account_note", "归属"],
	["power_mode", "供电"],
])

function getArchiveRowDetailSection(fieldKey: string) {
	const section = archiveParameterDetailSectionMap.get(fieldKey)
	if (section) return section
	if (fieldKey.endsWith("_support_url")) return "资料来源"
	return undefined
}

function getParameterGroupSummary(rows: { label: string; value: string }[]) {
	const first = rows.find((row) => row.value)
	if (!first) return "暂无数据"
	return first.value
}

function normalizeArchiveSectionTitle(title: string) {
	if (title === "网络与接口") return "网络接口"
	if (title === "机身与外观") return "外观尺寸"
	return title
}

function getParameterGroupIcon(title: string) {
	if (title.includes("屏幕")) return <MonitorIcon className="size-4" />
	if (title.includes("电池") || title.includes("充电")) return <BatteryIcon className="size-4" />
	if (title.includes("影像")) return <ImageIcon className="size-4" />
	if (title.includes("网络") || title.includes("接口")) return <NetworkIcon className="size-4" />
	if (title.includes("外观") || title.includes("尺寸")) return <BoxesIcon className="size-4" />
	if (title.includes("账号")) return <Globe2Icon className="size-4" />
	return <ListChecksIcon className="size-4" />
}

function normalizeGroupId(value: string) {
	return normalizeComparableText(value).replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
}

function dedupeParameterGroups(groups: AssetParameterGroup[]) {
	const seen = new Set<string>()
	return groups.filter((group) => {
		if (group.rows.length === 0) return false
		const signature = `${group.title}:${group.rows.map((row) => `${row.label}:${row.value}`).join("|")}`
		if (seen.has(signature)) return false
		seen.add(signature)
		return true
	})
}

function buildAssetShowcaseTags(asset: AssetRecord) {
	const tags: AssetShowcaseTag[] = []
	const seen = new Set<string>()
	const metadata = asset.metadata ?? {}
	const internalModel = getMetadataString(metadata, "internal_model")
	const fixedIp = firstNonEmpty(asset.management_ip, getMetadataString(metadata, "fixed_ipv4"))
	const mainMac = getMetadataString(metadata, "mac")
	const assetTag = getMetadataString(metadata, "asset_tag")
	const owner = getMetadataString(metadata, "owner")
	const color = firstNonEmpty(getMetadataString(metadata, "color"), getMetadataString(metadata, "device_color"))

	function add(label: string, value?: string, tone?: AssetShowcaseTag["tone"]) {
		const text = value?.trim()
		if (!text) return
		const key = `${label}:${text}`
		if (seen.has(key)) return
		seen.add(key)
		tags.push({ label, value: text, tone })
	}

	add("位置", asset.location || "未填写", asset.location ? "strong" : "neutral")
	add("用途", asset.role || "未填写", asset.role ? "strong" : "neutral")
	add("归属", owner)
	add("内部型号", internalModel)
	add("IP", fixedIp)
	add("MAC", mainMac)
	add("颜色", color)
	add("资产编号", assetTag)
	add("序列号", asset.serial_number)
	asset.tags?.slice(0, 4).forEach((tag) => {
		add("标签", tag)
	})
	return tags.slice(0, 12)
}

type AssetRecognitionRequirement = {
	label: string
	value: string
	ok: boolean
}

function AssetEditWorkbench({
	asset,
	state,
	readOnly,
	saving,
	recognitionStage,
	recognitionMessage,
	officialColorStage,
	officialColorMessage,
	visualGenerationStage,
	visualGenerationMessage,
	recognitionRequirements,
	latestReport,
	latestSuggestions,
	actionableSuggestions,
	visualColor,
	visualFrameCount,
	onVisualColorChange,
	onSaveProfile,
	onRunSmartRecognition,
	onFetchOfficialColors,
	onAcceptSuggestion,
	onAcceptAllSuggestions,
	onGenerateVisual,
	onOpenInterface,
	onOpenRelation,
	onOpenMaintenance,
	onOpenAttachment,
	onDelete,
}: {
	asset: AssetRecord
	state: AssetDetailState
	readOnly: boolean
	saving: boolean
	recognitionStage: "idle" | "blocked" | "running" | "ready" | "failed"
	recognitionMessage: string
	officialColorStage: "idle" | "blocked" | "running" | "ready" | "failed"
	officialColorMessage: string
	visualGenerationStage: "idle" | "running" | "ready" | "failed"
	visualGenerationMessage: string
	recognitionRequirements: AssetRecognitionRequirement[]
	latestReport?: AssetEnrichmentReportRecord
	latestSuggestions: AssetEnrichmentSuggestionRecord[]
	actionableSuggestions: AssetEnrichmentSuggestionRecord[]
	visualColor: string
	visualFrameCount: number
	onVisualColorChange: (value: string) => void
	onSaveProfile: (event: React.FormEvent<HTMLFormElement>) => void
	onRunSmartRecognition: () => void
	onFetchOfficialColors: () => void
	onAcceptSuggestion: (suggestion: AssetEnrichmentSuggestionRecord) => void
	onAcceptAllSuggestions: () => void
	onGenerateVisual: () => void
	onOpenInterface: () => void
	onOpenRelation: () => void
	onOpenMaintenance: () => void
	onOpenAttachment: () => void
	onDelete: () => void
}) {
	const metadata = asset.metadata ?? {}
	const [selectedType, setSelectedType] = useState<AssetRecord["type"]>(asset.type)
	const [locationValue, setLocationValue] = useState(asset.location || "")
	const [assetTagValue, setAssetTagValue] = useState(getMetadataString(metadata, "asset_tag"))
	const officialColorOptions = useMemo(
		() => getAssetOfficialColorOptions(asset, state.enrichmentSuggestions),
		[asset, state.enrichmentSuggestions]
	)
	const visualBlockReason = getAssetVisualGenerationBlockReason(asset, visualColor, officialColorOptions)
	const visualGenerationRunning = visualGenerationStage === "running"
	useEffect(() => {
		setSelectedType(asset.type)
		setLocationValue(asset.location || "")
		setAssetTagValue(getMetadataString(asset.metadata, "asset_tag"))
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
	const latestVisual = getAssetDisplayVisual(state.visuals)
	const latestVisualFrame = latestVisual?.frames?.find(isDisplayableAssetVisualFrame)
	return (
		<DialogContent className="flex max-h-[92vh] max-w-6xl flex-col overflow-hidden">
			<DialogHeader className="shrink-0">
				<DialogTitle>编辑资产</DialogTitle>
				<DialogDescription>
					主档、智能匹配、参数替换、设备图片统一化和资产子档案都在这里处理；外层详情页只负责查看。
				</DialogDescription>
			</DialogHeader>
			<div className="min-h-0 overflow-y-auto pr-1">
				<div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
					<form onSubmit={onSaveProfile} className="grid gap-3">
						<section className="rounded-lg border border-border/70 bg-surface-soft p-3">
							<div className="mb-3 flex items-center justify-between gap-3">
								<div className="min-w-0">
									<div className="text-sm font-semibold text-foreground">主档参数</div>
									<div className="mt-1 text-xs text-muted-foreground">智能匹配只读取已经保存的主档。</div>
								</div>
								<Button type="submit" size="sm" disabled={readOnly || saving} className="gap-2">
									<PencilIcon className="size-3.5" />
									保存主档
								</Button>
							</div>
							<div className="grid gap-3 sm:grid-cols-2">
								<TextField name="name" label="资产名称" required defaultValue={asset.name} />
								<SelectField
									name="type"
									label="所属类型"
									options={ASSET_TYPE_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
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
									status={officialColorStage}
									message={officialColorMessage}
									disabled={readOnly || saving}
									onFetch={onFetchOfficialColors}
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
								<TextField
									name="management_ip"
									label="管理 IPv4"
									required
									defaultValue={asset.management_ip || getMetadataString(metadata, "fixed_ipv4")}
								/>
								<TextField
									name="fixed_ipv4"
									label="固定 IPv4"
									required
									defaultValue={getMetadataString(metadata, "fixed_ipv4") || asset.management_ip}
								/>
								<SelectField
									name="status"
									label="状态"
									options={STATUS_OPTIONS}
									defaultValue={asset.status || "active"}
								/>
								<TextField name="role" label="用途 / 角色" defaultValue={asset.role} />
								<TextField name="serial_number" label="序列号" defaultValue={asset.serial_number} />
								<TextField
									name="support_url"
									label="厂家支持页"
									type="url"
									defaultValue={getMetadataString(metadata, "support_url")}
									className="sm:col-span-2"
								/>
								<TextField
									name="management_url"
									label="管理 URL"
									type="url"
									defaultValue={getMetadataString(metadata, "management_url")}
									className="sm:col-span-2"
								/>
								<div className="grid gap-2 sm:col-span-2">
									<Label htmlFor="notes">备注</Label>
									<Textarea id="notes" name="notes" defaultValue={asset.notes} rows={3} />
								</div>
							</div>
						</section>

						<section className="rounded-lg border border-border/70 bg-surface-soft p-3">
							<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
								<div className="min-w-0">
									<div className="text-sm font-semibold text-foreground">智能匹配</div>
									<div className="mt-1 text-xs text-muted-foreground">缺少必填参数时不会启动 Agent。</div>
								</div>
								<div className="flex flex-wrap items-center gap-2">
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={onRunSmartRecognition}
										disabled={readOnly || saving}
										className="gap-2"
									>
										<ListChecksIcon className="size-3.5" />
										智能匹配
									</Button>
									<Button
										type="button"
										size="sm"
										onClick={onAcceptAllSuggestions}
										disabled={readOnly || saving || actionableSuggestions.length === 0}
										className="gap-2"
									>
										<PencilIcon className="size-3.5" />
										一键替换
									</Button>
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
									onAcceptSuggestion={onAcceptSuggestion}
								/>
							</div>
						</section>
					</form>

					<div className="grid content-start gap-3">
						<section className="rounded-lg border border-border/70 bg-surface-soft p-3">
							<div className="mb-3 flex items-center justify-between gap-3">
								<div className="min-w-0">
									<div className="text-sm font-semibold text-foreground">全貌图</div>
									<div className="mt-1 text-xs text-muted-foreground">官方配色、参考图和统一化预览集中在编辑里。</div>
								</div>
								<Button
									type="button"
									size="sm"
									variant="outline"
									onClick={onGenerateVisual}
									disabled={readOnly || saving || Boolean(visualBlockReason) || visualGenerationRunning}
									className="gap-2"
								>
									<ImageIcon className="size-3.5" />
									{visualGenerationRunning ? "生成中" : "生成统一图"}
								</Button>
							</div>
							<div className="grid gap-3">
								<div className="grid gap-3 sm:grid-cols-2">
									<OfficialColorPicker
										value={visualColor}
										options={officialColorOptions}
										requireOfficial={isOfficialColorRequiredForAssetType(asset.type)}
										status={officialColorStage}
										message={officialColorMessage}
										disabled={readOnly || saving}
										onFetch={onFetchOfficialColors}
										onChange={onVisualColorChange}
									/>
									<div className="grid gap-2">
										<Label htmlFor="asset-visual-frame-count">输出数量</Label>
										<Input id="asset-visual-frame-count" value={visualFrameCount} readOnly className="bg-card" />
										<div className="text-xs text-muted-foreground">固定生成白天 / 夜晚两张统一风格图片。</div>
									</div>
								</div>
								{visualBlockReason ? (
									<div className="rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-200">
										{visualBlockReason}
									</div>
								) : (
									<div className="rounded-md border border-border/70 bg-card px-3 py-2 text-xs leading-5 text-muted-foreground">
										设备图片 Agent 会先使用官方 / 可追溯参考图，再调用 Agnes 图片模型统一背景、比例和摆放。
									</div>
								)}
								{visualGenerationMessage && (
									<div
										className={cn(
											"rounded-md border px-3 py-2 text-xs leading-5",
											visualGenerationStage === "failed"
												? "border-amber-500/25 bg-amber-500/5 text-amber-700 dark:text-amber-200"
												: visualGenerationStage === "ready"
													? "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-200"
													: "border-border/70 bg-card text-muted-foreground"
										)}
									>
										{visualGenerationMessage}
									</div>
								)}
								<div className="relative grid aspect-[3/4] max-h-[30rem] min-h-[18rem] place-items-center overflow-hidden rounded-md border border-border/70 bg-card">
									{latestVisualFrame?.url ? (
										<img
											src={latestVisualFrame.url}
											alt="设备全貌图预览"
											className="h-full w-full object-contain p-4"
										/>
									) : (
										<div className="grid place-items-center gap-2 text-center text-muted-foreground">
											<div className="grid size-12 place-items-center rounded-md border border-border/70 bg-surface-soft">
												<ImageIcon className="size-5" />
											</div>
											<div className="text-xs">暂无预览</div>
										</div>
									)}
									<div className="absolute left-2 top-2 rounded-md border border-border/70 bg-card px-2 py-1 text-[11px] text-muted-foreground">
										{getAssetVisualTaskMeta(state.aiTasks, state.visuals)}
									</div>
								</div>
							</div>
						</section>

						<section className="rounded-lg border border-border/70 bg-surface-soft p-3">
							<div className="mb-3 text-sm font-semibold text-foreground">子档案</div>
							<div className="grid grid-cols-2 gap-2">
								<WorkbenchMiniAction
									label="接口"
									value={`${state.interfaces.length} 条`}
									onClick={onOpenInterface}
									disabled={readOnly}
								/>
								<WorkbenchMiniAction
									label="关系"
									value={`${state.relations.length} 条`}
									onClick={onOpenRelation}
									disabled={readOnly}
								/>
								<WorkbenchMiniAction
									label="维护"
									value={`${state.maintenance.length} 条`}
									onClick={onOpenMaintenance}
									disabled={readOnly}
								/>
								<WorkbenchMiniAction
									label="附件"
									value={`${state.attachments.length} 个`}
									onClick={onOpenAttachment}
									disabled={readOnly}
								/>
							</div>
						</section>

						<section className="rounded-lg border border-destructive/25 bg-destructive/5 p-3">
							<div className="mb-3 text-sm font-semibold text-destructive">危险操作</div>
							<Button
								type="button"
								variant="destructive"
								className="w-full gap-2"
								onClick={onDelete}
								disabled={readOnly || saving}
							>
								<Trash2Icon className="size-4" />
								删除资产
							</Button>
						</section>
					</div>
				</div>
			</div>
		</DialogContent>
	)
}

function AssetSuggestionWorkbench({
	latestReport,
	suggestions,
	actionableSuggestions,
	readOnly,
	saving,
	onAcceptSuggestion,
}: {
	latestReport?: AssetEnrichmentReportRecord
	suggestions: AssetEnrichmentSuggestionRecord[]
	actionableSuggestions: AssetEnrichmentSuggestionRecord[]
	readOnly: boolean
	saving: boolean
	onAcceptSuggestion: (suggestion: AssetEnrichmentSuggestionRecord) => void
}) {
	if (!latestReport) {
		return (
			<div className="rounded-md border border-dashed border-border/70 bg-card px-3 py-3 text-sm text-muted-foreground">
				还没有智能匹配报告。
			</div>
		)
	}
	if (actionableSuggestions.length === 0) {
		return (
			<div className="rounded-md border border-border/70 bg-card px-3 py-3 text-sm text-muted-foreground">
				最近报告没有需要替换的参数。报告时间：{formatTime(latestReport.created)}
			</div>
		)
	}
	return (
		<div className="grid gap-2">
			<div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
				<span>
					{formatTime(latestReport.created)} · {getEnrichmentReportStatusLabel(latestReport.status)}
				</span>
				<span>
					{actionableSuggestions.length} 个可替换参数 / {suggestions.length} 条建议
				</span>
			</div>
			{actionableSuggestions.map((suggestion) => (
				<div key={suggestion.id} className="rounded-md border border-border/70 bg-card px-3 py-2">
					<div className="flex min-w-0 flex-wrap items-center gap-2">
						<span className="font-medium text-foreground">{suggestion.target_label}</span>
						{suggestion.conflict ? <MetaTag>不一致</MetaTag> : <MetaTag>未填写</MetaTag>}
						<ConfidenceTag confidence={suggestion.confidence ?? 0} />
						<Button
							type="button"
							size="sm"
							variant="outline"
							className="ms-auto h-8 gap-1.5 px-2 text-xs"
							onClick={() => onAcceptSuggestion(suggestion)}
							disabled={readOnly || saving}
						>
							<PencilIcon className="size-3.5" />
							替换
						</Button>
					</div>
					<div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
						<SuggestionValue label="当前参数" value={suggestion.current_value || "未填写"} />
						<SuggestionValue label="新参数" value={suggestion.recommended_value || "无"} />
					</div>
				</div>
			))}
		</div>
	)
}

function WorkbenchMiniAction({
	label,
	value,
	onClick,
	disabled,
}: {
	label: string
	value: string
	onClick: () => void
	disabled?: boolean
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className="flex min-h-12 items-center justify-between gap-2 rounded-md border border-border/70 bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-50"
		>
			<span className="font-medium text-foreground">{label}</span>
			<span className="text-xs text-muted-foreground">{value}</span>
		</button>
	)
}

function ManagementSection({
	title,
	description,
	columns,
	children,
}: {
	title: string
	description: string
	columns: string
	children: ReactNode
}) {
	return (
		<section className="rounded-lg border border-border/70 bg-surface-soft p-3">
			<div className="flex min-w-0 flex-wrap items-end justify-between gap-2">
				<div className="min-w-0">
					<div className="text-sm font-semibold text-foreground">{title}</div>
					<div className="mt-1 text-xs leading-5 text-muted-foreground">{description}</div>
				</div>
			</div>
			<div className={cn("mt-3 grid gap-2", columns)}>{children}</div>
		</section>
	)
}

function ManagementActionCard({
	icon,
	title,
	description,
	meta,
	href,
	externalHref,
	onClick,
	disabled,
	tone = "default",
}: {
	icon: ReactNode
	title: string
	description: string
	meta: string
	href?: string
	externalHref?: string
	onClick?: () => void
	disabled?: boolean
	tone?: "default" | "danger"
}) {
	const className = cn(
		"group grid min-h-28 gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors",
		tone === "danger"
			? "border-destructive/30 bg-destructive/5 text-destructive hover:border-destructive/50 hover:bg-destructive/10"
			: "border-border/70 bg-card text-foreground hover:border-primary/30 hover:bg-surface-soft",
		disabled && "cursor-not-allowed opacity-55 hover:border-border/70 hover:bg-card"
	)
	const content = (
		<>
			<div className="flex min-w-0 items-start justify-between gap-2">
				<span
					className={cn(
						"grid size-8 shrink-0 place-items-center rounded-md border",
						tone === "danger"
							? "border-destructive/25 bg-card text-destructive"
							: "border-border/70 bg-surface-soft text-muted-foreground group-hover:text-foreground"
					)}
				>
					{icon}
				</span>
				<MetaTag>{meta}</MetaTag>
			</div>
			<div className="min-w-0">
				<div className={cn("text-sm font-semibold", tone === "danger" ? "text-destructive" : "text-foreground")}>
					{title}
				</div>
				<div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{description}</div>
			</div>
		</>
	)

	if (disabled) {
		return (
			<button type="button" className={className} disabled>
				{content}
			</button>
		)
	}
	if (externalHref) {
		return (
			<a href={externalHref} target="_blank" rel="noreferrer" className={className}>
				{content}
			</a>
		)
	}
	if (href) {
		return (
			<Link href={href} className={className}>
				{content}
			</Link>
		)
	}
	return (
		<button type="button" className={className} onClick={onClick}>
			{content}
		</button>
	)
}

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

function ArchiveCard({ asset }: { asset: AssetRecord }) {
	const sections = buildArchiveDetailSections(asset)
	return (
		<Card className="border-border/70 bg-card shadow-none">
			<CardHeader className="border-b border-border/70 bg-surface-soft px-4 py-3">
				<CardTitle className="text-lg tracking-[-0.02em]">详细参数</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-3 p-3">
				{sections.map((section) => {
					if (section.rows.length === 0) return null
					return (
						<section
							key={section.title}
							className="grid gap-2 border-border/70 border-b pb-3 last:border-b-0 last:pb-0"
						>
							<div className="text-xs font-semibold text-muted-foreground">{section.title}</div>
							<div className="grid gap-x-4 gap-y-1.5 md:grid-cols-2 2xl:grid-cols-3">
								{section.rows.map((row) => (
									<ArchiveDetailRow key={row.field.key} field={row.field} value={row.value} />
								))}
							</div>
						</section>
					)
				})}
			</CardContent>
		</Card>
	)
}

type ArchiveDetailSection = {
	title: string
	rows: ArchiveDetailRow[]
}

type ArchiveDetailRow = {
	field: AssetFieldDefinition
	value: string
}

const archivePersonalDeviceSectionMap = new Map<string, string>([
	["cpu_model", "硬件性能"],
	["cpu_vendor", "硬件性能"],
	["cpu_process", "硬件性能"],
	["cpu_architecture", "硬件性能"],
	["cpu_cores", "硬件性能"],
	["cpu_frequency", "硬件性能"],
	["gpu_model", "硬件性能"],
	["gpu_detail", "硬件性能"],
	["memory_gb", "硬件性能"],
	["memory_detail", "硬件性能"],
	["memory_type", "硬件性能"],
	["storage_gb", "硬件性能"],
	["storage_detail", "硬件性能"],
	["storage_options", "硬件性能"],
	["screen_size", "屏幕"],
	["display_type", "屏幕"],
	["display_resolution", "屏幕"],
	["screen_refresh_rate", "屏幕"],
	["touch_sampling_rate", "屏幕"],
	["display_brightness", "屏幕"],
	["display_color_depth", "屏幕"],
	["hdr_support", "屏幕"],
	["display_protection", "屏幕"],
	["battery_capacity_mah", "电池与充电"],
	["battery_type", "电池与充电"],
	["charging_power_w", "电池与充电"],
	["wireless_charging", "电池与充电"],
	["battery_life_note", "电池与充电"],
	["camera_summary", "影像"],
	["rear_camera_detail", "影像"],
	["rear_main_camera", "影像"],
	["rear_ultrawide_camera", "影像"],
	["rear_macro_camera", "影像"],
	["rear_telephoto_camera", "影像"],
	["front_camera_detail", "影像"],
	["video_recording", "影像"],
	["image_stabilization", "影像"],
	["mobile_network", "网络与接口"],
	["sim_detail", "网络与接口"],
	["wifi_standard", "网络与接口"],
	["bluetooth_version", "网络与接口"],
	["positioning", "网络与接口"],
	["usb_detail", "网络与接口"],
	["nfc", "网络与接口"],
	["infrared", "网络与接口"],
	["dimensions", "机身与外观"],
	["weight", "机身与外观"],
	["body_material", "机身与外观"],
	["colors_available", "机身与外观"],
	["water_resistance", "机身与外观"],
	["speaker_detail", "机身与外观"],
	["audio_detail", "机身与外观"],
	["biometrics", "机身与外观"],
	["sensor_detail", "机身与外观"],
	["cooling_system", "机身与外观"],
	["official_image_url", "机身与外观"],
	["account_note", "关联账号"],
	["power_mode", "关联账号"],
])

const hiddenArchiveDetailFieldKeys = new Set([
	"online_specs_summary",
	"device_os",
	"firmware_version",
	"bios_version",
	"bios_release_date",
])

function buildArchiveDetailSections(asset: AssetRecord): ArchiveDetailSection[] {
	const sections = getAssetFormSections(asset.type)
	return sections.flatMap((section) => {
		const rows = buildArchiveDetailRows(asset, section.fields)
		if (rows.length === 0) return []
		if (section.title === "设备参数") {
			return splitArchiveRowsBySemanticSection(rows, archivePersonalDeviceSectionMap)
		}
		return [{ title: section.title, rows }]
	})
}

function buildArchiveDetailRows(asset: AssetRecord, fields: AssetFieldDefinition[]): ArchiveDetailRow[] {
	return fields
		.filter((field) => !hiddenArchiveDetailFieldKeys.has(field.key))
		.map((field) => ({
			field,
			value: getAssetFieldDisplayValue(asset, field),
		}))
		.filter((row) => row.value)
}

function splitArchiveRowsBySemanticSection(
	rows: ArchiveDetailRow[],
	sectionMap: Map<string, string>
): ArchiveDetailSection[] {
	const sections: ArchiveDetailSection[] = []
	for (const row of rows) {
		const title = sectionMap.get(row.field.key) ?? "其他参数"
		let section = sections.find((item) => item.title === title)
		if (!section) {
			section = { title, rows: [] }
			sections.push(section)
		}
		section.rows.push(row)
	}
	return sections
}

type HostHardwareProfileRow = {
	label: string
	value: string
	capture?: AssetFieldDefinition["capture"]
	href?: string
}

type HostHardwareProfileGroup = {
	title: string
	icon: ReactNode
	rows: HostHardwareProfileRow[]
}

function HostHardwareProfileCard({ asset }: { asset: AssetRecord }) {
	if (!HOST_ASSET_TYPES.includes(asset.type)) return null
	const groups = buildHostHardwareProfileGroups(asset)
	const hasRows = groups.some((group) => group.rows.length > 0)

	return (
		<Card className="border-border/70 bg-card shadow-none">
			<CardHeader className="border-b border-border/70 bg-surface-soft px-4 py-3">
				<div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
					<CardTitle className="text-lg tracking-[-0.02em]">计算机硬件档案</CardTitle>
					<div className="flex flex-wrap gap-1.5">
						<AssetFieldCaptureTag capture="manual" />
						<AssetFieldCaptureTag capture="agent_collectable" />
						<AssetFieldCaptureTag capture="future_collectable" />
					</div>
				</div>
			</CardHeader>
			<CardContent className="grid gap-3 p-4">
				{hasRows ? (
					<div className="grid gap-3 lg:grid-cols-2">
						{groups
							.filter((group) => group.rows.length > 0)
							.map((group) => (
								<section key={group.title} className="rounded-lg border border-border/70 bg-surface-soft p-3">
									<div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
										<span className="inline-flex size-7 items-center justify-center rounded-md border border-border/70 bg-card text-muted-foreground">
											{group.icon}
										</span>
										<span>{group.title}</span>
									</div>
									<div className="grid gap-2">
										{group.rows.map((row) => (
											<HostHardwareProfileLine key={`${group.title}-${row.label}`} row={row} />
										))}
									</div>
								</section>
							))}
					</div>
				) : (
					<EmptyBlock
						icon={<CpuIcon className="size-5" />}
						text="暂无计算机硬件档案。可先手动维护，后续专项识别 Agent 只生成待确认建议。"
					/>
				)}
			</CardContent>
		</Card>
	)
}

function HostHardwareProfileLine({ row }: { row: HostHardwareProfileRow }) {
	const content = row.href ? (
		<a
			href={row.href}
			target="_blank"
			rel="noreferrer"
			className="inline-flex min-w-0 max-w-full items-center gap-1.5 break-all text-sm font-medium text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
		>
			<span className="min-w-0 break-all">{row.value}</span>
			<ExternalLinkIcon className="size-3.5 shrink-0" />
		</a>
	) : (
		<div className="min-w-0 break-words text-sm font-medium text-foreground">{row.value}</div>
	)

	return (
		<div className="grid gap-1 rounded-md border border-border/70 bg-card px-3 py-2">
			<div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
				<span>{row.label}</span>
				<AssetFieldCaptureTag capture={row.capture} />
			</div>
			{content}
		</div>
	)
}

function ProfileCompletenessCard({ asset }: { asset: AssetRecord }) {
	const completeness = getAssetCompleteness(asset)
	const editHref = `${getPagePath($router, "assets")}?edit=${encodeURIComponent(asset.id)}&focus=profile`
	const visibleMissing = completeness.missing.slice(0, 4)
	const hiddenMissingCount = Math.max(0, completeness.missing.length - visibleMissing.length)
	return (
		<Card className="border-border/70 bg-card shadow-none">
			<CardHeader className="border-b border-border/70 bg-surface-soft px-3 py-2.5">
				<div className="flex items-center justify-between gap-3">
					<CardTitle className="text-base tracking-[-0.02em]">资料完整度</CardTitle>
					<ToneTag tone={completeness.tone}>{completeness.label}</ToneTag>
				</div>
			</CardHeader>
			<CardContent className="grid gap-2.5 p-3">
				<div className="grid gap-1">
					<div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
						<span>长期档案关键字段</span>
						<span className="font-mono text-foreground tabular-nums">{completeness.score}%</span>
					</div>
					<div className="h-1.5 overflow-hidden rounded-full bg-surface-soft">
						<div
							className={cn(
								"h-full rounded-full",
								completeness.tone === "danger"
									? "bg-red-500"
									: completeness.tone === "warning"
										? "bg-amber-500"
										: completeness.tone === "ok"
											? "bg-emerald-500"
											: "bg-muted-foreground"
							)}
							style={{ width: `${Math.max(4, Math.min(100, completeness.score))}%` }}
						/>
					</div>
				</div>
				{completeness.missing.length > 0 ? (
					<div className="grid gap-2">
						<div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
							<span>待补字段</span>
							<span>{completeness.missing.length} 项</span>
						</div>
						<div className="flex flex-wrap gap-1.5">
							{visibleMissing.map((field) => (
								<MetaTag key={field}>{field}</MetaTag>
							))}
							{hiddenMissingCount > 0 && <MetaTag>另 {hiddenMissingCount} 项</MetaTag>}
						</div>
					</div>
				) : (
					<div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
						当前类型的关键长期字段已经补齐。
					</div>
				)}
				<Button asChild variant="outline" size="sm" className="w-full gap-2">
					<Link href={editHref}>
						<PencilIcon className="size-4" />
						补充资产档案
					</Link>
				</Button>
			</CardContent>
		</Card>
	)
}

function AssetSourceProfileCard({ asset }: { asset: AssetRecord }) {
	const groups = getAssetSourceProfile(asset)
	return (
		<Card className="border-border/70 bg-card shadow-none">
			<CardHeader className="border-b border-border/70 bg-surface-soft px-3 py-2.5">
				<CardTitle className="flex items-center gap-2 text-base tracking-[-0.02em]">
					<ListChecksIcon className="size-4 text-muted-foreground" />
					资料来源边界
				</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-2 p-3">
				{groups.map((group) => (
					<div key={group.capture} className="rounded-md border border-border/70 bg-surface-soft px-3 py-2">
						<div className="flex min-w-0 items-center justify-between gap-3">
							<div className="min-w-0">
								<div className="flex flex-wrap items-center gap-1.5">
									<span className="text-sm font-medium text-foreground">{group.label}</span>
									<AssetFieldCaptureTag capture={group.capture} />
								</div>
							</div>
							<div className="shrink-0 rounded-md border border-border/70 bg-card px-2 py-1 text-xs font-medium tabular-nums text-foreground">
								{group.filled}/{group.total}
							</div>
						</div>
						<div className="mt-1 truncate text-xs text-muted-foreground">{group.brief}</div>
					</div>
				))}
			</CardContent>
		</Card>
	)
}

function InterfacesCard({
	interfaces,
	readOnly,
	onAdd,
	onEdit,
	onDelete,
}: {
	interfaces: AssetInterfaceRecord[]
	readOnly: boolean
	onAdd: () => void
	onEdit: (record: AssetInterfaceRecord) => void
	onDelete: (record: AssetInterfaceRecord) => void
}) {
	return (
		<Card className="border-border/70 bg-card shadow-none">
			<CardHeader className="border-b border-border/70 bg-surface-soft px-4 py-3">
				<div className="flex items-center justify-between gap-3">
					<CardTitle className="text-lg tracking-[-0.02em]">网络接口</CardTitle>
					<Button size="sm" variant="outline" onClick={onAdd} disabled={readOnly} className="gap-2">
						<PlusIcon className="size-4" />
						添加接口
					</Button>
				</div>
			</CardHeader>
			<CardContent className="p-4">
				{interfaces.length === 0 ? (
					<EmptyBlock
						icon={<NetworkIcon className="size-5" />}
						text="暂无接口，添加固定 IP、MAC 和速率后可被拓扑复用。"
					/>
				) : (
					<div className="grid gap-2">
						{interfaces.map((item) => (
							<div key={item.id} className="rounded-lg border border-border/70 bg-surface-soft p-3">
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<div className="flex flex-wrap items-center gap-2">
											<div className="font-medium text-foreground">{item.name}</div>
											<MetaTag>{getInterfaceKindLabel(item.kind)}</MetaTag>
											{item.primary && <MetaTag>主接口</MetaTag>}
											<StatusBadge status={item.connected ? "active" : "inactive"} />
										</div>
										<div className="mt-2 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
											{item.mac && <span>MAC: {item.mac}</span>}
											{item.speed_mbps ? <span>速率: {formatSpeed(item.speed_mbps)}</span> : null}
											{item.ipv4 && <span>IPv4: {item.ipv4}</span>}
											{item.ipv6 && <span>IPv6: {item.ipv6}</span>}
											<span>来源: {getInterfaceSourceLabel(item.source)}</span>
										</div>
									</div>
									<div className="flex shrink-0 items-center gap-1">
										<Button
											variant="ghost"
											size="icon"
											className="size-9"
											onClick={() => onEdit(item)}
											disabled={readOnly}
											aria-label="编辑接口"
										>
											<PencilIcon className="size-4" />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											className="size-9"
											onClick={() => onDelete(item)}
											disabled={readOnly}
											aria-label="删除接口"
										>
											<Trash2Icon className="size-4" />
										</Button>
									</div>
								</div>
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	)
}

function RelationsCard({
	assetId,
	asset,
	assets,
	interfaces,
	relations,
	childAssets,
	readOnly,
	onAdd,
	onAddGuide,
	onEdit,
	onDelete,
}: {
	assetId: string
	asset: AssetRecord
	assets: AssetRecord[]
	interfaces: AssetInterfaceRecord[]
	relations: AssetRelationRecord[]
	childAssets: AssetRecord[]
	readOnly: boolean
	onAdd: () => void
	onAddGuide: (guide: RelationGuideId) => void
	onEdit: (record: AssetRelationRecord) => void
	onDelete: (record: AssetRelationRecord) => void
}) {
	const assetMap = new Map(assets.map((item) => [item.id, item]))
	const interfaceMap = new Map(interfaces.map((item) => [item.id, item]))
	return (
		<Card className="border-border/70 bg-card shadow-none">
			<CardHeader className="border-b border-border/70 bg-surface-soft px-4 py-3">
				<div className="flex items-center justify-between gap-3">
					<CardTitle className="text-lg tracking-[-0.02em]">资产关系</CardTitle>
					<div className="flex items-center gap-2">
						<Button asChild size="sm" variant="outline" className="gap-2">
							<Link href={getNetworkTopologyFocusHref({ asset: assetId })}>
								<NetworkIcon className="size-4" />
								拓扑定位
							</Link>
						</Button>
						<Button size="sm" variant="outline" onClick={onAdd} disabled={readOnly} className="gap-2">
							<PlusIcon className="size-4" />
							添加关系
						</Button>
					</div>
				</div>
			</CardHeader>
			<CardContent className="grid gap-2 p-4">
				<div className="grid gap-2 sm:grid-cols-2">
					{relationGuides.map((guide) => (
						<button
							key={guide.id}
							type="button"
							onClick={() => onAddGuide(guide.id)}
							disabled={readOnly}
							className="rounded-lg border border-border/70 bg-surface-soft px-3 py-2 text-left text-muted-foreground transition-colors hover:border-border hover:bg-card hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
						>
							<div className="text-sm font-medium">{guide.label}</div>
							<div className="mt-1 line-clamp-2 text-xs leading-5">{guide.description}</div>
						</button>
					))}
				</div>
				{asset.parent_asset && (
					<RelationLine
						label="宿主关系"
						direction="运行在"
						target={assetMap.get(asset.parent_asset)}
						href={getPagePath($router, "asset", { id: asset.parent_asset })}
					/>
				)}
				{childAssets.map((child) => (
					<RelationLine
						key={child.id}
						label="下属资产"
						direction="承载"
						target={child}
						href={getPagePath($router, "asset", { id: child.id })}
					/>
				))}
				{relations.map((relation) => {
					const peerId = relation.source_asset === assetId ? relation.target_asset : relation.source_asset
					const peer = assetMap.get(peerId)
					return (
						<div key={relation.id} className="rounded-lg border border-border/70 bg-surface-soft p-3">
							<div className="flex items-start justify-between gap-3">
								<RelationLine
									label={getRelationKindLabel(relation.kind)}
									direction={relation.source_asset === assetId ? "指向" : "来自"}
									target={peer}
									href={peer ? getPagePath($router, "asset", { id: peer.id }) : undefined}
									description={[relation.label, getRelationEndpointLabel(relation, assetMap, interfaceMap)]
										.filter(Boolean)
										.join(" · ")}
									compact
								/>
								<div className="flex shrink-0 items-center gap-1">
									<Button asChild variant="ghost" size="icon" className="size-9" aria-label="在拓扑中定位关系">
										<Link href={getNetworkTopologyFocusHref({ relation: relation.id })}>
											<NetworkIcon className="size-4" />
										</Link>
									</Button>
									<Button
										variant="ghost"
										size="icon"
										className="size-9"
										onClick={() => onEdit(relation)}
										disabled={readOnly}
										aria-label="编辑关系"
									>
										<PencilIcon className="size-4" />
									</Button>
									<Button
										variant="ghost"
										size="icon"
										className="size-9"
										onClick={() => onDelete(relation)}
										disabled={readOnly}
										aria-label="删除关系"
									>
										<Trash2Icon className="size-4" />
									</Button>
								</div>
							</div>
						</div>
					)
				})}
				{!asset.parent_asset && childAssets.length === 0 && relations.length === 0 && (
					<EmptyBlock icon={<LinkIcon className="size-5" />} text="暂无关系。可添加网络连接、宿主、依赖或归属关系。" />
				)}
			</CardContent>
		</Card>
	)
}

function MaintenanceCard({
	records,
	readOnly,
	onAdd,
	onEdit,
	onDelete,
}: {
	records: AssetMaintenanceRecord[]
	readOnly: boolean
	onAdd: () => void
	onEdit: (record: AssetMaintenanceRecord) => void
	onDelete: (record: AssetMaintenanceRecord) => void
}) {
	return (
		<Card className="border-border/70 bg-card shadow-none">
			<CardHeader className="border-b border-border/70 bg-surface-soft px-4 py-3">
				<div className="flex items-center justify-between gap-3">
					<CardTitle className="text-lg tracking-[-0.02em]">维护记录</CardTitle>
					<Button size="sm" variant="outline" onClick={onAdd} disabled={readOnly} className="gap-2">
						<PlusIcon className="size-4" />
						添加记录
					</Button>
				</div>
			</CardHeader>
			<CardContent className="p-4">
				{records.length === 0 ? (
					<EmptyBlock
						icon={<BoxesIcon className="size-5" />}
						text="暂无维护记录。后续购买、上线、维修和升级都记录在这里。"
					/>
				) : (
					<div className="grid gap-2">
						{records.map((record) => (
							<div key={record.id} className="rounded-lg border border-border/70 bg-surface-soft p-3">
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<div className="flex flex-wrap items-center gap-2">
											<MetaTag>{getMaintenanceKindLabel(record.kind)}</MetaTag>
											<div className="font-medium text-foreground">{record.title}</div>
										</div>
										<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
											{record.event_date && <span>{formatDate(record.event_date)}</span>}
											{record.actor && <span>来源: {record.actor}</span>}
											{record.cost && <span>费用: {record.cost}</span>}
										</div>
										{record.notes && <div className="mt-2 text-sm leading-6 text-muted-foreground">{record.notes}</div>}
									</div>
									<div className="flex shrink-0 items-center gap-1">
										<Button
											variant="ghost"
											size="icon"
											className="size-9"
											onClick={() => onEdit(record)}
											disabled={readOnly}
											aria-label="编辑维护记录"
										>
											<PencilIcon className="size-4" />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											className="size-9"
											onClick={() => onDelete(record)}
											disabled={readOnly}
											aria-label="删除维护记录"
										>
											<Trash2Icon className="size-4" />
										</Button>
									</div>
								</div>
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	)
}

function AttachmentsCard({
	records,
	fileToken,
	readOnly,
	onAdd,
	onDelete,
}: {
	records: AssetAttachmentRecord[]
	fileToken: string
	readOnly: boolean
	onAdd: () => void
	onDelete: (record: AssetAttachmentRecord) => void
}) {
	return (
		<Card className="border-border/70 bg-card shadow-none">
			<CardHeader className="border-b border-border/70 bg-surface-soft px-4 py-3">
				<div className="flex items-center justify-between gap-3">
					<CardTitle className="text-lg tracking-[-0.02em]">资产附件</CardTitle>
					<Button size="sm" variant="outline" onClick={onAdd} disabled={readOnly} className="gap-2">
						<UploadIcon className="size-4" />
						上传附件
					</Button>
				</div>
			</CardHeader>
			<CardContent className="p-4">
				{records.length === 0 ? (
					<EmptyBlock
						icon={<PaperclipIcon className="size-5" />}
						text="暂无资产附件。设备照片、发票、保修凭证、说明书和配置备份可以保存在这里。"
					/>
				) : (
					<div className="grid gap-2">
						{records.map((record) => (
							<div key={record.id} className="rounded-lg border border-border/70 bg-surface-soft p-3">
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<div className="flex flex-wrap items-center gap-2">
											<MetaTag>{getAttachmentKindLabel(record.kind)}</MetaTag>
											<div className="font-medium text-foreground">{record.title}</div>
											<MetaTag>{record.files?.length ?? 0} 个文件</MetaTag>
										</div>
										{record.notes && <div className="mt-2 text-sm leading-6 text-muted-foreground">{record.notes}</div>}
										<div className="mt-3 flex flex-wrap gap-2">
											{(record.files ?? []).map((fileName) => (
												<AssetAttachmentFileLink
													key={fileName}
													record={record}
													fileName={fileName}
													fileToken={fileToken}
												/>
											))}
										</div>
									</div>
									<Button
										variant="ghost"
										size="icon"
										className="size-9 shrink-0"
										onClick={() => onDelete(record)}
										disabled={readOnly}
										aria-label="删除资产附件"
									>
										<Trash2Icon className="size-4" />
									</Button>
								</div>
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	)
}

function AssetAttachmentFileLink({
	record,
	fileName,
	fileToken,
}: {
	record: AssetAttachmentRecord
	fileName: string
	fileToken: string
}) {
	const url = fileToken ? pb.files.getURL(record, fileName, { token: fileToken }) : ""
	const thumbUrl =
		fileToken && isImageAttachment(fileName)
			? pb.files.getURL(record, fileName, { token: fileToken, thumb: "80x80f" })
			: ""
	const label = getReadableFileName(fileName)
	if (!url) {
		return (
			<span className="inline-flex min-h-9 items-center gap-2 rounded-md border border-border/70 bg-card px-3 text-xs text-muted-foreground">
				<PaperclipIcon className="size-4" />
				{label}
			</span>
		)
	}
	return (
		<a
			href={url}
			target="_blank"
			rel="noreferrer"
			className="inline-flex min-h-9 max-w-full items-center gap-2 rounded-md border border-border/70 bg-card px-3 text-xs text-foreground transition-colors hover:bg-surface-card"
		>
			{thumbUrl ? (
				<img src={thumbUrl} alt="" className="size-6 rounded-sm border border-border/70 object-cover" loading="lazy" />
			) : (
				<DownloadIcon className="size-4 shrink-0 text-muted-foreground" />
			)}
			<span className="max-w-48 truncate">{label}</span>
		</a>
	)
}

function MonitoringCard({
	systems,
	websites,
	asset,
	assets,
	websiteEndpointAssets,
}: {
	systems: SystemRecord[]
	websites: WebsiteMonitorRecord[]
	asset: AssetRecord
	assets: AssetRecord[]
	websiteEndpointAssets: AssetRecord[]
}) {
	const canConnectAgent = canConnectAgentMonitoring(asset)
	const canConnectWebsite = canConnectWebsiteMonitoring(asset)
	const assetMap = new Map(assets.map((item) => [item.id, item]))
	const monitoredWebsiteAssetIds = new Set(websites.map((monitor) => monitor.asset).filter(Boolean))
	const unmonitoredWebsiteEndpoints = websiteEndpointAssets.filter(
		(endpoint) => !monitoredWebsiteAssetIds.has(endpoint.id)
	)

	return (
		<Card className="border-border/70 bg-card shadow-none">
			<CardHeader className="border-b border-border/70 bg-surface-soft px-4 py-3">
				<CardTitle className="text-lg tracking-[-0.02em]">监控绑定</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-3 p-4">
				{systems.length === 0 && websites.length === 0 && unmonitoredWebsiteEndpoints.length === 0 ? (
					<EmptyBlock icon={<MonitorIcon className="size-5" />} text="当前资产还没有绑定实时采集或网页监控。" />
				) : null}
				{systems.map((system) => (
					<Link
						key={system.id}
						href={getPagePath($router, "system", { id: system.id })}
						className="rounded-lg border border-border/70 bg-surface-soft p-3 transition-colors hover:bg-surface-card"
					>
						<div className="flex items-center justify-between gap-3">
							<div className="min-w-0">
								<div className="truncate font-medium text-foreground">{system.display_name || system.name}</div>
								<div className="mt-1 text-xs text-muted-foreground">
									Agent {system.v || "未知"} · {system.info?.ip || system.connect_ip || system.target_ip || "未上报 IP"}
								</div>
							</div>
							<SystemStatusBadge status={system.status} />
						</div>
					</Link>
				))}
				{websites.map((monitor) => {
					const endpointAsset = monitor.asset ? assetMap.get(monitor.asset) : undefined
					const isRelatedEndpoint = Boolean(endpointAsset && endpointAsset.id !== asset.id)
					return (
						<Link
							key={monitor.id}
							href={`${getPagePath($router, "websites")}?monitor=${encodeURIComponent(monitor.id)}`}
							className="rounded-lg border border-border/70 bg-surface-soft p-3 transition-colors hover:bg-surface-card"
						>
							<div className="flex items-center justify-between gap-3">
								<div className="min-w-0">
									<div className="flex min-w-0 flex-wrap items-center gap-2">
										<span className="min-w-0 truncate font-medium text-foreground">{monitor.name}</span>
										{isRelatedEndpoint && <MetaTag>{endpointAsset?.name}</MetaTag>}
									</div>
									<div className="mt-1 truncate text-xs text-muted-foreground">{monitor.url}</div>
								</div>
								<StatusBadge
									status={
										monitor.last_status === "up" ? "active" : monitor.last_status === "unknown" ? "planned" : "inactive"
									}
								/>
							</div>
						</Link>
					)
				})}
				{unmonitoredWebsiteEndpoints.map((endpoint) => (
					<div key={endpoint.id} className="rounded-lg border border-border/70 bg-surface-soft p-3">
						<div className="flex items-center justify-between gap-3">
							<div className="min-w-0">
								<div className="flex min-w-0 flex-wrap items-center gap-2">
									<span className="min-w-0 truncate font-medium text-foreground">{endpoint.name}</span>
									<MetaTag>网页端点</MetaTag>
								</div>
								<div className="mt-1 truncate text-xs text-muted-foreground">
									{getMetadataString(endpoint.metadata, "url") ||
										getMetadataString(endpoint.metadata, "internal_url") ||
										getMetadataString(endpoint.metadata, "external_url") ||
										endpoint.management_ip ||
										"未接入网站监控"}
								</div>
							</div>
							<Button asChild size="sm" variant="outline" className="shrink-0 gap-2">
								<Link href={`${getPagePath($router, "websites")}?asset=${encodeURIComponent(endpoint.id)}&add=1`}>
									<Globe2Icon className="size-4" />
									接入
								</Link>
							</Button>
						</div>
					</div>
				))}
				<div className="grid gap-2 border-t border-border/70 pt-3">
					{canConnectWebsite ? (
						<Button asChild variant="outline" className="gap-2">
							<Link href={`${getPagePath($router, "websites")}?asset=${encodeURIComponent(asset.id)}&add=1`}>
								<Globe2Icon className="size-4" />
								接入网站监控
							</Link>
						</Button>
					) : canConnectAgent ? (
						<Button asChild variant="outline" className="gap-2">
							<Link href={`${getPagePath($router, "clients")}?asset=${encodeURIComponent(asset.id)}`}>
								<MonitorIcon className="size-4" />
								接入 Agent 监控
							</Link>
						</Button>
					) : (
						<div className="rounded-md border border-border/70 bg-surface-soft px-3 py-2 text-sm text-muted-foreground">
							当前资产类型暂无可直接接入的监控能力。
						</div>
					)}
				</div>
			</CardContent>
		</Card>
	)
}

function canConnectAgentMonitoring(asset: AssetRecord) {
	return HOST_ASSET_TYPES.includes(asset.type)
}

function canConnectWebsiteMonitoring(asset: AssetRecord) {
	return asset.type === "web_endpoint"
}

function getAssetWebsiteEndpointIds(assetId: string, assets: AssetRecord[], relations: AssetRelationRecord[]) {
	const assetMap = new Map(assets.map((asset) => [asset.id, asset]))
	const ids = new Set<string>()
	const current = assetMap.get(assetId)
	if (current?.type === "web_endpoint") {
		ids.add(assetId)
	}
	for (const asset of assets) {
		if (asset.type === "web_endpoint" && asset.parent_asset === assetId) {
			ids.add(asset.id)
		}
	}
	for (const relation of relations) {
		const peerId =
			relation.source_asset === assetId
				? relation.target_asset
				: relation.target_asset === assetId
					? relation.source_asset
					: ""
		const peer = assetMap.get(peerId)
		if (peer?.type === "web_endpoint") {
			ids.add(peer.id)
		}
	}
	return [...ids]
}

function uniqueIds(ids: string[]) {
	return [...new Set(ids.filter(Boolean))]
}

function getAssetIdsFilter(assetIds: string[]) {
	return uniqueIds(assetIds)
		.map((assetId) => `asset="${escapePocketBaseFilterValue(assetId)}"`)
		.join(" || ")
}

function LifecycleCard({ asset, records }: { asset: AssetRecord; records: AssetMaintenanceRecord[] }) {
	const warranty = getAssetWarrantyStatus(asset)
	const latestMaintenance = getLatestMaintenanceRecord(records)
	const purchaseDate = getMetadataString(asset.metadata, "purchase_date")
	const onlineDate = getMetadataString(asset.metadata, "online_date")
	return (
		<Card className="border-border/70 bg-card shadow-none">
			<CardHeader className="border-b border-border/70 bg-surface-soft px-4 py-3">
				<div className="flex items-center justify-between gap-3">
					<CardTitle className="text-lg tracking-[-0.02em]">生命周期</CardTitle>
					<ToneTag tone={warranty.tone}>{warranty.label}</ToneTag>
				</div>
			</CardHeader>
			<CardContent className="grid gap-2 p-4">
				<LifecycleLine
					label="保修"
					value={warranty.date ? formatDate(warranty.date) : warranty.detail}
					note={warranty.detail}
				/>
				<LifecycleLine label="购买" value={purchaseDate ? formatDate(purchaseDate) : "未填写"} />
				<LifecycleLine label="上线" value={onlineDate ? formatDate(onlineDate) : "未填写"} />
				{latestMaintenance ? (
					<LifecycleLine
						label="最近记录"
						value={latestMaintenance.title}
						note={[
							getMaintenanceKindLabel(latestMaintenance.kind),
							formatDate(latestMaintenance.event_date || latestMaintenance.created),
						]
							.filter(Boolean)
							.join(" · ")}
					/>
				) : (
					<EmptyBlock
						icon={<CalendarClockIcon className="size-5" />}
						text="暂无维护记录。添加后会在这里显示最近一次事件。"
					/>
				)}
			</CardContent>
		</Card>
	)
}

function AssetChangeHistoryCard({ records }: { records: AssetChangeRecord[] }) {
	return (
		<Card className="border-border/70 bg-card shadow-none">
			<CardHeader className="border-b border-border/70 bg-surface-soft px-4 py-3">
				<div className="flex items-center justify-between gap-3">
					<CardTitle className="text-lg tracking-[-0.02em]">变更历史</CardTitle>
					{records.length > 0 && <MetaTag>{records.length} 条</MetaTag>}
				</div>
			</CardHeader>
			<CardContent className="grid gap-2 p-4">
				{records.length === 0 ? (
					<EmptyBlock
						icon={<ListChecksIcon className="size-5" />}
						text="暂无变更记录。后续资产档案、接口、关系和维护记录变动会自动记录。"
					/>
				) : (
					records.map((record) => (
						<div key={record.id} className="rounded-lg border border-border/70 bg-surface-soft p-3">
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0">
									<div className="flex flex-wrap items-center gap-2">
										<ActionTag action={record.action}>{getAssetChangeActionLabel(record.action)}</ActionTag>
										<MetaTag>{getAssetChangeSourceLabel(record.source_collection)}</MetaTag>
									</div>
									<div className="mt-2 line-clamp-2 text-sm font-medium leading-5 text-foreground">
										{record.summary || "资产数据已变更"}
									</div>
									<div className="mt-1 text-xs text-muted-foreground">{formatTime(record.created)}</div>
								</div>
							</div>
						</div>
					))
				)}
			</CardContent>
		</Card>
	)
}

function AssetCollectedHardwareCard({
	systems,
	systemDetails,
}: {
	systems: SystemRecord[]
	systemDetails: SystemDetailsRecord[]
}) {
	const summaries = useMemo(() => buildCollectedHardwareSummaries(systems, systemDetails), [systems, systemDetails])
	return (
		<Card className="border-border/70 bg-card shadow-none">
			<CardHeader className="border-b border-border/70 bg-surface-soft px-4 py-3">
				<div className="flex items-center justify-between gap-3">
					<CardTitle className="text-lg tracking-[-0.02em]">采集硬件</CardTitle>
					{summaries.length > 0 && <MetaTag>{summaries.length} 台</MetaTag>}
				</div>
			</CardHeader>
			<CardContent className="grid gap-2 p-4">
				{summaries.length === 0 ? (
					<EmptyBlock
						icon={<BoxesIcon className="size-5" />}
						text={
							systems.length === 0
								? "当前资产还没有绑定 Agent，暂无硬件采集摘要。"
								: "当前绑定 Agent 还没有上报可展示的硬件详情。"
						}
					/>
				) : (
					summaries.map((summary) => (
						<div key={summary.system.id} className="rounded-lg border border-border/70 bg-surface-soft p-3">
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0">
									<div className="flex min-w-0 flex-wrap items-center gap-2">
										<span className="truncate font-medium text-foreground">{getSystemDisplayName(summary.system)}</span>
										<SystemStatusBadge status={summary.system.status} />
									</div>
									<div className="mt-2 grid gap-2">
										{summary.rows.map((row) => (
											<div key={row.label} className="rounded-md border border-border/70 bg-card px-2.5 py-2">
												<div className="text-xs text-muted-foreground">{row.label}</div>
												<div className="mt-1 break-words text-sm font-medium text-foreground">{row.value}</div>
											</div>
										))}
									</div>
								</div>
								<Button asChild variant="ghost" size="icon" className="size-9 shrink-0" aria-label="查看机器详情">
									<Link href={getPagePath($router, "system", { id: summary.system.id })}>
										<MonitorIcon className="size-4" />
									</Link>
								</Button>
							</div>
						</div>
					))
				)}
			</CardContent>
		</Card>
	)
}

function AssetRuntimeHardwareCard({
	systems,
	systemStats,
	smartDevices,
	containers,
	websites,
}: {
	systems: SystemRecord[]
	systemStats: SystemStatsRecord[]
	smartDevices: SmartDeviceRecord[]
	containers: ContainerRecord[]
	websites: WebsiteMonitorRecord[]
}) {
	const summaries = useMemo(
		() => buildRuntimeHardwareSummaries({ systems, systemStats, smartDevices, containers, websites }),
		[systems, systemStats, smartDevices, containers, websites]
	)
	const visibleSummaries = summaries.filter((summary) => summary.items.length > 0)
	const totalItems = visibleSummaries.reduce((sum, summary) => sum + summary.items.length, 0)
	return (
		<Card className="border-border/70 bg-card shadow-none">
			<CardHeader className="border-b border-border/70 bg-surface-soft px-4 py-3">
				<div className="flex items-center justify-between gap-3">
					<CardTitle className="text-lg tracking-[-0.02em]">运行状态聚合</CardTitle>
					{totalItems > 0 && <MetaTag>{totalItems} 项</MetaTag>}
				</div>
			</CardHeader>
			<CardContent className="grid gap-2 p-4">
				{visibleSummaries.length === 0 ? (
					<EmptyBlock
						icon={<ThermometerIcon className="size-5" />}
						text={
							systems.length === 0
								? "当前资产还没有绑定 Agent，暂无运行状态聚合。"
								: "当前绑定 Agent 还没有上报 SMART、GPU、温度、电池或容器摘要。"
						}
					/>
				) : (
					visibleSummaries.map((summary) => (
						<div key={summary.system.id} className="rounded-lg border border-border/70 bg-surface-soft p-3">
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0">
									<div className="flex min-w-0 flex-wrap items-center gap-2">
										<span className="truncate font-medium text-foreground">{getSystemDisplayName(summary.system)}</span>
										<SystemStatusBadge status={summary.system.status} />
									</div>
									<div className="mt-2 grid gap-2">
										{summary.items.map((item) => (
											<RuntimeSummaryItem key={item.key} item={item} />
										))}
									</div>
								</div>
								<Button asChild variant="ghost" size="icon" className="size-9 shrink-0" aria-label="查看机器详情">
									<Link href={getPagePath($router, "system", { id: summary.system.id })}>
										<MonitorIcon className="size-4" />
									</Link>
								</Button>
							</div>
						</div>
					))
				)}
			</CardContent>
		</Card>
	)
}

type RuntimeSummaryIcon = typeof HardDriveIcon

type RuntimeSummaryItemData = {
	key: string
	label: string
	value: string
	detail?: string
	icon: RuntimeSummaryIcon
	tone?: "neutral" | "ok" | "warning" | "danger"
	href?: string
}

function RuntimeSummaryItem({ item }: { item: RuntimeSummaryItemData }) {
	const Icon = item.icon
	const content = (
		<div className="rounded-md border border-border/70 bg-card px-2.5 py-2 transition-colors hover:bg-surface-card">
			<div className="flex min-w-0 items-start gap-2">
				<span
					className={cn(
						"mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border",
						item.tone === "danger"
							? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
							: item.tone === "warning"
								? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
								: item.tone === "ok"
									? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
									: "border-border/70 bg-surface-soft text-muted-foreground"
					)}
				>
					<Icon className="size-4" />
				</span>
				<div className="min-w-0">
					<div className="text-xs text-muted-foreground">{item.label}</div>
					<div className="mt-1 break-words text-sm font-medium text-foreground">{item.value}</div>
					{item.detail && <div className="mt-1 break-words text-xs text-muted-foreground">{item.detail}</div>}
				</div>
			</div>
		</div>
	)
	if (!item.href) return content
	return (
		<Link href={item.href} className="block">
			{content}
		</Link>
	)
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

function AssetVisualCard({ visuals }: { visuals: AssetVisualRecord[] }) {
	const { theme } = useTheme()
	const [systemTheme, setSystemTheme] = useState<"dark" | "light">(() =>
		typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
	)
	const latestVisual = getAssetDisplayVisual(visuals)
	const frames = useMemo(() => latestVisual?.frames?.filter(isDisplayableAssetVisualFrame) ?? [], [latestVisual])
	const [frameIndex, setFrameIndex] = useState(0)
	const activeFrame = frames.length ? frames[((frameIndex % frames.length) + frames.length) % frames.length] : undefined
	const activeIndex = frames.length ? ((frameIndex % frames.length) + frames.length) % frames.length : 0
	const effectiveTheme = theme === "system" ? systemTheme : theme
	const isDarkVisualStage = effectiveTheme === "dark" && Boolean(activeFrame?.url)
	const themedFrameIndex = useMemo(() => {
		const targetTheme = effectiveTheme === "dark" ? "night" : "day"
		return frames.findIndex((frame) => frame.theme === targetTheme)
	}, [effectiveTheme, frames])

	useEffect(() => {
		if (theme !== "system" || typeof window === "undefined") return
		const media = window.matchMedia("(prefers-color-scheme: dark)")
		const syncSystemTheme = () => setSystemTheme(media.matches ? "dark" : "light")
		syncSystemTheme()
		media.addEventListener("change", syncSystemTheme)
		return () => media.removeEventListener("change", syncSystemTheme)
	}, [theme])

	useEffect(() => {
		if (themedFrameIndex >= 0) {
			setFrameIndex(themedFrameIndex)
		}
	}, [themedFrameIndex])

	const previousFrame = () => {
		if (frames.length <= 1) return
		setFrameIndex((current) => current - 1)
	}
	const nextFrame = () => {
		if (frames.length <= 1) return
		setFrameIndex((current) => current + 1)
	}

	return (
		<Card className="overflow-hidden border-border/70 bg-card shadow-none">
			<CardContent className="p-2">
				<div
					className={cn(
						"relative isolate mx-auto grid aspect-square w-full max-w-[calc(100vh-13rem)] select-none place-items-center overflow-hidden rounded-md border border-border/70 bg-card dark:bg-background",
						isDarkVisualStage &&
							"border-white/10 bg-[#050506] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05),inset_0_-80px_120px_rgba(0,0,0,0.55)]"
					)}
				>
					{activeFrame?.url ? (
						<>
							{isDarkVisualStage && (
								<>
									<img
										src={activeFrame.url}
										alt=""
										aria-hidden="true"
										className="pointer-events-none absolute inset-0 z-0 h-full w-full scale-125 object-cover opacity-30 blur-2xl saturate-90"
										draggable={false}
									/>
									<div
										aria-hidden="true"
										className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_50%_42%,rgba(139,92,246,0.22),rgba(10,10,12,0.50)_42%,rgba(5,5,6,0.92)_100%)]"
									/>
									<div
										aria-hidden="true"
										className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),transparent_28%,rgba(0,0,0,0.36)_100%)]"
									/>
								</>
							)}
							<img
								src={activeFrame.url}
								alt="设备全貌图"
								className={cn(
									"relative z-10 h-full w-full object-contain p-1 sm:p-2",
									isDarkVisualStage &&
										"scale-[1.18] p-0 brightness-110 contrast-110 drop-shadow-[0_30px_52px_rgba(0,0,0,0.72)] sm:p-0"
								)}
								draggable={false}
							/>
						</>
					) : (
						<div className="grid place-items-center gap-2 text-center text-muted-foreground">
							<div className="grid size-12 place-items-center rounded-md border border-border/70 bg-card">
								<ImageIcon className="size-5" />
							</div>
						</div>
					)}
					{frames.length > 1 && (
						<>
							<button
								type="button"
								onClick={previousFrame}
								className="absolute left-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md border border-border/70 bg-card/95 text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-foreground dark:bg-background/82"
								aria-label="上一张设备图片"
							>
								<ChevronLeftIcon className="size-4" />
							</button>
							<button
								type="button"
								onClick={nextFrame}
								className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md border border-border/70 bg-card/95 text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-foreground dark:bg-background/82"
								aria-label="下一张设备图片"
							>
								<ChevronRightIcon className="size-4" />
							</button>
						</>
					)}
				</div>
				{frames.length > 1 && (
					<div className="mt-2 flex items-center justify-center gap-1.5">
						{frames.map((frame, index) => (
							<button
								key={`${frame.url}-${index}`}
								type="button"
								onClick={() => setFrameIndex(index)}
								className={cn(
									"size-1.5 rounded-full bg-muted-foreground/30 transition-all hover:bg-muted-foreground/60",
									index === activeIndex && "w-5 bg-foreground"
								)}
								aria-label={`查看第 ${index + 1} 张设备图片`}
							/>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	)
}

function isDisplayableAssetVisualFrame(frame: NonNullable<AssetVisualRecord["frames"]>[number] | undefined) {
	if (!frame?.url) return false
	const lower = frame.url.toLowerCase()
	const rejected = [
		"appdownload",
		"download.png",
		"qrcode",
		"qr-code",
		"/qr",
		"wechat",
		"weixin",
		"favicon",
		"logo",
		"icon",
		"sprite",
		"avatar",
		"placeholder",
		"loading",
		"blank",
		"appstore",
		"googleplay",
		"playstore",
		"share",
	]
	return !rejected.some((marker) => lower.includes(marker))
}

function getAssetDisplayVisual(visuals: AssetVisualRecord[]) {
	return (
		visuals.find(isFinalUnifiedAssetVisual) ??
		visuals.find((item) => item.kind === "manual" && item.status === "ready" && item.primary !== false) ??
		visuals.find((item) => item.kind === "manual" && item.status === "ready")
	)
}

function isFinalUnifiedAssetVisual(visual: AssetVisualRecord) {
	const metadata = visual.metadata ?? {}
	return (
		visual.kind === "ai_turntable" &&
		visual.status === "ready" &&
		visual.primary === true &&
		metadata.visual_role === "final_unified" &&
		!metadata.superseded_by
	)
}

function AssetEnrichmentReportDialog({
	reports,
	suggestions,
	reportDialogOpen,
	onReportDialogOpenChange,
	readOnly,
	saving,
	onAccept,
	onReject,
}: {
	reports: AssetEnrichmentReportRecord[]
	suggestions: AssetEnrichmentSuggestionRecord[]
	reportDialogOpen: boolean
	onReportDialogOpenChange: (open: boolean) => void
	readOnly: boolean
	saving: boolean
	onAccept: (suggestion: AssetEnrichmentSuggestionRecord) => void
	onReject: (suggestion: AssetEnrichmentSuggestionRecord) => void
}) {
	const latestReport = reports[0]
	const latestSuggestions = useMemo(
		() => (latestReport ? suggestions.filter((item) => item.report === latestReport.id) : []),
		[latestReport, suggestions]
	)
	const pendingCount = latestSuggestions.filter((item) => item.status === "pending").length
	const conflictCount = latestSuggestions.filter((item) => item.conflict && item.status === "pending").length
	const acceptedCount = latestSuggestions.filter((item) => item.status === "accepted").length

	return (
		<Dialog open={reportDialogOpen} onOpenChange={onReportDialogOpenChange}>
			<DialogContent className="flex max-h-[88vh] max-w-4xl flex-col overflow-hidden">
				<DialogHeader>
					<DialogTitle>智能识别报告</DialogTitle>
					<DialogDescription>
						{latestReport
							? `${formatTime(latestReport.created)} · ${getEnrichmentReportStatusLabel(latestReport.status)}`
							: "生成报告后会在这里显示完整内容。"}
					</DialogDescription>
				</DialogHeader>
				<div className="min-h-0 overflow-y-auto pr-1">
					{latestReport ? (
						<div className="grid gap-3">
							<div className="grid grid-cols-3 gap-2">
								<SummaryMini label="待确认" value={pendingCount} />
								<SummaryMini label="冲突" value={conflictCount} />
								<SummaryMini label="已写入" value={acceptedCount} />
							</div>
							<div className="whitespace-pre-line rounded-md border border-border/70 bg-surface-soft px-3 py-2 text-sm leading-6 text-foreground">
								{latestReport.report || "该报告没有正文。"}
							</div>
							<AssetEnrichmentOnlineSources report={latestReport} />
							<div className="grid gap-2">
								<div className="text-sm font-semibold text-foreground">字段建议</div>
								{latestSuggestions.length === 0 ? (
									<div className="rounded-md border border-dashed border-border/70 bg-surface-soft px-3 py-2 text-sm text-muted-foreground">
										本报告没有可写入建议。报告正文仍会长期留档。
									</div>
								) : (
									latestSuggestions.map((suggestion) => (
										<EnrichmentSuggestionDetail
											key={suggestion.id}
											suggestion={suggestion}
											readOnly={readOnly}
											saving={saving}
											onAccept={onAccept}
											onReject={onReject}
										/>
									))
								)}
							</div>
						</div>
					) : (
						<EmptyBlock icon={<ListChecksIcon className="size-5" />} text="还没有识别报告。" />
					)}
				</div>
			</DialogContent>
		</Dialog>
	)
}

function AssetEnrichmentReportCard({
	reports,
	suggestions,
	systems,
	readOnly,
	saving,
	reportDialogOpen,
	onReportDialogOpenChange,
	onAccept,
	onReject,
}: {
	reports: AssetEnrichmentReportRecord[]
	suggestions: AssetEnrichmentSuggestionRecord[]
	systems: SystemRecord[]
	readOnly: boolean
	saving: boolean
	reportDialogOpen: boolean
	onReportDialogOpenChange: (open: boolean) => void
	onAccept: (suggestion: AssetEnrichmentSuggestionRecord) => void
	onReject: (suggestion: AssetEnrichmentSuggestionRecord) => void
}) {
	const latestReport = reports[0]
	const onlineSummary = latestReport ? getEnrichmentOnlineSummary(latestReport) : undefined
	const latestSuggestions = useMemo(
		() => (latestReport ? suggestions.filter((item) => item.report === latestReport.id) : []),
		[latestReport, suggestions]
	)
	const pendingCount = latestSuggestions.filter((item) => item.status === "pending").length
	const conflictCount = latestSuggestions.filter((item) => item.conflict && item.status === "pending").length
	const acceptedCount = latestSuggestions.filter((item) => item.status === "accepted").length
	const onlineSourceCount = onlineSummary?.sources.length ?? 0
	const visiblePendingSuggestions = latestSuggestions.filter((item) => item.status === "pending").slice(0, 2)
	const hiddenSuggestionCount = Math.max(0, latestSuggestions.length - visiblePendingSuggestions.length)
	return (
		<>
			<Card className="border-border/70 bg-card shadow-none">
				<CardHeader className="border-b border-border/70 bg-surface-soft px-3 py-2.5">
					<div className="flex items-center justify-between gap-3">
						<div className="min-w-0">
							<CardTitle className="text-base tracking-[-0.02em]">智能识别</CardTitle>
							{latestReport && (
								<div className="mt-1 text-xs text-muted-foreground">
									{formatTime(latestReport.created)} · {getEnrichmentReportStatusLabel(latestReport.status)}
								</div>
							)}
						</div>
						{latestReport && <MetaTag>{pendingCount} 待确认</MetaTag>}
					</div>
				</CardHeader>
				<CardContent className="grid gap-2.5 p-3">
					{!latestReport ? (
						<EmptyBlock
							icon={<ListChecksIcon className="size-5" />}
							text={
								systems.length === 0
									? "还没有识别报告。可先基于建档 IP、详细型号和内部型号生成资料来源报告。"
									: "还没有识别报告。可基于已绑定 Agent 生成本地采集对比。"
							}
						/>
					) : (
						<>
							<div className="grid grid-cols-3 gap-2">
								<SummaryMini label="待确认" value={pendingCount} />
								<SummaryMini label="冲突" value={conflictCount} />
								<SummaryMini label="已写入" value={acceptedCount} />
							</div>
							<div className="rounded-md border border-border/70 bg-surface-soft px-3 py-2 text-xs text-muted-foreground">
								资料来源：{getEnrichmentOnlineStatusLabel(onlineSummary?.status)}
								{onlineSourceCount > 0 ? ` · ${onlineSourceCount} 个来源` : ""}
							</div>
							{visiblePendingSuggestions.length === 0 ? (
								<div className="rounded-md border border-dashed border-border/70 bg-surface-soft px-3 py-2 text-xs leading-5 text-muted-foreground">
									本报告没有可写入建议。没有可追溯资料源时不会生成伪造规格。
								</div>
							) : (
								visiblePendingSuggestions.map((suggestion) => (
									<div
										key={suggestion.id}
										className={cn(
											"rounded-md border bg-surface-soft px-3 py-2",
											suggestion.conflict && suggestion.status === "pending"
												? "border-amber-500/25"
												: "border-border/70"
										)}
									>
										<EnrichmentSuggestionCompact
											suggestion={suggestion}
											readOnly={readOnly}
											saving={saving}
											onAccept={onAccept}
											onReject={onReject}
										/>
									</div>
								))
							)}
							{hiddenSuggestionCount > 0 && (
								<div className="rounded-md border border-border/70 bg-surface-soft px-3 py-2 text-xs text-muted-foreground">
									另有 {hiddenSuggestionCount} 条建议已收起，可在完整报告里处理。
								</div>
							)}
							<Button
								variant="outline"
								size="sm"
								onClick={() => onReportDialogOpenChange(true)}
								className="w-full gap-2"
							>
								<ListChecksIcon className="size-3.5" />
								查看完整报告
							</Button>
						</>
					)}
				</CardContent>
			</Card>
			<Dialog open={reportDialogOpen} onOpenChange={onReportDialogOpenChange}>
				<DialogContent className="flex max-h-[88vh] max-w-4xl flex-col overflow-hidden">
					<DialogHeader>
						<DialogTitle>智能识别报告</DialogTitle>
						<DialogDescription>
							{latestReport
								? `${formatTime(latestReport.created)} · ${getEnrichmentReportStatusLabel(latestReport.status)}`
								: "生成报告后会在这里显示完整内容。"}
						</DialogDescription>
					</DialogHeader>
					<div className="min-h-0 overflow-y-auto pr-1">
						{latestReport ? (
							<div className="grid gap-3">
								<div className="grid grid-cols-3 gap-2">
									<SummaryMini label="待确认" value={pendingCount} />
									<SummaryMini label="冲突" value={conflictCount} />
									<SummaryMini label="已写入" value={acceptedCount} />
								</div>
								<div className="whitespace-pre-line rounded-md border border-border/70 bg-surface-soft px-3 py-2 text-sm leading-6 text-foreground">
									{latestReport.report || "该报告没有正文。"}
								</div>
								<AssetEnrichmentOnlineSources report={latestReport} />
								<div className="grid gap-2">
									<div className="text-sm font-semibold text-foreground">字段建议</div>
									{latestSuggestions.length === 0 ? (
										<div className="rounded-md border border-dashed border-border/70 bg-surface-soft px-3 py-2 text-sm text-muted-foreground">
											本报告没有可写入建议。报告正文仍会长期留档。
										</div>
									) : (
										latestSuggestions.map((suggestion) => (
											<EnrichmentSuggestionDetail
												key={suggestion.id}
												suggestion={suggestion}
												readOnly={readOnly}
												saving={saving}
												onAccept={onAccept}
												onReject={onReject}
											/>
										))
									)}
								</div>
							</div>
						) : (
							<EmptyBlock icon={<ListChecksIcon className="size-5" />} text="还没有识别报告。" />
						)}
					</div>
				</DialogContent>
			</Dialog>
		</>
	)
}

type EnrichmentOnlineSource = {
	provider: string
	type: string
	title: string
	url: string
	snippet: string
	confidence: number
}

type EnrichmentOnlineSummary = {
	status: string
	query: string
	detail: string
	providers: string[]
	errors: string[]
	sources: EnrichmentOnlineSource[]
	aiExtractor?: {
		status: string
		provider: string
		model: string
		suggestions: number
		error: string
	}
}

function AssetEnrichmentOnlineSources({ report }: { report: AssetEnrichmentReportRecord }) {
	const summary = getEnrichmentOnlineSummary(report)
	return (
		<div className="grid gap-2 rounded-lg border border-border/70 bg-surface-soft p-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="text-sm font-semibold text-foreground">资料来源</div>
				<div className="flex flex-wrap items-center gap-1.5">
					<MetaTag>{getEnrichmentOnlineStatusLabel(summary?.status)}</MetaTag>
					{summary?.providers.map((provider) => (
						<MetaTag key={provider}>{getOnlineProviderLabel(provider)}</MetaTag>
					))}
					{summary?.aiExtractor && summary.aiExtractor.status !== "disabled" && (
						<MetaTag>
							AI：{getEnrichmentAIStatusLabel(summary.aiExtractor.status)}
							{summary.aiExtractor.suggestions ? ` · ${summary.aiExtractor.suggestions} 条` : ""}
						</MetaTag>
					)}
				</div>
			</div>
			{summary?.query && <div className="break-words text-xs text-muted-foreground">查询：{summary.query}</div>}
			{summary?.aiExtractor && summary.aiExtractor.status !== "disabled" && (
				<div className="break-words text-xs text-muted-foreground">
					AI 提取器：{getOnlineProviderLabel(summary.aiExtractor.provider)}
					{summary.aiExtractor.model ? ` / ${summary.aiExtractor.model}` : ""}
					{summary.aiExtractor.error ? `；${summary.aiExtractor.error}` : ""}
				</div>
			)}
			{summary?.sources.length ? (
				<div className="grid gap-2">
					{summary.sources.map((source) => (
						<a
							key={`${source.provider}-${source.url}`}
							href={source.url}
							target="_blank"
							rel="noreferrer"
							className="group grid gap-1 rounded-md border border-border/70 bg-card px-3 py-2 text-xs transition hover:border-primary/40 hover:bg-surface-soft"
						>
							<div className="flex min-w-0 items-center gap-2">
								<MetaTag>{getOnlineProviderLabel(source.provider)}</MetaTag>
								<MetaTag>{getOnlineSourceTypeLabel(source.type)}</MetaTag>
								<ConfidenceTag confidence={source.confidence} />
								<ExternalLinkIcon className="ms-auto size-3.5 shrink-0 text-muted-foreground transition group-hover:text-primary" />
							</div>
							<div className="break-words font-medium text-foreground">{source.title}</div>
							{source.snippet && <div className="line-clamp-2 break-words text-muted-foreground">{source.snippet}</div>}
							<div className="break-all font-mono text-[11px] text-muted-foreground">{source.url}</div>
						</a>
					))}
				</div>
			) : (
				<div className="rounded-md border border-dashed border-border/70 bg-card px-3 py-2 text-xs leading-5 text-muted-foreground">
					{getEnrichmentOnlineEmptyText(summary)}
				</div>
			)}
			{!!summary?.errors.length && (
				<div className="rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-200">
					{summary.errors.join("；")}
				</div>
			)}
		</div>
	)
}

function EnrichmentSuggestionCompact({
	suggestion,
	readOnly,
	saving,
	onAccept,
	onReject,
}: {
	suggestion: AssetEnrichmentSuggestionRecord
	readOnly: boolean
	saving: boolean
	onAccept: (suggestion: AssetEnrichmentSuggestionRecord) => void
	onReject: (suggestion: AssetEnrichmentSuggestionRecord) => void
}) {
	return (
		<>
			<div className="flex flex-wrap items-center gap-2">
				{suggestion.conflict ? (
					<AlertTriangleIcon className="size-4 text-amber-600 dark:text-amber-300" />
				) : (
					<ListChecksIcon className="size-4 text-emerald-600 dark:text-emerald-300" />
				)}
				<span className="font-medium text-foreground">{suggestion.target_label}</span>
				<MetaTag>{getEnrichmentSourceLabel(suggestion.source)}</MetaTag>
				<ConfidenceTag confidence={suggestion.confidence ?? 0} />
				<MetaTag>{getEnrichmentSuggestionStatusLabel(suggestion.status)}</MetaTag>
			</div>
			<div className="mt-2 grid gap-1 text-xs">
				<div className="truncate text-muted-foreground">当前：{suggestion.current_value || "未填写"}</div>
				<div className="truncate font-medium text-foreground">建议：{suggestion.recommended_value || "无"}</div>
			</div>
			{suggestion.status === "pending" && (
				<div className="mt-2 flex justify-end gap-2">
					<Button size="sm" variant="ghost" onClick={() => onReject(suggestion)} disabled={readOnly || saving}>
						忽略
					</Button>
					<Button
						size="sm"
						variant="outline"
						onClick={() => onAccept(suggestion)}
						disabled={readOnly || saving}
						className="gap-2"
					>
						<PencilIcon className="size-3.5" />
						写入
					</Button>
				</div>
			)}
		</>
	)
}

function EnrichmentSuggestionDetail({
	suggestion,
	readOnly,
	saving,
	onAccept,
	onReject,
}: {
	suggestion: AssetEnrichmentSuggestionRecord
	readOnly: boolean
	saving: boolean
	onAccept: (suggestion: AssetEnrichmentSuggestionRecord) => void
	onReject: (suggestion: AssetEnrichmentSuggestionRecord) => void
}) {
	return (
		<div
			className={cn(
				"rounded-lg border bg-surface-soft p-3",
				suggestion.conflict && suggestion.status === "pending" ? "border-amber-500/25" : "border-border/70"
			)}
		>
			<EnrichmentSuggestionCompact
				suggestion={suggestion}
				readOnly={readOnly}
				saving={saving}
				onAccept={onAccept}
				onReject={onReject}
			/>
			<div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
				<SuggestionValue label="资产主档" value={suggestion.current_value || "未填写"} />
				<SuggestionValue label="本地采集" value={suggestion.collected_value || "无"} />
				<SuggestionValue label="资料匹配" value={suggestion.online_value || "未接入"} />
				<SuggestionValue label="推荐写入" value={suggestion.recommended_value || "无"} />
			</div>
			{suggestion.notes && (
				<div className="mt-2 rounded-md border border-border/70 bg-card px-2.5 py-2 text-xs leading-5 text-muted-foreground">
					{suggestion.notes}
				</div>
			)}
			<EnrichmentSuggestionSources suggestion={suggestion} />
		</div>
	)
}

function EnrichmentSuggestionSources({ suggestion }: { suggestion: AssetEnrichmentSuggestionRecord }) {
	const links = getEnrichmentSuggestionSourceLinks(suggestion)
	if (links.length === 0) return null
	return (
		<div className="mt-2 rounded-md border border-border/70 bg-card px-2.5 py-2 text-xs">
			<div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-muted-foreground">
				<span>资料来源</span>
				{getMetadataStringArray(suggestion.metadata, "source_provider").map((provider) => (
					<MetaTag key={provider}>{getOnlineProviderLabel(provider)}</MetaTag>
				))}
			</div>
			<div className="grid gap-1">
				{links.map((link) => (
					<a
						key={link.url}
						href={link.url}
						target="_blank"
						rel="noreferrer"
						className="flex min-w-0 items-center gap-2 rounded border border-border/70 bg-surface-soft px-2 py-1.5 text-muted-foreground transition hover:border-primary/40 hover:text-primary"
					>
						<ExternalLinkIcon className="size-3.5 shrink-0" />
						<span className="truncate">{link.title || link.url}</span>
					</a>
				))}
			</div>
		</div>
	)
}

function SuggestionValue({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-0 rounded-md border border-border/70 bg-card px-2.5 py-2">
			<div className="text-muted-foreground">{label}</div>
			<div className="mt-1 break-words font-mono text-foreground">{value}</div>
		</div>
	)
}

function AssetAlertPoliciesCard({
	assetId,
	systems,
	assetAlerts,
	policies,
	readOnly,
}: {
	assetId: string
	systems: SystemRecord[]
	assetAlerts: AlertRecord[]
	policies: AlertPolicyRecord[]
	readOnly: boolean
}) {
	const matchedPolicies = getPoliciesForAsset(policies, assetId)
	const alertByName = new Map<string, AlertRecord>()
	for (const alert of assetAlerts) {
		if (!alertByName.has(alert.name)) {
			alertByName.set(alert.name, alert)
		}
	}
	const alertKeys = Object.keys(alertInfo)
	const enabledCount = alertKeys.filter((key) => alertByName.has(key)).length
	return (
		<Card className="border-border/70 bg-card shadow-none">
			<CardHeader className="border-b border-border/70 bg-surface-soft px-4 py-3">
				<div className="flex items-center justify-between gap-3">
					<CardTitle className="text-lg tracking-[-0.02em]">资产告警配置</CardTitle>
					{enabledCount > 0 && <MetaTag>{enabledCount} 已启用</MetaTag>}
				</div>
			</CardHeader>
			<CardContent className="grid gap-3 p-4">
				{systems.length === 0 ? (
					<EmptyBlock icon={<ListChecksIcon className="size-5" />} text="需要先接入客户端监控后才能配置资源告警。" />
				) : readOnly ? (
					<EmptyBlock icon={<ListChecksIcon className="size-5" />} text="只读账号不能修改资产告警规则。" />
				) : (
					<div className="grid gap-2">
						{alertKeys.map((key) => (
							<AlertContent
								key={key}
								alertKey={key}
								data={alertInfo[key]}
								assetId={assetId}
								alert={alertByName.get(key)}
							/>
						))}
					</div>
				)}
				<div className="rounded-lg border border-border/70 bg-surface-soft p-3">
					<div className="flex items-center justify-between gap-3">
						<div className="font-medium text-foreground">全局规则覆盖</div>
						<MetaTag>{matchedPolicies.length} 项</MetaTag>
					</div>
					<div className="mt-3 grid gap-2">
						{matchedPolicies.length === 0 ? (
							<div className="text-sm text-muted-foreground">当前资产没有覆盖到已启用的全局资源规则。</div>
						) : (
							matchedPolicies.map((policy) => (
								<div key={policy.id} className="rounded-md border border-border/70 bg-card px-3 py-2">
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0">
											<div className="flex min-w-0 flex-wrap items-center gap-2">
												<MetaTag>资源阈值</MetaTag>
												<span className="min-w-0 truncate font-medium text-foreground">
													{getAlertPolicyLabel(policy.name)}
												</span>
											</div>
											<div className="mt-2 grid gap-1 text-xs text-muted-foreground">
												<span>{formatAssetPolicyThreshold(policy)}</span>
												<span>{formatPolicyCoverage(policy)}</span>
											</div>
										</div>
										<MetaTag>{policy.min} 分钟</MetaTag>
									</div>
								</div>
							))
						)}
					</div>
				</div>
				<Button asChild variant="outline" className="gap-2">
					<Link href={getPagePath($router, "alerts")}>
						<ListChecksIcon className="size-4" />
						查看告警中心
					</Link>
				</Button>
			</CardContent>
		</Card>
	)
}

function AssetAlertHistoryCard({ records }: { records: AlertsHistoryRecord[] }) {
	const currentCount = records.filter((record) => !record.resolved).length
	return (
		<Card className="border-border/70 bg-card shadow-none">
			<CardHeader className="border-b border-border/70 bg-surface-soft px-4 py-3">
				<div className="flex items-center justify-between gap-3">
					<CardTitle className="text-lg tracking-[-0.02em]">告警历史</CardTitle>
					{records.length > 0 && (
						<MetaTag>{currentCount > 0 ? `${currentCount} 未恢复` : `${records.length} 条记录`}</MetaTag>
					)}
				</div>
			</CardHeader>
			<CardContent className="grid gap-2 p-4">
				{records.length === 0 ? (
					<EmptyBlock
						icon={<AlertTriangleIcon className="size-5" />}
						text="暂无关联告警。只有真实采集或检测触发后才会显示。"
					/>
				) : (
					<>
						{records.slice(0, 6).map((record) => (
							<Link
								key={record.id}
								href={`${getPagePath($router, "alerts")}?search=${encodeURIComponent(alertDisplayName(record))}`}
								className="rounded-lg border border-border/70 bg-surface-soft p-3 transition-colors hover:bg-surface-card"
							>
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<div className="flex min-w-0 flex-wrap items-center gap-2">
											<AlertSeverityBadge record={record} />
											<MetaTag>{alertSourceLabel(record)}</MetaTag>
											{record.expand?.asset?.name && <MetaTag>{record.expand.asset.name}</MetaTag>}
											<span className="min-w-0 truncate font-medium text-foreground">{alertDisplayName(record)}</span>
										</div>
										<div className="mt-2 grid gap-1 text-xs text-muted-foreground">
											<span>{alertSystemName(record)}</span>
											<span className="tabular-nums">
												{alertValueLabel(record)} · {alertCreatedLabel(record)}
											</span>
										</div>
									</div>
									<MetaTag>{alertStateLabel(record)}</MetaTag>
								</div>
							</Link>
						))}
						<Button asChild variant="outline" className="mt-1 gap-2">
							<Link href={getPagePath($router, "alerts")}>
								<AlertTriangleIcon className="size-4" />
								查看告警中心
							</Link>
						</Button>
					</>
				)}
			</CardContent>
		</Card>
	)
}

function getAlertPolicyLabel(name: string) {
	switch (name) {
		case "Status":
			return "离线告警"
		case "CPU":
			return "CPU 使用率"
		case "Memory":
			return "内存使用率"
		case "Disk":
			return "磁盘使用率"
		case "Temperature":
			return "温度"
		case "Bandwidth":
			return "网络带宽"
		case "GPU":
			return "GPU 使用率"
		case "LoadAvg1":
			return "1 分钟负载"
		case "LoadAvg5":
			return "5 分钟负载"
		case "LoadAvg15":
			return "15 分钟负载"
		case "Battery":
			return "电池电量"
		default:
			return name
	}
}

function formatAssetPolicyThreshold(policy: AlertPolicyRecord) {
	if (policy.name === "Status") {
		return `离线持续 ${policy.min} 分钟后触发`
	}
	const value = Number.isInteger(policy.value) ? String(policy.value) : policy.value.toFixed(1).replace(/\.0$/, "")
	const unit =
		policy.name === "Temperature"
			? "°C"
			: policy.name === "Bandwidth"
				? " MB/s"
				: policy.name.startsWith("LoadAvg")
					? ""
					: "%"
	const direction = policy.name === "Battery" ? "低于" : "超过"
	return `${direction} ${value}${unit} 持续 ${policy.min} 分钟后触发`
}

function AlertSeverityBadge({ record }: { record: AlertsHistoryRecord }) {
	const severity = alertSeverity(record)
	return (
		<span
			className={cn(
				"inline-flex min-h-6 items-center rounded-md border px-2 text-xs font-medium",
				severity === "critical"
					? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
					: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
			)}
		>
			{alertSeverityLabel(record)}
		</span>
	)
}

function AssetNotificationStatusCard({
	failures,
	states,
}: {
	failures: NotificationFailureRecord[]
	states: AlertNotificationStateRecord[]
}) {
	const activeStates = states.filter((item) => item.status === "failed" || isActiveNotificationCooldown(item))
	const recentStates = activeStates.length ? activeStates : states.slice(0, 4)
	return (
		<Card className="border-border/70 bg-card shadow-none">
			<CardHeader className="border-b border-border/70 bg-surface-soft px-4 py-3">
				<div className="flex items-center justify-between gap-3">
					<CardTitle className="text-lg tracking-[-0.02em]">通知状态</CardTitle>
					{failures.length || activeStates.length ? (
						<MetaTag>{failures.length ? `${failures.length} 失败` : `${activeStates.length} 冷却`}</MetaTag>
					) : null}
				</div>
			</CardHeader>
			<CardContent className="grid gap-2 p-4">
				{failures.length === 0 && states.length === 0 ? (
					<EmptyBlock
						icon={<BellIcon className="size-5" />}
						text="暂无通知诊断。只有真实发送、失败或重复告警冷却后才会显示。"
					/>
				) : (
					<>
						{failures.slice(0, 3).map((failure) => (
							<div key={failure.id} className="rounded-lg border border-orange-500/24 bg-surface-soft p-3">
								<div className="flex flex-wrap items-center gap-2">
									<AlertTriangleIcon className="size-4 text-orange-600 dark:text-orange-300" />
									<span className="min-w-0 truncate font-medium text-foreground">{failure.title}</span>
									{failure.expand?.asset?.name && <MetaTag>{failure.expand.asset.name}</MetaTag>}
									<MetaTag>失败 {failure.count} 次</MetaTag>
								</div>
								<div className="mt-2 grid gap-1 text-xs text-muted-foreground">
									<span className="truncate font-mono">{failure.target}</span>
									<span className="break-words text-orange-700 dark:text-orange-300">{failure.error}</span>
									<span>最后失败：{formatTime(failure.updated)}</span>
								</div>
							</div>
						))}
						{recentStates.map((record) => (
							<div key={record.id} className="rounded-lg border border-border/70 bg-surface-soft p-3">
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<div className="flex min-w-0 flex-wrap items-center gap-2">
											<SendIcon className="size-4 text-muted-foreground" />
											<span className="min-w-0 truncate font-medium text-foreground">
												{record.title || record.alert_id}
											</span>
											{record.expand?.asset?.name && <MetaTag>{record.expand.asset.name}</MetaTag>}
										</div>
										<div className="mt-2 grid gap-1 text-xs text-muted-foreground">
											{record.status === "suppressed" && (
												<span>
													已抑制 {record.suppressed_count ?? 0} 次，下一次允许发送：
													{record.next_allowed_at ? formatTime(record.next_allowed_at) : "等待冷却结束"}
												</span>
											)}
											{record.status === "failed" && record.last_error && (
												<span className="break-words text-orange-700 dark:text-orange-300">{record.last_error}</span>
											)}
											<span>{notificationStateTimeLabel(record)}</span>
										</div>
									</div>
									<NotificationStateBadge status={record.status} />
								</div>
							</div>
						))}
						<Button asChild variant="outline" className="mt-1 gap-2">
							<Link href={getPagePath($router, "settings", { name: "notifications" })}>
								<BellIcon className="size-4" />
								查看通知设置
							</Link>
						</Button>
					</>
				)}
			</CardContent>
		</Card>
	)
}

function NotificationStateBadge({ status }: { status: AlertNotificationStateRecord["status"] }) {
	return (
		<span
			className={cn(
				"inline-flex min-h-6 shrink-0 items-center rounded-md border px-2 text-xs font-medium",
				status === "failed" || status === "suppressed"
					? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
					: status === "resolved"
						? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
						: "border-border/70 bg-card text-muted-foreground"
			)}
		>
			{notificationStateLabel(status)}
		</span>
	)
}

function QuickActionButtons({ asset }: { asset: AssetRecord }) {
	const canConnectAgent = canConnectAgentMonitoring(asset)
	const canConnectWebsite = canConnectWebsiteMonitoring(asset)
	const supportUrl = getMetadataString(asset.metadata, "support_url")
	const managementUrl = getMetadataString(asset.metadata, "management_url")

	return (
		<>
			{canConnectAgent ? (
				<Button asChild variant="outline" size="sm" className="gap-2">
					<Link href={`${getPagePath($router, "clients")}?asset=${encodeURIComponent(asset.id)}`}>
						<MonitorIcon className="size-4" />
						接入 Agent
					</Link>
				</Button>
			) : null}
			{canConnectWebsite ? (
				<Button asChild variant="outline" size="sm" className="gap-2">
					<Link href={`${getPagePath($router, "websites")}?asset=${encodeURIComponent(asset.id)}&add=1`}>
						<Globe2Icon className="size-4" />
						接入网站
					</Link>
				</Button>
			) : null}
			<Button asChild variant="outline" size="sm" className="gap-2">
				<Link href={getPagePath($router, "network")}>
					<NetworkIcon className="size-4" />
					拓扑
				</Link>
			</Button>
			{managementUrl && (
				<Button asChild variant="outline" size="sm" className="gap-2">
					<a href={managementUrl} target="_blank" rel="noreferrer">
						<ExternalLinkIcon className="size-4" />
						管理地址
					</a>
				</Button>
			)}
			{supportUrl && (
				<Button asChild variant="outline" size="sm" className="gap-2">
					<a href={supportUrl} target="_blank" rel="noreferrer">
						<ExternalLinkIcon className="size-4" />
						支持页
					</a>
				</Button>
			)}
		</>
	)
}

function SummaryPill({ label, value }: { label: string; value: number | string }) {
	return (
		<div className="rounded-md border border-border/70 bg-card px-3 py-2">
			<div className="text-xs text-muted-foreground">{label}</div>
			<div className="mt-1 font-mono text-lg font-semibold tabular-nums">{value}</div>
		</div>
	)
}

function DetailRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-0 rounded-md border border-border/70 bg-card px-3 py-2">
			<div className="text-xs text-muted-foreground">{label}</div>
			<div className="mt-1 break-words text-sm font-medium text-foreground">{value}</div>
		</div>
	)
}

function ArchiveDetailRow({ field, value }: { field: AssetFieldDefinition; value: string }) {
	const isUrl = field.type === "url" && /^https?:\/\//i.test(value)
	return (
		<div
			className={cn(
				"grid min-w-0 grid-cols-[6.5rem_minmax(0,1fr)] items-baseline gap-2 rounded-sm px-1 py-1",
				field.span === "full" && "md:col-span-2 2xl:col-span-3"
			)}
		>
			<div className="min-w-0 truncate text-xs text-muted-foreground">{field.label}</div>
			{isUrl ? (
				<a
					href={value}
					target="_blank"
					rel="noreferrer"
					className="inline-flex max-w-full min-w-0 items-center gap-1.5 text-sm font-medium text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
				>
					<span className="min-w-0 truncate">{value}</span>
					<ExternalLinkIcon className="size-3.5 shrink-0" />
				</a>
			) : (
				<div className="min-w-0 break-words text-sm font-medium text-foreground">{value}</div>
			)}
		</div>
	)
}

function buildHostHardwareProfileGroups(asset: AssetRecord): HostHardwareProfileGroup[] {
	const metadata = asset.metadata
	const urlRow = (
		label: string,
		key: string,
		capture: AssetFieldDefinition["capture"] = "future_collectable"
	): HostHardwareProfileRow | undefined => {
		const value = getMetadataString(metadata, key)
		if (!value) return undefined
		return { label, value, href: /^https?:\/\//i.test(value) ? value : undefined, capture }
	}
	const metadataRow = (
		label: string,
		key: string,
		capture: AssetFieldDefinition["capture"] = "future_collectable"
	): HostHardwareProfileRow | undefined => {
		const value = getMetadataString(metadata, key)
		return value ? { label, value, capture } : undefined
	}
	const numberRow = (
		label: string,
		key: string,
		unit: string,
		capture: AssetFieldDefinition["capture"] = "future_collectable"
	): HostHardwareProfileRow | undefined => {
		const value = getMetadataNumber(metadata, key)
		return value ? { label, value: `${value} ${unit}`, capture } : undefined
	}
	const directRow = (
		label: string,
		value: string,
		capture: AssetFieldDefinition["capture"] = "manual"
	): HostHardwareProfileRow | undefined => (value ? { label, value, capture } : undefined)
	const compact = (rows: (HostHardwareProfileRow | undefined)[]) => rows.filter(Boolean) as HostHardwareProfileRow[]

	return [
		{
			title: "整机与支持",
			icon: <MonitorIcon className="size-4" />,
			rows: compact([
				directRow("厂商 / 品牌", asset.vendor),
				directRow("型号 / 规格", asset.model),
				directRow("序列号", asset.serial_number),
				urlRow("厂家官方支持页", "support_url", "manual"),
				metadataRow("专项识别依据", "hardware_fingerprint_note"),
				metadataRow("专项识别匹配备注", "hardware_match_note"),
			]),
		},
		{
			title: "CPU",
			icon: <CpuIcon className="size-4" />,
			rows: compact([
				metadataRow("CPU 厂商", "cpu_vendor", "agent_collectable"),
				metadataRow("CPU 型号", "cpu_model", "agent_collectable"),
				urlRow("CPU 官方支持页", "cpu_support_url"),
			]),
		},
		{
			title: "主板 / BIOS",
			icon: <BoxesIcon className="size-4" />,
			rows: compact([
				metadataRow("主板品牌", "motherboard_vendor"),
				metadataRow("主板型号", "motherboard_model"),
				urlRow("主板支持页", "motherboard_support_url"),
				metadataRow("BIOS 厂商", "bios_vendor"),
			]),
		},
		{
			title: "GPU",
			icon: <ThermometerIcon className="size-4" />,
			rows: compact([
				metadataRow("显卡品牌 / 型号", "gpu_detail"),
				metadataRow("GPU 芯片厂商", "gpu_vendor"),
				metadataRow("GPU 芯片型号", "gpu_model"),
				metadataRow("显卡板卡品牌", "gpu_board_vendor"),
				numberRow("显存", "gpu_vram_gb", "GB"),
				urlRow("显卡支持页", "gpu_support_url"),
			]),
		},
		{
			title: "内存",
			icon: <BoxesIcon className="size-4" />,
			rows: compact([
				numberRow("内存容量", "memory_gb", "GB", "agent_collectable"),
				metadataRow("内存品牌 / 规格", "memory_detail"),
				metadataRow("内存品牌", "memory_vendor"),
				metadataRow("内存型号 / 颗粒", "memory_model"),
				metadataRow("内存类型", "memory_type"),
				numberRow("内存频率", "memory_speed_mhz", "MHz"),
				metadataRow("内存插槽摘要", "memory_slots_summary"),
				urlRow("内存支持页", "memory_support_url"),
			]),
		},
		{
			title: "存储",
			icon: <HardDriveIcon className="size-4" />,
			rows: compact([
				metadataRow("存储摘要", "storage_summary", "agent_collectable"),
				metadataRow("硬盘品牌 / 型号", "storage_detail"),
				metadataRow("主存储品牌", "storage_vendor"),
				metadataRow("主存储型号", "storage_model"),
				metadataRow("存储介质 / 总线", "storage_media"),
				metadataRow("硬盘序列号备注", "storage_serial_note"),
				urlRow("存储支持页", "storage_support_url"),
			]),
		},
		{
			title: "网络硬件",
			icon: <NetworkIcon className="size-4" />,
			rows: compact([
				numberRow("主网卡速率", "primary_nic_speed_mbps", "Mbps", "agent_collectable"),
				metadataRow("网卡品牌 / 型号", "nic_detail"),
				metadataRow("有线网卡品牌", "nic_vendor"),
				metadataRow("有线网卡型号", "nic_model"),
				metadataRow("无线网卡品牌", "wifi_vendor"),
				metadataRow("无线网卡型号", "wifi_model"),
				urlRow("网卡驱动 / 支持页", "nic_support_url"),
				urlRow("无线网卡驱动 / 支持页", "wifi_support_url"),
			]),
		},
		{
			title: "机箱 / 电源",
			icon: <BatteryIcon className="size-4" />,
			rows: compact([
				metadataRow("机箱 / 电源", "chassis_power_detail", "manual"),
				metadataRow("机箱品牌", "chassis_vendor", "manual"),
				metadataRow("机箱型号", "chassis_model", "manual"),
				urlRow("机箱支持页", "chassis_support_url", "manual"),
				metadataRow("电源品牌", "psu_vendor", "manual"),
				metadataRow("电源型号 / 功率", "psu_model", "manual"),
				urlRow("电源支持页", "psu_support_url", "manual"),
			]),
		},
	]
}

function LifecycleLine({ label, value, note }: { label: string; value: string; note?: string }) {
	return (
		<div className="min-w-0 rounded-md border border-border/70 bg-surface-soft px-3 py-2">
			<div className="flex items-center justify-between gap-3">
				<span className="text-xs text-muted-foreground">{label}</span>
				<span className="truncate text-sm font-medium text-foreground">{value}</span>
			</div>
			{note && note !== value && <div className="mt-1 truncate text-xs text-muted-foreground">{note}</div>}
		</div>
	)
}

function RelationLine({
	label,
	direction,
	target,
	href,
	description,
	compact,
}: {
	label: string
	direction: string
	target?: AssetRecord
	href?: string
	description?: string
	compact?: boolean
}) {
	const content = (
		<div className={cn("min-w-0", !compact && "rounded-lg border border-border/70 bg-surface-soft p-3")}>
			<div className="flex flex-wrap items-center gap-2">
				<MetaTag>{label}</MetaTag>
				<span className="text-xs text-muted-foreground">{direction}</span>
				<span className="font-medium text-foreground">{target?.name ?? "未知资产"}</span>
				{target && <MetaTag>{getAssetTypeLabel(target.type)}</MetaTag>}
			</div>
			{description && <div className="mt-1 text-xs text-muted-foreground">{description}</div>}
		</div>
	)
	if (!href) return content
	return (
		<Link href={href} className="block min-w-0 transition-opacity hover:opacity-80">
			{content}
		</Link>
	)
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

function getEnrichmentReportStatusLabel(status?: AssetEnrichmentReportRecord["status"]) {
	switch (status) {
		case "applied":
			return "已全部写入"
		case "partially_applied":
			return "部分处理"
		case "dismissed":
			return "已忽略"
		case "failed":
			return "失败"
		case "draft":
			return "草稿"
		default:
			return "待确认"
	}
}

function getEnrichmentSuggestionStatusLabel(status?: AssetEnrichmentSuggestionRecord["status"]) {
	switch (status) {
		case "accepted":
			return "已写入"
		case "rejected":
			return "已忽略"
		case "stale":
			return "已过期"
		default:
			return "待确认"
	}
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

function getAITaskStatusLabel(status?: AITaskRecord["status"]) {
	switch (status) {
		case "queued":
			return "排队中"
		case "running":
			return "生成中"
		case "ready":
			return "已完成"
		case "failed":
			return "失败"
		case "applied":
			return "已应用"
		default:
			return "未开始"
	}
}

function getAssetEnrichmentTaskMeta(tasks: AITaskRecord[], reports: AssetEnrichmentReportRecord[]) {
	const latestTask = tasks.find((task) => task.kind === "asset_enrichment")
	if (latestTask) {
		return `Agent ${getAITaskStatusLabel(latestTask.status)}`
	}
	return reports.length ? `${reports.length} 份报告` : "未生成"
}

function getAssetVisualTaskMeta(tasks: AITaskRecord[], visuals: AssetVisualRecord[]) {
	const latestTask = tasks.find((task) => task.kind === "asset_visual")
	if (latestTask) {
		if (latestTask.status === "failed") {
			return latestTask.error ? `图片失败：${latestTask.error}` : "图片失败"
		}
		const collected = numberFromUnknownRecord(latestTask.output_summary, "collected_images")
		const generated = numberFromUnknownRecord(latestTask.output_summary, "generated_images")
		if (latestTask.status === "ready" && (collected > 0 || generated > 0)) {
			if (generated <= 0) {
				return `参考图已收集：${collected} 张，未生成统一图`
			}
			return `图片成功：参考 ${collected} / 生成 ${generated}`
		}
		return `图片 ${getAITaskStatusLabel(latestTask.status)}`
	}
	return visuals.length ? `${visuals.length} 组图片` : "未收集"
}

function numberFromUnknownRecord(record: Record<string, unknown> | undefined, key: string) {
	const value = record?.[key]
	return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function getEnrichmentSourceLabel(source?: AssetEnrichmentSuggestionRecord["source"]) {
	switch (source) {
		case "online":
			return "资料匹配"
		case "comparison":
			return "对比报告"
		case "manual":
			return "手动"
		default:
			return "本地采集"
	}
}

function getEnrichmentOnlineSummary(report: AssetEnrichmentReportRecord): EnrichmentOnlineSummary | undefined {
	const sourceSummary = asRecord(report.source_summary)
	const onlineMatch = asRecord(sourceSummary?.online_match)
	if (!onlineMatch) return undefined
	const sources = getRecordArray(onlineMatch.sources)
		.map((source) => ({
			provider: getRecordString(source, "provider"),
			type: getRecordString(source, "type"),
			title: getRecordString(source, "title"),
			url: getRecordString(source, "url"),
			snippet: getRecordString(source, "snippet"),
			confidence: getRecordNumber(source, "confidence"),
		}))
		.filter((source) => source.url || source.title)
	const aiExtractor = asRecord(onlineMatch.ai_extractor)
	return {
		status: getRecordString(onlineMatch, "status"),
		query: getRecordString(onlineMatch, "query"),
		detail: getRecordString(onlineMatch, "detail"),
		providers: getRecordStringArray(onlineMatch, "providers"),
		errors: getRecordStringArray(onlineMatch, "errors"),
		sources,
		aiExtractor: aiExtractor
			? {
					status: getRecordString(aiExtractor, "status"),
					provider: getRecordString(aiExtractor, "provider"),
					model: getRecordString(aiExtractor, "model"),
					suggestions: getRecordNumber(aiExtractor, "suggestions"),
					error: getRecordString(aiExtractor, "error"),
				}
			: undefined,
	}
}

function getEnrichmentOnlineStatusLabel(status?: string) {
	switch (status) {
		case "ready":
			return "已命中"
		case "no_match":
			return "未命中"
		case "not_configured":
			return "未配置"
		default:
			return "未查询"
	}
}

function getEnrichmentOnlineEmptyText(summary?: EnrichmentOnlineSummary) {
	if (!summary) return "本报告没有资料来源摘要。"
	if (summary.status === "not_configured") return "资料补全 Agent 未获得可追溯来源，也没有可用的官方支持页。"
	if (summary.status === "no_match")
		return "没有命中可追溯资料。可补充更准确的详细型号、内部型号或厂家支持页后重新收集。"
	return "本次没有可展示的资料来源。"
}

function getOnlineProviderLabel(provider?: string) {
	switch (provider) {
		case "support_url":
			return "支持页"
		case "wikidata":
			return "Wikidata"
		case "duckduckgo":
			return "公开搜索"
		case "brave":
			return "Brave"
		case "openai-compatible":
			return "AI 提取"
		default:
			return provider || "来源"
	}
}

function getEnrichmentAIStatusLabel(status?: string) {
	switch (status) {
		case "ready":
			return "已提取"
		case "failed":
			return "失败"
		case "disabled":
			return "未启用"
		default:
			return "未配置"
	}
}

function getOnlineSourceTypeLabel(type?: string) {
	switch (type) {
		case "official_support":
			return "官方支持"
		case "official_product":
			return "官方产品"
		case "structured_profile":
			return "结构资料"
		case "spec_database":
			return "规格库"
		case "web_result":
			return "网页结果"
		default:
			return type || "资料"
	}
}

function getEnrichmentSuggestionSourceLinks(suggestion: AssetEnrichmentSuggestionRecord) {
	const urls = getMetadataStringArray(suggestion.metadata, "source_urls")
	const titles = getMetadataStringArray(suggestion.metadata, "source_titles")
	return urls.map((url, index) => ({
		url,
		title: titles[index] || url,
	}))
}

function getMetadataStringArray(metadata: Record<string, unknown> | undefined, key: string) {
	if (!metadata) return []
	const value = metadata[key]
	if (Array.isArray(value)) {
		return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
	}
	if (typeof value === "string" && value.trim()) return [value.trim()]
	return []
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function getRecordArray(value: unknown) {
	return Array.isArray(value) ? value.map(asRecord).filter(Boolean) : []
}

function getRecordString(record: Record<string, unknown>, key: string) {
	const value = record[key]
	return typeof value === "string" ? value.trim() : ""
}

function getRecordNumber(record: Record<string, unknown>, key: string) {
	const value = record[key]
	return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function getRecordStringArray(record: Record<string, unknown>, key: string) {
	const value = record[key]
	if (Array.isArray(value)) {
		return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
	}
	return []
}

function ActionTag({ children, action }: { children: ReactNode; action: AssetChangeAction }) {
	return (
		<span
			className={cn(
				"rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
				action === "delete"
					? "border-red-200 bg-red-50 text-red-700"
					: action === "create"
						? "border-emerald-200 bg-emerald-50 text-emerald-700"
						: "border-border/70 bg-card text-muted-foreground"
			)}
		>
			{children}
		</span>
	)
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

function TextField({
	name,
	label,
	type = "text",
	placeholder,
	required,
	className,
	defaultValue,
}: {
	name: string
	label: string
	type?: string
	placeholder?: string
	required?: boolean
	className?: string
	defaultValue?: string
}) {
	return (
		<div className={cn("grid gap-2", className)}>
			<Label htmlFor={name}>
				{label}
				{required && <span className="ms-1 text-destructive">*</span>}
			</Label>
			<Input
				id={name}
				name={name}
				type={type}
				placeholder={placeholder}
				required={required}
				defaultValue={defaultValue}
			/>
		</div>
	)
}

function SelectField({
	name,
	label,
	options,
	defaultValue,
	value,
	onChange,
	placeholder,
}: {
	name: string
	label: string
	options: { value: string; label: string }[]
	defaultValue?: string
	value?: string
	onChange?: (value: string) => void
	placeholder?: string
}) {
	return (
		<div className="grid gap-2">
			<Label htmlFor={name}>{label}</Label>
			<select
				id={name}
				name={name}
				defaultValue={value === undefined ? defaultValue || "" : undefined}
				value={value}
				onChange={onChange ? (event) => onChange(event.target.value) : undefined}
				className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-ring/70 focus:ring-2 focus:ring-ring/15"
			>
				{placeholder && <option value="">{placeholder}</option>}
				{options.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
		</div>
	)
}

function PhoneVariantSpecField({
	name,
	label,
	required,
	defaultValue,
	options,
	customPlaceholder,
}: {
	name: string
	label: string
	required?: boolean
	defaultValue?: string
	options: { value: string; label: string }[]
	customPlaceholder?: string
}) {
	const [value, setValue] = useState(defaultValue ?? "")
	useEffect(() => {
		setValue(defaultValue ?? "")
	}, [defaultValue])

	return (
		<div className="grid gap-2">
			<Label htmlFor={`${name}-select`}>
				{label}
				{required && <span className="ms-1 text-destructive">*</span>}
			</Label>
			<input type="hidden" name={name} value={value} />
			<PhoneVariantSpecInput
				value={value}
				onChange={setValue}
				options={options}
				customPlaceholder={customPlaceholder}
			/>
		</div>
	)
}

function OfficialColorField({
	name,
	label,
	defaultValue,
	options,
	requireOfficial,
	status,
	message,
	disabled,
	onFetch,
}: {
	name: string
	label: string
	defaultValue?: string
	options: string[]
	requireOfficial: boolean
	status: "idle" | "blocked" | "running" | "ready" | "failed"
	message: string
	disabled: boolean
	onFetch: () => void
}) {
	const mergedOptions = requireOfficial ? options : mergeOfficialColorOptions(options, defaultValue)
	if (!requireOfficial && options.length === 0) {
		return (
			<div className="grid gap-2">
				<div className="flex items-center justify-between gap-2">
					<Label htmlFor={name}>{label}</Label>
					<OfficialColorFetchButton disabled={disabled} status={status} onFetch={onFetch} />
				</div>
				<Input id={name} name={name} defaultValue={defaultValue} placeholder="资料补全后可改为官方配色" />
				<OfficialColorStatusMessage status={status} message={message} />
			</div>
		)
	}
	return (
		<div className="grid gap-2">
			<div className="flex items-center justify-between gap-2">
				<Label htmlFor={name}>{label}</Label>
				<OfficialColorFetchButton disabled={disabled} status={status} onFetch={onFetch} />
			</div>
			{mergedOptions.length > 0 && <input type="hidden" name="colors_available" value={mergedOptions.join(", ")} />}
			<select
				id={name}
				name={name}
				defaultValue={
					requireOfficial &&
					defaultValue &&
					!options.some((option) => normalizeComparableText(option) === normalizeComparableText(defaultValue))
						? ""
						: defaultValue || ""
				}
				className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-ring/70 focus:ring-2 focus:ring-ring/15"
			>
				<option value="">{options.length ? "请选择官方配色" : "请先获取官方颜色"}</option>
				{mergedOptions.map((option) => (
					<option key={option} value={option}>
						{option}
					</option>
				))}
			</select>
			{requireOfficial && options.length === 0 && (
				<div className="text-xs text-muted-foreground">手机等固定规格设备不再手输颜色，需要先获取官方颜色后选择。</div>
			)}
			<OfficialColorStatusMessage status={status} message={message} />
		</div>
	)
}

function OfficialColorPicker({
	value,
	options,
	requireOfficial,
	status,
	message,
	disabled,
	onFetch,
	onChange,
}: {
	value: string
	options: string[]
	requireOfficial: boolean
	status: "idle" | "blocked" | "running" | "ready" | "failed"
	message: string
	disabled: boolean
	onFetch: () => void
	onChange: (value: string) => void
}) {
	const mergedOptions = requireOfficial ? options : mergeOfficialColorOptions(options, value)
	if (!requireOfficial && options.length === 0) {
		return (
			<div className="grid gap-2">
				<div className="flex items-center justify-between gap-2">
					<Label htmlFor="asset-visual-color">配色</Label>
					<OfficialColorFetchButton disabled={disabled} status={status} onFetch={onFetch} />
				</div>
				<Input
					id="asset-visual-color"
					value={value}
					onChange={(event) => onChange(event.target.value)}
					placeholder="资料补全后优先选择官方配色"
				/>
				<OfficialColorStatusMessage status={status} message={message} />
			</div>
		)
	}
	return (
		<div className="grid gap-2">
			<div className="flex items-center justify-between gap-2">
				<Label htmlFor="asset-visual-color">官方配色</Label>
				<OfficialColorFetchButton disabled={disabled} status={status} onFetch={onFetch} />
			</div>
			<select
				id="asset-visual-color"
				value={
					requireOfficial &&
					value &&
					!options.some((option) => normalizeComparableText(option) === normalizeComparableText(value))
						? ""
						: value
				}
				onChange={(event) => onChange(event.target.value)}
				className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-ring/70 focus:ring-2 focus:ring-ring/15"
			>
				<option value="">{options.length ? "请选择官方配色" : "请先获取官方颜色"}</option>
				{mergedOptions.map((option) => (
					<option key={option} value={option}>
						{option}
					</option>
				))}
			</select>
			<OfficialColorStatusMessage status={status} message={message} />
		</div>
	)
}

function OfficialColorFetchButton({
	disabled,
	status,
	onFetch,
}: {
	disabled: boolean
	status: "idle" | "blocked" | "running" | "ready" | "failed"
	onFetch: () => void
}) {
	return (
		<Button
			type="button"
			size="sm"
			variant="outline"
			onClick={onFetch}
			disabled={disabled || status === "running"}
			className="h-8 px-2 text-xs"
		>
			{status === "running" ? "获取中" : "获取官方颜色"}
		</Button>
	)
}

function OfficialColorStatusMessage({
	status,
	message,
}: {
	status: "idle" | "blocked" | "running" | "ready" | "failed"
	message: string
}) {
	if (!message || status === "idle") return null
	return (
		<div
			className={cn(
				"text-xs leading-5",
				status === "failed" || status === "blocked" ? "text-destructive" : "text-muted-foreground"
			)}
		>
			{message}
		</div>
	)
}

function TextAreaField({
	name,
	label,
	className,
	defaultValue,
}: {
	name: string
	label: string
	className?: string
	defaultValue?: string
}) {
	return (
		<div className={cn("grid gap-2", className)}>
			<Label htmlFor={name}>{label}</Label>
			<Textarea id={name} name={name} defaultValue={defaultValue} />
		</div>
	)
}

function yesNoOptions() {
	return [
		{ value: "yes", label: "是" },
		{ value: "no", label: "否" },
	]
}

type AssetCollectedHardwareSummary = {
	system: SystemRecord
	rows: { label: string; value: string }[]
}

type RuntimeHardwareSummary = {
	system: SystemRecord
	items: RuntimeSummaryItemData[]
}

function buildRuntimeHardwareSummaries({
	systems,
	systemStats,
	smartDevices,
	containers,
	websites,
}: {
	systems: SystemRecord[]
	systemStats: SystemStatsRecord[]
	smartDevices: SmartDeviceRecord[]
	containers: ContainerRecord[]
	websites: WebsiteMonitorRecord[]
}): RuntimeHardwareSummary[] {
	const latestStatsBySystem = newestBySystem(systemStats)
	const smartBySystem = groupBySystem(smartDevices)
	const containersBySystem = groupBySystem(containers)
	const websitesBySystem = groupBySystem(websites.filter((website) => website.system))
	return systems.map((system) => {
		const latestStats = latestStatsBySystem.get(system.id)
		const items = [
			buildSmartRuntimeItem(system, smartBySystem.get(system.id) ?? []),
			buildGpuRuntimeItem(system, latestStats),
			buildTemperatureRuntimeItem(latestStats, smartBySystem.get(system.id) ?? []),
			buildBatteryRuntimeItem(system, latestStats),
			buildContainerRuntimeItem(system, containersBySystem.get(system.id) ?? []),
			buildWebsiteRuntimeItem(websitesBySystem.get(system.id) ?? []),
		].filter(Boolean) as RuntimeSummaryItemData[]
		return { system, items }
	})
}

function buildSmartRuntimeItem(system: SystemRecord, devices: SmartDeviceRecord[]): RuntimeSummaryItemData | undefined {
	if (devices.length === 0) return undefined
	const failed = devices.filter((device) => device.state?.toUpperCase() === "FAILED").length
	const passed = devices.filter((device) => device.state?.toUpperCase() === "PASSED").length
	const totalCapacity = devices.reduce((sum, device) => sum + (device.capacity || 0), 0)
	const mediaSummary = summarizeSmartMedia(devices)
	const hotDisk = devices
		.filter((device) => typeof device.temp === "number" && Number.isFinite(device.temp))
		.sort((a, b) => (b.temp ?? 0) - (a.temp ?? 0))[0]
	const value = [
		`${devices.length} 块磁盘`,
		totalCapacity > 0 ? formatBytes(totalCapacity) : "",
		failed > 0 ? `${failed} 异常` : passed > 0 ? `${passed} 正常` : "状态未知",
	].filter(Boolean)
	const detail = [
		mediaSummary,
		hotDisk ? `最高温 ${formatRuntimeTemperature(hotDisk.temp)} · ${hotDisk.model || hotDisk.name}` : "",
	]
		.filter(Boolean)
		.join(" · ")
	return {
		key: "smart",
		label: "SMART / 存储",
		value: value.join(" · "),
		detail,
		icon: HardDriveIcon,
		tone: failed > 0 ? "danger" : "ok",
		href: `${getPagePath($router, "smart")}?system=${encodeURIComponent(system.id)}`,
	}
}

function buildGpuRuntimeItem(
	system: SystemRecord,
	latestStats?: SystemStatsRecord
): RuntimeSummaryItemData | undefined {
	const gpus = Object.values(latestStats?.stats?.g ?? {}).filter((gpu) => gpu?.n)
	if (gpus.length === 0) return undefined
	const primary = gpus.sort((a, b) => gpuScore(b) - gpuScore(a))[0]
	const usageValues = gpus.map((gpu) => gpu.u).filter(isFiniteNumber)
	const usage = usageValues.length ? Math.max(...usageValues) : undefined
	const totalMemoryMb = gpus.reduce((sum, gpu) => sum + (gpu.mt ?? 0), 0)
	const usedMemoryMb = gpus.reduce((sum, gpu) => sum + (gpu.mu ?? 0), 0)
	const temperature = findGpuTemperatureFromStats(latestStats, gpus)
	const memoryLabel =
		totalMemoryMb > 0
			? `显存 ${formatBytes(usedMemoryMb * 1024 * 1024)} / ${formatBytes(totalMemoryMb * 1024 * 1024)}`
			: usedMemoryMb > 0
				? `显存 ${formatBytes(usedMemoryMb * 1024 * 1024)}`
				: ""
	return {
		key: "gpu",
		label: "GPU",
		value: [
			gpus.length > 1 ? `${gpus.length} 张 GPU` : primary.n,
			usage !== undefined ? `负载 ${formatPercent(usage)}` : "",
		]
			.filter(Boolean)
			.join(" · "),
		detail: [memoryLabel, temperature ? `温度 ${temperature}` : "", gpus.length > 1 ? primary.n : ""]
			.filter(Boolean)
			.join(" · "),
		icon: CpuIcon,
		tone: usage !== undefined && usage >= 90 ? "warning" : "neutral",
		href: `${getPagePath($router, "system", { id: system.id })}?view=gpu`,
	}
}

function buildTemperatureRuntimeItem(
	latestStats: SystemStatsRecord | undefined,
	smartDevices: SmartDeviceRecord[]
): RuntimeSummaryItemData | undefined {
	const sensorEntries = Object.entries(latestStats?.stats?.t ?? {}).filter(([, value]) =>
		isValidRuntimeTemperature(value)
	)
	const diskTemps = smartDevices
		.map((device) => ({ label: device.model || device.name || "磁盘", value: device.temp }))
		.filter((item): item is { label: string; value: number } => isValidRuntimeTemperature(item.value))
	const merged = [...sensorEntries.map(([label, value]) => ({ label, value })), ...diskTemps].sort(
		(a, b) => b.value - a.value
	)
	if (merged.length === 0) return undefined
	const hottest = merged[0]
	return {
		key: "temperature",
		label: "温度",
		value: `${hottest.label} ${formatRuntimeTemperature(hottest.value)}`,
		detail: merged
			.slice(0, 3)
			.map((item) => `${item.label} ${formatRuntimeTemperature(item.value)}`)
			.join(" · "),
		icon: ThermometerIcon,
		tone: hottest.value >= 80 ? "danger" : hottest.value >= 65 ? "warning" : "ok",
	}
}

function buildBatteryRuntimeItem(
	system: SystemRecord,
	latestStats?: SystemStatsRecord
): RuntimeSummaryItemData | undefined {
	const battery = latestStats?.stats?.bat ?? system.info?.bat
	if (!battery) return undefined
	const [percent, state] = battery
	const stateLabel = batteryStateTranslations[state]?.() ?? "状态未知"
	return {
		key: "battery",
		label: "电池",
		value: `${formatPercent(percent)} · ${stateLabel}`,
		detail: latestStats?.created ? `采集时间 ${formatRecordTime(latestStats.created)}` : undefined,
		icon: BatteryIcon,
		tone: percent <= 20 ? "warning" : "neutral",
		href: getPagePath($router, "system", { id: system.id }),
	}
}

function buildContainerRuntimeItem(system: SystemRecord, rows: ContainerRecord[]): RuntimeSummaryItemData | undefined {
	if (rows.length === 0) return undefined
	const running = rows.filter((container) => isContainerRunningStatus(container.status)).length
	const stacks = new Set(rows.map((container) => container.stack_project).filter(Boolean)).size
	const stopped = rows.length - running
	return {
		key: "containers",
		label: "容器",
		value: `${rows.length} 个 · ${running} 运行${stopped > 0 ? ` · ${stopped} 停止` : ""}`,
		detail: stacks > 0 ? `${stacks} 个 Compose stack` : "未识别 Compose stack",
		icon: ContainerIcon,
		tone: stopped > 0 ? "warning" : "ok",
		href: `${getPagePath($router, "containers")}?system=${encodeURIComponent(system.id)}`,
	}
}

function buildWebsiteRuntimeItem(rows: WebsiteMonitorRecord[]): RuntimeSummaryItemData | undefined {
	if (rows.length === 0) return undefined
	const up = rows.filter((monitor) => monitor.last_status === "up").length
	const down = rows.filter((monitor) => monitor.last_status === "down").length
	const unknown = rows.length - up - down
	const latencyValues = rows.map((monitor) => monitor.last_latency_ms).filter(isFiniteNumber)
	const latency =
		latencyValues.length > 0
			? `${Math.round(latencyValues.reduce((sum, value) => sum + value, 0) / latencyValues.length)} ms 平均`
			: ""
	return {
		key: "websites",
		label: "网页端点",
		value: `${rows.length} 个 · ${up} 正常${down > 0 ? ` · ${down} 异常` : ""}`,
		detail: [unknown > 0 ? `${unknown} 未检测` : "", latency].filter(Boolean).join(" · "),
		icon: Globe2Icon,
		tone: down > 0 ? "danger" : up > 0 ? "ok" : "neutral",
		href: getPagePath($router, "websites"),
	}
}

function buildCollectedHardwareSummaries(
	systems: SystemRecord[],
	systemDetails: SystemDetailsRecord[]
): AssetCollectedHardwareSummary[] {
	const detailBySystem = new Map(systemDetails.map((detail) => [detail.system || detail.id, detail]))
	return systems
		.map((system) => {
			const detail = detailBySystem.get(system.id)
			const rows = buildCollectedHardwareRows(system, detail)
			return { system, rows }
		})
		.filter((summary) => summary.rows.length > 0)
}

function buildCollectedHardwareRows(system: SystemRecord, detail?: SystemDetailsRecord) {
	const rows: { label: string; value: string }[] = []
	const systemLabel = firstNonEmpty(detail?.hostname, system.info?.h, system.name)
	if (systemLabel) rows.push({ label: "识别主机名", value: systemLabel })

	const osLabel = firstNonEmpty(detail?.os_name, system.info?.o)
	if (osLabel) rows.push({ label: "操作系统", value: osLabel })

	const cpuParts = [detail?.cpu, formatCoreThreadSummary(detail), formatCpuFrequency(detail?.cpu_frequency_mhz)].filter(
		Boolean
	)
	if (cpuParts.length > 0) rows.push({ label: "CPU", value: cpuParts.join(" · ") })

	if (detail?.memory) {
		const memoryParts = [formatBytes(detail.memory), formatMemoryModuleSummary(detail)].filter(Boolean)
		rows.push({ label: "内存", value: memoryParts.join(" · ") })
	}

	const networkSummary = formatNetworkInterfaceSummary(detail)
	if (networkSummary) rows.push({ label: "网卡", value: networkSummary })

	const runtimeSummary = [detail?.container_runtime_name, detail?.container_runtime_version].filter(Boolean).join(" ")
	if (runtimeSummary) rows.push({ label: "容器运行时", value: runtimeSummary })

	const virtualizationSummary = formatVirtualizationSummary(detail)
	if (virtualizationSummary) rows.push({ label: "虚拟化", value: virtualizationSummary })

	return rows
}

function formatCoreThreadSummary(detail?: SystemDetailsRecord) {
	if (!detail?.cores && !detail?.threads) return ""
	if (detail.cores && detail.threads) return `${detail.cores} 核 / ${detail.threads} 线程`
	if (detail.cores) return `${detail.cores} 核`
	return `${detail.threads} 线程`
}

function formatCpuFrequency(value?: number) {
	if (!value) return ""
	if (value >= 1000) {
		const ghz = value / 1000
		return `${Number.isInteger(ghz) ? ghz.toFixed(0) : ghz.toFixed(2).replace(/0$/, "").replace(/\.0$/, "")} GHz`
	}
	return `${Math.round(value)} MHz`
}

function formatMemoryModuleSummary(detail?: SystemDetailsRecord) {
	const modules = detail?.memory_modules ?? []
	if (modules.length === 0) return ""
	const speeds = [...new Set(modules.map((item) => item.configured_mhz || item.speed_mhz).filter(Boolean))]
	const types = [...new Set(modules.map((item) => item.memory_type).filter(Boolean))]
	return [modules.length ? `${modules.length} 条` : "", types[0], speeds[0] ? `${speeds[0]} MHz` : ""]
		.filter(Boolean)
		.join(" · ")
}

function formatNetworkInterfaceSummary(detail?: SystemDetailsRecord) {
	const interfaces = detail?.network_interfaces ?? []
	if (interfaces.length === 0) return ""
	const connected = interfaces.filter((item) => normalizeComparableText(item.status || "") === "up").length
	const speedValues = [...new Set(interfaces.map((item) => item.link_speed).filter(Boolean))]
	const macCount = interfaces.filter((item) => item.mac).length
	const parts = [`${interfaces.length} 个物理网卡`]
	if (connected > 0) parts.push(`${connected} 已连接`)
	if (speedValues.length > 0) parts.push(speedValues.map((value) => formatSpeed(value)).join(" / "))
	if (macCount > 0) parts.push(`${macCount} 个 MAC`)
	return parts.join(" · ")
}

function formatVirtualizationSummary(detail?: SystemDetailsRecord) {
	const virtualization = detail?.virtualization
	if (!virtualization) return ""
	const parts = [virtualization.role, virtualization.type, virtualization.name].filter(Boolean)
	const vmCount = virtualization.virtual_machines?.length ?? 0
	if (vmCount > 0) parts.push(`${vmCount} 台虚拟机`)
	return parts.join(" · ")
}

function newestBySystem<T extends { system: string; created: string | number }>(records: T[]) {
	const result = new Map<string, T>()
	for (const record of records) {
		const current = result.get(record.system)
		if (!current || getRecordTime(record.created) > getRecordTime(current.created)) {
			result.set(record.system, record)
		}
	}
	return result
}

function groupBySystem<T extends { system?: string }>(records: T[]) {
	const result = new Map<string, T[]>()
	for (const record of records) {
		if (!record.system) continue
		const rows = result.get(record.system) ?? []
		rows.push(record)
		result.set(record.system, rows)
	}
	return result
}

function summarizeSmartMedia(devices: SmartDeviceRecord[]) {
	const counts = new Map<string, number>()
	for (const device of devices) {
		const label = getSmartMediaTypeLabel(device.media_type || device.type)
		if (!label) continue
		counts.set(label, (counts.get(label) ?? 0) + 1)
	}
	return [...counts.entries()]
		.sort(([a], [b]) => a.localeCompare(b, "zh-CN"))
		.map(([label, count]) => `${label} ${count}`)
		.join(" / ")
}

function getSmartMediaTypeLabel(value?: string) {
	const normalized = value?.trim().toLowerCase()
	if (!normalized) return ""
	if (normalized === "nvme") return "NVMe"
	if (normalized === "ssd") return "SSD"
	if (normalized === "hdd") return "HDD"
	return normalized.toUpperCase()
}

function findGpuTemperatureFromStats(latestStats: SystemStatsRecord | undefined, gpus: GPUData[]) {
	const temps = latestStats?.stats?.t ?? {}
	const gpuNames = gpus.map((gpu) => normalizeHardwareName(gpu.n)).filter(Boolean)
	const entries = Object.entries(temps).filter(([name, value]) => {
		if (!isValidRuntimeTemperature(value)) return false
		const normalized = normalizeHardwareName(name)
		return (
			gpuNames.some((gpuName) => normalized.includes(gpuName) || gpuName.includes(normalized)) ||
			/\b(gpu|nvidia|geforce|rtx|gtx|radeon|arc)\b/.test(name.toLowerCase())
		)
	})
	if (entries.length === 0) return ""
	const hottest = entries.reduce((max, item) => (item[1] > max[1] ? item : max))
	return formatRuntimeTemperature(hottest[1])
}

function gpuScore(gpu: GPUData) {
	return (gpu.gt === "discrete" ? 10_000 : 0) + (gpu.mt ?? 0) + (gpu.u ?? 0)
}

function isContainerRunningStatus(status?: string) {
	const normalized = (status ?? "").trim().toLowerCase()
	return normalized.startsWith("up") || normalized.includes("running")
}

function formatPercent(value: number) {
	return `${decimalString(value, value >= 10 ? 1 : 2)}%`
}

function formatRuntimeTemperature(value?: number) {
	if (!isValidRuntimeTemperature(value)) return ""
	const formatted = formatTemperature(value)
	return `${decimalString(formatted.value, formatted.value >= 100 ? 1 : 2)} ${formatted.unit}`
}

function isValidRuntimeTemperature(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value > 0 && value < 200
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value)
}

function normalizeHardwareName(value?: string) {
	return (value ?? "")
		.toLowerCase()
		.replace(/\([^)]*\)/g, " ")
		.replace(/[^a-z0-9]+/g, " ")
		.replace(/\b(nvidia|amd|ati|intel|graphics|controller|corporation|inc|ltd)\b/g, " ")
		.replace(/\s+/g, " ")
		.trim()
}

function getRecordTime(value: string | number | undefined | null) {
	if (typeof value === "number") return value
	if (!value) return 0
	const timestamp = new Date(value).getTime()
	return Number.isFinite(timestamp) ? timestamp : 0
}

function formatRecordTime(value: string | number | undefined | null) {
	const timestamp = getRecordTime(value)
	return timestamp ? formatTime(new Date(timestamp).toISOString()) : ""
}

function formatBytes(value?: number) {
	if (!value) return ""
	const units = ["B", "KB", "MB", "GB", "TB"]
	let size = value
	let unitIndex = 0
	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024
		unitIndex += 1
	}
	const fixed = size >= 10 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)
	return `${fixed} ${units[unitIndex]}`
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
				field: "os",
				label: "操作系统",
				collectedValue: firstNonEmpty(detail.os_name, detail.os),
				source,
				confidence: 90,
				recommendation: "Agent 已采集到操作系统信息。确认这台资产绑定正确后，可写入资产硬件主档作为长期系统档案。",
			})
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
			label: "管理 IPv4",
			archiveValue: asset.management_ip,
			collectedValue: collectedIps.join(" / "),
			source: systems.length === 1 ? getSystemDisplayName(systems[0]) : "绑定 Agent",
			confidence: 85,
			recommendation:
				"Agent 上报的地址不包含资产主档里的管理 IPv4。建议核对固定 IP、DHCP 保留和当前接入网卡后，再决定是否更新资产主档。",
			writeback: {
				collection: "assets",
				recordId: asset.id,
				field: "management_ip",
				value: collectedIps[0],
				targetLabel: "资产档案 / 管理 IP",
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

function formatCollectedNicSummary(detail: SystemDetailsRecord) {
	return (detail.network_interfaces ?? [])
		.map((item) => {
			const name = firstNonEmpty(item.display_name, item.name)
			if (!name) return ""
			const speed = item.link_speed ? ` ${formatSpeed(item.link_speed)}` : ""
			return `${name}${speed}`
		})
		.filter(Boolean)
		.slice(0, 4)
		.join(" / ")
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

function getAssetVisualColor(asset: AssetRecord) {
	return firstNonEmpty(getMetadataString(asset.metadata, "color"), getMetadataString(asset.metadata, "device_color"))
}

function getAssetOfficialColorOptions(asset: AssetRecord, suggestions: AssetEnrichmentSuggestionRecord[] = []) {
	const metadata = asset.metadata ?? {}
	return mergeAssetColorOptions([
		...parseAssetColorOptions(
			firstNonEmpty(getMetadataString(metadata, "colors_available"), getMetadataString(metadata, "official_colors"))
		),
		...suggestions.flatMap((suggestion) => getOfficialColorOptionsFromSuggestion(suggestion)),
	])
}

function parseAssetColorOptions(raw: string) {
	const normalized = raw
		.replace(/[，、/／|；;\n]+/g, ",")
		.split(",")
		.map((item) => item.trim().replace(/^[[\]【】()（）"'“”]+|[[\]【】()（）"'“”]+$/g, ""))
		.filter(Boolean)
	const seen = new Set<string>()
	const result: string[] = []
	for (const item of normalized) {
		const key = normalizeComparableText(item)
		if (!key || seen.has(key)) continue
		seen.add(key)
		result.push(item)
	}
	return result
}

function mergeOfficialColorOptions(options: string[], current?: string) {
	const result = [...options]
	const value = current?.trim()
	if (value && !options.some((option) => normalizeComparableText(option) === normalizeComparableText(value))) {
		result.unshift(value)
	}
	return result
}

function mergeAssetColorOptions(options: string[]) {
	const seen = new Set<string>()
	const result: string[] = []
	for (const option of options) {
		const value = option.trim()
		const key = normalizeComparableText(value)
		if (!value || !key || seen.has(key)) continue
		seen.add(key)
		result.push(value)
	}
	return result
}

function getOfficialColorOptionsFromSuggestion(suggestion: AssetEnrichmentSuggestionRecord) {
	if (suggestion.status !== "pending") return []
	if (suggestion.target_collection !== "assets") return []
	const field = suggestion.target_field.replace(/^metadata\./, "")
	if (field !== "colors_available" && field !== "official_colors") return []
	return parseAssetColorOptions(suggestion.recommended_value)
}

function getOfficialColorFetchRequirements(asset: AssetRecord) {
	const missing: string[] = []
	if (!asset.vendor?.trim()) missing.push("厂商 / 品牌")
	if (!asset.model?.trim()) missing.push("型号 / 规格")
	if (!getMetadataString(asset.metadata, "internal_model")) missing.push("内部型号 / 搜索代码")
	return missing
}

function isOfficialColorRequiredForAssetType(type: AssetRecord["type"]) {
	return ["phone", "tablet", "wearable", "handheld", "ebook", "game_console", "tv", "speaker"].includes(type)
}

function getAssetVisualGenerationBlockReason(asset: AssetRecord, color: string, officialColorOptions: string[]) {
	if (!asset.model?.trim() || !getMetadataString(asset.metadata, "internal_model")) {
		return "生成统一图需要先保存型号 / 规格和内部型号 / 搜索代码。"
	}
	if (!color.trim()) return "生成统一图前必须先选择设备配色。"
	if (isOfficialColorRequiredForAssetType(asset.type)) {
		if (officialColorOptions.length === 0) return "请先点击“获取官方颜色”，让资料补全 Agent 采集官方配色。"
		if (!officialColorOptions.some((option) => normalizeComparableText(option) === normalizeComparableText(color))) {
			return "当前配色不是已采集的官方配色，请从官方配色列表选择。"
		}
	}
	return ""
}

function getAssetRecognitionRequirements(asset: AssetRecord): AssetRecognitionRequirement[] {
	const metadata = asset.metadata ?? {}
	const fixedIpv4 = firstNonEmpty(asset.management_ip, getMetadataString(metadata, "fixed_ipv4"))
	const requirements: AssetRecognitionRequirement[] = [
		{ label: "IPv4 地址", value: fixedIpv4, ok: Boolean(fixedIpv4) },
		{ label: "厂商 / 品牌", value: asset.vendor || "", ok: Boolean(asset.vendor?.trim()) },
		{ label: "型号 / 规格", value: asset.model || "", ok: Boolean(asset.model?.trim()) },
		{
			label: "内部型号 / 搜索代码",
			value: getMetadataString(metadata, "internal_model"),
			ok: Boolean(getMetadataString(metadata, "internal_model")),
		},
		{
			label: "资产编号",
			value: getMetadataString(metadata, "asset_tag"),
			ok: Boolean(getMetadataString(metadata, "asset_tag")),
		},
		{ label: "所属类型", value: getAssetTypeLabel(asset.type), ok: Boolean(asset.type) },
		{ label: "位置", value: asset.location || "", ok: Boolean(asset.location?.trim()) },
	]
	if (isPhoneVariantSpecRequired(asset.type)) {
		const memoryGb = getMetadataNumber(metadata, "memory_gb")
		const storageGb = getMetadataNumber(metadata, "storage_gb")
		requirements.push(
			{ label: "运行内存", value: memoryGb ? `${memoryGb} GB` : "", ok: Boolean(memoryGb) },
			{ label: "存储容量", value: storageGb ? `${storageGb} GB` : "", ok: Boolean(storageGb) }
		)
	}
	return requirements
}

function validateAssetProfileForm(values: {
	type: AssetRecord["type"]
	name: string
	vendor: string
	model: string
	internalModel: string
	color: string
	assetTag: string
	location: string
	ipv4: string
	memoryGb: string
	storageGb: string
}) {
	const errors: string[] = []
	if (!values.name.trim()) errors.push("资产名称")
	if (!values.ipv4.trim()) {
		errors.push("IPv4 地址")
	} else if (!isValidAssetIpv4(values.ipv4)) {
		errors.push("IPv4 地址格式不正确")
	}
	if (!values.vendor.trim()) errors.push("厂商 / 品牌")
	if (!values.model.trim()) errors.push("型号 / 规格")
	if (!values.internalModel.trim()) errors.push("内部型号 / 搜索代码")
	if (!values.assetTag.trim()) errors.push("资产编号")
	if (!values.location.trim()) errors.push("位置")
	if (isPhoneVariantSpecRequired(values.type)) {
		if (!isPositiveNumberString(values.memoryGb)) errors.push("运行内存")
		if (!isPositiveNumberString(values.storageGb)) errors.push("存储容量")
	}
	return errors
}

function isPositiveNumberString(value: string | undefined) {
	if (!value?.trim()) return false
	const number = Number(value)
	return Number.isFinite(number) && number > 0
}

function isValidAssetIpv4(value: string) {
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

function isActionableEnrichmentSuggestion(suggestion: AssetEnrichmentSuggestionRecord) {
	if (suggestion.status !== "pending") return false
	const recommended = suggestion.recommended_value?.trim()
	if (!recommended) return false
	const current = suggestion.current_value?.trim()
	return !current || suggestion.conflict || normalizeComparableText(current) !== normalizeComparableText(recommended)
}

function getSystemDisplayName(system: SystemRecord) {
	return system.display_name || system.name || system.id
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

function getAssetFieldDisplayValue(asset: AssetRecord, field: AssetFieldDefinition) {
	let value = ""
	switch (field.key) {
		case "name":
			value = asset.name
			break
		case "status":
			value = getStatusLabel(asset.status || "active")
			break
		case "vendor":
			value = asset.vendor || ""
			break
		case "model":
			value = asset.model || ""
			break
		case "serial_number":
			value = asset.serial_number || ""
			break
		case "management_ip":
			value = asset.management_ip || ""
			break
		case "location":
			value = asset.location || ""
			break
		case "role":
			value = asset.role || ""
			break
		case "notes":
			value = asset.notes || ""
			break
		default:
			value = getMetadataString(asset.metadata, field.key)
	}
	if (field.type === "select") {
		return field.options?.find((option) => option.value === value)?.label ?? value
	}
	return value
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

function formatSpeed(value?: number) {
	if (!value) return ""
	if (value >= 1000) {
		const gbps = value / 1000
		return `${Number.isInteger(gbps) ? gbps.toFixed(0) : gbps.toFixed(1)}G`
	}
	return `${value}M`
}

function formatDate(value: string) {
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return value
	return date.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" })
}

function formatTime(value: string) {
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return value
	return date.toLocaleString("zh-CN", { hour12: false })
}

function isActiveNotificationCooldown(record: AlertNotificationStateRecord) {
	if (record.status !== "suppressed" || !record.next_allowed_at) return false
	const nextAllowed = new Date(record.next_allowed_at)
	return !Number.isNaN(nextAllowed.getTime()) && nextAllowed > new Date()
}

function notificationStateLabel(status?: AlertNotificationStateRecord["status"]) {
	switch (status) {
		case "failed":
			return "发送失败"
		case "suppressed":
			return "冷却中"
		case "resolved":
			return "已恢复"
		default:
			return "已发送"
	}
}

function notificationStateTimeLabel(record: AlertNotificationStateRecord) {
	if (record.status === "resolved" && record.last_resolved_at) {
		return `恢复通知：${formatTime(record.last_resolved_at)}`
	}
	if (record.status === "failed" && record.last_attempt_at) {
		return `最近尝试：${formatTime(record.last_attempt_at)}`
	}
	if (record.status === "suppressed" && record.last_suppressed_at) {
		return `最近抑制：${formatTime(record.last_suppressed_at)}`
	}
	if (record.last_sent_at) {
		return `最近发送：${formatTime(record.last_sent_at)}`
	}
	return `更新时间：${formatTime(record.updated)}`
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

function escapePocketBaseFilterValue(value: string) {
	return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')
}
