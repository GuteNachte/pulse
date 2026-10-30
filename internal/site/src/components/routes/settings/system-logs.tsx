import { RefreshCwIcon, SearchIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/components/ui/use-toast"
import { pb } from "@/lib/api"
import { SettingsDetailFieldGrid, SettingsDetailSection, SettingsDetailSheet } from "./components/detail-sheet"
import { SettingsPageHeader } from "./components/page-header"
import { SettingsStatCard, SettingsStatGrid } from "./components/stat-card"
import { SettingsTableCard } from "./components/table-card"
import { SettingsTablePagination } from "./components/table-pagination"
import { SettingsTableEmptyRow } from "./settings-empty-state"

type SystemLogRecord = {
	id: string
	level: number
	message: string
	data: string
	created: string
}

type SystemLogsResponse = {
	items: SystemLogRecord[]
	page: number
	perPage: number
	hasMore: boolean
}

const pageSize = 25

function getInitialLogFilters() {
	if (typeof window === "undefined") {
		return { level: "all", search: "" }
	}
	const params = new URLSearchParams(window.location.search)
	const level = params.get("level") || "all"
	return {
		level: ["1", "2", "4", "8"].includes(level) ? level : "all",
		search: params.get("search") || "",
	}
}

function syncLogFiltersToUrl(level: string, search: string) {
	if (typeof window === "undefined") {
		return
	}
	const url = new URL(window.location.href)
	if (level !== "all") {
		url.searchParams.set("level", level)
	} else {
		url.searchParams.delete("level")
	}
	if (search.trim()) {
		url.searchParams.set("search", search.trim())
	} else {
		url.searchParams.delete("search")
	}
	window.history.replaceState(null, "", `${url.pathname}${url.search}`)
}

export default function SystemLogs() {
	const initialParams = useMemo(() => getInitialLogFilters(), [])
	const [logs, setLogs] = useState<SystemLogRecord[]>([])
	const [level, setLevel] = useState(initialParams.level)
	const [search, setSearch] = useState(initialParams.search)
	const [loading, setLoading] = useState(false)
	const [page, setPage] = useState(0)
	const [hasMore, setHasMore] = useState(false)
	const [selectedLog, setSelectedLog] = useState<SystemLogRecord | null>(null)
	const { toast } = useToast()

	const query = useMemo(() => {
		const params = new URLSearchParams({ page: String(page + 1), perPage: String(pageSize) })
		if (level !== "all") params.set("level", level)
		if (search.trim()) params.set("search", search.trim())
		return params.toString()
	}, [level, page, search])

	const loadLogs = useCallback(async () => {
		setLoading(true)
		try {
			const data = await pb.send<SystemLogsResponse>(`/api/pulse/logs?${query}`, {})
			setLogs(data.items)
			setHasMore(Boolean(data.hasMore))
		} catch (error) {
			console.error(error)
			toast({
				title: "加载系统日志失败",
				description: "请稍后重试，或检查 Hub 日志。",
				variant: "destructive",
			})
		} finally {
			setLoading(false)
		}
	}, [query, toast])

	useEffect(() => {
		loadLogs()
	}, [loadLogs])

	const currentPage = page
	const visibleLogs = logs
	const errorCount = visibleLogs.filter((log) => log.level <= 1).length
	const warningCount = visibleLogs.filter((log) => log.level === 2).length
	const infoCount = visibleLogs.filter((log) => log.level === 4).length
	const pageStart = visibleLogs.length ? currentPage * pageSize + 1 : 0
	const pageEnd = currentPage * pageSize + visibleLogs.length

	return (
		<div className="grid pulse-card-gap">
			<SettingsPageHeader
				eyebrow="账户与数据"
				title="系统日志"
				description="查看 Hub 运行事件、接口请求和诊断字段；筛选条件会同步到地址栏，方便把某类问题直接分享给他人。"
				actions={
					<Button variant="outline" size="sm" onClick={loadLogs} disabled={loading}>
						<RefreshCwIcon className={`me-2 size-4 ${loading ? "animate-spin" : ""}`} />
						刷新
					</Button>
				}
			/>

			<SettingsStatGrid>
				<SettingsStatCard label="本页日志" value={`${visibleLogs.length} 条`} detail={`第 ${currentPage + 1} 页`} />
				<SettingsStatCard
					label="风险事件"
					value={`错误 ${errorCount} / 警告 ${warningCount}`}
					detail="按真实日志级别统计"
				/>
				<SettingsStatCard
					label="普通事件"
					value={`${infoCount} 条`}
					detail={hasMore ? "后面还有更多日志" : "当前筛选已到末尾"}
				/>
			</SettingsStatGrid>

			<SettingsTableCard
				footer={
					visibleLogs.length > 0 ? (
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
				<div className="grid gap-2 border-b border-border/70 bg-surface-soft p-2.5 sm:grid-cols-[180px_1fr]">
					<Select
						value={level}
						onValueChange={(value) => {
							setLevel(value)
							setPage(0)
							syncLogFiltersToUrl(value, search)
						}}
					>
						<SelectTrigger className="bg-card shadow-none">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">全部级别</SelectItem>
							<SelectItem value="8">调试</SelectItem>
							<SelectItem value="4">信息</SelectItem>
							<SelectItem value="2">警告</SelectItem>
							<SelectItem value="1">错误</SelectItem>
						</SelectContent>
					</Select>
					<div className="relative">
						<SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={search}
							onChange={(e) => {
								setSearch(e.target.value)
								setPage(0)
								syncLogFiltersToUrl(level, e.target.value)
							}}
							placeholder="搜索消息或数据"
							className="bg-card pl-9 shadow-none"
						/>
					</div>
				</div>
				<div className="overflow-x-auto">
					<Table>
						<TableHeader className="bg-surface-soft">
							<TableRow>
								<TableHead className="w-40">时间</TableHead>
								<TableHead className="w-24">级别</TableHead>
								<TableHead>事件</TableHead>
								<TableHead>重点</TableHead>
								<TableHead className="w-24 text-right">详情</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{visibleLogs.length ? (
								visibleLogs.map((log) => {
									const summary = getLogSummary(log)
									return (
										<TableRow key={log.id}>
											<TableCell className="whitespace-nowrap text-muted-foreground">
												{formatLogTime(log.created)}
											</TableCell>
											<TableCell>
												<Badge variant={getLevelVariant(log.level)}>{getLevelLabel(log.level)}</Badge>
											</TableCell>
											<TableCell className="min-w-56">
												<div className="font-medium text-foreground">{summary.title}</div>
												<div className="mt-1 max-w-xl truncate text-xs text-muted-foreground">{summary.subtitle}</div>
											</TableCell>
											<TableCell className="min-w-64 max-w-xl">
												<div className="truncate text-sm text-muted-foreground">{summary.focus}</div>
											</TableCell>
											<TableCell className="text-right">
												<Button
													variant="ghost"
													size="sm"
													className="transition-transform active:scale-[0.96]"
													onClick={() => setSelectedLog(log)}
												>
													查看
												</Button>
											</TableCell>
										</TableRow>
									)
								})
							) : (
								<SettingsTableEmptyRow
									colSpan={5}
									loading={loading}
									loadingText="正在读取系统日志"
									emptyText="暂无日志"
								/>
							)}
						</TableBody>
					</Table>
				</div>
			</SettingsTableCard>

			<SystemLogDetailSheet log={selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)} />
		</div>
	)
}

function SystemLogDetailSheet({
	log,
	onOpenChange,
}: {
	log: SystemLogRecord | null
	onOpenChange: (open: boolean) => void
}) {
	const summary = log ? getLogSummary(log) : null
	const entries = log ? getReadableDataEntries(log.data) : []
	const formattedData = log ? formatData(log.data) : "-"

	return (
		<SettingsDetailSheet
			open={Boolean(log)}
			onOpenChange={onOpenChange}
			title="日志详情"
			description={
				log ? `${formatLogTime(log.created)} · ${getLevelLabel(log.level)} · ${summary?.title ?? "系统事件"}` : ""
			}
			copyText={log ? buildLogCopyText(log) : undefined}
		>
			{log && summary && (
				<>
					<SettingsDetailSection title="重点信息">
						<div className="text-sm leading-relaxed">
							<div className="font-medium text-foreground">{summary.title}</div>
							<div className="mt-1 text-muted-foreground">{summary.focus || "没有可提取的重点字段"}</div>
						</div>
					</SettingsDetailSection>
					<SettingsDetailSection title="原始消息">
						<div className="break-words font-mono text-xs leading-relaxed text-muted-foreground">
							{log.message || "-"}
						</div>
					</SettingsDetailSection>
					<SettingsDetailSection title="可读字段">
						{entries.length ? (
							<SettingsDetailFieldGrid entries={entries} />
						) : (
							<div className="text-sm text-muted-foreground">没有附加数据</div>
						)}
					</SettingsDetailSection>
					{formattedData !== "-" && (
						<SettingsDetailSection title="原始数据">
							<pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border/70 bg-card p-3 font-mono text-xs leading-relaxed text-muted-foreground">
								{formattedData}
							</pre>
						</SettingsDetailSection>
					)}
				</>
			)}
		</SettingsDetailSheet>
	)
}

function buildLogCopyText(log: SystemLogRecord) {
	const summary = getLogSummary(log)
	const entries = getReadableDataEntries(log.data)
	const formattedData = formatData(log.data)
	return [
		`时间: ${formatLogTime(log.created)}`,
		`级别: ${getLevelLabel(log.level)}`,
		`事件: ${summary.title}`,
		`重点: ${summary.focus || "-"}`,
		`消息: ${log.message || "-"}`,
		entries.length ? `字段:\n${entries.map(([label, value]) => `- ${label}: ${value}`).join("\n")}` : "字段: 无",
		formattedData !== "-" ? `原始数据:\n${formattedData}` : "原始数据: 无",
	].join("\n")
}

function getLogSummary(log: SystemLogRecord) {
	const data = parseDataObject(log.data)
	const message = log.message || "系统事件"
	const request = parseRequestMessage(message)
	const action = getFirstString(data, ["action", "operation", "method"])
	const target = getFirstString(data, [
		"target",
		"name",
		"container",
		"system",
		"system_name",
		"host",
		"client",
		"path",
	])
	const status = getFirstString(data, ["status", "result", "state", "code", "status_code"])
	const error = getFirstString(data, ["error", "message", "reason", "detail"])

	if (request) {
		return {
			title: "接口请求",
			subtitle: `${request.method} ${request.path}`,
			focus: compactJoin([
				status ? `结果 ${status}` : "",
				action ? `动作 ${action}` : "",
				target ? `对象 ${target}` : "",
			]),
		}
	}

	if (/agent/i.test(message)) {
		return {
			title: "Agent 事件",
			subtitle: message,
			focus: compactJoin([
				target ? `设备 ${target}` : "",
				status ? `状态 ${status}` : "",
				error ? `原因 ${error}` : "",
			]),
		}
	}

	if (/container|compose|docker|stack/i.test(message)) {
		return {
			title: "容器事件",
			subtitle: message,
			focus: compactJoin([
				target ? `对象 ${target}` : "",
				action ? `动作 ${action}` : "",
				status ? `结果 ${status}` : "",
				error ? `原因 ${error}` : "",
			]),
		}
	}

	if (/alert|alarm|warning/i.test(message)) {
		return {
			title: "告警事件",
			subtitle: message,
			focus: compactJoin([
				target ? `对象 ${target}` : "",
				status ? `状态 ${status}` : "",
				error ? `原因 ${error}` : "",
			]),
		}
	}

	if (/updater|poll|tick|system/i.test(message)) {
		return {
			title: "系统任务",
			subtitle: message,
			focus: compactJoin([
				target ? `对象 ${target}` : "",
				status ? `结果 ${status}` : "",
				error ? `原因 ${error}` : "",
			]),
		}
	}

	return {
		title: friendlyMessage(message),
		subtitle: message,
		focus:
			compactJoin([target ? `对象 ${target}` : "", status ? `结果 ${status}` : "", error ? `原因 ${error}` : ""]) ||
			getDataSummary(log.data),
	}
}

function getLevelLabel(level: number) {
	switch (level) {
		case 8:
			return "调试"
		case 4:
			return "信息"
		case 2:
			return "警告"
		case 1:
			return "错误"
		default:
			return String(level)
	}
}

function getLevelVariant(level: number) {
	if (level <= 1) return "destructive"
	if (level === 2) return "warning"
	if (level === 4) return "secondary"
	return "outline"
}

function formatLogTime(value: string) {
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return value
	return date.toLocaleString("zh-CN", { hour12: false })
}

function formatData(value: string) {
	if (!value || value === "{}") return "-"
	try {
		return JSON.stringify(JSON.parse(value), null, 2)
	} catch {
		return value
	}
}

function parseDataObject(value: string): Record<string, unknown> {
	if (!value || value === "{}") return {}
	try {
		const parsed = JSON.parse(value)
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}
	} catch {
		return {}
	}
}

function parseRequestMessage(value: string) {
	const match = value.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\S+)/i)
	if (!match) return null
	return { method: match[1].toUpperCase(), path: match[2] }
}

function friendlyMessage(value: string) {
	if (!value) return "系统事件"
	const request = parseRequestMessage(value)
	if (request) return "接口请求"
	return value.length > 28 ? `${value.slice(0, 28)}...` : value
}

function getReadableDataEntries(value: string): [string, string][] {
	const data = parseDataObject(value)
	const entries = Object.entries(data)
	if (!entries.length) return []
	return entries.map(([key, entryValue]) => [getFieldLabel(key), stringifyDataValue(entryValue)])
}

function getDataSummary(value: string) {
	const entries = getReadableDataEntries(value).slice(0, 3)
	if (!entries.length) return "没有附加数据"
	return entries.map(([label, entryValue]) => `${label} ${entryValue}`).join(" / ")
}

function getFirstString(data: Record<string, unknown>, keys: string[]) {
	for (const key of keys) {
		const value = data[key]
		if (value === undefined || value === null || value === "") continue
		return stringifyDataValue(value)
	}
	return ""
}

function stringifyDataValue(value: unknown) {
	if (typeof value === "string") return value
	if (typeof value === "number" || typeof value === "boolean") return String(value)
	try {
		return JSON.stringify(value)
	} catch {
		return String(value)
	}
}

function compactJoin(values: string[]) {
	return values.filter(Boolean).join(" / ")
}

function getFieldLabel(key: string) {
	const labels: Record<string, string> = {
		action: "动作",
		agent: "Agent",
		client: "客户端",
		code: "状态码",
		container: "容器",
		detail: "详情",
		error: "错误",
		host: "主机",
		method: "方法",
		message: "消息",
		name: "名称",
		operation: "操作",
		path: "路径",
		reason: "原因",
		result: "结果",
		state: "状态",
		status: "状态",
		status_code: "状态码",
		system: "机器",
		system_name: "机器",
		target: "对象",
	}
	return labels[key] ?? key
}
