import { useEffect, useState } from "react"

export const offlineReadOnlyMessage = "当前手机端处于离线只读模式，请恢复网络后再执行操作。"

export function isOfflineReadOnlyMode() {
	return typeof navigator !== "undefined" && navigator.onLine === false
}

export function isWriteRequestMethod(method?: string) {
	return Boolean(method && !["GET", "HEAD"].includes(method.toUpperCase()))
}

export function useOnlineState() {
	const [online, setOnline] = useState(() => !isOfflineReadOnlyMode())

	useEffect(() => {
		const update = () => setOnline(!isOfflineReadOnlyMode())
		window.addEventListener("online", update)
		window.addEventListener("offline", update)
		return () => {
			window.removeEventListener("online", update)
			window.removeEventListener("offline", update)
		}
	}, [])

	return online
}
