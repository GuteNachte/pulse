import { getPagePath } from "@nanostores/router"
import { useStore } from "@nanostores/react"
import { memo, useEffect, useRef, useState } from "react"
import { ActiveAlerts } from "@/components/active-alerts"
import { MobileWebsitesPage, MobileWebsiteDetailSheet } from "@/components/mobile/mobile-websites"
import { useMobileLayout } from "@/components/mobile/mobile-ui"
import { OperationConfirmDialog } from "@/components/operation-confirm-dialog"
import { $router } from "@/components/router"
import { toast } from "@/components/ui/use-toast"
import { isReadOnlyUser, pb } from "@/lib/api"
import { pageTitle } from "@/lib/branding"
import { $allSystemsById } from "@/lib/stores"
import { getSystemDisplayName } from "@/lib/system-roles"
import type { SystemRecord, WebsiteMonitorFailureCategory, WebsiteMonitorRecord } from "@/types"
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
	targetKindScope,
} from "./websites/target-utils"
import type { IconPreviewState, MonitorForm } from "./websites/types"
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
	}, [])
	const readOnly = isReadOnlyUser()
	const hasSystems = systems.length > 0
	const waitingForSystems = loading && !hasSystems

	useEffect(() => {
		if (handledInitialAdd.current || readOnly || !systems.length) {
			return
		}
		const params = new URLSearchParams(window.location.search)
		if (params.get("add") !== "1") {
			return
		}
		const requestedSystem = params.get("system") ?? ""
		const system = systems.find((item) => item.id === requestedSystem) ?? systems[0]
		handledInitialAdd.current = true
		setSystemFilter(system.id)
		setForm({ ...createEmptyForm(), system: system.id })
		setIconPreview({ status: "idle", url: "" })
		setDialogOpen(true)
	}, [readOnly, systems])

	function openCreateDialog() {
		if (!systems.length) {
			toast({ title: "请先添加机器", description: "网站监控需要选择归属机器后才能添加。", variant: "destructive" })
			return
		}
		setForm({ ...createEmptyForm(), system: systemFilter || systems[0]?.id || "" })
		setIconPreview({ status: "idle", url: "" })
		setDialogOpen(true)
	}

	function selectMonitor(monitor: WebsiteMonitorRecord, openMobileDetail = false) {
		setSelectedId(monitor.id)
		if (openMobileDetail) {
			setMobileDetailOpen(true)
		}
	}

	const clientsPath = getPagePath($router, "clients")

	function openEditDialog(monitor: WebsiteMonitorRecord) {
		const internalURL = monitor.internal_url || monitor.url || ""
		const externalURL = monitor.external_url || ""
		const targets = monitorTargetsForForm(monitor)
		const iconSource = inferIconSource(monitor.icon_url, internalURL, externalURL)
		const nextForm = {
			id: monitor.id,
			system: monitor.system ?? "",
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
		if (!form.name.trim() || !form.system || !checkURL) {
			toast({
				title: "信息不完整",
				description: "名称、归属机器和至少一个 HTTP/HTTPS 地址必须填写。",
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
					hasSystems={hasSystems}
					waitingForSystems={waitingForSystems}
					clientsPath={clientsPath}
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
				saving={saving}
				iconPreview={iconPreview}
				onOpenChange={setDialogOpen}
				onFormChange={setForm}
				onIconPreviewChange={setIconPreview}
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
