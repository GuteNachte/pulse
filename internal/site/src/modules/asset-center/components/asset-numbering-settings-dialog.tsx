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
import { ASSET_TYPE_GROUPS, type AssetNumberingSettings } from "@/modules/asset-center/asset-numbering"

// 2026-10-04 编号规则升级：按资产大类编号（NW-001、NAS-002……），各大类独立计数。
export function AssetNumberingSettingsDialog({
	open,
	onOpenChange,
	form,
	readOnly,
	onChange,
	onSave,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	form: AssetNumberingSettings
	readOnly: boolean
	onChange: (next: AssetNumberingSettings) => void
	onSave: () => void
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>编号</DialogTitle>
					<DialogDescription>
						新增资产未手动填写编号时自动编号：按资产大类取号（如网络设备 NW-001），各大类独立计数。
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4">
					<AssetFormField label="序号位数" required>
						<Input
							type="number"
							min={1}
							max={12}
							value={form.digits}
							onChange={(event) => onChange({ ...form, digits: event.target.value })}
							placeholder="3"
						/>
					</AssetFormField>
					<div className="overflow-hidden rounded-md border border-border/70">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-border/70 bg-surface-soft text-left text-xs text-muted-foreground">
									<th className="px-3 py-2 font-medium">大类</th>
									<th className="px-3 py-2 font-medium">代码</th>
									<th className="px-3 py-2 text-right font-medium">下一个序号</th>
								</tr>
							</thead>
							<tbody>
								{ASSET_TYPE_GROUPS.map((group) => (
									<tr key={group.code} className="border-b border-border/50 last:border-b-0">
										<td className="px-3 py-1.5 text-foreground">{group.label}</td>
										<td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{group.code}</td>
										<td className="px-3 py-1.5 text-right">
											<Input
												type="number"
												min={1}
												value={form.sequences[group.code] ?? "1"}
												onChange={(event) =>
													onChange({
														...form,
														sequences: { ...form.sequences, [group.code]: event.target.value },
													})
												}
												className="ms-auto h-8 w-20 text-end"
											/>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<p className="text-xs text-muted-foreground">
						实际取号时会自动避开已占用的编号（含历史 ASSET-xxxx 旧编号），一般无需手动改。
					</p>
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
