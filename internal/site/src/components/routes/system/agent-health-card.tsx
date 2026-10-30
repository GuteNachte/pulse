import type { ComponentType, SVGProps } from "react"
import {
	BadgeCheckIcon,
	ClockIcon,
	InfoIcon,
	MonitorCogIcon,
	ShieldCheckIcon,
	TriangleAlertIcon,
	WrenchIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { SystemStatus } from "@/lib/enums"
import { cn } from "@/lib/utils"
import type { CapabilityState, CapabilityStatus, SystemRecord } from "@/types"
import { getSystemInstallTypeLabel } from "./capability-strip-utils"

type IconType = ComponentType<SVGProps<SVGSVGElement>>

export default function AgentHealthCard({ system }: { system: SystemRecord }) {
	const cap = system.info.cap
	const online = system.status === SystemStatus.Up
	const collection = cap?.collection ?? []
	const operations = cap?.operations ?? []
	const diagnostics = buildDiagnostics(cap?.diagnostics, cap?.collection_results)
	const heartbeatStatus = online ? "Agent 在线，数据会随心跳刷新" : "设备离线或心跳中断，Agent 操作不可用"

	return (
		<Card className="overflow-hidden border-border/70 bg-surface-soft shadow-none">
			<CardHeader className="gap-3 border-b border-border/70 bg-surface-soft px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between">
				<div className="min-w-0">
					<CardTitle className="flex items-center gap-2 text-base">
						<MonitorCogIcon className="size-4" />
						Agent 状态自检
					</CardTitle>
					<p className="mt-1 text-sm text-muted-foreground">按 Agent 上报的真实能力、诊断状态和心跳结果展示。</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Badge variant={online ? "success" : "outline"}>{online ? "在线" : "离线"}</Badge>
					<Badge variant={cap ? "success" : "warning"}>{cap ? "已上报能力" : "旧版或未上报能力"}</Badge>
				</div>
			</CardHeader>
			<CardContent className="grid pulse-card-gap p-3 sm:p-4">
				<div className="grid pulse-card-gap sm:grid-cols-2 xl:grid-cols-4">
					<InfoTile
						icon={InfoIcon}
						label="Agent 版本"
						value={cap?.agent_version || system.info.v || system.v || "未知"}
					/>
					<InfoTile
						icon={MonitorCogIcon}
						label="运行方式"
						value={
							getSystemInstallTypeLabel(system) === "旧版/未声明"
								? getRunModeLabel(cap?.agent_profile, cap?.run_mode)
								: getSystemInstallTypeLabel(system)
						}
					/>
					<InfoTile icon={ShieldCheckIcon} label="权限状态" value={getPrivilegeLabel(cap?.privilege)} />
					<InfoTile icon={ClockIcon} label="心跳状态" value={heartbeatStatus} />
				</div>

				<div className="grid pulse-card-gap lg:grid-cols-2">
					<CapabilitySection
						title="声明采集能力"
						icon={BadgeCheckIcon}
						items={collection.length ? collection.map(formatCapabilityToken) : ["未上报采集能力"]}
					/>
					<CapabilitySection
						title="声明可执行操作"
						icon={WrenchIcon}
						items={operations.length ? operations.map(formatCapabilityToken) : ["未上报可执行操作"]}
					/>
				</div>

				<div className="rounded-lg border border-border/70 bg-card p-3 shadow-none">
					<div className="mb-2 flex items-center gap-2 text-sm font-medium">
						<TriangleAlertIcon className="size-4 text-muted-foreground" />
						采集诊断
					</div>
					<div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
						{diagnostics.map((item) => (
							<DiagnosticItem key={item.id} item={item} />
						))}
					</div>
				</div>
			</CardContent>
		</Card>
	)
}

function InfoTile({ icon: Icon, label, value }: { icon: IconType; label: string; value: string }) {
	return (
		<div className="rounded-md border border-border/70 bg-card px-3 py-2.5 shadow-none">
			<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
				<Icon className="size-3.5" />
				{label}
			</div>
			<div className="mt-1 text-sm font-medium leading-relaxed">{value}</div>
		</div>
	)
}

function CapabilitySection({ title, icon: Icon, items }: { title: string; icon: IconType; items: string[] }) {
	return (
		<div className="rounded-md border border-border/70 bg-card p-3 shadow-none">
			<div className="mb-2 flex items-center gap-2 text-sm font-medium">
				<Icon className="size-4 text-muted-foreground" />
				{title}
			</div>
			<div className="flex flex-wrap gap-1.5">
				{items.map((item) => (
					<Badge key={item} variant="outline">
						{item}
					</Badge>
				))}
			</div>
		</div>
	)
}

type DiagnosticDisplayItem = {
	id: string
	label: string
	status?: CapabilityStatus
}

function DiagnosticItem({ item }: { item: DiagnosticDisplayItem }) {
	const state = normalizeCapabilityState(item.status?.state)
	const reason = formatDiagnosticReason(item.status?.reason) || stateFallbackReason[state]
	const checkedAt = item.status?.checked_at ? formatCheckedAt(item.status.checked_at) : ""
	return (
		<div className="min-w-0 rounded-md border border-border/70 bg-surface-soft p-2.5">
			<div className="flex items-center justify-between gap-2">
				<div className="truncate text-sm font-medium">{item.label}</div>
				<Badge variant={stateVariant[state]} className={cn(state === "unknown" && "text-muted-foreground")}>
					{stateLabel[state]}
				</Badge>
			</div>
			<div className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{reason}</div>
			{checkedAt && <div className="mt-1 text-[11px] text-muted-foreground">检查于 {checkedAt}</div>}
		</div>
	)
}

function buildDiagnostics(
	diagnostics: Record<string, CapabilityStatus> | undefined,
	collectionResults: Record<string, CapabilityStatus> | undefined
): DiagnosticDisplayItem[] {
	const values = { ...(collectionResults ?? {}), ...(diagnostics ?? {}) }
	return diagnosticOrder.map((item) => ({
		...item,
		status: values[item.id],
	}))
}

const diagnosticOrder: Array<{ id: string; label: string }> = [
	{ id: "metrics_basic", label: "基础指标" },
	{ id: "docker_socket", label: "Docker / Podman socket" },
	{ id: "smart", label: "S.M.A.R.T." },
	{ id: "gpu", label: "GPU" },
	{ id: "network_details", label: "网络详情" },
	{ id: "wmi", label: "WMI / PowerShell" },
	{ id: "privilege", label: "运行权限" },
]

function normalizeCapabilityState(state?: CapabilityState): CapabilityState {
	switch (state) {
		case "confirmed":
		case "unavailable":
		case "unsupported":
		case "failed":
		case "stale":
			return state
		default:
			return "unknown"
	}
}

const stateVariant: Record<CapabilityState, "success" | "warning" | "danger" | "outline"> = {
	confirmed: "success",
	unavailable: "outline",
	unsupported: "outline",
	unknown: "outline",
	failed: "danger",
	stale: "warning",
}

const stateLabel: Record<CapabilityState, string> = {
	confirmed: "已采集",
	unavailable: "未发现",
	unsupported: "不支持",
	unknown: "未知",
	failed: "失败",
	stale: "过期",
}

const stateFallbackReason: Record<CapabilityState, string> = {
	confirmed: "已采集到真实结果。",
	unavailable: "当前未采集到可用结果。",
	unsupported: "当前 Agent 或部署形态不支持。",
	unknown: "当前 Agent 未上报该诊断结果。",
	failed: "最近一次采集失败。",
	stale: "最近一次结果可能已经过期。",
}

function formatDiagnosticReason(reason?: string) {
	if (!reason) return ""
	const labels: Record<string, string> = {
		"Agent is running with elevated privileges": "Agent 正以高权限运行。",
		"Basic CPU, memory, disk, or network metrics collected": "已采集 CPU、内存、磁盘或网络基础指标。",
		"Basic metrics collected": "已采集基础指标。",
		"Docker / Podman socket is not available": "未发现可用的 Docker / Podman socket。",
		"Docker / Podman socket reachable": "Docker / Podman socket 可访问。",
		"GPU collector is active but no GPU metrics were returned in this collection":
			"GPU 采集器已启用，但本轮没有返回 GPU 指标。",
		"GPU metrics collected": "已采集 GPU 指标。",
		"No network interface details were collected": "未采集到网卡详情。",
		"Network interface details or per-interface traffic collected": "已采集网卡详情或分网卡流量。",
		"SMART devices are collected on the Hub background schedule": "S.M.A.R.T. 由 Hub 后台定时采集。",
		"SMART devices collected": "已采集 S.M.A.R.T. 设备。",
		"Windows host agent can use PowerShell / WMI based collectors":
			"Windows 主机版 Agent 可使用 PowerShell / WMI 采集器。",
	}
	return labels[reason] || reason
}

function formatCheckedAt(value: string) {
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) {
		return value
	}
	return date.toLocaleString("zh-CN", {
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	})
}

function getRunModeLabel(profile?: string, runMode?: string) {
	switch (profile) {
		case "windows-host":
			return "Windows 主机版"
		case "linux-container":
			return "Linux 容器版"
		default:
			return profile || runMode || "未上报"
	}
}

function getPrivilegeLabel(privilege?: string) {
	switch (privilege) {
		case "admin":
		case "root":
			return "高权限，可按能力执行受控操作"
		case "user":
			return "普通权限，部分控制能力可能不可用"
		case "unknown":
			return "未知权限"
		default:
			return privilege || "未上报"
	}
}

function formatCapabilityToken(value: string) {
	const labels: Record<string, string> = {
		agent_update: "Agent 更新",
		container_control: "容器控制",
		containers: "容器",
		gpu: "GPU",
		metrics_basic: "基础指标",
		service_control: "服务控制",
		smart: "S.M.A.R.T.",
		software_monitor: "软件监控",
		windows_services: "Windows 服务",
	}
	return labels[value] || value
}
