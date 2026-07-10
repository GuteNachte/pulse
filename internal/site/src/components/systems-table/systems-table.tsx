import { Trans, useLingui } from "@lingui/react/macro"
import { useStore } from "@nanostores/react"
import { getPagePath } from "@nanostores/router"
import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	getSortedRowModel,
	type Row,
	type SortingState,
	type Table as TableType,
	useReactTable,
	type VisibilityState,
} from "@tanstack/react-table"
import {
	ArrowDownIcon,
	ArrowUpDownIcon,
	ArrowUpIcon,
	EyeIcon,
	FilterIcon,
	SearchIcon,
	Settings2Icon,
	XIcon,
} from "lucide-react"
import { Fragment, memo, type ReactNode, useEffect, useMemo, useState } from "react"
import { SystemMetaTags } from "@/components/system-meta-tags"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { buildSystemStatusCounts, filterSystemsForInventory, type SystemStatusFilter } from "@/lib/system-display"
import { SystemStatus } from "@/lib/enums"
import { $systems, $systemsLoadFailed, $systemsLoaded } from "@/lib/stores"
import { getSystemIPAddressLabel } from "@/lib/system-network"
import {
	getSystemDisplayName,
	primaryUseOptions,
	systemRoleOptions,
	type PrimaryUse,
	type SystemRole,
} from "@/lib/system-roles"
import { cn, runOnce, useBrowserStorage } from "@/lib/utils"
import type { SystemRecord } from "@/types"
import { $router, Link } from "../router"
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
import { SystemsTableColumns, ActionsButton, IndicatorDot, type SystemsTableColumnDef } from "./systems-table-columns"

type RoleFilter = "all" | SystemRole
type PrimaryUseFilter = "all" | PrimaryUse

const DEFAULT_VISIBLE_SYSTEMS = 60
const VISIBLE_SYSTEMS_STEP = 60
const metricStateColumns = new Set(["cpu", "memory", "disk", "gpu", "loadAverage", "net"])
const meterColumns = new Set(["cpu", "memory", "disk", "gpu"])
const hiddenCardColumns = new Set(["temp", "battery"])

const preloadSystemDetail = runOnce(() => import("@/components/routes/system.tsx"))

export default function SystemsTable({ headerAction }: { headerAction?: ReactNode }) {
	const data = useStore($systems)
	const systemsLoaded = useStore($systemsLoaded)
	const systemsLoadFailed = useStore($systemsLoadFailed)
	const { i18n } = useLingui()
	const [query, setQuery] = useState("")
	const [statusFilter, setStatusFilter] = useState<SystemStatusFilter>("all")
	const [roleFilter, setRoleFilter] = useState<RoleFilter>("all")
	const [primaryUseFilter, setPrimaryUseFilter] = useState<PrimaryUseFilter>("all")
	const [visibleLimit, setVisibleLimit] = useState(DEFAULT_VISIBLE_SYSTEMS)
	const [sorting, setSorting] = useBrowserStorage<SortingState>(
		"sortMode",
		[{ id: "system", desc: false }],
		sessionStorage
	)
	const [columnVisibility, setColumnVisibility] = useBrowserStorage<VisibilityState>("cols", {})

	const locale = i18n.locale

	const filteredData = useMemo(() => {
		return filterSystemsForInventory(data, {
			query,
			status: statusFilter,
			role: roleFilter,
			primaryUse: primaryUseFilter,
		})
	}, [data, query, statusFilter, roleFilter, primaryUseFilter])

	const columnDefs = useMemo(() => SystemsTableColumns(), [])

	const table = useReactTable({
		data: filteredData,
		columns: columnDefs,
		getCoreRowModel: getCoreRowModel(),
		onSortingChange: setSorting,
		getSortedRowModel: getSortedRowModel(),
		onColumnVisibilityChange: setColumnVisibility,
		state: {
			sorting,
			columnVisibility,
		},
		defaultColumn: {
			invertSorting: true,
			sortUndefined: "last",
			minSize: 0,
			size: 900,
			maxSize: 900,
		},
	})

	const rows = table.getRowModel().rows
	const visibleRows = rows.slice(0, visibleLimit)
	const columns = table.getAllColumns()
	const getColumnName = (columnDef: ColumnDef<SystemRecord, unknown>) => (columnDef as SystemsTableColumnDef).name()

	const statusCounts = useMemo(() => buildSystemStatusCounts(data), [data])
	const activeFilterCount =
		Number(statusFilter !== "all") + Number(roleFilter !== "all") + Number(primaryUseFilter !== "all")

	useEffect(() => {
		setVisibleLimit(DEFAULT_VISIBLE_SYSTEMS)
	}, [query, statusFilter, roleFilter, primaryUseFilter, sorting])

	const CardHead = useMemo(() => {
		return (
			<CardHeader className="border-b border-border bg-surface-soft px-5 py-3">
				<div className="flex flex-wrap items-center gap-x-5 gap-y-3">
					<div className="min-w-0 flex-1">
						<div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
							<CardTitle className="truncate text-xl">
								<Trans>All Systems</Trans>
							</CardTitle>
							<span className="rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-muted-foreground">
								客户端资产
							</span>
						</div>
						<div className="mt-1 text-xs text-muted-foreground">
							当前显示 {filteredData.length} / {data.length} 台机器
						</div>
					</div>

					<div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
						<div className="flex flex-wrap justify-end gap-1.5">
							<StatusSummaryPill label="在线" value={statusCounts.up} />
							<StatusSummaryPill label="离线" value={statusCounts.down} tone="danger" />
							<StatusSummaryPill label="待接入" value={statusCounts.pending} tone="warning" />
							<StatusSummaryPill label="暂停" value={statusCounts.paused} tone="muted" />
						</div>

						<div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
							<div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none xl:w-80">
								<SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									value={query}
									onChange={(event) => setQuery(event.target.value)}
									placeholder="搜索机器、IP、用途、说明、版本"
									className="h-10 ps-9 pe-9"
								/>
								{query && (
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="absolute right-1 top-1/2 size-10 -translate-y-1/2 text-muted-foreground"
										aria-label="清空搜索"
										onClick={() => setQuery("")}
									>
										<XIcon className="size-4" />
									</Button>
								)}
							</div>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button variant="outline">
										<Settings2Icon className="me-1.5 size-4 opacity-80" />
										<span>筛选</span>
										{activeFilterCount > 0 && (
											<span className="ms-1 rounded-sm bg-primary px-1.5 py-0.5 text-[10px] leading-none text-primary-foreground">
												{activeFilterCount}
											</span>
										)}
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end" className="h-96 min-w-60 overflow-y-auto md:h-auto md:min-w-[46rem]">
									<div className="grid grid-cols-1 divide-y md:grid-cols-[1fr_1fr_1fr_1fr_1fr] md:divide-x md:divide-y-0">
										<div className="border-r">
											<DropdownMenuLabel className="pt-2 px-3.5 flex items-center gap-2">
												<FilterIcon className="size-4" />
												<Trans>Status</Trans>
											</DropdownMenuLabel>
											<DropdownMenuSeparator />
											<DropdownMenuRadioGroup
												className="px-1 pb-1"
												value={statusFilter}
												onValueChange={(value) => setStatusFilter(value as SystemStatusFilter)}
											>
												<DropdownMenuRadioItem value="all" onSelect={(e) => e.preventDefault()}>
													全部 ({statusCounts.all})
												</DropdownMenuRadioItem>
												<DropdownMenuRadioItem value="up" onSelect={(e) => e.preventDefault()}>
													在线 ({statusCounts.up})
												</DropdownMenuRadioItem>
												<DropdownMenuRadioItem value="down" onSelect={(e) => e.preventDefault()}>
													离线 ({statusCounts.down})
												</DropdownMenuRadioItem>
												<DropdownMenuRadioItem value="pending" onSelect={(e) => e.preventDefault()}>
													待接入 ({statusCounts.pending})
												</DropdownMenuRadioItem>
												<DropdownMenuRadioItem value="paused" onSelect={(e) => e.preventDefault()}>
													暂停 ({statusCounts.paused})
												</DropdownMenuRadioItem>
											</DropdownMenuRadioGroup>
										</div>

										<div className="border-r">
											<DropdownMenuLabel className="pt-2 px-3.5 flex items-center gap-2">
												<FilterIcon className="size-4" />
												机器类型
											</DropdownMenuLabel>
											<DropdownMenuSeparator />
											<DropdownMenuRadioGroup
												className="px-1 pb-1"
												value={roleFilter}
												onValueChange={(value) => setRoleFilter(value as RoleFilter)}
											>
												<DropdownMenuRadioItem value="all" onSelect={(e) => e.preventDefault()}>
													全部类型
												</DropdownMenuRadioItem>
												{systemRoleOptions.map((option) => (
													<DropdownMenuRadioItem
														key={option.value}
														value={option.value}
														onSelect={(e) => e.preventDefault()}
													>
														{option.label}
													</DropdownMenuRadioItem>
												))}
											</DropdownMenuRadioGroup>
										</div>

										<div className="border-r">
											<DropdownMenuLabel className="pt-2 px-3.5 flex items-center gap-2">
												<FilterIcon className="size-4" />
												主要用途
											</DropdownMenuLabel>
											<DropdownMenuSeparator />
											<DropdownMenuRadioGroup
												className="px-1 pb-1"
												value={primaryUseFilter}
												onValueChange={(value) => setPrimaryUseFilter(value as PrimaryUseFilter)}
											>
												<DropdownMenuRadioItem value="all" onSelect={(e) => e.preventDefault()}>
													全部用途
												</DropdownMenuRadioItem>
												{primaryUseOptions.map((option) => (
													<DropdownMenuRadioItem
														key={option.value}
														value={option.value}
														onSelect={(e) => e.preventDefault()}
													>
														{option.label}
													</DropdownMenuRadioItem>
												))}
											</DropdownMenuRadioGroup>
										</div>

										<div className="border-r">
											<DropdownMenuLabel className="pt-2 px-3.5 flex items-center gap-2">
												<ArrowUpDownIcon className="size-4" />
												<Trans>Sort By</Trans>
											</DropdownMenuLabel>
											<DropdownMenuSeparator />
											<div className="px-1 pb-1">
												{columns.map((column) => {
													if (!column.getCanSort()) return null
													let Icon = <span className="w-6"></span>
													// if current sort column, show sort direction
													if (sorting[0]?.id === column.id) {
														if (sorting[0]?.desc) {
															Icon = <ArrowUpIcon className="me-2 size-4" />
														} else {
															Icon = <ArrowDownIcon className="me-2 size-4" />
														}
													}
													return (
														<DropdownMenuItem
															onSelect={(e) => {
																e.preventDefault()
																setSorting([{ id: column.id, desc: sorting[0]?.id === column.id && !sorting[0]?.desc }])
															}}
															key={column.id}
														>
															{Icon}
															{getColumnName(column.columnDef)}
														</DropdownMenuItem>
													)
												})}
											</div>
										</div>

										<div>
											<DropdownMenuLabel className="pt-2 px-3.5 flex items-center gap-2">
												<EyeIcon className="size-4" />
												<Trans>Visible Fields</Trans>
											</DropdownMenuLabel>
											<DropdownMenuSeparator />
											<div className="px-1.5 pb-1">
												{columns
													.filter((column) => column.getCanHide())
													.map((column) => {
														return (
															<DropdownMenuCheckboxItem
																key={column.id}
																onSelect={(e) => e.preventDefault()}
																checked={column.getIsVisible()}
																onCheckedChange={(value) => column.toggleVisibility(!!value)}
															>
																{getColumnName(column.columnDef)}
															</DropdownMenuCheckboxItem>
														)
													})}
											</div>
										</div>
									</div>
								</DropdownMenuContent>
							</DropdownMenu>
							{headerAction}
						</div>
					</div>
				</div>
			</CardHeader>
		)
	}, [
		activeFilterCount,
		data.length,
		filteredData.length,
		headerAction,
		locale,
		primaryUseFilter,
		query,
		roleFilter,
		sorting,
		statusCounts.all,
		statusCounts.down,
		statusCounts.paused,
		statusCounts.pending,
		statusCounts.up,
		statusFilter,
	])

	return (
		<Card className="w-full overflow-hidden">
			{CardHead}
			<div
				className="grid justify-start gap-3 p-4"
				style={{
					gridTemplateColumns:
						visibleRows.length === 1 ? "minmax(0, 1fr)" : "repeat(auto-fill, minmax(min(100%, 20rem), 24rem))",
				}}
			>
				{rows?.length ? (
					visibleRows.map((row) => {
						return <SystemCard key={row.original.id} row={row} table={table} />
					})
				) : (
					<div className="col-span-full min-h-32">
						<SystemsEmptyState loaded={systemsLoaded} failed={systemsLoadFailed} />
					</div>
				)}
			</div>
			{rows.length > visibleRows.length && (
				<div className="border-t border-border bg-surface-soft px-4 py-4 flex items-center justify-center">
					<Button
						type="button"
						variant="outline"
						className="min-w-44"
						onClick={() => setVisibleLimit((current) => current + VISIBLE_SYSTEMS_STEP)}
					>
						加载更多 {visibleRows.length}/{rows.length}
					</Button>
				</div>
			)}
		</Card>
	)
}

function StatusSummaryPill({
	label,
	value,
	tone = "success",
}: {
	label: string
	value: number
	tone?: "success" | "warning" | "danger" | "muted"
}) {
	return (
		<div className="flex h-9 min-w-16 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 shadow-none">
			<div
				className={cn(
					"text-sm font-semibold leading-none",
					tone === "success" && "text-emerald-600 dark:text-emerald-300",
					tone === "warning" && "text-amber-600 dark:text-amber-300",
					tone === "danger" && "text-red-600 dark:text-red-300",
					tone === "muted" && "text-muted-foreground"
				)}
			>
				{value}
			</div>
			<div className="text-[11px] font-medium text-muted-foreground">{label}</div>
		</div>
	)
}

const SystemCard = memo(({ row, table }: { row: Row<SystemRecord>; table: TableType<SystemRecord> }) => {
	const system = row.original
	const { t } = useLingui()
	const unsupportedLabel = t`Unsupported`
	const displayName = getSystemDisplayName(system)
	const description = system.description?.trim()
	const ipLabel = getSystemIPAddressLabel(system)

	return useMemo(() => {
		return (
			<Card
				onMouseEnter={preloadSystemDetail}
				key={system.id}
				className={cn(
					"relative w-full min-w-0 cursor-pointer overflow-hidden border-border bg-card shadow-none transition-[background-color,border-color,opacity,transform] duration-150 ease-out hover:bg-surface-soft",
					{
						"opacity-50": system.status === SystemStatus.Paused,
					}
				)}
			>
				<CardHeader className="border-b border-border bg-surface-soft py-2.5 ps-4 pe-2">
					<div className="flex items-center gap-2 w-full overflow-hidden">
						<div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
							<h3 className="flex min-w-0 items-center gap-2.5 font-semibold text-foreground">
								<IndicatorDot system={system} />
								<span className="truncate text-sm tracking-normal text-foreground">{displayName}</span>
							</h3>
							<SystemMetaTags system={system} />
							{ipLabel && (
								<span className="truncate text-xs font-medium text-muted-foreground" title={ipLabel}>
									{ipLabel}
								</span>
							)}
						</div>
						{table.getColumn("actions")?.getIsVisible() && (
							<div className="flex gap-1 shrink-0 relative z-10">
								<ActionsButton system={system} />
							</div>
						)}
					</div>
				</CardHeader>
				<CardContent className="px-4 pb-4 pt-3.5 text-sm sm:px-5">
					<div
						className="grid min-w-0 gap-x-2.5 gap-y-2.5 rounded-lg bg-surface-soft p-3"
						style={{ gridTemplateColumns: "20px minmax(3.25rem, 5.25rem) minmax(0, 1fr)" }}
					>
						{table.getAllColumns().map((column) => {
							if (!column.getIsVisible() || column.id === "system" || column.id === "actions") return null
							if (hiddenCardColumns.has(column.id)) return null
							if (column.id === "description" && !description) return null
							if (column.id === "loadAverage") return null
							const cell = row.getAllCells().find((cell) => cell.column.id === column.id)
							if (!cell) return null
							const value = cell.getValue()
							const { Icon, name } = column.columnDef as SystemsTableColumnDef
							const hasCollectedValue =
								value !== null && value !== undefined && value !== "" && !(column.id === "temp" && value === 0)
							const shouldRenderMissingState = metricStateColumns.has(column.id)
							const renderedCell =
								hasCollectedValue || shouldRenderMissingState
									? flexRender(cell.column.columnDef.cell, cell.getContext())
									: null
							const displayValue =
								column.id === "description" ? (
									<span className="truncate text-muted-foreground" title={description}>
										{description}
									</span>
								) : renderedCell === null ||
									renderedCell === undefined ||
									renderedCell === false ||
									renderedCell === "" ? (
									<span className="text-muted-foreground">{unsupportedLabel}</span>
								) : (
									renderedCell
								)
							if (meterColumns.has(column.id)) {
								const meta =
									column.id === "cpu" && table.getColumn("loadAverage")?.getIsVisible() ? getLoadAverageMeta(row) : null
								return (
									<SystemMetricRow
										key={column.id}
										label={name()}
										meta={meta}
										icon={Icon ? <Icon className="size-4" /> : null}
									>
										{displayValue}
									</SystemMetricRow>
								)
							}
							return (
								<Fragment key={column.id}>
									<div key={`${column.id}-icon`} className="flex items-center">
										{column.id === "lastSeen" ? (
											<EyeIcon className="size-4 text-muted-foreground" />
										) : (
											Icon && <Icon className="size-4 text-muted-foreground" />
										)}
									</div>
									<div
										key={`${column.id}-label`}
										className="flex min-w-0 items-center truncate pr-1 text-muted-foreground"
										title={`${name()}:`}
									>
										<span className="truncate">{name()}:</span>
									</div>
									<div key={`${column.id}-value`} className="flex min-w-0 items-center overflow-hidden">
										{displayValue}
									</div>
								</Fragment>
							)
						})}
					</div>
				</CardContent>
				<Link href={getPagePath($router, "system", { id: row.original.id })} className="inset-0 absolute w-full h-full">
					<span className="sr-only">{displayName}</span>
				</Link>
			</Card>
		)
	}, [system, row, table, t, unsupportedLabel, displayName, description, ipLabel])
})

function getLoadAverageMeta(row: Row<SystemRecord>) {
	const system = row.original
	if (system.status !== SystemStatus.Up || !system.info.la?.length) {
		return null
	}
	const loadCell = row.getAllCells().find((cell) => cell.column.id === "loadAverage")
	if (!loadCell) {
		return null
	}
	return flexRender(loadCell.column.columnDef.cell, loadCell.getContext())
}

function SystemMetricRow({
	label,
	meta,
	icon,
	children,
}: {
	label: string
	meta?: ReactNode
	icon: ReactNode
	children: ReactNode
}) {
	return (
		<div className="col-span-3 min-w-0 rounded-md border border-border/70 bg-card px-3 py-2.5">
			<div className="mb-2 flex min-w-0 items-center justify-between gap-3">
				<div className="flex min-w-0 items-center gap-2 text-muted-foreground">
					<span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">{icon}</span>
					<span className="truncate text-xs font-medium">{label}</span>
				</div>
				{meta && (
					<div className="flex min-w-0 shrink-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
						<span className="text-muted-foreground/80">负载</span>
						<span className="min-w-0 [&>div]:whitespace-nowrap [&>div>span:last-child]:text-foreground">{meta}</span>
					</div>
				)}
			</div>
			<div className="min-w-0 [&>div]:gap-3 [&>div>span:first-child]:w-12 [&>div>span:first-child]:text-xs [&>div>span:first-child]:font-medium [&>div>span:last-child]:h-3 [&>div>span:last-child]:min-w-24 [&>div>span:last-child]:bg-surface-soft">
				{children}
			</div>
		</div>
	)
}

function SystemsEmptyState({
	loaded,
	failed,
	compact = false,
}: {
	loaded: boolean
	failed: boolean
	compact?: boolean
}) {
	if (!loaded) {
		return (
			<EmptyState
				loading
				loadingText="正在读取客户端"
				emptyText="暂无客户端"
				className={cn("h-full min-h-32 border-0", compact && "min-h-20")}
			/>
		)
	}
	if (failed) {
		return (
			<EmptyState
				loading={false}
				loadingText="正在读取客户端"
				emptyText="客户端列表读取失败"
				description="请确认 Hub 服务可用后刷新页面。"
				className={cn("h-full min-h-32 border-0", compact && "min-h-20")}
			/>
		)
	}
	return (
		<EmptyState
			loading={false}
			loadingText="正在读取客户端"
			emptyText="暂无客户端"
			className={cn("h-full min-h-32 border-0", compact && "min-h-20")}
		/>
	)
}
