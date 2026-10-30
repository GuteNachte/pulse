// 当前版本：1.0.8（与 pulse.go / Makefile 同步，发布新版本时随 JSON 主包一起更新）。
// 版本更新记录数据存放在同目录的 JSON（内容，不是代码）。
// 主包只保留最新版本；旧版本在 release-history-archive.json，打开“历史版本”时再按需加载，
// 避免版本记录越积越多拖慢设置页。发布新版本时把上一版本移入归档文件。
// import attribute 供 Node 直跑测试时解析 JSON（Vite/tsc 两种环境都兼容）。
import releaseData from "./release-history.json" with { type: "json" }

export type ReleaseNote = {
	version: string
	date: string
	title: string
	badges: string[]
	sections: {
		title: string
		items: string[]
	}[]
}

export const releaseHistory: ReleaseNote[] = releaseData

export async function loadReleaseHistoryArchive(): Promise<ReleaseNote[]> {
	const archive = await import("./release-history-archive")
	return archive.default
}
