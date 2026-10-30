import { useLingui } from "@lingui/react/macro"
import { memo, useEffect, useMemo } from "react"
import ContainersTable from "@/components/containers-table/containers-table"
import { ActiveAlerts } from "@/components/active-alerts"
import { MobilePageShell, useMobileLayout } from "@/components/mobile/mobile-ui"
import { pageTitle } from "@/lib/branding"

export default memo(() => {
	const { t } = useLingui()
	const { isMobile } = useMobileLayout()

	useEffect(() => {
		document.title = pageTitle(t`All Containers`)
	}, [t])

	return useMemo(
		() =>
			isMobile ? (
				<MobilePageShell title="容器" subtitle="按机器和编排查看运行状态">
					<ActiveAlerts />
					<ContainersTable />
				</MobilePageShell>
			) : (
				<div className="grid pulse-card-gap">
					<ActiveAlerts />
					<ContainersTable />
				</div>
			),
		[isMobile]
	)
})
