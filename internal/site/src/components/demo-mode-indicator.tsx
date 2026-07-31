import { EyeIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { demoModeIndicatorModel, isDemoMode } from "@/demo/mode"
import { cn } from "@/lib/utils"

export function DemoModeIndicator({ className }: { className?: string }) {
	if (!isDemoMode()) {
		return null
	}

	return (
		<Badge variant="outline" className={cn("h-6 shrink-0 gap-1.5 px-2 text-[11px] text-muted-foreground", className)}>
			<EyeIcon className="size-3" aria-hidden="true" />
			{demoModeIndicatorModel.label}
		</Badge>
	)
}
