import type { Column, ColumnDef } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { cn, hourWithSeconds } from "@/lib/utils"
import type { ContainerRecord } from "@/types"
import { ContainerHealth, ContainerHealthLabels } from "@/lib/enums"
import {
	formatContainerCpu,
	getProtectedContainerReason,
	formatContainerMemory,
	formatContainerNetwork,
	isContainerRunningStatus,
} from "@/lib/container-display"
import {
	ClockIcon,
	ContainerIcon,
	CpuIcon,
	LayersIcon,
	MemoryStickIcon,
	PlayIcon,
	RefreshCwIcon,
	RotateCwIcon,
	ServerIcon,
	ShieldCheckIcon,
	SquareIcon,
} from "lucide-react"
import { EthernetIcon, HourglassIcon, SquareArrowRightEnterIcon } from "../ui/icons"
import { Badge } from "../ui/badge"
import { t } from "@lingui/core/macro"
import { $allSystemsById, $longestSystemNameLen } from "@/lib/stores"
import { getSystemDisplayName } from "@/lib/system-roles"
import { useStore } from "@nanostores/react"
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip"

type ContainerOperationAction = "start_container" | "stop_container" | "restart_container" | "update_container_image"

export type ContainerOperationHandler = (container: ContainerRecord, action: ContainerOperationAction) => void

// Unit names and their corresponding number of seconds for converting docker status strings
const unitSeconds = [
	["s", 1],
	["mi", 60],
	["h", 3600],
	["d", 86400],
	["w", 604800],
	["mo", 2592000],
] as const
// Convert docker status string to number of seconds ("Up X minutes", "Up X hours", etc.)
function getStatusValue(status: string): number {
	if (status.startsWith("运行中")) {
		return 1
	}
	if (status.startsWith("已停止")) {
		return 0
	}
	const [_, num, unit] = status.split(" ")
	// Docker uses "a" or "an" instead of "1" for singular units (e.g., "Up a minute", "Up an hour")
	const numValue = num === "a" || num === "an" ? 1 : Number(num)
	for (const [unitName, value] of unitSeconds) {
		if (unit.startsWith(unitName)) {
			return numValue * value
		}
	}
	return 0
}

export function formatContainerStatus(status?: string) {
	const normalized = (status ?? "").trim()
	const lower = normalized.toLowerCase()
	if (!normalized) {
		return "未知"
	}
	if (lower.startsWith("up")) {
		const rest = normalized.replace(/^up\s*/i, "").trim()
		return rest ? `运行中 ${formatContainerStatusDuration(rest)}` : "运行中"
	}
	if (lower.startsWith("exited")) {
		const rest = normalized.replace(/^exited\s*/i, "").trim()
		return rest ? `已停止 ${formatContainerStatusDuration(rest)}` : "已停止"
	}
	if (lower.includes("running")) {
		return "运行中"
	}
	if (lower.includes("paused")) {
		return "已暂停"
	}
	if (lower.includes("restarting")) {
		return "重启中"
	}
	if (lower.includes("created")) {
		return "已创建"
	}
	if (lower.includes("dead")) {
		return "异常退出"
	}
	return normalized
}

function formatContainerStatusDuration(value: string) {
	return value
		.replace(/\babout\s+/gi, "约 ")
		.replace(/\bless than a second\b/gi, "不到 1 秒")
		.replace(/\ba second\b/gi, "1 秒")
		.replace(/\ban? minute\b/gi, "1 分钟")
		.replace(/\ban? hour\b/gi, "1 小时")
		.replace(/\ban? day\b/gi, "1 天")
		.replace(/\ban? week\b/gi, "1 周")
		.replace(/\ban? month\b/gi, "1 个月")
		.replace(/\ban? year\b/gi, "1 年")
		.replace(/\bseconds\b/gi, "秒")
		.replace(/\bminutes\b/gi, "分钟")
		.replace(/\bhours\b/gi, "小时")
		.replace(/\bdays\b/gi, "天")
		.replace(/\bweeks\b/gi, "周")
		.replace(/\bmonths\b/gi, "个月")
		.replace(/\byears\b/gi, "年")
}

export function createContainerColumns(requestOperation?: ContainerOperationHandler): ColumnDef<ContainerRecord>[] {
	const columns: ColumnDef<ContainerRecord>[] = [
		{
			id: "name",
			sortingFn: (a, b) => a.original.name.localeCompare(b.original.name),
			accessorFn: (record) => record.name,
			header: ({ column }) => <HeaderButton column={column} name={t`Name`} Icon={ContainerIcon} />,
			cell: ({ getValue }) => {
				return <span className="ms-1.5 xl:w-48 block truncate">{getValue() as string}</span>
			},
		},
		{
			id: "system",
			accessorFn: (record) => record.system,
			sortingFn: (a, b) => {
				const allSystems = $allSystemsById.get()
				const systemNameA = getSystemDisplayName(allSystems[a.original.system], "")
				const systemNameB = getSystemDisplayName(allSystems[b.original.system], "")
				return systemNameA.localeCompare(systemNameB)
			},
			header: ({ column }) => <HeaderButton column={column} name={t`System`} Icon={ServerIcon} />,
			cell: ({ getValue }) => {
				const allSystems = useStore($allSystemsById)
				const longestName = useStore($longestSystemNameLen)
				return (
					<div className="ms-1 max-w-40 truncate" style={{ width: `${longestName / 1.05}ch` }}>
						{getSystemDisplayName(allSystems[getValue() as string], "")}
					</div>
				)
			},
		},
		// {
		// 	id: "id",
		// 	accessorFn: (record) => record.id,
		// 	sortingFn: (a, b) => a.original.id.localeCompare(b.original.id),
		// 	header: ({ column }) => <HeaderButton column={column} name="ID" Icon={HashIcon} />,
		// 	cell: ({ getValue }) => {
		// 		return <span className="ms-1.5 me-3 font-mono">{getValue() as string}</span>
		// 	},
		// },
		{
			id: "stack",
			sortingFn: (a, b) => (a.original.stack_project || "").localeCompare(b.original.stack_project || ""),
			accessorFn: (record) => record.stack_project || "独立容器",
			header: ({ column }) => <HeaderButton column={column} name="堆栈" Icon={LayersIcon} />,
			cell: ({ row, getValue }) => {
				const project = getValue() as string
				const service = row.original.stack_service
				return (
					<div className="ms-1 max-w-44 truncate">
						<span>{project}</span>
						{service && <span className="text-muted-foreground"> / {service}</span>}
					</div>
				)
			},
		},
		{
			id: "cpu",
			accessorFn: (record) => record.cpu,
			invertSorting: true,
			header: ({ column }) => <HeaderButton column={column} name={t`CPU`} Icon={CpuIcon} />,
			cell: ({ getValue }) => {
				return <span className="ms-1 tabular-nums">{formatContainerCpu(getValue())}</span>
			},
		},
		{
			id: "memory",
			accessorFn: (record) => record.memory,
			invertSorting: true,
			header: ({ column }) => <HeaderButton column={column} name={t`Memory`} Icon={MemoryStickIcon} />,
			cell: ({ getValue }) => {
				return <span className="ms-1 tabular-nums">{formatContainerMemory(getValue())}</span>
			},
		},
		{
			id: "net",
			accessorFn: (record) => record.net,
			invertSorting: true,
			header: ({ column }) => <HeaderButton column={column} name={t`Net`} Icon={EthernetIcon} />,
			minSize: 112,
			cell: ({ getValue }) => {
				return <div className="ms-1 tabular-nums">{formatContainerNetwork(getValue())}</div>
			},
		},
		{
			id: "health",
			invertSorting: true,
			accessorFn: (record) => record.health,
			header: ({ column }) => <HeaderButton column={column} name={t`Health`} Icon={ShieldCheckIcon} />,
			minSize: 121,
			cell: ({ getValue }) => {
				const healthValue = getValue() as number
				const healthStatus = ContainerHealthLabels[healthValue] || "未知"
				return (
					<Tooltip>
						<TooltipTrigger asChild>
							<Badge variant="outline" className="dark:border-white/12">
								<span
									className={cn("size-2 me-1.5 rounded-full", {
										"bg-green-500": healthValue === ContainerHealth.Healthy,
										"bg-red-500": healthValue === ContainerHealth.Unhealthy,
										"bg-yellow-500": healthValue === ContainerHealth.Starting,
										"bg-muted-foreground": healthValue === ContainerHealth.None,
									})}
								></span>
								{healthStatus}
							</Badge>
						</TooltipTrigger>
						<TooltipContent>
							{healthValue === ContainerHealth.None ? "容器没有配置 Docker healthcheck。" : "来自 Docker healthcheck。"}
						</TooltipContent>
					</Tooltip>
				)
			},
		},
		{
			id: "ports",
			accessorFn: (record) => record.ports || undefined,
			header: ({ column }) => (
				<HeaderButton
					column={column}
					name={t({ message: "Ports", context: "Container ports" })}
					Icon={SquareArrowRightEnterIcon}
				/>
			),
			sortingFn: (a, b) => getPortValue(a.original.ports) - getPortValue(b.original.ports),
			minSize: 147,
			cell: ({ getValue }) => {
				const val = getValue() as string | undefined
				if (!val) {
					return <div className="ms-1.5 text-muted-foreground">-</div>
				}
				const className = "ms-1 w-27 block truncate tabular-nums"
				if (val.length > 14) {
					return (
						<Tooltip>
							<TooltipTrigger className={className}>{val}</TooltipTrigger>
							<TooltipContent>{val}</TooltipContent>
						</Tooltip>
					)
				}
				return <span className={className}>{val}</span>
			},
		},
		{
			id: "image",
			sortingFn: (a, b) => a.original.image.localeCompare(b.original.image),
			accessorFn: (record) => record.image,
			header: ({ column }) => (
				<HeaderButton column={column} name={t({ message: "Image", context: "Docker image" })} Icon={LayersIcon} />
			),
			cell: ({ getValue }) => {
				const val = getValue() as string
				return (
					<div className="ms-1 xl:w-40 truncate" title={val}>
						{val}
					</div>
				)
			},
		},
		{
			id: "status",
			accessorFn: (record) => record.status,
			invertSorting: true,
			sortingFn: (a, b) => getStatusValue(a.original.status) - getStatusValue(b.original.status),
			header: ({ column }) => <HeaderButton column={column} name={t`Status`} Icon={HourglassIcon} />,
			cell: ({ getValue }) => {
				const status = getValue() as string
				return (
					<span className="ms-1 w-25 block truncate" title={status}>
						{formatContainerStatus(status)}
					</span>
				)
			},
		},
		{
			id: "updated",
			invertSorting: true,
			accessorFn: (record) => record.updated,
			header: ({ column }) => <HeaderButton column={column} name={t`Updated`} Icon={ClockIcon} />,
			cell: ({ getValue }) => {
				const timestamp = getValue() as number
				return <span className="ms-1 tabular-nums">{hourWithSeconds(new Date(timestamp).toISOString())}</span>
			},
		},
	]

	if (requestOperation) {
		columns.push({
			id: "actions",
			enableSorting: false,
			header: () => <div className="px-3 text-muted-foreground">操作</div>,
			minSize: 124,
			cell: ({ row }) => <ContainerActionButtons container={row.original} requestOperation={requestOperation} />,
		})
	}

	return columns
}

export const containerChartCols = createContainerColumns()

function ContainerActionButtons({
	container,
	requestOperation,
}: {
	container: ContainerRecord
	requestOperation: ContainerOperationHandler
}) {
	const system = $allSystemsById.get()[container.system]
	const operations = system?.info?.cap?.operations ?? []
	const unsupported = system?.info?.cap?.unsupported_reasons ?? {}
	const status = (container.status ?? "").toLowerCase()
	const running = isContainerRunningStatus(status)
	const protectedReason = getProtectedContainerReason(container)
	const capabilityReason = operations.includes("container_control")
		? ""
		: unsupported.container_control || "当前 Agent 没有声明容器控制能力。"
	const actions: { action: ContainerOperationAction; label: string; icon: React.ElementType; disabled: boolean }[] = [
		{ action: "start_container", label: "启动", icon: PlayIcon, disabled: running },
		{ action: "stop_container", label: "停止", icon: SquareIcon, disabled: !running },
		{ action: "restart_container", label: "重启", icon: RotateCwIcon, disabled: !running },
		{ action: "update_container_image", label: "更新镜像", icon: RefreshCwIcon, disabled: false },
	]

	return (
		<div className="flex items-center gap-1.5">
			{actions.map(({ action, label, icon: Icon, disabled }) => {
				const disabledReason = protectedReason || capabilityReason
				const isDisabled = Boolean(disabledReason) || disabled
				return (
					<Tooltip key={action}>
						<TooltipTrigger asChild>
							<span className="inline-flex">
								<Button
									size="icon"
									variant="outline"
									className={cn(
										"size-10 rounded-md border-border/70 bg-card shadow-none hover:bg-surface-soft",
										isDisabled && "opacity-45"
									)}
									disabled={isDisabled}
									aria-label={label}
									onClick={(event) => {
										event.stopPropagation()
										requestOperation(container, action)
									}}
								>
									<Icon className="size-4" />
								</Button>
							</span>
						</TooltipTrigger>
						<TooltipContent>{disabledReason || (disabled ? "当前状态下不需要执行该操作。" : label)}</TooltipContent>
					</Tooltip>
				)
			})}
		</div>
	)
}

function HeaderButton({
	column,
	name,
	Icon,
}: {
	column: Column<ContainerRecord>
	name: string
	Icon: React.ElementType
}) {
	const isSorted = column.getIsSorted()
	return (
		<Button
			className={cn(
				"min-h-10 px-2.5 flex items-center gap-2 rounded-md text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-surface-soft hover:text-foreground",
				isSorted && "bg-card text-foreground shadow-none ring-1 ring-border/70"
			)}
			variant="ghost"
			onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
		>
			{Icon && <Icon className="size-4" />}
			{name}
			{/* <ArrowUpDownIcon className="size-4" /> */}
		</Button>
	)
}

/**
 * Convert port string to a number for sorting.
 * Handles formats like "80", "127.0.0.1:80", and "80, 443" (takes the first mapping).
 */
function getPortValue(ports: string | undefined): number {
	if (!ports) {
		return 0
	}
	const first = ports.includes(",") ? ports.substring(0, ports.indexOf(",")) : ports
	const colonIndex = first.lastIndexOf(":")
	const portStr = colonIndex === -1 ? first : first.substring(colonIndex + 1)
	return Number(portStr) || 0
}
