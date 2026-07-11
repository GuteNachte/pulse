import { BlocksIcon, LockIcon, SearchIcon, ShieldAlertIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { getModulesByCategory, getPulseModule, pulseModules } from "@/modules/registry"
import type { PulseModuleManifest } from "@/modules/types"

export default function ModulesSettingsPage() {
	const [query, setQuery] = useState("")
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
								<h3 className="mt-1 text-lg font-semibold text-foreground">模块管理</h3>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
							<SummaryTile label="总模块" value={pulseModules.length} />
							<SummaryTile label="可选模块" value={pulseModules.filter((module) => !module.required).length} />
							<SummaryTile
								label="必需模块"
								value={pulseModules.filter((module) => module.required).length}
								tone="success"
							/>
						</div>
					</div>
				</div>
				<div className="mt-2 grid gap-2 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-center">
					<div className="grid grid-cols-2 gap-2 md:grid-cols-4">
						<ModuleStatusLegend icon={LockIcon} label="必需模块" />
						<ModuleStatusLegend icon={ShieldAlertIcon} label="依赖关系只读展示" />
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
								<ModuleRow key={module.id} module={module} />
							))}
						</div>
					</section>
				))
			)}
		</div>
	)
}

function ModuleRow({ module }: { module: PulseModuleManifest }) {
	const Icon = module.icon ?? BlocksIcon

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
							<ModuleKindBadge required={module.required} />
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

function ModuleKindBadge({ required }: { required: boolean }) {
	return (
		<Badge variant={required ? "default" : "secondary"} className="h-6 rounded-md">
			{required ? "必需" : "可选"}
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
