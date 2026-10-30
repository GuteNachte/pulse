import { useState, type ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatContainerMetricNumber, formatContainerNetwork, isContainerRunningStatus } from "@/lib/container-display"
import { cn } from "@/lib/utils"
import type { ContainerRecord } from "@/types"
import { ChevronDownIcon, LayersIcon } from "lucide-react"
import { MobileEmptyState } from "./mobile-ui"

export type MobileContainerSystemCard = {
	id: string
	name: string
	total: number
	running: number
	stopped: number
	stackCount: number
}

export type MobileContainerStackGroup = {
	key: string
	system: string
	project: string
	containers: ContainerRecord[]
	config: string
	running: number
	stopped: number
	protectedReason: string
}

export function MobileContainerSystemPicker({
	cards,
	selectedSystemId,
	onSelectSystem,
}: {
	cards: MobileContainerSystemCard[]
	selectedSystemId: string
	onSelectSystem: (id: string) => void
}) {
	return (
		<div className="grid grid-cols-1 gap-2 rounded-lg border border-border/70 bg-surface-soft p-2 sm:grid-cols-2">
			{cards.map((card) => (
				<button
					key={card.id}
					type="button"
					className={cn(
						"min-w-0 rounded-md border border-border/70 bg-card px-3 py-3 text-left transition-[background-color,border-color,transform] duration-150 ease-out hover:border-foreground/15 hover:bg-surface-soft active:scale-[0.96]",
						selectedSystemId === card.id && "border-foreground/25 bg-primary text-primary-foreground hover:bg-primary"
					)}
					onClick={() => onSelectSystem(card.id)}
				>
					<div className="grid min-w-0 gap-2">
						<div className="min-w-0">
							<div className="truncate text-sm font-medium">{card.name}</div>
						</div>
						<div
							className={cn(
								"flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground",
								selectedSystemId === card.id && "text-primary-foreground/75"
							)}
						>
							<span>{card.total} 容器</span>
							<span>{card.running} 运行</span>
							<span>{card.stackCount} 编排</span>
						</div>
						<Badge variant={card.stopped > 0 ? "warning" : "outline"} className="h-5 w-fit px-1.5 text-[11px]">
							{card.stopped > 0 ? `停止 ${card.stopped}` : "无停止"}
						</Badge>
					</div>
				</button>
			))}
		</div>
	)
}

export function MobileContainerStackCard({
	stack,
	renderStackActions,
	renderContainerActions,
	onOpenContainer,
	isRunning = isContainerRunningStatus,
	formatCpu = formatContainerMetricNumber,
	formatMemory,
	formatNet = formatContainerNetwork,
}: {
	stack: MobileContainerStackGroup
	renderStackActions: (stack: MobileContainerStackGroup) => ReactNode
	renderContainerActions: (container: ContainerRecord) => ReactNode
	onOpenContainer: (container: ContainerRecord) => void
	isRunning?: (status: string) => boolean
	formatCpu?: (value: unknown) => string
	formatMemory: (value: unknown) => string
	formatNet?: (value: unknown) => string
}) {
	const [expanded, setExpanded] = useState(false)
	const [showAllContainers, setShowAllContainers] = useState(false)
	const visibleContainers = showAllContainers ? stack.containers : stack.containers.slice(0, 3)

	return (
		<div className="min-w-0 overflow-hidden rounded-lg border border-border/70 bg-card p-3">
			<button
				type="button"
				className="flex w-full min-w-0 items-start justify-between gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				aria-label={`${expanded ? "收起" : "展开"} ${stack.project} 编排`}
				aria-expanded={expanded}
				onClick={() => setExpanded((value) => !value)}
			>
				<div className="flex min-w-0 items-start gap-2">
					<LayersIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
					<div className="min-w-0">
						<div className="truncate text-sm font-semibold">{stack.project}</div>
						<div className="mt-0.5 truncate text-xs text-muted-foreground">{stack.containers.length} 个容器</div>
					</div>
				</div>
				<ChevronDownIcon className={cn("mt-0.5 size-4 shrink-0 transition-transform", expanded && "rotate-180")} />
			</button>

			<div className="mt-3 flex flex-wrap items-center gap-1.5">
				<Badge variant={stack.stopped ? "warning" : "success"} className="h-5 px-1.5 text-[11px]">
					{stack.running} 运行
				</Badge>
				<Badge variant={stack.stopped ? "secondary" : "outline"} className="h-5 px-1.5 text-[11px]">
					{stack.stopped} 停止
				</Badge>
			</div>

			{expanded && (
				<>
					<div className="mt-3">{renderStackActions(stack)}</div>

					<div className="mt-3 grid gap-2">
						{visibleContainers.map((container) => (
							<MobileContainerCard
								key={container.id}
								container={container}
								compact
								onOpenContainer={onOpenContainer}
								renderActions={renderContainerActions}
								isRunning={isRunning}
								formatCpu={formatCpu}
								formatMemory={formatMemory}
								formatNet={formatNet}
							/>
						))}
						{stack.containers.length > visibleContainers.length && (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="min-h-10"
								onClick={() => setShowAllContainers(true)}
							>
								查看全部 {stack.containers.length} 个容器
							</Button>
						)}
					</div>
				</>
			)}
		</div>
	)
}

export function MobileContainersView({
	systemCards,
	selectedSystemId,
	onSelectSystem,
	stacks,
	independentContainers,
	selectedRows,
	runningCount,
	systemScoped,
	onOpenContainer,
	renderStackActions,
	renderContainerActions,
	renderStackConfigDialog,
	getSystemName,
	isRunning = isContainerRunningStatus,
	formatCpu = formatContainerMetricNumber,
	formatMemory,
	formatNet = formatContainerNetwork,
}: {
	systemCards: { id: string; total: number; running: number; stopped: number }[]
	selectedSystemId: string
	onSelectSystem: (id: string) => void
	stacks: MobileContainerStackGroup[]
	independentContainers: ContainerRecord[]
	selectedRows: ContainerRecord[]
	runningCount: number
	systemScoped: boolean
	onOpenContainer: (container: ContainerRecord) => void
	renderStackActions: (stack: MobileContainerStackGroup, onShowConfig: () => void) => ReactNode
	renderContainerActions: (container: ContainerRecord) => ReactNode
	renderStackConfigDialog: (
		stack: MobileContainerStackGroup | null,
		open: boolean,
		onOpenChange: (open: boolean) => void
	) => ReactNode
	getSystemName: (systemId: string) => string
	isRunning?: (status: string) => boolean
	formatCpu?: (value: unknown) => string
	formatMemory: (value: unknown) => string
	formatNet?: (value: unknown) => string
}) {
	const [activeStackConfig, setActiveStackConfig] = useState<MobileContainerStackGroup | null>(null)
	const selectedSystemName = selectedSystemId ? getSystemName(selectedSystemId) : "全部机器"
	const stoppedCount = Math.max(0, selectedRows.length - runningCount)
	const stackCountBySystem = new Map<string, number>()
	for (const stack of stacks) {
		const systemId = stack.system || stack.containers[0]?.system || ""
		if (!systemId) continue
		stackCountBySystem.set(systemId, (stackCountBySystem.get(systemId) || 0) + 1)
	}
	const pickerCards: MobileContainerSystemCard[] = systemCards.map((card) => ({
		...card,
		name: getSystemName(card.id),
		stackCount: stackCountBySystem.get(card.id) || 0,
	}))

	return (
		<div className="grid min-w-0 gap-3">
			{!systemScoped && (
				<MobileContainerSystemPicker
					cards={pickerCards}
					selectedSystemId={selectedSystemId}
					onSelectSystem={onSelectSystem}
				/>
			)}
			{systemScoped && (
				<MobileContainerSystemSummary
					name={selectedSystemName}
					total={selectedRows.length}
					running={runningCount}
					stackCount={stacks.length}
					stopped={stoppedCount}
				/>
			)}

			<section className="grid min-w-0 gap-2">
				<MobileContainerSectionTitle title="编排" count={stacks.length} />
				{stacks.length > 0 ? (
					stacks.map((stack) => (
						<MobileContainerStackCard
							key={stack.key}
							stack={stack}
							onOpenContainer={onOpenContainer}
							renderStackActions={(stack) => renderStackActions(stack, () => setActiveStackConfig(stack))}
							renderContainerActions={renderContainerActions}
							isRunning={isRunning}
							formatCpu={formatCpu}
							formatMemory={formatMemory}
							formatNet={formatNet}
						/>
					))
				) : (
					<MobileEmptyState>{selectedRows.length === 0 ? "暂无容器数据" : "暂未识别到 Compose 编排"}</MobileEmptyState>
				)}
			</section>

			<section className="grid min-w-0 gap-2">
				<MobileContainerSectionTitle title="独立容器" count={independentContainers.length} />
				{independentContainers.length > 0 ? (
					independentContainers.map((container) => (
						<MobileContainerCard
							key={container.id}
							container={container}
							onOpenContainer={onOpenContainer}
							renderActions={renderContainerActions}
							isRunning={isRunning}
							formatCpu={formatCpu}
							formatMemory={formatMemory}
							formatNet={formatNet}
						/>
					))
				) : (
					<MobileEmptyState>无</MobileEmptyState>
				)}
			</section>
			{renderStackConfigDialog(activeStackConfig, Boolean(activeStackConfig), (open) => {
				if (!open) setActiveStackConfig(null)
			})}
		</div>
	)
}

export function MobileContainerCard({
	container,
	onOpenContainer,
	renderActions,
	compact = false,
	isRunning = isContainerRunningStatus,
	formatCpu = formatContainerMetricNumber,
	formatMemory,
	formatNet = formatContainerNetwork,
}: {
	container: ContainerRecord
	onOpenContainer: (container: ContainerRecord) => void
	renderActions: (container: ContainerRecord) => ReactNode
	compact?: boolean
	isRunning?: (status: string) => boolean
	formatCpu?: (value: unknown) => string
	formatMemory: (value: unknown) => string
	formatNet?: (value: unknown) => string
}) {
	const running = isRunning(container.status)

	return (
		<div className="rounded-lg border border-border/70 bg-card p-3">
			<div className="flex min-w-0 items-start justify-between gap-3">
				<button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpenContainer(container)}>
					<div className="min-w-0">
						<div className="truncate text-sm font-medium">{container.name || "-"}</div>
						<div className="mt-1 truncate text-xs text-muted-foreground">
							{container.stack_service || container.image || "独立容器"}
						</div>
					</div>
				</button>
				<Badge variant={running ? "success" : "secondary"} className="h-5 shrink-0 px-1.5 text-[11px]">
					{running ? "运行中" : "已停止"}
				</Badge>
			</div>
			<div className="mt-2">{renderActions(container)}</div>
			<button type="button" className="block w-full min-w-0 text-left" onClick={() => onOpenContainer(container)}>
				<div className="mt-3 grid grid-cols-3 gap-2 text-xs">
					<MobileContainerMetric label="CPU" value={formatContainerCpuMetric(container.cpu, formatCpu)} />
					<MobileContainerMetric label="内存" value={formatMemory(container.memory)} />
					<MobileContainerMetric label="网络" value={formatNet(container.net)} />
				</div>
				{!compact && (
					<div className="mt-2 grid gap-1 text-xs text-muted-foreground">
						<div className="truncate">镜像：{container.image || "-"}</div>
						{container.ports && <div className="truncate">端口：{container.ports}</div>}
					</div>
				)}
			</button>
		</div>
	)
}

function formatContainerCpuMetric(value: unknown, formatter: (value: unknown) => string) {
	const formatted = formatter(value)
	return formatted === "未采集" ? formatted : `${formatted}%`
}

export function MobileContainerSystemSummary({
	name,
	total,
	running,
	stackCount,
	stopped,
}: {
	name: string
	total: number
	running: number
	stackCount: number
	stopped: number
}) {
	return (
		<div className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border/70 bg-card px-3 py-2.5">
			<div className="min-w-0">
				<div className="truncate text-sm font-semibold">{name}</div>
				<div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
					<span>容器 {total}</span>
					<span>{running} 运行</span>
					<span>{stackCount} 编排</span>
				</div>
			</div>
			<Badge variant={stopped > 0 ? "warning" : "outline"} className="h-5 shrink-0 px-1.5 text-[11px]">
				{stopped > 0 ? `停止 ${stopped}` : "无停止"}
			</Badge>
		</div>
	)
}

export function MobileContainerSectionTitle({ title, count }: { title: string; count: number }) {
	return (
		<div className="flex min-w-0 items-center justify-between gap-3 px-0.5">
			<h3 className="min-w-0 truncate text-sm font-semibold">{title}</h3>
			{count > 0 && (
				<span className="shrink-0 whitespace-nowrap rounded-md border border-border/70 bg-surface-soft px-2 py-0.5 text-[11px] text-muted-foreground">
					{count}
				</span>
			)}
		</div>
	)
}

export function MobileContainerMetric({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-0 rounded-md border border-border/70 bg-surface-soft px-2 py-1.5">
			<div className="text-[11px] text-muted-foreground">{label}</div>
			<div className="mt-0.5 truncate font-medium tabular-nums">{value}</div>
		</div>
	)
}
