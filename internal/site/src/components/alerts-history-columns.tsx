import { Trans } from "@lingui/react/macro"
import type { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { alertInfo } from "@/lib/alerts"
import {
	alertAssetName,
	alertCreatedLabel,
	alertDisplayName,
	alertDurationLabel,
	alertIsAcknowledged,
	alertIsSilenced,
	alertResolvedLabel,
	alertSeverity,
	alertSeverityLabel,
	alertSilencedUntilLabel,
	alertSourceLabel,
	alertStateLabel,
	alertSystemName,
	alertValueLabel,
} from "@/lib/alert-display"
import { cn } from "@/lib/utils"
import type { AlertsHistoryRecord } from "@/types"

export const alertsHistoryColumns: ColumnDef<AlertsHistoryRecord>[] = [
	{
		accessorKey: "system",
		enableSorting: true,
		header: ({ column }) => (
			<Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
				<Trans>System</Trans>
			</Button>
		),
		cell: ({ row }) => <div className="max-w-60 truncate ps-2">{alertSystemName(row.original)}</div>,
		filterFn: (row, _, filterValue) => alertSystemName(row.original).toLowerCase().includes(filterValue.toLowerCase()),
	},
	{
		id: "asset",
		accessorFn: (record) => alertAssetName(record),
		enableSorting: true,
		header: ({ column }) => (
			<Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
				资产
			</Button>
		),
		cell: ({ row }) => {
			const assetName = alertAssetName(row.original)
			return assetName ? <div className="max-w-56 truncate ps-2">{assetName}</div> : null
		},
		filterFn: (row, _, filterValue) => alertAssetName(row.original).toLowerCase().includes(filterValue.toLowerCase()),
	},
	{
		id: "source",
		accessorFn: (record) => alertSourceLabel(record),
		enableSorting: true,
		header: ({ column }) => (
			<Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
				来源
			</Button>
		),
		cell: ({ row }) => (
			<Badge variant="secondary" className="pointer-events-none">
				{alertSourceLabel(row.original)}
			</Badge>
		),
	},
	{
		id: "name",
		accessorFn: (record) => alertDisplayName(record),
		header: ({ column }) => (
			<Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
				<Trans>Name</Trans>
			</Button>
		),
		cell: ({ getValue, row }) => {
			const name = getValue() as string
			const Icon = alertInfo[row.original.name]?.icon

			return (
				<span className="flex min-w-40 items-center gap-2 ps-1">
					{Icon && <Icon className="size-3.5" />}
					{name}
				</span>
			)
		},
	},
	{
		accessorKey: "value",
		enableSorting: false,
		header: () => (
			<Button variant="ghost">
				<Trans>Value</Trans>
			</Button>
		),
		cell: ({ row }) => <span className="ps-2 tabular-nums">{alertValueLabel(row.original)}</span>,
	},
	{
		id: "severity",
		accessorFn: (record) => alertSeverity(record),
		enableSorting: true,
		header: ({ column }) => (
			<Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
				级别
			</Button>
		),
		cell: ({ row }) => (
			<Badge
				variant={alertSeverity(row.original) === "critical" ? "danger" : "warning"}
				className="pointer-events-none"
			>
				{alertSeverityLabel(row.original)}
			</Badge>
		),
	},
	{
		accessorKey: "state",
		enableSorting: true,
		sortingFn: (rowA, rowB) => (rowA.original.resolved ? 1 : 0) - (rowB.original.resolved ? 1 : 0),
		header: ({ column }) => (
			<Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
				<Trans comment="Context: alert state (active or resolved)">State</Trans>
			</Button>
		),
		cell: ({ row }) => {
			const resolved = Boolean(row.original.resolved)
			const silenced = alertIsSilenced(row.original)
			const acknowledged = alertIsAcknowledged(row.original)
			return (
				<Badge
					variant={resolved ? "success" : silenced ? "secondary" : acknowledged ? "outline" : "danger"}
					className={cn("pointer-events-none", resolved && "opacity-85")}
					title={silenced ? `静默至 ${alertSilencedUntilLabel(row.original)}` : undefined}
				>
					{alertStateLabel(row.original)}
				</Badge>
			)
		},
	},
	{
		accessorKey: "created",
		accessorFn: (record) => alertCreatedLabel(record),
		enableSorting: true,
		invertSorting: true,
		header: ({ column }) => (
			<Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
				<Trans comment="Context: date created">Created</Trans>
			</Button>
		),
		cell: ({ getValue, row }) => (
			<span className="ps-1 tabular-nums tracking-tight" title={`${row.original.created} UTC`}>
				{getValue() as string}
			</span>
		),
	},
	{
		accessorKey: "resolved",
		enableSorting: true,
		invertSorting: true,
		header: ({ column }) => (
			<Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
				<Trans>Resolved</Trans>
			</Button>
		),
		cell: ({ row }) =>
			row.original.resolved ? (
				<span className="ps-1 tabular-nums tracking-tight" title={`${row.original.resolved} UTC`}>
					{alertResolvedLabel(row.original)}
				</span>
			) : null,
	},
	{
		accessorKey: "duration",
		invertSorting: true,
		enableSorting: true,
		sortingFn: (rowA, rowB) => {
			const aCreated = new Date(rowA.original.created)
			const bCreated = new Date(rowB.original.created)
			const aResolved = rowA.original.resolved ? new Date(rowA.original.resolved) : null
			const bResolved = rowB.original.resolved ? new Date(rowB.original.resolved) : null
			const aDuration = aResolved ? aResolved.getTime() - aCreated.getTime() : null
			const bDuration = bResolved ? bResolved.getTime() - bCreated.getTime() : null
			if (!aDuration && bDuration) return -1
			if (aDuration && !bDuration) return 1
			return (aDuration || 0) - (bDuration || 0)
		},
		header: ({ column }) => (
			<Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
				<Trans>Duration</Trans>
			</Button>
		),
		cell: ({ row }) => {
			const duration = alertDurationLabel(row.original)
			return duration === "进行中" ? null : <span className="ps-2">{duration}</span>
		},
	},
]
