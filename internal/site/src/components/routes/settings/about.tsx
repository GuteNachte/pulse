import {
	ActivityIcon,
	AppWindowIcon,
	CalendarClockIcon,
	ChevronDownIcon,
	GitCommitHorizontalIcon,
	Globe2Icon,
	InfoIcon,
	RocketIcon,
	ServerIcon,
	ShieldCheckIcon,
	SmartphoneIcon,
} from "lucide-react"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import sitePackage from "../../../../package.json" with { type: "json" }
import { MobileAndroidHubUrlCard, MobileReleaseBadges } from "@/components/mobile/mobile-about-settings"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/use-toast"
import { AGENT_VERSION } from "@/lib/agent-install"
import { saveAndUseHubUrl } from "@/lib/api"
import { APP_NAME } from "@/lib/branding"
import { checkMobileSecureStorage, getRuntimeEnvironment, type MobileSecureStorageStatus } from "@/lib/mobile-runtime"
import { fetchPulseInfo, syncAgentHubURLFromRuntime } from "@/lib/runtime-info"
import { cn } from "@/lib/utils"
import type { AgentVersionSummary, PulseInfo, PulseReadinessCheck, PulseReadinessStatus } from "@/types"
import { releaseHistory, type ReleaseNote } from "./release-history"

const WEB_VERSION = sitePackage.version

export default function About() {
	const info = getRuntimeInfo()
	const runtimeEnvironment = getRuntimeEnvironment()
	const [pulseInfo, setPulseInfo] = useState<PulseInfo | null>(null)
	const [hubVersion, setHubVersion] = useState(info?.HUB_VERSION || WEB_VERSION)
	const [hubUrl, setHubUrl] = useState(getInitialHubUrl(info))
	const [editingHubUrl, setEditingHubUrl] = useState(hubUrl)
	const [savingHubUrl, setSavingHubUrl] = useState(false)
	const [readinessChecks, setReadinessChecks] = useState<PulseReadinessCheck[]>([])
	const [hubConnectionState, setHubConnectionState] = useState<"checking" | "ok" | "failed">("checking")
	const [secureStorageStatus, setSecureStorageStatus] = useState<MobileSecureStorageStatus | null>(null)
	const runtimeLabel = `${runtimeEnvironmentLabel(runtimeEnvironment)} / ${hubEnvironmentLabel(pulseInfo?.environment)}`
	const agentActualVersions = formatAgentActualVersions(
		pulseInfo?.agent_actual_versions,
		pulseInfo?.agent_total_systems,
		pulseInfo?.agent_online_systems
	)
	const versionItems = useMemo(
		() => [
			{ label: "Web", value: WEB_VERSION, icon: AppWindowIcon, description: "前端包版本" },
			{ label: "Hub", value: hubVersion, icon: ServerIcon, description: "后端运行版本" },
			{
				label: "Agent",
				value: pulseInfo?.agent_target_version || AGENT_VERSION,
				icon: RocketIcon,
				description: "目标版本",
			},
			{ label: "Android", value: WEB_VERSION, icon: SmartphoneIcon, description: "App 同步版本" },
		],
		[hubVersion, pulseInfo?.agent_target_version]
	)

	useEffect(() => {
		let ignore = false
		fetchPulseInfo()
			.then((runtimeInfo) => {
				if (ignore) {
					return
				}
				setPulseInfo(runtimeInfo)
				setHubConnectionState("ok")
				setHubVersion(runtimeInfo.v || info?.HUB_VERSION || WEB_VERSION)
				const nextHubUrl = runtimeInfo.agent_hub_url || getInitialHubUrl(info)
				setHubUrl(nextHubUrl)
				setEditingHubUrl(nextHubUrl)
				setReadinessChecks(runtimeInfo.readiness ?? [])
			})
			.catch(() =>
				syncAgentHubURLFromRuntime()
					.then((runtimeInfo) => {
						if (ignore) {
							return
						}
						setPulseInfo(runtimeInfo)
						setHubConnectionState("ok")
						setHubVersion(runtimeInfo.v || info?.HUB_VERSION || WEB_VERSION)
						const nextHubUrl = runtimeInfo.agent_hub_url || getInitialHubUrl(info)
						setHubUrl(nextHubUrl)
						setEditingHubUrl(nextHubUrl)
						setReadinessChecks([])
					})
					.catch(() => {
						if (!ignore) {
							setHubConnectionState("failed")
						}
					})
			)
		return () => {
			ignore = true
		}
	}, [info])

	useEffect(() => {
		if (runtimeEnvironment !== "android") {
			setSecureStorageStatus(null)
			return
		}
		let ignore = false
		checkMobileSecureStorage()
			.then((status) => {
				if (!ignore) {
					setSecureStorageStatus(status)
				}
			})
			.catch(() => {
				if (!ignore) {
					setSecureStorageStatus({
						state: "failed",
						label: "不可用",
						description: "安全存储检测失败，请检查 Android 插件初始化。",
					})
				}
			})
		return () => {
			ignore = true
		}
	}, [runtimeEnvironment])

	return (
		<div className="grid gap-4 md:gap-5">
			<section className="overflow-hidden rounded-lg border border-border/70 bg-surface-soft">
				<div className="border-b border-border/70 bg-card px-4 py-4 sm:px-5">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
						<div className="flex min-w-0 gap-3">
							<div className="grid size-10 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft text-muted-foreground">
								<InfoIcon className="size-4" />
							</div>
							<div className="min-w-0">
								<div className="text-xs font-medium text-muted-foreground">版本与运行信息</div>
								<h3 className="mt-1 text-xl font-semibold tracking-tight text-foreground">关于 {APP_NAME}</h3>
								<p className="mt-1 max-w-3xl text-pretty text-sm leading-relaxed text-muted-foreground">
									查看 Web、Hub、Agent 和 Android App 的同版本状态，以及当前 Hub 运行环境和构建信息。
								</p>
							</div>
						</div>
						<div className="flex flex-wrap gap-1.5 sm:justify-end">
							<Badge
								variant={
									hubConnectionState === "ok" ? "success" : hubConnectionState === "failed" ? "danger" : "outline"
								}
							>
								{hubConnectionState === "ok"
									? "Hub 已连接"
									: hubConnectionState === "failed"
										? "Hub 连接失败"
										: "读取中"}
							</Badge>
							<Badge variant="secondary">{runtimeEnvironmentLabel(runtimeEnvironment)}</Badge>
						</div>
					</div>
				</div>

				<div className="grid gap-4 p-3 sm:p-4">
					<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
						{versionItems.map((item) => (
							<VersionSummaryCard key={item.label} {...item} />
						))}
					</div>

					<section className="grid gap-3 rounded-lg border border-border/70 bg-surface-soft p-3 shadow-none sm:p-4">
						<div className="flex min-w-0 items-center gap-2">
							<span className="grid size-8 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft">
								<ActivityIcon className="size-4 text-muted-foreground" />
							</span>
							<div className="min-w-0">
								<div className="text-sm font-semibold">运行诊断</div>
								<p className="text-xs text-muted-foreground">以下字段来自运行时接口或前端构建注入，不用静态占位。</p>
							</div>
						</div>
						<div className="grid gap-2 lg:grid-cols-2">
							<InfoRow label="Agent 实际版本" value={agentActualVersions} icon={<RocketIcon className="size-4" />} />
							<InfoRow label="运行环境" value={runtimeLabel} icon={<Globe2Icon className="size-4" />} />
							<InfoRow
								label="构建提交"
								value={formatBuildValue(pulseInfo?.build_commit || info?.BUILD_COMMIT)}
								icon={<GitCommitHorizontalIcon className="size-4" />}
							/>
							<InfoRow
								label="构建时间"
								value={formatBuildValue(pulseInfo?.build_time || info?.BUILD_TIME)}
								icon={<CalendarClockIcon className="size-4" />}
							/>
							<InfoRow
								label="Hub 地址"
								value={hubUrl}
								icon={<ServerIcon className="size-4" />}
								className="lg:col-span-2"
							/>
						</div>
					</section>
				</div>
			</section>

			{runtimeEnvironment === "android" && (
				<MobileAndroidHubUrlCard
					value={editingHubUrl}
					saving={savingHubUrl}
					diagnostics={[
						getHubConnectionDiagnostic(hubConnectionState),
						getSecureStorageDiagnostic(secureStorageStatus),
					]}
					onChange={setEditingHubUrl}
					onSave={() => {
						setSavingHubUrl(true)
						saveAndUseHubUrl(editingHubUrl)
							.then((value) => {
								setHubConnectionState("ok")
								setHubUrl(value)
								setEditingHubUrl(value)
								toast({ title: "Hub 地址已更新", description: value })
							})
							.catch((error) => {
								setHubConnectionState("failed")
								toast({
									title: "Hub 地址保存失败",
									description: error instanceof Error ? error.message : "请检查地址格式。",
									variant: "destructive",
								})
							})
							.finally(() => setSavingHubUrl(false))
					}}
				/>
			)}

			{readinessChecks.length > 0 && <ReadinessChecks checks={readinessChecks} />}

			<section className="grid gap-3 rounded-lg border border-border/70 bg-surface-soft p-3 sm:p-4">
				<div className="rounded-lg border border-border/70 bg-surface-soft p-3 shadow-none sm:p-4">
					<div className="flex min-w-0 items-center gap-2">
						<span className="grid size-8 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft">
							<ShieldCheckIcon className="size-4 text-muted-foreground" />
						</span>
						<div className="min-w-0">
							<h4 className="text-base font-semibold">版本更新记录</h4>
							<p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
								按 Web / Hub、Android App、Agent、部署和版本规则分组记录每个版本的实际改动。
							</p>
						</div>
					</div>
				</div>
				<div className="grid gap-3">
					{releaseHistory.map((release, index) => (
						<ReleaseNoteCard key={release.version} release={release} defaultOpen={index === 0} />
					))}
				</div>
			</section>
		</div>
	)
}

function VersionSummaryCard({
	label,
	value,
	description,
	icon: Icon,
}: {
	label: string
	value: string
	description: string
	icon: typeof AppWindowIcon
}) {
	return (
		<div className="rounded-lg border border-border/70 bg-card p-3 shadow-none">
			<div className="flex min-w-0 items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="text-xs font-medium text-muted-foreground">{label}</div>
					<div className="mt-1 truncate text-lg font-semibold tracking-tight tabular-nums text-foreground">{value}</div>
					<div className="mt-1 text-xs text-muted-foreground">{description}</div>
				</div>
				<div className="grid size-9 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft text-muted-foreground">
					<Icon className="size-4" />
				</div>
			</div>
		</div>
	)
}

function getHubConnectionDiagnostic(state: "checking" | "ok" | "failed") {
	if (state === "ok") {
		return {
			label: "Hub 连接",
			value: "已连接",
			tone: "success" as const,
			description: "已从当前 Hub 读取运行信息。",
		}
	}
	if (state === "failed") {
		return {
			label: "Hub 连接",
			value: "失败",
			tone: "danger" as const,
			description: "当前地址无法读取 Hub 运行信息，请检查地址、端口和网络连通性。",
		}
	}
	return {
		label: "Hub 连接",
		value: "检测中",
		tone: "neutral" as const,
		description: "正在读取 Hub 运行信息。",
	}
}

function getSecureStorageDiagnostic(status: MobileSecureStorageStatus | null) {
	if (!status) {
		return {
			label: "登录态存储",
			value: "检测中",
			tone: "neutral" as const,
			description: "正在检测 Android 安全存储。",
		}
	}
	return {
		label: "登录态存储",
		value: status.label,
		tone: secureStorageTone(status.state),
		description: status.description,
	}
}

function secureStorageTone(state: MobileSecureStorageStatus["state"]) {
	if (state === "secure") return "success" as const
	if (state === "fallback") return "warning" as const
	if (state === "failed") return "danger" as const
	return "neutral" as const
}

function ReadinessChecks({ checks }: { checks: PulseReadinessCheck[] }) {
	const counts = checks.reduce<Record<PulseReadinessStatus, number>>(
		(acc, check) => {
			acc[check.status] += 1
			return acc
		},
		{ ok: 0, warning: 0, danger: 0, unknown: 0, info: 0 }
	)
	return (
		<section className="grid gap-3 rounded-lg border border-border/70 bg-surface-soft p-3 sm:p-4">
			<div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border/70 bg-card p-3 sm:p-4">
				<div className="min-w-0">
					<h4 className="text-base font-semibold">上线自检</h4>
					<p className="mt-1 text-sm leading-relaxed text-muted-foreground">
						只展示 Hub 实际检测到的运行时配置；待校验项需要在发布脚本里确认。
					</p>
				</div>
				<div className="flex flex-wrap gap-1.5">
					{counts.danger > 0 && <Badge variant="danger">危险 {counts.danger}</Badge>}
					{counts.warning > 0 && <Badge variant="warning">注意 {counts.warning}</Badge>}
					{counts.unknown > 0 && <Badge variant="outline">待校验 {counts.unknown}</Badge>}
					{counts.ok > 0 && <Badge variant="success">通过 {counts.ok}</Badge>}
				</div>
			</div>
			<div className="grid gap-2 lg:grid-cols-2">
				{checks.map((check) => (
					<div key={check.id} className="grid gap-2 rounded-lg border border-border/70 bg-card px-4 py-3">
						<div className="flex min-w-0 items-center justify-between gap-2">
							<div className="min-w-0 truncate text-sm font-medium">{check.title}</div>
							<Badge variant={readinessBadgeVariant(check.status)}>{readinessStatusLabel(check.status)}</Badge>
						</div>
						{check.detail && <p className="text-sm leading-relaxed text-muted-foreground">{check.detail}</p>}
					</div>
				))}
			</div>
		</section>
	)
}

function readinessBadgeVariant(status: PulseReadinessStatus): "success" | "warning" | "danger" | "outline" {
	switch (status) {
		case "ok":
			return "success"
		case "warning":
			return "warning"
		case "danger":
			return "danger"
		default:
			return "outline"
	}
}

function readinessStatusLabel(status: PulseReadinessStatus) {
	switch (status) {
		case "ok":
			return "通过"
		case "warning":
			return "注意"
		case "danger":
			return "危险"
		case "info":
			return "信息"
		default:
			return "待校验"
	}
}

function runtimeEnvironmentLabel(environment: string) {
	switch (environment) {
		case "android":
			return "Android App"
		case "pwa":
			return "PWA"
		default:
			return "Web"
	}
}

function hubEnvironmentLabel(environment?: string) {
	switch (environment) {
		case "development":
			return "Hub 开发构建"
		case "production":
			return "Hub 生产构建"
		default:
			return "Hub 环境未读取"
	}
}

function formatBuildValue(value?: string) {
	const normalized = value?.trim()
	if (!normalized || normalized === "unknown") {
		return "未注入"
	}
	return normalized
}

function formatAgentActualVersions(versions?: AgentVersionSummary[], total = 0, online = 0) {
	if (!versions) {
		return "未读取"
	}
	if (total <= 0 || versions.length === 0) {
		return "暂无已确认 Agent"
	}
	const details = versions
		.map((item) => {
			const version = item.version || "未上报"
			if (item.online > 0) {
				return `${version}：${item.online}/${item.count} 台在线`
			}
			return `${version}：${item.count} 台`
		})
		.join("；")
	return `${online}/${total} 台在线，${details}`
}

function InfoRow({
	label,
	value,
	icon,
	className,
}: {
	label: string
	value: string
	icon?: ReactNode
	className?: string
}) {
	return (
		<div
			className={cn("flex min-w-0 items-start gap-3 rounded-lg border border-border/70 bg-surface-soft p-3", className)}
		>
			{icon && (
				<div className="grid size-8 shrink-0 place-items-center rounded-md border border-border/70 bg-card text-muted-foreground">
					{icon}
				</div>
			)}
			<div className="min-w-0">
				<div className="text-xs font-medium text-muted-foreground">{label}</div>
				<div className="mt-1 min-w-0 break-words text-sm font-semibold leading-relaxed tabular-nums text-foreground">
					{value}
				</div>
			</div>
		</div>
	)
}

function getRuntimeInfo() {
	const info = globalThis.PULSE as unknown
	if (!info || typeof info !== "object") {
		return null
	}
	return info as typeof globalThis.PULSE
}

function getInitialHubUrl(info: typeof globalThis.PULSE | null) {
	return info?.AGENT_HUB_URL || info?.HUB_URL || getNormalizedHubOrigin()
}

function getNormalizedHubOrigin() {
	const url = new URL(window.location.href)
	if (url.port === "5173") {
		url.port = "8090"
	}
	return url.origin
}

function ReleaseNoteCard({ release, defaultOpen = false }: { release: ReleaseNote; defaultOpen?: boolean }) {
	const [open, setOpen] = useState(defaultOpen)
	return (
		<article className="overflow-hidden rounded-lg border border-border/70 bg-card">
			<Button
				variant="ghost"
				className="min-h-16 w-full rounded-none px-4 py-3 text-left transition-[background-color,transform] hover:bg-surface-soft"
				aria-expanded={open}
				onClick={() => setOpen((value) => !value)}
			>
				<div className="grid w-full gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
					<div className="min-w-0">
						<div className="flex flex-wrap items-center gap-2">
							<h5 className="text-sm font-semibold tracking-tight">Pulse {release.version}</h5>
							<ReleaseMetaTag>{release.date}</ReleaseMetaTag>
						</div>
						<p className="mt-1 whitespace-normal text-sm font-normal text-muted-foreground">{release.title}</p>
					</div>
					<div className="flex min-w-0 items-center gap-2 sm:justify-end">
						<div className="hidden flex-wrap gap-1.5 sm:flex sm:justify-end">
							{release.badges.map((badge) => (
								<ReleaseMetaTag key={badge}>{badge}</ReleaseMetaTag>
							))}
						</div>
						<ChevronDownIcon className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} />
					</div>
				</div>
			</Button>
			{open && (
				<div className="grid gap-4 border-t border-border/70 bg-surface-soft p-3 sm:p-4">
					<MobileReleaseBadges badges={release.badges} />
					<div className="grid gap-3 lg:grid-cols-2">
						{release.sections.map((section) => (
							<section
								key={section.title}
								className="grid content-start gap-2 rounded-lg border border-border/70 bg-card p-3 shadow-none"
							>
								<div className="text-sm font-semibold">{section.title}</div>
								<ul className="grid gap-1.5 text-sm leading-relaxed text-muted-foreground">
									{section.items.map((item) => (
										<li key={item} className="grid grid-cols-[0.75rem_1fr] gap-2">
											<span className="mt-2 size-1.5 rounded-sm bg-primary/70" />
											<span>{item}</span>
										</li>
									))}
								</ul>
							</section>
						))}
					</div>
				</div>
			)}
		</article>
	)
}

function ReleaseMetaTag({ children }: { children: ReactNode }) {
	return (
		<span className="inline-flex h-6 items-center rounded-md border border-border/70 bg-surface-card px-2 text-xs font-medium text-muted-foreground shadow-none">
			{children}
		</span>
	)
}
