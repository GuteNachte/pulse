import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const source = readFileSync(new URL("./asset-interface-manager.tsx", import.meta.url), "utf8")

for (const text of ["添加网卡", "网络接入方式", "网卡速率", "当前接入", "主接口", "编辑", "删除"]) {
	assert.equal(source.includes(text), true, `missing ${text}`)
}
for (const text of ["启用", "未启用", "已接线", "未接线"]) {
	assert.equal(source.includes(text), true, `missing interface state ${text}`)
}
assert.equal(source.includes("手机连接中"), false)

assert.equal(source.includes("onAdd"), true)
assert.equal(source.includes("onEdit"), true)
assert.equal(source.includes("onDelete"), true)
assert.equal(source.match(/type="button"/g)?.length, 3, "all three manager actions must not submit an outer form")

const workbench = readFileSync(new URL("./asset-edit-workbench.tsx", import.meta.url), "utf8")
for (const text of ["AssetInterfaceManager", "onAddInterface", "onEditInterface", "onDeleteInterface"]) {
	assert.equal(workbench.includes(text), true, `workbench missing ${text}`)
}

const detailPage = readFileSync(new URL("../asset-detail-page.tsx", import.meta.url), "utf8")
assert.equal(detailPage.includes("交换机（待建档）"), true, "interface connection note needs a neutral example")

console.log("asset interface manager contract passed")
