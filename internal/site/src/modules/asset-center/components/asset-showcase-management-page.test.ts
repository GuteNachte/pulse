import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const source = readFileSync(new URL("./asset-showcase-workspace.tsx", import.meta.url), "utf8")

// 2026-10-10 详情页大布局：设备档案卡只显示设备本体硬件身份（型号/内部型号/厂商/官网），
// 网络身份（IPv4/MAC/管理页面）上移到头部通用档案标签，不再出现在档案卡。
assert.equal(
	source.includes('linkRow("管理页面"'),
	false,
	"the device archive no longer shows a management page row (it moved to the header tags)"
)
assert.match(
	source,
	/fixedRow\("品牌", \[getMetadataString\(metadata, "vendor_cn"\), asset\.vendor\]\.filter\(Boolean\)\.join\(" \/ "\)\)/
)
assert.match(source, /fixedRow\("型号", internalModel \? `\$\{asset\.model\} \(\$\{internalModel\}\)` : asset\.model\)/)
assert.equal(source.includes('fixedRow("内部型号"'), false, "内部型号不再单列（并入型号括号显示）")
assert.match(source, /fixedRow\("产品定位", productPositioning\)/, "产品定位必须显示在基本信息卡")
assert.match(source, /fixedRow\("上市日期", releaseDate\)/)
assert.match(source, /linkRow\("官方网站"/)

console.log("asset showcase management page contract passed")
