import { ExternalLinkIcon, RefreshCwIcon, SearchIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, prependBasePath } from "@/components/router"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { cn } from "@/lib/utils"
import { SettingsDetailFieldGrid, SettingsDetailSection, SettingsDetailSheet } from "./components/detail-sheet"
import { SettingsPageHeader } from "./components/page-header"
import { SettingsStatCard, SettingsStatGrid } from "./components/stat-card"
import { SettingsTableCard } from "./components/table-card"
import { SettingsTablePagination } from "./components/table-pagination"
import { SettingsTableEmptyRow } from "./settings-empty-state"

type OperationAuditListResponse = {
	items: OperationAuditRecord[]
	page: number
	perPage: number
	hasMore: boolean
}

const pageSize = 25

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

function syncAuditFiltersToUrl(search: string, action: string, result: string) {
	if (typeof window === "undefined") {
		return
	}
	const url = new URL(window.location.href)
	if (search.trim()) {
		url.searchParams.set("search", search.trim())
	} else {
		url.searchParams.delete("search")
	}
	if (action !== "all") {
		url.searchParams.set("action", action)
	} else {
		url.searchParams.delete("action")
	}
	if (result !== "all") {
		url.searchParams.set("result", result)
	} else {
		url.searchParams.delete("result")
	}
	window.history.replaceState(null, "", `${url.pathname}${url.search}`)
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
	const pageStart = visibleRecords.length ? currentPage * pageSize + 1 : 0
	const pageEnd = currentPage * pageSize + visibleRecords.length

	return (
		<div className="grid pulse-card-gap">
			<SettingsPageHeader
				eyebrow="账户与数据"
				title="操作审计"
				description="查看用户、备份、Token、通知测试、告警处理和机器配置等管理动作；筛选条件会同步到地址栏。"
				actions={
					<Button variant="outline" size="sm" onClick={loadRecords} disabled={loading}>
						<RefreshCwIcon className={cn("me-2 size-4", loading && "animate-spin")} />
						刷新
					</Button>
				}
			/>

			<SettingsStatGrid>
				<SettingsStatCard label="本页记录" value={`${visibleRecords.length} 条`} detail={`第 ${currentPage + 1} 页`} />
				<SettingsStatCard label="全局动作" value={`${globalCount} 条`} detail="不绑定单台机器" />
				<SettingsStatCard
					label="本页结果"
					value={`成功 ${successCount} / 失败 ${failedCount}`}
					detail="按当前筛选统计"
				/>
			</SettingsStatGrid>

			<SettingsTableCard
				footer={
					visibleRecords.length > 0 ? (
						<SettingsTablePagination
							currentPage={currentPage}
							pageStart={pageStart}
							pageEnd={pageEnd}
							hasMore={hasMore}
							onPrevious={() => setPage((value) => Math.max(0, value - 1))}
							onNext={() => hasMore && setPage((value) => value + 1)}
						/>
					) : undefined
				}
			>
				<div className="grid gap-2 border-b border-border/70 bg-surface-soft p-2.5 lg:grid-cols-[minmax(0,1fr)_220px_160px]">
					<div className="relative">
						<SearchIcon className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground" />
						<Input
							value={search}
							onChange={(event) => {
								setSearch(event.target.value)
								setPage(0)
								syncAuditFiltersToUrl(event.target.value, action, result)
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
							syncAuditFiltersToUrl(search, value, result)
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
							syncAuditFiltersToUrl(search, action, value)
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
				<div className="overflow-x-auto">
					<Table>
						<TableHeader className="bg-surface-soft">
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
											<Badge variant={record.result === "success" ? "success" : "danger"}>
												{record.result === "success" ? "成功" : "失败"}
											</Badge>
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
			</SettingsTableCard>

			<OperationAuditDetailSheet record={selectedRecord} onOpenChange={(open) => !open && setSelectedRecord(null)} />
		</div>
	)
}

function OperationAuditDetailSheet({
	record,
	onOpenChange,
}: {
	record: OperationAuditRecord | null
	onOpenChange: (open: boolean) => void
}) {
	return (
		<SettingsDetailSheet
			open={Boolean(record)}
			onOpenChange={onOpenChange}
			title="操作审计详情"
			description={
				record
					? `${formatOperationDate(record.created)} · ${operationActionLabel(record.action)} · ${formatOperationAuditSummary(record)}`
					: "查看管理动作审计记录"
			}
			copyText={record ? formatAuditText(record) : undefined}
		>
			{record && (
				<>
					<AuditRelatedLinks record={record} />
					<SettingsDetailSection title="关键字段">
						<SettingsDetailFieldGrid entries={getAuditEntries(record)} />
					</SettingsDetailSection>
					<SettingsDetailSection title="结果说明">
						<div className="text-sm leading-relaxed text-muted-foreground">{formatOperationAuditResult(record)}</div>
					</SettingsDetailSection>
				</>
			)}
		</SettingsDetailSheet>
	)
}

function AuditRelatedLinks({ record }: { record: OperationAuditRecord }) {
	const links = getAuditRelatedLinks(record)
	if (!links.length) {
		return null
	}
	return (
		<SettingsDetailSection title="关联入口">
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
		</SettingsDetailSection>
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
