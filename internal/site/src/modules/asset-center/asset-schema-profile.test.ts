import assert from "node:assert/strict"
import { getAssetFormSections } from "./asset-schema.ts"

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

const switchFields = getSectionFieldKeys("switch", "网络参数")
assert.equal(switchFields.includes("port_count"), true)
assert.equal(switchFields.includes("vlan_note"), true)
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

const switchHardwareFields = getSectionFieldKeys("switch", "网络参数")
assert.equal(switchHardwareFields.includes("poe_budget_w"), true)
assert.equal(switchHardwareFields.includes("switching_capacity_gbps"), true)

assert.equal(getSectionFieldKeys("ont", "网络参数").includes("pon_standard"), true)
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

console.log("asset schema profile contract passed")
