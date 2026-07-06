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
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/use-toast"
import { pb } from "@/lib/api"
import type { AITaskRecord } from "@/types"

type AssetEnrichmentConfig = {
	base_url: string
	base_url_host: string
	api_key: string
	api_key_configured: boolean
	ai: AIProviderConfig
	visual_ai: AIProviderConfig & {
		frame_count: number
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
	aiProvider: string
	aiEndpoint: string
	aiModel: string
	aiApiKey: string
	visualEnabled: boolean
	visualProvider: string
	visualEndpoint: string
	visualModel: string
	visualApiKey: string
	frameCount: number
}

const defaultForm: AISettingsForm = {
	baseUrl: "https://apihub.agnes-ai.com/v1",
	apiKey: "",
	aiEnabled: false,
	aiProvider: "agnes",
	aiEndpoint: "https://apihub.agnes-ai.com/v1/chat/completions",
	aiModel: "agnes-2.0-flash",
	aiApiKey: "",
	visualEnabled: false,
	visualProvider: "agnes",
	visualEndpoint: "https://apihub.agnes-ai.com/v1/images/generations",
	visualModel: "agnes-image-2.1-flash",
	visualApiKey: "",
	frameCount: 6,
}

export default function AISettings() {
	const [config, setConfig] = useState<AssetEnrichmentConfig | null>(null)
	const [form, setForm] = useState<AISettingsForm>(defaultForm)
	const [aiTasks, setAiTasks] = useState<AITaskRecord[]>([])
	const [loading, setLoading] = useState(true)
	const [saving, setSaving] = useState(false)

	const readyCount = useMemo(() => {
		if (!config) return 0
		return [
			config.base_url && config.api_key_configured,
			config.base_url && config.api_key_configured && config.visual_ai.model,
		].filter(Boolean).length
	}, [config])
	const textAccessReady = Boolean(config?.base_url && config?.api_key_configured)
	const imageAccessReady = Boolean(config?.base_url && config?.api_key_configured)
	const latestEnrichmentTask = aiTasks.find((task) => task.kind === "asset_enrichment")
	const latestVisualTask = aiTasks.find((task) => task.kind === "asset_visual")

	useEffect(() => {
		loadConfig()
	}, [])

	async function loadConfig() {
		setLoading(true)
		try {
			const next = await pb.send<AssetEnrichmentConfig>("/api/pulse/asset-enrichment/config", { requestKey: null })
			setConfig(next)
			setForm(formFromConfig(next))
			setAiTasks(await loadRecentAITasks())
		} catch {
			toast({ title: "读取 AI 与识别设置失败", description: "请确认当前账号拥有管理员权限。", variant: "destructive" })
		} finally {
			setLoading(false)
		}
	}

	async function saveConfig() {
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
					},
					visual_ai: {
						enabled: form.visualEnabled,
						provider: "agnes",
						model: form.visualModel,
						api_key: form.visualApiKey,
						frame_count: form.frameCount,
					},
				},
			})
			setConfig(next)
			setForm(formFromConfig(next))
			setAiTasks(await loadRecentAITasks())
			toast({ title: "AI 与识别设置已保存", description: "后续资产补全会统一交给资料补全 Agent 处理。" })
		} catch (error) {
			toast({
				title: "保存 AI 与识别设置失败",
				description: getConfigErrorMessage(error),
				variant: "destructive",
			})
		} finally {
			setSaving(false)
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
								<h3 className="mt-1 text-xl font-semibold tracking-tight text-foreground">AI 与识别</h3>
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
								description="只配置这个 Agent 的任务行为。它优先收集官方 / 可追溯真实图片，图片模型只作为后续一致性整理预留。"
							>
								<div className="grid gap-4">
									<ToggleRow
										label="启用设备图片 Agent"
										description="关闭后不再收集新的设备图片；收集时优先使用已确认官方图片、厂家支持页和官网图片。"
										checked={form.visualEnabled}
										onCheckedChange={(value) => setForm((current) => ({ ...current, visualEnabled: value }))}
									/>
									<AgentModelField
										label="一致性整理模型"
										value={form.visualModel}
										onChange={(value) => setForm((current) => ({ ...current, visualModel: value }))}
										placeholder="agnes-image-2.1-flash"
									/>
									<div className="rounded-lg border border-border/70 bg-surface-soft p-3">
										<Label htmlFor="visual-frame-count" className="text-xs">
											图片收集上限
										</Label>
										<Input id="visual-frame-count" type="number" min={6} max={6} value={6} readOnly className="mt-2" />
										<p className="mt-2 text-xs leading-relaxed text-muted-foreground">
											最多收集 6 张真实设备图片。当前不再生成 3D 或固定视角图。
										</p>
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
							title="图片模型接入"
							value={imageAccessReady ? "已配置" : "未配置"}
							active={imageAccessReady}
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
		const records = await pb.collection<AITaskRecord>("ai_tasks").getFullList({
			sort: "-created",
			requestKey: null,
		})
		return records
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
	return "请检查 endpoint、模型参数和管理员权限。"
}

function formFromConfig(config: AssetEnrichmentConfig): AISettingsForm {
	return {
		...defaultForm,
		baseUrl: config.base_url || defaultForm.baseUrl,
		apiKey: config.api_key || "",
		aiEnabled: config.ai.enabled,
		aiProvider: config.ai.provider || defaultForm.aiProvider,
		aiEndpoint: config.ai.endpoint || defaultForm.aiEndpoint,
		aiModel: config.ai.model || defaultForm.aiModel,
		aiApiKey: config.api_key || config.ai.api_key || "",
		visualEnabled: config.visual_ai.enabled,
		visualEndpoint: config.visual_ai.endpoint || defaultForm.visualEndpoint,
		visualModel: config.visual_ai.model || defaultForm.visualModel,
		visualApiKey: config.api_key || config.visual_ai.api_key || "",
		frameCount: defaultForm.frameCount,
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
						{task ? getAITaskStatusLabel(task.status) : "暂无任务"}
					</div>
					<div className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
						{task ? getAITaskSummary(task) : "还没有手动触发过这个 Agent。"}
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

function getAITaskStatusLabel(status?: AITaskRecord["status"]) {
	switch (status) {
		case "ready":
			return "成功"
		case "applied":
			return "已处理"
		case "failed":
			return "失败"
		case "running":
			return "运行中"
		case "queued":
			return "排队中"
		default:
			return "未知"
	}
}

function getAITaskSummary(task: AITaskRecord) {
	if (task.status === "failed") {
		return task.error || "任务失败，未返回具体错误。"
	}
	if (task.kind === "asset_enrichment") {
		const suggestions = numberFromRecord(task.output_summary, "ai_suggestions")
		const total = numberFromRecord(task.output_summary, "total_suggestions")
		return `${task.provider || "未知服务"} / ${task.model || "未知模型"} · AI 建议 ${suggestions} 条 · 总建议 ${total} 条`
	}
	if (task.kind === "asset_visual") {
		const collected = numberFromRecord(task.output_summary, "collected_images")
		const legacyFrames = numberFromRecord(task.output_summary, "generated_frames")
		if (collected > 0) {
			return `设备图片 Agent · 收集 ${collected} 张`
		}
		return `${task.provider || "未知服务"} / ${task.model || "未知模型"} · 历史生成 ${legacyFrames} 帧`
	}
	return `${task.provider || "未知服务"} / ${task.model || "未知模型"}`
}

function numberFromRecord(record: Record<string, unknown> | undefined, key: string) {
	const value = record?.[key]
	return typeof value === "number" && Number.isFinite(value) ? value : 0
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
}: {
	label: string
	description: string
	checked: boolean
	onCheckedChange: (value: boolean) => void
}) {
	return (
		<div className="flex items-start justify-between gap-4 rounded-lg border border-border/70 bg-surface-soft p-3">
			<div className="min-w-0">
				<div className="text-sm font-semibold text-foreground">{label}</div>
				<p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
			</div>
			<Switch checked={checked} onCheckedChange={onCheckedChange} />
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
