import { BellIcon, BoxIcon, GlobeIcon, InfoIcon, MonitorCogIcon, SettingsIcon } from "lucide-react"
import { useMemo, useState, type ComponentType } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { alertInfo } from "@/lib/alerts"
import { cn } from "@/lib/utils"
import type { AlertPolicyRecord } from "@/types"

type AlertRuleDetail = {
	key: string
	kind: "resource" | "event"
	label: string
	description: string
	status: string
	enabled: boolean
	threshold: string
	scope: string
	updated?: string
	icon: ComponentType<{ className?: string }>
}

const resourceRuleCopy: Record<string, { label: string; description: string }> = {
	Status: {
		label: "离线告警",
		description: "机器离线并持续到规则时间后触发；新机器默认不加入告警，只有勾选加入告警后才会应用。",
	},
	CPU: {
		label: "CPU 使用率",
		description: "CPU 平均使用率超过阈值并持续到规则时间后触发。",
	},
	Memory: {
		label: "内存使用率",
		description: "内存平均使用率超过阈值并持续到规则时间后触发。",
	},
	Disk: {
		label: "磁盘使用率",
		description: "任一磁盘分区使用率超过阈值并持续到规则时间后触发。",
	},
	Temperature: {
		label: "温度",
		description: "任一温度传感器超过阈值并持续到规则时间后触发。",
	},
	Bandwidth: {
		label: "网络带宽",
		description: "上下行合计带宽超过阈值并持续到规则时间后触发。",
	},
	GPU: {
		label: "GPU 使用率",
		description: "GPU 平均使用率超过阈值并持续到规则时间后触发。",
	},
	LoadAvg1: {
		label: "1 分钟负载",
		description: "1 分钟系统负载超过阈值并持续到规则时间后触发。",
	},
	LoadAvg5: {
		label: "5 分钟负载",
		description: "5 分钟系统负载超过阈值并持续到规则时间后触发。",
	},
	LoadAvg15: {
		label: "15 分钟负载",
		description: "15 分钟系统负载超过阈值并持续到规则时间后触发。",
	},
	Battery: {
		label: "电池电量",
		description: "电池电量低于阈值并持续到规则时间后触发。",
	},
}

const eventRules: AlertRuleDetail[] = [
	{
		key: "website",
		kind: "event",
		label: "网站监控告警",
		description: "已配置的网站检测目标出现 DNS、TCP、TLS、HTTP、超时、内容校验或 IPv6 异常时触发。",
		status: "随网站监控启用",
		enabled: true,
		threshold: "以每个网站监控的真实检测结果为准",
		scope: "网站监控 / 多目标地址 / 内容校验",
		icon: GlobeIcon,
	},
	{
		key: "container",
		kind: "event",
		label: "容器告警",
		description: "容器停止、健康检查异常或 Compose 编排状态异常时触发。",
		status: "随容器监控启用",
		enabled: true,
		threshold: "以 Agent 采集到的容器运行状态为准",
		scope: "容器 / Compose 编排 / 健康检查",
		icon: BoxIcon,
	},
	{
		key: "software",
		kind: "event",
		label: "软件告警",
		description: "Windows 软件监控规则匹配到异常运行状态时触发。",
		status: "随软件规则启用",
		enabled: true,
		threshold: "以已配置的软件监控规则为准",
		scope: "Windows 软件 / 进程匹配",
		icon: MonitorCogIcon,
	},
	{
		key: "service",
		kind: "event",
		label: "服务告警",
		description: "Windows 服务监控规则匹配到异常服务状态时触发。",
		status: "随服务规则启用",
		enabled: true,
		threshold: "以已配置的服务监控规则为准",
		scope: "Windows 服务 / 服务状态",
		icon: SettingsIcon,
	},
]

const resourceRuleKeys = Object.keys(alertInfo)

export function AlertRulesOverview({
	policies,
	loading,
	onOpenSettings,
	compact = false,
	className,
}: {
	policies: AlertPolicyRecord[]
	loading: boolean
	onOpenSettings?: () => void
	compact?: boolean
	className?: string
}) {
	const [selectedRule, setSelectedRule] = useState<AlertRuleDetail | null>(null)
	const resourceRules = useMemo(() => buildResourceRuleDetails(policies), [policies])
	const enabledResourceCount = resourceRules.filter((rule) => rule.enabled).length
	const disabledResourceCount = resourceRules.length - enabledResourceCount

	return (
		<div className={cn("grid min-w-0 gap-4", className)}>
			<div className="grid gap-3 sm:grid-cols-3">
				<RuleMetric label="资源规则" value={loading ? "读取中" : `${enabledResourceCount} 项`} tone="success" />
				<RuleMetric label="未启用资源" value={loading ? "..." : `${disabledResourceCount} 项`} />
				<RuleMetric label="事件类告警" value={`${eventRules.length} 类`} tone="info" />
			</div>

			<section className="grid min-w-0 gap-2.5">
				<div className="flex min-w-0 items-start justify-between gap-3">
					<div className="min-w-0">
						<h3 className="text-sm font-semibold">资源阈值规则</h3>
						<p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
							这里只读展示已保存的全局资源规则，修改阈值请进入告警设置。
						</p>
					</div>
					{onOpenSettings && (
						<Button type="button" variant="outline" size="sm" className="shrink-0" onClick={onOpenSettings}>
							调整规则
						</Button>
					)}
				</div>
				<div className={cn("grid min-w-0 gap-2", compact ? "sm:grid-cols-2" : "md:grid-cols-2")}>
					{resourceRules.map((rule) => (
						<RuleCard key={rule.key} rule={rule} onClick={() => setSelectedRule(rule)} />
					))}
				</div>
			</section>

			<section className="grid min-w-0 gap-2.5">
				<div className="min-w-0">
					<h3 className="text-sm font-semibold">事件类告警</h3>
					<p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
						这些告警由对应监控对象的真实结果触发，不使用全局资源阈值。
					</p>
				</div>
				<div className={cn("grid min-w-0 gap-2", compact ? "sm:grid-cols-2" : "md:grid-cols-2")}>
					{eventRules.map((rule) => (
						<RuleCard key={rule.key} rule={rule} onClick={() => setSelectedRule(rule)} />
					))}
				</div>
			</section>

			<RuleDetailSheet
				rule={selectedRule}
				compact={compact}
				onOpenChange={(open) => {
					if (!open) {
						setSelectedRule(null)
					}
				}}
			/>
		</div>
	)
}

function RuleMetric({ label, value, tone }: { label: string; value: string; tone?: "success" | "info" }) {
	return (
		<div className="rounded-lg border border-border/70 bg-card p-3 shadow-none">
			<div className="text-xs text-muted-foreground">{label}</div>
			<div
				className={cn(
					"mt-1 text-lg font-semibold tabular-nums",
					tone === "success" && "text-emerald-700 dark:text-emerald-300",
					tone === "info" && "text-sky-700 dark:text-sky-300"
				)}
			>
				{value}
			</div>
		</div>
	)
}

function RuleCard({ rule, onClick }: { rule: AlertRuleDetail; onClick: () => void }) {
	const Icon = rule.icon
	return (
		<button
			type="button"
			className="grid min-w-0 gap-2 rounded-lg border border-border/70 bg-card p-3 text-left shadow-none transition-[background-color,border-color,transform] duration-150 ease-out hover:border-foreground/15 hover:bg-surface-soft active:scale-[0.96]"
			onClick={onClick}
		>
			<div className="flex min-w-0 items-center justify-between gap-3">
				<div className="flex min-w-0 items-center gap-2">
					<span className="grid size-8 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft text-muted-foreground">
						<Icon className="size-4" />
					</span>
					<div className="min-w-0">
						<div className="truncate text-sm font-semibold">{rule.label}</div>
						<div className="truncate text-xs text-muted-foreground">{rule.scope}</div>
					</div>
				</div>
				<Badge variant={rule.enabled ? "success" : "secondary"} className="shrink-0">
					{rule.status}
				</Badge>
			</div>
			<div className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{rule.threshold}</div>
		</button>
	)
}

function RuleDetailSheet({
	rule,
	compact,
	onOpenChange,
}: {
	rule: AlertRuleDetail | null
	compact: boolean
	onOpenChange: (open: boolean) => void
}) {
	const Icon = rule?.icon ?? InfoIcon
	return (
		<Sheet open={Boolean(rule)} onOpenChange={onOpenChange}>
			<SheetContent
				side={compact ? "bottom" : "right"}
				className={cn(
					"overflow-y-auto p-0",
					compact ? "max-h-[82dvh] rounded-t-2xl" : "w-[min(560px,calc(100vw-1rem))] sm:max-w-none"
				)}
			>
				<SheetHeader className="border-b border-border/70 px-4 py-4 sm:px-6">
					<SheetTitle className="flex items-center gap-2">
						<Icon className="size-4 text-muted-foreground" />
						{rule?.label ?? "告警规则详情"}
					</SheetTitle>
					<SheetDescription>{rule?.description ?? ""}</SheetDescription>
				</SheetHeader>
				{rule && (
					<div className="grid gap-3 px-4 py-4 text-sm sm:px-6">
						<DetailRow label="状态" value={rule.status} />
						<DetailRow label="类型" value={rule.kind === "resource" ? "资源阈值" : "事件结果"} />
						<DetailRow label="触发条件" value={rule.threshold} />
						<DetailRow label="覆盖范围" value={rule.scope} />
						{rule.updated && <DetailRow label="更新时间" value={formatDate(rule.updated)} />}
						<div className="rounded-lg border border-border/70 bg-card p-3 text-xs leading-relaxed text-muted-foreground shadow-none">
							<BellIcon className="mr-1.5 inline size-3.5 align-[-2px]" />
							触发后会先写入告警中心；如果配置了外部通知通道，再按当前用户的通知设置发送。已静默的同一未恢复告警不会重复推送。
						</div>
					</div>
				)}
			</SheetContent>
		</Sheet>
	)
}

function DetailRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="grid gap-1 rounded-lg border border-border/70 bg-card px-3 py-2 shadow-none">
			<div className="text-xs text-muted-foreground">{label}</div>
			<div className="break-words font-medium tabular-nums">{value}</div>
		</div>
	)
}

function buildResourceRuleDetails(policies: AlertPolicyRecord[]): AlertRuleDetail[] {
	const policyByName = new Map(policies.map((policy) => [policy.name, policy]))
	return resourceRuleKeys.map((key) => {
		const info = alertInfo[key]
		const policy = policyByName.get(key)
		const copy = resourceRuleCopy[key] ?? { label: info.name(), description: info.desc() }
		return {
			key,
			kind: "resource",
			label: copy.label,
			description: copy.description,
			status: policy ? "已启用" : "未启用",
			enabled: Boolean(policy),
			threshold: policy ? formatResourceThreshold(key, policy) : "未启用全局规则",
			scope: key === "Status" ? "加入告警的机器" : "所有已接入机器",
			updated: policy?.updated,
			icon: info.icon,
		}
	})
}

function formatResourceThreshold(key: string, policy: AlertPolicyRecord) {
	if (key === "Status") {
		return `机器离线持续 ${policy.min} 分钟`
	}
	const info = alertInfo[key]
	const value = formatPolicyValue(policy.value, info.unit)
	const direction = info.invert ? "平均低于" : "平均超过"
	return `${direction} ${value} 持续 ${policy.min} 分钟`
}

function formatPolicyValue(value: number, unit: string) {
	const normalized = Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "")
	return `${normalized}${unit}`.trim()
}

function formatDate(value: string) {
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) {
		return value
	}
	return date.toLocaleString("zh-CN", { hour12: false })
}
