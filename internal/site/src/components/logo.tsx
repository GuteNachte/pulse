import { cn } from "@/lib/utils"
import { APP_NAME } from "@/lib/branding"

export function Logo({ className }: { className?: string }) {
	return (
		<span className={cn("inline-flex items-center font-semibold tracking-normal text-foreground", className)}>
			<span className="logo-wordmark text-[inherit] leading-none">{APP_NAME}</span>
		</span>
	)
}
