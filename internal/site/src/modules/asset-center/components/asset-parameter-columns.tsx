import { ExternalLinkIcon, ListChecksIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { getAssetParameterSectionId } from "../asset-parameter-navigation"
import type { AssetFieldDefinition } from "../asset-schema"
import { AssetParameterNavigator } from "./asset-parameter-navigator"

export type AssetParameterRow = {
	label: string
	value: string
	href?: string
	capture?: AssetFieldDefinition["capture"]
	section?: string
}

export type AssetParameterGroup = {
	id: string
	title: string
	summary: string
	icon: ReactNode
	rows: AssetParameterRow[]
}

export type AssetIdentitySection = {
	title: string
	rows: AssetParameterRow[]
}

export function AssetOverviewColumn({
	sections,
	title = "设备档案",
	subtitle = "主档与接入信息",
}: {
	sections: AssetIdentitySection[]
	title?: string
	subtitle?: string | null
}) {
	return (
		<Card className="border-border/70 bg-card shadow-none">
			<CardHeader className="border-b border-border/70 px-4 py-3">
				<div className="flex items-center justify-between gap-3">
					<CardTitle className="truncate text-base">{title}</CardTitle>
					{subtitle ? <span className="text-[11px] text-muted-foreground">{subtitle}</span> : null}
				</div>
			</CardHeader>
			<CardContent className="grid gap-3 p-3">
				{sections.map((section) => (
					<section key={section.title} className="grid gap-2">
						<div className="text-[11px] font-semibold text-muted-foreground">{section.title}</div>
						<div className="grid gap-2 sm:grid-cols-2">
							{section.rows.map((row) => (
								<CompactParameterRow key={`${section.title}-${row.label}`} row={row} />
							))}
						</div>
					</section>
				))}
			</CardContent>
		</Card>
	)
}

export function AssetHardwareSpecsColumn({
	groups,
	title = "硬件档案",
	description = "按设备类别整理的已确认规格",
	emptyLabel = "暂无已确认的硬件参数。",
	groupActions,
}: {
	groups: AssetParameterGroup[]
	title?: string
	description?: string | null
	emptyLabel?: string
	groupActions?: Record<string, ReactNode>
}) {
	return (
		<Card className="border-border/70 bg-card shadow-none">
			<CardHeader className="border-b border-border/70 px-4 py-3">
				<div className="flex min-w-0 items-center justify-between gap-3">
					<div className="min-w-0">
						<CardTitle className="truncate text-base">{title}</CardTitle>
						{description ? <div className="mt-0.5 text-[11px] text-muted-foreground">{description}</div> : null}
					</div>
					{groups.length > 0 ? <CountTag>{groups.length} 类</CountTag> : null}
				</div>
				<AssetParameterNavigator groups={groups} variant="inline" className="mt-3 xl:hidden" />
			</CardHeader>
			<CardContent className="grid gap-2.5 p-3 sm:grid-cols-2">
				{groups.length > 0 ? (
					groups.map((group) => <HardwareSpecGroup key={group.id} group={group} action={groupActions?.[group.title]} />)
				) : (
					<div className="grid min-h-28 place-items-center gap-2 rounded-md border border-dashed border-border/70 bg-surface-soft px-4 py-5 text-center sm:col-span-2">
						<ListChecksIcon className="size-5 text-muted-foreground" />
						<p className="text-sm text-muted-foreground">{emptyLabel}</p>
					</div>
				)}
			</CardContent>
		</Card>
	)
}

function HardwareSpecGroup({ group, action }: { group: AssetParameterGroup; action?: ReactNode }) {
	const rowSections = groupRowsBySection(group.rows)
	const hasNamedSections = rowSections.some((section) => section.title)
	return (
		<section
			id={getAssetParameterSectionId(group.id)}
			data-asset-parameter-group-id={group.id}
			className={cn(
				"grid min-w-0 scroll-mt-28 content-start gap-2.5 rounded-md border border-border/70 bg-surface-soft p-3",
				group.rows.length > 6 && "sm:col-span-2"
			)}
		>
			<div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
				<div className="flex min-w-0 items-start gap-2">
					<span className="grid size-8 shrink-0 place-items-center rounded-md border border-border/70 bg-card text-muted-foreground">
						{group.icon}
					</span>
					<div className="min-w-0">
						<div className="truncate text-sm font-semibold text-foreground">{group.title}</div>
						<div className="mt-0.5 truncate text-[11px] text-muted-foreground">{group.summary}</div>
					</div>
				</div>
				{action ? <div className="ms-auto min-w-0">{action}</div> : null}
			</div>
			<div className="grid gap-1.5 border-t border-border/60 pt-2">
				{rowSections.map((section) => (
					<section key={`${group.id}-${section.title || "default"}`} className="grid gap-1">
						{hasNamedSections && section.title ? (
							<div className="px-0.5 text-[11px] font-semibold text-muted-foreground">{section.title}</div>
						) : null}
						<div className="grid gap-0.5">
							{section.rows.map((row) => (
								<CompactSpecRow key={`${group.id}-${section.title}-${row.label}`} row={row} />
							))}
						</div>
					</section>
				))}
			</div>
		</section>
	)
}

function CompactParameterRow({ row }: { row: AssetParameterRow }) {
	const value = row.href ? (
		<a
			href={row.href}
			target="_blank"
			rel="noreferrer"
			className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
		>
			<span className="min-w-0 truncate">{row.value}</span>
			<ExternalLinkIcon className="size-3 shrink-0" />
		</a>
	) : (
		<div className="min-w-0 truncate text-xs font-medium text-foreground">{row.value}</div>
	)
	return (
		<div className="grid min-h-9 grid-cols-[3.75rem_minmax(0,1fr)] items-center gap-2 rounded-md border border-border/70 bg-surface-soft px-2 py-1">
			<div className="truncate text-[11px] text-muted-foreground">{row.label}</div>
			{value}
		</div>
	)
}

function CompactSpecRow({ row }: { row: AssetParameterRow }) {
	const value = row.href ? (
		<a
			href={row.href}
			target="_blank"
			rel="noreferrer"
			className="inline-flex min-w-0 max-w-full items-center gap-1.5 break-all text-xs font-medium text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
		>
			<span className="min-w-0 break-all">{row.value}</span>
			<ExternalLinkIcon className="size-3 shrink-0" />
		</a>
	) : (
		<div className="min-w-0 break-words text-xs font-medium leading-relaxed text-foreground">{row.value}</div>
	)
	return (
		<div className="grid min-w-0 grid-cols-[6.5rem_minmax(0,1fr)] items-baseline gap-2 rounded-sm px-1.5 py-0.5">
			<div className="min-w-0 break-words text-[11px] leading-relaxed text-muted-foreground">{row.label}</div>
			{value}
		</div>
	)
}

function CountTag({ children }: { children: ReactNode }) {
	return (
		<span className="inline-flex min-h-6 shrink-0 items-center rounded-md border border-border/70 bg-card px-2 text-xs font-medium text-muted-foreground">
			{children}
		</span>
	)
}

function groupRowsBySection(rows: AssetParameterRow[]) {
	const sections: { title: string; rows: AssetParameterRow[] }[] = []
	for (const row of rows) {
		const title = row.section ?? ""
		let section = sections.find((item) => item.title === title)
		if (!section) {
			section = { title, rows: [] }
			sections.push(section)
		}
		section.rows.push(row)
	}
	return sections
}
