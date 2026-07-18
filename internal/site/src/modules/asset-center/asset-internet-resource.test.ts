import assert from "node:assert/strict"
import { buildInternetResourceName, getAssetFormSections, isInternetResourceAssetType } from "./asset-schema.ts"

const internetFields = getAssetFormSections("internet").flatMap((section) => section.fields.map((field) => field.key))
assert.deepEqual(internetFields, [
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
])

const internetForm = {
	name: "",
	type: "internet" as const,
	status: "active" as const,
	parent_asset: "",
	vendor: "联通",
	model: "",
	serial_number: "",
	management_ip: "",
	location: "",
	role: "",
	notes: "",
	metadata: { down_mbps: "1000", up_mbps: "100", public_ipv4: "203.0.113.10", public_ipv6: "2001:db8::10" },
}

assert.equal(buildInternetResourceName(internetForm.vendor), "中国联通宽带")
assert.equal(isInternetResourceAssetType(internetForm.type), true)

console.log("internet resource contract passed")
