import { t } from "@lingui/core/macro"
import { Trans } from "@lingui/react/macro"
import React, { type JSX, memo } from "react"
import { $maxValues } from "@/lib/stores"
import { useIntersectionObserver } from "@/lib/use-intersection-observer"
import { cn } from "@/lib/utils"
import Spinner from "../../spinner"
import { Card, CardHeader, CardTitle } from "../../ui/card"
import { ChartAverage, ChartMax } from "../../ui/icons"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select"

export const SelectAvgMax = memo(({ max }: { max: boolean }) => {
	const Icon = max ? ChartMax : ChartAverage
	return (
		<Select value={max ? "max" : "avg"} onValueChange={(e) => $maxValues.set(e === "max")}>
			<SelectTrigger className="relative ps-10 pe-5 w-full sm:w-44">
				<Icon className="h-4 w-4 absolute start-4 top-1/2 -translate-y-1/2 opacity-85" />
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectItem key="avg" value="avg">
					<Trans>Average</Trans>
				</SelectItem>
				<SelectItem key="max" value="max">
					<Trans comment="Chart select field. Please try to keep this short.">Max 1 min</Trans>
				</SelectItem>
			</SelectContent>
		</Select>
	)
})

export function ChartCard({
	title,
	description,
	children,
	grid,
	empty,
	cornerEl,
	titleSuffix,
	legend,
	className,
}: {
	title: string
	description: string
	children: React.ReactNode
	grid?: boolean
	empty?: boolean
	cornerEl?: JSX.Element | null
	titleSuffix?: JSX.Element | null
	legend?: boolean
	className?: string
}) {
	const { isIntersecting, ref } = useIntersectionObserver()

	return (
		<Card
			className={cn(
				"min-h-full border-border/70 bg-card px-3 py-4 shadow-none odd:last-of-type:col-span-full sm:px-5 sm:py-5",
				{ "col-span-full": !grid },
				className
			)}
			ref={ref}
		>
			<CardHeader className="relative mb-3 gap-1.5 p-0">
				<div className="flex min-w-0 flex-wrap items-center gap-2">
					<CardTitle className="min-w-0 truncate text-base sm:text-[1.05rem]">{title}</CardTitle>
					{titleSuffix}
				</div>
				{description && <p className="sr-only">{description}</p>}
				{cornerEl && <div className="my-1 grid sm:absolute sm:end-0 sm:top-0 sm:my-0 sm:justify-end">{cornerEl}</div>}
			</CardHeader>
			<div
				className={cn(
					"relative -me-1 -ms-3.5 ps-0 group rounded-md border border-border/70 bg-surface-soft pt-3",
					legend ? "h-54 md:h-56" : "h-48 md:h-52"
				)}
			>
				{
					<Spinner
						msg={empty ? t`Waiting for enough records to display` : undefined}
						className="group-has-[.opacity-100]:invisible duration-100"
					/>
				}
				{isIntersecting && children}
			</div>
		</Card>
	)
}
