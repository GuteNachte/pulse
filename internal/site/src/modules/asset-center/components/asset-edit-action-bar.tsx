import { ImageIcon, ListChecksIcon, PencilIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { assetActionScope } from "../asset-action-scope"

export function AssetEditActionBar({
	readOnly,
	saving,
	visualBlockReason,
	visualGenerationRunning,
	onRunSmartRecognition,
	onGenerateVisual,
}: {
	readOnly: boolean
	saving: boolean
	visualBlockReason: string
	visualGenerationRunning: boolean
	onRunSmartRecognition: () => void
	onGenerateVisual: () => void
}) {
	return (
		<section className="z-10 border-b border-border/70 bg-card px-4 py-3 sm:px-5">
			<div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
				<div className="min-w-0">
					<div className="text-sm font-semibold text-foreground">资产操作</div>
					<div className="text-xs text-muted-foreground">保存主档后可执行识别与图片收集。</div>
				</div>
				<div className="flex flex-wrap items-center justify-end gap-2">
					{assetActionScope.edit.includes("save") && (
						<Button type="submit" size="sm" disabled={readOnly || saving} className="gap-2">
							<PencilIcon className="size-3.5" />
							保存
						</Button>
					)}
					{assetActionScope.edit.includes("recognition") && (
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={onRunSmartRecognition}
							disabled={readOnly || saving}
							className="gap-2"
						>
							<ListChecksIcon className="size-3.5" />
							智能匹配
						</Button>
					)}
					{assetActionScope.edit.includes("visual") && (
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={onGenerateVisual}
							disabled={readOnly || saving || Boolean(visualBlockReason) || visualGenerationRunning}
							className="gap-2"
						>
							<ImageIcon className="size-3.5" />
							{visualGenerationRunning ? "获取中" : "获取图片"}
						</Button>
					)}
				</div>
			</div>
		</section>
	)
}
