import { t } from "@lingui/core/macro"
import {
	type ColumnDef,
	type ColumnFiltersState,
	type Column,
	type Row,
	type SortingState,
	type Table as TableType,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getSortedRowModel,
	useReactTable,
} from "@tanstack/react-table"
import { useVirtualizer, type VirtualItem } from "@tanstack/react-virtual"
import {
	Activity,
	Box,
	Clock,
	HardDrive,
	BinaryIcon,
	RotateCwIcon,
	ArrowLeftRightIcon,
	MoreHorizontalIcon,
	RefreshCwIcon,
	SearchIcon,
	ServerIcon,
	Trash2Icon,
	XIcon,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { isReadOnlyUser, pb } from "@/lib/api"
import type { Os } from "@/lib/enums"
import type { SmartDeviceRecord } from "@/types"
import { cn, secondsToString, hourWithSeconds, formatShortDate } from "@/lib/utils"
import { Trans } from "@lingui/react/macro"
import { useStore } from "@nanostores/react"
import { $allSystemsById } from "@/lib/stores"
import { ThermometerIcon } from "@/components/ui/icons"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { memo, useCallback, useMemo, useEffect, useRef, useState } from "react"
import { DiskSheet } from "./smart-device-sheet"
import {
	formatCapacity,
	formatSmartDeviceSecondary,
	formatSmartStatus,
	formatSmartTemperature,
	getReadableSmartDeviceName,
	measureSmartDeviceWidths,
	SMART_DEVICE_FIELDS,
} from "./smart-format"

export const createColumns = (
	longestName: number,
	longestModel: number,
	longestDevice: number,
	os?: Os
): ColumnDef<SmartDeviceRecord>[] => [
	{
		id: "system",
		accessorFn: (record) => record.system,
		sortingFn: (a, b) => {
			const allSystems = $allSystemsById.get()
			const systemNameA = allSystems[a.original.system]?.name ?? ""
			const systemNameB = allSystems[b.original.system]?.name ?? ""
			return systemNameA.localeCompare(systemNameB)
		},
		header: ({ column }) => <HeaderButton column={column} name={t`System`} Icon={ServerIcon} />,
		cell: ({ getValue }) => {
			const allSystems = useStore($allSystemsById)
			return (
				<div className="ms-1.5 max-w-40 block truncate" style={{ width: `${longestName / 1.05}ch` }}>
					{allSystems[getValue() as string]?.name ?? ""}
				</div>
			)
		},
	},
	{
		accessorFn: (record) => getReadableSmartDeviceName(record, os),
		id: "name",
		sortingFn: (a, b) =>
			getReadableSmartDeviceName(a.original, os).localeCompare(getReadableSmartDeviceName(b.original, os)),
		header: ({ column }) => <HeaderButton column={column} name={t`Device`} Icon={HardDrive} />,
		cell: ({ row }) => {
			const primary = getReadableSmartDeviceName(row.original, os)
			const secondary = formatSmartDeviceSecondary(row.original)
			return (
				<div
					className="ms-1 max-w-48"
					title={[primary, secondary].filter(Boolean).join(" · ")}
					style={{ width: `${longestDevice / 1.05}ch` }}
				>
					<div className="truncate font-medium">{primary}</div>
					{secondary && <div className="truncate text-xs text-muted-foreground">{secondary}</div>}
				</div>
			)
		},
	},
	{
		accessorKey: "model",
		sortingFn: (a, b) => a.original.model.localeCompare(b.original.model),
		header: ({ column }) => (
			<HeaderButton column={column} name={t({ message: "Model", comment: "Device model" })} Icon={Box} />
		),
		cell: ({ getValue }) => (
			<div
				className="max-w-48 truncate ms-1"
				title={getValue() as string}
				style={{ width: `${longestModel / 1.05}ch` }}
			>
				{getValue() as string}
			</div>
		),
	},
	{
		accessorKey: "capacity",
		invertSorting: true,
		header: ({ column }) => <HeaderButton column={column} name={t`Capacity`} Icon={BinaryIcon} />,
		cell: ({ getValue }) => <span className="ms-1">{formatCapacity(getValue() as number)}</span>,
	},
	{
		accessorKey: "state",
		header: ({ column }) => <HeaderButton column={column} name={t`Status`} Icon={Activity} />,
		cell: ({ getValue }) => {
			const status = getValue() as string
			return (
				<Badge className="ms-1" variant={status === "PASSED" ? "success" : status === "FAILED" ? "danger" : "warning"}>
					{formatSmartStatus(status)}
				</Badge>
			)
		},
	},
	{
		accessorKey: "type",
		sortingFn: (a, b) => a.original.type.localeCompare(b.original.type),
		header: ({ column }) => <HeaderButton column={column} name={t`Type`} Icon={ArrowLeftRightIcon} />,
		cell: ({ getValue }) => (
			<Badge variant="outline" className="ms-1 uppercase">
				{getValue() as string}
			</Badge>
		),
	},
	{
		accessorKey: "hours",
		invertSorting: true,
		header: ({ column }) => (
			<HeaderButton column={column} name={t({ message: "Power On", comment: "Power On Time" })} Icon={Clock} />
		),
		cell: ({ getValue }) => {
			const hours = getValue() as number | undefined
			if (hours == null) {
				return <div className="text-sm text-muted-foreground ms-1">无数据</div>
			}
			const seconds = hours * 3600
			return (
				<div className="text-sm ms-1">
					<div>{secondsToString(seconds, "hour")}</div>
					<div className="text-muted-foreground text-xs">{secondsToString(seconds, "day")}</div>
				</div>
			)
		},
	},
	{
		accessorKey: "cycles",
		invertSorting: true,
		header: ({ column }) => (
			<HeaderButton column={column} name={t({ message: "Cycles", comment: "Power Cycles" })} Icon={RotateCwIcon} />
		),
		cell: ({ getValue }) => {
			const cycles = getValue() as number | undefined
			if (cycles == null) {
				return <div className="text-muted-foreground ms-1">无数据</div>
			}
			return <span className="ms-1">{cycles.toLocaleString()}</span>
		},
	},
	{
		accessorKey: "temp",
		invertSorting: true,
		header: ({ column }) => <HeaderButton column={column} name={t`Temp`} Icon={ThermometerIcon} />,
		cell: ({ getValue }) => {
			const temp = getValue() as number | null | undefined
			if (!temp) {
				return <div className="text-muted-foreground ms-1">无数据</div>
			}
			return <span className="ms-1">{formatSmartTemperature(temp)}</span>
		},
	},
	// {
	// 	accessorKey: "serial",
	// 	sortingFn: (a, b) => a.original.serial.localeCompare(b.original.serial),
	// 	header: ({ column }) => <HeaderButton column={column} name={t`Serial Number`} Icon={HashIcon} />,
	// 	cell: ({ getValue }) => <span className="ms-1.5">{getValue() as string}</span>,
	// },
	// {
	// 	accessorKey: "firmware",
	// 	sortingFn: (a, b) => a.original.firmware.localeCompare(b.original.firmware),
	// 	header: ({ column }) => <HeaderButton column={column} name={t`Firmware`} Icon={CpuIcon} />,
	// 	cell: ({ getValue }) => <span className="ms-1.5">{getValue() as string}</span>,
	// },
	{
		id: "updated",
		invertSorting: true,
		accessorFn: (record) => record.updated,
		header: ({ column }) => <HeaderButton column={column} name={t`Updated`} Icon={Clock} />,
		cell: ({ getValue }) => {
			const timestamp = getValue() as string
			// if today, use hourWithSeconds, otherwise use formatShortDate
			const formatter =
				new Date(timestamp).toDateString() === new Date().toDateString() ? hourWithSeconds : formatShortDate
			return <span className="ms-1 tabular-nums">{formatter(timestamp)}</span>
		},
	},
]

function HeaderButton({
	column,
	name,
	Icon,
}: {
	column: Column<SmartDeviceRecord>
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
		</Button>
	)
}

export default function DisksTable({ systemId, os }: { systemId?: string; os?: Os }) {
	const [sorting, setSorting] = useState<SortingState>([{ id: systemId ? "name" : "system", desc: false }])
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
	const [rowSelection, setRowSelection] = useState({})
	const [smartDevices, setSmartDevices] = useState<SmartDeviceRecord[] | undefined>(undefined)
	const [activeDiskId, setActiveDiskId] = useState<string | null>(null)
	const [sheetOpen, setSheetOpen] = useState(false)
	const [rowActionState, setRowActionState] = useState<{ type: "refresh" | "delete"; id: string } | null>(null)
	const [globalFilter, setGlobalFilter] = useState("")
	const allSystems = useStore($allSystemsById)

	// duplicate the devices to test with more rows
	// if (
	// 	smartDevices?.length &&
	// 	smartDevices.length < 50 &&
	// 	typeof window !== "undefined" &&
	// 	window.location.hostname === "localhost"
	// ) {
	// 	setSmartDevices([...smartDevices, ...smartDevices, ...smartDevices])
	// }

	// Calculate the right width for the columns based on the longest strings among the displayed devices
	const { longestName, longestModel, longestDevice } = useMemo(() => {
		return measureSmartDeviceWidths({
			devices: smartDevices,
			systemId,
			systemNames: Object.fromEntries(Object.entries(allSystems).map(([id, system]) => [id, system?.name])),
			os,
		})
	}, [smartDevices, systemId, allSystems, os])

	const openSheet = (disk: SmartDeviceRecord) => {
		setActiveDiskId(disk.id)
		setSheetOpen(true)
	}

	// Fetch smart devices
	useEffect(() => {
		const controller = new AbortController()

		pb.collection<SmartDeviceRecord>("smart_devices")
			.getFullList({
				filter: systemId ? pb.filter("system = {:system}", { system: systemId }) : undefined,
				fields: SMART_DEVICE_FIELDS,
				signal: controller.signal,
			})
			.then(setSmartDevices)
			.catch((err) => {
				if (!err.isAbort) {
					setSmartDevices([])
				}
			})

		return () => controller.abort()
	}, [systemId])

	// Subscribe to updates
	useEffect(() => {
		let unsubscribe: (() => void) | undefined
		const pbOptions = systemId
			? { fields: SMART_DEVICE_FIELDS, filter: pb.filter("system = {:system}", { system: systemId }) }
			: { fields: SMART_DEVICE_FIELDS }

		;(async () => {
			try {
				unsubscribe = await pb.collection("smart_devices").subscribe(
					"*",
					(event) => {
						const record = event.record as SmartDeviceRecord
						setSmartDevices((currentDevices) => {
							const devices = currentDevices ?? []
							const matchesSystemScope = !systemId || record.system === systemId

							if (event.action === "delete") {
								return devices.filter((device) => device.id !== record.id)
							}

							if (!matchesSystemScope) {
								// Record moved out of scope; ensure it disappears locally.
								return devices.filter((device) => device.id !== record.id)
							}

							const existingIndex = devices.findIndex((device) => device.id === record.id)
							if (existingIndex === -1) {
								return [record, ...devices]
							}

							const next = [...devices]
							next[existingIndex] = record
							return next
						})
					},
					pbOptions
				)
			} catch (error) {
				console.error("Failed to subscribe to SMART device updates:", error)
			}
		})()

		return () => {
			unsubscribe?.()
		}
	}, [systemId])

	const handleRowRefresh = useCallback(async (disk: SmartDeviceRecord) => {
		if (!disk.system) return
		setRowActionState({ type: "refresh", id: disk.id })
		try {
			await pb.send("/api/pulse/smart/refresh", {
				method: "POST",
				query: { system: disk.system },
			})
		} catch (error) {
			console.error("Failed to refresh SMART device:", error)
		} finally {
			setRowActionState((state) => (state?.id === disk.id ? null : state))
		}
	}, [])

	const handleDeleteDevice = useCallback(async (disk: SmartDeviceRecord) => {
		setRowActionState({ type: "delete", id: disk.id })
		try {
			await pb.collection("smart_devices").delete(disk.id)
			// setSmartDevices((current) => current?.filter((device) => device.id !== disk.id))
		} catch (error) {
			console.error("Failed to delete SMART device:", error)
		} finally {
			setRowActionState((state) => (state?.id === disk.id ? null : state))
		}
	}, [])

	const actionColumn = useMemo<ColumnDef<SmartDeviceRecord>>(
		() => ({
			id: "actions",
			enableSorting: false,
			header: () => (
				<span className="sr-only">
					<Trans>Actions</Trans>
				</span>
			),
			cell: ({ row }) => {
				const disk = row.original
				const isRowRefreshing = rowActionState?.id === disk.id && rowActionState.type === "refresh"
				const isRowDeleting = rowActionState?.id === disk.id && rowActionState.type === "delete"

				return (
					<div className="flex justify-end">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="size-10"
									onClick={(event) => event.stopPropagation()}
									onMouseDown={(event) => event.stopPropagation()}
								>
									<span className="sr-only">
										<Trans>Open menu</Trans>
									</span>
									<MoreHorizontalIcon className="w-5" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
								<DropdownMenuItem
									onClick={(event) => {
										event.stopPropagation()
										handleRowRefresh(disk)
									}}
									disabled={isRowRefreshing || isRowDeleting}
								>
									<RefreshCwIcon className={cn("me-2.5 size-4", isRowRefreshing && "animate-spin")} />
									<Trans>Refresh</Trans>
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									onClick={(event) => {
										event.stopPropagation()
										handleDeleteDevice(disk)
									}}
									disabled={isRowDeleting}
								>
									<Trash2Icon className="me-2.5 size-4" />
									<Trans>Delete</Trans>
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				)
			},
		}),
		[handleRowRefresh, handleDeleteDevice, rowActionState]
	)

	// Filter columns based on whether systemId is provided
	const tableColumns = useMemo(() => {
		const columns = createColumns(longestName, longestModel, longestDevice, os)
		const baseColumns = systemId ? columns.filter((col) => col.id !== "system") : columns
		return isReadOnlyUser() ? baseColumns : [...baseColumns, actionColumn]
	}, [systemId, actionColumn, longestName, longestModel, longestDevice, os])

	const tableSorting = useMemo(() => {
		if (!systemId) {
			return sorting
		}
		const next = sorting.filter((sort) => sort.id !== "system")
		return next.length > 0 ? next : [{ id: "name", desc: false }]
	}, [sorting, systemId])

	useEffect(() => {
		if (!systemId || !sorting.some((sort) => sort.id === "system")) {
			return
		}
		setSorting((current) => {
			const next = current.filter((sort) => sort.id !== "system")
			return next.length > 0 ? next : [{ id: "name", desc: false }]
		})
	}, [sorting, systemId])

	const table = useReactTable({
		data: smartDevices || ([] as SmartDeviceRecord[]),
		columns: tableColumns,
		onSortingChange: setSorting,
		onColumnFiltersChange: setColumnFilters,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		onRowSelectionChange: setRowSelection,
		state: {
			sorting: tableSorting,
			columnFilters,
			rowSelection,
			globalFilter,
		},
		onGlobalFilterChange: setGlobalFilter,
		globalFilterFn: (row, _columnId, filterValue) => {
			const disk = row.original
			const systemName = $allSystemsById.get()[disk.system]?.name ?? ""
			const device = disk.name ?? ""
			const model = disk.model ?? ""
			const status = disk.state ?? ""
			const type = disk.type ?? ""
			const searchString = `${systemName} ${device} ${model} ${status} ${type}`.toLowerCase()
			return (filterValue as string)
				.toLowerCase()
				.split(" ")
				.every((term) => searchString.includes(term))
		},
	})
	const rows = table.getRowModel().rows

	// Hide the table on system pages if there's no data, but always show on global page
	if (systemId && !smartDevices?.length && !columnFilters.length) {
		return null
	}

	const canManageDevices = !isReadOnlyUser()
	const summary = buildSmartSummary(smartDevices)

	return (
		<div className="grid gap-3">
			{!systemId && (
				<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
					<SmartSummaryCard label="采集设备" value={`${summary.total} 块`} detail={`来自 ${summary.systems} 台机器`} />
					<SmartSummaryCard
						label="健康状态"
						value={`正常 ${summary.passed} / 异常 ${summary.failed}`}
						detail="按真实自检结果统计"
					/>
					<SmartSummaryCard label="介质类型" value={summary.mediaSummary} detail="只展示 Agent 上报类型" />
					<SmartSummaryCard label="最近更新" value={summary.latest} detail="按设备更新时间统计" />
				</div>
			)}

			<section className="grid gap-3 rounded-lg border border-border/70 bg-surface-soft p-3">
				<div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
					<div className="min-w-0">
						<h2 className="text-lg font-semibold ">{systemId ? "S.M.A.R.T." : "设备列表"}</h2>
						<p className="mt-1 text-sm text-muted-foreground">
							点击设备查看完整属性；缺失字段显示为无数据，不用默认值替代。
						</p>
					</div>
					{!systemId && (
						<div className="relative w-full max-w-full md:w-72">
							<SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								placeholder={t`Filter...`}
								value={globalFilter}
								onChange={(event) => setGlobalFilter(event.target.value)}
								className="w-full bg-card pl-9 pr-10 shadow-none"
							/>
							{globalFilter && (
								<Button
									type="button"
									variant="ghost"
									size="icon"
									aria-label={t`Clear`}
									className="absolute right-1 top-1/2 size-10 -translate-y-1/2 text-muted-foreground"
									onClick={() => setGlobalFilter("")}
								>
									<XIcon className="h-4 w-4" />
								</Button>
							)}
						</div>
					)}
				</div>
				<SmartDeviceCards
					rows={rows}
					data={smartDevices}
					showSystem={!systemId}
					canManage={canManageDevices}
					rowActionState={rowActionState}
					onOpen={openSheet}
					onRefresh={handleRowRefresh}
					onDelete={handleDeleteDevice}
				/>
				<SmartDevicesTable
					table={table}
					rows={rows}
					colLength={tableColumns.length}
					data={smartDevices}
					openSheet={openSheet}
				/>
			</section>
			<DiskSheet diskId={activeDiskId} open={sheetOpen} onOpenChange={setSheetOpen} />
		</div>
	)
}

function SmartSummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
	return (
		<div className="rounded-lg border border-border/70 bg-card p-3 shadow-none">
			<div className="text-xs text-muted-foreground">{label}</div>
			<div className="mt-1 truncate text-lg font-semibold tabular-nums">{value}</div>
			<div className="mt-1 truncate text-xs text-muted-foreground">{detail}</div>
		</div>
	)
}

function buildSmartSummary(devices: SmartDeviceRecord[] | undefined) {
	const rows = devices ?? []
	const systems = new Set(rows.map((device) => device.system).filter(Boolean)).size
	const passed = rows.filter((device) => device.state?.toUpperCase() === "PASSED").length
	const failed = rows.filter((device) => device.state?.toUpperCase() === "FAILED").length
	const mediaCounts = rows.reduce(
		(acc, device) => {
			const label = getMediaTypeLabel(device.media_type || device.type)
			if (label) {
				acc[label] = (acc[label] ?? 0) + 1
			}
			return acc
		},
		{} as Record<string, number>
	)
	const mediaSummary = Object.entries(mediaCounts)
		.sort(([a], [b]) => a.localeCompare(b, "zh-CN"))
		.map(([label, count]) => `${label} ${count}`)
		.join(" / ")
	const latestTimestamp = rows
		.map((device) => new Date(device.updated).getTime())
		.filter((value) => Number.isFinite(value))
		.sort((a, b) => b - a)[0]

	return {
		total: rows.length,
		systems,
		passed,
		failed,
		mediaSummary: mediaSummary || "未上报",
		latest: latestTimestamp ? hourWithSeconds(new Date(latestTimestamp).toISOString()) : "无数据",
	}
}

function getMediaTypeLabel(value?: string) {
	const normalized = value?.trim().toLowerCase()
	if (!normalized) return ""
	if (normalized === "ssd") return "SSD"
	if (normalized === "hdd") return "HDD"
	if (normalized === "nvme") return "NVMe"
	if (normalized.includes("solid")) return "SSD"
	if (normalized.includes("rotation") || normalized.includes("hard")) return "HDD"
	return value?.trim().toUpperCase() || ""
}

function SmartDeviceCards({
	rows,
	data,
	showSystem,
	canManage,
	rowActionState,
	onOpen,
	onRefresh,
	onDelete,
}: {
	rows: Row<SmartDeviceRecord>[]
	data: SmartDeviceRecord[] | undefined
	showSystem: boolean
	canManage: boolean
	rowActionState: { type: "refresh" | "delete"; id: string } | null
	onOpen: (disk: SmartDeviceRecord) => void
	onRefresh: (disk: SmartDeviceRecord) => void
	onDelete: (disk: SmartDeviceRecord) => void
}) {
	const allSystems = useStore($allSystemsById)
	if (!rows.length) {
		return (
			<EmptyState
				loading={!data}
				loadingText="正在加载设备"
				emptyText="暂无匹配的 S.M.A.R.T. 设备"
				className="min-h-32 bg-card md:hidden"
			/>
		)
	}

	return (
		<div className="grid gap-2 md:hidden">
			{rows.map((row) => {
				const disk = row.original
				const deviceName = getReadableSmartDeviceName(disk)
				const secondary = formatSmartDeviceSecondary(disk)
				const mediaType = getMediaTypeLabel(disk.media_type || disk.type)
				const isRowRefreshing = rowActionState?.id === disk.id && rowActionState.type === "refresh"
				const isRowDeleting = rowActionState?.id === disk.id && rowActionState.type === "delete"
				return (
					<div key={disk.id} className="grid gap-3 rounded-lg border border-border/70 bg-card p-3 shadow-none">
						<div className="flex min-w-0 items-start justify-between gap-3">
							<div className="min-w-0">
								<div className="flex min-w-0 flex-wrap items-center gap-2">
									<div className="truncate text-sm font-semibold">{deviceName || "未知设备"}</div>
									<Badge variant={disk.state === "PASSED" ? "success" : disk.state === "FAILED" ? "danger" : "warning"}>
										{formatSmartStatus(disk.state)}
									</Badge>
								</div>
								<div className="mt-1 truncate text-xs text-muted-foreground">
									{secondary || disk.name || "无设备路径"}
								</div>
							</div>
							{canManage && (
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button variant="ghost" size="icon" className="size-10 shrink-0">
											<span className="sr-only">
												<Trans>Open menu</Trans>
											</span>
											<MoreHorizontalIcon className="size-4" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										<DropdownMenuItem onClick={() => onRefresh(disk)} disabled={isRowRefreshing || isRowDeleting}>
											<RefreshCwIcon className={cn("me-2.5 size-4", isRowRefreshing && "animate-spin")} />
											<Trans>Refresh</Trans>
										</DropdownMenuItem>
										<DropdownMenuSeparator />
										<DropdownMenuItem onClick={() => onDelete(disk)} disabled={isRowDeleting}>
											<Trash2Icon className="me-2.5 size-4" />
											<Trans>Delete</Trans>
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							)}
						</div>
						<div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
							{showSystem && (
								<div className="rounded-md border border-border/70 bg-surface-soft px-3 py-2">
									<div>机器</div>
									<div className="mt-1 truncate font-medium text-foreground">
										{allSystems[disk.system]?.name || "未知机器"}
									</div>
								</div>
							)}
							<div className="rounded-md border border-border/70 bg-surface-soft px-3 py-2">
								<div>容量</div>
								<div className="mt-1 font-medium text-foreground">
									{disk.capacity ? formatCapacity(disk.capacity) : "无数据"}
								</div>
							</div>
							<div className="rounded-md border border-border/70 bg-surface-soft px-3 py-2">
								<div>温度</div>
								<div className="mt-1 font-medium text-foreground">
									{disk.temp ? formatSmartTemperature(disk.temp) : "无数据"}
								</div>
							</div>
							<div className="rounded-md border border-border/70 bg-surface-soft px-3 py-2">
								<div>介质</div>
								<div className="mt-1 font-medium text-foreground">{mediaType || "未上报"}</div>
							</div>
							<div className="rounded-md border border-border/70 bg-surface-soft px-3 py-2">
								<div>更新</div>
								<div className="mt-1 font-medium text-foreground">{hourWithSeconds(disk.updated)}</div>
							</div>
						</div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="justify-center transition-transform active:scale-[0.96]"
							onClick={() => onOpen(disk)}
						>
							查看详情
						</Button>
					</div>
				)
			})}
		</div>
	)
}

const SmartDevicesTable = memo(function SmartDevicesTable({
	table,
	rows,
	colLength,
	data,
	openSheet,
}: {
	table: TableType<SmartDeviceRecord>
	rows: Row<SmartDeviceRecord>[]
	colLength: number
	data: SmartDeviceRecord[] | undefined
	openSheet: (disk: SmartDeviceRecord) => void
}) {
	const scrollRef = useRef<HTMLDivElement>(null)

	const virtualizer = useVirtualizer<HTMLDivElement, HTMLTableRowElement>({
		count: rows.length,
		estimateSize: () => 65,
		getScrollElement: () => scrollRef.current,
		overscan: 5,
	})
	const virtualRows = virtualizer.getVirtualItems()

	const paddingTop = Math.max(0, virtualRows[0]?.start ?? 0 - virtualizer.options.scrollMargin)
	const paddingBottom = Math.max(0, virtualizer.getTotalSize() - (virtualRows[virtualRows.length - 1]?.end ?? 0))

	return (
		<div
			className={cn(
				"relative hidden h-min max-h-[calc(100dvh-17rem)] max-w-full overflow-auto rounded-lg border border-border/70 bg-card shadow-none md:block",
				(!rows.length || rows.length > 2) && "min-h-50"
			)}
			ref={scrollRef}
		>
			<div style={{ height: `${virtualizer.getTotalSize() + 48}px`, paddingTop, paddingBottom }}>
				<table className="w-full text-sm text-nowrap">
					<SmartTableHead table={table} />
					<TableBody>
						{rows.length ? (
							virtualRows.map((virtualRow) => {
								const row = rows[virtualRow.index]
								return <SmartDeviceTableRow key={row.id} row={row} virtualRow={virtualRow} openSheet={openSheet} />
							})
						) : (
							<TableRow>
								<TableCell colSpan={colLength} className="pointer-events-none p-3">
									<EmptyState
										loading={!data}
										loadingText="正在加载设备"
										emptyText="暂无匹配的 S.M.A.R.T. 设备"
										className="min-h-32 bg-surface-soft"
									/>
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</table>
			</div>
		</div>
	)
})

function SmartTableHead({ table }: { table: TableType<SmartDeviceRecord> }) {
	return (
		<TableHeader className="sticky top-0 z-50 w-full border-b-2">
			{table.getHeaderGroups().map((headerGroup) => (
				<TableRow key={headerGroup.id}>
					{headerGroup.headers.map((header) => (
						<TableHead key={header.id} className="px-2">
							{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
						</TableHead>
					))}
				</TableRow>
			))}
		</TableHeader>
	)
}

const SmartDeviceTableRow = memo(function SmartDeviceTableRow({
	row,
	virtualRow,
	openSheet,
}: {
	row: Row<SmartDeviceRecord>
	virtualRow: VirtualItem
	openSheet: (disk: SmartDeviceRecord) => void
}) {
	return (
		<TableRow
			data-state={row.getIsSelected() && "selected"}
			className="cursor-pointer"
			onClick={() => openSheet(row.original)}
		>
			{row.getVisibleCells().map((cell) => (
				<TableCell
					key={cell.id}
					className="md:ps-5 py-0"
					style={{
						height: virtualRow.size,
					}}
				>
					{flexRender(cell.column.columnDef.cell, cell.getContext())}
				</TableCell>
			))}
		</TableRow>
	)
})
