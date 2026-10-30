import { BoxesIcon, MapPinIcon, SearchIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { ASSET_TYPE_GROUPS } from "../asset-numbering"
import { STATUS_OPTIONS } from "../asset-schema"
import { LOOSE_LOCATION_FILTER, type AssetMonitorFilter } from "../asset-list"
import type { AssetMonitorState, AssetRecord, AssetStatus } from "@/types"

const MONITOR_STATE_ROWS: { state: AssetMonitorState; label: string; dotClass: string }[] = [
	{ state: "healthy", label: "正常", dotClass: "bg-emerald-500" },
	{ state: "error", label: "异常", dotClass: "bg-red-500" },
	{ state: "pending", label: "待接入", dotClass: "bg-sky-500" },
	{ state: "paused", label: "已暂停", dotClass: "bg-amber-500" },
	{ state: "unbound", label: "未接入", dotClass: "bg-zinc-400" },
	{ state: "unsupported", label: "暂不支持", dotClass: "bg-zinc-600" },
]

type Props = {
	assets: AssetRecord[]
	monitorStateByAsset: Map<string, AssetMonitorState>
	search: string
	onSearchChange: (value: string) => void
	statusFilter: AssetStatus | "all"
	onStatusChange: (value: AssetStatus | "all") => void
	monitorFilter: AssetMonitorFilter
	onMonitorChange: (value: AssetMonitorFilter) => void
	typeGroupFilter: string
	onTypeGroupChange: (value: string) => void
	locationFilter: string
	onLocationChange: (value: string) => void
	looseLocationAssetCount: number
	className?: string
}

export function AssetCenterSidebar({
	assets,
	monitorStateByAsset,
	search,
	onSearchChange,
	statusFilter,
	onStatusChange,
	monitorFilter,
	onMonitorChange,
	typeGroupFilter,
	onTypeGroupChange,
	locationFilter,
	onLocationChange,
	looseLocationAssetCount,
	className,
}: Props) {
	const monitorStateCounts = (["healthy", "error", "pending", "paused", "unbound", "unsupported"] as const).map(
		(state) => ({
			state,
			count: assets.filter((asset) => (monitorStateByAsset.get(asset.id) ?? "unsupported") === state).length,
		})
	)
	const statusCounts = STATUS_OPTIONS.map((option) => ({
		...option,
		count: assets.filter((asset) => (asset.status || "active") === option.value).length,
	})).filter((option) => option.count > 0)
	const typeGroupCounts = ASSET_TYPE_GROUPS.map((group) => ({
		...group,
		count: assets.filter((asset) => {
			const assetType = asset.type
			return group.typeValues.includes(assetType)
		}).length,
	})).filter((group) => group.count > 0)
	const locationCounts = buildLocationCounts(assets, looseLocationAssetCount)
	const hasFilters =
		search.trim() !== "" ||
		statusFilter !== "all" ||
		monitorFilter !== "all" ||
		typeGroupFilter !== "all" ||
		locationFilter !== "all"

	return (
		<aside className={cn("grid content-start gap-3 rounded-lg border border-border/70 bg-card p-3", className)}>
			<div className="relative">
				<SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
				<Input
					value={search}
					onChange={(event) => onSearchChange(event.target.value)}
					placeholder="搜索名称、IP、型号"
					className="h-8 ps-8 text-xs"
				/>
			</div>

			<SidebarSection title="资产">
				<FilterRow
					icon={<BoxesIcon className="size-3.5" />}
					label="全部资产"
					count={assets.length}
					active={
						statusFilter === "all" && monitorFilter === "all" && typeGroupFilter === "all" && locationFilter === "all"
					}
					onClick={() => {
						onStatusChange("all")
						onMonitorChange("all")
						onTypeGroupChange("all")
						onLocationChange("all")
					}}
				/>
			</SidebarSection>

			<SidebarSection title="监控状态">
				{MONITOR_STATE_ROWS.map((row) => (
					<FilterRow
						key={row.state}
						icon={<span className={cn("size-2 rounded-full", row.dotClass)} />}
						label={row.label}
						count={monitorStateCounts.find((item) => item.state === row.state)?.count ?? 0}
						active={monitorFilter === row.state}
						onClick={() => onMonitorChange(monitorFilter === row.state ? "all" : row.state)}
					/>
				))}
			</SidebarSection>

			{statusCounts.length > 0 && (
				<SidebarSection title="状态">
					{statusCounts.map((option) => (
						<FilterRow
							key={option.value}
							icon={<StatusDot status={option.value} />}
							label={option.label}
							count={option.count}
							active={statusFilter === option.value}
							onClick={() => onStatusChange(statusFilter === option.value ? "all" : option.value)}
						/>
					))}
				</SidebarSection>
			)}

			{locationCounts.length > 0 && (
				<SidebarSection title="按位置">
					{locationCounts.map((item) => (
						<FilterRow
							key={item.value}
							icon={
								item.value === LOOSE_LOCATION_FILTER ? (
									<span className="size-2 rounded-full bg-amber-500" />
								) : (
									<MapPinIcon className="size-3.5" />
								)
							}
							label={item.label}
							count={item.count}
							active={locationFilter === item.value}
							onClick={() => onLocationChange(locationFilter === item.value ? "all" : item.value)}
						/>
					))}
				</SidebarSection>
			)}

			{typeGroupCounts.length > 0 && (
				<SidebarSection title="按类型">
					{typeGroupCounts.map((group) => (
						<FilterRow
							key={group.code}
							label={group.label}
							count={group.count}
							active={typeGroupFilter === group.code}
							onClick={() => onTypeGroupChange(typeGroupFilter === group.code ? "all" : group.code)}
						/>
					))}
				</SidebarSection>
			)}

			{hasFilters && (
				<button
					type="button"
					onClick={() => {
						onSearchChange("")
						onStatusChange("all")
						onMonitorChange("all")
						onTypeGroupChange("all")
						onLocationChange("all")
					}}
					className="rounded-md border border-border/70 bg-surface-soft px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
				>
					清除筛选
				</button>
			)}
		</aside>
	)
}

function SidebarSection({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="grid gap-1 border-t border-border/60 pt-2 first:border-t-0 first:pt-0">
			<div className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
			{children}
		</section>
	)
}

function FilterRow({
	icon,
	label,
	count,
	active,
	onClick,
}: {
	icon?: ReactNode
	label: string
	count: number
	active: boolean
	onClick: () => void
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex h-8 min-w-0 items-center gap-2 rounded-md px-2 text-left text-xs transition-colors",
				active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-surface-soft hover:text-foreground"
			)}
		>
			{icon ? <span className="grid size-4 shrink-0 place-items-center">{icon}</span> : null}
			<span className="min-w-0 flex-1 truncate">{label}</span>
			<span className="shrink-0 font-mono text-[10px] tabular-nums">{count}</span>
		</button>
	)
}

function StatusDot({ status }: { status: AssetStatus }) {
	const tone =
		status === "active"
			? "bg-emerald-500"
			: status === "planned"
				? "bg-sky-500"
				: status === "retired"
					? "bg-amber-500"
					: "bg-zinc-400"
	return <span className={cn("size-2 rounded-full", tone)} />
}

function buildLocationCounts(assets: AssetRecord[], looseLocationAssetCount: number) {
	const counts = new Map<string, number>()
	for (const asset of assets) {
		const location = asset.location?.trim() || ""
		const key = location ? location.split(" / ")[0] : "__empty__"
		counts.set(key, (counts.get(key) ?? 0) + 1)
	}
	const rows = [...counts.entries()]
		.map(([value, count]) => ({
			value,
			count,
			label: value === "__empty__" ? "未填写位置" : value,
		}))
		.sort((left, right) => left.label.localeCompare(right.label, "zh-CN"))
	if (looseLocationAssetCount > 0) {
		rows.unshift({ value: LOOSE_LOCATION_FILTER, count: looseLocationAssetCount, label: "待归档资产" })
	}
	return rows
}
