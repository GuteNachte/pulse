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

test("缩略图在名称下方显示封面状态和删除操作", () => {
	assert.equal(source.includes('className="absolute end-1 top-1'), false)
	const titleIndex = source.indexOf('data-testid="asset-media-thumbnail-title"')
	const coverIndex = source.indexOf('data-testid="asset-media-thumbnail-cover-toggle"')
	assert.ok(titleIndex >= 0)
	assert.ok(coverIndex > titleIndex)
	assert.match(source, /data-testid="asset-media-thumbnail-delete"/)
})

test("缩略图封面和删除按钮使用相同的紧凑尺寸", () => {
	assert.match(source, /const assetMediaThumbnailActionClassName = "h-6 min-h-6 w-full px-1 text-\[10px\]"/)
	assert.equal(source.split("className={assetMediaThumbnailActionClassName}").length - 1, 2)
})

test("缩略图封面状态只填充五角星而不改变按钮颜色", () => {
	assert.match(source, /data-testid="asset-media-thumbnail-cover-toggle"[\s\S]*?variant="outline"/)
	assert.equal(source.includes('variant={cover ? "default" : "outline"}'), false)
	assert.match(source, /<StarIcon className={getAssetMediaCoverIconClassName\(cover\)} \/>/)
})

test("封面状态可切换且删除操作需要二次确认", () => {
	assert.match(source, /data-testid="asset-media-thumbnail-cover-toggle"/)
	assert.equal(source.includes('{cover && <Button data-testid="asset-media-thumbnail-cover-toggle"'), false)
	assert.match(source, /<OperationConfirmDialog/)
	assert.match(source, /confirmLabel="确认删除"/)
})

test("图片工作区不显示静态说明性副文案", () => {
	assert.equal(visualPanelSource.includes("获取后由你从候选图中确认详情页主图。"), false)
	assert.equal(source.includes("原图、编辑版本和展示图都保存在本地对象存储。"), false)
	assert.equal(visualPanelSource.includes("点击“获取图片”后，这里会显示"), false)
	assert.match(visualPanelSource, /暂无候选图/)
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

test("图片编辑器使用固定白底画布并提交图片位置", () => {
	assert.match(editorSource, /bg-white/)
	assert.match(editorSource, /AssetMediaPlacement/)
	assert.match(editorSource, /min=\{0\.25\}/)
	assert.match(source, /body: \{ parent_version: versionId, placement, ratio \}/)
	assert.equal(editorSource.includes("getAssetMediaCropOverlayRect"), false)
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

test("候选图片可覆盖上方预览并在入库后选中目标媒体", () => {
	assert.match(source, /previewOverride/)
	assert.match(source, /preferredMediaId/)
	assert.match(source, /appliedPreferredMediaId/)
	assert.match(source, /appliedPreferredMediaId\.current !== preferredMediaId/)
	assert.match(source, /onLibrarySelection/)
	assert.match(source, /previewOverride[\s\S]*fallbackPreview/)
})
