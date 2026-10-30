import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const source = readFileSync(new URL("./asset-media-workspace.tsx", import.meta.url), "utf8")
const visualPanelSource = readFileSync(new URL("./asset-edit-visual-panel.tsx", import.meta.url), "utf8")
const showcaseSource = readFileSync(new URL("./asset-media-showcase.tsx", import.meta.url), "utf8")
const editorSource = readFileSync(new URL("./asset-media-editor-dialog.tsx", import.meta.url), "utf8")

test("封面操作显示在预览图片外部的操作区最右侧", () => {
	assert.equal(source.includes('className="absolute bottom-2 end-2 shadow-sm"'), false)
	assert.match(source, /className="ms-auto"/)
})

// 2026-10-09 图片专项（行式列表版）：一行一张图——缩略图 + 标题 + 删除；
// 图库项在最右侧提供拖动手柄（拖动排序），封面显示「封面」标记。
test("图片库为行式列表：标题在删除按钮之前，图库项带右侧拖动手柄", () => {
	const titleIndex = source.indexOf('data-testid="asset-media-thumbnail-title"')
	const deleteIndex = source.indexOf('data-testid="asset-media-thumbnail-delete"')
	const handleIndex = source.indexOf('data-testid="asset-media-thumbnail-drag-handle"')
	assert.ok(titleIndex >= 0)
	assert.ok(deleteIndex > titleIndex)
	assert.ok(handleIndex > deleteIndex)
	// 旧的 前移/后移 按钮已被拖动排序取代
	assert.equal(source.includes('data-testid="asset-media-thumbnail-move-up"'), false)
	assert.equal(source.includes('data-testid="asset-media-thumbnail-move-down"'), false)
	// 封面位置标记与拖动提交（按新顺序整体重写排序值）
	assert.match(source, /封面/)
	assert.match(source, /commitGalleryOrder/)
	assert.match(source, /sort_order: order/)
})

test("缩略图行不再显示封面按钮（封面设置只在右侧预览）", () => {
	assert.equal(source.includes('data-testid="asset-media-thumbnail-cover-toggle"'), false)
	assert.equal(source.includes("getAssetMediaCoverIconClassName"), false)
	const previewIndex = source.indexOf("function AssetMediaPreview(")
	assert.ok(previewIndex > 0)
	const previewSource = source.slice(previewIndex)
	assert.match(previewSource, /getAssetMediaCoverActionLabel\(isCover\)/)
	assert.match(previewSource, /getNextAssetMediaCoverVisibility\(isCover\)/)
})

test("行式列表与预览左右分栏：左侧更窄、预览占更宽", () => {
	// 2026-10-09 图片专项：按用户口径左列收窄、预览加宽（1fr : 1.5fr）
	assert.match(source, /lg:grid-cols-\[minmax\(0,1fr\)_minmax\(0,1\.5fr\)\]/)
	assert.match(source, /content-start gap-1\.5/)
})

test("封面状态可切换且删除操作需要二次确认", () => {
	assert.match(source, /getNextAssetMediaCoverVisibility/)
	assert.match(source, /<OperationConfirmDialog/)
	assert.match(source, /confirmLabel="确认删除"/)
})

test("图片工作区不显示静态说明性副文案", () => {
	assert.equal(visualPanelSource.includes("获取后由你从候选图中确认详情页主图。"), false)
	assert.equal(source.includes("原图、编辑版本和展示图都保存在本地对象存储。"), false)
	assert.equal(visualPanelSource.includes("点击“获取图片”后，这里会显示"), false)
	// 2026-10-09 图片专项：AI 候选图区块已下线，其空态文案不再存在
	assert.equal(visualPanelSource.includes("暂无候选图"), false)
})

test("详情图片加载中不会误报失败或继续显示上一张", () => {
	assert.match(showcaseSource, /type MediaShowcaseImageState =/)
	assert.match(showcaseSource, /setState\(\{ status: "loading" \}\)/)
	assert.match(showcaseSource, /state\.status === "loading"[\s\S]*图片加载中/)
	assert.match(showcaseSource, /state\.status === "error"[\s\S]*图片读取失败/)
})

test("图片编辑器始终测量实际挂载的画布并显示裁剪框", () => {
	assert.match(editorSource, /ref=\{setStageNode\}/)
	assert.match(editorSource, /data-testid="asset-media-crop-frame"/)
	assert.match(editorSource, /\[open, stageNode\]/)
})

test("图片编辑器使用黑底画布并提交图片位置", () => {
	// 2026-10-10 图片编辑专项：画布黑底（与预览一致），溢出画布的部分实时暗化显示裁剪范围
	assert.match(editorSource, /bg-black/)
	assert.match(editorSource, /boxShadow: "0 0 0 999px rgba\(0, 0, 0, 0\.62\)"/)
	assert.match(editorSource, /AssetMediaPlacement/)
	assert.match(editorSource, /min=\{0\.25\}/)
	// 2026-10-10 图片编辑专项：编辑保存提交裁剪 + 亮度/对比度调节参数
	assert.match(
		source,
		/body: \{\s*parent_version: versionId,\s*placement,\s*ratio,\s*brightness: adjustments\.brightness,\s*contrast: adjustments\.contrast,\s*\}/
	)
	assert.equal(editorSource.includes("getAssetMediaCropOverlayRect"), false)
})

// 2026-10-10 图片编辑专项：编辑器提供亮度/对比度滑块与实时预览
test("图片编辑器带亮度与对比度滑块并实时预览", () => {
	assert.match(editorSource, /亮度/)
	assert.match(editorSource, /对比度/)
	assert.match(editorSource, /filter: assetMediaAdjustmentsFilterCss\(adjustments\)/)
	assert.match(source, /"restore-original"/)
	assert.match(source, /data-testid="asset-media-restore-original"/)
})

test("保存编辑结果后刷新并选中新生成的独立图片", () => {
	assert.match(source, /type MediaSaveResponse =/)
	assert.match(source, /const created = await pb\.send<MediaSaveResponse>/)
	assert.match(source, /await notifyAssetMediaChanged\(assetId\)[\s\S]*setSelectedId\(created\.media\.id\)/)
})

test("选中图片只加载一次并由预览与编辑器共享", () => {
	assert.match(source, /type AssetMediaObjectState =/)
	assert.match(source, /status: "loading"/)
	assert.match(source, /const selectedMediaObject = useAssetMediaObjectURL/)
	assert.equal((source.match(/useAssetMediaObjectURL\(selectedOriginalVersion\)/g) ?? []).length, 1)
	assert.match(source, /url=\{selectedMediaObject\.url\}/)
})

// 2026-10-09 图片专项：候选预览改由收集图片页签自持（面板右侧预览框），
// 图片库工作台不再接收外部预览覆盖；保留入库后选中目标媒体的机制。
test("入库后选中目标媒体（preferredMediaId 机制保留）", () => {
	assert.match(source, /preferredMediaId/)
	assert.match(source, /appliedPreferredMediaId/)
	assert.match(source, /appliedPreferredMediaId\.current !== preferredMediaId/)
	assert.equal(source.includes("previewOverride"), false)
})
