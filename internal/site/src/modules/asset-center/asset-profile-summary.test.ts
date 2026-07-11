import type { AssetRecord } from "../../types"
import {
	buildAssetSearchText,
	getAssetCompleteness,
	getAssetSummaryRows,
	getAssetWarrantyStatus,
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
		warranty_until: "2099-01-01",
	},
} as AssetRecord

const summary = getAssetSummaryRows(phone)
assertEqual(summary, [
	{ label: "IPv4", value: "192.168.1.90", mono: true },
	{ label: "容量", value: "256GB", mono: true },
	{ label: "连接", value: "Wi-Fi 6" },
])
assertEqual(getAssetWarrantyStatus(phone, new Date("2026-07-11T00:00:00Z")).tone, "ok")
assertEqual(getAssetCompleteness(phone).missing.includes("厂家资料页"), true)
assertEqual(buildAssetSearchText(phone).includes("redmi k50"), true)
