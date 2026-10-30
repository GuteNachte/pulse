import { useMemo, useState } from "react"
import { NetworkIcon } from "lucide-react"
import { pb } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DialogFormSection } from "../asset-detail-dialog-parts"
import { SelectField, TextField } from "./asset-detail-form-fields"
import { getAssetArchiveFieldByLabel } from "../asset-parameter-registry"
import { getAssetFormSections, type AssetFieldDefinition } from "../asset-schema"
import type { AssetRecord } from "@/types"

// 2026-10-06 连接展示定稿：网口状态右上角「编辑」打开本弹窗——
// 只编辑网络功能与接口能力这些官方规格参数（按 label 反查字段键回写 metadata），
// 网口的连接状态与连接的设备是连接数据，不在这里编辑（去连接管理弹窗）。
// 反查不到字段键的行（展示名与 registry 标签不一致，如「默认电口速率」）只读显示，避免写脏键。

type CapabilityGroup = {
	id: string
	title: string
	rows: { label: string; value: string }[]
}

export function AssetNetworkCapabilityEditDialog({
	open,
	onOpenChange,
	asset,
	groups,
	onSaved,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	asset: AssetRecord
	groups: CapabilityGroup[]
	onSaved: () => void
}) {
	const [saving, setSaving] = useState(false)
	// 字段定义：label→definition（枚举字段有 options）
	const fieldsByLabel = useMemo(() => {
		const map = new Map<string, AssetFieldDefinition>()
		for (const field of getAssetFormSections(asset.type).flatMap((section) => section.fields)) {
			map.set(field.label, field)
		}
		return map
	}, [asset.type])

	async function save(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const form = new FormData(event.currentTarget)
		const metadata = { ...(asset.metadata ?? {}) }
		for (const group of groups) {
			for (const row of group.rows) {
				const definition = fieldsByLabel.get(row.label)
				const fieldKey = definition?.key ?? getAssetArchiveFieldByLabel(row.label)?.key
				// 反查不到字段键的行只读显示，跳过不写避免写脏键
				if (!fieldKey) continue
				const raw = form.get(fieldKey)?.toString().trim() ?? ""
				const option = definition?.options?.find((item) => item.label === raw)
				metadata[fieldKey] = option ? option.value : raw
			}
		}
		setSaving(true)
		try {
			await pb.collection("assets").update(asset.id, { metadata })
			onOpenChange(false)
			onSaved()
		} catch (error) {
			console.error("save network capability", error)
		} finally {
			setSaving(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[88dvh] w-full max-w-4xl overflow-y-auto">
				<form key={asset.id} onSubmit={save} className="grid gap-4">
					<DialogHeader className="gap-1 border-b border-border/70 pb-3">
						<DialogTitle>编辑网络能力</DialogTitle>
					</DialogHeader>
					{groups.length === 0 ? (
						<div className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
							这一资产没有可直接编辑的网络能力参数。
						</div>
					) : (
						groups.map((group) => (
							<DialogFormSection
								key={group.id}
								icon={<NetworkIcon className="size-4" />}
								title={group.title}
								description="留空的字段不会显示在展示页。"
							>
								{group.rows.map((row) => {
									const definition = fieldsByLabel.get(row.label)
									const fieldKey = definition?.key ?? getAssetArchiveFieldByLabel(row.label)?.key
									if (!fieldKey) {
										return (
											<div
												key={row.label}
												className="min-w-0 rounded-md border border-border/70 bg-surface-soft px-2 py-1.5"
											>
												<div className="truncate text-[10px] text-muted-foreground">{row.label}</div>
												<div className="truncate text-xs font-medium">{row.value}</div>
											</div>
										)
									}
									if (definition?.options && definition.options.length > 0) {
										return (
											<SelectField
												key={fieldKey}
												name={fieldKey}
												label={row.label}
												options={definition.options}
												defaultValue={
													(
														definition.options.find((item) => item.label === row.value) ??
														definition.options.find((item) => item.value === row.value)
													)?.value ?? ""
												}
											/>
										)
									}
									return <TextField key={fieldKey} name={fieldKey} label={row.label} defaultValue={row.value} />
								})}
							</DialogFormSection>
						))
					)}
					<DialogFooter>
						<Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
							取消
						</Button>
						<Button type="submit" disabled={saving || groups.length === 0}>
							{saving ? "保存中" : "保存参数"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
