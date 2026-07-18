import { PencilIcon, PlusIcon, StarIcon, Trash2Icon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatAssetInterfaceKind, formatAssetInterfaceSpeed } from "@/modules/asset-center/asset-interface-display"
import type { AssetInterfaceRecord } from "@/types"

export type AssetInterfaceManagerProps = {
	interfaces: AssetInterfaceRecord[]
	readOnly: boolean
	compact?: boolean
	onAdd: () => void
	onEdit: (record: AssetInterfaceRecord) => void
	onDelete: (record: AssetInterfaceRecord) => void
}

export function AssetInterfaceManager({
	interfaces,
	readOnly,
	compact = false,
	onAdd,
	onEdit,
	onDelete,
}: AssetInterfaceManagerProps) {
	return (
		<div className="grid gap-2.5">
			<div className="flex items-center justify-between gap-3">
				<div className="min-w-0">
					<div className="text-sm font-semibold text-foreground">网卡</div>
					<div className="text-xs text-muted-foreground">网络接入方式、网卡速率与当前接入状态</div>
				</div>
				{readOnly ? null : (
					<Button type="button" variant="outline" size="sm" className="h-8 min-h-8 shrink-0" onClick={onAdd}>
						<PlusIcon data-icon="inline-start" />
						添加网卡
					</Button>
				)}
			</div>

			{interfaces.length === 0 ? (
				<div className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
					暂无网卡信息
				</div>
			) : (
				<div className="grid gap-2">
					{interfaces.map((record) => (
						<AssetInterfaceRow
							key={record.id}
							record={record}
							readOnly={readOnly}
							compact={compact}
							onEdit={onEdit}
							onDelete={onDelete}
						/>
					))}
				</div>
			)}
		</div>
	)
}

function AssetInterfaceRow({
	record,
	readOnly,
	compact,
	onEdit,
	onDelete,
}: {
	record: AssetInterfaceRecord
	readOnly: boolean
	compact: boolean
	onEdit: (record: AssetInterfaceRecord) => void
	onDelete: (record: AssetInterfaceRecord) => void
}) {
	const addressSummary = [record.ipv4, record.ipv6, record.mac].filter(Boolean).join(" · ")

	return (
		<div className="grid gap-2 rounded-md border border-border/70 bg-card p-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
			<div className="min-w-0">
				<div className="flex min-w-0 flex-wrap items-center gap-1.5">
					<span className="truncate text-sm font-medium text-foreground">{record.name || "未命名网卡"}</span>
					<Badge variant="secondary">{formatAssetInterfaceKind(record.kind)}</Badge>
					<Badge variant="outline">
						网卡速率 {record.speed_mbps ? formatAssetInterfaceSpeed(record.speed_mbps) : "未填"}
					</Badge>
					{record.connected ? <Badge variant="success">当前接入</Badge> : null}
					{record.primary ? (
						<Tooltip>
							<TooltipTrigger asChild>
								<Badge variant="warning" aria-label="主接口">
									<StarIcon className="fill-current" />
									主接口
								</Badge>
							</TooltipTrigger>
							<TooltipContent>资产的首选网络接口</TooltipContent>
						</Tooltip>
					) : null}
				</div>
				{compact || !addressSummary ? null : (
					<div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{addressSummary}</div>
				)}
			</div>

			{readOnly ? null : (
				<div className="grid grid-cols-2 gap-1.5">
					<Button type="button" variant="outline" size="sm" className="h-8 min-h-8" onClick={() => onEdit(record)}>
						<PencilIcon data-icon="inline-start" />
						编辑
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="h-8 min-h-8 text-destructive hover:text-destructive"
						onClick={() => onDelete(record)}
					>
						<Trash2Icon data-icon="inline-start" />
						删除
					</Button>
				</div>
			)}
		</div>
	)
}
