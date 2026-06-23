import { useMemo } from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import {
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart"
import { EmptyState } from "@/components/ui/empty-state"
import { formatShortDate } from "@/lib/utils"
import type { WebsiteMonitorCheckRecord } from "@/types"
import { formatLatency, statusLabel } from "./format"
import { targetLabel } from "./target-utils"
import type { MonitorTargetPayload } from "./types"

const TARGET_COLORS = ["hsl(160, 84%, 39%)", "hsl(217, 91%, 60%)", "hsl(38, 92%, 50%)", "hsl(271, 81%, 60%)"]
const BUCKET_MS = 60_000
const MAX_BUCKETS = 60

type ChartTarget = Pick<MonitorTargetPayload, "id" | "label">

type LatencyPoint = {
	created: number
	latencies: Record<string, number | null>
	statuses: Record<string, WebsiteMonitorCheckRecord["status"] | undefined>
}

export function CheckLatencyChart({
	checks,
	targets,
}: {
	checks: WebsiteMonitorCheckRecord[]
	targets: MonitorTargetPayload[]
}) {
	const chartTargets = useMemo(() => resolveChartTargets(checks, targets), [checks, targets])
	const chartPoints = useMemo(() => buildLatencyChart(checks, chartTargets), [checks, chartTargets])
	const labelToTargetID = useMemo(
		() => new Map(chartTargets.map((target) => [target.label, target.id])),
		[chartTargets]
	)

	if (checks.length === 0 || chartPoints.length === 0 || chartTargets.length === 0) {
		return (
			<div className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-none">
				<ChartHeader />
				<div className="p-3">
					<EmptyState
						loading={false}
						loadingText="正在加载检测记录"
						emptyText="暂无检测记录"
						className="min-h-48 bg-surface-soft"
					/>
				</div>
			</div>
		)
	}

	return (
		<div className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-none">
			<ChartHeader />
			<div className="h-72 p-3 tabular-nums">
				<ChartContainer className="h-full w-full">
					<LineChart accessibilityLayer data={chartPoints} margin={{ top: 12, right: 12, bottom: 4, left: 0 }}>
						<CartesianGrid vertical={false} strokeDasharray="3 3" />
						<YAxis
							width={52}
							domain={[0, "dataMax"]}
							axisLine={false}
							tickLine={false}
							tickMargin={8}
							tickFormatter={(value) => `${Math.round(Number(value))} ms`}
						/>
						<XAxis
							dataKey="created"
							type="number"
							scale="time"
							domain={["dataMin", "dataMax"]}
							axisLine={false}
							tickLine={false}
							tickMargin={8}
							minTickGap={28}
							tickFormatter={(value) => formatChartTime(Number(value))}
						/>
						<ChartTooltip
							animationEasing="ease-out"
							animationDuration={150}
							content={
								<ChartTooltipContent
									labelFormatter={(_, payload) => formatShortDate(new Date(payload[0].payload.created).toISOString())}
									contentFormatter={(item, key) => {
										const targetID = labelToTargetID.get(String(item.name ?? key)) ?? String(key)
										const status = item.payload?.statuses?.[targetID]
										return [statusLabel(status), formatLatency(Number(item.value))].join(" · ")
									}}
								/>
							}
						/>
						{chartTargets.map((target, index) => (
							<Line
								key={target.id}
								type="monotoneX"
								dataKey={(point: LatencyPoint) => point.latencies[target.id]}
								name={target.label}
								stroke={TARGET_COLORS[index % TARGET_COLORS.length]}
								strokeWidth={2.2}
								strokeLinecap="round"
								strokeLinejoin="round"
								dot={false}
								activeDot={{ r: 4, strokeWidth: 0 }}
								connectNulls
								isAnimationActive={false}
							/>
						))}
						{chartTargets.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
					</LineChart>
				</ChartContainer>
			</div>
		</div>
	)
}

function ChartHeader() {
	return (
		<div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-surface-soft px-3 py-2.5">
			<div className="text-sm font-semibold tracking-[-0.01em]">响应趋势</div>
			<div className="text-xs text-muted-foreground">按地址分线显示最近检测延迟</div>
		</div>
	)
}

function resolveChartTargets(checks: WebsiteMonitorCheckRecord[], targets: MonitorTargetPayload[]): ChartTarget[] {
	if (targets.length > 0) {
		return targets.map((target) => ({ id: target.id, label: target.label }))
	}
	const seen = new Set<string>()
	return checks.flatMap((check) => {
		const id = check.target || "internal"
		if (seen.has(id)) {
			return []
		}
		seen.add(id)
		return [{ id, label: targetLabel(id) }]
	})
}

function buildLatencyChart(checks: WebsiteMonitorCheckRecord[], targets: ChartTarget[]) {
	const targetIDs = targets.map((target) => target.id)
	const pointsByTime = new Map<number, LatencyPoint>()
	const orderedChecks = [...checks]
		.map((check) => ({ check, time: new Date(check.created).getTime() }))
		.filter(({ time }) => Number.isFinite(time))
		.sort((a, b) => a.time - b.time)

	for (const { check, time } of orderedChecks) {
		const targetID = resolveCheckTargetID(check, targetIDs)
		if (!targetID) {
			continue
		}
		const created = Math.floor(time / BUCKET_MS) * BUCKET_MS
		const point = getOrCreatePoint(pointsByTime, created, targetIDs)
		point.latencies[targetID] = typeof check.latency_ms === "number" ? check.latency_ms : null
		point.statuses[targetID] = check.status
	}

	return Array.from(pointsByTime.values())
		.sort((a, b) => a.created - b.created)
		.slice(-MAX_BUCKETS)
}

function getOrCreatePoint(points: Map<number, LatencyPoint>, created: number, targetIDs: string[]) {
	let point = points.get(created)
	if (!point) {
		point = {
			created,
			latencies: Object.fromEntries(targetIDs.map((id) => [id, null])),
			statuses: {},
		}
		points.set(created, point)
	}
	return point
}

function resolveCheckTargetID(check: WebsiteMonitorCheckRecord, targetIDs: string[]) {
	const raw = check.target || "internal"
	if (targetIDs.includes(raw)) {
		return raw
	}
	if (raw === "internal" || raw === "external") {
		const version = String(check.ip_version ?? "").toLowerCase()
		const versionMatched = targetIDs.find((id) => id.startsWith(raw) && (!version || id.includes(version)))
		return versionMatched ?? targetIDs.find((id) => id.startsWith(raw))
	}
	return targetIDs[0]
}

function formatChartTime(value: number) {
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) {
		return ""
	}
	return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })
}
