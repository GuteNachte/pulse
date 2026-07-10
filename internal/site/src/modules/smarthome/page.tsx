import { getPagePath } from "@nanostores/router"
import {
	BatteryIcon,
	BotIcon,
	HousePlugIcon,
	LampIcon,
	LightbulbIcon,
	LockIcon,
	PlugIcon,
	SearchIcon,
	WifiIcon,
} from "lucide-react"
import { memo, useEffect, useMemo, useState, type ComponentType, type ReactNode, type SVGProps } from "react"
import { $router, Link } from "@/components/router"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/use-toast"
import { isPocketBaseAutoCancel, pb } from "@/lib/api"
import { pageTitle } from "@/lib/branding"
import { cn } from "@/lib/utils"
import {
	SMART_HOME_ASSET_TYPES,
	buildAssetSearchText,
	getAssetTypeLabel,
	getMetadataString,
	getStatusLabel,
} from "@/modules/asset-center/asset-schema"
import type { AssetRecord, AssetRelationRecord, AssetStatus, AssetType } from "@/types"

type ViewMode = "room" | "type" | "gateway"

const ALL_VALUE = "__all__"
const UNSET_VALUE = "__unset__"

export default memo(function SmarthomePage() {
	const [assets, setAssets] = useState<AssetRecord[]>([])
	const [relations, setRelations] = useState<AssetRelationRecord[]>([])
	const [loading, setLoading] = useState(true)
	const [search, setSearch] = useState("")
	const [typeFilter, setTypeFilter] = useState<AssetType | typeof ALL_VALUE>(ALL_VALUE)
	const [roomFilter, setRoomFilter] = useState(ALL_VALUE)
	const [gatewayFilter, setGatewayFilter] = useState(ALL_VALUE)
	const [statusFilter, setStatusFilter] = useState<AssetStatus | typeof ALL_VALUE>(ALL_VALUE)
	const [viewMode, setViewMode] = useState<ViewMode>("room")

	useEffect(() => {
		document.title = pageTitle("智能家居")
		loadAssets()
	}, [])

	async function loadAssets() {
		setLoading(true)
		try {
			const [records, relationRecords] = await Promise.all([
				pb.collection<AssetRecord>("assets").getFullList({
					sort: "location,name",
					requestKey: null,
				}),
				pb.collection<AssetRelationRecord>("asset_relations").getFullList({
					sort: "kind,created",
					requestKey: null,
				}),
			])
			setAssets(records.filter((asset) => SMART_HOME_ASSET_TYPES.includes(asset.type)))
			setRelations(relationRecords)
		} catch (error) {
			if (!isPocketBaseAutoCancel(error)) {
				console.error("load smarthome assets", error)
				toast({ title: "智能家居资产读取失败", description: "请检查资产中心集合和登录权限。", variant: "destructive" })
			}
		} finally {
			setLoading(false)
		}
	}

	const rooms = useMemo(() => uniqueSorted(assets.map(getAssetRoom).filter(Boolean)), [assets])
	const gatewayByAsset = useMemo(() => buildGatewayMap(assets, relations), [assets, relations])
	const gateways = useMemo(
		() => uniqueSorted(assets.map((asset) => getGatewayLabel(asset, gatewayByAsset)).filter(Boolean)),
		[assets, gatewayByAsset]
	)
	const stats = useMemo(() => buildStats(assets, gatewayByAsset), [assets, gatewayByAsset])
	const filteredAssets = useMemo(() => {
		const keyword = search.trim().toLowerCase()
		return assets.filter((asset) => {
			if (typeFilter !== ALL_VALUE && asset.type !== typeFilter) return false
			if (statusFilter !== ALL_VALUE && (asset.status || "active") !== statusFilter) return false
			const room = getAssetRoom(asset)
			if (roomFilter === UNSET_VALUE && room) return false
			if (roomFilter !== ALL_VALUE && roomFilter !== UNSET_VALUE && room !== roomFilter) return false
			const gateway = getGatewayLabel(asset, gatewayByAsset)
			if (gatewayFilter === UNSET_VALUE && gateway) return false
			if (gatewayFilter !== ALL_VALUE && gatewayFilter !== UNSET_VALUE && gateway !== gatewayFilter) return false
			if (!keyword) return true
			return buildAssetSearchText(asset).includes(keyword)
		})
	}, [assets, gatewayByAsset, gatewayFilter, roomFilter, search, statusFilter, typeFilter])
	const groupedAssets = useMemo(
		() => groupAssets(filteredAssets, viewMode, gatewayByAsset),
		[filteredAssets, gatewayByAsset, viewMode]
	)
	const hasActiveFilters =
		search.trim() ||
		typeFilter !== ALL_VALUE ||
		roomFilter !== ALL_VALUE ||
		gatewayFilter !== ALL_VALUE ||
		statusFilter !== ALL_VALUE

	function resetFilters() {
		setSearch("")
		setTypeFilter(ALL_VALUE)
		setRoomFilter(ALL_VALUE)
		setGatewayFilter(ALL_VALUE)
		setStatusFilter(ALL_VALUE)
	}

	return (
		<div className="grid gap-4">
			<section className="rounded-lg border border-border/70 bg-card p-2 shadow-none">
				<div className="grid gap-4 rounded-md bg-surface-soft p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
					<div className="flex min-w-0 items-center gap-3">
						<div className="grid size-10 shrink-0 place-items-center rounded-md border border-border/70 bg-card text-muted-foreground">
							<HousePlugIcon className="size-5" strokeWidth={1.9} />
						</div>
						<div className="min-w-0">
							<h1 className="truncate text-2xl font-semibold tracking-[-0.03em] text-foreground">智能家居</h1>
							<p className="mt-1 text-sm text-muted-foreground">按房间、类型和网关查看资产中心里的智能家居档案</p>
						</div>
					</div>
					<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:min-w-[48rem] lg:grid-cols-7">
						<SummaryPill label="设备" value={stats.total} />
						<SummaryPill label="网关" value={stats.gateways} />
						<SummaryPill label="房间" value={stats.rooms} />
						<SummaryPill label="关系" value={stats.linked} />
						<SummaryPill label="实体 ID" value={stats.entities} />
						<SummaryPill label="电池" value={stats.battery} />
						<SummaryPill label="在用" value={stats.active} />
					</div>
				</div>
			</section>

			<Card className="overflow-hidden border-border/70 bg-card shadow-none">
				<CardHeader className="border-b border-border/70 bg-surface-soft px-4 py-3">
					<div className="grid gap-3">
						<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
							<CardTitle className="text-lg tracking-[-0.02em]">家居资产</CardTitle>
							<div className="inline-flex w-fit rounded-md border border-border/70 bg-card p-1">
								<ViewButton active={viewMode === "room"} onClick={() => setViewMode("room")}>
									房间
								</ViewButton>
								<ViewButton active={viewMode === "type"} onClick={() => setViewMode("type")}>
									类型
								</ViewButton>
								<ViewButton active={viewMode === "gateway"} onClick={() => setViewMode("gateway")}>
									网关
								</ViewButton>
							</div>
						</div>
						<div className="grid gap-2 lg:grid-cols-[minmax(16rem,1fr)_repeat(4,minmax(9rem,auto))_auto] lg:items-center">
							<div className="relative min-w-0">
								<SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									value={search}
									onChange={(event) => setSearch(event.target.value)}
									placeholder="搜索名称、房间、实体 ID、网关"
									className="ps-9"
								/>
							</div>
							<select
								value={typeFilter}
								onChange={(event) => setTypeFilter(event.target.value as AssetType | typeof ALL_VALUE)}
								className={selectClassName}
							>
								<option value={ALL_VALUE}>全部类型</option>
								{SMART_HOME_ASSET_TYPES.map((type) => (
									<option key={type} value={type}>
										{getAssetTypeLabel(type)}
									</option>
								))}
							</select>
							<select
								value={roomFilter}
								onChange={(event) => setRoomFilter(event.target.value)}
								className={selectClassName}
							>
								<option value={ALL_VALUE}>全部房间</option>
								{rooms.map((room) => (
									<option key={room} value={room}>
										{room}
									</option>
								))}
								<option value={UNSET_VALUE}>未填写房间</option>
							</select>
							<select
								value={gatewayFilter}
								onChange={(event) => setGatewayFilter(event.target.value)}
								className={selectClassName}
							>
								<option value={ALL_VALUE}>全部网关</option>
								{gateways.map((gateway) => (
									<option key={gateway} value={gateway}>
										{gateway}
									</option>
								))}
								<option value={UNSET_VALUE}>未填写网关</option>
							</select>
							<select
								value={statusFilter}
								onChange={(event) => setStatusFilter(event.target.value as AssetStatus | typeof ALL_VALUE)}
								className={selectClassName}
							>
								<option value={ALL_VALUE}>全部状态</option>
								<option value="active">在用</option>
								<option value="planned">规划</option>
								<option value="inactive">停用</option>
								<option value="retired">退役</option>
							</select>
							<Button variant="outline" onClick={resetFilters} disabled={!hasActiveFilters}>
								清除筛选
							</Button>
						</div>
					</div>
				</CardHeader>
				<CardContent className="p-4">
					{loading ? (
						<EmptyState loading loadingText="正在读取智能家居资产" emptyText="暂无智能家居资产" />
					) : assets.length === 0 ? (
						<EmptyState
							loading={false}
							loadingText="正在读取智能家居资产"
							emptyText="暂无智能家居资产"
							description="先在资产中心添加智能家居网关、灯具、插座、传感器、门锁或扫地机器人。"
						>
							<Button asChild size="sm">
								<Link href={getPagePath($router, "assets")}>打开资产中心</Link>
							</Button>
						</EmptyState>
					) : filteredAssets.length === 0 ? (
						<EmptyState loading={false} loadingText="正在筛选" emptyText="暂无匹配设备">
							<Button variant="outline" size="sm" onClick={resetFilters}>
								清除筛选
							</Button>
						</EmptyState>
					) : (
						<div className="grid gap-4">
							{groupedAssets.map((group) => (
								<section key={group.name} className="grid gap-2">
									<div className="flex min-w-0 items-center justify-between gap-3">
										<div className="min-w-0 truncate text-sm font-medium text-foreground">{group.name}</div>
										<Badge variant="secondary" className="rounded-md">
											{group.assets.length} 个
										</Badge>
									</div>
									<div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
										{group.assets.map((asset) => (
											<SmarthomeAssetCard key={asset.id} asset={asset} gateway={gatewayByAsset.get(asset.id)} />
										))}
									</div>
								</section>
							))}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	)
})

function SmarthomeAssetCard({ asset, gateway }: { asset: AssetRecord; gateway?: GatewayResolution }) {
	const Icon = getSmartHomeIcon(asset.type)
	const detailHref = getPagePath($router, "asset", { id: asset.id })
	const room = getAssetRoom(asset)
	const protocol = getMetadataString(asset.metadata, "protocol")
	const gatewayLabel = gateway?.name || getMetadataString(asset.metadata, "gateway_name")
	const entityId = getMetadataString(asset.metadata, "entity_id")
	const powerMode = getMetadataString(asset.metadata, "power_mode")
	const batteryType = getMetadataString(asset.metadata, "battery_type")
	const status = asset.status || "active"
	return (
		<Link
			href={detailHref}
			className="group grid min-h-[13rem] rounded-lg border border-border/70 bg-card p-3 shadow-none transition-[border-color,background-color] hover:border-border hover:bg-surface-soft/70"
		>
			<div className="flex min-w-0 items-start gap-3">
				<div className="grid size-10 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft text-muted-foreground">
					<Icon className="size-5" strokeWidth={1.9} />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex min-w-0 items-center gap-2">
						<div className="truncate font-semibold text-foreground group-hover:text-primary">{asset.name}</div>
						<StatusDot status={status} />
					</div>
					<div className="mt-1 flex flex-wrap gap-1.5">
						<MetaTag>{getAssetTypeLabel(asset.type)}</MetaTag>
						{room ? <MetaTag>{room}</MetaTag> : <MetaTag tone="muted">未填房间</MetaTag>}
						<MetaTag tone={status === "active" ? "ok" : "muted"}>{getStatusLabel(status)}</MetaTag>
					</div>
				</div>
			</div>

			<div className="mt-3 grid gap-2 text-sm text-muted-foreground">
				<InfoRow label="协议" value={protocol || "未填写"} />
				<InfoRow label="网关" value={gatewayLabel || "未绑定"} />
				<InfoRow label="供电" value={[powerMode, batteryType].filter(Boolean).join(" / ") || "未填写"} />
				<InfoRow label="实体" value={entityId || "未填写"} mono />
			</div>

			<div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/70 pt-2">
				{asset.vendor && <MetaTag>{asset.vendor}</MetaTag>}
				{asset.model && <MetaTag>{asset.model}</MetaTag>}
				{gateway?.source === "relation" && <MetaTag tone="ok">关系已绑定</MetaTag>}
				{asset.management_ip && <MetaTag mono>{asset.management_ip}</MetaTag>}
				{!asset.vendor && !asset.model && !asset.management_ip && (
					<span className="text-xs text-muted-foreground">查看完整档案</span>
				)}
			</div>
		</Link>
	)
}

function SummaryPill({ label, value }: { label: string; value: number }) {
	return (
		<div className="rounded-md border border-border/70 bg-card px-3 py-2">
			<div className="text-xs text-muted-foreground">{label}</div>
			<div className="mt-1 font-mono text-lg font-semibold tabular-nums">{value}</div>
		</div>
	)
}

function ViewButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"min-h-8 rounded px-3 text-sm transition-colors",
				active ? "bg-surface-soft text-foreground ring-1 ring-border" : "text-muted-foreground hover:bg-surface-soft/70"
			)}
		>
			{children}
		</button>
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

function MetaTag({
	children,
	tone = "neutral",
	mono,
}: {
	children: ReactNode
	tone?: "neutral" | "muted" | "ok"
	mono?: boolean
}) {
	return (
		<span
			className={cn(
				"rounded-md border px-1.5 py-0.5 text-[11px]",
				tone === "ok"
					? "border-emerald-200 bg-emerald-50 text-emerald-700"
					: tone === "muted"
						? "border-border/70 bg-surface-soft text-muted-foreground"
						: "border-border/70 bg-card text-muted-foreground",
				mono && "font-mono tabular-nums"
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
				"size-2 shrink-0 rounded-full",
				status === "active" ? "bg-emerald-500" : status === "planned" ? "bg-amber-500" : "bg-muted-foreground/45"
			)}
		/>
	)
}

type GatewayResolution = {
	name: string
	source: "relation" | "metadata"
	relationKind?: AssetRelationRecord["kind"]
}

function buildStats(assets: AssetRecord[], gatewayByAsset: Map<string, GatewayResolution | undefined>) {
	return {
		total: assets.length,
		gateways: assets.filter((asset) => asset.type === "smarthome_gateway").length,
		rooms: new Set(assets.map(getAssetRoom).filter(Boolean)).size,
		entities: assets.filter((asset) => getMetadataString(asset.metadata, "entity_id")).length,
		linked: assets.filter((asset) => gatewayByAsset.get(asset.id)?.source === "relation").length,
		battery: assets.filter((asset) => {
			const power = getMetadataString(asset.metadata, "power_mode")
			const battery = getMetadataString(asset.metadata, "battery_type")
			return power.includes("电池") || Boolean(battery)
		}).length,
		active: assets.filter((asset) => (asset.status || "active") === "active").length,
	}
}

function groupAssets(
	assets: AssetRecord[],
	mode: ViewMode,
	gatewayByAsset: Map<string, GatewayResolution | undefined>
) {
	const groups = new Map<string, AssetRecord[]>()
	for (const asset of assets) {
		const name = getGroupName(asset, mode, gatewayByAsset)
		groups.set(name, [...(groups.get(name) ?? []), asset])
	}
	return [...groups.entries()]
		.sort(([a], [b]) => a.localeCompare(b, "zh-CN"))
		.map(([name, groupAssets]) => ({
			name,
			assets: groupAssets.sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
		}))
}

function getGroupName(asset: AssetRecord, mode: ViewMode, gatewayByAsset: Map<string, GatewayResolution | undefined>) {
	if (mode === "type") return getAssetTypeLabel(asset.type)
	if (mode === "gateway") return getGatewayLabel(asset, gatewayByAsset) || "未填写网关"
	return getAssetRoom(asset) || "未填写房间"
}

function buildGatewayMap(assets: AssetRecord[], relations: AssetRelationRecord[]) {
	const assetMap = new Map(assets.map((asset) => [asset.id, asset]))
	const gatewayByAsset = new Map<string, GatewayResolution | undefined>()
	for (const asset of assets) {
		if (asset.type === "smarthome_gateway") {
			gatewayByAsset.set(asset.id, { name: asset.name, source: "relation" })
			continue
		}
		const relatedGateway = findRelatedGateway(asset, assetMap, relations)
		if (relatedGateway) {
			gatewayByAsset.set(asset.id, relatedGateway)
			continue
		}
		const metadataGateway = getMetadataString(asset.metadata, "gateway_name")
		if (metadataGateway) {
			gatewayByAsset.set(asset.id, { name: metadataGateway, source: "metadata" })
		}
	}
	return gatewayByAsset
}

function findRelatedGateway(
	asset: AssetRecord,
	assetMap: Map<string, AssetRecord>,
	relations: AssetRelationRecord[]
): GatewayResolution | undefined {
	const candidates = relations
		.filter((relation) => relation.source_asset === asset.id || relation.target_asset === asset.id)
		.map((relation) => {
			const peerId = relation.source_asset === asset.id ? relation.target_asset : relation.source_asset
			const peer = assetMap.get(peerId)
			return peer?.type === "smarthome_gateway"
				? {
						peer,
						relation,
						score: getGatewayRelationScore(relation.kind),
					}
				: undefined
		})
		.filter((item): item is { peer: AssetRecord; relation: AssetRelationRecord; score: number } => Boolean(item))
		.sort((a, b) => b.score - a.score || a.peer.name.localeCompare(b.peer.name, "zh-CN"))
	const best = candidates[0]
	return best ? { name: best.peer.name, source: "relation", relationKind: best.relation.kind } : undefined
}

function getGatewayRelationScore(kind: AssetRelationRecord["kind"]) {
	switch (kind) {
		case "connected_to":
			return 40
		case "depends_on":
			return 30
		case "owns":
			return 20
		case "located_in":
			return 10
		default:
			return 0
	}
}

function getGatewayLabel(asset: AssetRecord, gatewayByAsset: Map<string, GatewayResolution | undefined>) {
	return gatewayByAsset.get(asset.id)?.name || getMetadataString(asset.metadata, "gateway_name")
}

function getAssetRoom(asset: AssetRecord) {
	return getMetadataString(asset.metadata, "room") || asset.location || ""
}

function uniqueSorted(values: string[]) {
	return [...new Set(values)].sort((a, b) => a.localeCompare(b, "zh-CN"))
}

function getSmartHomeIcon(type: AssetType): ComponentType<SVGProps<SVGSVGElement>> {
	switch (type) {
		case "smarthome_gateway":
			return WifiIcon
		case "sensor":
			return BatteryIcon
		case "light":
			return LightbulbIcon
		case "plug":
			return PlugIcon
		case "lock":
			return LockIcon
		case "vacuum":
			return BotIcon
		case "iot":
			return HousePlugIcon
		default:
			return LampIcon
	}
}

const selectClassName =
	"h-10 min-w-0 rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-ring/70 focus:ring-2 focus:ring-ring/15"
