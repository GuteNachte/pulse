import { useEffect, useState, type ReactNode } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { isOfficialColorRequiredForAssetType, mergeOfficialColorOptions } from "../asset-visual-color"
import { getPhoneVariantSpecMode } from "../asset-phone-variant-spec"
import type { AssetFieldDefinition } from "@/modules/asset-center/asset-schema"
import type { AssetLifecycleTone } from "@/modules/asset-center/asset-profile-summary"

export const PHONE_MEMORY_OPTIONS = [
	{ value: "4", label: "4 GB" },
	{ value: "6", label: "6 GB" },
	{ value: "8", label: "8 GB" },
	{ value: "12", label: "12 GB" },
	{ value: "16", label: "16 GB" },
	{ value: "18", label: "18 GB" },
	{ value: "24", label: "24 GB" },
]

export const PHONE_STORAGE_OPTIONS = [
	{ value: "64", label: "64 GB" },
	{ value: "128", label: "128 GB" },
	{ value: "256", label: "256 GB" },
	{ value: "512", label: "512 GB" },
	{ value: "1024", label: "1 TB" },
	{ value: "2048", label: "2 TB" },
]

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
	nextAssetTagPreview,
	onChange,
}: {
	field: AssetFieldDefinition
	value: string
	locationOptions?: string[]
	nextAssetTagPreview?: string
	onChange: (value: string) => void
}) {
	return (
		<AssetFormField
			label={field.label}
			required={field.required}
			className={field.span === "full" ? "sm:col-span-2" : undefined}
		>
			{field.key === "notes" ? (
				<Textarea value={value} readOnly={field.readOnly} onChange={(event) => onChange(event.target.value)} />
			) : field.key === "location" ? (
				<AssetLocationInput
					idPrefix="asset-location-options"
					value={value}
					locationOptions={locationOptions ?? []}
					onChange={onChange}
				/>
			) : field.key === "memory_gb" ? (
				<PhoneVariantSpecInput
					value={value}
					onChange={onChange}
					options={PHONE_MEMORY_OPTIONS}
					customPlaceholder="例如 10"
				/>
			) : field.key === "storage_gb" ? (
				<PhoneVariantSpecInput
					value={value}
					onChange={onChange}
					options={PHONE_STORAGE_OPTIONS}
					customPlaceholder="例如 384"
				/>
			) : field.key === "asset_tag" ? (
				<AssetTagInput value={value} onChange={onChange} nextAssetTagPreview={nextAssetTagPreview ?? ""} />
			) : field.type === "select" ? (
				<select
					value={value}
					disabled={field.readOnly}
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
					readOnly={field.readOnly}
					onChange={(event) => onChange(event.target.value)}
				/>
			)}
		</AssetFormField>
	)
}

export function AssetTagInput({
	value,
	onChange,
	nextAssetTagPreview,
	assetTagCandidates,
	name,
	id,
	required,
}: {
	value: string
	onChange: (value: string) => void
	nextAssetTagPreview?: string
	assetTagCandidates?: string[]
	name?: string
	id?: string
	required?: boolean
}) {
	const normalizedValue = value.trim()
	const candidates = Array.from(
		new Set(
			[normalizedValue, ...(assetTagCandidates ?? []), nextAssetTagPreview ?? ""]
				.map((candidate) => candidate.trim())
				.filter(Boolean)
		)
	)
	const presetValue = candidates[0] ?? ""
	const [customMode, setCustomMode] = useState(false)

	useEffect(() => {
		if (required && !normalizedValue && presetValue) {
			onChange(presetValue)
		}
	}, [normalizedValue, onChange, presetValue, required])

	const displayValue = normalizedValue || presetValue
	const selectValue = customMode ? "__custom__" : displayValue

	return (
		<div className="min-w-0">
			{name && <input type="hidden" name={name} value={normalizedValue} />}
			<Select
				value={selectValue || "__empty__"}
				onValueChange={(nextValue) => {
					const nextCustomMode = nextValue === "__custom__"
					setCustomMode(nextCustomMode)
					onChange(nextCustomMode || nextValue === "__empty__" ? displayValue : nextValue)
				}}
			>
				{customMode ? (
					<div className="relative min-w-0 rounded-md border border-input bg-card focus-within:border-ring/70 focus-within:ring-2 focus-within:ring-ring/15">
						<Input
							id={id}
							value={value}
							placeholder={presetValue || "输入资产编号"}
							onChange={(event) => onChange(event.target.value)}
							className="rounded-md border-0 bg-transparent pe-8 shadow-none focus-visible:ring-0"
						/>
						<SelectTrigger
							aria-label="选择资产编号候选"
							className="absolute inset-y-0 end-0 h-auto w-8 rounded-none border-0 bg-transparent px-0 shadow-none focus:border-0 focus:ring-0 [&>svg]:size-3.5"
						>
							<SelectValue className="sr-only" />
						</SelectTrigger>
					</div>
				) : (
					<SelectTrigger id={id}>
						<SelectValue placeholder="保存时自动生成" />
					</SelectTrigger>
				)}
				<SelectContent>
					<SelectGroup>
						{candidates.length === 0 && <SelectItem value="__empty__">保存时自动生成</SelectItem>}
						{candidates.map((candidate) => (
							<SelectItem key={candidate} value={candidate}>
								{candidate}
							</SelectItem>
						))}
						<SelectItem value="__custom__">自定义编号</SelectItem>
					</SelectGroup>
				</SelectContent>
			</Select>
		</div>
	)
}

export function PhoneVariantSpecInput({
	value,
	onChange,
	options,
	customPlaceholder,
}: {
	value: string
	onChange: (value: string) => void
	options: { value: string; label: string }[]
	customPlaceholder?: string
}) {
	const normalizedValue = value.trim()
	const mode = getPhoneVariantSpecMode(
		normalizedValue,
		options.map((option) => option.value)
	)
	const [customMode, setCustomMode] = useState(mode === "custom")
	const showCustom = customMode || mode === "custom"

	useEffect(() => {
		if (mode === "custom") {
			setCustomMode(true)
		} else {
			setCustomMode(false)
		}
	}, [mode])

	return (
		<Select
			value={showCustom ? "__custom__" : normalizedValue || "__empty__"}
			onValueChange={(nextValue) => {
				const nextCustomMode = nextValue === "__custom__"
				setCustomMode(nextCustomMode)
				onChange(nextCustomMode || nextValue === "__empty__" ? "" : nextValue)
			}}
		>
			{showCustom ? (
				<div className="relative min-w-0 rounded-md border border-input bg-card focus-within:border-ring/70 focus-within:ring-2 focus-within:ring-ring/15">
					<Input
						type="number"
						min="1"
						step="1"
						value={normalizedValue}
						placeholder={customPlaceholder}
						onChange={(event) => onChange(event.target.value)}
						className="rounded-md border-0 bg-transparent pe-8 shadow-none focus-visible:ring-0"
					/>
					<SelectTrigger
						aria-label="切换预设容量"
						className="absolute inset-y-0 end-0 h-auto w-8 rounded-none border-0 bg-transparent px-0 shadow-none focus:border-0 focus:ring-0 [&>svg]:size-3.5"
					>
						<SelectValue className="sr-only" />
					</SelectTrigger>
				</div>
			) : (
				<SelectTrigger>
					<SelectValue placeholder="未设置" />
				</SelectTrigger>
			)}
			<SelectContent>
				<SelectGroup>
					<SelectItem value="__empty__">未设置</SelectItem>
					{options.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							{option.label}
						</SelectItem>
					))}
					<SelectItem value="__custom__">自定义</SelectItem>
				</SelectGroup>
			</SelectContent>
		</Select>
	)
}

export function PhoneVariantSpecField({
	name,
	label,
	required,
	defaultValue,
	options,
	customPlaceholder,
}: {
	name: string
	label: string
	required?: boolean
	defaultValue?: string
	options: { value: string; label: string }[]
	customPlaceholder?: string
}) {
	const [value, setValue] = useState(defaultValue ?? "")
	useEffect(() => {
		setValue(defaultValue ?? "")
	}, [defaultValue])

	return (
		<div className="grid gap-2">
			<Label htmlFor={`${name}-select`}>
				{label}
				{required && <span className="ms-1 text-destructive">*</span>}
			</Label>
			<input type="hidden" name={name} value={value} />
			<PhoneVariantSpecInput
				value={value}
				onChange={setValue}
				options={options}
				customPlaceholder={customPlaceholder}
			/>
		</div>
	)
}

export function OfficialColorField({
	name,
	label,
	defaultValue,
	options,
	requireOfficial,
}: {
	name: string
	label: string
	defaultValue?: string
	options: string[]
	requireOfficial: boolean
}) {
	const mergedOptions = requireOfficial ? options : mergeOfficialColorOptions(options, defaultValue)
	if (!requireOfficial && options.length === 0) {
		return (
			<div className="grid gap-2">
				<div className="flex items-center justify-between gap-2">
					<Label htmlFor={name}>{label}</Label>
				</div>
				<Input id={name} name={name} defaultValue={defaultValue} placeholder="资料补全后可改为官方配色" />
			</div>
		)
	}
	return (
		<div className="grid gap-2">
			<div className="flex items-center justify-between gap-2">
				<Label htmlFor={name}>{label}</Label>
			</div>
			{mergedOptions.length > 0 && <input type="hidden" name="colors_available" value={mergedOptions.join(", ")} />}
			<select
				id={name}
				name={name}
				defaultValue={requireOfficial && defaultValue && !hasSameColor(options, defaultValue) ? "" : defaultValue || ""}
				className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-ring/70 focus:ring-2 focus:ring-ring/15"
			>
				<option value="">{options.length ? "请选择官方配色" : "请先智能匹配"}</option>
				{mergedOptions.map((option) => (
					<option key={option} value={option}>
						{option}
					</option>
				))}
			</select>
			{requireOfficial && options.length === 0 && (
				<div className="text-xs text-muted-foreground">
					手机等固定规格设备不再手输颜色，需要先智能匹配生成官方颜色后选择。
				</div>
			)}
		</div>
	)
}

export function OfficialColorPicker({
	value,
	options,
	assetType,
	onChange,
}: {
	value: string
	options: string[]
	assetType: Parameters<typeof isOfficialColorRequiredForAssetType>[0]
	onChange: (value: string) => void
}) {
	const requireOfficial = isOfficialColorRequiredForAssetType(assetType)
	const mergedOptions = requireOfficial ? options : mergeOfficialColorOptions(options, value)
	if (!requireOfficial && options.length === 0) {
		return (
			<div className="grid gap-2">
				<div className="flex items-center justify-between gap-2">
					<Label htmlFor="asset-visual-color">配色</Label>
				</div>
				<Input
					id="asset-visual-color"
					value={value}
					onChange={(event) => onChange(event.target.value)}
					placeholder="资料补全后优先选择官方配色"
				/>
			</div>
		)
	}
	return (
		<div className="grid gap-2">
			<div className="flex items-center justify-between gap-2">
				<Label htmlFor="asset-visual-color">官方配色</Label>
			</div>
			<select
				id="asset-visual-color"
				value={requireOfficial && value && !hasSameColor(options, value) ? "" : value}
				onChange={(event) => onChange(event.target.value)}
				className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-ring/70 focus:ring-2 focus:ring-ring/15"
			>
				<option value="">{options.length ? "不指定配色，按颜色分组找图" : "不指定配色，先按图片来源分类"}</option>
				{mergedOptions.map((option) => (
					<option key={option} value={option}>
						{option}
					</option>
				))}
			</select>
		</div>
	)
}

function hasSameColor(options: string[], value: string) {
	const normalizedValue = value.trim().toLowerCase()
	return options.some((option) => option.trim().toLowerCase() === normalizedValue)
}

export function AssetLocationInput({
	idPrefix,
	value,
	locationOptions,
	onChange,
	allowNone = false,
}: {
	idPrefix: string
	value: string
	locationOptions: string[]
	onChange: (value: string) => void
	allowNone?: boolean
}) {
	const parts = splitLocationPath(value)
	const rootValue = parts[0] ?? ""
	const secondValue = parts[1] ?? ""
	const rootOptions = getLocationRootOptions(locationOptions, rootValue)
	const secondOptions = getLocationSecondOptions(locationOptions, rootValue, secondValue)
	const rootSelectValue = allowNone && !rootValue ? "__none__" : rootValue

	function updateRoot(nextRoot: string) {
		if (nextRoot === "__none__") {
			onChange("")
			return
		}
		const root = nextRoot.trim()
		const second = getLocationSecondOptions(locationOptions, root, "").includes(secondValue.trim())
			? secondValue.trim()
			: ""
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
				<select
					id={`${idPrefix}-root`}
					value={rootSelectValue}
					onChange={(event) => {
						updateRoot(event.target.value)
					}}
					className={locationSelectClassName}
				>
					{allowNone ? <option value="__none__">无</option> : <option value="">选择一级位置</option>}
					{rootOptions.map((location) => (
						<option key={location} value={location}>
							{location}
						</option>
					))}
				</select>
			</div>
			<div className="grid gap-1.5">
				<div className="text-xs text-muted-foreground">二级房间</div>
				<select
					id={`${idPrefix}-second`}
					value={secondValue}
					onChange={(event) => {
						updateSecond(event.target.value)
					}}
					disabled={!rootValue}
					className={locationSelectClassName}
				>
					<option value="">{rootValue ? "选择二级房间" : "先选择一级位置"}</option>
					{secondOptions.map((location) => (
						<option key={location} value={location}>
							{location}
						</option>
					))}
				</select>
			</div>
		</div>
	)
}

const locationSelectClassName =
	"h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-ring/70 focus:ring-2 focus:ring-ring/15 disabled:cursor-not-allowed disabled:opacity-60"

export function AssetFormField({
	label,
	required,
	children,
	className,
}: {
	label: string
	required?: boolean
	children: ReactNode
	className?: string
}) {
	return (
		<div className={cn("grid gap-2", className)}>
			<Label>
				{label}
				{required && <span className="ms-1 text-destructive">*</span>}
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
