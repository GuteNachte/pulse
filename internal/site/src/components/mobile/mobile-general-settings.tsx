import { AlertTriangleIcon, ClockIcon, LoaderCircleIcon, PaletteIcon, RulerIcon, SaveIcon } from "lucide-react"
import type { FormEvent, ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useTheme } from "@/components/theme-provider"
import { HourFormat, Unit } from "@/lib/enums"
import { chartTimeData, currentHour12 } from "@/lib/utils"
import type { UserSettings } from "@/types"

export function MobileGeneralSettingsForm({
	userSettings,
	isLoading,
	onSubmit,
}: {
	userSettings: UserSettings
	isLoading: boolean
	onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
	const { theme } = useTheme()

	return (
		<form onSubmit={onSubmit} className="grid gap-4 md:hidden">
			<section className="grid gap-3 rounded-lg border border-border/70 bg-surface-soft p-3 shadow-none">
				<div className="rounded-md border border-border/70 bg-card p-3 shadow-none">
					<div className="text-xs font-medium text-muted-foreground">个人偏好</div>
					<div className="mt-1 text-[17px] font-semibold leading-tight tracking-tight">常规设置</div>
					<p className="mt-1 text-pretty text-xs leading-relaxed text-muted-foreground">
						设置主题、图表时间、单位和告警颜色阈值。这里只影响当前用户的显示偏好。
					</p>
				</div>
			</section>

			<MobileSettingGroup title="界面偏好" icon={<PaletteIcon className="size-4 text-muted-foreground" />}>
				<MobileSettingField label="主题" htmlFor="mobile-theme">
					<Select name="theme" key={theme} defaultValue={theme}>
						<SelectTrigger id="mobile-theme" className="min-h-11">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="system">跟随系统</SelectItem>
							<SelectItem value="light">浅色</SelectItem>
							<SelectItem value="dark">深色</SelectItem>
						</SelectContent>
					</Select>
				</MobileSettingField>
			</MobileSettingGroup>

			<MobileSettingGroup title="图表" icon={<ClockIcon className="size-4 text-muted-foreground" />}>
				<MobileSettingField label="默认时间范围" htmlFor="mobile-chartTime">
					<Select name="chartTime" key={userSettings.chartTime} defaultValue={userSettings.chartTime}>
						<SelectTrigger id="mobile-chartTime" className="min-h-11">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{Object.entries(chartTimeData).map(([value, { label }]) => (
								<SelectItem key={value} value={value}>
									{label()}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</MobileSettingField>
				<MobileSettingField label="时间格式" htmlFor="mobile-hourFormat">
					<Select
						name="hourFormat"
						key={userSettings.hourFormat}
						defaultValue={userSettings.hourFormat ?? (currentHour12() ? HourFormat["12h"] : HourFormat["24h"])}
					>
						<SelectTrigger id="mobile-hourFormat" className="min-h-11">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{Object.keys(HourFormat).map((value) => (
								<SelectItem key={value} value={value}>
									{value}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</MobileSettingField>
			</MobileSettingGroup>

			<MobileSettingGroup title="单位" icon={<RulerIcon className="size-4 text-muted-foreground" />}>
				<MobileSettingField label="温度单位" htmlFor="mobile-unitTemp">
					<Select
						name="unitTemp"
						key={userSettings.unitTemp}
						defaultValue={userSettings.unitTemp?.toString() || String(Unit.Celsius)}
					>
						<SelectTrigger id="mobile-unitTemp" className="min-h-11">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={String(Unit.Celsius)}>Celsius (°C)</SelectItem>
							<SelectItem value={String(Unit.Fahrenheit)}>Fahrenheit (°F)</SelectItem>
						</SelectContent>
					</Select>
				</MobileSettingField>
				<MobileSettingField label="网络单位" htmlFor="mobile-unitNet">
					<Select
						name="unitNet"
						key={userSettings.unitNet}
						defaultValue={userSettings.unitNet?.toString() ?? String(Unit.Bytes)}
					>
						<SelectTrigger id="mobile-unitNet" className="min-h-11">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={String(Unit.Bytes)}>Bytes (KB/s, MB/s, GB/s)</SelectItem>
							<SelectItem value={String(Unit.Bits)}>Bits (Kbps, Mbps, Gbps)</SelectItem>
						</SelectContent>
					</Select>
				</MobileSettingField>
				<MobileSettingField label="磁盘单位" htmlFor="mobile-unitDisk">
					<Select
						name="unitDisk"
						key={userSettings.unitDisk}
						defaultValue={userSettings.unitDisk?.toString() ?? String(Unit.Bytes)}
					>
						<SelectTrigger id="mobile-unitDisk" className="min-h-11">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={String(Unit.Bytes)}>Bytes (KB/s, MB/s, GB/s)</SelectItem>
							<SelectItem value={String(Unit.Bits)}>Bits (Kbps, Mbps, Gbps)</SelectItem>
						</SelectContent>
					</Select>
				</MobileSettingField>
			</MobileSettingGroup>

			<MobileSettingGroup title="阈值" icon={<AlertTriangleIcon className="size-4 text-muted-foreground" />}>
				<p className="text-pretty text-xs leading-relaxed text-muted-foreground">
					这里只影响颜色提示阈值，不会改变告警规则。
				</p>
				<div className="grid grid-cols-2 gap-3">
					<MobileSettingField label="警告 (%)" htmlFor="mobile-colorWarn">
						<Input
							id="mobile-colorWarn"
							name="colorWarn"
							type="number"
							min={1}
							max={100}
							className="min-h-11"
							defaultValue={userSettings.colorWarn ?? 65}
						/>
					</MobileSettingField>
					<MobileSettingField label="严重 (%)" htmlFor="mobile-colorCrit">
						<Input
							id="mobile-colorCrit"
							name="colorCrit"
							type="number"
							min={1}
							max={100}
							className="min-h-11"
							defaultValue={userSettings.colorCrit ?? 90}
						/>
					</MobileSettingField>
				</div>
			</MobileSettingGroup>

			<Button type="submit" className="min-h-11 w-full justify-center gap-1.5" disabled={isLoading}>
				{isLoading ? <LoaderCircleIcon className="size-4 animate-spin" /> : <SaveIcon className="size-4" />}
				保存设置
			</Button>
		</form>
	)
}

function MobileSettingGroup({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
	return (
		<section className="grid gap-3 rounded-lg border border-border/70 bg-surface-soft p-3 shadow-none">
			<div className="flex items-center gap-2 text-sm font-semibold">
				<span className="grid size-8 shrink-0 place-items-center rounded-md border border-border/70 bg-card">
					{icon}
				</span>
				{title}
			</div>
			<div className="grid gap-3">{children}</div>
		</section>
	)
}

function MobileSettingField({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
	return (
		<div className="grid gap-2 rounded-md border border-border/70 bg-card p-3 shadow-none">
			<Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
				{label}
			</Label>
			{children}
		</div>
	)
}
