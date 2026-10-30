import { memo, useEffect, useRef, useState, type ReactNode } from "react"
import { compareSemVer, cn, parseSemVer } from "@/lib/utils"
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
import { isAdmin } from "@/lib/api"
import { SystemDialog } from "../add-system"
import { Dialog } from "../ui/dialog"

const SEMVER_0_14_0 = parseSemVer("0.14.0")
const SEMVER_0_15_0 = parseSemVer("0.15.0")

export default memo(function SystemDetail({
	id,
	embedded = false,
	titleOverride,
	headerChips,
	metaChips,
	primaryActions,
	moreMenuItems,
	stickyTopClassName = "top-0",
}: {
	id: string
	embedded?: boolean
	/** 覆盖标题（监控页用资产名作为主标题） */
	titleOverride?: string
	/** 标题行追加的状态徽标（监控绑定状态等） */
	headerChips?: ReactNode
	/** 状态胶囊行末尾追加的信息胶囊（资产型号、最近检查等） */
	metaChips?: ReactNode
	/** 「更多」菜单之外常驻的主操作（资产详情跳转等） */
	primaryActions?: ReactNode
	/** 追加到「更多」菜单末尾的条目（暂停 / 删除监控目标等） */
	moreMenuItems?: ReactNode
	/** 吸顶头部块的 top 类名：页面无其他吸顶元素时贴导航（默认），监控页在概览条下方 */
	stickyTopClassName?: string
}) {
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
	const canEditSystem = isAdmin()
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
		<div className={embedded ? "" : "mb-14 overflow-x-clip"}>
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
				<div className="grid pulse-card-gap">
					{/* 头部块（信息卡 + 状态卡）吸顶：滚动浏览监控内容时设备身份、关键指标与
					    视图切换始终可见，只有下方实际参数区（图表 / 表格）滚动 */}
					<div
						className={cn(
							"sticky z-30 grid pulse-card-gap bg-background pb-1 shadow-[0_10px_12px_-12px_rgb(0_0_0/0.35)]",
							stickyTopClassName
						)}
					>
						{/* system info（设备能力条并入同一张卡片底部） */}
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
							titleOverride={titleOverride}
							headerChips={headerChips}
							metaChips={metaChips}
							primaryActions={primaryActions}
							moreMenuItems={moreMenuItems}
							below={<CapabilityStrip system={system} details={details} variant="inline" />}
						/>

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
					</div>

					<IdentityDetailsDialog open={identityOpen} onOpenChange={setIdentityOpen} system={system} details={details} />

					<SystemDetailContent {...detailContentProps} />
				</div>
			)}
		</div>
	)
})
