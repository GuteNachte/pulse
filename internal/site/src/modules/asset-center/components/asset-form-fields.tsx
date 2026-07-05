import type { ReactNode } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { AssetFieldDefinition, AssetLifecycleTone } from "@/modules/asset-center/asset-schema"

export function AssetFormSection({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="rounded-lg border border-border/70 bg-card p-3">
			<div className="mb-3 text-sm font-medium text-foreground">{title}</div>
			<div className="grid gap-3 sm:grid-cols-2">{children}</div>
		</section>
	)
}

export function AssetInput({
	field,
	value,
	locationOptions,
	onChange,
}: {
	field: AssetFieldDefinition
	value: string
	locationOptions?: string[]
	onChange: (value: string) => void
}) {
	return (
		<AssetFormField
			label={field.label}
			required={field.required}
			capture={field.capture}
			className={field.span === "full" ? "sm:col-span-2" : undefined}
		>
			{field.key === "notes" ? (
				<Textarea value={value} onChange={(event) => onChange(event.target.value)} />
			) : field.key === "location" ? (
				<AssetLocationInput
					idPrefix="asset-location-options"
					value={value}
					locationOptions={locationOptions ?? []}
					onChange={onChange}
				/>
			) : field.type === "select" ? (
				<select
					value={value}
					onChange={(event) => onChange(event.target.value)}
					className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
				>
					<option value="">未设置</option>
					{field.options?.map((option) => (
						<option key={option.value} value={option.value}>
							{option.label}
						</option>
					))}
				</select>
			) : (
				<Input
					type={field.type === "number" || field.type === "date" || field.type === "url" ? field.type : "text"}
					value={value}
					placeholder={field.placeholder}
					onChange={(event) => onChange(event.target.value)}
				/>
			)}
		</AssetFormField>
	)
}

export function AssetLocationInput({
	idPrefix,
	value,
	locationOptions,
	onChange,
}: {
	idPrefix: string
	value: string
	locationOptions: string[]
	onChange: (value: string) => void
}) {
	const parts = splitLocationPath(value)
	const rootValue = parts[0] ?? ""
	const secondValue = parts[1] ?? ""
	const rootOptions = getLocationRootOptions(locationOptions, rootValue)
	const secondOptions = getLocationSecondOptions(locationOptions, rootValue, secondValue)
	const rootListId = `${idPrefix}-root`
	const secondListId = `${idPrefix}-second`

	function updateRoot(nextRoot: string) {
		const root = nextRoot.trim()
		const second = secondValue.trim()
		onChange(root ? joinLocationPath(root, second) : "")
	}

	function updateSecond(nextSecond: string) {
		const root = rootValue.trim()
		const second = nextSecond.trim()
		onChange(root ? joinLocationPath(root, second) : "")
	}

	return (
		<div className="grid gap-2 sm:grid-cols-2">
			<div className="grid gap-1.5">
				<div className="text-xs text-muted-foreground">一级位置</div>
				<Input
					list={rootListId}
					value={rootValue}
					placeholder="家 / 公司"
					onChange={(event) => updateRoot(event.target.value)}
				/>
				<datalist id={rootListId}>
					{rootOptions.map((location) => (
						<option key={location} value={location} />
					))}
				</datalist>
			</div>
			<div className="grid gap-1.5">
				<div className="text-xs text-muted-foreground">二级房间</div>
				<Input
					list={secondListId}
					value={secondValue}
					placeholder={rootValue ? "客厅 / 书房 / 办公室" : "先填写一级位置"}
					onChange={(event) => updateSecond(event.target.value)}
					disabled={!rootValue}
				/>
				<datalist id={secondListId}>
					{secondOptions.map((location) => (
						<option key={location} value={location} />
					))}
				</datalist>
			</div>
		</div>
	)
}

export function AssetFormField({
	label,
	required,
	capture,
	children,
	className,
}: {
	label: string
	required?: boolean
	capture?: AssetFieldDefinition["capture"]
	children: ReactNode
	className?: string
}) {
	return (
		<div className={cn("grid gap-2", className)}>
			<Label className="flex min-w-0 flex-wrap items-center gap-1.5">
				<span>
					{label}
					{required && <span className="ms-1 text-destructive">*</span>}
				</span>
				<AssetFieldCaptureTag capture={capture} required={required} />
			</Label>
			{children}
		</div>
	)
}

function splitLocationPath(value: string) {
	return value
		.split(/\s*\/\s*/)
		.map((part) => part.trim())
		.filter(Boolean)
		.slice(0, 2)
}

function joinLocationPath(root: string, second: string) {
	return [root.trim(), second.trim()].filter(Boolean).join(" / ")
}

function getLocationRootOptions(locationOptions: string[], currentRoot: string) {
	const roots = new Set<string>()
	if (currentRoot.trim()) roots.add(currentRoot.trim())
	for (const option of locationOptions) {
		const [root] = splitLocationPath(option)
		if (root) roots.add(root)
	}
	return [...roots].sort((a, b) => a.localeCompare(b, "zh-CN"))
}

function getLocationSecondOptions(locationOptions: string[], rootValue: string, currentSecond: string) {
	const seconds = new Set<string>()
	if (currentSecond.trim()) seconds.add(currentSecond.trim())
	for (const option of locationOptions) {
		const [root, second] = splitLocationPath(option)
		if (root && second && root === rootValue.trim()) seconds.add(second)
	}
	return [...seconds].sort((a, b) => a.localeCompare(b, "zh-CN"))
}

export function AssetFieldCaptureTag({
	capture,
	required,
}: {
	capture?: AssetFieldDefinition["capture"]
	required?: boolean
}) {
	if (!capture) return null
	const label =
		capture === "agent_required"
			? "建档线索"
			: capture === "agent_collectable"
				? "本地采集"
				: capture === "future_collectable"
					? "联网匹配"
					: "手动主档"
	return (
		<span
			className={cn(
				"rounded-sm border px-1 py-0.5 text-[10px] font-medium leading-none",
				capture === "agent_required" || required
					? "border-blue-200 bg-blue-50 text-blue-700"
					: capture === "agent_collectable"
						? "border-emerald-200 bg-emerald-50 text-emerald-700"
						: capture === "future_collectable"
							? "border-violet-200 bg-violet-50 text-violet-700"
							: "border-border/70 bg-surface-soft text-muted-foreground"
			)}
		>
			{label}
		</span>
	)
}

export function AssetMetaTag({ children, tone = "neutral" }: { children: ReactNode; tone?: AssetLifecycleTone }) {
	return (
		<span
			className={cn(
				"rounded-md border px-1.5 py-0.5 text-[11px]",
				tone === "danger"
					? "border-red-200 bg-red-50 text-red-700"
					: tone === "warning"
						? "border-amber-200 bg-amber-50 text-amber-700"
						: tone === "ok"
							? "border-emerald-200 bg-emerald-50 text-emerald-700"
							: "border-border/70 bg-card text-muted-foreground"
			)}
		>
			{children}
		</span>
	)
}
