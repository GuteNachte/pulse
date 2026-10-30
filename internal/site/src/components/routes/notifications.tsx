import { useEffect } from "react"
import { redirectPage } from "@nanostores/router"
import { $router } from "@/components/router"

export default function NotificationsCenter() {
	useEffect(() => {
		redirectPage($router, "settings", { name: "notifications" })
	}, [])

	return null
}
