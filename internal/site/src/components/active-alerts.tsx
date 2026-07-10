import { alertInfo } from "@/lib/alerts"
import { $alerts, $allSystemsById } from "@/lib/stores"
import type { AlertRecord } from "@/types"
import { Plural, Trans } from "@lingui/react/macro"
import { useStore } from "@nanostores/react"
import { getPagePath } from "@nanostores/router"
import { useMemo } from "react"
import { $router, Link } from "./router"
import { Alert, AlertTitle, AlertDescription } from "./ui/alert"
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card"

export const ActiveAlerts = () => {
	const alerts = useStore($alerts)
	const systems = useStore($allSystemsById)

	const { activeAlerts, alertsKey } = useMemo(() => {
		const activeAlerts: AlertRecord[] = []
		// key to prevent re-rendering if alerts change but active alerts didn't
		const alertsKey: string[] = []

		for (const systemId of Object.keys(alerts)) {
			for (const alert of alerts[systemId].values()) {
				if (alert.triggered && alert.name in alertInfo) {
					activeAlerts.push(alert)
					alertsKey.push(`${alert.system}${alert.value}${alert.min}`)
				}
			}
		}

		return { activeAlerts, alertsKey }
	}, [alerts])

	return useMemo(() => {
		if (activeAlerts.length === 0) {
			return null
		}
		return (
			<Card className="overflow-hidden border-border/70 bg-card shadow-none">
				<CardHeader className="border-b border-border/70 bg-surface-soft px-5 py-4">
					<div className="grid gap-1">
						<CardTitle className="text-xl">
							<Trans>Active Alerts</Trans>
						</CardTitle>
						<p className="text-sm text-muted-foreground">当前触发中的告警会优先显示在首页顶部</p>
					</div>
				</CardHeader>
				<CardContent className="p-4">
					{activeAlerts.length > 0 && (
						<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
							{activeAlerts.map((alert) => {
								const info = alertInfo[alert.name as keyof typeof alertInfo]
								return (
									<Alert
										key={alert.id}
										className="border-border/70 bg-card shadow-none transition-[background-color,border-color,transform] duration-150 ease-out hover:border-foreground/10 hover:bg-surface-soft"
									>
										<info.icon className="h-4 w-4" />
										<AlertTitle>
											{systems[alert.system]?.name} {info.name()}
										</AlertTitle>
										<AlertDescription>
											{alert.name === "Status" ? (
												<Trans>Connection is down</Trans>
											) : info.invert ? (
												<Trans>
													Below {alert.value}
													{info.unit} in last <Plural value={alert.min} one="# minute" other="# minutes" />
												</Trans>
											) : (
												<Trans>
													Exceeds {alert.value}
													{info.unit} in last <Plural value={alert.min} one="# minute" other="# minutes" />
												</Trans>
											)}
										</AlertDescription>
										<Link
											href={getPagePath($router, "system", { id: systems[alert.system]?.id })}
											className="absolute inset-0 w-full h-full"
											aria-label="View system"
										></Link>
									</Alert>
								)
							})}
						</div>
					)}
				</CardContent>
			</Card>
		)
	}, [alertsKey.join("")])
}
