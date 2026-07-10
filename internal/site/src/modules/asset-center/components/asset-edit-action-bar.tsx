import { ImageIcon, ListChecksIcon, PencilIcon, Trash2Icon } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import type { AssetEnrichmentSuggestionRecord } from "@/types"

export function AssetEditActionBar({
	readOnly,
	saving,
	visualBlockReason,
	visualGenerationRunning,
	actionableSuggestions,
	onRunSmartRecognition,
	onAcceptSuggestion,
	onAcceptAllSuggestions,
	onGenerateVisual,
	onOpenInterface,
	onOpenRelation,
	onOpenMaintenance,
	onOpenAttachment,
	onDelete,
}: {
	readOnly: boolean
	saving: boolean
	visualBlockReason: string
	visualGenerationRunning: boolean
	actionableSuggestions: AssetEnrichmentSuggestionRecord[]
	onRunSmartRecognition: () => void
	onAcceptSuggestion: (suggestion: AssetEnrichmentSuggestionRecord) => void
	onAcceptAllSuggestions: () => void
	onGenerateVisual: () => void
	onOpenInterface: () => void
	onOpenRelation: () => void
	onOpenMaintenance: () => void
	onOpenAttachment: () => void
	onDelete: () => void
}) {
	const [selectedSuggestionId, setSelectedSuggestionId] = useState(actionableSuggestions[0]?.id ?? "")
	const selectedSuggestion = actionableSuggestions.find((suggestion) => suggestion.id === selectedSuggestionId)

	useEffect(() => {
		if (!actionableSuggestions.some((suggestion) => suggestion.id === selectedSuggestionId)) {
			setSelectedSuggestionId(actionableSuggestions[0]?.id ?? "")
		}
	}, [actionableSuggestions, selectedSuggestionId])

	return (
		<section className="sticky top-0 z-10 mb-3 rounded-lg border border-border/70 bg-card/95 p-3 shadow-sm backdrop-blur">
			<div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
				<div className="min-w-0">
					<div className="text-sm font-semibold text-foreground">操作</div>
					<div className="text-xs text-muted-foreground">保存后再执行识别、找图和替换。</div>
				</div>
				<div className="flex flex-wrap items-center justify-end gap-2">
					<Button type="submit" size="sm" disabled={readOnly || saving} className="gap-2">
						<PencilIcon className="size-3.5" />
						保存
					</Button>
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
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={onGenerateVisual}
						disabled={readOnly || saving || Boolean(visualBlockReason) || visualGenerationRunning}
						className="gap-2"
					>
						<ImageIcon className="size-3.5" />
						{visualGenerationRunning ? "找图中" : "找图"}
					</Button>
					<Button
						type="button"
						size="sm"
						onClick={onAcceptAllSuggestions}
						disabled={readOnly || saving || actionableSuggestions.length === 0}
						className="gap-2"
					>
						<PencilIcon className="size-3.5" />
						一键替换
					</Button>
					{actionableSuggestions.length > 0 && (
						<>
							<select
								value={selectedSuggestionId}
								onChange={(event) => setSelectedSuggestionId(event.target.value)}
								className="h-9 max-w-44 rounded-md border border-input bg-card px-2 text-xs text-foreground outline-none transition-[border-color,box-shadow] focus:border-ring/70 focus:ring-2 focus:ring-ring/15"
							>
								{actionableSuggestions.map((suggestion) => (
									<option key={suggestion.id} value={suggestion.id}>
										{suggestion.target_label}
									</option>
								))}
							</select>
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={() => selectedSuggestion && onAcceptSuggestion(selectedSuggestion)}
								disabled={readOnly || saving || !selectedSuggestion}
								className="gap-2"
							>
								<PencilIcon className="size-3.5" />
								替换选中
							</Button>
						</>
					)}
					<Button type="button" variant="outline" size="sm" onClick={onOpenInterface} disabled={readOnly}>
						接口
					</Button>
					<Button type="button" variant="outline" size="sm" onClick={onOpenRelation} disabled={readOnly}>
						关系
					</Button>
					<Button type="button" variant="outline" size="sm" onClick={onOpenMaintenance} disabled={readOnly}>
						维护
					</Button>
					<Button type="button" variant="outline" size="sm" onClick={onOpenAttachment} disabled={readOnly}>
						附件
					</Button>
					<Button
						type="button"
						variant="destructive"
						size="sm"
						onClick={onDelete}
						disabled={readOnly || saving}
						className="gap-2"
					>
						<Trash2Icon className="size-3.5" />
						删除
					</Button>
				</div>
			</div>
		</section>
	)
}
