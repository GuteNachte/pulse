import type { AssetRecord } from "../../types"
import {
	buildAssetSearchText,
	buildInternetUplinkAssetIds,
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
	vendor: "中国联通",
	status: "active",
	location: "",
	role: "互联网接入",
	metadata: {
		down_mbps: 1000,
		up_mbps: 300,
		access_technology: "ftth",
		auth_mode: "pppoe",
		public_ipv4: "203.0.113.10",
	},
} as unknown as AssetRecord

assertEqual(getAssetCompleteness(internet, { hasInternetUplink: false }), {
	score: 88,
	label: "资料可用",
	tone: "neutral",
	missing: ["接入设备"],
})
assertEqual(getAssetCompleteness(internet, { hasInternetUplink: true }), {
	score: 100,
	label: "资料完整",
	tone: "ok",
	missing: [],
})
assertEqual(getAssetLocationLabel(internet), "无")
assertEqual(getAssetLocationLabel(phone), "家 / 卧室")
assertEqual(
	[...buildInternetUplinkAssetIds([
		{ source_asset: "asset-internet", target_asset: "router-1", kind: "connected_to", metadata: { link_kind: "internet" } },
		{ source_asset: "other", target_asset: "router-1", kind: "connected_to", metadata: { link_kind: "ethernet" } },
	] as never[])],
	["asset-internet"]
)

const ont = {
	id: "asset-ont",
	type: "ont",
	name: "家庭主网关",
	vendor: "华为",
	model: "V271-20",
	status: "active",
	location: "家 / 弱电箱",
	metadata: {
		product_series: "Huawei OptiXstar",
		carrier: "中国联通",
		operating_role: "ifttr_main_gateway",
		fixed_ipv4: "192.168.1.1",
		pon_standard: "10G-EPON",
		wifi_standard: "Wi-Fi 7",
		lan_port_count: 4,
		lan_2500_count: 1,
		lan_1000_count: 3,
	},
} as unknown as AssetRecord

assertEqual(getAssetSummaryRows(ont), [
	{ label: "型号", value: "Huawei OptiXstar V271-20" },
	{ label: "工作角色", value: "iFTTR 主网关" },
	{ label: "接入", value: "10G-EPON" },
	{ label: "网络", value: "2.5GbE + 3 × 1GbE / Wi-Fi 7" },
	{ label: "位置", value: "家 / 弱电箱" },
])
assertEqual(getAssetCompleteness(ont).missing.includes("内部型号 / 搜索代码"), false)
