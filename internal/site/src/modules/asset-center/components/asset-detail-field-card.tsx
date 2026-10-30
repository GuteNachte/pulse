import { GripVerticalIcon, Trash2Icon } from "lucide-react"
import { useState, type DragEvent, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import type { AssetParameterGroup, AssetParameterRow } from "./asset-parameter-columns"
import {
	getParameterStatusDotClass,
	getParameterStatusTone,
	splitParameterFeatureTags,
	splitParameterNumberUnit,
} from "../asset-parameter-value"

const GROUP_DRAG_MIME = "application/x-pulse-group"
const PARAM_DRAG_MIME = "application/x-pulse-param"

function rowValue(row: AssetParameterRow) {
	const value = row.value || (row.cells ?? []).filter(Boolean).join(" · ")
	return value.trim() === "未设置" || value.trim() === "—" ? "" : value
}

export function hasVisibleGroupRows(group: AssetParameterGroup) {
	return group.rows.some((row) => rowValue(row))
}

// 2026-10-20 硬件档案自定义：编辑态支持分组拖拽排序、重命名/删除、底部加参数；
// 自定义参数行可拖到其他分组（预设字段仍固定在所属分类，避免破坏硬件分类语义）。
export function AssetDetailFieldCard({
	group,
	action,
	editing = false,
	onDelete,
	onDropGroup,
	onDropParam,
}: {
	group: AssetParameterGroup
	action?: ReactNode
	editing?: boolean
	onDelete?: () => void
	onDropGroup?: (sourceGroupId: string) => void
	onDropParam?: (key: string, fromGroupId: string) => void
}) {
	const rows = group.rows.map((row) => ({ row, value: rowValue(row) })).filter((item) => item.value)
	const [dropActive, setDropActive] = useState(false)
	const canAcceptDrop = editing && Boolean(onDropGroup || onDropParam)
	if (rows.length === 0 && !editing) return null

	function handleDragOver(event: DragEvent<HTMLElement>) {
		if (!canAcceptDrop) return
		event.preventDefault()
		event.dataTransfer.dropEffect = "move"
		setDropActive(true)
	}

	function handleDrop(event: DragEvent<HTMLElement>) {
		if (!canAcceptDrop) return
		event.preventDefault()
		setDropActive(false)
		const groupId = event.dataTransfer.getData(GROUP_DRAG_MIME)
		if (groupId && onDropGroup) {
			onDropGroup(groupId)
			return
		}
		const rawParam = event.dataTransfer.getData(PARAM_DRAG_MIME)
		if (rawParam && onDropParam) {
			try {
				const payload = JSON.parse(rawParam) as { key?: string; fromGroup?: string }
				if (payload.key && payload.fromGroup) onDropParam(payload.key, payload.fromGroup)
			} catch {
				// 非本应用的拖拽数据，忽略
			}
		}
	}

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: 分组卡片兼作参数拖拽放置区，键盘操作由卡片内按钮承担
		<section
			className={cn(
				"min-w-0 rounded-lg border border-border/70 bg-card p-3 transition-colors",
				dropActive && "border-primary/60 bg-primary/5 ring-1 ring-primary/20"
			)}
			onDragOver={handleDragOver}
			onDragLeave={() => setDropActive(false)}
			onDrop={handleDrop}
		>
			<header className="flex min-w-0 items-center justify-between gap-2">
				<div className="flex min-w-0 items-center gap-1.5">
					{editing && onDropGroup ? (
						<button
							type="button"
							draggable
							aria-label={`拖动分组 ${group.title}`}
							title="拖动调整分组顺序"
							className="grid size-5 shrink-0 cursor-grab place-items-center rounded text-muted-foreground hover:bg-surface-soft hover:text-foreground active:cursor-grabbing"
							onDragStart={(event) => {
								event.dataTransfer.setData(GROUP_DRAG_MIME, group.id)
								event.dataTransfer.effectAllowed = "move"
							}}
						>
							<GripVerticalIcon className="size-3.5" />
						</button>
					) : null}
					<span className="grid size-6 shrink-0 place-items-center rounded border border-border/70 bg-surface-soft text-muted-foreground">
						{group.icon}
					</span>
					<h3 className="min-w-0 truncate text-xs font-semibold text-foreground">{group.title}</h3>
				</div>
				{action || (editing && onDelete) ? (
					<div className="flex shrink-0 items-center gap-1">
						{action}
						{editing && onDelete ? (
							<button
								type="button"
								title="删除分组"
								aria-label={`删除分组 ${group.title}`}
								onClick={onDelete}
								className="grid size-6 place-items-center rounded border border-border/70 bg-card text-muted-foreground hover:border-destructive/50 hover:text-destructive"
							>
								<Trash2Icon className="size-3" />
							</button>
						) : null}
					</div>
				) : null}
			</header>
			<div className="mt-2 grid gap-y-0.5">
				{rows.length === 0 ? (
					<div className="text-xs text-muted-foreground">暂无参数，点右上角「编辑」进入添加。</div>
				) : (
					rows.map(({ row, value }, index) => {
						const canDragRow = editing && Boolean(onDropParam) && row.section === "自定义参数" && Boolean(row.key)
						const numberUnit = row.href ? undefined : splitParameterNumberUnit(value)
						const statusTone = row.href ? undefined : getParameterStatusTone(value)
						const featureTags = row.href ? undefined : splitParameterFeatureTags(value)
						return (
							<div
								key={`${row.label}-${index}`}
								className="flex min-h-7 min-w-0 items-center justify-between gap-2 border-b border-border/30 py-0.5 last:border-b-0"
							>
								<span className="flex min-w-0 items-center gap-1">
									{canDragRow ? (
										<button
											type="button"
											draggable
											aria-label={`拖动参数 ${row.label}`}
											title="拖到其他分组"
											className="grid size-4 shrink-0 cursor-grab place-items-center rounded text-muted-foreground/70 hover:text-foreground active:cursor-grabbing"
											onDragStart={(event) => {
												event.dataTransfer.setData(
													PARAM_DRAG_MIME,
													JSON.stringify({ key: row.key, fromGroup: group.id })
												)
												event.dataTransfer.effectAllowed = "move"
											}}
										>
											<GripVerticalIcon className="size-3" />
										</button>
									) : null}
									<span className="shrink-0 text-xs text-muted-foreground">{row.label}</span>
								</span>
								<span
									title={value}
									className={cn("min-w-0 truncate text-right text-[13px] text-foreground", row.href && "text-primary")}
								>
									{row.href ? (
										<a href={row.href} target="_blank" rel="noreferrer" className="hover:underline">
											{value}
										</a>
									) : featureTags ? (
										<span className="flex flex-wrap justify-end gap-1">
											{featureTags.map((tag) => (
												<span key={tag} className="rounded bg-surface-soft px-1.5 py-0.5 text-[11px] text-foreground">
													{tag}
												</span>
											))}
										</span>
									) : numberUnit ? (
										<span className="inline-flex items-baseline justify-end gap-1">
											<span className="text-sm font-semibold text-foreground">{numberUnit.number}</span>
											<span className="text-[11px] text-muted-foreground">{numberUnit.unit}</span>
										</span>
									) : statusTone ? (
										<span className="inline-flex items-center justify-end gap-1.5">
											<span className={cn("size-1.5 rounded-full", getParameterStatusDotClass(statusTone))} />
											{value}
										</span>
									) : (
										value
									)}
								</span>
							</div>
						)
					})
				)}
			</div>
		</section>
	)
}
