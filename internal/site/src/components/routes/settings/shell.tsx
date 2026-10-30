import { useLingui } from "@lingui/react/macro"
import { useStore } from "@nanostores/react"
import { getPagePath, redirectPage } from "@nanostores/router"
import { lazy, Suspense, useEffect, useMemo } from "react"
import { MobileSettingsLayout } from "@/components/mobile/mobile-settings"
import { useMobileLayout } from "@/components/mobile/mobile-ui"
import { $router, navigate } from "@/components/router"
import { LoadingState } from "@/components/ui/loading-state"
import { isAdmin, isReadOnlyUser } from "@/lib/api"
import { pageTitle } from "@/lib/branding"
import { $userSettings } from "@/lib/stores"
import { $moduleSettings } from "@/modules/module-state"
import type { UserSettings } from "@/types"
import {
	canonicalSettingsKey,
	type SettingsKey,
	type SettingsNavItem,
	settingsAliasTabs,
	settingsCatalog,
	settingsLoaders,
} from "./catalog"
import { SettingsPageProvider } from "./components/page-header"
import { SidebarNav } from "./sidebar-nav"

const General = lazy(settingsLoaders.general)
const AIPage = lazy(settingsLoaders.ai)
const Notifications = lazy(settingsLoaders.notifications)
const Agent = lazy(settingsLoaders.agent)
const Users = lazy(settingsLoaders.users)
const Backups = lazy(settingsLoaders.backups)
const SystemLogs = lazy(settingsLoaders.logs)
const OperationAudit = lazy(settingsLoaders.audit)
const Modules = lazy(settingsLoaders.modules)
const Advanced = lazy(settingsLoaders.advanced)
const About = lazy(settingsLoaders.about)

function renderSettingsPage(key: SettingsKey, userSettings: UserSettings) {
	switch (key) {
		case "general":
			return <General userSettings={userSettings} />
		case "ai":
			return <AIPage />
		case "notifications":
			return <Notifications userSettings={userSettings} />
		case "agent":
			return <Agent />
		case "users":
			return <Users />
		case "backups":
			return <Backups />
		case "logs":
			return <SystemLogs />
		case "audit":
			return <OperationAudit />
		case "modules":
			return <Modules />
		case "advanced":
			return <Advanced />
		case "about":
			return <About />
	}
}

export default function SettingsShell() {
	const { t } = useLingui()
	const { isMobile } = useMobileLayout()
	const moduleSettings = useStore($moduleSettings)
	const userSettings = useStore($userSettings)
	const page = useStore($router)

	const pageParams = page?.params as { name?: unknown } | undefined
	const requestedName = typeof pageParams?.name === "string" ? pageParams.name : undefined
	const canonicalKey = canonicalSettingsKey(requestedName)
	const activeKey = canonicalKey ?? "general"
	const aliasTab = requestedName ? settingsAliasTabs[requestedName] : undefined

	// 2026-10-03 产品决策：普通账户不能进设置——设置仅管理员可用，
	// 普通用户的账户管理在独立的 /profile 个人资料页（右上角菜单进入）。
	const admin = isAdmin()

	const visibleItems = useMemo<SettingsNavItem[]>(() => {
		return settingsCatalog
			.filter((item) => {
				if ((item.admin && !admin) || (item.noReadOnly && isReadOnlyUser())) {
					return false
				}
				return moduleSettings[item.moduleId]?.effectiveEnabled !== false
			})
			.map((item) => ({
				...item,
				href: getPagePath($router, "settings", { name: item.key }),
			}))
	}, [admin, moduleSettings])

	const activeItem = visibleItems.find((item) => item.key === activeKey)

	useEffect(() => {
		document.title = pageTitle(activeItem?.title ?? t`Settings`)
		if (!admin) {
			redirectPage($router, "profile")
			return
		}
		if (aliasTab) {
			navigate(`${getPagePath($router, "settings", { name: "ai" })}?tab=${aliasTab}`)
			return
		}
		if (requestedName && !canonicalKey) {
			navigate(getPagePath($router, "settings", { name: "general" }))
			return
		}
		if (canonicalKey && requestedName && canonicalKey !== requestedName) {
			navigate(getPagePath($router, "settings", { name: canonicalKey }))
			return
		}
		if (!requestedName && !isMobile) {
			redirectPage($router, "settings", { name: "general" })
		}
	}, [activeItem?.title, admin, aliasTab, canonicalKey, isMobile, requestedName, t])

	if (!admin) {
		return null
	}

	if (isMobile) {
		return (
			<MobileSettingsLayout
				activeName={requestedName}
				activeTitle={activeItem?.title}
				items={visibleItems}
				contentName={activeKey}
				renderContent={(name) => {
					const key = canonicalSettingsKey(name) ?? activeKey
					return <SettingsPageProvider embedded>{renderSettingsPage(key, userSettings)}</SettingsPageProvider>
				}}
			/>
		)
	}

	return (
		<div className="mb-14">
			<div className="grid pulse-card-gap lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
				<aside className="min-w-0 self-start overflow-visible rounded-lg border border-border/70 bg-card p-2 shadow-none lg:sticky lg:top-3">
					<SidebarNav items={visibleItems} activeKey={activeKey} />
				</aside>
				<div className="min-w-0">
					<div className="w-full">
						<Suspense fallback={<LoadingState title="正在加载设置" description="正在读取当前设置页" />}>
							<SettingsPageProvider embedded={false}>
								{renderSettingsPage(activeKey, userSettings)}
							</SettingsPageProvider>
						</Suspense>
					</div>
				</div>
			</div>
		</div>
	)
}
