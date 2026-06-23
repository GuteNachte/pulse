import { t } from "@lingui/core/macro"
import { Plural, Trans } from "@lingui/react/macro"
import { lazy, Suspense, useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { LoadingState } from "@/components/ui/loading-state"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/use-toast"
import { alertInfo } from "@/lib/alerts"
import { pb } from "@/lib/api"
import { $systems } from "@/lib/stores"
import { cn, debounce } from "@/lib/utils"
import type { AlertInfo, AlertPolicyRecord, AlertRecord, SystemRecord } from "@/types"

const Slider = lazy(() => import("@/components/ui/slider"))

const endpoint = "/api/pulse/user-alerts"
const globalPoliciesEndpoint = "/api/pulse/alert-policies"

const alertDebounce = 400

const alertKeys = Object.keys(alertInfo) as (keyof typeof alertInfo)[]

const failedUpdateToast = (error: unknown) => {
	console.error(error)
	toast({
		title: t`Failed to update alert`,
		description: t`Please check logs for more details.`,
		variant: "destructive",
	})
}

/** Create or update alerts for a given name and systems */
const upsertAlerts = debounce(
	async ({ name, value, min, systems }: { name: string; value: number; min: number; systems: string[] }) => {
		try {
			await pb.send<{ success: boolean }>(endpoint, {
				method: "POST",
				// overwrite is always true because we've done filtering client side
				body: { name, value, min, systems, overwrite: true },
			})
		} catch (error) {
			failedUpdateToast(error)
		}
	},
	alertDebounce
)

/** Delete alerts for a given name and systems */
const deleteAlerts = debounce(async ({ name, systems }: { name: string; systems: string[] }) => {
	if (!systems.length) {
		return
	}
	try {
		await pb.send<{ success: boolean }>(endpoint, {
			method: "DELETE",
			body: { name, systems },
		})
	} catch (error) {
		failedUpdateToast(error)
	}
}, alertDebounce)

const upsertGlobalPolicy = debounce(async ({ name, value, min }: { name: string; value: number; min: number }) => {
	try {
		await pb.send<{ success: boolean }>(globalPoliciesEndpoint, {
			method: "POST",
			body: { name, value, min },
		})
	} catch (error) {
		failedUpdateToast(error)
	}
}, alertDebounce)

const deleteGlobalPolicy = debounce(async ({ name }: { name: string }) => {
	try {
		await pb.send<{ success: boolean }>(globalPoliciesEndpoint, {
			method: "DELETE",
			body: { name },
		})
	} catch (error) {
		failedUpdateToast(error)
	}
}, alertDebounce)

function policyToAlertRecord(policy: AlertPolicyRecord): AlertRecord {
	return {
		...policy,
		system: "",
		triggered: false,
	}
}

export function GlobalAlertSettings() {
	const [policies, setPolicies] = useState<Map<string, AlertPolicyRecord>>(new Map())
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		let cancelled = false
		async function loadPolicies() {
			try {
				const response = await pb.send<{ items: AlertPolicyRecord[] }>(globalPoliciesEndpoint, { method: "GET" })
				if (!cancelled) {
					setPolicies(new Map(response.items.map((policy) => [policy.name, policy])))
				}
			} catch (error) {
				if (!cancelled) {
					failedUpdateToast(error)
				}
			} finally {
				if (!cancelled) {
					setLoading(false)
				}
			}
		}
		loadPolicies()
		return () => {
			cancelled = true
		}
	}, [])

	const enabledCount = policies.size

	return (
		<div className="grid gap-4">
			<div className="grid gap-3 rounded-lg border border-border/70 bg-surface-soft p-3 shadow-none sm:p-4">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div className="min-w-0">
						<h3 className="text-base font-semibold sm:text-lg">所有机器资源告警规则</h3>
						<p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
							这里设置 CPU、内存、磁盘、网络、GPU 等基础资源的统一告警阈值，会应用到所有机器。
						</p>
					</div>
					<div className="w-fit shrink-0 rounded-md border border-border/70 bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-none tabular-nums">
						{loading ? "读取中" : `已启用 ${enabledCount} 项`}
					</div>
				</div>
				<div className="grid gap-3">
					{alertKeys.map((name) => {
						const policy = policies.get(name)
						return (
							<AlertContent
								key={`${name}-${policy?.value ?? "off"}-${policy?.min ?? "off"}`}
								alertKey={name}
								data={alertInfo[name as keyof typeof alertInfo]}
								alert={policy ? policyToAlertRecord(policy) : undefined}
								global
								overwriteExisting
								onGlobalUpsert={(payload) => {
									setPolicies((current) => {
										const next = new Map(current)
										const existing = next.get(payload.name)
										next.set(payload.name, {
											...existing,
											...payload,
											id: existing?.id ?? payload.name,
										} as AlertPolicyRecord)
										return next
									})
									upsertGlobalPolicy(payload)
								}}
								onGlobalDelete={(name) => {
									setPolicies((current) => {
										const next = new Map(current)
										next.delete(name)
										return next
									})
									deleteGlobalPolicy({ name })
								}}
							/>
						)
					})}
				</div>
			</div>
			<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
				<AlertCategoryCard title="网站告警" status="随监控启用" items={["可用性", "响应状态", "延迟"]} />
				<AlertCategoryCard title="容器告警" status="随容器监控启用" items={["运行状态", "健康检查", "编排聚合"]} />
				<AlertCategoryCard title="软件告警" status="随软件规则启用" items={["运行状态", "进程匹配"]} />
				<AlertCategoryCard title="服务告警" status="随服务规则启用" items={["运行状态", "服务控制"]} />
			</div>
		</div>
	)
}

function AlertCategoryCard({ title, status, items }: { title: string; status: string; items: string[] }) {
	const enabled = status !== "未启用"
	return (
		<div className="rounded-lg border border-border/70 bg-card p-3 shadow-none transition-[background-color,border-color] duration-150 ease-out hover:border-foreground/10 hover:bg-surface-soft">
			<div className="mb-2 flex items-center justify-between gap-2">
				<div className="font-medium">{title}</div>
				<div
					className={cn(
						"rounded-md border px-2 py-0.5 text-xs font-medium",
						enabled
							? "border-emerald-500/25 bg-card text-emerald-700 dark:text-emerald-300"
							: "border-border/70 bg-surface-soft text-muted-foreground"
					)}
				>
					{status}
				</div>
			</div>
			<div className="flex flex-wrap gap-1.5">
				{items.map((item) => (
					<span
						key={item}
						className="rounded-md border border-border/70 bg-surface-soft px-2 py-0.5 text-xs text-muted-foreground"
					>
						{item}
					</span>
				))}
			</div>
		</div>
	)
}

export function AlertContent({
	alertKey,
	data: alertData,
	system,
	alert,
	global = false,
	overwriteExisting = false,
	initialAlertsState = {},
	onGlobalUpsert,
	onGlobalDelete,
}: {
	alertKey: string
	data: AlertInfo
	system?: SystemRecord
	alert?: AlertRecord
	global?: boolean
	overwriteExisting?: boolean
	initialAlertsState?: Record<string, Map<string, AlertRecord>>
	onGlobalUpsert?: (payload: { name: string; value: number; min: number }) => void
	onGlobalDelete?: (name: string) => void
}) {
	const { name } = alertData

	const singleDescription = alertData.singleDesc?.()

	const [checked, setChecked] = useState(!!alert)
	const [min, setMin] = useState(alert?.min || 10)
	const [value, setValue] = useState(alert?.value || (singleDescription ? 0 : (alertData.start ?? 80)))

	const Icon = alertData.icon

	/** Get system ids to update */
	function getSystemIds(): string[] {
		// if not global, update only the current system
		if (!global) {
			return system ? [system.id] : []
		}
		// if global, update all systems when overwriteExisting is true
		// update only systems without an existing alert when overwriteExisting is false
		const allSystems = $systems.get()
		const systemIds: string[] = []
		for (const system of allSystems) {
			if (overwriteExisting || !initialAlertsState[system.id]?.has(alertKey)) {
				systemIds.push(system.id)
			}
		}
		return systemIds
	}

	function sendUpsert(min: number, value: number) {
		if (global && onGlobalUpsert) {
			onGlobalUpsert({ name: alertKey, value, min })
			return
		}
		const systems = getSystemIds()
		systems.length &&
			upsertAlerts({
				name: alertKey,
				value,
				min,
				systems,
			})
	}

	return (
		<div
			className={cn(
				"group rounded-lg border bg-card shadow-none transition-[background-color,border-color] duration-150 ease-out hover:border-foreground/10 hover:bg-surface-soft",
				checked ? "border-primary/30" : "border-border/70"
			)}
		>
			<label
				htmlFor={`s${name}`}
				className={cn("flex cursor-pointer flex-row items-start justify-between gap-4 p-3 sm:p-4", {
					"pb-0": checked,
				})}
			>
				<div className="grid min-w-0 gap-1 select-none">
					<p className="flex items-center gap-3 font-semibold">
						<span className="grid size-8 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft text-muted-foreground transition-colors group-hover:text-foreground">
							<Icon className="h-4 w-4 opacity-85" />
						</span>
						<span className="min-w-0 truncate">{alertData.name()}</span>
					</p>
					{!checked && <span className="block text-sm text-muted-foreground">{alertData.desc()}</span>}
				</div>
				<Switch
					id={`s${name}`}
					checked={checked}
					onCheckedChange={(newChecked) => {
						setChecked(newChecked)
						if (newChecked) {
							// if alert checked, create or update alert
							sendUpsert(min, value)
						} else {
							if (global && onGlobalDelete) {
								onGlobalDelete(alertKey)
								return
							}
							// if unchecked, delete alert (unless global and overwriteExisting is false)
							const systems = getSystemIds()
							if (systems.length) {
								deleteAlerts({ name: alertKey, systems })
							}
							// when force deleting all alerts of a type, also remove them from initialAlertsState
							if (overwriteExisting) {
								for (const curAlerts of Object.values(initialAlertsState)) {
									curAlerts.delete(alertKey)
								}
							}
						}
					}}
				/>
			</label>
			{checked && (
				<div className="mt-3 grid gap-4 border-t border-border/70 px-3 pb-4 pt-4 text-muted-foreground tabular-nums sm:grid-cols-2 sm:px-4 sm:pb-5">
					<Suspense fallback={<LoadingState compact title="正在加载阈值控件" />}>
						{!singleDescription && (
							<div>
								<p id={`v${name}`} className="text-sm block h-6">
									{alertData.invert ? (
										<Trans>
											Average drops below{" "}
											<strong className="text-foreground">
												{value}
												{alertData.unit}
											</strong>
										</Trans>
									) : (
										<Trans>
											Average exceeds{" "}
											<strong className="text-foreground">
												{value}
												{alertData.unit}
											</strong>
										</Trans>
									)}
								</p>
								<div className="flex items-center gap-3">
									<Slider
										aria-labelledby={`v${name}`}
										value={[value]}
										onValueCommit={(val) => sendUpsert(min, val[0])}
										onValueChange={(val) => setValue(val[0])}
										step={alertData.step ?? 1}
										min={alertData.min ?? 1}
										max={alertData.max ?? 99}
									/>
									<Input
										type="number"
										value={value}
										onChange={(e) => {
											let val = parseFloat(e.target.value)
											if (!Number.isNaN(val)) {
												if (alertData.max != null) val = Math.min(val, alertData.max)
												if (alertData.min != null) val = Math.max(val, alertData.min)
												setValue(val)
												sendUpsert(min, val)
											}
										}}
										step={alertData.step ?? 1}
										min={alertData.min ?? 1}
										max={alertData.max ?? 99}
										className="h-10 w-20 px-2 text-center"
									/>
								</div>
							</div>
						)}
						<div className={cn(singleDescription && "col-span-full lowercase")}>
							<p id={`t${name}`} className="text-sm block h-6 first-letter:uppercase">
								{singleDescription && (
									<>
										{singleDescription}
										{` `}
									</>
								)}
								<Trans>
									For <strong className="text-foreground">{min}</strong>{" "}
									<Plural value={min} one="minute" other="minutes" />
								</Trans>
							</p>
							<div className="flex items-center gap-3">
								<Slider
									aria-labelledby={`t${name}`}
									value={[min]}
									onValueCommit={(val) => sendUpsert(val[0], value)}
									onValueChange={(val) => setMin(val[0])}
									min={1}
									max={60}
								/>
								<Input
									type="number"
									value={min}
									onChange={(e) => {
										let val = parseInt(e.target.value, 10)
										if (!Number.isNaN(val)) {
											val = Math.max(1, Math.min(val, 60))
											setMin(val)
											sendUpsert(val, value)
										}
									}}
									min={1}
									max={60}
									className="h-10 w-20 px-2 text-center"
								/>
							</div>
						</div>
					</Suspense>
				</div>
			)}
		</div>
	)
}
