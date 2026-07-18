import assert from "node:assert/strict"
import {
	formatInternetBandwidth,
	getInternetStatusLabel,
	internetAssetTypeSpec,
	normalizeInternetProvider,
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

console.log("asset type specs contract passed")
