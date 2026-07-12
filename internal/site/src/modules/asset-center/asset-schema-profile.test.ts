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

console.log("asset schema profile contract passed")
