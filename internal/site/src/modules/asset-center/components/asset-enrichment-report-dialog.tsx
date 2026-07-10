import { AlertTriangleIcon, ExternalLinkIcon, ListChecksIcon, PencilIcon } from "lucide-react"
import { useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { SuggestionValue } from "./asset-enrichment-suggestion-value"
import {
	getEnrichmentAIStatusLabel,
	getEnrichmentOnlineEmptyText,
	getEnrichmentOnlineStatusLabel,
	getEnrichmentOnlineSummary,
	getEnrichmentReportStatusLabel,
	getEnrichmentSourceLabel,
	getEnrichmentSuggestionSourceLinks,
	getEnrichmentSuggestionStatusLabel,
	getMetadataStringArray,
	getOnlineProviderLabel,
	getOnlineSourceTypeLabel,
} from "../asset-enrichment-report"
import type { AssetEnrichmentReportRecord, AssetEnrichmentSuggestionRecord } from "@/types"

export function AssetEnrichmentReportDialog({
	reports,
	suggestions,
	reportDialogOpen,
	onReportDialogOpenChange,
	readOnly,
	saving,
	onAccept,
	onReject,
}: {
	reports: AssetEnrichmentReportRecord[]
	suggestions: AssetEnrichmentSuggestionRecord[]
	reportDialogOpen: boolean
	onReportDialogOpenChange: (open: boolean) => void
	readOnly: boolean
	saving: boolean
	onAccept: (suggestion: AssetEnrichmentSuggestionRecord) => void
	onReject: (suggestion: AssetEnrichmentSuggestionRecord) => void
}) {
	const latestReport = reports[0]
	const latestSuggestions = useMemo(
		() => (latestReport ? suggestions.filter((item) => item.report === latestReport.id) : []),
		[latestReport, suggestions]
	)
	const pendingCount = latestSuggestions.filter((item) => item.status === "pending").length
	const conflictCount = latestSuggestions.filter((item) => item.conflict && item.status === "pending").length
	const acceptedCount = latestSuggestions.filter((item) => item.status === "accepted").length

	return (
		<Dialog open={reportDialogOpen} onOpenChange={onReportDialogOpenChange}>
			<DialogContent className="flex max-h-[88vh] max-w-4xl flex-col overflow-hidden">
				<DialogHeader>
					<DialogTitle>智能识别报告</DialogTitle>
					<DialogDescription>
						{latestReport
							? `${formatReportTime(latestReport.created)} · ${getEnrichmentReportStatusLabel(latestReport.status)}`
							: "生成报告后会在这里显示完整内容。"}
					</DialogDescription>
				</DialogHeader>
				<div className="min-h-0 overflow-y-auto pr-1">
					{latestReport ? (
						<div className="grid gap-3">
							<div className="grid grid-cols-3 gap-2">
								<SummaryMini label="待确认" value={pendingCount} />
								<SummaryMini label="冲突" value={conflictCount} />
								<SummaryMini label="已写入" value={acceptedCount} />
							</div>
							<div className="whitespace-pre-line rounded-md border border-border/70 bg-surface-soft px-3 py-2 text-sm leading-6 text-foreground">
								{latestReport.report || "该报告没有正文。"}
							</div>
							<AssetEnrichmentOnlineSources report={latestReport} />
							<div className="grid gap-2">
								<div className="text-sm font-semibold text-foreground">字段建议</div>
								{latestSuggestions.length === 0 ? (
									<div className="rounded-md border border-dashed border-border/70 bg-surface-soft px-3 py-2 text-sm text-muted-foreground">
										本报告没有可写入建议。报告正文仍会长期留档。
									</div>
								) : (
									latestSuggestions.map((suggestion) => (
										<EnrichmentSuggestionDetail
											key={suggestion.id}
											suggestion={suggestion}
											readOnly={readOnly}
											saving={saving}
											onAccept={onAccept}
											onReject={onReject}
										/>
									))
								)}
							</div>
						</div>
					) : (
						<EmptyReport />
					)}
				</div>
			</DialogContent>
		</Dialog>
	)
}

function AssetEnrichmentOnlineSources({ report }: { report: AssetEnrichmentReportRecord }) {
	const summary = getEnrichmentOnlineSummary(report)
	return (
		<div className="grid gap-2 rounded-lg border border-border/70 bg-surface-soft p-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="text-sm font-semibold text-foreground">资料来源</div>
				<div className="flex flex-wrap items-center gap-1.5">
					<MetaTag>{getEnrichmentOnlineStatusLabel(summary?.status)}</MetaTag>
					{summary?.providers.map((provider) => (
						<MetaTag key={provider}>{getOnlineProviderLabel(provider)}</MetaTag>
					))}
					{summary?.aiExtractor && summary.aiExtractor.status !== "disabled" && (
						<MetaTag>
							AI：{getEnrichmentAIStatusLabel(summary.aiExtractor.status)}
							{summary.aiExtractor.suggestions ? ` · ${summary.aiExtractor.suggestions} 条` : ""}
						</MetaTag>
					)}
				</div>
			</div>
			{summary?.query && <div className="break-words text-xs text-muted-foreground">查询：{summary.query}</div>}
			{summary?.aiExtractor && summary.aiExtractor.status !== "disabled" && (
				<div className="break-words text-xs text-muted-foreground">
					AI 提取器：{getOnlineProviderLabel(summary.aiExtractor.provider)}
					{summary.aiExtractor.model ? ` / ${summary.aiExtractor.model}` : ""}
					{summary.aiExtractor.error ? `；${summary.aiExtractor.error}` : ""}
				</div>
			)}
			{summary?.sources.length ? (
				<div className="grid gap-2">
					{summary.sources.map((source) => (
						<a
							key={`${source.provider}-${source.url}`}
							href={source.url}
							target="_blank"
							rel="noreferrer"
							className="group grid gap-1 rounded-md border border-border/70 bg-card px-3 py-2 text-xs transition hover:border-primary/40 hover:bg-surface-soft"
						>
							<div className="flex min-w-0 items-center gap-2">
								<MetaTag>{getOnlineProviderLabel(source.provider)}</MetaTag>
								<MetaTag>{getOnlineSourceTypeLabel(source.type)}</MetaTag>
								<ConfidenceTag confidence={source.confidence} />
								<ExternalLinkIcon className="ms-auto size-3.5 shrink-0 text-muted-foreground transition group-hover:text-primary" />
							</div>
							<div className="break-words font-medium text-foreground">{source.title}</div>
							{source.snippet && <div className="line-clamp-2 break-words text-muted-foreground">{source.snippet}</div>}
							<div className="break-all font-mono text-[11px] text-muted-foreground">{source.url}</div>
						</a>
					))}
				</div>
			) : (
				<div className="rounded-md border border-dashed border-border/70 bg-card px-3 py-2 text-xs leading-5 text-muted-foreground">
					{getEnrichmentOnlineEmptyText(summary)}
				</div>
			)}
			{!!summary?.errors.length && (
				<div className="rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-200">
					{summary.errors.join("；")}
				</div>
			)}
		</div>
	)
}

export function EnrichmentSuggestionCompact({
	suggestion,
	readOnly,
	saving,
	onAccept,
	onReject,
}: {
	suggestion: AssetEnrichmentSuggestionRecord
	readOnly: boolean
	saving: boolean
	onAccept: (suggestion: AssetEnrichmentSuggestionRecord) => void
	onReject: (suggestion: AssetEnrichmentSuggestionRecord) => void
}) {
	return (
		<>
			<div className="flex flex-wrap items-center gap-2">
				{suggestion.conflict ? (
					<AlertTriangleIcon className="size-4 text-amber-600 dark:text-amber-300" />
				) : (
					<ListChecksIcon className="size-4 text-emerald-600 dark:text-emerald-300" />
				)}
				<span className="font-medium text-foreground">{suggestion.target_label}</span>
				<MetaTag>{getEnrichmentSourceLabel(suggestion.source)}</MetaTag>
				<ConfidenceTag confidence={suggestion.confidence ?? 0} />
				<MetaTag>{getEnrichmentSuggestionStatusLabel(suggestion.status)}</MetaTag>
			</div>
			<div className="mt-2 grid gap-1 text-xs">
				<div className="truncate text-muted-foreground">当前：{suggestion.current_value || "未填写"}</div>
				<div className="truncate font-medium text-foreground">建议：{suggestion.recommended_value || "无"}</div>
			</div>
			{suggestion.status === "pending" && (
				<div className="mt-2 flex justify-end gap-2">
					<Button size="sm" variant="ghost" onClick={() => onReject(suggestion)} disabled={readOnly || saving}>
						忽略
					</Button>
					<Button
						size="sm"
						variant="outline"
						onClick={() => onAccept(suggestion)}
						disabled={readOnly || saving}
						className="gap-2"
					>
						<PencilIcon className="size-3.5" />
						写入
					</Button>
				</div>
			)}
		</>
	)
}

function EnrichmentSuggestionDetail({
	suggestion,
	readOnly,
	saving,
	onAccept,
	onReject,
}: {
	suggestion: AssetEnrichmentSuggestionRecord
	readOnly: boolean
	saving: boolean
	onAccept: (suggestion: AssetEnrichmentSuggestionRecord) => void
	onReject: (suggestion: AssetEnrichmentSuggestionRecord) => void
}) {
	return (
		<div
			className={cn(
				"rounded-lg border bg-surface-soft p-3",
				suggestion.conflict && suggestion.status === "pending" ? "border-amber-500/25" : "border-border/70"
			)}
		>
			<EnrichmentSuggestionCompact
				suggestion={suggestion}
				readOnly={readOnly}
				saving={saving}
				onAccept={onAccept}
				onReject={onReject}
			/>
			<div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
				<SuggestionValue label="资产主档" value={suggestion.current_value || "未填写"} />
				<SuggestionValue label="本地采集" value={suggestion.collected_value || "无"} />
				<SuggestionValue label="资料匹配" value={suggestion.online_value || "未接入"} />
				<SuggestionValue label="推荐写入" value={suggestion.recommended_value || "无"} />
			</div>
			{suggestion.notes && (
				<div className="mt-2 rounded-md border border-border/70 bg-card px-2.5 py-2 text-xs leading-5 text-muted-foreground">
					{suggestion.notes}
				</div>
			)}
			<EnrichmentSuggestionSources suggestion={suggestion} />
		</div>
	)
}

function EnrichmentSuggestionSources({ suggestion }: { suggestion: AssetEnrichmentSuggestionRecord }) {
	const links = getEnrichmentSuggestionSourceLinks(suggestion)
	if (links.length === 0) return null
	return (
		<div className="mt-2 rounded-md border border-border/70 bg-card px-2.5 py-2 text-xs">
			<div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-muted-foreground">
				<span>资料来源</span>
				{getMetadataStringArray(suggestion.metadata, "source_provider").map((provider) => (
					<MetaTag key={provider}>{getOnlineProviderLabel(provider)}</MetaTag>
				))}
			</div>
			<div className="grid gap-1">
				{links.map((link) => (
					<a
						key={link.url}
						href={link.url}
						target="_blank"
						rel="noreferrer"
						className="flex min-w-0 items-center gap-2 rounded border border-border/70 bg-surface-soft px-2 py-1.5 text-muted-foreground transition hover:border-primary/40 hover:text-primary"
					>
						<ExternalLinkIcon className="size-3.5 shrink-0" />
						<span className="truncate">{link.title || link.url}</span>
					</a>
				))}
			</div>
		</div>
	)
}

function EmptyReport() {
	return (
		<div className="grid place-items-center gap-2 rounded-lg border border-dashed border-border/70 bg-surface-soft px-4 py-8 text-center text-sm text-muted-foreground">
			<ListChecksIcon className="size-5" />
			<span>还没有识别报告。</span>
		</div>
	)
}

function SummaryMini({ label, value }: { label: string; value: number | string }) {
	return (
		<div className="rounded-md border border-border/70 bg-card px-2.5 py-2">
			<div className="text-[11px] text-muted-foreground">{label}</div>
			<div className="mt-1 font-mono text-base font-semibold tabular-nums text-foreground">{value}</div>
		</div>
	)
}

function ConfidenceTag({ confidence }: { confidence: number }) {
	const tone = confidence >= 90 ? "ok" : confidence >= 75 ? "warning" : "neutral"
	return <ToneTag tone={tone}>置信度 {confidence}%</ToneTag>
}

function MetaTag({ children }: { children: React.ReactNode }) {
	return (
		<span className="rounded-md border border-border/70 bg-card px-1.5 py-0.5 text-[11px] text-muted-foreground">
			{children}
		</span>
	)
}

function ToneTag({ children, tone }: { children: React.ReactNode; tone: "ok" | "warning" | "neutral" }) {
	const toneClass =
		tone === "ok"
			? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
			: tone === "warning"
				? "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-200"
				: "border-border/70 bg-card text-muted-foreground"
	return <span className={`rounded-md border px-1.5 py-0.5 text-[11px] ${toneClass}`}>{children}</span>
}

function formatReportTime(value: string) {
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return value
	return date.toLocaleString("zh-CN", { hour12: false })
}
