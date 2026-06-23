import { BellIcon, BellOffIcon, CheckCircle2Icon, ListChecksIcon, SlidersHorizontalIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertRulesOverview } from "@/components/alerts/alert-rules-overview"
import { GlobalAlertSettings } from "@/components/alerts/alerts-sheet"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useToast } from "@/components/ui/use-toast"
import { alertInfo } from "@/lib/alerts"
import {
	alertCreatedLabel,
	alertDisplayName,
	alertDurationLabel,
	alertIsAcknowledged,
	alertIsSilenced,
	alertResolvedLabel,
	alertSeverity,
	alertSeverityLabel,
	alertSilencedUntilLabel,
	alertSourceLabel,
	alertStateLabel,
	alertSystemName,
	alertValueLabel,
} from "@/lib/alert-display"
import { isPocketBaseAutoCancel, pb } from "@/lib/api"
import type { AlertPolicyRecord, AlertsHistoryRecord } from "@/types"
import {
	MobileEmptyState,
	MobileList,
	MobileListItem,
	MobilePageShell,
	MobileSection,
	MobileStatusTag,
} from "./mobile-ui"

export function MobileAlertsCenter() {
	const [settingsOpen, setSettingsOpen] = useState(false)
	const [rulesOpen, setRulesOpen] = useState(false)
	const [records, setRecords] = useState<AlertsHistoryRecord[]>([])
	const [policies, setPolicies] = useState<AlertPolicyRecord[]>([])
	const [selected, setSelected] = useState<AlertsHistoryRecord | null>(null)
	const [actionId, setActionId] = useState<string | null>(null)
	const [policiesLoading, setPoliciesLoading] = useState(true)
	const { toast } = useToast()

	const options = useMemo(
		() => ({
			expand: "system",
			fields:
				"id,alert_id,name,value,val,state,created,resolved,acknowledged_at,acknowledged_by,silenced_until,silenced_by,silence_reason,expand.system.name,system",
		}),
		[]
	)

	const loadRecords = useCallback(async () => {
		const { items } = await pb.collection<AlertsHistoryRecord>("alerts_history").getList(1, 80, {
			...options,
			sort: "-created",
			requestKey: null,
		})
		setRecords(items)
		setSelected((current) => (current ? (items.find((item) => item.id === current.id) ?? current) : current))
	}, [options])

	const loadPolicies = useCallback(async () => {
		setPoliciesLoading(true)
		try {
			const response = await pb.send<{ items: AlertPolicyRecord[] }>("/api/pulse/alert-policies", {
				method: "GET",
				requestKey: null,
			})
			setPolicies(response.items)
		} catch (error) {
			if (!isPocketBaseAutoCancel(error)) {
				console.error("load mobile alert policies", error)
			}
			setPolicies([])
		} finally {
			setPoliciesLoading(false)
		}
	}, [])

	useEffect(() => {
		let unsubscribe: (() => void) | undefined
		let refreshTimer: ReturnType<typeof setTimeout> | undefined
		const pendingEvents: Array<{ action: string; record: AlertsHistoryRecord }> = []
		const flushEvents = () => {
			refreshTimer = undefined
			const events = pendingEvents.splice(0, pendingEvents.length)
			if (!events.length) return
			setRecords((current) => {
				const recordsById = new Map(current.map((record) => [record.id, record]))
				let orderedIds = current.map((record) => record.id)
				for (const event of events) {
					const { action, record } = event
					if (action === "delete") {
						recordsById.delete(record.id)
						orderedIds = orderedIds.filter((id) => id !== record.id)
						continue
					}
					if (action === "create") {
						orderedIds = [record.id, ...orderedIds.filter((id) => id !== record.id)]
					}
					if (action === "update" && !recordsById.has(record.id)) {
						continue
					}
					recordsById.set(record.id, record)
				}
				return orderedIds
					.map((id) => recordsById.get(id))
					.filter((record): record is AlertsHistoryRecord => Boolean(record))
					.slice(0, 80)
			})
			setSelected((current) => {
				if (!current) return current
				let next = current
				for (const event of events) {
					if (event.record.id !== current.id) continue
					if (event.action === "delete") return null
					next = event.record
				}
				return next
			})
		}
		const scheduleEvent = (action: string, record: AlertsHistoryRecord) => {
			pendingEvents.push({ action, record })
			if (refreshTimer) {
				clearTimeout(refreshTimer)
			}
			refreshTimer = setTimeout(flushEvents, 120)
		}
		loadRecords().catch((error) => {
			if (!isPocketBaseAutoCancel(error)) {
				console.error("load mobile alerts history", error)
			}
		})
		loadPolicies()
		pb.collection<AlertsHistoryRecord>("alerts_history")
			.subscribe(
				"*",
				(event) => {
					const record = event.record as AlertsHistoryRecord
					scheduleEvent(event.action, record)
				},
				options
			)
			.then((unsubscribeFn) => {
				unsubscribe = unsubscribeFn
			})
			.catch((error) => console.error("subscribe mobile alerts history", error))
		return () => {
			unsubscribe?.()
			if (refreshTimer) {
				clearTimeout(refreshTimer)
			}
		}
	}, [loadPolicies, loadRecords, options])

	const activeCount = useMemo(() => records.filter((record) => !record.resolved).length, [records])
	const activeRecords = useMemo(() => records.filter((record) => !record.resolved), [records])
	const historyRecords = useMemo(() => records.filter((record) => record.resolved), [records])
	const resolvedCount = records.length - activeCount

	const runAlertAction = useCallback(
		async (record: AlertsHistoryRecord, action: "acknowledge" | "silence" | "unsilence") => {
			setActionId(`${record.id}:${action}`)
			try {
				await pb.send(`/api/pulse/alerts-history/${record.id}/${action}`, {
					method: "POST",
					body: action === "silence" ? { duration_minutes: 60, reason: "临时静默" } : undefined,
				})
				await loadRecords()
				toast({
					title: action === "acknowledge" ? "告警已确认" : action === "silence" ? "告警已静默 1 小时" : "已取消静默",
				})
			} catch (error) {
				console.error("mobile alert action failed", error)
				toast({ title: "告警操作失败", description: "请检查权限或稍后重试。", variant: "destructive" })
			} finally {
				setActionId(null)
			}
		},
		[loadRecords, toast]
	)

	return (
		<MobilePageShell
			title="告警"
			subtitle={`${activeCount} 条未恢复`}
			action={
				<div className="flex items-center gap-2">
					<Button variant="outline" size="icon" className="size-10 rounded-md" onClick={() => setRulesOpen(true)}>
						<span className="sr-only">告警规则概览</span>
						<ListChecksIcon className="size-4" />
					</Button>
					<Button variant="outline" size="icon" className="size-10 rounded-md" onClick={() => setSettingsOpen(true)}>
						<span className="sr-only">告警设置</span>
						<SlidersHorizontalIcon className="size-4" />
					</Button>
				</div>
			}
		>
			<div className="grid grid-cols-2 gap-2 rounded-lg border border-border/70 bg-surface-soft p-2 shadow-none">
				<div className="rounded-md border border-border/70 bg-card px-3 py-2.5">
					<div className="text-xs text-muted-foreground">未恢复</div>
					<div className="mt-1 text-lg font-semibold tabular-nums">{activeCount}</div>
				</div>
				<div className="rounded-md border border-border/70 bg-card px-3 py-2.5">
					<div className="text-xs text-muted-foreground">已恢复</div>
					<div className="mt-1 text-lg font-semibold tabular-nums">{resolvedCount}</div>
				</div>
			</div>
			<MobileSection title="当前未恢复" count={`${activeRecords.length} 条`}>
				{activeRecords.length ? (
					<MobileList>
						{activeRecords.map((record) => (
							<AlertHistoryListItem key={record.id} record={record} onClick={() => setSelected(record)} />
						))}
					</MobileList>
				) : (
					<MobileEmptyState>当前没有未恢复告警</MobileEmptyState>
				)}
			</MobileSection>
			<MobileSection title="历史记录" count={`${historyRecords.length} 条`}>
				{historyRecords.length ? (
					<MobileList>
						{historyRecords.map((record) => (
							<AlertHistoryListItem key={record.id} record={record} onClick={() => setSelected(record)} />
						))}
					</MobileList>
				) : (
					<MobileEmptyState>暂无已恢复记录</MobileEmptyState>
				)}
			</MobileSection>
			<Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
				<SheetContent side="bottom" className="max-h-[82dvh] overflow-y-auto rounded-t-2xl bg-surface-soft p-0">
					<SheetHeader className="border-b border-border/70 bg-card px-4 py-4 text-left">
						<SheetTitle>{selected ? alertDisplayName(selected) : "告警详情"}</SheetTitle>
						<SheetDescription>{selected ? alertSystemName(selected) : ""}</SheetDescription>
					</SheetHeader>
					{selected && (
						<div className="grid gap-3 px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] text-sm">
							<div className="grid gap-2 rounded-lg border border-border/70 bg-card p-2">
								<DetailRow label="状态" value={alertStateLabel(selected)} />
								<DetailRow label="级别" value={alertSeverityLabel(selected)} />
								<DetailRow label="来源" value={alertSourceLabel(selected)} />
								<DetailRow label="触发值" value={alertValueLabel(selected)} />
								<DetailRow label="触发时间" value={alertCreatedLabel(selected)} />
								<DetailRow label="恢复时间" value={alertResolvedLabel(selected)} />
								<DetailRow label="持续时间" value={alertDurationLabel(selected)} />
								{alertIsSilenced(selected) && <DetailRow label="静默至" value={alertSilencedUntilLabel(selected)} />}
							</div>
							{!selected.resolved && (
								<div className="grid grid-cols-2 gap-2 rounded-lg border border-border/70 bg-card p-2">
									{!alertIsAcknowledged(selected) && (
										<Button
											variant="outline"
											disabled={actionId === `${selected.id}:acknowledge`}
											onClick={() => runAlertAction(selected, "acknowledge")}
										>
											<CheckCircle2Icon className="size-4" />
											确认
										</Button>
									)}
									{alertIsSilenced(selected) ? (
										<Button
											variant="outline"
											className={!alertIsAcknowledged(selected) ? "" : "col-span-2"}
											disabled={actionId === `${selected.id}:unsilence`}
											onClick={() => runAlertAction(selected, "unsilence")}
										>
											取消静默
										</Button>
									) : (
										<Button
											variant="outline"
											className={!alertIsAcknowledged(selected) ? "" : "col-span-2"}
											disabled={actionId === `${selected.id}:silence`}
											onClick={() => runAlertAction(selected, "silence")}
										>
											<BellOffIcon className="size-4" />
											静默 1 小时
										</Button>
									)}
								</div>
							)}
						</div>
					)}
				</SheetContent>
			</Sheet>
			<Sheet
				open={settingsOpen}
				onOpenChange={(open) => {
					setSettingsOpen(open)
					if (!open) {
						loadPolicies()
					}
				}}
			>
				<SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto rounded-t-2xl p-0">
					<SheetHeader className="border-b border-border/70 px-4 py-4 text-left">
						<SheetTitle>告警设置</SheetTitle>
						<SheetDescription>统一配置所有机器、网站、容器、软件和服务的告警规则。</SheetDescription>
					</SheetHeader>
					<div className="px-4 py-4">
						<GlobalAlertSettings />
					</div>
				</SheetContent>
			</Sheet>
			<Sheet open={rulesOpen} onOpenChange={setRulesOpen}>
				<SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto rounded-t-2xl p-0">
					<SheetHeader className="border-b border-border/70 px-4 py-4 text-left">
						<SheetTitle>告警规则概览</SheetTitle>
						<SheetDescription>查看当前资源阈值和事件类告警的触发口径。</SheetDescription>
					</SheetHeader>
					<div className="px-4 py-4">
						<AlertRulesOverview
							policies={policies}
							loading={policiesLoading}
							compact
							onOpenSettings={() => {
								setRulesOpen(false)
								setSettingsOpen(true)
							}}
						/>
					</div>
				</SheetContent>
			</Sheet>
		</MobilePageShell>
	)
}

function AlertHistoryListItem({ record, onClick }: { record: AlertsHistoryRecord; onClick: () => void }) {
	const active = !record.resolved
	const info = alertInfo[record.name]
	const Icon = info?.icon ?? BellIcon
	const tone = active ? (alertSeverity(record) === "critical" ? "danger" : "warning") : "success"
	return (
		<MobileListItem onClick={onClick}>
			<div className="flex min-w-0 items-start justify-between gap-3">
				<div className="min-w-0 flex-1">
					<div className="flex min-w-0 items-center gap-2">
						<span className="grid size-7 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft text-muted-foreground">
							<Icon className="size-3.5" />
						</span>
						<div className="truncate text-sm font-semibold">{alertDisplayName(record)}</div>
					</div>
					<div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
						<span>{alertSystemName(record)}</span>
						<span>{alertSourceLabel(record)}</span>
						<span className="tabular-nums">{alertValueLabel(record)}</span>
					</div>
					<div className="mt-2 text-xs tabular-nums text-muted-foreground">{alertCreatedLabel(record)}</div>
				</div>
				<MobileStatusTag tone={alertIsSilenced(record) ? "neutral" : tone}>
					{active ? alertStateLabel(record) : "已恢复"}
				</MobileStatusTag>
			</div>
		</MobileListItem>
	)
}

function DetailRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-surface-soft px-3 py-2">
			<span className="text-muted-foreground">{label}</span>
			<span className="min-w-0 truncate font-medium tabular-nums">{value}</span>
		</div>
	)
}
