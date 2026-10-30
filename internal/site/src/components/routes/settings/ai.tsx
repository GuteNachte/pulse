import { ExternalLinkIcon, KeyRoundIcon, RefreshCwIcon } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/use-toast"
import { pb } from "@/lib/api"
import { createLatestRequestGuard } from "@/lib/latest-request-guard"
import { describeAIModel, isChatCapableAIModel } from "@/modules/asset-center/asset-ai-model-catalog"
import { StatusChip, getConfigErrorMessage } from "./ai-settings-shared"
import { SettingsField } from "./components/field-row"
import { SettingsSection, SettingsSectionStack } from "./components/section"

type AIProviderEndpoint = {
	url: string
	label: string
	modelsIntro: string
}

type AIProviderPreset = {
	id: string
	label: string
	/** 创建 API Key 的控制台直达地址 */
	keyUrl: string
	keyUrlLabel: string
	/** 官方定价页（模型表格脚注引用） */
	pricingUrl: string
	endpoints: AIProviderEndpoint[]
}

// 2026-10-09 梳理⑥补：服务商预设——按官方资料整理（端点、Key 页、模型与免费档口径，
// 2026-10-09 核实）。Agnes 因免费额度过低按用户决策移除；历史 agnes 配置回退显示为"自定义"。
const AI_PROVIDERS: AIProviderPreset[] = [
	{
		id: "zhipu",
		label: "智谱开放平台",
		keyUrl: "https://open.bigmodel.cn/usercenter/apikeys",
		keyUrlLabel: "前往智谱控制台创建 API Key",
		pricingUrl: "https://docs.bigmodel.cn/cn/guide/start/pricing",
		endpoints: [
			{
				url: "https://open.bigmodel.cn/api/paas/v4",
				label: "国内站（北京）",
				modelsIntro:
					"glm-5.3 全系按量计费（效果最好）；glm-4.7-flash 长期免费但未实名账号并发极低，实名后提升；模型列表中不含免费旧款，需手动填写。",
			},
		],
	},
	{
		id: "siliconflow",
		label: "硅基流动",
		keyUrl: "https://cloud.siliconflow.cn/account/ak",
		keyUrlLabel: "前往硅基流动创建 API 密钥",
		pricingUrl: "https://www.siliconflow.com/zh/pricing",
		endpoints: [
			{
				url: "https://api.siliconflow.cn/v1",
				label: "国内站",
				modelsIntro:
					"9B 及以下模型永久免费（推荐 Qwen/Qwen3-8B、THUDM/GLM-4-9B，模型列表里可直接选）；免费档速率约 2000 次/分钟，家庭使用足够稳定；注册送 2000 万 token 可用于更大的付费模型。",
			},
		],
	},
	{
		id: "deepseek",
		label: "DeepSeek",
		keyUrl: "https://platform.deepseek.com/api_keys",
		keyUrlLabel: "前往 DeepSeek 平台创建 API Key",
		pricingUrl: "https://api-docs.deepseek.com/quick_start/pricing",
		endpoints: [
			{
				url: "https://api.deepseek.com/v1",
				label: "官方站",
				modelsIntro:
					"deepseek-chat / deepseek-reasoner 按量计费，价格极低（充值 10 元可用很久），中文与推理强，无免费层。",
			},
		],
	},
	{
		id: "moonshot",
		label: "Moonshot Kimi",
		keyUrl: "https://platform.kimi.com/console/api-keys",
		keyUrlLabel: "前往 Kimi 开放平台创建 API Key",
		pricingUrl: "https://platform.kimi.com/docs/pricing/chat",
		endpoints: [
			{
				url: "https://api.moonshot.cn/v1",
				label: "官方站",
				modelsIntro: "Kimi K2.5 / K3 系模型（1M 上下文）按量计费；国内手机号新用户注册送 15 元代金券。",
			},
		],
	},
	{
		id: "bailian",
		label: "阿里云百炼",
		keyUrl: "https://bailian.console.aliyun.com/",
		keyUrlLabel: "前往百炼控制台（API-KEY 在密钥管理）",
		pricingUrl: "https://help.aliyun.com/zh/model-studio/models",
		endpoints: [
			{
				url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
				label: "OpenAI 兼容模式",
				modelsIntro: "通义千问 qwen 全系按量计费；新用户可领免费 token 额度，需先完成阿里云实名认证。",
			},
		],
	},
	{
		id: "custom",
		label: "自定义",
		keyUrl: "",
		keyUrlLabel: "",
		pricingUrl: "",
		endpoints: [],
	},
]

function findProviderPreset(id: string) {
	return AI_PROVIDERS.find((item) => item.id === id)
}

type AssetEnrichmentConfig = {
	base_url: string
	base_url_host: string
	api_key_configured: boolean
	provider: string
	available_models?: { id: string }[]
	models_fetched_at?: string
}

type AISettingsForm = {
	provider: string
	baseUrl: string
	apiKey: string
}

const defaultForm: AISettingsForm = {
	provider: "zhipu",
	baseUrl: "https://open.bigmodel.cn/api/paas/v4",
	apiKey: "",
}

// 2026-10-08 梳理⑥：AI 服务接入页——只负责服务商与 API Key 配置；
// 参数填写、设备图片收集等资产中心能力配置在 settings/asset-config 页面。
// 后端为增量合并语义：本页保存只传 provider、base_url 与 api_key，其余字段保持已存值不受影响。
export default function AISettings() {
	const [config, setConfig] = useState<AssetEnrichmentConfig | null>(null)
	const [form, setForm] = useState<AISettingsForm>(defaultForm)
	const [loading, setLoading] = useState(true)
	const [saving, setSaving] = useState(false)
	const [fetchingModels, setFetchingModels] = useState(false)
	const latestLoad = useRef(createLatestRequestGuard())

	const loadConfig = useCallback(async () => {
		const request = latestLoad.current.begin()
		setLoading(true)
		try {
			const next = await pb.send<AssetEnrichmentConfig>("/api/pulse/asset-enrichment/config", { requestKey: null })
			if (!latestLoad.current.isCurrent(request)) return
			setConfig(next)
			setForm(formFromConfig(next))
		} catch {
			if (!latestLoad.current.isCurrent(request)) return
			toast({
				title: "读取 AI 服务接入设置失败",
				description: "请确认当前账号拥有管理员权限。",
				variant: "destructive",
			})
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
					provider: form.provider,
					base_url: form.baseUrl,
					api_key: form.apiKey,
				},
			})
			if (!latestLoad.current.isCurrent(request)) return
			setConfig(next)
			setForm(formFromConfig(next))
			toast({ title: "AI 服务接入已保存", description: "参数填写与图片收集能力即可使用此接入。" })
		} catch (error) {
			if (!latestLoad.current.isCurrent(request)) return
			toast({
				title: "保存 AI 服务接入失败",
				description: getConfigErrorMessage(error),
				variant: "destructive",
			})
		} finally {
			if (latestLoad.current.isCurrent(request)) setSaving(false)
		}
	}

	// 2026-10-09 梳理⑥补：拉取官方模型列表（Hub 服务端代理），结果缓存后供「资产中心配置」页下拉选择
	async function fetchModelList() {
		const request = latestLoad.current.begin()
		setFetchingModels(true)
		try {
			const result = await pb.send<{ models: { id: string }[]; fetched_at: string; base_url_host: string }>(
				"/api/pulse/asset-enrichment/models",
				{ requestKey: null }
			)
			if (!latestLoad.current.isCurrent(request)) return
			setConfig((current) => ({
				...(current ?? {
					base_url: form.baseUrl,
					base_url_host: result.base_url_host,
					api_key_configured: true,
					provider: form.provider,
				}),
				api_key_configured: true,
				available_models: result.models,
				models_fetched_at: result.fetched_at,
			}))
			toast({
				title: "模型列表已更新",
				description: `从 ${result.base_url_host} 获取到 ${result.models.length} 个模型，可在「资产中心配置」页选择执行模型。`,
			})
		} catch (error) {
			if (!latestLoad.current.isCurrent(request)) return
			toast({
				title: "获取模型列表失败",
				description: getConfigErrorMessage(error),
				variant: "destructive",
			})
		} finally {
			if (latestLoad.current.isCurrent(request)) setFetchingModels(false)
		}
	}

	const keyConfigured = Boolean(config?.api_key_configured)
	// 官方 /models 列表混有向量/OCR/语音等非对话模型，展示时剔除（2026-10-09 用户反馈模型列表"不对"）
	const chatModels = (config?.available_models ?? []).filter((item) => isChatCapableAIModel(item.id))
	const modelCount = chatModels.length
	const fetchedAtLabel = config?.models_fetched_at ? `（${formatFetchedAt(config.models_fetched_at)}）` : ""
	const providerPreset = findProviderPreset(form.provider)
	const endpointOptions = providerPreset?.endpoints ?? []
	const baseUrlInPresets = endpointOptions.some((item) => item.url === form.baseUrl)
	const selectedEndpoint = endpointOptions.find((item) => item.url === form.baseUrl)

	// 切换服务商：端点默认取该服务商第一个地址（当前地址已属于该服务商时保留）；
	// 「自定义」不动 Base URL，由用户手填。
	function handleProviderChange(id: string) {
		setForm((current) => {
			const preset = findProviderPreset(id)
			if (!preset || preset.endpoints.length === 0) {
				return { ...current, provider: id }
			}
			const matched = preset.endpoints.some((item) => item.url === current.baseUrl.trim())
			return {
				...current,
				provider: id,
				baseUrl: matched ? current.baseUrl : preset.endpoints[0].url,
			}
		})
	}

	return (
		<div className="grid pulse-card-gap">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<StatusChip
					label="API Key"
					value={loading ? "读取中" : keyConfigured ? "已配置" : "未配置"}
					active={keyConfigured}
				/>
				<div className="flex flex-wrap gap-2">
					<Button variant="outline" size="sm" onClick={loadConfig} disabled={loading || saving}>
						<RefreshCwIcon className="mr-1.5 size-3.5" />
						刷新
					</Button>
					<Button size="sm" onClick={saveConfig} disabled={loading || saving}>
						{saving ? "保存中" : "保存设置"}
					</Button>
				</div>
			</div>

			<SettingsSectionStack>
				<SettingsSection
					title="模型服务接入"
					description="先选服务商，再选接入地址（附模型与免费档说明），去对应平台创建 API Key 后填入；文本和图片接口由 Hub 自动拼接。"
				>
					<div className="mt-3 grid gap-x-6 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
						<SettingsField label="服务商" htmlFor="ai-provider" description="决定接入地址预设与 Key 获取指引。">
							<Select value={form.provider} onValueChange={handleProviderChange}>
								<SelectTrigger id="ai-provider" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{AI_PROVIDERS.map((item) => (
										<SelectItem key={item.id} value={item.id}>
											{item.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</SettingsField>
						<SettingsField
							label="接入地址"
							htmlFor="agnes-base-url"
							description={
								selectedEndpoint
									? selectedEndpoint.modelsIntro
									: providerPreset?.id === "custom"
										? "填写任意 OpenAI-compatible 根地址（例如 https://your-provider.example.com/v1）。"
										: undefined
							}
						>
							{endpointOptions.length > 0 ? (
								<Select
									value={form.baseUrl}
									onValueChange={(value) => setForm((current) => ({ ...current, baseUrl: value }))}
								>
									<SelectTrigger id="agnes-base-url" className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{!baseUrlInPresets && form.baseUrl ? (
											<SelectItem value={form.baseUrl}>当前地址（{config?.base_url_host || form.baseUrl}）</SelectItem>
										) : null}
										{endpointOptions.map((item) => (
											<SelectItem key={item.url} value={item.url}>
												{item.label} · {item.url}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							) : (
								<Input
									id="agnes-base-url"
									value={form.baseUrl}
									onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value }))}
									placeholder="https://your-provider.example.com/v1"
								/>
							)}
						</SettingsField>
						<SettingsField
							label="API Key"
							htmlFor="agnes-api-key"
							description={
								<span className="flex flex-wrap items-center gap-x-2 gap-y-1">
									<span className="inline-flex items-center gap-1.5">
										<KeyRoundIcon className="size-3.5" />
										{keyConfigured ? "已配置，留空保持不变" : "未配置"}
									</span>
									{providerPreset?.keyUrl ? (
										<a
											href={providerPreset.keyUrl}
											target="_blank"
											rel="noreferrer"
											className="inline-flex items-center gap-1 font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
										>
											<ExternalLinkIcon className="size-3" />
											{providerPreset.keyUrlLabel}
										</a>
									) : null}
								</span>
							}
						>
							<Input
								id="agnes-api-key"
								type="password"
								value={form.apiKey}
								placeholder={keyConfigured ? "已配置，留空保持不变" : "未配置"}
								onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))}
							/>
						</SettingsField>
					</div>
					{config?.base_url ? (
						<div className="mt-3 text-xs text-muted-foreground">当前生效地址：{config.base_url}</div>
					) : null}
					<div className="mt-3 flex items-start gap-2 rounded-lg border border-border/70 bg-surface-soft p-2.5 text-xs leading-relaxed text-muted-foreground shadow-none">
						<span>API Key 只保存在服务端，不会返回浏览器；已配置时留空保存即保持不变。</span>
					</div>
				</SettingsSection>

				<SettingsSection
					title="官方模型列表"
					description={
						modelCount > 0
							? `已获取 ${modelCount} 个模型${fetchedAtLabel}；免费模型排在最前，可在「资产中心配置」页选择执行模型`
							: "获取后可查看每个模型的价格与免费档（免费排最前），并在「资产中心配置」页下拉选择执行模型"
					}
					actions={
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={fetchModelList}
							disabled={loading || saving || fetchingModels || !keyConfigured}
						>
							{fetchingModels ? "获取中" : "获取模型列表"}
						</Button>
					}
				>
					{modelCount > 0 ? (
						<div className="mt-3">
							<div className="max-h-96 overflow-auto rounded-md border border-border/70">
								<table className="w-full border-collapse text-left text-xs">
									<thead>
										<tr className="bg-surface-soft text-muted-foreground">
											<th className="border-b border-border/70 py-2 pl-3 pr-3 font-medium">模型</th>
											<th className="border-b border-border/70 py-2 pr-3 font-medium">价格（每百万 token）</th>
											<th className="border-b border-border/70 py-2 pr-3 font-medium">是否免费</th>
											<th className="border-b border-border/70 py-2 pr-3 font-medium">免费额度 / 说明</th>
										</tr>
									</thead>
									<tbody>
										{(chatModels ?? [])
											.map((item) => ({ id: item.id, entry: describeAIModel(item.id) }))
											.sort((left, right) => {
												if (left.entry?.free !== right.entry?.free) return left.entry?.free ? -1 : 1
												return left.id.localeCompare(right.id)
											})
											.map(({ id, entry }) => (
												<tr key={id} className="align-top">
													<td className="border-b border-border/40 py-2 pl-3 pr-3 font-medium text-foreground">{id}</td>
													<td className="border-b border-border/40 py-2 pr-3 text-muted-foreground">
														{entry?.price ?? "按量计费"}
													</td>
													<td className="border-b border-border/40 py-2 pr-3">
														<span className={entry?.free ? "font-medium text-emerald-700" : "text-muted-foreground"}>
															{entry?.free ? "免费" : "付费"}
														</span>
													</td>
													<td className="border-b border-border/40 py-2 pr-3 text-muted-foreground">
														{entry?.freeTier ?? "以官方定价页为准"}
													</td>
												</tr>
											))}
									</tbody>
								</table>
							</div>
							{providerPreset?.pricingUrl ? (
								<div className="mt-2 text-xs text-muted-foreground">
									价格摘自官方定价页，可能随平台调整，以{" "}
									<a
										href={providerPreset.pricingUrl}
										target="_blank"
										rel="noreferrer"
										className="underline decoration-border underline-offset-4 hover:decoration-foreground"
									>
										{providerPreset.label} 定价说明
									</a>{" "}
									为准。
								</div>
							) : null}
						</div>
					) : (
						<div className="mt-3 rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
							还没有模型列表。保存接入配置后点「获取模型列表」，结果会缓存并供「资产中心配置」页选择执行模型。
						</div>
					)}
				</SettingsSection>
			</SettingsSectionStack>
		</div>
	)
}

function formFromConfig(config: AssetEnrichmentConfig): AISettingsForm {
	const stored = config.provider || "agnes"
	// 历史配置的 agnes 已从预设移除：地址仍保留，归类为自定义展示
	const provider = findProviderPreset(stored) ? stored : "custom"
	return {
		provider,
		baseUrl: config.base_url || defaultForm.baseUrl,
		apiKey: "",
	}
}

function formatFetchedAt(value: string) {
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return value
	return date.toLocaleString()
}
