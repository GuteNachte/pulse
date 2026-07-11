import { memo, useEffect, useRef, useState } from "react"
import { compareSemVer, parseSemVer } from "@/lib/utils"
import InfoBar from "./system/info-bar"
import { useSystemData } from "./system/use-system-data"
import { CapabilityStrip } from "./system/capability-strip"
import { MobileSystemDetail, type DetailView } from "../mobile/mobile-system-detail"
import { useMobileLayout } from "../mobile/mobile-ui"
import { StatusSummaryCards } from "./system/status-summary-cards"
import { SystemDetailContent } from "./system/system-detail-content"
import { IdentityDetailsDialog } from "./system/identity-details-card"
import { systemSupportsSoftwareServices } from "./system/metric-summary-utils"
import { hasCollectedContainerRuntime } from "./system/status-summary-utils"
import { isReadOnlyUser } from "@/lib/api"
import { SystemDialog } from "../add-system"
import { Dialog } from "../ui/dialog"

const SEMVER_0_14_0 = parseSemVer("0.14.0")
const SEMVER_0_15_0 = parseSemVer("0.15.0")

export default memo(function SystemDetail({ id }: { id: string }) {
	const systemData = useSystemData(id)
	const { isMobile } = useMobileLayout()

	const {
		system,
		systemStats,
		containerData,
		currentContainerCount,
		chartData,
		details,
		smartTotalCapacity,
		smartDisks,
		grid,
		activeTab,
		setActiveTab,
		tabsRef,
		maxValues,
		isLongerChart,
		showMax,
		dataEmpty,
		isPodman,
		lastGpus,
		hasGpuData,
		hasGpuPowerData,
	} = systemData

	// extra margin to add to bottom of page, specifically for temperature chart,
	// where the tooltip can go past the bottom of the page if lots of sensors
	const [pageBottomExtraMargin, setPageBottomExtraMargin] = useState(0)
	const [editOpen, setEditOpen] = useState(false)
	const [identityOpen, setIdentityOpen] = useState(false)
	const editOpened = useRef(false)
	const hasSoftwareServices = systemSupportsSoftwareServices(system)
	const canEditSystem = !isReadOnlyUser()
	const openEditDialog = canEditSystem
		? () => {
				editOpened.current = true
				setEditOpen(true)
			}
		: undefined

	useEffect(() => {
		if (activeTab === "services" && !hasSoftwareServices) {
			setActiveTab("overview")
		}
	}, [activeTab, hasSoftwareServices, setActiveTab])

	if (!system.id) {
		return null
	}

	const hasCurrentContainers = (currentContainerCount ?? 0) > 0
	const hasContainers =
		hasCurrentContainers || containerData.length > 0 || hasCollectedContainerRuntime(details, system)
	const maybeHasSmartData = compareSemVer(chartData.agentVersion, SEMVER_0_15_0) >= 0
	const hasContainersTable = hasContainers && compareSemVer(chartData.agentVersion, SEMVER_0_14_0) >= 0
	const hasGpu = hasGpuData || hasGpuPowerData

	// keep tabsRef in sync for keyboard navigation
	const tabs = [
		"overview",
		"memory",
		"disk",
		"network",
		"containers",
		"gpu",
		...(hasSoftwareServices ? ["services"] : []),
		"websites",
		"history",
	]
	tabsRef.current = tabs

	const detailContentProps = {
		view: activeTab as DetailView,
		system,
		systemStats,
		chartData,
		systemData,
		grid,
		showMax,
		isLongerChart,
		maxValues,
		dataEmpty,
		isPodman,
		hasContainers,
		hasContainersTable,
		hasGpu,
		hasGpuData,
		hasGpuPowerData,
		lastGpus,
		maybeHasSmartData,
		details,
		hasSoftwareServices,
		pageBottomExtraMargin,
		setPageBottomExtraMargin,
	}

	return (
		<div className="mb-14 overflow-x-clip">
			{canEditSystem && (
				<Dialog open={editOpen} onOpenChange={setEditOpen}>
					{editOpened.current && <SystemDialog system={system} setOpen={setEditOpen} />}
				</Dialog>
			)}
			{isMobile ? (
				<MobileSystemDetail
					system={system}
					details={details}
					hasContainers={hasContainers}
					hasGpu={hasGpu}
					hasSoftwareServices={hasSoftwareServices}
					activeView={activeTab as DetailView}
					onSelectView={setActiveTab}
					onEdit={openEditDialog}
				>
					<SystemDetailContent {...detailContentProps} compactMobile />
				</MobileSystemDetail>
			) : (
				<div className="grid gap-4">
					{/* system info */}
					<InfoBar
						system={system}
						chartData={chartData}
						details={details}
						servicesActive={hasSoftwareServices && activeTab === "services"}
						onServicesClick={hasSoftwareServices ? () => setActiveTab("services") : undefined}
						websitesActive={activeTab === "websites"}
						onWebsitesClick={() => setActiveTab("websites")}
						historyActive={activeTab === "history"}
						onHistoryClick={() => setActiveTab("history")}
						onIdentityClick={() => setIdentityOpen(true)}
						onEdit={openEditDialog}
					/>

					<IdentityDetailsDialog open={identityOpen} onOpenChange={setIdentityOpen} system={system} details={details} />

					<CapabilityStrip system={system} details={details} />

					<StatusSummaryCards
						system={system}
						systemStats={systemStats}
						details={details}
						lastGpus={lastGpus}
						containerData={containerData}
						currentContainerCount={currentContainerCount}
						smartTotalCapacity={smartTotalCapacity}
						smartDisks={smartDisks}
						hasContainers={hasContainers}
						hasGpu={hasGpu}
						activeView={activeTab as DetailView}
						onSelectView={setActiveTab}
					/>

					<SystemDetailContent {...detailContentProps} />
				</div>
			)}
		</div>
	)
})
