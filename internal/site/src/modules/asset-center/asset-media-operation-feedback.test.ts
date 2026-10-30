import { strict as assert } from "node:assert"
import { getAssetMediaOperationFeedback } from "./asset-media-operation-feedback.ts"

assert.deepEqual(getAssetMediaOperationFeedback("upload"), {
	pendingTitle: "正在上传图片",
	successTitle: "图片已上传",
	successDescription: "已保存到本地图片库。",
	failureTitle: "图片上传失败",
	failureDescription: "请检查图片格式、文件大小或本地媒体目录。",
})

assert.deepEqual(getAssetMediaOperationFeedback("add-gallery"), {
	pendingTitle: "正在加入图库",
	successTitle: "已加入详情图库",
	successDescription: "详情页图片已立即更新。",
	failureTitle: "加入图库失败",
	failureDescription: "请稍后重试，原有图库状态不会改变。",
})

assert.equal(getAssetMediaOperationFeedback("save-edit").successTitle, "图片编辑已保存")
assert.equal(getAssetMediaOperationFeedback("set-cover").successTitle, "已设为封面")
assert.equal(getAssetMediaOperationFeedback("unset-cover").successTitle, "已取消封面")
assert.equal(getAssetMediaOperationFeedback("delete").failureTitle, "图片删除失败")
