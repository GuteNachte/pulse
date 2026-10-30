import {
	AlertTriangleIcon,
	BellIcon,
	BellOffIcon,
	CheckCircle2Icon,
	EyeIcon,
	ListChecksIcon,
	SlidersHorizontalIcon,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlertRulesOverview } from "@/components/alerts/alert-rules-overview"
import { GlobalAlertSettings } from "@/components/alerts/alerts-sheet"
import { MobileAlertsCenter } from "@/components/mobile/mobile-alerts"
import AlertsHistoryDataTable from "@/components/routes/settings/alerts-history-data-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useToast } from "@/components/ui/use-toast"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
	alertAssetName,
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
	alertSystemName,
	alertValueLabel,
	alertStateLabel,
} from "@/lib/alert-display"
import { pb } from "@/lib/api"
import { pageTitle } from "@/lib/branding"
import { createLatestRequestGuard } from "@/lib/latest-request-guard"
import { cn } from "@/lib/utils"
import type { AlertPolicyRecord, AlertsHistoryRecord } from "@/types"

type LoadRecordsOptions = {
	quiet?: boolean
}

export default function AlertsCenter() {
	const initialTab = useMemo(() => getInitialAlertsTab(), [])
	const [desktopSettingsOpen, setDesktopSettingsOpen] = useState(false)
	const [ruleOverviewOpen, setRuleOverviewOpen] = useState(false)
	const [selectedAlert, setSelectedAlert] = useState<AlertsHistoryRecord | null>(null)
	const [records, setRecords] = useState<AlertsHistoryRecord[]>([])
	const [policies, setPolicies] = useState<AlertPolicyRecord[]>([])
	const [loading, setLoading] = useState(true)
	const [policiesLoading, setPoliciesLoading] = useState(true)
	const [actionId, setActionId] = useState<string | null>(null)
	const recordsLoadGuardRef = useRef(createLatestRequestGuard())
	const policiesLoadGuardRef = useRef(createLatestRequestGuard())
	const { toast } = useToast()

	useEffect(() => {
		document.title = pageTitle("告警中心")
	}, [])

	const loadRecords = useCallback(async ({ quiet = false }: LoadRecordsOptions = {}) => {
		const loadToken = recordsLoadGuardRef.current.begin()
		if (!quiet) {
			setLoading(true)
		}
		try {
			const { items } = await pb.collection<AlertsHistoryRecord>("alerts_history").getList(1, 200, {
				expand: "system,asset",
				fields:
					"id,alert_id,name,value,val,created,resolved,acknowledged_at,acknowledged_by,silenced_until,silenced_by,silence_reason,expand.system.name,expand.system.display_name,expand.asset.name,expand.asset.type,system,asset",
				sort: "-created",
				requestKey: null,
			})
			if (!recordsLoadGuardRef.current.isCurrent(loadToken)) return
			setRecords(items)
			setSelectedAlert((current) => (current ? (items.find((item) => item.id === current.id) ?? current) : current))
		} catch (error) {
			if (!recordsLoadGuardRef.current.isCurrent(loadToken)) return
			console.error("load alerts center", error)
		} finally {
			if (!quiet && recordsLoadGuardRef.current.isCurrent(loadToken)) {
				setLoading(false)
			}
		}
	}, [])

	const loadPolicies = useCallback(async () => {
		const loadToken = policiesLoadGuardRef.current.begin()
		setPoliciesLoading(true)
		try {
			const response = await pb.send<{ items: AlertPolicyRecord[] }>("/api/pulse/alert-policies", { method: "GET" })
			if (!policiesLoadGuardRef.current.isCurrent(loadToken)) return
			setPolicies(response.items)
		} catch (error) {
			if (!policiesLoadGuardRef.current.isCurrent(loadToken)) return
			console.error("load alert policies", error)
			setPolicies([])
		} finally {
			if (policiesLoadGuardRef.current.isCurrent(loadToken)) setPoliciesLoading(false)
		}
	}, [])

	useEffect(() => {
		let unsubscribe: (() => void) | undefined
		let refreshTimer: ReturnType<typeof setTimeout> | undefined
		const scheduleRefresh = () => {
			if (refreshTimer) {
				clearTimeout(refreshTimer)
			}
			refreshTimer = setTimeout(() => {
				refreshTimer = undefined
				loadRecords({ quiet: true })
			}, 250)
		}
		loadRecords()
		loadPolicies()
		pb.collection<AlertsHistoryRecord>("alerts_history")
			.subscribe("*", scheduleRefresh, {
				expand: "system,asset",
				fields:
					"id,alert_id,name,value,val,created,resolved,acknowledged_at,acknowledged_by,silenced_until,silenced_by,silence_reason,expand.system.name,expand.system.display_name,expand.asset.name,expand.asset.type,system,asset",
			})
			.then((unsubscribeFn) => {
				unsubscribe = unsubscribeFn
			})
			.catch((error) => console.error("subscribe alerts center", error))
		return () => {
			unsubscribe?.()
			if (refreshTimer) {
				clearTimeout(refreshTimer)
			}
		}
	}, [loadPolicies, loadRecords])

	const currentAlerts = useMemo(() => records.filter((record) => !record.resolved), [records])
	const recoveredAlerts = records.length - currentAlerts.length
	const criticalCount = useMemo(
		() => currentAlerts.filter((record) => alertSeverity(record) === "critical").length,
		[currentAlerts]
	)

	const runAlertAction = useCallback(
		async (record: AlertsHistoryRecord, action: "acknowledge" | "silence" | "unsilence") => {
			setActionId(`${record.id}:${action}`)
			try {
				await pb.send(`/api/pulse/alerts-history/${record.id}/${action}`, {
					method: "POST",
					body: action === "silence" ? { duration_minutes: 60, reason: "临时静默" } : undefined,
				})
				await loadRecords({ quiet: true })
				toast({
					title: action === "acknowledge" ? "告警已确认" : action === "silence" ? "告警已静默 1 小时" : "已取消静默",
				})
			} catch (error) {
				console.error("alert action failed", error)
				toast({ title: "告警操作失败", description: "请检查权限或稍后重试。", variant: "destructive" })
			} finally {
				setActionId(null)
			}
		},
		[loadRecords, toast]
	)

	return (
		<>
			<div className="lg:hidden">
				<MobileAlertsCenter />
			</div>
			<Card className="mb-14 hidden min-h-96 overflow-hidden rounded-lg border-border/70 bg-surface-soft px-3 py-4 shadow-none sm:px-6 sm:py-6 lg:block">
				<CardHeader className="border-b border-border/70 p-0 pb-4">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
						<div className="flex min-w-0 gap-3">
							<div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-md border border-border/70 bg-card text-muted-foreground">
								<BellIcon className="size-4" />
							</div>
							<div className="min-w-0">
								<CardTitle className="mb-0 ">告警中心</CardTitle>
								<p className="mt-1 text-sm text-muted-foreground">优先处理当前未恢复告警，再查看历史触发和恢复记录。</p>
							</div>
						</div>
						<div className="flex shrink-0 flex-wrap items-center gap-2">
							<Button variant="outline" className="h-10 gap-2" onClick={() => setRuleOverviewOpen(true)}>
								<ListChecksIcon className="size-4" />
								规则概览
							</Button>
							<Sheet
								open={desktopSettingsOpen}
								onOpenChange={(open) => {
									setDesktopSettingsOpen(open)
									if (!open) {
										loadPolicies()
									}
								}}
							>
								<SheetTrigger asChild>
									<Button variant="default" className="h-10 gap-2">
										<SlidersHorizontalIcon className="size-4" />
										告警设置
									</Button>
								</SheetTrigger>
								<SheetContent className="w-[min(960px,calc(100vw-1rem))] overflow-y-auto p-0 sm:max-w-none">
									<SheetHeader className="border-b border-border/70 bg-card px-4 py-4 sm:px-6">
										<SheetTitle>告警设置</SheetTitle>
										<SheetDescription>统一配置所有机器、网站、容器、软件和服务的告警规则。</SheetDescription>
									</SheetHeader>
									<div className="px-4 py-4 sm:px-6">
										<GlobalAlertSettings />
									</div>
								</SheetContent>
							</Sheet>
						</div>
						<Sheet open={ruleOverviewOpen} onOpenChange={setRuleOverviewOpen}>
							<SheetContent className="w-[min(980px,calc(100vw-1rem))] overflow-y-auto p-0 sm:max-w-none">
								<SheetHeader className="border-b border-border/70 bg-card px-4 py-4 sm:px-6">
									<SheetTitle>告警规则概览</SheetTitle>
									<SheetDescription>查看当前资源阈值和事件类告警的触发口径。</SheetDescription>
								</SheetHeader>
								<div className="px-4 py-4 sm:px-6">
									<AlertRulesOverview
										policies={policies}
										loading={policiesLoading}
										onOpenSettings={() => {
											setRuleOverviewOpen(false)
											setDesktopSettingsOpen(true)
										}}
									/>
								</div>
							</SheetContent>
						</Sheet>
					</div>
				</CardHeader>
				<CardContent className="p-0 pt-4">
					<div className="grid pulse-card-gap">
						<div className="grid pulse-card-gap md:grid-cols-3">
							<AlertSummaryCard
								title="当前未恢复"
								value={loading ? "..." : currentAlerts.length}
								detail={criticalCount ? `${criticalCount} 条严重` : "暂无严重告警"}
								tone={currentAlerts.length ? "danger" : "success"}
								icon={<AlertTriangleIcon className="size-4" />}
							/>
							<AlertSummaryCard
								title="已恢复历史"
								value={loading ? "..." : recoveredAlerts}
								detail="最近 200 条记录"
								icon={<CheckCircle2Icon className="size-4" />}
							/>
							<AlertSummaryCard
								title="告警规则"
								value={policiesLoading ? "..." : `${policies.length} 项`}
								detail="点击查看规则概览"
								icon={<ListChecksIcon className="size-4" />}
								onClick={() => setRuleOverviewOpen(true)}
							/>
						</div>
						<Tabs defaultValue={initialTab} className="grid gap-3">
							<TabsList className="w-fit">
								<TabsTrigger value="current">当前未恢复</TabsTrigger>
								<TabsTrigger value="history">历史记录</TabsTrigger>
							</TabsList>
							<TabsContent value="current" className="mt-0">
								<CurrentAlertsList
									records={currentAlerts}
									loading={loading}
									actionId={actionId}
									onAction={runAlertAction}
									onOpenDetail={setSelectedAlert}
								/>
							</TabsContent>
							<TabsContent value="history" className="mt-0">
								<AlertsHistoryDataTable hideIntro />
							</TabsContent>
						</Tabs>
					</div>
				</CardContent>
			</Card>
			<AlertDetailSheet
				record={selectedAlert}
				actionId={actionId}
				onOpenChange={(open) => {
					if (!open) {
						setSelectedAlert(null)
					}
				}}
				onAction={runAlertAction}
			/>
		</>
	)
}

function getInitialAlertsTab() {
	if (typeof window === "undefined") {
		return "current"
	}
	const params = new URLSearchParams(window.location.search)
	return params.has("search") || params.has("state") || params.has("source") ? "history" : "current"
}

function AlertSummaryCard({
	title,
	value,
	detail,
	tone,
	icon,
	onClick,
}: {
	title: string
	value: string | number
	detail: string
	tone?: "danger" | "success"
	icon: React.ReactNode
	onClick?: () => void
}) {
	const className = cn(
		"rounded-lg border border-border/70 bg-surface-soft p-3",
		onClick &&
			"w-full text-left transition-[background-color,border-color,transform] hover:border-foreground/15 hover:bg-surface-soft active:scale-[0.96]"
	)
	const content = (
		<>
			<div className="flex items-center justify-between gap-3">
				<div className="text-sm text-muted-foreground">{title}</div>
				<div className="grid size-8 place-items-center rounded-md border border-border/70 bg-card text-muted-foreground">
					{icon}
				</div>
			</div>
			<div
				className={
					tone === "danger"
						? "mt-2 text-2xl font-semibold text-red-600 tabular-nums dark:text-red-300"
						: tone === "success"
							? "mt-2 text-2xl font-semibold text-emerald-600 tabular-nums dark:text-emerald-300"
							: "mt-2 text-2xl font-semibold tabular-nums"
				}
			>
				{value}
			</div>
			<div className="mt-1 text-xs text-muted-foreground">{detail}</div>
		</>
	)
	if (onClick) {
		return (
			<button type="button" className={className} onClick={onClick}>
				{content}
			</button>
		)
	}
	return <div className={className}>{content}</div>
}

function CurrentAlertsList({
	records,
	loading,
	actionId,
	onAction,
	onOpenDetail,
}: {
	records: AlertsHistoryRecord[]
	loading: boolean
	actionId: string | null
	onAction: (record: AlertsHistoryRecord, action: "acknowledge" | "silence" | "unsilence") => void
	onOpenDetail: (record: AlertsHistoryRecord) => void
}) {
	if (loading) {
		return (
			<EmptyState
				loading
				loadingText="正在读取当前告警"
				emptyText="当前没有未恢复告警"
				description="正在读取 Hub 告警记录和恢复状态。"
				className="min-h-40 bg-card"
			/>
		)
	}
	if (!records.length) {
		return (
			<EmptyState
				loading={false}
				loadingText="正在读取当前告警"
				emptyText="当前没有未恢复告警"
				description="新的异常会先出现在这里，恢复后进入历史记录。"
				className="min-h-40 bg-card"
			/>
		)
	}
	return (
		<div className="grid pulse-card-gap">
			{records.map((record) => (
				<div
					key={record.id}
					className="grid gap-3 rounded-lg border border-border/70 bg-card p-3 shadow-none transition-[border-color,background-color] hover:border-foreground/15 hover:bg-surface-soft md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
				>
					<div className="min-w-0">
						<div className="flex min-w-0 flex-wrap items-center gap-2">
							<Badge variant={alertSeverity(record) === "critical" ? "danger" : "warning"}>
								{alertSeverityLabel(record)}
							</Badge>
							<Badge variant="secondary">{alertSourceLabel(record)}</Badge>
							<Badge
								variant={alertIsSilenced(record) ? "secondary" : alertIsAcknowledged(record) ? "outline" : "danger"}
								className="pointer-events-none"
							>
								{alertStateLabel(record)}
							</Badge>
							<div className="min-w-0 truncate font-semibold">{alertDisplayName(record)}</div>
						</div>
						<div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
							<span>{alertSystemName(record)}</span>
							{alertAssetName(record) && <span>资产：{alertAssetName(record)}</span>}
							<span className="tabular-nums">{alertValueLabel(record)}</span>
							<span className="tabular-nums">{alertCreatedLabel(record)}</span>
							{alertIsSilenced(record) && (
								<span className="tabular-nums">静默至 {alertSilencedUntilLabel(record)}</span>
							)}
						</div>
					</div>
					<div className="flex shrink-0 flex-wrap items-center gap-2 rounded-md border border-border/70 bg-surface-soft p-1.5 md:justify-end">
						<div className="mr-1 text-sm font-medium text-red-600 tabular-nums dark:text-red-300">
							{alertDurationLabel(record)}
						</div>
						<Button variant="outline" size="sm" onClick={() => onOpenDetail(record)}>
							<EyeIcon className="size-4" />
							详情
						</Button>
						{!alertIsAcknowledged(record) && (
							<Button
								variant="outline"
								size="sm"
								disabled={actionId === `${record.id}:acknowledge`}
								onClick={() => onAction(record, "acknowledge")}
							>
								<CheckCircle2Icon className="size-4" />
								确认
							</Button>
						)}
						{alertIsSilenced(record) ? (
							<Button
								variant="outline"
								size="sm"
								disabled={actionId === `${record.id}:unsilence`}
								onClick={() => onAction(record, "unsilence")}
							>
								取消静默
							</Button>
						) : (
							<Button
								variant="outline"
								size="sm"
								disabled={actionId === `${record.id}:silence`}
								onClick={() => onAction(record, "silence")}
							>
								<BellOffIcon className="size-4" />
								静默 1 小时
							</Button>
						)}
					</div>
				</div>
			))}
		</div>
	)
}

function AlertDetailSheet({
	record,
	actionId,
	onOpenChange,
	onAction,
}: {
	record: AlertsHistoryRecord | null
	actionId: string | null
	onOpenChange: (open: boolean) => void
	onAction: (record: AlertsHistoryRecord, action: "acknowledge" | "silence" | "unsilence") => void
}) {
	return (
		<Sheet open={Boolean(record)} onOpenChange={onOpenChange}>
			<SheetContent className="w-[min(620px,calc(100vw-1rem))] overflow-y-auto p-0 sm:max-w-none">
				<SheetHeader className="border-b border-border/70 bg-card px-4 py-4 sm:px-6">
					<SheetTitle>{record ? alertDisplayName(record) : "告警详情"}</SheetTitle>
					<SheetDescription>
						{record ? `${alertSystemName(record)} · ${alertSourceLabel(record)}` : ""}
					</SheetDescription>
				</SheetHeader>
				{record && (
					<div className="grid pulse-card-gap px-4 py-4 sm:px-6">
						<div className="grid gap-2 sm:grid-cols-2">
							<AlertDetailRow label="状态" value={alertStateLabel(record)} />
							<AlertDetailRow label="级别" value={alertSeverityLabel(record)} />
							<AlertDetailRow label="来源" value={alertSourceLabel(record)} />
							{alertAssetName(record) && <AlertDetailRow label="资产" value={alertAssetName(record)} />}
							<AlertDetailRow label="触发值" value={alertValueLabel(record)} />
							<AlertDetailRow label="触发时间" value={alertCreatedLabel(record)} />
							<AlertDetailRow label="恢复时间" value={alertResolvedLabel(record)} />
							<AlertDetailRow label="持续时间" value={alertDurationLabel(record)} />
							{alertIsSilenced(record) && <AlertDetailRow label="静默至" value={alertSilencedUntilLabel(record)} />}
						</div>
						<div className="rounded-lg border border-border/70 bg-surface-soft p-3 text-sm leading-relaxed text-muted-foreground">
							当前详情来自告警历史记录和关联机器信息。处理完成后等待下一次采集或检测恢复，告警会自动进入历史记录。
						</div>
						{!record.resolved && (
							<div className="flex flex-wrap justify-end gap-2">
								{!alertIsAcknowledged(record) && (
									<Button
										variant="outline"
										disabled={actionId === `${record.id}:acknowledge`}
										onClick={() => onAction(record, "acknowledge")}
									>
										<CheckCircle2Icon className="size-4" />
										确认
									</Button>
								)}
								{alertIsSilenced(record) ? (
									<Button
										variant="outline"
										disabled={actionId === `${record.id}:unsilence`}
										onClick={() => onAction(record, "unsilence")}
									>
										取消静默
									</Button>
								) : (
									<Button
										variant="outline"
										disabled={actionId === `${record.id}:silence`}
										onClick={() => onAction(record, "silence")}
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
	)
}

function AlertDetailRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="grid gap-1 rounded-md border border-border/70 bg-surface-soft px-3 py-2 text-sm">
			<div className="text-xs text-muted-foreground">{label}</div>
			<div className="break-words font-medium tabular-nums">{value}</div>
		</div>
	)
}
