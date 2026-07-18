import { useState } from "react"
import { ImageIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { AssetRecord, AssetVisualRecord } from "@/types"
import {
	getAssetDisplayVisual,
	getAssetVisualCandidateFrames,
	getAssetVisualCandidateLimit,
	getDisplayAssetVisualFrames,
	getLatestAssetVisualCandidateSet,
	groupAssetVisualCandidateFramesByColor,
	type AssetVisualCandidateFrame,
} from "../asset-visual-query"
import { AssetMediaWorkspace } from "./asset-media-workspace"

export function AssetEditVisualPanel({
	assetType,
	assetId,
	visuals,
	defaultMediaPreview,
	visualBlockReason,
	visualGenerationStage,
	visualGenerationMessage,
	taskSummary,
	readOnly,
	saving,
	onGenerateVisual,
	onImportVisualCandidate,
}: {
	assetType: AssetRecord["type"]
	assetId: string
	visuals: AssetVisualRecord[]
	defaultMediaPreview?: { url: string; alt: string }
	visualBlockReason: string
	visualGenerationStage: "idle" | "running" | "ready" | "failed"
	visualGenerationMessage: string
	taskSummary: string
	readOnly: boolean
	saving: boolean
	onGenerateVisual: () => void
	onImportVisualCandidate: (visualId: string, frameIndex: number) => Promise<string>
}) {
	const [selectedCandidate, setSelectedCandidate] = useState<AssetVisualCandidateFrame>()
	const [preferredMediaId, setPreferredMediaId] = useState<string>()
	const [importingCandidateKey, setImportingCandidateKey] = useState<string>()
	const isProviderLogo = assetType === "internet" || assetType === "web_endpoint"
	const visualLabel = isProviderLogo ? "服务商 Logo" : "图片候选"
	const candidateLabel = isProviderLogo ? "Logo 候选" : "候选图"
	const visualLimit = getAssetVisualCandidateLimit(assetType)
	const latestVisual = getAssetDisplayVisual(visuals)
	const latestVisualFrame = getDisplayAssetVisualFrames(latestVisual)[0]
	const visualCandidateSet = getLatestAssetVisualCandidateSet(visuals)
	const visualCandidateFrames = getAssetVisualCandidateFrames(visualCandidateSet)
	const visualCandidateGroups = groupAssetVisualCandidateFramesByColor(visualCandidateFrames)

	return (
		<section className="rounded-lg border border-border/70 bg-card p-3">
			<div className="mb-3 flex items-center justify-between gap-3">
				<div className="min-w-0 text-sm font-semibold text-foreground">{visualLabel}</div>
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={onGenerateVisual}
					disabled={readOnly || saving || visualGenerationStage === "running"}
					className="shrink-0 gap-2"
				>
					<ImageIcon className="size-3.5" />
					{visualGenerationStage === "running" ? "获取中" : "获取图片"}
				</Button>
			</div>
			<div className="grid gap-3">
				<AssetMediaWorkspace
					assetId={assetId}
					readOnly={readOnly}
					previewOverride={
						selectedCandidate ? { url: selectedCandidate.url, alt: `${selectedCandidate.label} 预览` } : undefined
					}
					preferredMediaId={preferredMediaId}
					onLibrarySelection={() => setSelectedCandidate(undefined)}
					fallbackPreview={
						defaultMediaPreview ??
						(latestVisualFrame?.url
							? {
									url: latestVisualFrame.url,
									alt: isProviderLogo ? "服务商 Logo 预览" : "当前图片预览",
								}
							: undefined)
					}
				/>
				{visualBlockReason && (
					<div className="rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-200">
						{visualBlockReason}
					</div>
				)}
				{visualGenerationMessage && (
					<div
						className={cn(
							"rounded-md border px-3 py-2 text-xs leading-5",
							visualGenerationStage === "failed"
								? "border-amber-500/25 bg-amber-500/5 text-amber-700 dark:text-amber-200"
								: visualGenerationStage === "ready"
									? "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-200"
									: "border-border/70 bg-card text-muted-foreground"
						)}
					>
						{visualGenerationMessage}
					</div>
				)}
				<div className="rounded-md border border-border/70 bg-card p-2.5">
					<div className="mb-2 flex items-center justify-between gap-2">
						<div className="text-xs font-medium text-foreground">{candidateLabel}</div>
						<div className="text-[11px] text-muted-foreground">
							{visualCandidateFrames.length ? `${visualCandidateFrames.length} / ${visualLimit}` : taskSummary}
						</div>
					</div>
					{visualCandidateFrames.length > 0 ? (
						<div className="grid gap-3">
							{visualCandidateGroups.map((group) => (
								<div key={group.color} className="grid gap-2">
									<div className="flex items-center justify-between gap-2 text-[11px]">
										<span className="font-medium text-foreground">{group.color}</span>
										<span className="text-muted-foreground">{group.frames.length} 张</span>
									</div>
									<div className="grid grid-cols-3 gap-2">
										{group.frames.map((frame) => {
											const candidateKey = `${frame.visualId}:${frame.index}`
											const selected =
												selectedCandidate?.visualId === frame.visualId && selectedCandidate.index === frame.index
											return (
												<div
													key={`${frame.visualId}-${frame.index}-${frame.url}`}
													className={cn(
														"group grid min-w-0 gap-1.5 rounded-md border bg-surface-soft p-1.5 text-left transition hover:border-ring/60",
														selected ? "border-ring bg-ring/5" : "border-border/70"
													)}
												>
													<button
														type="button"
														className="grid min-w-0 gap-1 text-left"
														onClick={() => setSelectedCandidate(frame)}
													>
														<span className="relative grid aspect-[16/9] w-full min-w-0 place-items-center overflow-hidden rounded border border-border/60 bg-white">
															<img src={frame.url} alt={frame.label} className="h-full w-full object-contain" />
														</span>
														<span className="block w-full min-w-0 truncate text-[11px] text-muted-foreground">
															{formatAssetVisualSource(frame.sourceProvider, frame.sourceTitle) || frame.label}
														</span>
													</button>
													<Button
														type="button"
														size="sm"
														variant="outline"
														className="h-7 min-h-7 w-full px-2 text-[10px]"
														disabled={readOnly || saving || Boolean(importingCandidateKey)}
														onClick={async () => {
															setImportingCandidateKey(candidateKey)
															setPreferredMediaId(undefined)
															try {
																const mediaId = await onImportVisualCandidate(frame.visualId, frame.index)
																setPreferredMediaId(mediaId)
																setSelectedCandidate(undefined)
															} catch {
																// 页面回调负责展示具体失败原因，候选预览保持不变以便重试。
															} finally {
																setImportingCandidateKey(undefined)
															}
														}}
													>
														{importingCandidateKey === candidateKey ? "加入中" : "加入图片库"}
													</Button>
												</div>
											)
										})}
									</div>
								</div>
							))}
						</div>
					) : (
						<div className="rounded-md border border-dashed border-border/70 px-3 py-6 text-center text-xs text-muted-foreground">
							暂无候选图
						</div>
					)}
				</div>
			</div>
		</section>
	)
}

function formatAssetVisualSource(provider?: string, title?: string) {
	const label =
		provider === "bing_images"
			? "必应图片"
			: provider === "asset_master" ||
					provider === "support_url" ||
					provider === "product_url" ||
					provider === "official_url"
				? "官网"
				: ""
	return [label, title?.trim()].filter(Boolean).join(" · ")
}
