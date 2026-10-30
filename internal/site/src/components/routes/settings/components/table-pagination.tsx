import { Button } from "@/components/ui/button"

/**
 * 日志 / 审计等分页表格共用的页脚：左侧页码信息，右侧上一页 / 下一页。
 */
export function SettingsTablePagination({
	currentPage,
	pageStart,
	pageEnd,
	hasMore,
	onPrevious,
	onNext,
}: {
	currentPage: number
	pageStart: number
	pageEnd: number
	hasMore: boolean
	onPrevious: () => void
	onNext: () => void
}) {
	if (currentPage === 0 && !hasMore) {
		return null
	}
	return (
		<div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-sm text-muted-foreground">
			<div>
				显示第 {pageStart} - {pageEnd} 条{hasMore ? "，后面还有更多" : ""}
			</div>
			<div className="flex items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					className="transition-transform active:scale-[0.96]"
					disabled={currentPage === 0}
					onClick={onPrevious}
				>
					上一页
				</Button>
				<span className="min-w-20 text-center tabular-nums">第 {currentPage + 1} 页</span>
				<Button
					variant="outline"
					size="sm"
					className="transition-transform active:scale-[0.96]"
					disabled={!hasMore}
					onClick={onNext}
				>
					下一页
				</Button>
			</div>
		</div>
	)
}
