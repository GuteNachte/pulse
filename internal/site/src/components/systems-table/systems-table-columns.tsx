/** biome-ignore-all lint/correctness/useHookAtTopLevel: Hooks live inside memoized column definitions */
import { t } from "@lingui/core/macro"
import { Trans, useLingui } from "@lingui/react/macro"
import { useStore } from "@nanostores/react"
import { getPagePath } from "@nanostores/router"
import type { CellContext, ColumnDef, HeaderContext } from "@tanstack/react-table"
import type { ClassValue } from "clsx"
import {
	ArrowUpDownIcon,
	ClockArrowUp,
	CopyIcon,
	CpuIcon,
	EyeIcon,
	EyeOffIcon,
	HardDriveIcon,
	MemoryStickIcon,
	MoreHorizontalIcon,
	PauseCircleIcon,
	PenBoxIcon,
	PlayCircleIcon,
	ServerIcon,
	Trash2Icon,
	WifiIcon,
} from "lucide-react"
import { type ElementType, memo, useMemo, useRef, useState } from "react"
import { SystemMetaTags } from "@/components/system-meta-tags"
import { isReadOnlyUser, pb } from "@/lib/api"
import { BatteryState, MeterState, SystemStatus } from "@/lib/enums"
import { getSystemMetricStateLabel, isFiniteMetric, type SystemMetricDisplayState } from "@/lib/system-metrics"
import { getSystemIPAddressLabel } from "@/lib/system-network"
import { $longestSystemNameLen, $userSettings } from "@/lib/stores"
import { getPrimaryUseLabel, getSystemDisplayName, getSystemRoleDisplayLabel } from "@/lib/system-roles"
import {
	cn,
	copyToClipboard,
	decimalString,
	formatBytes,
	formatTemperature,
	parseSemVer,
	secondsToUptimeString,
} from "@/lib/utils"
import { batteryStateTranslations } from "@/lib/i18n"
import type { SystemRecord } from "@/types"
import { SystemDialog } from "../add-system"
import { $router, Link } from "../router"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "../ui/alert-dialog"
import { Button, buttonVariants } from "../ui/button"
import { Dialog } from "../ui/dialog"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu"
import {
	BatteryMediumIcon,
	EthernetIcon,
	GpuIcon,
	HourglassIcon,
	ThermometerIcon,
	BatteryHighIcon,
	BatteryLowIcon,
	PlugChargingIcon,
	BatteryFullIcon,
} from "../ui/icons"

const STATUS_COLORS = {
	[SystemStatus.Up]: "bg-green-500",
	[SystemStatus.Down]: "bg-red-500",
	[SystemStatus.Paused]: "bg-primary/40",
	[SystemStatus.Pending]: "bg-yellow-500",
} as const

export type SystemsTableColumnDef = ColumnDef<SystemRecord> & {
	Icon?: ElementType
	hideSort?: boolean
	name: () => string
}

function getMeterStateByThresholds(value: number, warn = 65, crit = 90): MeterState {
	return value >= crit ? MeterState.Crit : value >= warn ? MeterState.Warn : MeterState.Good
}

export function SystemsTableColumns(): SystemsTableColumnDef[] {
	return [
		{
			// size: 200,
			size: 100,
			minSize: 0,
			accessorKey: "name",
			id: "system",
			name: () => t`System`,
			sortingFn: (a, b) => getSystemDisplayName(a.original).localeCompare(getSystemDisplayName(b.original)),
			filterFn: (() => {
				let filterInput = ""
				let filterInputLower = ""
				const nameCache = new Map<string, string>()
				const statusTranslations = {
					[SystemStatus.Up]: t`Up`.toLowerCase(),
					[SystemStatus.Down]: t`Down`.toLowerCase(),
					[SystemStatus.Paused]: t`Paused`.toLowerCase(),
				} as const

				// match filter value against name or translated status
				return (row, _, newFilterInput) => {
					const sys = row.original
					if (sys.info.v?.includes(newFilterInput)) {
						return true
					}
					if (newFilterInput !== filterInput) {
						filterInput = newFilterInput
						filterInputLower = newFilterInput.toLowerCase()
					}
					const displayName = getSystemDisplayName(sys)
					let nameLower = nameCache.get(displayName)
					if (nameLower === undefined) {
						nameLower = displayName.toLowerCase()
						nameCache.set(displayName, nameLower)
					}
					if (nameLower.includes(filterInputLower)) {
						return true
					}
					const statusLower = statusTranslations[sys.status as keyof typeof statusTranslations]
					return statusLower?.includes(filterInputLower) || false
				}
			})(),
			enableHiding: false,
			invertSorting: false,
			Icon: ServerIcon,
			cell: (info) => {
				const { id } = info.row.original
				const name = getSystemDisplayName(info.row.original)
				const longestName = useStore($longestSystemNameLen)
				const linkUrl = getPagePath($router, "system", { id })

				return (
					<>
						<span className="flex gap-2 items-center font-medium text-sm text-nowrap md:ps-1">
							<IndicatorDot system={info.row.original} />
							<Link
								href={linkUrl}
								tabIndex={-1}
								className="truncate z-10 relative"
								style={{ width: `${longestName / 1.05}ch` }}
								onMouseEnter={(e) => {
									// set title on hover if text is truncated to show full name
									const a = e.currentTarget
									if (a.scrollWidth > a.clientWidth) {
										a.title = name
									} else {
										a.removeAttribute("title")
									}
								}}
							>
								{name}
							</Link>
						</span>
						<Link href={linkUrl} tabIndex={-1} aria-hidden="true" className="inset-0 absolute size-full" />
					</>
				)
			},
			header: sortableHeader,
		},
		{
			accessorFn: ({ name, role, custom_role, primary_use, is_nas, description, info }) => {
				return [
					getSystemDisplayName({ name, info }),
					getSystemRoleDisplayLabel(role, custom_role, name),
					getPrimaryUseLabel(primary_use),
					is_nas ? "NAS" : "",
					getSystemIPAddressLabel({ info }),
					description,
				]
					.filter(Boolean)
					.join(" ")
			},
			id: "description",
			name: () => "说明",
			size: 120,
			hideSort: true,
			Icon: ServerIcon,
			header: sortableHeader,
			cell(info) {
				const system = info.row.original
				const ipLabel = getSystemIPAddressLabel(system)
				return (
					<div className="min-w-0">
						<SystemMetaTags system={system} />
						{ipLabel && (
							<div className="mt-1 truncate text-xs text-muted-foreground" title={ipLabel}>
								{ipLabel}
							</div>
						)}
						{system.description && (
							<div className="mt-1 truncate text-xs text-muted-foreground" title={system.description}>
								{system.description}
							</div>
						)}
					</div>
				)
			},
		},
		{
			accessorFn: ({ info }) => info.cpu ?? undefined,
			id: "cpu",
			name: () => t`CPU`,
			cell: TableCellWithMeter,
			Icon: CpuIcon,
			header: sortableHeader,
		},
		{
			// accessorKey: "info.mp",
			accessorFn: ({ info }) => info.mp ?? undefined,
			id: "memory",
			name: () => t`Memory`,
			cell: TableCellWithMeter,
			Icon: MemoryStickIcon,
			header: sortableHeader,
		},
		{
			accessorFn: ({ info }) => info.dp ?? undefined,
			id: "disk",
			name: () => t`Disk`,
			cell: TableCellWithMeter,
			Icon: HardDriveIcon,
			header: sortableHeader,
		},
		{
			accessorFn: ({ info }) => info.g,
			id: "gpu",
			name: () => "GPU",
			cell: TableCellWithMeter,
			Icon: GpuIcon,
			header: sortableHeader,
		},
		{
			id: "loadAverage",
			accessorFn: ({ info }) => info.la?.reduce((acc, curr) => acc + curr, 0),
			name: () => t({ message: "Load Avg", comment: "Short label for load average" }),
			size: 0,
			Icon: HourglassIcon,
			header: sortableHeader,
			cell(info: CellContext<SystemRecord, unknown>) {
				const { info: sysInfo, status } = info.row.original
				const { major, minor } = parseSemVer(sysInfo.v)
				const { colorWarn = 65, colorCrit = 90 } = useStore($userSettings, { keys: ["colorWarn", "colorCrit"] })
				if (status !== SystemStatus.Up) {
					return <MutedMetricValue state={systemStatusToMetricState(status)} />
				}
				const loadAverages = sysInfo.la || []
				if (loadAverages.length === 0) {
					return <MutedMetricValue state="missing" />
				}

				const max = Math.max(...loadAverages)
				if (max === 0 && major < 1 && minor < 13) {
					return null
				}

				const normalizedLoad = max / (sysInfo.t ?? 1)
				const threshold = getMeterStateByThresholds(normalizedLoad * 100, colorWarn, colorCrit)

				return (
					<LoadAverageSparkline
						loadAverages={loadAverages}
						threads={sysInfo.t}
						threshold={threshold}
						colorWarn={colorWarn}
						colorCrit={colorCrit}
					/>
				)
			},
		},
		{
			accessorFn: ({ info, status }) => {
				if (status !== SystemStatus.Up) {
					return undefined
				}
				if (info.bbd) {
					return info.bbd[0] + info.bbd[1]
				}
				return info.bb
			},
			id: "net",
			name: () => t`Net`,
			size: 0,
			Icon: EthernetIcon,
			header: sortableHeader,
			sortUndefined: "last",
			cell(info) {
				const status = info.row.original.status
				const userSettings = useStore($userSettings, { keys: ["unitNet"] })
				if (status !== SystemStatus.Up) {
					return <MutedMetricValue state={systemStatusToMetricState(status)} />
				}
				const direction = info.row.original.info.bbd
				if (direction) {
					const sent = formatNetworkRate(direction[0], userSettings.unitNet)
					const received = formatNetworkRate(direction[1], userSettings.unitNet)
					return (
						<span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums text-xs leading-5 ">
							<span className="whitespace-nowrap text-muted-foreground">上行 {sent}</span>
							<span className="whitespace-nowrap text-muted-foreground">下行 {received}</span>
						</span>
					)
				}
				const total = info.row.original.info.bb
				if (total === undefined) {
					return <MutedMetricValue state="missing" />
				}
				const { value, unit } = formatBytes(total, true, userSettings.unitNet, false)
				return (
					<span className="tabular-nums whitespace-nowrap">
						{decimalString(value, value >= 100 ? 1 : 2)} {unit}
					</span>
				)
			},
		},
		{
			accessorFn: ({ info }) => info.dt,
			id: "temp",
			name: () => t({ message: "Temp", comment: "Temperature label in systems table" }),
			size: 50,
			hideSort: true,
			Icon: ThermometerIcon,
			header: sortableHeader,
			cell(info) {
				const val = info.getValue() as number
				const userSettings = useStore($userSettings, { keys: ["unitTemp"] })
				if (!val) {
					return null
				}
				const { value, unit } = formatTemperature(val, userSettings.unitTemp)
				return (
					<span className="tabular-nums whitespace-nowrap">
						{decimalString(value, value >= 100 ? 1 : 2)} {unit}
					</span>
				)
			},
		},
		{
			accessorFn: ({ info }) => info.bat?.[0],
			id: "battery",
			name: () => t({ message: "Bat", comment: "Battery label in systems table header" }),
			size: 70,
			Icon: BatteryMediumIcon,
			header: sortableHeader,
			hideSort: true,
			cell(info) {
				const [pct, state] = info.row.original.info.bat ?? []
				if (pct === undefined) {
					return null
				}

				let Icon = PlugChargingIcon
				let iconColor = "text-muted-foreground"

				if (state !== BatteryState.Charging) {
					if (pct < 25) {
						iconColor = pct < 11 ? "text-red-500" : "text-yellow-500"
						Icon = BatteryLowIcon
					} else if (pct < 75) {
						Icon = BatteryMediumIcon
					} else if (pct < 95) {
						Icon = BatteryHighIcon
					} else {
						Icon = BatteryFullIcon
					}
				}

				const stateLabel =
					state !== undefined ? (batteryStateTranslations[state as BatteryState]?.() ?? undefined) : undefined

				return (
					<Link
						tabIndex={-1}
						href={getPagePath($router, "system", { id: info.row.original.id })}
						className="flex items-center gap-1 tabular-nums relative z-10"
						title={stateLabel}
					>
						<Icon className={cn("size-3.5", iconColor)} />
						<span className="min-w-10">{pct}%</span>
					</Link>
				)
			},
		},
		{
			accessorFn: ({ info }) => info.u || undefined,
			id: "uptime",
			name: () => t`Uptime`,
			size: 50,
			Icon: ClockArrowUp,
			header: sortableHeader,
			hideSort: true,
			cell(info) {
				const uptime = info.getValue() as number
				if (!uptime) {
					return null
				}
				return <span className="tabular-nums whitespace-nowrap">{secondsToUptimeString(uptime)}</span>
			},
		},
		{
			accessorFn: ({ info }) => info.v,
			id: "agent",
			name: () => t`Agent`,
			size: 50,
			Icon: WifiIcon,
			hideSort: true,
			header: sortableHeader,
			cell(info) {
				const version = info.getValue() as string
				if (!version) {
					return null
				}
				const system = info.row.original
				const color = {
					"text-green-500": version === globalThis.PULSE.HUB_VERSION,
					"text-yellow-500": version !== globalThis.PULSE.HUB_VERSION,
					"text-red-500": system.status !== SystemStatus.Up,
				}
				return (
					<Link
						href={getPagePath($router, "system", { id: system.id })}
						className="flex gap-1.5 items-center md:pe-5 tabular-nums relative z-10"
						tabIndex={-1}
						aria-hidden="true"
						title={getAgentStatusTitle(system, version)}
						role="none"
					>
						<WifiIcon className={cn("size-3 pointer-events-none", color)} />
						<span className="truncate max-w-14">{info.getValue() as string}</span>
					</Link>
				)
			},
		},
		{
			id: "actions",
			name: () => t({ message: "Actions", comment: "Table column" }),
			size: 50,
			cell: ({ row }) => (
				<div className="relative z-10 flex justify-end items-center gap-1 -ms-3">
					<ActionsButton system={row.original} />
				</div>
			),
		},
	] as SystemsTableColumnDef[]
}

function formatNetworkRate(value: number, unitNet: typeof $userSettings.value.unitNet) {
	const { value: convertedValue, unit } = formatBytes(value, true, unitNet, false)
	return `${decimalString(convertedValue, convertedValue >= 100 ? 1 : 2)} ${unit}`
}

function LoadAverageSparkline({
	loadAverages,
	threads,
	threshold,
	colorWarn,
	colorCrit,
}: {
	loadAverages: number[]
	threads?: number
	threshold: MeterState
	colorWarn: number
	colorCrit: number
}) {
	const labels = ["1m", "5m", "15m"]
	const maxThreads = Math.max(threads ?? 1, 1)
	const title = loadAverages
		.map((value, index) => `${labels[index] ?? `${index + 1}`}: ${decimalString(value, value >= 10 ? 1 : 2)}`)
		.join(" / ")
	return (
		<div className="flex min-w-0 items-center gap-1.5" title={`系统负载 ${title}`}>
			<span
				className={cn("size-1.5 shrink-0 rounded-full", {
					[STATUS_COLORS[SystemStatus.Up]]: threshold === MeterState.Good,
					[STATUS_COLORS[SystemStatus.Pending]]: threshold === MeterState.Warn,
					[STATUS_COLORS[SystemStatus.Down]]: threshold === MeterState.Crit,
				})}
			/>
			<div className="grid w-20 shrink-0 grid-cols-3 gap-1">
				{loadAverages.slice(0, 3).map((value, index) => (
					<LoadAverageSegment
						key={labels[index] ?? index}
						label={labels[index] ?? `${index + 1}`}
						value={value}
						threads={maxThreads}
						colorWarn={colorWarn}
						colorCrit={colorCrit}
					/>
				))}
			</div>
			<span className="shrink-0 text-[10px] leading-none text-muted-foreground tabular-nums">
				{decimalString(loadAverages[0] ?? 0, (loadAverages[0] ?? 0) >= 10 ? 1 : 2)}
			</span>
		</div>
	)
}

function LoadAverageSegment({
	label,
	value,
	threads,
	colorWarn,
	colorCrit,
}: {
	label: string
	value: number
	threads: number
	colorWarn: number
	colorCrit: number
}) {
	const percent = Math.min(Math.max((value / threads) * 100, 0), 100)
	const state = getMeterStateByThresholds(percent, colorWarn, colorCrit)
	return (
		<span
			className="flex h-4 items-end rounded-sm bg-surface-soft px-0.5 pb-0.5 ring-1 ring-border/60"
			title={`${label}: ${decimalString(value, value >= 10 ? 1 : 2)} / ${decimalString(percent, percent >= 10 ? 0 : 1)}%`}
		>
			<span
				className={cn("block w-full rounded-[2px]", {
					"bg-emerald-500": state === MeterState.Good,
					"bg-amber-500": state === MeterState.Warn,
					"bg-red-500": state === MeterState.Crit,
				})}
				style={{ height: `${Math.max(percent, 8)}%` }}
			/>
		</span>
	)
}

function sortableHeader(context: HeaderContext<SystemRecord, unknown>) {
	const { column } = context
	const { Icon, hideSort, name } = column.columnDef as SystemsTableColumnDef
	const isSorted = column.getIsSorted()
	return (
		<Button
			variant="ghost"
			className={cn(
				"min-h-10 px-2.5 flex items-center gap-2 rounded-md text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-surface-soft hover:text-foreground",
				isSorted && "bg-card text-foreground shadow-none ring-1 ring-border/70"
			)}
			onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
		>
			{Icon && <Icon className="size-4" />}
			{name()}
			{hideSort || <ArrowUpDownIcon className="size-3.5" />}
		</Button>
	)
}

function TableCellWithMeter(info: CellContext<SystemRecord, unknown>) {
	const { colorWarn = 65, colorCrit = 90 } = useStore($userSettings, { keys: ["colorWarn", "colorCrit"] })
	const status = info.row.original.status
	const rawValue = info.getValue()
	if (status !== SystemStatus.Up) {
		return <MutedMetricValue state={systemStatusToMetricState(status)} />
	}
	if (!isFiniteMetric(rawValue)) {
		return <MutedMetricValue state="missing" />
	}

	const val = rawValue
	const threshold = getMeterStateByThresholds(val, colorWarn, colorCrit)
	const meterWidth = Math.max(0, Math.min(100, val))
	const meterClass = cn(
		"h-full rounded-[2px]",
		(info.row.original.status !== SystemStatus.Up && STATUS_COLORS.paused) ||
			(threshold === MeterState.Good && STATUS_COLORS.up) ||
			(threshold === MeterState.Warn && STATUS_COLORS.pending) ||
			STATUS_COLORS.down
	)
	return (
		<div className="flex w-full min-w-0 items-center gap-2 tabular-nums ">
			<span className="w-10 shrink-0 text-right">{decimalString(val, val >= 10 ? 1 : 2)}%</span>
			<span className="grid h-2.5 min-w-0 flex-1 overflow-hidden rounded-[3px] border border-border/70 bg-card shadow-none">
				<span className={meterClass} style={{ width: `${meterWidth}%` }}></span>
			</span>
		</div>
	)
}

function MutedMetricValue({ state }: { state: SystemMetricDisplayState }) {
	return <span className="text-xs text-muted-foreground">{getSystemMetricStateLabel(state)}</span>
}

function systemStatusToMetricState(status: SystemRecord["status"]): SystemMetricDisplayState {
	if (status === SystemStatus.Paused) {
		return "paused"
	}
	if (status === SystemStatus.Pending) {
		return "pending"
	}
	return "offline"
}

function getAgentStatusTitle(system: SystemRecord, version: string) {
	const base = version ? `Agent 版本 ${version}` : "Agent 版本未知"
	if (system.status === SystemStatus.Up) {
		return `${base}，在线`
	}
	if (system.status === SystemStatus.Paused) {
		return `${base}，已暂停监控`
	}
	if (system.status === SystemStatus.Pending) {
		return `${base}，等待 Agent 上线`
	}
	return `${base}，离线`
}

export function IndicatorDot({ system, className }: { system: SystemRecord; className?: ClassValue }) {
	className ||= STATUS_COLORS[system.status as keyof typeof STATUS_COLORS] || ""
	return (
		<span
			className={cn("shrink-0 size-2 rounded-full", className)}
			// style={{ marginBottom: "-1px" }}
		/>
	)
}

export const ActionsButton = memo(({ system }: { system: SystemRecord }) => {
	const [deleteOpen, setDeleteOpen] = useState(false)
	const [editOpen, setEditOpen] = useState(false)
	const [pauseOpen, setPauseOpen] = useState(false)
	const [hideFromHomeOpen, setHideFromHomeOpen] = useState(false)
	const editOpened = useRef(false)
	const { t } = useLingui()
	const { id, status } = system
	const name = getSystemDisplayName(system)
	const uninstall = getAgentUninstallInstructions(system)
	const canDelete = !isReadOnlyUser() && !system.is_local
	const nextStatus = status === SystemStatus.Paused ? SystemStatus.Pending : SystemStatus.Paused
	const nextHideFromHome = !system.hide_from_home
	const updateStatus = () => {
		pb.collection("systems").update(id, { status: nextStatus })
	}
	const updateHomeVisibility = () => {
		pb.collection("systems").update(id, { hide_from_home: nextHideFromHome })
	}

	return useMemo(() => {
		return (
			<>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size={"icon"}>
							<span className="sr-only">
								<Trans>Open menu</Trans>
							</span>
							<MoreHorizontalIcon className="w-5" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						{!isReadOnlyUser() && (
							<DropdownMenuItem
								onSelect={() => {
									editOpened.current = true
									setEditOpen(true)
								}}
							>
								<PenBoxIcon className="me-2.5 size-4" />
								<Trans>Edit</Trans>
							</DropdownMenuItem>
						)}
						<DropdownMenuItem
							className={cn(isReadOnlyUser() && "hidden")}
							onClick={() => {
								if (system.is_local && nextStatus === SystemStatus.Paused) {
									setPauseOpen(true)
									return
								}
								updateStatus()
							}}
						>
							{status === SystemStatus.Paused ? (
								<>
									<PlayCircleIcon className="me-2.5 size-4" />
									<Trans>Resume</Trans>
								</>
							) : (
								<>
									<PauseCircleIcon className="me-2.5 size-4" />
									<Trans>Pause</Trans>
								</>
							)}
						</DropdownMenuItem>
						<DropdownMenuItem onClick={() => copyToClipboard(name)}>
							<CopyIcon className="me-2.5 size-4" />
							<Trans>Copy name</Trans>
						</DropdownMenuItem>
						<DropdownMenuItem
							className={cn(isReadOnlyUser() && "hidden")}
							onClick={() => {
								if (system.is_local && nextHideFromHome) {
									setHideFromHomeOpen(true)
									return
								}
								updateHomeVisibility()
							}}
						>
							{system.hide_from_home ? (
								<>
									<EyeIcon className="me-2.5 size-4" />
									首页显示
								</>
							) : (
								<>
									<EyeOffIcon className="me-2.5 size-4" />
									首页隐藏
								</>
							)}
						</DropdownMenuItem>
						{canDelete && (
							<>
								<DropdownMenuSeparator />
								<DropdownMenuItem onSelect={() => setDeleteOpen(true)}>
									<Trash2Icon className="me-2.5 size-4" />
									<Trans>Delete</Trans>
								</DropdownMenuItem>
							</>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
				<Dialog open={editOpen} onOpenChange={setEditOpen}>
					{editOpened.current && <SystemDialog system={system} setOpen={setEditOpen} />}
				</Dialog>
				<AlertDialog open={pauseOpen} onOpenChange={setPauseOpen}>
					<AlertDialogContent className="max-w-lg">
						<AlertDialogHeader>
							<AlertDialogTitle>确认暂停 Hub 机器监控？</AlertDialogTitle>
							<AlertDialogDescription>
								{name} 带有 Hub 标签。暂停后 Hub 不会继续刷新这台机器的监控状态，相关离线 /
								恢复判断也会停止。仅在明确需要隐藏或维护 Hub 所在机器时执行。
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>取消</AlertDialogCancel>
							<AlertDialogAction
								onClick={() => {
									updateStatus()
									setPauseOpen(false)
								}}
							>
								确认暂停
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
				<AlertDialog open={hideFromHomeOpen} onOpenChange={setHideFromHomeOpen}>
					<AlertDialogContent className="max-w-lg">
						<AlertDialogHeader>
							<AlertDialogTitle>确认从首页隐藏 Hub 机器？</AlertDialogTitle>
							<AlertDialogDescription>
								{name} 带有 Hub
								标签。隐藏后它不会出现在首页概览和最近机器列表，但客户端列表、详情页、告警和采集不会停止。
								如果只是临时维护且不想继续采集，请使用暂停监控。
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>取消</AlertDialogCancel>
							<AlertDialogAction
								onClick={() => {
									updateHomeVisibility()
									setHideFromHomeOpen(false)
								}}
							>
								确认隐藏
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
				<AlertDialog open={deleteOpen} onOpenChange={(open) => setDeleteOpen(open)}>
					<AlertDialogContent className="max-w-2xl">
						<AlertDialogHeader>
							<AlertDialogTitle>
								<Trans>Are you sure you want to delete {name}?</Trans>
							</AlertDialogTitle>
							<AlertDialogDescription asChild>
								<div className="grid gap-3 text-sm">
									<p>
										删除 Hub 记录不会自动卸载目标机器上的
										Agent。请先在目标机器执行下面的卸载命令，确认服务或容器已清理后，再删除 Hub 端记录。
									</p>
									<div className="rounded-md border border-border/70 bg-surface-soft p-3">
										<div className="mb-2 flex items-center justify-between gap-2">
											<div>
												<div className="font-medium text-foreground">{uninstall.title}</div>
												<div className="text-xs text-muted-foreground">{uninstall.description}</div>
											</div>
											<Button
												type="button"
												variant="outline"
												size="sm"
												className="min-h-10 gap-1.5 transition-transform active:scale-[0.96]"
												onClick={() => copyToClipboard(uninstall.command)}
											>
												<CopyIcon className="size-3.5" />
												复制
											</Button>
										</div>
										<pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded-md border border-border/70 bg-card p-3 text-xs text-foreground">
											{uninstall.command}
										</pre>
									</div>
									<p className="text-xs text-muted-foreground">
										卸载完成后，继续删除 {name} 的 Hub 端历史记录、Token 和配置。
									</p>
								</div>
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>
								<Trans>Cancel</Trans>
							</AlertDialogCancel>
							<AlertDialogAction
								className={cn(buttonVariants({ variant: "destructive" }))}
								onClick={() => {
									if (!canDelete) {
										setDeleteOpen(false)
										return
									}
									pb.send(`/api/pulse/systems/${id}`, { method: "DELETE" })
								}}
							>
								<Trans>Continue</Trans>
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</>
		)
	}, [
		id,
		status,
		name,
		system,
		t,
		deleteOpen,
		editOpen,
		pauseOpen,
		hideFromHomeOpen,
		canDelete,
		nextStatus,
		nextHideFromHome,
	])
})

function getAgentUninstallInstructions(system: SystemRecord) {
	const cap = system.info?.cap
	const profile = cap?.agent_profile?.toLowerCase()
	const runMode = cap?.run_mode?.toLowerCase()
	const installMethod = cap?.install_method?.toLowerCase()
	const platform = cap?.platform?.toLowerCase()
	const os = system.info?.os
	const isWindows =
		profile === "windows-host" ||
		runMode === "windows_service" ||
		installMethod === "host" ||
		platform === "windows" ||
		os === 1
	const isDocker = profile === "linux-container" || runMode === "docker" || installMethod === "docker"

	if (isWindows) {
		return {
			title: "Windows 主机版 Agent",
			description: "在目标 Windows 机器上以管理员 PowerShell 执行。",
			command: `$ErrorActionPreference = "Continue"
$Nssm = (Get-Command nssm -ErrorAction SilentlyContinue).Source
if ($Nssm) {
  & $Nssm stop pulse-agent 2>$null
  & $Nssm remove pulse-agent confirm 2>$null
} else {
  Stop-Service -Name pulse-agent -Force -ErrorAction SilentlyContinue
  sc.exe delete pulse-agent | Out-Null
}
Stop-Process -Name pulse-agent -Force -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force -LiteralPath (Join-Path $env:ProgramData "pulse-agent") -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force -LiteralPath (Join-Path $env:WINDIR "System32\\config\\systemprofile\\AppData\\Roaming\\pulse-agent") -ErrorAction SilentlyContinue
if (Get-Command winget -ErrorAction SilentlyContinue) { winget uninstall --exact --id NSSM.NSSM --accept-source-agreements --silent 2>$null | Out-Null }
if (Get-Command scoop -ErrorAction SilentlyContinue) { scoop uninstall nssm 2>$null | Out-Null }
[pscustomobject]@{
  ServiceExists = [bool](Get-Service -Name pulse-agent -ErrorAction SilentlyContinue)
  AgentProcessCount = @((Get-Process -Name pulse-agent -ErrorAction SilentlyContinue)).Count
  ProgramDataExists = Test-Path (Join-Path $env:ProgramData "pulse-agent")
  NssmExists = [bool](Get-Command nssm -ErrorAction SilentlyContinue)
} | Format-List`,
		}
	}

	if (isDocker) {
		return {
			title: "Linux / NAS Docker Agent",
			description: "在目标 Linux、飞牛或 NAS 机器上执行；如果用 Compose 部署，优先在 compose.yml 所在目录执行。",
			command: `# Docker 直接删除
docker rm -f pulse-agent
rm -rf ./pulse_agent_data

# 如果是 Docker Compose 部署，进入 compose.yml 所在目录后执行
docker compose down
rm -rf ./pulse_agent_data

docker ps -a --filter name=pulse-agent`,
		}
	}

	return {
		title: "Agent 卸载方式",
		description: "当前记录没有上报安装方式，请按实际安装类型选择对应命令。",
		command: `# Windows 主机版，管理员 PowerShell
$Nssm = (Get-Command nssm -ErrorAction SilentlyContinue).Source
if ($Nssm) {
  & $Nssm stop pulse-agent 2>$null
  & $Nssm remove pulse-agent confirm 2>$null
}
Stop-Process -Name pulse-agent -Force -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force -LiteralPath (Join-Path $env:ProgramData "pulse-agent") -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force -LiteralPath (Join-Path $env:WINDIR "System32\\config\\systemprofile\\AppData\\Roaming\\pulse-agent") -ErrorAction SilentlyContinue
if (Get-Command winget -ErrorAction SilentlyContinue) { winget uninstall --exact --id NSSM.NSSM --accept-source-agreements --silent 2>$null | Out-Null }
if (Get-Command scoop -ErrorAction SilentlyContinue) { scoop uninstall nssm 2>$null | Out-Null }

# Linux / NAS Docker 版
docker rm -f pulse-agent
rm -rf ./pulse_agent_data`,
	}
}
