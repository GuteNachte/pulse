import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"

type AssetExportDialogProps = {
	open: boolean
	assetCount: number
	saving: boolean
	onOpenChange: (open: boolean) => void
	onExportCsv: () => void
	onExportPackage: () => void
}

export function AssetExportDialog({
	open,
	assetCount,
	saving,
	onOpenChange,
	onExportCsv,
	onExportPackage,
}: AssetExportDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>导出资产</DialogTitle>
					<DialogDescription>导出当前账号可读取的资产数据，用于盘点、备份和迁移前核对。</DialogDescription>
				</DialogHeader>
				<div className="grid gap-3 sm:grid-cols-2">
					<button
						type="button"
						onClick={onExportCsv}
						className="grid gap-2 rounded-md border border-border/70 bg-card p-4 text-left transition-colors hover:bg-surface-soft"
					>
						<span className="text-sm font-semibold text-foreground">当前清单 CSV</span>
						<span className="text-xs leading-5 text-muted-foreground">
							导出当前筛选结果，适合表格盘点和人工整理。当前 {assetCount} 个资产。
						</span>
					</button>
					<button
						type="button"
						onClick={onExportPackage}
						disabled={saving}
						className="grid gap-2 rounded-md border border-border/70 bg-card p-4 text-left transition-colors hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-60"
					>
						<span className="text-sm font-semibold text-foreground">可恢复资产迁移包</span>
						<span className="text-xs leading-5 text-muted-foreground">
							包含资产、接口、关系、位置、维护记录、附件和设备图片，可在其他 Pulse 实例恢复。
						</span>
					</button>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						关闭
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
