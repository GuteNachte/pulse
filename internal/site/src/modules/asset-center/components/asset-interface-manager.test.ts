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

const workbench = readFileSync(new URL("./asset-edit-workbench.tsx", import.meta.url), "utf8")
for (const text of ["AssetInterfaceManager", "onAddInterface", "onEditInterface", "onDeleteInterface"]) {
	assert.equal(workbench.includes(text), true, `workbench missing ${text}`)
}

const detailPage = readFileSync(new URL("../asset-detail-page.tsx", import.meta.url), "utf8")
assert.equal(detailPage.includes("交换机（待建档）"), true, "interface connection note needs a neutral example")
assert.equal(
	detailPage.includes('...(kind === "wifi"'),
	true,
	"non-Wi-Fi interfaces must not send an empty wireless band"
)
assert.equal(detailPage.includes('name="wifi_standard"'), true, "Wi-Fi interfaces need a standard field")
assert.equal(detailPage.includes('wifi_standard: form.get("wifi_standard")'), true, "Wi-Fi standard must be persisted")
assert.equal(
	detailPage.includes("if (!open && interfaceDialogOpen) return"),
	true,
	"closing the interface dialog must not close the parent asset editor"
)
assert.equal(
	detailPage.includes("nestedDialogOpen={interfaceDialogOpen}"),
	true,
	"the parent workbench must know while an interface dialog is stacked above it"
)
assert.equal(
	workbench.includes("if (nestedDialogOpen) event.preventDefault()"),
	true,
	"the parent workbench must ignore outside interactions coming from its nested dialog"
)
assert.equal(
	detailPage.includes("interfaceDialogCloseGuardRef.current"),
	true,
	"the close guard must survive the child dialog unmount and focus restoration"
)
assert.equal(
	detailPage.includes('document.addEventListener("pointerdown", releaseGuard, true)'),
	true,
	"the close guard must survive asynchronous interface refresh until the next user interaction"
)
assert.equal(
	detailPage.includes('document.addEventListener("keydown", releaseGuard, true)'),
	true,
	"keyboard dismissal must also release the nested dialog guard"
)

console.log("asset interface manager contract passed")
