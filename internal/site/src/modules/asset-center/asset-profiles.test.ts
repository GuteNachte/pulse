import assert from "node:assert/strict"
import {
	getAssetProfile,
	getCreatableAssetTypeOptions,
	getEditableAssetTypeOptions,
	getProfileRequiredFieldKeys,
	isServiceAssetType,
} from "./asset-profiles.ts"

assert.equal(getAssetProfile("camera")?.group, "安防与办公")
assert.equal(getAssetProfile("printer")?.group, "安防与办公")
assert.equal(getAssetProfile("ups")?.group, "电源设备")
assert.equal(getAssetProfile("internet")?.group, "资源与服务")
assert.equal(getAssetProfile("web_endpoint")?.group, "资源与服务")
assert.equal(getAssetProfile("web_endpoint")?.label, "网站 / 服务监控")
// 2026-10-07 家庭用户类型固化
assert.equal(getAssetProfile("physical_host")?.label, "台式机 / 工作站")
assert.equal(getAssetProfile("ont")?.label, "光猫")
assert.equal(getAssetProfile("wearable")?.label, "手表 / 手环")
assert.equal(getAssetProfile("iot")?.label, "其他智能设备")
assert.equal(getAssetProfile("internet")?.label, "宽带")
assert.equal(getAssetProfile("gateway")?.creatable, false, "网关并入路由器，不再新建")
// ONT 独立分类（区别于只能拨号的光猫）
assert.equal(getAssetProfile("smart_ont")?.label, "ONT")
assert.equal(getAssetProfile("smart_ont")?.group, "网络设备")
assert.equal(getAssetProfile("smart_ont")?.creatable, true)
// 网站监控对象仍需从资产中心创建，2026-10-21 恢复为可创建类型
assert.equal(getAssetProfile("web_endpoint")?.creatable, true)
assert.equal(
	getCreatableAssetTypeOptions().some((option) => option.type === "web_endpoint"),
	true
)
assert.equal(
	getCreatableAssetTypeOptions().some((option) => option.type === "gateway"),
	false
)
// 2026-10-26 vm 转正：虚拟机可新建，归计算设备组，宿主机用 hosted_on 关系表达
assert.equal(getAssetProfile("vm")?.creatable, true)
assert.equal(getAssetProfile("vm")?.group, "计算设备")
assert.equal(
	getCreatableAssetTypeOptions().some((option) => option.type === "vm"),
	true
)
assert.equal(
	getEditableAssetTypeOptions("vm").some((option) => option.type === "vm"),
	true
)
assert.deepEqual(getProfileRequiredFieldKeys("phone"), ["memory_gb", "storage_gb"])
assert.deepEqual(getProfileRequiredFieldKeys("mini_pc"), [])
assert.deepEqual(getProfileRequiredFieldKeys("ont"), ["carrier", "operating_role"])

// 2026-10-20 用户拍板：服务类资产基本信息只保留与其他资产共有的公共字段
for (const type of ["internet", "subscription", "domain_name", "cloud_host", "web_endpoint"] as const) {
	assert.equal(isServiceAssetType(type), true, `${type} 应识别为服务类资产`)
}
for (const type of ["mini_pc", "router", "phone", "plug", "custom"] as const) {
	assert.equal(isServiceAssetType(type), false, `${type} 不应识别为服务类资产`)
}

console.log("asset profile contract passed")
