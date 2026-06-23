import { ClipboardCopyIcon, ExternalLinkIcon, RefreshCwIcon, SearchIcon } from "lucide-react"
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react"
import { Link, prependBasePath } from "@/components/router"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/components/ui/use-toast"
import { pb } from "@/lib/api"
import {
	formatOperationActor,
	formatOperationAuditResult,
	formatOperationAuditSummary,
	formatOperationDate,
	operationActionLabel,
	operationActionLabels,
	operationFailureLabel,
	type OperationAuditRecord,
} from "@/lib/operation-history"
import { cn, copyToClipboard } from "@/lib/utils"
import { SettingsEmptyState, SettingsTableEmptyRow } from "./settings-empty-state"

type OperationAuditListResponse = {
	items: OperationAuditRecord[]
	page: number
	perPage: number
	hasMore: boolean
}

export default function OperationAuditSettings() {
	const initialParams = useMemo(() => getPageSearchParams(), [])
	const [records, setRecords] = useState<OperationAuditRecord[]>([])
	const [loading, setLoading] = useState(false)
	const [search, setSearch] = useState(initialParams.search)
	const [action, setAction] = useState(initialParams.action)
	const [result, setResult] = useState(initialParams.result)
	const operation = initialParams.operation
	const [page, setPage] = useState(0)
	const [hasMore, setHasMore] = useState(false)
	const [selectedRecord, setSelectedRecord] = useState<OperationAuditRecord | null>(null)
	const { toast } = useToast()
	const pageSize = 25

	const loadRecords = useCallback(async () => {
		setLoading(true)
		try {
			const params = new URLSearchParams({
				paged: "1",
				page: String(page + 1),
				perPage: String(pageSize),
			})
			const keyword = search.trim()
			if (keyword) {
				params.set("search", keyword)
			}
			if (action !== "all") {
				params.set("action", action)
			}
			if (result !== "all") {
				params.set("result", result)
			}
			if (operation) {
				params.set("operation", operation)
			}
			const data = await pb.send<OperationAuditListResponse>(`/api/pulse/operations/audit?${params.toString()}`, {})
			setRecords(data.items)
			setHasMore(data.hasMore)
		} catch (error) {
			console.error(error)
			toast({
				title: "加载操作审计失败",
				description: "请确认 Hub 后端可用，并检查当前用户是否有权限查看审计记录。",
				variant: "destructive",
			})
		} finally {
			setLoading(false)
		}
	}, [action, operation, page, result, search, toast])

	useEffect(() => {
		loadRecords()
	}, [loadRecords])

	const actionOptions = useMemo(() => {
		const values = Object.keys(operationActionLabels).sort((a, b) =>
			operationActionLabel(a).localeCompare(operationActionLabel(b), "zh-CN")
		)
		if (action !== "all" && !values.includes(action)) {
			values.unshift(action)
		}
		return values
	}, [action, records])

	const currentPage = page
	const visibleRecords = records
	const successCount = records.filter((record) => record.result === "success").length
	const failedCount = records.filter((record) => record.result === "failed").length
	const globalCount = records.filter((record) => !record.system).length

	return (
		<div className="grid gap-4">
			<div className="rounded-lg border border-border/70 bg-surface-soft p-3 sm:flex sm:items-center sm:justify-between sm:gap-4">
				<div className="min-w-0">
					<h3 className="text-lg font-semibold tracking-tight">操作审计</h3>
					<p className="mt-1 text-sm text-muted-foreground">
						查看用户、备份、Token、通知测试、告警处理和机器配置等管理动作。
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={loadRecords}
					disabled={loading}
					className="mt-3 shrink-0 bg-card shadow-none transition-transform active:scale-[0.96] sm:mt-0"
				>
					<RefreshCwIcon className={cn("me-2 size-4", loading && "animate-spin")} />
					刷新
				</Button>
			</div>

			<div className="grid gap-2 sm:grid-cols-3">
				<AuditSummary label="本页记录" value={`${records.length} 条`} detail={`第 ${currentPage + 1} 页`} />
				<AuditSummary label="全局动作" value={`${globalCount} 条`} detail="不绑定单台机器" />
				<AuditSummary label="本页结果" value={`成功 ${successCount} / 失败 ${failedCount}`} detail="按当前筛选统计" />
			</div>

			<div className="grid gap-3 rounded-lg border border-border/70 bg-surface-soft p-3 lg:grid-cols-[minmax(0,1fr)_220px_160px]">
				<div className="relative">
					<SearchIcon className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground" />
					<Input
						value={search}
						onChange={(event) => {
							setSearch(event.target.value)
							setPage(0)
						}}
						placeholder="搜索动作、目标、详情、IP 或失败原因"
						className="bg-card pl-9 shadow-none"
					/>
				</div>
				<Select
					value={action}
					onValueChange={(value) => {
						setAction(value)
						setPage(0)
					}}
				>
					<SelectTrigger className="bg-card shadow-none">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">全部动作</SelectItem>
						{actionOptions.map((item) => (
							<SelectItem key={item} value={item}>
								{operationActionLabel(item)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select
					value={result}
					onValueChange={(value) => {
						setResult(value)
						setPage(0)
					}}
				>
					<SelectTrigger className="bg-card shadow-none">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">全部结果</SelectItem>
						<SelectItem value="success">成功</SelectItem>
						<SelectItem value="failed">失败</SelectItem>
					</SelectContent>
				</Select>
			</div>

			<div className="grid gap-2 md:hidden">
				{visibleRecords.length ? (
					visibleRecords.map((record) => (
						<AuditRecordCard key={record.id} record={record} onOpen={() => setSelectedRecord(record)} />
					))
				) : (
					<AuditEmptyState loading={loading} />
				)}
			</div>

			<div className="hidden overflow-x-auto rounded-lg border border-border/70 bg-card md:block">
				<Table>
					<TableHeader className="sticky top-0 z-10 bg-surface-soft">
						<TableRow>
							<TableHead className="w-40">时间</TableHead>
							<TableHead className="w-36">发起人</TableHead>
							<TableHead>动作</TableHead>
							<TableHead>目标</TableHead>
							<TableHead className="w-24">范围</TableHead>
							<TableHead className="w-28">结果</TableHead>
							<TableHead>详情</TableHead>
							<TableHead className="w-24 text-right">查看</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{visibleRecords.length ? (
							visibleRecords.map((record) => (
								<TableRow key={record.id}>
									<TableCell className="whitespace-nowrap text-muted-foreground">
										{formatOperationDate(record.created)}
									</TableCell>
									<TableCell className="whitespace-nowrap text-muted-foreground">
										{formatOperationActor(record)}
									</TableCell>
									<TableCell className="min-w-40 font-medium">{operationActionLabel(record.action)}</TableCell>
									<TableCell className="min-w-44 max-w-64 truncate text-muted-foreground">
										{record.target || "-"}
									</TableCell>
									<TableCell>
										<Badge variant="outline">{record.system ? "机器" : "全局"}</Badge>
									</TableCell>
									<TableCell>
										<AuditResultBadge record={record} />
									</TableCell>
									<TableCell className="min-w-64 max-w-xl truncate text-muted-foreground">
										{formatOperationAuditResult(record)}
									</TableCell>
									<TableCell className="text-right">
										<Button
											variant="ghost"
											size="sm"
											className="transition-transform active:scale-[0.96]"
											onClick={() => setSelectedRecord(record)}
										>
											详情
										</Button>
									</TableCell>
								</TableRow>
							))
						) : (
							<SettingsTableEmptyRow
								colSpan={8}
								loading={loading}
								loadingText="正在读取操作审计"
								emptyText="暂无操作审计记录"
							/>
						)}
					</TableBody>
				</Table>
			</div>

			{(currentPage > 0 || hasMore) && (
				<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-card p-3 text-sm text-muted-foreground shadow-none">
					<div>
						第 {currentPage + 1} 页，本页 {visibleRecords.length} 条
					</div>
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							className="transition-transform active:scale-[0.96]"
							disabled={currentPage === 0}
							onClick={() => setPage((value) => Math.max(0, value - 1))}
						>
							上一页
						</Button>
						<span className="min-w-20 text-center tabular-nums">第 {currentPage + 1} 页</span>
						<Button
							variant="outline"
							size="sm"
							className="transition-transform active:scale-[0.96]"
							disabled={!hasMore}
							onClick={() => setPage((value) => value + 1)}
						>
							下一页
						</Button>
					</div>
				</div>
			)}

			<AuditDetailDialog record={selectedRecord} onOpenChange={(open) => !open && setSelectedRecord(null)} />
		</div>
	)
}

function AuditSummary({ label, value, detail }: { label: string; value: string; detail: string }) {
	return (
		<div className="rounded-lg border border-border/70 bg-card p-3">
			<div className="text-xs text-muted-foreground">{label}</div>
			<div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
			<div className="mt-1 truncate text-xs text-muted-foreground">{detail}</div>
		</div>
	)
}

function AuditRecordCard({ record, onOpen }: { record: OperationAuditRecord; onOpen: () => void }) {
	return (
		<button
			type="button"
			onClick={onOpen}
			className="grid gap-3 rounded-lg border border-border/70 bg-card p-3 text-left transition-[background-color,transform] hover:bg-surface-soft active:scale-[0.96] active:bg-surface-soft"
		>
			<div className="flex min-w-0 items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="truncate text-sm font-semibold">{operationActionLabel(record.action)}</div>
					<div className="mt-1 truncate text-xs text-muted-foreground">{record.target || "无目标"}</div>
				</div>
				<AuditResultBadge record={record} />
			</div>
			<div className="rounded-md border border-border/70 bg-surface-soft px-3 py-2 text-sm leading-relaxed text-muted-foreground">
				{formatOperationAuditResult(record)}
			</div>
			<div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
				<span>{formatOperationDate(record.created)}</span>
				<span>{formatOperationActor(record)}</span>
				<span>{record.system ? "机器动作" : "全局动作"}</span>
			</div>
		</button>
	)
}

function AuditResultBadge({ record }: { record: OperationAuditRecord }) {
	return (
		<Badge variant={record.result === "success" ? "success" : "danger"}>
			{record.result === "success" ? "成功" : "失败"}
		</Badge>
	)
}

function AuditEmptyState({ loading }: { loading: boolean }) {
	return <SettingsEmptyState loading={loading} loadingText="正在读取操作审计" emptyText="暂无操作审计记录" />
}

function AuditDetailDialog({
	record,
	onOpenChange,
}: {
	record: OperationAuditRecord | null
	onOpenChange: (open: boolean) => void
}) {
	return (
		<Dialog open={Boolean(record)} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[85dvh] w-[calc(100vw-2rem)] max-w-3xl overflow-hidden rounded-lg border-border/70 bg-card p-0">
				<DialogHeader className="border-b border-border/70 bg-card px-5 py-4 pr-28">
					<DialogTitle>操作审计详情</DialogTitle>
					<DialogDescription>
						{record
							? `${formatOperationDate(record.created)} · ${operationActionLabel(record.action)} · ${formatOperationAuditSummary(record)}`
							: "查看管理动作审计记录"}
					</DialogDescription>
				</DialogHeader>
				{record && (
					<DetailDialogBody>
						<DialogCopyButton onClick={() => copyToClipboard(formatAuditText(record))} />
						<AuditRelatedLinks record={record} />
						<DetailSection title="关键字段">
							<DetailFieldGrid entries={getAuditEntries(record)} />
						</DetailSection>
						<DetailSection title="结果说明">
							<div className="text-sm leading-relaxed text-muted-foreground">{formatOperationAuditResult(record)}</div>
						</DetailSection>
					</DetailDialogBody>
				)}
			</DialogContent>
		</Dialog>
	)
}

function DetailDialogBody({ children }: { children: ReactNode }) {
	return (
		<div className="grid max-h-[calc(85dvh-5rem)] gap-3 overflow-y-auto bg-surface-soft p-3 sm:p-4">{children}</div>
	)
}

function DialogCopyButton({ onClick }: { onClick: () => void }) {
	return (
		<Button
			variant="outline"
			size="sm"
			className="absolute end-14 top-4 min-h-10 gap-1.5 bg-card px-3 shadow-none transition-transform active:scale-[0.96]"
			onClick={onClick}
		>
			<ClipboardCopyIcon className="size-4" />
			复制
		</Button>
	)
}

function DetailSection({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
	return (
		<section className={cn("grid gap-3 rounded-lg border border-border/70 bg-card p-3", className)}>
			<div className="text-sm font-semibold tracking-tight">{title}</div>
			{children}
		</section>
	)
}

function DetailFieldGrid({ entries }: { entries: [string, string][] }) {
	return (
		<div className="grid divide-y divide-border/70 overflow-hidden rounded-md border border-border/70">
			{entries.map(([label, value]) => (
				<div key={label} className="grid gap-1 bg-card px-3 py-2.5 sm:grid-cols-[8rem_1fr]">
					<div className="text-xs font-medium text-muted-foreground">{label}</div>
					<div className="min-w-0 break-words text-sm text-foreground">{value || "-"}</div>
				</div>
			))}
		</div>
	)
}

function getPageSearchParams() {
	if (typeof window === "undefined") {
		return { search: "", action: "all", result: "all", operation: "" }
	}
	const params = new URLSearchParams(window.location.search)
	const result = params.get("result") || "all"
	return {
		search: params.get("search") || "",
		action: params.get("action") || "all",
		result: result === "success" || result === "failed" ? result : "all",
		operation: params.get("operation") || "",
	}
}

function AuditRelatedLinks({ record }: { record: OperationAuditRecord }) {
	const links = getAuditRelatedLinks(record)
	if (!links.length) {
		return null
	}
	return (
		<DetailSection title="关联入口">
			<div className="flex flex-wrap gap-2">
				{links.map((link) => (
					<Button
						key={link.href}
						asChild
						variant="outline"
						size="sm"
						className="min-h-10 gap-1.5 bg-card transition-transform active:scale-[0.96]"
					>
						<Link href={link.href}>
							<ExternalLinkIcon className="size-3.5" />
							{link.label}
						</Link>
					</Button>
				))}
			</div>
		</DetailSection>
	)
}

function getAuditRelatedLinks(record: OperationAuditRecord) {
	const keyword = buildAuditSearchKeyword(record)
	const links: { label: string; href: string }[] = []
	if (record.system) {
		links.push({
			label: "机器操作记录",
			href: prependBasePath(`/system/${record.system}?tab=history`),
		})
	}
	if (record.operation) {
		links.push({
			label: "关联审计",
			href: prependBasePath(`/settings/audit?operation=${encodeURIComponent(record.operation)}`),
		})
	}
	if (keyword) {
		links.push({
			label: "搜索系统日志",
			href: prependBasePath(`/settings/logs?search=${encodeURIComponent(keyword)}`),
		})
	}
	if (isAlertAuditAction(record.action)) {
		links.push({
			label: "搜索告警历史",
			href: prependBasePath(`/alerts?search=${encodeURIComponent(keyword || record.action)}`),
		})
	}
	return links
}

function buildAuditSearchKeyword(record: OperationAuditRecord) {
	return [record.target, record.action, record.failure_code, record.operation].filter(Boolean).join(" ")
}

function isAlertAuditAction(action: string) {
	return (
		action.includes("alert") ||
		action === "acknowledge_alert" ||
		action === "silence_alert" ||
		action === "unsilence_alert"
	)
}

function getAuditEntries(record: OperationAuditRecord): [string, string][] {
	return [
		["动作", `${operationActionLabel(record.action)} (${record.action})`],
		["发起人", formatOperationActor(record)],
		["目标", record.target || "-"],
		["范围", record.system ? `机器 ${record.system}` : "全局"],
		["结果", record.result === "success" ? "成功" : "失败"],
		["失败原因", operationFailureLabel(record.failure_code) || "-"],
		["请求 IP", record.ip || "-"],
		["关联操作", record.operation || "-"],
		["时间", formatOperationDate(record.created)],
	]
}

function formatAuditText(record: OperationAuditRecord) {
	return getAuditEntries(record)
		.concat([["详情", formatOperationAuditResult(record)]])
		.map(([label, value]) => `${label}: ${value}`)
		.join("\n")
}
