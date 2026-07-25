import type { ElementType } from "react"
import { AlertCircleIcon, ContainerIcon, CpuIcon, HardDriveIcon, MemoryStickIcon, NetworkIcon } from "lucide-react"
import type { ChartData, GPUData, SystemDetailsRecord, SystemRecord } from "@/types"
import { SystemStatus } from "@/lib/enums"
import { cn } from "@/lib/utils"
import { Badge } from "../../ui/badge"
import { Card, CardHeader, CardTitle } from "../../ui/card"
import { GpuIcon } from "../../ui/icons"
import { toast } from "../../ui/use-toast"
import type { DetailView } from "@/components/mobile/mobile-system-detail"
import { buildStatusSummaryItems, type MetricState } from "./status-summary-utils"
import { $userSettings } from "@/lib/stores"
import { useStore } from "@nanostores/react"

const metricIcons: Record<DetailView, ElementType> = {
	overview: CpuIcon,
	memory: MemoryStickIcon,
	disk: HardDriveIcon,
	network: NetworkIcon,
	gpu: GpuIcon,
	containers: ContainerIcon,
	services: ContainerIcon,
	websites: ContainerIcon,
	history: ContainerIcon,
}

export function StatusSummaryCards({
	system,
	systemStats,
	details,
	lastGpus,
	containerData,
	currentContainerCount,
	smartTotalCapacity,
	smartDisks,
	hasContainers,
	hasGpu,
	activeView,
	onSelectView,
}: {
	system: SystemRecord
	systemStats: ChartData["systemStats"]
	details?: SystemDetailsRecord | null
	lastGpus?: Record<string, GPUData> | null
	containerData: ChartData["containerData"]
	currentContainerCount?: number
	smartTotalCapacity: number
	smartDisks: { model?: string; name?: string; type?: string; media_type?: string; temp?: number }[]
	hasContainers: boolean
	hasGpu: boolean
	activeView: DetailView
	onSelectView: (view: DetailView) => void
}) {
	const userSettings = useStore($userSettings, { keys: ["unitTemp"] })
	const items = buildStatusSummaryItems({
		system,
		systemStats,
		details,
		lastGpus,
		containerData,
		currentContainerCount,
		smartTotalCapacity,
		smartDisks,
		hasContainers,
		hasGpu,
		unitTemp: userSettings.unitTemp,
	})

	return (
		<div className="grid pulse-card-gap sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
			{items.map((item) => (
				<MetricOverviewCard
					key={item.key}
					icon={metricIcons[item.key]}
					label={item.label}
					value={item.value}
					helper={item.helper}
					badge={item.badge}
					badges={item.badges}
					state={item.state}
					selected={activeView === item.key}
					disabledReason={item.disabledReason}
					onSelect={() => onSelectView(item.key)}
				/>
			))}
		</div>
	)
}

function MetricOverviewCard({
	icon: Icon,
	label,
	value,
	state,
	helper,
	badge,
	badges,
	selected,
	disabledReason,
	onSelect,
}: {
	icon: ElementType
	label: string
	value: string
	state: MetricState
	helper?: string
	badge?: string
	badges?: string[]
	selected?: boolean
	disabledReason?: string
	onSelect: () => void
}) {
	const visibleBadges = badges?.length ? badges : badge ? [badge] : []
	const handleSelect = () => {
		if (disabledReason) {
			toast({
				title: `${label}暂不可用`,
				description: disabledReason,
			})
			return
		}
		onSelect()
	}

	return (
		<Card
			className={cn(
				"group overflow-hidden bg-card shadow-none transition-[border-color,background-color,transform]",
				!disabledReason && "hover:border-foreground/15 hover:bg-surface-soft",
				selected && "border-primary/35 bg-surface-soft ring-1 ring-foreground/10"
			)}
		>
			<button
				type="button"
				className={cn(
					"block min-h-[8.25rem] w-full p-3.5 text-left transition-[background-color,transform] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
					disabledReason ? "cursor-default" : "active:scale-[0.96]"
				)}
				aria-pressed={selected}
				onClick={handleSelect}
			>
				<div className="flex h-full flex-col justify-between gap-3">
					<div className="flex items-start justify-between gap-3">
						<div className="min-w-0">
							<div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs font-medium text-muted-foreground">
								<span>{label}</span>
								{visibleBadges.map((item) => (
									<Badge
										key={item}
										variant="outline"
										className="h-5 rounded-md px-1.5 text-[11px] text-muted-foreground"
									>
										{item}
									</Badge>
								))}
							</div>
							<div className="mt-2 truncate text-xl font-semibold tabular-nums">{value}</div>
							{helper && <div className="mt-1 truncate text-xs text-muted-foreground">{helper}</div>}
						</div>
						<div
							className={cn(
								"rounded-md border border-border/70 bg-surface-soft p-2 transition-[background-color,border-color,color]",
								selected && "border-primary/20 bg-primary text-primary-foreground"
							)}
						>
							<Icon className="size-4" />
						</div>
					</div>
					<div className="flex items-center justify-between gap-2">
						<Badge
							variant={stateVariant[state]}
							className={cn("rounded-full px-2.5", state === "muted" && "text-muted-foreground")}
						>
							{metricStateLabels[state]}
						</Badge>
						{selected && <span className="text-[11px] font-medium text-muted-foreground">当前模块</span>}
					</div>
				</div>
			</button>
		</Card>
	)
}

const stateVariant: Record<MetricState, "success" | "warning" | "danger" | "outline"> = {
	ok: "success",
	warning: "warning",
	danger: "danger",
	muted: "outline",
	offline: "outline",
	paused: "outline",
	pending: "outline",
} as const

const metricStateLabels: Record<MetricState, string> = {
	ok: "正常",
	warning: "偏高",
	danger: "过高",
	muted: "暂无数据",
	offline: "离线",
	paused: "暂停",
	pending: "待接入",
}

export function MetricEmptyCard({ title, icon: Icon }: { title: string; icon: ElementType }) {
	return (
		<Card className="bg-surface-soft">
			<CardHeader className="p-4">
				<CardTitle className="flex items-center gap-2 text-base">
					<Icon className="size-4" />
					{title}
				</CardTitle>
			</CardHeader>
		</Card>
	)
}

export function DetailUnavailableCard({
	title,
	description,
	icon: Icon = AlertCircleIcon,
}: {
	title: string
	description: string
	icon?: ElementType
}) {
	return (
		<Card className="bg-surface-soft p-4">
			<div className="flex items-start gap-3">
				<div className="rounded-md border bg-card p-2">
					<Icon className="size-4 text-muted-foreground" />
				</div>
				<div className="min-w-0">
					<div className="font-medium">{title}</div>
					<p className="mt-1 text-sm text-muted-foreground">{description}</p>
				</div>
			</div>
		</Card>
	)
}

export function ContainersUnavailableCard({ system }: { system: SystemRecord }) {
	const isOnline = system.status === SystemStatus.Up
	const title = isOnline ? "暂未采集到容器" : "设备离线，容器操作不可用"

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					<ContainerIcon className="size-4" />
					{title}
				</CardTitle>
			</CardHeader>
		</Card>
	)
}
