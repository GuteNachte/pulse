import { useEffect, useMemo, useState } from "react"
import { Label } from "@/components/ui/label"
import { LinkIcon, NetworkIcon } from "lucide-react"
import { pb } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DialogFormSection } from "../asset-detail-dialog-parts"
import { SelectField, TextField, TextAreaField } from "./asset-detail-form-fields"
import { cn } from "@/lib/utils"
import {
	buildRelationMetadata,
	getAssetInterfaceOptions,
	getEmptyRelationFormForGuide,
	getPeerInterfaceOptions,
	getRelationTargetOptions,
	relationGuides,
	relationKindOptions,
	relationLinkKindOptions,
	resolveRelationNetworkDomain,
	type RelationFormState,
} from "../asset-detail-relations"
import { getMetadataString } from "../asset-schema"
import type { AssetInterfaceRecord, AssetRecord, AssetRelationKind, AssetRelationRecord } from "@/types"

// 2026-10-06 页面重构：对端连接（关系）编辑弹窗从详情页抽出，编辑页统一在此管理连接。
// 关系只负责资产之间的连接、承载、依赖、归属和供电，不记录运行状态。

export function AssetRelationEditDialog({
	open,
	onOpenChange,
	asset,
	assets,
	allInterfaces,
	relations,
	editing,
	networkDomain,
	onSaved,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	asset: AssetRecord
	assets: AssetRecord[]
	allInterfaces: AssetInterfaceRecord[]
	relations: AssetRelationRecord[]
	editing: AssetRelationRecord | null
	networkDomain?: "home" | "technology"
	onSaved: () => void
}) {
	const [form, setForm] = useState<RelationFormState>(
		getEmptyRelationFormForGuide(asset.type === "internet" ? "internet" : undefined)
	)
	const [saving, setSaving] = useState(false)

	useEffect(() => {
		if (!open) return
		if (editing) {
			setForm({
				...getEmptyRelationFormForGuide(asset.type === "internet" ? "internet" : undefined),
				kind: editing.kind,
				target_asset: editing.source_asset === asset.id ? editing.target_asset : editing.source_asset,
				label: editing.label ?? "",
				notes: getMetadataString(editing.metadata, "notes"),
			})
		} else {
			setForm(getEmptyRelationFormForGuide(asset.type === "internet" ? "internet" : undefined))
		}
	}, [open, editing, asset.id, asset.type])

	const selectedGuide = useMemo(() => relationGuides.find((guide) => guide.id === form.guide), [form.guide])
	const targetOptions = useMemo(
		() => getRelationTargetOptions(assets, asset.id, asset.type === "internet" ? "internet" : form.guide),
		[assets, asset.id, asset.type, form.guide]
	)
	const peerInterfaceOptions = useMemo(
		() => getPeerInterfaceOptions(allInterfaces, assets, asset.id, form.target_asset, form.guide),
		[allInterfaces, assets, asset.id, form.target_asset, form.guide]
	)

	function updateValue<K extends keyof RelationFormState>(key: K, value: RelationFormState[K]) {
		setForm((current) => ({ ...current, [key]: value }))
	}

	function updateTarget(targetAsset: string) {
		setForm((current) => {
			const peerInterface = allInterfaces.find((item) => item.id === current.peer_interface)
			return {
				...current,
				target_asset: targetAsset,
				peer_interface: peerInterface?.asset === targetAsset ? current.peer_interface : "",
			}
		})
	}

	async function save(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const formData = new FormData(event.currentTarget)
		const target = formData.get("target_asset")?.toString() || ""
		if (!target) return
		const kind = (formData.get("kind")?.toString() || "connected_to") as AssetRelationKind
		const currentInterface = formData.get("current_interface")?.toString() || ""
		const peerInterface = formData.get("peer_interface")?.toString() || ""
		const linkKind = formData.get("link_kind")?.toString() || ""
		const selectedCurrentInterface = currentInterface
			? allInterfaces.find((item) => item.id === currentInterface)
			: undefined
		if (currentInterface && selectedCurrentInterface?.asset !== asset.id) return
		const selectedPeerInterface = peerInterface ? allInterfaces.find((item) => item.id === peerInterface) : undefined
		if (peerInterface && selectedPeerInterface?.asset !== target) return
		const sourceAsset = editing?.source_asset && editing.source_asset !== asset.id ? target : asset.id
		const targetAsset = editing?.source_asset && editing.source_asset !== asset.id ? asset.id : target
		const sourceInterface = sourceAsset === asset.id ? currentInterface : peerInterface
		const targetInterface = targetAsset === asset.id ? currentInterface : peerInterface
		const duplicate = relations.some(
			(relation) =>
				relation.id !== editing?.id &&
				relation.source_asset === sourceAsset &&
				relation.target_asset === targetAsset &&
				relation.kind === kind &&
				getMetadataString(relation.metadata, "source_interface") === sourceInterface &&
				getMetadataString(relation.metadata, "target_interface") === targetInterface
		)
		if (duplicate) return
		const user = pb.authStore.record?.id
		if (!user) return
		const metadata = buildRelationMetadata({
			relation: editing,
			currentAssetId: asset.id,
			sourceAsset,
			targetAsset,
			currentInterface,
			peerInterface,
			linkKind,
			notes: formData.get("notes")?.toString().trim() || "",
		})
		if (networkDomain) {
			metadata.network_domain = networkDomain
		} else if (!getMetadataString(metadata, "network_domain")) {
			metadata.network_domain = resolveRelationNetworkDomain(
				asset,
				assets.find((item) => item.id === target)
			)
		}
		const payload = {
			user,
			source_asset: sourceAsset,
			target_asset: targetAsset,
			kind,
			label: formData.get("label")?.toString().trim(),
			metadata,
		}
		setSaving(true)
		try {
			if (editing) {
				await pb.collection("asset_relations").update(editing.id, payload)
			} else {
				await pb.collection("asset_relations").create(payload)
			}
			onOpenChange(false)
			onSaved()
		} catch (error) {
			console.error("save asset relation", error)
		} finally {
			setSaving(false)
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				onOpenChange(next)
			}}
		>
			<DialogContent className="max-h-[88dvh] w-full max-w-4xl overflow-y-auto">
				<form key={editing?.id ?? "new-relation"} onSubmit={save} className="grid gap-4">
					<DialogHeader className="gap-1 border-b border-border/70 pb-3">
						<DialogTitle>{editing ? "编辑对端连接" : "添加对端连接"}</DialogTitle>
					</DialogHeader>
					{!editing && (
						<div className="grid gap-2 rounded-lg border border-border/70 bg-surface-soft p-3">
							<div className="text-xs font-medium text-muted-foreground">常用连接场景</div>
							<div className="grid gap-2 sm:grid-cols-2">
								{relationGuides
									.filter((guide) => (asset.type === "internet" ? guide.id === "internet" : guide.id !== "internet"))
									.map((guide) => (
										<button
											key={guide.id}
											type="button"
											onClick={() => setForm(getEmptyRelationFormForGuide(guide.id))}
											className={cn(
												"rounded-md border px-3 py-2 text-left transition-colors",
												form.guide === guide.id
													? "border-foreground/25 bg-card text-foreground shadow-xs"
													: "border-border/70 bg-card/70 text-muted-foreground hover:bg-card"
											)}
										>
											<div className="text-sm font-medium">{guide.label}</div>
											<div className="mt-1 text-xs leading-5">{guide.description}</div>
										</button>
									))}
							</div>
						</div>
					)}
					<div className="grid gap-3">
						<DialogFormSection
							icon={<LinkIcon className="size-4" />}
							title="连接端点"
							description="先确定连接对象，再选择两端接口；拓扑会优先使用这里的端点。"
						>
							{asset.type === "internet" ? (
								<div className="grid gap-2">
									<Label>连接类型</Label>
									<div className="flex h-10 items-center rounded-md border border-border/70 bg-surface-soft px-3 text-sm">
										网络连接
									</div>
									<input type="hidden" name="kind" value="connected_to" />
								</div>
							) : (
								<SelectField
									name="kind"
									label="连接类型"
									options={relationKindOptions}
									value={form.kind}
									onChange={(value) => updateValue("kind", value as AssetRelationKind)}
								/>
							)}
							<SelectField
								name="target_asset"
								label="目标资产"
								options={targetOptions}
								placeholder="选择目标资产"
								value={form.target_asset}
								onChange={updateTarget}
							/>
							{asset.type !== "internet" ? (
								<SelectField
									name="current_interface"
									label="本资产接口"
									options={getAssetInterfaceOptions(allInterfaces, asset.id)}
									value={form.current_interface}
									onChange={(value) => updateValue("current_interface", value)}
								/>
							) : null}
							<SelectField
								name="peer_interface"
								label="对端接口"
								options={peerInterfaceOptions}
								value={form.peer_interface}
								onChange={(value) => updateValue("peer_interface", value)}
							/>
						</DialogFormSection>
						<DialogFormSection
							icon={<NetworkIcon className="size-4" />}
							title="显示与链路"
							description="只影响这条连接在拓扑和资产详情里的显示方式。"
						>
							{asset.type === "internet" ? (
								<div className="grid gap-2">
									<Label>链路类型</Label>
									<div className="flex h-10 items-center rounded-md border border-border/70 bg-surface-soft px-3 text-sm">
										外网链路
									</div>
									<input type="hidden" name="link_kind" value="internet" />
								</div>
							) : (
								<SelectField
									name="link_kind"
									label="链路类型"
									options={relationLinkKindOptions}
									value={form.link_kind}
									onChange={(value) => updateValue("link_kind", value)}
								/>
							)}
							<TextField
								name="label"
								label="显示名称"
								placeholder={selectedGuide?.labelPlaceholder ?? "例如 LAN1 -> 主机"}
								defaultValue={form.label}
							/>
							<TextAreaField name="notes" label="备注" className="sm:col-span-2" defaultValue={form.notes} />
						</DialogFormSection>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
							取消
						</Button>
						<Button type="submit" disabled={saving}>
							{saving ? "保存中" : editing ? "保存连接" : "添加连接"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
