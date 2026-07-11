import { useStore } from "@nanostores/react"
import { AlertTriangleIcon, CheckCircle2Icon, ContainerIcon, RefreshCwIcon, RocketIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import {
	MobileAgentPlatformList,
	MobileAgentStatusSummary,
	type MobileAgentPlatformItem,
	type MobileAgentReleaseItem,
	type MobileAgentUpdateItem,
} from "@/components/mobile/mobile-agent-settings"
import type { MobileStatusTone } from "@/components/mobile/mobile-ui"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/use-toast"
import { isPocketBaseAutoCancel, pb } from "@/lib/api"
import { SystemStatus } from "@/lib/enums"
import {
	formatOperationResponseMessage,
	getOperationErrorMessage,
	getOperationResponseFromError,
	OperationToastAction,
	type OperationApiResponse,
} from "@/lib/operation-feedback"
import { syncAgentHubURLFromRuntime } from "@/lib/runtime-info"
import { $systems } from "@/lib/stores"
import { getAgentHubURL } from "@/lib/utils"
import { compareVersionStrings, normalizePlatform } from "../system/agent-update-utils"
import { buildInstallProfiles } from "./agent-install-profiles"
import {
	AgentInstallWorkbench,
	AgentReleaseRepositoryPanel,
	AgentUpdatesPanel,
	ConfirmUpdateDialog,
	agentCapabilityGroups,
} from "./agent-settings-components"
import { buildSystemUpdateSummary, type AgentReleaseRecord, type SystemUpdateSummary } from "./agent-update-summary"

export default function AgentSettings() {
	const systems = useStore($systems)
	const [releases, setReleases] = useState<AgentReleaseRecord[]>([])
	const [loading, setLoading] = useState(true)
	const [updatingSystemId, setUpdatingSystemId] = useState("")
	const [pendingUpdate, setPendingUpdate] = useState<SystemUpdateSummary | null>(null)
	const [agentHubURL, setAgentHubURLState] = useState(() => getAgentHubURL())
	const [requestedUpdateTargets, setRequestedUpdateTargets] = useState<Record<string, string>>({})

	const windowsReleases = useMemo(
		() => releases.filter((release) => normalizePlatform(release.platform) === "windows"),
		[releases]
	)
	const linuxImageReleases = useMemo(
		() => releases.filter((release) => normalizePlatform(release.platform) === "linux"),
		[releases]
	)
	const updateTargets = useMemo(
		() => [...windowsReleases, ...linuxImageReleases],
		[windowsReleases, linuxImageReleases]
	)
	const summaries = useMemo(
		() => systems.map((system) => buildSystemUpdateSummary(system, updateTargets, loading)),
		[systems, updateTargets, loading]
	)
	const installProfiles = useMemo(
		() => buildInstallProfiles({ releases, hubUrl: agentHubURL }),
		[agentHubURL, releases]
	)
	const windowsProfile = installProfiles.find((profile) => profile.id === "windows-host")
	const linuxProfile = installProfiles.find((profile) => profile.id === "linux-container")
	const windowsSummaries = summaries.filter((item) => item.platform === "windows")
	const linuxSummaries = summaries.filter((item) => item.platform === "linux")
	const upgradeable = summaries.filter((item) => item.updateKind === "upgrade" && item.precheckStatus === "ready")
	const current = summaries.filter((item) => item.updateKind === "current")
	const blocked = summaries.filter((item) => item.precheckStatus === "blocked")
	const skipped = summaries.filter((item) => item.precheckStatus === "skip" && item.updateKind !== "current")
	const mobilePlatforms = useMemo(
		() =>
			[
				windowsProfile &&
					buildMobileAgentPlatformItem({
						id: "windows-host",
						title: "Windows 主机版",
						description: "适合 Windows 主力机、工作站和需要软件 / 服务监控的设备。",
						icon: "windows",
						profile: windowsProfile,
						capabilityGroup: agentCapabilityGroups[0],
						summaries: windowsSummaries,
						releases: windowsReleases,
						platformLabel: "Windows",
						emptyReleaseText: "还没有可用 Windows Agent 版本。",
						emptySummaryText: "还没有接入 Windows 主机版 Agent。",
						updatingSystemId,
						requestedUpdateTargets,
						onRequestUpdate: setPendingUpdate,
					}),
				linuxProfile &&
					buildMobileAgentPlatformItem({
						id: "linux-container",
						title: "Linux / NAS Docker 容器版",
						description: "适合 Linux、飞牛和 NAS，通过 Docker Compose 部署并管理同机容器。",
						icon: "linux",
						profile: linuxProfile,
						capabilityGroup: agentCapabilityGroups[1],
						summaries: linuxSummaries,
						releases: linuxImageReleases,
						platformLabel: "Linux 镜像",
						emptyReleaseText: "还没有可用 Linux 容器镜像版本。",
						emptySummaryText: "还没有接入 Linux / NAS Docker 容器版 Agent。",
						updatingSystemId,
						requestedUpdateTargets,
						onRequestUpdate: setPendingUpdate,
					}),
			].filter(Boolean) as MobileAgentPlatformItem[],
		[
			windowsProfile,
			linuxProfile,
			windowsSummaries,
			linuxSummaries,
			windowsReleases,
			linuxImageReleases,
			updatingSystemId,
			requestedUpdateTargets,
		]
	)

	const loadReleases = async () => {
		setLoading(true)
		try {
			const items = await pb.collection<AgentReleaseRecord>("agent_releases").getFullList({
				sort: "-enabled,-created",
				fields: "id,version,channel,platform,arch,download_url,checksum,notes,enabled,disabled_reason,created,updated",
			})
			setReleases(items)
		} catch (error) {
			console.error(error)
			setReleases([])
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		loadReleases().catch(console.error)
	}, [])

	useEffect(() => {
		syncAgentHubURLFromRuntime()
			.then((info) => setAgentHubURLState(info.agent_hub_url || getAgentHubURL()))
			.catch((error) => {
				if (!isPocketBaseAutoCancel(error)) {
					console.error(error)
				}
				setAgentHubURLState(getAgentHubURL())
			})
	}, [])

	useEffect(() => {
		setRequestedUpdateTargets((current) => {
			let changed = false
			const next = { ...current }
			for (const item of summaries) {
				const requestedTarget = current[item.system.id]
				if (
					requestedTarget &&
					item.currentVersion &&
					compareVersionStrings(item.currentVersion, requestedTarget) >= 0
				) {
					delete next[item.system.id]
					changed = true
				}
			}
			return changed ? next : current
		})
	}, [summaries])

	const requestAgentUpdate = async () => {
		if (!pendingUpdate?.targetRelease) return
		setUpdatingSystemId(pendingUpdate.system.id)
		try {
			const response = await pb.send<OperationApiResponse>("/api/pulse/operations", {
				method: "POST",
				body: {
					system: pendingUpdate.system.id,
					action: "update_agent",
					confirm: true,
					params: { release_id: pendingUpdate.targetRelease.id },
				},
			})
			toast({
				title: response.status === "succeeded" ? "更新请求已发送" : "更新请求未完成",
				description:
					response.status === "succeeded"
						? response.message || "Agent 已接收请求，容器版会继续拉取镜像并重建，完成后页面会随心跳刷新。"
						: formatOperationResponseMessage(response, "Agent 拒绝了这次受控更新请求。"),
				variant: response.status === "succeeded" ? "default" : "destructive",
				action: <OperationToastAction systemId={pendingUpdate.system.id} />,
			})
			if (response.status === "succeeded") {
				setRequestedUpdateTargets((current) => ({
					...current,
					[pendingUpdate.system.id]: pendingUpdate.targetRelease?.version || "",
				}))
			}
			setPendingUpdate(null)
		} catch (error) {
			console.error(error)
			const response = getOperationResponseFromError(error)
			toast({
				title: "更新请求失败",
				description: getOperationErrorMessage(error, "Hub 或 Agent 拒绝了这次受控更新请求。"),
				variant: "destructive",
				action: response?.id ? <OperationToastAction systemId={pendingUpdate.system.id} /> : undefined,
			})
		} finally {
			setUpdatingSystemId("")
		}
	}

	return (
		<div className="grid gap-5">
			<section className="hidden overflow-hidden rounded-lg border border-border/70 bg-surface-soft shadow-none md:block">
				<div className="border-b border-border/70 bg-card px-5 py-4">
					<div className="flex min-w-0 items-start justify-between gap-4">
						<div className="min-w-0">
							<div className="text-xs font-medium text-muted-foreground">Agent 与接入</div>
							<h3 className="mt-1 text-xl font-semibold text-foreground">Agent 管理</h3>
							<p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
								Agent 主动连接 Hub，只需要 `TOKEN` 和 `HUB_URL`。日常接入优先使用客户端页的添加机器向导。
							</p>
						</div>
						<Button
							variant="outline"
							size="sm"
							className="bg-card transition-transform active:scale-[0.96]"
							onClick={() => loadReleases().catch(console.error)}
						>
							<RefreshCwIcon className="me-2 size-4" />
							刷新版本
						</Button>
					</div>
				</div>
				<div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
					<AgentOverviewStat
						icon={RocketIcon}
						label="可更新"
						value={upgradeable.length}
						tone={upgradeable.length ? "warning" : "neutral"}
					/>
					<AgentOverviewStat icon={CheckCircle2Icon} label="已最新" value={current.length} tone="success" />
					<AgentOverviewStat
						icon={AlertTriangleIcon}
						label="阻塞"
						value={blocked.length}
						tone={blocked.length ? "danger" : "neutral"}
					/>
					<AgentOverviewStat icon={ContainerIcon} label="跳过" value={skipped.length} tone="neutral" />
				</div>
			</section>

			<div className="md:hidden">
				<MobileAgentStatusSummary
					upgradeable={upgradeable.length}
					current={current.length}
					blocked={blocked.length}
					skipped={skipped.length}
					onRefresh={() => loadReleases().catch(console.error)}
				/>
			</div>

			<MobileAgentPlatformList items={mobilePlatforms} />

			<AgentInstallWorkbench releases={releases} hubUrl={agentHubURL} />

			<div className="hidden gap-4 md:grid">
				<AgentUpdatesPanel
					summaries={summaries}
					updatingSystemId={updatingSystemId}
					requestedUpdateTargets={requestedUpdateTargets}
					onRequestUpdate={setPendingUpdate}
				/>
				<AgentReleaseRepositoryPanel releases={releases} />
			</div>

			<ConfirmUpdateDialog
				pendingUpdate={pendingUpdate}
				updating={Boolean(updatingSystemId)}
				onOpenChange={(open) => !open && setPendingUpdate(null)}
				onConfirm={requestAgentUpdate}
			/>
		</div>
	)
}

function AgentOverviewStat({
	icon: Icon,
	label,
	value,
	tone,
}: {
	icon: typeof RocketIcon
	label: string
	value: number
	tone: "neutral" | "success" | "warning" | "danger"
}) {
	const toneClass =
		tone === "success"
			? "text-emerald-700 dark:text-emerald-300"
			: tone === "warning"
				? "text-amber-700 dark:text-amber-300"
				: tone === "danger"
					? "text-red-700 dark:text-red-300"
					: "text-foreground"
	return (
		<div className="rounded-lg border border-border/70 bg-card p-4 shadow-none">
			<div className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
				<Icon className="size-3.5 shrink-0" />
				<span className="truncate">{label}</span>
			</div>
			<div className={`mt-2 text-2xl font-semibold leading-none tabular-nums ${toneClass}`}>{value}</div>
		</div>
	)
}

function buildMobileAgentPlatformItem({
	id,
	title,
	description,
	icon,
	profile,
	capabilityGroup,
	summaries,
	releases,
	platformLabel,
	emptyReleaseText,
	emptySummaryText,
	updatingSystemId,
	requestedUpdateTargets,
	onRequestUpdate,
}: {
	id: string
	title: string
	description: string
	icon: "windows" | "linux"
	profile: NonNullable<ReturnType<typeof buildInstallProfiles>[number]>
	capabilityGroup: (typeof agentCapabilityGroups)[number]
	summaries: SystemUpdateSummary[]
	releases: AgentReleaseRecord[]
	platformLabel: string
	emptyReleaseText: string
	emptySummaryText: string
	updatingSystemId: string
	requestedUpdateTargets: Record<string, string>
	onRequestUpdate: (item: SystemUpdateSummary) => void
}): MobileAgentPlatformItem {
	const upgradeable = summaries.filter((item) => item.updateKind === "upgrade" && item.precheckStatus === "ready")
	const current = summaries.filter((item) => item.updateKind === "current")
	const blocked = summaries.filter((item) => item.precheckStatus === "blocked")

	return {
		id,
		title,
		description,
		icon,
		badges: profile.badges,
		commandLabel: profile.commandLabel,
		command: profile.command,
		actions: profile.actions,
		capability: {
			badge: capabilityGroup.badge,
			collect: capabilityGroup.collect,
			operate: capabilityGroup.operate,
		},
		updateStats: {
			upgradeable: upgradeable.length,
			current: current.length,
			blocked: blocked.length,
		},
		summaries: summaries.map((item) =>
			buildMobileAgentUpdateItem({
				item,
				updating: updatingSystemId === item.system.id,
				requestedTargetVersion: requestedUpdateTargets[item.system.id],
				onRequest: () => onRequestUpdate(item),
			})
		),
		releases: releases.map((release) => buildMobileAgentReleaseItem(release, platformLabel)),
		emptySummaryText,
		emptyReleaseText,
	}
}

function buildMobileAgentUpdateItem({
	item,
	updating,
	requestedTargetVersion,
	onRequest,
}: {
	item: SystemUpdateSummary
	updating: boolean
	requestedTargetVersion?: string
	onRequest: () => void
}): MobileAgentUpdateItem {
	const waitingForResult =
		Boolean(requestedTargetVersion) &&
		Boolean(item.currentVersion) &&
		compareVersionStrings(item.currentVersion, requestedTargetVersion || "") < 0
	const canRequest =
		!waitingForResult &&
		item.updateKind === "upgrade" &&
		item.precheckStatus === "ready" &&
		Boolean(item.targetRelease?.download_url) &&
		item.system.status === SystemStatus.Up

	return {
		id: item.system.id,
		systemName: item.system.name,
		systemHref: `/system/${item.system.id}`,
		statusLabel: waitingForResult ? "更新中" : item.updateLabel,
		statusTone: waitingForResult ? "warning" : updateTone(item.updateVariant),
		precheckLabel: item.updateKind === "current" ? undefined : precheckLabel(item.precheckStatus),
		precheckTone: precheckTone(item.precheckStatus),
		lastFailed: item.lastFailed && !waitingForResult,
		reason: waitingForResult
			? `更新请求已发送，等待 Agent 拉取镜像并上报 ${requestedTargetVersion}。`
			: item.precheckReason,
		currentVersion: item.currentVersion,
		targetVersion: item.targetVersion,
		platformLabel: `${item.platform}/${item.arch || "all"}`,
		lastUpdateStatus: item.lastUpdate?.status,
		lastUpdateLabel: item.lastUpdateLabel,
		lastUpdateDetail: item.lastUpdateDetail,
		actionLabel: getMobileUpdateActionLabel(item, updating, waitingForResult),
		canRequest,
		updating,
		onRequest,
	}
}

function buildMobileAgentReleaseItem(release: AgentReleaseRecord, platformLabel: string): MobileAgentReleaseItem {
	return {
		id: release.id,
		version: release.version,
		statusLabel: release.enabled ? "启用" : "禁用",
		statusTone: release.enabled ? "success" : "neutral",
		meta: `${platformLabel}/${release.arch || "all"} - ${release.channel}`,
		notes: release.notes,
		disabledReason: release.enabled ? undefined : release.disabled_reason,
		downloadUrl: release.download_url,
	}
}

function getMobileUpdateActionLabel(item: SystemUpdateSummary, updating: boolean, waitingForResult = false) {
	if (updating) return "请求中..."
	if (waitingForResult) return "更新中"
	if (item.updateKind === "current") return "无需更新"
	if (item.updateKind === "ahead") return "高于目标"
	if (item.precheckStatus === "ready") return "更新"
	if (item.system.status !== SystemStatus.Up) return "设备离线"
	if (!item.canSelfUpdate) return "不支持更新"
	if (!item.targetRelease) return "无目标版本"
	return "暂不可用"
}

function updateTone(variant: SystemUpdateSummary["updateVariant"]): MobileStatusTone {
	if (variant === "success") return "success"
	if (variant === "warning") return "warning"
	return "neutral"
}

function precheckTone(status: SystemUpdateSummary["precheckStatus"]): MobileStatusTone {
	if (status === "ready") return "warning"
	if (status === "blocked") return "danger"
	return "neutral"
}

function precheckLabel(status: SystemUpdateSummary["precheckStatus"]) {
	if (status === "ready") return "可更新"
	if (status === "blocked") return "阻塞"
	return "跳过"
}
