import assert from "node:assert/strict"
import { assetListColumns, assetListDesktopGridClassName } from "./asset-list-layout.ts"

assert.deepEqual(
	assetListColumns.map((column) => column.label),
	["编号", "资产", "位置", "IPv4", "网络接入方式", "网卡速率", "状态 / 资料"]
)
assert.equal(assetListColumns.length, 7)
assert.match(assetListDesktopGridClassName, /md:grid-cols-/)
assert.match(assetListDesktopGridClassName, /minmax\(12rem,1\.25fr\)/)
assert.match(assetListDesktopGridClassName, /minmax\(10rem/)

console.log("asset list layout contract passed")
