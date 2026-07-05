import { useStore } from "@nanostores/react"
import {
	BlocksIcon,
	CheckCircle2Icon,
	CircleOffIcon,
	Clock3Icon,
	LockIcon,
	SearchIcon,
	ShieldAlertIcon,
} from "lucide-react"
import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { isAdmin, isReadOnlyUser } from "@/lib/api"
import { cn } from "@/lib/utils"
import { $moduleSettings, $moduleSettingsLoading, $moduleSummary, setModuleEnabled } from "@/modules/module-state"
import { getModulesByCategory, getPulseModule } from "@/modules/registry"
import type { PulseModuleId, PulseModuleManifest, PulseModuleRuntimeState } from "@/modules/types"

export default function ModulesSettingsPage() {
	const state = useStore($moduleSettings)
	const summary = useStore($moduleSummary)
	const loading = useStore($moduleSettingsLoading)
	const [query, setQuery] = useState("")
	const [pendingModule, setPendingModule] = useState<PulseModuleId | null>(null)
	const canControl = isAdmin() && !isReadOnlyUser()
	const groups = useMemo(() => {
		const keyword = query.trim().toLowerCase()
		return getModulesByCategory()
			.map((group) => ({
				...group,
				modules: group.modules.filter((module) => {
					if (!keyword) return true
					return moduleSearchText(module).includes(keyword)
				}),
			}))
			.filter((group) => group.modules.length > 0)
	}, [query])

	const handleToggle = async (module: PulseModuleManifest, nextEnabled: boolean) => {
		if (!canControl || module.required) {
			return
		}
		if (!nextEnabled) {
			const confirmed = window.confirm(`关闭 ${module.name} 会隐藏入口并阻止直接访问，对应数据不会删除。确认关闭？`)
			if (!confirmed) {
				return
			}
		}
		setPendingModule(module.id)
		try {
			await setModuleEnabled(module.id, nextEnabled)
		} finally {
			setPendingModule(null)
		}
	}

	return (
		<div className="grid gap-4">
			<section className="rounded-lg border border-border/70 bg-surface-soft p-2 shadow-none">
				<div className="rounded-md border border-border/70 bg-card p-3 shadow-none">
					<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
						<div className="flex min-w-0 items-center gap-3">
							<div className="grid size-10 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft text-muted-foreground">
								<BlocksIcon className="size-4" />
							</div>
							<div className="min-w-0">
								<div className="text-xs font-medium text-muted-foreground">Pulse 模块底座</div>
								<h3 className="mt-1 text-lg font-semibold tracking-tight text-foreground">模块管理</h3>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
							<SummaryTile label="总模块" value={summary.total} />
							<SummaryTile label="已启用" value={summary.enabled} tone="success" />
							<SummaryTile label="已关闭" value={summary.disabled} />
							<SummaryTile label="被阻塞" value={summary.blocked} tone="warning" />
						</div>
					</div>
				</div>
				<div className="mt-2 grid gap-2 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-center">
					<div className="grid grid-cols-2 gap-2 md:grid-cols-4">
						<ModuleStatusLegend icon={LockIcon} label={`${summary.required} 个必需`} />
						<ModuleStatusLegend icon={CheckCircle2Icon} label="启用后入口可见" />
						<ModuleStatusLegend icon={CircleOffIcon} label="关闭后保留数据" />
						<ModuleStatusLegend icon={ShieldAlertIcon} label="依赖关闭会阻塞" />
					</div>
					<div className="relative block">
						<SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							aria-label="搜索模块"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="搜索模块"
							className="h-10 bg-card pl-9"
						/>
					</div>
				</div>
			</section>

			{groups.length === 0 ? (
				<div className="rounded-lg border border-border/70 bg-card p-6 text-center text-sm text-muted-foreground">
					没有匹配的模块
				</div>
			) : (
				groups.map((group) => (
					<section key={group.category} className="grid gap-2">
						<div className="px-1 text-xs font-medium text-muted-foreground">{group.category}</div>
						<div className="grid gap-2">
							{group.modules.map((module) => (
								<ModuleRow
									key={module.id}
									module={module}
									state={state[module.id]}
									canControl={canControl}
									loading={loading || pendingModule === module.id}
									onToggle={handleToggle}
								/>
							))}
						</div>
					</section>
				))
			)}
		</div>
	)
}

function ModuleRow({
	module,
	state,
	canControl,
	loading,
	onToggle,
}: {
	module: PulseModuleManifest
	state?: PulseModuleRuntimeState
	canControl: boolean
	loading: boolean
	onToggle: (module: PulseModuleManifest, nextEnabled: boolean) => Promise<void>
}) {
	const Icon = module.icon ?? BlocksIcon
	const current = state ?? {
		id: module.id,
		enabled: module.defaultEnabled,
		effectiveEnabled: module.defaultEnabled,
		status: module.required ? "required" : module.defaultEnabled ? "enabled" : "disabled",
		blockedBy: [],
	}
	const disabled = module.required || !canControl || loading

	return (
		<div className="rounded-lg border border-border/70 bg-card p-3 shadow-none">
			<div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
				<div className="flex min-w-0 gap-3">
					<div className="grid size-10 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft text-muted-foreground">
						<Icon className="size-4" strokeWidth={1.9} />
					</div>
					<div className="min-w-0">
						<div className="flex flex-wrap items-center gap-2">
							<div className="font-semibold">{module.name}</div>
							<ModuleStatusBadge state={current} required={module.required} />
							<Badge variant="secondary" className="h-6 rounded-md">
								{module.category}
							</Badge>
						</div>
						<div className="mt-1 text-sm text-muted-foreground">{module.description}</div>
						<div className="mt-2 flex flex-wrap gap-1.5">
							<MetaChip label="路由" value={module.routes.length} />
							<MetaChip label="集合" value={module.collections.length} />
							<MetaChip label="任务" value={module.jobs.length} />
							<MetaChip label="Agent" value={module.agentCapabilities.length} />
						</div>
						{current.blockedBy.length > 0 && (
							<div className="mt-2 text-xs text-amber-700 dark:text-amber-300">
								依赖未启用：{current.blockedBy.map((id) => getPulseModule(id).name).join("、")}
							</div>
						)}
					</div>
				</div>
				<div className="flex flex-wrap items-center gap-2 xl:justify-end">
					<Button variant="outline" size="sm" className="h-9 gap-1.5" asChild>
						<a href={`#module-${module.id}`} title={module.sourcePaths.join("\n")}>
							<Clock3Icon className="size-4" />
							详情
						</a>
					</Button>
					<div className="flex h-9 items-center gap-2 rounded-md border border-border/70 bg-surface-soft px-2.5">
						<span className="text-xs text-muted-foreground">{current.enabled ? "开启" : "关闭"}</span>
						<Switch
							checked={current.enabled}
							disabled={disabled}
							onCheckedChange={(checked) => onToggle(module, checked)}
							aria-label={`${module.name} 开关`}
						/>
					</div>
				</div>
			</div>
			<ModuleDetails module={module} />
		</div>
	)
}

function ModuleDetails({ module }: { module: PulseModuleManifest }) {
	return (
		<div id={`module-${module.id}`} className="mt-3 grid gap-2 rounded-md border border-border/70 bg-surface-soft p-3">
			<DetailRow label="依赖" values={module.dependencies.map((id) => getPulseModule(id).name)} empty="无" />
			<DetailRow label="路由" values={module.routes} empty="无独立路由" />
			<DetailRow label="集合" values={module.collections} empty="无独立集合" />
			<DetailRow label="后台任务" values={module.jobs} empty="无后台任务" />
			<DetailRow label="Agent 能力" values={module.agentCapabilities} empty="不依赖 Agent" />
			<DetailRow label="健康检查" values={module.healthChecks} empty="使用基础健康检查" />
			<DetailRow label="代码边界" values={module.sourcePaths} empty="待收敛" />
		</div>
	)
}

function ModuleStatusBadge({ state, required }: { state: PulseModuleRuntimeState; required: boolean }) {
	if (required || state.status === "required") return <Badge className="h-6 rounded-md">必需</Badge>
	if (state.status === "blocked")
		return (
			<Badge variant="warning" className="h-6 rounded-md">
				被阻塞
			</Badge>
		)
	if (state.status === "disabled")
		return (
			<Badge variant="secondary" className="h-6 rounded-md">
				已关闭
			</Badge>
		)
	return (
		<Badge variant="success" className="h-6 rounded-md">
			已启用
		</Badge>
	)
}

function DetailRow({ label, values, empty }: { label: string; values: string[]; empty: string }) {
	return (
		<div className="grid gap-2 text-xs sm:grid-cols-[5rem_minmax(0,1fr)]">
			<div className="text-muted-foreground">{label}</div>
			<div className="flex min-w-0 flex-wrap gap-1.5">
				{values.length ? values.map((value) => <CodeChip key={value}>{value}</CodeChip>) : <span>{empty}</span>}
			</div>
		</div>
	)
}

function CodeChip({ children }: { children: string }) {
	return (
		<span className="max-w-full truncate rounded-md border border-border/70 bg-card px-2 py-1 font-mono text-[11px] text-muted-foreground">
			{children}
		</span>
	)
}

function MetaChip({ label, value }: { label: string; value: number }) {
	return (
		<span className="rounded-md border border-border/70 bg-surface-soft px-2 py-1 text-[11px] text-muted-foreground">
			{label} {value}
		</span>
	)
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone?: "success" | "warning" }) {
	return (
		<div
			className={cn(
				"min-w-20 rounded-md border border-border/70 bg-surface-soft px-3 py-2 text-center",
				tone === "success" && "text-emerald-700 dark:text-emerald-300",
				tone === "warning" && "text-amber-700 dark:text-amber-300"
			)}
		>
			<div className="text-lg font-semibold tabular-nums">{value}</div>
			<div className="text-[11px] text-muted-foreground">{label}</div>
		</div>
	)
}

function ModuleStatusLegend({ icon: Icon, label }: { icon: typeof LockIcon; label: string }) {
	return (
		<div className="flex min-h-10 items-center gap-2 rounded-md border border-border/70 bg-card px-3 text-xs text-muted-foreground">
			<Icon className="size-4 shrink-0" />
			<span className="truncate">{label}</span>
		</div>
	)
}

function moduleSearchText(module: PulseModuleManifest) {
	return [
		module.id,
		module.name,
		module.description,
		module.category,
		...module.routes,
		...module.collections,
		...module.jobs,
		...module.agentCapabilities,
		...module.sourcePaths,
	]
		.join(" ")
		.toLowerCase()
}
