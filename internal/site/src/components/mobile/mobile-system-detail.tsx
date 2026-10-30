import type { ElementType, ReactNode } from "react"
import {
	ActivityIcon,
	ArrowLeftIcon,
	BoxIcon,
	ContainerIcon,
	Globe2Icon,
	HardDriveIcon,
	HistoryIcon,
	MemoryStickIcon,
	NetworkIcon,
	PencilIcon,
	ServerCogIcon,
} from "lucide-react"
import { getPagePath } from "@nanostores/router"
import type { SystemDetailsRecord, SystemRecord } from "@/types"
import { SystemStatus, Unit } from "@/lib/enums"
import { getSystemMetricDisplay, getSystemNetworkDisplay, type SystemMetricDisplayState } from "@/lib/system-metrics"
import { getSystemIPAddressLabel } from "@/lib/system-network"
import { getSystemDisplayName } from "@/lib/system-roles"
import { cn, decimalString, secondsToUptimeString } from "@/lib/utils"
import { GpuIcon } from "../ui/icons"
import { Button } from "../ui/button"
import { toast } from "../ui/use-toast"
import { Link, $router } from "../router"
import { MobileFactGrid, MobileMetricRow, MobileSection, MobileStatusTag, type MobileStatusTone } from "./mobile-ui"
import { SystemMetaTags } from "../system-meta-tags"

export type DetailView =
	| "overview"
	| "memory"
	| "disk"
	| "network"
	| "containers"
	| "gpu"
	| "services"
	| "websites"
	| "history"

export function MobileSystemDetail({
	system,
	details,
	hasContainers,
	hasGpu,
	hasSoftwareServices,
	activeView,
	onSelectView,
	onEdit,
	children,
}: {
	system: SystemRecord
	details?: SystemDetailsRecord | null
	hasContainers: boolean
	hasGpu: boolean
	hasSoftwareServices: boolean
	activeView: DetailView
	onSelectView: (view: DetailView) => void
	onEdit?: () => void
	children: ReactNode
}) {
	const cpu = getSystemMetricDisplay(system, "cpu")
	const memory = getSystemMetricDisplay(system, "mp")
	const disk = getSystemMetricDisplay(system, "dp")
	const network = getSystemNetworkDisplay(system, Unit.Bytes)
	const ipLabel = getSystemIPAddressLabel(system)
	const modules: Array<{ view: DetailView; label: string; icon: ElementType; disabled?: boolean }> = [
		{ view: "overview", label: "概览", icon: ActivityIcon },
		{ view: "memory", label: "内存", icon: MemoryStickIcon },
		{ view: "disk", label: "磁盘", icon: HardDriveIcon },
		{ view: "network", label: "网络", icon: NetworkIcon },
		{ view: "containers", label: "容器", icon: ContainerIcon, disabled: !hasContainers },
		{ view: "gpu", label: "GPU", icon: GpuIcon, disabled: !hasGpu },
		...(hasSoftwareServices ? [{ view: "services" as const, label: "服务", icon: ServerCogIcon }] : []),
		{ view: "websites", label: "网站", icon: Globe2Icon },
		{ view: "history", label: "记录", icon: HistoryIcon },
	]

	return (
		<div className="grid gap-3">
			<section className="rounded-lg border border-border/70 bg-surface-soft p-2.5 shadow-none">
				<div className="flex items-center justify-between gap-3">
					<Button asChild variant="ghost" size="sm" className="-ms-2 min-h-10 rounded-md px-2.5">
						<Link href={getPagePath($router, "clients")}>
							<ArrowLeftIcon className="me-1 size-4" />
							机器
						</Link>
					</Button>
					<div className="flex items-center gap-2">
						<MobileStatusTag tone={systemStatusTone(system.status)}>{systemStatusText(system.status)}</MobileStatusTag>
						{onEdit && (
							<Button type="button" variant="outline" size="icon" className="size-10 rounded-md" onClick={onEdit}>
								<PencilIcon className="size-4" />
								<span className="sr-only">编辑机器</span>
							</Button>
						)}
					</div>
				</div>
				<div className="mt-2.5 min-w-0 rounded-lg border border-border/70 bg-card p-3 shadow-none">
					<div className="flex min-w-0 items-center gap-2">
						<h1 className="truncate text-[1.35rem] font-semibold tracking-normal">{getSystemDisplayName(system)}</h1>
						{system.description?.trim() && (
							<span className="min-w-0 rounded-md border border-border/70 bg-surface-soft px-2 py-0.5 text-[11px] text-muted-foreground">
								<span className="truncate">{system.description.trim()}</span>
							</span>
						)}
					</div>
					<SystemMetaTags system={system} className="mt-2" showAlertEnrollment />
				</div>
				<MobileMetricRow
					className="mt-2 rounded-lg border border-border/70 bg-card p-3 shadow-none"
					items={[
						{
							label: "CPU",
							value: cpu.value,
							progress: cpu.progress,
							tone: metricTone(cpu.state),
						},
						{
							label: "内存",
							value: memory.value,
							progress: memory.progress,
							tone: metricTone(memory.state),
						},
						{
							label: "磁盘",
							value: disk.value,
							progress: disk.progress,
							tone: metricTone(disk.state),
						},
					]}
				/>
				<MobileFactGrid
					className="mt-3"
					items={[
						{
							label: "网络",
							value: network.value,
						},
						{
							label: "运行",
							value: system.info.u ? secondsToUptimeString(system.info.u) : "未知",
						},
					]}
				/>
				<div className="mt-3 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
					{ipLabel && <MobileInfoPill>{ipLabel}</MobileInfoPill>}
					<MobileInfoPill>{details?.os_name || system.info.o || "系统未知"}</MobileInfoPill>
					<MobileInfoPill>Agent {system.info.v || system.v || "未知"}</MobileInfoPill>
					<MobileInfoPill>{getMobileVirtualizationLabel(system, details)}</MobileInfoPill>
					<MobileInfoPill>{system.info.dt ? `${decimalString(system.info.dt, 0)}°C` : "温度未发现"}</MobileInfoPill>
				</div>
			</section>

			<MobileSection title="功能模块" count="一次只看一类内容">
				<div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
					{modules.map((module) => (
						<MobileModuleButton
							key={module.view}
							label={module.label}
							icon={module.icon}
							selected={activeView === module.view}
							disabled={module.disabled}
							onClick={() => {
								if (module.disabled) {
									toast({ title: `${module.label}暂不可用`, description: "这台机器当前没有采集到对应数据。" })
									return
								}
								onSelectView(module.view)
							}}
						/>
					))}
				</div>
			</MobileSection>

			<section className="grid min-w-0 gap-3">
				<div className="flex items-center gap-2 px-1">
					<BoxIcon className="size-4 text-muted-foreground" />
					<h2 className="text-base font-semibold">
						{modules.find((module) => module.view === activeView)?.label ?? "概览"}
					</h2>
				</div>
				{children}
			</section>
		</div>
	)
}

function getMobileVirtualizationLabel(_system: SystemRecord, details?: SystemDetailsRecord | null) {
	const virtualization = details?.virtualization
	if (!virtualization?.type || virtualization.type === "none") {
		return "未识别"
	}
	return virtualization.type
}

function MobileModuleButton({
	label,
	icon: Icon,
	selected,
	disabled,
	onClick,
}: {
	label: string
	icon: ElementType
	selected: boolean
	disabled?: boolean
	onClick: () => void
}) {
	return (
		<button
			type="button"
			className={cn(
				"grid min-h-16 min-w-18 place-items-center gap-1 rounded-lg border border-border/70 bg-card px-3 py-2 text-xs font-medium shadow-none transition-[background-color,border-color,transform] duration-150 ease-out hover:border-foreground/15 hover:bg-surface-soft active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
				selected &&
					"border-foreground/20 bg-primary text-primary-foreground ring-1 ring-foreground/10 hover:bg-primary",
				disabled && "opacity-55"
			)}
			onClick={onClick}
			aria-pressed={selected}
		>
			<Icon className="size-4" />
			<span>{label}</span>
		</button>
	)
}

function MobileInfoPill({ children }: { children: ReactNode }) {
	return (
		<span className="rounded-md border border-border/70 bg-card px-2 py-1 text-muted-foreground shadow-none">
			{children}
		</span>
	)
}

function systemStatusTone(status: SystemRecord["status"]): MobileStatusTone {
	if (status === SystemStatus.Up) return "success"
	if (status === SystemStatus.Paused || status === "pending") return "warning"
	return "danger"
}

function systemStatusText(status: SystemRecord["status"]) {
	if (status === SystemStatus.Up) return "在线"
	if (status === SystemStatus.Paused) return "暂停"
	if (status === "pending") return "待连接"
	return "离线"
}

function metricTone(state: SystemMetricDisplayState): MobileStatusTone {
	if (state === "missing" || state === "offline" || state === "paused" || state === "pending") return "neutral"
	if (state === "danger") return "danger"
	if (state === "warning") return "warning"
	return "success"
}
