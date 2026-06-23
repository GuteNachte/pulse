import { Trans } from "@lingui/react/macro"
import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table"
import { CheckCircle2Icon, XCircleIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { EmptyState } from "@/components/ui/empty-state"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { pb } from "@/lib/api"
import type { SmartAttribute, SmartDeviceRecord } from "@/types"
import { formatCapacity, formatSmartStatus } from "./smart-format"

const smartColumns: ColumnDef<SmartAttribute>[] = [
	{
		accessorKey: "id",
		header: "ID",
	},
	{
		accessorFn: (row) => row.n,
		header: "名称",
	},
	{
		accessorFn: (row) => row.rs || row.rv?.toString(),
		header: "原始值",
	},
	{
		accessorKey: "v",
		header: "标准值",
	},
	{
		accessorKey: "w",
		header: "最差值",
	},
	{
		accessorKey: "t",
		header: "阈值",
	},
	{
		accessorKey: "wf",
		header: "失败项",
	},
]

export function DiskSheet({
	diskId,
	open,
	onOpenChange,
}: {
	diskId: string | null
	open: boolean
	onOpenChange: (open: boolean) => void
}) {
	const [disk, setDisk] = useState<SmartDeviceRecord | null>(null)
	const [isLoading, setIsLoading] = useState(false)

	useEffect(() => {
		if (!diskId) {
			setDisk(null)
			return
		}
		if (!open) {
			return
		}
		setIsLoading(true)
		pb.collection<SmartDeviceRecord>("smart_devices")
			.getOne(diskId)
			.then(setDisk)
			.catch(() => setDisk(null))
			.finally(() => setIsLoading(false))
	}, [open, diskId])

	const smartAttributes = disk?.attributes || []
	const failedAttributes = smartAttributes.filter((attr) => attr.wf && attr.wf.trim() !== "")
	const visibleColumns = useMemo(() => {
		return smartColumns.filter((column) => {
			const accessorKey = "accessorKey" in column ? (column.accessorKey as keyof SmartAttribute | undefined) : undefined
			if (!accessorKey) {
				return true
			}
			return smartAttributes.some((attr) => attr[accessorKey] !== undefined)
		})
	}, [smartAttributes])

	const table = useReactTable({
		data: smartAttributes,
		columns: visibleColumns,
		getCoreRowModel: getCoreRowModel(),
	})

	const unknown = "未知"
	const deviceName = disk?.name || unknown
	const model = disk?.model || unknown
	const capacity = disk?.capacity ? formatCapacity(disk.capacity) : unknown
	const serialNumber = disk?.serial
	const firmwareVersion = disk?.firmware
	const status = disk?.state || unknown

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="w-full gap-0 bg-surface-soft p-0 sm:max-w-220">
				<SheetHeader className="mb-0 border-b border-border/70 bg-card px-5 py-4 pr-14">
					<SheetTitle>
						<Trans>S.M.A.R.T. Details</Trans> - {deviceName}
					</SheetTitle>
					<SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
						{model}
						<Separator orientation="vertical" className="h-2.5 bg-border" />
						{capacity}
						{serialNumber && (
							<>
								<Separator orientation="vertical" className="h-2.5 bg-border" />
								<Tooltip>
									<TooltipTrigger asChild>
										<span>{serialNumber}</span>
									</TooltipTrigger>
									<TooltipContent>
										<Trans>Serial Number</Trans>
									</TooltipContent>
								</Tooltip>
							</>
						)}
						{firmwareVersion && (
							<>
								<Separator orientation="vertical" className="h-2.5 bg-border" />
								<Tooltip>
									<TooltipTrigger asChild>
										<span>{firmwareVersion}</span>
									</TooltipTrigger>
									<TooltipContent>
										<Trans>Firmware</Trans>
									</TooltipContent>
								</Tooltip>
							</>
						)}
					</SheetDescription>
				</SheetHeader>
				<div className="flex flex-1 flex-col gap-4 overflow-hidden p-4">
					{isLoading ? (
						<EmptyState loading loadingText="正在加载设备详情" emptyText="暂无设备详情" className="min-h-32" />
					) : (
						<>
							<Alert className="shrink-0 rounded-lg border-border/70 bg-card pb-3 shadow-none">
								{status === "PASSED" ? <CheckCircle2Icon className="size-4" /> : <XCircleIcon className="size-4" />}
								<AlertTitle>
									<Trans>S.M.A.R.T. Self-Test</Trans>: {formatSmartStatus(status)}
								</AlertTitle>
								{failedAttributes.length > 0 && (
									<AlertDescription>
										<Trans>Failed Attributes:</Trans> {failedAttributes.map((attr) => attr.n).join(", ")}
									</AlertDescription>
								)}
							</Alert>
							{smartAttributes.length > 0 ? (
								<div className="flex min-h-0 flex-col overflow-auto rounded-lg border border-border/70 bg-card shadow-none">
									<Table>
										<TableHeader className="sticky top-0 z-10 bg-surface-soft">
											{table.getHeaderGroups().map((headerGroup) => (
												<TableRow key={headerGroup.id}>
													{headerGroup.headers.map((header) => (
														<TableHead key={header.id}>
															{header.isPlaceholder
																? null
																: flexRender(header.column.columnDef.header, header.getContext())}
														</TableHead>
													))}
												</TableRow>
											))}
										</TableHeader>
										<TableBody>
											{table.getRowModel().rows.map((row) => {
												const isFailedAttribute = row.original.wf && row.original.wf.trim() !== ""

												return (
													<TableRow key={row.id} className={isFailedAttribute ? "text-red-600 dark:text-red-400" : ""}>
														{row.getVisibleCells().map((cell) => (
															<TableCell key={cell.id}>
																{flexRender(cell.column.columnDef.cell, cell.getContext())}
															</TableCell>
														))}
													</TableRow>
												)
											})}
										</TableBody>
									</Table>
								</div>
							) : (
								<EmptyState
									loading={false}
									loadingText="正在加载设备属性"
									emptyText="暂无 S.M.A.R.T. 属性"
									className="min-h-32"
								/>
							)}
						</>
					)}
				</div>
			</SheetContent>
		</Sheet>
	)
}
