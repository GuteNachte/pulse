import { Capacitor } from "@capacitor/core"
import { Preferences } from "@capacitor/preferences"
import { SecureStoragePlugin } from "capacitor-secure-storage-plugin"
import type PocketBase from "pocketbase"

const hubUrlKey = "pulse.mobile.hub_url"
const authStateKey = "pulse.mobile.pb_auth"

export type PulseRuntimeEnvironment = "web" | "pwa" | "android"

export type MobileRuntimeState = {
	environment: PulseRuntimeEnvironment
	hubUrl: string
	hubConfigured: boolean
}

export type MobileSecureStorageStatus = {
	state: "secure" | "fallback" | "unsupported" | "failed"
	label: string
	description: string
}

export function getRuntimeEnvironment(): PulseRuntimeEnvironment {
	if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
		return "android"
	}
	if (isStandalonePwa()) {
		return "pwa"
	}
	return "web"
}

export function isAndroidApp() {
	return getRuntimeEnvironment() === "android"
}

export function isPwaLike() {
	const environment = getRuntimeEnvironment()
	return environment === "android" || environment === "pwa"
}

export function getDefaultHubUrl() {
	if (isAndroidApp()) {
		return "http://localhost:8090"
	}
	const url = new URL(window.location.href)
	if (url.port === "5173") {
		url.port = "8090"
	}
	return url.origin
}

export function getInitialPocketBaseBaseUrl() {
	if (isAndroidApp()) {
		return getDefaultHubUrl()
	}
	return globalThis.PULSE?.BASE_PATH || "/"
}

export function normalizeHubUrl(value: string) {
	const trimmed = value.trim()
	if (!trimmed) {
		throw new Error("Hub 地址不能为空")
	}
	const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
	const url = new URL(withProtocol)
	url.pathname = url.pathname.replace(/\/+$/, "")
	url.search = ""
	url.hash = ""
	return url.toString().replace(/\/$/, "")
}

export async function readStoredHubUrl() {
	if (isAndroidApp()) {
		const secureValue = await secureGet(hubUrlKey)
		if (secureValue) {
			return secureValue
		}
		const fallback = await Preferences.get({ key: hubUrlKey })
		return fallback.value || ""
	}
	return localStorage.getItem(hubUrlKey) || getDefaultHubUrl()
}

export async function saveStoredHubUrl(value: string) {
	const normalized = normalizeHubUrl(value)
	if (isAndroidApp()) {
		await secureSet(hubUrlKey, normalized)
		await Preferences.set({ key: hubUrlKey, value: normalized })
		return normalized
	}
	localStorage.setItem(hubUrlKey, normalized)
	return normalized
}

export async function clearStoredHubUrl() {
	if (isAndroidApp()) {
		await secureRemove(hubUrlKey)
		await Preferences.remove({ key: hubUrlKey })
		return
	}
	localStorage.removeItem(hubUrlKey)
}

export async function initializeMobileRuntime(pb: PocketBase): Promise<MobileRuntimeState> {
	const environment = getRuntimeEnvironment()
	const storedHubUrl = await readStoredHubUrl()
	const hubConfigured = environment !== "android" || Boolean(storedHubUrl)
	const hubUrl = storedHubUrl || getDefaultHubUrl()

	if (environment === "android" && hubConfigured) {
		pb.baseUrl = normalizeHubUrl(hubUrl)
	}

	return {
		environment,
		hubUrl,
		hubConfigured,
	}
}

export async function checkMobileSecureStorage(): Promise<MobileSecureStorageStatus> {
	if (!isAndroidApp()) {
		return {
			state: "unsupported",
			label: "非 Android",
			description: "当前运行环境不需要 Android 安全存储检测。",
		}
	}

	const key = "pulse.mobile.secure_storage_check"
	const value = `pulse-${Date.now()}`
	try {
		await SecureStoragePlugin.set({ key, value })
		const result = await SecureStoragePlugin.get({ key })
		await SecureStoragePlugin.remove({ key })
		if (result.value === value) {
			return {
				state: "secure",
				label: "安全存储",
				description: "Hub 地址和登录态可以写入 Android 安全存储。",
			}
		}
	} catch {
		// Fall through to Preferences diagnostics below.
	}

	try {
		await Preferences.set({ key, value })
		const result = await Preferences.get({ key })
		await Preferences.remove({ key })
		if (result.value === value) {
			return {
				state: "fallback",
				label: "普通存储",
				description: "安全存储不可用，当前会退回 Capacitor Preferences；建议检查插件和 Android 构建配置。",
			}
		}
	} catch {
		// Report failure below.
	}

	return {
		state: "failed",
		label: "不可用",
		description: "安全存储和 Preferences 都无法完成读写检测，请检查 App 权限和插件初始化。",
	}
}

export function createMobileAuthStoreAdapter() {
	return {
		initial: readAuthState(),
		save: (value: string) => saveAuthState(value),
		clear: () => clearAuthState(),
	}
}

async function readAuthState() {
	if (!isAndroidApp()) {
		return localStorage.getItem("pocketbase_auth") || ""
	}
	return (await secureGet(authStateKey)) || ""
}

async function saveAuthState(value: string) {
	if (!isAndroidApp()) {
		localStorage.setItem("pocketbase_auth", value)
		return
	}
	await secureSet(authStateKey, value)
}

async function clearAuthState() {
	if (!isAndroidApp()) {
		localStorage.removeItem("pocketbase_auth")
		return
	}
	await secureRemove(authStateKey)
}

async function secureGet(key: string) {
	try {
		if (!(await secureHasKey(key))) {
			return ""
		}
		const result = await SecureStoragePlugin.get({ key })
		return result.value || ""
	} catch {
		return ""
	}
}

async function secureHasKey(key: string) {
	try {
		const result = await SecureStoragePlugin.keys()
		return result.value.includes(key)
	} catch {
		return false
	}
}

async function secureSet(key: string, value: string) {
	try {
		await SecureStoragePlugin.set({ key, value })
	} catch {
		await Preferences.set({ key, value })
	}
}

async function secureRemove(key: string) {
	try {
		await SecureStoragePlugin.remove({ key })
	} catch {
		await Preferences.remove({ key })
	}
}

function isStandalonePwa() {
	const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }
	return window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true
}
