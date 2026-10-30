import { useLingui } from "@lingui/react/macro"
import {
	AppleIcon,
	ClockArrowUp,
	CpuIcon,
	FingerprintIcon,
	Globe2Icon,
	HistoryIcon,
	IdCardIcon,
	ListChecksIcon,
	MemoryStickIcon,
	MonitorIcon,
	MoreHorizontalIcon,
	NetworkIcon,
	PencilIcon,
} from "lucide-react"
import { useMemo, type ReactNode } from "react"
import ChartTimeSelect from "@/components/charts/chart-time-select"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
	compactCpuModel,
	compactHardwareName,
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
	titleOverride,
	headerChips,
	metaChips,
	primaryActions,
	moreMenuItems,
	below,
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
	/** 覆盖标题（如监控页用资产名作为主标题） */
	titleOverride?: string
	/** 标题行追加的状态徽标 / 角标（如监控绑定状态） */
	headerChips?: ReactNode
	/** 状态胶囊行末尾追加的信息胶囊（如资产型号、最近检查时间） */
	metaChips?: ReactNode
	/** 「更多」菜单之外常驻的主操作（如资产详情跳转） */
	primaryActions?: ReactNode
	/** 追加到「更多」菜单末尾的条目（如暂停 / 删除监控目标） */
	moreMenuItems?: ReactNode
	/** 头部卡片底部的附加行（如设备能力条） */
	below?: ReactNode
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
			displayValue?: string
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
			{
				...osInfo[os],
				displayValue: getCompactOsName(String(osInfo[os].value)).replace(/\s+(x86_64|x64|amd64|aarch64)$/i, ""),
			},
			{
				value: cpuModel,
				displayValue: cpuModel ? compactCpuModel(cpuModel) : undefined,
				Icon: CpuIcon,
				hide: !cpuModel,
				label: formatCpuTopology(cores, threads, arch),
			}
		)

		if (memory) {
			const memValue = formatBytes(memory, false, undefined, false)
			const memorySummary =
				memoryInfo?.summary ?? `${toFixedFloat(memValue.value, memValue.value >= 10 ? 1 : 2)} ${memValue.unit}`
			info.push({
				value: memorySummary,
				displayValue: memoryInfo?.compactSummary ?? memorySummary,
				Icon: MemoryStickIcon,
				hide: !memory,
				label: memoryInfo?.label ?? t`Memory`,
			})
		}

		if (networkInfo) {
			info.push({
				value: networkInfo.value,
				displayValue: compactHardwareName(networkInfo.value),
				Icon: NetworkIcon,
				label: networkInfo.label,
			})
			// MAC 挪到头部胶囊行（此前在网络接口卡里），跟网卡型号同排展示
			if (networkInfo.mac) {
				info.push({
					value: networkInfo.mac,
					Icon: FingerprintIcon,
					label: "MAC 地址",
				})
			}
		}

		if (gpuInfo) {
			info.push({
				value: gpuInfo.value,
				displayValue: compactHardwareName(gpuInfo.value),
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
						<h1 className="min-w-0 truncate text-2xl font-semibold sm:text-[1.65rem]">
							{titleOverride ?? displayName}
						</h1>
						{headerChips}
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
					<div className="-mx-4 mt-3 flex flex-wrap items-center gap-1 px-4 xl:mx-0 xl:px-0">
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

						{systemInfo.map(({ value, displayValue, label, Icon, hide }) => {
							if (hide || !value) {
								return null
							}
							const visibleValue = displayValue ?? value
							const content = (
								<div className="flex min-h-10 max-w-full items-center gap-1.5 rounded-md border border-border bg-card px-2 text-[11px] font-medium text-muted-foreground shadow-none">
									<Icon className="size-3.5 shrink-0" />
									<span className="min-w-0 text-foreground">{visibleValue}</span>
								</div>
							)
							if (!label) {
								return <div key={value}>{content}</div>
							}
							return (
								<Tooltip key={`${value}-${label}`} delayDuration={100}>
									<TooltipTrigger asChild>{content}</TooltipTrigger>
									<TooltipContent className="max-w-[28rem] whitespace-pre-line text-left">
										{displayValue && displayValue !== value ? [String(value), label].filter(Boolean).join("\n") : label}
									</TooltipContent>
								</Tooltip>
							)
						})}
						{metaChips}
					</div>
				</div>
				<div className="flex min-w-0 flex-wrap items-center gap-2 xl:justify-end">
					<ChartTimeSelect className="w-full sm:w-40" agentVersion={chartData.agentVersion} />
					{primaryActions}
					{onEdit && (
						<Button type="button" variant="outline" size="sm" className="shrink-0 gap-2" onClick={onEdit}>
							<PencilIcon className="size-4" />
							编辑
						</Button>
					)}
					{(onIdentityClick || onServicesClick || onWebsitesClick || moreMenuItems) && (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="shrink-0 gap-1.5 px-2.5"
									aria-label="更多操作"
								>
									<MoreHorizontalIcon className="size-4" />
									更多
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="min-w-44">
								{onIdentityClick && (
									<DropdownMenuItem onClick={onIdentityClick}>
										<IdCardIcon className="size-4" />
										身份详情
									</DropdownMenuItem>
								)}
								{onServicesClick && (
									<DropdownMenuItem onClick={onServicesClick}>
										<ListChecksIcon className="size-4" />
										{servicesActive ? "✓ 软件与服务" : "软件与服务"}
									</DropdownMenuItem>
								)}
								{onWebsitesClick && (
									<DropdownMenuItem onClick={onWebsitesClick}>
										<Globe2Icon className="size-4" />
										{websitesActive ? "✓ 网站监控" : "网站监控"}
									</DropdownMenuItem>
								)}
								<DropdownMenuItem onClick={onHistoryClick}>
									<HistoryIcon className="size-4" />
									{historyActive ? "✓ 操作记录" : "操作记录"}
								</DropdownMenuItem>
								{moreMenuItems ? (
									<>
										<DropdownMenuSeparator />
										{moreMenuItems}
									</>
								) : null}
							</DropdownMenuContent>
						</DropdownMenu>
					)}
				</div>
			</div>
			{below ? <div className="border-t border-border/70 bg-surface-soft px-3 py-2.5 sm:px-4">{below}</div> : null}
		</Card>
	)
}

function getCompactOsName(value: string) {
	return value.replace(/\s+for\s+Workstations$/i, "")
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
