import { getPagePath } from "@nanostores/router"
import { CableIcon } from "lucide-react"
import { $router, Link } from "@/components/router"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { AssetInterfaceRecord, AssetRecord, AssetRelationRecord } from "@/types"
import { getMetadataString } from "../asset-schema"

// 2026-10-20 用户《Pulse 网络连接中心设计方案》：连接从顶部按钮改成右栏「网络连接」卡片。
// 查看态为 7 列接口表格；编辑态由卡片右上角「编辑」进入连接管理（接口 + 对端连接，双向同步沿用资产关系）。
type NetworkConnectionRow = {
	key: string
	name: string
	type: string
	speed: string
	protocol: string
	peer: string
	peerHref?: string
	media: string
	connected: boolean
}

const interfaceKindLabels: Record<string, string> = {
	ethernet: "电口",
	wifi: "无线",
	pon: "光口",
	optical: "光口",
	wan: "WAN",
	lan: "LAN",
	management: "管理口",
	virtual: "虚拟口",
	power: "电源口",
	usb: "USB",
	video: "视频口",
	custom: "自定义",
}

const linkKindLabels: Record<string, string> = {
	ethernet: "网线",
	fiber: "光纤",
	wifi: "Wi-Fi",
	internet: "外网接入",
	custom: "其他",
}

const accessTechnologyLabels: Record<string, string> = {
	ftth: "光纤（FTTH）",
	dedicated_line: "专线",
	mobile: "移动网络",
}

function text(value: unknown) {
	return typeof value === "string" ? value.trim() : ""
}

function formatSpeed(speed?: number) {
	if (!speed || speed <= 0) return ""
	if (speed >= 1000) return `${(speed / 1000).toFixed(speed % 1000 === 0 ? 0 : 1)} Gbps`
	return `${speed} Mbps`
}

function protocolFor(asset: AssetRecord, record: AssetInterfaceRecord) {
	const explicit = text(record.metadata?.protocol)
	if (explicit) return explicit
	if (record.kind === "wifi") return getMetadataString(asset.metadata, "wifi_standard") || "Wi-Fi"
	if (record.kind === "pon") return getMetadataString(asset.metadata, "pon_standard") || "PON"
	if (record.kind === "optical") return "光纤"
	if (["ethernet", "wan", "lan", "management"].includes(record.kind)) return "以太网"
	if (record.kind === "virtual") return "虚拟"
	return "—"
}

// 同一接口可能有多条连接（典型：路由器 Wi-Fi 同时接多台手机/智能设备）。
// 卡片按关系逐条成行，避免只显示第一条而对端设备看起来漏填。
function relationsForInterface(asset: AssetRecord, record: AssetInterfaceRecord, relations: AssetRelationRecord[]) {
	const matched: AssetRelationRecord[] = []
	for (const relation of relations) {
		if (relation.kind !== "connected_to") continue
		if (relation.source_asset !== asset.id && relation.target_asset !== asset.id) continue
		if (relation.metadata?.source_interface !== record.id && relation.metadata?.target_interface !== record.id) continue
		if (!matched.includes(relation)) matched.push(relation)
	}
	return matched
}

function peerDetails(
	asset: AssetRecord,
	relation: AssetRelationRecord,
	assetsById: Map<string, AssetRecord>,
	allInterfacesById: Map<string, AssetInterfaceRecord>
) {
	const peerId = relation.source_asset === asset.id ? relation.target_asset : relation.source_asset
	const peerIsSource = peerId === relation.source_asset
	// 详情页只加载当前资产，对端名称来自关系查询的 expand；扩展缺失时再回退资产列表。
	const expandedPeer = relation.expand?.[peerIsSource ? "source_asset" : "target_asset"] as AssetRecord | undefined
	const peerName = assetsById.get(peerId)?.name ?? expandedPeer?.name ?? "未知资产"
	const peerInterfaceId = text(relation.metadata?.[peerIsSource ? "source_interface" : "target_interface"])
	const peerInterfaceLabel = text(
		relation.metadata?.[peerIsSource ? "source_interface_label" : "target_interface_label"]
	)
	const peerInterfaceName = peerInterfaceId
		? allInterfacesById.get(peerInterfaceId)?.name || peerInterfaceLabel
		: peerInterfaceLabel
	return {
		peer: peerInterfaceName ? `${peerName} · ${peerInterfaceName}` : peerName,
		peerHref: getPagePath($router, "asset", { id: peerId }),
	}
}

function relationMedia(relation: AssetRelationRecord) {
	const linkKind = text(relation.metadata?.link_kind)
	if (linkKind) return linkKindLabels[linkKind] ?? relation.label ?? linkKind
	return relation.label || "—"
}

function relationSpeed(relation: AssetRelationRecord) {
	const bandwidth = text(relation.metadata?.bandwidth)
	return bandwidth || ""
}

export function AssetNetworkConnectionCard({
	asset,
	interfaces,
	allInterfaces,
	relations,
	assets,
	editing,
	readOnly,
	onEdit,
}: {
	asset: AssetRecord
	interfaces: AssetInterfaceRecord[]
	allInterfaces: AssetInterfaceRecord[]
	relations: AssetRelationRecord[]
	assets: AssetRecord[]
	editing: boolean
	readOnly: boolean
	onEdit?: () => void
}) {
	const assetsById = new Map(assets.map((item) => [item.id, item]))
	const allInterfacesById = new Map(allInterfaces.map((item) => [item.id, item]))
	const assetInterfaces = interfaces.filter((item) => item.asset === asset.id)
	const usedRelationIds = new Set<string>()
	const rows: NetworkConnectionRow[] = []

	for (const record of assetInterfaces) {
		const recordRelations = relationsForInterface(asset, record, relations)
		if (recordRelations.length === 0) {
			rows.push({
				key: record.id,
				name: record.name || interfaceKindLabels[record.kind] || "接口",
				type: interfaceKindLabels[record.kind] ?? record.kind,
				speed: formatSpeed(record.speed_mbps),
				protocol: protocolFor(asset, record),
				peer: record.connected ? "已接入" : "未连接",
				media: "—",
				connected: Boolean(record.connected),
			})
			continue
		}
		for (const relation of recordRelations) {
			usedRelationIds.add(relation.id)
			const peer = peerDetails(asset, relation, assetsById, allInterfacesById)
			rows.push({
				key: `${record.id}-${relation.id}`,
				name: record.name || interfaceKindLabels[record.kind] || "接口",
				type: interfaceKindLabels[record.kind] ?? record.kind,
				speed: formatSpeed(record.speed_mbps) || relationSpeed(relation),
				protocol: protocolFor(asset, record),
				peer: peer.peer,
				peerHref: peer.peerHref,
				media: relationMedia(relation),
				connected: true,
			})
		}
	}

	// 没有绑定到接口的连接也显示成一行：宽带外线、以及虚拟机的「运行在 <宿主机>」（hosted_on）
	for (const relation of relations) {
		if (usedRelationIds.has(relation.id)) continue
		const isHostedOn = relation.kind === "hosted_on"
		if (relation.kind !== "connected_to" && !isHostedOn) continue
		if (relation.source_asset !== asset.id && relation.target_asset !== asset.id) continue
		const ownSide = relation.source_asset === asset.id ? "source" : "target"
		const name =
			text(relation.metadata?.[`${ownSide}_interface_label`]) ||
			(asset.type === "internet" ? "外线" : relation.label || (isHostedOn ? "宿主机" : "连接"))
		const peer = peerDetails(asset, relation, assetsById, allInterfacesById)
		rows.push({
			key: `relation-${relation.id}`,
			name,
			type: isHostedOn ? "运行在" : asset.type === "internet" ? "外线" : "连接",
			speed: relationSpeed(relation),
			protocol: relationMedia(relation),
			peer: peer.peer,
			peerHref: peer.peerHref,
			media: relationMedia(relation),
			connected: true,
		})
	}

	// 服务类资产没有接口记录时，方案要求保留一条「外线」
	if (asset.type === "internet" && rows.length === 0) {
		rows.push({
			key: "internet-external",
			name: "外线",
			type: "外线",
			speed: formatSpeed(asset.metadata?.down_mbps as number | undefined),
			protocol: accessTechnologyLabels[getMetadataString(asset.metadata, "access_technology")] || "—",
			peer: "未连接",
			media: "—",
			connected: false,
		})
	}

	return (
		<section className="min-w-0 rounded-lg border border-border/70 bg-card p-3">
			<header className="flex min-w-0 items-center justify-between gap-2">
				<div className="flex min-w-0 items-center gap-1.5">
					<span className="grid size-6 shrink-0 place-items-center rounded border border-border/70 bg-surface-soft text-muted-foreground">
						<CableIcon className="size-4" />
					</span>
					<h3 className="min-w-0 truncate text-xs font-semibold text-foreground">网络连接</h3>
				</div>
				{editing && !readOnly && onEdit ? (
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="h-6 min-h-6 gap-1 rounded px-1.5 text-[11px]"
						onClick={onEdit}
					>
						编辑
					</Button>
				) : null}
			</header>
			<div className="mt-2 overflow-x-auto rounded-md border border-border/70">
				<table className="w-full min-w-[720px] border-collapse text-xs">
					<thead>
						<tr className="bg-surface-soft text-left text-[11px] text-muted-foreground">
							<th className="px-2 py-1.5 font-medium">接口名</th>
							<th className="px-2 py-1.5 font-medium">类型</th>
							<th className="px-2 py-1.5 font-medium">速率</th>
							<th className="px-2 py-1.5 font-medium">协议</th>
							<th className="px-2 py-1.5 font-medium">连接对端</th>
							<th className="px-2 py-1.5 font-medium">连接介质</th>
							<th className="px-2 py-1.5 font-medium">状态</th>
						</tr>
					</thead>
					<tbody>
						{rows.length === 0 ? (
							<tr>
								<td colSpan={7} className="px-2 py-6 text-center text-xs text-muted-foreground">
									暂无网络连接
								</td>
							</tr>
						) : (
							rows.map((row) => (
								<tr key={row.key} className="border-t border-border/70">
									<td className="px-2 py-1.5 font-medium text-foreground">{row.name}</td>
									<td className="px-2 py-1.5 text-muted-foreground">{row.type}</td>
									<td className="px-2 py-1.5 font-mono text-[11px] tabular-nums text-muted-foreground">
										{row.speed || "—"}
									</td>
									<td className="px-2 py-1.5 text-muted-foreground">{row.protocol}</td>
									<td className="px-2 py-1.5">
										{row.peerHref ? (
											<Link href={row.peerHref} className="text-primary hover:underline">
												{row.peer}
											</Link>
										) : (
											<span className={row.connected ? "text-foreground" : "text-muted-foreground"}>{row.peer}</span>
										)}
									</td>
									<td className="px-2 py-1.5 text-muted-foreground">{row.media}</td>
									<td className="px-2 py-1.5">
										<span
											className={cn(
												"inline-flex items-center gap-1.5",
												row.connected ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"
											)}
										>
											<span
												className={cn(
													"size-1.5 rounded-full",
													row.connected ? "bg-emerald-500" : "bg-muted-foreground/40"
												)}
											/>
											{row.connected ? "已连接" : "未连接"}
										</span>
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>
		</section>
	)
}
