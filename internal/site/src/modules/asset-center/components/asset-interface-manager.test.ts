import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const source = readFileSync(new URL("./asset-interface-manager.tsx", import.meta.url), "utf8")

for (const text of ["添加网卡", "网络接入方式", "网卡速率", "编辑", "删除"]) {
	assert.equal(source.includes(text), true, `missing ${text}`)
}
assert.equal(source.includes("<Badge"), false, "interface summaries should not render status badges")
assert.equal(source.includes("主接口"), false, "interface summaries should not render the primary badge")
assert.equal(source.includes("手机连接中"), false)

assert.equal(source.includes("onAdd"), true)
assert.equal(source.includes("onEdit"), true)
assert.equal(source.includes("onDelete"), true)
assert.equal(source.match(/type="button"/g)?.length, 3, "all three manager actions must not submit an outer form")

// 2026-10-06 页面重构：接口管理收进编辑页连接图卡右上角「编辑」打开的连接管理弹窗，
// 接口编辑弹窗独立成组件；旧的“编辑弹窗 + 嵌套接口弹窗”架构与配套的嵌套守卫一并退役。
const managerDialog = readFileSync(new URL("./asset-connection-manager-dialog.tsx", import.meta.url), "utf8")
assert.equal(
	managerDialog.includes("AssetInterfaceManager"),
	true,
	"connection manager dialog must host the interface manager"
)
for (const text of [
	"setInterfaceEdit({ open: true, editing: null })",
	"setInterfaceEdit({ open: true, editing: record })",
]) {
	assert.equal(managerDialog.includes(text), true, `connection manager dialog missing interface dialog trigger ${text}`)
}
const editPage = readFileSync(new URL("../asset-edit-page.tsx", import.meta.url), "utf8")
assert.equal(
	editPage.includes("AssetConnectionManagerDialog"),
	true,
	"edit page must open the connection manager dialog"
)

const interfaceDialog = readFileSync(new URL("./asset-interface-edit-dialog.tsx", import.meta.url), "utf8")
assert.equal(interfaceDialog.includes("交换机（待建档）"), true, "interface connection note needs a neutral example")
assert.equal(
	interfaceDialog.includes('...(kind === "wifi"'),
	true,
	"non-Wi-Fi interfaces must not send an empty wireless band"
)
assert.equal(interfaceDialog.includes('name="wifi_standard"'), true, "Wi-Fi interfaces need a standard field")
assert.equal(
	interfaceDialog.includes('wifi_standard: form.get("wifi_standard")'),
	true,
	"Wi-Fi standard must be persisted"
)

console.log("asset interface manager contract passed")
