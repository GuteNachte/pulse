import type { AutoFetchImage } from "./asset-auto-fetch"

// 2026-10-09 图片专项：图墙候选持久化——获取到的候选不会因关闭弹窗、切换标签页或
// 刷新页面消失，只有再次搜索才会换一批。会话级存储（sessionStorage），按资产区分。
// 组装机（DIY）的搜索结果额外记录"目标部件"，重开后保持批次归属。

const ASSET_IMAGE_WALL_STORAGE_PREFIX = "pulse_asset_image_wall:"

export type AssetImageWallState = {
	items: AutoFetchImage[]
	/** DIY 装机：本批候选搜索时的目标部件（配件 id 或 category:<分类>） */
	targetId?: string
}

function assetImageWallStorage(): Storage | undefined {
	try {
		if (typeof sessionStorage === "undefined") return undefined
		return sessionStorage
	} catch {
		return undefined
	}
}

export function loadAssetImageWall(assetId: string): AssetImageWallState {
	const empty: AssetImageWallState = { items: [] }
	if (!assetId) return empty
	const storage = assetImageWallStorage()
	if (!storage) return empty
	try {
		const raw = storage.getItem(ASSET_IMAGE_WALL_STORAGE_PREFIX + assetId)
		if (!raw) return empty
		const parsed = JSON.parse(raw) as { items?: AutoFetchImage[]; targetId?: string }
		if (!Array.isArray(parsed.items)) return empty
		return {
			items: parsed.items.filter((item) => Boolean(item && typeof item.url === "string" && item.url)),
			targetId: typeof parsed.targetId === "string" && parsed.targetId ? parsed.targetId : undefined,
		}
	} catch {
		return empty
	}
}

export function saveAssetImageWall(assetId: string, state: AssetImageWallState) {
	if (!assetId) return
	const storage = assetImageWallStorage()
	if (!storage) return
	try {
		storage.setItem(
			ASSET_IMAGE_WALL_STORAGE_PREFIX + assetId,
			JSON.stringify({ items: state.items, targetId: state.targetId ?? "", savedAt: Date.now() })
		)
	} catch {
		// 存储不可用时忽略：候选仅保留在内存状态
	}
}
