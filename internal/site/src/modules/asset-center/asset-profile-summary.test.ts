import type { AssetRecord } from "../../types"
import {
	buildAssetSearchText,
	getAssetCompleteness,
	getAssetLocationLabel,
	getAssetSummaryRows,
} from "./asset-profile-summary.ts"

function assertEqual(actual: unknown, expected: unknown) {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
	}
}

const phone = {
	id: "asset-phone",
	type: "phone",
	name: "RedmiK50",
	vendor: "小米 / Redmi",
	model: "Redmi K50",
	management_ip: "192.168.1.90",
	location: "家 / 卧室",
	role: "备用手机",
	metadata: {
		memory_gb: 12,
		storage_gb: 256,
		wifi_standard: "Wi-Fi 6",
		power_mode: "电池",
	},
} as unknown as AssetRecord

const summary = getAssetSummaryRows(phone)
assertEqual(summary, [
	{ label: "IPv4", value: "192.168.1.90", mono: true },
	{ label: "容量", value: "256GB", mono: true },
	{ label: "连接", value: "Wi-Fi 6" },
])
assertEqual(getAssetCompleteness(phone).missing.includes("厂家资料页"), true)
assertEqual(buildAssetSearchText(phone).includes("redmi k50"), true)

const internet = {
	id: "asset-internet",
	type: "internet",
	name: "宽带",
	vendor: "联通",
	location: "",
	role: "互联网接入",
	metadata: {
		down_mbps: 1000,
		up_mbps: 300,
		public_ipv4: "203.0.113.10",
	},
} as unknown as AssetRecord

assertEqual(getAssetCompleteness(internet), {
	score: 100,
	label: "资料完整",
	tone: "ok",
	missing: [],
})
assertEqual(getAssetLocationLabel(internet), "无")
assertEqual(getAssetLocationLabel(phone), "家 / 卧室")
