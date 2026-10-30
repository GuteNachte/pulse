import { useStore } from "@nanostores/react"
import { PlayIcon, PlusIcon, RefreshCwIcon, RotateCwIcon, SearchIcon, SquareIcon, Trash2Icon } from "lucide-react"
import type { RecordModel } from "pocketbase"
import { useEffect, useMemo, useState } from "react"
import { OperationConfirmDialog as SharedOperationConfirmDialog } from "@/components/operation-confirm-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { toast } from "@/components/ui/use-toast"
import { pb } from "@/lib/api"
import { EmptyState, TableEmptyRow } from "@/components/ui/empty-state"
import {
	formatOperationResponseMessage,
	getOperationErrorMessage,
	getOperationResponseFromError,
	OperationToastAction,
	type OperationApiResponse,
} from "@/lib/operation-feedback"
import { $allSystemsById } from "@/lib/stores"
import { cn, hourWithSeconds } from "@/lib/utils"
import type { MonitoredServiceRecord } from "@/types"

type Platform = "windows" | "linux" | "darwin" | "android"
type ServiceAction = "start_monitored_service" | "stop_monitored_service" | "restart_monitored_service"
export type MonitorKind = "software" | "service"

interface ServiceRule extends RecordModel {
	system: string
	platform: Platform
	name: string
	enabled: boolean
	note?: string
}

interface SoftwareRule extends RecordModel {
	system: string
	platform: Platform
	name: string
	display_name?: string
	enabled: boolean
}

interface MonitoredSoftwareRecord extends RecordModel {
	system: string
	platform: Platform
	name: string
	display_name?: string
	state: number
	updated: number
}

interface SearchCandidate {
	name: string
	displayName?: string
	platform: Platform
	state: number
}

type SystemLite = {
	name?: string
	host?: string
	status?: string
	info?: {
		os?: number
		cap?: {
			platform?: string
			collection?: string[]
			operations?: string[]
			run_mode?: string
			agent_profile?: string
			unsupported_reasons?: Record<string, string>
		}
	}
}

type PendingOperation = { kind: "service"; name: string; system: string; action: ServiceAction }

type SoftwareRow = {
	system: string
	platform: Platform
	name: string
	display_name: string
	state: number
	updated: number
	ruleId: string
}

type ServiceRow = SoftwareRow & {
	start_type: string
}

type RemoveTarget = { kind: "service"; id: string; name: string } | { kind: "software"; id: string; name: string }

type MonitoredServicesTableProps = {
	systemId?: string
	embedded?: boolean
	onlyConfigured?: boolean
	allowedKinds?: MonitorKind[]
}

const runningState = 1
const stoppedState = 2
const defaultMonitorKinds: MonitorKind[] = ["software", "service"]

export default function MonitoredServicesTable({
	systemId,
	embedded = true,
	allowedKinds = defaultMonitorKinds,
}: MonitoredServicesTableProps) {
	const systemsById = useStore($allSystemsById) as Record<string, SystemLite>
	const visibleKinds = allowedKinds.length ? allowedKinds : defaultMonitorKinds
	const [selectedSystemId, setSelectedSystemId] = useState(systemId ?? "")
	const [serviceData, setServiceData] = useState<MonitoredServiceRecord[]>([])
	const [softwareData, setSoftwareData] = useState<MonitoredSoftwareRecord[]>([])
	const [serviceRules, setServiceRules] = useState<ServiceRule[]>([])
	const [softwareRules, setSoftwareRules] = useState<SoftwareRule[]>([])
	const [filter, setFilter] = useState("")
	const [addDialog, setAddDialog] = useState<MonitorKind | null>(null)
	const [pendingOperation, setPendingOperation] = useState<PendingOperation | null>(null)
	const [runningOperationKey, setRunningOperationKey] = useState("")
	const [removeTarget, setRemoveTarget] = useState<RemoveTarget | null>(null)

	const fetchData = async () => {
		const scopedFilter = systemId ? pb.filter("system={:system}", { system: systemId }) : ""
		const [servicesResult, softwareResult, serviceRulesResult, softwareRulesResult] = await Promise.all([
			pb.collection<MonitoredServiceRecord>("monitored_services").getList(1, 2000, {
				filter: scopedFilter,
				sort: systemId ? "name" : "system,name",
			}),
			pb.collection<MonitoredSoftwareRecord>("monitored_software").getList(1, 2000, {
				filter: scopedFilter,
				sort: systemId ? "name" : "system,name",
			}),
			pb.collection<ServiceRule>("service_control_rules").getFullList({
				filter: scopedFilter,
				sort: systemId ? "name" : "system,name",
			}),
			pb.collection<SoftwareRule>("software_monitor_rules").getFullList({
				filter: scopedFilter,
				sort: systemId ? "name" : "system,name",
			}),
		])
		setServiceData(servicesResult.items)
		setSoftwareData(softwareResult.items)
		setServiceRules(serviceRulesResult)
		setSoftwareRules(softwareRulesResult)
	}

	useEffect(() => {
		let cancelled = false
		async function load() {
			try {
				await fetchData()
			} catch (error) {
				if (!cancelled) console.error(error)
			}
		}
		load()
		const interval = window.setInterval(load, 30_000)
		return () => {
			cancelled = true
			window.clearInterval(interval)
		}
	}, [systemId])

	const systemIds = useMemo(() => {
		const ids = systemId ? [systemId] : Object.keys(systemsById)
		return ids.sort((a, b) => (systemsById[a]?.name ?? a).localeCompare(systemsById[b]?.name ?? b))
	}, [systemId, systemsById])

	const systemMonitorKinds = useMemo(() => {
		const entries = systemIds.map((id) => [id, getSupportedMonitorKinds(systemsById[id], visibleKinds)] as const)
		return new Map(entries)
	}, [systemIds, systemsById, visibleKinds])
	const selectedKinds = selectedSystemId ? (systemMonitorKinds.get(selectedSystemId) ?? []) : []

	const serviceRows = useMemo(() => {
		const dataByKey = new Map(serviceData.map((item) => [monitorKey(item.system, item.platform, item.name), item]))
		return serviceRules
			.filter((rule) => rule.enabled && isKindSupported(systemMonitorKinds, rule.system, "service"))
			.map((rule) => {
				const existing = dataByKey.get(monitorKey(rule.system, rule.platform, rule.name))
				return {
					system: rule.system,
					platform: rule.platform,
					name: rule.name,
					display_name: existing?.display_name || rule.note || "",
					state: existing?.state ?? 0,
					start_type: existing?.start_type ?? "",
					updated: existing?.updated ?? 0,
					ruleId: rule.id,
				}
			})
	}, [serviceData, serviceRules, systemMonitorKinds])

	const softwareRows = useMemo(() => {
		const dataByKey = new Map(softwareData.map((item) => [monitorKey(item.system, item.platform, item.name), item]))
		return softwareRules
			.filter((rule) => rule.enabled && isKindSupported(systemMonitorKinds, rule.system, "software"))
			.map((rule) => {
				const existing = dataByKey.get(monitorKey(rule.system, rule.platform, rule.name))
				return {
					system: rule.system,
					platform: rule.platform,
					name: rule.name,
					display_name: existing?.display_name || rule.display_name || "",
					state: existing?.state ?? 0,
					updated: existing?.updated ?? 0,
					ruleId: rule.id,
				}
			})
	}, [softwareData, softwareRules, systemMonitorKinds])

	const systemCards = useMemo(() => {
		const ids = new Set<string>()
		if (systemId) ids.add(systemId)
		for (const row of [
			...(visibleKinds.includes("software") ? softwareRows : []),
			...(visibleKinds.includes("service") ? serviceRows : []),
		]) {
			ids.add(row.system)
		}

		return Array.from(ids)
			.sort((a, b) => (systemsById[a]?.name ?? a).localeCompare(systemsById[b]?.name ?? b))
			.map((id) => {
				const supportedKinds = systemMonitorKinds.get(id) ?? []
				const softwareCount = supportedKinds.includes("software")
					? softwareRows.filter((row) => row.system === id).length
					: 0
				const serviceCount = supportedKinds.includes("service")
					? serviceRows.filter((row) => row.system === id).length
					: 0
				const softwareIssues = supportedKinds.includes("software")
					? softwareRows.filter((row) => row.system === id && row.state !== runningState).length
					: 0
				const serviceIssues = supportedKinds.includes("service")
					? serviceRows.filter((row) => row.system === id && row.state !== runningState).length
					: 0
				const total = softwareCount + serviceCount
				const issues = softwareIssues + serviceIssues
				return { id, softwareCount, serviceCount, total, issues, supportedKinds }
			})
	}, [serviceRows, softwareRows, systemId, systemMonitorKinds, systemsById, visibleKinds])

	useEffect(() => {
		if (systemId && selectedSystemId !== systemId) {
			setSelectedSystemId(systemId)
			return
		}
		if (!systemId && (!selectedSystemId || !systemCards.some((card) => card.id === selectedSystemId))) {
			setSelectedSystemId(systemCards[0]?.id ?? "")
		}
	}, [selectedSystemId, systemCards, systemId])

	const selectedSoftwareRows = useMemo(
		() => filterRowsBySystem(softwareRows, filter, selectedSystemId, systemsById),
		[filter, selectedSystemId, softwareRows, systemsById]
	)
	const selectedServiceRows = useMemo(
		() => filterRowsBySystem(serviceRows, filter, selectedSystemId, systemsById),
		[filter, selectedSystemId, serviceRows, systemsById]
	)
	const hasRows =
		(visibleKinds.includes("service") ? serviceRows.length : 0) +
			(visibleKinds.includes("software") ? softwareRows.length : 0) >
		0
	if (embedded && !hasRows && !systemId) {
		return null
	}

	return (
		<Card className="@container w-full overflow-hidden border-border/70 bg-surface-soft shadow-none">
			<CardHeader className="border-b border-border/70 bg-card px-4 py-4 sm:px-5">
				<div className="grid gap-3 md:flex md:items-end">
					<div className="min-w-0">
						<CardTitle className="mb-2">软件与服务监控</CardTitle>
						<div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
							{hasAnyKind(systemMonitorKinds, "software") && <span>软件 {softwareRows.length}</span>}
							{hasAnyKind(systemMonitorKinds, "service") && <span>服务 {serviceRows.length}</span>}
						</div>
					</div>
					<div className="ms-auto flex w-full flex-col gap-2 sm:flex-row md:w-auto">
						<div className="relative w-full md:w-80">
							<SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								placeholder="过滤名称、设备或状态"
								value={filter}
								onChange={(event) => setFilter(event.target.value)}
								className="bg-card pl-9 shadow-none"
							/>
						</div>
					</div>
				</div>
			</CardHeader>

			<div className="grid gap-4 p-3 sm:p-4">
				{!systemId && (
					<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
						{systemCards.map((card) => (
							<button
								key={card.id}
								type="button"
								className={cn(
									"rounded-md border border-border/70 bg-card p-3 text-left transition-[background-color,border-color,transform] duration-150 ease-out hover:border-foreground/15 hover:bg-surface-soft active:scale-[0.96]",
									selectedSystemId === card.id && "border-foreground/20 bg-card ring-1 ring-foreground/10"
								)}
								onClick={() => setSelectedSystemId(card.id)}
							>
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<div className="truncate font-medium">{systemsById[card.id]?.name || card.id}</div>
										<div className="mt-1 text-sm text-muted-foreground">监控项 {card.total} 项</div>
									</div>
									<Badge variant={card.issues ? "destructive" : "outline"}>
										{card.issues ? `异常 ${card.issues}` : "正常"}
									</Badge>
								</div>
								<div
									className="mt-3 grid gap-2 text-sm"
									style={{
										gridTemplateColumns: `repeat(${Math.max(card.supportedKinds.length, 1)}, minmax(0, 1fr))`,
									}}
								>
									{card.supportedKinds.includes("software") && <MonitorCount label="软件" value={card.softwareCount} />}
									{card.supportedKinds.includes("service") && <MonitorCount label="服务" value={card.serviceCount} />}
								</div>
							</button>
						))}
					</div>
				)}

				<div
					className={cn(
						"flex flex-col gap-2 rounded-md border border-border/70 bg-card px-3 py-2.5 sm:flex-row sm:items-center",
						systemId ? "sm:justify-end" : "sm:justify-between"
					)}
				>
					{!systemId && (
						<div className="text-sm text-muted-foreground">
							{selectedSystemId ? `当前设备：${systemsById[selectedSystemId]?.name || selectedSystemId}` : "暂无设备"}
						</div>
					)}
					<div className="flex flex-col gap-2 sm:flex-row">
						{selectedKinds.includes("software") && (
							<Button
								type="button"
								variant="outline"
								className="w-full bg-card sm:w-auto"
								disabled={!selectedSystemId}
								onClick={() => setAddDialog("software")}
							>
								<PlusIcon className="me-2 size-4" />
								添加软件
							</Button>
						)}
						{selectedKinds.includes("service") && (
							<Button
								type="button"
								variant="outline"
								className="w-full bg-card sm:w-auto"
								disabled={!selectedSystemId}
								onClick={() => setAddDialog("service")}
							>
								<PlusIcon className="me-2 size-4" />
								添加服务
							</Button>
						)}
					</div>
				</div>

				<div className="grid min-w-0 gap-4 xl:grid-cols-2">
					{selectedKinds.includes("software") && (
						<MonitorSection title="软件" count={selectedSoftwareRows.length}>
							<SoftwareTable
								rows={selectedSoftwareRows}
								systemId={selectedSystemId || systemId}
								systemsById={systemsById}
								onRemove={(row) => setRemoveTarget({ kind: "software", id: row.ruleId, name: row.name })}
							/>
						</MonitorSection>
					)}
					{selectedKinds.includes("service") && (
						<MonitorSection title="服务" count={selectedServiceRows.length}>
							<ServiceTable
								rows={selectedServiceRows}
								systemId={selectedSystemId || systemId}
								systemsById={systemsById}
								runningKey={runningOperationKey}
								onOperate={(row, action) =>
									setPendingOperation({ kind: "service", name: row.name, system: row.system, action })
								}
								onRemove={(row) => setRemoveTarget({ kind: "service", id: row.ruleId, name: row.name })}
							/>
						</MonitorSection>
					)}
				</div>
			</div>

			<AddMonitorDialog
				kind={addDialog}
				onOpenChange={(open) => !open && setAddDialog(null)}
				systemIds={systemIds}
				systemsById={systemsById}
				serviceRules={serviceRules}
				softwareRules={softwareRules}
				systemMonitorKinds={systemMonitorKinds}
				onAdded={async () => {
					setAddDialog(null)
					await fetchData()
				}}
			/>
			<ServiceOperationConfirmDialog
				pendingOperation={pendingOperation}
				runningKey={runningOperationKey}
				onCancel={() => setPendingOperation(null)}
				onConfirm={async () => {
					if (!pendingOperation) return
					const operation = pendingOperation
					const target = operation.name
					const key = `${operation.system}:${target}:${operation.action}`
					setRunningOperationKey(key)
					try {
						const response = await pb.send<OperationApiResponse>("/api/pulse/operations", {
							method: "POST",
							body: {
								system: operation.system,
								action: operation.action,
								target,
								confirm: true,
							},
						})
						if (response.status === "succeeded") {
							toast({
								title: "操作成功",
								description: response.message || operation.name,
								action: <OperationToastAction systemId={operation.system} />,
							})
							await fetchData()
						} else {
							toast({
								title: "操作失败",
								description: formatOperationResponseMessage(response, operation.name),
								variant: "destructive",
								action: <OperationToastAction systemId={operation.system} />,
							})
						}
					} catch (error) {
						const response = getOperationResponseFromError(error)
						toast({
							title: "操作失败",
							description: getOperationErrorMessage(error, "请确认当前用户有权限，并且 Agent 在线。"),
							variant: "destructive",
							action: response?.id ? <OperationToastAction systemId={operation.system} /> : undefined,
						})
					} finally {
						setRunningOperationKey("")
						setPendingOperation(null)
					}
				}}
			/>
			<RemoveConfirmDialog
				target={removeTarget}
				onCancel={() => setRemoveTarget(null)}
				onConfirm={async () => {
					if (!removeTarget) return
					try {
						await deleteMonitorRule(removeTarget.kind, removeTarget.id)
						toast({ title: "已移除监控项", description: removeTarget.name })
						await fetchData()
					} catch (error) {
						toast({ title: "移除失败", description: errorMessage(error), variant: "destructive" })
					} finally {
						setRemoveTarget(null)
					}
				}}
			/>
		</Card>
	)
}

function SoftwareTable({
	rows,
	systemId,
	systemsById,
	onRemove,
}: {
	rows: SoftwareRow[]
	systemId?: string
	systemsById: Record<string, SystemLite>
	onRemove: (row: SoftwareRow) => void
}) {
	return (
		<MonitorTable emptyText="还没有添加软件监控">
			<TableHeader>
				<TableRow>
					{!systemId && <TableHead>设备</TableHead>}
					<TableHead>软件</TableHead>
					<TableHead>匹配进程</TableHead>
					<TableHead>状态</TableHead>
					<TableHead>更新</TableHead>
					<TableHead className="w-10"></TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.length ? (
					rows.map((row) => (
						<TableRow key={row.ruleId}>
							{!systemId && <TableCell>{systemsById[row.system]?.name || row.system}</TableCell>}
							<TableCell className="font-medium">{row.name}</TableCell>
							<TableCell className="max-w-72 truncate text-muted-foreground">
								{row.display_name || "未匹配到运行进程"}
							</TableCell>
							<TableCell>
								<StateBadge state={row.state} />
							</TableCell>
							<TableCell>{formatUpdated(row.updated)}</TableCell>
							<TableCell className="w-10">
								<RemoveButton onClick={() => onRemove(row)} />
							</TableCell>
						</TableRow>
					))
				) : (
					<EmptyRow colSpan={systemId ? 5 : 6} text="还没有添加软件监控" />
				)}
			</TableBody>
		</MonitorTable>
	)
}

function ServiceTable({
	rows,
	systemId,
	systemsById,
	runningKey,
	onOperate,
	onRemove,
}: {
	rows: ServiceRow[]
	systemId?: string
	systemsById: Record<string, SystemLite>
	runningKey: string
	onOperate: (row: ServiceRow, action: ServiceAction) => void
	onRemove: (row: ServiceRow) => void
}) {
	return (
		<MonitorTable emptyText="还没有添加服务监控">
			<TableHeader>
				<TableRow>
					{!systemId && <TableHead>设备</TableHead>}
					<TableHead>服务</TableHead>
					<TableHead>显示名称</TableHead>
					<TableHead>状态</TableHead>
					<TableHead>启动类型</TableHead>
					<TableHead>操作</TableHead>
					<TableHead>更新</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.length ? (
					rows.map((row) => {
						const running = row.state === runningState
						const keyPrefix = `${row.system}:${row.name}:`
						return (
							<TableRow key={row.ruleId}>
								{!systemId && <TableCell>{systemsById[row.system]?.name || row.system}</TableCell>}
								<TableCell className="font-medium">{row.name}</TableCell>
								<TableCell className="max-w-72 truncate text-muted-foreground">{row.display_name || "-"}</TableCell>
								<TableCell>
									<StateBadge state={row.state} />
								</TableCell>
								<TableCell className="text-muted-foreground">{row.start_type || "-"}</TableCell>
								<TableCell>
									<ActionButtons
										actions={[
											{ action: "start_monitored_service", label: "启动", icon: PlayIcon, disabled: running },
											{ action: "stop_monitored_service", label: "停止", icon: SquareIcon, disabled: !running },
											{ action: "restart_monitored_service", label: "重启", icon: RotateCwIcon, disabled: !running },
										]}
										runningKey={runningKey}
										keyPrefix={keyPrefix}
										onAction={(action) => onOperate(row, action as ServiceAction)}
									/>
								</TableCell>
								<TableCell>{formatUpdated(row.updated)}</TableCell>
								<TableCell className="w-10">
									<RemoveButton onClick={() => onRemove(row)} />
								</TableCell>
							</TableRow>
						)
					})
				) : (
					<EmptyRow colSpan={systemId ? 7 : 8} text="还没有添加服务监控" />
				)}
			</TableBody>
		</MonitorTable>
	)
}

function AddMonitorDialog({
	kind,
	onOpenChange,
	systemIds,
	systemsById,
	serviceRules,
	softwareRules,
	systemMonitorKinds,
	onAdded,
}: {
	kind: MonitorKind | null
	onOpenChange: (open: boolean) => void
	systemIds: string[]
	systemsById: Record<string, SystemLite>
	serviceRules: ServiceRule[]
	softwareRules: SoftwareRule[]
	systemMonitorKinds: Map<string, MonitorKind[]>
	onAdded: () => Promise<void>
}) {
	const [selectedSystemId, setSelectedSystemId] = useState("")
	const [query, setQuery] = useState("")
	const [searching, setSearching] = useState(false)
	const [candidates, setCandidates] = useState<SearchCandidate[]>([])
	const [selectedCandidate, setSelectedCandidate] = useState<SearchCandidate | null>(null)
	const open = kind !== null
	const selectableSystemIds = useMemo(
		() => (kind ? systemIds.filter((id) => isKindSupported(systemMonitorKinds, id, kind)) : systemIds),
		[kind, systemIds, systemMonitorKinds]
	)

	useEffect(() => {
		if (!open) {
			setQuery("")
			setCandidates([])
			setSelectedCandidate(null)
			return
		}
		if (!selectedSystemId || !selectableSystemIds.includes(selectedSystemId)) {
			setSelectedSystemId(selectableSystemIds[0] || "")
		}
	}, [open, selectableSystemIds, selectedSystemId])

	useEffect(() => {
		setCandidates([])
		setSelectedCandidate(null)
	}, [kind, selectedSystemId])

	const search = async () => {
		if (!kind || !selectedSystemId || query.trim().length < 2) return
		if (!isKindSupported(systemMonitorKinds, selectedSystemId, kind)) {
			toast({
				title: "当前设备不支持该监控类型",
				description: `${systemsById[selectedSystemId]?.name || selectedSystemId} 不支持${kindLabel(kind)}监控。`,
				variant: "destructive",
			})
			return
		}
		setSearching(true)
		try {
			const endpoint = kind === "software" ? "/api/pulse/software/search" : "/api/pulse/services/search"
			const result = await pb.send<{ software?: SearchCandidate[]; services?: SearchCandidate[] }>(endpoint, {
				query: { system: selectedSystemId, q: query.trim() },
			})
			const items = kind === "software" ? result.software || [] : result.services || []
			setCandidates(items)
		} catch (error) {
			toast({ title: "搜索失败", description: errorMessage(error), variant: "destructive" })
		} finally {
			setSearching(false)
		}
	}

	const selectCandidate = (candidate: SearchCandidate) => {
		setSelectedCandidate(candidate)
	}

	const add = async () => {
		if (!kind || !selectedSystemId || !selectedCandidate) return
		if (!isKindSupported(systemMonitorKinds, selectedSystemId, kind)) {
			toast({
				title: "当前设备不支持该监控类型",
				description: `${systemsById[selectedSystemId]?.name || selectedSystemId} 不支持${kindLabel(kind)}监控。`,
				variant: "destructive",
			})
			return
		}
		try {
			if (kind === "software") {
				if (softwareRules.some((rule) => rule.system === selectedSystemId && rule.name === selectedCandidate.name)) {
					toast({ title: "软件已添加", description: selectedCandidate.name })
					return
				}
				await saveMonitorRule("software", {
					system: selectedSystemId,
					platform: selectedCandidate.platform || getSystemPlatform(systemsById[selectedSystemId]),
					name: selectedCandidate.name,
					display_name: selectedCandidate.displayName || "",
					enabled: true,
				})
			} else if (kind === "service") {
				if (serviceRules.some((rule) => rule.system === selectedSystemId && rule.name === selectedCandidate.name)) {
					toast({ title: "服务已添加", description: selectedCandidate.name })
					return
				}
				await saveMonitorRule("service", {
					system: selectedSystemId,
					platform: selectedCandidate.platform || getSystemPlatform(systemsById[selectedSystemId]),
					name: selectedCandidate.name,
					enabled: true,
					note: selectedCandidate.displayName || "",
				})
			}
			toast({ title: `已添加${kindLabel(kind)}`, description: selectedCandidate.displayName || selectedCandidate.name })
			await onAdded()
		} catch (error) {
			toast({ title: "添加失败", description: errorMessage(error), variant: "destructive" })
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-3xl">
				<DialogHeader>
					<DialogTitle>添加{kind ? kindLabel(kind) : ""}</DialogTitle>
					<DialogDescription>选择设备后输入关键词，从 Agent 返回的候选项里添加。</DialogDescription>
				</DialogHeader>
				<div className="grid gap-3 sm:grid-cols-[220px_minmax(0,1fr)_auto]">
					<Select value={selectedSystemId} onValueChange={setSelectedSystemId} disabled={!selectableSystemIds.length}>
						<SelectTrigger>
							<SelectValue placeholder="选择设备" />
						</SelectTrigger>
						<SelectContent>
							{selectableSystemIds.map((id) => (
								<SelectItem key={id} value={id}>
									{systemsById[id]?.name || id}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault()
								search().catch(console.error)
							}
						}}
						placeholder={kind === "service" ? "搜索服务名称" : "搜索软件名称"}
					/>
					<Button
						type="button"
						onClick={() => search().catch(console.error)}
						disabled={!selectedSystemId || query.trim().length < 2 || searching}
					>
						<SearchIcon className="me-2 size-4" />
						{searching ? "搜索中" : "搜索"}
					</Button>
				</div>
				<div className="grid max-h-[42vh] gap-2 overflow-auto rounded-md border p-2">
					{candidates.length ? (
						candidates.map((candidate) => (
							<button
								key={`${candidate.platform}:${candidate.name}:${candidate.displayName}`}
								type="button"
								className={cn(
									"rounded-md border border-border/70 bg-card p-3 text-left text-sm hover:bg-surface-soft",
									selectedCandidate?.name === candidate.name &&
										"border-primary/70 bg-surface-soft ring-1 ring-primary/20"
								)}
								onClick={() => selectCandidate(candidate)}
							>
								<div className="flex items-center justify-between gap-3">
									<div className="min-w-0">
										<div className="truncate font-medium">{candidate.name}</div>
										<div className="mt-1 truncate text-muted-foreground">{candidate.displayName || "-"}</div>
									</div>
									<StateBadge state={candidate.state} />
								</div>
							</button>
						))
					) : (
						<EmptyState
							loading={searching}
							loadingText="正在搜索候选项"
							emptyText={query.trim().length >= 2 ? "没有匹配候选项" : "输入关键词后搜索"}
							className="min-h-28 border-border/70 bg-surface-soft"
						/>
					)}
				</div>
				<div className="flex justify-end">
					<Button type="button" onClick={() => add().catch(console.error)} disabled={!selectedCandidate}>
						添加
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	)
}

function ServiceOperationConfirmDialog({
	pendingOperation,
	runningKey,
	onCancel,
	onConfirm,
}: {
	pendingOperation: PendingOperation | null
	runningKey: string
	onCancel: () => void
	onConfirm: () => void
}) {
	const isRunning = runningKey !== ""
	const label = pendingOperation ? operationLabel(pendingOperation.action) : ""
	return (
		<SharedOperationConfirmDialog
			open={Boolean(pendingOperation)}
			onOpenChange={(open) => !open && onCancel()}
			title={`确认${label}`}
			description={pendingOperation ? `${label} ${pendingOperation.name}，操作会立即发送到在线 Agent。` : ""}
			confirmLabel={`确认${label}`}
			running={isRunning}
			progressTitle={`正在${label}服务`}
			progressDescription="请求已写入操作链路，正在等待 Windows 服务控制结果。"
			onConfirm={onConfirm}
		>
			{pendingOperation && (
				<div className="grid gap-1.5 text-sm">
					<div className="font-medium">{pendingOperation.name}</div>
					<div className="mt-1 text-muted-foreground">{pendingOperation.system}</div>
				</div>
			)}
		</SharedOperationConfirmDialog>
	)
}

function RemoveConfirmDialog({
	target,
	onCancel,
	onConfirm,
}: {
	target: RemoveTarget | null
	onCancel: () => void
	onConfirm: () => void
}) {
	const description = target ? `移除 ${target.name} 后，它不会继续出现在软件与服务监控里。` : ""
	return (
		<SharedOperationConfirmDialog
			open={Boolean(target)}
			onOpenChange={(open) => !open && onCancel()}
			title="确认移除"
			description={description}
			confirmLabel="确认移除"
			confirmVariant="destructive"
			onConfirm={onConfirm}
		/>
	)
}

function MonitorSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
	return (
		<div className="grid gap-2">
			<div className="flex items-center justify-between px-1.5">
				<div className="font-medium">{title}</div>
				<Badge variant="outline">{count} 项</Badge>
			</div>
			{children}
		</div>
	)
}

function MonitorCount({ label, value }: { label: string; value: number }) {
	return (
		<div className="rounded-md border border-border/70 bg-surface-soft px-2 py-1.5">
			<div className="text-muted-foreground">{label}</div>
			<div className="mt-0.5 font-medium text-foreground">{value}</div>
		</div>
	)
}

function MonitorTable({ children }: { children: React.ReactNode; emptyText: string }) {
	return (
		<div className="max-h-[32rem] overflow-auto rounded-md border border-border/70 bg-card">
			<table className="w-full text-nowrap text-sm">{children}</table>
		</div>
	)
}

function ActionButtons({
	actions,
	runningKey,
	keyPrefix,
	onAction,
}: {
	actions: { action: string; label: string; icon: React.ElementType; disabled: boolean; reason?: string }[]
	runningKey: string
	keyPrefix: string
	onAction: (action: string) => void
}) {
	return (
		<div className="flex items-center gap-1.5">
			{actions.map(({ action, label, icon: Icon, disabled, reason }) => {
				const isRunning = runningKey === `${keyPrefix}${action}`
				const isDisabled = disabled || isRunning || Boolean(reason)
				return (
					<Tooltip key={action}>
						<TooltipTrigger asChild>
							<span className="inline-flex">
								<Button
									type="button"
									size="icon"
									variant="outline"
									className={cn("size-10", isDisabled && "opacity-45")}
									disabled={isDisabled}
									aria-label={label}
									onClick={() => onAction(action)}
								>
									{isRunning ? <RefreshCwIcon className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />}
								</Button>
							</span>
						</TooltipTrigger>
						<TooltipContent>{reason || (disabled ? "当前状态下不需要执行该操作" : label)}</TooltipContent>
					</Tooltip>
				)
			})}
		</div>
	)
}

function RemoveButton({ onClick }: { onClick: () => void }) {
	return (
		<Button
			type="button"
			size="icon"
			variant="ghost"
			className="size-10 text-muted-foreground hover:text-destructive"
			onClick={onClick}
		>
			<Trash2Icon className="size-4" />
		</Button>
	)
}

function StateBadge({ state }: { state: number }) {
	return (
		<Badge variant="outline" className="dark:border-white/12">
			<span className={cn("me-1.5 size-2 rounded-full", stateColor(state))} />
			{stateLabel(state)}
		</Badge>
	)
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
	return <TableEmptyRow colSpan={colSpan} loading={false} loadingText="正在读取监控项" emptyText={text} />
}

function filterRowsBySystem<T extends { system: string; name: string; display_name?: string; status?: string }>(
	rows: T[],
	filter: string,
	selectedSystemId: string,
	systemsById: Record<string, SystemLite>
) {
	const search = filter.trim().toLowerCase()
	return rows.filter((row) => {
		if (selectedSystemId && row.system !== selectedSystemId) return false
		if (!search) return true
		const systemName = systemsById[row.system]?.name ?? ""
		return `${systemName} ${row.name} ${row.display_name ?? ""} ${row.status ?? ""}`.toLowerCase().includes(search)
	})
}

function kindLabel(kind: MonitorKind) {
	switch (kind) {
		case "software":
			return "软件"
		case "service":
			return "服务"
	}
}

function operationLabel(action: string) {
	if (action.startsWith("start_")) return "启动"
	if (action.startsWith("stop_")) return "停止"
	if (action.startsWith("restart_")) return "重启"
	return "操作"
}

function stateLabel(state: number) {
	switch (state) {
		case runningState:
			return "运行中"
		case stoppedState:
			return "未运行"
		default:
			return "未知"
	}
}

function stateColor(state: number) {
	switch (state) {
		case runningState:
			return "bg-green-500"
		case stoppedState:
			return "bg-muted-foreground"
		default:
			return "bg-yellow-500"
	}
}

function monitorKey(system: string, platform: string, name: string) {
	return `${system}:${platform}:${name.trim().toLowerCase()}`
}

function getSystemPlatform(system?: SystemLite): Platform {
	const platform = system?.info?.cap?.platform?.toLowerCase()
	if (platform === "linux" || platform === "darwin" || platform === "android" || platform === "windows") {
		return platform
	}
	return "windows"
}

function getSupportedMonitorKinds(system: SystemLite | undefined, allowedKinds: MonitorKind[]) {
	const allowed = new Set(allowedKinds)
	const supported: MonitorKind[] = []
	if (allowed.has("software") && supportsSoftwareMonitor(system)) supported.push("software")
	if (allowed.has("service") && supportsServiceMonitor(system)) supported.push("service")
	return supported
}

function isKindSupported(systemMonitorKinds: Map<string, MonitorKind[]>, systemId: string, kind: MonitorKind) {
	return systemMonitorKinds.get(systemId)?.includes(kind) ?? false
}

function hasAnyKind(systemMonitorKinds: Map<string, MonitorKind[]>, kind: MonitorKind) {
	for (const kinds of systemMonitorKinds.values()) {
		if (kinds.includes(kind)) return true
	}
	return false
}

function supportsSoftwareMonitor(system?: SystemLite) {
	const cap = system?.info?.cap
	if (!isWindowsSystem(system) || isLinuxContainerSystem(system)) return false
	return getCapabilitySet(cap?.collection).has("software_monitor")
}

function supportsServiceMonitor(system?: SystemLite) {
	const cap = system?.info?.cap
	if (!isWindowsSystem(system) || isLinuxContainerSystem(system)) return false
	const collection = getCapabilitySet(cap?.collection)
	const operations = getCapabilitySet(cap?.operations)
	return collection.has("windows_services") && operations.has("service_control")
}

function isWindowsSystem(system?: SystemLite) {
	return system?.info?.cap?.platform?.toLowerCase() === "windows"
}

function isLinuxContainerSystem(system?: SystemLite) {
	const cap = system?.info?.cap
	const platform = cap?.platform?.toLowerCase()
	const profile = cap?.agent_profile?.toLowerCase()
	const runMode = cap?.run_mode?.toLowerCase()
	return profile === "linux-container" || (platform === "linux" && runMode === "docker")
}

function getCapabilitySet(values?: string[]) {
	return new Set((values ?? []).map((value) => value.trim()).filter(Boolean))
}

function formatUpdated(updated?: number) {
	return updated ? hourWithSeconds(new Date(updated).toISOString()) : "等待上报"
}

function saveMonitorRule(kind: MonitorKind, body: Record<string, unknown>) {
	return pb.send("/api/pulse/important-monitoring/rules", {
		method: "POST",
		body: { kind, ...body },
	})
}

function deleteMonitorRule(kind: MonitorKind, id: string) {
	return pb.send(`/api/pulse/important-monitoring/rules/${kind}/${id}`, {
		method: "DELETE",
	})
}

function errorMessage(error: unknown) {
	if (error instanceof Error) return error.message
	return "请确认当前用户有权限，并且 Agent 在线。"
}
