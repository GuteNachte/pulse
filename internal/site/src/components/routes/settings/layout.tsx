import { t } from "@lingui/core/macro"
import { Trans, useLingui } from "@lingui/react/macro"
import { useStore } from "@nanostores/react"
import { getPagePath, redirectPage } from "@nanostores/router"
import {
	ArchiveIcon,
	BellIcon,
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
const aboutImport = () => import("./about.tsx")

const GeneralSettings = lazy(generalSettingsImport)
const FingerprintsSettings = lazy(fingerprintsSettingsImport)
const AgentSettings = lazy(agentSettingsImport)
const Notifications = lazy(notificationsImport)
const SystemLogs = lazy(systemLogsImport)
const OperationAudit = lazy(operationAuditImport)
const Backups = lazy(backupsImport)
const Users = lazy(usersImport)
const Advanced = lazy(advancedImport)
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
	preload?: () => Promise<{ default: ComponentType<object> }>
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

	const sidebarNavItems: SettingsNavItem[] = [
		{
			title: "常规设置",
			href: getPagePath($router, "settings", { name: "general" }),
			icon: SettingsIcon,
			group: "常规",
			description: "主题、图表、单位和阈值偏好",
			keywords: ["general", "settings", "theme", "charts", "unit", "threshold"],
		},
		{
			title: "通知设置",
			href: getPagePath($router, "settings", { name: "notifications" }),
			icon: BellIcon,
			group: "告警与通知",
			description: "通知通道、告警规则和测试诊断",
			keywords: ["notification", "alert", "告警", "通道", "webhook", "telegram"],
			preload: notificationsImport,
		},
		{
			title: "Agent 管理",
			href: getPagePath($router, "settings", { name: "agent" }),
			icon: RocketIcon,
			group: "Agent 与接入",
			description: "安装模板、目标版本和手动更新",
			keywords: ["agent", "update", "版本", "安装", "windows", "linux", "nas"],
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
			preload: systemLogsImport,
		},
		{
			title: "操作审计",
			href: getPagePath($router, "settings", { name: "audit" }),
			icon: ShieldCheckIcon,
			group: "数据与记录",
			description: "用户、备份、Token 和管理动作",
			keywords: ["audit", "operation", "审计", "操作记录", "管理动作"],
			preload: operationAuditImport,
		},
		{
			title: "高级设置",
			href: getPagePath($router, "settings", { name: "advanced" }),
			icon: DatabaseIcon,
			group: "系统维护",
			description: "底层后台和危险维护入口",
			keywords: ["advanced", "pocketbase", "后台", "维护", "危险"],
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
			preload: aboutImport,
		},
	]

	const page = useStore($router)
	const activeSettingsName = page?.params?.name ?? "general"
	const visibleItems = sidebarNavItems.filter(
		(item) => !((item.admin && !isAdmin()) || (item.noReadOnly && isReadOnlyUser()))
	)
	const activeItem = visibleItems.find((item) => page?.path === item.href)
	const ActiveIcon = activeItem?.icon ?? SettingsIcon

	useEffect(() => {
		document.title = pageTitle(t`Settings`)
		if (!page?.params?.name && !isMobile) {
			redirectPage($router, "settings", { name: "general" })
		}
	}, [isMobile, page?.params?.name, t])

	if (isMobile) {
		return (
			<MobileSettingsLayout
				activeName={page?.params?.name}
				activeTitle={activeItem?.title}
				items={visibleItems}
				contentName={activeSettingsName}
				renderContent={(name) => <SettingsContent name={name} />}
			/>
		)
	}

	return (
		<Card className="mb-14 min-h-96 w-full overflow-hidden rounded-lg border-border/70 bg-card px-4 py-5 shadow-none sm:px-6 sm:py-6">
			<CardHeader className="border-b border-border/70 p-0 pb-4">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div className="flex min-w-0 gap-3">
						<div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft text-muted-foreground">
							<SettingsIcon className="size-4" />
						</div>
						<div className="min-w-0">
							<CardTitle className="mb-0 tracking-tight">
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
				<div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
					<aside className="min-w-0 rounded-lg border border-border/70 bg-surface-soft p-2">
						<SidebarNav items={sidebarNavItems} />
					</aside>
					<div className="h-full min-w-0 rounded-lg border border-border/70 bg-surface-soft p-3">
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
		case "about":
			return <About />
		default:
			return <GeneralSettings userSettings={userSettings} />
	}
}
