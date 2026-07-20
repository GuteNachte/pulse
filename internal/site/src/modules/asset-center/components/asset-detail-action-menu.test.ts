import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const menu = readFileSync(new URL("./asset-detail-action-menu.tsx", import.meta.url), "utf8")

for (const label of ["接口", "关系", "维护", "附件"]) {
	assert.equal(menu.includes(label), true, `missing direct action ${label}`)
}
assert.equal(menu.includes("更多"), true)
assert.equal(menu.includes("showInterface"), true)
assert.equal(menu.includes("relationLabel"), true)
assert.equal(
	menu.includes('className="flex flex-wrap items-center justify-end gap-1.5"'),
	true,
	"详情操作按钮之间必须使用紧凑且统一的间距"
)
for (const icon of ["CableIcon", "GitBranchIcon", "WrenchIcon", "PaperclipIcon"]) {
	assert.equal(menu.includes(`<${icon} className="size-3.5"`), true, `${icon} 必须使用 14px 紧凑图标`)
}
assert.equal(
	menu.includes('<MoreHorizontalIcon data-icon="inline-start" className="size-3.5" />'),
	true,
	"更多按钮必须使用 14px 紧凑图标"
)
assert.equal(menu.indexOf("删除资产") > menu.indexOf("DropdownMenuContent"), true)
assert.equal(
	menu.lastIndexOf("{editAction}") < menu.lastIndexOf("<DropdownMenuTrigger"),
	true,
	"编辑必须排列在更多之前"
)

const page = readFileSync(new URL("../asset-detail-page.tsx", import.meta.url), "utf8")
assert.equal(page.includes("editAction={"), true)
assert.equal(
	page.includes('<PencilIcon data-icon="inline-start" className="size-3.5" />'),
	true,
	"编辑按钮必须使用 14px 紧凑图标"
)
assert.equal(page.includes('showInterface={asset.type !== "internet"}'), true)
assert.equal(page.includes('relationLabel={asset.type === "internet" ? "接入关系" : "关系"}'), true)
assert.equal(
	page.includes('className="flex min-w-0 flex-wrap items-start justify-between gap-3"'),
	true,
	"窄屏标题栏必须允许操作组换行"
)
assert.equal(page.includes('className="ms-auto min-w-0 shrink-0"'), true, "换行后的操作组必须保持靠右")

console.log("asset detail action menu contract passed")
