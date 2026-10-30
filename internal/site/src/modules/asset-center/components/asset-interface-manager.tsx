import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
	formatAssetInterfaceKind,
	formatAssetInterfaceSpeed,
	isAssetInterfaceEnabled,
} from "@/modules/asset-center/asset-interface-display"
import { getMetadataString } from "@/modules/asset-center/asset-schema"
import type { AssetInterfaceRecord, AssetType } from "@/types"

export type AssetInterfaceManagerProps = {
	interfaces: AssetInterfaceRecord[]
	readOnly: boolean
	compact?: boolean
	assetType?: AssetType
	onAdd: () => void
	onEdit: (record: AssetInterfaceRecord) => void
	onDelete: (record: AssetInterfaceRecord) => void
}

export function AssetInterfaceManager({
	interfaces,
	readOnly,
	compact = false,
	assetType,
	onAdd,
	onEdit,
	onDelete,
}: AssetInterfaceManagerProps) {
	const isSwitch = assetType === "switch"
	return (
		<div className="grid pulse-card-gap">
			<div className="flex items-center justify-between gap-3">
				<div className="min-w-0">
					<div className="text-sm font-semibold text-foreground">{isSwitch ? "接口" : "网卡"}</div>
					<div className="text-xs text-muted-foreground">
						{isSwitch ? "端口能力、协商速率与当前接线状态" : "网络接入方式、网卡速率与当前接入状态"}
					</div>
				</div>
				{readOnly ? null : (
					<Button type="button" variant="outline" size="sm" className="h-8 min-h-8 shrink-0" onClick={onAdd}>
						<PlusIcon data-icon="inline-start" />
						{isSwitch ? "添加接口" : "添加网卡"}
					</Button>
				)}
			</div>

			{interfaces.length === 0 ? (
				<div className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
					{isSwitch ? "暂无接口信息" : "暂无网卡信息"}
				</div>
			) : (
				<div className="grid gap-2">
					{interfaces.map((record) => (
						<AssetInterfaceRow
							key={record.id}
							record={record}
							readOnly={readOnly}
							compact={compact}
							assetType={assetType}
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
	assetType,
	onEdit,
	onDelete,
}: {
	record: AssetInterfaceRecord
	readOnly: boolean
	compact: boolean
	assetType?: AssetType
	onEdit: (record: AssetInterfaceRecord) => void
	onDelete: (record: AssetInterfaceRecord) => void
}) {
	const addressSummary = [record.ipv4, record.ipv6, record.mac].filter(Boolean).join(" · ")
	const connectionNote = getMetadataString(record.metadata, "connection_note")
	const enabled = isAssetInterfaceEnabled(record)
	const isSwitch = assetType === "switch"
	const role = getMetadataString(record.metadata, "role")
	const negotiatedSpeed = Number(record.metadata?.negotiated_speed_mbps)
	const wifiStandard = getMetadataString(record.metadata, "wifi_standard")
	const wifiBand = getMetadataString(record.metadata, "band")
	const accessSpec =
		record.kind === "wifi"
			? [wifiStandard || "Wi-Fi 制式待确认", wifiBand || "频段待确认"]
			: `${record.speed_mbps ? formatAssetInterfaceSpeed(record.speed_mbps) : "速率待确认"}`
	const summary = [
		formatAssetInterfaceKind(record.kind),
		...(Array.isArray(accessSpec) ? accessSpec : [accessSpec]),
		isSwitch && ["uplink", "downlink", "general"].includes(role)
			? role === "uplink"
				? "上联"
				: role === "downlink"
					? "下联"
					: "通用"
			: "",
		isSwitch && Number.isFinite(negotiatedSpeed) && negotiatedSpeed > 0
			? `协商 ${formatAssetInterfaceSpeed(negotiatedSpeed)}`
			: "",
		enabled ? "启用" : "未启用",
		record.connected ? "已接入" : "未接入",
	]
		.filter(Boolean)
		.join(" · ")

	return (
		<div className="grid gap-2 rounded-md border border-border/70 bg-card p-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
			<div className="min-w-0">
				<div className="flex min-w-0 flex-wrap items-center gap-1.5">
					<span className="truncate text-sm font-medium text-foreground">{record.name || "未命名网卡"}</span>
					<span className="truncate text-xs text-muted-foreground">{summary}</span>
				</div>
				{compact || !addressSummary ? null : (
					<div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{addressSummary}</div>
				)}
				{connectionNote ? <div className="mt-1 text-xs text-muted-foreground">{connectionNote}</div> : null}
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
