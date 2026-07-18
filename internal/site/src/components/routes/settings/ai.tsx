import {
	AlertCircleIcon,
	BrainCircuitIcon,
	CheckCircle2Icon,
	EyeIcon,
	EyeOffIcon,
	ImageIcon,
	KeyRoundIcon,
	RefreshCwIcon,
	ShieldCheckIcon,
	SparklesIcon,
} from "lucide-react"
import type { ComponentType, ReactNode, SVGProps } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/use-toast"
import { pb } from "@/lib/api"
import { createLatestRequestGuard } from "@/lib/latest-request-guard"
import { loadLatestAITasksByKind } from "@/modules/asset-center/asset-ai-task-query"
import { AssetMediaStoreSettingsPanel } from "@/modules/asset-center/components/asset-media-store-settings-panel"
import { formatAITaskStatusLabel, formatAITaskSummary } from "@/modules/asset-center/asset-ai-task-summary"
import type { AITaskRecord } from "@/types"
import { loadAISettingsSnapshot } from "./ai-settings-load"

type AssetEnrichmentConfig = {
	base_url: string
	base_url_host: string
	api_key: string
	api_key_configured: boolean
	ai: AIProviderConfig & {
		source_discovery_enabled: boolean
		max_sources: number
	}
	visual_ai: AIProviderConfig & {
		frame_count: number
		max_images: number
	}
}

type AIProviderConfig = {
	enabled: boolean
	provider: string
	endpoint: string
	endpoint_configured: boolean
	endpoint_host: string
	api_key: string
	api_key_configured: boolean
	model: string
	ready: boolean
}

type AISettingsForm = {
	baseUrl: string
	apiKey: string
	aiEnabled: boolean
	aiModel: string
	aiApiKey: string
	aiSourceDiscoveryEnabled: boolean
	aiMaxSources: number
	visualEnabled: boolean
	visualModel: string
	visualApiKey: string
	visualMaxImages: number
}

const defaultForm: AISettingsForm = {
	baseUrl: "https://apihub.agnes-ai.com/v1",
	apiKey: "",
	aiEnabled: false,
	aiModel: "agnes-2.0-flash",
	aiApiKey: "",
	aiSourceDiscoveryEnabled: true,
	aiMaxSources: 5,
	visualEnabled: false,
	visualModel: "agnes-2.0-flash",
	visualApiKey: "",
	visualMaxImages: 15,
}

export default function AISettings() {
	const [config, setConfig] = useState<AssetEnrichmentConfig | null>(null)
	const [form, setForm] = useState<AISettingsForm>(defaultForm)
	const [aiTasks, setAiTasks] = useState<AITaskRecord[]>([])
	const [loading, setLoading] = useState(true)
	const [saving, setSaving] = useState(false)
	const latestLoad = useRef(createLatestRequestGuard())

	const readyCount = useMemo(() => {
		if (!config) return 0
		return [config.base_url && config.api_key_configured, config.visual_ai.enabled].filter(Boolean).length
	}, [config])
	const textAccessReady = Boolean(config?.base_url && config?.api_key_configured)
	const latestEnrichmentTask = aiTasks.find((task) => task.kind === "asset_enrichment")
	const latestVisualTask = aiTasks.find((task) => task.kind === "asset_visual")

	const loadConfig = useCallback(async () => {
		const request = latestLoad.current.begin()
		setLoading(true)
		try {
			const { config: next, tasks } = await loadAISettingsSnapshot(
				() => pb.send<AssetEnrichmentConfig>("/api/pulse/asset-enrichment/config", { requestKey: null }),
				loadRecentAITasks
			)
			if (!latestLoad.current.isCurrent(request)) return
			setConfig(next)
			setForm(formFromConfig(next))
			setAiTasks(tasks)
		} catch {
			if (!latestLoad.current.isCurrent(request)) return
			toast({ title: "读取 AI 与识别设置失败", description: "请确认当前账号拥有管理员权限。", variant: "destructive" })
		} finally {
			if (latestLoad.current.isCurrent(request)) setLoading(false)
		}
	}, [])

	useEffect(() => {
		loadConfig()
	}, [loadConfig])

	async function saveConfig() {
		const request = latestLoad.current.begin()
		setSaving(true)
		try {
			const next = await pb.send<AssetEnrichmentConfig>("/api/pulse/asset-enrichment/config", {
				method: "POST",
				body: {
					base_url: form.baseUrl,
					api_key: form.apiKey,
					ai: {
						enabled: form.aiEnabled,
						provider: "agnes",
						model: form.aiModel,
						api_key: form.aiApiKey,
						source_discovery_enabled: form.aiSourceDiscoveryEnabled,
						max_sources: form.aiMaxSources,
					},
					visual_ai: {
						enabled: form.visualEnabled,
						provider: "agnes",
						model: form.visualModel,
						api_key: form.visualApiKey,
						max_images: form.visualMaxImages,
					},
				},
			})
			if (!latestLoad.current.isCurrent(request)) return
			setConfig(next)
			setForm(formFromConfig(next))
			const tasks = await loadRecentAITasks()
			if (!latestLoad.current.isCurrent(request)) return
			setAiTasks(tasks)
			toast({ title: "AI 与识别设置已保存", description: "后续资产补全会统一交给资料补全 Agent 处理。" })
		} catch (error) {
			if (!latestLoad.current.isCurrent(request)) return
			toast({
				title: "保存 AI 与识别设置失败",
				description: getConfigErrorMessage(error),
				variant: "destructive",
			})
		} finally {
			if (latestLoad.current.isCurrent(request)) setSaving(false)
		}
	}

	return (
		<div className="grid gap-4 md:gap-5">
			<section className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-none">
				<div className="border-b border-border/70 bg-card px-4 py-3 md:px-5 md:py-4">
					<div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
						<div className="flex min-w-0 gap-3">
							<div className="grid size-10 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft text-muted-foreground">
								<BrainCircuitIcon className="size-4" />
							</div>
							<div className="min-w-0">
								<div className="text-xs font-medium text-muted-foreground">资产中心</div>
								<h3 className="mt-1 text-xl font-semibold text-foreground">AI 与识别</h3>
								<p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
									配置资产资料补全 Agent 和设备图片收集能力。管理员可查看当前项目专用 Agnes Key。
								</p>
							</div>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<StatusChip label="可用项" value={loading ? "读取中" : `${readyCount} / 2`} active={readyCount >= 1} />
							<Button variant="outline" size="sm" onClick={loadConfig} disabled={loading || saving}>
								<RefreshCwIcon className="mr-1.5 size-3.5" />
								刷新
							</Button>
							<Button size="sm" onClick={saveConfig} disabled={loading || saving}>
								<CheckCircle2Icon className="mr-1.5 size-3.5" />
								{saving ? "保存中" : "保存设置"}
							</Button>
						</div>
					</div>
				</div>
				<div className="grid gap-4 p-4 md:p-5">
					<div className="grid gap-4">
						<AssetMediaStoreSettingsPanel />
						<SettingsPanel
							icon={BrainCircuitIcon}
							title="大模型接入配置"
							description="按 Agnes 官方 OpenAI-compatible 方式只配置一个 Base URL 和一个 API Key。Agent 自己决定调用文本或图片接口。"
						>
							<ModelAccessForm
								baseUrl={form.baseUrl}
								onBaseUrlChange={(value) => setForm((current) => ({ ...current, baseUrl: value }))}
								apiKey={form.apiKey}
								onApiKeyChange={(value) =>
									setForm((current) => ({
										...current,
										apiKey: value,
										aiApiKey: value,
										visualApiKey: value,
									}))
								}
								configured={config?.api_key_configured}
								baseUrlHost={config?.base_url_host}
							/>
						</SettingsPanel>

						<div className="grid gap-4 xl:grid-cols-2">
							<SettingsPanel
								icon={SparklesIcon}
								title="资料补全 Agent"
								description="只配置这个 Agent 的任务行为。它会调用文本模型接入，负责搜索、核对、合并本地采集和公开资料，并输出待确认建议。"
							>
								<div className="grid gap-4">
									<ToggleRow
										label="启用资料补全 Agent"
										description="关闭后不再生成新的资料补全报告；已有报告和已确认主档不受影响。"
										checked={form.aiEnabled}
										onCheckedChange={(value) => setForm((current) => ({ ...current, aiEnabled: value }))}
									/>
									<AgentModelField
										label="执行模型"
										value={form.aiModel}
										onChange={(value) => setForm((current) => ({ ...current, aiModel: value }))}
										placeholder="agnes-2.0-flash"
									/>
									<ToggleRow
										label="启用模型来源发现"
										description="主档没有支持页或产品页时，先让资料补全 Agent 找官网、支持页、规格页和说明书 URL，再由 Hub 抓取校验。"
										checked={form.aiSourceDiscoveryEnabled}
										onCheckedChange={(value) => setForm((current) => ({ ...current, aiSourceDiscoveryEnabled: value }))}
									/>
									<NumberSetting
										label="可信来源上限"
										value={form.aiMaxSources}
										min={2}
										max={10}
										onChange={(value) => setForm((current) => ({ ...current, aiMaxSources: value }))}
									/>
									<div className="rounded-md border border-border/70 bg-surface-soft p-3 text-xs leading-relaxed text-muted-foreground">
										执行口径：优先使用资产主档里的厂商、型号、内部型号、支持页、本地 Agent
										采集结果；需要外部资料时由资料补全 Agent
										优先查找厂家官网、官方支持页、官方规格页、说明书和官方图片，
										规格库只做交叉验证。字段建议必须带可追溯来源，仍需人工确认后才写回主档。
									</div>
								</div>
							</SettingsPanel>

							<SettingsPanel
								icon={ImageIcon}
								title="设备图片 Agent"
								description="它只从官方页面收集真实图片；模型仅负责审核候选是否匹配资产型号、外观和颜色，不生成图片或查找链接。"
							>
								<div className="grid gap-4">
									<ToggleRow
										label="启用设备图片 Agent"
										description="关闭后不再收集新的设备图片；执行时优先使用已确认官方图片、厂家支持页和官网图片。"
										checked={form.visualEnabled}
										onCheckedChange={(value) => setForm((current) => ({ ...current, visualEnabled: value }))}
									/>
									<AgentModelField
										label="图片准确性校验模型"
										value={form.visualModel}
										onChange={(value) => setForm((current) => ({ ...current, visualModel: value }))}
										placeholder="agnes-2.0-flash"
									/>
									<ToggleRow
										label="官方来源规则"
										description="图片只会从厂商或服务商官网的产品页、支持页、媒体资源或已确认官方图片地址中采集。"
										checked
										onCheckedChange={() => undefined}
										disabled
									/>
									<NumberSetting
										label="候选图片数量"
										value={form.visualMaxImages}
										min={2}
										max={15}
										onChange={(value) => setForm((current) => ({ ...current, visualMaxImages: value }))}
									/>
									<div className="rounded-md border border-border/70 bg-surface-soft p-3 text-xs leading-relaxed text-muted-foreground">
										执行口径：Hub
										只从已维护的官方页面提取图片，先做图片解码、尺寸、重复、水印与型号规则校验；配置模型后，模型只负责判断候选是否与当前资产的型号、外观和颜色一致。最终由用户选择
										1 张作为设备主图。
									</div>
								</div>
							</SettingsPanel>
						</div>
					</div>

					<div className="grid gap-3 md:grid-cols-2">
						<ConfigStatusCard
							icon={SparklesIcon}
							title="文本模型接入"
							value={textAccessReady ? "已配置" : "未配置"}
							active={textAccessReady}
						/>
						<ConfigStatusCard
							icon={ImageIcon}
							title="图片收集能力"
							value={form.visualEnabled ? "已启用" : "未启用"}
							active={form.visualEnabled}
						/>
					</div>
					<div className="grid gap-3 md:grid-cols-2">
						<AgentTaskStatusCard title="资料补全 Agent" task={latestEnrichmentTask} />
						<AgentTaskStatusCard title="设备图片 Agent" task={latestVisualTask} />
					</div>

					<div className="flex items-start gap-2 rounded-lg border border-border/70 bg-surface-soft p-3 text-xs leading-relaxed text-muted-foreground">
						<ShieldCheckIcon className="mt-0.5 size-4 shrink-0" />
						<span>
							手动触发资产补全时统一调用资料补全 Agent；所有结果只进入报告和待确认建议，不会自动覆盖资产主档。
						</span>
					</div>
				</div>
			</section>
		</div>
	)
}

async function loadRecentAITasks() {
	try {
		return await loadLatestAITasksByKind(pb.collection<AITaskRecord>("ai_tasks"))
	} catch {
		return []
	}
}

function getConfigErrorMessage(error: unknown) {
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

function formFromConfig(config: AssetEnrichmentConfig): AISettingsForm {
	return {
		...defaultForm,
		baseUrl: config.base_url || defaultForm.baseUrl,
		apiKey: config.api_key || "",
		aiEnabled: config.ai.enabled,
		aiModel: config.ai.model || defaultForm.aiModel,
		aiApiKey: config.api_key || config.ai.api_key || "",
		aiSourceDiscoveryEnabled: config.ai.source_discovery_enabled ?? defaultForm.aiSourceDiscoveryEnabled,
		aiMaxSources: config.ai.max_sources || defaultForm.aiMaxSources,
		visualEnabled: config.visual_ai.enabled,
		visualModel: config.visual_ai.model || defaultForm.visualModel,
		visualApiKey: config.api_key || config.visual_ai.api_key || "",
		visualMaxImages: config.visual_ai.max_images || defaultForm.visualMaxImages,
	}
}

function ConfigStatusCard({
	icon: Icon,
	title,
	value,
	active,
}: {
	icon: ComponentType<SVGProps<SVGSVGElement>>
	title: string
	value: string
	active?: boolean
}) {
	return (
		<div className="rounded-lg border border-border/70 bg-surface-soft p-3">
			<div className="flex items-center gap-2">
				<div className="grid size-8 place-items-center rounded-md border border-border/70 bg-card text-muted-foreground">
					<Icon className="size-4" />
				</div>
				<div className="min-w-0">
					<div className="truncate text-xs text-muted-foreground">{title}</div>
					<div className={active ? "text-sm font-semibold text-emerald-700" : "text-sm font-semibold text-foreground"}>
						{value}
					</div>
				</div>
			</div>
		</div>
	)
}

function AgentTaskStatusCard({ title, task }: { title: string; task?: AITaskRecord }) {
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
						{task ? formatAITaskSummary(task) : "还没有手动触发过这个 Agent。"}
					</div>
					{task?.created ? (
						<div className="mt-1 text-xs text-muted-foreground">{formatTaskTime(task.created)}</div>
					) : null}
				</div>
			</div>
		</div>
	)
}

function StatusChip({ label, value, active }: { label: string; value: string; active?: boolean }) {
	return (
		<div className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border/70 bg-surface-soft px-3 text-xs font-medium">
			<span className="text-muted-foreground">{label}</span>
			<span className={active ? "text-emerald-700" : "text-foreground"}>{value}</span>
		</div>
	)
}

function formatTaskTime(value: string) {
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return value
	return date.toLocaleString()
}

function SettingsPanel({
	icon: Icon,
	title,
	description,
	children,
	className = "",
}: {
	icon: ComponentType<SVGProps<SVGSVGElement>>
	title: string
	description: string
	children: ReactNode
	className?: string
}) {
	return (
		<section className={`rounded-lg border border-border/70 bg-card p-4 shadow-none ${className}`}>
			<div className="mb-4 flex min-w-0 items-start gap-3">
				<div className="grid size-9 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft text-muted-foreground">
					<Icon className="size-4" />
				</div>
				<div className="min-w-0">
					<div className="font-semibold text-foreground">{title}</div>
					<p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
				</div>
			</div>
			{children}
		</section>
	)
}

function ToggleRow({
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

function ModelAccessForm({
	baseUrl,
	onBaseUrlChange,
	apiKey,
	onApiKeyChange,
	configured,
	baseUrlHost,
}: {
	baseUrl: string
	onBaseUrlChange: (value: string) => void
	apiKey: string
	onApiKeyChange: (value: string) => void
	configured?: boolean
	baseUrlHost?: string
}) {
	return (
		<div className="grid gap-4 rounded-lg border border-border/70 bg-surface-soft p-3">
			<div className="min-w-0">
				<div className="text-sm font-semibold text-foreground">Agnes 接入</div>
				<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
					项目专用 Agnes 接入。Base URL 固定使用官方 OpenAI-compatible 根地址，文本和图片接口由 Hub 自动拼接。
				</p>
			</div>
			<div className="grid gap-2">
				<Label className="text-xs">服务商</Label>
				<div className="flex h-10 items-center rounded-md border border-border/70 bg-card px-3.5 text-sm font-medium text-foreground">
					Agnes
				</div>
			</div>
			<div className="grid gap-2">
				<Label className="text-xs">Base URL</Label>
				<Input
					value={baseUrl}
					onChange={(event) => onBaseUrlChange(event.target.value)}
					placeholder="https://apihub.agnes-ai.com/v1"
				/>
				{baseUrlHost ? <div className="text-xs text-muted-foreground">当前 host：{baseUrlHost}</div> : null}
			</div>
			<SecretField
				id="agnes-api-key"
				label="API Key"
				placeholder={configured ? "已配置，留空保持不变" : "未配置"}
				value={apiKey}
				onChange={onApiKeyChange}
				configured={configured}
			/>
		</div>
	)
}

function AgentModelField({
	label,
	value,
	onChange,
	placeholder,
}: {
	label: string
	value: string
	onChange: (value: string) => void
	placeholder: string
}) {
	return (
		<div className="rounded-lg border border-border/70 bg-surface-soft p-3">
			<Label className="text-xs">{label}</Label>
			<Input
				value={value}
				onChange={(event) => onChange(event.target.value)}
				placeholder={placeholder}
				className="mt-2"
			/>
			<p className="mt-2 text-xs leading-relaxed text-muted-foreground">
				这是 Agent 执行任务时使用的模型，不是接入密钥配置。
			</p>
		</div>
	)
}

function NumberSetting({
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

function clampNumber(value: number, min: number, max: number) {
	if (!Number.isFinite(value)) return min
	return Math.max(min, Math.min(max, Math.round(value)))
}

function SecretField({
	id,
	label,
	placeholder,
	value,
	onChange,
	configured,
}: {
	id: string
	label: string
	placeholder: string
	value: string
	onChange: (value: string) => void
	configured?: boolean
}) {
	const [visible, setVisible] = useState(false)
	return (
		<div className="grid gap-2">
			<div className="flex items-center justify-between gap-3">
				<Label htmlFor={id} className="text-xs">
					{label}
				</Label>
				<div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
					<KeyRoundIcon className="size-3.5" />
					{configured ? "已配置" : "未配置"}
				</div>
			</div>
			<div className="relative">
				<Input
					id={id}
					type={visible ? "text" : "password"}
					value={value}
					placeholder={placeholder}
					onChange={(event) => onChange(event.target.value)}
					className="pr-11"
				/>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="absolute top-0 right-0 h-10 w-10 text-muted-foreground hover:text-foreground"
					onClick={() => setVisible((current) => !current)}
					disabled={!value}
					aria-label={visible ? "隐藏 API Key 原文" : "显示 API Key 原文"}
				>
					{visible ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
				</Button>
			</div>
		</div>
	)
}
