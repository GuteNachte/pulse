import {
	CalendarClockIcon,
	DownloadIcon,
	PlayIcon,
	RefreshCwIcon,
	RotateCcwIcon,
	ShieldCheckIcon,
	Trash2Icon,
	UploadIcon,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { OperationConfirmDialog } from "@/components/operation-confirm-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/components/ui/use-toast"
import {
	createPortableBackup,
	deleteBackup as deleteBackupFile,
	downloadBackup as downloadBackupFile,
	getRestoreTask,
	getScheduledBackupConfig,
	listBackups,
	listScheduledBackups,
	preflightPortableBackup,
	runScheduledBackup,
	startPortableRestore,
	updateScheduledBackupConfig,
	uploadPortableBackup,
} from "@/modules/maintenance/backup-client"
import {
	buildBackupRow,
	getRestoreTaskStageLabel,
	type BackupPreflight,
	type BackupRecord,
	type RestoreTask,
	type ScheduledBackupFile,
	type ScheduledBackupSettings,
	type ScheduledBackupStatus,
} from "@/modules/maintenance/backup-model"
import { formatDateTime } from "@/lib/utils"
import { SettingsField } from "./components/field-row"
import { SettingsPageHeader } from "./components/page-header"
import { SettingsSection, SettingsSectionStack } from "./components/section"
import { SettingsStatCard, SettingsStatGrid } from "./components/stat-card"
import { SettingsTableCard } from "./components/table-card"
import { SettingsTableEmptyRow } from "./settings-empty-state"

export default function Backups() {
	const [backups, setBackups] = useState<BackupRecord[]>([])
	const [loading, setLoading] = useState(false)
	const [creating, setCreating] = useState(false)
	const [restoreTarget, setRestoreTarget] = useState<BackupRecord | null>(null)
	const [deleteTarget, setDeleteTarget] = useState<BackupRecord | null>(null)
	const [restoring, setRestoring] = useState(false)
	const [deleting, setDeleting] = useState(false)
	const [uploading, setUploading] = useState(false)
	const [preflight, setPreflight] = useState<BackupPreflight | null>(null)
	const [restoreTask, setRestoreTask] = useState<RestoreTask | null>(null)
	const [assetMediaRoot, setAssetMediaRoot] = useState("")
	const uploadInputRef = useRef<HTMLInputElement | null>(null)
	const { toast } = useToast()
	const totalSize = useMemo(() => backups.reduce((sum, backup) => sum + backup.size, 0), [backups])
	const latestBackup = useMemo(() => getLatestBackup(backups), [backups])

	const loadBackups = useCallback(async () => {
		setLoading(true)
		try {
			setBackups(await listBackups())
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
			await createPortableBackup(name)
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
				await downloadBackupFile(backup)
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
			const task = await startPortableRestore(restoreTarget.key, { asset_media_root: assetMediaRoot })
			if (task.id) {
				setRestoreTask(task)
				pollRestoreTask(task.id).catch((error) => console.error("poll restore task", error))
			}
			toast({
				title: "正在还原备份",
				description: "Hub 会重启并恢复到该备份的数据状态，请稍后刷新页面重新登录。",
			})
			if (!task.id) setRestoreTarget(null)
		} catch (error) {
			console.error(error)
			toast({ title: "还原备份失败", description: "请确认备份文件有效，并检查后台日志。", variant: "destructive" })
			setRestoring(false)
		}
	}, [assetMediaRoot, restoreTarget, toast])

	const deleteBackup = useCallback(async () => {
		if (!deleteTarget) return
		setDeleting(true)
		try {
			await deleteBackupFile(deleteTarget)
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

	const prepareRestore = useCallback(
		async (backup: BackupRecord) => {
			setRestoreTarget(backup)
			setPreflight(null)
			setRestoreTask(null)
			if (backup.type !== "pulse") return
			try {
				const result = await preflightPortableBackup(backup.key)
				setPreflight(result)
				setAssetMediaRoot(result.target.asset_media_root)
			} catch (error) {
				console.error(error)
				toast({ title: "备份预检失败", description: "无法确认该备份是否可恢复。", variant: "destructive" })
			}
		},
		[toast]
	)

	const uploadBackup = useCallback(
		async (file: File | null) => {
			if (!file) return
			setUploading(true)
			try {
				const uploaded = await uploadPortableBackup(file)
				await loadBackups()
				await prepareRestore(uploaded)
				toast({ title: "备份已上传", description: uploaded.key })
			} catch (error) {
				console.error(error)
				toast({ title: "备份上传失败", description: "请确认文件是 Pulse 完整备份。", variant: "destructive" })
			} finally {
				setUploading(false)
			}
		},
		[loadBackups, prepareRestore, toast]
	)

	async function pollRestoreTask(id: string) {
		for (let attempt = 0; attempt < 180; attempt += 1) {
			await new Promise((resolve) => window.setTimeout(resolve, 2000))
			try {
				const task = await getRestoreTask(id)
				setRestoreTask(task)
				if (["success", "failed", "rolled_back", "manual_recovery_required"].includes(task.status)) {
					setRestoring(false)
					if (task.status === "success") {
						toast({ title: "恢复完成", description: "请使用备份中的管理员账号重新登录。" })
					}
					return
				}
			} catch {
				// Hub 恢复期间会短暂断开，继续等待重启。
			}
		}
	}

	useEffect(() => {
		loadBackups()
	}, [loadBackups])

	return (
		<div className="grid pulse-card-gap">
			<SettingsPageHeader
				eyebrow="账户与数据"
				title="备份管理"
				description="创建、下载、还原和删除 Hub 数据备份；也可以开启每日自动备份并同步到外部目录。"
				actions={
					<>
						<input
							ref={uploadInputRef}
							type="file"
							accept=".zip,.pulse-backup.zip,application/zip"
							className="hidden"
							onChange={(event) => {
								uploadBackup(event.target.files?.[0] ?? null).catch((error) => console.error("upload backup", error))
								event.currentTarget.value = ""
							}}
						/>
						<Button
							variant="outline"
							size="sm"
							onClick={() => uploadInputRef.current?.click()}
							disabled={uploading || creating}
						>
							<UploadIcon data-icon="inline-start" />
							{uploading ? "上传中" : "上传备份"}
						</Button>
						<Button variant="outline" size="sm" onClick={loadBackups} disabled={loading || creating}>
							<RefreshCwIcon className={`me-2 size-4 ${loading ? "animate-spin" : ""}`} />
							刷新
						</Button>
						<Button size="sm" onClick={createBackup} disabled={creating || loading}>
							<ShieldCheckIcon className="me-2 size-4" />
							立即备份
						</Button>
					</>
				}
			/>

			<SettingsStatGrid>
				<SettingsStatCard
					label="备份文件"
					value={`${backups.length} 个`}
					detail={loading ? "正在刷新列表" : "当前可用备份"}
				/>
				<SettingsStatCard label="占用空间" value={formatBytes(totalSize)} detail="按当前列表统计" />
				<SettingsStatCard
					label="最近备份"
					value={latestBackup ? formatDateTime(latestBackup.modified) : "无"}
					detail={latestBackup?.key || "还没有可恢复的备份"}
				/>
			</SettingsStatGrid>

			<Alert className="rounded-lg border-border/70 bg-card shadow-none">
				<ShieldCheckIcon className="size-4" />
				<AlertTitle>敏感数据提示</AlertTitle>
				<AlertDescription className="text-muted-foreground">
					备份文件包含用户、Agent
					Token、配对凭据、通知配置、网站监控地址和操作审计。下载后只保存到可信位置，对外传输前请先加密；还原会覆盖当前数据。
				</AlertDescription>
			</Alert>

			<SettingsSectionStack>
				<ScheduledBackupCard />

				<SettingsTableCard
					footer={backups.length ? `共 ${backups.length} 个备份文件 · 合计 ${formatBytes(totalSize)}` : undefined}
				>
					<div className="overflow-x-auto">
						<Table>
							<TableHeader className="bg-surface-soft">
								<TableRow>
									<TableHead>文件</TableHead>
									<TableHead className="w-40">类型 / 版本</TableHead>
									<TableHead className="w-28">校验</TableHead>
									<TableHead className="w-32">大小</TableHead>
									<TableHead className="w-44">时间</TableHead>
									<TableHead className="w-24 text-right">操作</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{backups.length ? (
									backups.map((backup) => {
										const row = buildBackupRow(backup)
										return (
											<TableRow key={backup.key}>
												<TableCell className="font-mono text-xs">{backup.key}</TableCell>
												<TableCell>
													<div className="text-sm font-medium">{row.typeLabel}</div>
													<div className="text-xs text-muted-foreground">{row.versionLabel}</div>
												</TableCell>
												<TableCell className="text-sm text-muted-foreground">{row.checksumLabel}</TableCell>
												<TableCell className="tabular-nums">{formatBytes(backup.size)}</TableCell>
												<TableCell className="whitespace-nowrap text-muted-foreground">
													{formatDateTime(backup.modified)}
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
														onClick={() => prepareRestore(backup)}
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
										)
									})
								) : (
									<SettingsTableEmptyRow
										colSpan={6}
										loading={loading}
										loadingText="正在读取备份列表"
										emptyText="暂无备份"
									/>
								)}
							</TableBody>
						</Table>
					</div>
				</SettingsTableCard>
			</SettingsSectionStack>

			<OperationConfirmDialog
				open={Boolean(restoreTarget)}
				onOpenChange={(open) => !open && !restoring && setRestoreTarget(null)}
				title="确认还原备份"
				description="还原会用备份内容替换当前数据，并触发 Hub 重启。备份内可能包含用户、Token、通知配置和操作审计，请只还原可信备份。"
				confirmLabel="确认还原"
				confirmVariant="destructive"
				confirmDisabled={restoreTarget?.type === "pulse" && (!preflight || preflight.status === "blocked")}
				running={restoring}
				progressTitle="正在还原备份"
				progressDescription={
					restoreTask ? getRestoreTaskStageLabel(restoreTask.stage) : "Hub 会替换数据并重启，完成前请不要重复操作。"
				}
				onConfirm={restoreBackup}
			>
				<BackupTargetSummary backup={restoreTarget} />
				{preflight?.manifest.external.asset_media.included ? (
					<div className="grid gap-1.5">
						<label htmlFor="asset-media-root" className="text-xs text-muted-foreground">
							设备图片恢复目录
						</label>
						<Input
							id="asset-media-root"
							value={assetMediaRoot}
							onChange={(event) => setAssetMediaRoot(event.target.value)}
							disabled={restoring}
						/>
					</div>
				) : null}
				{preflight?.checks.map((check) => (
					<div key={check.code} className="text-xs text-muted-foreground">
						{check.message}
					</div>
				))}
				{preflight?.blockers.map((check) => (
					<div key={check.code} className="text-xs text-destructive">
						{check.message}
					</div>
				))}
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
				{backup ? `${formatBytes(backup.size)} · ${formatDateTime(backup.modified)}` : ""}
			</div>
		</div>
	)
}

function ScheduledBackupCard() {
	const [config, setConfig] = useState<ScheduledBackupSettings | null>(null)
	const [status, setStatus] = useState<ScheduledBackupStatus | null>(null)
	const [files, setFiles] = useState<ScheduledBackupFile[]>([])
	const [loading, setLoading] = useState(true)
	const [saving, setSaving] = useState(false)
	const [running, setRunning] = useState(false)
	const [listLoading, setListLoading] = useState(true)
	const { toast } = useToast()

	const loadConfig = useCallback(async () => {
		setLoading(true)
		try {
			const result = await getScheduledBackupConfig()
			setConfig({
				enabled: result.enabled,
				time: result.time,
				dir: result.dir,
				retentionDaily: result.retentionDaily,
				retentionWeekly: result.retentionWeekly,
				retentionMonthly: result.retentionMonthly,
			})
			setStatus(result.status)
		} catch (error) {
			console.error(error)
			toast({ title: "加载自动备份配置失败", description: "请确认当前用户是管理员。", variant: "destructive" })
		} finally {
			setLoading(false)
		}
	}, [toast])

	const loadFiles = useCallback(async () => {
		setListLoading(true)
		try {
			setFiles(await listScheduledBackups())
		} catch (error) {
			console.error(error)
			toast({ title: "读取自动备份文件失败", description: "请检查备份目录配置。", variant: "destructive" })
		} finally {
			setListLoading(false)
		}
	}, [toast])

	useEffect(() => {
		loadConfig()
		loadFiles()
	}, [loadConfig, loadFiles])

	const saveConfig = useCallback(async () => {
		if (!config) return
		setSaving(true)
		try {
			const result = await updateScheduledBackupConfig(config)
			setStatus(result.status)
			toast({
				title: "自动备份设置已保存",
				description: result.enabled ? `每天 ${result.time} 自动执行，并同步到外部目录` : "自动备份已关闭",
			})
			await loadFiles()
		} catch (error) {
			console.error(error)
			toast({ title: "保存自动备份设置失败", description: "请检查时间、目录和保留数量填写。", variant: "destructive" })
		} finally {
			setSaving(false)
		}
	}, [config, loadFiles, toast])

	const runNow = useCallback(async () => {
		setRunning(true)
		try {
			const result = await runScheduledBackup()
			setStatus(result)
			toast({ title: "自动备份执行完成", description: result.lastBackupName })
			await loadFiles()
		} catch (error) {
			console.error(error)
			toast({ title: "自动备份执行失败", description: "失败原因已写入下方状态和系统日志。", variant: "destructive" })
			await loadConfig()
		} finally {
			setRunning(false)
		}
	}, [loadConfig, loadFiles, toast])

	const updateField = <K extends keyof ScheduledBackupSettings>(key: K, value: ScheduledBackupSettings[K]) => {
		setConfig((current) => (current ? { ...current, [key]: value } : current))
	}

	return (
		<SettingsSection
			title="自动备份"
			description="每天在指定时间自动创建完整备份，同步到独立外部目录，并按日 / 周 / 月分层保留；执行窗口每 5 分钟检查一次，同一天只执行一次。"
			actions={
				<div className="flex items-center gap-2">
					<span className="text-xs text-muted-foreground">{config?.enabled ? "已启用" : "未启用"}</span>
					<Switch
						checked={Boolean(config?.enabled)}
						onCheckedChange={(value) => updateField("enabled", value)}
						disabled={loading || !config}
						aria-label="启用每日自动备份"
					/>
				</div>
			}
		>
			{loading || !config ? (
				<div className="mt-3 rounded-lg border border-border/70 bg-surface-soft p-3 text-sm text-muted-foreground">
					正在读取自动备份设置…
				</div>
			) : (
				<div className="mt-3 grid gap-4">
					<div className="grid gap-x-6 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
						<SettingsField label="备份时间" htmlFor="scheduled-backup-time" description="每天到点自动执行一次。">
							<Input
								id="scheduled-backup-time"
								type="time"
								value={config.time}
								onChange={(event) => updateField("time", event.target.value)}
							/>
						</SettingsField>
						<SettingsField
							label="备份目录（绝对路径）"
							htmlFor="scheduled-backup-dir"
							description="Hub 所在机器上的外部目录，建议放 NAS 或独立磁盘。"
						>
							<Input
								id="scheduled-backup-dir"
								value={config.dir}
								placeholder="/vol1/1000/docker/pulse-backups"
								onChange={(event) => updateField("dir", event.target.value)}
							/>
						</SettingsField>
						<SettingsField label="每日保留（份）" htmlFor="scheduled-backup-daily">
							<Input
								id="scheduled-backup-daily"
								type="number"
								min={1}
								max={52}
								value={config.retentionDaily}
								onChange={(event) => updateField("retentionDaily", Number(event.target.value))}
							/>
						</SettingsField>
						<SettingsField label="每周保留（份）" htmlFor="scheduled-backup-weekly">
							<Input
								id="scheduled-backup-weekly"
								type="number"
								min={1}
								max={52}
								value={config.retentionWeekly}
								onChange={(event) => updateField("retentionWeekly", Number(event.target.value))}
							/>
						</SettingsField>
						<SettingsField label="每月保留（份）" htmlFor="scheduled-backup-monthly">
							<Input
								id="scheduled-backup-monthly"
								type="number"
								min={1}
								max={52}
								value={config.retentionMonthly}
								onChange={(event) => updateField("retentionMonthly", Number(event.target.value))}
							/>
						</SettingsField>
					</div>

					<div className="flex flex-wrap gap-2">
						<Button
							size="sm"
							className="transition-transform active:scale-[0.96]"
							onClick={saveConfig}
							disabled={saving || running || loading || !config}
						>
							<ShieldCheckIcon className="me-2 size-4" />
							{saving ? "保存中" : "保存设置"}
						</Button>
						<Button
							variant="outline"
							size="sm"
							className="transition-transform active:scale-[0.96]"
							onClick={runNow}
							disabled={saving || running || loading || !config}
						>
							<PlayIcon className={`me-2 size-4 ${running ? "animate-pulse" : ""}`} />
							{running ? "正在执行" : "立即执行一次"}
						</Button>
					</div>

					<ScheduledBackupStatusView status={status} />
					<ScheduledBackupFilesView
						files={files}
						loading={listLoading}
						onRefresh={loadFiles}
						disabled={running || saving}
					/>
				</div>
			)}
		</SettingsSection>
	)
}

function ScheduledBackupStatusView({ status }: { status: ScheduledBackupStatus | null }) {
	const hasAttempt = Boolean(status?.lastAttempt)
	return (
		<div className="rounded-lg border border-border/70 bg-surface-soft p-3">
			<div className="text-sm font-semibold text-foreground">执行状态</div>
			{!hasAttempt ? (
				<p className="mt-1 text-xs text-muted-foreground">尚未执行过自动备份。</p>
			) : (
				<div className="mt-2 grid gap-2 sm:grid-cols-2">
					<ScheduledBackupStatusItem
						label="最近成功"
						value={status?.lastSuccess ? formatDateTime(status.lastSuccess) : "从未成功"}
					/>
					<ScheduledBackupStatusItem
						label="最近失败"
						value={status?.lastError ? `${status.lastError}（${formatDateTime(status.lastAttempt)}）` : "无"}
						tone={status?.lastError ? "error" : "normal"}
					/>
					<ScheduledBackupStatusItem
						label="备份大小"
						value={status?.lastSizeBytes ? formatBytes(status.lastSizeBytes) : "—"}
					/>
					<ScheduledBackupStatusItem label="执行耗时" value={formatDuration(status?.lastDurationMs ?? 0)} />
					<ScheduledBackupStatusItem label="最近备份文件" value={status?.lastBackupName || "—"} mono />
				</div>
			)}
		</div>
	)
}

function ScheduledBackupStatusItem({
	label,
	value,
	tone = "normal",
	mono = false,
}: {
	label: string
	value: string
	tone?: "normal" | "error"
	mono?: boolean
}) {
	return (
		<div className="min-w-0">
			<div className="text-xs text-muted-foreground">{label}</div>
			<div
				className={`mt-0.5 break-all text-sm ${mono ? "font-mono text-xs" : ""} ${
					tone === "error" ? "text-destructive" : "text-foreground"
				}`}
			>
				{value}
			</div>
		</div>
	)
}

function ScheduledBackupFilesView({
	files,
	loading,
	onRefresh,
	disabled,
}: {
	files: ScheduledBackupFile[]
	loading: boolean
	onRefresh: () => void
	disabled: boolean
}) {
	return (
		<div className="rounded-lg border border-border/70 bg-surface-soft p-3">
			<div className="flex items-center justify-between gap-3">
				<div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
					<CalendarClockIcon className="size-3.5 shrink-0 text-muted-foreground" />
					备份目录中的文件（{files.length}）
				</div>
				<Button
					variant="ghost"
					size="icon"
					className="size-7 min-h-7"
					title="刷新列表"
					onClick={onRefresh}
					disabled={disabled || loading}
				>
					<RefreshCwIcon className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
				</Button>
			</div>
			{loading ? (
				<p className="mt-2 text-xs text-muted-foreground">正在读取备份目录…</p>
			) : files.length === 0 ? (
				<p className="mt-2 text-xs text-muted-foreground">
					备份目录中还没有文件。保存设置并执行一次自动备份后会出现在这里。
				</p>
			) : (
				<div className="mt-2 grid gap-1.5">
					{files.slice(0, 10).map((file) => (
						<div
							key={file.name}
							className="flex items-center justify-between gap-3 rounded-md bg-card px-3 py-2 text-sm"
						>
							<span className="min-w-0 truncate font-mono text-xs">{file.name}</span>
							<span className="shrink-0 text-xs text-muted-foreground">
								{formatBytes(file.size)} · {formatDateTime(file.modified)}
							</span>
						</div>
					))}
					{files.length > 10 ? (
						<div className="text-xs text-muted-foreground">仅显示最近 10 个，共 {files.length} 个文件。</div>
					) : null}
				</div>
			)}
		</div>
	)
}

function formatDuration(ms: number) {
	if (!ms || ms < 0) return "—"
	if (ms < 1000) return `${ms} ms`
	const seconds = ms / 1000
	if (seconds < 60) return `${seconds.toFixed(1)} 秒`
	const minutes = Math.floor(seconds / 60)
	const rest = Math.round(seconds % 60)
	return `${minutes} 分 ${rest} 秒`
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
