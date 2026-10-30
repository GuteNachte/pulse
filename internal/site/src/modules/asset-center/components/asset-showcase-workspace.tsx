import { getPagePath } from "@nanostores/router"
import { ImagesIcon, PencilIcon, SparklesIcon } from "lucide-react"
import { useMemo, useState, type ReactNode } from "react"
import { $router, Link } from "@/components/router"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import type { AssetInterfaceRecord, AssetRecord, AssetRelationRecord } from "@/types"
import { buildAssetParameterGroups } from "../asset-detail-parameter-groups"
import { getMetadataString } from "../asset-schema"
import { getInternetStatusLabel } from "../asset-type-specs"
import { getInternetAddressAutoRefreshSettings, getInternetAddressMode } from "../asset-internet-address-status"
import { buildGroupOrderFromDrop, isCustomAssetGroup } from "../asset-custom-groups"
import type { AssetParameterRow } from "./asset-parameter-columns"
import { AssetComponentReadonlyTable } from "./asset-component-list-card"
import {
	InternetAddressAutoRefreshControls,
	type InternetAddressAutoRefreshSettings,
} from "./internet-address-auto-refresh-controls"
import {
	AssetMediaShowcase,
	type AssetMediaShowcaseGalleryItem,
	type AssetMediaShowcaseItem,
} from "./asset-media-showcase"
import { getAssetIcon } from "./asset-card"
import { AssetBasicInfoCard } from "./asset-detail-info-cards"
import { AssetDetailFieldCard, hasVisibleGroupRows } from "./asset-detail-field-card"
import { AssetNetworkConnectionCard } from "./asset-network-connection-card"

// 2026-10-19 资产详情页方案：左栏 320px（图片 + 基本信息 + 快捷操作），
// 右栏字段组卡片垂直堆叠；填了数据的组才显示，编辑仍走独立编辑页（方案 P1 再做内联编辑）。

export function AssetShowcaseWorkspace({
	asset,
	media,
	assets = [],
	interfaces = [],
	allInterfaces = [],
	relations = [],
	readOnly = false,
	editing = false,
	onEditProfile,
	onEditMedia,
	onEditConnections,
	onEditGroup,
	onDeleteGroup,
	onReorderGroups,
	onMoveParam,
	internetAddressRefreshing = false,
	onRefreshInternetAddresses,
	onUpdateInternetAddressSettings,
}: {
	asset: AssetRecord
	media?: {
		covers: AssetMediaShowcaseItem[]
		gallery?: AssetMediaShowcaseGalleryItem[]
	}
	assets?: AssetRecord[]
	interfaces?: AssetInterfaceRecord[]
	allInterfaces?: AssetInterfaceRecord[]
	relations?: AssetRelationRecord[]
	readOnly?: boolean
	/** 编辑模式：各模块右上角出现自己的编辑按钮（改动即时保存，右上角「保存」仅退出编辑模式） */
	editing?: boolean
	onEditProfile?: () => void
	onEditMedia?: () => void
	onEditConnections?: () => void
	onEditGroup?: (groupId: string, groupTitle: string) => void
	onDeleteGroup?: (groupId: string) => void | Promise<void>
	onReorderGroups?: (groupIds: string[]) => void | Promise<void>
	onMoveParam?: (key: string, fromGroupId: string, toGroupId: string) => void | Promise<void>
	internetAddressRefreshing?: boolean
	onRefreshInternetAddresses?: () => void
	onUpdateInternetAddressSettings?: (settings: InternetAddressAutoRefreshSettings) => void
}) {
	// 2026-10-20 用户拍板：接入关系统一在顶部「连接」管理，右侧档案不再生成「接入关系」分组。
	const parameterGroups = useMemo(
		() => buildAssetParameterGroups(asset, { interfaces, assets, relations }),
		[asset, assets, interfaces, relations]
	)
	// 查看态空分组隐藏（订阅周期也一样，填了值才显示）；编辑态全部保留，方便进入空组填写。
	const visibleParameterGroups = editing ? parameterGroups : parameterGroups.filter(hasVisibleGroupRows)
	const internetAddressSettings = getInternetAddressAutoRefreshSettings(asset.metadata ?? {})
	const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string; custom: boolean } | null>(null)
	const metadata = asset.metadata ?? {}

	async function submitDeleteGroup() {
		if (!deleteTarget) return
		await onDeleteGroup?.(deleteTarget.id)
		setDeleteTarget(null)
	}

	function runAsync(action: () => void | Promise<void>) {
		Promise.resolve(action()).catch((error) => console.error("asset group action", error))
	}

	function handleDropGroup(sourceId: string, targetId: string) {
		const ids = buildGroupOrderFromDrop(parameterGroups, sourceId, targetId)
		if (ids) runAsync(() => onReorderGroups?.(ids))
	}

	function handleDropParam(key: string, fromGroupId: string, toGroupId: string) {
		if (fromGroupId === toGroupId) return
		runAsync(() => onMoveParam?.(key, fromGroupId, toGroupId))
	}

	const internetAddressMode = getInternetAddressMode(asset.metadata ?? {})
	const internetAddressGroupActions: Record<string, ReactNode> | undefined =
		asset.type === "internet"
			? internetAddressMode === "manual"
				? { 公网地址: <span className="text-xs text-muted-foreground">手动填写</span> }
				: onRefreshInternetAddresses && onUpdateInternetAddressSettings
					? {
							动态公网地址: (
								<InternetAddressAutoRefreshControls
									settings={internetAddressSettings}
									disabled={readOnly || internetAddressRefreshing}
									refreshing={internetAddressRefreshing}
									onChange={onUpdateInternetAddressSettings}
									onRefresh={onRefreshInternetAddresses}
								/>
							),
						}
					: undefined
			: undefined
	const hasAnyDetail = visibleParameterGroups.length > 0

	return (
		<div className="grid items-start gap-4 xl:grid-cols-[minmax(22rem,0.72fr)_minmax(0,1.6fr)] 2xl:grid-cols-[minmax(24rem,0.68fr)_minmax(0,1.65fr)]">
			<aside className="grid content-start gap-2 xl:sticky xl:top-16">
				<section className="rounded-lg border border-border/70 bg-card p-2.5">
					<div className="mb-1.5 flex items-center justify-between gap-2">
						<div className="text-xs font-semibold text-foreground">设备图片</div>
						{!readOnly && editing && onEditMedia ? (
							<Button
								variant="outline"
								size="sm"
								className="h-6 min-h-6 gap-1 rounded px-1.5 text-[11px]"
								onClick={onEditMedia}
							>
								<ImagesIcon className="size-3" />
								编辑图片
							</Button>
						) : null}
					</div>
					<AssetMediaShowcase
						covers={media?.covers ?? []}
						gallery={media?.gallery ?? []}
						fallbackIcon={getAssetIcon(asset.type)}
					/>
				</section>
				<AssetBasicInfoCard
					asset={asset}
					action={editing && onEditProfile ? { label: "编辑", onClick: onEditProfile } : undefined}
				/>
			</aside>

			<div className="grid min-w-0 content-start gap-5">
				<AssetNetworkConnectionCard
					asset={asset}
					interfaces={interfaces}
					allInterfaces={allInterfaces}
					relations={relations}
					assets={assets}
					editing={editing}
					readOnly={readOnly}
					onEdit={onEditConnections}
				/>
				{visibleParameterGroups.length > 0 ? (
					<div className={visibleParameterGroups.length === 1 ? "grid gap-5" : "grid gap-5 md:grid-cols-2"}>
						{visibleParameterGroups.map((group) => (
							<AssetDetailFieldCard
								key={group.id}
								group={group}
								editing={editing}
								action={
									editing && onEditGroup ? (
										<Button
											variant="outline"
											size="sm"
											className="h-6 min-h-6 gap-1 rounded px-1.5 text-[11px]"
											onClick={() => onEditGroup(group.id, group.title)}
										>
											<PencilIcon className="size-3" />
											编辑
										</Button>
									) : (
										internetAddressGroupActions?.[group.title]
									)
								}
								onDelete={
									editing && group.id !== "internet-public-addresses"
										? () =>
												setDeleteTarget({
													id: group.id,
													title: group.title,
													custom: isCustomAssetGroup(metadata, group.id),
												})
										: undefined
								}
								onDropGroup={
									editing && onReorderGroups && group.id !== "internet-public-addresses"
										? (sourceId) => handleDropGroup(sourceId, group.id)
										: undefined
								}
								onDropParam={
									editing && onMoveParam && group.id !== "internet-public-addresses"
										? (key, fromGroupId) => handleDropParam(key, fromGroupId, group.id)
										: undefined
								}
							/>
						))}
					</div>
				) : null}

				<AssetComponentReadonlyTable asset={asset} />

				{!hasAnyDetail ? (
					<section className="grid place-items-center gap-2 rounded-lg border border-dashed border-border/70 bg-card p-6 text-center">
						<div className="text-sm font-semibold text-foreground">还没有确认的参数</div>
						<div className="max-w-md text-xs leading-5 text-muted-foreground">
							点「Agent 填写参数」粘贴参数文本自动分类填写，或在各组里手动填写。
						</div>
						{readOnly ? null : (
							<Button asChild variant="outline" size="sm" className="mt-1 h-8 gap-1.5">
								<Link href={`${getPagePath($router, "assetEdit", { id: asset.id })}?agent=1`}>
									<SparklesIcon className="size-3.5" />
									Agent 填写参数
								</Link>
							</Button>
						)}
					</section>
				) : null}
			</div>

			<Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>删除分组「{deleteTarget?.title}」？</DialogTitle>
						<DialogDescription>
							{deleteTarget?.custom
								? "这是自定义分组，分组内的自定义参数会一起删除。"
								: "预设分组会隐藏，参数数据仍保留，可在「恢复隐藏分组」中找回。"}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
							取消
						</Button>
						<Button
							type="button"
							className="bg-destructive text-white hover:bg-destructive/90"
							onClick={() => runAsync(submitDeleteGroup)}
						>
							删除
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}

export function buildAssetIdentitySections(asset: AssetRecord): { title: string; rows: AssetParameterRow[] }[] {
	const metadata = asset.metadata ?? {}
	const linkRow = (label: string, value: string | undefined): AssetParameterRow =>
		value ? { label, value, href: /^https?:\/\//i.test(value) ? value : undefined } : { label, value: "未设置" }
	// 2026-10-10 详情页大布局：设备档案卡只显示设备本体的硬件身份——
	// 第一排型号+内部型号、第二排厂商+官网；位置/用途/IP 上移到头部通用档案标签，序列号/颜色/备注不再在此显示。
	const fixedRow = (label: string, value: string | undefined): AssetParameterRow => ({
		label,
		value: value || "未设置",
	})
	if (asset.type === "internet") {
		return [
			{
				title: "基础资料",
				rows: [fixedRow("运营商", asset.vendor), fixedRow("状态", getInternetStatusLabel(asset.status || "active"))],
			},
		]
	}
	const internalModel = getMetadataString(metadata, "internal_model")
	// 2026-10-12 用户拍板：上市日期从外观参数组移入设备档案卡（有值才显示，Agent 仍可提取）
	const releaseDate = getMetadataString(metadata, "release_date")
	// 2026-10-17 用户拍板：基本信息卡字段顺序与口径——品牌 / 型号 / 产品定位 / 上市日期 / 官方网站；
	// 内部型号不再单列（并入型号括号显示，兼容未归一的旧数据）
	const productPositioning = getMetadataString(metadata, "product_positioning")
	const archiveRows = [
		fixedRow("品牌", [getMetadataString(metadata, "vendor_cn"), asset.vendor].filter(Boolean).join(" / ")),
		fixedRow("型号", internalModel ? `${asset.model} (${internalModel})` : asset.model),
	]
	if (productPositioning) archiveRows.push(fixedRow("产品定位", productPositioning))
	if (releaseDate) archiveRows.push(fixedRow("上市日期", releaseDate))
	archiveRows.push(linkRow("官方网站", getMetadataString(metadata, "official_url")))
	return [
		{
			// 2026-10-17 用户拍板：卡片标题「设备档案」改为「基本信息」——单区块不再重复小标题
			title: "",
			rows: archiveRows,
		},
	]
}
