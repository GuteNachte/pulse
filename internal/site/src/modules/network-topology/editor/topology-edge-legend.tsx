import { useState } from "react"
import { ChevronDownIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { ASSET_KIND_GROUPS, assetKindGroupColor } from "../asset-kind-identity"
import { getTopologyEdgeAppearance } from "../topology-edge-style"

const LEGEND_ITEMS = [
	{ key: "fiber", label: "光纤", medium: "fiber", bandwidth: "", band: "" },
	{ key: "ethernet-1g", label: "网线 1G", medium: "ethernet", bandwidth: "1G", band: "" },
	{ key: "ethernet-25g", label: "网线 2.5G", medium: "ethernet", bandwidth: "2.5G", band: "" },
	{ key: "ethernet-10g", label: "网线 10G", medium: "ethernet", bandwidth: "10G", band: "" },
	{ key: "wifi-5g", label: "WiFi 5G", medium: "wifi", bandwidth: "", band: "5 GHz" },
	{ key: "wifi-24g", label: "WiFi 2.4G", medium: "wifi", bandwidth: "", band: "2.4 GHz" },
] as const

const STATUS_LEGEND: Array<{ key: string; label: string; color: string; dashed?: boolean; border?: boolean }> = [
	{ key: "online", label: "在线", color: "#10B981" },
	{ key: "offline", label: "离线", color: "#EF4444", border: true },
	{ key: "paused", label: "暂停", color: "#F59E0B", border: true },
	{ key: "unknown", label: "未探测", color: "#6B7280", dashed: true },
]

// 2026-10-25 设备地图图例：一份面板同时解释「左侧竖条=设备类型」「边框=在线状态」「连线=介质」，
// 并按类型给出画布实时清点（几台、几台在线），让图例本身成为设备地图的索引。
export function TopologyEdgeLegend({
	kindCounts,
}: {
	kindCounts?: Map<string, { total: number; online: number; offline: number }>
}) {
	const [open, setOpen] = useState(true)

	return (
		<div className="pointer-events-auto grid gap-1.5 rounded-md border border-[#2E323B] bg-[#16181D]/95 px-2.5 py-2 text-[10px] text-[#9CA3AF] shadow-sm backdrop-blur">
			<button
				type="button"
				onClick={() => setOpen((value) => !value)}
				className="flex w-full items-center gap-1 text-[10px] font-semibold text-[#E5E7EB]"
				aria-expanded={open}
			>
				设备图例
				<ChevronDownIcon className={cn("ms-auto size-3 transition-transform", open && "rotate-180")} />
			</button>

			{open && (
				<>
					<div className="grid gap-1">
						<div className="text-[9px] font-medium text-[#6B7280]">设备类型（左侧色条）</div>
						{ASSET_KIND_GROUPS.map((group) => {
							const counts = kindCounts ? mergeGroupCounts(group.types, kindCounts) : null
							// 画布上没有的类型不显示（空分组不占位）
							if (counts && counts.total === 0) return null
							return (
								<div key={group.label} className="flex items-center gap-2">
									<span
										className="inline-block h-3 w-1 shrink-0 rounded-sm"
										style={{ backgroundColor: assetKindGroupColor(group.types) }}
									/>
									<span>{group.label}</span>
									{counts && (
										<span className="ms-auto flex items-center gap-1.5 tabular-nums">
											<span className="text-[#E5E7EB]">{counts.total}</span>
											{counts.offline > 0 && <span className="text-[#EF4444]">{counts.offline} 离线</span>}
										</span>
									)}
								</div>
							)
						})}
					</div>

					<div className="grid gap-1 border-t border-[#2E323B] pt-1.5">
						<div className="text-[9px] font-medium text-[#6B7280]">在线状态（圆点；异常时边框强调）</div>
						<div className="flex flex-wrap gap-x-2.5 gap-y-1">
							{STATUS_LEGEND.map((item) => (
								<span key={item.key} className="flex items-center gap-1">
									{item.border ? (
										<span className="inline-block size-2.5 rounded-sm border" style={{ borderColor: item.color }} />
									) : (
										<span
											className={cn("inline-block size-2.5 rounded-sm", item.dashed && "border border-dashed")}
											style={item.dashed ? { borderColor: item.color } : { backgroundColor: item.color }}
										/>
									)}
									{item.label}
								</span>
							))}
						</div>
					</div>

					<div className="grid gap-1 border-t border-[#2E323B] pt-1.5">
						<div className="text-[9px] font-medium text-[#6B7280]">连接介质（连线）</div>
						{LEGEND_ITEMS.map((item) => {
							const appearance = getTopologyEdgeAppearance(item.medium, item.bandwidth, undefined, item.band)
							return (
								<div key={item.key} className="flex items-center gap-2">
									<span
										className="inline-block w-7 shrink-0"
										style={{
											borderTop: `${Math.max(1.5, appearance.width)}px ${
												appearance.dashed ? "dashed" : "solid"
											} ${appearance.color}`,
										}}
									/>
									<span>{item.label}</span>
								</div>
							)
						})}
						<div className="text-[9px] text-[#6B7280]">箭头：上游 → 下游</div>
					</div>
				</>
			)}
		</div>
	)
}

/** 把一组类型的清点结果合并（同组共色，合并计数） */
function mergeGroupCounts(types: string[], counts: Map<string, { total: number; online: number; offline: number }>) {
	let total = 0
	let online = 0
	let offline = 0
	for (const type of types) {
		const item = counts.get(type)
		if (!item) continue
		total += item.total
		online += item.online
		offline += item.offline
	}
	return { total, online, offline }
}
