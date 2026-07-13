import { CableIcon, GitBranchIcon, MoreHorizontalIcon, PaperclipIcon, Trash2Icon, WrenchIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { assetActionScope } from "../asset-action-scope"

export function AssetDetailActionMenu({
	readOnly,
	onOpenInterface,
	onOpenRelation,
	onOpenMaintenance,
	onOpenAttachment,
	onDelete,
}: {
	readOnly: boolean
	onOpenInterface: () => void
	onOpenRelation: () => void
	onOpenMaintenance: () => void
	onOpenAttachment: () => void
	onDelete: () => void
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button type="button" variant="outline" size="icon" className="size-9 shrink-0" aria-label="资产档案操作">
					<MoreHorizontalIcon className="size-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-40">
				{assetActionScope.detail.includes("interface") && (
					<DropdownMenuItem onClick={onOpenInterface} disabled={readOnly}>
						<CableIcon className="size-4" />
						接口
					</DropdownMenuItem>
				)}
				{assetActionScope.detail.includes("relation") && (
					<DropdownMenuItem onClick={onOpenRelation} disabled={readOnly}>
						<GitBranchIcon className="size-4" />
						关系
					</DropdownMenuItem>
				)}
				{assetActionScope.detail.includes("maintenance") && (
					<DropdownMenuItem onClick={onOpenMaintenance} disabled={readOnly}>
						<WrenchIcon className="size-4" />
						维护记录
					</DropdownMenuItem>
				)}
				{assetActionScope.detail.includes("attachment") && (
					<DropdownMenuItem onClick={onOpenAttachment} disabled={readOnly}>
						<PaperclipIcon className="size-4" />
						附件
					</DropdownMenuItem>
				)}
				<DropdownMenuSeparator />
				{assetActionScope.detail.includes("delete") && (
					<DropdownMenuItem onClick={onDelete} disabled={readOnly} className="text-destructive focus:text-destructive">
						<Trash2Icon className="size-4" />
						删除资产
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
