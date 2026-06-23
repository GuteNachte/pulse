import { LocalNotifications } from "@capacitor/local-notifications"
import { isAndroidApp, isPwaLike } from "@/lib/mobile-runtime"

let permissionRequested = false
let lastNotificationKey = ""

export type MobileNotificationPermissionState = "unsupported" | "granted" | "denied" | "prompt" | "unknown"

export async function getMobileNotificationPermissionState(): Promise<MobileNotificationPermissionState> {
	if (!isPwaLike()) {
		return "unsupported"
	}
	if (isAndroidApp()) {
		try {
			const current = await LocalNotifications.checkPermissions()
			if (current.display === "granted" || current.display === "denied" || current.display === "prompt") {
				return current.display
			}
			return "unknown"
		} catch {
			return "unknown"
		}
	}
	if (!("Notification" in window)) {
		return "unsupported"
	}
	if (
		Notification.permission === "granted" ||
		Notification.permission === "denied" ||
		Notification.permission === "default"
	) {
		return Notification.permission === "default" ? "prompt" : Notification.permission
	}
	return "unknown"
}

export async function ensureMobileNotificationPermission() {
	if (!isPwaLike() || permissionRequested) {
		return
	}
	permissionRequested = true
	if (isAndroidApp()) {
		const current = await LocalNotifications.checkPermissions()
		if (current.display !== "granted") {
			await LocalNotifications.requestPermissions()
		}
		return
	}
	if ("Notification" in window && Notification.permission === "default") {
		await Notification.requestPermission()
	}
}

export async function notifyMobileAlert(title: string, body: string, key: string) {
	if (!isPwaLike() || key === lastNotificationKey) {
		return
	}
	lastNotificationKey = key
	await ensureMobileNotificationPermission()
	if (isAndroidApp()) {
		const permission = await LocalNotifications.checkPermissions()
		if (permission.display !== "granted") {
			return
		}
		await LocalNotifications.schedule({
			notifications: [
				{
					id: Date.now() % 2147483647,
					title,
					body,
					schedule: { at: new Date(Date.now() + 100) },
				},
			],
		})
		return
	}
	if ("Notification" in window && Notification.permission === "granted") {
		new Notification(title, { body, tag: key })
	}
}
