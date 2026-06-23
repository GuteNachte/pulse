import { plural, t } from "@lingui/core/macro"
import { type ClassValue, clsx } from "clsx"
import { listenKeys } from "nanostores"
import { timeDay, timeHour, timeMinute } from "d3-time"
import { useEffect, useState } from "react"
import { twMerge } from "tailwind-merge"
import { toast } from "@/components/ui/use-toast"
import type { ChartTimeData, FingerprintRecord, SemVer, SystemRecord } from "@/types"
import { HourFormat, Unit } from "./enums"
import { $copyContent, $userSettings } from "./stores"

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

/** Adds event listener to node and returns function that removes the listener */
export function listen<T extends Event = Event>(node: Node, event: string, handler: (event: T) => void) {
	node.addEventListener(event, handler as EventListener)
	return () => node.removeEventListener(event, handler as EventListener)
}

export async function copyToClipboard(content: string) {
	const duration = 1500
	try {
		await navigator.clipboard.writeText(content)
		if (!(await clipboardContentMatches(content))) {
			showManualCopyDialog(content)
			return false
		}
		toast({
			duration,
			description: t`Copied to clipboard`,
		})
		return true
	} catch (_e) {}

	if (copyWithLegacyCommand(content)) {
		if (!(await clipboardContentMatches(content))) {
			showManualCopyDialog(content)
			return false
		}
		toast({
			duration,
			description: t`Copied to clipboard`,
		})
		return true
	}

	showManualCopyDialog(content)
	return false
}

function showManualCopyDialog(content: string) {
	$copyContent.set("")
	queueMicrotask(() => {
		$copyContent.set(content)
	})
}

async function clipboardContentMatches(content: string) {
	try {
		const copied = await navigator.clipboard.readText()
		return copied === content
	} catch (_error) {
		return false
	}
}

function copyWithLegacyCommand(content: string) {
	const textarea = document.createElement("textarea")
	textarea.value = content
	textarea.setAttribute("readonly", "")
	textarea.style.position = "fixed"
	textarea.style.opacity = "0"
	textarea.style.pointerEvents = "none"
	document.body.appendChild(textarea)
	textarea.select()
	try {
		return document.execCommand("copy")
	} catch (_error) {
		return false
	} finally {
		document.body.removeChild(textarea)
	}
}

// Create formatters directly without intermediate containers
const createHourWithMinutesFormatter = (hour12?: boolean) =>
	new Intl.DateTimeFormat(undefined, {
		hour: "numeric",
		minute: "numeric",
		hour12,
	})

const createShortDateFormatter = (hour12?: boolean) =>
	new Intl.DateTimeFormat(undefined, {
		day: "numeric",
		month: "short",
		hour: "numeric",
		minute: "numeric",
		hour12,
	})

const createHourWithSecondsFormatter = (hour12?: boolean) =>
	new Intl.DateTimeFormat(undefined, {
		hour: "numeric",
		minute: "numeric",
		second: "numeric",
		hour12,
	})

// Initialize formatters with default values
let hourWithMinutesFormatter = createHourWithMinutesFormatter()
let shortDateFormatter = createShortDateFormatter()
let hourWithSecondsFormatter = createHourWithSecondsFormatter()

export const currentHour12 = () => shortDateFormatter.resolvedOptions().hour12

export const hourWithMinutes = (timestamp: string) => {
	return hourWithMinutesFormatter.format(new Date(timestamp))
}

export const formatShortDate = (timestamp: string) => {
	return shortDateFormatter.format(new Date(timestamp))
}

export const hourWithSeconds = (timestamp: string) => {
	return hourWithSecondsFormatter.format(new Date(timestamp))
}

// Update the time formatters if user changes hourFormat
listenKeys($userSettings, ["hourFormat"], ({ hourFormat }) => {
	if (!hourFormat) return
	const newHour12 = hourFormat === HourFormat["12h"]
	if (currentHour12() !== newHour12) {
		hourWithMinutesFormatter = createHourWithMinutesFormatter(newHour12)
		shortDateFormatter = createShortDateFormatter(newHour12)
		hourWithSecondsFormatter = createHourWithSecondsFormatter(newHour12)
	}
})

const dayFormatter = new Intl.DateTimeFormat(undefined, {
	day: "numeric",
	month: "short",
})
export const formatDay = (timestamp: string) => {
	return dayFormatter.format(new Date(timestamp))
}

export const updateFavicon = (() => {
	let prevDownCount = 0
	return (downCount = 0) => {
		if (downCount === prevDownCount) {
			return
		}
		prevDownCount = downCount
		const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="pulse-bg" x1="96" y1="72" x2="416" y2="448" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#35c49c"/>
      <stop offset="1" stop-color="#177e69"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#pulse-bg)"/>
  <path d="M112 272h72l34-88 70 184 42-120h70" fill="none" stroke="#fff" stroke-width="42" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="400" cy="248" r="20" fill="#fff"/>
  ${
		downCount > 0 &&
		`
		<circle cx="382" cy="382" r="100" fill="#ef4444"/>
  	<text x="382" y="420" font-size="116" text-anchor="middle" fill="#fff" font-family="Arial" font-weight="bold">${downCount}</text>
	`
	}
</svg>
	`
		const blob = new Blob([svg], { type: "image/svg+xml" })
		const url = URL.createObjectURL(blob)
		;(document.querySelector("link[rel='icon']") as HTMLLinkElement).href = url
	}
})()

export const chartTimeData: ChartTimeData = {
	"1m": {
		type: "1m",
		expectedInterval: 2000, // allow a bit of latency for one second updates (#1247)
		label: () => t`1 minute`,
		format: (timestamp: string) => hourWithSeconds(timestamp),
		ticks: 3,
		getOffset: (endTime: Date) => timeMinute.offset(endTime, -1),
		minVersion: "0.13.0",
	},
	"1h": {
		type: "1m",
		expectedInterval: 60_000,
		label: () => t`1 hour`,
		// ticks: 12,
		format: (timestamp: string) => hourWithMinutes(timestamp),
		getOffset: (endTime: Date) => timeHour.offset(endTime, -1),
	},
	"12h": {
		type: "10m",
		expectedInterval: 60_000 * 10,
		label: () => t`12 hours`,
		ticks: 12,
		format: (timestamp: string) => hourWithMinutes(timestamp),
		getOffset: (endTime: Date) => timeHour.offset(endTime, -12),
	},
	"24h": {
		type: "20m",
		expectedInterval: 60_000 * 20,
		label: () => t`24 hours`,
		format: (timestamp: string) => hourWithMinutes(timestamp),
		getOffset: (endTime: Date) => timeHour.offset(endTime, -24),
	},
	"1w": {
		type: "120m",
		expectedInterval: 60_000 * 120,
		label: () => t`1 week`,
		ticks: 7,
		format: (timestamp: string) => formatDay(timestamp),
		getOffset: (endTime: Date) => timeDay.offset(endTime, -7),
	},
	"30d": {
		type: "480m",
		expectedInterval: 60_000 * 480,
		label: () => t`30 days`,
		ticks: 30,
		format: (timestamp: string) => formatDay(timestamp),
		getOffset: (endTime: Date) => timeDay.offset(endTime, -30),
	},
}

/** Format number to x decimal places, without trailing zeros */
export function toFixedFloat(num: number, digits: number) {
	return parseFloat((digits === 0 ? Math.ceil(num) : num).toFixed(digits))
}

const decimalFormatters: Map<number, Intl.NumberFormat> = new Map()
/** Format number to x decimal places, maintaining trailing zeros */
export function decimalString(num: number, digits = 2) {
	if (digits === 0) {
		return Math.ceil(num).toString()
	}
	let formatter = decimalFormatters.get(digits)
	if (!formatter) {
		formatter = new Intl.NumberFormat(undefined, {
			minimumFractionDigits: digits,
			maximumFractionDigits: digits,
		})
		decimalFormatters.set(digits, formatter)
	}
	return formatter.format(num)
}

function nonNegativeDisplayNumber(num: number) {
	if (!Number.isFinite(num) || num < 0) {
		return 0
	}
	return Object.is(num, -0) ? 0 : num
}

export function percentTickString(num: number, digits = 2) {
	return `${toFixedFloat(nonNegativeDisplayNumber(num), digits)}%`
}

export function percentValueString(num: number, digits = 2) {
	return `${decimalString(nonNegativeDisplayNumber(num), digits)}%`
}

/** Get value from local or session storage */
function getStorageValue(key: string, defaultValue: unknown, storageInterface: Storage = localStorage) {
	const saved = storageInterface?.getItem(key)
	return saved ? JSON.parse(saved) : defaultValue
}

/** Hook to sync value in local or session storage */
export function useBrowserStorage<T>(key: string, defaultValue: T, storageInterface: Storage = localStorage) {
	key = `pulse-${key}`
	const [value, setValue] = useState(() => {
		return getStorageValue(key, defaultValue, storageInterface)
	})
	useEffect(() => {
		storageInterface?.setItem(key, JSON.stringify(value))
	}, [key, value])

	return [value, setValue]
}

/** Format temperature to user's preferred unit */
export function formatTemperature(celsius: number, unit?: Unit): { value: number; unit: string } {
	if (!unit) {
		unit = $userSettings.get().unitTemp || Unit.Celsius
	}
	// biome-ignore lint/suspicious/noDoubleEquals: need loose equality check due to form data being strings
	if (unit == Unit.Fahrenheit) {
		return {
			value: celsius * 1.8 + 32,
			unit: "°F",
		}
	}
	return {
		value: celsius,
		unit: "°C",
	}
}

/** Format bytes to user's preferred unit */
export function formatBytes(
	size: number,
	perSecond = false,
	unit = Unit.Bytes,
	isMegabytes = false
): { value: number; unit: string } {
	// Convert MB to bytes if isMegabytes is true
	if (isMegabytes) size *= 1024 * 1024

	// biome-ignore lint/suspicious/noDoubleEquals: need loose equality check due to form data being strings
	if (unit == Unit.Bits) {
		const bits = size * 8
		const suffix = perSecond ? "ps" : ""
		if (bits < 1000) return { value: bits, unit: `b${suffix}` }
		if (bits < 1_000_000) return { value: bits / 1_000, unit: `Kb${suffix}` }
		if (bits < 1_000_000_000)
			return {
				value: bits / 1_000_000,
				unit: `Mb${suffix}`,
			}
		if (bits < 1_000_000_000_000)
			return {
				value: bits / 1_000_000_000,
				unit: `Gb${suffix}`,
			}
		return {
			value: bits / 1_000_000_000_000,
			unit: `Tb${suffix}`,
		}
	}
	// bytes
	const suffix = perSecond ? "/s" : ""
	if (size < 100) return { value: size, unit: `B${suffix}` }
	if (size < 1000 * 1024) return { value: size / 1024, unit: `KB${suffix}` }
	if (size < 1000 * 1024 ** 2)
		return {
			value: size / 1024 ** 2,
			unit: `MB${suffix}`,
		}
	if (size < 1000 * 1024 ** 3)
		return {
			value: size / 1024 ** 3,
			unit: `GB${suffix}`,
		}
	return {
		value: size / 1024 ** 4,
		unit: `TB${suffix}`,
	}
}

export const chartMargin = { top: 12, right: 8, bottom: 12, left: 0 }

// export function formatUptimeString(uptimeSeconds: number): string {
// 	if (!uptimeSeconds || isNaN(uptimeSeconds)) return ""
// 	if (uptimeSeconds < 3600) {
// 		const minutes = Math.trunc(uptimeSeconds / 60)
// 		return plural({ minutes }, { one: "# minute", other: "# minutes" })
// 	} else if (uptimeSeconds < 172800) {
// 		const hours = Math.trunc(uptimeSeconds / 3600)
// 		console.log(hours)
// 		return plural({ hours }, { one: "# hour", other: "# hours" })
// 	} else {
// 		const days = Math.trunc(uptimeSeconds / 86400)
// 		return plural({ days }, { one: "# day", other: "# days" })
// 	}
// }

/** Generate a random token for the agent */
export const generateToken = () => {
	try {
		return crypto?.randomUUID()
	} catch (_e) {
		return Array.from({ length: 2 }, () => (performance.now() * Math.random()).toString(16).replace(".", "-")).join("-")
	}
}

/** Get the hub URL reachable by agents and API clients. */
export const getHubURL = () => globalThis.PULSE?.HUB_URL || window.location.origin

/** Get the hub URL reachable by agents running on other machines. */
export const getAgentHubURL = () => globalThis.PULSE?.AGENT_HUB_URL || getHubURL()

export function setAgentHubURL(url: string) {
	if (!globalThis.PULSE || typeof globalThis.PULSE !== "object") {
		globalThis.PULSE = {} as typeof globalThis.PULSE
	}
	globalThis.PULSE.AGENT_HUB_URL = url
}

/** Map of system IDs to their corresponding tokens (used to avoid fetching in add-system dialog) */
export const tokenMap = new Map<SystemRecord["id"], FingerprintRecord["token"]>()

/** Calculate duration between two dates and format as human-readable string */
export function formatDuration(
	createdDate: string | null | undefined,
	resolvedDate: string | null | undefined
): string {
	const created = createdDate ? new Date(createdDate) : null
	const resolved = resolvedDate ? new Date(resolvedDate) : null

	if (!created || !resolved) return ""

	const diffMs = resolved.getTime() - created.getTime()
	if (diffMs < 0) return ""

	const totalSeconds = Math.floor(diffMs / 1000)
	let hours = Math.floor(totalSeconds / 3600)
	let minutes = Math.floor((totalSeconds % 3600) / 60)
	let seconds = totalSeconds % 60

	// if seconds are close to 60, round up to next minute
	// if minutes are close to 60, round up to next hour
	if (seconds >= 58) {
		minutes += 1
		seconds = 0
	}
	if (minutes >= 60) {
		hours += 1
		minutes = 0
	}

	// For durations over 1 hour, omit seconds for cleaner display
	if (hours > 0) {
		return [hours ? `${hours}h` : null, minutes ? `${minutes}m` : null].filter(Boolean).join(" ")
	}

	return [hours ? `${hours}h` : null, minutes ? `${minutes}m` : null, seconds ? `${seconds}s` : null]
		.filter(Boolean)
		.join(" ")
}

/** Parse semver string into major, minor, and patch numbers
 * @example
 * const semVer = "1.2.3"
 * const { major, minor, patch } = parseSemVer(semVer)
 * console.log(major, minor, patch) // 1, 2, 3
 */
export const parseSemVer = (semVer = ""): SemVer => {
	// if (semVer.startsWith("v")) {
	// 	semVer = semVer.slice(1)
	// }
	if (semVer.includes("-")) {
		semVer = semVer.slice(0, semVer.indexOf("-"))
	}
	const parts = semVer.split(".").map(Number)
	return { major: parts?.[0] ?? 0, minor: parts?.[1] ?? 0, patch: parts?.[2] ?? 0 }
}

/** Compare two semver strings. Returns -1 if a is less than b, 0 if a is equal to b, and 1 if a is greater than b. */
export function compareSemVer(a: SemVer, b: SemVer) {
	if (a.major !== b.major) {
		return a.major - b.major
	}
	if (a.minor !== b.minor) {
		return a.minor - b.minor
	}
	return a.patch - b.patch
}

// biome-ignore lint/suspicious/noExplicitAny: any is used to allow any function to be passed in
export function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
	let timeout: ReturnType<typeof setTimeout>
	return (...args: Parameters<T>) => {
		clearTimeout(timeout)
		timeout = setTimeout(() => func(...args), wait)
	}
}

// Cache for runOnce
// biome-ignore lint/complexity/noBannedTypes: Function is used to allow any function to be passed in
const runOnceCache = new WeakMap<Function, { done: boolean; result: unknown }>()
/** Run a function only once */
// biome-ignore lint/suspicious/noExplicitAny: any is used to allow any function to be passed in
export function runOnce<T extends (...args: any[]) => any>(fn: T): T {
	return ((...args: Parameters<T>) => {
		let state = runOnceCache.get(fn)
		if (!state) {
			state = { done: false, result: undefined }
			runOnceCache.set(fn, state)
		}
		if (!state.done) {
			state.result = fn(...args)
			state.done = true
		}
		return state.result
	}) as T
}

/** Get the visual width of a string, accounting for full-width characters */
export function getVisualStringWidth(str: string): number {
	let width = 0
	for (const char of str) {
		const code = char.codePointAt(0) || 0
		// Hangul Jamo and Syllables are often slightly thinner than Hanzi/Kanji
		if ((code >= 0x1100 && code <= 0x115f) || (code >= 0xac00 && code <= 0xd7af)) {
			width += 1.8
			continue
		}
		// Count CJK and other full-width characters as 2 units, others as 1
		// Arabic and Cyrillic are counted as 1
		const isFullWidth =
			(code >= 0x2e80 && code <= 0x9fff) || // CJK Radicals, Symbols, and Ideographs
			(code >= 0xf900 && code <= 0xfaff) || // CJK Compatibility Ideographs
			(code >= 0xfe30 && code <= 0xfe6f) || // CJK Compatibility Forms
			(code >= 0xff00 && code <= 0xff60) || // Fullwidth Forms
			(code >= 0xffe0 && code <= 0xffe6) || // Fullwidth Symbols
			code > 0xffff // Emojis and other supplementary plane characters
		width += isFullWidth ? 2 : 1
	}
	return width
}

/** Format seconds to hours, minutes, or seconds */
export function secondsToString(seconds: number, unit: "hour" | "minute" | "day"): string {
	const count = Math.floor(seconds / (unit === "hour" ? 3600 : unit === "minute" ? 60 : 86400))
	const countString = count.toLocaleString()
	switch (unit) {
		case "minute":
			return plural(count, {
				one: `${countString} minute`,
				few: `${countString} minutes`,
				many: `${countString} minutes`,
				other: `${countString} minutes`,
			})
		case "hour":
			return plural(count, { one: `${countString} hour`, other: `${countString} hours` })
		case "day":
			return plural(count, { one: `${countString} day`, other: `${countString} days` })
	}
}

/** Format seconds to uptime string - "X minutes", "X hours", "X days" */
export function secondsToUptimeString(seconds: number): string {
	if (seconds < 3600) {
		return secondsToString(seconds, "minute")
	} else if (seconds < 360000) {
		return secondsToString(seconds, "hour")
	} else {
		return secondsToString(seconds, "day")
	}
}
