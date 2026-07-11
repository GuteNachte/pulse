import type { JSX } from "react"
import { useLingui } from "@lingui/react/macro"
import * as React from "react"
import * as RechartsPrimitive from "recharts"
import type { Props as LegendContentProps } from "recharts/types/component/DefaultLegendContent"
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent"
import type { TooltipPayload } from "recharts/types/state/tooltipSlice"
import { chartTimeData, cn } from "@/lib/utils"
import type { ChartData } from "@/types"
import { Separator } from "./separator"
import type { AxisDomain } from "recharts/types/util/types"

// Format: { THEME_NAME: CSS_SELECTOR }
const THEMES = { light: "", dark: ".dark" } as const

export type ChartConfig = {
	[k in string]: {
		label?: React.ReactNode
		icon?: React.ComponentType
	} & ({ color?: string; theme?: never } | { color?: never; theme: Record<keyof typeof THEMES, string> })
}

// type ChartContextProps = {
// 	config: ChartConfig
// }

// const ChartContext = React.createContext<ChartContextProps | null>(null)

// function useChart() {
// 	const context = React.useContext(ChartContext)

// 	if (!context) {
// 		throw new Error('useChart must be used within a <ChartContainer />')
// 	}

// 	return context
// }

const ChartContainer = React.forwardRef<
	HTMLDivElement,
	React.ComponentProps<"div"> & {
		// config: ChartConfig
		children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"]
	}
>(({ id, className, children, ...props }, ref) => {
	const uniqueId = React.useId()
	const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`

	return (
		//<ChartContext.Provider value={{ config }}>
		//</ChartContext.Provider>
		<div
			data-chart={chartId}
			ref={ref}
			className={cn(
				"text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-transparent [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-transparent [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-transparent [&_.recharts-reference-line-line]:stroke-border [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-sector]:outline-hidden [&_.recharts-surface]:outline-hidden",
				className
			)}
			{...props}
		>
			{/* <ChartStyle id={chartId} config={config} /> */}
			<RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
		</div>
	)
})
ChartContainer.displayName = "Chart"

// const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
// 	const colorConfig = Object.entries(config).filter(([_, config]) => config.theme || config.color)

// 	if (!colorConfig.length) {
// 		return null
// 	}

// 	return (
// 		<style
// 			dangerouslySetInnerHTML={{
// 				__html: Object.entries(THEMES).map(
// 					([theme, prefix]) => `
// ${prefix} [data-chart=${id}] {
// ${colorConfig
// 	.map(([key, itemConfig]) => {
// 		const color = itemConfig.theme?.[theme as keyof typeof itemConfig.theme] || itemConfig.color
// 		return color ? `  --color-${key}: ${color};` : null
// 	})
// 	.join('\n')}
// }
// `
// 				),
// 			}}
// 		/>
// 	)
// }

const ChartTooltip = RechartsPrimitive.Tooltip

type ChartTooltipItem = RechartsPrimitive.TooltipPayloadEntry

type ChartTooltipContentProps = Omit<
	RechartsPrimitive.TooltipContentProps<ValueType, NameType>,
	"active" | "payload" | "coordinate" | "accessibilityLayer" | "activeIndex" | "itemSorter"
> &
	React.ComponentProps<"div"> & {
		active?: boolean
		payload?: TooltipPayload
		itemSorter?: (a: ChartTooltipItem, b: ChartTooltipItem) => number
		hideLabel?: boolean
		indicator?: "line" | "dot" | "dashed"
		nameKey?: string
		labelKey?: string
		unit?: string
		filter?: string
		contentFormatter?: (item: ChartTooltipItem, key: string) => React.ReactNode | string
		truncate?: boolean
		showTotal?: boolean
		totalLabel?: React.ReactNode
	}

const ChartTooltipContent = React.forwardRef<HTMLDivElement, ChartTooltipContentProps>(
	(
		{
			active,
			payload,
			className,
			indicator = "line",
			hideLabel = false,
			label,
			labelFormatter,
			labelClassName,
			formatter,
			color,
			nameKey,
			labelKey,
			unit,
			filter,
			itemSorter,
			contentFormatter: content = undefined,
			truncate = false,
			showTotal = false,
			totalLabel,
		},
		ref
	) => {
		// const { config } = useChart()
		const config = {}
		const { t } = useLingui()
		const totalLabelNode = totalLabel ?? t`Total`
		const totalName = typeof totalLabelNode === "string" ? totalLabelNode : t`Total`

		const tooltipPayload = React.useMemo<TooltipPayload>(() => {
			let nextPayload = payload ? [...payload] : []
			if (filter) {
				const filterTerms = filter
					.toLowerCase()
					.split(" ")
					.filter((term) => term.length > 0)
				nextPayload = nextPayload.filter((item) => {
					const itemName = (item.name as string)?.toLowerCase()
					return filterTerms.some((term) => itemName?.includes(term))
				})
			}
			if (typeof itemSorter === "function") {
				nextPayload.sort(itemSorter)
			}
			return nextPayload
		}, [filter, itemSorter, payload])

		const totalValueDisplay = React.useMemo(() => {
			if (!showTotal || !tooltipPayload.length) {
				return null
			}

			let totalValue = 0
			let hasNumericValue = false

			for (const item of tooltipPayload) {
				const numericValue = typeof item.value === "number" ? item.value : Number(item.value)
				if (Number.isFinite(numericValue)) {
					totalValue += numericValue
					hasNumericValue = true
				}
			}

			if (!hasNumericValue) {
				return null
			}

			const totalKey = "__total__"
			const totalItem: ChartTooltipItem = {
				graphicalItemId: "__total__",
				value: totalValue,
				name: totalName,
				dataKey: totalKey,
				color,
			}

			if (content) {
				totalItem.payload = tooltipPayload[0]?.payload
			}

			if (typeof formatter === "function") {
				return formatter(totalValue, totalName, totalItem, tooltipPayload.length, tooltipPayload)
			}

			if (content) {
				return content(totalItem, totalKey)
			}

			return `${totalValue.toLocaleString()}${unit ?? ""}`
		}, [color, content, formatter, nameKey, showTotal, tooltipPayload, totalName, unit])

		const tooltipLabel = React.useMemo(() => {
			if (hideLabel || !tooltipPayload.length) {
				return null
			}

			const [item] = tooltipPayload
			const key = `${labelKey || item.name || "value"}`
			const itemConfig = getPayloadConfigFromPayload(config, item, key)
			const value = !labelKey && typeof label === "string" ? label : itemConfig?.label

			if (labelFormatter) {
				return <div className={cn("font-medium", labelClassName)}>{labelFormatter(value, tooltipPayload)}</div>
			}

			if (!value) {
				return null
			}

			return <div className={cn("font-medium", labelClassName)}>{value}</div>
		}, [label, labelFormatter, tooltipPayload, hideLabel, labelClassName, config, labelKey])

		if (!active || !tooltipPayload.length) {
			return null
		}

		// const nestLabel = payload.length === 1 && indicator !== 'dot'
		const nestLabel = false

		return (
			<div
				ref={ref}
				className={cn(
					"grid min-w-32 items-start gap-2 rounded-lg border border-border/70 bg-card px-3 py-2 text-xs text-foreground shadow-popover",
					className
				)}
			>
				{!nestLabel ? tooltipLabel : null}
				<div className="grid gap-1.5">
					{tooltipPayload.map((item, index) => {
						const key = `${nameKey || item.name || item.dataKey || "value"}`
						const itemConfig = getPayloadConfigFromPayload(config, item, key)
						const indicatorColor = color || (item.payload as { fill?: string } | undefined)?.fill || item.color

						return (
							<div
								key={`${item.name ?? item.dataKey ?? index}`}
								className={cn(
									"flex w-full items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground",
									indicator === "dot" && "items-center"
								)}
							>
								{formatter && item?.value !== undefined && item.name ? (
									formatter(item.value, item.name, item, index, item.payload)
								) : (
									<>
										{itemConfig?.icon ? (
											<itemConfig.icon />
										) : (
											<div
												className={cn("shrink-0 rounded-[2px] border-border bg-(--color-bg)", {
													"h-2.5 w-2.5 rounded-[3px]": indicator === "dot",
													"w-1 rounded-[3px]": indicator === "line",
													"w-0 border-[1.5px] border-dashed bg-transparent": indicator === "dashed",
													"my-0.5": nestLabel && indicator === "dashed",
												})}
												style={
													{
														"--color-bg": indicatorColor,
														"--color-border": indicatorColor,
													} as React.CSSProperties
												}
											/>
										)}
										<div
											className={cn(
												"flex flex-1 justify-between leading-none gap-2",
												nestLabel ? "items-end" : "items-center"
											)}
										>
											{nestLabel ? tooltipLabel : null}
											<span
												className={cn(
													"text-muted-foreground",
													truncate ? "max-w-40 truncate leading-normal -my-1" : ""
												)}
											>
												{itemConfig?.label || item.name}
											</span>
											{item.value !== undefined && (
												<span className="font-medium tabular-nums text-foreground">
													{content && typeof content === "function"
														? content(item, key)
														: String(item.value).toLocaleString() + (unit ? unit : "")}
												</span>
											)}
										</div>
									</>
								)}
							</div>
						)
					})}
					{totalValueDisplay ? (
						<>
							<Separator className="mt-0.5 bg-border/70" />
							<div className="-mt-0.75 flex items-center justify-between gap-2 font-medium">
								<span className="text-muted-foreground ps-3">{totalLabelNode}</span>
								<span className="tabular-nums">{totalValueDisplay}</span>
							</div>
						</>
					) : null}
				</div>
			</div>
		)
	}
)
ChartTooltipContent.displayName = "ChartTooltip"

const ChartLegend = RechartsPrimitive.Legend

const ChartLegendContent = React.forwardRef<
	HTMLDivElement,
	React.ComponentProps<"div"> &
		Pick<LegendContentProps, "payload" | "verticalAlign"> & {
			hideIcon?: boolean
			nameKey?: string
			reverse?: boolean
		}
>(({ className, payload, verticalAlign = "bottom", reverse = false }, ref) => {
	// const { config } = useChart()

	if (!payload?.length) {
		return null
	}

	const reversedPayload = reverse ? [...payload].reverse() : payload

	return (
		<div
			ref={ref}
			className={cn(
				"flex flex-wrap items-center justify-center gap-3 gap-y-1 ps-4 text-xs",
				verticalAlign === "top" ? "pb-3" : "pt-3",
				className
			)}
		>
			{reversedPayload.map((item) => {
				// const key = `${nameKey || item.dataKey || 'value'}`
				// const itemConfig = getPayloadConfigFromPayload(config, item, key)

				return (
					<div
						key={item.value}
						className={cn(
							// 'flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-muted-foreground text-muted-foreground'
							"flex items-center gap-1.5 text-muted-foreground"
						)}
					>
						{/* {itemConfig?.icon && !hideIcon ? (
							<itemConfig.icon />
						) : ( */}
						<div
							className="h-2 w-2 shrink-0 rounded-[3px]"
							style={{
								backgroundColor: item.color,
							}}
						/>
						{item.value}
						{/* )} */}
						{/* {itemConfig?.label} */}
					</div>
				)
			})}
		</div>
	)
})
ChartLegendContent.displayName = "ChartLegend"

// Helper to extract item config from a payload.
function getPayloadConfigFromPayload(config: ChartConfig, payload: unknown, key: string) {
	if (typeof payload !== "object" || payload === null) {
		return undefined
	}

	const payloadPayload =
		"payload" in payload && typeof payload.payload === "object" && payload.payload !== null
			? payload.payload
			: undefined

	let configLabelKey: string = key

	if (key in payload && typeof payload[key as keyof typeof payload] === "string") {
		configLabelKey = payload[key as keyof typeof payload] as string
	} else if (
		payloadPayload &&
		key in payloadPayload &&
		typeof payloadPayload[key as keyof typeof payloadPayload] === "string"
	) {
		configLabelKey = payloadPayload[key as keyof typeof payloadPayload] as string
	}

	return configLabelKey in config ? config[configLabelKey] : config[key as keyof typeof config]
}

let cachedAxis: JSX.Element
const xAxis = ({ domain, ticks, chartTime }: ChartData) => {
	if (cachedAxis && domain[0] === cachedAxis.props.domain[0]) {
		return cachedAxis
	}
	cachedAxis = (
		<RechartsPrimitive.XAxis
			dataKey="created"
			domain={domain}
			ticks={ticks}
			allowDataOverflow
			type="number"
			scale="time"
			minTickGap={12}
			tickMargin={8}
			axisLine={false}
			tickFormatter={chartTimeData[chartTime].format}
		/>
	)
	return cachedAxis
}

export {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
	ChartLegend,
	ChartLegendContent,
	xAxis,
	// ChartStyle,
}

export function pinnedAxisDomain(): AxisDomain {
	return [
		0,
		(dataMax: number) => {
			if (dataMax > 10) {
				return Math.round(dataMax)
			}
			if (dataMax > 1) {
				return Math.round(dataMax / 0.1) * 0.1
			}
			return dataMax
		},
	]
}
