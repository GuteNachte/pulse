import type { LucideIcon } from "lucide-react"
import { BoxIcon, InfoIcon, MapPinIcon, NetworkIcon, ReceiptTextIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { isAssetLocationNotApplicable } from "../asset-location"
import { isServiceAssetType } from "../asset-profiles"
import { getAssetTypeLabel, getMetadataString, getStatusLabel } from "../asset-schema"
import { getAssetIpLabel } from "./asset-card"
import type { AssetRecord } from "@/types"

const EMPTY_VALUE = "未设置"

function displayValue(value: string | undefined | null) {
	const trimmed = (value ?? "").trim()
	return trimmed && trimmed !== "未填写" ? trimmed : EMPTY_VALUE
}

function splitAssetLocation(location: string | undefined) {
	const parts = (location ?? "")
		.split(/\s*[/／>]\s*/)
		.map((part) => part.trim())
		.filter(Boolean)
	return {
		main: parts[0] ?? "",
		room: parts.slice(1).join(" / "),
	}
}

type BasicInfoRow = {
	label: string
	value: string
	mono?: boolean
	href?: string
}

// 2026-10-20 基本信息分组展示：通用 20 字段按语义分 5 组（每组 4 个），宽带额外显示型号（运营商）和公网 IPv4，
// 组小标题 + 小图标、组内两列、组间分隔线，空值仍占位显示；数据分散在资产列与 metadata，这里只做展示聚合。
type BasicInfoGroup = { icon: LucideIcon; title: string; rows: BasicInfoRow[] }

export function AssetBasicInfoCard({
	asset,
	action,
}: {
	asset: AssetRecord
	action?: { label: string; onClick: () => void; icon?: LucideIcon }
}) {
	const metadata = asset.metadata ?? {}
	const internalModel = getMetadataString(metadata, "internal_model")
	const model = internalModel ? [asset.model, `(${internalModel})`].filter(Boolean).join(" ") : asset.model
	const brand = [getMetadataString(metadata, "vendor_cn"), asset.vendor].filter(Boolean).join(" / ")
	const officialUrl = getMetadataString(metadata, "official_url")
	const price = getMetadataString(metadata, "purchase_price_cny")
	const location = splitAssetLocation(isAssetLocationNotApplicable(asset.type) ? "" : asset.location)
	// 2026-10-20 用户拍板：服务类资产只保留与其他资产共有的公共字段——
	// 实物专属的型号/序列号/位置/IP/MAC/保修在服务卡上不展示，服务自己的套餐/线路/动态地址走右侧参数卡；
	// 宽带例外：网络与状态组额外展示自动获取的公网 IPv4。
	const serviceAsset = isServiceAssetType(asset.type)
	const physicalIdentityRows: BasicInfoRow[] = serviceAsset
		? []
		: [
				{ label: "型号", value: displayValue(model) },
				{ label: "序列号/SN", value: displayValue(asset.serial_number), mono: true },
			]
	// 2026-10-20 用户要求宽带基本信息也显示型号：运营商已直接写入 assets.model，
	// 不再由展示层特殊读取 vendor；科技网等其他宽带同样生效。
	const internetIdentityRows: BasicInfoRow[] =
		asset.type === "internet" ? [{ label: "型号", value: displayValue(asset.model) }] : []
	const locationRows: BasicInfoRow[] = serviceAsset
		? []
		: [
				{ label: "位置大类", value: displayValue(location.main) },
				{ label: "具体房间", value: displayValue(location.room) },
			]
	const physicalNetworkRows: BasicInfoRow[] = serviceAsset
		? []
		: [
				{ label: "IP 地址", value: displayValue(getAssetIpLabel(asset)), mono: true },
				{ label: "MAC 地址", value: displayValue(getMetadataString(metadata, "mac")), mono: true },
			]
	// 2026-10-20 用户要求宽带基本信息显示自动获取的公网 IPv4：
	// 只给 internet 增加这一行，其他服务类资产仍不展示 IP。
	const internetNetworkRows: BasicInfoRow[] =
		asset.type === "internet" ? [{ label: "IP 地址", value: displayValue(getAssetIpLabel(asset)), mono: true }] : []
	const warrantyRows: BasicInfoRow[] = serviceAsset
		? []
		: [{ label: "保修到期", value: displayValue(getMetadataString(metadata, "warranty_until")) }]

	const groups: BasicInfoGroup[] = [
		// 第 5 组「采购与保修/采购信息」只属于实物资产；服务类采购信息不放在基本信息卡。

		{
			icon: InfoIcon,
			title: "基础信息",
			rows: [
				{ label: "资产名称", value: displayValue(asset.name) },
				{ label: "资产编号", value: displayValue(getMetadataString(metadata, "asset_tag")), mono: true },
				{ label: "资产类型", value: getAssetTypeLabel(asset.type) },
				{ label: "备注", value: displayValue(asset.notes) },
			],
		},
		{
			icon: BoxIcon,
			title: serviceAsset && asset.type !== "internet" ? "品牌与官网" : "品牌与型号",
			rows: [
				{ label: "品牌", value: displayValue(brand) },
				...physicalIdentityRows,
				...internetIdentityRows,
				{
					label: "官方网站",
					value: displayValue(officialUrl),
					href: /^https?:\/\//i.test(officialUrl) ? officialUrl : undefined,
				},
			],
		},
		{
			icon: MapPinIcon,
			title: serviceAsset ? "归属与用途" : "位置与归属",
			rows: [
				...locationRows,
				{ label: "所属人", value: displayValue(getMetadataString(metadata, "owner")) },
				{ label: "用途/角色", value: displayValue(asset.role) },
			],
		},
		{
			icon: NetworkIcon,
			title: "网络与状态",
			rows: [
				...physicalNetworkRows,
				...internetNetworkRows,
				{ label: "所属网段", value: displayValue(getMetadataString(metadata, "network_domain")) },
				{ label: "资产状态", value: getStatusLabel(asset.status || "active") },
			],
		},
		{
			icon: ReceiptTextIcon,
			title: serviceAsset ? "采购信息" : "采购与保修",
			rows: [
				{ label: "购入日期", value: displayValue(getMetadataString(metadata, "purchase_date")) },
				{ label: "启用日期", value: displayValue(getMetadataString(metadata, "install_date")) },
				...warrantyRows,
				{ label: "购入价格", value: price ? `¥${price}` : EMPTY_VALUE },
			],
		},
	]
	// 2026-10-20 用户拍板：服务类基本信息的采购信息整组去掉，不进右侧也不在左卡展示。
	const visibleGroups = serviceAsset ? groups.slice(0, 4) : groups

	return (
		<section className="rounded-lg border border-border/70 bg-card p-3">
			<div className="flex min-w-0 items-center justify-between gap-2">
				<h3 className="text-xs font-semibold text-foreground">基本信息</h3>
				{action ? (
					<Button
						variant="outline"
						size="sm"
						className="h-6 min-h-6 gap-1 rounded px-1.5 text-[11px]"
						onClick={action.onClick}
						// 2026-10-20 用户报「第一次点基本信息编辑不弹、要再点一次」：
						// 首次点击可能被焦点/布局变化吞掉，按下主键就打开，避免丢失第一次点击。
						onPointerDown={(event) => {
							if (event.button !== 0) return
							action.onClick()
						}}
					>
						{action.icon ? <action.icon className="size-3" /> : null}
						{action.label}
					</Button>
				) : null}
			</div>
			<div className="mt-2 grid gap-2.5">
				{visibleGroups.map((group, groupIndex) => (
					<div key={group.title} className={groupIndex > 0 ? "border-t border-border/40 pt-2.5" : undefined}>
						<div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
							<group.icon className="size-3" />
							{group.title}
						</div>
						<div className="grid grid-cols-2 gap-x-4">
							{group.rows.map((row) => (
								<div
									key={row.label}
									className="flex min-h-7 min-w-0 items-center justify-between gap-2 border-b border-border/30 py-0.5"
								>
									<span className="shrink-0 text-xs text-muted-foreground">{row.label}</span>
									<span
										title={row.value}
										className={
											row.mono
												? "min-w-0 truncate text-right font-mono text-[13px] tabular-nums text-foreground"
												: "min-w-0 truncate text-right text-[13px] text-foreground"
										}
									>
										{row.href ? (
											<a href={row.href} target="_blank" rel="noreferrer" className="text-primary hover:underline">
												{row.value}
											</a>
										) : (
											row.value
										)}
									</span>
								</div>
							))}
						</div>
					</div>
				))}
			</div>
		</section>
	)
}
