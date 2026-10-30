import assert from "node:assert/strict"
import test from "node:test"
import { formatSmartRawValue, getSmartAttributeLabel } from "./smart-attribute-labels.ts"

test("translates common ATA SMART attribute IDs", () => {
	assert.equal(getSmartAttributeLabel({ id: 1, n: "Raw_Read_Error_Rate" }), "底层读取错误率")
	assert.equal(getSmartAttributeLabel({ id: 5, n: "Reallocated_Sector_Ct" }), "重映射扇区数")
	assert.equal(getSmartAttributeLabel({ id: 9, n: "Power_On_Hours" }), "通电时间")
	assert.equal(getSmartAttributeLabel({ id: 187, n: "Reported_Uncorrect" }), "报告不可纠正错误")
	assert.equal(getSmartAttributeLabel({ id: 190, n: "Airflow_Temperature_Cel" }), "气流温度")
	assert.equal(getSmartAttributeLabel({ id: 194, n: "Temperature_Celsius" }), "温度")
	assert.equal(getSmartAttributeLabel({ id: 197, n: "Current_Pending_Sector" }), "当前待映射扇区数")
	assert.equal(getSmartAttributeLabel({ id: 199, n: "UDMA_CRC_Error_Count" }), "UDMA CRC 错误数")
	assert.equal(getSmartAttributeLabel({ id: 240, n: "Head_Flying_Hours" }), "磁头飞行小时")
	assert.equal(getSmartAttributeLabel({ id: 241, n: "Total_LBAs_Written" }), "累计写入 LBA")
	assert.equal(getSmartAttributeLabel({ id: 242, n: "Total_LBAs_Read" }), "累计读取 LBA")
})

test("translates NVMe health attributes by name", () => {
	assert.equal(getSmartAttributeLabel({ id: 0, n: "CriticalWarning" }), "严重警告")
	assert.equal(getSmartAttributeLabel({ id: 0, n: "Temperature" }), "温度")
	assert.equal(getSmartAttributeLabel({ id: 0, n: "AvailableSpare" }), "可用备用空间")
	assert.equal(getSmartAttributeLabel({ id: 0, n: "PercentageUsed" }), "已用寿命百分比")
	assert.equal(getSmartAttributeLabel({ id: 0, n: "DataUnitsWritten" }), "数据写入量")
	assert.equal(getSmartAttributeLabel({ id: 0, n: "UnsafeShutdowns" }), "异常断电次数")
	assert.equal(getSmartAttributeLabel({ id: 0, n: "MediaErrors" }), "介质与数据完整性错误")
	assert.equal(getSmartAttributeLabel({ id: 0, n: "PowerOnHours" }), "通电时间")
})

test("keeps unknown vendor attributes Chinese and translates raw Min/Max", () => {
	assert.equal(getSmartAttributeLabel({ id: 0, n: "Vendor_Specific_Thing" }), "未知属性")
	assert.equal(getSmartAttributeLabel({ id: 0, n: "" }), "未知属性")
	assert.equal(
		formatSmartRawValue({ id: 190, n: "Airflow_Temperature_Cel", v: 35, rs: "35 (Min/Max 23/40)" }),
		"35 (最小/最大 23/40)"
	)
})
