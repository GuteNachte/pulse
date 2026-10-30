// PocketBase 的校验失败统一是 { message: "Failed to update record.", data: { 字段: {...} } }。
// 直接展示 message 会让用户只看到英文通用句，真实原因（例如 type 不允许 smart_ont）被藏住。
const FIELD_LABELS: Record<string, string> = {
	name: "名称",
	type: "资产类型",
	status: "状态",
	parent_asset: "上级资产",
	vendor: "厂商",
	model: "型号",
	serial_number: "序列号",
	management_ip: "管理 IP",
	location: "位置",
	role: "用途",
	notes: "备注",
	tags: "标签",
	metadata: "扩展信息",
	user: "所属用户",
	asset_tag: "编号",
}

const GENERIC_MESSAGES = new Set([
	"Failed to create record.",
	"Failed to update record.",
	"Failed to delete record.",
	"Something went wrong while processing your request.",
])

function extractMessage(value: unknown): string {
	if (typeof value === "string") return value.trim()
	if (value && typeof value === "object") {
		const message = (value as { message?: unknown }).message
		if (typeof message === "string") return message.trim()
	}
	return ""
}

function translateMessage(message: string): string {
	const invalidValue = /^Invalid value (.+)$/i.exec(message)
	if (invalidValue) return `不允许的值「${invalidValue[1]}」`
	return message
}

export function formatPocketBaseError(error: unknown, fallback = "请检查字段和权限。"): string {
	const data = (error as { data?: unknown })?.data
	if (data && typeof data === "object") {
		const body = data as Record<string, unknown>
		const details =
			body.data && typeof body.data === "object" && !Array.isArray(body.data)
				? (body.data as Record<string, unknown>)
				: body
		const fieldMessages: string[] = []
		for (const [key, value] of Object.entries(details)) {
			if (key === "message" || key === "code" || key === "status" || key === "data") continue
			const message = extractMessage(value)
			if (!message) continue
			fieldMessages.push(`${FIELD_LABELS[key] ?? key}：${translateMessage(message)}`)
		}
		if (fieldMessages.length > 0) return fieldMessages.join("；")
		const message = extractMessage(body.message)
		if (message && !GENERIC_MESSAGES.has(message)) return translateMessage(message)
	}
	const message = extractMessage((error as { message?: unknown })?.message)
	if (message && !GENERIC_MESSAGES.has(message)) return translateMessage(message)
	return fallback
}
