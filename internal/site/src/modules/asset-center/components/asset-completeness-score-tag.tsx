import { cn } from "@/lib/utils"
import { getAssetCompletenessLevel } from "../asset-completeness-level"

export function AssetCompletenessScoreTag({ score, className }: { score: number; className?: string }) {
	const level = getAssetCompletenessLevel(score)
	return (
		<span
			className={cn(
				"inline-flex h-5 w-11 shrink-0 items-center justify-center rounded-md border px-1 font-mono text-[11px] font-medium tabular-nums",
				level.tagClassName,
				className
			)}
			title={`${level.label}，${score}%`}
		>
			{score}%
		</span>
	)
}
