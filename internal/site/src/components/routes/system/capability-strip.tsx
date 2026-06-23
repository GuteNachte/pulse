import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { SystemDetailsRecord, SystemRecord } from "@/types"
import { getAgentProfileLabel, getCapabilities, stateLabel, stateVariant } from "./capability-strip-utils"
import { VirtualizationSummary } from "./virtualization-summary"

export function CapabilityStrip({ system, details }: { system: SystemRecord; details?: SystemDetailsRecord | null }) {
	const capabilities = getCapabilities({
		system,
		details,
	})

	return (
		<Card className="bg-surface-soft px-3 py-2.5 shadow-none sm:px-4">
			<div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_minmax(280px,380px)] xl:items-center">
				<div className="min-w-0">
					<div className="mb-2 flex flex-wrap items-center justify-between gap-2">
						<div className="flex flex-wrap items-center gap-2">
							<span className="text-xs font-semibold text-muted-foreground">设备能力</span>
							<Badge variant="outline" className="h-6 rounded-md bg-card px-2 text-[11px]">
								{getAgentProfileLabel(system, details)}
							</Badge>
						</div>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						{capabilities.map((capability) => (
							<Tooltip key={capability.id}>
								<TooltipTrigger asChild>
									<span className="inline-flex">
										<Badge
											variant={stateVariant[capability.state]}
											className={
												capability.state === "unsupported" || capability.state === "offline"
													? "h-6 gap-1.5 rounded-md border-border/70 bg-surface-soft px-2 text-[11px] text-muted-foreground"
													: "h-6 gap-1.5 rounded-md px-2 text-[11px]"
											}
										>
											<capability.Icon className="size-3.5" />
											{capability.label}
											<span className="font-normal">{stateLabel[capability.state]}</span>
										</Badge>
									</span>
								</TooltipTrigger>
								<TooltipContent className="max-w-xs">{capability.reason}</TooltipContent>
							</Tooltip>
						))}
					</div>
				</div>
				{system.role === "virtualization" && <VirtualizationSummary details={details} />}
			</div>
		</Card>
	)
}
