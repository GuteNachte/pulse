import { useLingui } from "@lingui/react/macro"
import {
	AppleIcon,
	ClockArrowUp,
	CpuIcon,
	Globe2Icon,
	HistoryIcon,
	IdCardIcon,
	ListChecksIcon,
	MemoryStickIcon,
	MonitorIcon,
	NetworkIcon,
	PencilIcon,
} from "lucide-react"
import { useMemo } from "react"
import ChartTimeSelect from "@/components/charts/chart-time-select"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
	BatteryFullIcon,
	BatteryHighIcon,
	BatteryLowIcon,
	BatteryMediumIcon,
	FreeBsdIcon,
	GpuIcon,
	PlugChargingIcon,
	TuxIcon,
	WindowsIcon,
} from "@/components/ui/icons"
import { SystemMetaTag, SystemMetaTags } from "@/components/system-meta-tags"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { BatteryState, Os, SystemStatus } from "@/lib/enums"
import { batteryStateTranslations } from "@/lib/i18n"
import { getSystemIPDisplay } from "@/lib/system-network"
import { getSystemDisplayName } from "@/lib/system-roles"
import { cn, formatBytes, secondsToUptimeString, toFixedFloat } from "@/lib/utils"
import type { ChartData, SystemDetailsRecord, SystemRecord } from "@/types"
import {
	formatCpuModel,
	formatCpuTopology,
	getMemoryHardwareInfo,
	getPrimaryGpuHardwareInfo,
	getPrimaryNetworkHardwareInfo,
	getVirtualizationInfo,
} from "./info-bar-utils"

export default function InfoBar({
	system,
	chartData,
	details,
	servicesActive,
	onServicesClick,
	websitesActive,
	onWebsitesClick,
	historyActive,
	onHistoryClick,
	onIdentityClick,
	onEdit,
}: {
	system: SystemRecord
	chartData: ChartData
	details: SystemDetailsRecord | null
	servicesActive?: boolean
	onServicesClick?: () => void
	websitesActive?: boolean
	onWebsitesClick?: () => void
	historyActive?: boolean
	onHistoryClick?: () => void
	onIdentityClick?: () => void
	onEdit?: () => void
}) {
	const { t } = useLingui()
	const displayName = getSystemDisplayName(system)

	// values for system info bar - use details with fallback to system.info
	const systemInfo = useMemo(() => {
		if (!system.info) {
			return []
		}

		// Use details if available, otherwise fall back to system.info
		const hostname = details?.hostname ?? system.info.h
		const kernel = details?.kernel ?? system.info.k
		const cores = details?.cores ?? system.info.c
		const threads = details?.threads ?? system.info.t
		const cpuModel = formatCpuModel(details?.cpu ?? system.info.m)
		const os = details?.os ?? system.info.os ?? Os.Linux
		const osName = details?.os_name
		const arch = details?.arch
		const memory = details?.memory
		const memoryInfo = getMemoryHardwareInfo(details)
		const networkInfo = getPrimaryNetworkHardwareInfo(details, chartData)
		const gpuInfo = getPrimaryGpuHardwareInfo(chartData)
		const ipDisplay = getSystemIPDisplay(system)

		const osInfo = {
			[Os.Linux]: {
				Icon: TuxIcon,
				// show kernel in tooltip if os name is available, otherwise show the kernel
				value: osName || kernel,
				label: osName ? kernel : undefined,
			},
			[Os.Darwin]: {
				Icon: AppleIcon,
				value: osName || `macOS ${kernel}`,
			},
			[Os.Windows]: {
				Icon: WindowsIcon,
				value: osName || kernel,
				label: osName ? kernel : undefined,
			},
			[Os.FreeBSD]: {
				Icon: FreeBsdIcon,
				value: osName || kernel,
				label: osName ? kernel : undefined,
			},
		}

		const info = [] as {
			value: string | number | undefined
			label?: string
			Icon: React.ElementType
			hide?: boolean
		}[]
		if (ipDisplay) {
			info.push({
				value: ipDisplay.value,
				Icon: Globe2Icon,
				label: ipDisplay.sourceLabel,
			})
		}
		info.push(
			{
				value: hostname,
				Icon: MonitorIcon,
				label: "Hostname",
				// hide if hostname is same as host or name
				hide: hostname === system.name,
			},
			{ value: secondsToUptimeString(system.info.u), Icon: ClockArrowUp, label: t`Uptime`, hide: !system.info.u },
			osInfo[os],
			{
				value: cpuModel,
				Icon: CpuIcon,
				hide: !cpuModel,
				label: formatCpuTopology(cores, threads, arch),
			}
		)

		if (memory) {
			const memValue = formatBytes(memory, false, undefined, false)
			info.push({
				value: memoryInfo?.summary ?? `${toFixedFloat(memValue.value, memValue.value >= 10 ? 1 : 2)} ${memValue.unit}`,
				Icon: MemoryStickIcon,
				hide: !memory,
				label: memoryInfo?.label ?? t`Memory`,
			})
		}

		if (networkInfo) {
			info.push({
				value: networkInfo.value,
				Icon: NetworkIcon,
				label: networkInfo.label,
			})
		}

		if (gpuInfo) {
			info.push({
				value: gpuInfo.value,
				Icon: GpuIcon,
				label: gpuInfo.label,
			})
		}

		return info
	}, [system, details, chartData, t])
	const virtualizationInfo = getVirtualizationInfo(system.role, details)
	const batteryInfo = getBatteryInfo(system)

	let translatedStatus: string = system.status
	if (system.status === SystemStatus.Up) {
		translatedStatus = t({ message: "Up", comment: "Context: System is up" })
	} else if (system.status === SystemStatus.Down) {
		translatedStatus = t({ message: "Down", comment: "Context: System is down" })
	}

	return (
		<Card className="overflow-hidden shadow-none">
			<div className="grid gap-4 px-4 py-4 sm:px-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
				<div className="min-w-0">
					<div className="flex min-w-0 flex-wrap items-center gap-2">
						<h1 className="min-w-0 truncate text-2xl font-semibold sm:text-[1.65rem]">{displayName}</h1>
						<SystemMetaTags system={system} className="shrink-0" showAlertEnrollment />
						{virtualizationInfo?.showTag && (
							<Tooltip delayDuration={100}>
								<TooltipTrigger asChild>
									<SystemMetaTag tone="warning">{virtualizationInfo.shortLabel}</SystemMetaTag>
								</TooltipTrigger>
								<TooltipContent>{virtualizationInfo.label}</TooltipContent>
							</Tooltip>
						)}
						{batteryInfo && (
							<Tooltip delayDuration={100}>
								<TooltipTrigger asChild>
									<SystemMetaTag tone={batteryInfo.tone} className="gap-1.5">
										<batteryInfo.Icon className={cn("size-3.5", batteryInfo.iconClassName)} />
										{batteryInfo.value}
									</SystemMetaTag>
								</TooltipTrigger>
								<TooltipContent>{batteryInfo.label}</TooltipContent>
							</Tooltip>
						)}
						{system.description && (
							<span
								className="min-w-0 truncate text-sm text-muted-foreground before:mr-2 before:text-border before:content-['·']"
								title={system.description}
							>
								{system.description}
							</span>
						)}
					</div>
					<div className="-mx-4 mt-3 flex items-center gap-2 overflow-x-auto px-4 text-nowrap text-sm scrollbar-hide xl:mx-0 xl:flex-wrap xl:px-0">
						<div className="flex min-h-10 items-center gap-2 rounded-full border border-border bg-surface-soft px-3 text-xs font-medium text-foreground">
							<span className={cn("relative flex size-2.5")}>
								{system.status === SystemStatus.Up && (
									<span
										className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70"
										style={{ animationDuration: "1.5s" }}
									></span>
								)}
								<span
									className={cn("relative inline-flex size-2.5 rounded-full", {
										"bg-emerald-500": system.status === SystemStatus.Up,
										"bg-red-500": system.status === SystemStatus.Down,
										"bg-primary/40": system.status === SystemStatus.Paused,
										"bg-amber-500": system.status === SystemStatus.Pending,
									})}
								></span>
							</span>
							{translatedStatus}
						</div>

						{systemInfo.map(({ value, label, Icon, hide }) => {
							if (hide || !value) {
								return null
							}
							const content = (
								<div className="flex min-h-10 max-w-[20rem] items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-muted-foreground shadow-none">
									<Icon className="size-3.5 shrink-0" />
									<span className="truncate text-foreground">{value}</span>
								</div>
							)
							if (!label) {
								return <div key={value}>{content}</div>
							}
							return (
								<Tooltip key={`${value}-${label}`} delayDuration={100}>
									<TooltipTrigger asChild>{content}</TooltipTrigger>
									<TooltipContent className="max-w-[28rem] whitespace-pre-line text-left">{label}</TooltipContent>
								</Tooltip>
							)
						})}
					</div>
				</div>
				<div className="flex min-w-0 flex-wrap items-center gap-2 xl:justify-end">
					<ChartTimeSelect className="w-full sm:w-40" agentVersion={chartData.agentVersion} />
					{onIdentityClick && (
						<Button type="button" variant="outline" size="sm" className="shrink-0 gap-2" onClick={onIdentityClick}>
							<IdCardIcon className="size-4" />
							身份详情
						</Button>
					)}
					{onServicesClick && (
						<Button
							type="button"
							variant={servicesActive ? "default" : "outline"}
							size="sm"
							className="shrink-0 gap-2"
							onClick={onServicesClick}
						>
							<ListChecksIcon className="size-4" />
							软件与服务
						</Button>
					)}
					{onWebsitesClick && (
						<Button
							type="button"
							variant={websitesActive ? "default" : "outline"}
							size="sm"
							className="shrink-0 gap-2"
							onClick={onWebsitesClick}
						>
							<Globe2Icon className="size-4" />
							网站监控
						</Button>
					)}
					<Button
						type="button"
						variant={historyActive ? "default" : "outline"}
						size="sm"
						className="shrink-0 gap-2"
						onClick={onHistoryClick}
					>
						<HistoryIcon className="size-4" />
						操作记录
					</Button>
					{onEdit && (
						<Button type="button" variant="outline" size="sm" className="shrink-0 gap-2" onClick={onEdit}>
							<PencilIcon className="size-4" />
							编辑
						</Button>
					)}
				</div>
			</div>
		</Card>
	)
}

function getBatteryInfo(system: SystemRecord) {
	const [pct, state] = system.info.bat ?? []
	if (pct === undefined) {
		return null
	}

	let Icon = PlugChargingIcon
	let iconClassName = "text-muted-foreground"
	let tone: "default" | "muted" | "warning" | "hub" = "muted"

	if (state === BatteryState.Charging) {
		tone = "hub"
	} else if (pct < 25) {
		iconClassName = pct < 11 ? "text-red-500" : "text-amber-600"
		Icon = BatteryLowIcon
		tone = "warning"
	} else if (pct < 75) {
		Icon = BatteryMediumIcon
	} else if (pct < 95) {
		Icon = BatteryHighIcon
	} else {
		Icon = BatteryFullIcon
	}

	const stateLabel = state !== undefined ? (batteryStateTranslations[state]?.() ?? "状态未知") : "状态未知"

	return {
		Icon,
		iconClassName,
		label: `电池 ${pct}% · ${stateLabel}`,
		tone,
		value: `${pct}%`,
	}
}
