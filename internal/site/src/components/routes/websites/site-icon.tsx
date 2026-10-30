import { HomeIcon } from "lucide-react"
import type { WebsiteMonitorRecord } from "@/types"
import { deriveFaviconURL } from "./target-utils"

export function SiteIcon({ monitor }: { monitor: WebsiteMonitorRecord }) {
	const icon = monitor.icon_url || deriveFaviconURL(monitor.internal_url || monitor.external_url || monitor.url)
	const canLoadIcon = icon && !(window.location.protocol === "https:" && icon.startsWith("http://"))
	return (
		<div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md border border-border/70 bg-card shadow-none">
			{canLoadIcon ? (
				<img
					src={icon}
					alt=""
					className="size-6 object-contain"
					onError={(event) => {
						event.currentTarget.style.display = "none"
					}}
				/>
			) : (
				<HomeIcon className="size-5 text-muted-foreground" />
			)}
		</div>
	)
}
