import type { Messages } from "@lingui/core"
import { i18n } from "@lingui/core"
import { t } from "@lingui/core/macro"
import { messages as zhCNMessages } from "@/locales/zh-CN/zh-CN"
import { BatteryState } from "./enums"
import { $direction } from "./stores"

const fixedLocale = "zh-CN"

// activates locale
function activateLocale(locale: string = fixedLocale, messages: Messages = zhCNMessages) {
	i18n.load(locale, messages)
	i18n.activate(locale)
	document.documentElement.lang = locale
	localStorage.setItem("lang", locale)
	$direction.set("ltr")
}

// The fork keeps the UI fixed to Simplified Chinese.
export function dynamicActivate(_locale: string = fixedLocale) {
	activateLocale()
	return Promise.resolve()
}

export function getLocale() {
	return fixedLocale
}

////////////////////////////////////////////////////////

export const batteryStateTranslations = {
	[BatteryState.Unknown]: () => t({ message: "Unknown", comment: "Context: Battery state" }),
	[BatteryState.Empty]: () => t({ message: "Empty", comment: "Context: Battery state" }),
	[BatteryState.Full]: () => t({ message: "Full", comment: "Context: Battery state" }),
	[BatteryState.Charging]: () => t({ message: "Charging", comment: "Context: Battery state" }),
	[BatteryState.Discharging]: () => t({ message: "Discharging", comment: "Context: Battery state" }),
	[BatteryState.Idle]: () => t({ message: "Idle", comment: "Context: Battery state" }),
} as const
