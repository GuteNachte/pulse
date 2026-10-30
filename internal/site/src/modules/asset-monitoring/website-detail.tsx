import { useStore } from "@nanostores/react"
import { toast } from "@/components/ui/use-toast"
import { pb } from "@/lib/api"
import { $allSystemsById } from "@/lib/stores"
import { getSystemDisplayName } from "@/lib/system-roles"
import type { AssetRecord, SystemRecord, WebsiteMonitorCheckRecord, WebsiteMonitorRecord } from "@/types"
import { MonitorDialog } from "@/components/routes/websites/monitor-dialog"
import { WebsiteDetailPanel } from "@/components/routes/websites/detail-panel"
import { createMonitorFormFromEndpointAsset } from "@/components/routes/websites/asset-form"
import {
	buildTargetPayload,
	canLoadImage,
	deriveFaviconURL,
	getTargetURLSet,
	getLatestChecksByTarget,
	inferIconSource,
	monitorTargetsForForm,
	monitorTargetsFromRecord,
	nextAvailableTargetKind,
	resolveFormIconURL,
	resolveIconURL,
	targetKindScope,
} from "@/components/routes/websites/target-utils"
import type { IconPreviewState, MonitorForm } from "@/components/routes/websites/types"
import { useEffect, useMemo, useState } from "react"

type WebsiteMonitorCheckResponse = {
	status: "up" | "down"
	results: Array<{ target: string; status: "up" | "down"; status_code?: number; error?: string }>
}

export function WebsiteMonitorDetail({
	monitorId,
	readOnly,
	onChanged,
	onRequestDelete,
}: {
	monitorId: string
	readOnly: boolean
	onChanged: () => void
	onRequestDelete: (monitor: WebsiteMonitorRecord) => void
}) {
	const systemsById = useStore($allSystemsById) as Record<string, SystemRecord>
	const [monitor, setMonitor] = useState<WebsiteMonitorRecord | null>(null)
	const [checks, setChecks] = useState<WebsiteMonitorCheckRecord[]>([])
	const [assets, setAssets] = useState<AssetRecord[]>([])
	const [loading, setLoading] = useState(true)
	const [running, setRunning] = useState(false)
	const [dialogOpen, setDialogOpen] = useState(false)
	const [saving, setSaving] = useState(false)
	const [form, setForm] = useState<MonitorForm | null>(null)
	const [iconPreview, setIconPreview] = useState<IconPreviewState>({ status: "idle", url: "" })

	const systems = useMemo(
		() =>
			Object.values(systemsById).map((system) => ({
				id: system.id,
				name: getSystemDisplayName(system, system.name || system.id),
			})),
		[systemsById]
	)

	async function load() {
		setLoading(true)
		try {
			const [record, checkPage, assetRecords] = await Promise.all([
				pb.collection<WebsiteMonitorRecord>("website_monitors").getOne(monitorId, { requestKey: null }),
				pb.collection<WebsiteMonitorCheckRecord>("website_monitor_checks").getList(1, 200, {
					filter: pb.filter("monitor = {:monitor}", { monitor: monitorId }),
					sort: "-created",
					requestKey: null,
				}),
				pb.collection<AssetRecord>("assets").getFullList({
					filter: pb.filter("type = {:type}", { type: "web_endpoint" }),
					sort: "name",
					requestKey: null,
				}),
			])
			setMonitor(record)
			setChecks(checkPage.items)
			setAssets(assetRecords)
		} catch (error) {
			console.error("load website monitor detail", error)
			toast({ title: "读取网站监控失败", variant: "destructive" })
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		load().catch((error) => console.error(error))
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [monitorId])

	function openEdit() {
		if (!monitor) return
		const internalURL = monitor.internal_url || monitor.url || ""
		const externalURL = monitor.external_url || ""
		const targets = monitorTargetsForForm(monitor)
		const nextForm: MonitorForm = {
			id: monitor.id,
			system: monitor.system ?? "",
			asset: monitor.asset ?? "",
			name: monitor.name,
			description: monitor.description ?? "",
			targets,
			expected_content: monitor.expected_content ?? "",
			icon_source: inferIconSource(monitor.icon_url, internalURL, externalURL),
			icon_url: monitor.icon_url || deriveFaviconURL(internalURL || externalURL),
			group: monitor.group ?? "",
			interval_seconds: monitor.interval_seconds || 300,
			timeout_seconds: monitor.timeout_seconds || 10,
			enabled: monitor.enabled,
		}
		setForm(nextForm)
		setIconPreview({ status: "idle", url: nextForm.icon_url })
		setDialogOpen(true)
	}

	async function saveMonitor() {
		if (!form) return
		const targetPayload = buildTargetPayload(form.targets)
		const { internalURL, externalURL, fallbackURL } = getTargetURLSet(targetPayload)
		const selectedAsset = assets.find((asset) => asset.id === form.asset)
		if (!selectedAsset) {
			toast({ title: "请选择互联网服务资产", variant: "destructive" })
			return
		}
		if (!form.name.trim() || !fallbackURL) {
			toast({ title: "名称和至少一个 HTTP/HTTPS 地址必须填写", variant: "destructive" })
			return
		}
		setSaving(true)
		try {
			const iconURL = resolveIconURL(form, internalURL, externalURL, fallbackURL)
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
				url: fallbackURL,
				group: form.group.trim(),
				interval_seconds: Number(form.interval_seconds) || 300,
				timeout_seconds: Number(form.timeout_seconds) || 10,
				enabled: form.enabled,
				last_status: form.id ? undefined : "unknown",
			}
			const record = form.id
				? await pb.collection<WebsiteMonitorRecord>("website_monitors").update(form.id, payload)
				: await pb.collection<WebsiteMonitorRecord>("website_monitors").create(payload)
			setMonitor(record)
			setDialogOpen(false)
			await checkNow(record.id)
			await load()
			onChanged()
		} catch (error) {
			console.error("save website monitor", error)
			toast({ title: "保存失败", description: "请检查地址或权限。", variant: "destructive" })
		} finally {
			setSaving(false)
		}
	}

	async function checkNow(id = monitor?.id) {
		if (!id) return
		setRunning(true)
		try {
			const response = await pb.send<WebsiteMonitorCheckResponse>(`/api/pulse/website-monitors/${id}/check`, {
				method: "POST",
			})
			const failed = response.results.find((result) => result.status !== "up")
			toast(
				failed
					? {
							title: "检测异常",
							description: failed.error || `HTTP ${failed.status_code ?? ""}`.trim(),
							variant: "destructive",
						}
					: { title: "检测完成", description: "所有地址检测正常。" }
			)
			await load()
			onChanged()
		} catch (error) {
			console.error("check website monitor", error)
			toast({ title: "检测失败", description: "Hub 无法访问该检测地址或请求超时。", variant: "destructive" })
		} finally {
			setRunning(false)
		}
	}

	async function toggleMonitor() {
		if (!monitor) return
		try {
			await pb.collection("website_monitors").update(monitor.id, { enabled: !monitor.enabled })
			await load()
			onChanged()
		} catch (error) {
			console.error("toggle website monitor", error)
			toast({ title: "操作失败", variant: "destructive" })
		}
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
		if (!form) return
		const asset = assets.find((item) => item.id === assetId)
		if (!asset) return
		const nextForm = createMonitorFormFromEndpointAsset(asset, {
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
		if (!form) return
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
		if (!form || form.targets.length <= 1) return
		setFormWithSyncedIcon({ ...form, targets: form.targets.filter((_, currentIndex) => currentIndex !== index) }, true)
	}

	async function fetchIconURL() {
		if (!form) return
		const targetPayload = buildTargetPayload(form.targets)
		const { internalURL, externalURL, fallbackURL } = getTargetURLSet(targetPayload)
		const iconURL = resolveIconURL(form, internalURL, externalURL, fallbackURL)
		if (!iconURL) {
			setIconPreview({ status: "failed", url: "" })
			return
		}
		setIconPreview({ status: "loading", url: iconURL })
		if (await canLoadImage(iconURL)) {
			setForm({ ...form, icon_url: iconURL })
			setIconPreview({ status: "loaded", url: iconURL })
		} else {
			setIconPreview({ status: "failed", url: iconURL })
		}
	}

	if (loading) {
		return <div className="grid min-h-72 place-items-center text-sm text-muted-foreground">正在读取网站监控…</div>
	}
	if (!monitor) {
		return (
			<div className="grid min-h-72 place-items-center text-sm text-muted-foreground">网站监控不存在或已删除。</div>
		)
	}

	const targets = monitorTargetsFromRecord(monitor)
	const latestChecks = getLatestChecksByTarget(checks)
	return (
		<>
			<section className="min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-none">
				<WebsiteDetailPanel
					selected={monitor}
					systemName={monitor.system ? getSystemDisplayName(systemsById[monitor.system], "") : ""}
					targets={targets}
					checks={checks}
					latestChecks={latestChecks}
					checksLoading={loading}
					running={running}
					readOnly={readOnly}
					onCheck={() => checkNow()}
					onEdit={openEdit}
					onToggle={toggleMonitor}
					onDelete={() => onRequestDelete(monitor)}
				/>
			</section>
			{form ? (
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
			) : null}
		</>
	)
}
