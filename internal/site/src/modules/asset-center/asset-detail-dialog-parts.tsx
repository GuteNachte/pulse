// 资产详情弹窗的共享表单区块与日期辅助，从 asset-detail-page.tsx 外移（纯展示、无状态捕获）。
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

import { getStatusLabel } from "./asset-schema"
import { getInternetStatusLabel } from "./asset-type-specs"

export function DialogFormSection({
	icon,
	title,
	description,
	children,
}: {
	icon: ReactNode
	title: string
	description: string
	children: ReactNode
}) {
	return (
		<section className="rounded-lg border border-border/70 bg-surface-soft p-3">
			<div className="mb-3 flex min-w-0 items-start gap-2">
				<span className="grid size-8 shrink-0 place-items-center rounded-md border border-border/70 bg-card text-muted-foreground">
					{icon}
				</span>
				<div className="min-w-0">
					<div className="text-sm font-semibold text-foreground">{title}</div>
					<div className="mt-1 text-xs leading-5 text-muted-foreground">{description}</div>
				</div>
			</div>
			<div className="grid gap-3 sm:grid-cols-2">{children}</div>
		</section>
	)
}

export function StatusBadge({
	status,
	internet = false,
}: {
	status: "active" | "inactive" | "retired" | "planned"
	internet?: boolean
}) {
	return (
		<span
			className={cn(
				"inline-flex min-h-6 items-center rounded-md border px-2 text-xs font-medium",
				status === "active"
					? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
					: status === "planned"
						? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
						: "border-border/70 bg-card text-muted-foreground"
			)}
		>
			{internet ? getInternetStatusLabel(status) : getStatusLabel(status)}
		</span>
	)
}

export function yesNoOptions() {
	return [
		{ value: "yes", label: "是" },
		{ value: "no", label: "否" },
	]
}

export function wait(ms: number) {
	return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export function normalizeDateInput(value?: string) {
	const trimmed = value?.trim()
	if (!trimmed) return undefined
	return `${trimmed} 00:00:00.000Z`
}
