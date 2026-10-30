import { lazy } from "react"
import { useIntersectionObserver } from "@/lib/use-intersection-observer"
import { cn } from "@/lib/utils"
import type { Os } from "@/lib/enums"

const SmartTable = lazy(() => import("./smart-table"))
const MonitoredServicesTable = lazy(() => import("@/components/monitored-services-table/monitored-services-table"))

export function LazySmartTable({ systemId, os }: { systemId: string; os?: Os }) {
	const { isIntersecting, ref } = useIntersectionObserver({ rootMargin: "90px" })
	return (
		<div ref={ref} className={cn(isIntersecting && "contents")}>
			{isIntersecting && <SmartTable systemId={systemId} os={os} />}
		</div>
	)
}

export function LazyMonitoredServicesTable({
	systemId,
	onlyConfigured,
}: {
	systemId: string
	onlyConfigured?: boolean
}) {
	const { isIntersecting, ref } = useIntersectionObserver({ rootMargin: "90px" })
	return (
		<div ref={ref} className={cn(isIntersecting && "contents")}>
			{isIntersecting && <MonitoredServicesTable systemId={systemId} onlyConfigured={onlyConfigured} />}
		</div>
	)
}
