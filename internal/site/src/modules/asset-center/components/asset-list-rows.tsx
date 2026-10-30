import { cn } from "@/lib/utils"
import { getAssetModelDisplay } from "../asset-profile-summary"
import { getAssetTypeLabel, getStatusLabel } from "../asset-schema"
import type { AssetRecord } from "@/types"
import { getAssetIpLabel } from "./asset-card"

export function AssetListRows({
	assets,
	activeAssetId,
	onSelect,
}: {
	assets: AssetRecord[]
	activeAssetId?: string
	onSelect: (id: string) => void
}) {
	return (
		<div className="min-w-0">
			<div className="hidden h-8 items-center gap-3 border-b border-border/60 bg-surface-soft px-3 text-[10px] font-medium uppercase tracking-wide text-muted-foreground md:flex">
				<span className="w-2.5 shrink-0" />
				<span className="min-w-0 flex-1">名称</span>
				<span className="hidden w-24 shrink-0 lg:block xl:w-28 2xl:w-40">型号</span>
				<span className="w-14 shrink-0">编号</span>
				<span className="hidden w-20 shrink-0 xl:block">类型</span>
				<span className="hidden w-24 shrink-0 lg:block">位置</span>
				<span className="hidden w-28 shrink-0 md:block">IP</span>
				<span className="hidden w-32 shrink-0 2xl:block">MAC</span>
			</div>
			<div className="divide-y divide-border/50">
				{assets.map((asset) => {
					const active = asset.id === activeAssetId
					return (
						<button
							key={asset.id}
							type="button"
							onClick={() => onSelect(asset.id)}
							aria-current={active ? "true" : undefined}
							className={cn(
								"flex h-12 w-full min-w-0 items-center gap-3 border-l-2 px-3 text-left transition-colors",
								active ? "border-l-primary bg-primary/5" : "border-l-transparent hover:bg-surface-soft"
							)}
						>
							<AssetStatusDot status={asset.status || "active"} />
							<span className="min-w-0 flex-1">
								<span className="block truncate text-sm font-semibold text-foreground" title={asset.name}>
									{asset.name}
								</span>
								<span className="mt-0.5 block truncate text-[11px] text-muted-foreground md:hidden">
									{getAssetTypeLabel(asset.type)}
									{asset.management_ip ? ` · ${asset.management_ip}` : ""}
								</span>
							</span>
							<span
								className="hidden w-24 shrink-0 truncate text-xs text-muted-foreground lg:block xl:w-28 2xl:w-40"
								title={getAssetModelDisplay(asset) || "未填写型号"}
							>
								{getAssetModelDisplay(asset) || "—"}
							</span>
							<span className="w-14 shrink-0 truncate font-mono text-[11px] tabular-nums text-muted-foreground">
								{getAssetTag(asset) || "未编号"}
							</span>
							<span className="hidden w-20 shrink-0 xl:block">
								<span
									className="inline-flex max-w-full truncate rounded border border-border/70 bg-surface-soft px-1.5 py-0.5 text-[10px] text-muted-foreground"
									title={getAssetTypeLabel(asset.type)}
								>
									{getAssetTypeLabel(asset.type)}
								</span>
							</span>
							<span className="hidden w-24 shrink-0 truncate text-xs text-muted-foreground lg:block">
								{asset.location?.trim() || "未填写位置"}
							</span>
							<span className="hidden w-28 shrink-0 truncate font-mono text-xs tabular-nums text-foreground md:block">
								{getAssetIpLabel(asset)}
							</span>
							<span className="hidden w-32 shrink-0 truncate font-mono text-[11px] tabular-nums text-muted-foreground 2xl:block">
								{getAssetMac(asset) || "—"}
							</span>
						</button>
					)
				})}
			</div>
		</div>
	)
}

function getAssetTag(asset: AssetRecord) {
	const value = asset.metadata?.asset_tag
	return typeof value === "string" ? value.trim() : ""
}

function getAssetMac(asset: AssetRecord) {
	const mac = asset.metadata?.mac
	if (typeof mac === "string" && mac.trim()) return mac.trim()
	const fallback = asset.metadata?.mac_address
	return typeof fallback === "string" ? fallback.trim() : ""
}

function AssetStatusDot({ status }: { status: AssetRecord["status"] }) {
	const tone =
		status === "active"
			? "bg-emerald-500"
			: status === "planned"
				? "bg-sky-500"
				: status === "retired"
					? "bg-amber-500"
					: "bg-zinc-400"
	return <span className={cn("size-2.5 shrink-0 rounded-full", tone)} title={getStatusLabel(status || "active")} />
}

export function AssetListSkeleton() {
	return (
		<div className="grid gap-1 p-3">
			{Array.from({ length: 6 }, (_, index) => (
				<div key={index} className="flex h-12 items-center gap-3 rounded-md px-2">
					<span className="size-2.5 animate-pulse rounded-full bg-surface-soft" />
					<span className="h-3.5 w-40 animate-pulse rounded bg-surface-soft" />
					<span className="ms-auto h-3 w-16 animate-pulse rounded bg-surface-soft" />
					<span className="h-3 w-24 animate-pulse rounded bg-surface-soft" />
				</div>
			))}
		</div>
	)
}
