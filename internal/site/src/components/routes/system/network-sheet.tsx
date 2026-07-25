import { t } from "@lingui/core/macro"
import { useStore } from "@nanostores/react"
import { MoreHorizontalIcon } from "lucide-react"
import { memo, useRef, useState, type ReactElement } from "react"
import AreaChartDefault from "@/components/charts/area-chart"
import { useNetworkInterfaces } from "@/components/charts/hooks"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Sheet, SheetTrigger } from "@/components/ui/sheet"
import { DialogTitle } from "@/components/ui/dialog"
import { $userSettings } from "@/lib/stores"
import { decimalString, formatBytes, toFixedFloat } from "@/lib/utils"
import type { ChartData, NetworkInterfaceDetails, SystemDetailsRecord } from "@/types"
import { ChartCard } from "./chart-card"
import { SystemDetailSheetContent } from "./detail-sheet-layout"
import { getPrimaryNetworkInterface } from "./metric-summary-utils"

export default memo(function NetworkSheet({
	chartData,
	details,
	dataEmpty,
	grid,
	maxValues,
	open,
	onOpenChange,
	hideTrigger,
	trigger,
	fallback,
}: {
	chartData: ChartData
	details?: SystemDetailsRecord | null
	dataEmpty: boolean
	grid: boolean
	maxValues: boolean
	open?: boolean
	onOpenChange?: (open: boolean) => void
	hideTrigger?: boolean
	trigger?: ReactElement
	fallback?: ReactElement
}) {
	const [internalOpen, setInternalOpen] = useState(false)
	const netInterfacesOpen = open ?? internalOpen
	const setNetInterfacesOpen = onOpenChange ?? setInternalOpen
	const netInterfaces = useNetworkInterfaces(chartData.systemStats.at(-1)?.stats?.ni ?? {})
	const hasOpened = useRef(false)

	if (netInterfacesOpen && !hasOpened.current) {
		hasOpened.current = true
	}

	if (!netInterfaces.length) {
		return fallback ?? null
	}

	return (
		<Sheet modal={false} open={netInterfacesOpen} onOpenChange={setNetInterfacesOpen}>
			<DialogTitle className="sr-only">{t`Network traffic of public interfaces`}</DialogTitle>
			{!hideTrigger && (
				<SheetTrigger asChild>
					{trigger ?? (
						<Button
							title={t`View more`}
							variant="outline"
							size="icon"
							className="shrink-0 max-sm:absolute max-sm:top-0 max-sm:end-0"
						>
							<MoreHorizontalIcon />
						</Button>
					)}
				</SheetTrigger>
			)}
			{hasOpened.current && (
				<SystemDetailSheetContent
					title={t`Network traffic of public interfaces`}
					description="展示主网卡信息、上下行流量和接口累计流量。"
				>
					<div className="grid pulse-card-gap">
						<PrimaryNetworkInterfaceInfoCard details={details} chartData={chartData} />
						<NetworkDetailContent chartData={chartData} dataEmpty={dataEmpty} grid={grid} maxValues={maxValues} />
					</div>
				</SystemDetailSheetContent>
			)}
		</Sheet>
	)
})

export function PrimaryNetworkInterfaceInfoCard({
	details,
	chartData,
}: {
	details?: SystemDetailsRecord | null
	chartData: ChartData
}) {
	const primaryInterface = getPrimaryNetworkInterface(details, chartData.systemStats)
	return <NetworkInterfaceInfoCard networkInterface={primaryInterface} />
}

export function NetworkDetailContent({
	chartData,
	dataEmpty,
	grid,
	maxValues,
	fallback,
}: {
	chartData: ChartData
	dataEmpty: boolean
	grid: boolean
	maxValues: boolean
	fallback?: ReactElement
}) {
	const userSettings = useStore($userSettings)
	const netInterfaces = useNetworkInterfaces(chartData.systemStats.at(-1)?.stats?.ni ?? {})
	const showNetLegend = netInterfaces.length > 0 && netInterfaces.length < 15

	if (!netInterfaces.length) {
		return fallback ?? null
	}

	return (
		<div className="grid grid-cols-1 pulse-card-gap xl:grid-cols-2">
			<ChartCard
				empty={dataEmpty}
				grid={grid}
				title={t`Download`}
				description={t`Network traffic of public interfaces`}
				legend={showNetLegend}
				className="min-h-auto"
			>
				<AreaChartDefault
					chartData={chartData}
					maxToggled={maxValues}
					itemSorter={(a, b) => b.value - a.value}
					dataPoints={netInterfaces.data(1)}
					legend={showNetLegend}
					tickFormatter={(val) => {
						const { value, unit } = formatBytes(val, true, userSettings.unitNet, false)
						return `${toFixedFloat(value, value >= 10 ? 0 : 1)} ${unit}`
					}}
					contentFormatter={({ value }) => {
						const { value: convertedValue, unit } = formatBytes(value, true, userSettings.unitNet, false)
						return `${decimalString(convertedValue, convertedValue >= 100 ? 1 : 2)} ${unit}`
					}}
				/>
			</ChartCard>

			<ChartCard
				empty={dataEmpty}
				grid={grid}
				title={t`Upload`}
				description={t`Network traffic of public interfaces`}
				legend={showNetLegend}
				className="min-h-auto"
			>
				<AreaChartDefault
					chartData={chartData}
					maxToggled={maxValues}
					itemSorter={(a, b) => b.value - a.value}
					legend={showNetLegend}
					dataPoints={netInterfaces.data(0)}
					tickFormatter={(val) => {
						const { value, unit } = formatBytes(val, true, userSettings.unitNet, false)
						return `${toFixedFloat(value, value >= 10 ? 0 : 1)} ${unit}`
					}}
					contentFormatter={({ value }) => {
						const { value: convertedValue, unit } = formatBytes(value, true, userSettings.unitNet, false)
						return `${decimalString(convertedValue, convertedValue >= 100 ? 1 : 2)} ${unit}`
					}}
				/>
			</ChartCard>

			<ChartCard
				empty={dataEmpty}
				grid={grid}
				title={t`Cumulative Download`}
				description={t`Total data received for each interface`}
				legend={showNetLegend}
				className="min-h-auto"
			>
				<AreaChartDefault
					chartData={chartData}
					legend={showNetLegend}
					dataPoints={netInterfaces.data(3)}
					tickFormatter={(val) => {
						const { value, unit } = formatBytes(val, false, userSettings.unitNet, false)
						return `${toFixedFloat(value, value >= 10 ? 0 : 1)} ${unit}`
					}}
					contentFormatter={({ value }) => {
						const { value: convertedValue, unit } = formatBytes(value, false, userSettings.unitNet, false)
						return `${decimalString(convertedValue, convertedValue >= 100 ? 1 : 2)} ${unit}`
					}}
				/>
			</ChartCard>

			<ChartCard
				empty={dataEmpty}
				grid={grid}
				title={t`Cumulative Upload`}
				description={t`Total data sent for each interface`}
				legend={showNetLegend}
				className="min-h-auto"
			>
				<AreaChartDefault
					chartData={chartData}
					legend={showNetLegend}
					dataPoints={netInterfaces.data(2)}
					tickFormatter={(val) => {
						const { value, unit } = formatBytes(val, false, userSettings.unitNet, false)
						return `${toFixedFloat(value, value >= 10 ? 0 : 1)} ${unit}`
					}}
					contentFormatter={({ value }) => {
						const { value: convertedValue, unit } = formatBytes(value, false, userSettings.unitNet, false)
						return `${decimalString(convertedValue, convertedValue >= 100 ? 1 : 2)} ${unit}`
					}}
				/>
			</ChartCard>
		</div>
	)
}

function NetworkInterfaceInfoCard({ networkInterface }: { networkInterface?: NetworkInterfaceDetails }) {
	if (!networkInterface) {
		return null
	}
	const linkSpeed = networkInterface.link_speed ? formatLinkSpeed(networkInterface.link_speed) : ""
	const ipMethod = getIPMethodLabel(networkInterface.ip_method)
	const title = networkInterface.display_name || networkInterface.name
	const subtitle = [networkInterface.name, networkInterface.status].filter(Boolean).join(" · ")
	const rows = [
		{ label: "IPv4", value: formatList(networkInterface.ipv4) },
		{ label: "IPv6", value: formatList(networkInterface.ipv6) },
		{ label: "网关", value: formatList(networkInterface.gateways) },
		{ label: "DNS", value: formatList(networkInterface.dns_servers) },
		{ label: "获取方式", value: ipMethod },
		{ label: "链路速率", value: linkSpeed },
		{ label: "MAC", value: networkInterface.mac },
	].filter((row) => row.value)

	if (!rows.length) {
		return null
	}

	return (
		<Card className="bg-surface-soft p-4 xl:col-span-2">
			<div className="grid gap-3">
				<div className="min-w-0">
					<h3 className="truncate text-base font-semibold">{title}</h3>
					{subtitle && <p className="mt-1 truncate text-xs text-muted-foreground">{subtitle}</p>}
				</div>
				<div className="grid pulse-card-gap sm:grid-cols-2 xl:grid-cols-4">
					{rows.map((row) => (
						<div key={row.label} className="min-w-0 rounded-md border border-border bg-card px-3 py-2">
							<div className="text-[11px] font-medium text-muted-foreground">{row.label}</div>
							<div className="mt-1 break-words text-sm font-medium tabular-nums">{row.value}</div>
						</div>
					))}
				</div>
			</div>
		</Card>
	)
}

function formatList(values?: string[]) {
	return (
		values
			?.map((value) => value.trim())
			.filter(Boolean)
			.join(" / ") ?? ""
	)
}

function getIPMethodLabel(value?: string) {
	switch (value?.trim().toLowerCase()) {
		case "dhcp":
			return "DHCP"
		case "static":
			return "静态 IP"
		default:
			return ""
	}
}

function formatLinkSpeed(value: number) {
	const units = ["bps", "Kbps", "Mbps", "Gbps", "Tbps"]
	let speed = value
	let unitIndex = 0
	while (speed >= 1000 && unitIndex < units.length - 1) {
		speed /= 1000
		unitIndex++
	}
	return `${decimalString(speed, speed >= 100 ? 0 : speed >= 10 ? 1 : 2)} ${units[unitIndex]}`
}
