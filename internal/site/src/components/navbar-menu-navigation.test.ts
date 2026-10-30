import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const source = readFileSync(new URL("./navbar.tsx", import.meta.url), "utf8")

test("菜单导航不阻止 Radix 在选择后自动关闭", () => {
	const navigateFromMenu = source.match(/const navigateFromMenu = [\s\S]*?\n\t}/)?.[0]

	assert.ok(navigateFromMenu)
	assert.doesNotMatch(navigateFromMenu, /preventDefault\(\)/)
})

test("桌面和移动菜单共用同一导航关闭行为", () => {
	assert.match(source, /DropdownMenuItem onSelect=\{navigateFromMenu\(settingsIndexPath\)\}/)
	assert.match(source, /DropdownMenuItem onSelect=\{navigateFromMenu\(settingsPath\)\}/)
	assert.match(source, /DropdownMenuItem onSelect=\{navigateFromMenu\(alertsPath\)\}/)
})
