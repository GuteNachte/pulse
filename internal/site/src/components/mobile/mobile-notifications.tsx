import { AlertTriangleIcon, BellIcon, CheckCircle2Icon, PencilIcon, PlusIcon, SendIcon, Trash2Icon } from "lucide-react"
import { Link } from "@/components/router"
import { Button } from "@/components/ui/button"
import {
	MobileEmptyState,
	MobileList,
	MobileListItem,
	MobileSection,
	MobileStatusTag,
	type MobileStatusTone,
} from "./mobile-ui"

export type MobileNotificationStat = {
	title: string
	value: string
	tone: MobileStatusTone
	description: string
}

export type MobileNotificationFailureSummary = {
	target: string
	count: number
}

export type MobileNotificationTestResult = {
	status: "success" | "error"
	label: string
	target: string
	message: string
	time: string
}

export type MobileNotificationPermissionSummary = {
	label: string
	tone: MobileStatusTone
	description: string
}

export type MobileNotificationChannelItem = {
	index: number
	url: string
	label: string
	target: string
	statusLabel: string
	statusTone: MobileStatusTone
	failureCount?: number
	failureTitle?: string
	failureError?: string
	failureUpdated?: string
	lastSuccess?: string
	lastTest?: string
}

export type MobileNotificationChannelHealthItem = {
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

export type MobileAlertCooldownItem = {
	title: string
	statusLabel: string
	statusTone: MobileStatusTone
	suppressedCount: number
	lastSuppressed?: string
	nextAllowed?: string
}

export function MobileNotificationsView({
	stats,
	channels,
	channelHealth,
	activeCooldowns,
	notificationPermission,
	latestFailure,
	testResult,
	alertsHref,
	testingUrl,
	deletingUrl,
	onAdd,
	onEdit,
	onTest,
	onRemove,
}: {
	stats: MobileNotificationStat[]
	channels: MobileNotificationChannelItem[]
	channelHealth: MobileNotificationChannelHealthItem[]
	activeCooldowns: MobileAlertCooldownItem[]
	notificationPermission: MobileNotificationPermissionSummary
	latestFailure?: MobileNotificationFailureSummary | null
	testResult?: MobileNotificationTestResult | null
	alertsHref: string
	testingUrl: string | null
	deletingUrl: string | null
	onAdd: () => void
	onEdit: (channel: MobileNotificationChannelItem) => void
	onTest: (channel: MobileNotificationChannelItem) => void
	onRemove: (channel: MobileNotificationChannelItem) => void
}) {
	return (
		<div className="grid gap-4 md:hidden">
			<div className="grid grid-cols-2 gap-2">
				{stats.map((stat) => (
					<div key={stat.title} className="rounded-lg border border-border/70 bg-card p-3 shadow-none">
						<div className="truncate text-[11px] text-muted-foreground">{stat.title}</div>
						<div className="mt-1.5">
							<MobileStatusTag tone={stat.tone}>{stat.value}</MobileStatusTag>
						</div>
						<div className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground sm:line-clamp-1">
							{stat.description}
						</div>
					</div>
				))}
			</div>

			<section className="grid gap-2 rounded-lg border border-border/70 bg-surface-soft p-3">
				<div className="flex min-w-0 items-center justify-between gap-2">
					<div className="flex items-center gap-2 text-sm font-medium">
						<BellIcon className="size-4 text-primary" />
						手机通知
					</div>
					<MobileStatusTag tone={notificationPermission.tone}>{notificationPermission.label}</MobileStatusTag>
				</div>
				<p className="text-xs leading-relaxed text-muted-foreground">
					Android App 打开或后台 WebView 仍存活时，新告警会转为系统通知。App 被系统完全结束后不承诺收到通知。
				</p>
				<p className="text-xs leading-relaxed text-muted-foreground">{notificationPermission.description}</p>
			</section>

			{latestFailure && (
				<section className="grid gap-2 rounded-lg border border-border/70 bg-card p-3 text-muted-foreground">
					<div className="flex items-center gap-2 text-sm font-medium">
						<AlertTriangleIcon className="size-4 text-amber-600 dark:text-amber-300" />
						存在外部通知失败
					</div>
					<p className="text-xs leading-relaxed">
						最近失败来自 {latestFailure.target}，已连续失败 {latestFailure.count} 次。请检查通道
						URL、网络和目标服务状态。
					</p>
				</section>
			)}

			{testResult && (
				<section
					className={
						testResult.status === "success"
							? "grid gap-2 rounded-lg border border-border/70 bg-card p-3 text-muted-foreground"
							: "grid gap-2 rounded-lg border border-border/70 bg-card p-3 text-muted-foreground"
					}
				>
					<div className="flex items-center gap-2 text-sm font-medium">
						{testResult.status === "success" ? (
							<CheckCircle2Icon className="size-4 text-emerald-600 dark:text-emerald-300" />
						) : (
							<AlertTriangleIcon className="size-4 text-red-600 dark:text-red-300" />
						)}
						最近测试：{testResult.label}
					</div>
					<p className="text-xs leading-relaxed">
						{testResult.message} · {testResult.time}
					</p>
					<div className="truncate font-mono text-[11px] text-muted-foreground">{testResult.target}</div>
				</section>
			)}

			<MobileSection
				title="通知通道"
				count={`${channels.length} 个`}
				action={
					<Button type="button" size="sm" className="min-h-10 px-3 text-xs" onClick={onAdd}>
						<PlusIcon className="me-1.5 size-3.5" />
						添加
					</Button>
				}
			>
				{channels.length ? (
					<MobileList>
						{channels.map((channel) => (
							<MobileNotificationChannelCard
								key={`${channel.url}-${channel.index}`}
								channel={channel}
								testing={testingUrl === channel.url}
								deleting={deletingUrl === channel.url}
								onEdit={() => onEdit(channel)}
								onTest={() => onTest(channel)}
								onRemove={() => onRemove(channel)}
							/>
						))}
					</MobileList>
				) : (
					<MobileEmptyState>
						还没有外部通知通道。告警仍会写入告警中心；需要推送到手机或聊天工具时再添加通道。
					</MobileEmptyState>
				)}
			</MobileSection>

			<MobileNotificationDiagnostics channelHealth={channelHealth} activeCooldowns={activeCooldowns} />

			<div className="rounded-lg border border-border/70 bg-surface-soft p-3 text-xs leading-relaxed text-muted-foreground shadow-none">
				<div className="font-medium text-foreground">通道 URL 示例</div>
				<div className="mt-2 grid gap-1.5">
					<code className="truncate rounded-md bg-card px-2 py-1.5 font-mono">ntfy://topic</code>
					<code className="truncate rounded-md bg-card px-2 py-1.5 font-mono">
						telegram://token@telegram?channels=id
					</code>
					<code className="truncate rounded-md bg-card px-2 py-1.5 font-mono">generic+https://example.com/webhook</code>
				</div>
			</div>

			<Button asChild variant="outline" className="min-h-11 justify-center">
				<Link href={alertsHref}>查看告警记录</Link>
			</Button>
		</div>
	)
}

function MobileNotificationChannelCard({
	channel,
	testing,
	deleting,
	onEdit,
	onTest,
	onRemove,
}: {
	channel: MobileNotificationChannelItem
	testing: boolean
	deleting: boolean
	onEdit: () => void
	onTest: () => void
	onRemove: () => void
}) {
	return (
		<MobileListItem>
			<div className="flex min-w-0 items-start justify-between gap-3">
				<div className="min-w-0 flex-1">
					<div className="truncate text-[15px] font-semibold">{channel.label}</div>
					<div className="mt-1 truncate font-mono text-xs text-muted-foreground">{channel.target}</div>
				</div>
				<MobileStatusTag tone={channel.statusTone}>{channel.statusLabel}</MobileStatusTag>
			</div>
			{channel.failureTitle && (
				<div className="mt-3 rounded-md border border-border/70 bg-surface-soft p-2 text-xs leading-relaxed text-muted-foreground">
					<div className="font-medium">
						{channel.failureTitle}
						{channel.failureCount ? ` · 失败 ${channel.failureCount} 次` : ""}
					</div>
					<div className="mt-1 break-words">{channel.failureError}</div>
					{channel.failureUpdated && <div className="mt-1 opacity-75">最后失败：{channel.failureUpdated}</div>}
				</div>
			)}
			{(channel.lastSuccess || channel.lastTest) && (
				<div className="mt-3 grid gap-1 text-[11px] text-muted-foreground">
					{channel.lastSuccess && <div>最近成功：{channel.lastSuccess}</div>}
					{channel.lastTest && <div>最近测试：{channel.lastTest}</div>}
				</div>
			)}
			<div className="mt-3 grid grid-cols-3 gap-2">
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="min-h-10 justify-center"
					onClick={onTest}
					disabled={testing || deleting}
				>
					<SendIcon className="me-1.5 size-4" />
					{testing ? "测试中" : "测试"}
				</Button>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="min-h-10 justify-center"
					onClick={onEdit}
					disabled={testing || deleting}
				>
					<PencilIcon className="me-1.5 size-4" />
					编辑
				</Button>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="min-h-10 justify-center text-destructive hover:text-destructive"
					onClick={onRemove}
					disabled={testing || deleting}
				>
					<Trash2Icon className="me-1.5 size-4" />
					{deleting ? "删除中" : "删除"}
				</Button>
			</div>
		</MobileListItem>
	)
}

function MobileNotificationDiagnostics({
	channelHealth,
	activeCooldowns,
}: {
	channelHealth: MobileNotificationChannelHealthItem[]
	activeCooldowns: MobileAlertCooldownItem[]
}) {
	return (
		<MobileSection title="发送诊断" count={activeCooldowns.length ? `冷却 ${activeCooldowns.length}` : "无冷却"}>
			<div className="grid gap-2">
				<div className="rounded-lg bg-surface-soft p-3 shadow-none">
					<div className="mb-2 text-sm font-medium">通道健康</div>
					{channelHealth.length ? (
						<div className="grid gap-2">
							{channelHealth.map((item) => (
								<div key={item.target} className="grid gap-1 rounded-md bg-card p-2 shadow-none">
									<div className="flex min-w-0 items-center justify-between gap-2">
										<div className="min-w-0">
											<div className="truncate text-sm font-medium">{item.label}</div>
											<div className="truncate font-mono text-[11px] text-muted-foreground">{item.target}</div>
										</div>
										<MobileStatusTag tone={item.statusTone}>{item.statusLabel}</MobileStatusTag>
									</div>
									<div className="grid gap-1 text-[11px] text-muted-foreground">
										<div>最近成功：{item.lastSuccess ?? "无记录"}</div>
										<div>最近失败：{item.lastFailure ?? "无记录"}</div>
										<div>测试时间：{item.lastTest ?? "未测试"}</div>
										<div>
											成功 {item.successCount} 次 / 失败 {item.failureCount} 次
										</div>
									</div>
									{item.lastError && (
										<div className="break-words text-[11px] leading-relaxed text-amber-800 dark:text-amber-200">
											{item.lastError}
										</div>
									)}
								</div>
							))}
						</div>
					) : (
						<MobileEmptyState className="min-h-20 text-xs">
							还没有通道健康记录。发送告警或点击测试后，这里会显示真实诊断。
						</MobileEmptyState>
					)}
				</div>

				<div className="rounded-lg bg-surface-soft p-3 shadow-none">
					<div className="mb-2 text-sm font-medium">重复告警冷却</div>
					{activeCooldowns.length ? (
						<div className="grid gap-2">
							{activeCooldowns.map((item) => (
								<div
									key={`${item.title}-${item.nextAllowed}`}
									className="grid gap-1 rounded-md bg-card p-2 shadow-none"
								>
									<div className="flex min-w-0 items-center justify-between gap-2">
										<div className="truncate text-sm font-medium">{item.title}</div>
										<MobileStatusTag tone={item.statusTone}>{item.statusLabel}</MobileStatusTag>
									</div>
									<div className="text-[11px] text-muted-foreground">
										已抑制 {item.suppressedCount} 次，下一次允许发送：{item.nextAllowed ?? "等待冷却结束"}
									</div>
									{item.lastSuppressed && (
										<div className="text-[11px] text-muted-foreground">最近抑制：{item.lastSuppressed}</div>
									)}
								</div>
							))}
						</div>
					) : (
						<MobileEmptyState className="min-h-20 text-xs">当前没有冷却中的重复告警。</MobileEmptyState>
					)}
				</div>
			</div>
		</MobileSection>
	)
}
