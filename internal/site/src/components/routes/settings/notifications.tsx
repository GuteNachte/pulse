import { t } from "@lingui/core/macro"
import { getPagePath } from "@nanostores/router"
import {
	AlertTriangleIcon,
	CheckCircle2Icon,
	ExternalLinkIcon,
	HistoryIcon,
	LoaderCircleIcon,
	PencilIcon,
	PlusIcon,
	SendIcon,
	Trash2Icon,
} from "lucide-react"
import { type ChangeEventHandler, useCallback, useEffect, useMemo, useState } from "react"
import * as v from "valibot"
import type { MobileStatusTone } from "@/components/mobile/mobile-ui"
import { OperationConfirmDialog } from "@/components/operation-confirm-dialog"
import { Link, $router } from "@/components/router"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
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
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/components/ui/use-toast"
import { pb } from "@/lib/api"
import {
	getMobileNotificationPermissionState,
	type MobileNotificationPermissionState,
} from "@/lib/mobile-notifications"
import { formatDateTime } from "@/lib/utils"
import type {
	AlertNotificationStateRecord,
	NotificationChannelHealthRecord,
	NotificationFailureRecord,
	UserSettings,
} from "@/types"
import { SettingsField } from "./components/field-row"
import { SettingsPageHeader } from "./components/page-header"
import { SettingsSection } from "./components/section"
import { SettingsStatCard, SettingsStatGrid } from "./components/stat-card"
import { saveSettings } from "./layout"
import type { ClientResponseError } from "pocketbase"

type ChannelDialogState = {
	index: number | null
	url: string
}

type EmailFormState = {
	host: string
	port: string
	username: string
	password: string
	from: string
	to: string
}

type EmailTestResult = {
	ok: boolean
	message: string
	time: string
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

type NotificationChannelHealthItem = {
	label: string
	target: string
	statusLabel: string
	statusTone: MobileStatusTone
	lastSuccess?: string
	lastFailure?: string
	lastTest?: string
	successCount: number
	failureCount: number
	lastError?: string
}

type NotificationAlertCooldownItem = {
	title: string
	assetName?: string
	statusLabel: string
	statusTone: MobileStatusTone
	suppressedCount: number
	lastSuppressed?: string
	nextAllowed?: string
}

type NotificationPermissionSummary = {
	label: string
	tone: MobileStatusTone
	description: string
}

type NotificationTab = "channels" | "email"

const NotificationSchema = v.object({
	webhooks: v.array(v.pipe(v.string(), v.url())),
})

const emptyEmailForm: EmailFormState = {
	host: "",
	port: "",
	username: "",
	password: "",
	from: "",
	to: "",
}

function initialNotificationTab(): NotificationTab {
	if (typeof window === "undefined") {
		return "channels"
	}
	return new URLSearchParams(window.location.search).get("tab") === "email" ? "email" : "channels"
}

function emailFormFromSettings(email?: UserSettings["email"]): EmailFormState {
	if (!email) {
		return { ...emptyEmailForm }
	}
	return {
		host: email.host ?? "",
		port: email.port ? String(email.port) : "",
		username: email.username ?? "",
		password: email.password ?? "",
		from: email.from ?? "",
		to: email.to ?? "",
	}
}

function emailFormComplete(form: EmailFormState) {
	return Boolean(form.host.trim() && form.from.trim() && form.to.trim())
}

const SettingsNotificationsPage = ({ userSettings }: { userSettings: UserSettings }) => {
	const [webhooks, setWebhooks] = useState(userSettings.webhooks ?? [])
	const [failures, setFailures] = useState<NotificationFailureRecord[]>([])
	const [channelHealth, setChannelHealth] = useState<NotificationChannelHealthRecord[]>([])
	const [alertNotificationStates, setAlertNotificationStates] = useState<AlertNotificationStateRecord[]>([])
	const [dialog, setDialog] = useState<ChannelDialogState | null>(null)
	const [saving, setSaving] = useState(false)
	const [testingUrl, setTestingUrl] = useState<string | null>(null)
	const [testTarget, setTestTarget] = useState<NotificationChannelRow | null>(null)
	const [deleteTarget, setDeleteTarget] = useState<NotificationChannelRow | null>(null)
	const [deletingUrl, setDeletingUrl] = useState<string | null>(null)
	const [failureByUrl, setFailureByUrl] = useState<Map<string, NotificationFailureRecord>>(new Map())
	const [healthByUrl, setHealthByUrl] = useState<Map<string, NotificationChannelHealthRecord>>(new Map())
	const [testResult, setTestResult] = useState<NotificationTestResult | null>(null)
	const [notificationPermission, setNotificationPermission] = useState<MobileNotificationPermissionState>("unknown")
	const [emailForm, setEmailForm] = useState<EmailFormState>(() => emailFormFromSettings(userSettings.email))
	const [savingEmail, setSavingEmail] = useState(false)
	const [testingEmail, setTestingEmail] = useState(false)
	const [emailTestResult, setEmailTestResult] = useState<EmailTestResult | null>(null)
	const [tab, setTab] = useState<NotificationTab>(initialNotificationTab)

	useEffect(() => {
		setWebhooks(userSettings.webhooks ?? [])
	}, [userSettings])

	useEffect(() => {
		setEmailForm(emailFormFromSettings(userSettings.email))
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
				lastSuccess: channel.health?.last_success_at ? formatDateTime(channel.health.last_success_at) : undefined,
				lastFailure: channel.health?.last_failure_at ? formatDateTime(channel.health.last_failure_at) : undefined,
				lastTest: channel.health?.last_test_at ? formatDateTime(channel.health.last_test_at) : undefined,
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
					lastSuppressed: item.last_suppressed_at ? formatDateTime(item.last_suppressed_at) : undefined,
					nextAllowed: item.next_allowed_at ? formatDateTime(item.next_allowed_at) : undefined,
				})),
		[alertNotificationStates]
	)
	const notificationPermissionSummary = useMemo(
		() => getNotificationPermissionSummary(notificationPermission),
		[notificationPermission]
	)

	function changeTab(value: string) {
		const next: NotificationTab = value === "email" ? "email" : "channels"
		setTab(next)
		if (typeof window === "undefined") {
			return
		}
		const url = new URL(window.location.href)
		url.searchParams.set("tab", next)
		window.history.replaceState(null, "", `${url.pathname}${url.search}`)
	}

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

	function updateEmailField(field: keyof EmailFormState) {
		return ((event) =>
			setEmailForm((form) => ({ ...form, [field]: event.target.value }))) as ChangeEventHandler<HTMLInputElement>
	}

	function buildEmailPayload() {
		const port = Number.parseInt(emailForm.port, 10)
		return {
			host: emailForm.host.trim(),
			port: Number.isFinite(port) && port > 0 ? port : 0,
			username: emailForm.username.trim(),
			password: emailForm.password,
			from: emailForm.from.trim(),
			to: emailForm.to.trim(),
			encryption: "auto",
		}
	}

	async function saveEmailSettings() {
		if (!emailFormComplete(emailForm)) {
			toast({
				title: "无法保存邮件配置",
				description: "SMTP 服务器、发件人地址和收件人地址不能为空。",
				variant: "destructive",
			})
			return
		}
		setSavingEmail(true)
		try {
			await saveSettings({ email: buildEmailPayload() })
			setEmailTestResult(null)
		} finally {
			setSavingEmail(false)
		}
	}

	async function testEmailSettings() {
		if (!emailFormComplete(emailForm)) {
			toast({
				title: "无法发送测试邮件",
				description: "请先填写 SMTP 服务器、发件人地址和收件人地址。",
				variant: "destructive",
			})
			return
		}
		setTestingEmail(true)
		setEmailTestResult(null)
		try {
			const res = await pb.send<{ err?: boolean | string }>("/api/pulse/notifications/email/test", {
				method: "POST",
				body: buildEmailPayload(),
			})
			const time = formatDateTime(new Date().toISOString())
			if (typeof res.err === "string" && res.err) {
				setEmailTestResult({ ok: false, message: res.err, time })
				toast({
					title: t`测试邮件发送失败`,
					description: res.err,
					variant: "destructive",
				})
			} else {
				setEmailTestResult({ ok: true, message: "测试邮件已发送，请到收件箱查收。", time })
				toast({
					title: t`测试邮件已发送`,
					description: t`请到收件箱查收测试邮件。`,
				})
			}
		} catch (e: unknown) {
			const message = (e as ClientResponseError).data?.message?.trim() || "测试邮件发送失败，请检查配置和网络。"
			setEmailTestResult({ ok: false, message, time: formatDateTime(new Date().toISOString()) })
			toast({
				title: t`测试邮件发送失败`,
				description: message,
				variant: "destructive",
			})
		} finally {
			setTestingEmail(false)
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

	async function removeChannel() {
		if (!deleteTarget) return
		const url = deleteTarget.url
		setDeletingUrl(url)
		try {
			const nextWebhooks = webhooks.filter((_, currentIndex) => currentIndex !== deleteTarget.index)
			if (await persistWebhooks(nextWebhooks)) {
				await clearFailureForUrl(url)
				await loadDiagnostics()
			}
		} finally {
			setDeletingUrl(null)
			setDeleteTarget(null)
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
					time: formatDateTime(new Date().toISOString()),
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
					time: formatDateTime(new Date().toISOString()),
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
				time: formatDateTime(new Date().toISOString()),
			})
			showTestNotificationError(message)
			await loadDiagnostics()
		} finally {
			setTestingUrl(null)
		}
	}

	return (
		<div className="grid pulse-card-gap">
			<SettingsPageHeader
				eyebrow="监控与接入"
				title="通知设置"
				description="管理外部通知通道、邮件发送和发送诊断。所有告警都会写入站内告警中心，外部通道负责把重要告警推送到手机或聊天工具。"
			/>

			<SettingsStatGrid>
				<SettingsStatCard label="站内告警" value="已启用" detail="所有告警都会写入告警中心" />
				<SettingsStatCard
					label="外部通道"
					value={webhooks.length ? `${webhooks.length} 个` : "未配置"}
					detail="推送到 ntfy、Telegram 等服务"
				/>
				<SettingsStatCard
					label="邮件通知"
					value={emailFormComplete(emailForm) ? "已配置" : "未配置"}
					detail={emailFormComplete(emailForm) ? emailForm.to : "配置 SMTP 后发送到邮箱"}
				/>
				<SettingsStatCard
					label="失败记录"
					value={failures.length ? `${failures.length} 条` : "无失败"}
					detail={failures.length ? `最近失败来自 ${failures[0].target}` : "通道恢复成功后自动清理"}
				/>
			</SettingsStatGrid>

			<Tabs value={tab} onValueChange={changeTab} className="grid gap-4">
				<TabsList className="w-fit" aria-label="通知设置">
					<TabsTrigger value="channels">通知通道</TabsTrigger>
					<TabsTrigger value="email">邮件通知</TabsTrigger>
				</TabsList>

				<TabsContent value="channels" className="mt-0 grid pulse-card-gap">
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

					<SettingsSection
						title="通知通道"
						description="添加 Shoutrrr URL 后，新告警会同时写入站内记录并推送到这些外部通道。"
						actions={
							<Button type="button" size="sm" onClick={() => setDialog({ index: null, url: "" })}>
								<PlusIcon className="me-1 size-4" />
								添加通道
							</Button>
						}
					>
						{channelRows.length ? (
							<div className="mt-3 grid gap-2">
								{channelRows.map((channel) => (
									<ChannelRow
										key={`${channel.url}-${channel.index}`}
										channel={channel}
										testing={testingUrl === channel.url}
										deleting={deletingUrl === channel.url}
										onEdit={() => setDialog({ index: channel.index, url: channel.url })}
										onTest={() => setTestTarget(channel)}
										onRemove={() => setDeleteTarget(channel)}
									/>
								))}
							</div>
						) : (
							<EmptyState
								loading={false}
								loadingText="正在读取通知通道"
								emptyText="还没有外部通知通道"
								description="告警仍会写入告警中心；需要推送到手机或聊天工具时再添加通道。"
								className="mt-3 min-h-24 bg-surface-soft"
							/>
						)}
						<div className="mt-3 rounded-lg border border-border/70 bg-surface-soft p-2.5 text-xs leading-relaxed text-muted-foreground shadow-none">
							<div className="flex items-center gap-1.5">
								<ExternalLinkIcon className="size-3.5" />
								<span>
									示例：<code>ntfy://topic</code>、<code>telegram://token@telegram?channels=id</code>、
									<code>generic+https://example.com/webhook</code>
								</span>
							</div>
						</div>
					</SettingsSection>

					<SettingsSection
						title="发送诊断"
						description="Hub 会持久记录每个通知通道的最近成功、最近失败和重复告警冷却情况。"
						actions={
							<Badge variant={activeCooldowns.length ? "warning" : "secondary"}>
								{activeCooldowns.length ? `冷却中 ${activeCooldowns.length} 条` : "无重复风暴"}
							</Badge>
						}
					>
						<div className="mt-3 grid gap-3 lg:grid-cols-2">
							<div className="grid gap-2 rounded-lg bg-surface-soft p-3 shadow-none">
								<div className="text-sm font-semibold">通道健康</div>
								{channelHealthItems.length ? (
									<div className="grid gap-2">
										{channelHealthItems.map((item) => (
											<div
												key={item.target}
												className="grid gap-1 rounded-md border border-border/70 bg-card p-2 text-xs shadow-none"
											>
												<div className="flex min-w-0 items-center justify-between gap-2">
													<div className="min-w-0">
														<div className="truncate text-sm font-medium">{item.label}</div>
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
										className="min-h-24"
									/>
								)}
							</div>

							<div className="grid gap-2 rounded-lg bg-surface-soft p-3 shadow-none">
								<div className="text-sm font-semibold">重复告警冷却</div>
								{activeCooldowns.length ? (
									<div className="grid gap-2">
										{activeCooldowns.map((item) => (
											<div
												key={`${item.title}-${item.nextAllowed}`}
												className="grid gap-1 rounded-md border border-border/70 bg-card p-2 text-xs shadow-none"
											>
												<div className="flex min-w-0 items-center justify-between gap-2">
													<div className="truncate text-sm font-medium">{item.title}</div>
													<Badge variant={statusBadgeVariant(item.statusTone)}>{item.statusLabel}</Badge>
												</div>
												{item.assetName && <div className="text-muted-foreground">资产：{item.assetName}</div>}
												<div className="text-muted-foreground">
													已抑制 {item.suppressedCount} 次，下一次允许发送：{item.nextAllowed ?? "等待冷却结束"}
												</div>
												{item.lastSuppressed && (
													<div className="text-muted-foreground">最近抑制：{item.lastSuppressed}</div>
												)}
											</div>
										))}
									</div>
								) : (
									<EmptyState
										loading={false}
										loadingText="正在读取冷却状态"
										emptyText="当前没有冷却中的重复告警"
										description="相同告警在短时间内重复出现时，Hub 会自动抑制外部通知并记录次数。"
										className="min-h-24"
									/>
								)}
							</div>
						</div>
					</SettingsSection>

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

					<div className="flex justify-end">
						<Button asChild variant="outline" className="transition-transform active:scale-[0.96]">
							<Link href={getPagePath($router, "alerts")}>
								<HistoryIcon className="size-4" />
								<span className="ms-1">查看告警记录</span>
							</Link>
						</Button>
					</div>
				</TabsContent>

				<TabsContent value="email" className="mt-0 grid pulse-card-gap">
					<SettingsSection
						title="邮件通知"
						description="配置 SMTP 邮箱后，重要告警（硬盘健康、在线离线、服务/软件/容器监控、网站监控、每日备份失败）会发送到你的邮箱；资源阈值类告警只写入站内告警中心。"
						actions={
							<Badge variant={emailFormComplete(emailForm) ? "success" : "outline"}>
								{emailFormComplete(emailForm) ? "已配置" : "未配置"}
							</Badge>
						}
					>
						<div className="mt-3 grid gap-x-6 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
							<SettingsField label="SMTP 服务器" htmlFor="email-host" description="例如 smtp.qq.com。">
								<Input
									id="email-host"
									value={emailForm.host}
									onChange={updateEmailField("host")}
									placeholder="smtp.qq.com"
									autoComplete="off"
								/>
							</SettingsField>
							<SettingsField label="端口" htmlFor="email-port" description="留空自动适配：465 隐式 TLS，587 STARTTLS。">
								<Input
									id="email-port"
									type="number"
									inputMode="numeric"
									min={0}
									max={65535}
									value={emailForm.port}
									onChange={updateEmailField("port")}
									placeholder="465 / 587"
									autoComplete="off"
								/>
							</SettingsField>
							<SettingsField label="用户名" htmlFor="email-username" description="通常为完整邮箱地址。">
								<Input
									id="email-username"
									value={emailForm.username}
									onChange={updateEmailField("username")}
									placeholder="user@qq.com"
									autoComplete="off"
								/>
							</SettingsField>
							<SettingsField label="授权码" htmlFor="email-password" description="不是邮箱登录密码。">
								<Input
									id="email-password"
									type="password"
									value={emailForm.password}
									onChange={updateEmailField("password")}
									placeholder="邮箱设置里生成的授权码"
									autoComplete="new-password"
								/>
							</SettingsField>
							<SettingsField label="发件人地址" htmlFor="email-from" description="与邮箱账号一致最稳妥。">
								<Input
									id="email-from"
									type="email"
									value={emailForm.from}
									onChange={updateEmailField("from")}
									placeholder="user@qq.com"
									autoComplete="off"
								/>
							</SettingsField>
							<SettingsField label="收件人地址" htmlFor="email-to" description="告警邮件发送到这个地址。">
								<Input
									id="email-to"
									type="email"
									value={emailForm.to}
									onChange={updateEmailField("to")}
									placeholder="receiver@example.com"
									autoComplete="off"
								/>
							</SettingsField>
						</div>

						<div className="mt-4 rounded-lg border border-border/70 bg-surface-soft p-2.5 text-xs leading-relaxed text-muted-foreground shadow-none">
							授权码不是邮箱登录密码：QQ 邮箱、163 邮箱等需要在邮箱设置的“账户”里开启 SMTP
							服务并生成授权码。端口留空时自动适配：465 端口使用隐式 TLS，587 等端口使用 STARTTLS。
						</div>

						<div className="mt-4 flex flex-wrap gap-2">
							<Button
								type="button"
								className="transition-transform active:scale-[0.96]"
								onClick={saveEmailSettings}
								disabled={savingEmail || testingEmail}
							>
								{savingEmail ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
								<span className="ms-1">{savingEmail ? "保存中…" : "保存邮件配置"}</span>
							</Button>
							<Button
								type="button"
								variant="outline"
								className="transition-transform active:scale-[0.96]"
								onClick={testEmailSettings}
								disabled={savingEmail || testingEmail}
							>
								{testingEmail ? <LoaderCircleIcon className="size-4 animate-spin" /> : <SendIcon className="size-4" />}
								<span className="ms-1">发送测试邮件</span>
							</Button>
						</div>

						{emailTestResult && (
							<Alert
								className={
									emailTestResult.ok
										? "mt-3 rounded-lg border-emerald-500/24 bg-card text-foreground shadow-none dark:border-emerald-300/18 dark:bg-card"
										: "mt-3 rounded-lg border-red-500/24 bg-card text-foreground shadow-none dark:border-red-300/18 dark:bg-card"
								}
							>
								{emailTestResult.ok ? (
									<CheckCircle2Icon className="size-4 text-emerald-600 dark:text-emerald-300" />
								) : (
									<AlertTriangleIcon className="size-4 text-red-600 dark:text-red-300" />
								)}
								<AlertTitle>{emailTestResult.ok ? "测试邮件已发送" : "测试邮件发送失败"}</AlertTitle>
								<AlertDescription className="grid gap-1">
									<span>
										{emailTestResult.message} · {emailTestResult.time}
									</span>
									<span className="break-all font-mono text-xs opacity-75">
										smtp://{emailForm.host.trim()}
										{emailForm.port ? `:${emailForm.port}` : ""}
									</span>
								</AlertDescription>
							</Alert>
						)}
					</SettingsSection>
				</TabsContent>
			</Tabs>

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
			<OperationConfirmDialog
				open={Boolean(deleteTarget)}
				onOpenChange={(open) => !open && !deletingUrl && setDeleteTarget(null)}
				title="确认删除通知通道"
				description="删除后新告警不再推送到这个通道，通道对应的失败诊断会一并清理。"
				confirmLabel="确认删除"
				confirmVariant="destructive"
				running={Boolean(deletingUrl)}
				progressTitle="正在删除通知通道"
				progressDescription="正在保存通道列表并清理发送诊断。"
				onConfirm={removeChannel}
			>
				{deleteTarget && (
					<div className="grid gap-1.5 text-sm">
						<div className="font-medium">{deleteTarget.label}</div>
						<div className="break-all font-mono text-xs text-muted-foreground">{deleteTarget.url}</div>
					</div>
				)}
			</OperationConfirmDialog>
		</div>
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
		<div className="rounded-lg border border-border/70 bg-card p-3 shadow-none transition-[background-color,border-color] hover:border-foreground/15 hover:bg-surface-soft">
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
								最近成功：{channel.health.last_success_at ? formatDateTime(channel.health.last_success_at) : "无记录"}
							</span>
							<span>
								最近失败：{channel.health.last_failure_at ? formatDateTime(channel.health.last_failure_at) : "无记录"}
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
							<div className="mt-1 text-muted-foreground">最后失败：{formatDateTime(channel.failure.updated)}</div>
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
		</div>
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
						保存
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
