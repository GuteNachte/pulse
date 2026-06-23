import { PlusIcon, Trash2Icon } from "lucide-react"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { IconPreview, URLInput } from "./form-controls"
import { FormField } from "./shared-ui"
import { resolveFormIconURL, splitURL, targetKindScope } from "./target-utils"
import type { IconPreviewState, IconSource, MonitorForm, MonitorTargetForm, TargetKind } from "./types"
import { targetKindOptions } from "./types"

export function MonitorDialog({
	open,
	form,
	systems,
	saving,
	iconPreview,
	onOpenChange,
	onFormChange,
	onIconPreviewChange,
	onSave,
	onFetchIcon,
	onAddTarget,
	onRemoveTarget,
}: {
	open: boolean
	form: MonitorForm
	systems: Array<{ id: string; name: string }>
	saving: boolean
	iconPreview: IconPreviewState
	onOpenChange: (open: boolean) => void
	onFormChange: (form: MonitorForm) => void
	onIconPreviewChange: (preview: IconPreviewState) => void
	onSave: () => void
	onFetchIcon: () => void
	onAddTarget: () => void
	onRemoveTarget: (index: number) => void
}) {
	function commitForm(nextForm: MonitorForm, syncIcon = false) {
		if (!syncIcon || nextForm.icon_source === "custom") {
			onFormChange(nextForm)
			return
		}
		const iconURL = resolveFormIconURL(nextForm)
		const syncedForm = { ...nextForm, icon_url: iconURL }
		onFormChange(syncedForm)
		onIconPreviewChange({ status: "idle", url: iconURL })
	}

	function updateTarget(index: number, patch: Partial<MonitorTargetForm>) {
		const targets = form.targets.map((target, currentIndex) =>
			currentIndex === index ? { ...target, ...patch } : target
		)
		commitForm({ ...form, targets }, true)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[calc(100dvh-2rem)] max-w-[44rem] overflow-hidden p-0">
				<DialogHeader className="border-b border-border/70 bg-card px-5 py-4 sm:px-6">
					<DialogTitle>{form.id ? "编辑网站监控" : "添加网站监控"}</DialogTitle>
					<DialogDescription>每个地址都会独立检测，并在卡片里显示独立状态条。</DialogDescription>
				</DialogHeader>
				<div className="grid max-h-[calc(100dvh-12rem)] gap-3 overflow-y-auto bg-surface-soft px-4 py-4 sm:px-6">
					<section className="grid gap-4 rounded-lg border border-border/70 bg-card p-3 shadow-none sm:p-4">
						<div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px]">
							<FormField label="名称">
								<Input
									value={form.name}
									onChange={(e) => onFormChange({ ...form, name: e.target.value })}
									placeholder="例如：MoviePilot"
								/>
							</FormField>
							<FormField label="归属机器">
								<Select
									value={form.system || ""}
									onValueChange={(system) => onFormChange({ ...form, system })}
									disabled={!systems.length}
								>
									<SelectTrigger>
										<SelectValue placeholder="选择机器" />
									</SelectTrigger>
									<SelectContent>
										{systems.map((system) => (
											<SelectItem key={system.id} value={system.id}>
												{system.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</FormField>
						</div>
						<div className="grid gap-4 sm:grid-cols-[1fr_160px]">
							<FormField label="分组">
								<Input
									value={form.group}
									onChange={(e) => onFormChange({ ...form, group: e.target.value })}
									placeholder="媒体"
								/>
							</FormField>
							<FormField label="启用状态">
								<div className="flex h-10 items-center justify-between rounded-md border border-border/70 bg-card px-3">
									<Label className="text-sm font-normal">启用监控</Label>
									<Switch checked={form.enabled} onCheckedChange={(enabled) => onFormChange({ ...form, enabled })} />
								</div>
							</FormField>
						</div>
						<FormField label="介绍">
							<Textarea
								value={form.description}
								onChange={(e) => onFormChange({ ...form, description: e.target.value })}
								placeholder="例如：影视媒体库管理和订阅下载服务"
							/>
						</FormField>
					</section>
					<section className="grid gap-3 rounded-lg border border-border/70 bg-card p-3 shadow-none sm:p-4">
						<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<div className="text-sm font-medium">检测地址</div>
								<p className="mt-1 text-xs text-muted-foreground">
									内网地址适合从 Hub 所在网络检测，外网地址适合验证公网访问。
								</p>
							</div>
							<Button type="button" variant="outline" className="h-10 shrink-0" onClick={onAddTarget}>
								<PlusIcon className="me-2 size-4" />
								添加地址
							</Button>
						</div>
						<div className="grid gap-3">
							{form.targets.map((target, index) => (
								<div
									key={`${target.id}-${index}`}
									className="grid gap-2 rounded-md border border-border/70 bg-card p-3 shadow-none"
								>
									<div className="grid gap-2 sm:grid-cols-[132px_minmax(0,1fr)_40px]">
										<Select
											value={target.kind}
											onValueChange={(value) => {
												const kind = value as TargetKind
												updateTarget(index, {
													kind,
													id: kind,
													protocol: target.address
														? target.protocol
														: targetKindScope(kind) === "internal"
															? "http://"
															: "https://",
												})
											}}
										>
											<SelectTrigger>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{targetKindOptions.map((option) => (
													<SelectItem key={option.value} value={option.value}>
														{option.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<URLInput
											protocol={target.protocol}
											address={target.address}
											placeholder={targetKindScope(target.kind) === "internal" ? "192.168.1.20:3000/" : "example.com"}
											onProtocolChange={(protocol) => updateTarget(index, { protocol })}
											onAddressChange={(value) => {
												const next = splitURL(value, target.protocol)
												updateTarget(index, next)
											}}
										/>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className="size-10"
											onClick={() => onRemoveTarget(index)}
											disabled={form.targets.length <= 1}
											aria-label={`删除${targetKindOptions.find((option) => option.value === target.kind)?.label ?? "地址"}`}
										>
											<Trash2Icon className="size-4" />
										</Button>
									</div>
								</div>
							))}
						</div>
					</section>
					<section className="grid gap-4 rounded-lg border border-border/70 bg-card p-3 shadow-none sm:p-4">
						<FormField label="期望内容（可选）">
							<Input
								value={form.expected_content}
								maxLength={512}
								onChange={(e) => onFormChange({ ...form, expected_content: e.target.value })}
								placeholder="例如：登录 / Dashboard / 服务已启动"
							/>
							<p className="mt-1 text-xs text-muted-foreground">
								填写后检测会校验响应正文是否包含该文本；留空时只检查 HTTP 可达和状态码。
							</p>
						</FormField>
						<div className="grid gap-4 sm:grid-cols-[170px_minmax(0,1fr)_110px]">
							<FormField label="图标来源">
								<Select
									value={form.icon_source}
									onValueChange={(value) => {
										const iconSource = value as IconSource
										const nextForm = { ...form, icon_source: iconSource }
										const iconURL = iconSource === "custom" ? form.icon_url : resolveFormIconURL(nextForm)
										onFormChange({ ...nextForm, icon_url: iconURL })
										onIconPreviewChange({ status: "idle", url: iconURL })
									}}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="internal">内网</SelectItem>
										<SelectItem value="external">外网</SelectItem>
										<SelectItem value="custom">自定义</SelectItem>
									</SelectContent>
								</Select>
							</FormField>
							<FormField label="图标地址">
								<Input
									value={form.icon_url}
									onChange={(e) => {
										onFormChange({ ...form, icon_url: e.target.value })
										onIconPreviewChange({ status: "idle", url: e.target.value })
									}}
									disabled={form.icon_source !== "custom"}
									placeholder="/favicon.ico"
								/>
							</FormField>
							<div className="grid content-end">
								<Button
									type="button"
									variant="outline"
									onClick={onFetchIcon}
									disabled={iconPreview.status === "loading"}
								>
									{iconPreview.status === "loading" ? "获取中..." : "获取图标"}
								</Button>
							</div>
						</div>
						<IconPreview preview={iconPreview} />
						<div className="grid gap-4 sm:grid-cols-2">
							<FormField label="检测间隔（秒）">
								<Input
									type="number"
									min={60}
									max={3600}
									value={form.interval_seconds}
									onChange={(e) => onFormChange({ ...form, interval_seconds: Number(e.target.value) })}
								/>
							</FormField>
							<FormField label="超时（秒）">
								<Input
									type="number"
									min={1}
									max={60}
									value={form.timeout_seconds}
									onChange={(e) => onFormChange({ ...form, timeout_seconds: Number(e.target.value) })}
								/>
							</FormField>
						</div>
					</section>
				</div>
				<DialogFooter className="border-t border-border/70 bg-surface-soft px-5 py-4 sm:px-6">
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						取消
					</Button>
					<Button onClick={onSave} disabled={saving}>
						{saving ? "保存中..." : "保存"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
