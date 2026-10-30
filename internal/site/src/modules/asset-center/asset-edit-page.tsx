import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { getPagePath } from "@nanostores/router"
import { ArrowLeftIcon, CheckIcon, ImagesIcon, Loader2Icon, PencilIcon, SparklesIcon, Trash2Icon } from "lucide-react"
import { $router, Link } from "@/components/router"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { LoadingState } from "@/components/ui/loading-state"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/use-toast"
import { isPocketBaseAutoCancel, isReadOnlyUser, pb } from "@/lib/api"
import { formatPocketBaseError } from "@/lib/pocketbase-error"
import { getAssetIcon } from "./components/asset-card"
import { getAssetMediaDefaultPreview } from "./components/asset-media-default-preview"
import { AssetConnectionTable } from "./components/asset-connection-table"
import { AssetConnectionManagerDialog } from "./components/asset-connection-manager-dialog"
import { AssetEditVisualPanel } from "./components/asset-edit-visual-panel"
import { AssetParameterGroupEditDialog } from "./components/asset-parameter-group-edit-dialog"
import { AssetProfileEditForm, ASSET_PROFILE_EDIT_FORM_ID } from "./components/asset-profile-edit-form"
import { AssetMediaShowcase } from "./components/asset-media-showcase"
import { AssetOverviewColumn, AssetHardwareSpecsColumn } from "./components/asset-parameter-columns"
import {
	persistAgentResultsAll,
	type AssetParameterAgentCandidate,
} from "./components/asset-parameter-group-edit-dialog"
import { buildAssetIdentitySections } from "./components/asset-showcase-workspace"
import { AssetNetworkDetailTable } from "./components/asset-network-detail-table"
import { AssetNetworkCapabilityEditDialog } from "./components/asset-network-capability-edit-dialog"
import { AssetComponentListCard } from "./components/asset-component-list-card"
import { isServiceAssetType } from "./asset-profiles"
import {
	AssetHardwareIdentityEditForm,
	ASSET_HARDWARE_IDENTITY_EDIT_FORM_ID,
} from "./components/asset-hardware-identity-edit-form"
import { ParameterDebugBoundary } from "./components/parameter-debug-boundary"
import { AssetShowcaseTags } from "./components/asset-showcase-tags"
import { StatusBadge } from "./asset-detail-dialog-parts"
import {
	applyAssetDetailPrimaryData,
	applyAssetDetailSecondaryData,
	applyAssetDetailEditCatalog,
	emptyAssetDetailState,
	loadAssetDetailPrimaryData,
	loadAssetDetailSecondaryData,
	type AssetDetailState,
} from "./asset-detail-data"
import { createAssetDetailLoadGuard, type AssetDetailLoadToken } from "./asset-detail-load-guard"
import { loadAssetEditCatalog } from "./asset-edit-catalog-query"
import { getAssetMediaRequestKey, subscribeAssetMediaChanged } from "./asset-media-events"
import { dedupeAssetMediaShowcaseVersions, filterWholeAlbumPlacements } from "./asset-media"
import {
	buildAssetParameterGroups,
	getAssetParameterCategoryTitle,
	type AssetParameterGroupContext,
} from "./asset-detail-parameter-groups"
import {
	getAssetArchiveField,
	getAssetParameterFieldsForType,
	ASSET_PARAMETER_CATEGORIES,
	type AssetParameterCategoryId,
} from "./asset-parameter-registry"
import { assetAgentWriteError, formatAgentCandidateLabel, normalizeAgentSelectValue } from "./asset-agent-select"
import { buildNetworkDeviceDetailModel, isNetworkDetailParameterGroup } from "./asset-network-detail-model"
import {
	getAssetFormSections,
	getAssetTypeLabel,
	getBuildModeLabel,
	getMetadataString,
	isComputeDeviceType,
	isPhoneVariantSpecRequired,
	normalizeNumberFieldValue,
} from "./asset-schema"
import { normalizeInternetProvider, validateInternetAssetValues, validateOntAssetValues } from "./asset-type-specs"
import type {
	AITaskRecord,
	AssetChangeRecord,
	AssetEnrichmentReportRecord,
	AssetEnrichmentSuggestionRecord,
	AssetInterfaceRecord,
	AssetLocationRecord,
	AssetRelationRecord,
	AssetRecord,
	AssetVisualRecord,
} from "@/types"

// 2026-10-06 页面重构二稿（用户拍板）：编辑页两栏布局。
// 左：图片卡（封面/画廊展示 + 「图片管理」弹窗）+ 基本信息卡（身份行 + 「编辑」弹窗）。
// 中：连接图卡（参数最上方，右上角「编辑」打开连接管理弹窗）+ 参数分组卡（每组「编辑」弹窗）。
// 连接图不再单独占一列——部分设备连接图很长，放中栏往下延伸不挤压参数阅读。
// 展示页只读，右上角唯一「编辑」按钮跳转到本页。

export default function AssetEditPage({ id }: { id: string }) {
	const readOnly = isReadOnlyUser()
	const [state, setState] = useState<AssetDetailState>(emptyAssetDetailState)
	const [loading, setLoading] = useState(true)
	const [saving, setSaving] = useState(false)
	// 2026-10-14 参数获取下线（用户拍板）：卡头「Agent 填写参数」——粘贴参数文本 → AI 一次分类 →
	// 按分组勾选写入 + 完成报告；候选同时持久化到 metadata._agent_results（各组编辑弹窗共享）
	const [agentFillOpen, setAgentFillOpen] = useState(false)
	const [agentFillText, setAgentFillText] = useState("")
	const [agentFillPhase, setAgentFillPhase] = useState<"idle" | "working" | "ready" | "done" | "error">("idle")
	const [agentFillCandidates, setAgentFillCandidates] = useState<AssetParameterAgentCandidate[]>([])
	const [agentFillUnrecognized, setAgentFillUnrecognized] = useState<{ name: string; value: string }[]>([])
	// 2026-10-20 用户反馈：品牌/型号/设备类型属于基本信息，单独展示，不再混进「无法分类」
	const [agentFillProfile, setAgentFillProfile] = useState<{ field: string; label: string; value: string }[]>([])
	// 识别耗时秒数：等待 AI 时给出真实等待反馈（常见参数本地识别通常 1 秒内完成）
	const [agentFillElapsed, setAgentFillElapsed] = useState(0)
	const [agentFillChecked, setAgentFillChecked] = useState<Set<string>>(new Set())
	const [agentFillError, setAgentFillError] = useState("")
	const [agentFillReport, setAgentFillReport] = useState<{ category: string; count: number }[]>([])
	const [agentFillWriting, setAgentFillWriting] = useState(false)
	const [mediaManagerOpen, setMediaManagerOpen] = useState(false)
	const [profileEditOpen, setProfileEditOpen] = useState(false)
	// 2026-10-10 详情页大布局：设备档案编辑（型号/内部型号/厂商/官网）独立弹窗
	const [hardwareProfileEditOpen, setHardwareProfileEditOpen] = useState(false)
	const [connectionManagerOpen, setConnectionManagerOpen] = useState(false)
	const [groupEdit, setGroupEdit] = useState<{ groupId: string; groupTitle: string } | null>(null)
	// 计算设备③：组级获取候选确认层（docs/pc-asset-design.md 三）
	const [capabilityEdit, setCapabilityEdit] = useState<{ groupId: string; groupTitle: string } | null>(null)
	const [assetMedia, setAssetMedia] = useState<{
		covers: { id: string; mediaId: string; version: string; url: string }[]
		gallery: { id: string; mediaId: string; version: string; url: string }[]
	}>({ covers: [], gallery: [] })
	const detailLoadGuardRef = useRef(createAssetDetailLoadGuard())

	const loadDetail = useCallback(
		async (options?: { waitSecondary?: boolean; preserveContent?: boolean }) => {
			if (!id) return
			const loadToken = detailLoadGuardRef.current.begin(id)
			try {
				const data = await loadAssetDetailPrimaryData(
					{
						assets: pb.collection<AssetRecord>("assets"),
						interfaces: pb.collection<AssetInterfaceRecord>("asset_interfaces"),
						relations: pb.collection<AssetRelationRecord>("asset_relations"),
					},
					id
				)
				if (!detailLoadGuardRef.current.isCurrent(loadToken)) return
				setState((current) =>
					applyAssetDetailPrimaryData(current, data, { preserveSecondaryData: options?.preserveContent })
				)
			} catch (error) {
				if (!isPocketBaseAutoCancel(error)) console.error("load asset edit page", error)
				setLoading(false)
				return
			}
			setLoading(false)
			// 次级数据（图片候选/维护/附件/AI 任务）与编辑目录（资产/接口/位置清单）并行补齐
			loadSecondaryDetailData(loadToken).catch((error) => console.error("load secondary asset edit data", error))
			loadEditCatalogData(loadToken).catch((error) => console.error("load asset edit catalog", error))
			if (options?.waitSecondary) await loadSecondaryDetailData(loadToken)
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[id]
	)

	async function loadSecondaryDetailData(loadToken: AssetDetailLoadToken) {
		try {
			const data = await loadAssetDetailSecondaryData(
				{
					visuals: pb.collection<AssetVisualRecord>("asset_visuals"),
					buildAssetVisualFileURL: (recordId, file) =>
						pb.files.getURL({ id: recordId, collectionName: "asset_visuals" }, file),
					aiTasks: pb.collection<AITaskRecord>("ai_tasks"),
					changes: pb.collection<AssetChangeRecord>("asset_changes"),
					enrichmentReports: pb.collection<AssetEnrichmentReportRecord>("asset_enrichment_reports"),
					suggestions: pb.collection<AssetEnrichmentSuggestionRecord>("asset_enrichment_suggestions"),
				},
				id
			)
			if (detailLoadGuardRef.current.isCurrent(loadToken)) {
				setState((current) => applyAssetDetailSecondaryData(current, id, data))
			}
		} catch (error) {
			if (!isPocketBaseAutoCancel(error)) console.warn("load secondary asset edit data", error)
		}
	}

	async function loadEditCatalogData(loadToken: AssetDetailLoadToken) {
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
			if (!detailLoadGuardRef.current.isCurrent(loadToken)) return
			const fallbackAsset = assets.find((item) => item.id === id)
			if (!fallbackAsset) return
			const fallbackInterfaces = allInterfaces.filter((item) => item.asset === id)
			setState((current) =>
				applyAssetDetailEditCatalog(current, {
					assetId: id,
					fallbackAsset: current.asset ?? fallbackAsset,
					fallbackInterfaces: current.interfaces.length > 0 ? current.interfaces : fallbackInterfaces,
					assets,
					interfaces: allInterfaces,
					locations,
				})
			)
		} catch (error) {
			if (!isPocketBaseAutoCancel(error)) console.warn("load asset edit catalog", error)
		}
	}

	useEffect(() => {
		loadDetail()
	}, [loadDetail])

	// 图片数据：封面/画廊摆放位（图片卡展示、图片管理弹窗与画廊排序共用）
	useEffect(() => {
		let active = true
		const loadAssetMedia = async () => {
			try {
				const result = await pb.send<{
					media: { id: string; album?: string }[]
					versions: { id: string }[]
					placements: {
						id: string
						media: string
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
				// 2026-10-08 梳理⑤：封面/画廊只显示整机相册（含未分组旧图）；配件相册图在配件弹窗与图片库分节查看
				const mediaAlbumById = new Map(result.media.map((item) => [item.id, item.album ?? ""]))
				const wholePlacements = filterWholeAlbumPlacements(result.placements, mediaAlbumById)
				const display = (role: string) =>
					wholePlacements
						.filter((item) => item.role === role && item.visible !== false && versionIds.has(item.version))
						.sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
						.map((item) => ({
							id: item.id,
							mediaId: item.media,
							version: item.version,
							url: `/api/pulse/asset-media/object?version=${item.version}`,
						}))
				const deduped = dedupeAssetMediaShowcaseVersions(display("cover"), display("gallery"))
				setAssetMedia({ covers: deduped.covers, gallery: deduped.gallery })
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

	const asset = state.asset
	const safeInterfaces = Array.isArray(state.interfaces) ? state.interfaces : []
	const safeAllInterfaces = Array.isArray(state.allInterfaces) ? state.allInterfaces : []
	const safeRelations = Array.isArray(state.relations) ? state.relations : []
	const safeAssets = Array.isArray(state.assets) ? state.assets : []
	const AssetIcon = asset ? getAssetIcon(asset.type) : null
	const assetTag = asset ? getMetadataString(asset.metadata, "asset_tag") : ""

	// ---- 设备档案身份分区（与展示页档案卡同一渲染器） ----
	const identitySections = useMemo(() => (asset ? buildAssetIdentitySections(asset) : []), [asset])

	// 2026-10-14 参数获取下线：获取全部参数结果按分类分区展示（Agent 填写弹窗复用同一分组器）
	const groupedFullCandidates = useMemo(() => {
		const grouped: Record<string, AssetParameterAgentCandidate[]> = {}
		for (const candidate of agentFillCandidates) {
			const bucket = grouped[candidate.category] ?? []
			bucket.push(candidate)
			grouped[candidate.category] = bucket
		}
		return grouped
	}, [agentFillCandidates])

	// 自定义参数可手动改分组：只列当前资产类型可用的分类 + 候选自己的分类
	const agentCategoryOptions = useMemo(() => {
		if (!asset) return []
		const ids = new Set<AssetParameterCategoryId>(
			getAssetParameterFieldsForType(asset.type).map((field) => field.category)
		)
		for (const candidate of agentFillCandidates) {
			ids.add(candidate.category as AssetParameterCategoryId)
		}
		return ASSET_PARAMETER_CATEGORIES.filter((category) => category.id !== "system" && ids.has(category.id))
	}, [asset, agentFillCandidates])

	useEffect(() => {
		if (agentFillPhase !== "working") {
			setAgentFillElapsed(0)
			return
		}
		const startedAt = Date.now()
		const timer = window.setInterval(() => setAgentFillElapsed(Math.floor((Date.now() - startedAt) / 1000)), 500)
		return () => window.clearInterval(timer)
	}, [agentFillPhase])

	// 2026-10-20 详情页「Agent 填写参数」入口：跳到编辑页时带 ?agent=1，自动打开填写弹窗
	useEffect(() => {
		if (!asset) return
		const params = new URLSearchParams(window.location.search)
		if (params.get("agent") !== "1") return
		setAgentFillOpen(true)
		params.delete("agent")
		const query = params.toString()
		window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`)
	}, [asset])

	// ---- 参数分组（与展示页同一套分组器） ----
	const networkDetailModel = useMemo(
		() => (asset ? buildNetworkDeviceDetailModel(asset, safeAssets, safeAllInterfaces, safeRelations) : null),
		[asset, safeAssets, safeAllInterfaces, safeRelations]
	)

	const parameterGroups = useMemo(() => {
		if (!asset) return []
		const context: AssetParameterGroupContext = {
			interfaces: safeAllInterfaces,
			assets: safeAssets,
			relations: safeRelations,
		}
		// 2026-10-10 参数专项：模板模式——计算设备固定显示每个硬件分组
		// 2026-10-12 用户拍板：不再显示空参数的占位组卡（影像/传感器/系统等只有「编辑」没有内容），
		// 各组编辑弹窗打开即展示 Agent 搜到的候选，填入参数后分组自然出现
		// 2026-10-17 用户拍板：计算设备固化分类常驻——空组过滤移除（固化列表内的分类由构建器返回占位组，
		// 删光参数的分组不消失、保留「编辑」入口；非固化分类构建器仍不返回空组）
		const groups = buildAssetParameterGroups(asset, context)
		if (networkDetailModel) {
			return groups.filter(
				(group) =>
					!isNetworkDetailParameterGroup(asset.type, group.id) &&
					// 电源参数已由网络详情卡的电源属性格子承载，避免重复
					group.id !== "asset-parameter-power"
			)
		}
		return groups
	}, [asset, safeAllInterfaces, safeAssets, safeRelations, networkDetailModel])

	// 网络能力编辑弹窗目标：网络详情卡的能力分节（网络功能/接口能力），行数据现成
	const networkCapabilityEditTargets = useMemo(
		() => (asset && networkDetailModel ? networkDetailModel.capabilitySections : []),
		[asset, networkDetailModel]
	)

	// ---- 图片工作台（图片管理弹窗内） ----
	// 2026-10-09 图片专项：按用户决策下线 AI 配图管线（获取图片/候选导入）——图片收集以网络图墙搜索为主。
	// 2026-10-09 图片专项：画廊排序与封面设置收进图片管理弹窗（卡片顺序按钮 + 右侧预览），本页不再承载排序区块。

	// ---- 主档保存（含宽带/光猫校验与手机规格） ----
	async function saveAssetProfile(event: FormEvent<HTMLFormElement>, extraMetadata: Record<string, string> = {}) {
		event.preventDefault()
		if (!asset || readOnly) return
		const form = new FormData(event.currentTarget)
		const metadata = { ...(asset.metadata ?? {}), ...extraMetadata }
		const name = form.get("name")?.toString().trim() || asset.name
		const fixedIpv4 = form.get("fixed_ipv4")?.toString().trim() || ""
		const managementIp = form.get("management_ip")?.toString().trim() || fixedIpv4
		// 2026-10-20 服务类基本信息默认不展示固定 IP/型号/序列号；宽带例外显示型号（运营商），
		// 表单没有对应字段时保持原值，避免误清历史数据。
		const hasFixedIpv4Field = form.get("fixed_ipv4") !== null
		const modelField = form.get("model")
		const serialField = form.get("serial_number")
		const targetType = (form.get("type")?.toString() as AssetRecord["type"] | undefined) || asset.type
		const schemaFields = getAssetFormSections(targetType).flatMap((section) => section.fields)
		for (const field of schemaFields) {
			const value = form.get(field.key)
			if (value === null || field.source !== "metadata") continue
			const normalized = value.toString().trim()
			metadata[field.key] = field.type === "number" && normalized ? Number(normalized) : normalized
		}
		// 2026-10-20 基本信息 20 字段：编辑弹窗新增的归属/采购/官网/MAC 字段（部分类型不在 schema 分节里）
		for (const key of [
			"official_url",
			"owner",
			"install_date",
			"network_domain",
			"purchase_date",
			"purchase_price_cny",
			"warranty_until",
			"mac",
		]) {
			const value = form.get(key)
			if (value === null) continue
			const normalized = value.toString().trim()
			metadata[key] = key === "purchase_price_cny" && normalized ? Number(normalized) : normalized
		}
		// 2026-10-20 弹窗与卡片同构后不再包含 color/build_mode/手机规格——只在表单确实有该字段时处理，避免误清数据
		const colorValue = form.get("color")
		if (colorValue !== null) {
			metadata.color = colorValue.toString().trim()
			if (targetType !== "ont") metadata.device_color = metadata.color
		}
		metadata.asset_tag = form.get("asset_tag")?.toString().trim() || metadata.asset_tag || ""
		const buildModeValue = form.get("build_mode")
		if (buildModeValue !== null) {
			// 装机方式只在计算设备上维护；改成其他类型时清掉残留
			if (isComputeDeviceType(targetType)) {
				const buildMode = buildModeValue.toString()
				if (buildMode) metadata.build_mode = buildMode
				else delete metadata.build_mode
			} else {
				delete metadata.build_mode
			}
		}
		// 2026-10-20 宽带是服务，没有固定 IPv4；严格模板也不允许写入 fixed_ipv4（用户报保存失败）
		if (hasFixedIpv4Field) metadata.fixed_ipv4 = fixedIpv4
		const colorsAvailable = form.get("colors_available")?.toString().trim()
		if (colorsAvailable) {
			metadata.colors_available = colorsAvailable
			metadata.official_colors = colorsAvailable
		}
		if (isPhoneVariantSpecRequired(targetType) && form.get("memory_gb") !== null) {
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
				model: modelField !== null ? modelField.toString().trim() : asset.model || "",
				serial_number: serialField !== null ? serialField.toString().trim() : asset.serial_number || "",
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
			setProfileEditOpen(false)
			toast({ title: "设备档案已保存", description: name })
		} catch (error) {
			console.error("save asset profile", error)
			const description = formatPocketBaseError(error, "请检查字段、权限或重复主数据。")
			toast({ title: "档案保存失败", description, variant: "destructive" })
		} finally {
			setSaving(false)
		}
	}

	// 2026-10-14 参数填写 Agent：粘贴文本 → AI 分类 → 勾选写入 + 完成报告。
	// 候选同时持久化到 metadata._agent_results（各组编辑弹窗打开即展示）。

	async function runAgentFill() {
		if (!asset || agentFillPhase === "working") return
		const text = agentFillText.trim()
		if (!text) {
			setAgentFillError("请先粘贴参数文本。")
			setAgentFillPhase("error")
			return
		}
		setAgentFillPhase("working")
		setAgentFillError("")
		setAgentFillProfile([])
		try {
			const body = await pb
				.send<{
					candidates?: AssetParameterAgentCandidate[]
					unrecognized?: { name: string; value: string }[]
					profile?: { field: string; label: string; value: string }[]
					error?: string
				}>("/api/pulse/assets/parameter-agent", {
					method: "POST",
					body: JSON.stringify({
						name: asset.name,
						type: asset.type,
						vendor: asset.vendor,
						model: asset.model,
						asset_id: asset.id,
						text,
					}),
				})
				.catch((error) => {
					setAgentFillError(assetAgentWriteError(error, "Agent 执行失败，请稍后再试。"))
					return null
				})
			if (!body) {
				setAgentFillPhase("error")
				return
			}
			if (body.error && !(body.candidates?.length || body.unrecognized?.length || body.profile?.length)) {
				setAgentFillError(body.error)
				setAgentFillPhase("error")
				return
			}
			const candidates = (body.candidates ?? []).filter((candidate) => !candidate.field.startsWith("current_"))
			setAgentFillCandidates(candidates)
			setAgentFillUnrecognized(body.unrecognized ?? [])
			setAgentFillProfile(body.profile ?? [])
			// 默认全选——写入前可逐条取消
			setAgentFillChecked(new Set(candidates.map((candidate) => candidate.field)))
			setAgentFillPhase("ready")
			// 候选持久化（各组编辑弹窗打开即展示，直到下次填写才替换）
			const at = new Date().toISOString()
			const byCategory: Record<string, { at: string; candidates: AssetParameterAgentCandidate[] }> = {}
			for (const candidate of candidates) {
				const bucket = byCategory[candidate.category] ?? { at, candidates: [] }
				bucket.candidates.push(candidate)
				byCategory[candidate.category] = bucket
			}
			await persistAgentResultsAll(asset.id, byCategory)
			await loadDetail({ preserveContent: true })
		} catch (error) {
			console.error("run agent fill", error)
			setAgentFillError("Agent 执行失败，请稍后再试。")
			setAgentFillPhase("error")
		}
	}

	// 写入勾选的候选：数字字段转数字、从隐藏清单恢复；完成后展示完成报告
	async function writeAgentFillSelections() {
		if (!asset || agentFillWriting || agentFillChecked.size === 0) return
		setAgentFillWriting(true)
		setAgentFillError("")
		try {
			const current = await pb.collection("assets").getOne(asset.id)
			const metadata = { ...((current.metadata ?? {}) as Record<string, unknown>) }
			const writtenByCategory = new Map<string, number>()
			for (const candidate of agentFillCandidates) {
				if (!agentFillChecked.has(candidate.field)) continue
				const definition = getAssetArchiveField(candidate.field)
				// 2026-10-20 选择字段先归一：粘贴的「Web轻管理」「轻管理」写入严格模板接受的值（web/smart…）
				const normalizedValue =
					definition?.type === "select"
						? normalizeAgentSelectValue(asset.type, candidate.field, candidate.value)
						: candidate.value
				// 2026-10-17 数字字段统一归一化：带单位的值（3.3 GHz / 32GB）提取数值保存，避免脏数据/丢值
				metadata[candidate.field] =
					definition?.type === "number" ? normalizeNumberFieldValue(normalizedValue) : normalizedValue
				// 2026-10-14 完整识别口径：对不上预设字段的参数按分类归入该组作自定义参数（以参数名为键），
				// 与「+ 添加参数」手工自定义同源（_group_params 登记组参数清单）
				if (!definition) {
					const groupParamsRecord = {
						...((metadata._group_params as Record<string, string[]> | undefined) ?? {}),
					}
					const keys = new Set(
						Array.isArray(groupParamsRecord[candidate.category]) ? groupParamsRecord[candidate.category] : []
					)
					keys.add(candidate.field)
					groupParamsRecord[candidate.category] = [...keys]
					metadata._group_params = groupParamsRecord
				}
				writtenByCategory.set(candidate.category, (writtenByCategory.get(candidate.category) ?? 0) + 1)
				// 写入即恢复该字段（从 _hidden_params 各组隐藏清单移除）
				const hiddenRecord = { ...((metadata._hidden_params as Record<string, string[]> | undefined) ?? {}) }
				for (const [group, keys] of Object.entries(hiddenRecord)) {
					const kept = keys.filter((key) => key !== candidate.field)
					if (kept.length !== keys.length) {
						if (kept.length > 0) hiddenRecord[group] = kept
						else delete hiddenRecord[group]
					}
				}
				metadata._hidden_params = hiddenRecord
			}
			await pb.collection("assets").update(asset.id, { metadata })
			setAgentFillReport([...writtenByCategory.entries()].map(([category, count]) => ({ category, count })))
			setAgentFillPhase("done")
			await loadDetail({ preserveContent: true })
		} catch (error) {
			console.error("write agent fill selections", error)
			// 2026-10-20 用户反馈：不要只给「请稍后再试」——保留识别结果与勾选，显示后端具体原因并可重试
			setAgentFillError(`写入失败：${assetAgentWriteError(error, "请稍后再试。")}`)
		} finally {
			setAgentFillWriting(false)
		}
	}

	function updateAgentFillCandidate(field: string, patch: Partial<AssetParameterAgentCandidate>) {
		setAgentFillError("")
		setAgentFillCandidates((current) =>
			current.map((candidate) => (candidate.field === field ? { ...candidate, ...patch } : candidate))
		)
	}

	// 2026-10-20 用户《完整优化方案》：识别后不认识的参数进「未分类」分组，可在详情页拖到其他分类
	async function moveUnrecognizedToUncategorized() {
		if (!asset || readOnly || agentFillWriting) return
		const writable = agentFillUnrecognized.filter((item) => {
			const name = item.name.trim()
			return name && !name.startsWith("_") && !name.startsWith("current_") && name.length <= 60
		})
		if (writable.length === 0) return
		setAgentFillWriting(true)
		setAgentFillError("")
		try {
			const current = await pb.collection("assets").getOne(asset.id)
			const metadata = { ...((current.metadata ?? {}) as Record<string, unknown>) }
			const groupParams = { ...((metadata._group_params as Record<string, string[]> | undefined) ?? {}) }
			const keys = new Set(Array.isArray(groupParams.uncategorized) ? groupParams.uncategorized : [])
			for (const item of writable) {
				const name = item.name.trim()
				metadata[name] = item.value.trim()
				keys.add(name)
			}
			groupParams.uncategorized = [...keys]
			metadata._group_params = groupParams
			await pb.collection("assets").update(asset.id, { metadata })
			setAgentFillUnrecognized((current) => current.filter((item) => !writable.includes(item)))
			const skipped = agentFillUnrecognized.length - writable.length
			toast({
				title: "已放入未分类",
				description:
					skipped > 0 ? `写入 ${writable.length} 项，${skipped} 项名称不允许写入已跳过。` : `${writable.length} 项`,
			})
			await loadDetail({ preserveContent: true })
		} catch (error) {
			console.error("move unrecognized to uncategorized", error)
			const description = (error as { data?: { message?: string } })?.data?.message?.trim() || "请稍后重试。"
			toast({ title: "放入未分类失败", description, variant: "destructive" })
		} finally {
			setAgentFillWriting(false)
		}
	}

	function toggleAgentFillChecked(field: string) {
		setAgentFillChecked((current) => {
			const next = new Set(current)
			if (next.has(field)) next.delete(field)
			else next.add(field)
			return next
		})
	}

	async function saveHardwareIdentity(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		if (!asset || readOnly) return
		const form = new FormData(event.currentTarget)
		const model = form.get("model")?.toString().trim() || ""
		const vendor = form.get("vendor")?.toString().trim() || ""
		const metadata = { ...(asset.metadata ?? {}) }
		// 2026-10-17 用户拍板：品牌合并为单字段（直接填「铭凡 (Minisforum)」）——清掉旧的中英文拆分存储；
		// 表单打开时已把 vendor_cn 合并进 vendor 显示，这里删除不会丢信息
		delete metadata.vendor_cn
		// 2026-10-17 用户拍板：内部型号不再单列（写进型号括号里）——表单打开时已合并进型号显示，清掉旧键
		delete metadata.internal_model
		const officialUrl = form.get("official_url")?.toString().trim() || ""
		if (officialUrl) metadata.official_url = officialUrl
		else delete metadata.official_url
		// 2026-10-12 用户拍板：上市日期归设备档案（展示在档案卡，此处编辑）
		const releaseDate = form.get("release_date")?.toString().trim() || ""
		if (releaseDate) metadata.release_date = releaseDate
		else delete metadata.release_date
		// 2026-10-17 用户拍板：基本信息增加「产品定位」（迷你主机 / 工作站 / 家用 NAS 等）
		const productPositioning = form.get("product_positioning")?.toString().trim() || ""
		if (productPositioning) metadata.product_positioning = productPositioning
		else delete metadata.product_positioning
		setSaving(true)
		try {
			await pb.collection("assets").update(asset.id, { model, vendor, metadata })
			await loadDetail({ waitSecondary: true, preserveContent: true })
			setHardwareProfileEditOpen(false)
			toast({ title: "设备档案已保存", description: model || asset.name })
		} catch (error) {
			console.error("save hardware identity", error)
			toast({ title: "设备档案保存失败", description: "请检查字段或权限。", variant: "destructive" })
		} finally {
			setSaving(false)
		}
	}
	function submitProfileForm() {
		const form = document.getElementById(ASSET_PROFILE_EDIT_FORM_ID)
		if (form instanceof HTMLFormElement) form.requestSubmit()
	}

	// ---- 删除资产 ----
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

	if (loading) {
		return <LoadingState title="正在读取资产" />
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
							<Link href={getPagePath($router, "asset", { id: asset.id })}>
								<ArrowLeftIcon className="size-3.5" />
								返回详情
							</Link>
						</Button>
						<div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-2">
							{AssetIcon && (
								<div className="grid size-9 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft text-muted-foreground">
									<AssetIcon className="size-4" />
								</div>
							)}
							<h1 className="max-w-[min(24rem,70vw)] truncate text-xl font-semibold text-foreground">{asset.name}</h1>
							{assetTag && (
								<button
									type="button"
									title="点击复制编号"
									onClick={() => {
										navigator.clipboard
											.writeText(assetTag)
											.then(() => toast({ title: "编号已复制", description: assetTag }))
											.catch(() => undefined)
									}}
									className="inline-flex h-6 max-w-[10rem] shrink-0 cursor-copy items-center rounded-md border border-border/70 bg-surface-soft px-2 font-mono text-[11px] font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
								>
									{assetTag}
								</button>
							)}
							<Badge variant="secondary" className="h-6 rounded-md px-2 text-[11px]">
								{getAssetTypeLabel(asset.type)}
							</Badge>
							{isComputeDeviceType(asset.type) && getMetadataString(asset.metadata, "build_mode") ? (
								<Badge variant="outline" className="h-6 rounded-md px-2 text-[11px]" title="装机方式">
									{getBuildModeLabel(getMetadataString(asset.metadata, "build_mode"))}
								</Badge>
							) : null}
							<StatusBadge status={asset.status || "active"} internet={asset.type === "internet"} />
						</div>
					</div>
					{readOnly ? null : (
						<div className="ms-auto flex min-w-0 shrink-0 items-center gap-1.5">
							<Button
								variant="outline"
								size="sm"
								className="h-9 min-h-9 text-destructive hover:text-destructive"
								onClick={() => {
									deleteAsset().catch((error) => console.error("delete asset", error))
								}}
							>
								<Trash2Icon data-icon="inline-start" className="size-3.5" />
								删除资产
							</Button>
						</div>
					)}
				</div>
				<div className="mt-3 flex min-w-0 items-center justify-between gap-3 border-t border-border/70 pt-3">
					<AssetShowcaseTags asset={asset} />
					{readOnly ? null : (
						<div className="flex shrink-0 items-center gap-1.5">
							{/* 2026-10-12 用户拍板：去掉头部「编辑连接」——连接信息已并入网络组的「连接的设备」；
							    网络设备的连接管理仍从网络详情卡的「编辑连接」进入 */}
							<Button
								variant="outline"
								size="sm"
								className="h-5 min-h-5 shrink-0 gap-1 rounded-md px-1.5 text-[11px]"
								onClick={() => setProfileEditOpen(true)}
							>
								<PencilIcon data-icon="inline-start" className="size-2.5" />
								编辑
							</Button>
						</div>
					)}
				</div>
			</section>

			<div className="grid items-start pulse-card-gap xl:grid-cols-[minmax(22rem,0.72fr)_minmax(0,1.6fr)] 2xl:grid-cols-[minmax(24rem,0.68fr)_minmax(0,1.65fr)]">
				{/* 左：图片 + 基本信息 */}
				<aside className="grid content-start gap-3 xl:sticky xl:top-4">
					<section className="rounded-lg border border-border/70 bg-card p-3">
						<div className="mb-2 flex items-center justify-between gap-2">
							<div className="flex items-center gap-1.5">
								<div className="text-sm font-semibold text-foreground">图片</div>
								{assetMedia.covers.length + assetMedia.gallery.length > 0 ? (
									<Badge variant="outline" className="px-1.5">
										共 {assetMedia.covers.length + assetMedia.gallery.length} 张
									</Badge>
								) : null}
							</div>
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="h-8 shrink-0"
								onClick={() => setMediaManagerOpen(true)}
							>
								<ImagesIcon data-icon="inline-start" className="size-3.5" />
								图片管理
							</Button>
						</div>
						<AssetMediaShowcase covers={assetMedia.covers} gallery={assetMedia.gallery} />
					</section>
					<AssetOverviewColumn
						sections={identitySections}
						title="基本信息"
						actions={
							readOnly ? null : (
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="h-8 shrink-0"
									onClick={() => setHardwareProfileEditOpen(true)}
								>
									<PencilIcon data-icon="inline-start" className="size-3.5" />
									编辑
								</Button>
							)
						}
					/>
				</aside>

				{/* 中栏：与详情页同构（2026-10-11 用户拍板两页同一布局，编辑页只是多编辑入口）——
				    网络详情卡（网络设备，卡头编辑能力+其他连接段编辑连接）→ 配件清单 → 参数卡（硬件档案同款两列小卡） */}
				<div className="grid min-w-0 content-start gap-3">
					{networkDetailModel ? (
						<AssetNetworkDetailTable
							model={networkDetailModel}
							actions={
								readOnly ? null : (
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="h-8 shrink-0"
										onClick={() =>
											setCapabilityEdit({
												groupId: "network-capability",
												groupTitle: "网络能力",
											})
										}
									>
										<PencilIcon data-icon="inline-start" className="size-3.5" />
										编辑
									</Button>
								)
							}
							extraSection={
								<AssetConnectionTable
									bare
									onlyExternal
									title="其他连接"
									asset={asset}
									interfaces={safeInterfaces}
									relations={safeRelations}
									assets={safeAssets}
									actions={
										readOnly ? null : (
											<Button
												type="button"
												variant="outline"
												size="sm"
												className="h-8 shrink-0"
												onClick={() => setConnectionManagerOpen(true)}
											>
												<PencilIcon data-icon="inline-start" className="size-3.5" />
												编辑连接
											</Button>
										)
									}
								/>
							}
						/>
					) : null}

					{/* 配件清单卡：自组装（build_mode=diy）专属（docs/pc-asset-design.md 四） */}
					<AssetComponentListCard asset={asset} readOnly={readOnly} />

					{/* 参数卡：与详情页同款 AssetHardwareSpecsColumn；
					    2026-10-14 参数获取下线：卡头「Agent 填写参数」——粘贴参数文本一次分类，
					    勾选写入全部分组，完成出报告 */}
					<AssetHardwareSpecsColumn
						groups={parameterGroups}
						title={isServiceAssetType(asset.type) ? "服务档案" : "硬件档案"}
						description={isServiceAssetType(asset.type) ? "按服务类别整理的已确认信息" : undefined}
						emptyLabel="还没有确认的参数。点「Agent 填写参数」粘贴参数文本自动分类填写，或在各组里手动填写。"
						headerAction={
							readOnly ? null : (
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="h-7 shrink-0 gap-1.5"
									onClick={() => {
										setAgentFillPhase("idle")
										setAgentFillError("")
										setAgentFillOpen(true)
									}}
									disabled={agentFillPhase === "working"}
								>
									<SparklesIcon data-icon="inline-start" className="size-3" />
									Agent 填写参数
								</Button>
							)
						}
						groupActions={Object.fromEntries(
							parameterGroups.map((group) => [
								group.title,
								readOnly ? null : (
									<Button
										key={group.id}
										type="button"
										variant="outline"
										size="sm"
										className="h-7 shrink-0"
										onClick={() => setGroupEdit({ groupId: group.id, groupTitle: group.title })}
									>
										编辑
									</Button>
								),
							])
						)}
					/>
				</div>
			</div>

			{/* 图片管理弹窗：图片工作台（图片库/收集图片）；顺序调整与封面设置收进图片卡片与右侧预览 */}
			<Dialog open={mediaManagerOpen} onOpenChange={setMediaManagerOpen}>
				<DialogContent className="h-[800px] max-h-[85dvh] max-w-6xl grid grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0 gap-0">
					<DialogHeader className="px-5 pt-5 sm:px-6">
						<DialogTitle>图片管理</DialogTitle>
					</DialogHeader>
					<AssetEditVisualPanel
						assetId={asset.id}
						assetName={asset.name}
						assetVendor={asset.vendor}
						assetType={asset.type}
						assetBuildMode={getMetadataString(asset.metadata, "build_mode")}
						defaultMediaPreview={getAssetMediaDefaultPreview(assetMedia.covers, undefined)}
						readOnly={readOnly}
					/>
				</DialogContent>
			</Dialog>

			{/* 设备档案编辑弹窗：完整主档表单 */}
			<Dialog open={profileEditOpen} onOpenChange={setProfileEditOpen}>
				{/* 2026-10-20 用户拍板：基本信息弹窗收到 672px（max-w-2xl），与详情页一致 */}
				<DialogContent
					className="max-h-[88dvh] w-full max-w-2xl overflow-y-auto sm:p-5"
					onInteractOutside={(event) => event.preventDefault()}
				>
					<DialogHeader className="gap-1 border-b border-border/70 pb-3">
						<DialogTitle>编辑通用档案</DialogTitle>
					</DialogHeader>
					<AssetProfileEditForm
						asset={asset}
						assets={safeAssets}
						locations={state.locations}
						readOnly={readOnly}
						onSaveProfile={saveAssetProfile}
					/>
					<DialogFooter className="border-t border-border/70 pt-3">
						<Button variant="outline" onClick={() => setProfileEditOpen(false)} disabled={saving}>
							取消
						</Button>
						<Button onClick={submitProfileForm} disabled={saving || readOnly}>
							{saving ? "保存中" : "保存档案"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* 设备档案编辑弹窗：型号/内部型号/厂商/官网 */}
			<Dialog open={hardwareProfileEditOpen} onOpenChange={setHardwareProfileEditOpen}>
				{/* 2026-10-20 用户拍板：基本信息弹窗收到 672px（max-w-2xl），与详情页一致 */}
				<DialogContent
					className="max-h-[88dvh] w-full max-w-2xl overflow-y-auto sm:p-5"
					onInteractOutside={(event) => event.preventDefault()}
				>
					<DialogHeader className="gap-1 border-b border-border/70 pb-3">
						<DialogTitle>编辑基本信息</DialogTitle>
					</DialogHeader>
					<AssetHardwareIdentityEditForm
						asset={asset}
						readOnly={readOnly}
						saving={saving}
						onSave={saveHardwareIdentity}
					/>
					<DialogFooter className="border-t border-border/70 pt-3">
						<Button variant="outline" onClick={() => setHardwareProfileEditOpen(false)} disabled={saving}>
							取消
						</Button>
						<Button
							onClick={() => {
								const form = document.getElementById(ASSET_HARDWARE_IDENTITY_EDIT_FORM_ID)
								if (form instanceof HTMLFormElement) form.requestSubmit()
							}}
							disabled={saving || readOnly}
						>
							{saving ? "保存中" : "保存档案"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* 2026-10-14 参数填写 Agent 弹窗——粘贴文本 → AI 分类 → 勾选写入 → 完成报告 */}
			<Dialog open={agentFillOpen} onOpenChange={setAgentFillOpen}>
				<DialogContent className="max-h-[88dvh] w-full max-w-4xl overflow-y-auto">
					<DialogHeader className="gap-1 border-b border-border/70 pb-3">
						<DialogTitle>Agent 填写参数</DialogTitle>
					</DialogHeader>
					{agentFillPhase === "idle" || agentFillPhase === "working" ? (
						<div className="grid content-start gap-3">
							<Textarea
								value={agentFillText}
								onChange={(event) => setAgentFillText(event.target.value)}
								placeholder={
									"一行一个参数（参数名 + Tab / 空格 / 冒号 + 值），例如：\n品牌\t铭凡 (Minisforum)\n型号\tUM690\nCPU 型号\tAMD 锐龙 9 6900HX\n内存\t32GB DDR5 5600MHz\n硬盘\t1TB NVMe SSD"
								}
								className="min-h-48 text-sm"
								disabled={agentFillPhase === "working" || readOnly}
							/>
							<div className="flex items-center gap-2">
								<Button
									type="button"
									onClick={() => runAgentFill()}
									disabled={agentFillPhase === "working" || readOnly}
								>
									{agentFillPhase === "working" ? (
										<Loader2Icon data-icon="inline-start" className="size-4 animate-spin" />
									) : (
										<SparklesIcon data-icon="inline-start" className="size-4" />
									)}
									{agentFillPhase === "working" ? "识别中…" : "开始填写"}
								</Button>
								{agentFillPhase === "working" ? (
									<span className="text-xs text-muted-foreground">
										正在读取文本并匹配参数：常见参数本地直接识别，只有不确定的才交给 AI。
										{agentFillElapsed > 0 ? ` 已用 ${agentFillElapsed} 秒` : ""}
									</span>
								) : (
									<span className="text-xs text-muted-foreground">
										支持「参数名 + Tab / 空格 / 冒号 + 值」，也可直接粘贴参数页文字。
									</span>
								)}
							</div>
						</div>
					) : agentFillPhase === "error" ? (
						<div className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
							{agentFillError}
							<div className="mt-3 flex justify-center gap-2">
								<Button type="button" variant="outline" onClick={() => setAgentFillPhase("idle")} className="h-8">
									返回修改文本
								</Button>
								<Button type="button" variant="outline" onClick={() => runAgentFill()} className="h-8">
									重试
								</Button>
							</div>
						</div>
					) : agentFillPhase === "done" ? (
						<div className="grid content-start gap-2">
							<div className="flex items-center gap-2 text-sm font-medium text-foreground">
								<CheckIcon className="size-4 text-primary" />
								已完成：共写入 {agentFillCandidates.filter((c) => agentFillChecked.has(c.field)).length} 项参数
							</div>
							<div className="grid content-start gap-1 rounded-md border border-border/70 bg-surface-soft p-2.5">
								{agentFillReport.map(({ category, count }) => (
									<div key={category} className="flex items-center justify-between text-xs">
										<span className="text-muted-foreground">
											{getAssetParameterCategoryTitle(asset?.type ?? "custom", category)}
										</span>
										<span className="font-medium text-foreground">写入 {count} 项</span>
									</div>
								))}
								{agentFillCandidates.length - agentFillChecked.size > 0 ? (
									<div className="flex items-center justify-between border-t border-border/70 pt-1 text-xs">
										<span className="text-muted-foreground">未勾选跳过</span>
										<span className="font-medium text-foreground">
											{agentFillCandidates.length - agentFillChecked.size} 项
										</span>
									</div>
								) : null}
							</div>
							{agentFillUnrecognized.length > 0 ? (
								<div className="grid content-start gap-1 rounded-md border border-dashed border-border/70 p-2.5">
									<div className="text-xs font-semibold text-muted-foreground">
										以下 {agentFillUnrecognized.length} 项无法分类，未写入：
									</div>
									{agentFillUnrecognized.map((item) => (
										<div key={item.name} className="flex items-baseline gap-2 text-xs">
											<span className="shrink-0 text-muted-foreground">{item.name}</span>
											<span className="min-w-0 truncate text-foreground">{item.value}</span>
										</div>
									))}
								</div>
							) : null}
							<DialogFooter>
								<Button type="button" onClick={() => setAgentFillOpen(false)}>
									完成
								</Button>
							</DialogFooter>
						</div>
					) : (
						<div className="grid content-start gap-2">
							<div className="text-[11px] text-muted-foreground">
								共识别 {agentFillCandidates.length} 项参数
								{agentFillProfile.length > 0 ? ` · 基本信息 ${agentFillProfile.length} 项` : ""} ·{" "}
								{Object.keys(groupedFullCandidates).length} 个分组 · 已勾选 {agentFillChecked.size} 项
							</div>
							{agentFillProfile.length > 0 ? (
								<section className="grid content-start gap-1 rounded-md border border-border/70 bg-card p-2">
									<div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-muted-foreground">
										<span>基本信息</span>
										<span className="font-normal">来自粘贴文本，不写入参数</span>
									</div>
									{agentFillProfile.map((item) => (
										<div key={item.field} className="flex items-baseline gap-2 text-xs">
											<span className="w-16 shrink-0 text-muted-foreground">{item.label}</span>
											<span className="min-w-0 truncate font-medium text-foreground">{item.value}</span>
										</div>
									))}
								</section>
							) : null}
							{Object.entries(groupedFullCandidates).map(([category, list]) => (
								<section
									key={category}
									className="grid content-start gap-1 rounded-md border border-border/70 bg-surface-soft p-2"
								>
									<div className="text-[11px] font-semibold text-muted-foreground">
										{`${getAssetParameterCategoryTitle(asset?.type ?? "custom", category)}（${list.length}）`}
									</div>
									<div className="grid content-start gap-1">
										{list.map((candidate) => {
											const checked = agentFillChecked.has(candidate.field)
											const definition = getAssetArchiveField(candidate.field)
											const isCustom = !definition
											return (
												<div
													key={candidate.field}
													className={cn(
														"flex w-full items-center gap-2 rounded-md border border-border/70 bg-card px-2 py-1.5 text-xs transition-colors",
														checked ? "border-primary/50 bg-primary/5" : ""
													)}
												>
													<button
														type="button"
														aria-label={checked ? `取消选择 ${candidate.label}` : `选择 ${candidate.label}`}
														aria-pressed={checked}
														onClick={() => toggleAgentFillChecked(candidate.field)}
														className="shrink-0"
													>
														<span
															aria-hidden
															className={cn(
																"grid size-4 place-items-center rounded border",
																checked && "border-primary bg-primary text-primary-foreground",
																!checked && "border-border/70 bg-card"
															)}
														>
															{checked && <CheckIcon className="size-3" />}
														</span>
													</button>
													<span
														className="w-36 shrink-0 truncate text-muted-foreground"
														title={formatAgentCandidateLabel(candidate.label)}
													>
														{formatAgentCandidateLabel(candidate.label)}
													</span>
													<Input
														value={candidate.value}
														onChange={(event) =>
															updateAgentFillCandidate(candidate.field, { value: event.target.value })
														}
														disabled={readOnly || agentFillWriting}
														className="h-7 min-w-0 flex-1 text-xs"
													/>
													{isCustom ? (
														<select
															aria-label={`${candidate.label} 所属分组`}
															value={candidate.category}
															onChange={(event) =>
																updateAgentFillCandidate(candidate.field, {
																	category: event.target.value as AssetParameterAgentCandidate["category"],
																})
															}
															disabled={readOnly || agentFillWriting}
															className="h-7 w-28 shrink-0 rounded-md border border-input bg-card px-1.5 text-[11px]"
														>
															{agentCategoryOptions.map((option) => (
																<option key={option.id} value={option.id}>
																	{getAssetParameterCategoryTitle(asset?.type ?? "custom", option.id)}
																</option>
															))}
														</select>
													) : null}
												</div>
											)
										})}
									</div>
								</section>
							))}
							{agentFillUnrecognized.length > 0 ? (
								<section className="grid content-start gap-1 rounded-md border border-dashed border-border/70 p-2">
									<div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold text-muted-foreground">
										<span>无法分类的参数（{agentFillUnrecognized.length} 项，未写入）</span>
										<Button
											type="button"
											variant="outline"
											size="sm"
											className="h-6 min-h-6 px-2 text-[11px]"
											disabled={agentFillWriting || readOnly}
											onClick={() =>
												moveUnrecognizedToUncategorized().catch((error) =>
													console.error("move unrecognized to uncategorized", error)
												)
											}
										>
											放入未分类
										</Button>
									</div>
									{agentFillUnrecognized.map((item) => (
										<div key={item.name} className="flex items-baseline gap-2 text-xs">
											<span className="shrink-0 text-muted-foreground">{item.name}</span>
											<span className="min-w-0 truncate text-foreground">{item.value}</span>
										</div>
									))}
								</section>
							) : null}
							{agentFillError ? (
								<div className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-[11px] text-destructive">
									<span className="min-w-0 flex-1 break-words">{agentFillError}</span>
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="h-7"
										disabled={agentFillWriting || agentFillChecked.size === 0}
										onClick={() => writeAgentFillSelections()}
									>
										重试写入
									</Button>
								</div>
							) : null}
							<DialogFooter>
								<Button variant="outline" onClick={() => setAgentFillOpen(false)} disabled={agentFillWriting}>
									取消
								</Button>
								<Button
									type="button"
									onClick={() => writeAgentFillSelections()}
									disabled={agentFillChecked.size === 0 || agentFillWriting || readOnly}
								>
									{agentFillWriting ? "写入中…" : `写入所选（${agentFillChecked.size}）`}
								</Button>
							</DialogFooter>
						</div>
					)}
				</DialogContent>
			</Dialog>
			<AssetConnectionManagerDialog
				open={connectionManagerOpen}
				onOpenChange={setConnectionManagerOpen}
				asset={asset}
				interfaces={safeInterfaces}
				allInterfaces={safeAllInterfaces}
				relations={safeRelations}
				assets={safeAssets}
				readOnly={readOnly}
				onChanged={() => loadDetail({ preserveContent: true })}
			/>
			{groupEdit && (
				<ParameterDebugBoundary>
					<AssetParameterGroupEditDialog
						open={Boolean(groupEdit)}
						onOpenChange={(open) => {
							if (!open) setGroupEdit(null)
						}}
						asset={asset}
						groupId={groupEdit.groupId}
						groupTitle={groupEdit.groupTitle}
						readOnly={readOnly}
						onSaved={() => loadDetail({ preserveContent: true })}
					/>
				</ParameterDebugBoundary>
			)}
			{capabilityEdit && (
				<AssetNetworkCapabilityEditDialog
					open={Boolean(capabilityEdit)}
					onOpenChange={(open) => {
						if (!open) setCapabilityEdit(null)
					}}
					asset={asset}
					groups={networkCapabilityEditTargets}
					onSaved={() => loadDetail({ preserveContent: true })}
				/>
			)}
		</div>
	)
}
