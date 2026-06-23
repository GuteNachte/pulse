import { Trans } from "@lingui/react/macro"
import { getPagePath } from "@nanostores/router"
import { AlertTriangleIcon, BellIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { $router, Link } from "@/components/router"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { pb } from "@/lib/api"
import type { NotificationFailureRecord } from "@/types"

export function NotificationFailuresBanner() {
	const [failures, setFailures] = useState<NotificationFailureRecord[]>([])

	useEffect(() => {
		let unsubscribe: (() => void) | undefined
		let ignore = false

		const loadFailures = async () => {
			try {
				const records = await pb.collection<NotificationFailureRecord>("notification_failures").getFullList({
					sort: "-updated",
					fields: "id,title,target,error,count,created,updated",
				})
				if (!ignore) {
					setFailures(records)
				}
			} catch {
				if (!ignore) {
					setFailures([])
				}
			}
		}

		loadFailures()
		;(async () => {
			try {
				unsubscribe = await pb
					.collection<NotificationFailureRecord>("notification_failures")
					.subscribe("*", loadFailures)
			} catch {
				// Ignore subscription failures; the next page load will fetch the latest state.
			}
		})()

		return () => {
			ignore = true
			unsubscribe?.()
		}
	}, [])

	if (failures.length === 0) {
		return null
	}

	const latest = failures[0]

	return (
		<Alert className="border-orange-500/24 bg-card text-foreground shadow-none dark:border-orange-300/18 dark:bg-card">
			<AlertTriangleIcon className="size-4 text-orange-600 dark:text-orange-300" />
			<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<AlertTitle>
						<Trans>外部通知发送失败</Trans>
					</AlertTitle>
					<AlertDescription className="text-muted-foreground">
						<Trans>
							最近一次失败来自 {latest.target}，已连续失败 {latest.count} 次。请检查 Webhook URL、网络或目标服务状态。
						</Trans>
						{failures.length > 1 && (
							<span className="ms-1">
								<Trans>当前共有 {failures.length} 个通知通道存在失败记录。</Trans>
							</span>
						)}
					</AlertDescription>
				</div>
				<Button asChild variant="outline" size="sm" className="min-h-10 shrink-0 border-orange-500/30 bg-card px-3">
					<Link href={getPagePath($router, "settings", { name: "notifications" })}>
						<BellIcon className="size-4" />
						<span className="ms-1">
							<Trans>检查通知</Trans>
						</span>
					</Link>
				</Button>
			</div>
		</Alert>
	)
}
