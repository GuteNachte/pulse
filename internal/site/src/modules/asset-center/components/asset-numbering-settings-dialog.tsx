import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AssetFormField } from "@/modules/asset-center/components/asset-form-fields"
import type { AssetNumberingSettings } from "@/modules/asset-center/asset-numbering"

export function AssetNumberingSettingsDialog({
	open,
	onOpenChange,
	form,
	nextAssetTagPreview,
	readOnly,
	onChange,
	onSave,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	form: AssetNumberingSettings
	nextAssetTagPreview: string
	readOnly: boolean
	onChange: (next: AssetNumberingSettings) => void
	onSave: () => void
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>编号</DialogTitle>
					<DialogDescription>设置新增资产未手动填写编号时的自动编号规则。</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4">
					<AssetFormField label="编号前缀" required>
						<Input
							value={form.prefix}
							onChange={(event) => onChange({ ...form, prefix: event.target.value })}
							placeholder="ASSET-"
						/>
					</AssetFormField>
					<div className="grid gap-3 sm:grid-cols-2">
						<AssetFormField label="数字位数" required>
							<Input
								type="number"
								min={1}
								max={12}
								value={form.digits}
								onChange={(event) => onChange({ ...form, digits: event.target.value })}
								placeholder="4"
							/>
						</AssetFormField>
						<AssetFormField label="下一个序号" required>
							<Input
								type="number"
								min={1}
								value={form.nextSequence}
								onChange={(event) => onChange({ ...form, nextSequence: event.target.value })}
								placeholder="1"
							/>
						</AssetFormField>
					</div>
					<div className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-surface-soft px-3 py-2">
						<span className="text-sm text-muted-foreground">下一个编号</span>
						<span className="font-mono text-sm font-semibold text-foreground">{nextAssetTagPreview}</span>
					</div>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						关闭
					</Button>
					<Button onClick={onSave} disabled={readOnly}>
						保存设置
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
