import { getPagePath } from "@nanostores/router"
import { useStore } from "@nanostores/react"
import { memo, useEffect, useRef, useState } from "react"
import { ActiveAlerts } from "@/components/active-alerts"
import { MobileWebsitesPage, MobileWebsiteDetailSheet } from "@/components/mobile/mobile-websites"
import { useMobileLayout } from "@/components/mobile/mobile-ui"
import { OperationConfirmDialog } from "@/components/operation-confirm-dialog"
import { $router, Link } from "@/components/router"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { toast } from "@/components/ui/use-toast"
import { isReadOnlyUser, pb } from "@/lib/api"
import { pageTitle } from "@/lib/branding"
import { $allSystemsById } from "@/lib/stores"
import { getSystemDisplayName } from "@/lib/system-roles"
import type {
	AssetRecord,
	AssetRelationRecord,
	SystemRecord,
	WebsiteMonitorFailureCategory,
	WebsiteMonitorRecord,
} from "@/types"
import { WebsiteDetailPanel } from "./websites/detail-panel"
import { failureCategoryLabel, formatMonitorError } from "./websites/format"
import { hasMonitorCheckInputsChanged } from "./websites/monitor-save-utils"
import { MonitorDialog } from "./websites/monitor-dialog"
import { WebsiteMonitorListPanel } from "./websites/page-panels"
import {
	buildTargetPayload,
	canLoadImage,
	deriveFaviconURL,
	getTargetURLSet,
	inferIconSource,
	monitorTargetsForForm,
	nextAvailableTargetKind,
	resolveFormIconURL,
	resolveIconURL,
	normalizeOptionalURL,
	targetKindScope,
	splitURL,
} from "./websites/target-utils"
import type { IconPreviewState, MonitorForm, TargetKind, TargetScope } from "./websites/types"
import { createEmptyForm } from "./websites/types"
import { useWebsiteMonitorData } from "./websites/use-website-monitor-data"

export default memo(function Websites() {
	const systemsById = useStore($allSystemsById) as Record<string, SystemRecord>
	const [dialogOpen, setDialogOpen] = useState(false)
	const [form, setForm] = useState<MonitorForm>(createEmptyForm)
	const [saving, setSaving] = useState(false)
	const [runningId, setRunningId] = useState("")
	const [checkTarget, setCheckTarget] = useState<WebsiteMonitorRecord | null>(null)
	const [deleteTarget, setDeleteTarget] = useState<WebsiteMonitorRecord | null>(null)
	const [deletingId, setDeletingId] = useState("")
	const [iconPreview, setIconPreview] = useState<IconPreviewState>({ status: "idle", url: "" })
	const [mobileDetailOpen, setMobileDetailOpen] = useState(false)
	const [assets, setAssets] = useState<AssetRecord[]>([])
	const [assetsLoading, setAssetsLoading] = useState(true)
	const { isMobile } = useMobileLayout()
	const handledInitialAdd = useRef(false)
	const {
		monitors,
		statusCounts,
		availableSystemsById,
		systems,
		filteredMonitors,
		selected,
		selectedChecks,
		checksLoading,
		loadSelectedChecks,
		refreshMonitor,
		selectedTargets,
		selectedLatestChecks,
		selectedId,
		setSelectedId,
		loading,
		load,
		search,
		setSearch,
		statusFilter,
		setStatusFilter,
		systemFilter,
		setSystemFilter,
		page,
		pageSize,
		hasMore,
		setPage,
	} = useWebsiteMonitorData(systemsById)

	useEffect(() => {
		document.title = pageTitle("网站监控")
		setAssetsLoading(true)
		pb.collection<AssetRecord>("assets")
			.getFullList({ sort: "type,name", requestKey: null })
			.then((records) => setAssets(records.filter((asset) => asset.type === "web_endpoint")))
			.catch((error) => console.error("load website assets", error))
			.finally(() => setAssetsLoading(false))
	}, [])
	const readOnly = isReadOnlyUser()
	const hasWebEndpointAssets = assets.length > 0
	const waitingForAssets = assetsLoading && !hasWebEndpointAssets
	const showEmptyMonitorWorkspace = !loading && monitors.length === 0 && !assetsLoading

	useEffect(() => {
		if (handledInitialAdd.current || readOnly) {
			return
		}
		const params = new URLSearchParams(window.location.search)
		const requestedAsset = params.get("asset") ?? ""
		if (params.get("add") !== "1" && !requestedAsset) {
			return
		}
		const requestedSystem = params.get("system") ?? ""
		const system = systems.find((item) => item.id === requestedSystem) ?? systems[0]
		if (assetsLoading) {
			return
		}
		let cancelled = false
		async function openFromURL() {
			if (requestedAsset) {
				const asset = assets.find((item) => item.id === requestedAsset)
				if (!asset) {
					handledInitialAdd.current = true
					toast({
						title: "网页端点资产不可用",
						description: "URL 指向的资产不存在，或不是资产中心里的网页端点资产。",
						variant: "destructive",
					})
					return
				}
				handledInitialAdd.current = true
				setSystemFilter(system?.id || "")
				const existingMonitor = await findWebsiteMonitorByAsset(requestedAsset)
				if (cancelled) {
					return
				}
				if (existingMonitor) {
					setDialogOpen(false)
					await refreshMonitor(existingMonitor.id).catch(() => undefined)
					if (cancelled) {
						return
					}
					setSelectedId(existingMonitor.id)
					toast({
						title: "该网页端点已接入网站监控",
						description: "已为你打开现有监控，避免重复创建同一个资产的监控配置。",
					})
					return
				}
				const nextForm = createMonitorFormFromAsset(asset, { system: system?.id || "" })
				setForm(nextForm)
				setIconPreview({ status: "idle", url: nextForm.icon_url })
				setDialogOpen(true)
				return
			}
			const asset = assets[0]
			if (!asset) {
				handledInitialAdd.current = true
				toast({
					title: "请先添加网页端点资产",
					description: "网站监控需要从资产中心选择网页端点，避免监控对象游离在资产中心之外。",
					variant: "destructive",
				})
				return
			}
			handledInitialAdd.current = true
			setSystemFilter(system?.id || "")
			const nextForm = createMonitorFormFromAsset(asset, { system: system?.id || "" })
			setForm(nextForm)
			setIconPreview({ status: "idle", url: nextForm.icon_url })
			setDialogOpen(true)
		}
		openFromURL().catch((error) => {
			console.error("open website monitor from url", error)
			handledInitialAdd.current = true
			toast({ title: "读取网站监控失败", description: "无法确认该网页端点是否已接入监控。", variant: "destructive" })
		})
		return () => {
			cancelled = true
		}
	}, [assets, assetsLoading, readOnly, refreshMonitor, setSelectedId, setSystemFilter, systems])

	function openCreateDialog() {
		if (!assets.length) {
			toast({
				title: "请先添加网页端点资产",
				description: "网站监控需要从资产中心选择网页端点，避免监控对象游离在资产中心之外。",
				variant: "destructive",
			})
			return
		}
		const selectedSystem = systems.find((item) => item.id === (systemFilter || systems[0]?.id || ""))
		const nextForm = createMonitorFormFromAsset(assets[0], { system: selectedSystem?.id || "" })
		setForm(nextForm)
		setIconPreview({ status: "idle", url: nextForm.icon_url })
		setDialogOpen(true)
	}

	function selectMonitor(monitor: WebsiteMonitorRecord, openMobileDetail = false) {
		setSelectedId(monitor.id)
		if (openMobileDetail) {
			setMobileDetailOpen(true)
		}
	}

	const assetsPath = getPagePath($router, "assets")

	function openEditDialog(monitor: WebsiteMonitorRecord) {
		const internalURL = monitor.internal_url || monitor.url || ""
		const externalURL = monitor.external_url || ""
		const targets = monitorTargetsForForm(monitor)
		const iconSource = inferIconSource(monitor.icon_url, internalURL, externalURL)
		const nextForm = {
			id: monitor.id,
			system: monitor.system ?? "",
			asset: monitor.asset ?? "",
			name: monitor.name,
			description: monitor.description ?? "",
			targets,
			expected_content: monitor.expected_content ?? "",
			icon_source: iconSource,
			icon_url: monitor.icon_url || deriveFaviconURL(internalURL || externalURL),
			group: monitor.group ?? "",
			interval_seconds: monitor.interval_seconds || 300,
			timeout_seconds: monitor.timeout_seconds || 10,
			enabled: monitor.enabled,
		}
		setForm(nextForm)
		validateIconPreview(nextForm.icon_url)
		setDialogOpen(true)
	}

	async function saveMonitor() {
		const targetPayload = buildTargetPayload(form.targets)
		const { internalURL, externalURL, fallbackURL: checkURL } = getTargetURLSet(targetPayload)
		const selectedAsset = assets.find((asset) => asset.id === form.asset)
		if (!selectedAsset) {
			toast({
				title: "请选择网页端点资产",
				description: "网站监控必须绑定资产中心里的网页端点。",
				variant: "destructive",
			})
			return
		}
		if (selectedAsset.type !== "web_endpoint") {
			toast({
				title: "资产类型不正确",
				description: "网站监控只能绑定资产中心里的网页端点资产。",
				variant: "destructive",
			})
			return
		}
		if (!form.name.trim() || !checkURL) {
			toast({
				title: "信息不完整",
				description: "名称和至少一个 HTTP/HTTPS 地址必须填写。",
				variant: "destructive",
			})
			return
		}
		setSaving(true)
		try {
			const previousMonitor = form.id ? monitors.find((monitor) => monitor.id === form.id) : undefined
			const shouldCheckAfterSave =
				!form.id ||
				hasMonitorCheckInputsChanged(previousMonitor, targetPayload, form.interval_seconds, form.timeout_seconds)
			const iconURL = resolveIconURL(form, internalURL, externalURL, checkURL)
			const payload = {
				user: pb.authStore.record?.id,
				system: form.system,
				asset: form.asset,
				name: form.name.trim(),
				description: form.description.trim(),
				internal_url: internalURL,
				external_url: externalURL,
				targets: JSON.stringify(targetPayload),
				expected_content: form.expected_content.trim(),
				icon_url: iconURL,
				url: checkURL,
				group: form.group.trim(),
				interval_seconds: Number(form.interval_seconds) || 300,
				timeout_seconds: Number(form.timeout_seconds) || 10,
				enabled: form.enabled,
				last_status: form.id ? undefined : "unknown",
			}
			const record = form.id
				? await pb.collection<WebsiteMonitorRecord>("website_monitors").update(form.id, payload)
				: await pb.collection<WebsiteMonitorRecord>("website_monitors").create(payload)
			const syncedAsset = await syncWebEndpointAssetFromMonitor(selectedAsset, {
				internalURL,
				externalURL,
				checkURL,
			})
			if (syncedAsset) {
				setAssets((current) => current.map((asset) => (asset.id === syncedAsset.id ? syncedAsset : asset)))
			}
			await syncWebsiteMonitorHostedOnRelation(record, selectedAsset, form.system, systemsById, systems)
			setDialogOpen(false)
			setSelectedId(record.id)
			await load()
			if (shouldCheckAfterSave || record.last_status === "down") {
				await checkNow(record.id)
			}
		} catch (error) {
			console.error("save website monitor", error)
			toast({ title: "保存失败", description: "请检查地址或权限。", variant: "destructive" })
		} finally {
			setSaving(false)
		}
	}

	async function checkNow(id: string) {
		setRunningId(id)
		try {
			const response = await pb.send<WebsiteMonitorCheckResponse>(`/api/pulse/website-monitors/${id}/check`, {
				method: "POST",
			})
			await refreshMonitor(id)
			await loadSelectedChecks(id)
			toast(websiteMonitorCheckToast(response))
		} catch (error) {
			console.error("check website monitor", error)
			toast({ title: "检测失败", description: "Hub 无法访问该检测地址或请求超时。", variant: "destructive" })
		} finally {
			setRunningId("")
		}
	}

	async function toggleMonitor(monitor: WebsiteMonitorRecord) {
		try {
			await pb.collection("website_monitors").update(monitor.id, { enabled: !monitor.enabled })
			await load()
		} catch (error) {
			console.error("toggle website monitor", error)
			toast({ title: "操作失败", variant: "destructive" })
		}
	}

	async function deleteMonitor(monitor: WebsiteMonitorRecord) {
		setDeletingId(monitor.id)
		try {
			await pb.collection("website_monitors").delete(monitor.id)
			if (selectedId === monitor.id) {
				setSelectedId("")
			}
			setDeleteTarget(null)
			await load()
		} catch (error) {
			console.error("delete website monitor", error)
			toast({ title: "删除失败", variant: "destructive" })
		} finally {
			setDeletingId("")
		}
	}

	async function fetchIconURL() {
		const targetPayload = buildTargetPayload(form.targets)
		const { internalURL, externalURL, fallbackURL } = getTargetURLSet(targetPayload)
		const iconURL = resolveIconURL(form, internalURL, externalURL, fallbackURL)
		if (!iconURL) {
			toast({ title: "无法获取图标", description: "请先填写对应的网站地址。", variant: "destructive" })
			setIconPreview({ status: "failed", url: "" })
			return
		}
		setIconPreview({ status: "loading", url: iconURL })
		if (await canLoadImage(iconURL)) {
			setForm({ ...form, icon_url: iconURL })
			setIconPreview({ status: "loaded", url: iconURL })
			toast({ title: "已获取图标" })
		} else {
			setIconPreview({ status: "failed", url: iconURL })
			toast({ title: "获取失败", description: "该地址没有返回可用图标。", variant: "destructive" })
		}
	}

	function validateIconPreview(iconURL: string) {
		if (!iconURL) {
			setIconPreview({ status: "idle", url: "" })
			return
		}
		setIconPreview({ status: "loading", url: iconURL })
		canLoadImage(iconURL).then((ok) => {
			setIconPreview(ok ? { status: "loaded", url: iconURL } : { status: "failed", url: iconURL })
		})
	}

	function setFormWithSyncedIcon(nextForm: MonitorForm, syncIcon = false) {
		if (!syncIcon || nextForm.icon_source === "custom") {
			setForm(nextForm)
			return
		}
		const iconURL = resolveFormIconURL(nextForm)
		setForm({ ...nextForm, icon_url: iconURL })
		setIconPreview({ status: "idle", url: iconURL })
	}

	function changeAsset(assetId: string) {
		const asset = assets.find((item) => item.id === assetId)
		if (!asset) {
			setFormWithSyncedIcon({ ...form, asset: "" }, true)
			return
		}
		const nextForm = createMonitorFormFromAsset(asset, {
			base: form,
			system: form.system,
			interval_seconds: form.interval_seconds,
			timeout_seconds: form.timeout_seconds,
			enabled: form.enabled,
		})
		setForm(nextForm)
		setIconPreview({ status: "idle", url: nextForm.icon_url })
	}

	function addTarget() {
		const nextKind = nextAvailableTargetKind(form.targets)
		setFormWithSyncedIcon(
			{
				...form,
				targets: [
					...form.targets,
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

	function removeTarget(index: number) {
		if (form.targets.length <= 1) {
			return
		}
		const targets = form.targets.filter((_, currentIndex) => currentIndex !== index)
		setFormWithSyncedIcon({ ...form, targets }, true)
	}

	const content = (
		<div className="grid gap-4">
			{showEmptyMonitorWorkspace ? (
				<EmptyState
					loading={false}
					loadingText="正在加载网站监控"
					emptyText="暂未接入网站监控"
					description={
						hasWebEndpointAssets
							? "从资产中心已有的网页端点接入监控后，这里会显示可用性、响应时间和异常原因。"
							: "先在资产中心创建网页端点，再为它接入网站监控，确保监控对象始终归属资产主档。"
					}
					className="min-h-72 bg-card"
				>
					{!readOnly &&
						(hasWebEndpointAssets ? (
							<Button type="button" onClick={openCreateDialog}>
								接入网页端点
							</Button>
						) : (
							<Button asChild>
								<Link href={assetsPath}>前往资产中心</Link>
							</Button>
						))}
				</EmptyState>
			) : (
				<div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
					<WebsiteMonitorListPanel
						filteredMonitors={filteredMonitors}
						hasActiveFilter={Boolean(search.trim() || systemFilter || statusFilter !== "all")}
						selectedId={selected?.id}
						systems={systems}
						availableSystemsById={availableSystemsById}
						statusCounts={statusCounts}
						statusFilter={statusFilter}
						systemFilter={systemFilter}
						search={search}
						loading={loading}
						runningId={runningId}
						readOnly={readOnly}
						hasWebEndpointAssets={hasWebEndpointAssets}
						waitingForAssets={waitingForAssets}
						assetsPath={assetsPath}
						onLoad={load}
						onCreate={openCreateDialog}
						onSelect={selectMonitor}
						onCheck={setCheckTarget}
						onEdit={openEditDialog}
						onToggle={toggleMonitor}
						onDelete={setDeleteTarget}
						onSearchChange={setSearch}
						onStatusFilterChange={setStatusFilter}
						onSystemFilterChange={setSystemFilter}
						page={page}
						pageSize={pageSize}
						hasMore={hasMore}
						onPageChange={setPage}
					/>

					{!isMobile && (
						<section className="min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-none">
							<WebsiteDetailPanel
								selected={selected}
								systemName={selected?.system ? getSystemDisplayName(availableSystemsById[selected.system], "") : ""}
								targets={selectedTargets}
								checks={selectedChecks}
								latestChecks={selectedLatestChecks}
								checksLoading={checksLoading}
								running={selected ? runningId === selected.id : false}
								readOnly={readOnly}
								onCheck={() => selected && setCheckTarget(selected)}
								onEdit={() => selected && openEditDialog(selected)}
								onToggle={() => selected && toggleMonitor(selected)}
								onDelete={() => selected && setDeleteTarget(selected)}
							/>
						</section>
					)}
				</div>
			)}

			<MobileWebsiteDetailSheet
				open={mobileDetailOpen}
				isMobile={isMobile}
				selected={selected}
				availableSystemsById={availableSystemsById}
				targets={selectedTargets}
				checks={selectedChecks}
				latestChecks={selectedLatestChecks}
				checksLoading={checksLoading}
				running={selected ? runningId === selected.id : false}
				readOnly={readOnly}
				onOpenChange={setMobileDetailOpen}
				onCheck={() => selected && setCheckTarget(selected)}
				onEdit={() => selected && openEditDialog(selected)}
				onToggle={() => selected && toggleMonitor(selected)}
				onDelete={() => selected && setDeleteTarget(selected)}
			/>

			<MonitorDialog
				open={dialogOpen}
				form={form}
				systems={systems}
				assets={assets}
				saving={saving}
				iconPreview={iconPreview}
				onOpenChange={setDialogOpen}
				onFormChange={setForm}
				onIconPreviewChange={setIconPreview}
				onAssetChange={changeAsset}
				onSave={saveMonitor}
				onFetchIcon={fetchIconURL}
				onAddTarget={addTarget}
				onRemoveTarget={removeTarget}
			/>
			<OperationConfirmDialog
				open={Boolean(checkTarget)}
				onOpenChange={(open) => !open && !runningId && setCheckTarget(null)}
				title="确认立即检测"
				description="Hub 会立即访问该网站配置的检测地址，并把真实结果写入检测历史。"
				confirmLabel="开始检测"
				running={Boolean(runningId)}
				progressTitle="正在检测网站"
				progressDescription="正在按配置访问内网、外网或 IPv6 目标，慢速网络可能需要等待超时。"
				onConfirm={async () => {
					if (!checkTarget) return
					await checkNow(checkTarget.id)
					setCheckTarget(null)
				}}
			>
				<WebsiteOperationSummary monitor={checkTarget} systemsById={availableSystemsById} />
			</OperationConfirmDialog>
			<OperationConfirmDialog
				open={Boolean(deleteTarget)}
				onOpenChange={(open) => !open && !deletingId && setDeleteTarget(null)}
				title="确认删除网站监控"
				description="删除后会同时删除这个监控的检测历史，后续不能从页面恢复。"
				confirmLabel="确认删除"
				confirmVariant="destructive"
				running={Boolean(deletingId)}
				progressTitle="正在删除网站监控"
				progressDescription="Hub 正在删除监控配置和相关检测记录。"
				onConfirm={() => deleteTarget && deleteMonitor(deleteTarget)}
			>
				<WebsiteOperationSummary monitor={deleteTarget} systemsById={availableSystemsById} />
			</OperationConfirmDialog>
		</div>
	)

	if (isMobile) {
		return <MobileWebsitesPage statusCounts={statusCounts}>{content}</MobileWebsitesPage>
	}

	return (
		<div className="grid gap-4">
			<ActiveAlerts />
			{content}
		</div>
	)
})

type WebsiteMonitorCheckResponse = {
	status: "up" | "down"
	results: Array<{
		target: string
		status: "up" | "down"
		status_code?: number
		error?: string
		failure_category?: WebsiteMonitorFailureCategory
	}>
}

function WebsiteOperationSummary({
	monitor,
	systemsById,
}: {
	monitor: WebsiteMonitorRecord | null
	systemsById: Record<string, SystemRecord>
}) {
	const systemName = monitor?.system ? getSystemDisplayName(systemsById[monitor.system], "") : "未关联机器"
	return (
		<div className="grid gap-1.5 text-sm">
			<div className="font-medium">{monitor?.name}</div>
			<div className="text-muted-foreground">{systemName}</div>
			<div className="break-all font-mono text-xs text-muted-foreground">
				{monitor?.internal_url || monitor?.external_url || monitor?.url || "未配置地址"}
			</div>
		</div>
	)
}

function websiteMonitorCheckToast(response: WebsiteMonitorCheckResponse) {
	const failed = response.results.find((result) => result.status !== "up")
	if (!failed) {
		return { title: "检测完成", description: "所有地址检测正常。" }
	}
	const category = failureCategoryLabel(failed.failure_category)
	const detail = formatMonitorError(failed.error) || (failed.status_code ? `HTTP ${failed.status_code}` : "检测失败")
	return {
		title: "检测异常",
		description: category ? `${category}：${detail}` : detail,
		variant: "destructive" as const,
	}
}

async function syncWebEndpointAssetFromMonitor(
	asset: AssetRecord,
	values: {
		internalURL: string
		externalURL: string
		checkURL: string
	}
) {
	const metadata = { ...(asset.metadata ?? {}) }
	let changed = false
	changed = setMissingMetadataString(metadata, "internal_url", values.internalURL) || changed
	changed = setMissingMetadataString(metadata, "external_url", values.externalURL) || changed
	changed = setMissingMetadataString(metadata, "url", values.checkURL) || changed
	changed = setMissingMetadataString(metadata, "endpoint_scope", endpointScopeFromMonitorURLs(values)) || changed
	if (!changed) return null
	return await pb.collection<AssetRecord>("assets").update(asset.id, { metadata })
}

async function syncWebsiteMonitorHostedOnRelation(
	monitor: WebsiteMonitorRecord,
	endpointAsset: AssetRecord,
	systemId: string,
	systemsById: Record<string, SystemRecord>,
	systems: SystemRecord[]
) {
	const ownRelations = await getWebsiteMonitorHostedOnRelations(endpointAsset.id, monitor.id)
	const hostSystem = await resolveWebsiteMonitorHostSystem(systemId, systemsById, systems)
	const hostAssetId = hostSystem?.asset?.trim() ?? ""

	if (!hostAssetId || hostAssetId === endpointAsset.id) {
		await deleteWebsiteMonitorOwnedRelations(ownRelations)
		return
	}

	for (const relation of ownRelations) {
		if (relation.target_asset !== hostAssetId) {
			await pb.collection("asset_relations").delete(relation.id)
		}
	}
	if (ownRelations.some((relation) => relation.target_asset === hostAssetId)) {
		return
	}
	const existingRelation = await findHostedOnRelation(endpointAsset.id, hostAssetId)
	if (existingRelation) {
		return
	}
	await pb.collection("asset_relations").create({
		user: pb.authStore.record?.id,
		source_asset: endpointAsset.id,
		target_asset: hostAssetId,
		kind: "hosted_on",
		label: "网站监控归属",
		metadata: {
			source: "website-monitor",
			monitor: monitor.id,
			system: hostSystem?.id ?? systemId,
		},
	})
}

async function resolveWebsiteMonitorHostSystem(
	systemId: string,
	systemsById: Record<string, SystemRecord>,
	systems: SystemRecord[]
) {
	if (!systemId) {
		return undefined
	}
	const cachedSystem = systemsById[systemId] ?? systems.find((system) => system.id === systemId)
	if (cachedSystem?.asset?.trim()) {
		return cachedSystem
	}
	try {
		return await pb.collection<SystemRecord>("systems").getOne(systemId, { requestKey: null })
	} catch (error) {
		console.error("load website monitor host system", error)
		return cachedSystem
	}
}

async function getWebsiteMonitorHostedOnRelations(endpointAssetId: string, monitorId: string) {
	const records = await pb.collection<AssetRelationRecord>("asset_relations").getFullList({
		filter: pb.filter("source_asset = {:source} && kind = {:kind}", {
			source: endpointAssetId,
			kind: "hosted_on",
		}),
		requestKey: null,
	})
	return records.filter((relation) => {
		const metadata = relation.metadata ?? {}
		return (
			metadataStringFromRecord(metadata, "source") === "website-monitor" &&
			metadataStringFromRecord(metadata, "monitor") === monitorId
		)
	})
}

async function deleteWebsiteMonitorOwnedRelations(relations: AssetRelationRecord[]) {
	for (const relation of relations) {
		await pb.collection("asset_relations").delete(relation.id)
	}
}

async function findHostedOnRelation(endpointAssetId: string, hostAssetId: string) {
	try {
		return await pb.collection<AssetRelationRecord>("asset_relations").getFirstListItem(
			pb.filter("source_asset = {:source} && target_asset = {:target} && kind = {:kind}", {
				source: endpointAssetId,
				target: hostAssetId,
				kind: "hosted_on",
			}),
			{ requestKey: null }
		)
	} catch (error) {
		if (isPocketBaseNotFound(error)) {
			return null
		}
		throw error
	}
}

function setMissingMetadataString(metadata: Record<string, unknown>, key: string, value: string) {
	if (!value.trim() || metadataStringFromRecord(metadata, key)) {
		return false
	}
	metadata[key] = value.trim()
	return true
}

function metadataStringFromRecord(metadata: Record<string, unknown>, key: string) {
	const value = metadata[key]
	if (typeof value === "string") {
		return value.trim()
	}
	if (typeof value === "number" && Number.isFinite(value)) {
		return String(value)
	}
	return ""
}

function endpointScopeFromMonitorURLs(values: { internalURL: string; externalURL: string }) {
	if (values.internalURL && values.externalURL) return "内外网"
	if (values.externalURL) return "外网"
	if (values.internalURL) return "内网"
	return ""
}

async function findWebsiteMonitorByAsset(assetId: string) {
	try {
		return await pb.collection<WebsiteMonitorRecord>("website_monitors").getFirstListItem(
			pb.filter("asset = {:asset}", {
				asset: assetId,
			}),
			{ requestKey: null }
		)
	} catch (error) {
		if (isPocketBaseNotFound(error)) {
			return null
		}
		throw error
	}
}

function isPocketBaseNotFound(error: unknown) {
	return (
		typeof error === "object" && error !== null && "status" in error && (error as { status?: unknown }).status === 404
	)
}

function createMonitorFormFromAsset(
	asset: AssetRecord,
	options?: {
		base?: MonitorForm
		system?: string
		interval_seconds?: number
		timeout_seconds?: number
		enabled?: boolean
	}
): MonitorForm {
	const base = options?.base ?? createEmptyForm()
	const targets = webEndpointTargetsFromAsset(asset)
	const iconSource = targets.some((target) => target.kind.startsWith("internal"))
		? "internal"
		: targets.some((target) => target.kind.startsWith("external"))
			? "external"
			: base.icon_source
	const nextForm: MonitorForm = {
		...base,
		id: base.id,
		system: options?.system ?? base.system,
		asset: asset.id,
		name: asset.name || base.name,
		description: firstNonEmpty(asset.notes, asset.role, base.description),
		targets: targets.length ? targets : base.targets,
		icon_source: iconSource,
		group: firstNonEmpty(asset.location, asset.role, base.group),
		interval_seconds: options?.interval_seconds ?? base.interval_seconds,
		timeout_seconds: options?.timeout_seconds ?? base.timeout_seconds,
		enabled: options?.enabled ?? base.enabled,
	}
	return { ...nextForm, icon_url: resolveFormIconURL(nextForm) }
}

function webEndpointTargetsFromAsset(asset: AssetRecord): MonitorForm["targets"] {
	const internalURL = normalizeOptionalURL(metadataString(asset, "internal_url"))
	const externalURL = normalizeOptionalURL(metadataString(asset, "external_url"))
	const defaultURL = normalizeOptionalURL(metadataString(asset, "url"))
	const candidates: Array<{ scope: TargetScope; url: string }> = []
	if (internalURL) {
		candidates.push({ scope: "internal", url: internalURL })
	}
	if (externalURL) {
		candidates.push({ scope: "external", url: externalURL })
	}
	if (!candidates.length && defaultURL) {
		candidates.push({ scope: defaultScopeFromAsset(asset), url: defaultURL })
	}

	const seenURLs = new Set<string>()
	return candidates.flatMap((candidate) => {
		if (!candidate.url || seenURLs.has(candidate.url)) {
			return []
		}
		seenURLs.add(candidate.url)
		const kind = targetKindForURL(candidate.url, candidate.scope)
		const parts = splitURL(candidate.url, candidate.scope === "internal" ? "http://" : "https://")
		return [{ id: kind, kind, protocol: parts.protocol, address: parts.address }]
	})
}

function targetKindForURL(rawURL: string, scope: TargetScope): TargetKind {
	return `${scope}-${urlLooksIPv6(rawURL) ? "ipv6" : "ipv4"}` as TargetKind
}

function urlLooksIPv6(rawURL: string) {
	try {
		return new URL(rawURL).hostname.includes(":")
	} catch {
		return rawURL.includes("[") && rawURL.includes("]")
	}
}

function defaultScopeFromAsset(asset: AssetRecord): TargetScope {
	const scope = metadataString(asset, "endpoint_scope").toLowerCase()
	if (scope.includes("外") || scope.includes("public") || scope.includes("external")) {
		return "external"
	}
	return "internal"
}

function metadataString(asset: AssetRecord, key: string) {
	const value = asset.metadata?.[key]
	if (typeof value === "string") {
		return value.trim()
	}
	if (typeof value === "number" && Number.isFinite(value)) {
		return String(value)
	}
	return ""
}

function firstNonEmpty(...values: Array<string | undefined>) {
	return values.map((value) => value?.trim() ?? "").find(Boolean) ?? ""
}
