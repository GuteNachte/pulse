import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type SettingsSaveStatus = "idle" | "dirty" | "saving" | "saved" | "error"

export function SettingsSaveBar({
	status,
	error,
	onSave,
	onDiscard,
}: {
	status: SettingsSaveStatus
	error?: string
	onSave: () => void
	onDiscard: () => void
}) {
	if (status === "idle") {
		return null
	}

	const saved = status === "saved"
	const dotClass = saved ? "bg-emerald-500" : status === "error" ? "bg-destructive" : "bg-amber-500"
	const label = saved
		? "设置已保存"
		: status === "saving"
			? "正在保存…"
			: status === "error"
				? "保存失败"
				: "有未保存的修改"

	return (
		<div
			role="status"
			aria-live="polite"
			className="sticky bottom-3 z-10 mt-2 flex flex-col gap-3 rounded-lg border border-border/70 bg-card px-4 py-3 shadow-none sm:flex-row sm:items-center sm:justify-between"
		>
			<div className="flex min-w-0 items-center gap-2 text-xs">
				<span className={cn("size-1.5 shrink-0 rounded-full", dotClass)} aria-hidden="true" />
				<span className="font-medium text-foreground">{label}</span>
				{error ? <span className="truncate text-destructive">{error}</span> : null}
			</div>
			{!saved ? (
				<div className="flex items-center justify-end gap-2">
					<Button variant="ghost" size="sm" onClick={onDiscard} disabled={status === "saving"}>
						放弃
					</Button>
					<Button size="sm" onClick={onSave} disabled={status === "saving"}>
						{status === "saving" ? "保存中…" : "保存修改"}
					</Button>
				</div>
			) : null}
		</div>
	)
}
