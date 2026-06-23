import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
	"inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-md text-sm font-semibold ring-offset-background transition-[background-color,border-color,color,transform,opacity] duration-150 ease-out focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer active:scale-[0.96]",
	{
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground shadow-none hover:bg-primary/90",
				destructive: "bg-destructive text-destructive-foreground shadow-none hover:bg-destructive/90",
				outline:
					"border border-border bg-card text-foreground shadow-none hover:border-border hover:bg-surface-soft hover:text-foreground",
				secondary: "bg-surface-soft text-foreground shadow-none hover:bg-surface-card",
				ghost: "text-foreground hover:bg-surface-soft hover:text-foreground",
				link: "text-primary underline-offset-4 hover:underline",
			},
			size: {
				default: "h-10 px-4 py-2",
				sm: "h-10 rounded-md px-3 text-xs",
				lg: "h-11 rounded-md px-8",
				icon: "size-10",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	}
)

export interface ButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement>,
		VariantProps<typeof buttonVariants> {
	asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
	({ className, variant, size, asChild = false, ...props }, ref) => {
		const Comp = asChild ? Slot : "button"
		return (
			<Comp
				className={cn(buttonVariants({ variant, size, className }))}
				ref={ref}
				{...(!asChild ? { type: "button" } : {})}
				{...props}
			/>
		)
	}
)
Button.displayName = "Button"

export { Button, buttonVariants }
