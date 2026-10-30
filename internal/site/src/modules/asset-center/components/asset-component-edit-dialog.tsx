import { useEffect, useMemo, useState } from "react"
import { pb } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SelectField, TextField } from "./asset-detail-form-fields"
import { ASSET_COMPONENT_CATEGORIES, getComponentSpecFields, normalizeComponentSpec } from "../asset-component-list"
import type { AssetComponentKind, AssetComponentRecord, AssetRecord } from "@/types"

// 2026-10-07 计算设备④（docs/pc-asset-design.md 四）：配件编辑弹窗——
// 主档字段 + 按分类动态出的规格字段（存 JSON）；配件不是独立资产，归属整机资产。

export function AssetComponentEditDialog({
	open,
	onOpenChange,
	asset,
	editing,
	onSaved,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	asset: AssetRecord
	editing: AssetComponentRecord | null
	onSaved: () => void
}) {
	const [category, setCategory] = useState<AssetComponentKind>(editing?.category ?? "memory")
	const [saving, setSaving] = useState(false)

	useEffect(() => {
		if (open) setCategory(editing?.category ?? "memory")
	}, [open, editing])

	// 规格键 = 分类模板键 ∪ 已有规格键（改分类后旧规格键仍可见可清空，不静默丢数据）
	const specKeys = useMemo(() => {
		const keys = [...getComponentSpecFields(category)]
		for (const key of Object.keys(editing?.spec ?? {})) {
			if (!keys.includes(key)) keys.push(key)
		}
		return keys
	}, [category, editing])

	async function save(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault()
		if (saving) return
		const form = new FormData(event.currentTarget)
		const spec: Record<string, string> = {}
		for (const key of specKeys) {
			const value = form.get(`spec-${key}`)?.toString().trim() ?? ""
			if (value) spec[key] = value
		}
		const payload = {
			user: asset.user,
			asset: asset.id,
			category,
			vendor: form.get("vendor")?.toString().trim() ?? "",
			model: form.get("model")?.toString().trim() ?? "",
			spec: normalizeComponentSpec(category, spec),
			serial_number: form.get("serial_number")?.toString().trim() ?? "",
			purchase_date: normalizeDateInput(form.get("purchase_date")?.toString()),
			purchase_price_cny: form.get("purchase_price_cny")?.toString().trim() ?? "",
			notes: form.get("notes")?.toString().trim() ?? "",
		}
		setSaving(true)
		try {
			if (editing) await pb.collection("asset_components").update(editing.id, payload)
			else await pb.collection("asset_components").create(payload)
			onOpenChange(false)
			onSaved()
		} catch (error) {
			console.error("save asset component", error)
		} finally {
			setSaving(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[88dvh] w-full max-w-4xl overflow-y-auto">
				<DialogHeader className="gap-1 border-b border-border/70 pb-3">
					<DialogTitle>{editing ? "编辑配件" : "添加配件"}</DialogTitle>
				</DialogHeader>
				<form key={`${editing?.id ?? "new"}-${open}`} onSubmit={save} className="grid gap-2">
					<SelectField
						name="category"
						label="分类"
						options={ASSET_COMPONENT_CATEGORIES.map((item) => ({ value: item.value, label: item.label }))}
						defaultValue={category}
						onChange={(value) => setCategory(value as AssetComponentKind)}
					/>
					<div className="grid gap-2 sm:grid-cols-2">
						<TextField name="vendor" label="品牌" placeholder="例如 Kingston / ASUS" defaultValue={editing?.vendor} />
						<TextField name="model" label="型号" placeholder="例如 Fury Beast 16GB" defaultValue={editing?.model} />
					</div>
					{specKeys.map((key) => (
						<TextField
							key={key}
							name={`spec-${key}`}
							label={`规格 · ${key}`}
							placeholder="可选"
							defaultValue={editing?.spec?.[key]}
						/>
					))}
					<div className="grid gap-2 sm:grid-cols-2">
						<TextField
							name="serial_number"
							label="序列号"
							placeholder="可选，保修盘点用"
							defaultValue={editing?.serial_number}
						/>
						<TextField
							name="purchase_price_cny"
							label="购买价格（元）"
							placeholder="可选"
							defaultValue={editing?.purchase_price_cny}
						/>
					</div>
					<TextField name="purchase_date" label="购买日期" type="date" defaultValue={editing?.purchase_date} />
					<TextField name="notes" label="备注" placeholder="可选" defaultValue={editing?.notes} />
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
							取消
						</Button>
						<Button type="submit" disabled={saving}>
							{saving ? "保存中" : "保存配件"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}

function normalizeDateInput(value: string | undefined) {
	const text = value?.trim() ?? ""
	return text || undefined
}
