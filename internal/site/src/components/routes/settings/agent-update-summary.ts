import type { RecordModel } from "pocketbase"
import { SystemStatus } from "@/lib/enums"
import type { AgentUpdateResult, SystemRecord } from "@/types"
import {
	compareVersionStrings,
	normalizePlatform,
	normalizeVersion,
	selectAgentUpdateTarget,
	type AgentReleaseChannel,
	type AgentReleaseLike,
	type AgentReleasePlatform,
} from "../system/agent-update-utils"

export interface AgentReleaseRecord extends RecordModel, AgentReleaseLike {
	version: string
	channel: AgentReleaseChannel
	platform: AgentReleasePlatform
	arch?: string
	download_url?: string
	checksum?: string
	notes?: string
	enabled: boolean
	disabled_reason?: string
}

export type PrecheckStatus = "ready" | "blocked" | "skip"
export type UpdateKind = "loading" | "unknown" | "missing" | "upgrade" | "current" | "ahead"

export type SystemUpdateSummary = {
	system: SystemRecord
	currentVersion: string
	platform: AgentReleasePlatform
	arch: string
	targetVersion: string
	targetRelease?: AgentReleaseRecord
	updateKind: UpdateKind
	updateLabel: string
	updateVariant: "success" | "warning" | "outline"
	canSelfUpdate: boolean
	lastFailed: boolean
	lastUpdate?: AgentUpdateResult
	lastUpdateLabel: string
	lastUpdateDetail: string
	precheckStatus: PrecheckStatus
	precheckReason: string
}

const LINUX_IMAGE_SELF_UPDATE_MIN_VERSION = "1.0.1"

export function buildSystemUpdateSummary(
	system: SystemRecord,
	releases: AgentReleaseRecord[],
	loading: boolean
): SystemUpdateSummary {
	const cap = system.info.cap
	const currentVersion = normalizeVersion(cap?.agent_version || system.info.v || system.v)
	const platform = normalizePlatform(cap?.platform || String(system.info.os || ""))
	const arch = cap?.arch || ""
	const selection = selectAgentUpdateTarget(releases, platform, arch)
	const target = selection.target as AgentReleaseRecord | null
	const updateState = getCleanUpdateState(currentVersion, target, loading)
	const canSelfUpdate = system.status === SystemStatus.Up && Boolean(cap?.operations?.includes("agent_update"))
	const precheck = getPrecheckResult(system, currentVersion, target, canSelfUpdate, updateState.kind)
	return {
		system,
		currentVersion,
		platform,
		arch,
		targetVersion: target?.version || "",
		targetRelease: target || undefined,
		updateKind: updateState.kind,
		updateLabel: updateState.label,
		updateVariant: updateState.variant,
		canSelfUpdate,
		lastFailed: cap?.last_update?.status === "failed",
		lastUpdate: cap?.last_update,
		lastUpdateLabel: getLastUpdateLabel(cap?.last_update),
		lastUpdateDetail: getLastUpdateDetail(cap?.last_update),
		precheckStatus: precheck.status,
		precheckReason: precheck.reason,
	}
}

function getLastUpdateLabel(result?: AgentUpdateResult) {
	if (!result) return ""
	return result.status === "succeeded" ? "上次更新成功" : "上次更新失败"
}

function getLastUpdateDetail(result?: AgentUpdateResult) {
	if (!result) return ""
	const parts = [
		result.version ? `版本 ${result.version}` : "",
		formatAgentUpdateTime(result.time),
		result.message?.trim() || "",
	].filter(Boolean)
	return parts.join(" · ")
}

function formatAgentUpdateTime(value?: string) {
	if (!value) return ""
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return ""
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(date)
}

function getCleanUpdateState(
	currentVersion: string,
	targetRelease: AgentReleaseRecord | null,
	loading: boolean
): { kind: UpdateKind; label: string; variant: "success" | "warning" | "outline" } {
	if (loading) return { kind: "loading", label: "检查中", variant: "warning" }
	if (!currentVersion) return { kind: "unknown", label: "未知", variant: "outline" }
	if (!targetRelease) return { kind: "missing", label: "无目标版本", variant: "outline" }
	const compare = compareVersionStrings(currentVersion, targetRelease.version)
	if (compare < 0) return { kind: "upgrade", label: "可升级", variant: "warning" }
	if (compare > 0) return { kind: "ahead", label: "高于目标", variant: "outline" }
	return { kind: "current", label: "已是最新版", variant: "success" }
}

function getPrecheckResult(
	system: SystemRecord,
	currentVersion: string,
	targetRelease: AgentReleaseRecord | null,
	canSelfUpdate: boolean,
	updateKind: UpdateKind
): { status: PrecheckStatus; reason: string } {
	if (system.status !== SystemStatus.Up) return { status: "blocked", reason: "设备离线，Agent 更新请求不会排队。" }
	if (isLegacyLinuxImageSelfUpdate(system, currentVersion, targetRelease)) {
		return {
			status: "blocked",
			reason: `当前 Linux 容器 Agent 版本过旧，还不支持镜像自更新；请先手动升级到 ${LINUX_IMAGE_SELF_UPDATE_MIN_VERSION}，之后就可以在页面更新。`,
		}
	}
	if (!canSelfUpdate) return { status: "blocked", reason: "当前 Agent 没有声明受控更新能力。" }
	if (!currentVersion) return { status: "blocked", reason: "当前设备没有上报 Agent 版本，无法判断升级方向。" }
	if (!targetRelease) return { status: "blocked", reason: "没有启用且适配当前平台/架构的目标版本。" }
	if (!targetRelease.download_url)
		return { status: "blocked", reason: "目标版本缺少下载地址或镜像地址，Hub 不会生成升级参数。" }
	if (updateKind === "upgrade")
		return { status: "ready", reason: `可从 ${currentVersion} 升级到 ${targetRelease.version}。` }
	if (updateKind === "current") return { status: "ready", reason: "当前 Agent 已经是最新版，无需更新。" }
	if (updateKind === "ahead") return { status: "skip", reason: "当前 Agent 高于目标版本，不会自动降级。" }
	return { status: "skip", reason: "当前状态不需要进入更新流程。" }
}

function isLegacyLinuxImageSelfUpdate(
	system: SystemRecord,
	currentVersion: string,
	targetRelease: AgentReleaseRecord | null
) {
	if (!currentVersion || !targetRelease?.download_url) return false
	const platform = normalizePlatform(system.info.cap?.platform || String(system.info.os || ""))
	if (platform !== "linux" || targetRelease.platform !== "linux") return false
	if (targetRelease.download_url.includes("://")) return false
	return compareVersionStrings(currentVersion, LINUX_IMAGE_SELF_UPDATE_MIN_VERSION) < 0
}
