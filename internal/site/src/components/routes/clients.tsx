import { Trans, useLingui } from "@lingui/react/macro"
import { PlusIcon } from "lucide-react"
import { memo, Suspense, useEffect, useMemo, useState } from "react"
import { AddSystemDialog } from "@/components/add-system"
import { ActiveAlerts } from "@/components/active-alerts"
import { MobileClientsPage } from "@/components/mobile/mobile-clients"
import { useMobileLayout } from "@/components/mobile/mobile-ui"
import { NotificationFailuresBanner } from "@/components/notification-failures-banner"
import SystemsTable from "@/components/systems-table/systems-table"
import { Button } from "@/components/ui/button"
import { LoadingState } from "@/components/ui/loading-state"
import { isReadOnlyUser } from "@/lib/api"
import { pageTitle } from "@/lib/branding"

export default memo(() => {
	const { t } = useLingui()
	const [addSystemDialogOpen, setAddSystemDialogOpen] = useState(false)
	const showAddSystem = !isReadOnlyUser()
	const { isMobile } = useMobileLayout()

	useEffect(() => {
		document.title = pageTitle(t`All Clients`)
	}, [t])

	return useMemo(
		() => (
			<div className="flex flex-col gap-4">
				<AddSystemDialog open={addSystemDialogOpen} setOpen={setAddSystemDialogOpen} />
				<NotificationFailuresBanner />
				<ActiveAlerts />
				{isMobile ? (
					<MobileClientsPage showAddSystem={showAddSystem} onAddSystem={() => setAddSystemDialogOpen(true)} />
				) : (
					<Suspense fallback={<LoadingState title="正在加载客户端列表" description="读取机器状态和筛选组件" />}>
						<SystemsTable
							headerAction={
								showAddSystem ? (
									<Button variant="outline" className="gap-1" onClick={() => setAddSystemDialogOpen(true)}>
										<PlusIcon className="size-4" />
										<Trans>Add system</Trans>
									</Button>
								) : null
							}
						/>
					</Suspense>
				)}
			</div>
		),
		[addSystemDialogOpen, isMobile, showAddSystem]
	)
})
