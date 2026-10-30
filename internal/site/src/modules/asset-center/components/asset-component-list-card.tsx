import { useCallback, useEffect, useState } from "react"
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { pb } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AssetComponentEditDialog } from "./asset-component-edit-dialog"
import { formatComponentSpec, getComponentCategoryLabel, isDiyBuildAsset } from "../asset-component-list"
import type { AssetComponentRecord, AssetRecord } from "@/types"

// 2026-10-07 计算设备④（docs/pc-asset-design.md 四）：自组装配件清单卡（编辑页可管理，详情页只读表）。
// 仅自组装（build_mode=diy）资产显示；配件不是独立资产，清单归属整机。

export function AssetComponentListCard({ asset, readOnly }: { asset: AssetRecord; readOnly: boolean }) {
	const [components, setComponents] = useState<AssetComponentRecord[]>([])
	const [loading, setLoading] = useState(false)
	const [editOpen, setEditOpen] = useState(false)
	const [editing, setEditing] = useState<AssetComponentRecord | null>(null)

	const load = useCallback(async () => {
		if (!isDiyBuildAsset(asset)) return
		setLoading(true)
		try {
			const rows = await pb.collection<AssetComponentRecord>("asset_components").getFullList({
				filter: pb.filter("asset = {:asset}", { asset: asset.id }),
				sort: "created",
				requestKey: null,
			})
			setComponents(rows)
		} catch (error) {
			console.error("load asset components", error)
		} finally {
			setLoading(false)
		}
	}, [asset])

	useEffect(() => {
		load().catch((error) => console.error("load asset components", error))
	}, [load])

	async function remove(record: AssetComponentRecord) {
		if (readOnly) return
		if (!window.confirm(`删除配件「${componentDisplayName(record)}」？`)) return
		try {
			await pb.collection("asset_components").delete(record.id)
			setComponents((current) => current.filter((row) => row.id !== record.id))
		} catch (error) {
			console.error("delete asset component", error)
		}
	}

	if (!isDiyBuildAsset(asset)) return null

	return (
		<section className="rounded-lg border border-border/70 bg-card p-3">
			<div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
				<div className="flex min-w-0 items-center gap-1.5">
					<div className="text-sm font-semibold text-foreground">配件清单</div>
					{components.length > 0 ? (
						<span className="rounded border border-border/70 bg-surface-soft px-1.5 text-[11px] text-muted-foreground">
							{components.length}
						</span>
					) : null}
				</div>
				{readOnly ? null : (
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="h-8 shrink-0 gap-1.5"
						onClick={() => {
							setEditing(null)
							setEditOpen(true)
						}}
					>
						<PlusIcon data-icon="inline-start" className="size-3.5" />
						添加配件
					</Button>
				)}
			</div>
			{loading ? (
				<div className="rounded-md border border-dashed border-border/70 px-3 py-4 text-center text-xs text-muted-foreground">
					正在读取配件清单
				</div>
			) : components.length === 0 ? (
				<div className="rounded-md border border-dashed border-border/70 px-3 py-4 text-center text-xs text-muted-foreground">
					还没有配件；自组装机器按 CPU / 主板 / 内存 / 存储等逐件登记。
				</div>
			) : (
				<Table className="text-xs">
					<TableHeader>
						<TableRow className="hover:bg-transparent">
							<TableHead className="h-8 text-[11px]">分类</TableHead>
							<TableHead className="h-8 text-[11px]">品牌 / 型号</TableHead>
							<TableHead className="h-8 text-[11px]">规格</TableHead>
							<TableHead className="h-8 text-[11px]">序列号</TableHead>
							{readOnly ? null : <TableHead className="h-8 w-20 text-[11px]">操作</TableHead>}
						</TableRow>
					</TableHeader>
					<TableBody>
						{components.map((record) => (
							<TableRow key={record.id}>
								<TableCell className="py-1.5 font-medium">{getComponentCategoryLabel(record.category)}</TableCell>
								<TableCell className="py-1.5">
									{[record.vendor, record.model].filter(Boolean).join(" ") || "—"}
								</TableCell>
								<TableCell className="max-w-[16rem] truncate py-1.5 text-muted-foreground">
									{formatComponentSpec(record.category, record.spec) || "—"}
								</TableCell>
								<TableCell className="py-1.5 font-mono text-[11px] text-muted-foreground">
									{record.serial_number || "—"}
								</TableCell>
								{readOnly ? null : (
									<TableCell className="py-1.5">
										<div className="flex items-center gap-1">
											<Button
												type="button"
												variant="ghost"
												size="sm"
												className="h-7 px-1.5"
												onClick={() => {
													setEditing(record)
													setEditOpen(true)
												}}
											>
												<PencilIcon className="size-3.5" />
											</Button>
											<Button
												type="button"
												variant="ghost"
												size="sm"
												className="h-7 px-1.5 text-destructive hover:text-destructive"
												onClick={() => remove(record)}
											>
												<Trash2Icon className="size-3.5" />
											</Button>
										</div>
									</TableCell>
								)}
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
			<AssetComponentEditDialog
				open={editOpen}
				onOpenChange={setEditOpen}
				asset={asset}
				editing={editing}
				onSaved={load}
			/>
		</section>
	)
}

export function componentDisplayName(record: AssetComponentRecord) {
	const parts = [record.vendor, record.model].filter(Boolean)
	return parts.length > 0 ? parts.join(" ") : getComponentCategoryLabel(record.category)
}

// 详情页只读配件表（自组装显示）；数据内部自取，不影响详情主数据流
export function AssetComponentReadonlyTable({ asset }: { asset: AssetRecord }) {
	const [components, setComponents] = useState<AssetComponentRecord[]>([])
	useEffect(() => {
		let active = true
		pb.collection<AssetComponentRecord>("asset_components")
			.getFullList({
				filter: pb.filter("asset = {:asset}", { asset: asset.id }),
				sort: "created",
				requestKey: null,
			})
			.then((rows) => {
				if (active) setComponents(rows)
			})
			.catch((error) => console.error("load asset components", error))
		return () => {
			active = false
		}
	}, [asset.id])

	if (!isDiyBuildAsset(asset) || components.length === 0) return null

	return (
		<div className="overflow-hidden rounded-md border border-border/70">
			<div className="border-b border-border/60 bg-surface-soft px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
				配件清单（{components.length}）
			</div>
			<Table className="text-xs">
				<TableHeader>
					<TableRow className="hover:bg-transparent">
						<TableHead className="h-8 text-[11px]">分类</TableHead>
						<TableHead className="h-8 text-[11px]">品牌 / 型号</TableHead>
						<TableHead className="h-8 text-[11px]">规格</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{components.map((record) => (
						<TableRow key={record.id}>
							<TableCell className="py-1.5 font-medium">{getComponentCategoryLabel(record.category)}</TableCell>
							<TableCell className="py-1.5">{[record.vendor, record.model].filter(Boolean).join(" ") || "—"}</TableCell>
							<TableCell className="max-w-[18rem] truncate py-1.5 text-muted-foreground">
								{formatComponentSpec(record.category, record.spec) || "—"}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	)
}
