import {
	ArchiveIcon,
	Clock3Icon,
	DatabaseIcon,
	DownloadIcon,
	HardDriveIcon,
	RefreshCwIcon,
	RotateCcwIcon,
	ShieldCheckIcon,
	Trash2Icon,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { MobileBackupsView, type MobileBackupItem } from "@/components/mobile/mobile-backups"
import { OperationConfirmDialog } from "@/components/operation-confirm-dialog"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/components/ui/use-toast"
import { pb } from "@/lib/api"
import { SettingsTableEmptyRow } from "./settings-empty-state"

type BackupRecord = {
	key: string
	size: number
	modified: string
}

export default function Backups() {
	const [backups, setBackups] = useState<BackupRecord[]>([])
	const [loading, setLoading] = useState(false)
	const [creating, setCreating] = useState(false)
	const [restoreTarget, setRestoreTarget] = useState<BackupRecord | null>(null)
	const [deleteTarget, setDeleteTarget] = useState<BackupRecord | null>(null)
	const [restoring, setRestoring] = useState(false)
	const [deleting, setDeleting] = useState(false)
	const { toast } = useToast()
	const mobileBackups = useMemo<MobileBackupItem[]>(
		() =>
			backups.map((backup) => ({
				key: backup.key,
				size: formatBytes(backup.size),
				modified: formatTime(backup.modified),
			})),
		[backups]
	)
	const backupByKey = useMemo(() => new Map(backups.map((backup) => [backup.key, backup])), [backups])
	const totalSize = useMemo(() => backups.reduce((sum, backup) => sum + backup.size, 0), [backups])
	const latestBackup = useMemo(() => getLatestBackup(backups), [backups])

	const loadBackups = useCallback(async () => {
		setLoading(true)
		try {
			const data = await pb.send<{ items: BackupRecord[] }>("/api/pulse/backups", {})
			setBackups(data.items)
		} catch (error) {
			console.error(error)
			toast({ title: "加载备份失败", description: "请确认当前用户是管理员。", variant: "destructive" })
		} finally {
			setLoading(false)
		}
	}, [toast])

	const createBackup = useCallback(async () => {
		setCreating(true)
		try {
			const name = `pulse_backup_${formatBackupStamp(new Date())}.zip`
			await pb.send("/api/pulse/backups", {
				method: "POST",
				body: { name },
			})
			toast({ title: "备份已创建", description: name })
			await loadBackups()
		} catch (error) {
			console.error(error)
			toast({ title: "创建备份失败", description: "请稍后重试，或进入高级设置检查后台。", variant: "destructive" })
		} finally {
			setCreating(false)
		}
	}, [loadBackups, toast])

	const downloadBackup = useCallback(
		async (backup: BackupRecord) => {
			try {
				const response = await fetch(`/api/pulse/backups/${encodeURIComponent(backup.key)}`, {
					headers: {
						Authorization: pb.authStore.token,
					},
				})
				if (!response.ok) {
					throw new Error(`HTTP ${response.status}`)
				}
				const blob = await response.blob()
				const url = URL.createObjectURL(blob)
				const link = document.createElement("a")
				link.href = url
				link.download = backup.key
				document.body.appendChild(link)
				link.click()
				link.remove()
				URL.revokeObjectURL(url)
			} catch (error) {
				console.error(error)
				toast({ title: "下载备份失败", description: "请稍后重试。", variant: "destructive" })
			}
		},
		[toast]
	)

	const restoreBackup = useCallback(async () => {
		if (!restoreTarget) return
		setRestoring(true)
		try {
			await pb.send(`/api/pulse/backups/${encodeURIComponent(restoreTarget.key)}/restore`, {
				method: "POST",
			})
			toast({
				title: "正在还原备份",
				description: "Hub 会重启并恢复到该备份的数据状态，请稍后刷新页面重新登录。",
			})
			setRestoreTarget(null)
		} catch (error) {
			console.error(error)
			toast({ title: "还原备份失败", description: "请确认备份文件有效，并检查后台日志。", variant: "destructive" })
		} finally {
			setRestoring(false)
		}
	}, [restoreTarget, toast])

	const deleteBackup = useCallback(async () => {
		if (!deleteTarget) return
		setDeleting(true)
		try {
			await pb.send(`/api/pulse/backups/${encodeURIComponent(deleteTarget.key)}`, {
				method: "DELETE",
			})
			toast({ title: "备份已删除", description: deleteTarget.key })
			setDeleteTarget(null)
			await loadBackups()
		} catch (error) {
			console.error(error)
			toast({ title: "删除备份失败", description: "请稍后重试，或检查后台日志。", variant: "destructive" })
		} finally {
			setDeleting(false)
		}
	}, [deleteTarget, loadBackups, toast])

	useEffect(() => {
		loadBackups()
	}, [loadBackups])

	function getBackupFromMobileItem(item: MobileBackupItem) {
		return backupByKey.get(item.key)
	}

	function downloadMobileBackup(item: MobileBackupItem) {
		const backup = getBackupFromMobileItem(item)
		if (backup) {
			downloadBackup(backup)
		}
	}

	function restoreMobileBackup(item: MobileBackupItem) {
		const backup = getBackupFromMobileItem(item)
		if (backup) {
			setRestoreTarget(backup)
		}
	}

	function deleteMobileBackup(item: MobileBackupItem) {
		const backup = getBackupFromMobileItem(item)
		if (backup) {
			setDeleteTarget(backup)
		}
	}

	return (
		<div className="grid gap-4">
			<div className="hidden rounded-lg border border-border/70 bg-surface-soft p-2 shadow-none md:block">
				<div className="rounded-md border border-border/70 bg-card p-3 shadow-none">
					<div className="flex flex-row items-center justify-between gap-4">
						<div className="flex min-w-0 items-center gap-3">
							<div className="grid size-10 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft text-muted-foreground">
								<ArchiveIcon className="size-4" />
							</div>
							<div className="min-w-0">
								<h3 className="text-lg font-semibold tracking-tight">备份管理</h3>
								<p className="mt-1 text-pretty text-sm text-muted-foreground">创建、下载、还原和删除 Hub 数据备份。</p>
							</div>
						</div>
						<div className="flex gap-2">
							<Button
								variant="outline"
								size="sm"
								className="transition-transform active:scale-[0.96]"
								onClick={loadBackups}
								disabled={loading || creating}
							>
								<RefreshCwIcon className={`me-2 size-4 ${loading ? "animate-spin" : ""}`} />
								刷新
							</Button>
							<Button
								size="sm"
								className="transition-transform active:scale-[0.96]"
								onClick={createBackup}
								disabled={creating || loading}
							>
								<ShieldCheckIcon className="me-2 size-4" />
								立即备份
							</Button>
						</div>
					</div>
				</div>
				<div className="mt-2 grid grid-cols-3 gap-2">
					<BackupSummaryCard
						icon={DatabaseIcon}
						label="备份文件"
						value={`${backups.length} 个`}
						detail={loading ? "正在刷新列表" : "当前可用备份"}
					/>
					<BackupSummaryCard
						icon={HardDriveIcon}
						label="占用空间"
						value={formatBytes(totalSize)}
						detail="按当前列表统计"
					/>
					<BackupSummaryCard
						icon={Clock3Icon}
						label="最近备份"
						value={latestBackup ? formatTime(latestBackup.modified) : "无"}
						detail={latestBackup?.key || "还没有可恢复的备份"}
					/>
				</div>
				<div className="mt-2 rounded-md border border-border/70 bg-card px-3 py-2.5 text-sm leading-relaxed text-muted-foreground shadow-none">
					<div className="flex items-start gap-3">
						<div className="grid size-8 shrink-0 place-items-center rounded-md bg-surface-soft text-muted-foreground">
							<ShieldCheckIcon className="size-4" />
						</div>
						<div className="min-w-0">
							<div className="font-medium text-foreground">敏感数据提示</div>
							<p className="mt-1 text-pretty">
								备份文件包含用户、Agent Token、配对凭据、通知配置、网站监控地址和操作审计。下载后只保存到可信位置，
								对外传输前请先加密；还原会覆盖当前数据。
							</p>
						</div>
					</div>
				</div>
			</div>

			<MobileBackupsView
				items={mobileBackups}
				loading={loading}
				creating={creating}
				onRefresh={loadBackups}
				onCreate={createBackup}
				onDownload={downloadMobileBackup}
				onRestore={restoreMobileBackup}
				onDelete={deleteMobileBackup}
			/>

			<div className="hidden overflow-hidden rounded-lg border border-border/70 bg-card shadow-none md:block">
				<Table>
					<TableHeader className="bg-surface-soft">
						<TableRow>
							<TableHead>文件</TableHead>
							<TableHead className="w-32">大小</TableHead>
							<TableHead className="w-44">时间</TableHead>
							<TableHead className="w-24 text-right">操作</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{backups.length ? (
							backups.map((backup) => (
								<TableRow key={backup.key}>
									<TableCell className="font-mono text-xs">{backup.key}</TableCell>
									<TableCell className="tabular-nums">{formatBytes(backup.size)}</TableCell>
									<TableCell className="whitespace-nowrap text-muted-foreground">
										{formatTime(backup.modified)}
									</TableCell>
									<TableCell className="text-right">
										<Button
											variant="ghost"
											size="icon"
											className="transition-transform active:scale-[0.96]"
											title="下载备份"
											onClick={() => downloadBackup(backup)}
										>
											<DownloadIcon className="size-4" />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											className="transition-transform active:scale-[0.96]"
											title="还原备份"
											onClick={() => setRestoreTarget(backup)}
										>
											<RotateCcwIcon className="size-4" />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											className="transition-transform active:scale-[0.96]"
											title="删除备份"
											onClick={() => setDeleteTarget(backup)}
										>
											<Trash2Icon className="size-4" />
										</Button>
									</TableCell>
								</TableRow>
							))
						) : (
							<SettingsTableEmptyRow
								colSpan={4}
								loading={loading}
								loadingText="正在读取备份列表"
								emptyText="暂无备份"
							/>
						)}
					</TableBody>
				</Table>
			</div>
			<OperationConfirmDialog
				open={Boolean(restoreTarget)}
				onOpenChange={(open) => !open && !restoring && setRestoreTarget(null)}
				title="确认还原备份"
				description="还原会用备份内容替换当前数据，并触发 Hub 重启。备份内可能包含用户、Token、通知配置和操作审计，请只还原可信备份。"
				confirmLabel="确认还原"
				confirmVariant="destructive"
				running={restoring}
				progressTitle="正在还原备份"
				progressDescription="Hub 会替换数据并重启，完成前请不要重复操作。"
				onConfirm={restoreBackup}
			>
				<BackupTargetSummary backup={restoreTarget} />
			</OperationConfirmDialog>
			<OperationConfirmDialog
				open={Boolean(deleteTarget)}
				onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}
				title="确认删除备份"
				description="删除后不能从这个备份恢复数据。备份可能包含 Token 和用户数据，请确认已经不再需要它。"
				confirmLabel="确认删除"
				confirmVariant="destructive"
				running={deleting}
				progressTitle="正在删除备份"
				progressDescription="Hub 正在删除备份文件，完成后会刷新列表。"
				onConfirm={deleteBackup}
			>
				<BackupTargetSummary backup={deleteTarget} />
			</OperationConfirmDialog>
		</div>
	)
}

function BackupTargetSummary({ backup }: { backup: BackupRecord | null }) {
	return (
		<div className="grid gap-1.5 text-sm">
			<div className="break-all font-mono text-xs">{backup?.key}</div>
			<div className="text-muted-foreground">
				{backup ? `${formatBytes(backup.size)} · ${formatTime(backup.modified)}` : ""}
			</div>
		</div>
	)
}

function BackupSummaryCard({
	icon: Icon,
	label,
	value,
	detail,
}: {
	icon: typeof DatabaseIcon
	label: string
	value: string
	detail: string
}) {
	return (
		<div className="rounded-md bg-card px-3 py-2.5 shadow-none">
			<div className="flex items-center justify-between gap-3">
				<div className="text-xs text-muted-foreground">{label}</div>
				<span className="grid size-8 shrink-0 place-items-center rounded-md bg-surface-soft text-muted-foreground">
					<Icon className="size-3.5" />
				</span>
			</div>
			<div className="mt-2 text-lg font-semibold tabular-nums">{value}</div>
			<div className="mt-1 truncate text-xs text-muted-foreground">{detail}</div>
		</div>
	)
}

function getLatestBackup(backups: BackupRecord[]) {
	return backups.reduce<BackupRecord | undefined>((latest, backup) => {
		if (!latest) return backup
		const latestTime = new Date(latest.modified).getTime()
		const backupTime = new Date(backup.modified).getTime()
		if (Number.isNaN(backupTime)) return latest
		if (Number.isNaN(latestTime)) return backup
		return backupTime > latestTime ? backup : latest
	}, undefined)
}

function formatBackupStamp(date: Date) {
	const pad = (value: number) => String(value).padStart(2, "0")
	return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(
		date.getMinutes()
	)}${pad(date.getSeconds())}`
}

function formatTime(value: string) {
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return value || "-"
	return date.toLocaleString("zh-CN", { hour12: false })
}

function formatBytes(value: number) {
	if (!value) return "0 B"
	const units = ["B", "KB", "MB", "GB"]
	let size = value
	let unit = 0
	while (size >= 1024 && unit < units.length - 1) {
		size /= 1024
		unit += 1
	}
	return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`
}
