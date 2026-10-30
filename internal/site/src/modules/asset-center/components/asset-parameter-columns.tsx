import { ExternalLinkIcon, ListChecksIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { AssetFieldDefinition } from "../asset-schema"

export type AssetParameterRow = {
	label: string
	value: string
	href?: string
	capture?: AssetFieldDefinition["capture"]
	section?: string
	// 2026-10-12 紧凑化试点：表格布局的多列单元格（如网络接口行：品牌/型号/速率）
	cells?: string[]
	// 2026-10-12 用户拍板：插槽/盘位行首绿点=在用、灰点=未用（undefined 时不渲染状态点）
	inUse?: boolean
	// 2026-10-17 用户拍板：行键（预设字段 key / 自定义参数键）——用于 _param_order 自定义排序
	key?: string
}

// 2026-10-12 紧凑化试点（用户拍板先做外观+网络看效果）：外观=格子流，网络=接口表格；其余分类维持行式
// 2026-10-12 续：内存/存储=支持规格格子 + 实际安装表格（按插槽/盘位成行，行数随数据模型扩展）；
// fullRow=表格组在两列网格里独占整行（内存/存储/网络参数多）；
// splitAt=官方/接口属性列与实际安装/连接设备列的分割点（cells 索引，该列前加左边框）
export type AssetParameterGroupLayout = {
	layout: "grid" | "table" | "support-install"
	headers?: string[]
	// 2026-10-14 用户拍板：表头分组行——表格左半/右半的分组标题（内存/存储=支持规格|实际安装，网络=网口属性|实际接入）
	groupLabels?: [string, string]
	fullRow?: boolean
	splitAt?: number
	// 2026-10-18 用户拍板：物理规格 6 项按 3 列铺排，正好两排
	columns?: 2 | 3 | 4
}

const COMPACT_GROUP_LAYOUTS: Record<string, AssetParameterGroupLayout> = {
	// 2026-10-18 用户拍板：物理规格格子多，整行撑满——后半部分其余短分组两两配对，排列整齐
	"asset-parameter-appearance": { layout: "grid", fullRow: true, columns: 3 },
	// 2026-10-17 用户拍板：显示输出独立成组（格子流）
	"asset-parameter-display_output": { layout: "grid" },
	"asset-parameter-network": {
		// 2026-10-17 用户拍板：网络与内存/存储同构——规范参数（芯片/速率/协议/模块/蓝牙）格子，
		// 表格只放接口与接入：接口 | 接口类型 | 连接的设备
		layout: "support-install",
		headers: ["接口", "接口类型", "连接的设备"],
		fullRow: true,
	},
	"asset-parameter-memory": {
		layout: "support-install",
		// 2026-10-17 用户拍板：内存重设计——规范参数单独铺格子，表格只显示每个插槽的实际安装
		headers: ["内存插槽", "内存类型", "容量", "频率", "品牌", "规格"],
		fullRow: true,
	},
	"asset-parameter-storage": {
		// 2026-10-17 用户拍板：存储与内存同构——规范参数（插槽数/硬盘类型支持/接口/协议版本/每槽最大容量）格子，
		// 表格只显示每个盘位的实际安装
		layout: "support-install",
		headers: ["盘位", "品牌", "型号", "容量", "硬盘类型"],
		fullRow: true,
	},
	// 2026-10-18 移除特色功能后共 11 组，系统与软件改为整行，保证两两配对无空缺
	"asset-parameter-system": { layout: "grid", fullRow: true },
}

function groupGridColumnsClass(columns?: 2 | 3 | 4) {
	if (columns === 2) return "grid-cols-1 sm:grid-cols-2"
	if (columns === 3) return "grid-cols-2 sm:grid-cols-3"
	return "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4"
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
	actions,
}: {
	sections: AssetIdentitySection[]
	title?: string
	subtitle?: string | null
	// 2026-10-06 布局统一：编辑页在标题行右侧放「编辑」按钮，展示页不传
	actions?: ReactNode
}) {
	return (
		<Card className="border-border/70 bg-card shadow-none">
			<CardHeader className="border-b border-border/70 px-4 py-3">
				<div className="flex items-center justify-between gap-3">
					<CardTitle className="truncate text-base">{title}</CardTitle>
					{actions ? (
						<div className="shrink-0">{actions}</div>
					) : subtitle ? (
						<span className="text-[11px] text-muted-foreground">{subtitle}</span>
					) : null}
				</div>
			</CardHeader>
			<CardContent className="grid gap-3 p-3">
				{sections.map((section) => (
					<section key={section.title || "default"} className="grid gap-2">
						{/* 2026-10-17 用户拍板：单区块卡（如「基本信息」）不再重复小标题 */}
						{section.title ? (
							<div className="text-[11px] font-semibold text-muted-foreground">{section.title}</div>
						) : null}
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
	headerAction,
}: {
	groups: AssetParameterGroup[]
	title?: string
	description?: string | null
	emptyLabel?: string
	groupActions?: Record<string, ReactNode>
	// 2026-10-11 布局统一：卡头右侧动作槽（编辑页放「Agent 填写参数」入口，展示页不传）
	headerAction?: ReactNode
}) {
	return (
		<Card className="border-border/70 bg-card shadow-none">
			<CardHeader className="border-b border-border/70 px-4 py-3">
				<div className="flex min-w-0 items-center justify-between gap-3">
					<div className="min-w-0">
						<CardTitle className="truncate text-base">{title}</CardTitle>
						{description ? <div className="mt-0.5 text-[11px] text-muted-foreground">{description}</div> : null}
					</div>
					<div className="flex shrink-0 items-center gap-1.5">
						{headerAction}
						{groups.length > 0 ? <CountTag>{groups.length} 类</CountTag> : null}
					</div>
				</div>
			</CardHeader>
			<CardContent className="grid items-stretch pulse-card-gap p-3 lg:grid-cols-2">
				{groups.length > 0 ? (
					groups.map((group) => (
						<HardwareSpecGroup
							key={group.id}
							group={group}
							action={groupActions?.[group.title]}
							layout={COMPACT_GROUP_LAYOUTS[group.id]}
							tableHeaders={COMPACT_GROUP_LAYOUTS[group.id]?.headers}
							groupLabels={COMPACT_GROUP_LAYOUTS[group.id]?.groupLabels}
							fullRow={COMPACT_GROUP_LAYOUTS[group.id]?.fullRow}
						/>
					))
				) : (
					<div className="grid min-h-28 place-items-center gap-2 rounded-md border border-dashed border-border/70 bg-surface-soft px-4 py-5 text-center lg:col-span-2">
						<ListChecksIcon className="size-5 text-muted-foreground" />
						<p className="text-sm text-muted-foreground">{emptyLabel}</p>
					</div>
				)}
			</CardContent>
		</Card>
	)
}

function HardwareSpecGroup({
	group,
	action,
	layout,
	tableHeaders,
	groupLabels,
	fullRow,
}: {
	group: AssetParameterGroup
	action?: ReactNode
	layout?: AssetParameterGroupLayout
	tableHeaders?: string[]
	groupLabels?: [string, string]
	fullRow?: boolean
}) {
	const rowSections = groupRowsBySection(group.rows)
	// 2026-10-17 表格布局：有表格列的行进表格，无表格列的行（自定义参数等）在表格下方铺格子
	const tableRows = group.rows.filter((row) => row.cells?.length)
	const extraRows = group.rows.filter((row) => !row.cells?.length)
	return (
		<section
			id={`asset-parameter-${group.id}`}
			data-asset-parameter-group-id={group.id}
			className={cn(
				"grid min-w-0 scroll-mt-28 content-start gap-2.5 rounded-md border border-border/70 bg-surface-soft p-3",
				fullRow && "lg:col-span-2"
			)}
		>
			<div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
				<div className="flex min-w-0 items-center gap-2">
					<span className="grid size-8 shrink-0 place-items-center rounded-md border border-border/70 bg-card text-muted-foreground">
						{group.icon}
					</span>
					{/* 2026-10-12 用户拍板：去掉组标题下的小字摘要（参数值已在表格/格子里，摘要冗余） */}
					<div className="min-w-0 truncate text-sm font-semibold text-foreground">{group.title}</div>
				</div>
				{action ? <div className="ms-auto min-w-0">{action}</div> : null}
			</div>
			{/* 2026-10-17 用户拍板：计算设备固化分类空组占位——删光参数后分组仍在，提示可点「编辑」补充 */}
			{group.rows.length === 0 ? (
				<div className="rounded-md border border-dashed border-border/70 bg-card px-3 py-3 text-center text-xs text-muted-foreground">
					暂无参数
				</div>
			) : layout?.layout === "support-install" ? (
				// 2026-10-12 内存/存储：支持规格走格子，实际安装按插槽/盘位表格成行（无 cells 时回退行式）
				<div className="grid gap-2 border-t border-border/60 pt-2">
					{rowSections.map((section) => (
						<section key={`${group.id}-${section.title || "default"}`} className="grid gap-1">
							{/* 2026-10-17 用户拍板：组内小分类标题（自定义参数/接口规格等）不再显示，内容直接平铺 */}
							{section.title === "实际安装" && section.rows.some((row) => row.cells?.length) ? (
								<table className="w-full border-collapse text-xs">
									<thead>
										{groupLabels && layout?.splitAt !== undefined && (tableHeaders ?? []).length > 0 ? (
											<tr className="text-left text-[11px] font-semibold text-muted-foreground">
												<th colSpan={layout.splitAt + 1} className="px-2 pb-1">
													{groupLabels[0]}
												</th>
												<th
													colSpan={(tableHeaders ?? []).length - layout.splitAt - 1}
													className="border-l-2 border-muted-foreground/40 px-2 pb-1 ps-3"
												>
													{groupLabels[1]}
												</th>
											</tr>
										) : null}
										<tr className="text-left text-[11px] text-muted-foreground">
											{(tableHeaders ?? []).map((header, headerIndex) => (
												<th
													key={header}
													className={cn(
														"border-b border-border/70 px-2 py-1 font-semibold",
														// 2026-10-12 用户拍板：官方支持列与实际安装列用左边框分割
														layout?.splitAt !== undefined &&
															headerIndex === layout.splitAt + 1 &&
															"border-l-2 border-muted-foreground/40 ps-3"
													)}
												>
													{header}
												</th>
											))}
										</tr>
									</thead>
									<tbody>
										{section.rows.map((row) => (
											<tr key={`${group.id}-${row.label}`} className="align-middle">
												<td className="px-2 py-1 font-medium text-foreground">
													{/* 2026-10-12 用户拍板：插槽/盘位行首状态点——绿点在用、灰点未用 */}
													<span className="flex items-center gap-1.5">
														{row.inUse !== undefined ? (
															<span
																className={cn(
																	"size-2 shrink-0 rounded-full",
																	row.inUse ? "bg-emerald-500" : "bg-muted-foreground/40"
																)}
																title={row.inUse ? "在用" : "未用"}
															/>
														) : null}
														{row.label}
													</span>
												</td>
												{(row.cells ?? []).map((cell, index) => (
													<td
														key={`${group.id}-${row.label}-${index}`}
														className={cn(
															"px-2 py-1 text-foreground",
															layout?.splitAt === index && "border-l-2 border-muted-foreground/40 ps-3"
														)}
													>
														{cell || "—"}
													</td>
												))}
											</tr>
										))}
									</tbody>
								</table>
							) : (
								<div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-4">
									{section.rows.map((row) => (
										<div
											key={`${group.id}-${section.title}-${row.label}`}
											className="min-w-0 rounded-md border border-border/70 bg-card px-2 py-1"
										>
											<div className="truncate text-[10px] text-muted-foreground">{row.label}</div>
											<div className="truncate text-xs font-medium text-foreground">{row.value}</div>
										</div>
									))}
								</div>
							)}
						</section>
					))}
				</div>
			) : layout?.layout === "grid" ? (
				// 2026-10-12 紧凑格子流：参数按上名下值格子铺排（一行 2-4 个）
				// 2026-10-18 用户拍板：组内已不显示小分类标题，格子合并为一个网格渲染，
				// 物理规格 6 项按 3 列正好两排（不再因内部分组合并多出一排）
				<div className="grid gap-2 border-t border-border/60 pt-2">
					<div className={cn("grid gap-1.5", groupGridColumnsClass(layout.columns))}>
						{rowSections
							.flatMap((section) => section.rows.map((row) => ({ section, row })))
							.map(({ section, row }, index) => (
								<div
									key={`${group.id}-${section.title}-${row.label}-${index}`}
									className="min-w-0 rounded-md border border-border/70 bg-card px-2 py-1"
								>
									<div className="truncate text-[10px] text-muted-foreground">{row.label}</div>
									<div className="truncate text-xs font-medium text-foreground">{row.value}</div>
								</div>
							))}
					</div>
				</div>
			) : layout?.layout === "table" ? (
				// 2026-10-12 接口表格：一行一个接口（有线在上、无线在后），浅表头紧凑行；
				// 行首状态点（绿点在用/灰点未用）；接口属性列与连接的设备列用左边框分割
				// 2026-10-17 用户拍板：无表格列的行（自定义参数等）不进表格，改在表格下方按小节铺格子
				<div className="grid gap-2 border-t border-border/60 pt-2">
					<table className="w-full border-collapse text-xs">
						<thead>
							{groupLabels && layout.splitAt !== undefined && (tableHeaders ?? []).length > 0 ? (
								<tr className="text-left text-[11px] font-semibold text-muted-foreground">
									<th colSpan={layout.splitAt + 1} className="px-2 pb-1">
										{groupLabels[0]}
									</th>
									<th
										colSpan={(tableHeaders ?? []).length - layout.splitAt - 1}
										className="border-l-2 border-muted-foreground/40 px-2 pb-1 ps-3"
									>
										{groupLabels[1]}
									</th>
								</tr>
							) : null}
							<tr className="text-left text-[11px] text-muted-foreground">
								{(tableHeaders ?? []).map((header, headerIndex) => (
									<th
										key={header}
										className={cn(
											"border-b border-border/70 px-2 py-1 font-semibold",
											layout?.splitAt !== undefined &&
												headerIndex === layout.splitAt + 1 &&
												"border-l-2 border-muted-foreground/40 ps-3"
										)}
									>
										{header}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{tableRows.map((row) => (
								<tr key={`${group.id}-${row.label}`} className="align-middle">
									<td className="px-2 py-1 font-medium text-foreground">
										<span className="flex items-center gap-1.5">
											{row.inUse !== undefined ? (
												<span
													className={cn(
														"size-2 shrink-0 rounded-full",
														row.inUse ? "bg-emerald-500" : "bg-muted-foreground/40"
													)}
													title={row.inUse ? "在用" : "未用"}
												/>
											) : null}
											{row.label}
										</span>
									</td>
									{(row.cells ?? []).map((cell, index) => (
										<td
											key={`${group.id}-${row.label}-${index}`}
											className={cn(
												"px-2 py-1 text-foreground",
												layout?.splitAt === index && "border-l-2 border-muted-foreground/40 ps-3"
											)}
										>
											{cell || "—"}
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
					{extraRows.length > 0 ? (
						<div className="grid gap-2">
							{groupRowsBySection(extraRows).map((section) => (
								<section key={`${group.id}-extra-${section.title || "default"}`} className="grid gap-1">
									{/* 2026-10-17 用户拍板：组内小分类标题不再显示，内容直接平铺 */}
									<div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-4">
										{section.rows.map((row) => (
											<div
												key={`${group.id}-extra-${section.title}-${row.label}`}
												className="min-w-0 rounded-md border border-border/70 bg-card px-2 py-1"
											>
												<div className="truncate text-[10px] text-muted-foreground">{row.label}</div>
												<div className="truncate text-xs font-medium text-foreground">{row.value}</div>
											</div>
										))}
									</div>
								</section>
							))}
						</div>
					) : null}
				</div>
			) : (
				<div className="grid gap-1.5 border-t border-border/60 pt-2">
					{rowSections.map((section) => (
						<section key={`${group.id}-${section.title || "default"}`} className="grid gap-1">
							{/* 2026-10-17 用户拍板：组内小分类标题不再显示，参数行直接平铺 */}
							<div className="grid gap-0.5">
								{section.rows.map((row) => (
									<CompactSpecRow key={`${group.id}-${section.title}-${row.label}`} row={row} />
								))}
							</div>
						</section>
					))}
				</div>
			)}
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
