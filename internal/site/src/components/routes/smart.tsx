import { useEffect } from "react"
import SmartTable from "@/components/routes/system/smart-table"
import { ActiveAlerts } from "@/components/active-alerts"
import { pageTitle } from "@/lib/branding"

export default function Smart() {
	useEffect(() => {
		document.title = pageTitle("S.M.A.R.T.")
	}, [])

	return (
		<div className="grid gap-4">
			<ActiveAlerts />
			<section className="rounded-lg border border-border/70 bg-card p-4 shadow-none sm:p-5">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div className="min-w-0">
						<div className="inline-flex h-7 items-center rounded-md border border-border/70 bg-surface-soft px-3 text-xs font-medium text-muted-foreground">
							硬盘健康
						</div>
						<h1 className="mt-3 text-2xl font-semibold ">S.M.A.R.T. 设备</h1>
						<p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
							查看 Agent 真实采集到的硬盘健康状态、温度、通电时间和设备属性；未采集到的数据不会用占位值补齐。
						</p>
					</div>
					<div className="inline-flex w-fit items-center rounded-md border border-border/70 bg-surface-soft px-3 py-1 text-xs text-muted-foreground">
						真实采集数据
					</div>
				</div>
			</section>
			<SmartTable />
		</div>
	)
}
