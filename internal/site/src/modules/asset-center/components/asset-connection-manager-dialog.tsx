import { useState } from "react"
import { PlusIcon } from "lucide-react"
import { pb } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "@/components/ui/use-toast"
import { AssetInterfaceManager } from "./asset-interface-manager"
import { AssetInterfaceEditDialog } from "./asset-interface-edit-dialog"
import { AssetRelationEditDialog } from "./asset-relation-edit-dialog"
import { getRelationKindLabel } from "../asset-detail-relations"
import type { AssetInterfaceRecord, AssetRecord, AssetRelationRecord } from "@/types"

// 2026-10-06 编辑页布局二稿：连接图卡右上角「编辑」打开本弹窗，接口与对端连接的
// 管理统一收进这里（原页面内连接管理卡撤除）；接口/关系编辑弹窗在内部嵌套管理。

type EditDialogState<T> = { open: boolean; editing: T | null }
const closedDialog = { open: false, editing: null }

export function AssetConnectionManagerDialog({
	open,
	onOpenChange,
	asset,
	interfaces,
	allInterfaces,
	relations,
	assets,
	readOnly,
	networkDomain,
	onChanged,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	asset: AssetRecord
	interfaces: AssetInterfaceRecord[]
	allInterfaces: AssetInterfaceRecord[]
	relations: AssetRelationRecord[]
	assets: AssetRecord[]
	readOnly: boolean
	networkDomain?: "home" | "technology"
	onChanged: () => void
}) {
	const [interfaceEdit, setInterfaceEdit] = useState<EditDialogState<AssetInterfaceRecord>>(closedDialog)
	const [relationEdit, setRelationEdit] = useState<EditDialogState<AssetRelationRecord>>(closedDialog)

	async function deleteInterface(record: AssetInterfaceRecord) {
		if (readOnly) return
		const stateText = [record.connected ? "当前接入" : "", record.primary ? "主接口" : ""].filter(Boolean).join("、")
		if (
			!window.confirm(`确定删除网卡“${record.name}”吗？${stateText ? `它是${stateText}，删除后对应标识会消失。` : ""}`)
		) {
			return
		}
		try {
			await pb.collection("asset_interfaces").delete(record.id)
			onChanged()
			toast({ title: "接口已删除", description: record.name })
		} catch (error) {
			console.error("delete asset interface", error)
			toast({ title: "接口删除失败", description: "请检查权限或稍后重试。", variant: "destructive" })
		}
	}

	async function deleteRelation(record: AssetRelationRecord) {
		const targetId = record.source_asset === asset.id ? record.target_asset : record.source_asset
		const targetName = assets.find((item) => item.id === targetId)?.name ?? "对端资产"
		if (!window.confirm(`确认删除到「${targetName}」的这条连接？`)) return
		try {
			await pb.collection("asset_relations").delete(record.id)
			onChanged()
			toast({ title: "连接已删除" })
		} catch (error) {
			console.error("delete asset relation", error)
			toast({ title: "连接删除失败", variant: "destructive" })
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				// 接口/关系编辑弹窗叠在上面时禁止直接关外层，避免点外部把两层一起带走
				if (!next && (interfaceEdit.open || relationEdit.open)) return
				onOpenChange(next)
			}}
		>
			<DialogContent className="max-h-[88dvh] w-full max-w-4xl overflow-y-auto">
				<DialogHeader className="gap-1 border-b border-border/70 pb-3">
					<DialogTitle>连接管理</DialogTitle>
				</DialogHeader>
				<div className="grid gap-4">
					<AssetInterfaceManager
						interfaces={interfaces}
						assetType={asset.type}
						readOnly={readOnly}
						onAdd={() => setInterfaceEdit({ open: true, editing: null })}
						onEdit={(record) => setInterfaceEdit({ open: true, editing: record })}
						onDelete={(record) => {
							deleteInterface(record).catch((error) => console.error("delete asset interface", error))
						}}
					/>
					<Separator />
					<div className="grid gap-2">
						<div className="flex items-center justify-between gap-3">
							<div className="min-w-0">
								<div className="text-sm font-semibold text-foreground">对端连接</div>
								<div className="text-xs text-muted-foreground">
									到其他资产的连接：网络连接、供电于、运行在、归属等。
								</div>
							</div>
							{readOnly ? null : (
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="h-8 min-h-8 shrink-0"
									onClick={() => setRelationEdit({ open: true, editing: null })}
								>
									<PlusIcon data-icon="inline-start" className="size-3.5" />
									添加连接
								</Button>
							)}
						</div>
						{relations.length === 0 ? (
							<div className="rounded-md border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
								暂无对端连接
							</div>
						) : (
							<div className="grid gap-2">
								{relations.map((relation) => {
									const peerId = relation.source_asset === asset.id ? relation.target_asset : relation.source_asset
									const expandedPeer = (
										relation.source_asset === asset.id ? relation.expand?.target_asset : relation.expand?.source_asset
									) as AssetRecord | undefined
									const peer = assets.find((item) => item.id === peerId) ?? expandedPeer
									return (
										<div
											key={relation.id}
											className="grid gap-2 rounded-md border border-border/70 bg-card p-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
										>
											<div className="min-w-0">
												<div className="flex min-w-0 flex-wrap items-center gap-1.5">
													<span className="truncate text-sm font-medium text-foreground">
														{peer?.name ?? "未知资产"}
													</span>
													<span className="truncate text-xs text-muted-foreground">
														{getRelationKindLabel(relation.kind)}
														{relation.label ? ` · ${relation.label}` : ""}
													</span>
												</div>
											</div>
											{readOnly ? null : (
												<div className="grid grid-cols-2 gap-1.5">
													<Button
														type="button"
														variant="outline"
														size="sm"
														className="h-8 min-h-8"
														onClick={() => setRelationEdit({ open: true, editing: relation })}
													>
														编辑
													</Button>
													<Button
														type="button"
														variant="outline"
														size="sm"
														className="h-8 min-h-8 text-destructive hover:text-destructive"
														onClick={() => {
															deleteRelation(relation).catch((error) => console.error("delete asset relation", error))
														}}
													>
														删除
													</Button>
												</div>
											)}
										</div>
									)
								})}
							</div>
						)}
					</div>
				</div>
			</DialogContent>
			<AssetInterfaceEditDialog
				open={interfaceEdit.open}
				onOpenChange={(next) => setInterfaceEdit((current) => ({ ...current, open: next }))}
				asset={asset}
				editing={interfaceEdit.editing}
				currentInterfaces={interfaces}
				onSaved={onChanged}
			/>
			<AssetRelationEditDialog
				open={relationEdit.open}
				onOpenChange={(next) => setRelationEdit((current) => ({ ...current, open: next }))}
				asset={asset}
				assets={assets}
				allInterfaces={allInterfaces}
				relations={relations}
				editing={relationEdit.editing}
				networkDomain={networkDomain}
				onSaved={onChanged}
			/>
		</Dialog>
	)
}
