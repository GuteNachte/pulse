import { t } from "@lingui/core/macro"
import { getPagePath } from "@nanostores/router"
import {
	AlertTriangleIcon,
	CheckCircle2Icon,
	ExternalLinkIcon,
	HistoryIcon,
	InfoIcon,
	LoaderCircleIcon,
	PencilIcon,
	PlusIcon,
	SaveIcon,
	SendIcon,
	Trash2Icon,
	WebhookIcon,
} from "lucide-react"
import { type ChangeEventHandler, useCallback, useEffect, useMemo, useState } from "react"
import * as v from "valibot"
import {
	MobileNotificationsView,
	type MobileAlertCooldownItem,
	type MobileNotificationChannelHealthItem,
	type MobileNotificationChannelItem,
	type MobileNotificationFailureSummary,
	type MobileNotificationStat,
	type MobileNotificationTestResult,
} from "@/components/mobile/mobile-notifications"
import type { MobileStatusTone } from "@/components/mobile/mobile-ui"
import { OperationConfirmDialog } from "@/components/operation-confirm-dialog"
import { Link, $router } from "@/components/router"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { EmptyState } from "@/components/ui/empty-state"
import { toast } from "@/components/ui/use-toast"
import { pb } from "@/lib/api"
import {
	getMobileNotificationPermissionState,
	type MobileNotificationPermissionState,
} from "@/lib/mobile-notifications"
import type {
	AlertNotificationStateRecord,
	NotificationChannelHealthRecord,
	NotificationFailureRecord,
	UserSettings,
} from "@/types"
import { saveSettings } from "./layout"
import type { ClientResponseError } from "pocketbase"

type ChannelDialogState = {
	index: number | null
	url: string
}

type NotificationTestResult = {
	status: "success" | "error"
	url: string
	label: string
	target: string
	message: string
	time: string
}

type NotificationChannelRow = {
	index: number
	url: string
	label: string
	target: string
	failure?: NotificationFailureRecord
	health?: NotificationChannelHealthRecord
}

type NotificationChannelHealthItem = MobileNotificationChannelHealthItem
type NotificationAlertCooldownItem = MobileAlertCooldownItem
type NotificationPermissionSummary = {
	label: string
	tone: MobileStatusTone
	description: string
}

const NotificationSchema = v.object({
	webhooks: v.array(v.pipe(v.string(), v.url())),
})

const SettingsNotificationsPage = ({
	userSettings,
	hideTitle = false,
}: {
	userSettings: UserSettings
	hideTitle?: boolean
}) => {
	const [webhooks, setWebhooks] = useState(userSettings.webhooks ?? [])
	const [failures, setFailures] = useState<NotificationFailureRecord[]>([])
	const [channelHealth, setChannelHealth] = useState<NotificationChannelHealthRecord[]>([])
	const [alertNotificationStates, setAlertNotificationStates] = useState<AlertNotificationStateRecord[]>([])
	const [dialog, setDialog] = useState<ChannelDialogState | null>(null)
	const [saving, setSaving] = useState(false)
	const [testingUrl, setTestingUrl] = useState<string | null>(null)
	const [testTarget, setTestTarget] = useState<NotificationChannelRow | null>(null)
	const [deletingUrl, setDeletingUrl] = useState<string | null>(null)
	const [failureByUrl, setFailureByUrl] = useState<Map<string, NotificationFailureRecord>>(new Map())
	const [healthByUrl, setHealthByUrl] = useState<Map<string, NotificationChannelHealthRecord>>(new Map())
	const [testResult, setTestResult] = useState<NotificationTestResult | null>(null)
	const [notificationPermission, setNotificationPermission] = useState<MobileNotificationPermissionState>("unknown")

	useEffect(() => {
		setWebhooks(userSettings.webhooks ?? [])
	}, [userSettings])

	useEffect(() => {
		let ignore = false
		const refreshPermission = async () => {
			const state = await getMobileNotificationPermissionState()
			if (!ignore) {
				setNotificationPermission(state)
			}
		}
		const refreshOnVisible = () => {
			if (!document.hidden) {
				refreshPermission()
			}
		}
		refreshPermission()
		window.addEventListener("focus", refreshPermission)
		document.addEventListener("visibilitychange", refreshOnVisible)
		return () => {
			ignore = true
			window.removeEventListener("focus", refreshPermission)
			document.removeEventListener("visibilitychange", refreshOnVisible)
		}
	}, [])

	const loadDiagnostics = useCallback(async () => {
		try {
			const records = await pb.collection<NotificationFailureRecord>("notification_failures").getFullList({
				sort: "-updated",
				expand: "asset",
				fields: "id,title,target,fingerprint,error,count,created,updated,asset,expand.asset.name,expand.asset.type",
			})
			setFailures(records)
		} catch {
			setFailures([])
		}
		try {
			const records = await pb.collection<NotificationChannelHealthRecord>("notification_channel_health").getFullList({
				sort: "-updated",
				fields:
					"id,user,target,fingerprint,status,last_title,last_error,success_count,failure_count,last_checked_at,last_success_at,last_failure_at,last_test_at,created,updated",
			})
			setChannelHealth(records)
		} catch {
			setChannelHealth([])
		}
		try {
			const records = await pb.collection<AlertNotificationStateRecord>("alert_notification_states").getFullList({
				sort: "-updated",
				expand: "asset",
				fields:
					"id,user,system,asset,alert_id,title,status,last_error,suppressed_count,last_attempt_at,last_sent_at,last_suppressed_at,next_allowed_at,last_resolved_at,created,updated,expand.asset.name,expand.asset.type",
			})
			setAlertNotificationStates(records)
		} catch {
			setAlertNotificationStates([])
		}
	}, [])

	useEffect(() => {
		let unsubscribe: (() => void) | undefined
		let ignore = false

		const load = async () => {
			if (!ignore) {
				await loadDiagnostics()
			}
		}

		load()
		;(async () => {
			try {
				const failureUnsubscribe = await pb
					.collection<NotificationFailureRecord>("notification_failures")
					.subscribe("*", loadDiagnostics)
				const healthUnsubscribe = await pb
					.collection<NotificationChannelHealthRecord>("notification_channel_health")
					.subscribe("*", loadDiagnostics)
				const stateUnsubscribe = await pb
					.collection<AlertNotificationStateRecord>("alert_notification_states")
					.subscribe("*", loadDiagnostics)
				unsubscribe = () => {
					failureUnsubscribe()
					healthUnsubscribe()
					stateUnsubscribe()
				}
			} catch {
				// The page still works without realtime failure updates.
			}
		})()

		return () => {
			ignore = true
			unsubscribe?.()
		}
	}, [loadDiagnostics])

	useEffect(() => {
		let ignore = false
		;(async () => {
			const nextMap = new Map<string, NotificationFailureRecord>()
			const nextHealthMap = new Map<string, NotificationChannelHealthRecord>()
			for (const url of webhooks) {
				const fingerprint = await notificationFingerprint(url)
				const failure = failures.find((item) => item.fingerprint === fingerprint)
				if (failure) {
					nextMap.set(url, failure)
				}
				const health = channelHealth.find((item) => item.fingerprint === fingerprint)
				if (health) {
					nextHealthMap.set(url, health)
				}
			}
			if (!ignore) {
				setFailureByUrl(nextMap)
				setHealthByUrl(nextHealthMap)
			}
		})()

		return () => {
			ignore = true
		}
	}, [channelHealth, failures, webhooks])

	const channelRows = useMemo<NotificationChannelRow[]>(
		() =>
			webhooks.map((url, index) => ({
				index,
				url,
				label: getChannelLabel(url),
				target: getChannelTarget(url),
				failure: failureByUrl.get(url),
				health: healthByUrl.get(url),
			})),
		[failureByUrl, healthByUrl, webhooks]
	)
	const channelHealthItems = useMemo<NotificationChannelHealthItem[]>(
		() =>
			channelRows.map((channel) => ({
				label: channel.label,
				target: channel.health?.target ?? channel.target,
				statusLabel: notificationHealthLabel(channel.health?.status),
				statusTone: notificationHealthTone(channel.health?.status),
				lastSuccess: channel.health?.last_success_at ? formatTime(channel.health.last_success_at) : undefined,
				lastFailure: channel.health?.last_failure_at ? formatTime(channel.health.last_failure_at) : undefined,
				lastTest: channel.health?.last_test_at ? formatTime(channel.health.last_test_at) : undefined,
				successCount: channel.health?.success_count ?? 0,
				failureCount: channel.health?.failure_count ?? 0,
				lastError: channel.health?.last_error,
			})),
		[channelRows]
	)
	const activeCooldowns = useMemo<NotificationAlertCooldownItem[]>(
		() =>
			alertNotificationStates
				.filter((item) => {
					if (!item.next_allowed_at) {
						return false
					}
					const nextAllowed = new Date(item.next_allowed_at)
					return item.status === "suppressed" && !Number.isNaN(nextAllowed.getTime()) && nextAllowed > new Date()
				})
				.map((item) => ({
					title: item.title || item.alert_id,
					assetName: item.expand?.asset?.name,
					statusLabel: alertNotificationStateLabel(item.status),
					statusTone: alertNotificationStateTone(item.status),
					suppressedCount: item.suppressed_count ?? 0,
					lastSuppressed: item.last_suppressed_at ? formatTime(item.last_suppressed_at) : undefined,
					nextAllowed: item.next_allowed_at ? formatTime(item.next_allowed_at) : undefined,
				})),
		[alertNotificationStates]
	)
	const mobileStats = useMemo<MobileNotificationStat[]>(
		() => [
			{
				title: "站内告警",
				value: "已启用",
				tone: "success",
				description: "所有告警都会写入告警中心。",
			},
			{
				title: "外部通道",
				value: webhooks.length ? `${webhooks.length} 个` : "未配置",
				tone: webhooks.length ? "success" : "neutral",
				description: "推送到 ntfy、Telegram 等服务。",
			},
			{
				title: "失败记录",
				value: failures.length ? `${failures.length} 个` : "无失败",
				tone: failures.length ? "warning" : "neutral",
				description: "成功后会自动清理。",
			},
		],
		[failures.length, webhooks.length]
	)
	const mobileChannels = useMemo<MobileNotificationChannelItem[]>(
		() =>
			channelRows.map((channel) => ({
				index: channel.index,
				url: channel.url,
				label: channel.label,
				target: channel.target,
				statusLabel: channel.failure ? "发送失败" : notificationHealthLabel(channel.health?.status),
				statusTone: channel.failure ? "warning" : notificationHealthTone(channel.health?.status),
				failureCount: channel.failure?.count,
				failureTitle: channel.failure?.title,
				failureError: channel.failure?.error,
				failureUpdated: channel.failure ? formatTime(channel.failure.updated) : undefined,
				lastSuccess: channel.health?.last_success_at ? formatTime(channel.health.last_success_at) : undefined,
				lastTest: channel.health?.last_test_at ? formatTime(channel.health.last_test_at) : undefined,
			})),
		[channelRows]
	)
	const mobileLatestFailure = useMemo<MobileNotificationFailureSummary | null>(
		() =>
			failures[0]
				? {
						target: failures[0].target,
						count: failures[0].count,
					}
				: null,
		[failures]
	)
	const mobileTestResult = useMemo<MobileNotificationTestResult | null>(
		() =>
			testResult
				? {
						status: testResult.status,
						label: testResult.label,
						target: testResult.target,
						message: testResult.message,
						time: testResult.time,
					}
				: null,
		[testResult]
	)
	const notificationPermissionSummary = useMemo(
		() => getNotificationPermissionSummary(notificationPermission),
		[notificationPermission]
	)

	async function persistWebhooks(nextWebhooks: string[]) {
		setSaving(true)
		try {
			const parsedData = v.parse(NotificationSchema, { webhooks: nextWebhooks })
			await saveSettings(parsedData)
			setWebhooks(nextWebhooks)
			return true
		} catch (e: unknown) {
			toast({
				title: t`Failed to save settings`,
				description: (e as Error).message,
				variant: "destructive",
			})
			return false
		} finally {
			setSaving(false)
		}
	}

	async function saveChannel(url: string) {
		const value = url.trim()
		const nextWebhooks = [...webhooks]
		const previousUrl = typeof dialog?.index === "number" ? webhooks[dialog.index] : ""
		if (dialog?.index === null) {
			nextWebhooks.push(value)
		} else if (typeof dialog?.index === "number") {
			nextWebhooks[dialog.index] = value
		}
		if (await persistWebhooks(nextWebhooks)) {
			if (previousUrl && previousUrl !== value) {
				await clearFailureForUrl(previousUrl)
				await loadDiagnostics()
			}
			setDialog(null)
		}
	}

	async function removeChannel(index: number) {
		const url = webhooks[index]
		setDeletingUrl(url)
		try {
			const nextWebhooks = webhooks.filter((_, currentIndex) => currentIndex !== index)
			if (await persistWebhooks(nextWebhooks)) {
				await clearFailureForUrl(url)
				await loadDiagnostics()
			}
		} finally {
			setDeletingUrl(null)
		}
	}

	async function testChannel(url: string) {
		setTestingUrl(url)
		const label = getChannelLabel(url)
		const target = getChannelTarget(url)
		try {
			const res = await pb.send("/api/pulse/test-notification", { method: "POST", body: { url } })
			if ("err" in res && !res.err) {
				await clearFailureForUrl(url)
				await loadDiagnostics()
				setTestResult({
					status: "success",
					url,
					label,
					target,
					message: "测试通知已发送，请检查对应通知服务是否收到消息。",
					time: formatTime(new Date().toISOString()),
				})
				toast({
					title: t`测试通知已发送`,
					description: t`请检查对应通知服务是否收到消息。`,
				})
			} else {
				const message = normalizeTestNotificationError(res.err)
				setTestResult({
					status: "error",
					url,
					label,
					target,
					message,
					time: formatTime(new Date().toISOString()),
				})
				showTestNotificationError(message)
				await loadDiagnostics()
			}
		} catch (e: unknown) {
			const message = normalizeTestNotificationError((e as ClientResponseError).data?.message)
			setTestResult({
				status: "error",
				url,
				label,
				target,
				message,
				time: formatTime(new Date().toISOString()),
			})
			showTestNotificationError(message)
			await loadDiagnostics()
		} finally {
			setTestingUrl(null)
		}
	}

	function editMobileChannel(channel: MobileNotificationChannelItem) {
		setDialog({ index: channel.index, url: channel.url })
	}

	function testMobileChannel(channel: MobileNotificationChannelItem) {
		const target = channelRows.find((item) => item.index === channel.index)
		if (target) {
			setTestTarget(target)
		}
	}

	function removeMobileChannel(channel: MobileNotificationChannelItem) {
		removeChannel(channel.index)
	}

	return (
		<div className="grid gap-4">
			{!hideTitle && (
				<>
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div className="min-w-0">
							<h3 className="text-lg font-semibold tracking-tight">通知设置</h3>
							<p className="mt-1 text-sm text-muted-foreground">管理外部通知通道、系统通知权限和发送诊断。</p>
						</div>
						<Button
							type="button"
							className="hidden transition-transform active:scale-[0.96] md:inline-flex"
							onClick={() => setDialog({ index: null, url: "" })}
						>
							<PlusIcon className="size-4" />
							<span className="ms-1">添加通道</span>
						</Button>
					</div>
					<Separator />
				</>
			)}

			<MobileNotificationsView
				stats={mobileStats}
				channels={mobileChannels}
				channelHealth={channelHealthItems}
				activeCooldowns={activeCooldowns}
				notificationPermission={notificationPermissionSummary}
				latestFailure={mobileLatestFailure}
				testResult={mobileTestResult}
				alertsHref={getPagePath($router, "alerts")}
				testingUrl={testingUrl}
				deletingUrl={deletingUrl}
				onAdd={() => setDialog({ index: null, url: "" })}
				onEdit={editMobileChannel}
				onTest={testMobileChannel}
				onRemove={removeMobileChannel}
			/>

			<div className="hidden gap-4 md:grid">
				<div className="grid gap-3 md:grid-cols-3">
					<StatusCard
						icon={<CheckCircle2Icon className="size-4 text-green-600" />}
						title="站内告警"
						badge={<Badge variant="success">已启用</Badge>}
						description="所有告警都会写入告警中心，恢复后自动标记为已恢复。"
					/>
					<StatusCard
						icon={<WebhookIcon className="size-4 text-primary" />}
						title="外部通道"
						badge={
							<Badge variant={webhooks.length ? "success" : "secondary"}>
								{webhooks.length ? `${webhooks.length} 个` : "未配置"}
							</Badge>
						}
						description="用于推送到 ntfy、Telegram、企业微信、Gotify、Discord 等服务。"
					/>
					<StatusCard
						icon={<AlertTriangleIcon className="size-4 text-orange-500" />}
						title="失败记录"
						badge={
							<Badge variant={failures.length ? "warning" : "secondary"}>
								{failures.length ? `${failures.length} 个` : "无失败"}
							</Badge>
						}
						description="发送失败会保留原因和次数，通道恢复成功后会自动清理。"
					/>
				</div>

				<Alert className="rounded-lg border-border/70 bg-card shadow-none">
					<CheckCircle2Icon className="size-4" />
					<AlertTitle>手机通知</AlertTitle>
					<AlertDescription>
						<span className="flex flex-wrap items-center gap-2">
							<span>
								Android App 打开或后台 WebView 仍存活时，新告警会转为系统通知；App
								被系统完全结束后不承诺收到通知。完整远程推送后续需要单独接入推送服务。
							</span>
							<Badge variant={statusBadgeVariant(notificationPermissionSummary.tone)}>
								系统通知：{notificationPermissionSummary.label}
							</Badge>
						</span>
					</AlertDescription>
				</Alert>

				{failures.length > 0 && (
					<Alert className="rounded-lg border-orange-500/24 bg-card text-foreground shadow-none dark:border-orange-300/18 dark:bg-card">
						<AlertTriangleIcon className="size-4 text-orange-600 dark:text-orange-300" />
						<AlertTitle>存在外部通知失败</AlertTitle>
						<AlertDescription className="text-muted-foreground">
							最近失败来自 {failures[0].target}，已连续失败 {failures[0].count} 次。请检查对应通道
							URL、网络和目标服务状态。
						</AlertDescription>
					</Alert>
				)}

				{testResult && (
					<Alert
						className={
							testResult.status === "success"
								? "rounded-lg border-emerald-500/24 bg-card text-foreground shadow-none dark:border-emerald-300/18 dark:bg-card"
								: "rounded-lg border-red-500/24 bg-card text-foreground shadow-none dark:border-red-300/18 dark:bg-card"
						}
					>
						{testResult.status === "success" ? (
							<CheckCircle2Icon className="size-4 text-emerald-600 dark:text-emerald-300" />
						) : (
							<AlertTriangleIcon className="size-4 text-red-600 dark:text-red-300" />
						)}
						<AlertTitle>最近测试：{testResult.label}</AlertTitle>
						<AlertDescription className="grid gap-1">
							<span>
								{testResult.message} · {testResult.time}
							</span>
							<span className="break-all font-mono text-xs opacity-75">{testResult.target}</span>
						</AlertDescription>
					</Alert>
				)}

				<section className="grid gap-3 rounded-lg border border-border/70 bg-surface-soft p-3 shadow-none">
					<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
						<div className="min-w-0">
							<h4 className="text-base font-semibold tracking-tight">通知通道</h4>
							<p className="mt-1 text-sm text-muted-foreground">
								添加 Shoutrrr URL 后，新告警会同时写入站内记录并推送到这些外部通道。
							</p>
						</div>
						<Badge variant={webhooks.length ? "secondary" : "outline"}>{webhooks.length} 个通道</Badge>
					</div>

					{channelRows.length ? (
						<div className="grid gap-2">
							{channelRows.map((channel) => (
								<ChannelRow
									key={`${channel.url}-${channel.index}`}
									channel={channel}
									testing={testingUrl === channel.url}
									deleting={deletingUrl === channel.url}
									onEdit={() => setDialog({ index: channel.index, url: channel.url })}
									onTest={() => setTestTarget(channel)}
									onRemove={() => removeChannel(channel.index)}
								/>
							))}
						</div>
					) : (
						<EmptyState
							loading={false}
							loadingText="正在读取通知通道"
							emptyText="还没有外部通知通道"
							description="告警仍会写入告警中心；需要推送到手机或聊天工具时再添加通道。"
							className="min-h-24 bg-card"
						/>
					)}
				</section>

				<NotificationDiagnosticsPanel channelHealth={channelHealthItems} activeCooldowns={activeCooldowns} />

				<div className="rounded-lg border border-border/70 bg-card p-3 text-xs leading-relaxed text-muted-foreground shadow-none">
					<div className="flex items-center gap-1.5">
						<ExternalLinkIcon className="size-3.5" />
						<span>
							示例：<code>ntfy://topic</code>、<code>telegram://token@telegram?channels=id</code>、
							<code>generic+https://example.com/webhook</code>
						</span>
					</div>
				</div>

				<div className="flex justify-end">
					<Button asChild variant="outline" className="transition-transform active:scale-[0.96]">
						<Link href={getPagePath($router, "alerts")}>
							<HistoryIcon className="size-4" />
							<span className="ms-1">查看告警记录</span>
						</Link>
					</Button>
				</div>
			</div>

			<ChannelDialog
				open={Boolean(dialog)}
				value={dialog?.url ?? ""}
				mode={dialog?.index === null ? "create" : "edit"}
				saving={saving}
				onOpenChange={(open) => !open && setDialog(null)}
				onSave={saveChannel}
			/>
			<OperationConfirmDialog
				open={Boolean(testTarget)}
				onOpenChange={(open) => !open && !testingUrl && setTestTarget(null)}
				title="确认测试通知通道"
				description="Hub 会向这个外部通道发送一条测试通知，并持久记录成功或失败诊断。"
				confirmLabel="发送测试"
				running={Boolean(testingUrl)}
				progressTitle="正在发送测试通知"
				progressDescription="正在请求外部通知服务，失败原因会写入发送诊断。"
				onConfirm={async () => {
					if (!testTarget) return
					await testChannel(testTarget.url)
					setTestTarget(null)
				}}
			>
				{testTarget && (
					<div className="grid gap-1.5 text-sm">
						<div className="font-medium">{testTarget.label}</div>
						<div className="break-all font-mono text-xs text-muted-foreground">{testTarget.target}</div>
					</div>
				)}
			</OperationConfirmDialog>
		</div>
	)
}

function StatusCard({
	icon,
	title,
	badge,
	description,
}: {
	icon: React.ReactNode
	title: string
	badge: React.ReactNode
	description: string
}) {
	return (
		<div className="rounded-lg border border-border/70 bg-card p-3 shadow-none">
			<div className="mb-2 flex items-center justify-between gap-2">
				<div className="flex items-center gap-2 text-sm font-medium">
					<span className="grid size-7 place-items-center rounded-md border border-border/70 bg-surface-soft">
						{icon}
					</span>
					{title}
				</div>
				{badge}
			</div>
			<p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
		</div>
	)
}

function NotificationDiagnosticsPanel({
	channelHealth,
	activeCooldowns,
}: {
	channelHealth: NotificationChannelHealthItem[]
	activeCooldowns: NotificationAlertCooldownItem[]
}) {
	return (
		<section className="grid gap-3 rounded-lg border border-border/70 bg-surface-soft p-3 shadow-none">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
				<div className="min-w-0">
					<div className="flex items-center gap-2 text-base font-semibold tracking-tight">
						<span className="grid size-7 place-items-center rounded-md border border-border/70 bg-card text-muted-foreground shadow-none">
							<InfoIcon className="size-4" />
						</span>
						发送诊断
					</div>
					<p className="mt-1 text-sm text-muted-foreground">
						Hub 会持久记录每个通知通道的最近成功、最近失败和重复告警冷却情况。
					</p>
				</div>
				<Badge variant={activeCooldowns.length ? "warning" : "secondary"}>
					{activeCooldowns.length ? `冷却中 ${activeCooldowns.length} 条` : "无重复风暴"}
				</Badge>
			</div>

			<div className="grid gap-2 lg:grid-cols-2">
				<div className="grid gap-2 rounded-lg bg-card p-3 shadow-none">
					<div className="text-sm font-semibold">通道健康</div>
					{channelHealth.length ? (
						<div className="grid gap-2">
							{channelHealth.map((item) => (
								<div key={item.target} className="grid gap-1 rounded-md bg-surface-soft p-2 text-xs shadow-none">
									<div className="flex min-w-0 items-center justify-between gap-2">
										<div className="min-w-0">
											<div className="truncate font-medium text-sm">{item.label}</div>
											<div className="truncate font-mono text-muted-foreground">{item.target}</div>
										</div>
										<Badge variant={statusBadgeVariant(item.statusTone)}>{item.statusLabel}</Badge>
									</div>
									<div className="grid gap-1 text-muted-foreground sm:grid-cols-2">
										<div>最近成功：{item.lastSuccess ?? "无记录"}</div>
										<div>最近失败：{item.lastFailure ?? "无记录"}</div>
										<div>测试时间：{item.lastTest ?? "未测试"}</div>
										<div>
											成功 {item.successCount} 次 / 失败 {item.failureCount} 次
										</div>
									</div>
									{item.lastError && (
										<div className="break-words text-orange-700 dark:text-orange-300">{item.lastError}</div>
									)}
								</div>
							))}
						</div>
					) : (
						<EmptyState
							loading={false}
							loadingText="正在读取通道健康"
							emptyText="还没有通道健康记录"
							description="保存通道后发送告警或点击测试，会在这里生成真实诊断。"
							className="min-h-24 bg-surface-soft"
						/>
					)}
				</div>

				<div className="grid gap-2 rounded-lg bg-card p-3 shadow-none">
					<div className="text-sm font-semibold">重复告警冷却</div>
					{activeCooldowns.length ? (
						<div className="grid gap-2">
							{activeCooldowns.map((item) => (
								<div
									key={`${item.title}-${item.nextAllowed}`}
									className="grid gap-1 rounded-md bg-surface-soft p-2 text-xs shadow-none"
								>
									<div className="flex min-w-0 items-center justify-between gap-2">
										<div className="truncate font-medium text-sm">{item.title}</div>
										<Badge variant={statusBadgeVariant(item.statusTone)}>{item.statusLabel}</Badge>
									</div>
									{item.assetName && <div className="text-muted-foreground">资产：{item.assetName}</div>}
									<div className="text-muted-foreground">
										已抑制 {item.suppressedCount} 次，下一次允许发送：{item.nextAllowed ?? "等待冷却结束"}
									</div>
									{item.lastSuppressed && <div className="text-muted-foreground">最近抑制：{item.lastSuppressed}</div>}
								</div>
							))}
						</div>
					) : (
						<EmptyState
							loading={false}
							loadingText="正在读取冷却状态"
							emptyText="当前没有冷却中的重复告警"
							description="相同告警在短时间内重复出现时，Hub 会自动抑制外部通知并记录次数。"
							className="min-h-24 bg-surface-soft"
						/>
					)}
				</div>
			</div>
		</section>
	)
}

function ChannelRow({
	channel,
	testing,
	deleting,
	onEdit,
	onTest,
	onRemove,
}: {
	channel: {
		url: string
		label: string
		target: string
		failure?: NotificationFailureRecord
		health?: NotificationChannelHealthRecord
	}
	testing: boolean
	deleting: boolean
	onEdit: () => void
	onTest: () => void
	onRemove: () => void
}) {
	return (
		<Card className="rounded-lg border-border/70 bg-card p-3 shadow-none transition-[background-color,border-color] hover:border-foreground/15 hover:bg-surface-soft">
			<div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<div className="font-medium">{channel.label}</div>
						<Badge
							variant={channel.failure ? "warning" : statusBadgeVariant(notificationHealthTone(channel.health?.status))}
						>
							{channel.failure ? "发送失败" : notificationHealthLabel(channel.health?.status)}
						</Badge>
						{channel.failure && <Badge variant="secondary">失败 {channel.failure.count} 次</Badge>}
						{channel.health?.last_test_at && <Badge variant="outline">已测试</Badge>}
					</div>
					<div className="mt-1 truncate font-mono text-xs text-muted-foreground">{channel.target}</div>
					{channel.health && (
						<div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
							<span>
								最近成功：{channel.health.last_success_at ? formatTime(channel.health.last_success_at) : "无记录"}
							</span>
							<span>
								最近失败：{channel.health.last_failure_at ? formatTime(channel.health.last_failure_at) : "无记录"}
							</span>
						</div>
					)}
					{channel.failure && (
						<div className="mt-2 rounded-md border border-orange-500/24 bg-card p-2 text-xs leading-relaxed text-foreground shadow-none dark:border-orange-300/18 dark:bg-card">
							<div className="font-medium">{channel.failure.title}</div>
							{notificationFailureAssetName(channel.failure) && (
								<div className="mt-1 text-muted-foreground">
									关联资产：{notificationFailureAssetName(channel.failure)}
								</div>
							)}
							<div className="mt-1 break-words">{channel.failure.error}</div>
							<div className="mt-1 text-muted-foreground">最后失败：{formatTime(channel.failure.updated)}</div>
						</div>
					)}
				</div>
				<div className="flex flex-wrap gap-2 lg:justify-end">
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="transition-transform active:scale-[0.96]"
						onClick={onTest}
						disabled={testing || deleting}
					>
						{testing ? <LoaderCircleIcon className="size-4 animate-spin" /> : <SendIcon className="size-4" />}
						<span className="ms-1">测试</span>
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="transition-transform active:scale-[0.96]"
						onClick={onEdit}
						disabled={testing || deleting}
					>
						<PencilIcon className="size-4" />
						<span className="ms-1">编辑</span>
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="transition-transform active:scale-[0.96]"
						onClick={onRemove}
						disabled={testing || deleting}
					>
						{deleting ? <LoaderCircleIcon className="size-4 animate-spin" /> : <Trash2Icon className="size-4" />}
						<span className="ms-1">删除</span>
					</Button>
				</div>
			</div>
		</Card>
	)
}

function ChannelDialog({
	open,
	value,
	mode,
	saving,
	onOpenChange,
	onSave,
}: {
	open: boolean
	value: string
	mode: "create" | "edit"
	saving: boolean
	onOpenChange: (open: boolean) => void
	onSave: (url: string) => void
}) {
	const [url, setUrl] = useState(value)

	useEffect(() => {
		setUrl(value)
	}, [value])

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="w-[calc(100vw-2rem)] max-w-xl overflow-hidden rounded-lg border-border/70 bg-card p-0">
				<DialogHeader className="border-b border-border/70 bg-card px-5 py-4">
					<DialogTitle>{mode === "create" ? "添加通知通道" : "编辑通知通道"}</DialogTitle>
					<DialogDescription>填写一个 Shoutrrr URL，保存后后续告警会推送到这个通道。</DialogDescription>
				</DialogHeader>
				<div className="bg-surface-soft p-4">
					<div className="grid gap-2 rounded-lg border border-border/70 bg-card p-3 shadow-none">
						<Label htmlFor="notification-url">通道 URL</Label>
						<Input
							id="notification-url"
							type="url"
							value={url}
							onChange={((event) => setUrl(event.target.value)) as ChangeEventHandler<HTMLInputElement>}
							placeholder="ntfy://topic"
							className="bg-card shadow-none"
						/>
					</div>
				</div>
				<DialogFooter className="border-t border-border/70 bg-card px-5 py-4">
					<Button
						variant="outline"
						className="transition-transform active:scale-[0.96]"
						onClick={() => onOpenChange(false)}
						disabled={saving}
					>
						取消
					</Button>
					<Button
						className="transition-transform active:scale-[0.96]"
						onClick={() => onSave(url)}
						disabled={saving || !url.trim()}
					>
						{saving ? <LoaderCircleIcon className="size-4 animate-spin" /> : <SaveIcon className="size-4" />}
						<span className="ms-1">保存</span>
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

function showTestNotificationError(msg: string) {
	toast({
		title: t`Error`,
		description: msg,
		variant: "destructive",
	})
}

function normalizeTestNotificationError(message?: string) {
	return message?.trim() || t`Failed to send test notification`
}

function notificationFailureAssetName(record: NotificationFailureRecord) {
	return record.expand?.asset?.name || record.asset || ""
}

async function clearFailureForUrl(url: string) {
	const fingerprint = await notificationFingerprint(url)
	try {
		const records = await pb.collection<NotificationFailureRecord>("notification_failures").getFullList({
			fields: "id,fingerprint",
		})
		for (const record of records) {
			if (record.fingerprint === fingerprint) {
				await pb.collection("notification_failures").delete(record.id)
			}
		}
	} catch {
		// A successful test is still useful even if old failure cleanup cannot run.
	}
}

function getChannelLabel(url: string) {
	const scheme = getScheme(url)
	const labels: Record<string, string> = {
		discord: "Discord",
		generic: "Webhook",
		"generic+http": "Webhook",
		"generic+https": "Webhook",
		gotify: "Gotify",
		mattermost: "Mattermost",
		ntfy: "ntfy",
		slack: "Slack",
		telegram: "Telegram",
		wechatwork: "企业微信",
	}
	return labels[scheme] ?? (scheme || "Webhook")
}

function getChannelTarget(url: string) {
	try {
		const parsed = new URL(url)
		if (parsed.hostname) {
			return `${parsed.protocol}//${parsed.hostname}`
		}
		return parsed.protocol ? parsed.protocol.replace(":", "") : "Webhook"
	} catch {
		return url
	}
}

function getScheme(url: string) {
	const index = url.indexOf(":")
	return index > 0 ? url.slice(0, index).toLowerCase() : ""
}

async function notificationFingerprint(url: string) {
	const data = new TextEncoder().encode(url)
	const hash = await crypto.subtle.digest("SHA-256", data)
	return Array.from(new Uint8Array(hash))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("")
}

function formatTime(value: string) {
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return value
	return date.toLocaleString("zh-CN", { hour12: false })
}

function notificationHealthLabel(status?: NotificationChannelHealthRecord["status"]) {
	switch (status) {
		case "healthy":
			return "正常"
		case "failed":
			return "失败"
		default:
			return "未测试"
	}
}

function getNotificationPermissionSummary(state: MobileNotificationPermissionState): NotificationPermissionSummary {
	switch (state) {
		case "granted":
			return {
				label: "已允许",
				tone: "success",
				description: "系统通知权限已允许，App 存活时可以把新告警转为系统通知。",
			}
		case "denied":
			return {
				label: "未授权",
				tone: "warning",
				description: "系统通知权限被拒绝，需要到系统设置里允许 Pulse 通知。",
			}
		case "prompt":
			return {
				label: "待授权",
				tone: "info",
				description: "系统还没有完成通知授权，首次收到告警或测试时会请求权限。",
			}
		case "unsupported":
			return {
				label: "仅站内",
				tone: "neutral",
				description: "当前运行环境不支持系统通知，告警仍会写入站内告警中心。",
			}
		default:
			return {
				label: "待检测",
				tone: "neutral",
				description: "暂时无法读取系统通知权限，实际发送时会再次检测。",
			}
	}
}

function notificationHealthTone(status?: NotificationChannelHealthRecord["status"]): MobileStatusTone {
	switch (status) {
		case "healthy":
			return "success"
		case "failed":
			return "warning"
		default:
			return "neutral"
	}
}

function alertNotificationStateLabel(status?: AlertNotificationStateRecord["status"]) {
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

function alertNotificationStateTone(status?: AlertNotificationStateRecord["status"]): MobileStatusTone {
	switch (status) {
		case "failed":
			return "warning"
		case "suppressed":
			return "info"
		case "resolved":
			return "success"
		default:
			return "neutral"
	}
}

function statusBadgeVariant(tone: MobileStatusTone) {
	switch (tone) {
		case "success":
			return "success" as const
		case "warning":
			return "warning" as const
		case "danger":
			return "danger" as const
		case "info":
			return "outline" as const
		default:
			return "secondary" as const
	}
}

export default SettingsNotificationsPage
