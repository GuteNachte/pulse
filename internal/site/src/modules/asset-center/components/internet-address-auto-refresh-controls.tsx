import { useId } from "react"
import { RefreshCwIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { internetAddressRefreshIntervalOptions } from "../asset-internet-address-status"

export type InternetAddressAutoRefreshSettings = {
	enabled: boolean
	intervalMinutes: number
}

export function InternetAddressAutoRefreshControls({
	settings,
	disabled,
	refreshing,
	onChange,
	onRefresh,
}: {
	settings: InternetAddressAutoRefreshSettings
	disabled: boolean
	refreshing: boolean
	onChange: (settings: InternetAddressAutoRefreshSettings) => void
	onRefresh: () => void
}) {
	const autoRefreshId = useId()

	return (
		<div className="flex flex-wrap items-center justify-end gap-2">
			<label
				htmlFor={autoRefreshId}
				className="inline-flex h-8 items-center gap-2 rounded-md border border-border/70 bg-card px-2.5 text-xs font-medium text-foreground"
			>
				<span>自动更新</span>
				<Switch
					id={autoRefreshId}
					aria-label="自动更新公网地址"
					checked={settings.enabled}
					disabled={disabled}
					onCheckedChange={(enabled) => onChange({ ...settings, enabled })}
				/>
			</label>
			<Select
				value={String(settings.intervalMinutes)}
				disabled={disabled || !settings.enabled}
				onValueChange={(value) => onChange({ ...settings, intervalMinutes: Number(value) })}
			>
				<SelectTrigger aria-label="公网地址更新时间" className="h-8 w-28 px-2.5 text-xs">
					<SelectValue />
				</SelectTrigger>
				<SelectContent align="end">
					<SelectGroup>
						{internetAddressRefreshIntervalOptions.map((option) => (
							<SelectItem key={option.value} value={String(option.value)}>
								{option.label}
							</SelectItem>
						))}
					</SelectGroup>
				</SelectContent>
			</Select>
			<Button
				type="button"
				variant="outline"
				size="sm"
				className="h-8 px-2.5 text-xs"
				disabled={disabled}
				onClick={onRefresh}
			>
				<RefreshCwIcon data-icon="inline-start" className={refreshing ? "size-3.5 animate-spin" : "size-3.5"} />
				{refreshing ? "刷新中" : "刷新公网地址"}
			</Button>
		</div>
	)
}
