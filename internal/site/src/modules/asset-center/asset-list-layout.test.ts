import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { assetListColumns, assetListDesktopGridClassName } from "./asset-list-layout.ts"

assert.deepEqual(
	assetListColumns.map((column) => column.label),
	["编号", "资产", "位置", "IPv4", "网络上联", "网络接入方式", "状态 / 资料"]
)
assert.equal(assetListColumns.length, 7)
assert.match(assetListDesktopGridClassName, /md:grid-cols-/)
assert.match(assetListDesktopGridClassName, /minmax\(12rem,1\.25fr\)/)
assert.match(assetListDesktopGridClassName, /minmax\(10rem/)

const assetCardSource = readFileSync(new URL("./components/asset-card.tsx", import.meta.url), "utf8")
assert.ok(
	assetCardSource.indexOf("<AssetNetworkUplinkCell") < assetCardSource.indexOf("{network.accessLabel}"),
	"资产行应先显示网络上联，再显示网络接入方式"
)

console.log("asset list layout contract passed")
