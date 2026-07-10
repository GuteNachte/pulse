/** biome-ignore-all lint/security/noDangerouslySetInnerHtml: html comes directly from docker via agent */
import { t } from "@lingui/core/macro"
import { useStore } from "@nanostores/react"
import {
	flexRender,
	getCoreRowModel,
	getSortedRowModel,
	type Row,
	type SortingState,
	type Table as TableType,
	useReactTable,
	type VisibilityState,
} from "@tanstack/react-table"
import { useVirtualizer, type VirtualItem } from "@tanstack/react-virtual"
import { memo, type RefObject, useCallback, useEffect, useRef, useState } from "react"
import { useMemo } from "react"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState, TableEmptyRow } from "@/components/ui/empty-state"
import { pb } from "@/lib/api"
import { createLatestRequestGuard } from "@/lib/latest-request-guard"
import type { ContainerRecord, SystemRecord } from "@/types"
import {
	createContainerColumns,
	formatContainerStatus,
	type ContainerOperationHandler,
} from "@/components/containers-table/containers-table-columns"
import { Card, CardHeader } from "@/components/ui/card"
import {
	formatContainerCpu,
	formatContainerHealth,
	formatContainerMemory,
	formatContainerMetricNumber,
	formatContainerNetwork,
	getProtectedContainerReason,
	isContainerRunningStatus,
} from "@/lib/container-display"
import { getSystemDisplayName as getSystemRecordDisplayName } from "@/lib/system-roles"
import { cn, hourWithSeconds, useBrowserStorage } from "@/lib/utils"
import { Sheet, SheetTitle, SheetHeader, SheetContent, SheetDescription } from "../ui/sheet"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { $allSystemsById } from "@/lib/stores"
import {
	ChevronDownIcon,
	LayersIcon,
	MaximizeIcon,
	PlayIcon,
	RefreshCwIcon,
	RotateCwIcon,
	SquareIcon,
} from "lucide-react"
import { Separator } from "../ui/separator"
import { Link, prependBasePath } from "../router"
import { listenKeys } from "nanostores"
import { toast } from "../ui/use-toast"
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip"
import { MobileContainersView } from "../mobile/mobile-containers"
import { OperationConfirmDialog } from "../operation-confirm-dialog"
import {
	formatOperationResponseMessage,
	getOperationErrorMessage,
	getOperationResponseFromError,
	OperationToastAction,
	type OperationApiResponse,
} from "@/lib/operation-feedback"

const syntaxTheme = "github-dark-dimmed"

type ContainerOperationAction = "start_container" | "stop_container" | "restart_container" | "update_container_image"
type ContainerStackOperationAction =
	| "start_container_stack"
	| "stop_container_stack"
	| "restart_container_stack"
	| "update_container_stack_images"
type PendingContainerOperation = {
	container: ContainerRecord
	action: ContainerOperationAction
}
type PendingStackOperation = {
	stack: ContainerStackGroup
	action: ContainerStackOperationAction
}
type ContainerSystemCard = {
	id: string
	total: number
	running: number
	stopped: number
}
type ContainerListResponse = {
	items?: ContainerRecord[]
	systems?: ContainerSystemCard[]
	system?: string
	hasMore?: boolean
	limit?: number
}

export default function ContainersTable({ systemId }: { systemId?: string }) {
	const systemsById = useStore($allSystemsById)
	const [data, setData] = useState<ContainerRecord[] | undefined>(undefined)
	const [systemCards, setSystemCards] = useState<ContainerSystemCard[]>([])
	const [selectedSystemId, setSelectedSystemId] = useState(systemId ?? "")
	const [containersHasMore, setContainersHasMore] = useState(false)
	const selectedSystemIdRef = useRef(selectedSystemId)
	const requestIdRef = useRef(0)
	const [sorting, setSorting] = useBrowserStorage<SortingState>(
		`sort-c-${systemId ? 1 : 0}`,
		[{ id: systemId ? "name" : "system", desc: false }],
		sessionStorage
	)
	const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})

	// Hide ports column if no ports are present
	useEffect(() => {
		if (data) {
			const hasPorts = data.some((container) => container.ports)
			setColumnVisibility((prev) => {
				if (prev.ports === hasPorts) {
					return prev
				}
				return { ...prev, ports: hasPorts }
			})
		}
	}, [data])

	const [rowSelection, setRowSelection] = useState({})
	const [pendingOperation, setPendingOperation] = useState<PendingContainerOperation | null>(null)
	const [pendingStackOperation, setPendingStackOperation] = useState<PendingStackOperation | null>(null)
	const [runningKey, setRunningKey] = useState("")
	const activeContainer = useRef<ContainerRecord | null>(null)
	const [sheetOpen, setSheetOpen] = useState(false)

	useEffect(() => {
		selectedSystemIdRef.current = selectedSystemId
	}, [selectedSystemId])

	const loadContainers = useCallback(
		async (targetSystemId?: string) => {
			const requestId = requestIdRef.current + 1
			requestIdRef.current = requestId
			const params = new URLSearchParams()
			const normalizedSystemId = (systemId ?? targetSystemId ?? "").trim()
			if (normalizedSystemId) {
				params.set("system", normalizedSystemId)
			}
			params.set("limit", "5000")
			try {
				const response = await pb.send<ContainerListResponse>(`/api/pulse/containers?${params.toString()}`, {
					method: "GET",
					requestKey: null,
				})
				if (requestIdRef.current !== requestId) return
				setSystemCards(response.systems ?? [])
				setData(response.items ?? [])
				setContainersHasMore(Boolean(response.hasMore))
				const nextSystemId = response.system ?? normalizedSystemId
				if (nextSystemId !== selectedSystemIdRef.current) {
					setSelectedSystemId(nextSystemId)
				}
			} catch (error) {
				console.error("load containers", error)
				if (requestIdRef.current !== requestId) return
				setData([])
				setContainersHasMore(false)
			}
		},
		[systemId]
	)

	const handleSelectSystem = useCallback((nextSystemId: string) => {
		if (nextSystemId === selectedSystemIdRef.current) return
		setSelectedSystemId(nextSystemId)
		setData(undefined)
		setContainersHasMore(false)
	}, [])

	const openContainerSheet = (container: ContainerRecord) => {
		activeContainer.current = container
		setSheetOpen(true)
	}

	const requestOperation: ContainerOperationHandler = (container, action) => {
		setPendingOperation({ container, action })
	}

	const requestStackOperation = (stack: ContainerStackGroup, action: ContainerStackOperationAction) => {
		setPendingStackOperation({ stack, action })
	}

	const confirmOperation = async () => {
		if (!pendingOperation) return
		const { container, action } = pendingOperation
		const key = `${container.system}:${container.id}:${action}`
		setRunningKey(key)
		try {
			const response = await pb.send<OperationApiResponse>("/api/pulse/operations", {
				method: "POST",
				body: {
					system: container.system,
					action,
					target: container.id,
					confirm: true,
				},
			})
			if (response.status === "succeeded") {
				toast({
					title: "容器操作成功",
					description: response.message || container.name,
					action: <OperationToastAction systemId={container.system} />,
				})
				setData((current) => updateContainerStatusAfterOperation(current, container.id, action))
				loadContainers(container.system).catch((error) => console.error("refresh containers", error))
			} else {
				toast({
					title: "容器操作失败",
					description: formatOperationResponseMessage(response, container.name),
					variant: "destructive",
					action: <OperationToastAction systemId={container.system} />,
				})
			}
		} catch (error) {
			const response = getOperationResponseFromError(error)
			toast({
				title: "容器操作失败",
				description: getOperationErrorMessage(error, "请确认 Agent 在线，并且 Docker socket 有控制权限。"),
				variant: "destructive",
				action: response?.id ? <OperationToastAction systemId={container.system} /> : undefined,
			})
		} finally {
			setRunningKey("")
			setPendingOperation(null)
		}
	}

	const confirmStackOperation = async () => {
		if (!pendingStackOperation) return
		const { stack, action } = pendingStackOperation
		const key = `${stack.system}:${stack.project}:${action}`
		setRunningKey(key)
		try {
			const response = await pb.send<OperationApiResponse>("/api/pulse/operations", {
				method: "POST",
				body: {
					system: stack.system,
					action,
					target: stack.project,
					confirm: true,
				},
			})
			if (response.status === "succeeded") {
				toast({
					title: "堆栈操作成功",
					description: response.message || stack.project,
					action: <OperationToastAction systemId={stack.system} />,
				})
				setData((current) => updateStackStatusAfterOperation(current, stack, action))
				loadContainers(stack.system).catch((error) => console.error("refresh containers", error))
			} else {
				toast({
					title: "堆栈操作失败",
					description: formatOperationResponseMessage(response, stack.project),
					variant: "destructive",
					action: <OperationToastAction systemId={stack.system} />,
				})
			}
		} catch (error) {
			const response = getOperationResponseFromError(error)
			toast({
				title: "堆栈操作失败",
				description: getOperationErrorMessage(error, "请确认 Agent 在线，并且 Docker socket 有控制权限。"),
				variant: "destructive",
				action: response?.id ? <OperationToastAction systemId={stack.system} /> : undefined,
			})
		} finally {
			setRunningKey("")
			setPendingStackOperation(null)
		}
	}

	useEffect(() => {
		loadContainers((systemId ?? selectedSystemId) || undefined)
	}, [loadContainers, selectedSystemId, systemId])

	useEffect(() => {
		let refreshTimer: ReturnType<typeof setTimeout> | undefined
		const startedAt = Date.now()
		const scheduleRefresh = () => {
			if (refreshTimer) {
				clearTimeout(refreshTimer)
			}
			refreshTimer = setTimeout(() => {
				refreshTimer = undefined
				loadContainers((systemId ?? selectedSystemIdRef.current) || undefined)
			}, 750)
		}

		if (!systemId) {
			const unlisten = $allSystemsById.listen(() => {
				if (Date.now() - startedAt > 500) {
					scheduleRefresh()
				}
			})
			return () => {
				if (refreshTimer) clearTimeout(refreshTimer)
				unlisten()
			}
		}

		const unlisten = listenKeys($allSystemsById, [systemId], scheduleRefresh)
		return () => {
			if (refreshTimer) clearTimeout(refreshTimer)
			unlisten()
		}
	}, [loadContainers, systemId])

	useEffect(() => {
		if (systemId && selectedSystemId !== systemId) {
			setSelectedSystemId(systemId)
			return
		}
		if (!systemId && (!selectedSystemId || !systemCards.some((card) => card.id === selectedSystemId))) {
			setSelectedSystemId(systemCards[0]?.id ?? "")
		}
	}, [selectedSystemId, systemCards, systemId])

	const selectedRows = useMemo(
		() => (data ?? []).filter((container) => !selectedSystemId || container.system === selectedSystemId),
		[data, selectedSystemId]
	)
	const selectedRunning = useMemo(
		() => selectedRows.filter((container) => isContainerRunningStatus(container.status)).length,
		[selectedRows]
	)
	const independentContainers = useMemo(
		() => selectedRows.filter((container) => !container.stack_project?.trim()),
		[selectedRows]
	)
	const hideSystemColumn = Boolean(selectedSystemId || systemId)
	const tableSorting = useMemo(() => {
		if (!hideSystemColumn) {
			return sorting
		}
		const next = sorting.filter((sort) => sort.id !== "system")
		return next.length > 0 ? next : [{ id: "name", desc: false }]
	}, [hideSystemColumn, sorting])

	useEffect(() => {
		if (!hideSystemColumn || !sorting.some((sort: SortingState[number]) => sort.id === "system")) {
			return
		}
		setSorting((current: SortingState) => {
			const next = current.filter((sort: SortingState[number]) => sort.id !== "system")
			return next.length > 0 ? next : [{ id: "name", desc: false }]
		})
	}, [hideSystemColumn, setSorting, sorting])

	const table = useReactTable({
		data: independentContainers,
		columns: createContainerColumns(requestOperation).filter(
			(col) => col.id !== "stack" && (hideSystemColumn ? col.id !== "system" : true)
		),
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		onSortingChange: setSorting,
		onColumnVisibilityChange: setColumnVisibility,
		onRowSelectionChange: setRowSelection,
		defaultColumn: {
			sortUndefined: "last",
			size: 100,
			minSize: 0,
		},
		state: {
			sorting: tableSorting,
			columnVisibility,
			rowSelection,
		},
	})

	const rows = table.getRowModel().rows
	const visibleColumns = table.getVisibleLeafColumns()
	const stacks = useMemo(
		() => buildContainerStackGroups(selectedRows, selectedSystemId || systemId, systemsById),
		[selectedRows, selectedSystemId, systemId, systemsById]
	)

	return (
		<Card className="@container w-full min-w-0 overflow-hidden rounded-lg border-border/70 bg-surface-soft px-3 py-4 shadow-none sm:px-5 sm:py-5">
			<CardHeader className="mb-4 p-0">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="min-w-0">
						<h2 className="text-base font-semibold leading-none ">容器监控</h2>
						<div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
							<span>{selectedRows.length} 个容器</span>
							<span>{selectedRunning} 运行</span>
							<span>{Math.max(0, selectedRows.length - selectedRunning)} 停止</span>
						</div>
					</div>
				</div>
			</CardHeader>
			<div className="min-w-0 space-y-4">
				{data && selectedRows.length === 0 ? (
					<EmptyState
						loading={false}
						loadingText="正在加载容器"
						emptyText="暂未发现容器"
						description="当前已接入的机器没有上报 Docker 或 Podman 容器。容器开始运行后会自动按编排和独立容器归类显示。"
						className="min-h-36 bg-card"
					/>
				) : (
					<>
						{!systemId && (
							<div className="mb-3 hidden gap-2.5 rounded-lg border border-border/70 bg-surface-soft p-2 shadow-none lg:grid lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
								{systemCards.map((card) => (
									<button
										key={card.id}
										type="button"
										className={cn(
											"group rounded-md border border-border/70 bg-card px-3 py-2.5 text-left shadow-none transition-[background-color,border-color,transform] duration-150 ease-out hover:border-foreground/15 hover:bg-surface-soft active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
											selectedSystemId === card.id && "border-foreground/25 bg-card ring-1 ring-foreground/10"
										)}
										onClick={() => handleSelectSystem(card.id)}
									>
										<div className="flex items-center justify-between gap-2">
											<div className="min-w-0">
												<div className="flex min-w-0 items-baseline gap-1.5">
													<span className="truncate text-sm font-medium">
														{getSystemDisplayName(systemsById, card.id)}
													</span>
													<span className="shrink-0 text-xs text-muted-foreground">容器 {card.total} 个</span>
												</div>
											</div>
											<Badge variant={card.stopped ? "warning" : "outline"} className="h-5 shrink-0 px-1.5 text-[11px]">
												{card.stopped ? `停止 ${card.stopped}` : "无停止"}
											</Badge>
										</div>
										<div className="mt-2 grid grid-cols-3 gap-1.5 text-xs">
											<ContainerCount label="运行" value={card.running} />
											<ContainerCount label="停止" value={card.stopped} />
											<ContainerCount label="总数" value={card.total} />
										</div>
									</button>
								))}
							</div>
						)}

						{containersHasMore && (
							<div className="rounded-md border border-amber-500/25 bg-card px-3 py-2 text-sm text-amber-800 shadow-none dark:text-amber-300">
								当前机器容器数量超过 {data?.length ?? 0} 个，已先显示前 {data?.length ?? 0}{" "}
								个；为避免误判，后续需要继续分页查看完整清单。
							</div>
						)}

						<div className="lg:hidden">
							<MobileContainersView
								systemCards={systemCards}
								selectedSystemId={selectedSystemId}
								onSelectSystem={handleSelectSystem}
								stacks={stacks}
								independentContainers={independentContainers}
								selectedRows={selectedRows}
								runningCount={selectedRunning}
								systemScoped={Boolean(systemId)}
								onOpenContainer={openContainerSheet}
								getSystemName={(systemId) => getSystemDisplayName(systemsById, systemId)}
								renderStackActions={(stack, onShowConfig) => (
									<StackActionButtons
										stack={stack}
										runningKey={runningKey}
										onRequestOperation={requestStackOperation}
										onShowConfig={onShowConfig}
										compact
									/>
								)}
								renderContainerActions={(container) => (
									<StackContainerActionButtons
										container={container}
										runningKey={runningKey}
										onRequestOperation={requestOperation}
										compact
									/>
								)}
								renderStackConfigDialog={(stack, open, onOpenChange) => (
									<StackConfigDialog stack={stack} open={open} onOpenChange={onOpenChange} />
								)}
								isRunning={isContainerRunningStatus}
								formatCpu={formatContainerMetricNumber}
								formatMemory={formatContainerMemory}
								formatNet={formatContainerNetwork}
							/>
						</div>

						<section className="hidden min-w-0 gap-2 lg:grid">
							<div className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-card px-3 py-2 shadow-none">
								<h3 className="text-sm font-medium">编排</h3>
							</div>
							<ContainerStackOverview
								stacks={stacks}
								containerCount={selectedRows.length}
								onOpenContainer={openContainerSheet}
								onRequestOperation={requestStackOperation}
								onRequestContainerOperation={requestOperation}
								runningKey={runningKey}
							/>
						</section>

						<section className="hidden min-w-0 gap-2 lg:grid">
							<div className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-card px-3 py-2 shadow-none">
								<h3 className="text-sm font-medium">独立容器</h3>
								{rows.length > 0 && (
									<Badge variant="outline" className="h-6 px-2 text-xs">
										{rows.length} 个
									</Badge>
								)}
							</div>
							{data && independentContainers.length === 0 ? (
								<EmptyState
									loading={false}
									loadingText="正在加载容器"
									emptyText="无"
									description="已归入编排的容器会在上方展开查看。"
									className="min-h-20 bg-card"
								/>
							) : (
								<div className="min-w-0 overflow-hidden rounded-md">
									<AllContainersTable
										table={table}
										rows={rows}
										colLength={visibleColumns.length}
										data={data}
										emptyText="暂无独立容器"
										onOpenContainer={openContainerSheet}
									/>
								</div>
							)}
						</section>
					</>
				)}
			</div>

			<ContainerSheet sheetOpen={sheetOpen} setSheetOpen={setSheetOpen} activeContainer={activeContainer} />
			<ContainerOperationConfirmDialog
				pendingOperation={pendingOperation}
				runningKey={runningKey}
				onCancel={() => setPendingOperation(null)}
				onConfirm={confirmOperation}
			/>
			<ContainerStackOperationConfirmDialog
				pendingOperation={pendingStackOperation}
				runningKey={runningKey}
				onCancel={() => setPendingStackOperation(null)}
				onConfirm={confirmStackOperation}
			/>
		</Card>
	)
}

function updateContainerStatusAfterOperation(
	current: ContainerRecord[] | undefined,
	containerId: string,
	action: ContainerOperationAction
) {
	if (!current) return current
	if (action === "update_container_image") return current
	const status = action === "stop_container" ? "已停止，刚刚更新" : "运行中，刚刚更新"
	const updated = Date.now()
	return current.map((container) => (container.id === containerId ? { ...container, status, updated } : container))
}

function updateStackStatusAfterOperation(
	current: ContainerRecord[] | undefined,
	stack: ContainerStackGroup,
	action: ContainerStackOperationAction
) {
	if (!current) return current
	if (action === "update_container_stack_images") return current
	const status = action === "stop_container_stack" ? "已停止，刚刚更新" : "运行中，刚刚更新"
	const updated = Date.now()
	const ids = new Set(stack.containers.map((container) => container.id))
	return current.map((container) => (ids.has(container.id) ? { ...container, status, updated } : container))
}

function ContainerCount({ label, value }: { label: string; value: number }) {
	return (
		<div className="rounded-md bg-surface-soft px-2 py-1">
			<div className="text-[11px] text-muted-foreground">{label}</div>
			<div className="leading-tight font-semibold text-foreground tabular-nums">{value}</div>
		</div>
	)
}

type ContainerStackGroup = {
	key: string
	system: string
	project: string
	containers: ContainerRecord[]
	config: string
	running: number
	stopped: number
	protectedReason: string
}

function buildContainerStackGroups(
	containers: ContainerRecord[],
	systemId: string | undefined,
	systemsById: Record<string, SystemRecord>
): ContainerStackGroup[] {
	const groups = new Map<string, ContainerStackGroup>()
	for (const container of containers) {
		const project = container.stack_project?.trim()
		if (!project) continue
		const key = `${container.system}:${project}`
		const group =
			groups.get(key) ??
			({
				key,
				system: container.system,
				project,
				containers: [],
				config: "",
				running: 0,
				stopped: 0,
				protectedReason: "",
			} satisfies ContainerStackGroup)
		group.containers.push(container)
		if (!group.protectedReason) {
			group.protectedReason = getProtectedContainerReason(container)
		}
		if (!group.config && container.stack_config?.trim()) {
			group.config = container.stack_config.trim()
		}
		if (isContainerRunningStatus(container.status)) {
			group.running += 1
		} else {
			group.stopped += 1
		}
		groups.set(key, group)
	}
	return Array.from(groups.values()).sort((a, b) => {
		if (!systemId) {
			const systemCompare = getSystemDisplayName(systemsById, a.system).localeCompare(
				getSystemDisplayName(systemsById, b.system)
			)
			if (systemCompare !== 0) return systemCompare
		}
		return a.project.localeCompare(b.project)
	})
}

function getSystemDisplayName(systemsById: Record<string, SystemRecord>, systemId: string) {
	const system = systemsById[systemId]
	const displayName = getSystemRecordDisplayName(system, "").trim()
	if (displayName) {
		return displayName
	}
	const name = system?.name?.trim()
	if (name && !isGeneratedSystemName(name, systemId)) {
		return name
	}
	return Object.keys(systemsById).length === 0 ? "加载机器名称..." : "未知机器"
}

function isGeneratedSystemName(value: string, systemId: string) {
	return value === systemId || /^[a-z0-9]{15}$/.test(value)
}

function formatContainerUpdatedTime(updated?: number | string) {
	const timestamp = Number(updated)
	if (!Number.isFinite(timestamp) || timestamp <= 0) return "-"
	return hourWithSeconds(new Date(timestamp).toISOString())
}

function StackActionButtons({
	stack,
	runningKey,
	onRequestOperation,
	onShowConfig,
	compact = false,
}: {
	stack: ContainerStackGroup
	runningKey: string
	onRequestOperation: (stack: ContainerStackGroup, action: ContainerStackOperationAction) => void
	onShowConfig: () => void
	compact?: boolean
}) {
	const running = stack.running > 0
	const isBusy = runningKey.startsWith(`${stack.system}:${stack.project}:`)
	const protectedReason = stack.protectedReason
	const actions: {
		action: ContainerStackOperationAction
		label: string
		compactLabel: string
		icon: React.ElementType
		disabled?: boolean
	}[] = [
		{
			action: "start_container_stack",
			label: "启动",
			compactLabel: "启动",
			icon: PlayIcon,
			disabled: stack.stopped === 0,
		},
		{ action: "restart_container_stack", label: "重启", compactLabel: "重启", icon: RotateCwIcon, disabled: !running },
		{ action: "stop_container_stack", label: "停止", compactLabel: "停止", icon: SquareIcon, disabled: !running },
		{ action: "update_container_stack_images", label: "更新镜像", compactLabel: "更新", icon: RefreshCwIcon },
	]
	return (
		<div
			className={cn(
				"min-w-0",
				compact ? "grid grid-cols-5 gap-1" : "flex flex-wrap items-center justify-end gap-1.5 lg:flex-nowrap"
			)}
		>
			{actions.map(({ action, label, compactLabel, icon: Icon, disabled }) => (
				<Tooltip key={action}>
					<TooltipTrigger asChild>
						<span className={cn("inline-flex min-w-0", compact && "w-full")}>
							<Button
								type="button"
								variant="outline"
								size="sm"
								aria-label={label}
								className={cn(
									"min-h-10 gap-1.5 rounded-md px-2 text-xs",
									compact && "w-full justify-center gap-1 px-1 text-[11px]",
									protectedReason && "opacity-45"
								)}
								disabled={isBusy || disabled || Boolean(protectedReason)}
								onClick={(event) => {
									event.stopPropagation()
									onRequestOperation(stack, action)
								}}
							>
								<Icon
									className={cn("size-3.5", isBusy && action === "update_container_stack_images" && "animate-spin")}
								/>
								{compact ? compactLabel : label}
							</Button>
						</span>
					</TooltipTrigger>
					<TooltipContent>{protectedReason || (disabled ? "当前状态下不需要执行该操作。" : label)}</TooltipContent>
				</Tooltip>
			))}
			<Button
				type="button"
				variant="outline"
				size="sm"
				aria-label="Compose详情"
				className={cn("min-h-10 rounded-md px-2 text-xs", compact && "w-full justify-center px-1 text-[11px]")}
				onClick={(event) => {
					event.stopPropagation()
					onShowConfig()
				}}
			>
				{compact ? "详情" : "Compose详情"}
			</Button>
		</div>
	)
}

function StackContainerActionButtons({
	container,
	runningKey,
	onRequestOperation,
	compact = false,
}: {
	container: ContainerRecord
	runningKey: string
	onRequestOperation: ContainerOperationHandler
	compact?: boolean
}) {
	const system = $allSystemsById.get()[container.system]
	const operations = system?.info?.cap?.operations ?? []
	const unsupported = system?.info?.cap?.unsupported_reasons ?? {}
	const running = isContainerRunningStatus(container.status)
	const protectedReason = getStackProtectedContainerReason(container)
	const capabilityReason = operations.includes("container_control")
		? ""
		: unsupported.container_control || "当前 Agent 没有声明容器控制能力。"
	const actions: { action: ContainerOperationAction; label: string; icon: React.ElementType; disabled: boolean }[] = [
		{ action: "start_container", label: "启动", icon: PlayIcon, disabled: running },
		{ action: "restart_container", label: "重启", icon: RotateCwIcon, disabled: !running },
		{ action: "stop_container", label: "停止", icon: SquareIcon, disabled: !running },
		{ action: "update_container_image", label: "更新镜像", icon: RefreshCwIcon, disabled: false },
	]

	return (
		<div className={cn(compact ? "grid grid-cols-4 gap-1" : "flex items-center justify-end gap-1.5")}>
			{actions.map(({ action, label, icon: Icon, disabled }) => {
				const disabledReason = protectedReason || capabilityReason
				const isDisabled = Boolean(disabledReason) || disabled
				const isBusy = runningKey === `${container.system}:${container.id}:${action}`
				return (
					<Tooltip key={action}>
						<TooltipTrigger asChild>
							<span className={cn("inline-flex", compact && "w-full")}>
								<Button
									type="button"
									size="icon"
									variant="outline"
									className={cn(compact ? "min-h-10 w-full" : "size-10", isDisabled && "opacity-45")}
									disabled={isDisabled || isBusy}
									aria-label={label}
									onClick={(event) => {
										event.stopPropagation()
										onRequestOperation(container, action)
									}}
								>
									<Icon className={cn("size-3.5", isBusy && "animate-spin")} />
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

function getStackProtectedContainerReason(container: ContainerRecord) {
	return getProtectedContainerReason(container)
}

function ContainerStackOverview({
	stacks,
	containerCount,
	onOpenContainer,
	onRequestOperation,
	onRequestContainerOperation,
	runningKey,
}: {
	stacks: ContainerStackGroup[]
	containerCount: number
	onOpenContainer: (container: ContainerRecord) => void
	onRequestOperation: (stack: ContainerStackGroup, action: ContainerStackOperationAction) => void
	onRequestContainerOperation: ContainerOperationHandler
	runningKey: string
}) {
	const [activeStackConfig, setActiveStackConfig] = useState<ContainerStackGroup | null>(null)
	const [expandedStacks, setExpandedStacks] = useState<Record<string, boolean>>({})

	if (stacks.length === 0) {
		if (containerCount === 0) return null
		return (
			<div className="rounded-md border border-border/70 bg-card px-3 py-2 text-sm text-muted-foreground">
				暂未识别到任何编排。
			</div>
		)
	}

	return (
		<>
			<div className="min-w-0 max-w-full space-y-3 overflow-hidden">
				{stacks.map((stack) => {
					const expanded = Boolean(expandedStacks[stack.key])
					const toggleStack = () => {
						setExpandedStacks((current) => ({
							...current,
							[stack.key]: !current[stack.key],
						}))
					}
					return (
						<div
							key={stack.key}
							className={cn(
								"w-full max-w-full overflow-hidden rounded-lg border border-border/70 bg-card text-left shadow-none transition-[background-color,border-color] duration-150 ease-out hover:border-foreground/15",
								expanded && "border-foreground/15"
							)}
						>
							<div className="flex w-full max-w-full min-w-0 items-center gap-3 px-3 py-3">
								<button
									type="button"
									aria-expanded={expanded}
									className="-m-1 flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md p-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									onClick={toggleStack}
								>
									<span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-soft text-muted-foreground">
										<LayersIcon className="size-3.5" />
									</span>
									<div className="min-w-0">
										<div className="flex min-w-0 items-center gap-2">
											<div className="max-w-[28rem] truncate text-sm font-medium">{stack.project}</div>
											<Badge
												variant={stack.stopped ? "warning" : "outline"}
												className="h-5 shrink-0 px-1.5 text-[11px]"
											>
												{stack.running} 运行
											</Badge>
											<Badge
												variant={stack.stopped ? "secondary" : "outline"}
												className="h-5 shrink-0 px-1.5 text-[11px]"
											>
												{stack.stopped} 停止
											</Badge>
										</div>
									</div>
								</button>
								<div className="flex shrink-0 items-center justify-end gap-1.5">
									<StackActionButtons
										stack={stack}
										runningKey={runningKey}
										onRequestOperation={onRequestOperation}
										onShowConfig={() => setActiveStackConfig(stack)}
									/>
									<button
										type="button"
										aria-label={expanded ? "收起容器" : "展开容器"}
										aria-expanded={expanded}
										className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border/70 bg-card text-muted-foreground transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										onClick={toggleStack}
									>
										<ChevronDownIcon className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
									</button>
								</div>
							</div>
							{expanded && (
								<div className="min-w-0 max-w-full border-t bg-surface-soft">
									<div className="max-w-full overflow-x-auto">
										<div className="min-w-[1180px]">
											<div className="grid grid-cols-[minmax(12rem,1.35fr)_minmax(8rem,.75fr)_5.5rem_7rem_7rem_6rem_minmax(9rem,1fr)_minmax(13rem,1.15fr)_7rem_6.5rem_10.5rem] items-center gap-3 border-b bg-surface-soft px-3 py-2 text-xs font-medium text-muted-foreground">
												<div>名称</div>
												<div>服务</div>
												<div>CPU</div>
												<div>内存</div>
												<div>网络</div>
												<div>健康</div>
												<div>端口</div>
												<div>镜像</div>
												<div>状态</div>
												<div className="text-right">更新</div>
												<div className="text-right">操作</div>
											</div>
											{stack.containers.map((container) => (
												<div
													key={container.id}
													className="group grid w-full grid-cols-[minmax(12rem,1.35fr)_minmax(8rem,.75fr)_5.5rem_7rem_7rem_6rem_minmax(9rem,1fr)_minmax(13rem,1.15fr)_7rem_6.5rem_10.5rem] items-center gap-3 border-b bg-card px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-surface-soft"
												>
													<div className="min-w-0">
														<button
															type="button"
															className="block max-w-full truncate rounded-sm font-medium text-left underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
															onClick={() => onOpenContainer(container)}
														>
															{container.name || "-"}
														</button>
													</div>
													<div className="min-w-0 truncate text-sm text-muted-foreground">
														{container.stack_service || "-"}
													</div>
													<div className="text-sm tabular-nums">{formatContainerCpu(container.cpu)}</div>
													<div className="text-sm tabular-nums">{formatContainerMemory(container.memory)}</div>
													<div className="text-sm tabular-nums">{formatContainerNetwork(container.net)}</div>
													<div className="text-sm">{formatContainerHealth(container.health)}</div>
													<div
														className="min-w-0 truncate text-sm text-muted-foreground"
														title={container.ports || undefined}
													>
														{container.ports || "-"}
													</div>
													<div
														className="min-w-0 truncate text-sm text-muted-foreground"
														title={container.image || undefined}
													>
														{container.image || "-"}
													</div>
													<div className="truncate text-sm" title={container.status}>
														{formatContainerStatus(container.status)}
													</div>
													<div className="text-xs text-muted-foreground md:text-right">
														{formatContainerUpdatedTime(container.updated)}
													</div>
													<StackContainerActionButtons
														container={container}
														runningKey={runningKey}
														onRequestOperation={onRequestContainerOperation}
													/>
												</div>
											))}
										</div>
									</div>
								</div>
							)}
						</div>
					)
				})}
			</div>
			<StackConfigDialog
				stack={activeStackConfig}
				open={Boolean(activeStackConfig)}
				onOpenChange={(open) => {
					if (!open) setActiveStackConfig(null)
				}}
			/>
		</>
	)
}

function StackConfigDialog({
	stack,
	open,
	onOpenChange,
}: {
	stack: ContainerStackGroup | null
	open: boolean
	onOpenChange: (open: boolean) => void
}) {
	const config = stack?.config?.trim()
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[85dvh] w-[calc(100vw-2rem)] max-w-5xl overflow-hidden p-0">
				<DialogHeader className="border-b px-5 py-4">
					<DialogTitle>{stack?.project ?? "堆栈"} 配置</DialogTitle>
					<DialogDescription>
						{config ? "Docker Compose / YAML 配置" : "当前堆栈没有采集到配置内容。"}
					</DialogDescription>
				</DialogHeader>
				<div className="max-h-[calc(85dvh-5.5rem)] overflow-auto bg-gh-dark p-4 text-sm text-white">
					<pre className="whitespace-pre-wrap break-words font-mono leading-relaxed">{config || "暂无配置"}</pre>
				</div>
			</DialogContent>
		</Dialog>
	)
}

function ContainerOperationConfirmDialog({
	pendingOperation,
	runningKey,
	onCancel,
	onConfirm,
}: {
	pendingOperation: PendingContainerOperation | null
	runningKey: string
	onCancel: () => void
	onConfirm: () => void | Promise<void>
}) {
	const container = pendingOperation?.container
	const actionLabel = pendingOperation ? containerOperationLabels[pendingOperation.action] : ""
	const isRunning = runningKey !== ""

	return (
		<OperationConfirmDialog
			open={Boolean(pendingOperation)}
			onOpenChange={(open) => !open && onCancel()}
			title={`确认${actionLabel}容器`}
			description="该操作会立即发送到在线 Agent，只控制同一台机器上的 Docker / Podman 容器。"
			confirmLabel={`确认${actionLabel}`}
			running={isRunning}
			progressTitle={`正在${actionLabel}容器`}
			progressDescription="请求已发送到 Agent，正在等待 Docker 返回执行结果。"
			onConfirm={onConfirm}
		>
			{container && (
				<div className="grid gap-1.5 text-sm text-foreground">
					<div className="font-medium">{container.name}</div>
					<div className="mt-1 break-all text-muted-foreground">{container.image}</div>
					<div className="mt-2 text-muted-foreground">{formatContainerStatus(container.status)}</div>
				</div>
			)}
		</OperationConfirmDialog>
	)
}

const containerOperationLabels: Record<ContainerOperationAction, string> = {
	start_container: "启动",
	stop_container: "停止",
	restart_container: "重启",
	update_container_image: "更新镜像",
}

function ContainerStackOperationConfirmDialog({
	pendingOperation,
	runningKey,
	onCancel,
	onConfirm,
}: {
	pendingOperation: PendingStackOperation | null
	runningKey: string
	onCancel: () => void
	onConfirm: () => void | Promise<void>
}) {
	const stack = pendingOperation?.stack
	const actionLabel = pendingOperation ? stackOperationLabels[pendingOperation.action] : ""
	const isRunning = runningKey !== ""
	const description =
		pendingOperation?.action === "update_container_stack_images"
			? "该操作会拉取堆栈内所有容器当前使用的镜像，不会自动重建容器。拉取完成后可按需重启堆栈应用新镜像。"
			: "该操作会立即发送到在线 Agent，并作用于该堆栈下所有可控制容器。"

	return (
		<OperationConfirmDialog
			open={Boolean(pendingOperation)}
			onOpenChange={(open) => !open && onCancel()}
			title={`确认${actionLabel}堆栈`}
			description={description}
			confirmLabel={`确认${actionLabel}`}
			running={isRunning}
			progressTitle={`正在${actionLabel}堆栈`}
			progressDescription={
				pendingOperation?.action === "update_container_stack_images"
					? "正在逐个拉取镜像，镜像仓库或网络较慢时会多等一会。"
					: "请求已发送到 Agent，正在逐个处理该编排里的容器。"
			}
			onConfirm={onConfirm}
		>
			{stack && (
				<div className="grid gap-1.5 text-sm text-foreground">
					<div className="font-medium">{stack.project}</div>
					<div className="mt-1 text-muted-foreground">
						{stack.running} 运行 / {stack.stopped} 停止 / {stack.containers.length} 容器
					</div>
				</div>
			)}
		</OperationConfirmDialog>
	)
}

const stackOperationLabels: Record<ContainerStackOperationAction, string> = {
	start_container_stack: "启动",
	stop_container_stack: "停止",
	restart_container_stack: "重启",
	update_container_stack_images: "更新镜像",
}

const AllContainersTable = memo(function AllContainersTable({
	table,
	rows,
	colLength,
	data,
	emptyText,
	onOpenContainer,
}: {
	table: TableType<ContainerRecord>
	rows: Row<ContainerRecord>[]
	colLength: number
	data: ContainerRecord[] | undefined
	emptyText?: string
	onOpenContainer: (container: ContainerRecord) => void
}) {
	// The virtualizer will need a reference to the scrollable container element
	const scrollRef = useRef<HTMLDivElement>(null)

	const virtualizer = useVirtualizer<HTMLDivElement, HTMLTableRowElement>({
		count: rows.length,
		estimateSize: () => 54,
		getScrollElement: () => scrollRef.current,
		overscan: 5,
	})
	const virtualRows = virtualizer.getVirtualItems()

	const paddingTop = Math.max(0, virtualRows[0]?.start ?? 0 - virtualizer.options.scrollMargin)
	const paddingBottom = Math.max(0, virtualizer.getTotalSize() - (virtualRows[virtualRows.length - 1]?.end ?? 0))

	return (
		<div
			className={cn(
				"h-min max-h-[calc(100dvh-17rem)] max-w-full min-w-0 relative overflow-auto rounded-md border border-border/70 bg-card shadow-none",
				(!rows.length || rows.length > 2) && "min-h-50"
			)}
			ref={scrollRef}
		>
			<div
				className="min-w-full"
				style={{ height: `${String(virtualizer.getTotalSize() + 48)}px`, paddingTop, paddingBottom }}
			>
				<table className="text-sm w-full h-full text-nowrap">
					<ContainersTableHead table={table} />
					<TableBody>
						{rows.length ? (
							virtualRows.map((virtualRow) => {
								const row = rows[virtualRow.index]
								return <ContainerTableRow key={row.id} row={row} virtualRow={virtualRow} openSheet={onOpenContainer} />
							})
						) : (
							<TableEmptyRow
								colSpan={colLength}
								loading={!data}
								loadingText="正在加载容器"
								emptyText={emptyText || "暂无容器"}
								description={
									data
										? "已归入编排的容器会在上方展开查看，这里只显示没有 Compose 归属的独立容器。"
										: "正在读取 Agent 上报的容器运行状态。"
								}
							/>
						)}
					</TableBody>
				</table>
			</div>
		</div>
	)
})

async function getLogsHtml(container: ContainerRecord): Promise<string> {
	try {
		const [{ highlighter }, logsHtml] = await Promise.all([
			import("@/lib/shiki"),
			pb.send<{ logs: string }>("/api/pulse/containers/logs", {
				system: container.system,
				container: container.id,
			}),
		])
		return logsHtml.logs
			? highlighter.codeToHtml(logsHtml.logs, { lang: "log", theme: syntaxTheme })
			: getEmptyCodeHtml("暂无日志")
	} catch (error) {
		console.error(error)
		return ""
	}
}

async function getInfoHtml(container: ContainerRecord): Promise<string> {
	try {
		let [{ highlighter }, { info }] = await Promise.all([
			import("@/lib/shiki"),
			pb.send<{ info: string }>("/api/pulse/containers/info", {
				system: container.system,
				container: container.id,
			}),
		])
		try {
			info = JSON.stringify(JSON.parse(info), null, 2)
		} catch (_) {}
		return info
			? highlighter.codeToHtml(info, { lang: "json", theme: syntaxTheme })
			: getEmptyCodeHtml("暂无 Inspect 数据")
	} catch (error) {
		console.error(error)
		return ""
	}
}

function getEmptyCodeHtml(message: string) {
	return `<div class="rounded-md border border-border/70 bg-card px-3 py-2 text-sm text-muted-foreground">${message}</div>`
}

function ContainerSheet({
	sheetOpen,
	setSheetOpen,
	activeContainer,
}: {
	sheetOpen: boolean
	setSheetOpen: (open: boolean) => void
	activeContainer: RefObject<ContainerRecord | null>
}) {
	const [logsDisplay, setLogsDisplay] = useState<string>("")
	const [infoDisplay, setInfoDisplay] = useState<string>("")
	const [logsFullscreenOpen, setLogsFullscreenOpen] = useState<boolean>(false)
	const [infoFullscreenOpen, setInfoFullscreenOpen] = useState<boolean>(false)
	const [isRefreshingLogs, setIsRefreshingLogs] = useState<boolean>(false)
	const logsContainerRef = useRef<HTMLDivElement>(null)
	const logsLoadGuardRef = useRef(createLatestRequestGuard())
	const infoLoadGuardRef = useRef(createLatestRequestGuard())

	const container = activeContainer.current

	function scrollLogsToBottom() {
		if (logsContainerRef.current) {
			logsContainerRef.current.scrollTo({ top: logsContainerRef.current.scrollHeight })
		}
	}

	const refreshLogs = async () => {
		if (!container) return
		const loadToken = logsLoadGuardRef.current.begin()
		setIsRefreshingLogs(true)
		const startTime = Date.now()

		try {
			const logsHtml = await getLogsHtml(container)
			if (!logsLoadGuardRef.current.isCurrent(loadToken)) return
			setLogsDisplay(logsHtml)
			setTimeout(scrollLogsToBottom, 20)
		} catch (error) {
			console.error(error)
		} finally {
			// Ensure minimum spin duration of 800ms
			const elapsed = Date.now() - startTime
			const remaining = Math.max(0, 500 - elapsed)
			setTimeout(() => {
				if (logsLoadGuardRef.current.isCurrent(loadToken)) setIsRefreshingLogs(false)
			}, remaining)
		}
	}

	useEffect(() => {
		setLogsDisplay("")
		setInfoDisplay("")
		setIsRefreshingLogs(false)
		if (!container) return
		const logsToken = logsLoadGuardRef.current.begin()
		const infoToken = infoLoadGuardRef.current.begin()
		getLogsHtml(container).then((logsHtml) => {
			if (!logsLoadGuardRef.current.isCurrent(logsToken)) return
			setLogsDisplay(logsHtml)
			setTimeout(scrollLogsToBottom, 20)
		})
		getInfoHtml(container).then((infoHtml) => {
			if (!infoLoadGuardRef.current.isCurrent(infoToken)) return
			setInfoDisplay(infoHtml)
		})
		return () => {
			logsLoadGuardRef.current.begin()
			infoLoadGuardRef.current.begin()
		}
	}, [container])

	if (!container) return null

	return (
		<>
			<LogsFullscreenDialog
				open={logsFullscreenOpen}
				onOpenChange={setLogsFullscreenOpen}
				logsDisplay={logsDisplay}
				containerName={container.name}
				onRefresh={refreshLogs}
				isRefreshing={isRefreshingLogs}
			/>
			<InfoFullscreenDialog
				open={infoFullscreenOpen}
				onOpenChange={setInfoFullscreenOpen}
				infoDisplay={infoDisplay}
				containerName={container.name}
			/>
			<Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
				<SheetContent className="w-full sm:max-w-220 p-2">
					<SheetHeader>
						<SheetTitle>{container.name}</SheetTitle>
						<SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
							<Link className="hover:underline" href={prependBasePath(`/system/${container.system}`)}>
								{getSystemDisplayName($allSystemsById.get(), container.system)}
							</Link>
							<Separator orientation="vertical" className="h-2.5 bg-border" />
							{formatContainerStatus(container.status)}
							<Separator orientation="vertical" className="h-2.5 bg-border" />
							{container.image}
							<Separator orientation="vertical" className="h-2.5 bg-border" />
							{container.id}
							{/* {container.ports && (
								<>
									<Separator orientation="vertical" className="h-2.5 bg-border" />
									{container.ports}
								</>
							)} */}
							{/* <Separator orientation="vertical" className="h-2.5 bg-border" />
							{ContainerHealthLabels[container.health as ContainerHealth]} */}
						</SheetDescription>
					</SheetHeader>
					<div className="px-3 pb-3 -mt-4 flex flex-col gap-3 h-full items-start">
						<div className="flex items-center w-full">
							<h3>{t`Logs`}</h3>
							<Button
								variant="ghost"
								size="sm"
								onClick={refreshLogs}
								className="ms-auto size-10 p-0"
								disabled={isRefreshingLogs}
							>
								<RefreshCwIcon
									className={`size-4 transition-transform duration-300 ${isRefreshingLogs ? "animate-spin" : ""}`}
								/>
							</Button>
							<Button variant="ghost" size="sm" onClick={() => setLogsFullscreenOpen(true)} className="size-10 p-0">
								<MaximizeIcon className="size-4" />
							</Button>
						</div>
						<div
							ref={logsContainerRef}
							className={cn(
								"max-h-[calc(50dvh-10rem)] w-full overflow-auto p-3 rounded-md bg-gh-dark text-white text-sm",
								!logsDisplay && ["animate-pulse", "h-full"]
							)}
						>
							<div dangerouslySetInnerHTML={{ __html: logsDisplay }} />
						</div>
						<div className="flex items-center w-full">
							<h3>{t`Detail`}</h3>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setInfoFullscreenOpen(true)}
								className="ms-auto size-10 p-0"
							>
								<MaximizeIcon className="size-4" />
							</Button>
						</div>
						<div
							className={cn(
								"grow h-[calc(50dvh-4rem)] w-full overflow-auto p-3 rounded-md bg-gh-dark text-white text-sm",
								!infoDisplay && "animate-pulse"
							)}
						>
							<div dangerouslySetInnerHTML={{ __html: infoDisplay }} />
						</div>
					</div>
				</SheetContent>
			</Sheet>
		</>
	)
}

function ContainersTableHead({ table }: { table: TableType<ContainerRecord> }) {
	return (
		<TableHeader className="sticky top-0 z-50 w-full border-b bg-surface-soft">
			{table.getHeaderGroups().map((headerGroup) => (
				<tr key={headerGroup.id}>
					{headerGroup.headers.map((header) => {
						return (
							<TableHead className="px-2" key={header.id} style={{ width: header.getSize() }}>
								{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
							</TableHead>
						)
					})}
				</tr>
			))}
		</TableHeader>
	)
}

const ContainerTableRow = memo(function ContainerTableRow({
	row,
	virtualRow,
	openSheet,
}: {
	row: Row<ContainerRecord>
	virtualRow: VirtualItem
	openSheet: (container: ContainerRecord) => void
}) {
	return (
		<TableRow
			data-state={row.getIsSelected() && "selected"}
			className="cursor-pointer border-border/70 transition-colors hover:bg-surface-soft"
			onClick={() => openSheet(row.original)}
		>
			{row.getVisibleCells().map((cell) => (
				<TableCell
					key={cell.id}
					className="py-0 ps-4.5"
					style={{
						height: virtualRow.size,
						width: cell.column.getSize(),
					}}
				>
					{flexRender(cell.column.columnDef.cell, cell.getContext())}
				</TableCell>
			))}
		</TableRow>
	)
})

function LogsFullscreenDialog({
	open,
	onOpenChange,
	logsDisplay,
	containerName,
	onRefresh,
	isRefreshing,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	logsDisplay: string
	containerName: string
	onRefresh: () => void | Promise<void>
	isRefreshing: boolean
}) {
	const outerContainerRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (open && logsDisplay) {
			// Scroll the outer container to bottom
			const scrollToBottom = () => {
				if (outerContainerRef.current) {
					outerContainerRef.current.scrollTop = outerContainerRef.current.scrollHeight
				}
			}
			setTimeout(scrollToBottom, 50)
		}
	}, [open, logsDisplay])

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="w-[calc(100vw-20px)] h-[calc(100dvh-20px)] max-w-none p-0 bg-gh-dark border-0 text-white">
				<DialogTitle className="sr-only">{containerName} logs</DialogTitle>
				<div ref={outerContainerRef} className="h-full overflow-auto">
					<div className="h-full w-full px-3 leading-relaxed rounded-md bg-gh-dark text-sm">
						<div className="py-3" dangerouslySetInnerHTML={{ __html: logsDisplay }} />
					</div>
				</div>
				<button
					onClick={onRefresh}
					className="absolute top-3 right-11 opacity-60 hover:opacity-100 p-1"
					disabled={isRefreshing}
					title={t`Refresh`}
					aria-label={t`Refresh`}
				>
					<RefreshCwIcon className={`size-4 transition-transform duration-300 ${isRefreshing ? "animate-spin" : ""}`} />
				</button>
			</DialogContent>
		</Dialog>
	)
}

function InfoFullscreenDialog({
	open,
	onOpenChange,
	infoDisplay,
	containerName,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	infoDisplay: string
	containerName: string
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="w-[calc(100vw-20px)] h-[calc(100dvh-20px)] max-w-none p-0 bg-gh-dark border-0 text-white">
				<DialogTitle className="sr-only">{containerName} info</DialogTitle>
				<div className="flex-1 overflow-auto">
					<div className="h-full w-full overflow-auto p-3 rounded-md bg-gh-dark text-sm leading-relaxed">
						<div dangerouslySetInnerHTML={{ __html: infoDisplay }} />
					</div>
				</div>
			</DialogContent>
		</Dialog>
	)
}
