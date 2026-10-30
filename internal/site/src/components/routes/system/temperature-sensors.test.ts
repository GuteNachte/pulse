import assert from "node:assert/strict"
import test from "node:test"
import { buildTemperatureSensors, getTemperatureCategory, getTemperatureLabel } from "./temperature-sensors.ts"

test("classifies CPU sensors, including nct6687 CPU inputs", () => {
	assert.equal(getTemperatureCategory("coretemp_core_0"), "cpu")
	assert.equal(getTemperatureCategory("coretemp_package_id_0"), "cpu")
	assert.equal(getTemperatureCategory("k10temp_tctl"), "cpu")
	assert.equal(getTemperatureCategory("nct6687_peci_0.0"), "cpu")
	assert.equal(getTemperatureCategory("nct6687_diode_0_(curr)"), "cpu")
})

test("classifies motherboard, disk and GPU sensors", () => {
	assert.equal(getTemperatureCategory("nct6687_pch_chip"), "motherboard")
	assert.equal(getTemperatureCategory("nct6687_thermistor_15"), "motherboard")
	assert.equal(getTemperatureCategory("acpitz"), "motherboard")
	assert.equal(getTemperatureCategory("ACPI\\ThermalZone\\TZ10_0"), "motherboard")
	assert.equal(getTemperatureCategory("nvme_composite_3"), "disk")
	assert.equal(getTemperatureCategory("nvme_sensor_1_4"), "disk")
	assert.equal(getTemperatureCategory("GeForce RTX 4080"), "gpu")
	assert.equal(getTemperatureCategory("i915"), "gpu")
	assert.equal(getTemperatureCategory("unknown_sensor"), "other")
})

test("turns raw sensor keys into Chinese labels", () => {
	assert.equal(getTemperatureLabel("coretemp_core_0"), "CPU 核心 0")
	assert.equal(getTemperatureLabel("coretemp_package_id_0"), "CPU 封装")
	assert.equal(getTemperatureLabel("nct6687_peci_0.0"), "CPU PECI")
	assert.equal(getTemperatureLabel("nct6687_diode_0_(curr)"), "CPU 二极管")
	assert.equal(getTemperatureLabel("nct6687_pch_chip"), "主板芯片组")
	assert.equal(getTemperatureLabel("nct6687_thermistor_15"), "主板温度 15")
	assert.equal(getTemperatureLabel("ACPI\\ThermalZone\\TZ10_0"), "主板温区 10")
	assert.equal(getTemperatureLabel("acpitz"), "主板温区（ACPI）")
	assert.equal(getTemperatureLabel("nvme_composite_3"), "NVMe 硬盘 3")
	assert.equal(getTemperatureLabel("nvme_sensor_1_4"), "NVMe 传感器 1-4")
	assert.equal(getTemperatureLabel("GeForce RTX 4080"), "NVIDIA RTX 4080")
	assert.equal(getTemperatureLabel("i915"), "Intel 核显")
	assert.equal(getTemperatureLabel("unknown_sensor"), "其他传感器")
})

test("builds unique labels and keeps categories", () => {
	const sensors = buildTemperatureSensors([
		"nvme_sensor_1",
		"nvme_sensor_1_4",
		"coretemp_core_0",
		"nct6687_pch_chip",
		"GeForce RTX 4080",
	])

	assert.equal(new Set(sensors.map((sensor) => sensor.label)).size, sensors.length)
	assert.equal(sensors.filter((sensor) => sensor.category === "disk").length, 2)
	assert.equal(sensors.filter((sensor) => sensor.category === "cpu").length, 1)
	assert.equal(sensors.filter((sensor) => sensor.category === "motherboard").length, 1)
	assert.equal(sensors.filter((sensor) => sensor.category === "gpu").length, 1)
})
