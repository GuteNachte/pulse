import {
	AlertTriangleIcon,
	ArrowRightIcon,
	DatabaseIcon,
	ExternalLinkIcon,
	FolderSearchIcon,
	HardDriveIcon,
	RefreshCwIcon,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import type * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { pb } from "@/lib/api"
import { formatDateTime } from "@/lib/utils"
import { prependBasePath } from "@/components/router"
import { SettingsPageHeader } from "./components/page-header"
import { SettingsSection, SettingsSectionStack } from "./components/section"

type DeepHealthCronTask = {
	name: string
	lastStart: string | null
	lastFinish: string | null
	lastError: string
	stale: boolean
	staleThreshold: number
}

type DeepHealthReport = {
	startedAt: string
	generatedAt: string
	dbWrite: { ok: boolean; durationMs: number; error: string }
	cronTasks: DeepHealthCronTask[]
	backupDir: { configured: string; reachable: boolean; isDir: boolean; error: string }
	disk: { path: string; totalBytes: number; freeBytes: number; usedPercent: number; error: string }
}

// 定时任务心跳标识 -> 中文展示名（与后端 cronTaskDefinitions 对应）。
const cronTaskLabels: Record<string, string> = {
	delete_old_records: "清理旧记录",
	create_longer_records: "生成汇总记录",
	monitor_retention: "监控数据保留清理",
	check_website_monitors: "网站监控检查",
	refresh_internet_addresses: "公网地址刷新",
	scheduled_backup_check: "自动备份调度检查",
}

export default function Advanced() {
	const pocketbaseHref = prependBasePath("/_/")

	return (
		<div className="grid pulse-card-gap">
			<SettingsPageHeader
				eyebrow="系统与关于"
				title="高级设置"
				description="这里集中放底层维护入口和长期运行诊断。日常添加机器、查看日志和备份恢复请优先使用对应功能页。"
			/>

			<SettingsSectionStack>
				<SettingsSection
					title="运行状态"
					description="定时任务心跳、数据库写入探针、备份目录和磁盘水位的实时诊断快照。"
				>
					<DeepHealthBody />
				</SettingsSection>

				<SettingsSection
					title="危险区"
					description="以下入口直接操作底层数据，仅限维护时使用；会离开 Pulse 设置页。"
					className="border-destructive/30"
				>
					<div className="mt-3 grid gap-3">
						<div className="flex items-start justify-between gap-4 rounded-lg border border-border/70 bg-surface-soft p-3">
							<div className="flex min-w-0 items-start gap-3">
								<div className="grid size-9 shrink-0 place-items-center rounded-md border border-border/70 bg-card">
									<AlertTriangleIcon className="size-4 text-muted-foreground" />
								</div>
								<div className="min-w-0">
									<div className="font-semibold text-foreground">维护前确认</div>
									<p className="mt-1 max-w-3xl text-pretty text-sm leading-relaxed text-muted-foreground">
										PocketBase 后台可以直接修改集合、用户、Token
										和系统记录。上线环境使用前先完成备份，并明确本次维护影响范围。
									</p>
								</div>
							</div>
							<div className="hidden shrink-0 flex-wrap items-center justify-end gap-2 xl:flex">
								<span className="rounded-md border border-border/70 bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground">
									先备份
								</span>
								<span className="rounded-md border border-border/70 bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground">
									限范围
								</span>
								<span className="rounded-md border border-border/70 bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground">
									可回滚
								</span>
							</div>
						</div>
						<a
							href={pocketbaseHref}
							className="group rounded-lg border border-border/70 bg-card p-3 shadow-none transition-[background-color,border-color,transform] duration-150 ease-out hover:bg-surface-soft active:scale-[0.96]"
						>
							<div className="flex min-w-0 items-start gap-3">
								<div className="grid size-10 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft text-muted-foreground">
									<DatabaseIcon className="size-4" />
								</div>
								<div className="min-w-0 flex-1">
									<div className="flex min-w-0 items-center gap-2">
										<div className="truncate font-semibold text-foreground">PocketBase 后台</div>
										<ExternalLinkIcon className="size-3.5 shrink-0 text-muted-foreground" />
									</div>
									<p className="mt-1 text-pretty text-sm leading-relaxed text-muted-foreground">
										维护底层数据、集合、权限和系统记录。会离开 Pulse 设置页。
									</p>
								</div>
								<div className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md border border-border/70 bg-surface-soft px-3 text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
									打开
									<ArrowRightIcon className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
								</div>
							</div>
						</a>
					</div>
				</SettingsSection>
			</SettingsSectionStack>
		</div>
	)
}

function fetchDeepHealth() {
	return pb.send<DeepHealthReport>("/api/pulse/health/deep", { requestKey: null })
}

// DeepHealthBody 展示 Hub 深度健康快照：定时任务心跳、数据库写入探针、
// 备份目录可达性和磁盘水位。数据来自管理员专用的 /api/pulse/health/deep。
function DeepHealthBody() {
	const [report, setReport] = useState<DeepHealthReport | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const snapshotSuffix = report ? `（${formatDateTime(report.generatedAt)}）` : ""

	const load = useCallback(async () => {
		setLoading(true)
		setError(null)
		try {
			setReport(await fetchDeepHealth())
		} catch (err) {
			console.error(err)
			setError("加载运行状态失败，请确认当前用户是管理员，然后重试。")
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		load().catch((err) => console.error("load deep health", err))
	}, [load])

	return (
		<div className="mt-3 grid gap-3">
			<div className="flex justify-end">
				<Button variant="outline" size="sm" className="min-h-8" onClick={() => load()} disabled={loading}>
					<RefreshCwIcon className={`me-2 size-3.5 ${loading ? "animate-spin" : ""}`} />
					刷新快照
				</Button>
			</div>
			{loading && !report ? (
				<div className="rounded-lg border border-border/70 bg-surface-soft p-3 text-sm text-muted-foreground">
					正在读取运行状态…
				</div>
			) : error && !report ? (
				<div className="grid gap-2 rounded-lg border border-destructive/25 bg-surface-soft p-3 text-sm text-destructive">
					<span>{error}</span>
					<Button variant="outline" size="sm" className="w-fit" onClick={() => load()} disabled={loading}>
						<RefreshCwIcon className="me-2 size-4" />
						重试
					</Button>
				</div>
			) : report ? (
				<div className="grid gap-3">
					<DeepHealthCronList tasks={report.cronTasks} />
					<div className="grid gap-3 lg:grid-cols-3">
						<DeepHealthDbWriteItem dbWrite={report.dbWrite} />
						<DeepHealthDiskItem disk={report.disk} />
						<DeepHealthBackupDirItem backupDir={report.backupDir} />
					</div>
					<p className="text-xs text-muted-foreground">
						Hub 启动于 {formatDateTime(report.startedAt)}。任务超过各自阈值未执行会标记为"逾期"，Hub
						刚启动时显示"等待首次执行"。快照生成于 {snapshotSuffix ? snapshotSuffix.slice(1, -1) : ""}
					</p>
				</div>
			) : null}
		</div>
	)
}

function DeepHealthCronList({ tasks }: { tasks: DeepHealthCronTask[] }) {
	return (
		<div className="rounded-lg border border-border/70 bg-surface-soft p-3">
			<div className="text-sm font-semibold text-foreground">定时任务（{tasks.length}）</div>
			{tasks.length === 0 ? (
				<p className="mt-2 text-xs text-muted-foreground">Hub 还没有注册任何定时任务。</p>
			) : (
				<div className="mt-2 grid gap-1.5">
					{tasks.map((task) => (
						<DeepHealthCronRow key={task.name} task={task} />
					))}
				</div>
			)}
		</div>
	)
}

function DeepHealthCronRow({ task }: { task: DeepHealthCronTask }) {
	const lastRun = task.lastFinish ?? task.lastStart
	return (
		<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md bg-card px-3 py-2">
			<div className="min-w-0">
				<div className="text-sm font-medium text-foreground">{cronTaskLabels[task.name] ?? task.name}</div>
				<div className="mt-0.5 text-xs text-muted-foreground">
					{lastRun ? `最近执行 ${formatDateTime(lastRun)}` : "尚未执行"}
					{task.lastStart && !task.lastFinish ? " · 正在执行" : ""}
					{" · 逾期阈值 "}
					{formatStaleThreshold(task.staleThreshold)}
				</div>
			</div>
			<div className="flex min-w-0 flex-col items-end gap-1">
				<Badge variant={cronBadgeVariant(task)}>{cronBadgeLabel(task)}</Badge>
				{task.lastError ? (
					<span className="max-w-full break-all text-end text-xs text-destructive">{task.lastError}</span>
				) : null}
			</div>
		</div>
	)
}

function cronBadgeVariant(task: DeepHealthCronTask): "success" | "danger" | "secondary" {
	if (!task.lastStart) return "secondary"
	return task.stale ? "danger" : "success"
}

function cronBadgeLabel(task: DeepHealthCronTask): string {
	if (!task.lastStart) return "等待首次执行"
	return task.stale ? "逾期" : "正常"
}

function formatStaleThreshold(seconds: number): string {
	if (seconds <= 0) return "—"
	if (seconds < 60) return `${seconds} 秒`
	if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟`
	return `${Math.round(seconds / 3600)} 小时`
}

function DeepHealthDbWriteItem({ dbWrite }: { dbWrite: DeepHealthReport["dbWrite"] }) {
	return (
		<DeepHealthInfoItem
			icon={<DatabaseIcon className="size-4" />}
			title="数据库写入探针"
			value={dbWrite.ok ? `${dbWrite.durationMs} ms` : "失败"}
			tone={dbWrite.ok ? "normal" : "error"}
			detail={dbWrite.ok ? "写入并删除一条内部探针记录" : dbWrite.error || "未知错误"}
		/>
	)
}

function DeepHealthDiskItem({ disk }: { disk: DeepHealthReport["disk"] }) {
	const usedPercent = Math.min(100, Math.max(0, disk.usedPercent))
	const tone = disk.error ? "error" : usedPercent >= 90 ? "error" : usedPercent >= 80 ? "warning" : "normal"
	const barColor = tone === "error" ? "bg-destructive" : tone === "warning" ? "bg-amber-500" : "bg-primary"
	return (
		<DeepHealthInfoItem
			icon={<HardDriveIcon className="size-4" />}
			title="磁盘水位"
			value={disk.error ? "不可用" : `${disk.usedPercent.toFixed(1)}% 已用`}
			tone={tone}
			detail={
				disk.error
					? disk.error
					: `剩余 ${formatBytes(disk.freeBytes)} / 共 ${formatBytes(disk.totalBytes)}${disk.path ? ` · ${disk.path}` : ""}`
			}
		>
			{!disk.error ? (
				<div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-card">
					<div className={`h-full rounded-full ${barColor}`} style={{ width: `${usedPercent}%` }} />
				</div>
			) : null}
		</DeepHealthInfoItem>
	)
}

function DeepHealthBackupDirItem({ backupDir }: { backupDir: DeepHealthReport["backupDir"] }) {
	return (
		<DeepHealthInfoItem
			icon={<FolderSearchIcon className="size-4" />}
			title="备份目录"
			value={backupDir.reachable ? "可达" : "不可达"}
			tone={backupDir.reachable ? "normal" : "error"}
			detail={backupDir.configured || backupDir.error || "未配置自动备份目录"}
			detailMono
		/>
	)
}

function DeepHealthInfoItem({
	icon,
	title,
	value,
	detail,
	tone = "normal",
	detailMono = false,
	children,
}: {
	icon: React.ReactNode
	title: string
	value: string
	detail: string
	tone?: "normal" | "warning" | "error"
	detailMono?: boolean
	children?: React.ReactNode
}) {
	return (
		<div className="rounded-lg border border-border/70 bg-surface-soft p-3">
			<div className="flex items-center justify-between gap-3">
				<div className="min-w-0">
					<div className="text-xs text-muted-foreground">{title}</div>
					<div
						className={`mt-0.5 text-sm font-semibold ${
							tone === "error"
								? "text-destructive"
								: tone === "warning"
									? "text-amber-600 dark:text-amber-400"
									: "text-foreground"
						}`}
					>
						{value}
					</div>
				</div>
				<span className="grid size-8 shrink-0 place-items-center rounded-md bg-card text-muted-foreground">{icon}</span>
			</div>
			{children}
			<div className={`mt-1.5 break-all text-xs text-muted-foreground ${detailMono ? "font-mono" : ""}`}>{detail}</div>
		</div>
	)
}

function formatBytes(value: number) {
	if (!value) return "0 B"
	const units = ["B", "KB", "MB", "GB", "TB"]
	let size = value
	let unit = 0
	while (size >= 1024 && unit < units.length - 1) {
		size /= 1024
		unit += 1
	}
	return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`
}
