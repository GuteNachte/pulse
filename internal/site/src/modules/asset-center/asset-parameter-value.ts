// 2026-10-20 用户《设备详情页交互设计文档》：参数值按类型展示——
// 数值+单位（大数字小单位）、状态（彩色圆点）、功能列表（标签），其余保持纯文本。

const statusTonePatterns: { tone: "green" | "amber" | "red"; values: string[] }[] = [
	{ tone: "green", values: ["在用", "在线", "正常", "已启用", "启用", "支持", "是", "成功", "已连接"] },
	{ tone: "amber", values: ["规划中", "未启用", "暂停", "警告", "部分支持", "待确认"] },
	{ tone: "red", values: ["退役", "停用", "离线", "异常", "不支持", "否", "失败", "未连接"] },
]

export type ParameterStatusTone = (typeof statusTonePatterns)[number]["tone"]

export function getParameterStatusTone(value: string): ParameterStatusTone | undefined {
	const trimmed = value.trim()
	if (!trimmed || trimmed.length > 8) return undefined
	return statusTonePatterns.find((group) => group.values.includes(trimmed))?.tone
}

export function getParameterStatusDotClass(tone: ParameterStatusTone) {
	if (tone === "green") return "bg-emerald-500"
	if (tone === "amber") return "bg-amber-500"
	return "bg-red-500"
}

// 「60 Gbps」「32 GB」「0~40 ℃」→ 数字部分 + 单位；没有空格分隔的复杂值不拆
export function splitParameterNumberUnit(value: string) {
	const matched = value
		.trim()
		.match(/^([0-9][0-9.,~\-～/]*)\s+([A-Za-z℃°%\u4e00-\u9fa5][A-Za-z0-9℃°%/·.\-\u4e00-\u9fa5]*)$/)
	if (!matched) return undefined
	return { number: matched[1], unit: matched[2] }
}

// 功能列表：中文顿号/逗号分隔的多项，渲染为标签；单个值与斜杠多值保持文本
export function splitParameterFeatureTags(value: string) {
	const parts = value
		.split(/[、，]/)
		.map((part) => part.trim())
		.filter(Boolean)
	if (parts.length < 2) return undefined
	return parts
}
