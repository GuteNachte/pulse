import { Clock3Icon, ExternalLinkIcon, MonitorCogIcon, RefreshCwIcon } from "lucide-react"
import { memo, useCallback, useEffect, useMemo, useState } from "react"
import { Link, prependBasePath } from "@/components/router"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/components/ui/use-toast"
import { pb } from "@/lib/api"
import {
	buildOperationHistoryEntries,
	formatOperationActionResult,
	formatOperationActor,
	formatOperationAuditResult,
	formatOperationAuditSummary,
	formatOperationDate,
	formatOperationDuration,
	operationActionLabel,
	operationStageLabel,
	operationStatusLabel,
	operationStatusVariant,
	type OperationActionRecord,
	type OperationAuditRecord,
	type OperationHistoryEntry,
} from "@/lib/operation-history"

export default memo(function OperationHistoryCard({ systemId }: { systemId: string }) {
	const [actions, setActions] = useState<OperationActionRecord[]>([])
	const [audits, setAudits] = useState<OperationAuditRecord[]>([])
	const [loading, setLoading] = useState(false)
	const latestRunning = useMemo(() => actions.find((action) => action.status === "running"), [actions])
	const auditByOperation = useMemo(() => {
		const map = new Map<string, OperationAuditRecord>()
		for (const audit of audits) {
			if (audit.operation && !map.has(audit.operation)) {
				map.set(audit.operation, audit)
			}
		}
		return map
	}, [audits])

	const refresh = useCallback(async () => {
		setLoading(true)
		try {
			const query = `?system=${encodeURIComponent(systemId)}`
			const [actionData, auditData] = await Promise.all([
				pb.send<OperationActionRecord[]>(`/api/pulse/operations${query}`, {}),
				pb.send<OperationAuditRecord[]>(`/api/pulse/operations/audit${query}`, {}),
			])
			setActions(actionData)
			setAudits(auditData)
		} catch (error) {
			console.error(error)
			toast({
				title: "读取操作记录失败",
				description: "请确认 Hub 后端已经更新到当前二开版本。",
				variant: "destructive",
			})
		} finally {
			setLoading(false)
		}
	}, [systemId])

	useEffect(() => {
		refresh()
	}, [refresh])

	return (
		<Card className="overflow-hidden border-border/70 bg-card shadow-none">
			<CardHeader className="gap-3 border-b border-border/70 bg-card px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<CardTitle className="flex items-center gap-2 text-base">
						<MonitorCogIcon className="size-4" />
						设备操作记录
					</CardTitle>
					{latestRunning && (
						<div className="mt-2 grid gap-1 text-xs text-muted-foreground">
							<div className="flex items-center gap-1.5">
								<Clock3Icon className="size-3.5 text-amber-600" />
								{operationActionLabel(latestRunning.action)} 正在执行
								{latestRunning.timeout_seconds ? `，最长等待 ${latestRunning.timeout_seconds} 秒` : ""}
							</div>
							<div className="h-1.5 overflow-hidden rounded-full bg-surface-soft">
								<div className="h-full w-1/2 animate-pulse rounded-full bg-amber-500" />
							</div>
						</div>
					)}
				</div>
				<Button variant="outline" size="sm" onClick={refresh} disabled={loading} className="shrink-0">
					<RefreshCwIcon className={loading ? "me-2 size-4 animate-spin" : "me-2 size-4"} />
					刷新记录
				</Button>
			</CardHeader>
			<CardContent className="bg-surface-soft p-3 sm:p-4">
				<OperationsTable actions={actions} audits={audits} auditByOperation={auditByOperation} />
			</CardContent>
		</Card>
	)
})

function OperationsTable({
	actions,
	audits,
	auditByOperation,
}: {
	actions: OperationActionRecord[]
	audits: OperationAuditRecord[]
	auditByOperation: Map<string, OperationAuditRecord>
}) {
	const rows = useMemo(
		() => buildOperationHistoryEntries(actions, audits, auditByOperation),
		[actions, audits, auditByOperation]
	)

	if (rows.length === 0) {
		return <EmptyState loading={false} loadingText="正在读取操作记录" emptyText="暂无操作或审计记录" />
	}
	return (
		<>
			<div className="grid gap-2 md:hidden">
				{rows.map((entry) => (
					<OperationHistoryEntryCard key={`${entry.kind}-${entry.id}`} entry={entry} />
				))}
			</div>
			<div className="hidden overflow-x-auto rounded-lg border border-border/70 bg-card shadow-none md:block">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>时间</TableHead>
							<TableHead>发起人</TableHead>
							<TableHead>动作</TableHead>
							<TableHead>目标</TableHead>
							<TableHead>状态</TableHead>
							<TableHead>阶段</TableHead>
							<TableHead>耗时</TableHead>
							<TableHead>审计</TableHead>
							<TableHead>结果</TableHead>
							<TableHead className="w-28 text-right">追踪</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((entry) => {
							return (
								<TableRow key={`${entry.kind}-${entry.id}`}>
									<TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(entry.created)}</TableCell>
									<TableCell className="whitespace-nowrap text-muted-foreground">{entryActorLabel(entry)}</TableCell>
									<TableCell>{entryActionLabel(entry)}</TableCell>
									<TableCell>{entryTarget(entry)}</TableCell>
									<TableCell>
										<Badge variant={entryStatusVariant(entry)}>{entryStatusLabel(entry)}</Badge>
									</TableCell>
									<TableCell>
										<Badge variant="outline">{entryStageLabel(entry)}</Badge>
									</TableCell>
									<TableCell className="whitespace-nowrap text-muted-foreground">{entryDuration(entry)}</TableCell>
									<TableCell className="max-w-48 truncate text-xs text-muted-foreground">
										{entryAuditLabel(entry)}
									</TableCell>
									<TableCell className="max-w-96 truncate text-muted-foreground">{entryResultLabel(entry)}</TableCell>
									<TableCell className="text-right">
										<OperationHistoryLinks entry={entry} compact />
									</TableCell>
								</TableRow>
							)
						})}
					</TableBody>
				</Table>
			</div>
		</>
	)
}

function OperationHistoryEntryCard({ entry }: { entry: OperationHistoryEntry }) {
	return (
		<div className="grid gap-3 rounded-lg border border-border/70 bg-card p-3 text-sm shadow-none">
			<div className="flex min-w-0 items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="font-medium">{entryActionLabel(entry)}</div>
					<div className="mt-1 truncate text-xs text-muted-foreground">{entryTarget(entry) || "无目标"}</div>
				</div>
				<Badge variant={entryStatusVariant(entry)}>{entryStatusLabel(entry)}</Badge>
			</div>
			<div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
				<div className="rounded-md border border-border/70 bg-card px-3 py-2 shadow-none">
					<div>发起人</div>
					<div className="mt-1 text-foreground">{entryActorLabel(entry)}</div>
				</div>
				<div className="rounded-md border border-border/70 bg-card px-3 py-2 shadow-none">
					<div>阶段</div>
					<div className="mt-1 text-foreground">{entryStageLabel(entry)}</div>
				</div>
				<div className="rounded-md border border-border/70 bg-card px-3 py-2 shadow-none">
					<div>耗时</div>
					<div className="mt-1 text-foreground">{entryDuration(entry)}</div>
				</div>
				<div className="rounded-md border border-border/70 bg-card px-3 py-2 shadow-none">
					<div>{entry.kind === "action" ? "开始" : "时间"}</div>
					<div className="mt-1 text-foreground">
						{formatDate(
							entry.kind === "action" ? entry.action.started_at || entry.action.created : entry.audit.created
						)}
					</div>
				</div>
				<div className="rounded-md border border-border/70 bg-card px-3 py-2 shadow-none">
					<div>超时</div>
					<div className="mt-1 text-foreground">
						{entry.kind === "action" && entry.action.timeout_seconds ? `${entry.action.timeout_seconds} 秒` : "-"}
					</div>
				</div>
				<div className="col-span-2 rounded-md border border-border/70 bg-card px-3 py-2 shadow-none">
					<div>审计</div>
					<div className="mt-1 text-foreground">{entryAuditLabel(entry)}</div>
				</div>
			</div>
			{entry.kind === "action" && entry.action.status === "running" && (
				<div className="h-1.5 overflow-hidden rounded-full bg-surface-soft">
					<div className="h-full w-1/2 animate-pulse rounded-full bg-amber-500" />
				</div>
			)}
			<div className="break-words text-xs text-muted-foreground">{entryResultLabel(entry) || "暂无结果"}</div>
			<OperationHistoryLinks entry={entry} />
		</div>
	)
}

function OperationHistoryLinks({ entry, compact = false }: { entry: OperationHistoryEntry; compact?: boolean }) {
	const links = getOperationHistoryLinks(entry)
	if (!links.length) {
		return null
	}
	return (
		<div className={compact ? "flex justify-end" : "flex flex-wrap gap-2"}>
			{links.map((link) => (
				<Button
					key={link.href}
					asChild
					variant="ghost"
					size="sm"
					className={compact ? "min-h-10 px-2" : "min-h-10 px-2.5 text-xs"}
				>
					<Link href={link.href} title={link.label}>
						<ExternalLinkIcon className="size-3.5" />
						{compact ? <span className="sr-only">{link.label}</span> : link.label}
					</Link>
				</Button>
			))}
		</div>
	)
}

function getOperationHistoryLinks(entry: OperationHistoryEntry) {
	const action = entry.kind === "action" ? entry.action.action : entry.audit.action
	const target = entry.kind === "action" ? entry.action.target : entry.audit.target || ""
	const operationID = entry.kind === "action" ? entry.action.id : entry.audit.operation || ""
	const keyword = [target, action].filter(Boolean).join(" ")
	const links: { label: string; href: string }[] = []
	if (operationID) {
		links.push({
			label: "审计",
			href: prependBasePath(`/settings/audit?operation=${encodeURIComponent(operationID)}`),
		})
	}
	if (keyword) {
		links.push({
			label: "日志",
			href: prependBasePath(`/settings/logs?search=${encodeURIComponent(keyword)}`),
		})
	}
	if (isAlertHistoryAction(action)) {
		links.push({
			label: "告警",
			href: prependBasePath(`/alerts?search=${encodeURIComponent(keyword || action)}`),
		})
	}
	return links
}

function isAlertHistoryAction(action: string) {
	return (
		action.includes("alert") ||
		action === "acknowledge_alert" ||
		action === "silence_alert" ||
		action === "unsilence_alert"
	)
}

function entryActionLabel(entry: OperationHistoryEntry) {
	const action = entry.kind === "action" ? entry.action.action : entry.audit.action
	return operationActionLabel(action)
}

function entryActorLabel(entry: OperationHistoryEntry) {
	if (entry.kind === "action") {
		return formatOperationActor(entry.action)
	}
	return formatOperationActor(entry.audit)
}

function entryTarget(entry: OperationHistoryEntry) {
	const target = entry.kind === "action" ? entry.action.target : entry.audit.target
	return target || "-"
}

function entryStatusVariant(entry: OperationHistoryEntry) {
	if (entry.kind === "action") {
		return operationStatusVariant[entry.action.status]
	}
	return entry.audit.result === "success" ? "success" : "danger"
}

function entryStatusLabel(entry: OperationHistoryEntry) {
	if (entry.kind === "action") {
		return operationStatusLabel(entry.action.status)
	}
	return entry.audit.result === "success" ? "成功" : "失败"
}

function entryStageLabel(entry: OperationHistoryEntry) {
	if (entry.kind === "action") {
		return operationStageLabel(entry.action.stage, entry.action.status)
	}
	return "已记录"
}

function entryDuration(entry: OperationHistoryEntry) {
	if (entry.kind === "action") {
		return formatOperationDuration(entry.action)
	}
	return "-"
}

function entryAuditLabel(entry: OperationHistoryEntry) {
	return formatOperationAuditSummary(entry.audit)
}

function entryResultLabel(entry: OperationHistoryEntry) {
	if (entry.kind === "action") {
		return formatOperationActionResult(entry.action)
	}
	return formatOperationAuditResult(entry.audit)
}

function formatDate(value: string) {
	return formatOperationDate(value)
}
