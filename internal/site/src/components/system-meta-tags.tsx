import { Badge } from "@/components/ui/badge"
import { getPrimaryUseLabel, getSystemRoleDisplayLabel } from "@/lib/system-roles"
import { cn } from "@/lib/utils"
import type { SystemRecord } from "@/types"
import type { ReactNode } from "react"

export function SystemMetaTags({
	system,
	className,
	showAlertEnrollment = false,
	showHomeVisibility = true,
}: {
	system: SystemRecord
	className?: string
	showAlertEnrollment?: boolean
	showHomeVisibility?: boolean
}) {
	const roleLabel =
		system.role === "virtualization"
			? "虚拟机"
			: getSystemRoleDisplayLabel(system.role, system.custom_role, system.name)
	const primaryUseLabel = getPrimaryUseLabel(system.primary_use)
	const showNasTag = isNasSystem(system)

	return (
		<div className={cn("flex min-w-0 flex-wrap items-center gap-1.5", className)}>
			<SystemMetaTag>{roleLabel}</SystemMetaTag>
			{system.is_local && <SystemMetaTag tone="hub">Hub</SystemMetaTag>}
			{showNasTag && <SystemMetaTag tone="muted">NAS</SystemMetaTag>}
			<SystemMetaTag>{primaryUseLabel}</SystemMetaTag>
			{showHomeVisibility && system.hide_from_home && <SystemMetaTag tone="muted">首页隐藏</SystemMetaTag>}
			{showAlertEnrollment && system.suppress_offline_alerts && (
				<SystemMetaTag tone="muted">未加入离线告警</SystemMetaTag>
			)}
		</div>
	)
}

function isNasSystem(system: SystemRecord) {
	return system.is_nas === true
}

export function SystemMetaTag({
	children,
	tone = "default",
	className,
}: {
	children: ReactNode
	tone?: "default" | "muted" | "warning" | "hub"
	className?: string
}) {
	return (
		<Badge
			variant="outline"
			className={cn(
				"h-[22px] shrink-0 rounded-md border px-2 text-[11px] font-medium leading-none shadow-none",
				"border-border/70 bg-surface-soft text-muted-foreground dark:border-border/70 dark:bg-surface-soft dark:text-muted-foreground",
				tone === "muted" &&
					"border-border/70 bg-surface-soft text-muted-foreground dark:border-border/70 dark:bg-surface-soft dark:text-muted-foreground",
				tone === "warning" &&
					"border-amber-500/24 bg-card text-amber-800 dark:border-amber-300/18 dark:bg-card dark:text-amber-100",
				tone === "hub" &&
					"border-emerald-500/24 bg-card text-emerald-800 dark:border-emerald-300/18 dark:bg-card dark:text-emerald-100",
				className
			)}
		>
			{children}
		</Badge>
	)
}
