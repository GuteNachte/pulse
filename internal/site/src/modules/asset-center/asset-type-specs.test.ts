import assert from "node:assert/strict"
import {
	formatInternetBandwidth,
	getInternetStatusLabel,
	getAssetTypeCapabilities,
	internetAssetTypeSpec,
	normalizeInternetProvider,
	validateInternetAssetValues,
} from "./asset-type-specs.ts"

assert.deepEqual(
	internetAssetTypeSpec.sections.flatMap((section) => section.fields.map((field) => field.key)),
	[
		"vendor",
		"access_technology",
		"auth_mode",
		"down_mbps",
		"up_mbps",
		"public_ipv4",
		"public_ipv6",
		"package_name",
		"recurring_price_cny",
		"billing_cycle",
		"renewal_date",
		"auto_renew",
		"notes",
	]
)
assert.deepEqual(internetAssetTypeSpec.providerOptions.map((option) => option.label), ["中国电信", "中国联通", "中国移动"])
assert.deepEqual(internetAssetTypeSpec.statusOptions.map((option) => option.value), ["active", "inactive", "retired"])
assert.equal(internetAssetTypeSpec.notApplicable.location, true)
assert.equal(internetAssetTypeSpec.notApplicable.role, true)
assert.equal(internetAssetTypeSpec.notApplicable.interfaces, true)
assert.equal(internetAssetTypeSpec.detailTitle, "线路档案")
assert.equal(normalizeInternetProvider("联通"), "中国联通")
assert.equal(normalizeInternetProvider("中国电信"), "中国电信")
assert.equal(formatInternetBandwidth(1000), "1 Gbps")
assert.equal(formatInternetBandwidth(300), "300 Mbps")
assert.equal(getInternetStatusLabel("active"), "使用中")
assert.equal(getInternetStatusLabel("inactive"), "暂停服务")
assert.equal(getInternetStatusLabel("retired"), "已注销")
assert.deepEqual(getAssetTypeCapabilities("internet"), {
	showLocation: false,
	showRole: false,
	showHardware: false,
	showInterfaces: false,
})
assert.deepEqual(getAssetTypeCapabilities("mini_pc"), {
	showLocation: true,
	showRole: true,
	showHardware: true,
	showInterfaces: true,
})
assert.deepEqual(
	validateInternetAssetValues({
		name: "宽带",
		provider: "中国联通",
		status: "active",
		accessTechnology: "ftth",
		authMode: "pppoe",
		downMbps: 1000,
		upMbps: 300,
	}),
	[]
)
assert.deepEqual(
	validateInternetAssetValues({
		name: "",
		provider: "广电",
		status: "planned",
		accessTechnology: "",
		authMode: "",
		downMbps: 0,
		upMbps: -1,
	}),
	["资源名称", "运营商", "使用状态", "线路接入技术", "联网认证方式", "下行带宽", "上行带宽"]
)

console.log("asset type specs contract passed")
