import type { AssetRecord } from "../../types"
import { buildAssetSearchText, getAssetModelDisplay } from "./asset-profile-summary.ts"

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

assertEqual(buildAssetSearchText(phone).includes("redmi k50"), true)
assertEqual(buildAssetSearchText(phone).includes("wi-fi 6"), true)

const broadband = {
	id: "asset-broadband",
	type: "internet",
	name: "宽带",
	vendor: "中国联通",
	model: "中国联通",
	metadata: { public_ipv4: "203.0.113.10" },
} as unknown as AssetRecord

assertEqual(getAssetModelDisplay(broadband), "中国联通")
assertEqual(getAssetModelDisplay({ ...broadband, model: "千兆宽带" }), "千兆宽带")
assertEqual(getAssetModelDisplay({ ...broadband, model: "" }), "")
assertEqual(getAssetModelDisplay(phone), "Redmi K50")
