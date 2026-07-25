import { t } from "@lingui/core/macro"
import { Trans, useLingui } from "@lingui/react/macro"
import { useStore } from "@nanostores/react"
import { getPagePath, redirectPage } from "@nanostores/router"
import {
	ArchiveIcon,
	BellIcon,
	BlocksIcon,
	BrainCircuitIcon,
	DatabaseIcon,
	InfoIcon,
	KeyRoundIcon,
	LogsIcon,
	RocketIcon,
	SettingsIcon,
	ShieldCheckIcon,
	UsersIcon,
} from "lucide-react"
import { lazy, useEffect, type ComponentType, type SVGProps } from "react"
import { MobileSettingsLayout, type MobileSettingsNavItem } from "@/components/mobile/mobile-settings"
import { useMobileLayout } from "@/components/mobile/mobile-ui"
import { $router } from "@/components/router.tsx"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx"
import { toast } from "@/components/ui/use-toast.ts"
import { getCurrentUserSettingsFilter, isAdmin, isReadOnlyUser, pb } from "@/lib/api"
import { pageTitle } from "@/lib/branding"
import { $userSettings } from "@/lib/stores.ts"
import { $moduleSettings } from "@/modules/module-state"
import { getModuleForSettingsName } from "@/modules/registry"
import type { PulseModuleId } from "@/modules/types"
import type { UserSettings } from "@/types"
import { SidebarNav } from "./sidebar-nav.tsx"

const generalSettingsImport = () => import("./general.tsx")
const fingerprintsSettingsImport = () => import("./tokens-fingerprints.tsx")
const agentSettingsImport = () => import("./agent.tsx")
const notificationsImport = () => import("./notifications.tsx")
const systemLogsImport = () => import("./system-logs.tsx")
const operationAuditImport = () => import("./operation-audit.tsx")
const backupsImport = () => import("./backups.tsx")
const usersImport = () => import("./users.tsx")
const advancedImport = () => import("./advanced.tsx")
const aiSettingsImport = () => import("./ai.tsx")
const modulesImport = () => import("./modules.tsx")
const aboutImport = () => import("./about.tsx")

const GeneralSettings = lazy(generalSettingsImport)
const FingerprintsSettings = lazy(fingerprintsSettingsImport)
const AgentSettings = lazy(agentSettingsImport)
const Notifications = lazy(
	() =>
		notificationsImport() as Promise<{
			default: ComponentType<{ userSettings: UserSettings; hideTitle?: boolean }>
		}>
)
const SystemLogs = lazy(systemLogsImport)
const OperationAudit = lazy(operationAuditImport)
const Backups = lazy(backupsImport)
const Users = lazy(usersImport)
const Advanced = lazy(advancedImport)
const AISettings = lazy(aiSettingsImport)
const Modules = lazy(modulesImport)
const About = lazy(aboutImport)

type SettingsNavItem = {
	title: string
	href: string
	icon: ComponentType<SVGProps<SVGSVGElement>>
	group: string
	description: string
	keywords?: string[]
	danger?: boolean
	admin?: boolean
	noReadOnly?: boolean
	moduleId?: PulseModuleId
	preload?: () => Promise<unknown>
} & MobileSettingsNavItem

export async function saveSettings(newSettings: Partial<UserSettings>) {
	try {
		const userFilter = getCurrentUserSettingsFilter()
		if (!userFilter) {
			throw new Error("missing current user")
		}
		const req = await pb.collection("user_settings").getFirstListItem(userFilter, {
			fields: "id,settings",
		})
		const updatedSettings = await pb.collection("user_settings").update(req.id, {
			settings: {
				...req.settings,
				...newSettings,
			},
		})
		$userSettings.set(updatedSettings.settings)
		toast({
			title: t`Settings saved`,
			description: t`Your user settings have been updated.`,
		})
	} catch {
		toast({
			title: t`Failed to save settings`,
			description: t`Check logs for more details.`,
			variant: "destructive",
		})
	}
}

export default function SettingsLayout() {
	const { t } = useLingui()
	const { isMobile } = useMobileLayout()
	const moduleSettings = useStore($moduleSettings)

	const sidebarNavItems: SettingsNavItem[] = [
		{
			title: "常规设置",
			href: getPagePath($router, "settings", { name: "general" }),
			icon: SettingsIcon,
			group: "常规",
			description: "主题、图表、单位和阈值偏好",
			keywords: ["general", "settings", "theme", "charts", "unit", "threshold"],
			moduleId: "foundation",
		},
		{
			title: "通知设置",
			href: getPagePath($router, "settings", { name: "notifications" }),
			icon: BellIcon,
			group: "告警与通知",
			description: "通知通道、告警规则和测试诊断",
			keywords: ["notification", "alert", "告警", "通道", "webhook", "telegram"],
			moduleId: "notifications",
			preload: notificationsImport,
		},
		{
			title: "Agent 管理",
			href: getPagePath($router, "settings", { name: "agent" }),
			icon: RocketIcon,
			group: "Agent 与接入",
			description: "安装模板、目标版本和手动更新",
			keywords: ["agent", "update", "版本", "安装", "windows", "linux", "nas"],
			moduleId: "agent-management",
			noReadOnly: true,
			preload: agentSettingsImport,
		},
		{
			title: "用户管理",
			href: getPagePath($router, "settings", { name: "users" }),
			icon: UsersIcon,
			group: "用户与权限",
			description: "账户、角色和密码维护",
			keywords: ["users", "role", "permission", "账号", "角色", "权限", "密码"],
			moduleId: "account-access",
			admin: true,
			preload: usersImport,
		},
		{
			title: "备份管理",
			href: getPagePath($router, "settings", { name: "backups" }),
			icon: ArchiveIcon,
			group: "数据与记录",
			description: "数据备份、下载、还原和删除",
			keywords: ["backup", "restore", "备份", "还原", "下载", "删除"],
			moduleId: "maintenance",
			admin: true,
			preload: backupsImport,
		},
		{
			title: "系统日志",
			href: getPagePath($router, "settings", { name: "logs" }),
			icon: LogsIcon,
			group: "数据与记录",
			description: "Hub 运行事件和技术诊断",
			keywords: ["logs", "日志", "错误", "warning", "debug"],
			moduleId: "maintenance",
			preload: systemLogsImport,
		},
		{
			title: "操作审计",
			href: getPagePath($router, "settings", { name: "audit" }),
			icon: ShieldCheckIcon,
			group: "数据与记录",
			description: "用户、备份、Token 和管理动作",
			keywords: ["audit", "operation", "审计", "操作记录", "管理动作"],
			moduleId: "maintenance",
			preload: operationAuditImport,
		},
		{
			title: "模块说明",
			href: getPagePath($router, "settings", { name: "modules" }),
			icon: BlocksIcon,
			group: "系统维护",
			description: "只读查看模块职责、依赖、路由和代码边界",
			keywords: ["modules", "module", "模块", "说明", "只读", "依赖", "路由"],
			moduleId: "foundation",
			preload: modulesImport,
		},
		{
			title: "AI 与识别",
			href: getPagePath($router, "settings", { name: "ai" }),
			icon: BrainCircuitIcon,
			group: "资产中心",
			description: "大模型接入、资料补全 Agent 和设备图片 Agent",
			keywords: ["ai", "llm", "agnes", "识别", "资产补全", "图片收集", "模型"],
			moduleId: "asset-center",
			admin: true,
			preload: aiSettingsImport,
		},
		{
			title: "高级设置",
			href: getPagePath($router, "settings", { name: "advanced" }),
			icon: DatabaseIcon,
			group: "系统维护",
			description: "底层后台和危险维护入口",
			keywords: ["advanced", "pocketbase", "后台", "维护", "危险"],
			moduleId: "maintenance",
			danger: true,
			admin: true,
			preload: advancedImport,
		},
		{
			title: "Agent 接入 Token",
			href: getPagePath($router, "settings", { name: "tokens" }),
			icon: KeyRoundIcon,
			group: "系统维护",
			description: "高级接入凭据、轮换和解绑",
			keywords: ["token", "fingerprint", "凭据", "指纹", "轮换", "解绑"],
			moduleId: "agent-management",
			danger: true,
			noReadOnly: true,
			preload: fingerprintsSettingsImport,
		},
		{
			title: "关于",
			href: getPagePath($router, "settings", { name: "about" }),
			icon: InfoIcon,
			group: "系统维护",
			description: "版本、Hub 地址和更新记录",
			keywords: ["about", "version", "release", "关于", "版本", "更新记录"],
			moduleId: "foundation",
			preload: aboutImport,
		},
	]

	const page = useStore($router)
	const pageParams = page?.params as { name?: unknown } | undefined
	const requestedSettingsName = typeof pageParams?.name === "string" ? pageParams.name : undefined
	const activeSettingsName = requestedSettingsName ?? "general"
	const visibleItems = sidebarNavItems.filter((item) => {
		if ((item.admin && !isAdmin()) || (item.noReadOnly && isReadOnlyUser())) {
			return false
		}
		const moduleId = item.moduleId ?? getModuleForSettingsName(item.href.split("/").pop())
		return moduleSettings[moduleId]?.effectiveEnabled !== false
	})
	const activeItem = visibleItems.find((item) => page?.path === item.href)
	const ActiveIcon = activeItem?.icon ?? SettingsIcon

	useEffect(() => {
		document.title = pageTitle(t`Settings`)
		if (!requestedSettingsName && !isMobile) {
			redirectPage($router, "settings", { name: "general" })
		}
	}, [isMobile, requestedSettingsName, t])

	if (isMobile) {
		return (
			<MobileSettingsLayout
				activeName={requestedSettingsName}
				activeTitle={activeItem?.title}
				items={visibleItems}
				contentName={activeSettingsName}
				renderContent={(name) => <SettingsContent name={name} />}
			/>
		)
	}

	return (
		<Card className="mb-14 min-h-96 w-full overflow-visible rounded-lg border-border/70 bg-card px-4 py-5 shadow-none sm:px-6 sm:py-6">
			<CardHeader className="border-b border-border/70 p-0 pb-4">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div className="flex min-w-0 gap-3">
						<div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft text-muted-foreground">
							<SettingsIcon className="size-4" />
						</div>
						<div className="min-w-0">
							<CardTitle className="mb-0 ">
								<Trans>Settings</Trans>
							</CardTitle>
							<p className="mt-1 text-sm text-muted-foreground">管理通知、Agent、用户、审计、备份和版本信息。</p>
						</div>
					</div>
					<div className="flex min-w-0 items-center gap-2 rounded-lg border border-border/70 bg-surface-soft p-2">
						<div className="grid size-8 shrink-0 place-items-center rounded-md border border-border/70 bg-card text-muted-foreground">
							<ActiveIcon className="size-4" />
						</div>
						<div className="min-w-0">
							<div className="truncate text-sm font-semibold">{activeItem?.title ?? "常规设置"}</div>
							<div className="truncate text-xs text-muted-foreground">
								{activeItem?.description ?? "主题、图表、单位和阈值偏好"}
							</div>
						</div>
					</div>
				</div>
			</CardHeader>
			<CardContent className="p-0 pt-4">
				<div className="grid pulse-card-gap lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start">
					<aside className="min-w-0 self-start overflow-visible rounded-lg border border-border/70 bg-surface-soft p-2">
						<SidebarNav items={visibleItems} />
					</aside>
					<div className="h-full min-w-0 overflow-hidden rounded-lg border border-border/70 bg-surface-soft p-3">
						<SettingsContent name={activeSettingsName} />
					</div>
				</div>
			</CardContent>
		</Card>
	)
}

function SettingsContent({ name }: { name: string }) {
	const userSettings = useStore($userSettings)

	switch (name) {
		case "general":
			return <GeneralSettings userSettings={userSettings} />
		case "tokens":
			return <FingerprintsSettings />
		case "agent":
			return <AgentSettings />
		case "notifications":
			return <Notifications userSettings={userSettings} />
		case "logs":
		case "system-logs":
			return <SystemLogs />
		case "audit":
		case "operation-audit":
			return <OperationAudit />
		case "backups":
			return <Backups />
		case "users":
			return <Users />
		case "advanced":
			return <Advanced />
		case "ai":
			return <AISettings />
		case "modules":
			return <Modules />
		case "about":
			return <About />
		default:
			return <GeneralSettings userSettings={userSettings} />
	}
}
