import { t } from "@lingui/core/macro"
import { Trans } from "@lingui/react/macro"
import {
	flexRender,
	getCoreRowModel,
	getSortedRowModel,
	type PaginationState,
	type SortingState,
	useReactTable,
	type VisibilityState,
} from "@tanstack/react-table"
import {
	BellIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	DownloadIcon,
	RefreshCwIcon,
	SearchIcon,
	Trash2Icon,
} from "lucide-react"
import { memo, useCallback, useEffect, useMemo, useState } from "react"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button, buttonVariants } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/components/ui/use-toast"
import { alertInfo } from "@/lib/alerts"
import { pb } from "@/lib/api"
import { alertAssetName } from "@/lib/alert-display"
import { cn, formatDuration, formatShortDate, useBrowserStorage } from "@/lib/utils"
import type { AlertsHistoryRecord } from "@/types"
import { alertsHistoryColumns } from "../../alerts-history-columns"
import { SettingsEmptyState, SettingsTableEmptyRow } from "./settings-empty-state"

type AlertHistoryListResponse = {
	items: AlertsHistoryRecord[]
	page: number
	perPage: number
	hasMore: boolean
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

const SectionIntro = memo(() => {
	return (
		<div className="rounded-lg border border-border/70 bg-card p-4 shadow-none">
			<div className="flex min-w-0 gap-3">
				<div className="grid size-9 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft text-muted-foreground">
					<BellIcon className="size-4" />
				</div>
				<div className="min-w-0">
					<div className="text-xs font-medium text-muted-foreground">告警记录</div>
					<h3 className="mt-1 text-lg font-semibold tracking-tight">
						<Trans>Alert History</Trans>
					</h3>
					<p className="mt-1 text-pretty text-sm leading-relaxed text-muted-foreground">
						按服务端分页查看告警历史，避免历史记录变多后拖慢浏览器。
					</p>
				</div>
			</div>
		</div>
	)
})

export default function AlertsHistoryDataTable({ hideIntro = false }: { hideIntro?: boolean }) {
	const initialFilters = useMemo(() => getInitialAlertHistoryFilters(), [])
	const [data, setData] = useState<AlertsHistoryRecord[]>([])
	const [sorting, setSorting] = useState<SortingState>([])
	const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
	const [rowSelection, setRowSelection] = useState({})
	const [search, setSearch] = useState(initialFilters.search)
	const [stateFilter, setStateFilter] = useState(initialFilters.state)
	const [sourceFilter, setSourceFilter] = useState(initialFilters.source)
	const [loading, setLoading] = useState(false)
	const [hasMore, setHasMore] = useState(false)
	const { toast } = useToast()
	const [deleteOpen, setDeleteDialogOpen] = useState(false)

	const [pagination, setPagination] = useBrowserStorage<PaginationState>("ah-pagination-server", {
		pageIndex: 0,
		pageSize: 25,
	})
	const pageSize = Math.min(Math.max(Number(pagination.pageSize) || 25, 1), 100)
	const currentPage = Math.max(Number(pagination.pageIndex) || 0, 0)

	const query = useMemo(() => {
		const params = new URLSearchParams({
			page: String(currentPage + 1),
			perPage: String(pageSize),
		})
		const keyword = search.trim()
		if (keyword) params.set("search", keyword)
		if (stateFilter !== "all") params.set("state", stateFilter)
		if (sourceFilter !== "all") params.set("source", sourceFilter)
		return params.toString()
	}, [currentPage, pageSize, search, sourceFilter, stateFilter])

	const loadRecords = useCallback(async () => {
		setLoading(true)
		try {
			const response = await pb.send<AlertHistoryListResponse>(`/api/pulse/alerts-history?${query}`, {
				requestKey: null,
			})
			setData(response.items)
			setHasMore(Boolean(response.hasMore))
		} catch (error) {
			console.error(error)
			toast({
				variant: "destructive",
				title: "加载告警历史失败",
				description: "请确认 Hub 后端可用，并检查当前账号是否有权限查看告警记录。",
			})
		} finally {
			setLoading(false)
		}
	}, [query, toast])

	useEffect(() => {
		let unsubscribe: (() => void) | undefined
		let refreshTimer: ReturnType<typeof setTimeout> | undefined
		loadRecords()
		;(async () => {
			unsubscribe = await pb.collection("alerts_history").subscribe("*", () => {
				if (refreshTimer) clearTimeout(refreshTimer)
				refreshTimer = setTimeout(loadRecords, 250)
			})
		})()
		return () => {
			unsubscribe?.()
			if (refreshTimer) clearTimeout(refreshTimer)
		}
	}, [loadRecords])

	useEffect(() => {
		setRowSelection({})
	}, [data])

	const resetToFirstPage = useCallback(() => {
		setPagination({ pageIndex: 0, pageSize })
	}, [pageSize, setPagination])

	const setPageSize = useCallback(
		(nextPageSize: number) => {
			setPagination({ pageIndex: 0, pageSize: Math.min(nextPageSize, 100) })
		},
		[setPagination]
	)

	const setPageIndex = useCallback(
		(nextPageIndex: number) => {
			setPagination({ pageIndex: Math.max(0, nextPageIndex), pageSize })
		},
		[pageSize, setPagination]
	)

	const table = useReactTable({
		data,
		columns: [
			{
				id: "select",
				header: ({ table }) => (
					<Checkbox
						className="ms-2"
						checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
						onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
						aria-label="Select all"
					/>
				),
				cell: ({ row }) => (
					<Checkbox
						checked={row.getIsSelected()}
						onCheckedChange={(value) => row.toggleSelected(!!value)}
						aria-label="Select row"
					/>
				),
				enableSorting: false,
				enableHiding: false,
			},
			...alertsHistoryColumns,
		],
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getRowId: (row) => row.id,
		manualPagination: true,
		pageCount: hasMore ? currentPage + 2 : Math.max(1, currentPage + 1),
		onSortingChange: setSorting,
		onColumnVisibilityChange: setColumnVisibility,
		onRowSelectionChange: setRowSelection,
		onPaginationChange: setPagination,
		state: {
			sorting,
			columnVisibility,
			rowSelection,
			pagination: { pageIndex: currentPage, pageSize },
		},
	})

	const selectedRows = table.getSelectedRowModel().rows
	const hasRows = data.length > 0
	const pageStart = hasRows ? currentPage * pageSize + 1 : 0
	const pageEnd = currentPage * pageSize + data.length
	const toolbarSummary = hasRows ? `第 ${pageStart} - ${pageEnd} 条` : loading ? "加载中" : "暂无记录"

	const handleBulkDelete = async () => {
		setDeleteDialogOpen(false)
		const selectedIds = selectedRows.map((row) => row.original.id)
		try {
			let batch = pb.createBatch()
			let inBatch = 0
			for (const id of selectedIds) {
				batch.collection("alerts_history").delete(id)
				inBatch++
				if (inBatch > 20) {
					await batch.send()
					batch = pb.createBatch()
					inBatch = 0
				}
			}
			inBatch && (await batch.send())
			table.resetRowSelection()
			await loadRecords()
		} catch {
			toast({
				variant: "destructive",
				title: t`Error`,
				description: "删除告警记录失败。",
			})
		}
	}

	const handleExportCSV = () => {
		if (!selectedRows.length) return
		const cells: Record<string, (record: AlertsHistoryRecord) => string> = {
			system: (record) => record.expand?.system?.name || record.system,
			asset: (record) => alertAssetName(record),
			name: (record) => alertInfo[record.name]?.name() || record.name,
			value: (record) => `${record.value ?? record.val ?? ""}${alertInfo[record.name]?.unit ?? ""}`,
			state: (record) => (record.resolved ? t`Resolved` : t`Active`),
			created: (record) => formatShortDate(record.created),
			resolved: (record) => (record.resolved ? formatShortDate(record.resolved) : ""),
			duration: (record) => (record.resolved ? formatDuration(record.created, record.resolved) : ""),
		}
		const csvRows = [Object.keys(cells).join(",")]
		for (const row of selectedRows) {
			const record = row.original
			csvRows.push(
				Object.values(cells)
					.map((value) => csvCell(value(record)))
					.join(",")
			)
		}
		const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8" })
		const url = URL.createObjectURL(blob)
		const a = document.createElement("a")
		a.href = url
		a.download = "alerts_history.csv"
		a.click()
		URL.revokeObjectURL(url)
	}

	return (
		<div className="@container w-full min-w-0 rounded-lg border border-border/70 bg-surface-soft p-3 shadow-none sm:p-4">
			<div className="mb-3 grid gap-3 @3xl:grid-cols-[minmax(0,1fr)_auto] @3xl:items-end">
				{!hideIntro && <SectionIntro />}
				<div className="grid w-full gap-2 rounded-lg border border-border/70 bg-card p-3 shadow-none @3xl:w-auto @3xl:grid-cols-[260px_150px_150px_auto]">
					<div className="relative min-w-0">
						<SearchIcon className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground" />
						<Input
							placeholder="搜索机器、告警名或告警 ID"
							value={search}
							onChange={(event) => {
								setSearch(event.target.value)
								resetToFirstPage()
							}}
							className="h-10 w-full pl-9"
						/>
					</div>
					<Select
						value={stateFilter}
						onValueChange={(value) => {
							setStateFilter(value)
							resetToFirstPage()
						}}
					>
						<SelectTrigger className="h-10">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">全部状态</SelectItem>
							<SelectItem value="current">未恢复</SelectItem>
							<SelectItem value="recovered">已恢复</SelectItem>
						</SelectContent>
					</Select>
					<Select
						value={sourceFilter}
						onValueChange={(value) => {
							setSourceFilter(value)
							resetToFirstPage()
						}}
					>
						<SelectTrigger className="h-10">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">全部来源</SelectItem>
							<SelectItem value="machine">机器</SelectItem>
							<SelectItem value="website">网站</SelectItem>
							<SelectItem value="container">容器</SelectItem>
							<SelectItem value="compose">编排</SelectItem>
							<SelectItem value="service">服务</SelectItem>
							<SelectItem value="software">软件</SelectItem>
							<SelectItem value="hardware">硬件</SelectItem>
							<SelectItem value="resource">资源</SelectItem>
						</SelectContent>
					</Select>
					<Button variant="outline" className="h-10" onClick={loadRecords} disabled={loading}>
						<RefreshCwIcon className={cn("size-4", loading && "animate-spin")} />
						刷新
					</Button>
				</div>
			</div>
			{selectedRows.length > 0 && (
				<div className="fixed bottom-0 left-0 z-50 grid w-full shrink-0 grid-cols-2 items-center gap-4 border-t border-border/70 bg-card p-4 shadow-none @lg:static @lg:mb-3 @lg:w-auto @lg:grid-cols-[auto_auto] @lg:justify-start @lg:border-0 @lg:bg-transparent @lg:p-0">
					<AlertDialog open={deleteOpen} onOpenChange={(open) => setDeleteDialogOpen(open)}>
						<AlertDialogTrigger asChild>
							<Button variant="destructive" className="h-10 shrink-0">
								<Trash2Icon className="size-4 shrink-0" />
								<span className="ms-1">
									<Trans>Delete</Trans>
								</span>
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>
									<Trans>Are you sure?</Trans>
								</AlertDialogTitle>
								<AlertDialogDescription>
									将永久删除当前页已选中的 {selectedRows.length} 条告警历史记录。
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>
									<Trans>Cancel</Trans>
								</AlertDialogCancel>
								<AlertDialogAction
									className={cn(buttonVariants({ variant: "destructive" }))}
									onClick={handleBulkDelete}
								>
									<Trans>Continue</Trans>
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
					<Button variant="outline" className="h-10" onClick={handleExportCSV}>
						<DownloadIcon className="size-4" />
						<span className="ms-1">
							<Trans>Export</Trans>
						</span>
					</Button>
				</div>
			)}
			<div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-card px-3 py-2 text-sm shadow-none">
				<div className="text-muted-foreground">
					当前页 <span className="font-medium text-foreground tabular-nums">{data.length}</span> 条
					{selectedRows.length > 0 && (
						<span>
							，已选 <span className="font-medium text-foreground tabular-nums">{selectedRows.length}</span> 条
						</span>
					)}
				</div>
				<div className="font-medium text-muted-foreground tabular-nums">{toolbarSummary}</div>
			</div>
			<div className="overflow-x-auto whitespace-nowrap rounded-lg border border-border/70 bg-card shadow-none">
				<Table>
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<tr key={headerGroup.id} className="border-border/70 bg-surface-soft hover:bg-surface-soft">
								{headerGroup.headers.map((header) => (
									<TableHead className="px-2" key={header.id}>
										{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
									</TableHead>
								))}
							</tr>
						))}
					</TableHeader>
					<TableBody>
						{table.getRowModel().rows.length ? (
							table.getRowModel().rows.map((row) => (
								<TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
									{row.getVisibleCells().map((cell) => (
										<TableCell key={cell.id} className="py-3">
											{flexRender(cell.column.columnDef.cell, cell.getContext())}
										</TableCell>
									))}
								</TableRow>
							))
						) : (
							<SettingsTableEmptyRow
								colSpan={table.getAllColumns().length}
								loading={loading}
								loadingText="正在读取告警历史"
								emptyText="暂无告警历史"
							/>
						)}
					</TableBody>
				</Table>
			</div>
			<div className="flex items-center justify-between rounded-lg border border-border/70 bg-card px-3 tabular-nums shadow-none">
				<div className="hidden flex-1 text-sm text-muted-foreground lg:flex">
					当前页已选 {selectedRows.length} 条，本页 {data.length} 条
				</div>
				{hasRows || currentPage > 0 ? (
					<div className="my-3 flex w-full items-center gap-3 sm:gap-6 lg:w-fit lg:gap-8">
						<div className="hidden items-center gap-2 lg:flex">
							<Label htmlFor="rows-per-page" className="text-sm font-medium">
								<Trans>Rows per page</Trans>
							</Label>
							<Select value={`${pageSize}`} onValueChange={(value) => setPageSize(Number(value))}>
								<SelectTrigger className="w-18" id="rows-per-page">
									<SelectValue placeholder={pageSize} />
								</SelectTrigger>
								<SelectContent side="top">
									{PAGE_SIZE_OPTIONS.map((item) => (
										<SelectItem key={item} value={`${item}`}>
											{item}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex min-w-48 items-center justify-center text-sm font-medium">
							{hasRows ? (
								<span>
									第 {pageStart} - {pageEnd} 条{hasMore ? "，后面还有更多" : ""}
								</span>
							) : (
								<span>第 {currentPage + 1} 页暂无记录</span>
							)}
						</div>
						<div className="ms-auto flex items-center gap-2 lg:ms-0">
							<Button
								variant="outline"
								className="size-10"
								size="icon"
								onClick={() => setPageIndex(currentPage - 1)}
								disabled={currentPage === 0 || loading}
							>
								<span className="sr-only">Go to previous page</span>
								<ChevronLeftIcon className="size-5" />
							</Button>
							<span className="min-w-16 text-center text-sm tabular-nums">第 {currentPage + 1} 页</span>
							<Button
								variant="outline"
								className="size-10"
								size="icon"
								onClick={() => setPageIndex(currentPage + 1)}
								disabled={!hasMore || loading}
							>
								<span className="sr-only">Go to next page</span>
								<ChevronRightIcon className="size-5" />
							</Button>
						</div>
					</div>
				) : (
					<SettingsEmptyState
						loading={loading}
						loadingText="正在读取告警历史"
						emptyText="暂无可分页的告警记录"
						className="my-3 min-h-20"
					/>
				)}
			</div>
		</div>
	)
}

function getInitialAlertHistoryFilters() {
	if (typeof window === "undefined") {
		return { search: "", state: "all", source: "all" }
	}
	const params = new URLSearchParams(window.location.search)
	const state = params.get("state") || "all"
	const source = params.get("source") || "all"
	return {
		search: params.get("search") || "",
		state: ["all", "current", "recovered"].includes(state) ? state : "all",
		source: [
			"all",
			"machine",
			"website",
			"container",
			"compose",
			"service",
			"software",
			"hardware",
			"resource",
		].includes(source)
			? source
			: "all",
	}
}

function csvCell(value: string) {
	if (!/[",\n\r]/.test(value)) {
		return value
	}
	return `"${value.replaceAll('"', '""')}"`
}
