import type { ElementType } from "react"
import { BoxIcon, GaugeIcon, HardDriveIcon } from "lucide-react"
import { SystemStatus } from "@/lib/enums"
import type { CapabilityStatus, SystemDetailsRecord, SystemRecord } from "@/types"

export type DisplayCapabilityState =
	| "confirmed"
	| "unavailable"
	| "unsupported"
	| "unknown"
	| "failed"
	| "stale"
	| "offline"

export type Capability = {
	id: string
	label: string
	state: DisplayCapabilityState
	reason: string
	Icon: ElementType
	checkedAt?: string
	count?: number
}

export const stateVariant = {
	confirmed: "success",
	unavailable: "outline",
	unsupported: "outline",
	unknown: "warning",
	failed: "danger",
	stale: "warning",
	offline: "outline",
} as const

export const stateLabel = {
	confirmed: "已采集",
	unavailable: "未发现",
	unsupported: "不支持",
	unknown: "未知",
	failed: "失败",
	stale: "过期",
	offline: "离线",
} as const

export function getCapabilities({
	system,
	details,
}: {
	system: SystemRecord
	details?: SystemDetailsRecord | null
}): Capability[] {
	const online = system.status === SystemStatus.Up
	const cap = system.info.cap
	const collection = cap?.collection ?? []
	const reasons = cap?.unsupported_reasons ?? {}
	const results = cap?.collection_results ?? {}
	const hasCapabilityPayload = !!cap

	const hasDeclaredMetrics = collection.includes("metrics_basic")
	const hasDeclaredContainers = collection.includes("containers")
	const hasDeclaredSmart = collection.includes("smart")
	const hasDeclaredGpu = collection.includes("gpu")
	const virtualizationNote = getVirtualizationCapabilityNote(system.role, details)
	const isVirtualGuest = isVirtualGuestSystem(system, details)

	const capabilities: Capability[] = [
		{
			id: "metrics",
			label: "基础指标",
			...resolveCapabilityStatus({
				online,
				status: results.metrics_basic,
				hasCapabilityPayload,
				declared: hasDeclaredMetrics,
				declaredWithoutResultReason: "Agent 已声明基础指标能力，但尚未上报本轮采集结果。",
				unsupportedReason: reasons.metrics_basic || "当前 Agent 没有声明基础指标能力。",
				offlineReason: "设备离线，当前指标可能已经过期。",
			}),
			Icon: GaugeIcon,
		},
		{
			id: "containers",
			label: "容器",
			...resolveCapabilityStatus({
				online,
				status: results.containers,
				hasCapabilityPayload,
				declared: hasDeclaredContainers,
				declaredWithoutResultReason: "Agent 已声明容器采集能力，但尚未上报本轮 Docker / Podman 采集结果。",
				unsupportedReason: reasons.containers || "未检测到可用的 Docker / Podman socket。",
				offlineReason: "设备离线，无法刷新 Docker / Podman 状态。",
			}),
			Icon: BoxIcon,
		},
		{
			id: "smart",
			label: "S.M.A.R.T.",
			...resolveCapabilityStatus({
				online,
				status: results.smart,
				hasCapabilityPayload,
				declared: hasDeclaredSmart,
				declaredWithoutResultReason: isVirtualGuest
					? "当前机器是虚拟机，S.M.A.R.T. 状态取决于宿主机是否透传磁盘设备和 Agent 是否能读取。"
					: "Agent 已声明磁盘健康采集能力，但尚未上报本轮采集结果。",
				unsupportedReason: getSmartCapabilityReason({
					online,
					isVirtualGuest,
					hasDeclaredSmart,
					agentReason: reasons.smart,
				}),
				offlineReason: "设备离线，磁盘健康数据可能已经过期。",
			}),
			Icon: HardDriveIcon,
		},
		{
			id: "gpu",
			label: "GPU",
			...resolveCapabilityStatus({
				online,
				status: results.gpu,
				hasCapabilityPayload,
				declared: hasDeclaredGpu,
				declaredWithoutResultReason: "Agent 已声明 GPU 采集能力，但尚未上报本轮 GPU 采集结果。",
				unsupportedReason: getGpuCapabilityReason(system, reasons.gpu),
				offlineReason: "设备离线，GPU 数据可能已经过期。",
			}),
			Icon: GaugeIcon,
		},
	]

	return capabilities
		.filter((capability) => capability.state !== "unsupported")
		.map((capability) => ({
			...capability,
			reason: appendCapabilityNote(capability.reason, virtualizationNote, capability.id),
		}))
}

function isVirtualGuestSystem(system: SystemRecord, details: SystemDetailsRecord | null | undefined) {
	if (details?.virtualization?.role === "guest") {
		return true
	}
	return system.role === "virtualization"
}

function resolveCapabilityStatus({
	online,
	status,
	hasCapabilityPayload,
	declared,
	declaredWithoutResultReason,
	unsupportedReason,
	offlineReason,
}: {
	online: boolean
	status?: CapabilityStatus
	hasCapabilityPayload: boolean
	declared: boolean
	declaredWithoutResultReason: string
	unsupportedReason: string
	offlineReason: string
}): Pick<Capability, "state" | "reason" | "checkedAt" | "count"> {
	if (!online) {
		return { state: "offline", reason: offlineReason }
	}
	if (status?.state) {
		return {
			state: normalizeCapabilityState(status.state),
			reason: status.reason || declaredWithoutResultReason || unsupportedReason,
			checkedAt: status.checked_at,
			count: status.count,
		}
	}
	if (!hasCapabilityPayload) {
		return {
			state: "unknown",
			reason: "旧版 Agent 未上报能力状态。请升级到 1.0.5 或等待 Agent 重新连接后再判断该能力是否可用。",
		}
	}
	if (declared) {
		return { state: "unknown", reason: declaredWithoutResultReason || "Agent 尚未上报本轮采集结果。" }
	}
	return {
		state: unsupportedReason ? "unsupported" : "unknown",
		reason: unsupportedReason || "当前 Agent 没有上报能力状态。",
	}
}

function normalizeCapabilityState(state: CapabilityStatus["state"]): DisplayCapabilityState {
	switch (state) {
		case "confirmed":
		case "unavailable":
		case "unsupported":
		case "unknown":
		case "failed":
		case "stale":
			return state
		default:
			return "unknown"
	}
}

function getSmartCapabilityReason({
	online,
	isVirtualGuest,
	hasDeclaredSmart,
	agentReason,
}: {
	online: boolean
	isVirtualGuest: boolean
	hasDeclaredSmart: boolean
	agentReason?: string
}) {
	if (!online) {
		return "设备离线，磁盘健康数据可能已经过期。"
	}
	if (isVirtualGuest) {
		return "当前机器是虚拟机，未发现宿主机透传的 S.M.A.R.T. 设备。"
	}
	if (hasDeclaredSmart) {
		return "Agent 已声明磁盘健康采集能力，但当前未发现可读取的 S.M.A.R.T. 设备。"
	}
	return agentReason || "当前未发现可读取的 S.M.A.R.T. 设备。"
}

function getVirtualizationCapabilityNote(
	systemRole: string | undefined,
	details: SystemDetailsRecord | null | undefined
) {
	if (systemRole !== "virtualization") {
		return ""
	}
	const virtualization = details?.virtualization
	if (!virtualization?.type || virtualization.type === "none") {
		return ""
	}
	return `当前运行在${virtualization.name || "虚拟机"}中，GPU、S.M.A.R.T.、网卡型号等硬件信息取决于宿主机是否透传和 Agent 能访问到的数据。`
}

function appendCapabilityNote(reason: string, note: string, capabilityId: string) {
	if (!note || !["gpu", "smart", "metrics"].includes(capabilityId)) {
		return reason
	}
	return `${reason}\n${note}`
}

function getGpuCapabilityReason(system: SystemRecord, agentReason?: string) {
	const profile = system.info.cap?.agent_profile
	const platform = system.info.cap?.platform || system.info.os || ""
	if (profile === "linux-container") {
		return (
			agentReason ||
			"当前没有采集到 GPU。有显卡且 Agent 能访问到对应设备和采集工具时会显示 GPU 信息；没有采集结果时统一显示没有。"
		)
	}
	if (platform === "windows") {
		return (
			agentReason ||
			"当前没有采集到 GPU。Windows 版会尝试通过 NVML / nvidia-smi 采集 NVIDIA 独显，并通过 GPU Engine 性能计数器采集核显或其他显卡。"
		)
	}
	return agentReason || "当前没有采集到 GPU。"
}

export function getAgentProfileLabel(system: SystemRecord, details?: SystemDetailsRecord | null) {
	return getSystemInstallTypeLabel(system, details)
}

export function getSystemInstallTypeLabel(system: SystemRecord, details?: SystemDetailsRecord | null) {
	const osName = details?.os_name?.trim().toLowerCase() || ""
	const systemName = [system.display_name, system.name].filter(Boolean).join(" ").trim().toLowerCase()
	if (system.is_local) {
		return "Hub"
	}
	if (osName.includes("unraid")) {
		return "Unraid"
	}
	if (systemName.includes("unraid")) {
		return "Unraid"
	}
	if (osName.includes("fnos") || osName.includes("飞牛")) {
		return "飞牛"
	}
	if (system.is_nas) {
		return "NAS"
	}
	const cap = system.info.cap
	if (!cap) {
		return "旧版/未声明"
	}
	switch (cap.agent_profile) {
		case "windows-host":
			return "Windows 主机版"
		case "linux-container":
			return "Linux 容器版"
		default:
			return cap.run_mode || cap.platform || "未声明类型"
	}
}
