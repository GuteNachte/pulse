import {
	ArchiveIcon,
	BellIcon,
	BlocksIcon,
	DatabaseIcon,
	InfoIcon,
	LogsIcon,
	RocketIcon,
	SettingsIcon,
	ShieldCheckIcon,
	SparklesIcon,
	UsersIcon,
	type LucideIcon,
} from "lucide-react"
import type { PulseModuleId } from "@/modules/types"

export type SettingsKey =
	| "general"
	| "ai"
	| "notifications"
	| "agent"
	| "users"
	| "backups"
	| "logs"
	| "audit"
	| "modules"
	| "advanced"
	| "about"

export type SettingsGroup = "常规与外观" | "资产与 AI" | "监控与接入" | "账户与数据" | "系统与关于"

export type SettingsCatalogItem = {
	key: SettingsKey
	title: string
	description: string
	keywords: string[]
	group: SettingsGroup
	icon: LucideIcon
	moduleId: PulseModuleId
	admin?: boolean
	noReadOnly?: boolean
	danger?: boolean
	aliases?: string[]
	preload?: () => Promise<unknown>
}

export type SettingsNavItem = SettingsCatalogItem & { href: string }

export const settingsLoaders = {
	general: () => import("./general"),
	ai: () => import("./ai/page"),
	notifications: () => import("./notifications"),
	agent: () => import("./agent"),
	users: () => import("./users"),
	backups: () => import("./backups"),
	logs: () => import("./system-logs"),
	audit: () => import("./operation-audit"),
	modules: () => import("./modules"),
	advanced: () => import("./advanced"),
	about: () => import("./about"),
} satisfies Record<SettingsKey, () => Promise<unknown>>

export const settingsCatalog: SettingsCatalogItem[] = [
	{
		key: "general",
		title: "常规设置",
		description: "主题、图表、单位和阈值偏好",
		keywords: ["general", "settings", "theme", "charts", "unit", "threshold"],
		group: "常规与外观",
		icon: SettingsIcon,
		moduleId: "foundation",
		preload: settingsLoaders.general,
	},
	{
		key: "ai",
		title: "AI 能力",
		description: "AI 服务接入、参数 Agent 和图片 Agent",
		keywords: ["ai", "llm", "agnes", "api", "key", "模型", "参数", "图片", "视觉"],
		group: "资产与 AI",
		icon: SparklesIcon,
		moduleId: "asset-center",
		admin: true,
		aliases: ["parameter-agent", "image-agent"],
		preload: settingsLoaders.ai,
	},
	{
		key: "notifications",
		title: "通知设置",
		description: "通知通道、邮件和发送诊断",
		keywords: ["notification", "alert", "告警", "通道", "webhook", "telegram", "邮件"],
		group: "监控与接入",
		icon: BellIcon,
		moduleId: "notifications",
		preload: settingsLoaders.notifications,
	},
	{
		key: "agent",
		title: "Agent 管理",
		description: "安装模板、版本仓库和设备更新",
		keywords: ["agent", "update", "版本", "安装", "windows", "linux", "nas"],
		group: "监控与接入",
		icon: RocketIcon,
		moduleId: "agent-management",
		noReadOnly: true,
		preload: settingsLoaders.agent,
	},
	{
		key: "users",
		title: "用户管理",
		description: "账户、角色和密码维护",
		keywords: ["users", "role", "permission", "账号", "角色", "权限", "密码"],
		group: "账户与数据",
		icon: UsersIcon,
		moduleId: "account-access",
		admin: true,
		preload: settingsLoaders.users,
	},
	{
		key: "backups",
		title: "备份管理",
		description: "数据备份、下载、还原和删除",
		keywords: ["backup", "restore", "备份", "还原", "下载", "删除"],
		group: "账户与数据",
		icon: ArchiveIcon,
		moduleId: "maintenance",
		admin: true,
		preload: settingsLoaders.backups,
	},
	{
		key: "logs",
		title: "系统日志",
		description: "Hub 运行事件和技术诊断",
		keywords: ["logs", "日志", "错误", "warning", "debug"],
		group: "账户与数据",
		icon: LogsIcon,
		moduleId: "maintenance",
		aliases: ["system-logs"],
		preload: settingsLoaders.logs,
	},
	{
		key: "audit",
		title: "操作审计",
		description: "用户、备份和管理动作留痕",
		keywords: ["audit", "operation", "审计", "操作记录", "管理动作"],
		group: "账户与数据",
		icon: ShieldCheckIcon,
		moduleId: "maintenance",
		aliases: ["operation-audit"],
		preload: settingsLoaders.audit,
	},
	{
		key: "modules",
		title: "模块说明",
		description: "模块职责、依赖、路由和代码边界",
		keywords: ["modules", "module", "模块", "说明", "依赖", "路由"],
		group: "系统与关于",
		icon: BlocksIcon,
		moduleId: "foundation",
		preload: settingsLoaders.modules,
	},
	{
		key: "advanced",
		title: "高级设置",
		description: "运行诊断、后台入口和危险维护",
		keywords: ["advanced", "pocketbase", "后台", "维护", "危险"],
		group: "系统与关于",
		icon: DatabaseIcon,
		moduleId: "maintenance",
		danger: true,
		admin: true,
		preload: settingsLoaders.advanced,
	},
	{
		key: "about",
		title: "关于",
		description: "版本、Hub 地址和更新记录",
		keywords: ["about", "version", "release", "关于", "版本", "更新记录"],
		group: "系统与关于",
		icon: InfoIcon,
		moduleId: "foundation",
		preload: settingsLoaders.about,
	},
]

export const settingsByKey = new Map<SettingsKey, SettingsCatalogItem>(settingsCatalog.map((item) => [item.key, item]))

const settingsByAlias = new Map<string, SettingsKey>()
for (const item of settingsCatalog) {
	for (const alias of item.aliases ?? []) {
		settingsByAlias.set(alias, item.key)
	}
}

/** Old settings URLs that move into the merged AI page, and their tab value. */
export const settingsAliasTabs: Record<string, string> = {
	"parameter-agent": "parameter",
	"image-agent": "image",
}

export function canonicalSettingsKey(name?: string): SettingsKey | undefined {
	const normalized = name?.trim()
	if (!normalized) {
		return undefined
	}
	if (settingsByKey.has(normalized as SettingsKey)) {
		return normalized as SettingsKey
	}
	return settingsByAlias.get(normalized)
}

export function getSettingsItem(name?: string): SettingsCatalogItem | undefined {
	const key = canonicalSettingsKey(name)
	return key ? settingsByKey.get(key) : undefined
}

export function filterSettingsItems<
	T extends { title: string; group?: string; description?: string; keywords?: string[] },
>(items: T[], query: string): T[] {
	const keyword = query.trim().toLowerCase()
	if (!keyword) {
		return items
	}
	return items.filter((item) => {
		const text = [item.title, item.group, item.description, ...(item.keywords ?? [])]
			.filter(Boolean)
			.join(" ")
			.toLowerCase()
		return text.includes(keyword)
	})
}

export function groupSettingsItems<T extends { group?: string }>(items: T[]): Array<{ title: string; items: T[] }> {
	const groups: Array<{ title: string; items: T[] }> = []
	for (const item of items) {
		const title = item.group || "设置"
		let group = groups.find((entry) => entry.title === title)
		if (!group) {
			group = { title, items: [] }
			groups.push(group)
		}
		group.items.push(item)
	}
	return groups
}
