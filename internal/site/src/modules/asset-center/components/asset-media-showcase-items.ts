export type AssetMediaShowcaseItemInput = { id: string; url: string; title?: string }

function getUniqueAssetMediaShowcaseItems(covers: AssetMediaShowcaseItemInput[]): AssetMediaShowcaseItemInput[] {
	const seenURLs = new Set<string>()
	return covers.filter((item) => {
		if (!item.url || seenURLs.has(item.url)) return false
		seenURLs.add(item.url)
		return true
	})
}

export function getAssetMediaShowcaseLayout(covers: AssetMediaShowcaseItemInput[]): {
	primary?: AssetMediaShowcaseItemInput
	thumbnails: AssetMediaShowcaseItemInput[]
} {
	const thumbnails = getUniqueAssetMediaShowcaseItems(covers)
	return { primary: thumbnails[0], thumbnails }
}

export function getAssetMediaShowcaseActiveItem(
	primary: AssetMediaShowcaseItemInput | undefined,
	thumbnails: AssetMediaShowcaseItemInput[],
	activeId: string | undefined
): AssetMediaShowcaseItemInput | undefined {
	return thumbnails.find((item) => item.id === activeId) ?? primary
}
