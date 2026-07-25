import { getPagePath } from "@nanostores/router"
import { ExternalLinkIcon, Globe2Icon, PlusIcon, RefreshCwIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, $router } from "@/components/router"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { toast } from "@/components/ui/use-toast"
import { isReadOnlyUser, pb } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { WebsiteMonitorCheckRecord, WebsiteMonitorRecord } from "@/types"
import { formatLatency } from "../websites/format"
import { TargetHistoryBars } from "../websites/history-bars"
import { SiteIcon } from "../websites/site-icon"
import { StatusBadge } from "../websites/status-ui"
import {
	getSystemWebsiteMonitorRowViewModel,
	getSystemWebsiteMonitorsSummary,
	groupWebsiteChecksByMonitor,
} from "./website-monitors-card-utils"

export function SystemWebsiteMonitorsCard({ systemId }: { systemId: string }) {
	const [monitors, setMonitors] = useState<WebsiteMonitorRecord[]>([])
	const [checks, setChecks] = useState<WebsiteMonitorCheckRecord[]>([])
	const [loading, setLoading] = useState(true)
	const [runningId, setRunningId] = useState("")
	const readOnly = isReadOnlyUser()
	const websitesPath = `${getPagePath($router, "websites")}?system=${encodeURIComponent(systemId)}`
	const addWebsitePath = `${websitesPath}&add=1`

	const load = useCallback(async () => {
		setLoading(true)
		try {
			const monitorRecords = await pb.collection<WebsiteMonitorRecord>("website_monitors").getFullList({
				filter: pb.filter("system = {:system}", { system: systemId }),
				sort: "+group,+name",
				requestKey: null,
			})
			setMonitors(monitorRecords)
			if (!monitorRecords.length) {
				setChecks([])
				return
			}
			const monitorIds = new Set(monitorRecords.map((monitor) => monitor.id))
			const checkRecords = await pb.collection<WebsiteMonitorCheckRecord>("website_monitor_checks").getFullList({
				sort: "-created",
				perPage: 200,
				requestKey: null,
			})
			setChecks(checkRecords.filter((check) => monitorIds.has(check.monitor)))
		} catch (error) {
			console.error("load system website monitors", error)
			toast({ title: "加载失败", description: "这台机器的互联网服务监控读取失败。", variant: "destructive" })
		} finally {
			setLoading(false)
		}
	}, [systemId])

	useEffect(() => {
		load()
	}, [load])

	const checksByMonitor = useMemo(() => groupWebsiteChecksByMonitor(checks), [checks])

	const summary = useMemo(() => getSystemWebsiteMonitorsSummary(monitors), [monitors])

	async function checkNow(id: string) {
		setRunningId(id)
		try {
			await pb.send(`/api/pulse/website-monitors/${id}/check`, { method: "POST" })
			await load()
			toast({ title: "检测完成" })
		} catch (error) {
			console.error("check website monitor", error)
			toast({ title: "检测失败", description: "Hub 无法访问该检测地址或请求超时。", variant: "destructive" })
		} finally {
			setRunningId("")
		}
	}

	return (
		<Card className="overflow-hidden border-border/70 bg-surface-soft shadow-none">
			<CardHeader className="gap-2 border-b border-border/70 bg-surface-soft px-4 py-3.5">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="min-w-0">
						<CardTitle className="flex items-center gap-2 text-base">
							<Globe2Icon className="size-4" />
							互联网服务监控
							<Badge variant="outline">{summary.total} 项</Badge>
						</CardTitle>
						<div className="mt-2 grid w-fit grid-cols-2 gap-1 rounded-lg border border-border/70 bg-card p-1 text-xs text-muted-foreground sm:flex">
							<span className="rounded-md bg-surface-soft px-2 py-1">正常 {summary.up}</span>
							<span className="rounded-md bg-surface-soft px-2 py-1">异常 {summary.down}</span>
							<span className="rounded-md bg-surface-soft px-2 py-1">待检测 {summary.unknown}</span>
							<span className="rounded-md bg-surface-soft px-2 py-1">暂停 {summary.paused}</span>
						</div>
					</div>
					<div className="flex shrink-0 flex-wrap gap-2">
						<Button asChild variant="outline" className="min-h-10 gap-2 transition-transform active:scale-[0.96]">
							<Link href={websitesPath}>
								<ExternalLinkIcon className="size-4" />
								打开网站页
							</Link>
						</Button>
						{!readOnly && (
							<Button asChild className="min-h-10 gap-2 transition-transform active:scale-[0.96]">
								<Link href={addWebsitePath}>
									<PlusIcon className="size-4" />
									添加网站
								</Link>
							</Button>
						)}
					</div>
				</div>
			</CardHeader>
			<CardContent className="p-3 sm:p-4">
				{loading ? (
					<EmptyState loading loadingText="正在读取互联网服务监控" emptyText="暂无归属服务" className="min-h-32" />
				) : monitors.length ? (
					<div className="grid pulse-card-gap">
						{monitors.map((monitor) => (
							<SystemWebsiteMonitorRow
								key={monitor.id}
								monitor={monitor}
								checks={checksByMonitor.get(monitor.id) ?? []}
								running={runningId === monitor.id}
								onCheck={() => checkNow(monitor.id)}
							/>
						))}
					</div>
				) : (
					<EmptyState
						loading={false}
						loadingText="正在读取互联网服务监控"
						emptyText="暂无归属网站，从这里添加后会自动归属到当前机器。"
						className="min-h-32"
					>
						{!readOnly && (
							<Button asChild className="min-h-10 transition-transform active:scale-[0.96]">
								<Link href={addWebsitePath}>添加网站</Link>
							</Button>
						)}
					</EmptyState>
				)}
			</CardContent>
		</Card>
	)
}

function SystemWebsiteMonitorRow({
	monitor,
	checks,
	running,
	onCheck,
}: {
	monitor: WebsiteMonitorRecord
	checks: WebsiteMonitorCheckRecord[]
	running: boolean
	onCheck: () => void
}) {
	const { targets, latestLatency, targetCount, description } = getSystemWebsiteMonitorRowViewModel({ monitor, checks })

	return (
		<div className="grid gap-3 rounded-md border border-border/70 bg-card p-3 shadow-none md:grid-cols-[minmax(280px,0.9fr)_minmax(360px,1.15fr)_auto] md:items-center">
			<div className="flex min-w-0 items-center gap-3">
				<SiteIcon monitor={monitor} />
				<div className="grid min-w-0 gap-1">
					<div className="flex min-w-0 items-center gap-2">
						<div className="truncate font-semibold">{monitor.name}</div>
						<StatusBadge status={monitor.last_status} />
						{!monitor.enabled && <Badge variant="outline">暂停</Badge>}
					</div>
					<div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
						<span className="min-w-0 truncate">{description}</span>
						<span className="shrink-0">{targetCount} 个地址</span>
						<span className="shrink-0 tabular-nums">响应 {formatLatency(latestLatency)}</span>
					</div>
				</div>
			</div>
			<div className="min-w-0 rounded-md bg-surface-soft p-2">
				<TargetHistoryBars checks={checks} targets={targets} compact />
			</div>
			<Button
				type="button"
				variant="outline"
				className="min-h-10 shrink-0 gap-2 self-start px-3 text-xs transition-transform active:scale-[0.96] md:self-center"
				onClick={onCheck}
				disabled={running}
			>
				<RefreshCwIcon className={cn("size-3.5", running && "animate-spin")} />
				立即检测
			</Button>
		</div>
	)
}
