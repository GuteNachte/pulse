import { getPagePath } from "@nanostores/router"
import { useStore } from "@nanostores/react"
import {
	ArrowLeftIcon,
	EllipsisIcon,
	PencilIcon,
	PlusIcon,
	RadarIcon,
	RotateCcwIcon,
	SaveIcon,
	SparklesIcon,
	Trash2Icon,
} from "lucide-react"
import { memo, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react"
import { $router, Link, navigate } from "@/components/router"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
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
import { toast } from "@/components/ui/use-toast"
import { isPocketBaseAutoCancel, isReadOnlyUser, pb } from "@/lib/api"
import { pageTitle } from "@/lib/branding"
import { formatPocketBaseError } from "@/lib/pocketbase-error"
import { $systems } from "@/lib/stores"
import { cn } from "@/lib/utils"
import { getAssetIpLabel } from "./components/asset-card"
import { getAssetMediaDefaultPreview } from "./components/asset-media-default-preview"
import { isMonitorableAsset } from "./asset-list"
import {
	createAssetCustomGroupId,
	getAssetCustomGroups,
	getAssetGroupOrder,
	getAssetGroupTitle,
	getAssetGroupTitles,
	getAssetHiddenGroups,
	moveAssetCustomParam,
	removeAssetCustomGroup,
	toStorageGroupId,
} from "./asset-custom-groups"
import { AssetConnectionManagerDialog } from "./components/asset-connection-manager-dialog"
import { AssetEditVisualPanel } from "./components/asset-edit-visual-panel"
import { AssetParameterGroupEditDialog } from "./components/asset-parameter-group-edit-dialog"
import { AssetProfileEditForm, ASSET_PROFILE_EDIT_FORM_ID } from "./components/asset-profile-edit-form"
import { AssetShowcaseWorkspace } from "./components/asset-showcase-workspace"
import type { InternetAddressAutoRefreshSettings } from "./components/internet-address-auto-refresh-controls"
import { getAssetMediaRequestKey, subscribeAssetMediaChanged } from "./asset-media-events"
import { dedupeAssetMediaShowcaseVersions, filterWholeAlbumPlacements } from "./asset-media"
import { isAssetLocationNotApplicable } from "./asset-location"
import { getAssetFormSections, getMetadataString, getStatusLabel, isComputeDeviceType } from "./asset-schema"
import { ASSET_PARAMETER_CATEGORIES } from "./asset-parameter-registry"
import { getInternetAddressRefreshFeedback } from "./asset-internet-address-status"
import { createAssetDetailLoadGuard, type AssetDetailLoadToken } from "./asset-detail-load-guard"
import {
	applyAssetDetailPrimaryData,
	applyAssetDetailSecondaryData,
	emptyAssetDetailState,
	loadAssetDetailPrimaryData,
	loadAssetDetailSecondaryData,
	type AssetDetailState,
} from "./asset-detail-data"
import type {
	AITaskRecord,
	AssetChangeRecord,
	AssetEnrichmentReportRecord,
	AssetEnrichmentSuggestionRecord,
	AssetInterfaceRecord,
	AssetMonitorBindingRecord,
	AssetRecord,
	AssetRelationRecord,
	AssetVisualRecord,
} from "@/types"

// 2026-10-19 详情页编辑模式（用户方案）：查看模式默认纯净，右上角「连接/⋯更多/编辑」；
// 点编辑进入编辑模式——顶部变「取消/保存」，各模块出现自己的编辑按钮，弹窗改动即时生效并刷新，
// 右上角「保存」退出编辑模式。「⋯更多」收纳接入监控/导出/删除。

export default memo(function AssetDetailPage({ id }: { id: string }) {
	const [state, setState] = useState<AssetDetailState>(emptyAssetDetailState)
	const [assetMedia, setAssetMedia] = useState<{
		covers: { id: string; mediaId: string; version: string; url: string }[]
		gallery: { id: string; mediaId: string; version: string; url: string }[]
	}>({ covers: [], gallery: [] })
	const [loading, setLoading] = useState(true)
	const [internetAddressRefreshing, setInternetAddressRefreshing] = useState(false)
	const [connectionManagerOpen, setConnectionManagerOpen] = useState(false)
	// 详情页主数据只带当前资产；连接管理要选其他资产/接口，打开时再懒加载完整目录。
	const [connectionCatalog, setConnectionCatalog] = useState<{
		assets: AssetRecord[]
		interfaces: AssetInterfaceRecord[]
	} | null>(null)
	const [editing, setEditing] = useState(false)
	const [profileEditOpen, setProfileEditOpen] = useState(false)
	const [mediaEditOpen, setMediaEditOpen] = useState(false)
	const [groupEdit, setGroupEdit] = useState<{ groupId: string; groupTitle: string } | null>(null)
	const [saving, setSaving] = useState(false)
	const [moreMenuOpen, setMoreMenuOpen] = useState(false)
	const [monitorBinding, setMonitorBinding] = useState<AssetMonitorBindingRecord | null>(null)
	const [newGroupOpen, setNewGroupOpen] = useState(false)
	const [newGroupTitle, setNewGroupTitle] = useState("")
	const [restoreOpen, setRestoreOpen] = useState(false)
	const detailLoadGuardRef = useRef(createAssetDetailLoadGuard())
	const systems = useStore($systems)
	const readOnly = isReadOnlyUser()
	const asset = state.asset
	const hiddenGroupEntries = useMemo(() => {
		const metadata = asset?.metadata ?? {}
		return getAssetHiddenGroups(metadata).map((groupId) => ({
			id: groupId,
			title: getAssetGroupTitle(
				metadata,
				groupId,
				ASSET_PARAMETER_CATEGORIES.find((category) => category.id === groupId)?.title ??
					getAssetCustomGroups(metadata).find((group) => group.id === groupId)?.title ??
					groupId
			),
		}))
	}, [asset])

	useEffect(() => {
		loadDetail()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [id])

	useEffect(() => {
		if (!asset?.id) {
			setMonitorBinding(null)
			return
		}
		let ignore = false
		pb.collection<AssetMonitorBindingRecord>("asset_monitor_bindings")
			.getFirstListItem(`asset = "${asset.id}"`, { requestKey: null })
			.then((binding) => {
				if (!ignore) setMonitorBinding(binding)
			})
			.catch((error) => {
				if (!ignore && !isPocketBaseAutoCancel(error) && (error as { status?: number })?.status !== 404) {
					console.warn("load asset monitor binding", error)
				}
				if (!ignore) setMonitorBinding(null)
			})
		return () => {
			ignore = true
		}
	}, [asset?.id])

	async function loadDetail() {
		const loadToken = detailLoadGuardRef.current.begin(id)
		setLoading(true)
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
				applyAssetDetailPrimaryData(current, { asset: assetRecord, interfaces, allInterfaces, relations })
			)
			document.title = pageTitle(`${assetRecord.name} / 资产详情`)
			loadSecondaryDetailData(loadToken).catch((error) => console.error("load secondary asset detail", error))
		} catch (error) {
			if (!detailLoadGuardRef.current.isCurrent(loadToken)) return
			if (!isPocketBaseAutoCancel(error)) {
				console.error("load asset detail", error)
				toast({ title: "资产详情读取失败", description: "请检查资产是否存在。", variant: "destructive" })
			}
		} finally {
			if (detailLoadGuardRef.current.isCurrent(loadToken)) setLoading(false)
		}
	}

	function openConnectionManager() {
		setConnectionManagerOpen(true)
		Promise.all([
			pb.collection<AssetRecord>("assets").getFullList({ sort: "name", requestKey: null }),
			pb.collection<AssetInterfaceRecord>("asset_interfaces").getFullList({
				sort: "-primary,kind,name",
				requestKey: null,
			}),
		])
			.then(([assets, interfaces]) => setConnectionCatalog({ assets, interfaces }))
			.catch((error) => console.warn("load connection catalog", error))
	}

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
			if (!isPocketBaseAutoCancel(error)) console.warn("load secondary asset detail", error)
		}
	}

	// 图片展示数据：封面/画廊摆放位（画廊排序等编辑操作在编辑页图片卡完成）
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

	async function refreshInternetAddresses() {
		if (asset?.type !== "internet" || readOnly || internetAddressRefreshing) return
		setInternetAddressRefreshing(true)
		try {
			const result = await pb.send(`/api/pulse/assets/${asset.id}/internet-addresses/refresh`, { method: "POST" })
			await loadDetail()
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
			await loadDetail()
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

	// 编辑模式：模块弹窗保存时已即时写库并刷新，这里的「保存」只负责退出编辑模式；
	// 预留 form 提交形态，便于未来把未落库的草稿统一在这一步提交。
	function closeEditingDialogs() {
		setProfileEditOpen(false)
		setMediaEditOpen(false)
		setGroupEdit(null)
		setConnectionManagerOpen(false)
	}

	function exitEditing() {
		// 2026-10-20 用户报「所属网络选了不保存」：顶部「保存」只退出编辑模式，
		// 弹窗还开着时直接退出会丢掉弹窗里的选择——先要求处理弹窗，避免静默丢数据。
		if (profileEditOpen || mediaEditOpen || groupEdit || connectionManagerOpen) {
			toast({ title: "请先完成或取消当前弹窗", description: "弹窗里的修改需要点弹窗内的保存按钮。" })
			return
		}
		setEditing(false)
		closeEditingDialogs()
	}

	function cancelEditing() {
		setEditing(false)
		closeEditingDialogs()
	}

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
		const payload = {
			user: asset.user,
			name,
			type: targetType,
			status: (form.get("status")?.toString() as AssetRecord["status"] | undefined) || asset.status || "active",
			vendor: form.get("vendor")?.toString().trim() || asset.vendor || "",
			model: modelField !== null ? modelField.toString().trim() : asset.model || "",
			serial_number: serialField !== null ? serialField.toString().trim() : asset.serial_number || "",
			management_ip: asset.type === "internet" ? "" : managementIp,
			location: form.get("location")?.toString().trim() || "",
			role: form.get("role")?.toString().trim() || "",
			notes: form.get("notes")?.toString().trim() || "",
			metadata,
		}
		setSaving(true)
		try {
			await pb.collection("assets").update(asset.id, payload)
			await loadDetail()
			toast({ title: "基本信息已保存", description: name })
		} catch (error) {
			console.error("save asset profile", error)
			const description = formatPocketBaseError(error)
			toast({ title: "保存失败", description, variant: "destructive" })
		} finally {
			setSaving(false)
		}
	}

	async function updateAssetGroupMetadata(
		mutator: (metadata: Record<string, unknown>) => Record<string, unknown> | undefined,
		successTitle?: string
	) {
		if (!asset || readOnly) return false
		try {
			const current = await pb.collection("assets").getOne(asset.id)
			const metadata = mutator({ ...((current.metadata ?? {}) as Record<string, unknown>) })
			if (!metadata) return false
			await pb.collection("assets").update(asset.id, { metadata })
			await loadDetail()
			if (successTitle) toast({ title: successTitle })
			return true
		} catch (error) {
			console.error("update asset group metadata", error)
			const description = (error as { data?: { message?: string } })?.data?.message?.trim() || "请稍后重试。"
			toast({ title: "分组保存失败", description, variant: "destructive" })
			return false
		}
	}

	async function createAssetGroup(title: string) {
		const trimmed = title.trim()
		if (!trimmed) return
		const id = createAssetCustomGroupId()
		const ok = await updateAssetGroupMetadata((metadata) => ({
			...metadata,
			_custom_groups: [...getAssetCustomGroups(metadata), { id, title: trimmed }],
			_group_order: [...getAssetGroupOrder(metadata), id],
		}))
		// 新分组没有参数，直接打开分组编辑让用户添加
		if (ok) setGroupEdit({ groupId: id, groupTitle: trimmed })
	}

	async function submitNewGroup() {
		const title = newGroupTitle.trim()
		if (!title) return
		await createAssetGroup(title)
		setNewGroupOpen(false)
		setNewGroupTitle("")
	}

	function renameAssetGroup(groupId: string, title: string) {
		const trimmed = title.trim()
		if (!trimmed) return false
		const storageId = toStorageGroupId(groupId)
		return updateAssetGroupMetadata((metadata) => {
			const customGroups = getAssetCustomGroups(metadata)
			if (customGroups.some((group) => group.id === storageId)) {
				return {
					...metadata,
					_custom_groups: customGroups.map((group) => (group.id === groupId ? { ...group, title: trimmed } : group)),
				}
			}
			return {
				...metadata,
				_group_titles: { ...getAssetGroupTitles(metadata), [storageId]: trimmed },
			}
		}, "分组已重命名")
	}

	async function deleteAssetGroup(groupId: string) {
		const storageId = toStorageGroupId(groupId)
		await updateAssetGroupMetadata((metadata) => {
			const isCustom = getAssetCustomGroups(metadata).some((group) => group.id === storageId)
			if (isCustom) return removeAssetCustomGroup(metadata, storageId)
			return {
				...metadata,
				_hidden_groups: [...new Set([...getAssetHiddenGroups(metadata), storageId])],
			}
		}, "分组已删除")
	}

	async function restoreAssetGroup(groupId: string) {
		await updateAssetGroupMetadata(
			(metadata) => ({
				...metadata,
				_hidden_groups: getAssetHiddenGroups(metadata).filter((id) => id !== groupId),
			}),
			"分组已恢复"
		)
	}

	async function reorderAssetGroups(groupIds: string[]) {
		if (groupIds.length === 0) return
		const storageIds = groupIds.map(toStorageGroupId)
		await updateAssetGroupMetadata((metadata) => ({ ...metadata, _group_order: storageIds }))
	}

	async function moveAssetParam(key: string, fromGroupId: string, toGroupId: string) {
		if (!key || fromGroupId === toGroupId) return
		await updateAssetGroupMetadata(
			(metadata) => moveAssetCustomParam(metadata, key, fromGroupId, toGroupId),
			"参数已移动"
		)
	}

	async function deleteAsset() {
		if (!asset || readOnly) return
		if (!window.confirm(`确认删除资产「${asset.name}」？关联监控不会自动删除，但资产关系会失效。`)) return
		try {
			await pb.collection("assets").delete(asset.id)
			toast({ title: "资产已删除", description: asset.name })
			navigate(getPagePath($router, "assets"))
		} catch (error) {
			console.error("delete asset", error)
			toast({ title: "资产删除失败", description: "请稍后重试。", variant: "destructive" })
		}
	}

	function exportAssetInfo() {
		if (!asset) return
		try {
			const payload = { ...asset, metadata: { ...(asset.metadata ?? {}) } }
			delete (payload.metadata as Record<string, unknown>).fixed_ipv6
			const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
			const url = URL.createObjectURL(blob)
			const anchor = document.createElement("a")
			anchor.href = url
			anchor.download = `${asset.name || asset.id}.json`
			anchor.click()
			URL.revokeObjectURL(url)
			toast({ title: "资产信息已导出", description: "已下载 JSON 文件。" })
		} catch (error) {
			console.error("export asset info", error)
			toast({ title: "导出失败", description: "请稍后重试。", variant: "destructive" })
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
	const assetTag = getMetadataString(asset.metadata, "asset_tag")
	const system = systems.find((item) => item.asset === asset.id)
	const monitorable = isMonitorableAsset(asset)
	const monitorState = monitorBinding?.state ?? (monitorable ? "unbound" : "unsupported")
	const statusText =
		monitorState === "healthy"
			? "正常"
			: monitorState === "error"
				? "异常"
				: monitorState === "pending"
					? "待接入"
					: monitorState === "paused"
						? "已暂停"
						: monitorState === "unbound"
							? "未接入监控"
							: getStatusLabel(asset.status || "active")
	const statusDotClass =
		monitorState === "error"
			? "bg-red-500"
			: monitorState === "paused"
				? "bg-amber-500"
				: monitorState === "pending"
					? "bg-sky-500"
					: monitorState === "unbound"
						? "bg-zinc-400"
						: system?.status === "down"
							? "bg-red-500"
							: asset.status === "planned"
								? "bg-sky-500"
								: asset.status === "inactive"
									? "bg-zinc-400"
									: asset.status === "retired"
										? "bg-amber-500"
										: "bg-emerald-500"
	const ip = getAssetIpLabel(asset)
	const location = isAssetLocationNotApplicable(asset.type) ? "" : asset.location?.trim() || ""
	const monitorHref = monitorBinding
		? `${getPagePath($router, "monitoring")}?binding=${encodeURIComponent(monitorBinding.id)}`
		: monitorable
			? `${getPagePath($router, "monitoring")}?asset=${encodeURIComponent(asset.id)}&add=1`
			: ""
	const metaParts: ReactNode[] = [
		assetTag || "未编号",
		<span key="status" className="inline-flex items-center gap-1">
			<span className={cn("size-1.5 rounded-full", statusDotClass)} />
			{statusText}
		</span>,
		...(ip && ip !== "未填写" ? [ip] : []),
		...(location ? [location] : []),
	]
	return (
		<div className="grid pulse-card-gap">
			<section className="rounded-lg border border-border/70 bg-card px-3 py-2 shadow-none">
				<div className="flex min-w-0 items-center gap-2">
					<Button asChild variant="ghost" size="sm" className="size-8 shrink-0 px-0 text-muted-foreground">
						<Link href={getPagePath($router, "assets")} title="返回资产中心" aria-label="返回资产中心">
							<ArrowLeftIcon className="size-4" />
						</Link>
					</Button>
					<div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5">
						<h1 className="max-w-[min(26rem,60vw)] truncate text-xl font-semibold text-foreground">{asset.name}</h1>
						<div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0 text-xs text-muted-foreground">
							{metaParts.map((part, index) => (
								<span key={index} className="inline-flex min-w-0 items-center gap-1.5">
									{index > 0 ? <span className="text-muted-foreground/40">·</span> : null}
									<span className="max-w-[16rem] truncate">{part}</span>
								</span>
							))}
						</div>
					</div>
					<div className="ms-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">
						{readOnly ? null : editing ? (
							<>
								<Button asChild variant="outline" size="sm" className="h-8 gap-1.5 px-2.5">
									<Link href={`${getPagePath($router, "assetEdit", { id: asset.id })}?agent=1`}>
										<SparklesIcon className="size-3.5" />
										Agent 填写参数
									</Link>
								</Button>
								{hiddenGroupEntries.length > 0 ? (
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="h-8 gap-1.5 px-2.5"
										onClick={() => setRestoreOpen(true)}
									>
										<RotateCcwIcon className="size-3.5" />
										恢复隐藏分组（{hiddenGroupEntries.length}）
									</Button>
								) : null}
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="h-8 gap-1.5 px-2.5"
									onClick={() => {
										setNewGroupTitle("")
										setNewGroupOpen(true)
									}}
								>
									<PlusIcon className="size-3.5" />
									新建分组
								</Button>
								<Button variant="outline" size="sm" className="h-8 px-2.5" onClick={cancelEditing}>
									取消
								</Button>
								<Button size="sm" className="h-8 gap-1.5 px-2.5" onClick={exitEditing}>
									<SaveIcon className="size-3.5" />
									保存
								</Button>
							</>
						) : (
							<>
								<DropdownMenu open={moreMenuOpen} onOpenChange={setMoreMenuOpen}>
									<DropdownMenuTrigger asChild>
										<Button variant="outline" size="sm" className="size-8 px-0" title="更多操作" aria-label="更多操作">
											<EllipsisIcon className="size-4" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end" className="min-w-36">
										{monitorHref ? (
											<DropdownMenuItem asChild>
												<Link href={monitorHref} className="gap-2">
													<RadarIcon className="size-3.5" />
													{monitorBinding ? "管理监控" : "接入监控"}
												</Link>
											</DropdownMenuItem>
										) : null}
										<DropdownMenuItem onSelect={() => exportAssetInfo()} className="gap-2">
											<SaveIcon className="size-3.5" />
											导出信息
										</DropdownMenuItem>
										<DropdownMenuItem
											onSelect={() => {
												setMoreMenuOpen(false)
												deleteAsset().catch((error) => console.error("delete asset", error))
											}}
											className="gap-2 text-destructive focus:text-destructive"
										>
											<Trash2Icon className="size-3.5" />
											删除设备
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
								<Button
									variant="outline"
									size="sm"
									className="size-8 px-0"
									title="编辑资产"
									aria-label="编辑资产"
									onClick={() => setEditing(true)}
								>
									<PencilIcon className="size-3.5" />
								</Button>
							</>
						)}
					</div>
				</div>
			</section>

			<AssetShowcaseWorkspace
				asset={asset}
				media={{ covers: assetMedia.covers, gallery: assetMedia.gallery }}
				assets={state.assets}
				interfaces={state.allInterfaces}
				allInterfaces={state.allInterfaces}
				relations={state.relations}
				readOnly={readOnly}
				editing={editing}
				onEditProfile={() => setProfileEditOpen(true)}
				onEditMedia={() => setMediaEditOpen(true)}
				onEditConnections={openConnectionManager}
				onEditGroup={(groupId, groupTitle) => setGroupEdit({ groupId, groupTitle })}
				onDeleteGroup={deleteAssetGroup}
				onReorderGroups={reorderAssetGroups}
				onMoveParam={moveAssetParam}
				internetAddressRefreshing={internetAddressRefreshing}
				onRefreshInternetAddresses={refreshInternetAddresses}
				onUpdateInternetAddressSettings={updateInternetAddressSettings}
			/>

			<AssetConnectionManagerDialog
				open={connectionManagerOpen}
				onOpenChange={setConnectionManagerOpen}
				asset={asset}
				interfaces={state.interfaces}
				allInterfaces={connectionCatalog?.interfaces ?? state.allInterfaces}
				relations={state.relations}
				assets={connectionCatalog?.assets ?? state.assets}
				readOnly={readOnly}
				onChanged={() => {
					loadDetail().catch((error) => console.error("reload asset detail", error))
				}}
			/>

			{profileEditOpen ? (
				<Dialog open onOpenChange={setProfileEditOpen}>
					{/* 2026-10-20 用户拍板：基本信息弹窗不需要整屏那么宽——两列表单收到 672px（max-w-2xl） */}
					<DialogContent
						className="max-h-[88dvh] w-full max-w-2xl overflow-y-auto sm:p-5"
						onInteractOutside={(event) => event.preventDefault()}
					>
						<DialogHeader className="gap-1 border-b border-border/70 pb-3">
							<DialogTitle>编辑基本信息</DialogTitle>
						</DialogHeader>
						<AssetProfileEditForm
							asset={asset}
							assets={state.assets}
							locations={state.locations}
							readOnly={readOnly}
							onSaveProfile={(event, extraMetadata) => {
								saveAssetProfile(event, extraMetadata)
									.then(() => setProfileEditOpen(false))
									.catch((error) => console.error("save asset profile", error))
							}}
						/>
						<DialogFooter className="border-t border-border/70 pt-3">
							<Button type="submit" form={ASSET_PROFILE_EDIT_FORM_ID} disabled={saving || readOnly}>
								保存
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			) : null}

			<Dialog open={mediaEditOpen} onOpenChange={setMediaEditOpen}>
				<DialogContent className="h-[800px] max-h-[85dvh] max-w-6xl grid grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0 gap-0">
					<DialogHeader className="px-5 pt-5 sm:px-6">
						<DialogTitle>编辑图片</DialogTitle>
					</DialogHeader>
					<AssetEditVisualPanel
						assetType={asset.type}
						assetId={asset.id}
						assetName={asset.name}
						assetVendor={asset.vendor}
						assetBuildMode={getMetadataString(asset.metadata, "build_mode")}
						defaultMediaPreview={getAssetMediaDefaultPreview(assetMedia.covers, undefined)}
						readOnly={readOnly}
					/>
				</DialogContent>
			</Dialog>

			{groupEdit ? (
				<AssetParameterGroupEditDialog
					open={Boolean(groupEdit)}
					onOpenChange={(open) => {
						if (!open) setGroupEdit(null)
					}}
					asset={asset}
					groupId={groupEdit.groupId}
					groupTitle={groupEdit.groupTitle}
					readOnly={readOnly}
					onRenameGroup={(title) => renameAssetGroup(groupEdit.groupId, title)}
					onSaved={() => {
						loadDetail().catch((error) => console.error("reload asset detail", error))
					}}
				/>
			) : null}

			<Dialog open={newGroupOpen} onOpenChange={setNewGroupOpen}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>新建分组</DialogTitle>
						<DialogDescription>新建后打开分组编辑，可直接添加参数。</DialogDescription>
					</DialogHeader>
					<Input
						value={newGroupTitle}
						onChange={(event) => setNewGroupTitle(event.target.value)}
						placeholder="例如 功能特性 / 扩展接口"
						autoFocus
					/>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => setNewGroupOpen(false)}>
							取消
						</Button>
						<Button
							type="button"
							onClick={() => {
								submitNewGroup().catch((error) => console.error("create asset group", error))
							}}
							disabled={!newGroupTitle.trim()}
						>
							创建
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={restoreOpen} onOpenChange={setRestoreOpen}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>恢复隐藏分组</DialogTitle>
						<DialogDescription>隐藏时参数数据没有删除，恢复后会重新显示。</DialogDescription>
					</DialogHeader>
					<div className="grid gap-1.5">
						{hiddenGroupEntries.map((group) => (
							<div
								key={group.id}
								className="flex items-center justify-between gap-2 rounded-md border border-border/70 px-2 py-1.5 text-xs"
							>
								<span className="min-w-0 truncate">{group.title}</span>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="h-6 min-h-6 px-2 text-[11px]"
									onClick={() => {
										restoreAssetGroup(group.id).catch((error) => console.error("restore asset group", error))
									}}
								>
									恢复
								</Button>
							</div>
						))}
					</div>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => setRestoreOpen(false)}>
							关闭
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
})
