import assert from "node:assert/strict"
import { ASSET_TYPE_OPTIONS, getAssetFormSections, normalizeNumberFieldValue } from "./asset-schema.ts"

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
assert.deepEqual(purchaseInfoFields, [])
assert.equal(getSectionFieldKeys("mini_pc", "生命周期").length, 0)
assert.deepEqual(getSectionFieldKeys("internet", "套餐与续费"), ["package_name", "recurring_price_cny"])
assert.deepEqual(getSectionFieldKeys("internet", "订阅周期"), ["billing_cycle", "renewal_date", "auto_renew"])
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

// 2026-10-18 用户拍板：物理规格放到最上面；网络连接上移，三张表格组相邻（内存/存储/网络）；
// 主板与固件并入系统与软件，显示输出/散热设计独立成组（特色功能已按用户要求移除）
const hostExpectedGroupTitles = [
	"基础身份",
	"硬件识别",
	"接入信息",
	"物理规格",
	"处理器(CPU)",
	"图形核心(GPU/核显)",
	"内存",
	"存储支持",
	"网络连接",
	"显示输出",
	"接口与扩展",
	"电源与功耗",
	"散热设计",
	"系统与软件",
	"购买与保修",
	"备注",
]
for (const type of ["physical_host", "nas", "server", "mini_pc"] as const) {
	assert.deepEqual(
		getAssetFormSections(type).map((section) => section.title),
		hostExpectedGroupTitles,
		`${type} 的固定分组结构应与其他计算设备一致`
	)
}

const nasStorageFields = getSectionFieldKeys("nas", "存储支持")
assert.equal(nasStorageFields.includes("bay_count"), true)
const nasSystemFields = getSectionFieldKeys("nas", "系统与软件")
assert.equal(nasSystemFields.includes("raid_mode"), true)
assert.equal(nasSystemFields.includes("filesystem"), true)
assert.equal(nasSystemFields.includes("preinstalled_os"), true)

const serverPlatformFields = getSectionFieldKeys("server", "系统与软件")
assert.equal(serverPlatformFields.includes("bmc"), true)
const serverPowerFields = getSectionFieldKeys("server", "电源与功耗")
assert.equal(serverPowerFields.includes("redundant_psu"), true)

const miniPcIoFields = getSectionFieldKeys("mini_pc", "接口与扩展")
assert.equal(miniPcIoFields.includes("bluetooth_support"), true)
assert.equal(miniPcIoFields.includes("audio_output"), true)
const miniPcPowerFields = getSectionFieldKeys("mini_pc", "电源与功耗")
assert.equal(miniPcPowerFields.includes("power_adapter_w"), true)
const miniPcNetworkFields = getSectionFieldKeys("mini_pc", "网络连接")
assert.equal(miniPcNetworkFields.includes("wifi_support"), true)
assert.equal(miniPcNetworkFields.includes("wifi_standard"), true)
const miniPcSystemFields = getSectionFieldKeys("mini_pc", "系统与软件")
assert.equal(miniPcSystemFields.includes("preinstalled_os"), true)
assert.equal(getSectionFieldKeys("mini_pc", "生命周期").length, 0)

const miniPcAllFields = getAssetFormSections("mini_pc").flatMap((section) => section.fields.map((field) => field.key))
assert.equal(miniPcAllFields.includes("length_mm"), true)
assert.equal(miniPcAllFields.includes("width_mm"), true)
assert.equal(miniPcAllFields.includes("height_mm"), true)
// 自组装机箱信息对全部计算设备开放（外观组），迷你主机也不例外
assert.equal(miniPcAllFields.includes("chassis_vendor"), true)
assert.equal(miniPcAllFields.includes("chassis_model"), true)

const miniPcPurchaseWarrantyFields = getSectionFieldKeys("mini_pc", "购买与保修")
assert.deepEqual(miniPcPurchaseWarrantyFields, [
	"purchase_date",
	"purchase_price_cny",
	"purchase_channel",
	"warranty_until",
])

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
assert.equal(switchHardwareFields.includes("poe_budget_w"), false)
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
		getAssetFormSections(type)
			.flatMap((section) => section.fields)
			.some((field) => field.key === "fixed_ipv6"),
		false,
		`${type} 设备档案不得提供管理 IPv6`
	)
	assert.equal(
		getAssetFormSections(type)
			.flatMap((section) => section.fields)
			.some((field) => field.key === "notes"),
		true,
		`${type} 编辑页必须提供备注输入框`
	)
}

console.log("asset schema profile contract passed")

// 2026-10-17 用户报「CPU 主频/最高睿频写了保存不了」：数字字段带单位时提取数值，解析不出则保留原文
assert.equal(normalizeNumberFieldValue("3.3"), 3.3)
assert.equal(normalizeNumberFieldValue("3.3 GHz"), 3.3)
assert.equal(normalizeNumberFieldValue("最高 4.9GHz"), 4.9)
assert.equal(normalizeNumberFieldValue("1,024 GB"), 1024)
assert.equal(normalizeNumberFieldValue("八核"), "八核")
assert.equal(normalizeNumberFieldValue("  "), "")
