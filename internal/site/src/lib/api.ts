import PocketBase, { AsyncAuthStore } from "pocketbase"
import { basePath } from "@/components/router"
import { toast } from "@/components/ui/use-toast"
import { isDemoMode } from "@/demo/mode"
import { demoReadOnlyMessage, isDemoWriteRequest } from "@/demo/write-guard"
import {
	createMobileAuthStoreAdapter,
	getInitialPocketBaseBaseUrl,
	initializeMobileRuntime,
	normalizeHubUrl,
	saveStoredHubUrl,
} from "@/lib/mobile-runtime"
import { isOfflineReadOnlyMode, isWriteRequestMethod, offlineReadOnlyMessage } from "@/lib/network-state"
import type { ChartTimes, UserSettings } from "@/types"
import { $alerts, $allSystemsById, $allSystemsByName, $userSettings } from "./stores"
import { chartTimeData } from "./utils"

/** PocketBase JS Client */
const mobileAuthStoreAdapter = createMobileAuthStoreAdapter()
export const pb = new PocketBase(
	getInitialPocketBaseBaseUrl() || basePath || "/",
	new AsyncAuthStore(mobileAuthStoreAdapter)
)

pb.beforeSend = (url, options) => {
	if (isDemoWriteRequest(isDemoMode(), options.method)) {
		throw new Error(demoReadOnlyMessage)
	}
	if (isOfflineReadOnlyMode() && isWriteRequestMethod(options.method)) {
		throw new Error(offlineReadOnlyMessage)
	}
	return { url, options }
}

export async function initializePocketBaseRuntime() {
	await mobileAuthStoreAdapter.initial
	if (import.meta.env.MODE === "demo") {
		const { seedDemoAuth } = await import("@/demo/auth")
		seedDemoAuth(pb)
		return { environment: "web" as const, hubUrl: "", hubConfigured: true }
	}
	const runtime = await initializeMobileRuntime(pb)
	await new Promise((resolve) => window.setTimeout(resolve, 0))
	return runtime
}

export async function saveAndUseHubUrl(value: string) {
	if (isDemoMode()) {
		throw new Error(demoReadOnlyMessage)
	}
	const normalized = normalizeHubUrl(value)
	await assertHubReachable(normalized)
	pb.baseUrl = normalized
	await saveStoredHubUrl(normalized)
	return normalized
}

async function assertHubReachable(baseUrl: string) {
	const controller = new AbortController()
	const timeout = window.setTimeout(() => controller.abort(), 5000)
	try {
		const response = await fetch(`${baseUrl}/api/health`, {
			method: "GET",
			cache: "no-store",
			signal: controller.signal,
		})
		if (!response.ok) {
			throw new Error(`Hub 健康检查返回 ${response.status}`)
		}
	} catch (error) {
		const message =
			error instanceof DOMException && error.name === "AbortError"
				? "连接 Hub 超时，请确认地址和端口。"
				: "无法连接到 Hub，请确认地址填写正确，并且手机或模拟器能访问该 Hub。"
		throw new Error(message)
	} finally {
		window.clearTimeout(timeout)
	}
}

export const isAdmin = () => pb.authStore.record?.role === "admin"
export const isReadOnlyUser = () => pb.authStore.record?.role === "readonly"

let authRefreshInFlight: Promise<void> | undefined
let userSettingsInFlight: Promise<void> | undefined

export function getCurrentUserSettingsFilter() {
	const userId = pb.authStore.record?.id
	return userId ? `user = "${userId}"` : ""
}

export const isPocketBaseAutoCancel = (error: unknown) => {
	return typeof error === "object" && error !== null && "status" in error && (error as { status?: number }).status === 0
}

export const verifyAuth = () => {
	if (!pb.authStore.token || authRefreshInFlight) {
		return authRefreshInFlight ?? Promise.resolve()
	}
	authRefreshInFlight = pb
		.collection("users")
		.authRefresh()
		.then(() => undefined)
		.catch((error) => {
			const status = typeof error?.status === "number" ? error.status : error?.response?.code
			if (status !== 401 && status !== 403) {
				console.warn("Auth refresh failed without invalidating session:", error)
				return
			}
			logOut()
			toast({
				title: "登录已过期",
				description: "请重新登录后继续使用。",
				variant: "destructive",
			})
		})
		.finally(() => {
			authRefreshInFlight = undefined
		})
	return authRefreshInFlight
}

/** Logs the user out by clearing the auth store and unsubscribing from realtime updates. */
export function logOut() {
	$allSystemsByName.set({})
	$allSystemsById.set({})
	$alerts.set({})
	$userSettings.set({} as UserSettings)
	sessionStorage.setItem("lo", "t") // prevent auto login on logout
	pb.authStore.clear()
	pb.realtime.unsubscribe()
}

/** Fetch user settings in database */
export function updateUserSettings() {
	if (userSettingsInFlight) {
		return userSettingsInFlight
	}
	userSettingsInFlight = updateUserSettingsInner().finally(() => {
		userSettingsInFlight = undefined
	})
	return userSettingsInFlight
}

async function updateUserSettingsInner() {
	const userFilter = getCurrentUserSettingsFilter()
	if (!userFilter) {
		return
	}
	try {
		const req = await pb
			.collection("user_settings")
			.getFirstListItem(userFilter, { fields: "settings", requestKey: null })
		$userSettings.set(req.settings)
		return
	} catch (e) {
		if (isPocketBaseAutoCancel(e)) {
			return
		}
		const status = typeof e === "object" && e !== null && "status" in e ? (e as { status?: number }).status : undefined
		if (status !== 404) {
			console.error("get settings", e)
			return
		}
	}
}

export function getPbTimestamp(timeString: ChartTimes, d?: Date) {
	d ||= chartTimeData[timeString].getOffset(new Date())
	const year = d.getUTCFullYear()
	const month = String(d.getUTCMonth() + 1).padStart(2, "0")
	const day = String(d.getUTCDate()).padStart(2, "0")
	const hours = String(d.getUTCHours()).padStart(2, "0")
	const minutes = String(d.getUTCMinutes()).padStart(2, "0")
	const seconds = String(d.getUTCSeconds()).padStart(2, "0")

	return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}
