import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const source = readFileSync(new URL("./asset-network-detail-table.tsx", import.meta.url), "utf8")

assert.equal(source.includes('from "@/components/ui/table"'), true, "network details must use the shared Table")
assert.equal(source.includes('from "@/components/ui/badge"'), true, "network states must use the shared Badge")
assert.equal(source.includes('from "@/components/ui/tabs"'), true, "large interface sets need a segmented filter")

for (const title of ["网络详情", "网络能力", "网口状态", "接入关系"]) {
	assert.equal(source.includes(title), true, `network detail panel must render ${title}`)
}

for (const heading of [
	"分类",
	"参数",
	"当前值",
	"接口",
	"介质",
	"启用状态",
	"链路 / 连接",
	"角色",
	"速率 / 频段",
	"对端设备",
	"方向",
	"本机接口",
	"对端接口",
	"链路类型",
	"关系状态",
]) {
	assert.equal(source.includes(heading), true, `table column ${heading} must remain explicit`)
}

assert.equal(source.includes("const INTERFACE_FILTER_THRESHOLD = 12"), true)
assert.equal(source.includes("model.interfaces.length > INTERFACE_FILTER_THRESHOLD"), true)
assert.equal(source.includes('value="connected"'), true)
assert.equal(source.includes('value="disconnected"'), true)
assert.equal(source.includes('value="disabled"'), true)
assert.equal(
	source.includes('className="hidden md:block"'),
	true,
	"desktop interface and relation tables need a stable breakpoint"
)
assert.equal(source.includes('className="grid gap-0 md:hidden"'), true, "mobile rows must use a compact stacked layout")
assert.equal(
	source.includes("Pagination"),
	false,
	"network detail tables must use natural page scrolling without pagination"
)
assert.equal(source.includes("ScrollArea"), false, "network detail tables must not create an inner scroll area")

console.log("network device detail table contract passed")
