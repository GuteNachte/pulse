import { ActiveAlerts } from "@/components/active-alerts"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { getSystemDisplayName } from "@/lib/system-roles"
import { cn } from "@/lib/utils"
import type { ReactNode } from "react"
import type { SystemRecord, WebsiteMonitorCheckRecord, WebsiteMonitorRecord } from "@/types"
import { WebsiteDetailPanel } from "../routes/websites/detail-panel"
import type { StatusFilter } from "../routes/websites/types"
import type { MonitorTargetPayload } from "../routes/websites/types"
import { MobilePageShell, MobileStatusTag } from "./mobile-ui"

export function MobileWebsitesPage({
	statusCounts,
	children,
}: {
	statusCounts: Record<StatusFilter, number>
	children: ReactNode
}) {
	const actionTone =
		statusCounts.down > 0
			? "danger"
			: statusCounts.unknown > 0
				? "warning"
				: statusCounts.all > 0
					? "success"
					: "neutral"
	const actionText =
		statusCounts.down > 0
			? `${statusCounts.down} 异常`
			: statusCounts.unknown > 0
				? `${statusCounts.unknown} 待检测`
				: statusCounts.all > 0
					? "无异常"
					: "暂无监控"
	const subtitle =
		statusCounts.all > 0
			? `${statusCounts.up} 正常 / ${statusCounts.unknown} 待检测 / ${statusCounts.all} 总数`
			: "暂无互联网服务监控"

	return (
		<MobilePageShell
			title="网站"
			subtitle={subtitle}
			action={<MobileStatusTag tone={actionTone}>{actionText}</MobileStatusTag>}
		>
			<ActiveAlerts />
			{children}
		</MobilePageShell>
	)
}

export function MobileWebsiteDetailSheet({
	open,
	isMobile,
	selected,
	availableSystemsById,
	targets,
	checks,
	latestChecks,
	checksLoading,
	running,
	readOnly,
	onOpenChange,
	onCheck,
	onEdit,
	onToggle,
	onDelete,
}: {
	open: boolean
	isMobile: boolean
	selected?: WebsiteMonitorRecord
	availableSystemsById: Record<string, SystemRecord>
	targets: MonitorTargetPayload[]
	checks: WebsiteMonitorCheckRecord[]
	latestChecks: Record<string, WebsiteMonitorCheckRecord>
	checksLoading?: boolean
	running: boolean
	readOnly: boolean
	onOpenChange: (open: boolean) => void
	onCheck: () => void
	onEdit: () => void
	onToggle: () => void
	onDelete: () => void
}) {
	if (!open) {
		return null
	}

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side={isMobile ? "bottom" : "right"}
				className={cn(
					"w-full overflow-y-auto p-0",
					isMobile ? "max-h-[88dvh] rounded-t-2xl sm:max-w-none" : "sm:max-w-xl"
				)}
			>
				<SheetHeader className="sr-only">
					<SheetTitle>{selected?.name || "互联网服务监控详情"}</SheetTitle>
					<SheetDescription>查看网站检测地址、状态、历史趋势和操作入口。</SheetDescription>
				</SheetHeader>
				<WebsiteDetailPanel
					selected={selected}
					systemName={selected?.system ? getSystemDisplayName(availableSystemsById[selected.system], "") : ""}
					targets={targets}
					checks={checks}
					latestChecks={latestChecks}
					checksLoading={checksLoading}
					running={running}
					readOnly={readOnly}
					onCheck={onCheck}
					onEdit={onEdit}
					onToggle={onToggle}
					onDelete={onDelete}
				/>
			</SheetContent>
		</Sheet>
	)
}
