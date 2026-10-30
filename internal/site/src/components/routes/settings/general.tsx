import { LoaderCircleIcon, SaveIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useTheme, type Theme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import Slider from "@/components/ui/slider"
import { HourFormat, Unit } from "@/lib/enums"
import { chartTimeData, currentHour12 } from "@/lib/utils"
import type { UserSettings } from "@/types"
import { SettingsField } from "./components/field-row"
import { SettingsPageHeader } from "./components/page-header"
import { SettingsSaveBar, type SettingsSaveStatus } from "./components/save-bar"
import { SettingsSection, SettingsSectionStack } from "./components/section"
import { SettingsStatCard, SettingsStatGrid } from "./components/stat-card"
import { useDirtyForm } from "./hooks/use-dirty-form"
import { saveUserSettings } from "./save-settings"

type GeneralForm = {
	theme: Theme
	chartTime: UserSettings["chartTime"]
	hourFormat: string
	unitTemp: string
	unitNet: string
	unitDisk: string
	colorWarn: string
	colorCrit: string
}

const defaultHourFormat = () => (currentHour12() ? HourFormat["12h"] : HourFormat["24h"])

function formFromSettings(userSettings: UserSettings, theme: Theme): GeneralForm {
	return {
		theme,
		chartTime: userSettings.chartTime ?? "1h",
		hourFormat: String(userSettings.hourFormat ?? defaultHourFormat()),
		unitTemp: String(userSettings.unitTemp ?? Unit.Celsius),
		unitNet: String(userSettings.unitNet ?? Unit.Bytes),
		unitDisk: String(userSettings.unitDisk ?? Unit.Bytes),
		colorWarn: String(userSettings.colorWarn ?? 65),
		colorCrit: String(userSettings.colorCrit ?? 90),
	}
}

function defaultForm(): GeneralForm {
	return {
		theme: "system",
		chartTime: "1h",
		hourFormat: defaultHourFormat(),
		unitTemp: String(Unit.Celsius),
		unitNet: String(Unit.Bytes),
		unitDisk: String(Unit.Bytes),
		colorWarn: "65",
		colorCrit: "90",
	}
}

function validateThresholds(values: GeneralForm): string {
	const warn = Number(values.colorWarn)
	const crit = Number(values.colorCrit)
	if (!Number.isFinite(warn) || warn < 1 || warn > 100) {
		return "警告阈值需要在 1–100 之间。"
	}
	if (!Number.isFinite(crit) || crit < 1 || crit > 100) {
		return "严重阈值需要在 1–100 之间。"
	}
	if (warn >= crit) {
		return "警告阈值必须小于严重阈值。"
	}
	return ""
}

export default function SettingsProfilePage({ userSettings }: { userSettings: UserSettings }) {
	const { theme, setTheme } = useTheme()
	const initial = useMemo(() => formFromSettings(userSettings, theme), [userSettings, theme])
	const form = useDirtyForm(initial)
	const [saving, setSaving] = useState(false)
	const [saved, setSaved] = useState(false)
	const [saveError, setSaveError] = useState("")

	useEffect(() => {
		setSaveError("")
	}, [form.values])

	const fieldError = validateThresholds(form.values)
	const status: SettingsSaveStatus = saving
		? "saving"
		: saved
			? "saved"
			: saveError
				? "error"
				: form.dirty
					? "dirty"
					: "idle"

	async function handleSave() {
		if (saving) {
			return
		}
		if (fieldError) {
			return
		}
		setSaving(true)
		setSaveError("")
		const payload: Partial<UserSettings> = {
			chartTime: form.values.chartTime,
			hourFormat: form.values.hourFormat as HourFormat,
			unitTemp: Number(form.values.unitTemp) as Unit,
			unitNet: Number(form.values.unitNet) as Unit,
			unitDisk: Number(form.values.unitDisk) as Unit,
			colorWarn: Number(form.values.colorWarn),
			colorCrit: Number(form.values.colorCrit),
		}
		const ok = await saveUserSettings(payload, { successToast: false })
		setSaving(false)
		if (!ok) {
			setSaveError("保存失败，请检查登录状态或稍后重试。")
			return
		}
		if (form.values.theme !== theme) {
			setTheme(form.values.theme)
		}
		form.commit()
		setSaved(true)
		window.setTimeout(() => setSaved(false), 1600)
	}

	function handleRestoreDefaults() {
		form.setValues(defaultForm())
		setSaveError("")
	}

	function handleDiscard() {
		form.reset()
		setSaveError("")
	}

	return (
		<div className="grid pulse-card-gap">
			<SettingsPageHeader
				eyebrow="常规与外观"
				title="常规设置"
				description="设置主题、图表时间、单位和阈值颜色。这里只影响当前账号看到的显示偏好。"
				actions={
					<>
						<Button variant="outline" onClick={handleRestoreDefaults} disabled={saving}>
							恢复默认
						</Button>
						<Button onClick={handleSave} disabled={!form.dirty || saving || Boolean(fieldError)} className="gap-1.5">
							{saving ? <LoaderCircleIcon className="size-4 animate-spin" /> : <SaveIcon className="size-4" />}
							{saving ? "保存中…" : "保存设置"}
						</Button>
					</>
				}
			/>

			<SettingsStatGrid>
				<SettingsStatCard label="主题" value={getThemeLabel(form.values.theme)} detail="当前显示模式" />
				<SettingsStatCard
					label="图表"
					value={chartTimeData[form.values.chartTime]?.label() ?? "默认"}
					detail={getHourFormatLabel(form.values.hourFormat)}
				/>
				<SettingsStatCard
					label="单位"
					value={`${getTemperatureUnitLabel(form.values.unitTemp)} · ${getRateUnitLabel(form.values.unitNet)}`}
					detail={`磁盘 ${getRateUnitLabel(form.values.unitDisk)}`}
				/>
				<SettingsStatCard
					label="阈值"
					value={`${form.values.colorWarn || "—"}% / ${form.values.colorCrit || "—"}%`}
					detail="只影响颜色提示"
				/>
			</SettingsStatGrid>

			<SettingsSectionStack>
				<SettingsSection title="界面偏好" description="控制当前账号看到的主题、时间格式和图表默认范围。">
					<div className="mt-4 grid gap-x-6 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
						<SettingsField label="主题" htmlFor="theme" description="跟随系统会随电脑的深浅色自动切换。">
							<Select value={form.values.theme} onValueChange={(value) => form.setField("theme", value as Theme)}>
								<SelectTrigger id="theme" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="system">跟随系统</SelectItem>
									<SelectItem value="light">浅色</SelectItem>
									<SelectItem value="dark">深色</SelectItem>
								</SelectContent>
							</Select>
						</SettingsField>
						<SettingsField label="时间格式" htmlFor="hourFormat" description="影响图表、日志和列表中的时间显示。">
							<Select value={form.values.hourFormat} onValueChange={(value) => form.setField("hourFormat", value)}>
								<SelectTrigger id="hourFormat" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{Object.keys(HourFormat).map((value) => (
										<SelectItem key={value} value={value}>
											{getHourFormatLabel(value)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</SettingsField>
						<SettingsField label="图表默认时间" htmlFor="chartTime" description="打开详情页时优先显示的时间范围。">
							<Select
								value={form.values.chartTime}
								onValueChange={(value) => form.setField("chartTime", value as UserSettings["chartTime"])}
							>
								<SelectTrigger id="chartTime" className="w-full">
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
						</SettingsField>
					</div>
				</SettingsSection>

				<SettingsSection title="单位" description="只影响数值的显示单位，不改变采集精度。">
					<div className="mt-4 grid gap-x-6 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
						<SettingsField label="温度" htmlFor="unitTemp">
							<Select value={form.values.unitTemp} onValueChange={(value) => form.setField("unitTemp", value)}>
								<SelectTrigger id="unitTemp" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={String(Unit.Celsius)}>摄氏度 °C</SelectItem>
									<SelectItem value={String(Unit.Fahrenheit)}>华氏度 °F</SelectItem>
								</SelectContent>
							</Select>
						</SettingsField>
						<SettingsField label="网络速率" htmlFor="unitNet">
							<Select value={form.values.unitNet} onValueChange={(value) => form.setField("unitNet", value)}>
								<SelectTrigger id="unitNet" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={String(Unit.Bytes)}>字节（KB/s、MB/s、GB/s）</SelectItem>
									<SelectItem value={String(Unit.Bits)}>比特（Kbps、Mbps、Gbps）</SelectItem>
								</SelectContent>
							</Select>
						</SettingsField>
						<SettingsField label="磁盘速率" htmlFor="unitDisk">
							<Select value={form.values.unitDisk} onValueChange={(value) => form.setField("unitDisk", value)}>
								<SelectTrigger id="unitDisk" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={String(Unit.Bytes)}>字节（KB/s、MB/s、GB/s）</SelectItem>
									<SelectItem value={String(Unit.Bits)}>比特（Kbps、Mbps、Gbps）</SelectItem>
								</SelectContent>
							</Select>
						</SettingsField>
					</div>
				</SettingsSection>

				<SettingsSection title="警告阈值" description="用于图表和状态颜色，不改变告警规则。">
					<div className="mt-4 grid gap-x-6 gap-y-5 md:grid-cols-2">
						<SettingsField label="警告阈值" htmlFor="colorWarn" description="达到这个比例开始变琥珀色。">
							<div className="flex flex-wrap items-center gap-3">
								<Slider
									className="min-w-40 flex-1"
									min={1}
									max={100}
									step={1}
									value={[clampPercent(form.values.colorWarn)]}
									onValueChange={([value]) => form.setField("colorWarn", String(value))}
									aria-label="警告阈值"
								/>
								<div className="flex items-center gap-1">
									<Input
										id="colorWarn"
										type="number"
										min={1}
										max={100}
										value={form.values.colorWarn}
										onChange={(event) => form.setField("colorWarn", event.target.value)}
										className="w-20"
									/>
									<span className="text-xs text-muted-foreground">%</span>
								</div>
							</div>
						</SettingsField>
						<SettingsField
							label="严重阈值"
							htmlFor="colorCrit"
							description="达到这个比例开始变红色。"
							error={fieldError}
						>
							<div className="flex flex-wrap items-center gap-3">
								<Slider
									className="min-w-40 flex-1"
									min={1}
									max={100}
									step={1}
									value={[clampPercent(form.values.colorCrit)]}
									onValueChange={([value]) => form.setField("colorCrit", String(value))}
									aria-label="严重阈值"
								/>
								<div className="flex items-center gap-1">
									<Input
										id="colorCrit"
										type="number"
										min={1}
										max={100}
										value={form.values.colorCrit}
										onChange={(event) => form.setField("colorCrit", event.target.value)}
										className="w-20"
									/>
									<span className="text-xs text-muted-foreground">%</span>
								</div>
							</div>
						</SettingsField>
					</div>
				</SettingsSection>
			</SettingsSectionStack>

			<SettingsSaveBar status={status} error={saveError} onSave={handleSave} onDiscard={handleDiscard} />
		</div>
	)
}

function clampPercent(value: string) {
	const parsed = Number(value)
	if (!Number.isFinite(parsed)) {
		return 1
	}
	return Math.min(100, Math.max(1, parsed))
}

function getThemeLabel(theme: Theme) {
	if (theme === "light") return "浅色"
	if (theme === "dark") return "深色"
	return "跟随系统"
}

function getTemperatureUnitLabel(unit: string) {
	return Number(unit) === Unit.Fahrenheit ? "°F" : "°C"
}

function getHourFormatLabel(value: string) {
	return value === HourFormat["12h"] ? "12 小时制" : "24 小时制"
}

function getRateUnitLabel(unit: string) {
	return Number(unit) === Unit.Bits ? "比特" : "字节"
}
