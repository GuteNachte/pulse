import { pb } from "@/lib/api"

// 2026-10-14 参数获取下线：本模块原先的“添加资产自动获取参数”（联网搜索候选）随搜索链路一起移除；
// 保留的是图片候选链路——网络图墙搜索、候选挑选与编辑入库（与参数填写无关）。

export type AutoFetchImage = {
	id: string
	url: string
	title: string
	sourceUrl: string
	provider: string
}

type AssetImageCandidatesResponse = {
	items?: { url?: string; title?: string; source_url?: string; provider?: string }[]
}

// 图墙候选：只搜不建库，人工挑选后随创建入库
// 2026-10-09 图片专项：新增 vendor 参数——裸型号搜索词太泛（UM690 会命中无关内容），带厂商显著提升候选质量
// 2026-10-09 图片专项：新增 sources 参数——图源勾选（bing/so360），空 = 全部启用
export async function fetchImageCandidates(
	name: string,
	typeLabel: string,
	assetId?: string,
	vendor?: string,
	sources?: string[],
	limit?: number,
	assetType?: string
): Promise<AutoFetchImage[]> {
	const result = await pb.send<AssetImageCandidatesResponse>("/api/pulse/assets/image-candidates", {
		method: "POST",
		body: JSON.stringify({
			name: name.trim(),
			type_label: typeLabel,
			asset_id: assetId,
			vendor: vendor?.trim() ?? "",
			asset_type: assetType ?? "",
			sources: sources?.length ? sources : ["bing", "so360"],
			limit: limit ?? 12,
		}),
		requestKey: null,
	})
	const images: AutoFetchImage[] = []
	let index = 0
	for (const raw of result?.items ?? []) {
		const imageUrl = raw.url?.trim()
		index += 1
		if (!imageUrl) continue
		images.push({
			id: `image-${index}`,
			url: imageUrl,
			title: raw.title?.trim() || "图片候选",
			sourceUrl: raw.source_url?.trim() ?? "",
			provider: raw.provider?.trim() ?? "",
		})
	}
	return images
}

// 2026-10-09 图片专项：图墙导入支持"编辑入库"——带裁剪参数时后端先按归一化摆放位渲染，
// 再把裁剪结果存为原图（详见 Hub import-url 的 crop_placement/crop_ratio）。
// 2026-10-10 图片编辑专项：crop 支持亮度/对比度（-100~100，编辑入库所见即所得）。
export async function importAssetImageToLibrary(
	assetId: string,
	image: AutoFetchImage,
	album?: string,
	crop?: {
		placement: { x: number; y: number; width: number; height: number }
		ratio: string
		brightness?: number
		contrast?: number
	}
): Promise<boolean> {
	try {
		await pb.send(`/api/pulse/assets/${assetId}/media/import-url`, {
			method: "POST",
			// 图墙导入默认归整机相册（此前漏传导致图库归组为空）
			body: JSON.stringify({
				url: image.url,
				provider: image.provider,
				album: album?.trim() || "whole",
				crop_placement: crop?.placement,
				crop_ratio: crop?.ratio ?? "",
				crop_brightness: crop?.brightness ?? 0,
				crop_contrast: crop?.contrast ?? 0,
			}),
			requestKey: null,
		})
		return true
	} catch (error) {
		console.warn("import asset media", image.url, error)
		return false
	}
}
