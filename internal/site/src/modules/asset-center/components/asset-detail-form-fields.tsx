import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

export function TextField({
	name,
	label,
	type = "text",
	placeholder,
	required,
	className,
	defaultValue,
}: {
	name: string
	label: string
	type?: string
	placeholder?: string
	required?: boolean
	className?: string
	defaultValue?: string
}) {
	return (
		<div className={cn("grid gap-2", className)}>
			<Label htmlFor={name}>
				{label}
				{required && <span className="ms-1 text-destructive">*</span>}
			</Label>
			<Input
				id={name}
				name={name}
				type={type}
				placeholder={placeholder}
				required={required}
				defaultValue={defaultValue}
			/>
		</div>
	)
}

export function SelectField({
	name,
	label,
	options,
	defaultValue,
	value,
	onChange,
	placeholder,
}: {
	name: string
	label: string
	options: { value: string; label: string }[]
	defaultValue?: string
	value?: string
	onChange?: (value: string) => void
	placeholder?: string
}) {
	return (
		<div className="grid gap-2">
			<Label htmlFor={name}>{label}</Label>
			<select
				id={name}
				name={name}
				defaultValue={value === undefined ? defaultValue || "" : undefined}
				value={value}
				onChange={onChange ? (event) => onChange(event.target.value) : undefined}
				className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-ring/70 focus:ring-2 focus:ring-ring/15"
			>
				{placeholder && <option value="">{placeholder}</option>}
				{options.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
		</div>
	)
}

export function TextAreaField({
	name,
	label,
	className,
	defaultValue,
}: {
	name: string
	label: string
	className?: string
	defaultValue?: string
}) {
	return (
		<div className={cn("grid gap-2", className)}>
			<Label htmlFor={name}>{label}</Label>
			<Textarea id={name} name={name} defaultValue={defaultValue} />
		</div>
	)
}
