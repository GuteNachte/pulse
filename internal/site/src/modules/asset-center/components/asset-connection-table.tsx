import { CableIcon, CpuIcon, EyeIcon, PlugZapIcon, UsbIcon, WifiIcon } from "lucide-react"
import { EthernetIcon } from "@/components/ui/icons"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { ReactNode } from "react"
import { getPagePath } from "@nanostores/router"
import { $router, Link } from "@/components/router"
import { cn } from "@/lib/utils"
import type { AssetInterfaceRecord, AssetRelationRecord, AssetRecord } from "@/types"
import { getMetadataString } from "../asset-schema"

// 2026-10-06 连接展示定稿（用户拍板撤掉连接图）：连接信息以表格呈现。
// 非网络设备（主机/IoT/宽带等无网络详情模型的资产）用本表的完整连接表；
// 网络设备的非网络连接（电源口/USB/外设/供电关系）由网络详情卡以 bare 模式内嵌本表的「其他连接」段。

export type ConnectionBranch = {
	key: string
	network: boolean
	icon: ReactNode
	title: string
	kindLabel: string
	statusLine: string
	detailLines: { label: string; value: string }[]
	connection?: {
		peerName: string
		peerHref: string
		peerInterfaceLabel: string
		linkLabel: string
	}
	connected: boolean
}

function interfaceIcon(kind: AssetInterfaceRecord["kind"]) {
	if (kind === "wifi") return <WifiIcon className="size-3.5" />
	if (kind === "power") return <PlugZapIcon className="size-3.5" />
	if (kind === "usb") return <UsbIcon className="size-3.5" />
	if (kind === "video") return <EyeIcon className="size-3.5" />
	return <EthernetIcon className="size-3.5" />
}

const kindLabels: Record<string, string> = {
	ethernet: "有线",
	wifi: "Wi-Fi",
	pon: "PON 光纤",
	optical: "光纤",
	wan: "WAN",
	lan: "LAN",
	management: "管理口",
	virtual: "虚拟接口",
	power: "电源口",
	usb: "USB / 外设",
	video: "视频输出",
	custom: "自定义",
}

function isNetworkKind(kind: string) {
	return ["ethernet", "wifi", "pon", "optical", "wan", "lan", "management", "virtual"].includes(kind)
}

export function buildConnectionBranches(
	asset: AssetRecord,
	interfaces: AssetInterfaceRecord[],
	relations: AssetRelationRecord[],
	assetsById: Map<string, AssetRecord>
): ConnectionBranch[] {
	// 连接图口径：只画本资产接口（调用方即使传全量清单也不会串进别的资产的接口）
	const branches: ConnectionBranch[] = []
	const usedRelationIds = new Set<string>()

	for (const record of interfaces.filter((item) => item.asset === asset.id)) {
		const icon = interfaceIcon(record.kind)
		const kindLabel = kindLabels[record.kind] ?? record.kind
		const speed = record.speed_mbps
			? `${record.speed_mbps >= 1000 ? `${(record.speed_mbps / 1000).toFixed(record.speed_mbps % 1000 === 0 ? 0 : 1)} Gbps` : `${record.speed_mbps} Mbps`}`
			: ""
		const mac = record.mac ? `MAC ${record.mac}` : ""
		const detailLines = [
			{ label: "IPv4", value: record.ipv4 ?? "" },
			{ label: "MAC", value: mac },
			{ label: "速率", value: speed },
		].filter((line) => line.value)

		const relation = relations.find(
			(item) =>
				(item.source_asset === asset.id || item.target_asset === asset.id) &&
				(item.metadata?.source_interface === record.id || item.metadata?.target_interface === record.id)
		)
		if (relation) usedRelationIds.add(relation.id)

		const isNetwork = isNetworkKind(record.kind)
		const branchTitle = record.name || kindLabel
		const statusLine = [kindLabel, isNetwork ? (record.connected ? "已接入" : "未接入") : ""]
			.filter(Boolean)
			.join(" · ")

		let connection: ConnectionBranch["connection"]
		if (relation && isNetwork) {
			const peerId = relation.source_asset === asset.id ? relation.target_asset : relation.source_asset
			// 详情页资产清单只含当前资产，对端名优先从关系展开（expand）取
			const expandedPeer = relation.expand?.[peerId === relation.source_asset ? "source_asset" : "target_asset"]
			const peer =
				assetsById.get(peerId) ??
				(expandedPeer && !Array.isArray(expandedPeer) ? (expandedPeer as AssetRecord) : undefined)
			// 对端接口存的是记录 ID，解析成接口名称显示；取对端那一侧的接口
			const peerIsSource = peerId === relation.source_asset
			const peerInterfaceId =
				getMetadataString(relation.metadata, peerIsSource ? "source_interface" : "target_interface") ||
				getMetadataString(relation.metadata, peerIsSource ? "target_interface" : "source_interface") ||
				""
			connection = {
				peerName: peer?.name ?? "未知资产",
				peerHref: getPagePath($router, "asset", { id: peerId }),
				peerInterfaceLabel: peerInterfaceId
					? interfaces.find((item) => item.id === peerInterfaceId)?.name || peerInterfaceId
					: "",
				linkLabel: relation.label ?? "",
			}
		} else if (isNetwork && record.connected && record.kind === "wifi") {
			connection = {
				peerName: "接入互联网",
				peerHref: "",
				peerInterfaceLabel: "",
				linkLabel: "",
			}
		}

		branches.push({
			key: record.id,
			network: isNetwork,
			icon,
			title: branchTitle,
			kindLabel,
			statusLine,
			detailLines,
			connection,
			connected: Boolean(record.connected),
		})
	}

	// 电源参数（metadata，非接口记录）：有电源信息的资产生成电源行
	const powerInput = getMetadataString(asset.metadata, "power_input")
	const powerMode = getMetadataString(asset.metadata, "power_mode")
	const powerAdapter = getMetadataString(asset.metadata, "power_adapter")
	const powerModeLabels: Record<string, string> = {
		external: "外置电源",
		internal: "内置电源",
		ac: "AC 电源",
		poe: "PoE 供电",
		usb: "USB 供电",
		dc: "DC 电源",
		battery: "电池供电",
	}
	const powerModeLabel = powerMode ? (powerModeLabels[powerMode.toLowerCase()] ?? powerMode) : ""
	if (powerInput || powerMode || powerAdapter) {
		const detailLines = [
			{ label: "供电方式", value: powerModeLabel || powerMode },
			{ label: "输入电源", value: powerInput },
			{ label: "电源适配器", value: powerAdapter },
		].filter((line) => line.value)
		branches.push({
			key: "power-branch",
			network: false,
			icon: <PlugZapIcon className="size-3.5" />,
			title: "电源",
			kindLabel: "电源",
			statusLine: [powerModeLabel, powerAdapter].filter(Boolean).join(" · ") || "电源",
			detailLines,
			connected: Boolean(powerInput || powerAdapter),
		})
	}

	// 未挂到本机接口上的对端连接（如宽带线路、服务类连接）也生成行
	for (const relation of relations) {
		if (usedRelationIds.has(relation.id)) continue
		if (relation.source_asset !== asset.id && relation.target_asset !== asset.id) continue
		const peerId = relation.source_asset === asset.id ? relation.target_asset : relation.source_asset
		const expandedPeer = relation.expand?.[peerId === relation.source_asset ? "source_asset" : "target_asset"]
		const peer =
			assetsById.get(peerId) ??
			(expandedPeer && !Array.isArray(expandedPeer) ? (expandedPeer as AssetRecord) : undefined)
		branches.push({
			key: `relation-${relation.id}`,
			network: relation.kind === "connected_to",
			icon: <CableIcon className="size-3.5" />,
			title: getRelationKindLabel(relation.kind),
			kindLabel: relation.label || "对端连接",
			statusLine: relation.label || "到其他资产的连接",
			detailLines: [],
			connected: true,
			connection: {
				peerName: peer?.name ?? "未知资产",
				peerHref: getPagePath($router, "asset", { id: peerId }),
				peerInterfaceLabel: relation.label ?? "",
				linkLabel: relation.label ?? "",
			},
		})
	}

	return branches
}

function getRelationKindLabel(kind?: string) {
	const labels: Record<string, string> = {
		connected_to: "网络连接",
		hosted_on: "运行在",
		monitors: "监控",
		depends_on: "依赖",
		owns: "归属",
		located_in: "位于",
		powered_by: "供电于",
		custom: "自定义",
	}
	return (kind && labels[kind]) || kind || "未知"
}

export function AssetConnectionTable({
	asset,
	interfaces,
	relations,
	assets,
	title = "连接",
	actions,
	bare = false,
	onlyExternal = false,
}: {
	asset: AssetRecord
	interfaces: AssetInterfaceRecord[]
	relations: AssetRelationRecord[]
	assets: AssetRecord[]
	title?: string
	// 编辑页在卡头放「编辑连接」入口，展示页不传
	actions?: ReactNode
	// bare 模式：不带卡片壳，供网络详情卡内嵌（其他连接段）
	bare?: boolean
	// 只显示非网络连接（电源/USB/外设/供电关系），供网络设备内嵌场景
	onlyExternal?: boolean
}) {
	const assetsById = new Map(assets.map((item) => [item.id, item]))
	const branches = buildConnectionBranches(asset, interfaces, relations, assetsById).filter((branch) =>
		onlyExternal ? !branch.network : true
	)
	const connected = branches.filter((branch) => branch.connected)
	const networkBranches = branches.filter((branch) => branch.network)
	const externalBranches = branches.filter((branch) => !branch.network)

	// 与网口状态表同款表格样式：接口/连接 + 类型 + 状态徽标 + 连接的是什么
	const connectionTable = (rows: ConnectionBranch[]) => (
		<div className="overflow-hidden rounded-md border border-border/70">
			<Table className="table-fixed text-xs">
				<TableHeader>
					<TableRow className="hover:bg-transparent">
						<TableHead className="h-8 w-[30%] px-2">接口 / 连接</TableHead>
						<TableHead className="h-8 w-[18%] px-2">类型</TableHead>
						<TableHead className="h-8 w-[14%] px-2">状态</TableHead>
						<TableHead className="h-8 px-2">连接的是什么</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((branch) => (
						<TableRow key={branch.key}>
							<TableCell className="px-2 py-2">
								<span className="flex min-w-0 items-center gap-2">
									<span
										className={cn(
											"size-2 shrink-0 rounded-full",
											branch.connected ? "bg-emerald-500" : "border border-border/70 bg-muted-foreground/30"
										)}
									/>
									<span className="shrink-0 text-muted-foreground">{branch.icon}</span>
									<span className="min-w-0 truncate font-semibold">{branch.title}</span>
								</span>
							</TableCell>
							<TableCell className="break-words px-2 py-2 text-muted-foreground">{branch.kindLabel}</TableCell>
							<TableCell className="px-2 py-2">
								<span
									className={cn(
										"inline-flex h-5 items-center rounded-md border px-1.5 text-[10px] font-medium",
										branch.connected
											? "border-emerald-500/25 bg-card text-emerald-700 dark:text-emerald-300"
											: "border-border bg-surface-card text-muted-foreground"
									)}
								>
									{branch.connected ? "已连接" : "未连接"}
								</span>
							</TableCell>
							<TableCell className="break-words px-2 py-2">
								{branch.connection ? (
									branch.connection.peerHref ? (
										<Link
											href={branch.connection.peerHref}
											className="max-w-[16rem] truncate font-medium text-primary hover:underline"
										>
											{branch.connection.peerName}
										</Link>
									) : (
										<span className="max-w-[16rem] truncate font-medium">{branch.connection.peerName}</span>
									)
								) : branch.connected ? (
									<span className="break-words text-muted-foreground">{branch.statusLine || "对端未记录"}</span>
								) : (
									<span className="text-muted-foreground">未连接</span>
								)}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	)

	const content = (() => {
		if (branches.length === 0) {
			return (
				<div className="rounded-md border border-dashed border-border/70 px-3 py-4 text-center text-xs text-muted-foreground">
					暂无接口与连接信息。
				</div>
			)
		}
		return (
			<div className="grid gap-3">
				{networkBranches.length > 0 ? connectionTable(networkBranches) : null}
				{externalBranches.length > 0 ? connectionTable(externalBranches) : null}
			</div>
		)
	})()

	if (bare) {
		return (
			<section aria-labelledby="asset-extra-connections" className="min-w-0 border-t border-border/70 px-3 py-3">
				<div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
					<SectionHeading
						id="asset-extra-connections"
						icon={<CableIcon className="size-4" />}
						title={title}
						count={`${branches.length} 项`}
					/>
					{actions}
				</div>
				<div className="mt-2">{content}</div>
			</section>
		)
	}

	return (
		<Card className="min-w-0 border-border/70 bg-card shadow-none">
			<CardHeader className="border-b border-border/70 px-4 py-3">
				<div className="flex min-w-0 items-center justify-between gap-3">
					<div className="flex min-w-0 items-center gap-2.5">
						<span className="grid size-8 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft text-muted-foreground">
							<CpuIcon className="size-4" />
						</span>
						<div className="min-w-0">
							<CardTitle className="truncate text-base">{title}</CardTitle>
							<div className="mt-0.5 text-[11px] text-muted-foreground">本机接口与到其他资产的连接</div>
						</div>
					</div>
					<div className="flex shrink-0 items-center gap-1.5">
						<Badge variant="secondary">{connected.length} 个已连接</Badge>
						{actions}
					</div>
				</div>
			</CardHeader>
			<CardContent className="p-3">{content}</CardContent>
		</Card>
	)
}

function SectionHeading({ id, icon, title, count }: { id: string; icon: ReactNode; title: string; count: string }) {
	return (
		<div className="flex min-w-0 items-center gap-2">
			<span className="text-muted-foreground">{icon}</span>
			<h3 id={id} className="text-sm font-semibold">
				{title}
			</h3>
			<span className="text-[11px] text-muted-foreground">{count}</span>
		</div>
	)
}
