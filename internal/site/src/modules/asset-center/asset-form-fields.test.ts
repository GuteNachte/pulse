import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

// 2026-10-20 用户报「基本信息弹窗显示编号，保存后仍未编号」：
// AssetTagInput 没有手填时界面显示的是候选取号（displayValue），隐藏字段必须提交同一个值，
// 否则保存的是空字符串，详情页回到「未编号」。
const source = readFileSync(fileURLToPath(new URL("./components/asset-form-fields.tsx", import.meta.url)), "utf8")
assert.match(source, /const displayValue = normalizedValue \|\| presetValue/)
assert.match(source, /name=\{name\}\s+value=\{displayValue\}/, "资产编号隐藏字段必须提交界面显示值")
assert.doesNotMatch(source, /name=\{name\}\s+value=\{normalizedValue\}/, "不能只提交手填值，否则候选编号不会保存")

console.log("asset tag form contract passed")
