import assert from "node:assert/strict"
import { assetListColumns, assetListDesktopGridClassName } from "./asset-list-layout.ts"

assert.deepEqual(
	assetListColumns.map((column) => column.label),
	["编号", "资产", "位置", "IPv4", "接入网络", "状态 / 资料"]
)
assert.match(assetListDesktopGridClassName, /md:grid-cols-/)
assert.match(assetListDesktopGridClassName, /minmax\(12rem,1\.25fr\)/)

console.log("asset list layout contract passed")
