import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const source = readFileSync(new URL("./asset-network-detail-table.tsx", import.meta.url), "utf8")

assert.equal(source.includes('from "@/components/ui/table"'), true, "network details must use the shared Table")
assert.equal(source.includes('from "@/components/ui/badge"'), true, "network states must use the shared Badge")
assert.equal(source.includes('from "@/components/ui/tabs"'), true, "large interface sets need a segmented filter")

// 2026-10-06 融合简化：网络能力大表压成摘要行（标题保留在摘要文案中），网口状态表加 IPv4/MAC
for (const title of ["网络详情", "网口状态", "接入关系"]) {
	assert.equal(source.includes(title), true, `network detail panel must render ${title}`)
}
// 2026-10-06 融合简化二期：能力摘要行升级为分节格子（每节标题 + 横向参数格）
assert.equal(
	source.includes("section.rows.map((row) =>"),
	true,
	"network capability must render as compact per-section summary tiles"
)

assert.equal(
	source.includes("const showRelations = model.interfaces.length === 0 && model.relations.length > 0"),
	true,
	"relations must only render as a fallback when no interface state is available"
)
assert.equal(
	source.includes("showRelations ? <NetworkRelationTable rows={model.relations} /> : null"),
	true,
	"interface-backed network details must not repeat the relation table"
)
assert.equal(source.includes("设备能力与真实接口状态"), true)
assert.equal(source.includes("设备能力与接入关系"), true)

for (const heading of [
	// 2026-10-06 融合简化：网络能力大表撤下（压成摘要行），"分类/参数/当前值" 列随之移除
	"接口",
	"硬盘类型",
	"启用状态",
	"链路 / 连接",
	"角色",
	"速率 / 频段",
	"IPv4",
	"MAC",
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
