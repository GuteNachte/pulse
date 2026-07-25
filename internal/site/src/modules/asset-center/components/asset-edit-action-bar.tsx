import type { ReactNode } from "react"
import { PencilIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { assetActionScope } from "../asset-action-scope"

export function AssetEditActionBar({
	readOnly,
	saving,
	assetTagControl,
	archiveCounts,
}: {
	readOnly: boolean
	saving: boolean
	assetTagControl: ReactNode
	archiveCounts?: ReactNode
}) {
	return (
		<section className="z-10 flex min-w-0 flex-wrap items-center gap-2 border-b border-border/70 bg-card px-3 pb-2 pt-1 pe-16 sm:px-4 sm:pe-16">
			<div className="shrink-0 text-sm font-semibold text-foreground">编辑资产</div>
			<div className="flex min-w-[15rem] flex-1 items-center gap-2 sm:max-w-sm">
				<span className="shrink-0 text-xs font-medium text-muted-foreground">资产编号</span>
				<div className="min-w-0 flex-1">{assetTagControl}</div>
			</div>
			{archiveCounts && (
				<div className="hidden items-center gap-1 text-[11px] text-muted-foreground xl:flex">{archiveCounts}</div>
			)}
			<div className="ms-auto flex shrink-0 items-center gap-2">
				{assetActionScope.edit.includes("save") && (
					<Button type="submit" size="sm" disabled={readOnly || saving} className="gap-2">
						<PencilIcon className="size-3.5" />
						保存
					</Button>
				)}
			</div>
		</section>
	)
}
