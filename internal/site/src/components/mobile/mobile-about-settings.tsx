import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export type MobileAndroidDiagnosticItem = {
	label: string
	value: string
	description?: string
	tone?: "success" | "warning" | "danger" | "neutral"
}

export function MobileAndroidHubUrlCard({
	value,
	saving,
	diagnostics = [],
	onChange,
	onSave,
}: {
	value: string
	saving: boolean
	diagnostics?: MobileAndroidDiagnosticItem[]
	onChange: (value: string) => void
	onSave: () => void
}) {
	return (
		<section className="grid gap-3 rounded-lg border border-border/70 bg-surface-soft p-3 sm:max-w-xl">
			<div className="rounded-md border border-border/70 bg-card p-3">
				<h4 className="text-base font-semibold ">Android Hub 地址</h4>
				<p className="mt-1 text-pretty text-sm leading-relaxed text-muted-foreground">
					这里保存的是手机 App 连接的 Hub 地址，修改后会立即切换当前会话。
				</p>
			</div>
			<div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
				<Input
					value={value}
					className="min-h-11 bg-card shadow-none"
					onChange={(event) => onChange(event.target.value)}
				/>
				<Button type="button" className="min-h-11" disabled={saving || !value.trim()} onClick={onSave}>
					{saving ? "保存中" : "保存"}
				</Button>
			</div>
			{diagnostics.length > 0 && (
				<div className="grid gap-2">
					{diagnostics.map((item) => (
						<div key={item.label} className="grid gap-1 rounded-md border border-border/70 bg-card px-3 py-2">
							<div className="flex min-w-0 items-center justify-between gap-2">
								<div className="text-xs font-medium text-muted-foreground">{item.label}</div>
								<Badge variant="outline" className={cn("h-5 px-1.5 text-[11px]", diagnosticToneClassName(item.tone))}>
									{item.value}
								</Badge>
							</div>
							{item.description && (
								<div className="text-xs leading-relaxed text-muted-foreground">{item.description}</div>
							)}
						</div>
					))}
				</div>
			)}
		</section>
	)
}

export function MobileReleaseBadges({ badges }: { badges: string[] }) {
	return (
		<div className="flex flex-wrap gap-1.5 sm:hidden">
			{badges.map((badge) => (
				<span
					key={badge}
					className="inline-flex h-6 items-center rounded-md border border-border/70 bg-surface-card px-2 text-[11px] font-medium text-muted-foreground shadow-none"
				>
					{badge}
				</span>
			))}
		</div>
	)
}

function diagnosticToneClassName(tone: MobileAndroidDiagnosticItem["tone"]) {
	if (tone === "success") return "border-emerald-500/30 bg-card text-emerald-700 dark:text-emerald-200"
	if (tone === "warning") return "border-amber-500/30 bg-card text-amber-700 dark:text-amber-200"
	if (tone === "danger") return "border-red-500/30 bg-card text-red-700 dark:text-red-200"
	return ""
}
