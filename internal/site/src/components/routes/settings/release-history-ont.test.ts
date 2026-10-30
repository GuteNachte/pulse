import assert from "node:assert/strict"
import archive from "./release-history-archive.json" with { type: "json" }
import { releaseHistory } from "./release-history.ts"

// 主包只保留最新版本，旧版本在归档文件里按需加载（2026-10-18 性能优化）
assert.equal(releaseHistory.length, 1)
assert.equal(releaseHistory[0].version, "1.0.8")
assert.deepEqual(
	archive.map((release) => release.version),
	["1.0.7", "1.0.6", "1.0.5", "1.0.4", "1.0.3", "1.0.2", "1.0.1", "1.0.0"]
)

const nextReleaseText = releaseHistory[0].sections.flatMap((section) => section.items).join("\n")
for (const text of ["设备在线探测", "设置页重构五批收官", "固定视口", "虚拟机类型转正", "RTX 4080", "编号全部唯一"]) {
	assert.equal(nextReleaseText.includes(text), true, `1.0.8 记录缺少 ${text}`)
}

// 每个版本的分节标题必须唯一，避免 React key 冲突（2026-10-23 修复过重复的 Agent / 部署）
for (const release of [releaseHistory[0], ...archive]) {
	const titles = release.sections.map((section) => section.title)
	assert.equal(new Set(titles).size, titles.length, `${release.version} 存在重复分节标题`)
}

console.log("release history contract passed")
