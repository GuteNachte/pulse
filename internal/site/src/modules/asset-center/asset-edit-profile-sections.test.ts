import assert from "node:assert/strict"
import {
	buildAssetProfileEditSections,
	getAssetConnectionFieldKeys,
	getAssetQuickSettingFieldKeys,
	getRequiredAssetProfileFieldKeys,
} from "./asset-edit-profile-sections.ts"

assert.deepEqual(getAssetQuickSettingFieldKeys(), [])
assert.deepEqual(getAssetConnectionFieldKeys("mini_pc"), ["fixed_ipv4", "mac", "management_url"])
assert.deepEqual(getAssetConnectionFieldKeys("internet"), [])
assert.deepEqual(getAssetConnectionFieldKeys("web_endpoint"), [])

const phoneRequiredFields = getRequiredAssetProfileFieldKeys("phone")
assert.equal(phoneRequiredFields.has("memory_gb"), true)
assert.equal(phoneRequiredFields.has("storage_gb"), true)
assert.equal(phoneRequiredFields.has("asset_tag"), true)
assert.equal(phoneRequiredFields.has("internal_model"), true)

const hostRequiredFields = getRequiredAssetProfileFieldKeys("mini_pc")
assert.equal(hostRequiredFields.has("memory_gb"), false)
assert.equal(hostRequiredFields.has("storage_gb"), false)
assert.equal(hostRequiredFields.has("status"), true)
assert.equal(hostRequiredFields.has("role"), true)
assert.equal(hostRequiredFields.has("fixed_ipv6"), false)
assert.equal(hostRequiredFields.has("mac"), true)
assert.equal(hostRequiredFields.has("management_url"), true)
assert.equal(hostRequiredFields.has("internal_model"), false)
assert.equal(hostRequiredFields.has("serial_number"), true)
assert.equal(hostRequiredFields.has("official_url"), true)

const serviceRequiredFields = getRequiredAssetProfileFieldKeys("web_endpoint")
assert.equal(serviceRequiredFields.has("name"), true)
assert.equal(serviceRequiredFields.has("location"), true)
assert.equal(serviceRequiredFields.has("vendor"), false)
assert.equal(serviceRequiredFields.has("model"), false)
assert.equal(serviceRequiredFields.has("internal_model"), false)
assert.equal(serviceRequiredFields.has("fixed_ipv4"), false)
assert.equal(serviceRequiredFields.has("status"), true)
assert.equal(serviceRequiredFields.has("role"), true)

const internetRequiredFields = getRequiredAssetProfileFieldKeys("internet")
assert.equal(internetRequiredFields.has("name"), true)
assert.equal(internetRequiredFields.has("vendor"), true)
assert.equal(internetRequiredFields.has("role"), true)
assert.equal(internetRequiredFields.has("asset_tag"), true)
assert.equal(internetRequiredFields.has("type"), false)
assert.equal(internetRequiredFields.has("model"), false)
assert.equal(internetRequiredFields.has("internal_model"), false)
assert.equal(internetRequiredFields.has("color"), false)
assert.equal(internetRequiredFields.has("location"), false)
assert.equal(internetRequiredFields.has("management_ip"), false)
assert.equal(internetRequiredFields.has("fixed_ipv4"), false)

const internetSections = buildAssetProfileEditSections("internet", internetRequiredFields)
assert.deepEqual(
	internetSections.map((section) => section.title),
	["线路参数", "动态公网地址", "套餐与续费", "备注"]
)
assert.deepEqual(
	internetSections.find((section) => section.title === "线路参数")?.fields.map((field) => field.key),
	["access_technology", "auth_mode", "down_mbps", "up_mbps"]
)

const ontRequiredFields = getRequiredAssetProfileFieldKeys("ont")
for (const key of [
	"name",
	"type",
	"vendor",
	"model",
	"status",
	"location",
	"asset_tag",
	"fixed_ipv4",
	"carrier",
	"operating_role",
]) {
	assert.equal(ontRequiredFields.has(key), true, `ONT 顶部字段缺少 ${key}`)
}
assert.deepEqual(
	buildAssetProfileEditSections("ont", ontRequiredFields).map((section) => section.title),
	["电源", "主板与平台", "网络", "接口与扩展", "备注"]
)

const phoneSections = buildAssetProfileEditSections("phone", phoneRequiredFields)
assert.equal(
	phoneSections.every((section) => section.fields.every((field) => !phoneRequiredFields.has(field.key))),
	true,
	"完整编辑区不能重复渲染已置顶的必填字段"
)

const hostSections = buildAssetProfileEditSections("mini_pc", hostRequiredFields)
assert.equal(
	hostSections.some((section) => section.title === "基础身份"),
	false
)
assert.equal(
	hostSections.some((section) => section.title === "接入信息"),
	false
)
assert.equal(
	hostSections.some((section) => section.title === "通用"),
	false
)
assert.deepEqual(
	hostSections.map((section) => section.title),
	["外观与尺寸", "电源", "主板与平台", "处理器", "显卡", "内存", "存储", "网络", "接口与扩展", "购买信息", "备注"]
)
assert.deepEqual(
	hostSections.find((section) => section.title === "电源")?.fields.map((field) => field.key),
	["power_adapter_w"]
)
assert.deepEqual(
	hostSections.find((section) => section.title === "接口与扩展")?.fields.map((field) => field.key),
	["display_outputs", "audio_output", "usb_ports"]
)
assert.equal(
	hostSections.some((section) => ["其他", "设备参数", "硬件性能"].includes(section.title)),
	false
)
