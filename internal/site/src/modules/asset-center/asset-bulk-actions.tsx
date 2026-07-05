import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { pb } from "@/lib/api"
import type { AssetMaintenanceKind, AssetMaintenanceRecord, AssetRecord, AssetStatus } from "@/types"
import type { ReactNode } from "react"

export type AssetBulkEditFormState = {
	updateStatus: boolean
	status: AssetStatus | ""
	updateLocation: boolean
	location: string
	updateRole: boolean
	role: string
	updateNotes: boolean
	notes: string
	appendNotes: boolean
}

export type AssetBulkMaintenanceFormState = {
	kind: AssetMaintenanceKind
	event_date: string
	title: string
	actor: string
	cost: string
	notes: string
}

export const emptyBulkEditForm: AssetBulkEditFormState = {
	updateStatus: false,
	status: "",
	updateLocation: false,
	location: "",
	updateRole: false,
	role: "",
	updateNotes: false,
	notes: "",
	appendNotes: true,
}

export const emptyBulkMaintenanceForm: AssetBulkMaintenanceFormState = {
	kind: "maintenance",
	event_date: new Date().toISOString().slice(0, 10),
	title: "",
	actor: "",
	cost: "",
	notes: "",
}

const MAINTENANCE_KIND_OPTIONS: { value: AssetMaintenanceKind; label: string }[] = [
	{ value: "purchase", label: "购买" },
	{ value: "online", label: "上线" },
	{ value: "maintenance", label: "维护" },
	{ value: "repair", label: "维修" },
	{ value: "upgrade", label: "升级" },
	{ value: "replacement", label: "更换" },
	{ value: "warranty", label: "保修" },
	{ value: "retire", label: "退役" },
	{ value: "note", label: "备注" },
]

export async function applyAssetBulkEdit(assets: AssetRecord[], form: AssetBulkEditFormState) {
	for (const asset of assets) {
		const payload: Partial<AssetRecord> = {}
		if (form.updateStatus && form.status) {
			payload.status = form.status
		}
		if (form.updateLocation) {
			payload.location = form.location.trim()
		}
		if (form.updateRole) {
			payload.role = form.role.trim()
		}
		if (form.updateNotes) {
			const notes = form.notes.trim()
			payload.notes =
				form.appendNotes && asset.notes?.trim() ? [asset.notes.trim(), notes].filter(Boolean).join("\n") : notes
		}
		await pb.collection("assets").update(asset.id, payload)
	}
}

export async function createBulkMaintenanceRecords(
	assets: AssetRecord[],
	form: AssetBulkMaintenanceFormState,
	user: string
) {
	const title = form.title.trim()
	const createdIds: string[] = []
	try {
		for (const asset of assets) {
			const record = await pb.collection<AssetMaintenanceRecord>("asset_maintenance").create({
				user,
				asset: asset.id,
				kind: form.kind,
				title,
				event_date: normalizeMaintenanceDateInput(form.event_date),
				actor: form.actor.trim(),
				cost: form.cost.trim(),
				notes: form.notes.trim(),
				metadata: {
					source: "asset-bulk-maintenance",
					asset_name: asset.name,
				},
			})
			createdIds.push(record.id)
		}
	} catch (error) {
		await Promise.allSettled(createdIds.map((id) => pb.collection("asset_maintenance").delete(id)))
		throw error
	}
}

export function AssetBulkEditDialog({
	open,
	onOpenChange,
	form,
	onFormChange,
	selectedCount,
	locationOptions,
	saving,
	readOnly,
	onSubmit,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	form: AssetBulkEditFormState
	onFormChange: (form: AssetBulkEditFormState) => void
	selectedCount: number
	locationOptions: string[]
	saving: boolean
	readOnly: boolean
	onSubmit: () => void
}) {
	const setValue = <K extends keyof AssetBulkEditFormState>(key: K, value: AssetBulkEditFormState[K]) =>
		onFormChange({ ...form, [key]: value })

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-3xl">
				<DialogHeader>
					<DialogTitle>批量整理资产</DialogTitle>
					<DialogDescription>对已选 {selectedCount} 个资产更新长期主档字段。未勾选的字段保持原值。</DialogDescription>
				</DialogHeader>
				<div className="grid gap-3">
					<BulkEditRow
						checked={form.updateStatus}
						onCheckedChange={(checked) => setValue("updateStatus", checked)}
						label="状态"
					>
						<select
							value={form.status}
							onChange={(event) => setValue("status", event.target.value as AssetStatus)}
							disabled={!form.updateStatus}
							className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm disabled:opacity-60"
						>
							<option value="">选择状态</option>
							<option value="active">在用</option>
							<option value="planned">规划</option>
							<option value="inactive">停用</option>
							<option value="retired">退役</option>
						</select>
					</BulkEditRow>
					<BulkEditRow
						checked={form.updateLocation}
						onCheckedChange={(checked) => setValue("updateLocation", checked)}
						label="位置"
					>
						<Input
							list="asset-bulk-location-options"
							value={form.location}
							onChange={(event) => setValue("location", event.target.value)}
							disabled={!form.updateLocation}
							placeholder="留空可批量清空位置"
						/>
						<datalist id="asset-bulk-location-options">
							{locationOptions.map((location) => (
								<option key={location} value={location} />
							))}
						</datalist>
					</BulkEditRow>
					<BulkEditRow
						checked={form.updateRole}
						onCheckedChange={(checked) => setValue("updateRole", checked)}
						label="用途 / 角色"
					>
						<Input
							value={form.role}
							onChange={(event) => setValue("role", event.target.value)}
							disabled={!form.updateRole}
							placeholder="例如 书房设备 / 家庭网络 / 闲置备件"
						/>
					</BulkEditRow>
					<BulkEditRow
						checked={form.updateNotes}
						onCheckedChange={(checked) => setValue("updateNotes", checked)}
						label="备注"
					>
						<div className="grid gap-2">
							<Textarea
								value={form.notes}
								onChange={(event) => setValue("notes", event.target.value)}
								disabled={!form.updateNotes}
								placeholder="批量写入备注"
							/>
							<div className="flex min-h-10 items-center gap-2 text-sm text-muted-foreground">
								<Checkbox
									checked={form.appendNotes}
									onCheckedChange={(checked) => setValue("appendNotes", checked === true)}
									disabled={!form.updateNotes}
									aria-label="追加到原备注后面"
								/>
								追加到原备注后面
							</div>
						</div>
					</BulkEditRow>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
						取消
					</Button>
					<Button onClick={onSubmit} disabled={saving || readOnly}>
						{saving ? "整理中" : "确认整理"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

export function AssetBulkMaintenanceDialog({
	open,
	onOpenChange,
	form,
	onFormChange,
	selectedCount,
	saving,
	readOnly,
	onSubmit,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	form: AssetBulkMaintenanceFormState
	onFormChange: (form: AssetBulkMaintenanceFormState) => void
	selectedCount: number
	saving: boolean
	readOnly: boolean
	onSubmit: () => void
}) {
	const setValue = <K extends keyof AssetBulkMaintenanceFormState>(key: K, value: AssetBulkMaintenanceFormState[K]) =>
		onFormChange({ ...form, [key]: value })

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-3xl">
				<DialogHeader>
					<DialogTitle>批量添加维护记录</DialogTitle>
					<DialogDescription>
						为已选 {selectedCount} 个资产写入同一条长期事件，适合批量上线、巡检、升级、维修或保修记录。
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-3 sm:grid-cols-2">
					<BulkField label="记录类型">
						<select
							value={form.kind}
							onChange={(event) => setValue("kind", event.target.value as AssetMaintenanceKind)}
							className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
						>
							{MAINTENANCE_KIND_OPTIONS.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
					</BulkField>
					<BulkField label="日期">
						<Input
							type="date"
							value={form.event_date}
							onChange={(event) => setValue("event_date", event.target.value)}
						/>
					</BulkField>
					<BulkField label="标题" required>
						<Input
							value={form.title}
							onChange={(event) => setValue("title", event.target.value)}
							placeholder="例如 统一上线 / 周期巡检 / 固件升级"
						/>
					</BulkField>
					<BulkField label="处理人 / 来源">
						<Input
							value={form.actor}
							onChange={(event) => setValue("actor", event.target.value)}
							placeholder="例如 自己 / 售后 / 京东"
						/>
					</BulkField>
					<BulkField label="费用 / 金额">
						<Input value={form.cost} onChange={(event) => setValue("cost", event.target.value)} placeholder="可选" />
					</BulkField>
					<BulkField label="备注" className="sm:col-span-2">
						<Textarea
							value={form.notes}
							onChange={(event) => setValue("notes", event.target.value)}
							placeholder="批量写入每个资产的维护记录备注"
						/>
					</BulkField>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
						取消
					</Button>
					<Button onClick={onSubmit} disabled={saving || readOnly}>
						{saving ? "写入中" : "确认写入"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

function BulkEditRow({
	checked,
	onCheckedChange,
	label,
	children,
}: {
	checked: boolean
	onCheckedChange: (checked: boolean) => void
	label: string
	children: ReactNode
}) {
	return (
		<div className="grid gap-3 rounded-lg border border-border/70 bg-surface-soft p-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-start">
			<div className="flex min-h-10 items-center gap-2 text-sm font-medium text-foreground">
				<Checkbox checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} aria-label={label} />
				{label}
			</div>
			{children}
		</div>
	)
}

function BulkField({
	label,
	required,
	className,
	children,
}: {
	label: string
	required?: boolean
	className?: string
	children: ReactNode
}) {
	return (
		<div className={className}>
			<Label className="mb-2 flex items-center gap-1 text-sm font-medium">
				{label}
				{required && <span className="text-destructive">*</span>}
			</Label>
			{children}
		</div>
	)
}

function normalizeMaintenanceDateInput(value?: string) {
	const trimmed = value?.trim()
	if (!trimmed) return undefined
	return `${trimmed} 00:00:00.000Z`
}
