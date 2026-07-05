import "./index.css"
import { i18n } from "@lingui/core"
import { I18nProvider } from "@lingui/react"
import { useStore } from "@nanostores/react"
import { getPagePath } from "@nanostores/router"
import { DirectionProvider } from "@radix-ui/react-direction"
import { lazy, memo, Suspense, useEffect, useState } from "react"
import ReactDOM from "react-dom/client"
import { ArrowLeftIcon, HomeIcon, SearchXIcon } from "lucide-react"
import Navbar from "@/components/navbar.tsx"
import { $router, Link } from "@/components/router.tsx"
import Settings from "@/components/routes/settings/layout.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { Button } from "@/components/ui/button.tsx"
import { LoadingState } from "@/components/ui/loading-state.tsx"
import { Toaster } from "@/components/ui/toaster.tsx"
import { alertManager } from "@/lib/alerts"
import {
	initializePocketBaseRuntime,
	isAdmin,
	isPocketBaseAutoCancel,
	pb,
	updateUserSettings,
	verifyAuth,
} from "@/lib/api.ts"
import { pageTitle } from "@/lib/branding"
import { dynamicActivate, getLocale } from "@/lib/i18n"
import { syncAgentHubURLFromRuntime } from "@/lib/runtime-info"
import { $authenticated, $copyContent, $direction } from "@/lib/stores.ts"
import * as systemsManager from "@/lib/systemsManager.ts"
import { $moduleSettings, refreshModuleSettings } from "@/modules/module-state"
import { getModuleForAppRoute, getPulseModule } from "@/modules/registry"
import { MobileBottomNav } from "@/components/mobile/mobile-bottom-nav"
import { MobileHubSetup } from "@/components/mobile/mobile-hub-setup"
import { MobileOfflineBanner, MobileSnapshotBridge } from "@/components/mobile/mobile-offline"
import { useMobileLayout } from "@/components/mobile/mobile-ui"
import { ensureMobileNotificationPermission } from "@/lib/mobile-notifications"
import { isAndroidApp } from "@/lib/mobile-runtime"
import { cn } from "@/lib/utils"

dynamicActivate(getLocale())

const LoginPage = lazy(() => import("@/components/login/login.tsx"))
const Home = lazy(() => import("@/components/routes/home.tsx"))
const Assets = lazy(() => import("@/components/routes/assets.tsx"))
const AssetDetail = lazy(() => import("@/modules/asset-center/asset-detail-page.tsx"))
const Smarthome = lazy(() => import("@/modules/smarthome/page.tsx"))
const NetworkTopology = lazy(() => import("@/components/routes/network.tsx"))
const Clients = lazy(() => import("@/components/routes/clients.tsx"))
const Containers = lazy(() => import("@/components/routes/containers.tsx"))
const Websites = lazy(() => import("@/components/routes/websites.tsx"))
const AlertsCenter = lazy(() => import("@/components/routes/alerts.tsx"))
const NotificationsCenter = lazy(() => import("@/components/routes/notifications.tsx"))
const Smart = lazy(() => import("@/components/routes/smart.tsx"))
const SystemDetail = lazy(() => import("@/components/routes/system.tsx"))
const CopyToClipboardDialog = lazy(() => import("@/components/copy-to-clipboard.tsx"))

const App = memo(() => {
	const page = useStore($router)
	const moduleSettings = useStore($moduleSettings)

	useEffect(() => {
		// change auth store on auth change
		const unsubscribeAuth = pb.authStore.onChange(() => {
			$authenticated.set(pb.authStore.isValid)
		})
		// get general hub info for authenticated users
		syncAgentHubURLFromRuntime().catch((error) => {
			if (!isPocketBaseAutoCancel(error)) {
				console.error(error)
			}
		})
		// get user settings
		updateUserSettings()
		refreshModuleSettings()
		// need to get system list before alerts
		systemsManager.init()
		systemsManager
			// get current systems list
			.refresh()
			// subscribe to new system updates
			.then(systemsManager.subscribe)
			// get current alerts
			.then(alertManager.refresh)
			// subscribe to new alert updates
			.then(alertManager.subscribe)
		return () => {
			unsubscribeAuth()
			alertManager.unsubscribe()
			systemsManager.unsubscribe()
		}
	}, [])

	if (!page) {
		return <NotFoundPage />
	}

	const moduleId = getModuleForAppRoute(page.route, page.params?.name)
	if (moduleId && moduleSettings[moduleId]?.effectiveEnabled === false) {
		return <ModuleDisabledPage moduleId={moduleId} />
	} else if (page.route === "home") {
		return <Home />
	} else if (page.route === "assets") {
		return <Assets />
	} else if (page.route === "asset") {
		return <AssetDetail id={page.params.id} />
	} else if (page.route === "smarthome") {
		return <Smarthome />
	} else if (page.route === "network") {
		return <NetworkTopology />
	} else if (page.route === "clients") {
		return <Clients />
	} else if (page.route === "system") {
		return <SystemDetail id={page.params.id} />
	} else if (page.route === "containers") {
		return <Containers />
	} else if (page.route === "websites") {
		return <Websites />
	} else if (page.route === "alerts") {
		return <AlertsCenter />
	} else if (page.route === "notifications") {
		return <NotificationsCenter />
	} else if (page.route === "smart") {
		return <Smart />
	} else if (page.route === "settings") {
		return <Settings />
	}
})

function ModuleDisabledPage({ moduleId }: { moduleId: ReturnType<typeof getModuleForAppRoute> }) {
	const module = moduleId ? getPulseModule(moduleId) : undefined
	useEffect(() => {
		document.title = pageTitle(module ? `${module.name}已关闭` : "模块已关闭")
	}, [module])

	return (
		<section className="mx-auto grid min-h-[calc(100svh-10rem)] w-full max-w-3xl place-items-center py-10 sm:py-16">
			<div className="w-full rounded-lg border border-border/70 bg-card p-3 shadow-none">
				<div className="rounded-md bg-surface-soft p-5 text-center sm:p-8">
					<div className="mx-auto grid size-12 place-items-center rounded-md border border-border/70 bg-card text-muted-foreground shadow-none">
						<SearchXIcon className="size-5" strokeWidth={1.9} />
					</div>
					<div className="mt-5 text-xs font-medium text-muted-foreground">Module disabled</div>
					<h1 className="mt-2 text-balance text-2xl font-semibold tracking-[-0.03em] text-foreground sm:text-3xl">
						{module?.name ?? "模块"}已关闭
					</h1>
					<p className="mx-auto mt-3 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
						入口和直接访问已暂停，历史数据和配置仍保留。
					</p>
					<div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
						<Button variant="outline" className="gap-2" onClick={() => window.history.back()}>
							<ArrowLeftIcon className="size-4" />
							返回上一页
						</Button>
						<Button asChild className="gap-2">
							<Link href={getPagePath($router, "settings", { name: isAdmin() ? "modules" : "about" })}>
								<HomeIcon className="size-4" />
								{isAdmin() ? "打开模块管理" : "打开关于页"}
							</Link>
						</Button>
					</div>
				</div>
			</div>
		</section>
	)
}

function NotFoundPage() {
	useEffect(() => {
		document.title = pageTitle("页面不存在")
	}, [])

	return (
		<section className="mx-auto grid min-h-[calc(100svh-10rem)] w-full max-w-3xl place-items-center py-10 sm:py-16">
			<div className="w-full rounded-lg border border-border/70 bg-card p-3 shadow-none">
				<div className="rounded-md bg-surface-soft p-5 text-center sm:p-8">
					<div className="mx-auto grid size-12 place-items-center rounded-md border border-border/70 bg-card text-muted-foreground shadow-none">
						<SearchXIcon className="size-5" strokeWidth={1.9} />
					</div>
					<div className="mt-5 text-xs font-medium text-muted-foreground">404 / Not found</div>
					<h1 className="mt-2 text-balance text-2xl font-semibold tracking-[-0.03em] text-foreground sm:text-3xl">
						这个页面不存在
					</h1>
					<p className="mx-auto mt-3 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
						链接可能已经失效，或当前版本没有这个入口。你可以回到首页继续查看监控状态。
					</p>
					<div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
						<Button variant="outline" className="gap-2" onClick={() => window.history.back()}>
							<ArrowLeftIcon className="size-4" />
							返回上一页
						</Button>
						<Button asChild className="gap-2">
							<Link href="/">
								<HomeIcon className="size-4" />
								回到首页
							</Link>
						</Button>
					</div>
				</div>
			</div>
		</section>
	)
}

const Layout = () => {
	const authenticated = useStore($authenticated)
	const copyContent = useStore($copyContent)
	const direction = useStore($direction)
	const page = useStore($router)
	const { isMobile } = useMobileLayout()
	const [runtimeReady, setRuntimeReady] = useState(false)
	const [hubConfigured, setHubConfigured] = useState(true)

	useEffect(() => {
		document.documentElement.dir = direction
	}, [direction])

	useEffect(() => {
		let ignore = false
		initializePocketBaseRuntime()
			.then(async (runtime) => {
				if (ignore) {
					return
				}
				if (pb.authStore.isValid) {
					await verifyAuth()
				}
				if (ignore) {
					return
				}
				setHubConfigured(runtime.hubConfigured)
				setRuntimeReady(true)
				$authenticated.set(pb.authStore.isValid)
				registerServiceWorker()
				ensureMobileNotificationPermission().catch((error) => console.error("mobile notification permission", error))
			})
			.catch((error) => {
				console.error(error)
				if (!ignore) {
					setRuntimeReady(true)
					setHubConfigured(false)
				}
			})
		return () => {
			ignore = true
		}
	}, [])

	if (!runtimeReady) {
		return (
			<div className="grid min-h-svh place-items-center bg-background px-4">
				<LoadingState title="正在启动 Pulse" description="连接 Hub 并恢复本地运行环境" />
			</div>
		)
	}

	if (!hubConfigured) {
		return <MobileHubSetup onReady={() => setHubConfigured(true)} />
	}

	return (
		<DirectionProvider dir={direction}>
			{!authenticated ? (
				<Suspense fallback={<AppRouteLoading title="正在打开登录页" />}>
					<LoginPage />
				</Suspense>
			) : (
				<div className={cn(isMobile && "pulse-mobile-root", isMobile && isAndroidApp() && "pulse-android-app")}>
					<div
						className={cn(
							"container",
							!isMobile &&
								"sticky top-0 z-40 bg-background/95 py-1 backdrop-blur supports-[backdrop-filter]:bg-background/85"
						)}
					>
						<Navbar />
					</div>
					<div className={cn("container relative", isMobile ? "pulse-mobile-content" : "pb-0")}>
						<MobileOfflineBanner />
						<Suspense fallback={<AppRouteLoading title="正在加载页面" />}>
							<App />
						</Suspense>
						<MobileSnapshotBridge />
						{copyContent && (
							<Suspense fallback={<AppRouteLoading title="正在准备复制内容" compact />}>
								<CopyToClipboardDialog content={copyContent} />
							</Suspense>
						)}
					</div>
					<MobileBottomNav activeRoute={page?.route} />
				</div>
			)}
		</DirectionProvider>
	)
}

function AppRouteLoading({ title, compact = false }: { title: string; compact?: boolean }) {
	return (
		<LoadingState
			title={title}
			description="正在加载页面资源"
			compact={compact}
			className={compact ? "min-h-0 p-0" : "my-4"}
		/>
	)
}

function registerServiceWorker() {
	if (!("serviceWorker" in navigator)) {
		return
	}
	if (globalThis.PULSE?.DEV_BUILD || isAndroidApp()) {
		navigator.serviceWorker.getRegistrations().then((registrations) => {
			for (const registration of registrations) {
				registration.unregister().catch((error) => console.error("service worker unregister", error))
			}
		})
		if ("caches" in window) {
			caches
				.keys()
				.then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
				.catch((error) => console.error("service worker cache cleanup", error))
		}
		return
	}
	const base = (globalThis.PULSE?.BASE_PATH || "").replace(/\/$/, "")
	const swUrl = `${base}/sw.js`
	navigator.serviceWorker.register(swUrl).catch((error) => console.error("service worker", error))
}

const I18nApp = () => {
	return (
		<I18nProvider i18n={i18n}>
			<ThemeProvider>
				<Layout />
				<Toaster />
			</ThemeProvider>
		</I18nProvider>
	)
}

const appElement = document.getElementById("app") as HTMLElement
const rootStore = globalThis as typeof globalThis & {
	__pulseRoot?: ReturnType<typeof ReactDOM.createRoot>
}
const root = rootStore.__pulseRoot ?? ReactDOM.createRoot(appElement)
rootStore.__pulseRoot = root

// StrictMode is intentionally disabled in dev because the double mount breaks
// the clipboard dialog lifecycle.
root.render(<I18nApp />)
