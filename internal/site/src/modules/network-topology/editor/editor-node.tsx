import { Handle, Position, type NodeProps } from "@xyflow/react"
import {
	CameraIcon,
	CpuIcon,
	HardDriveIcon,
	MonitorIcon,
	NetworkIcon,
	PlugIcon,
	PrinterIcon,
	RouterIcon,
	ServerIcon,
	SmartphoneIcon,
	SpeakerIcon,
	TvIcon,
	WifiIcon,
} from "lucide-react"
import { getAssetIcon } from "@/modules/asset-center/components/asset-card"
import { getAssetModelDisplay } from "@/modules/asset-center/asset-profile-summary"
import { getAssetTypeLabel, getMetadataString } from "@/modules/asset-center/asset-schema"
import { cn } from "@/lib/utils"
import type { AssetStatus, SystemRecord } from "@/types"
import { assetKindIdentity } from "../asset-kind-identity"
import type { TopologyEditorNode } from "./editor-model"

export const EDITOR_ICON_OPTIONS = [
	{ value: "", label: "按资产类型" },
	{ value: "router", label: "路由器", icon: RouterIcon },
	{ value: "server", label: "服务器", icon: ServerIcon },
	{ value: "computer", label: "电脑", icon: MonitorIcon },
	{ value: "storage", label: "存储", icon: HardDriveIcon },
	{ value: "wifi", label: "无线", icon: WifiIcon },
	{ value: "phone", label: "手机 / 平板", icon: SmartphoneIcon },
	{ value: "camera", label: "摄像头", icon: CameraIcon },
	{ value: "plug", label: "插座", icon: PlugIcon },
	{ value: "printer", label: "打印机", icon: PrinterIcon },
	{ value: "speaker", label: "音箱", icon: SpeakerIcon },
	{ value: "tv", label: "影音", icon: TvIcon },
	{ value: "cpu", label: "芯片", icon: CpuIcon },
	{ value: "network", label: "网络", icon: NetworkIcon },
]

// 2026-10-25 三态在线显示：只认可云的两种来源（Agent 心跳 / Hub ping 探测），
// 没有任何在线数据的设备如实显示「未探测」（灰色虚线），不再用档案状态涂绿冒充在线。
const STATUS_COLOR = {
	online: "#10B981",
	offline: "#EF4444",
	paused: "#F59E0B",
	unmonitored: "#6B7280",
} as const

type NodeDisplayStatus = {
	key: keyof typeof STATUS_COLOR
	label: string
	/** 未探测设备用虚线边框示意"无监控数据" */
	dashed?: boolean
	/** 宽带等广域服务不参与在线探测：不显示状态标识 */
	hidden?: boolean
}

function nodeDisplayStatus(
	system?: SystemRecord,
	presenceStatus?: string,
	assetStatus?: AssetStatus,
	assetType?: string
): NodeDisplayStatus {
	if (system?.status === "up") return { key: "online", label: "在线" }
	if (system?.status === "down") return { key: "offline", label: "离线" }
	if (system?.status === "paused") return { key: "paused", label: "暂停" }
	if (presenceStatus === "online") return { key: "online", label: "在线" }
	if (presenceStatus === "offline") return { key: "offline", label: "离线" }
	// 宽带（internet，广域服务）与手机（锁屏断网无法可靠探测）不参与在线探测：
	// 不显示「未探测」，只按档案状态显示「在用」等（灰色实线，不冒充在线）
	if (assetType === "internet" || assetType === "phone") {
		const archiveLabel = assetStatus ? getStatusArchiveLabel(assetStatus) : "在用"
		return { key: "unmonitored", label: archiveLabel || "在用" }
	}
	// 无监控数据：仅保留档案状态的文字说明，不参与颜色语义
	const archiveLabel = assetStatus ? getStatusArchiveLabel(assetStatus) : ""
	return { key: "unmonitored", label: archiveLabel ? `未探测 · ${archiveLabel}` : "未探测", dashed: true }
}

function getStatusArchiveLabel(status: AssetStatus) {
	switch (status) {
		case "active":
			return "在用"
		case "planned":
			return "规划"
		case "inactive":
			return "停用"
		case "retired":
			return "退役"
		default:
			return ""
	}
}

export function TopologyEditorNodeCard({ data, selected }: NodeProps<TopologyEditorNode>) {
	const { asset, system, presence, settings, showHandles, connectedHandles, handleColors } = data
	const iconOption = EDITOR_ICON_OPTIONS.find((option) => option.value && option.value === settings.icon)
	const Icon = iconOption ? (iconOption.icon as typeof NetworkIcon) : getAssetIcon(asset.type)
	const ip =
		asset.type === "internet"
			? getMetadataString(asset.metadata, "public_ipv4") || "未获取 IP"
			: asset.management_ip || getMetadataString(asset.metadata, "fixed_ipv4") || "未填写 IP"
	const model = getAssetModelDisplay(asset)
	const location = asset.location
	const typeLabel = asset.type === "internet" ? "宽带接入" : getAssetTypeLabel(asset.type)
	const display = nodeDisplayStatus(system, presence?.status, asset.status, asset.type)
	// 2026-10-25 优雅化：设备类型走"身份色"（左侧竖条 + 图标），在线状态只在异常时才用颜色强调——
	// 在线设备保持安静的中性边框，离线/暂停才亮红/琥珀。健康时不吵，异常时自然跳出来。
	const identity = assetKindIdentity(asset.type)
	const neutralBorder = "#2E323B"
	const borderColor = selected ? "#3B82F6" : display.key === "online" ? neutralBorder : STATUS_COLOR[display.key]
	const statusTone =
		display.key === "offline" ? "text-[#F87171]" : display.key === "paused" ? "text-[#FBBF24]" : "text-[#9CA3AF]"
	const statusDot =
		display.key === "offline" ? "#F87171" : display.key === "paused" ? "#FBBF24" : STATUS_COLOR[display.key]
	// 设备地图信息层级：第 2 行「是什么设备」（类型 + 型号），第 3 行「在哪 / 什么地址」
	const line2 = [typeLabel, settings.showModel && model ? model : ""].filter(Boolean).join(" · ")
	const line3 =
		[settings.showIp ? ip : "", settings.showLocation && location ? location : "", settings.notes]
			.filter(Boolean)
			.join(" · ") ||
		asset.role ||
		"未填写信息"

	return (
		<div className="group relative h-full w-full">
			<article
				className={cn(
					"relative grid h-full w-full content-start gap-1.5 overflow-hidden rounded-lg px-3.5 py-2.5 ps-4 text-left shadow-[0_4px_12px_rgba(0,0,0,0.3)] transition-colors",
					selected && "ring-2 ring-[#3B82F6]/60"
				)}
				style={{
					border: `1px ${display.dashed ? "dashed" : "solid"} ${borderColor}`,
					background: identity.tint,
				}}
			>
				{/* 左侧类型身份竖条：一眼分清设备类型，与边框的在线状态色互不干扰 */}
				<span
					aria-hidden
					className="absolute inset-y-0 left-0 w-[3px] rounded-l-lg"
					style={{ backgroundColor: identity.accent }}
				/>
				<div className="flex min-w-0 items-center gap-2">
					<span
						className="grid size-8 shrink-0 place-items-center rounded-md border"
						style={{
							borderColor: `${identity.accent}66`,
							backgroundColor: `${identity.accent}1A`,
							color: identity.accent,
						}}
					>
						<Icon className="size-4" />
					</span>
					<strong className="min-w-0 flex-1 truncate text-[15px] font-semibold text-[#E5E7EB]" title={asset.name}>
						{settings.showName ? asset.name : typeLabel}
					</strong>
					{identity.badge ? (
						<span
							className="shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium"
							style={{
								borderColor: `${identity.accent}80`,
								backgroundColor: `${identity.accent}1A`,
								color: identity.accent,
							}}
						>
							{identity.badge}
						</span>
					) : null}
					{!display.hidden && (
						<span
							className={cn("flex shrink-0 items-center gap-1 text-[11px] font-medium", statusTone)}
							title={display.label}
						>
							<span className="size-2 rounded-full" style={{ backgroundColor: statusDot }} />
							{display.label}
						</span>
					)}
				</div>
				<div className="truncate text-[12.5px] leading-4 text-[#9CA3AF]" title={line2}>
					{line2}
				</div>
				<div className="truncate text-[11.5px] text-[#6B7280]">{line3}</div>
			</article>

			{(["top", "right", "bottom", "left"] as const).map((side) => (
				<Handle
					key={side}
					id={side}
					type="source"
					position={
						side === "top"
							? Position.Top
							: side === "right"
								? Position.Right
								: side === "bottom"
									? Position.Bottom
									: Position.Left
					}
					// 2026-10-25 编辑页四个连接点常显成小节点（可拖线）；展示页只常显有连线经过的那几个，
					// 其余悬停才显示；展示页的圆点取该连线颜色，看起来像连线端头的一颗铆钉。
					className={cn(
						"!size-2.5 !border-2 !border-[#0F1115] transition-opacity",
						showHandles || (connectedHandles?.includes(side) ?? false)
							? "opacity-100"
							: "opacity-0 group-hover:opacity-100"
					)}
					style={{ backgroundColor: showHandles ? "#3B82F6" : (handleColors?.[side] ?? "#3B82F6") }}
				/>
			))}
		</div>
	)
}
