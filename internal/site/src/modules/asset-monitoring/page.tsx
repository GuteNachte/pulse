import { useStore } from "@nanostores/react"
import { getPagePath } from "@nanostores/router"
import {
	ChevronDownIcon,
	ChevronRightIcon,
	ExternalLinkIcon,
	Globe2Icon,
	HardDriveIcon,
	PauseIcon,
	PlayIcon,
	PlusIcon,
	RadarIcon,
	RefreshCwIcon,
	SearchIcon,
	Trash2Icon,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { AddSystemDialog } from "@/components/add-system"
import { OperationConfirmDialog } from "@/components/operation-confirm-dialog"
import { $router, Link } from "@/components/router"
import SystemDetail from "@/components/routes/system"
import { MonitorDialog } from "@/components/routes/websites/monitor-dialog"
import { createMonitorFormFromEndpointAsset } from "@/components/routes/websites/asset-form"
import {
	buildTargetPayload,
	canLoadImage,
	getTargetURLSet,
	nextAvailableTargetKind,
	resolveFormIconURL,
	resolveIconURL,
	targetKindScope,
} from "@/components/routes/websites/target-utils"
import type { IconPreviewState, MonitorForm } from "@/components/routes/websites/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/use-toast"
import { useMobileLayout } from "@/components/mobile/mobile-ui"
import { isAdmin, isReadOnlyUser, pb } from "@/lib/api"
import { pageTitle } from "@/lib/branding"
import { $allSystemsById } from "@/lib/stores"
import { getSystemDisplayName } from "@/lib/system-roles"
import { cn } from "@/lib/utils"
import { getAssetIcon } from "@/modules/asset-center/components/asset-card"
import { getAssetTypeLabel } from "@/modules/asset-center/asset-schema"
import {
	countMonitoredBindings,
	filterMonitorItems,
	getAgentMetrics,
	getWebsiteMetrics,
	metricTone,
	splitMonitorItems,
	type MonitorStateFilter,
} from "./monitor-list"
import type {
	AssetMonitorListItem,
	AssetMonitorListResponse,
	AssetMonitorState,
	AssetRecord,
	SystemRecord,
	WebsiteMonitorRecord,
} from "@/types"
import { WebsiteMonitorDetail } from "./website-detail"
import { formatBytes, formatDateTime, toFixedFloat } from "@/lib/utils"

const STATE_LABELS: Record<AssetMonitorState, string> = {
	unbound: "未接入",
	pending: "待接入",
	healthy: "正常",
	error: "异常",
	paused: "已暂停",
	unsupported: "暂不支持",
}

const STATE_TONES: Record<AssetMonitorState, string> = {
	unbound: "border-border/70 bg-surface-soft text-muted-foreground",
	pending: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
	healthy: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	error: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
	paused: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
	unsupported: "border-border/60 bg-surface-soft text-muted-foreground/70",
}

export default function AssetMonitoringPage() {
	const systemsById = useStore($allSystemsById) as Record<string, SystemRecord>
	const readOnly = isReadOnlyUser()
	const admin = isAdmin()
	const { isMobile } = useMobileLayout()
	const [items, setItems] = useState<AssetMonitorListItem[]>([])
	const [counts, setCounts] = useState<AssetMonitorListResponse["counts"]>({
		total: 0,
		monitorable: 0,
		unbound: 0,
		pending: 0,
		healthy: 0,
		error: 0,
		paused: 0,
		unsupported: 0,
	})
	const [loading, setLoading] = useState(true)
	const [loadError, setLoadError] = useState("")
	const [search, setSearch] = useState("")
	const [stateFilter, setStateFilter] = useState<MonitorStateFilter>("all")
	const [providerFilter, setProviderFilter] = useState("all")
	const [unboundOpen, setUnboundOpen] = useState(false)
	const [selectedAssetId, setSelectedAssetId] = useState("")
	const [selectedAsset, setSelectedAsset] = useState<AssetRecord | null>(null)
	const [addSystemOpen, setAddSystemOpen] = useState(false)
	const [webAssets, setWebAssets] = useState<AssetRecord[]>([])
	const [webForm, setWebForm] = useState<MonitorForm | null>(null)
	const [webDialogOpen, setWebDialogOpen] = useState(false)
	const [webSaving, setWebSaving] = useState(false)
	const [iconPreview, setIconPreview] = useState<IconPreviewState>({ status: "idle", url: "" })
	const [deleteItem, setDeleteItem] = useState<AssetMonitorListItem | null>(null)
	const [deleting, setDeleting] = useState(false)
	const initialURLHandled = useRef(false)

	const selectedItem = useMemo(
		() => items.find((item) => item.asset.id === selectedAssetId) ?? null,
		[items, selectedAssetId]
	)
	// 2026-10-21 用户要求：点进资产监控默认看到的是「正在监控」的资产；
	// 未接入的收进底部折叠区，暂不支持的不再展示。
	const { monitored, unbound } = useMemo(() => splitMonitorItems(items), [items])
	const filteredMonitored = useMemo(
		() => filterMonitorItems(monitored, { search, stateFilter, providerFilter }),
		[monitored, providerFilter, search, stateFilter]
	)
	const filteredUnbound = useMemo(
		() => filterMonitorItems(unbound, { search, stateFilter, providerFilter }),
		[unbound, providerFilter, search, stateFilter]
	)
	const unboundView = stateFilter === "unbound"
	const mainItems = unboundView ? filteredUnbound : filteredMonitored
	const collapsedUnbound = unboundView ? [] : filteredUnbound

	useEffect(() => {
		document.title = pageTitle("资产监控")
	}, [])

	async function load(options: { silent?: boolean } = {}) {
		if (!options.silent) {
			setLoading(true)
			setLoadError("")
		}
		try {
			const response = await pb.send<AssetMonitorListResponse>("/api/pulse/asset-monitoring", { requestKey: null })
			setItems(response.items)
			setCounts(response.counts)
			setSelectedAssetId((current) => {
				if (current && response.items.some((item) => item.asset.id === current)) return current
				const next =
					response.items.find((item) => item.binding) ?? response.items.find((item) => item.state === "unbound")
				return next?.asset.id ?? ""
			})
		} catch (error) {
			console.error("load asset monitoring", error)
			if (!options.silent) setLoadError("资产监控数据加载失败，请稍后重试。")
		} finally {
			if (!options.silent) setLoading(false)
		}
	}

	useEffect(() => {
		load().catch((error) => console.error(error))
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// 2026-10-21 静默轮询：左侧预览的占用率与网速跟随 Agent 心跳持续更新，不闪加载态。
	useEffect(() => {
		const timer = window.setInterval(() => {
			load({ silent: true }).catch((error) => console.error(error))
		}, 15_000)
		return () => window.clearInterval(timer)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	useEffect(() => {
		if (!selectedAssetId) {
			setSelectedAsset(null)
			return
		}
		let ignore = false
		pb.collection<AssetRecord>("assets")
			.getOne(selectedAssetId, { requestKey: null })
			.then((asset) => {
				if (!ignore) setSelectedAsset(asset)
			})
			.catch((error) => console.error("load monitored asset", error))
		return () => {
			ignore = true
		}
	}, [selectedAssetId])

	useEffect(() => {
		if (initialURLHandled.current || loading || items.length === 0) return
		initialURLHandled.current = true
		const params = new URLSearchParams(window.location.search)
		const state = params.get("state") as MonitorStateFilter | null
		if (state && ["unbound", "pending", "healthy", "error", "paused"].includes(state)) {
			setStateFilter(state)
			if (state === "unbound") setUnboundOpen(true)
		}
		const provider = params.get("provider")
		if (provider === "agent" || provider === "website") setProviderFilter(provider)
		const assetParam = params.get("asset")
		const bindingParam = params.get("binding")
		const systemParam = params.get("system")
		const websiteParam = params.get("website")
		const target =
			items.find((item) => item.asset.id === assetParam) ??
			items.find((item) => item.binding?.id === bindingParam) ??
			items.find((item) => item.provider === "agent" && item.binding?.target_id === systemParam) ??
			items.find((item) => item.provider === "website" && item.summary?.system === systemParam) ??
			items.find((item) => item.provider === "website" && item.binding?.target_id === websiteParam)
		if (target) {
			setSelectedAssetId(target.asset.id)
			if (!target.binding) setUnboundOpen(true)
			if (params.get("add") === "1" && !target.binding) {
				setTimeout(() => openAddForItem(target), 0)
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [items, loading])

	async function loadWebAssets() {
		try {
			const assets = await pb.collection<AssetRecord>("assets").getFullList({
				filter: pb.filter("type = {:type}", { type: "web_endpoint" }),
				sort: "name",
				requestKey: null,
			})
			setWebAssets(assets)
		} catch (error) {
			console.error("load web endpoint assets", error)
		}
	}

	function openAddForItem(item: AssetMonitorListItem) {
		if (readOnly || !admin || item.binding) return
		if (item.provider === "agent") {
			setSelectedAssetId(item.asset.id)
			setAddSystemOpen(true)
			return
		}
		if (item.provider === "website") {
			setSelectedAssetId(item.asset.id)
			loadWebAssets()
				.then(async () => {
					const asset = await pb.collection<AssetRecord>("assets").getOne(item.asset.id, { requestKey: null })
					const nextForm = createMonitorFormFromEndpointAsset(asset, { system: "" })
					setWebForm(nextForm)
					setIconPreview({ status: "idle", url: nextForm.icon_url })
					setWebDialogOpen(true)
				})
				.catch((error) => console.error("open website monitor dialog", error))
		}
	}

	function updateURL(assetId: string) {
		const target = items.find((item) => item.asset.id === assetId)
		const query = new URLSearchParams()
		if (target?.binding) query.set("binding", target.binding.id)
		else query.set("asset", assetId)
		const next = `${getPagePath($router, "monitoring")}${query.toString() ? `?${query.toString()}` : ""}`
		window.history.replaceState({}, "", next)
	}

	function selectItem(item: AssetMonitorListItem) {
		setSelectedAssetId(item.asset.id)
		updateURL(item.asset.id)
	}

	async function toggleMonitoring(item: AssetMonitorListItem) {
		if (!item.binding || !admin) return
		try {
			if (item.binding.provider === "agent") {
				const nextStatus = item.state === "paused" ? "up" : "paused"
				await pb.collection("systems").update(item.binding.target_id, { status: nextStatus })
			} else {
				await pb.collection("website_monitors").update(item.binding.target_id, {
					enabled: item.state === "paused",
				})
			}
			await load()
		} catch (error) {
			console.error("toggle asset monitoring", error)
			toast({ title: "操作失败", variant: "destructive" })
		}
	}

	async function deleteBinding() {
		if (!deleteItem?.binding) return
		setDeleting(true)
		try {
			await pb.send(`/api/pulse/asset-monitoring/bindings/${deleteItem.binding.id}`, { method: "DELETE" })
			setDeleteItem(null)
			await load()
			toast({ title: "监控目标已删除", description: "资产资料保留，可以重新接入监控。" })
		} catch (error) {
			console.error("delete asset monitoring", error)
			toast({ title: "删除监控目标失败", description: "请稍后重试。", variant: "destructive" })
		} finally {
			setDeleting(false)
		}
	}

	function setFormWithSyncedIcon(nextForm: MonitorForm, syncIcon = false) {
		if (!syncIcon || nextForm.icon_source === "custom") {
			setWebForm(nextForm)
			return
		}
		const iconURL = resolveFormIconURL(nextForm)
		setWebForm({ ...nextForm, icon_url: iconURL })
		setIconPreview({ status: "idle", url: iconURL })
	}

	function changeWebAsset(assetId: string) {
		if (!webForm) return
		const asset = webAssets.find((item) => item.id === assetId)
		if (!asset) return
		const nextForm = createMonitorFormFromEndpointAsset(asset, {
			base: webForm,
			system: webForm.system,
			interval_seconds: webForm.interval_seconds,
			timeout_seconds: webForm.timeout_seconds,
			enabled: webForm.enabled,
		})
		setWebForm(nextForm)
		setIconPreview({ status: "idle", url: nextForm.icon_url })
	}

	function addWebTarget() {
		if (!webForm) return
		const nextKind = nextAvailableTargetKind(webForm.targets)
		setFormWithSyncedIcon(
			{
				...webForm,
				targets: [
					...webForm.targets,
					{
						id: nextKind,
						kind: nextKind,
						protocol: targetKindScope(nextKind) === "internal" ? "http://" : "https://",
						address: "",
					},
				],
			},
			true
		)
	}

	function removeWebTarget(index: number) {
		if (!webForm || webForm.targets.length <= 1) return
		setFormWithSyncedIcon(
			{ ...webForm, targets: webForm.targets.filter((_, currentIndex) => currentIndex !== index) },
			true
		)
	}

	async function fetchWebIcon() {
		if (!webForm) return
		const targetPayload = buildTargetPayload(webForm.targets)
		const { internalURL, externalURL, fallbackURL } = getTargetURLSet(targetPayload)
		const iconURL = resolveIconURL(webForm, internalURL, externalURL, fallbackURL)
		if (!iconURL) {
			setIconPreview({ status: "failed", url: "" })
			return
		}
		setIconPreview({ status: "loading", url: iconURL })
		if (await canLoadImage(iconURL)) {
			setWebForm({ ...webForm, icon_url: iconURL })
			setIconPreview({ status: "loaded", url: iconURL })
		} else {
			setIconPreview({ status: "failed", url: iconURL })
		}
	}

	async function saveNewWebsite() {
		if (!webForm) return
		const targetPayload = buildTargetPayload(webForm.targets)
		const { internalURL, externalURL, fallbackURL } = getTargetURLSet(targetPayload)
		const selected = webAssets.find((asset) => asset.id === webForm.asset)
		if (!selected || !webForm.name.trim() || !fallbackURL) {
			toast({ title: "请填写名称和至少一个 HTTP/HTTPS 地址", variant: "destructive" })
			return
		}
		setWebSaving(true)
		try {
			const iconURL = resolveIconURL(webForm, internalURL, externalURL, fallbackURL)
			const record = await pb.collection<WebsiteMonitorRecord>("website_monitors").create({
				user: pb.authStore.record?.id,
				system: webForm.system,
				asset: webForm.asset,
				name: webForm.name.trim(),
				description: webForm.description.trim(),
				internal_url: internalURL,
				external_url: externalURL,
				targets: JSON.stringify(targetPayload),
				expected_content: webForm.expected_content.trim(),
				icon_url: iconURL,
				url: fallbackURL,
				group: webForm.group.trim(),
				interval_seconds: Number(webForm.interval_seconds) || 300,
				timeout_seconds: Number(webForm.timeout_seconds) || 10,
				enabled: webForm.enabled,
				last_status: "unknown",
			})
			setWebDialogOpen(false)
			setWebForm(null)
			await pb.send(`/api/pulse/website-monitors/${record.id}/check`, { method: "POST" }).catch(() => undefined)
			await load()
			setSelectedAssetId(webForm.asset)
		} catch (error) {
			console.error("create website monitor", error)
			toast({ title: "保存失败", description: "请检查地址或权限。", variant: "destructive" })
		} finally {
			setWebSaving(false)
		}
	}

	const systemOptions = Object.values(systemsById).map((system) => ({
		id: system.id,
		name: getSystemDisplayName(system, system.name || system.id),
	}))
	const selectedBinding = selectedItem?.binding
	const canAdd = Boolean(
		selectedItem && !selectedItem.binding && selectedItem.state === "unbound" && !readOnly && admin
	)

	// 独立绑定信息条：网站 / 未接入资产与移动端 Agent 资产使用；桌面端 Agent 资产已并入系统详情头
	const renderBindingHeader = (item: AssetMonitorListItem) => (
		<section className="rounded-lg border border-border/70 bg-card p-3">
			<div className="flex min-w-0 flex-wrap items-start gap-2">
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<h2 className="truncate text-lg font-semibold">{item.asset.name}</h2>
						<StateBadge state={item.state} />
						<Badge variant="outline" className="text-[10px]">
							{item.provider === "agent" ? "Agent" : item.provider === "website" ? "网站" : "未支持"}
						</Badge>
					</div>
					<div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
						<span>{getAssetTypeLabel(item.asset.type)}</span>
						{selectedAsset?.model || item.asset.model ? (
							<span>型号 {selectedAsset?.model || item.asset.model}</span>
						) : null}
						{item.asset.management_ip ? <span>IP {item.asset.management_ip}</span> : null}
						{selectedBinding?.last_checked ? <span>最近 {formatTime(selectedBinding.last_checked)}</span> : null}
					</div>
					{selectedBinding?.last_error ? (
						<div className="mt-2 text-xs text-destructive">{selectedBinding.last_error}</div>
					) : null}
				</div>
				<div className="flex flex-wrap gap-1.5">
					<Button asChild variant="outline" size="sm" className="h-8 gap-1.5">
						<Link href={getPagePath($router, "asset", { id: item.asset.id })}>
							<ExternalLinkIcon className="size-3.5" />
							资产详情
						</Link>
					</Button>
					{selectedBinding && admin ? (
						<Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => toggleMonitoring(item)}>
							{item.state === "paused" ? <PlayIcon className="size-3.5" /> : <PauseIcon className="size-3.5" />}
							{item.state === "paused" ? "恢复" : "暂停"}
						</Button>
					) : null}
					{selectedBinding && admin ? (
						<Button
							variant="outline"
							size="sm"
							className="h-8 gap-1.5 text-destructive"
							onClick={() => setDeleteItem(item)}
						>
							<Trash2Icon className="size-3.5" />
							删除监控目标
						</Button>
					) : null}
					{canAdd ? (
						<Button size="sm" className="h-8 gap-1.5" onClick={() => openAddForItem(item)}>
							<PlusIcon className="size-3.5" />
							接入监控
						</Button>
					) : null}
				</div>
			</div>
		</section>
	)

	return (
		// 桌面端固定视口布局：应用壳已锁高（顶栏固定 + 内容区滚动），
		// 监控页占满内容区（h-full），概览条与左右两栏布局固定，仅右栏内部滚动。
		<div className="flex h-full flex-col pulse-card-gap lg:overflow-hidden">
			<section className="shrink-0 rounded-lg border border-border/70 bg-card px-3 py-3 shadow-none">
				<div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
					<div className="flex min-w-0 flex-wrap items-center gap-2.5">
						<div className="grid size-8 shrink-0 place-items-center rounded-md border border-border/70 bg-card text-muted-foreground">
							<RadarIcon className="size-4" />
						</div>
						<h1 className="shrink-0 text-lg font-semibold text-foreground">资产监控</h1>
						<section aria-label="资产监控概览" className="flex min-w-0 flex-wrap items-center gap-1.5">
							<StatPill label="监控中" value={countMonitoredBindings(counts)} />
							<StatPill label="正常" value={counts.healthy} tone="green" />
							<StatPill label="待接入" value={counts.pending} tone="sky" />
							<StatPill label="异常" value={counts.error} tone="red" />
							<StatPill label="已暂停" value={counts.paused} tone="amber" />
							<StatPill label="未接入" value={counts.unbound} tone="muted" />
						</section>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<Button asChild variant="outline" size="sm" className="h-8 min-h-8 gap-1.5">
							<Link href={getPagePath($router, "smart")}>
								<HardDriveIcon className="size-3.5" />
								硬盘健康
							</Link>
						</Button>
						<Button
							variant="outline"
							size="sm"
							className="h-8 min-h-8 gap-1.5"
							onClick={() => load()}
							disabled={loading}
						>
							<RefreshCwIcon className={cn("size-3.5", loading && "animate-spin")} />
							刷新
						</Button>
					</div>
				</div>
			</section>

			<div className="grid min-h-0 flex-1 pulse-card-gap lg:grid-cols-[22rem_minmax(0,1fr)]">
				{/* 左侧资产栏：外壳锁高后随布局固定，资产列表在栏内滚动 */}
				<aside className="flex min-h-[32rem] min-w-0 flex-col overflow-hidden rounded-lg border border-border/70 bg-card lg:min-h-0">
					<div className="grid gap-2 border-b border-border/70 p-3">
						<div className="relative">
							<SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
							<Input
								value={search}
								onChange={(event) => setSearch(event.target.value)}
								placeholder="搜索资产名称、型号、IP"
								className="h-9 pl-8"
							/>
						</div>
						<div className="flex flex-wrap gap-1">
							{(["all", "agent", "website"] as const).map((provider) => (
								<button
									key={provider}
									type="button"
									onClick={() => setProviderFilter(provider)}
									className={cn(
										"rounded px-2 py-1 text-[11px]",
										providerFilter === provider
											? "bg-surface-soft font-medium text-foreground"
											: "text-muted-foreground"
									)}
								>
									{provider === "all" ? "全部来源" : provider === "agent" ? "Agent" : "网站"}
								</button>
							))}
						</div>
						<div className="flex flex-wrap gap-1">
							{(["all", "unbound", "pending", "healthy", "error", "paused"] as const).map((state) => (
								<button
									key={state}
									type="button"
									onClick={() => setStateFilter(state)}
									className={cn(
										"rounded px-2 py-1 text-[11px]",
										stateFilter === state ? "bg-primary text-primary-foreground" : "text-muted-foreground"
									)}
								>
									{state === "all" ? "全部状态" : STATE_LABELS[state]}
								</button>
							))}
						</div>
					</div>
					<div className="min-h-0 flex-1 overflow-y-auto p-2">
						{loading ? (
							<div className="p-4 text-sm text-muted-foreground">正在加载资产监控…</div>
						) : loadError ? (
							<div className="p-4 text-sm text-destructive">{loadError}</div>
						) : mainItems.length === 0 ? (
							unboundView ? (
								<EmptyState
									loading={false}
									loadingText="正在加载资产监控"
									emptyText="没有未接入的可监控资产"
									description="所有可监控资产都已接入，或调整搜索与筛选。"
									className="min-h-48"
								/>
							) : monitored.length === 0 ? (
								<EmptyState
									loading={false}
									loadingText="正在加载资产监控"
									emptyText="还没有正在监控的资产"
									description="展开下方「未接入监控」选择资产接入，或到资产中心操作。"
									className="min-h-48"
								/>
							) : (
								<EmptyState
									loading={false}
									loadingText="正在加载资产监控"
									emptyText="没有符合条件的资产"
									description="可以调整搜索、来源或状态筛选。"
									className="min-h-48"
								/>
							)
						) : (
							<>
								{mainItems.map((item) => (
									<MonitorAssetRow
										key={item.asset.id}
										item={item}
										selected={item.asset.id === selectedAssetId}
										onSelect={() => selectItem(item)}
										onAdd={() => openAddForItem(item)}
										canAdd={!readOnly && admin && !item.binding && item.state === "unbound"}
									/>
								))}
								{!unboundView && collapsedUnbound.length > 0 ? (
									<div className="mb-1 mt-2 border-t border-border/60 pt-2">
										<button
											type="button"
											onClick={() => setUnboundOpen((value) => !value)}
											className="flex h-8 w-full items-center gap-1.5 rounded-md px-2 text-left text-xs text-muted-foreground transition-colors hover:bg-surface-soft"
										>
											{unboundOpen ? (
												<ChevronDownIcon className="size-3.5 shrink-0" />
											) : (
												<ChevronRightIcon className="size-3.5 shrink-0" />
											)}
											<span className="min-w-0 flex-1 truncate">未接入监控</span>
											<span className="shrink-0 font-mono text-[10px] tabular-nums">{collapsedUnbound.length}</span>
										</button>
										{unboundOpen
											? collapsedUnbound.map((item) => (
													<MonitorAssetRow
														key={item.asset.id}
														item={item}
														selected={item.asset.id === selectedAssetId}
														onSelect={() => selectItem(item)}
														onAdd={() => openAddForItem(item)}
														canAdd={!readOnly && admin}
													/>
												))
											: null}
									</div>
								) : null}
							</>
						)}
					</div>
				</aside>

				{/* 右栏内容区：内部滚动（页面不滚），头部块在滚动容器内吸顶 */}
				<main className="min-w-0 lg:min-h-0 lg:overflow-y-auto lg:pr-0.5">
					{selectedItem ? (
						<div className="grid gap-3">
							{selectedBinding?.provider === "agent" ? (
								// Agent 资产：绑定信息与操作并入系统详情头（移动端保留独立绑定条）
								<>
									{isMobile && selectedItem && renderBindingHeader(selectedItem)}
									<SystemDetail
										id={selectedBinding.target_id}
										embedded
										stickyTopClassName="top-0"
										titleOverride={selectedItem.asset.name}
										headerChips={
											<>
												<StateBadge state={selectedItem.state} />
												<Badge variant="outline" className="text-[10px]">
													{selectedItem.provider === "website" ? "网站" : "Agent"}
												</Badge>
												{selectedBinding?.last_error ? (
													<span
														title={selectedBinding.last_error}
														className="inline-flex h-6 max-w-[16rem] items-center truncate rounded-md border border-destructive/30 bg-card px-2 text-[11px] text-destructive"
													>
														{selectedBinding.last_error}
													</span>
												) : null}
											</>
										}
										metaChips={
											<>
												{selectedAsset?.model || selectedItem.asset.model ? (
													<div className="flex min-h-10 max-w-full items-center gap-1.5 rounded-md border border-border bg-card px-2 text-[11px] font-medium text-muted-foreground shadow-none">
														<span className="min-w-0">型号 {selectedAsset?.model || selectedItem.asset.model}</span>
													</div>
												) : null}
												{selectedBinding?.last_checked ? (
													<div
														title={`最近检查 ${formatTime(selectedBinding.last_checked)}`}
														className="flex min-h-10 max-w-full items-center gap-1.5 rounded-md border border-border bg-card px-2 text-[11px] font-medium text-muted-foreground shadow-none"
													>
														<span className="min-w-0">最近检查 {formatTimeCompact(selectedBinding.last_checked)}</span>
													</div>
												) : null}
											</>
										}
										primaryActions={
											<Button asChild variant="outline" size="sm" className="shrink-0 gap-1.5">
												<Link href={getPagePath($router, "asset", { id: selectedItem.asset.id })}>
													<ExternalLinkIcon className="size-3.5" />
													资产详情
												</Link>
											</Button>
										}
										moreMenuItems={
											selectedBinding && admin ? (
												<>
													<DropdownMenuItem asChild>
														<Link href={getPagePath($router, "system", { id: selectedBinding.target_id })}>
															<ExternalLinkIcon className="size-4" />
															在机器详情页打开
														</Link>
													</DropdownMenuItem>
													<DropdownMenuItem onClick={() => toggleMonitoring(selectedItem)}>
														{selectedItem.state === "paused" ? (
															<PlayIcon className="size-4" />
														) : (
															<PauseIcon className="size-4" />
														)}
														{selectedItem.state === "paused" ? "恢复监控" : "暂停监控"}
													</DropdownMenuItem>
													<DropdownMenuItem
														className="text-destructive focus:text-destructive"
														onClick={() => setDeleteItem(selectedItem)}
													>
														<Trash2Icon className="size-4" />
														删除监控目标
													</DropdownMenuItem>
												</>
											) : null
										}
									/>
								</>
							) : (
								<>
									{renderBindingHeader(selectedItem)}
									{selectedBinding?.provider === "website" ? (
										<WebsiteMonitorDetail
											monitorId={selectedBinding.target_id}
											readOnly={readOnly || !admin}
											onChanged={() => load()}
											onRequestDelete={() => setDeleteItem(selectedItem)}
										/>
									) : selectedItem.state === "unbound" ? (
										<UnboundPanel
											item={selectedItem}
											readOnly={readOnly}
											admin={admin}
											onAdd={() => openAddForItem(selectedItem)}
										/>
									) : (
										<div className="grid min-h-64 place-items-center rounded-lg border border-dashed border-border/70 bg-card p-6 text-center">
											<div className="max-w-md">
												<div className="font-medium">该资产暂不支持接入监控</div>
												<div className="mt-1 text-sm text-muted-foreground">
													当前只支持主机类资产的 Agent 监控和网站/服务资产的 HTTP 监控；网络设备与智能家居不在本期范围。
												</div>
											</div>
										</div>
									)}
								</>
							)}
						</div>
					) : (
						<EmptyState
							loading={loading}
							loadingText="正在加载资产监控"
							emptyText="请选择左侧资产"
							description="左侧会列出可监控资产、当前状态和最近检测时间。"
							className="min-h-72"
						/>
					)}
				</main>
			</div>

			<AddSystemDialog
				open={addSystemOpen}
				setOpen={(open) => {
					setAddSystemOpen(open)
					if (!open) {
						window.setTimeout(() => load().catch((error) => console.error(error)), 400)
					}
				}}
				initialAssetId={selectedItem?.asset.id ?? ""}
			/>

			{webForm ? (
				<MonitorDialog
					open={webDialogOpen}
					form={webForm}
					systems={systemOptions}
					assets={webAssets}
					saving={webSaving}
					iconPreview={iconPreview}
					onOpenChange={setWebDialogOpen}
					onFormChange={setWebForm}
					onIconPreviewChange={setIconPreview}
					onAssetChange={changeWebAsset}
					onSave={saveNewWebsite}
					onFetchIcon={fetchWebIcon}
					onAddTarget={addWebTarget}
					onRemoveTarget={removeWebTarget}
				/>
			) : null}

			<OperationConfirmDialog
				open={Boolean(deleteItem)}
				onOpenChange={(open) => !open && !deleting && setDeleteItem(null)}
				title="确认删除监控目标"
				description="删除后会停止接收监控数据，并删除该目标的历史指标、检测记录和告警历史；资产资料会保留，可重新接入。"
				confirmLabel="确认删除监控目标"
				confirmVariant="destructive"
				running={deleting}
				progressTitle="正在删除监控目标"
				progressDescription="正在删除 provider 记录、历史数据和监控绑定。"
				onConfirm={deleteBinding}
			>
				<div className="grid gap-1 text-sm">
					<div className="font-medium">{deleteItem?.asset.name}</div>
					<div className="text-muted-foreground">
						{deleteItem?.provider === "agent" ? "Agent 监控" : deleteItem?.provider === "website" ? "网站监控" : "监控"}
					</div>
				</div>
			</OperationConfirmDialog>
		</div>
	)
}

function MonitorAssetRow({
	item,
	selected,
	canAdd,
	onSelect,
	onAdd,
}: {
	item: AssetMonitorListItem
	selected: boolean
	canAdd: boolean
	onSelect: () => void
	onAdd: () => void
}) {
	const Icon = getAssetIcon(item.asset.type)
	const agentMetrics = getAgentMetrics(item)
	const websiteMetrics = getWebsiteMetrics(item)
	return (
		<div
			className={cn(
				"mb-1 flex w-full min-w-0 items-center gap-2 rounded-md border-l-2 px-2 py-2 transition-colors",
				selected ? "border-l-primary bg-primary/5" : "border-l-transparent hover:bg-surface-soft"
			)}
		>
			<button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-start gap-2 text-left">
				<span className="grid size-7 shrink-0 place-items-center rounded border border-border/70 bg-surface-soft text-muted-foreground">
					<Icon className="size-3.5" />
				</span>
				<span className="min-w-0 flex-1">
					<span className="block truncate text-sm font-medium">{item.asset.name}</span>
					<span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
						<StateBadge state={item.state} />
						<span className="truncate">
							{item.provider === "agent" ? "Agent" : item.provider === "website" ? "网站" : "—"}
						</span>
						{item.binding?.last_checked ? (
							<span className="truncate">{formatTime(item.binding.last_checked)}</span>
						) : null}
					</span>
					{agentMetrics ? (
						<span className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1.5">
							<MetricBar label="CPU" value={agentMetrics.cpu} />
							<MetricBar label="内存" value={agentMetrics.mem} />
							{agentMetrics.gpu !== null ? <MetricBar label="GPU" value={agentMetrics.gpu} /> : null}
							<MetricBar label="硬盘" value={agentMetrics.disk} />
						</span>
					) : null}
					{agentMetrics ? (
						<span className="mt-1.5 flex items-center gap-3 text-[11px] tabular-nums text-muted-foreground">
							<span title="实时上传速度">↑ {formatSpeed(agentMetrics.upload)}</span>
							<span title="实时下载速度">↓ {formatSpeed(agentMetrics.download)}</span>
						</span>
					) : null}
					{websiteMetrics ? (
						<span className="mt-0.5 block truncate text-[10px] tabular-nums text-muted-foreground">
							24h 可用率 {Math.round(websiteMetrics.uptime24h * 10) / 10}% · 延迟 {Math.round(websiteMetrics.latencyMs)}
							{" ms"}
						</span>
					) : null}
				</span>
			</button>
			{canAdd ? (
				<button
					type="button"
					onClick={onAdd}
					className="shrink-0 rounded border border-border/70 px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-surface-soft"
				>
					接入
				</button>
			) : null}
		</div>
	)
}

function MetricBar({ label, value }: { label: string; value: number }) {
	const clamped = Math.max(0, Math.min(100, value))
	const tone = metricTone(clamped)
	const toneClass = tone === "crit" ? "bg-red-500" : tone === "warn" ? "bg-amber-500" : "bg-emerald-500"
	return (
		<span className="flex min-w-0 items-center gap-1.5" title={`${label}占用 ${clamped.toFixed(1)}%`}>
			<span className="w-8 shrink-0 text-[11px] text-muted-foreground">{label}</span>
			<span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-soft">
				<span className={cn("block h-full rounded-full", toneClass)} style={{ width: `${clamped}%` }} />
			</span>
			<span className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums text-foreground">
				{Math.round(clamped)}%
			</span>
		</span>
	)
}

function formatSpeed(bytesPerSecond: number) {
	const speed = formatBytes(Math.max(0, bytesPerSecond), false, undefined, false)
	const rounded = toFixedFloat(speed.value, speed.value >= 10 ? 1 : 2)
	return `${rounded} ${speed.unit}/s`
}

function StateBadge({ state }: { state: AssetMonitorState }) {
	return (
		<span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-[10px]", STATE_TONES[state])}>
			{STATE_LABELS[state]}
		</span>
	)
}

function UnboundPanel({
	item,
	readOnly,
	admin,
	onAdd,
}: {
	item: AssetMonitorListItem
	readOnly: boolean
	admin: boolean
	onAdd: () => void
}) {
	const provider =
		item.provider === "agent" ? "Agent 主机监控" : item.provider === "website" ? "网站 HTTP 监控" : "监控"
	const isHost = item.provider === "agent"
	return (
		<div className="grid min-h-64 place-items-center rounded-lg border border-dashed border-border/70 bg-card p-6 text-center">
			<div className="max-w-md">
				<div className="mx-auto grid size-10 place-items-center rounded-md border border-border/70 bg-surface-soft text-muted-foreground">
					{isHost ? <Globe2Icon className="size-4" /> : <Globe2Icon className="size-4" />}
				</div>
				<div className="mt-3 font-medium">尚未接入监控</div>
				<div className="mt-1 text-sm text-muted-foreground">
					{isHost
						? "为该主机接入 Agent 后，可查看 CPU、内存、磁盘、网络、容器、S.M.A.R.T. 等完整数据。"
						: "为该网站资产接入 HTTP 监控后，可查看多地址可用性、响应时间和检测历史。"}
				</div>
				{readOnly || !admin ? (
					<div className="mt-3 text-xs text-muted-foreground">当前账号只能查看，不能接入监控。</div>
				) : (
					<Button className="mt-4" onClick={onAdd}>
						{provider}
					</Button>
				)}
			</div>
		</div>
	)
}

function StatPill({
	label,
	value,
	tone = "default",
}: {
	label: string
	value: number
	tone?: "default" | "muted" | "sky" | "green" | "red" | "amber"
}) {
	const toneClass =
		tone === "sky"
			? "text-sky-600 dark:text-sky-300"
			: tone === "green"
				? "text-emerald-600 dark:text-emerald-300"
				: tone === "red"
					? "text-red-600 dark:text-red-300"
					: tone === "amber"
						? "text-amber-600 dark:text-amber-300"
						: tone === "muted"
							? "text-muted-foreground"
							: "text-foreground"
	return (
		<span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/70 bg-card px-2.5">
			<span className="text-xs text-muted-foreground">{label}</span>
			<strong className={cn("font-mono text-sm font-semibold tabular-nums", toneClass)}>{value}</strong>
		</span>
	)
}

// PB 返回的是 UTC 原文，必须转本地时区显示（此前直接截字符串会把 UTC 当本地时间展示）
function formatTime(value: string) {
	if (!value) return ""
	return formatDateTime(value)
}

// 胶囊用的紧凑时间：今天只显示 HH:mm，跨天显示 MM-dd HH:mm；完整时间放 title 悬停
function formatTimeCompact(value: string) {
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return value || ""
	const now = new Date()
	const sameDay =
		date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
	const hm = date.toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit" })
	if (sameDay) return hm
	return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${hm}`
}
