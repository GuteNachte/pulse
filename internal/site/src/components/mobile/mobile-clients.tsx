import { useStore } from "@nanostores/react"
import { getPagePath } from "@nanostores/router"
import { PlusIcon } from "lucide-react"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { $router } from "@/components/router"
import { SystemMetaTags } from "@/components/system-meta-tags"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
	buildSystemStatusCounts,
	compareSystemsByAttention,
	filterSystemsForInventory,
	getSystemStatusLabel,
	getSystemStatusTone,
	type SystemStatusFilter,
} from "@/lib/system-display"
import { getSystemMetricDisplay, type SystemMetricDisplayState } from "@/lib/system-metrics"
import { getSystemIPAddressLabel } from "@/lib/system-network"
import { $systems } from "@/lib/stores"
import {
	getSystemDisplayName,
	primaryUseOptions,
	systemRoleOptions,
	type PrimaryUse,
	type SystemRole,
} from "@/lib/system-roles"
import type { SystemRecord } from "@/types"
import {
	MobileEmptyState,
	MobileList,
	MobileListItem,
	MobileMetricRow,
	MobilePageShell,
	MobileSection,
	MobileStatusTag,
	type MobileStatusTone,
} from "./mobile-ui"

type RoleFilter = "all" | SystemRole
type PrimaryUseFilter = "all" | PrimaryUse
type MobileSortMode = "attention" | "name" | "updated" | "status"

const MOBILE_CLIENTS_VISIBLE_STEP = 50

export function MobileClientsPage({ showAddSystem, onAddSystem }: { showAddSystem: boolean; onAddSystem: () => void }) {
	const systems = useStore($systems)
	const [query, setQuery] = useState("")
	const [statusFilter, setStatusFilter] = useState<SystemStatusFilter>("all")
	const [roleFilter, setRoleFilter] = useState<RoleFilter>("all")
	const [primaryUseFilter, setPrimaryUseFilter] = useState<PrimaryUseFilter>("all")
	const [sortMode, setSortMode] = useState<MobileSortMode>("attention")
	const [visibleLimit, setVisibleLimit] = useState(MOBILE_CLIENTS_VISIBLE_STEP)
	const counts = useMemo(() => buildSystemStatusCounts(systems), [systems])
	const filtered = useMemo(() => {
		const items = filterSystemsForInventory(systems, {
			query,
			status: statusFilter,
			role: roleFilter,
			primaryUse: primaryUseFilter,
		})
		return sortMobileSystems(items, sortMode)
	}, [primaryUseFilter, query, roleFilter, sortMode, statusFilter, systems])
	const visibleSystems = filtered.slice(0, visibleLimit)

	useEffect(() => {
		setVisibleLimit(MOBILE_CLIENTS_VISIBLE_STEP)
	}, [primaryUseFilter, query, roleFilter, sortMode, statusFilter])

	return (
		<MobilePageShell
			title="机器"
			subtitle={`${counts.up}/${counts.all} 在线`}
			action={
				showAddSystem ? (
					<Button size="sm" className="min-h-10 gap-1.5 rounded-md px-3" onClick={onAddSystem}>
						<PlusIcon className="size-4" />
						添加
					</Button>
				) : null
			}
		>
			<div className="grid gap-2">
				<Input
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder="搜索机器、用途、说明"
					className="h-11 rounded-lg bg-card"
				/>
				<div className="grid gap-2 rounded-lg border border-border/70 bg-surface-soft p-2">
					<div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
						<FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
							全部 {counts.all}
						</FilterChip>
						<FilterChip active={statusFilter === "up"} onClick={() => setStatusFilter("up")}>
							在线 {counts.up}
						</FilterChip>
						<FilterChip active={statusFilter === "down"} onClick={() => setStatusFilter("down")}>
							离线 {counts.down}
						</FilterChip>
						<FilterChip active={statusFilter === "paused"} onClick={() => setStatusFilter("paused")}>
							暂停 {counts.paused}
						</FilterChip>
						<FilterChip active={statusFilter === "pending"} onClick={() => setStatusFilter("pending")}>
							待接入 {counts.pending}
						</FilterChip>
					</div>
					<div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
						<FilterChip active={sortMode === "attention"} onClick={() => setSortMode("attention")}>
							关注
						</FilterChip>
						<FilterChip active={sortMode === "name"} onClick={() => setSortMode("name")}>
							名称
						</FilterChip>
						<FilterChip active={sortMode === "updated"} onClick={() => setSortMode("updated")}>
							更新
						</FilterChip>
						<FilterChip active={sortMode === "status"} onClick={() => setSortMode("status")}>
							状态
						</FilterChip>
					</div>
					<div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
						<FilterChip active={roleFilter === "all"} onClick={() => setRoleFilter("all")}>
							全部类型
						</FilterChip>
						{systemRoleOptions.map((option) => (
							<FilterChip
								key={option.value}
								active={roleFilter === option.value}
								onClick={() => setRoleFilter(option.value)}
							>
								{option.label}
							</FilterChip>
						))}
						<FilterChip active={primaryUseFilter === "all"} onClick={() => setPrimaryUseFilter("all")}>
							全部用途
						</FilterChip>
						{primaryUseOptions.map((option) => (
							<FilterChip
								key={option.value}
								active={primaryUseFilter === option.value}
								onClick={() => setPrimaryUseFilter(option.value)}
							>
								{option.label}
							</FilterChip>
						))}
					</div>
				</div>
			</div>

			<MobileSection title="机器列表" count={`${filtered.length} 台`}>
				{filtered.length ? (
					<div className="grid gap-3">
						<MobileList>
							{visibleSystems.map((system) => (
								<MobileClientItem key={system.id} system={system} />
							))}
						</MobileList>
						{visibleSystems.length < filtered.length && (
							<Button
								type="button"
								variant="outline"
								className="h-10 rounded-md"
								onClick={() => setVisibleLimit((current) => current + MOBILE_CLIENTS_VISIBLE_STEP)}
							>
								加载更多 {visibleSystems.length}/{filtered.length}
							</Button>
						)}
					</div>
				) : (
					<MobileEmptyState>没有匹配的机器</MobileEmptyState>
				)}
			</MobileSection>
		</MobilePageShell>
	)
}

function sortMobileSystems(systems: SystemRecord[], sortMode: MobileSortMode) {
	const items = systems.slice()
	if (sortMode === "name") {
		return items.sort((a, b) => getSystemDisplayName(a).localeCompare(getSystemDisplayName(b)))
	}
	if (sortMode === "updated") {
		return items.sort(
			(a, b) =>
				new Date(b.updated || 0).getTime() - new Date(a.updated || 0).getTime() ||
				getSystemDisplayName(a).localeCompare(getSystemDisplayName(b))
		)
	}
	if (sortMode === "status") {
		return items.sort(
			(a, b) =>
				getStatusSortRank(a.status) - getStatusSortRank(b.status) ||
				getSystemDisplayName(a).localeCompare(getSystemDisplayName(b))
		)
	}
	return items.sort(compareSystemsByAttention)
}

function getStatusSortRank(status: SystemRecord["status"]) {
	if (status === "down") return 0
	if (status === "pending") return 1
	if (status === "paused") return 2
	if (status === "up") return 3
	return 4
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`min-h-10 shrink-0 rounded-md border px-3 text-[11px] font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.96] ${
				active
					? "border-border/70 bg-primary text-primary-foreground shadow-none"
					: "border-border/70 bg-card text-muted-foreground hover:bg-surface-soft hover:text-foreground"
			}`}
		>
			{children}
		</button>
	)
}

function MobileClientItem({ system }: { system: SystemRecord }) {
	const cpu = getSystemMetricDisplay(system, "cpu")
	const memory = getSystemMetricDisplay(system, "mp")
	const disk = getSystemMetricDisplay(system, "dp")
	const description = getSystemIPAddressLabel(system) || system.description?.trim() || system.info?.h || system.info?.m
	return (
		<MobileListItem href={getPagePath($router, "system", { id: system.id })}>
			<div className="flex min-w-0 items-start justify-between gap-3">
				<div className="min-w-0 flex-1">
					<div className="truncate text-[15px] font-semibold">{getSystemDisplayName(system)}</div>
					<SystemMetaTags system={system} className="mt-1.5 gap-1" />
					{description && <div className="mt-1.5 line-clamp-1 text-xs text-muted-foreground">{description}</div>}
				</div>
				<MobileStatusTag tone={systemStatusTone(system.status)}>{getSystemStatusLabel(system.status)}</MobileStatusTag>
			</div>
			<MobileMetricRow
				className="mt-2.5"
				items={[
					{
						label: "CPU",
						value: cpu.value,
						progress: cpu.progress,
						tone: metricTone(cpu.state),
					},
					{
						label: "内存",
						value: memory.value,
						progress: memory.progress,
						tone: metricTone(memory.state),
					},
					{
						label: "磁盘",
						value: disk.value,
						progress: disk.progress,
						tone: metricTone(disk.state),
					},
				]}
			/>
		</MobileListItem>
	)
}

function systemStatusTone(status: SystemRecord["status"]): MobileStatusTone {
	const tone = getSystemStatusTone(status)
	return tone === "info" ? "neutral" : tone
}

function metricTone(state: SystemMetricDisplayState): MobileStatusTone {
	if (state === "missing" || state === "offline" || state === "paused" || state === "pending") return "neutral"
	if (state === "danger") return "danger"
	if (state === "warning") return "warning"
	return "success"
}
