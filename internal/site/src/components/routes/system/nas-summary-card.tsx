import { BoxIcon, DatabaseIcon, HardDriveIcon, ServerIcon } from "lucide-react"
import type { ElementType } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn, decimalString } from "@/lib/utils"
import type { ChartData, SystemRecord, SystemStatsRecord } from "@/types"
import {
	formatStorageDetail,
	formatStoragePercent,
	getNasSummaryViewModel,
	getStorageColor,
	shouldShowNasSummary,
} from "./nas-summary-utils"

export { shouldShowNasSummary }

type NasSummaryCardProps = {
	system: SystemRecord
	systemStats: SystemStatsRecord[]
	containerData: ChartData["containerData"]
	hasContainers: boolean
	maybeHasSmartData: boolean
}

export default function NasSummaryCard({
	systemStats,
	containerData,
	hasContainers,
	maybeHasSmartData,
}: NasSummaryCardProps) {
	const { storageItem, highestStoragePct, storageBadgeVariant, containerValue, containerDetail } =
		getNasSummaryViewModel({ systemStats, containerData, hasContainers })
	const storageBadgeText =
		highestStoragePct === undefined
			? "存储暂无数据"
			: `存储最高 ${decimalString(highestStoragePct, highestStoragePct >= 10 ? 1 : 2)}%`

	const smartValue = maybeHasSmartData ? "有数据" : "未采集"
	const smartDetail = maybeHasSmartData ? "来自真实 SMART 设备记录" : "未发现可用 SMART 设备"

	return (
		<Card className="overflow-hidden border-border/70 bg-surface-soft shadow-none">
			<CardHeader className="gap-3 border-b border-border/70 bg-surface-soft px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between">
				<div className="min-w-0">
					<CardTitle className="flex items-center gap-2 text-base">
						<ServerIcon className="size-4" />
						NAS 摘要
					</CardTitle>
					<p className="mt-1 text-sm text-muted-foreground">只展示 NAS 字段明确标记后的存储、容器和硬盘健康摘要。</p>
				</div>
				<Badge variant={storageBadgeVariant}>{storageBadgeText}</Badge>
			</CardHeader>
			<CardContent className="grid gap-3 p-3 sm:p-4">
				<div className="grid gap-3 md:grid-cols-3">
					<SummaryMetric
						icon={HardDriveIcon}
						label="存储"
						value={formatStoragePercent(storageItem.percent)}
						detail={formatStorageDetail(storageItem.usedGb, storageItem.totalGb)}
					/>
					<SummaryMetric icon={BoxIcon} label="容器" value={containerValue} detail={containerDetail} />
					<SummaryMetric icon={DatabaseIcon} label="S.M.A.R.T." value={smartValue} detail={smartDetail} />
				</div>

				<StorageRow
					name={storageItem.name}
					usedGb={storageItem.usedGb}
					totalGb={storageItem.totalGb}
					percent={storageItem.percent}
				/>
			</CardContent>
		</Card>
	)
}

function SummaryMetric({
	icon: Icon,
	label,
	value,
	detail,
}: {
	icon: ElementType
	label: string
	value: string
	detail: string
}) {
	return (
		<div className="rounded-md border border-border/70 bg-card px-3 py-2.5 shadow-none">
			<div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
				<Icon className="size-4" />
				{label}
			</div>
			<div className="text-xl font-semibold tabular-nums">{value}</div>
			<div className="mt-1 truncate text-xs text-muted-foreground">{detail}</div>
		</div>
	)
}

function StorageRow({
	name,
	usedGb,
	totalGb,
	percent,
}: {
	name: string
	usedGb?: number
	totalGb?: number
	percent?: number
}) {
	const clampedPercent = percent === undefined ? 0 : Math.min(Math.max(percent, 0), 100)
	return (
		<div className="grid gap-2 rounded-md border border-border/70 bg-card p-3 shadow-none sm:grid-cols-[minmax(0,1fr)_120px] sm:items-center">
			<div className="min-w-0">
				<div className="flex items-center justify-between gap-3">
					<div className="truncate text-sm font-medium">{name}</div>
					<div className="shrink-0 text-sm tabular-nums text-muted-foreground">{formatStoragePercent(percent)}</div>
				</div>
				<div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-soft">
					<div
						className={cn(
							"h-full rounded-full",
							percent === undefined ? "bg-surface-strong" : getStorageColor(percent)
						)}
						style={{ width: `${clampedPercent}%` }}
					/>
				</div>
			</div>
			<div className="text-sm tabular-nums text-muted-foreground sm:text-right">
				{formatStorageDetail(usedGb, totalGb)}
			</div>
		</div>
	)
}
