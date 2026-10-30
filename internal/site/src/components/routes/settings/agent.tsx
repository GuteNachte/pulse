import { useStore } from "@nanostores/react"
import { RefreshCwIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/use-toast"
import { isPocketBaseAutoCancel, pb } from "@/lib/api"
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
import {
	AgentInstallWorkbench,
	AgentReleaseRepositoryPanel,
	AgentUpdatesPanel,
	ConfirmUpdateDialog,
} from "./agent-settings-components"
import { buildSystemUpdateSummary, type AgentReleaseRecord, type SystemUpdateSummary } from "./agent-update-summary"
import { SettingsPageHeader } from "./components/page-header"
import { SettingsStatCard, SettingsStatGrid } from "./components/stat-card"

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
	const upgradeable = summaries.filter((item) => item.updateKind === "upgrade" && item.precheckStatus === "ready")
	const current = summaries.filter((item) => item.updateKind === "current")
	const blocked = summaries.filter((item) => item.precheckStatus === "blocked")
	const skipped = summaries.filter((item) => item.precheckStatus === "skip" && item.updateKind !== "current")

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

	const refreshReleases = async () => {
		setLoading(true)
		try {
			await pb.send("/api/pulse/agent-releases/sync", { method: "POST" })
			await loadReleases()
			toast({ title: "版本列表已刷新", description: "已同步本地发布目录并重新读取版本。" })
		} catch (error) {
			console.error(error)
			toast({
				title: "版本刷新失败",
				description: getOperationErrorMessage(error, "无法同步 Agent 版本仓库，请检查 Hub 状态。"),
				variant: "destructive",
			})
			await loadReleases().catch(console.error)
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
			const accepted = response.status === "running" || response.status === "pending" || response.status === "succeeded"
			toast({
				title: accepted ? (response.status === "succeeded" ? "更新请求已完成" : "更新已开始") : "更新请求未完成",
				description: accepted
					? response.message || "Agent 已接收请求，正在更新；完成后页面会随心跳刷新。"
					: formatOperationResponseMessage(response, "Agent 拒绝了这次受控更新请求。"),
				variant: accepted ? "default" : "destructive",
				action: <OperationToastAction systemId={pendingUpdate.system.id} />,
			})
			if (accepted) {
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
		<div className="grid pulse-card-gap">
			<SettingsPageHeader
				eyebrow="监控与接入"
				title="Agent 管理"
				description="Agent 主动连接 Hub，安装时只需要 Hub 地址和资产的 6 位配对码。刷新版本会同步本地发布目录并重新读取可用版本。"
				actions={
					<Button variant="outline" size="sm" onClick={() => refreshReleases().catch(console.error)} disabled={loading}>
						<RefreshCwIcon className={`me-2 size-4 ${loading ? "animate-spin" : ""}`} />
						刷新版本
					</Button>
				}
			/>

			<SettingsStatGrid>
				<SettingsStatCard
					label="可更新"
					value={<StatValue value={upgradeable.length} tone={upgradeable.length ? "warning" : "neutral"} />}
					detail="有比当前版本更高的目标版本"
				/>
				<SettingsStatCard
					label="已最新"
					value={<StatValue value={current.length} tone={current.length ? "success" : "neutral"} />}
					detail="当前版本已是目标版本"
				/>
				<SettingsStatCard
					label="阻塞"
					value={<StatValue value={blocked.length} tone={blocked.length ? "danger" : "neutral"} />}
					detail="预检未通过，需要先处理"
				/>
				<SettingsStatCard label="跳过" value={skipped.length} detail="离线或不支持自更新的设备" />
			</SettingsStatGrid>

			<AgentInstallWorkbench releases={releases} hubUrl={agentHubURL} />

			<AgentUpdatesPanel
				summaries={summaries}
				updatingSystemId={updatingSystemId}
				requestedUpdateTargets={requestedUpdateTargets}
				onRequestUpdate={setPendingUpdate}
			/>

			<AgentReleaseRepositoryPanel releases={releases} />

			<ConfirmUpdateDialog
				pendingUpdate={pendingUpdate}
				updating={Boolean(updatingSystemId)}
				onOpenChange={(open) => !open && setPendingUpdate(null)}
				onConfirm={requestAgentUpdate}
			/>
		</div>
	)
}

function StatValue({ value, tone }: { value: number; tone: "neutral" | "success" | "warning" | "danger" }) {
	const toneClass =
		tone === "success"
			? "text-emerald-700 dark:text-emerald-300"
			: tone === "warning"
				? "text-amber-700 dark:text-amber-300"
				: tone === "danger"
					? "text-red-700 dark:text-red-300"
					: "text-foreground"
	return <span className={toneClass}>{value}</span>
}
