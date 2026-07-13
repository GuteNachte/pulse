import { CheckIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SuggestionValue } from "./asset-enrichment-suggestion-value"
import { getEnrichmentReportStatusLabel } from "../asset-enrichment-report"
import type { AssetEnrichmentReportRecord, AssetEnrichmentSuggestionRecord } from "@/types"

export function AssetSuggestionWorkbench({
	latestReport,
	suggestions,
	actionableSuggestions,
	readOnly,
	saving,
	onAcceptSuggestion,
	onAcceptAllSuggestions,
}: {
	latestReport?: AssetEnrichmentReportRecord
	suggestions: AssetEnrichmentSuggestionRecord[]
	actionableSuggestions: AssetEnrichmentSuggestionRecord[]
	readOnly: boolean
	saving: boolean
	onAcceptSuggestion: (suggestion: AssetEnrichmentSuggestionRecord) => void
	onAcceptAllSuggestions: () => void
}) {
	if (!latestReport) {
		return (
			<div className="rounded-md border border-dashed border-border/70 bg-card px-3 py-3 text-sm text-muted-foreground">
				还没有智能匹配报告。
			</div>
		)
	}
	if (actionableSuggestions.length === 0) {
		return (
			<div className="rounded-md border border-border/70 bg-card px-3 py-3 text-sm text-muted-foreground">
				最近报告没有需要替换的参数。报告时间：{formatTime(latestReport.created)}
			</div>
		)
	}
	return (
		<div className="grid gap-2">
			<div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
				<span>
					{formatTime(latestReport.created)} · {getEnrichmentReportStatusLabel(latestReport.status)}
				</span>
				<div className="flex items-center gap-2">
					<span>
						{actionableSuggestions.length} 个可替换参数 / {suggestions.length} 条建议
					</span>
					<Button type="button" size="sm" onClick={onAcceptAllSuggestions} disabled={readOnly || saving}>
						全部替换
					</Button>
				</div>
			</div>
			{actionableSuggestions.map((suggestion) => (
				<div key={suggestion.id} className="rounded-md border border-border/70 bg-card px-3 py-2">
					<div className="flex min-w-0 flex-wrap items-center gap-2">
						<span className="font-medium text-foreground">{suggestion.target_label}</span>
						<MetaTag>{suggestion.conflict ? "不一致" : "未填写"}</MetaTag>
						<ConfidenceTag confidence={suggestion.confidence ?? 0} />
						<Button
							type="button"
							variant="outline"
							size="icon"
							className="ms-auto size-7"
							onClick={() => onAcceptSuggestion(suggestion)}
							disabled={readOnly || saving}
							aria-label={`替换${suggestion.target_label}`}
							title="替换参数"
						>
							<CheckIcon className="size-3.5" />
						</Button>
					</div>
					<div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
						<SuggestionValue label="当前参数" value={suggestion.current_value || "未填写"} />
						<SuggestionValue label="新参数" value={suggestion.recommended_value || "无"} />
					</div>
				</div>
			))}
		</div>
	)
}

function MetaTag({ children }: { children: React.ReactNode }) {
	return (
		<span className="rounded-md border border-border/70 bg-card px-1.5 py-0.5 text-[11px] text-muted-foreground">
			{children}
		</span>
	)
}

function ConfidenceTag({ confidence }: { confidence: number }) {
	const className =
		confidence >= 90
			? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
			: confidence >= 75
				? "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-200"
				: "border-border/70 bg-card text-muted-foreground"
	return <span className={`rounded-md border px-1.5 py-0.5 text-[11px] ${className}`}>置信度 {confidence}%</span>
}

function formatTime(value: string) {
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return value
	return date.toLocaleString("zh-CN", { hour12: false })
}
