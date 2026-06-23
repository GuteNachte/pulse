import * as React from "react"

import { cn } from "@/lib/utils"

const Alert = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
	<div
		ref={ref}
		role="alert"
		className={cn(
			"relative w-full rounded-lg border border-border/70 bg-card p-4 text-foreground shadow-none [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-muted-foreground [&>svg+div]:translate-y-[-3px] [&>svg~*]:ps-7",
			className
		)}
		{...props}
	/>
))
Alert.displayName = "Alert"

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
	({ className, ...props }, ref) => (
		<h5 ref={ref} className={cn("mb-1 -mt-0.5 text-sm font-semibold leading-tight", className)} {...props} />
	)
)
AlertTitle.displayName = "AlertTitle"

const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
	({ className, ...props }, ref) => (
		<div ref={ref} className={cn("text-sm text-muted-foreground [&_p]:leading-relaxed", className)} {...props} />
	)
)
AlertDescription.displayName = "AlertDescription"

export { Alert, AlertTitle, AlertDescription }
