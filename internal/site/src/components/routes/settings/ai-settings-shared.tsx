import { AlertCircleIcon, CheckCircle2Icon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { loadLatestAITasksByKind } from "@/modules/asset-center/asset-ai-task-query"
import { formatAITaskStatusLabel, formatAITaskSummary } from "@/modules/asset-center/asset-ai-task-summary"
import { aiModelHint, aiModelOptionLabel, describeAIModel } from "@/modules/asset-center/asset-ai-model-catalog"
import type { AITaskRecord } from "@/types"
import { pb } from "@/lib/api"

// 2026-10-09 梳理⑥：设置拆分为「AI 服务接入」（settings/ai）与「资产中心配置」（settings/asset-config）
// 两页后的共享 UI 组件与工具。两页独立读写同一份 /api/pulse/asset-enrichment/config；
// 后端为增量合并语义（空字段=保持已存值），因此两页各自保存不会互相覆盖。

export async function loadRecentAITasks() {
	try {
		return await loadLatestAITasksByKind(pb.collection<AITaskRecord>("ai_tasks"))
	} catch {
		return []
	}
}

export function getConfigErrorMessage(error: unknown) {
	if (typeof error === "object" && error !== null) {
		const response = "response" in error ? (error as { response?: unknown }).response : undefined
		if (typeof response === "object" && response !== null) {
			const message = "message" in response ? (response as { message?: unknown }).message : undefined
			if (typeof message === "string" && message.trim()) {
				return message.trim()
			}
		}
		const message = "message" in error ? (error as { message?: unknown }).message : undefined
		if (typeof message === "string" && message.trim()) {
			return message.trim()
		}
	}
	return "请检查 Agnes Base URL、模型参数和管理员权限。"
}

export function ToggleRow({
	label,
	description,
	checked,
	onCheckedChange,
	disabled = false,
}: {
	label: string
	description: string
	checked: boolean
	onCheckedChange: (value: boolean) => void
	disabled?: boolean
}) {
	return (
		<div className="flex items-start justify-between gap-4 rounded-lg border border-border/70 bg-surface-soft p-3">
			<div className="min-w-0">
				<div className="text-sm font-semibold text-foreground">{label}</div>
				<p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
			</div>
			<Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
		</div>
	)
}

export function AgentModelField({
	label,
	value,
	onChange,
	placeholder,
	requirements = [],
	options,
}: {
	label: string
	value: string
	onChange: (value: string) => void
	placeholder: string
	requirements?: string[]
	/** 官方模型列表（来自「AI 服务接入」页获取）；有值时渲染为下拉选择 */
	options?: string[]
}) {
	// 当前值不在官方列表时兜底显示，避免保存过的自定义模型名被下拉吞掉
	const normalizedOptions =
		options && options.length > 0 ? (value && !options.includes(value) ? [value, ...options] : options) : undefined
	const hint = value ? aiModelHint(value) : ""
	return (
		<div className="rounded-lg border border-border/70 bg-surface-soft p-3">
			<Label className="text-xs">{label}</Label>
			{normalizedOptions ? (
				<select
					value={value || ""}
					onChange={(event) => onChange(event.target.value)}
					className="mt-2 flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-none transition-[border-color,background-color] duration-150 ease-out focus-visible:border-ring/70 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/15 focus-visible:ring-offset-0"
				>
					{!value ? <option value="">请选择模型</option> : null}
					{normalizedOptions.map((item) => (
						<option key={item} value={item}>
							{aiModelOptionLabel(item)}
						</option>
					))}
				</select>
			) : (
				<Input
					value={value}
					onChange={(event) => onChange(event.target.value)}
					placeholder={placeholder}
					className="mt-2"
				/>
			)}
			{hint ? (
				<p
					className={
						describeAIModel(value)?.free
							? "mt-2 text-xs leading-relaxed text-emerald-700"
							: "mt-2 text-xs leading-relaxed text-muted-foreground"
					}
				>
					{hint}
				</p>
			) : null}
			{requirements.length > 0 && (
				<ul className="mt-2 grid gap-1 text-xs leading-relaxed text-muted-foreground">
					{requirements.map((item) => (
						<li key={item} className="flex items-start gap-1.5">
							<span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground/60" />
							<span>{item}</span>
						</li>
					))}
				</ul>
			)}
			<p className="mt-2 text-xs leading-relaxed text-muted-foreground">
				{normalizedOptions
					? "从官方模型列表中选择能力执行时使用的模型；在「AI 服务接入」页可重新获取列表。"
					: "这是能力执行时使用的模型名，不是接入密钥配置；flash 档即可满足要求。"}
			</p>
		</div>
	)
}

export function NumberSetting({
	label,
	value,
	min,
	max,
	onChange,
}: {
	label: string
	value: number
	min: number
	max: number
	onChange: (value: number) => void
}) {
	return (
		<div className="rounded-lg border border-border/70 bg-surface-soft p-3">
			<Label className="text-xs">{label}</Label>
			<Input
				type="number"
				min={min}
				max={max}
				value={value}
				onChange={(event) => onChange(clampNumber(Number(event.target.value), min, max))}
				className="mt-2"
			/>
		</div>
	)
}

export function StatusChip({ label, value, active }: { label: string; value: string; active?: boolean }) {
	return (
		<div className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border/70 bg-surface-soft px-3 text-xs font-medium">
			<span className="text-muted-foreground">{label}</span>
			<span className={active ? "text-emerald-700" : "text-foreground"}>{value}</span>
		</div>
	)
}

export function AgentTaskStatusCard({ title, task }: { title: string; task?: AITaskRecord }) {
	const failed = task?.status === "failed"
	const ready = task?.status === "ready" || task?.status === "applied"
	return (
		<div className="rounded-lg border border-border/70 bg-surface-soft p-3">
			<div className="flex items-start gap-2">
				<div
					className={
						failed
							? "grid size-8 shrink-0 place-items-center rounded-md border border-red-200 bg-red-50 text-red-700"
							: ready
								? "grid size-8 shrink-0 place-items-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700"
								: "grid size-8 shrink-0 place-items-center rounded-md border border-border/70 bg-card text-muted-foreground"
					}
				>
					{failed ? <AlertCircleIcon className="size-4" /> : <CheckCircle2Icon className="size-4" />}
				</div>
				<div className="min-w-0">
					<div className="text-xs text-muted-foreground">{title}</div>
					<div
						className={
							failed ? "mt-0.5 text-sm font-semibold text-red-700" : "mt-0.5 text-sm font-semibold text-foreground"
						}
					>
						{task ? formatAITaskStatusLabel(task.status) : "暂无任务"}
					</div>
					<div className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
						{task ? formatAITaskSummary(task) : "还没有手动触发过这个能力。"}
					</div>
					{task?.created ? (
						<div className="mt-1 text-xs text-muted-foreground">{formatTaskTime(task.created)}</div>
					) : null}
				</div>
			</div>
		</div>
	)
}

function clampNumber(value: number, min: number, max: number) {
	if (!Number.isFinite(value)) return min
	return Math.max(min, Math.min(max, Math.round(value)))
}

function formatTaskTime(value: string) {
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return value
	return date.toLocaleString()
}
