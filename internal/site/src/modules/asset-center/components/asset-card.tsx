import {
	BoxIcon,
	CctvIcon,
	ChevronRightIcon,
	Edit3Icon,
	Globe2Icon,
	LaptopIcon,
	ListChecksIcon,
	MonitorIcon,
	NetworkIcon,
	RouterIcon,
	ServerIcon,
	ShieldIcon,
	SmartphoneIcon,
	Trash2Icon,
	WifiIcon,
} from "lucide-react"
import type { ReactNode } from "react"
import { getPagePath } from "@nanostores/router"
import { $router, Link } from "@/components/router"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { isAgentMonitorableAsset, isWebsiteMonitorableAsset } from "@/modules/asset-center/asset-list"
import {
	getAssetCompleteness,
	getAssetSummaryRows,
	getAssetTypeLabel,
	getAssetWarrantyStatus,
	getInternetBandwidthLabel,
	getMetadataNumber,
	getMetadataString,
	getStatusLabel,
	type AssetLifecycleTone,
} from "@/modules/asset-center/asset-schema"
import type { AssetRecord, AssetStatus, AssetType } from "@/types"

export type AssetCardProps = {
	asset: AssetRecord
	parent?: AssetRecord
	monitored: boolean
	maintenanceCount: number
	readOnly: boolean
	selected: boolean
	onSelect: (selected: boolean) => void
	onIdentify?: () => void
	identifying?: boolean
	onEdit: () => void
	onDelete: () => void
}

export type AssetListItemProps = {
	asset: AssetRecord
	parent?: AssetRecord
	monitored: boolean
	maintenanceCount: number
	active: boolean
	onActivate: () => void
}

export function AssetListItem({ asset, parent, monitored, maintenanceCount, active, onActivate }: AssetListItemProps) {
	const Icon = getAssetIcon(asset.type)
	const completeness = getAssetCompleteness(asset)
	const warranty = getAssetWarrantyStatus(asset)
	const identity = getAssetIdentityLabel(asset)
	const location = asset.location || getMetadataString(asset.metadata, "room") || "未填写位置"
	const ip = getAssetIpLabel(asset)
	const network = getAssetNetworkLabel(asset)
	const assetTag = getMetadataString(asset.metadata, "asset_tag")
	const assetTagLabel = assetTag || "未编号"
	const color = getMetadataString(asset.metadata, "color") || getMetadataString(asset.metadata, "device_color")
	const detailHref = getPagePath($router, "asset", { id: asset.id })

	return (
		<div
			className={cn(
				"group grid grid-cols-[minmax(0,1fr)_2.75rem] border-b border-border/60 transition-colors last:border-b-0 hover:bg-surface-soft/70",
				active && "bg-primary/5"
			)}
		>
			<button
				type="button"
				onClick={onActivate}
				className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)] items-center gap-3 px-3 py-2.5 text-left sm:grid-cols-[minmax(4.75rem,.42fr)_minmax(12rem,1.25fr)] md:grid-cols-[minmax(5rem,.42fr)_minmax(12rem,1.25fr)_minmax(7.5rem,.72fr)_minmax(8rem,.72fr)_minmax(8rem,.82fr)_minmax(5.5rem,.55fr)]"
			>
				<AssetLedgerCell className="hidden sm:grid" label="编号" value={assetTagLabel} mono={Boolean(assetTag)} />
				<div className="flex min-w-0 items-center gap-2.5">
					<span className="grid size-8 shrink-0 place-items-center rounded-md border border-border/70 bg-card text-muted-foreground">
						<Icon className="size-4" />
					</span>
					<span className="min-w-0">
						<span className="flex min-w-0 items-center gap-2">
							<span className="shrink-0 rounded-md border border-border/70 bg-card px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground sm:hidden">
								{assetTagLabel}
							</span>
							<span className="truncate text-sm font-semibold text-foreground">{asset.name}</span>
							<StatusDot status={asset.status || "active"} />
						</span>
						<span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
							<span className="shrink-0">{getAssetTypeLabel(asset.type)}</span>
							<span className="min-w-0 truncate">{identity}</span>
						</span>
					</span>
				</div>
				<AssetLedgerCell className="hidden md:grid" label="位置" value={location} />
				<AssetLedgerCell className="hidden md:grid" label="IP" value={ip} mono={ip !== "未填写"} />
				<AssetLedgerCell className="hidden md:grid" label="接入网络" value={network} />
				<div className="hidden min-w-0 justify-items-end gap-1 md:grid">
					<div className="flex min-w-0 justify-end gap-1">
						{monitored && <AssetCardMetaTag tone="ok">监控</AssetCardMetaTag>}
						<AssetCardMetaTag tone={completeness.tone}>{completeness.score}%</AssetCardMetaTag>
					</div>
					<div className="max-w-28 truncate text-[11px] text-muted-foreground">
						{color ||
							(parent ? `归属 ${parent.name}` : maintenanceCount > 0 ? `维护 ${maintenanceCount}` : warranty.label)}
					</div>
				</div>
			</button>
			<Link
				href={detailHref}
				className="grid min-h-full place-items-center border-l border-border/60 text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
				aria-label={`查看 ${asset.name} 详情`}
			>
				<ChevronRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
			</Link>
		</div>
	)
}

export type AssetPreviewPanelProps = {
	asset?: AssetRecord
	parent?: AssetRecord
	monitored: boolean
	maintenanceCount: number
	readOnly: boolean
}

export function AssetPreviewPanel({ asset, parent, monitored, maintenanceCount, readOnly }: AssetPreviewPanelProps) {
	if (!asset) {
		return (
			<div className="grid min-h-[24rem] place-items-center rounded-lg border border-dashed border-border/70 bg-card p-6 text-center">
				<div>
					<div className="text-sm font-medium text-foreground">选择左侧资产</div>
					<div className="mt-1 text-sm text-muted-foreground">右侧会显示关键档案和下一步入口。</div>
				</div>
			</div>
		)
	}

	const Icon = getAssetIcon(asset.type)
	const detailHref = getPagePath($router, "asset", { id: asset.id })
	const summaryRows = getAssetSummaryRows(asset)
		.filter((row) => !hiddenPreviewSummaryLabels.has(row.label))
		.slice(0, 3)
	const completeness = getAssetCompleteness(asset)
	const warranty = getAssetWarrantyStatus(asset)
	const assetTag = getMetadataString(asset.metadata, "asset_tag")
	const mac = getMetadataString(asset.metadata, "mac")
	const color = getMetadataString(asset.metadata, "color") || getMetadataString(asset.metadata, "device_color")
	const profileRows = [
		asset.role ? { label: "用途", value: asset.role } : undefined,
		assetTag ? { label: "编号", value: assetTag, mono: true } : undefined,
		color ? { label: "颜色", value: color } : undefined,
		mac ? { label: "MAC", value: mac, mono: true } : undefined,
		parent ? { label: "归属", value: parent.name } : undefined,
		...summaryRows,
	].filter(Boolean) as { label: string; value: string; mono?: boolean }[]
	const connectionHref = isAgentMonitorableAsset(asset)
		? `${getPagePath($router, "clients")}?asset=${encodeURIComponent(asset.id)}`
		: isWebsiteMonitorableAsset(asset)
			? `${getPagePath($router, "websites")}?asset=${encodeURIComponent(asset.id)}&add=1`
			: ""

	return (
		<aside className="sticky top-4 grid max-h-[calc(100vh-7rem)] min-h-[24rem] content-start gap-3 overflow-y-auto rounded-lg border border-border/70 bg-card p-4 shadow-none">
			<div className="flex min-w-0 items-start gap-3">
				<div className="grid size-11 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft text-muted-foreground">
					<Icon className="size-5" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex min-w-0 items-center gap-2">
						<h2 className="truncate text-lg font-semibold tracking-[-0.02em] text-foreground">{asset.name}</h2>
						<StatusDot status={asset.status || "active"} />
					</div>
					<div className="mt-1 truncate text-xs text-muted-foreground">当前选中资产</div>
				</div>
				<Button asChild variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 px-2.5">
					<Link href={detailHref}>
						<span className="sr-only">查看详情</span>
						<ChevronRightIcon className="size-3.5" />
					</Link>
				</Button>
			</div>

			<div className="grid gap-2 rounded-md border border-border/70 bg-surface-soft p-3">
				<div className="flex items-center justify-between gap-3">
					<div className="min-w-0">
						<div className="text-xs font-medium text-foreground">{completeness.label}</div>
						<div className="mt-0.5 text-[11px] text-muted-foreground">资料完整度</div>
					</div>
					<div className="font-mono text-lg font-semibold tabular-nums text-foreground">{completeness.score}%</div>
				</div>
				<div className="h-1.5 overflow-hidden rounded-full bg-card">
					<div
						className={cn(
							"h-full rounded-full",
							completeness.tone === "danger"
								? "bg-red-500"
								: completeness.tone === "warning"
									? "bg-amber-500"
									: completeness.tone === "ok"
										? "bg-emerald-500"
										: "bg-muted-foreground/45"
						)}
						style={{ width: `${completeness.score}%` }}
					/>
				</div>
				{completeness.missing.length > 0 && (
					<div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
						待补：{completeness.missing.slice(0, 3).join("、")}
						{completeness.missing.length > 3 ? ` 等 ${completeness.missing.length} 项` : ""}
					</div>
				)}
			</div>

			<div className="grid gap-2">
				{profileRows.length > 0 ? (
					profileRows.map((row) => <InfoRow key={row.label} label={row.label} value={row.value} mono={row.mono} />)
				) : (
					<div className="rounded-md border border-border/70 bg-surface-soft px-3 py-2 text-sm text-muted-foreground">
						暂无额外档案
					</div>
				)}
			</div>

			<div className="flex flex-wrap gap-1.5">
				{monitored && <AssetCardMetaTag tone="ok">已监控</AssetCardMetaTag>}
				<AssetCardMetaTag tone={warranty.tone}>{warranty.label}</AssetCardMetaTag>
				{maintenanceCount > 0 && <AssetCardMetaTag>维护 {maintenanceCount}</AssetCardMetaTag>}
			</div>

			{connectionHref && !monitored && !readOnly && (
				<div className="grid gap-2 border-t border-border/70 pt-3">
					<Button asChild variant="outline" className="justify-start gap-2">
						<Link href={connectionHref}>接入监控</Link>
					</Button>
				</div>
			)}
		</aside>
	)
}

const hiddenPreviewSummaryLabels = new Set(["类型", "状态", "型号", "位置", "IPv4", "固定 IP", "管理 IP", "IP", "接入", "公网"])

function AssetLedgerCell({
	label,
	value,
	mono,
	className,
}: {
	label: string
	value: string
	mono?: boolean
	className?: string
}) {
	return (
		<span className={cn("min-w-0 content-center", className)}>
			<span className="block text-[11px] text-muted-foreground">{label}</span>
			<span className={cn("block truncate text-xs text-foreground", mono && "font-mono tabular-nums")}>{value}</span>
		</span>
	)
}

export function getAssetIpLabel(asset: AssetRecord) {
	const metadata = asset.metadata
	return (
		getMetadataString(metadata, "fixed_ipv4") ||
		asset.management_ip ||
		getMetadataString(metadata, "public_ipv4") ||
		getMetadataString(metadata, "url") ||
		getMetadataString(metadata, "internal_url") ||
		"未填写"
	)
}

export function getAssetNetworkLabel(asset: AssetRecord) {
	const metadata = asset.metadata
	if (asset.type === "internet") {
		return getInternetBandwidthLabel(asset) || getMetadataString(metadata, "access_mode") || "宽带入口"
	}
	const connection = getConnectionLabel(getMetadataString(metadata, "connection_type"))
	const wifi = getMetadataString(metadata, "ssid_note") || getMetadataString(metadata, "wifi_standard")
	const speed =
		formatMbps(getMetadataNumber(metadata, "primary_nic_speed_mbps")) ||
		formatMbps(getMetadataNumber(metadata, "default_port_speed_mbps"))
	const vlan = getMetadataString(metadata, "vlan_note")
	return [connection, wifi, speed, vlan].filter(Boolean).slice(0, 2).join(" · ") || "未填写"
}

function getAssetIdentityLabel(asset: AssetRecord) {
	const internalModel = getMetadataString(asset.metadata, "internal_model")
	return [asset.vendor, asset.model, internalModel].filter(Boolean).join(" · ") || "未填写型号"
}

function getConnectionLabel(value: string) {
	if (value === "ethernet") return "有线"
	if (value === "wifi") return "无线"
	if (value === "both") return "有线 + 无线"
	return ""
}

function formatMbps(value?: number) {
	if (!value) return ""
	if (value >= 1000) return `${Number.isInteger(value / 1000) ? value / 1000 : (value / 1000).toFixed(1)}G`
	return `${value}M`
}

export function AssetCard({
	asset,
	parent,
	monitored,
	maintenanceCount,
	readOnly,
	selected,
	onSelect,
	onIdentify,
	identifying,
	onEdit,
	onDelete,
}: AssetCardProps) {
	const Icon = getAssetIcon(asset.type)
	const summaryRows = getAssetSummaryRows(asset).slice(0, 4)
	const detailHref = getPagePath($router, "asset", { id: asset.id })
	const warranty = getAssetWarrantyStatus(asset)
	const completeness = getAssetCompleteness(asset)
	const visibleTags = [
		...(monitored ? [{ key: "monitor", label: "已监控", tone: "ok" as AssetLifecycleTone }] : []),
		{ key: "profile", label: completeness.label, tone: completeness.tone },
		{ key: "warranty", label: warranty.label, tone: warranty.tone },
	]
	return (
		<div
			className={cn(
				"group flex min-h-[13.5rem] flex-col rounded-lg border bg-card p-3 shadow-none transition-[border-color,background-color] hover:border-border hover:bg-surface-soft/70",
				selected ? "border-primary/45 bg-primary/5" : "border-border/70"
			)}
		>
			<div className="flex items-start gap-3">
				<Checkbox
					checked={selected}
					onCheckedChange={(checked) => onSelect(checked === true)}
					className="mt-2 shrink-0"
					aria-label={`选择资产 ${asset.name}`}
				/>
				<div className="grid size-10 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft text-muted-foreground">
					<Icon className="size-5" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex min-w-0 items-center gap-2">
						<Link href={detailHref} className="truncate font-semibold text-foreground hover:text-primary">
							{asset.name}
						</Link>
						<StatusDot status={asset.status || "active"} />
					</div>
					<div className="mt-1 flex flex-wrap items-center gap-1.5">
						<Badge variant="secondary" className="rounded-md">
							{getAssetTypeLabel(asset.type)}
						</Badge>
						{visibleTags.map((tag) => (
							<AssetCardMetaTag key={tag.key} tone={tag.tone}>
								{tag.label}
							</AssetCardMetaTag>
						))}
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-1">
					<Button
						variant="ghost"
						size="icon"
						className="size-9"
						onClick={onEdit}
						disabled={readOnly}
						aria-label="编辑资产"
					>
						<Edit3Icon className="size-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="size-9"
						onClick={onDelete}
						disabled={readOnly}
						aria-label="删除资产"
					>
						<Trash2Icon className="size-4" />
					</Button>
				</div>
			</div>
			<div className="mt-3 grid flex-1 content-start gap-2 text-sm text-muted-foreground">
				<div className="grid gap-1">
					<div className="flex items-center justify-between gap-3 text-xs">
						<span>资料完整度</span>
						<span className="font-mono text-foreground tabular-nums">{completeness.score}%</span>
					</div>
					<div className="h-1.5 overflow-hidden rounded-full bg-surface-soft">
						<div
							className={cn(
								"h-full rounded-full",
								completeness.tone === "danger"
									? "bg-red-500"
									: completeness.tone === "warning"
										? "bg-amber-500"
										: completeness.tone === "ok"
											? "bg-emerald-500"
											: "bg-muted-foreground/45"
							)}
							style={{ width: `${completeness.score}%` }}
						/>
					</div>
					{completeness.missing.length > 0 && (
						<div className="truncate text-xs text-muted-foreground">
							待补：{completeness.missing.slice(0, 3).join("、")}
							{completeness.missing.length > 3 ? ` 等 ${completeness.missing.length} 项` : ""}
						</div>
					)}
				</div>
				{summaryRows.length > 0 ? (
					summaryRows.map((row) => <InfoRow key={row.label} label={row.label} value={row.value} mono={row.mono} />)
				) : (
					<div className="text-sm text-muted-foreground">未填写关键参数</div>
				)}
				<div className="flex flex-wrap gap-1.5">
					{maintenanceCount > 0 && <AssetCardMetaTag>维护 {maintenanceCount}</AssetCardMetaTag>}
					{asset.role && <AssetCardMetaTag>{asset.role}</AssetCardMetaTag>}
					{parent && <AssetCardMetaTag>宿主: {parent.name}</AssetCardMetaTag>}
				</div>
				<div className="mt-auto flex items-center justify-between border-t border-border/70 pt-2">
					<span className="text-xs">{getStatusLabel(asset.status || "active")}</span>
					<div className="flex items-center gap-3 text-xs font-medium">
						{onIdentify && !readOnly && (
							<button
								type="button"
								onClick={onIdentify}
								disabled={identifying}
								className="inline-flex items-center gap-1 text-primary hover:underline disabled:pointer-events-none disabled:text-muted-foreground"
							>
								<ListChecksIcon className="size-3.5" />
								{identifying ? "识别中" : "智能识别"}
							</button>
						)}
						<Link href={detailHref} className="text-primary hover:underline">
							查看档案
						</Link>
						{monitored ? (
							<span className="text-muted-foreground">已接入</span>
						) : isAgentMonitorableAsset(asset) ? (
							<Link
								href={`${getPagePath($router, "clients")}?asset=${encodeURIComponent(asset.id)}`}
								className="text-primary hover:underline"
							>
								接入监控
							</Link>
						) : isWebsiteMonitorableAsset(asset) ? (
							<Link
								href={`${getPagePath($router, "websites")}?asset=${encodeURIComponent(asset.id)}&add=1`}
								className="text-primary hover:underline"
							>
								接入监控
							</Link>
						) : (
							<span className="text-muted-foreground">{getInternetBandwidthLabel(asset) || "基础资产"}</span>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
	return (
		<div className="flex min-w-0 items-center justify-between gap-3">
			<span className="shrink-0 text-xs">{label}</span>
			<span className={cn("truncate text-foreground", mono && "font-mono tabular-nums")}>{value}</span>
		</div>
	)
}

function AssetCardMetaTag({ children, tone = "neutral" }: { children: ReactNode; tone?: AssetLifecycleTone }) {
	return (
		<span
			className={cn(
				"rounded-md border px-1.5 py-0.5 text-[11px]",
				tone === "danger"
					? "border-red-200 bg-red-50 text-red-700"
					: tone === "warning"
						? "border-amber-200 bg-amber-50 text-amber-700"
						: tone === "ok"
							? "border-emerald-200 bg-emerald-50 text-emerald-700"
							: "border-border/70 bg-card text-muted-foreground"
			)}
		>
			{children}
		</span>
	)
}

function StatusDot({ status }: { status: AssetStatus }) {
	return (
		<span
			className={cn(
				"size-2 rounded-full",
				status === "active" ? "bg-emerald-500" : status === "planned" ? "bg-amber-500" : "bg-muted-foreground/45"
			)}
		/>
	)
}

export function getAssetIcon(type: AssetType) {
	switch (type) {
		case "internet":
			return Globe2Icon
		case "router":
		case "gateway":
		case "ont":
			return RouterIcon
		case "switch":
			return NetworkIcon
		case "ap":
			return WifiIcon
		case "firewall":
			return ShieldIcon
		case "nas":
		case "server":
			return ServerIcon
		case "mini_pc":
		case "physical_host":
		case "vm":
		case "game_console":
		case "handheld":
		case "tv":
			return MonitorIcon
		case "phone":
		case "tablet":
		case "wearable":
		case "ebook":
			return SmartphoneIcon
		case "camera":
			return CctvIcon
		case "web_endpoint":
			return Globe2Icon
		case "printer":
			return LaptopIcon
		case "smarthome_gateway":
			return WifiIcon
		case "ups":
		case "sensor":
		case "light":
		case "plug":
		case "lock":
		case "vacuum":
		case "speaker":
		case "iot":
			return BoxIcon
		default:
			return BoxIcon
	}
}
