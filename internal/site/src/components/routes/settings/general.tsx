/** biome-ignore-all lint/correctness/useUniqueElementIds: component is only rendered once */
import { Trans } from "@lingui/react/macro"
import { AlertTriangleIcon, ClockIcon, LoaderCircleIcon, PaletteIcon, RulerIcon, SaveIcon } from "lucide-react"
import { useState, type FormEvent, type ReactNode } from "react"
import { MobileGeneralSettingsForm } from "@/components/mobile/mobile-general-settings"
import { useTheme, type Theme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { HourFormat, Unit } from "@/lib/enums"
import { chartTimeData, currentHour12 } from "@/lib/utils"
import type { UserSettings } from "@/types"
import { saveSettings } from "./layout"

export default function SettingsProfilePage({ userSettings }: { userSettings: UserSettings }) {
	const [isLoading, setIsLoading] = useState(false)
	const { theme, setTheme } = useTheme()

	async function handleSubmit(e: FormEvent<HTMLFormElement>) {
		e.preventDefault()
		setIsLoading(true)
		const formData = new FormData(e.target as HTMLFormElement)
		const data = Object.fromEntries(formData) as Partial<UserSettings>
		const nextTheme = formData.get("theme") as Theme | null
		delete (data as Partial<UserSettings> & { theme?: Theme }).theme
		await saveSettings(data)
		if (nextTheme && nextTheme !== theme) {
			setTheme(nextTheme)
		}
		setIsLoading(false)
	}

	return (
		<div className="flex h-full w-full max-w-6xl flex-col py-1">
			<MobileGeneralSettingsForm userSettings={userSettings} isLoading={isLoading} onSubmit={handleSubmit} />
			<form onSubmit={handleSubmit} className="hidden flex-1 flex-col gap-4 md:flex">
				<section className="overflow-hidden rounded-lg border border-border/70 bg-surface-soft shadow-none">
					<div className="border-b border-border/70 bg-card px-5 py-4">
						<div className="flex min-w-0 items-start justify-between gap-4">
							<div className="min-w-0">
								<div className="text-xs font-medium text-muted-foreground">个人偏好</div>
								<h3 className="mt-1 text-xl font-semibold tracking-tight">
									<Trans>General</Trans>
								</h3>
								<p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
									设置主题、图表时间、单位和告警颜色阈值。这里只影响当前用户的显示偏好。
								</p>
							</div>
							<Button
								type="submit"
								className="shrink-0 gap-1.5 transition-transform active:scale-[0.96] disabled:opacity-100"
								disabled={isLoading}
							>
								{isLoading ? <LoaderCircleIcon className="size-4 animate-spin" /> : <SaveIcon className="size-4" />}
								<Trans>Save Settings</Trans>
							</Button>
						</div>
					</div>

					<div className="grid gap-3 p-4">
						<DesktopSettingSection
							icon={<PaletteIcon className="size-4 text-muted-foreground" />}
							title="界面偏好"
							description="控制当前用户看到的主题模式。"
						>
							<DesktopSettingField label="主题" htmlFor="theme">
								<Select name="theme" key={theme} defaultValue={theme}>
									<SelectTrigger id="theme">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="system">跟随系统</SelectItem>
										<SelectItem value="light">浅色</SelectItem>
										<SelectItem value="dark">深色</SelectItem>
									</SelectContent>
								</Select>
							</DesktopSettingField>
						</DesktopSettingSection>

						<DesktopSettingSection
							icon={<ClockIcon className="size-4 text-muted-foreground" />}
							title={<Trans>Chart options</Trans>}
							description="控制图表默认时间范围和时间格式。"
						>
							<DesktopSettingField label={<Trans>Default time period</Trans>} htmlFor="chartTime">
								<Select name="chartTime" key={userSettings.chartTime} defaultValue={userSettings.chartTime}>
									<SelectTrigger id="chartTime">
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
							</DesktopSettingField>
							<DesktopSettingField label={<Trans>Time format</Trans>} htmlFor="hourFormat">
								<Select
									name="hourFormat"
									key={userSettings.hourFormat}
									defaultValue={userSettings.hourFormat ?? (currentHour12() ? HourFormat["12h"] : HourFormat["24h"])}
								>
									<SelectTrigger id="hourFormat">
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
							</DesktopSettingField>
						</DesktopSettingSection>

						<DesktopSettingSection
							icon={<RulerIcon className="size-4 text-muted-foreground" />}
							title={<Trans comment="Temperature / network units">Unit preferences</Trans>}
							description="统一温度、网络和磁盘读写单位，避免不同页面口径不一致。"
						>
							<DesktopSettingField label={<Trans>Temperature unit</Trans>} htmlFor="unitTemp">
								<Select
									name="unitTemp"
									key={userSettings.unitTemp}
									defaultValue={userSettings.unitTemp?.toString() || String(Unit.Celsius)}
								>
									<SelectTrigger id="unitTemp">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={String(Unit.Celsius)}>
											<Trans>Celsius (°C)</Trans>
										</SelectItem>
										<SelectItem value={String(Unit.Fahrenheit)}>
											<Trans>Fahrenheit (°F)</Trans>
										</SelectItem>
									</SelectContent>
								</Select>
							</DesktopSettingField>
							<DesktopSettingField
								label={<Trans comment="Context: Bytes or bits">Network unit</Trans>}
								htmlFor="unitNet"
							>
								<Select
									name="unitNet"
									key={userSettings.unitNet}
									defaultValue={userSettings.unitNet?.toString() ?? String(Unit.Bytes)}
								>
									<SelectTrigger id="unitNet">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={String(Unit.Bytes)}>
											<Trans>Bytes (KB/s, MB/s, GB/s)</Trans>
										</SelectItem>
										<SelectItem value={String(Unit.Bits)}>
											<Trans>Bits (Kbps, Mbps, Gbps)</Trans>
										</SelectItem>
									</SelectContent>
								</Select>
							</DesktopSettingField>
							<DesktopSettingField label={<Trans>Disk unit</Trans>} htmlFor="unitDisk">
								<Select
									name="unitDisk"
									key={userSettings.unitDisk}
									defaultValue={userSettings.unitDisk?.toString() ?? String(Unit.Bytes)}
								>
									<SelectTrigger id="unitDisk">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={String(Unit.Bytes)}>
											<Trans>Bytes (KB/s, MB/s, GB/s)</Trans>
										</SelectItem>
										<SelectItem value={String(Unit.Bits)}>
											<Trans>Bits (Kbps, Mbps, Gbps)</Trans>
										</SelectItem>
									</SelectContent>
								</Select>
							</DesktopSettingField>
						</DesktopSettingSection>

						<DesktopSettingSection
							icon={<AlertTriangleIcon className="size-4 text-muted-foreground" />}
							title={<Trans>Warning thresholds</Trans>}
							description="只影响颜色提示阈值，不会改变告警规则。告警规则仍在通知设置中管理。"
						>
							<DesktopSettingField label={<Trans>Warning (%)</Trans>} htmlFor="colorWarn">
								<Input
									id="colorWarn"
									name="colorWarn"
									type="number"
									min={1}
									max={100}
									className="min-w-24"
									defaultValue={userSettings.colorWarn ?? 65}
								/>
							</DesktopSettingField>
							<DesktopSettingField label={<Trans>Critical (%)</Trans>} htmlFor="colorCrit">
								<Input
									id="colorCrit"
									name="colorCrit"
									type="number"
									min={1}
									max={100}
									className="min-w-24"
									defaultValue={userSettings.colorCrit ?? 90}
								/>
							</DesktopSettingField>
						</DesktopSettingSection>
					</div>
				</section>
			</form>
		</div>
	)
}

function DesktopSettingSection({
	icon,
	title,
	description,
	children,
}: {
	icon: ReactNode
	title: ReactNode
	description: string
	children: ReactNode
}) {
	return (
		<section className="grid gap-4 rounded-lg border border-border/70 bg-card p-4 shadow-none lg:grid-cols-[13rem_minmax(0,1fr)]">
			<div className="min-w-0">
				<div className="flex items-center gap-2">
					<span className="grid size-8 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft">
						{icon}
					</span>
					<h4 className="text-sm font-semibold">{title}</h4>
				</div>
				<p className="mt-2 text-pretty text-xs leading-relaxed text-muted-foreground">{description}</p>
			</div>
			<div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
		</section>
	)
}

function DesktopSettingField({ label, htmlFor, children }: { label: ReactNode; htmlFor: string; children: ReactNode }) {
	return (
		<div className="grid gap-2 rounded-lg border border-border/70 bg-card p-3 shadow-none">
			<Label className="block text-xs font-medium text-muted-foreground" htmlFor={htmlFor}>
				{label}
			</Label>
			{children}
		</div>
	)
}
