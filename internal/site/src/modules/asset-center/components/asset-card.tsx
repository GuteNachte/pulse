import {
	BoxIcon,
	CloudIcon,
	CctvIcon,
	CreditCardIcon,
	Globe2Icon,
	LaptopIcon,
	MonitorIcon,
	PlugIcon,
	NetworkIcon,
	RouterIcon,
	ServerIcon,
	ShieldIcon,
	SmartphoneIcon,
	WifiIcon,
} from "lucide-react"
import { useEffect, useState } from "react"
import { getPagePath } from "@nanostores/router"
import { $router, Link } from "@/components/router"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { getAssetTypeLabel, getMetadataString, getStatusLabel } from "@/modules/asset-center/asset-schema"
import type { AssetMonitorState, AssetRecord, AssetStatus, AssetType } from "@/types"
import { pb } from "@/lib/api"

export type AssetPreviewPanelProps = {
	asset?: AssetRecord
	monitored: boolean
	monitorState?: AssetMonitorState
}

function MonitorStateBadge({ state }: { state: AssetMonitorState }) {
	const label =
		state === "healthy"
			? "监控正常"
			: state === "error"
				? "监控异常"
				: state === "pending"
					? "待接入"
					: state === "paused"
						? "已暂停"
						: state === "unbound"
							? "未接入"
							: "暂不支持"
	const tone =
		state === "healthy"
			? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
			: state === "error"
				? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
				: state === "pending"
					? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300"
					: state === "paused"
						? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
						: "border-border/70 bg-surface-soft text-muted-foreground"
	return <span className={cn("inline-flex items-center rounded border px-1.5 py-0.5 text-[10px]", tone)}>{label}</span>
}

// 2026-10-19 资产中心方案：右侧栏只做快速预览——120px 封面 + 名称/状态 + 编号/类型/IP/位置，
// 编辑、删除和完整参数都留在单独的资产详情页。
export function AssetPreviewPanel({ asset, monitored, monitorState }: AssetPreviewPanelProps) {
	// 封面图（入库即封面的首张图；无图回退类型图标）
	const [coverObjectUrl, setCoverObjectUrl] = useState<string | null>(null)
	const assetId = asset?.id
	useEffect(() => {
		if (!assetId) return
		let active = true
		let objectURL = ""
		setCoverObjectUrl(null)
		const load = async () => {
			try {
				const media = await pb.send<{
					versions: { id: string }[]
					placements: { id: string; version: string; role: string; visible?: boolean }[]
				}>(`/api/pulse/assets/${assetId}/media`, { method: "GET", requestKey: null })
				const versionIds = new Set(media.versions.map((item) => item.id))
				const cover = media.placements.find(
					(item) => item.role === "cover" && item.visible !== false && versionIds.has(item.version)
				)
				if (!cover || !active) return
				const response = await fetch(`/api/pulse/asset-media/object?version=${cover.version}`, {
					headers: { Authorization: pb.authStore.token },
				})
				if (!response.ok || !active) return
				const blob = await response.blob()
				if (!active) return
				objectURL = URL.createObjectURL(blob)
				setCoverObjectUrl(objectURL)
			} catch (error) {
				console.warn("load asset cover", error)
			}
		}
		load()
		return () => {
			active = false
			if (objectURL) URL.revokeObjectURL(objectURL)
		}
	}, [assetId])

	if (!asset) {
		return (
			<aside className="grid min-h-[24rem] place-items-center rounded-lg border border-dashed border-border/70 bg-card p-6 text-center">
				<div>
					<div className="text-sm font-medium text-foreground">选择左侧资产</div>
					<div className="mt-1 text-sm text-muted-foreground">这里会显示封面和关键信息。</div>
				</div>
			</aside>
		)
	}

	const Icon = getAssetIcon(asset.type)
	const detailHref = getPagePath($router, "asset", { id: asset.id })
	const assetTag = getMetadataString(asset.metadata, "asset_tag")
	const location = asset.location?.trim() || "未填写位置"
	const ip = getAssetIpLabel(asset)

	return (
		<aside className="grid content-start gap-3 rounded-lg border border-border/70 bg-card p-4 shadow-none xl:sticky xl:top-3 xl:self-start xl:max-h-[calc(100dvh-7rem)] xl:overflow-y-auto">
			<div
				data-testid="asset-preview-cover"
				className="relative grid aspect-video place-items-center overflow-hidden rounded-lg border border-border/70 bg-black"
			>
				{coverObjectUrl ? (
					<img src={coverObjectUrl} alt={`${asset.name} 封面`} className="absolute inset-0 size-full object-contain" />
				) : (
					<Icon className="size-8 text-muted-foreground/70" />
				)}
			</div>

			<div className="grid gap-1">
				<div className="flex min-w-0 items-center gap-2">
					<h2 className="truncate text-lg font-semibold text-foreground">{asset.name}</h2>
					<StatusDot status={asset.status || "active"} />
				</div>
				<div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
					<span>{getStatusLabel(asset.status || "active")}</span>
					{monitorState ? (
						<MonitorStateBadge state={monitorState} />
					) : monitored ? (
						<span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
							已监控
						</span>
					) : null}
				</div>
			</div>

			<div className="grid gap-1.5 border-t border-border/70 pt-2 text-xs">
				<PreviewRow label="编号" value={assetTag || "未编号"} mono />
				<PreviewRow label="类型" value={asset.type === "internet" ? "宽带接入" : getAssetTypeLabel(asset.type)} />
				<PreviewRow label="IP" value={ip} mono />
				<PreviewRow label="位置" value={location} />
			</div>

			<Button asChild variant="outline" size="sm" className="h-8 w-full">
				<Link href={detailHref}>查看完整详情</Link>
			</Button>
		</aside>
	)
}

function PreviewRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
	return (
		<div className="flex min-w-0 items-center justify-between gap-3">
			<span className="shrink-0 text-muted-foreground">{label}</span>
			<span className={cn("truncate text-right text-foreground", mono && "font-mono tabular-nums")}>{value}</span>
		</div>
	)
}

export function getAssetIpLabel(asset: AssetRecord) {
	const metadata = asset.metadata
	if (asset.type === "internet") return getMetadataString(metadata, "public_ipv4") || "未获取"
	return (
		getMetadataString(metadata, "fixed_ipv4") ||
		asset.management_ip ||
		getMetadataString(metadata, "public_ipv4") ||
		getMetadataString(metadata, "url") ||
		getMetadataString(metadata, "internal_url") ||
		"未填写"
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
		case "smart_ont":
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
		case "domain_name":
			return Globe2Icon
		case "subscription":
			return CreditCardIcon
		case "cloud_host":
			return CloudIcon
		case "printer":
			return LaptopIcon
		case "smarthome_gateway":
			return WifiIcon
		case "ups":
		case "sensor":
		case "light":
		case "plug":
		case "smart_switch":
			return PlugIcon
		case "lock":
		case "vacuum":
		case "speaker":
		case "iot":
			return BoxIcon
		default:
			return BoxIcon
	}
}
