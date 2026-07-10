import { ImageIcon } from "lucide-react"
import { OfficialColorPicker } from "./asset-form-fields"
import { cn } from "@/lib/utils"
import type { AssetRecord, AssetVisualRecord } from "@/types"
import {
	getAssetDisplayVisual,
	getAssetVisualCandidateFrames,
	getDisplayAssetVisualFrames,
	getLatestAssetVisualCandidateSet,
	groupAssetVisualCandidateFramesByColor,
} from "../asset-visual-query"

export function AssetEditVisualPanel({
	assetType,
	visuals,
	visualColor,
	officialColorOptions,
	visualBlockReason,
	visualGenerationStage,
	visualGenerationMessage,
	taskSummary,
	readOnly,
	saving,
	onVisualColorChange,
	onSelectVisualCandidate,
}: {
	assetType: AssetRecord["type"]
	visuals: AssetVisualRecord[]
	visualColor: string
	officialColorOptions: string[]
	visualBlockReason: string
	visualGenerationStage: "idle" | "running" | "ready" | "failed"
	visualGenerationMessage: string
	taskSummary: string
	readOnly: boolean
	saving: boolean
	onVisualColorChange: (value: string) => void
	onSelectVisualCandidate: (visualId: string, frameIndex: number) => void
}) {
	const latestVisual = getAssetDisplayVisual(visuals)
	const latestVisualFrame = getDisplayAssetVisualFrames(latestVisual)[0]
	const visualCandidateSet = getLatestAssetVisualCandidateSet(visuals)
	const visualCandidateFrames = getAssetVisualCandidateFrames(visualCandidateSet)
	const visualCandidateGroups = groupAssetVisualCandidateFramesByColor(visualCandidateFrames)

	return (
		<section className="rounded-lg border border-border/70 bg-surface-soft p-3">
			<div className="mb-3 flex items-center justify-between gap-3">
				<div className="min-w-0">
					<div className="text-sm font-semibold text-foreground">全貌图</div>
					<div className="mt-1 text-xs text-muted-foreground">官方配色和可追溯设备图片集中在编辑里。</div>
				</div>
			</div>
			<div className="grid gap-3">
				<OfficialColorPicker
					value={visualColor}
					options={officialColorOptions}
					assetType={assetType}
					onChange={onVisualColorChange}
				/>
				{visualBlockReason ? (
					<div className="rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-200">
						{visualBlockReason}
					</div>
				) : (
					<div className="rounded-md border border-border/70 bg-card px-3 py-2 text-xs leading-5 text-muted-foreground">
						设备图片 Agent 会从官方 / 可追溯来源收集最多 10
						张候选图；未选择配色时会按识别到的官方颜色分组，选择配色时优先收集该颜色。
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
				<div className="relative grid aspect-[3/4] max-h-[24rem] min-h-[16rem] place-items-center overflow-hidden rounded-md border border-border/70 bg-card">
					{latestVisualFrame?.url ? (
						<img src={latestVisualFrame.url} alt="设备全貌图预览" className="h-full w-full object-contain p-4" />
					) : (
						<div className="grid place-items-center gap-2 text-center text-muted-foreground">
							<div className="grid size-12 place-items-center rounded-md border border-border/70 bg-surface-soft">
								<ImageIcon className="size-5" />
							</div>
							<div className="text-xs">暂无预览</div>
						</div>
					)}
					<div className="absolute left-2 top-2 rounded-md border border-border/70 bg-card px-2 py-1 text-[11px] text-muted-foreground">
						当前主图
					</div>
				</div>
				<div className="rounded-md border border-border/70 bg-card p-2">
					<div className="mb-2 flex items-center justify-between gap-2">
						<div className="text-xs font-medium text-foreground">候选图</div>
						<div className="text-[11px] text-muted-foreground">
							{visualCandidateFrames.length ? `${visualCandidateFrames.length} / 10` : taskSummary}
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
									<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
										{group.frames.map((frame) => {
											const selected =
												latestVisualFrame?.url && frame.url && latestVisualFrame.url.trim() === frame.url.trim()
											return (
												<button
													key={`${frame.visualId}-${frame.index}-${frame.url}`}
													type="button"
													onClick={() => onSelectVisualCandidate(frame.visualId, frame.index)}
													disabled={readOnly || saving}
													className={cn(
														"group grid gap-1 rounded-md border bg-surface-soft p-1.5 text-left transition hover:border-ring/60 disabled:cursor-not-allowed disabled:opacity-60",
														selected ? "border-ring bg-ring/5" : "border-border/70"
													)}
												>
													<span className="relative grid aspect-[3/4] place-items-center overflow-hidden rounded border border-border/60 bg-card">
														<img src={frame.url} alt={frame.label} className="h-full w-full object-contain p-1" />
													</span>
													<span className="flex items-center justify-between gap-1 text-[11px]">
														<span className="truncate text-muted-foreground">{frame.label}</span>
														<span className={cn("shrink-0", selected ? "text-ring" : "text-muted-foreground")}>
															{selected ? "已选" : "选择"}
														</span>
													</span>
												</button>
											)
										})}
									</div>
								</div>
							))}
						</div>
					) : (
						<div className="rounded-md border border-dashed border-border/70 px-3 py-6 text-center text-xs text-muted-foreground">
							点击顶部“找图”后，这里会显示最多 10 张候选图。
						</div>
					)}
				</div>
			</div>
		</section>
	)
}
