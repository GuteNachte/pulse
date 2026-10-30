import { BlocksIcon, LockIcon, SearchIcon } from "lucide-react"
import { useStore } from "@nanostores/react"
import { useMemo, useState } from "react"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { isAdmin } from "@/lib/api"
import { cn } from "@/lib/utils"
import { $moduleSettings, $moduleSettingsLoading, getModuleState, setModuleEnabled } from "@/modules/module-state"
import { getModulesByCategory, getPulseModule, pulseModules } from "@/modules/registry"
import type { PulseModuleManifest } from "@/modules/types"
import { SettingsPageHeader } from "./components/page-header"
import { SettingsStatCard, SettingsStatGrid } from "./components/stat-card"

type PendingToggle = { module: PulseModuleManifest; enabled: boolean } | null

export default function ModulesSettingsPage() {
	const [query, setQuery] = useState("")
	const [pendingToggle, setPendingToggle] = useState<PendingToggle>(null)
	const moduleSettings = useStore($moduleSettings)
	const moduleSettingsLoading = useStore($moduleSettingsLoading)
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
		<div className="grid pulse-card-gap">
			<SettingsPageHeader
				eyebrow="系统与关于"
				title="模块说明"
				description="Pulse 按「基础底座 + 可管理功能模块」组织：基础模块属于底座始终开启，可选模块由管理员统一开关，改动对所有账号同时生效。"
			/>

			<SettingsStatGrid>
				<SettingsStatCard label="总模块" value={pulseModules.length} detail="含基础底座与功能模块" />
				<SettingsStatCard
					label="可选模块"
					value={pulseModules.filter((module) => !module.required).length}
					detail="管理员可以统一开关"
				/>
				<SettingsStatCard
					label="必需模块"
					value={pulseModules.filter((module) => module.required).length}
					detail="基础底座，始终开启"
				/>
			</SettingsStatGrid>

			<div className="relative">
				<SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					aria-label="搜索模块"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder="搜索模块名称、路由、集合或任务"
					className="h-10 bg-card pl-9"
				/>
			</div>

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
									state={moduleSettings[module.id] ?? getModuleState(module.id)}
									loading={moduleSettingsLoading}
									canManage={isAdmin()}
									onToggle={(enabled) => setPendingToggle({ module, enabled })}
								/>
							))}
						</div>
					</section>
				))
			)}

			<AlertDialog
				open={Boolean(pendingToggle)}
				onOpenChange={(open) => {
					if (!open) setPendingToggle(null)
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{pendingToggle?.enabled ? "确认开启模块" : "确认关闭模块"}</AlertDialogTitle>
						<AlertDialogDescription>
							{pendingToggle
								? pendingToggle.enabled
									? `开启后「${pendingToggle.module.name}」的页面入口和路由会对所有账号立即可用。`
									: `关闭后「${pendingToggle.module.name}」的页面入口和路由将对所有账号隐藏，依赖它的模块也会显示为受阻。`
								: ""}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>取消</AlertDialogCancel>
						<AlertDialogAction
							className={cn(!pendingToggle?.enabled && buttonVariants({ variant: "destructive" }))}
							onClick={() => {
								if (pendingToggle) {
									setModuleEnabled(pendingToggle.module.id, pendingToggle.enabled).catch(console.error)
								}
								setPendingToggle(null)
							}}
						>
							{pendingToggle?.enabled ? "确认开启" : "确认关闭"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}

function ModuleRow({
	module,
	state,
	loading,
	canManage,
	onToggle,
}: {
	module: PulseModuleManifest
	state: ReturnType<typeof getModuleState>
	loading: boolean
	canManage: boolean
	onToggle: (enabled: boolean) => void
}) {
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
				<div className="flex items-center justify-between gap-3 xl:justify-end">
					<div className="text-right text-xs text-muted-foreground">
						<div>{module.required ? "基础模块，始终开启" : state.effectiveEnabled ? "已开启" : "已关闭"}</div>
						{!module.required && <div>管理员统一控制，所有账号同时生效</div>}
					</div>
					{module.required ? (
						<LockIcon className="size-4 shrink-0 text-muted-foreground" aria-label="必需模块" />
					) : (
						<Switch
							checked={state.enabled}
							disabled={!canManage || loading}
							aria-label={`${module.name}开关`}
							onCheckedChange={onToggle}
						/>
					)}
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
			<DetailRow label="检查范围" values={module.healthChecks} empty="未登记检查范围" />
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
