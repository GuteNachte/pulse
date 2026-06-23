import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
	"inline-flex h-6 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium shadow-none transition-[background-color,border-color,color] duration-150 ease-out focus:outline-hidden focus:ring-2 focus:ring-ring/30 focus:ring-offset-2",
	{
		variants: {
			variant: {
				default: "border-border bg-card text-foreground",
				secondary: "border-border bg-surface-card text-muted-foreground",
				destructive: "border-destructive/25 bg-card text-destructive",
				outline: "border-border bg-card text-foreground",
				success: "border-emerald-500/25 bg-card text-emerald-700 dark:text-emerald-300",
				danger: "border-red-500/25 bg-card text-red-700 dark:text-red-300",
				warning: "border-amber-500/28 bg-card text-amber-700 dark:text-amber-300",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	}
)

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
	return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
