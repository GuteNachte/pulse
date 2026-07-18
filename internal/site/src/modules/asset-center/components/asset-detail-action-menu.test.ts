import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const menu = readFileSync(new URL("./asset-detail-action-menu.tsx", import.meta.url), "utf8")

for (const label of ["接口", "关系", "维护", "附件"]) {
	assert.equal(menu.includes(label), true, `missing direct action ${label}`)
}
assert.equal(menu.includes("更多"), true)
assert.equal(menu.indexOf("删除资产") > menu.indexOf("DropdownMenuContent"), true)
assert.equal(
	menu.lastIndexOf("{editAction}") < menu.lastIndexOf("<DropdownMenuTrigger"),
	true,
	"编辑必须排列在更多之前"
)

const page = readFileSync(new URL("../asset-detail-page.tsx", import.meta.url), "utf8")
assert.equal(page.includes("editAction={"), true)
assert.equal(
	page.includes('className="flex min-w-0 flex-wrap items-start justify-between gap-3"'),
	true,
	"窄屏标题栏必须允许操作组换行"
)
assert.equal(page.includes('className="ms-auto min-w-0 shrink-0"'), true, "换行后的操作组必须保持靠右")

console.log("asset detail action menu contract passed")
