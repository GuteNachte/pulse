export type AssetCompletenessLevelKey = "complete" | "usable" | "incomplete" | "critical"
export type AssetCompletenessTone = "neutral" | "ok" | "warning" | "danger"

export type AssetCompletenessLevel = {
	key: AssetCompletenessLevelKey
	label: string
	tone: AssetCompletenessTone
	minScore: number
	tagClassName: string
	barClassName: string
}

export const ASSET_COMPLETENESS_LEVELS: readonly AssetCompletenessLevel[] = [
	{
		key: "complete",
		label: "资料完整",
		tone: "ok",
		minScore: 90,
		tagClassName:
			"border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300",
		barClassName: "bg-emerald-500",
	},
	{
		key: "usable",
		label: "资料可用",
		tone: "neutral",
		minScore: 70,
		tagClassName: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-300",
		barClassName: "bg-sky-500",
	},
	{
		key: "incomplete",
		label: "资料待补",
		tone: "warning",
		minScore: 45,
		tagClassName:
			"border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300",
		barClassName: "bg-amber-500",
	},
	{
		key: "critical",
		label: "资料缺口大",
		tone: "danger",
		minScore: 0,
		tagClassName: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300",
		barClassName: "bg-red-500",
	},
]

export function getAssetCompletenessLevel(score: number) {
	const normalizedScore = Math.max(0, Math.min(100, Math.round(score)))
	return ASSET_COMPLETENESS_LEVELS.find((level) => normalizedScore >= level.minScore) ?? ASSET_COMPLETENESS_LEVELS[3]
}
