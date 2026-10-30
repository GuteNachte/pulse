// 2026-10-09 梳理⑥补：AI 模型价格目录——为「AI 服务接入」页模型列表表格与
// 「资产中心配置」页模型下拉提供官方价格/免费档标注。
// 资料来源（2026-10-09 抓取）：智谱 docs.bigmodel.cn/cn/guide/start/pricing、
// Agnes agnes-ai.cn/zh-Hans/docs/pricing；其余平台为官方帮助中心口径。
// 平台调价后只需要更新本目录；未收录的模型由 UI 回退为"按量计费，以官方定价页为准"。

export type AIModelCatalogEntry = {
	/** 模型名前缀（startsWith 匹配）；调用方必须按前缀长度降序尝试 */
	prefix: string
	/** 价格说明（每百万 token，输入/输出） */
	price: string
	free: boolean
	/** 免费额度/条件说明 */
	freeTier: string
}

export const AI_MODEL_CATALOG: AIModelCatalogEntry[] = [
	// —— 智谱开放平台（按前缀长度排序，长前缀优先）——
	{ prefix: "glm-5.3-flashx", price: "输入 ¥2 / 输出 ¥7", free: false, freeTier: "" },
	{ prefix: "glm-5.3-flash", price: "输入 ¥0.8 / 输出 ¥2.8", free: false, freeTier: "" },
	{ prefix: "glm-5.3", price: "输入 ¥8 / 输出 ¥28", free: false, freeTier: "1M 上下文旗舰" },
	{ prefix: "glm-5.2", price: "输入 ¥8 / 输出 ¥28", free: false, freeTier: "" },
	{ prefix: "glm-5.1", price: "输入 ¥6-8 / 输出 ¥24-28", free: false, freeTier: "按输入长度分档" },
	{ prefix: "glm-5-turbo", price: "输入 ¥5-7 / 输出 ¥22-26", free: false, freeTier: "按输入长度分档" },
	{ prefix: "glm-5", price: "输入 ¥4-6 / 输出 ¥18-22", free: false, freeTier: "按输入长度分档" },
	{ prefix: "glm-4.7-flash", price: "¥0", free: true, freeTier: "长期免费；未实名账号并发极低，实名后提升" },
	{ prefix: "glm-4.7", price: "输入 ¥2-4 / 输出 ¥8-16", free: false, freeTier: "" },
	{ prefix: "glm-4.5-air", price: "输入 ¥0.8-1.2 / 输出 ¥2-8", free: false, freeTier: "" },
	{ prefix: "glm-4.5-flash", price: "已下线", free: false, freeTier: "不在官方免费名单；实测网关仍接受但响应极慢" },
	{ prefix: "glm-4-flash", price: "¥0", free: true, freeTier: "长期免费（旧款）" },
	{ prefix: "glm-z1-flash", price: "¥0", free: true, freeTier: "长期免费（推理款）" },
	{ prefix: "glm-4.6", price: "已下线", free: false, freeTier: "官方定价页无 API 条目" },

	// —— Agnes（已从服务商预设移除；目录保留供历史列表显示）——
	{ prefix: "agnes-3.0-flash", price: "限时 ¥0", free: true, freeTier: "限时免费；免费档文本 RPM 仅 10 次/分钟" },
	{ prefix: "agnes-3.0-pro", price: "输入 ¥3 / 输出 ¥6", free: false, freeTier: "即将上线" },
	{ prefix: "agnes-2.5-flash", price: "限时 ¥0", free: true, freeTier: "限时免费；免费档文本 RPM 仅 10 次/分钟" },
	{ prefix: "agnes-2.5-pro", price: "输入 ¥3 / 输出 ¥6", free: false, freeTier: "" },
	{ prefix: "agnes-2.0-flash", price: "已下线", free: false, freeTier: "官方模型清单已移除" },
	{ prefix: "agnes-image", price: "限时免费（刊例 1K ¥0.07/张）", free: true, freeTier: "限时免费" },
	{ prefix: "agnes-video-2.5-flash", price: "限时 ¥0", free: true, freeTier: "限时免费" },
	{ prefix: "agnes-video", price: "¥0.15-0.35 / 秒（按分辨率）", free: false, freeTier: "" },

	// —— 硅基流动（模型名带组织前缀；9B 及以下永久免费，免费档速率约 2000 次/分钟）——
	{
		prefix: "Qwen/Qwen3-8B",
		price: "¥0",
		free: true,
		freeTier: "永久免费档（9B 以下）；免费速率约 2000 次/分钟，128K 上下文",
	},
	{ prefix: "THUDM/GLM-4-9B", price: "¥0", free: true, freeTier: "永久免费档（9B 以下）；免费速率约 2000 次/分钟" },
	{ prefix: "deepseek-ai/DeepSeek-R1", price: "按量计费", free: false, freeTier: "注册赠送额度可用" },
	{ prefix: "deepseek-ai/DeepSeek-V3", price: "按量计费", free: false, freeTier: "注册赠送额度可用" },
	{
		prefix: "Qwen/",
		price: "按量计费",
		free: false,
		freeTier: "注册送 2000 万 token（约 14 元）；9B 及以下小模型长期免费",
	},

	// —— DeepSeek 官方 ——
	{ prefix: "deepseek-reasoner", price: "按量计费（低价）", free: false, freeTier: "无免费层；充值 10 元可用很久" },
	{ prefix: "deepseek-chat", price: "按量计费（低价）", free: false, freeTier: "无免费层；充值 10 元可用很久" },

	// —— Moonshot Kimi ——
	{ prefix: "kimi", price: "按量计费", free: false, freeTier: "国内手机号新用户注册送 15 元代金券" },
	{ prefix: "moonshot", price: "按量计费", free: false, freeTier: "国内手机号新用户注册送 15 元代金券" },

	// —— 阿里云百炼 ——
	{ prefix: "qwen", price: "按量计费", free: false, freeTier: "新用户可领免费 token 额度（需阿里云实名）" },
]

/** 前缀匹配模型目录；长度降序保证长前缀优先（glm-5.3-flashx 先于 glm-5.3-flash）。 */
export function describeAIModel(model: string): AIModelCatalogEntry | undefined {
	const value = model.trim().toLowerCase()
	if (!value) return undefined
	const sorted = [...AI_MODEL_CATALOG].sort((left, right) => right.prefix.length - left.prefix.length)
	return sorted.find((entry) => value.startsWith(entry.prefix.toLowerCase()))
}

/** 模型下拉选项的显示标注（value 仍用纯模型名）。 */
export function aiModelOptionLabel(model: string): string {
	const entry = describeAIModel(model)
	if (!entry) return model
	if (entry.free) return `${model} · 免费`
	return `${model} · 付费`
}

/** 当前选中模型的介绍行（模型字段下方展示）。 */
export function aiModelHint(model: string): string {
	const entry = describeAIModel(model)
	if (!entry) return "该模型不在价格目录中；按量计费，价格以服务商官方定价页为准。"
	if (entry.free) return `免费模型。${entry.freeTier}`.trim()
	const parts = [`价格：${entry.price}（每百万 token）。`]
	if (entry.freeTier) parts.push(entry.freeTier)
	return parts.join(" ")
}

// 官方 /models 列表会混入向量、重排序、OCR、语音、视频等非对话模型，
// 它们无法用于参数填写（chat/completions）——展示层按关键词剔除。
const NON_CHAT_MODEL_KEYWORDS = [
	"embed",
	"rerank",
	"bge-",
	"ocr",
	"tts",
	"asr",
	"audio",
	"whisper",
	"speech",
	"t2v",
	"i2v",
	"seedream",
	"kolors",
	"wanx",
	"flux",
	"stable-diffusion",
]

export function isChatCapableAIModel(model: string): boolean {
	const value = model.toLowerCase()
	return !NON_CHAT_MODEL_KEYWORDS.some((keyword) => value.includes(keyword))
}
