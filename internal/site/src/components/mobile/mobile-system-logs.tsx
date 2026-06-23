import { CopyIcon, FileTextIcon } from "lucide-react"
import { useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { copyToClipboard } from "@/lib/utils"
import {
	MobileEmptyState,
	MobileList,
	MobileListItem,
	MobileSection,
	MobileStatusTag,
	type MobileStatusTone,
} from "./mobile-ui"

export type MobileSystemLogItem = {
	id: string
	created: string
	levelLabel: string
	levelTone: MobileStatusTone
	title: string
	subtitle: string
	focus: string
	message: string
	entries: [string, string][]
	formattedData: string
}

export function MobileSystemLogList({
	items,
	loading,
	pageInfo,
	onPreviousPage,
	onNextPage,
}: {
	items: MobileSystemLogItem[]
	loading: boolean
	pageInfo?: {
		start: number
		end: number
		currentPage: number
		canPrevious: boolean
		canNext: boolean
		hasMore: boolean
	}
	onPreviousPage: () => void
	onNextPage: () => void
}) {
	const [selectedItem, setSelectedItem] = useState<MobileSystemLogItem | null>(null)

	return (
		<div className="md:hidden">
			<MobileSection title="日志记录" count={pageInfo ? `第 ${pageInfo.currentPage + 1} 页` : `${items.length} 条`}>
				{items.length ? (
					<MobileList>
						{items.map((item) => (
							<MobileSystemLogCard key={item.id} item={item} onOpen={() => setSelectedItem(item)} />
						))}
					</MobileList>
				) : (
					<MobileEmptyState loading={loading}>{loading ? "正在读取系统日志" : "暂无日志"}</MobileEmptyState>
				)}
			</MobileSection>
			{pageInfo && (
				<div className="grid gap-2 rounded-lg border border-border/70 bg-surface-soft p-3 text-xs text-muted-foreground shadow-none">
					<div>
						显示第 {pageInfo.start} - {pageInfo.end} 条{pageInfo.hasMore ? "，后面还有更多" : ""}
					</div>
					<div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="min-h-10 justify-center transition-transform active:scale-[0.96]"
							disabled={!pageInfo.canPrevious}
							onClick={onPreviousPage}
						>
							上一页
						</Button>
						<span className="min-w-14 text-center text-sm tabular-nums">第 {pageInfo.currentPage + 1} 页</span>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="min-h-10 justify-center transition-transform active:scale-[0.96]"
							disabled={!pageInfo.canNext}
							onClick={onNextPage}
						>
							下一页
						</Button>
					</div>
				</div>
			)}
			<MobileSystemLogSheet item={selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)} />
		</div>
	)
}

function MobileSystemLogCard({ item, onOpen }: { item: MobileSystemLogItem; onOpen: () => void }) {
	return (
		<MobileListItem onClick={onOpen}>
			<div className="flex min-w-0 items-start justify-between gap-3">
				<div className="min-w-0 flex-1">
					<div className="truncate text-[15px] font-semibold">{item.title}</div>
					<div className="mt-1 truncate text-xs text-muted-foreground">{item.subtitle || item.message || "-"}</div>
				</div>
				<MobileStatusTag tone={item.levelTone}>{item.levelLabel}</MobileStatusTag>
			</div>
			<div className="mt-3 rounded-md border border-border/70 bg-surface-soft px-3 py-2 text-sm leading-relaxed text-muted-foreground">
				{item.focus || "没有重点字段"}
			</div>
			<div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
				<span className="truncate">{item.created}</span>
				<span className="inline-flex items-center gap-1 font-medium text-foreground">
					<FileTextIcon className="size-3.5" />
					详情
				</span>
			</div>
		</MobileListItem>
	)
}

function MobileSystemLogSheet({
	item,
	onOpenChange,
}: {
	item: MobileSystemLogItem | null
	onOpenChange: (open: boolean) => void
}) {
	return (
		<Sheet open={Boolean(item)} onOpenChange={onOpenChange}>
			<SheetContent side="bottom" className="max-h-[88dvh] rounded-t-lg p-0 sm:max-w-none">
				<SheetHeader className="border-b border-border/70 bg-surface-soft px-4 py-4 pr-28">
					<SheetTitle>日志详情</SheetTitle>
					<SheetDescription>
						{item ? `${item.created} · ${item.levelLabel} · ${item.title}` : "查看 Hub 运行事件详情"}
					</SheetDescription>
				</SheetHeader>
				{item && (
					<div className="grid gap-4 overflow-y-auto bg-surface-soft px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4">
						<Button
							type="button"
							variant="secondary"
							size="sm"
							className="absolute right-16 top-4 min-h-10 gap-1.5 px-3 transition-transform active:scale-[0.96]"
							onClick={() => copyToClipboard(buildMobileLogCopyText(item))}
						>
							<CopyIcon className="size-4" />
							复制
						</Button>
						<MobileLogDetailSection title="重点信息">
							<div className="rounded-lg border border-border/70 bg-card p-3 text-sm leading-relaxed shadow-none">
								<div className="font-medium text-foreground">{item.title}</div>
								<div className="mt-1 text-muted-foreground">{item.focus || "没有重点字段"}</div>
							</div>
						</MobileLogDetailSection>
						<MobileLogDetailSection title="原始消息">
							<div className="break-words rounded-lg border border-border/70 bg-card p-3 font-mono text-xs leading-relaxed text-muted-foreground shadow-none">
								{item.message || "-"}
							</div>
						</MobileLogDetailSection>
						<MobileLogDetailSection title="可读字段">
							{item.entries.length ? (
								<div className="grid gap-2 rounded-lg border border-border/70 bg-card p-3 shadow-none">
									{item.entries.map(([label, value]) => (
										<div key={label} className="grid gap-1">
											<div className="text-xs text-muted-foreground">{label}</div>
											<div className="break-words text-sm">{value}</div>
										</div>
									))}
								</div>
							) : (
								<div className="rounded-lg border border-border/70 bg-card p-3 text-sm text-muted-foreground shadow-none">
									没有附加数据
								</div>
							)}
						</MobileLogDetailSection>
						{item.formattedData !== "-" && (
							<MobileLogDetailSection title="原始数据">
								<pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/70 bg-card p-3 font-mono text-xs leading-relaxed text-muted-foreground shadow-none">
									{item.formattedData}
								</pre>
							</MobileLogDetailSection>
						)}
					</div>
				)}
			</SheetContent>
		</Sheet>
	)
}

function buildMobileLogCopyText(item: MobileSystemLogItem) {
	return [
		`时间: ${item.created}`,
		`级别: ${item.levelLabel}`,
		`事件: ${item.title}`,
		`重点: ${item.focus || "-"}`,
		`消息: ${item.message || "-"}`,
		item.entries.length
			? `字段:\n${item.entries.map(([label, value]) => `- ${label}: ${value}`).join("\n")}`
			: "字段: 无",
		item.formattedData !== "-" ? `原始数据:\n${item.formattedData}` : "原始数据: 无",
	].join("\n")
}

function MobileLogDetailSection({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="grid gap-2">
			<div className="text-sm font-semibold">{title}</div>
			{children}
		</section>
	)
}
