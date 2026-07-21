import { cn } from "@/lib/utils"
import type { AssetRecord } from "@/types"
import { getMetadataString } from "../asset-schema"

type AssetShowcaseTag = {
	label: string
	value: string
	tone?: "neutral" | "strong"
}

export function AssetShowcaseTags({ asset }: { asset: AssetRecord }) {
	const tags = buildAssetShowcaseTags(asset)
	if (tags.length === 0) return null
	return (
		<div className="flex min-w-0 flex-wrap gap-1">
			{tags.map((tag) => (
				<span
					key={`${tag.label}-${tag.value}`}
					className={cn(
						"inline-flex h-5 max-w-full items-center gap-1 rounded-md border px-1.5 text-[11px]",
						tag.tone === "strong"
							? "border-primary/25 bg-primary/10 text-primary"
							: "border-border/70 bg-card text-muted-foreground"
					)}
				>
					<span className="shrink-0 text-[10px] text-muted-foreground">{tag.label}</span>
					<span className="min-w-0 truncate font-medium text-foreground">{tag.value}</span>
				</span>
			))}
		</div>
	)
}

function buildAssetShowcaseTags(asset: AssetRecord) {
	const tags: AssetShowcaseTag[] = []
	const seen = new Set<string>()
	const metadata = asset.metadata ?? {}
	const color = firstNonEmpty(getMetadataString(metadata, "color"), getMetadataString(metadata, "device_color"))

	function add(label: string, value?: string, tone?: AssetShowcaseTag["tone"]) {
		const text = value?.trim()
		if (!text) return
		const key = `${label}:${text}`
		if (seen.has(key)) return
		seen.add(key)
		tags.push({ label, value: text, tone })
	}

	if (asset.type !== "internet") {
		add("位置", asset.location || "未填写", asset.location ? "strong" : "neutral")
		add("颜色", color)
	}
	add("用途", asset.role || "未填写", asset.role ? "strong" : "neutral")
	asset.tags?.slice(0, 4).forEach((tag) => {
		add("标签", tag)
	})
	return tags.slice(0, 8)
}

function firstNonEmpty(...values: (string | undefined)[]) {
	return values.find((value) => value?.trim())?.trim() ?? ""
}
