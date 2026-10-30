import assert from "node:assert/strict"
import {
	getParameterStatusDotClass,
	getParameterStatusTone,
	splitParameterFeatureTags,
	splitParameterNumberUnit,
} from "./asset-parameter-value.ts"

assert.deepEqual(splitParameterNumberUnit("60 Gbps"), { number: "60", unit: "Gbps" })
assert.deepEqual(splitParameterNumberUnit("32 GB"), { number: "32", unit: "GB" })
assert.deepEqual(splitParameterNumberUnit("0~40 ℃"), { number: "0~40", unit: "℃" })
assert.deepEqual(splitParameterNumberUnit("2 个"), { number: "2", unit: "个" })
assert.equal(splitParameterNumberUnit("8个2.5G RJ45电口"), undefined)
assert.equal(splitParameterNumberUnit("Wi-Fi 6"), undefined)

assert.equal(getParameterStatusTone("在用"), "green")
assert.equal(getParameterStatusTone("已启用"), "green")
assert.equal(getParameterStatusTone("规划中"), "amber")
assert.equal(getParameterStatusTone("未启用"), "amber")
assert.equal(getParameterStatusTone("退役"), "red")
assert.equal(getParameterStatusTone("不支持"), "red")
assert.equal(getParameterStatusTone("Web轻管理"), undefined)
assert.equal(getParameterStatusDotClass("green"), "bg-emerald-500")
assert.equal(getParameterStatusDotClass("amber"), "bg-amber-500")
assert.equal(getParameterStatusDotClass("red"), "bg-red-500")

assert.deepEqual(splitParameterFeatureTags("VLAN划分、端口隔离、带宽控制"), ["VLAN划分", "端口隔离", "带宽控制"])
assert.equal(splitParameterFeatureTags("DDR5 / DDR4"), undefined)
assert.equal(splitParameterFeatureTags("支持"), undefined)

console.log("asset parameter value contract passed")
