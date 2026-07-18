import { CableIcon, GitBranchIcon, MoreHorizontalIcon, PaperclipIcon, Trash2Icon, WrenchIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { assetActionScope } from "../asset-action-scope"

export function AssetDetailActionMenu({
	readOnly,
	editAction,
	onOpenInterface,
	onOpenRelation,
	onOpenMaintenance,
	onOpenAttachment,
	onDelete,
	showInterface = true,
	relationLabel = "关系",
}: {
	readOnly: boolean
	editAction: ReactNode
	onOpenInterface: () => void
	onOpenRelation: () => void
	onOpenMaintenance: () => void
	onOpenAttachment: () => void
	onDelete: () => void
	showInterface?: boolean
	relationLabel?: string
}) {
	return (
		<div className="flex flex-wrap items-center justify-end gap-2">
			{showInterface && assetActionScope.detail.includes("interface") ? (
				<DirectAction label="接口" onClick={onOpenInterface} disabled={readOnly} icon={<CableIcon />} />
			) : null}
			{assetActionScope.detail.includes("relation") ? (
				<DirectAction label={relationLabel} onClick={onOpenRelation} disabled={readOnly} icon={<GitBranchIcon />} />
			) : null}
			{assetActionScope.detail.includes("maintenance") ? (
				<DirectAction label="维护" onClick={onOpenMaintenance} disabled={readOnly} icon={<WrenchIcon />} />
			) : null}
			{assetActionScope.detail.includes("attachment") ? (
				<DirectAction label="附件" onClick={onOpenAttachment} disabled={readOnly} icon={<PaperclipIcon />} />
			) : null}

			{editAction}

			<DropdownMenu>
				<Tooltip>
					<TooltipTrigger asChild>
						<DropdownMenuTrigger asChild>
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="h-9 min-h-9 shrink-0 gap-1.5 px-2.5"
								aria-label="更多"
							>
								<MoreHorizontalIcon data-icon="inline-start" />
								<span className="hidden xl:inline">更多</span>
							</Button>
						</DropdownMenuTrigger>
					</TooltipTrigger>
					<TooltipContent>更多</TooltipContent>
				</Tooltip>
				<DropdownMenuContent align="end" className="min-w-40">
					{assetActionScope.detail.includes("delete") ? (
						<DropdownMenuItem
							onClick={onDelete}
							disabled={readOnly}
							className="text-destructive focus:text-destructive"
						>
							<Trash2Icon />
							删除资产
						</DropdownMenuItem>
					) : null}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	)
}

function DirectAction({
	label,
	icon,
	onClick,
	disabled,
}: {
	label: string
	icon: ReactNode
	onClick: () => void
	disabled: boolean
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="h-9 min-h-9 shrink-0 gap-1.5 px-2.5"
					onClick={onClick}
					disabled={disabled}
					aria-label={label}
				>
					{icon}
					<span className="hidden xl:inline">{label}</span>
				</Button>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	)
}
