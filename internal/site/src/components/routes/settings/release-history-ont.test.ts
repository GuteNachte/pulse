import assert from "node:assert/strict"
import { releaseHistory } from "./release-history.ts"

const nextReleaseText = releaseHistory[0].sections.flatMap((section) => section.items).join("\n")
for (const text of ["光猫 / ONT 严格类型模板", "iFTTR 主网关", "optical", "未启用的 Wi-Fi 接口"]) {
	assert.equal(nextReleaseText.includes(text), true, `1.0.6 记录缺少 ${text}`)
}

console.log("ont release history contract passed")
