import assert from "node:assert/strict"
import { ASSET_TYPE_OPTIONS, getAssetFormSections } from "./asset-schema.ts"

function getSectionFieldKeys(type: Parameters<typeof getAssetFormSections>[0], title: string) {
	return (
		getAssetFormSections(type)
			.find((section) => section.title === title)
			?.fields.map((field) => field.key) ?? []
	)
}

const phoneFields = getSectionFieldKeys("phone", "设备参数")
assert.equal(phoneFields.includes("rear_main_camera"), true)
assert.equal(phoneFields.includes("battery_capacity_mah"), true)
const phoneIdentityFields = getSectionFieldKeys("phone", "硬件识别")
assert.equal(phoneIdentityFields.includes("internal_model"), true)

const miniPcIdentityFields = getSectionFieldKeys("mini_pc", "硬件识别")
assert.equal(miniPcIdentityFields.includes("internal_model"), false)
assert.equal(miniPcIdentityFields.includes("serial_number"), true)
assert.equal(miniPcIdentityFields.includes("official_url"), true)
assert.equal(miniPcIdentityFields.includes("support_url"), false)
assert.equal(miniPcIdentityFields.includes("product_url"), false)

const purchaseInfoFields = getSectionFieldKeys("mini_pc", "购买信息")
assert.deepEqual(purchaseInfoFields, ["purchase_date", "purchase_price_cny"])
assert.equal(getSectionFieldKeys("mini_pc", "生命周期").length, 0)
assert.deepEqual(getSectionFieldKeys("internet", "套餐与续费"), [
	"package_name",
	"recurring_price_cny",
	"billing_cycle",
	"renewal_date",
	"auto_renew",
])
assert.equal(getSectionFieldKeys("internet", "购买信息").length, 0)

const televisionFields = getSectionFieldKeys("tv", "设备参数")
assert.equal(televisionFields.includes("screen_size"), true)
assert.equal(televisionFields.includes("hdr_support"), true)
assert.equal(televisionFields.includes("rear_main_camera"), false)
assert.equal(televisionFields.includes("battery_capacity_mah"), false)

const readerFields = getSectionFieldKeys("ebook", "设备参数")
assert.equal(readerFields.includes("display_type"), true)
assert.equal(readerFields.includes("storage_gb"), true)
assert.equal(readerFields.includes("mobile_network"), false)

const tabletMemoryField = getAssetFormSections("tablet")
	.find((section) => section.title === "设备参数")
	?.fields.find((field) => field.key === "memory_gb")
assert.equal(tabletMemoryField?.required, undefined)

const switchFields = getSectionFieldKeys("switch", "管理与网络能力")
assert.equal(switchFields.includes("management_level"), true)
assert.equal(switchFields.includes("vlan_status"), true)
assert.equal(switchFields.includes("wifi_standard"), false)

const accessPointFields = getSectionFieldKeys("ap", "网络参数")
assert.equal(accessPointFields.includes("wifi_standard"), true)
assert.equal(accessPointFields.includes("ssid_note"), true)

const nasFields = getSectionFieldKeys("nas", "NAS 存储参数")
assert.equal(nasFields.includes("bay_count"), true)
assert.equal(nasFields.includes("raid_mode"), true)

const serverFields = getSectionFieldKeys("server", "服务器平台参数")
assert.equal(serverFields.includes("bmc"), true)
assert.equal(serverFields.includes("redundant_psu"), true)

const miniPcFields = getSectionFieldKeys("mini_pc", "迷你主机扩展参数")
assert.equal(miniPcFields.includes("storage_slots"), true)
assert.equal(miniPcFields.includes("power_adapter_w"), true)
assert.equal(miniPcFields.includes("wifi_support"), true)
assert.equal(miniPcFields.includes("bluetooth_support"), true)
assert.equal(miniPcFields.includes("audio_output"), true)
assert.equal(miniPcFields.includes("preinstalled_os"), true)
assert.equal(miniPcFields.includes("supported_os"), true)
assert.equal(miniPcFields.includes("package_weight_kg"), true)
assert.equal(miniPcFields.includes("weight_kg"), true)
assert.equal(miniPcFields.includes("release_date"), true)

const miniPcAllFields = getAssetFormSections("mini_pc").flatMap((section) => section.fields.map((field) => field.key))
assert.equal(miniPcAllFields.includes("length_mm"), true)
assert.equal(miniPcAllFields.includes("width_mm"), true)
assert.equal(miniPcAllFields.includes("height_mm"), true)
assert.equal(miniPcAllFields.includes("chassis_vendor"), false)
assert.equal(miniPcAllFields.includes("chassis_model"), false)
assert.equal(miniPcAllFields.includes("chassis_power_detail"), false)

const physicalHostFields = getAssetFormSections("physical_host").flatMap((section) =>
	section.fields.map((field) => field.key)
)
assert.equal(physicalHostFields.includes("chassis_vendor"), true)
assert.equal(physicalHostFields.includes("chassis_model"), true)
assert.equal(physicalHostFields.includes("chassis_power_detail"), true)

const serverAllFields = getAssetFormSections("server").flatMap((section) => section.fields.map((field) => field.key))
assert.equal(serverAllFields.includes("chassis_vendor"), true)
assert.equal(serverAllFields.includes("chassis_model"), true)
assert.equal(serverAllFields.includes("chassis_power_detail"), true)

const hostHardwareFields = getAssetFormSections("mini_pc").flatMap((section) =>
	section.fields.map((field) => field.key)
)
assert.equal(hostHardwareFields.includes("memory_vendor"), true)
assert.equal(hostHardwareFields.includes("memory_detail"), true)
assert.equal(hostHardwareFields.includes("memory_type"), true)
assert.equal(hostHardwareFields.includes("memory_speed_mhz"), true)
assert.equal(hostHardwareFields.includes("supported_memory_type"), true)
assert.equal(hostHardwareFields.includes("max_memory_gb"), true)
assert.equal(hostHardwareFields.includes("memory_channel_count"), true)
assert.equal(hostHardwareFields.includes("memory_model"), false)
assert.equal(hostHardwareFields.includes("memory_slots_summary"), false)
assert.equal(
	hostHardwareFields.some((field) => field.endsWith("_support_url")),
	false
)
assert.equal(
	getAssetFormSections("mini_pc")
		.flatMap((section) => section.fields)
		.some((field) => field.key === "planned_agent"),
	false,
	"资产档案不应再提供计划接入 Agent 字段"
)
assert.equal(
	getAssetFormSections("vm")
		.flatMap((section) => section.fields)
		.some((field) => field.key === "planned_agent"),
	false,
	"虚拟机档案不应再提供计划接入 Agent 字段"
)

const switchHardwareFields = getSectionFieldKeys("switch", "硬件与端口能力")
assert.equal(switchHardwareFields.includes("poe_budget_w"), true)
assert.equal(switchHardwareFields.includes("switching_capacity_gbps"), true)

assert.deepEqual(
	getAssetFormSections("ont").map((section) => section.title),
	["身份与归属", "光纤接入", "路由与管理", "无线网络", "有线网络", "其他端口与电源", "设备身份标识", "备注"]
)
assert.equal(getSectionFieldKeys("ont", "网络参数").length, 0)
assert.equal(getSectionFieldKeys("ont", "无线网络").includes("wifi_5_enabled"), true)
assert.equal(getSectionFieldKeys("ont", "设备身份标识").includes("pon_sn"), true)
assert.equal(getSectionFieldKeys("firewall", "网络参数").includes("security_throughput_gbps"), true)

const sensorFields = getSectionFieldKeys("sensor", "智能家居参数")
assert.equal(sensorFields.includes("sensor_kind"), true)
assert.equal(sensorFields.includes("measurement_range"), true)

const lightFields = getSectionFieldKeys("light", "智能家居参数")
assert.equal(lightFields.includes("luminous_flux_lm"), true)
assert.equal(lightFields.includes("color_temperature_k"), true)

const cameraFields = getSectionFieldKeys("camera", "摄像头参数")
assert.equal(cameraFields.includes("sensor_size"), true)
assert.equal(cameraFields.includes("night_vision"), true)

const printerFields = getSectionFieldKeys("printer", "打印参数")
assert.equal(printerFields.includes("print_speed_ppm"), true)
assert.equal(printerFields.includes("print_resolution"), true)

const upsFields = getSectionFieldKeys("ups", "电源参数")
assert.equal(upsFields.includes("topology"), true)
assert.equal(upsFields.includes("waveform"), true)

const internetServiceFields = getSectionFieldKeys("web_endpoint", "互联网服务监控")
assert.equal(internetServiceFields.includes("service_category"), true)
assert.equal(internetServiceFields.includes("url"), true)
assert.equal(internetServiceFields.includes("internal_url"), true)
assert.equal(internetServiceFields.includes("external_url"), true)
assert.equal(internetServiceFields.includes("expected_owner"), true)

assert.deepEqual(getSectionFieldKeys("web_endpoint", "订阅与续费"), [
	"renewal_date",
	"recurring_price_cny",
	"billing_cycle",
])
assert.equal(getSectionFieldKeys("web_endpoint", "购买信息").length, 0)

for (const { value: type } of ASSET_TYPE_OPTIONS) {
	assert.equal(
		getAssetFormSections(type).flatMap((section) => section.fields).some((field) => field.key === "notes"),
		true,
		`${type} 编辑页必须提供备注输入框`
	)
}

console.log("asset schema profile contract passed")
