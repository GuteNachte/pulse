import { DownloadIcon, RefreshCwIcon, RotateCcwIcon, ShieldCheckIcon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MobileEmptyState, MobileList, MobileListItem, MobileSection } from "./mobile-ui"

export type MobileBackupItem = {
	key: string
	size: string
	modified: string
}

export function MobileBackupsView({
	items,
	loading,
	creating,
	onRefresh,
	onCreate,
	onDownload,
	onRestore,
	onDelete,
}: {
	items: MobileBackupItem[]
	loading: boolean
	creating: boolean
	onRefresh: () => void
	onCreate: () => void
	onDownload: (item: MobileBackupItem) => void
	onRestore: (item: MobileBackupItem) => void
	onDelete: (item: MobileBackupItem) => void
}) {
	return (
		<div className="grid gap-4 md:hidden">
			<section className="grid gap-3 rounded-lg border border-border/70 bg-surface-soft p-2 shadow-none">
				<div className="px-1 py-1.5">
					<div className="text-[15px] font-semibold leading-tight">数据备份</div>
					<p className="mt-1 text-pretty text-xs leading-relaxed text-muted-foreground">
						备份包含用户、Token、通知配置和操作审计。只保存到可信位置，还原和删除会再次强确认。
					</p>
				</div>
				<div className="grid grid-cols-2 gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="min-h-10 justify-center bg-card transition-transform active:scale-[0.96]"
						onClick={onRefresh}
						disabled={loading || creating}
					>
						<RefreshCwIcon className={`me-1.5 size-4 ${loading ? "animate-spin" : ""}`} />
						刷新
					</Button>
					<Button
						type="button"
						size="sm"
						className="min-h-10 justify-center transition-transform active:scale-[0.96]"
						onClick={onCreate}
						disabled={creating || loading}
					>
						<ShieldCheckIcon className="me-1.5 size-4" />
						立即备份
					</Button>
				</div>
				<div className="flex items-start gap-2 rounded-md border border-border/70 bg-card px-3 py-2 text-xs leading-relaxed text-muted-foreground">
					<ShieldCheckIcon className="mt-0.5 size-4 shrink-0" />
					<span className="text-pretty">下载后的备份文件按敏感文件保存；还原会覆盖当前 Hub 数据。</span>
				</div>
			</section>
			<MobileBackupList
				items={items}
				loading={loading}
				onDownload={onDownload}
				onRestore={onRestore}
				onDelete={onDelete}
			/>
		</div>
	)
}

export function MobileBackupList({
	items,
	loading,
	onDownload,
	onRestore,
	onDelete,
}: {
	items: MobileBackupItem[]
	loading: boolean
	onDownload: (item: MobileBackupItem) => void
	onRestore: (item: MobileBackupItem) => void
	onDelete: (item: MobileBackupItem) => void
}) {
	return (
		<div className="md:hidden">
			<MobileSection title="备份文件" count={`${items.length} 个`}>
				{items.length ? (
					<MobileList>
						{items.map((item) => (
							<MobileBackupCard
								key={item.key}
								item={item}
								onDownload={() => onDownload(item)}
								onRestore={() => onRestore(item)}
								onDelete={() => onDelete(item)}
							/>
						))}
					</MobileList>
				) : (
					<MobileEmptyState loading={loading}>{loading ? "正在读取备份列表" : "暂无备份"}</MobileEmptyState>
				)}
			</MobileSection>
		</div>
	)
}

function MobileBackupCard({
	item,
	onDownload,
	onRestore,
	onDelete,
}: {
	item: MobileBackupItem
	onDownload: () => void
	onRestore: () => void
	onDelete: () => void
}) {
	return (
		<MobileListItem className="shadow-none">
			<div className="grid gap-2">
				<div className="break-all font-mono text-xs font-semibold leading-relaxed">{item.key}</div>
				<div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
					<span className="rounded-md bg-surface-soft px-2 py-1 font-medium tabular-nums">{item.size}</span>
					<span className="rounded-md bg-surface-soft px-2 py-1 font-medium tabular-nums">{item.modified}</span>
				</div>
			</div>
			<div className="mt-3 grid grid-cols-3 gap-2 rounded-md bg-surface-soft p-1.5">
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="min-h-10 justify-center bg-card transition-transform active:scale-[0.96]"
					onClick={onDownload}
				>
					<DownloadIcon className="me-1.5 size-4" />
					下载
				</Button>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="min-h-10 justify-center bg-card transition-transform active:scale-[0.96]"
					onClick={onRestore}
				>
					<RotateCcwIcon className="me-1.5 size-4" />
					还原
				</Button>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="min-h-10 justify-center bg-card text-destructive transition-transform active:scale-[0.96] hover:text-destructive"
					onClick={onDelete}
				>
					<Trash2Icon className="me-1.5 size-4" />
					删除
				</Button>
			</div>
		</MobileListItem>
	)
}
