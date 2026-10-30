import { useEffect, useMemo, useState } from "react"
import { ChevronLeftIcon, ChevronRightIcon, ImageIcon, RefreshCwIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/use-toast"
import { pb } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { AssetComponentRecord, AssetRecord } from "@/types"
import { fetchImageCandidates, importAssetImageToLibrary, type AutoFetchImage } from "../asset-auto-fetch"
import { ASSET_COMPONENT_CATEGORIES } from "../asset-component-list"
import { loadAssetImageWall, saveAssetImageWall } from "../asset-image-wall-store"
import { notifyAssetMediaChanged } from "../asset-media-events"
import { isComputeDeviceType } from "../asset-schema"
import { AssetMediaEditorDialog } from "./asset-media-editor-dialog"
import { AssetMediaWorkspace } from "./asset-media-workspace"

// 2026-10-05 图片专项：面板两个标签页——「图片库」（编辑的家：网格/封面/裁剪/删除/上传）
// 与「收集图片」（网络图墙搜索）。
// 2026-10-09 图片专项重构：
// - 图墙候选持久化（关闭弹窗/切页签/刷新不消失，只有再次搜索才换一批）；
// - 去掉多选批量入库，改为点选候选 → 右侧预览 → 直接入库 / 编辑入库（裁剪后入库）；
// - 候选格子与预览左右分栏，图片多时预览不再被挤到看不见；
// - 找图按装机方式分流：品牌机默认按厂商+型号找整机图（无相册选择）；
//   组装机先选目标部件再找图（按配件的品牌+型号搜索），入库自动归入该部件相册。

type PanelTab = "library" | "collect"

type WallImageTarget = {
	id: string
	album: string
	label: string
	keyword: string
	vendor: string
}

export function AssetEditVisualPanel({
	assetType,
	assetId,
	assetName,
	assetVendor,
	assetBuildMode,
	defaultMediaPreview,
	readOnly,
}: {
	assetType: AssetRecord["type"]
	assetId: string
	assetName: string
	assetVendor?: string
	/** 计算设备装机方式（brand/diy）；非计算设备不适用 */
	assetBuildMode?: string
	defaultMediaPreview?: { url: string; alt: string }
	readOnly: boolean
}) {
	const [activeTab, setActiveTab] = useState<PanelTab>("library")
	const [preferredMediaId, setPreferredMediaId] = useState<string>()
	// 2026-10-09 图片专项：只有组装机需要部件相册与"选部件找图"
	const isDiyCompute = isComputeDeviceType(assetType) && assetBuildMode === "diy"
	const [components, setComponents] = useState<AssetComponentRecord[]>([])
	// 图墙候选：初始化自会话存储，搜索成功后写回——结果不会自动清空
	const [wallSnapshot] = useState(() => loadAssetImageWall(assetId))
	const [rescanImages, setRescanImages] = useState<AutoFetchImage[]>(wallSnapshot.items)
	const [batchTargetId, setBatchTargetId] = useState<string>(wallSnapshot.targetId ?? "")
	const [wallTargetId, setWallTargetId] = useState<string>(wallSnapshot.targetId ?? "")
	const [rescanPhase, setRescanPhase] = useState<"idle" | "working" | "error">("idle")
	const [wallSelected, setWallSelected] = useState<AutoFetchImage>()
	const [importedIds, setImportedIds] = useState<Set<string>>(() => new Set())
	const [cropTarget, setCropTarget] = useState<AutoFetchImage>()
	const [importing, setImporting] = useState(false)
	// 2026-10-09 图片专项：图源勾选（默认必应+360 全开），随请求传给 Hub
	const [enabledSources, setEnabledSources] = useState<string[]>(["bing", "so360"])
	const [rescanLimit, setRescanLimit] = useState(12)
	// 2026-10-09 图片专项：候选列表翻页——每页 12 张（2 列 × 6 行）；只有一页时隐藏翻页组件
	const [wallPage, setWallPage] = useState(0)
	const wallPageCount = Math.max(1, Math.ceil(rescanImages.length / 12))
	const isProviderLogo =
		assetType === "internet" ||
		assetType === "web_endpoint" ||
		assetType === "subscription" ||
		assetType === "domain_name" ||
		assetType === "cloud_host"
	const hasWallResults = rescanImages.length > 0

	useEffect(() => {
		if (!isDiyCompute) return
		let active = true
		pb.collection<AssetComponentRecord>("asset_components")
			.getFullList({ filter: pb.filter("asset = {:asset}", { asset: assetId }), requestKey: null })
			.then((rows) => {
				if (active) setComponents(rows)
			})
			.catch(() => undefined)
		return () => {
			active = false
		}
	}, [assetId, isDiyCompute])

	// 目标部件选项：优先用配件清单（含品牌型号，搜索更准）；清单为空时退回配件分类
	const wallTargets = useMemo<WallImageTarget[]>(() => {
		if (!isDiyCompute) return []
		if (components.length > 0) {
			return components.map((component) => {
				const categoryLabel =
					ASSET_COMPONENT_CATEGORIES.find((item) => item.value === component.category)?.label ?? component.category
				const detail = [component.vendor, component.model].filter(Boolean).join(" ")
				return {
					id: component.id,
					album: component.category,
					label: detail ? `${categoryLabel} · ${detail}` : `${categoryLabel} · 未填型号`,
					keyword: detail || `${assetName} ${categoryLabel}`,
					vendor: component.vendor ?? "",
				}
			})
		}
		return ASSET_COMPONENT_CATEGORIES.map((category) => ({
			id: `category:${category.value}`,
			album: category.value,
			label: category.label,
			keyword: `${assetName} ${category.label}`,
			vendor: "",
		}))
	}, [assetName, components, isDiyCompute])
	const selectedTarget = wallTargets.find((item) => item.id === wallTargetId)
	const batchTarget = wallTargets.find((item) => item.id === batchTargetId)

	async function runRescan() {
		if (isDiyCompute && !selectedTarget) {
			toast({
				title: "请先选择要配图的部件",
				description: "组装机找图需要先选择某个部件，再点获取图片。",
				variant: "destructive",
			})
			return
		}
		setRescanPhase("working")
		setWallSelected(undefined)
		try {
			// 品牌机/其他资产默认按厂商+型号找整机图；组装机按所选部件的品牌+型号找配图
			const items = selectedTarget
				? await fetchImageCandidates(
						selectedTarget.keyword,
						"",
						assetId,
						selectedTarget.vendor,
						enabledSources,
						rescanLimit
					)
				: await fetchImageCandidates(assetName, "", assetId, assetVendor, enabledSources, rescanLimit, assetType)
			// 结果持久化：关闭弹窗、切页签、刷新都不丢，只有再次搜索才换一批
			saveAssetImageWall(assetId, { items, targetId: selectedTarget?.id })
			setRescanImages(items)
			setWallPage(0)
			setBatchTargetId(selectedTarget?.id ?? "")
			setRescanPhase(items.length > 0 ? "idle" : "error")
		} catch {
			setRescanPhase("error")
		}
	}

	async function importWallImage(
		image: AutoFetchImage,
		crop?: {
			placement: { x: number; y: number; width: number; height: number }
			ratio: string
			brightness?: number
			contrast?: number
		}
	) {
		setImporting(true)
		try {
			// 组装机入库自动归入目标部件相册（部件分类）；品牌机与其他资产固定整机
			const album = batchTarget?.album ?? "whole"
			const ok = await importAssetImageToLibrary(assetId, image, album, crop)
			if (!ok) {
				toast({ title: "加入图片库失败", description: "请稍后重试。", variant: "destructive" })
				return
			}
			setImportedIds((current) => new Set(current).add(image.id))
			setPreferredMediaId(undefined)
			notifyAssetMediaChanged(assetId)
			toast({
				title: "已加入图片库",
				description: [
					crop ? (crop.brightness || crop.contrast ? "裁剪与调节结果已归档" : "裁剪结果已归档") : "原图已归档",
					batchTarget?.label,
				]
					.filter(Boolean)
					.join("；"),
			})
		} finally {
			setImporting(false)
		}
	}

	return (
		<section className="flex h-full min-h-0 flex-col gap-3 rounded-lg border border-border/70 bg-card p-3">
			<div className="grid grid-cols-2 gap-1 rounded-md border border-border/70 bg-surface-soft p-1">
				<Button
					type="button"
					variant={activeTab === "library" ? "default" : "ghost"}
					size="sm"
					className="h-8"
					onClick={() => setActiveTab("library")}
				>
					图片库
				</Button>
				<Button
					type="button"
					variant={activeTab === "collect" ? "default" : "ghost"}
					size="sm"
					className="h-8"
					onClick={() => setActiveTab("collect")}
				>
					收集图片
				</Button>
			</div>
			{activeTab === "library" ? (
				<div className="grid min-h-0 flex-1 gap-3">
					<AssetMediaWorkspace
						assetId={assetId}
						readOnly={readOnly}
						preferredMediaId={preferredMediaId}
						fallbackPreview={defaultMediaPreview}
						showAlbumControls={isDiyCompute}
					/>
				</div>
			) : (
				<div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(19rem,24rem)_minmax(0,1fr)]">
					<div className="flex min-h-0 min-w-0 flex-col gap-2 rounded-md border border-border/70 bg-card p-2.5">
						<div className="mb-2 flex items-center justify-between gap-2">
							<div className="flex min-w-0 items-center gap-2 text-xs font-medium text-foreground">
								{isProviderLogo ? "再搜 Logo" : "图片搜索"}
								{rescanPhase === "working" && (
									<span
										className="h-1.5 w-24 overflow-hidden rounded-full bg-border"
										role="progressbar"
										aria-label="搜索中"
									>
										<span className="operation-progress-bar block h-full w-1/3 rounded-full bg-primary" />
									</span>
								)}
							</div>
							<div className="flex shrink-0 items-center gap-2">
								<label className="flex items-center gap-1 text-[11px] text-muted-foreground">
									候选数量
									<select
										value={rescanLimit}
										onChange={(event) => setRescanLimit(Number(event.target.value))}
										disabled={readOnly || rescanPhase === "working"}
										className="h-6 rounded border border-border/70 bg-card px-1 text-[11px]"
									>
										{[6, 12, 20, 30].map((value) => (
											<option key={value} value={value}>
												{value} 张
											</option>
										))}
									</select>
								</label>
								<Button
									type="button"
									size="sm"
									variant="outline"
									className="h-7 min-h-7 gap-1.5 px-2 text-[11px]"
									onClick={runRescan}
									disabled={readOnly || rescanPhase === "working" || (isDiyCompute && !selectedTarget)}
								>
									<RefreshCwIcon className={cn("size-3", rescanPhase === "working" && "animate-spin")} />
									{rescanPhase === "working" ? "搜索中" : hasWallResults ? "再次搜索" : "获取图片"}
								</Button>
							</div>
						</div>
						{isDiyCompute ? (
							<div className="mb-2 flex flex-wrap items-center gap-2 rounded border border-border/70 bg-surface-soft px-2 py-1.5">
								<span className="text-[11px] font-medium text-foreground">目标部件</span>
								<select
									value={wallTargetId}
									onChange={(event) => setWallTargetId(event.target.value)}
									disabled={readOnly || rescanPhase === "working"}
									className="h-6 min-w-0 flex-1 rounded border border-border/70 bg-card px-1 text-[11px]"
								>
									<option value="">选择要配图的部件</option>
									{wallTargets.map((target) => (
										<option key={target.id} value={target.id}>
											{target.label}
										</option>
									))}
								</select>
							</div>
						) : null}
						<div className="flex flex-wrap items-center gap-3 rounded border border-border/70 bg-surface-soft px-2 py-1.5">
							<span className="text-[11px] font-medium text-foreground">搜索来源</span>
							{[
								{ id: "bing", label: "必应图片" },
								{ id: "so360", label: "360 图片" },
							].map((source) => (
								<label
									key={source.id}
									className="flex cursor-pointer items-center gap-1 text-[11px] text-muted-foreground"
								>
									<input
										type="checkbox"
										checked={enabledSources.includes(source.id)}
										onChange={(event) =>
											setEnabledSources((current) => {
												const next = event.target.checked
													? [...current, source.id]
													: current.filter((id) => id !== source.id)
												// 至少保留一个图源
												return next.length > 0 ? next : current
											})
										}
										className="size-3 accent-primary"
									/>
									{source.label}
								</label>
							))}
						</div>
						{rescanPhase === "idle" && !hasWallResults && (
							<p className="text-xs leading-5 text-muted-foreground">
								{isDiyCompute ? (
									<>组装机按所选部件找图：先选目标部件，再点「获取图片」搜该部件的展示图，入库自动归入该部件相册。</>
								) : (
									<>
										点「获取图片」按「{assetName}
										」搜一批候选图：自动去重、剔除图片库里已有的图，并按型号匹配度、商品展示图类型与 16:9
										画面比例优先排序；点选图片可在右侧预览并入库。
									</>
								)}
							</p>
						)}
						{rescanPhase === "error" && (
							<p className="text-xs leading-5 text-muted-foreground">没有搜到新的候选图，可以换个名称再搜。</p>
						)}
						{hasWallResults && (
							<div className="flex min-h-0 flex-1 flex-col gap-2">
								<div className="grid min-h-0 grid-cols-2 content-start gap-1.5 overflow-y-auto">
									{rescanImages.slice(wallPage * 12, wallPage * 12 + 12).map((image) => {
										const selected = wallSelected?.id === image.id
										const imported = importedIds.has(image.id)
										// 2026-10-09 图片专项：行式列表（小缩略图在左），标题截短显示、
										// 悬停看全文（用户口径：要的是图，长名字截断即可）
										return (
											<button
												key={image.id}
												type="button"
												title={image.title}
												onClick={() => setWallSelected(image)}
												className={cn(
													"flex items-center gap-2 rounded border p-1.5 text-left text-xs transition-colors",
													selected ? "border-primary bg-primary/5" : "border-border/70 hover:border-ring/50"
												)}
											>
												<span className="relative block aspect-[16/9] w-24 shrink-0 overflow-hidden rounded border border-border/60 bg-black">
													<img
														src={image.url}
														alt={image.title}
														loading="lazy"
														referrerPolicy="no-referrer"
														className="absolute inset-0 size-full object-contain"
													/>
												</span>
												<span className="min-w-0 flex-1 truncate">{image.title || "候选图片"}</span>
												{imported && (
													<span className="shrink-0 rounded bg-emerald-600/90 px-1 py-px text-[10px] text-white">
														已入库
													</span>
												)}
											</button>
										)
									})}
								</div>
								{wallPageCount > 1 && (
									<div className="mt-auto flex items-center justify-center gap-1">
										<Button
											type="button"
											size="icon"
											variant="outline"
											className="size-5 min-h-5"
											aria-label="上一页"
											disabled={wallPage === 0}
											onClick={() => setWallPage((current) => Math.max(0, current - 1))}
										>
											<ChevronLeftIcon className="size-3" />
										</Button>
										<span className="text-[10px] tabular-nums text-muted-foreground">
											{wallPage + 1} / {wallPageCount}
										</span>
										<Button
											type="button"
											size="icon"
											variant="outline"
											className="size-5 min-h-5"
											aria-label="下一页"
											disabled={wallPage >= wallPageCount - 1}
											onClick={() => setWallPage((current) => Math.min(wallPageCount - 1, current + 1))}
										>
											<ChevronRightIcon className="size-3" />
										</Button>
									</div>
								)}
							</div>
						)}
					</div>

					<div className="grid gap-2 self-start rounded-md border border-border/70 bg-card p-2.5 lg:sticky lg:top-4">
						<div className="truncate text-xs font-medium text-foreground" title={wallSelected?.title}>
							{wallSelected ? wallSelected.title || "候选图片" : "候选预览"}
						</div>
						<div className="relative grid aspect-[16/9] place-items-center overflow-hidden rounded border border-border/60 bg-black">
							{wallSelected ? (
								<img
									src={wallSelected.url}
									alt={wallSelected.title}
									referrerPolicy="no-referrer"
									className="absolute inset-0 size-full object-contain"
								/>
							) : (
								<div className="grid place-items-center gap-1.5 text-muted-foreground">
									<ImageIcon className="size-5" />
									<span className="text-[11px]">点左边的图片查看预览</span>
								</div>
							)}
						</div>
						{wallSelected ? (
							<div className="flex flex-wrap items-center gap-1.5">
								<Button
									type="button"
									size="sm"
									variant="outline"
									disabled={readOnly || importing}
									onClick={() => importWallImage(wallSelected).catch(() => undefined)}
								>
									直接入库
								</Button>
								<Button
									type="button"
									size="sm"
									disabled={readOnly || importing}
									onClick={() => setCropTarget(wallSelected)}
								>
									编辑入库
								</Button>
							</div>
						) : null}
					</div>
				</div>
			)}
			<AssetMediaEditorDialog
				open={Boolean(cropTarget)}
				onOpenChange={(open) => {
					if (!open) setCropTarget(undefined)
				}}
				url={cropTarget?.url}
				title={cropTarget?.title || "候选图片"}
				readOnly={readOnly}
				saving={importing}
				onSave={(placement, ratio, adjustments) => {
					const target = cropTarget
					if (!target) return
					importWallImage(target, {
						placement,
						ratio,
						brightness: adjustments.brightness,
						contrast: adjustments.contrast,
					}).finally(() => setCropTarget(undefined))
				}}
			/>
		</section>
	)
}
