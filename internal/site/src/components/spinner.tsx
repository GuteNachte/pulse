import { cn } from "@/lib/utils"
import { LoadingState } from "@/components/ui/loading-state"

export default function Spinner({ msg, className }: { msg?: string; className?: string }) {
	return (
		<div className={cn("absolute inset-0 grid h-full place-items-center px-3", className)}>
			<LoadingState
				compact
				title={msg || "正在加载图表"}
				description={msg ? undefined : "等待实时数据绘制"}
				className="min-h-0 w-full max-w-xs p-0"
			/>
		</div>
	)
}
