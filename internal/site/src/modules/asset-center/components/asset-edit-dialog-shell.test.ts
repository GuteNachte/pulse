import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

// 2026-10-20 用户拍板：基本信息弹窗和分组参数弹窗不需要整屏那么宽——
// 基本信息弹窗收到 672px（max-w-2xl），分组参数弹窗收到 768px（max-w-3xl，表格组仍要横向空间）；
// 其余参数编辑弹窗继续统一壳 896px（max-w-4xl）、88dvh 内滚动、标题区/底部按钮区带分隔线；
// 图片工作台保持 800px 固定高度。
const dir = new URL("./", import.meta.url)
const read = (file: string) => readFileSync(fileURLToPath(new URL(file, dir)), "utf8")
const unifiedShell = "max-h-[88dvh] w-full max-w-4xl overflow-y-auto"
const profileShell = "max-h-[88dvh] w-full max-w-2xl overflow-y-auto sm:p-5"
const groupShell = "max-h-[88dvh] w-full max-w-3xl overflow-y-auto sm:p-5"

const unifiedSurfaces = [
	"asset-connection-manager-dialog.tsx",
	"asset-interface-edit-dialog.tsx",
	"asset-relation-edit-dialog.tsx",
	"asset-component-edit-dialog.tsx",
	"asset-network-capability-edit-dialog.tsx",
]
for (const file of unifiedSurfaces) {
	const source = read(file)
	assert.doesNotMatch(source, /DialogContent className="max-h-\[85d?vh\][^"]*"/, `${file} 不得再用 85dvh 旧高度`)
	assert.doesNotMatch(source, /DialogContent className="max-w-2xl"/, `${file} 参数弹窗不得再用窄壳`)
	assert.equal(source.includes(unifiedShell), true, `${file} 必须使用统一弹窗壳`)
}
for (const [name, file] of [
	["asset-detail-page", "../asset-detail-page.tsx"],
	["asset-edit-page", "../asset-edit-page.tsx"],
] as const) {
	const source = read(file)
	assert.equal(source.includes(profileShell), true, `${name} 基本信息弹窗必须使用 672px 紧凑壳`)
	assert.equal(
		source.includes('className="h-[800px] max-h-[85dvh] max-w-6xl grid grid-rows-[auto_minmax(0,1fr)]'),
		true,
		`${name} 图片工作台保持 800px 固定高度`
	)
}
// 编辑页的 Agent 填写弹窗属于批量参数编辑，继续用统一壳
assert.equal(read("../asset-edit-page.tsx").includes(unifiedShell), true, "编辑页 Agent 填写弹窗保持统一壳")

const mediaShell = read("asset-media-showcase.tsx")
assert.equal(mediaShell.includes("w-[min(92vw,1040px)]"), true, "图片放大预览保持独立窗口化壳（不属于编辑弹窗）")

const groupDialog = read("asset-parameter-group-edit-dialog.tsx")
assert.equal(groupDialog.includes(groupShell), true, "分组弹窗必须使用 768px 紧凑壳")
assert.equal(groupDialog.includes("max-w-4xl"), false, "分组弹窗不再用 4xl 宽度")
assert.match(groupDialog, /DialogFooter className="border-t border-border\/70 pt-3"/, "分组弹窗底部要有分隔线")

console.log("asset edit dialog shell contract passed")
