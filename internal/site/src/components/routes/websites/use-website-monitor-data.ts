import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "@/components/ui/use-toast"
import { isPocketBaseAutoCancel, pb } from "@/lib/api"
import type { SystemRecord, WebsiteMonitorCheckRecord, WebsiteMonitorRecord } from "@/types"
import { isMonitorStale } from "./format"
import { buildWebsiteSystemOptions } from "./list-utils"
import { getLatestChecksByTarget, monitorTargetsFromRecord } from "./target-utils"
import type { StatusFilter } from "./types"

type WebsiteMonitorCounts = Record<StatusFilter, number>
type WebsiteMonitorListResponse = {
	items: WebsiteMonitorRecord[]
	page: number
	perPage: number
	hasMore: boolean
	counts: WebsiteMonitorCounts
}

const defaultWebsiteMonitorCounts: WebsiteMonitorCounts = {
	all: 0,
	up: 0,
	down: 0,
	unknown: 0,
	stale: 0,
}

export function useWebsiteMonitorData(systemsById: Record<string, SystemRecord>) {
	const [monitors, setMonitors] = useState<WebsiteMonitorRecord[]>([])
	const [statusCounts, setStatusCounts] = useState<WebsiteMonitorCounts>(defaultWebsiteMonitorCounts)
	const [selectedChecks, setSelectedChecks] = useState<WebsiteMonitorCheckRecord[]>([])
	const [checksLoading, setChecksLoading] = useState(false)
	const [selectedId, setSelectedId] = useState("")
	const [loading, setLoading] = useState(true)
	const [search, setSearch] = useState("")
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
	const [systemFilter, setSystemFilter] = useState(
		() => new URLSearchParams(window.location.search).get("system") ?? ""
	)
	const [page, setPage] = useState(0)
	const [hasMore, setHasMore] = useState(false)
	const checksRequestId = useRef(0)
	const listRequestId = useRef(0)
	const reloadTimer = useRef<number | undefined>(undefined)
	const pageSize = 50

	const load = useCallback(
		async (options?: { silent?: boolean; pageIndex?: number }) => {
			const requestId = ++listRequestId.current
			const pageIndex = options?.pageIndex ?? page
			if (!options?.silent) {
				setLoading(true)
			}
			try {
				const params = new URLSearchParams({
					page: String(pageIndex + 1),
					perPage: String(pageSize),
				})
				const trimmedSearch = search.trim()
				if (trimmedSearch) {
					params.set("search", trimmedSearch)
				}
				if (statusFilter !== "all") {
					params.set("status", statusFilter)
				}
				if (systemFilter) {
					params.set("system", systemFilter)
				}
				const response = await pb.send<WebsiteMonitorListResponse>(`/api/pulse/website-monitors?${params.toString()}`, {
					requestKey: "website-monitors-list",
				})
				if (requestId !== listRequestId.current) {
					return
				}
				setMonitors(response.items)
				setStatusCounts({ ...defaultWebsiteMonitorCounts, ...response.counts })
				setHasMore(response.hasMore)
				setSelectedId((current) =>
					response.items.some((monitor) => monitor.id === current) ? current : response.items[0]?.id || ""
				)
			} catch (error) {
				if (isPocketBaseAutoCancel(error)) {
					return
				}
				console.error("load website monitors", error)
				toast({ title: "加载失败", description: "网站监控数据读取失败。", variant: "destructive" })
			} finally {
				if (requestId === listRequestId.current) {
					setLoading(false)
				}
			}
		},
		[page, pageSize, search, statusFilter, systemFilter]
	)

	useEffect(() => {
		load()
	}, [load])

	const availableSystemsById = systemsById
	const systems = useMemo(() => buildWebsiteSystemOptions(availableSystemsById), [availableSystemsById])
	const filteredMonitors = monitors
	const selected = filteredMonitors.find((item) => item.id === selectedId) ?? filteredMonitors[0]
	const selectedTargets = useMemo(() => (selected ? monitorTargetsFromRecord(selected) : []), [selected])
	const selectedLatestChecks = useMemo(() => getLatestChecksByTarget(selectedChecks), [selectedChecks])
	const selectedMonitorId = selected?.id ?? ""

	const loadSelectedChecks = useCallback(async (monitorId: string) => {
		const requestId = ++checksRequestId.current
		if (!monitorId) {
			setSelectedChecks([])
			setChecksLoading(false)
			return
		}
		setChecksLoading(true)
		try {
			const records = await pb.collection<WebsiteMonitorCheckRecord>("website_monitor_checks").getList(1, 200, {
				filter: pb.filter("monitor = {:monitor}", { monitor: monitorId }),
				sort: "-created",
				requestKey: `website-monitor-checks-${monitorId}`,
			})
			if (requestId === checksRequestId.current) {
				setSelectedChecks(records.items)
			}
		} catch (error) {
			console.error("load website monitor checks", error)
			if (requestId === checksRequestId.current) {
				toast({ title: "加载检测历史失败", description: "当前网站的检测历史读取失败。", variant: "destructive" })
			}
		} finally {
			if (requestId === checksRequestId.current) {
				setChecksLoading(false)
			}
		}
	}, [])

	const refreshMonitor = useCallback(
		async (monitorId: string) => {
			if (!monitorId) {
				return
			}
			const record = await pb.collection<WebsiteMonitorRecord>("website_monitors").getOne(monitorId, {
				requestKey: `website-monitor-${monitorId}`,
			})
			const previous = monitors.find((monitor) => monitor.id === monitorId)
			if (previous) {
				setStatusCounts((counts) => updateWebsiteMonitorCounts(counts, previous, record))
			}
			setMonitors((current) =>
				monitorMatchesStatusFilter(record, statusFilter)
					? current.map((monitor) => (monitor.id === monitorId ? record : monitor))
					: current.filter((monitor) => monitor.id !== monitorId)
			)
			return record
		},
		[monitors, statusFilter]
	)

	useEffect(() => {
		let unsubscribeMonitors: (() => void) | undefined
		function scheduleReload() {
			if (reloadTimer.current) {
				window.clearTimeout(reloadTimer.current)
			}
			reloadTimer.current = window.setTimeout(() => {
				load({ silent: true })
			}, 500)
		}
		pb.collection<WebsiteMonitorRecord>("website_monitors")
			.subscribe("*", (event) => {
				const monitorId = event.record?.id
				if (event.action === "update" && monitorId) {
					refreshMonitor(monitorId).catch(scheduleReload)
					return
				}
				scheduleReload()
			})
			.then((unsubscribe) => {
				unsubscribeMonitors = unsubscribe
			})
			.catch(() => undefined)
		return () => {
			if (reloadTimer.current) {
				window.clearTimeout(reloadTimer.current)
			}
			unsubscribeMonitors?.()
		}
	}, [load, refreshMonitor])

	const setSearchWithReset = useCallback((value: string) => {
		setSearch(value)
		setPage(0)
	}, [])

	const setStatusFilterWithReset = useCallback((value: StatusFilter) => {
		setStatusFilter(value)
		setPage(0)
	}, [])

	const setSystemFilterWithReset = useCallback((value: string) => {
		setSystemFilter(value)
		setPage(0)
	}, [])

	useEffect(() => {
		loadSelectedChecks(selectedMonitorId)
	}, [loadSelectedChecks, selectedMonitorId])

	useEffect(() => {
		if (!selectedMonitorId) {
			return
		}
		let unsubscribeChecks: (() => void) | undefined
		pb.collection<WebsiteMonitorCheckRecord>("website_monitor_checks")
			.subscribe(
				"*",
				(event) => {
					const monitorId = event.record?.monitor
					if (monitorId === selectedMonitorId) {
						loadSelectedChecks(selectedMonitorId)
					}
				},
				{ filter: pb.filter("monitor = {:monitor}", { monitor: selectedMonitorId }) }
			)
			.then((unsubscribe) => {
				unsubscribeChecks = unsubscribe
			})
			.catch(() => undefined)
		return () => {
			unsubscribeChecks?.()
		}
	}, [loadSelectedChecks, selectedMonitorId])

	return {
		monitors,
		statusCounts,
		availableSystemsById,
		systems,
		filteredMonitors,
		selected,
		selectedChecks,
		checksLoading,
		loadSelectedChecks,
		refreshMonitor,
		selectedTargets,
		selectedLatestChecks,
		selectedId,
		setSelectedId,
		loading,
		load,
		search,
		setSearch: setSearchWithReset,
		statusFilter,
		setStatusFilter: setStatusFilterWithReset,
		systemFilter,
		setSystemFilter: setSystemFilterWithReset,
		page,
		pageSize,
		hasMore,
		setPage,
	}
}

function websiteMonitorStatusKey(monitor: WebsiteMonitorRecord): Exclude<StatusFilter, "all" | "stale"> {
	return monitor.last_status === "up" || monitor.last_status === "down" ? monitor.last_status : "unknown"
}

function monitorMatchesStatusFilter(monitor: WebsiteMonitorRecord, statusFilter: StatusFilter) {
	if (statusFilter === "all") {
		return true
	}
	if (statusFilter === "stale") {
		return isMonitorStale(monitor)
	}
	return websiteMonitorStatusKey(monitor) === statusFilter
}

function updateWebsiteMonitorCounts(
	counts: WebsiteMonitorCounts,
	previous: WebsiteMonitorRecord,
	next: WebsiteMonitorRecord
): WebsiteMonitorCounts {
	const previousStatus = websiteMonitorStatusKey(previous)
	const nextStatus = websiteMonitorStatusKey(next)
	const updated = { ...counts }
	if (previousStatus !== nextStatus) {
		updated[previousStatus] = Math.max(0, updated[previousStatus] - 1)
		updated[nextStatus] += 1
	}
	const previousStale = isMonitorStale(previous)
	const nextStale = isMonitorStale(next)
	if (previousStale !== nextStale) {
		updated.stale = Math.max(0, updated.stale + (nextStale ? 1 : -1))
	}
	return updated
}
