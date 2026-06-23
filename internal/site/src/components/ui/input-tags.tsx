import { XIcon } from "lucide-react"
import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { InputProps } from "./input"

type InputTagsProps = Omit<InputProps, "value" | "onChange"> & {
	value: string[]
	onChange: React.Dispatch<React.SetStateAction<string[]>>
}

const InputTags = React.forwardRef<HTMLInputElement, InputTagsProps>(
	({ className, value, onChange, ...props }, ref) => {
		const [pendingDataPoint, setPendingDataPoint] = React.useState("")

		React.useEffect(() => {
			if (pendingDataPoint.includes(",")) {
				const newDataPoints = new Set([...value, ...pendingDataPoint.split(",").map((chunk) => chunk.trim())])
				onChange(Array.from(newDataPoints))
				setPendingDataPoint("")
			}
		}, [pendingDataPoint, onChange, value])

		const addPendingDataPoint = () => {
			if (pendingDataPoint) {
				const newDataPoints = new Set([...value, pendingDataPoint])
				onChange(Array.from(newDataPoints))
				setPendingDataPoint("")
			}
		}

		return (
			<div
				className={cn(
					"flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-card px-2.5 py-1.5 text-sm shadow-none ring-offset-background transition-[border-color,background-color] duration-150 ease-out placeholder:text-muted-foreground has-focus-visible:border-ring/70 has-focus-visible:outline-hidden has-focus-visible:ring-2 has-focus-visible:ring-ring/15 has-focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50",
					className
				)}
			>
				{value.map((item) => (
					<Badge key={item} variant="secondary" className="min-h-10 gap-1 rounded-md border-border/70 bg-card px-2">
						<span className="max-w-48 truncate">{item}</span>
						<Button
							variant="ghost"
							size="icon"
							className="-my-1.5 -me-1.5 size-10 rounded-md text-muted-foreground transition-[background-color,color,scale] hover:bg-surface-soft hover:text-foreground active:scale-[0.96]"
							onClick={() => {
								onChange(value.filter((i) => i !== item))
							}}
							aria-label={`移除 ${item}`}
						>
							<XIcon className="size-3" />
						</Button>
					</Badge>
				))}
				<input
					className="min-w-32 flex-1 bg-transparent px-1 py-1 outline-hidden placeholder:text-muted-foreground"
					value={pendingDataPoint}
					onChange={(e) => setPendingDataPoint(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === ",") {
							e.preventDefault()
							addPendingDataPoint()
						} else if (e.key === "Backspace" && pendingDataPoint.length === 0 && value.length > 0) {
							e.preventDefault()
							onChange(value.slice(0, -1))
						}
					}}
					{...props}
					ref={ref}
				/>
			</div>
		)
	}
)

InputTags.displayName = "InputTags"

export { InputTags }
