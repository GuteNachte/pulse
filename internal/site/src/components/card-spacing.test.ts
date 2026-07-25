import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("uses one 10px semantic gap for card layouts", () => {
	const css = readFileSync(new URL("../index.css", import.meta.url), "utf8")
	assert.ok(css.includes("--pulse-card-gap: 10px"), "全局样式应声明 10px 卡片间距 token")
	assert.ok(css.includes(".pulse-card-gap"), "全局样式应提供显式卡片间距语义类")
	assert.ok(css.includes("--pulse-page-gutter: 10px"), "桌面页面边距应声明 10px token")
	assert.ok(css.includes("padding-inline: var(--pulse-page-gutter)"), "页面容器应复用统一边距 token")

	for (const path of [
		"./routes/home.tsx",
		"./routes/assets.tsx",
		"../modules/smarthome/page.tsx",
		"./routes/websites.tsx",
		"./routes/alerts.tsx",
		"./routes/system/system-detail-content.tsx",
		"./routes/settings/layout.tsx",
	]) {
		assert.ok(readFileSync(new URL(path, import.meta.url), "utf8").includes("pulse-card-gap"), path)
	}
})
