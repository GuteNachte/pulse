import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const source = readFileSync(new URL("./asset-edit-visual-panel.tsx", import.meta.url), "utf8")

// 2026-10-05 图片编辑专项：面板两标签页——图片库（编辑的家）与收集图片（网络图墙搜索）
assert.match(source, /图片搜索/)
assert.match(source, /再搜 Logo/)
assert.match(source, /fetchImageCandidates\(/)
assert.match(source, /preferredMediaId=/)
// 2026-10-09 图片专项：AI 配图/候选导入管线按用户决策下线
assert.ok(!source.includes("onGenerateVisual"), "AI 生成接线应已移除")
assert.ok(!source.includes("onImportVisualCandidate"), "AI 候选导入接线应已移除")
// 2026-10-09 图片专项重构：图墙候选持久化 + 点选右侧预览 + 直接/编辑入库
assert.match(source, /loadAssetImageWall/)
assert.match(source, /saveAssetImageWall/)
assert.match(source, /再次搜索/)
assert.match(source, /获取图片/)
assert.match(source, /直接入库/)
assert.match(source, /编辑入库/)
assert.match(source, /AssetMediaEditorDialog/)
// 入库相册按装机方式：组装机归目标部件相册，其他资产整机
assert.match(source, /importAssetImageToLibrary\(assetId, image, album, crop\)/)
assert.match(source, /batchTarget\?\.album \?\? "whole"/)
// 多选批量入库已下线
assert.ok(!source.includes("rescanSelected"), "多选批量入库应已移除")
assert.ok(!source.includes("把选中的"), "旧批量入库按钮应已移除")

// 2026-10-09 图片专项：找图按装机方式分流——组装机选部件找配图并自动归相册
assert.match(source, /目标部件/)
assert.match(source, /asset_components/)
assert.match(source, /isDiyCompute/)
assert.match(source, /showAlbumControls=/)
assert.match(source, /batchTarget\?\.label/)
assert.match(source, /assetBuildMode/)
