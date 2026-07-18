export type AssetMediaOperation = "upload" | "add-gallery" | "save-edit" | "set-cover" | "unset-cover" | "delete"

export type AssetMediaOperationFeedback = {
	pendingTitle: string
	successTitle: string
	successDescription: string
	failureTitle: string
	failureDescription: string
}

const feedbackByOperation: Record<AssetMediaOperation, AssetMediaOperationFeedback> = {
	upload: {
		pendingTitle: "正在上传图片",
		successTitle: "图片已上传",
		successDescription: "已保存到本地图片库。",
		failureTitle: "图片上传失败",
		failureDescription: "请检查图片格式、文件大小或本地媒体目录。",
	},
	"add-gallery": {
		pendingTitle: "正在加入图库",
		successTitle: "已加入详情图库",
		successDescription: "详情页图片已立即更新。",
		failureTitle: "加入图库失败",
		failureDescription: "请稍后重试，原有图库状态不会改变。",
	},
	"save-edit": {
		pendingTitle: "正在保存图片编辑",
		successTitle: "图片编辑已保存",
		successDescription: "新的 16:9 展示版本已保存到图片库。",
		failureTitle: "图片编辑保存失败",
		failureDescription: "请重试，原图和已有版本不会被覆盖。",
	},
	"set-cover": {
		pendingTitle: "正在更新封面",
		successTitle: "已设为封面",
		successDescription: "资产详情封面已立即更新。",
		failureTitle: "封面更新失败",
		failureDescription: "请稍后重试，原有封面状态不会改变。",
	},
	"unset-cover": {
		pendingTitle: "正在更新封面",
		successTitle: "已取消封面",
		successDescription: "资产详情已立即同步。",
		failureTitle: "封面更新失败",
		failureDescription: "请稍后重试，原有封面状态不会改变。",
	},
	delete: {
		pendingTitle: "正在删除图片",
		successTitle: "图片已删除",
		successDescription: "图片及其编辑版本已从本地图片库移除。",
		failureTitle: "图片删除失败",
		failureDescription: "请稍后重试，删除失败时原图片会继续保留。",
	},
}

export function getAssetMediaOperationFeedback(operation: AssetMediaOperation) {
	return feedbackByOperation[operation]
}
