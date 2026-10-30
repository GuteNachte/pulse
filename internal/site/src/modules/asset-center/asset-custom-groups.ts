// 2026-10-20 用户《资产详情页完整优化方案》：硬件档案支持自定义分组。
// 存储全部放在 asset.metadata，避免新增 collection：
//   _custom_groups: [{ id, title }]       用户新建的分组
//   _group_order: string[]                参数分组显示顺序
//   _group_titles: { [groupId]: title }   预设分组重命名覆盖
//   _hidden_groups: string[]              删除（隐藏）的预设分组；数据保留，可恢复
//   _group_params: { [groupId]: string[] } 既有自定义参数清单（新分组与「未分类」也用它）
//   _param_order: { [groupId]: string[] }  既有组内顺序

export const UNCATEGORIZED_GROUP_ID = "uncategorized"
export const UNCATEGORIZED_GROUP_TITLE = "未分类"

export type AssetCustomGroup = { id: string; title: string }
export type AssetGroupLike = { id: string; title: string }

function readRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

export function getAssetCustomGroups(metadata: Record<string, unknown> | undefined): AssetCustomGroup[] {
	const raw = metadata?._custom_groups
	if (!Array.isArray(raw)) return []
	const result: AssetCustomGroup[] = []
	const seen = new Set<string>()
	for (const entry of raw) {
		const record = readRecord(entry)
		const id = typeof record.id === "string" ? record.id.trim() : ""
		const title = typeof record.title === "string" ? record.title.trim() : ""
		if (!id || !title || seen.has(id)) continue
		seen.add(id)
		result.push({ id, title })
	}
	return result
}

export function getAssetGroupOrder(metadata: Record<string, unknown> | undefined): string[] {
	const raw = metadata?._group_order
	if (!Array.isArray(raw)) return []
	return raw.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
}

export function getAssetGroupTitles(metadata: Record<string, unknown> | undefined): Record<string, string> {
	const raw = readRecord(metadata?._group_titles)
	const result: Record<string, string> = {}
	for (const [id, title] of Object.entries(raw)) {
		if (typeof title === "string" && title.trim()) result[id] = title.trim()
	}
	return result
}

export function getAssetHiddenGroups(metadata: Record<string, unknown> | undefined): string[] {
	const raw = metadata?._hidden_groups
	if (!Array.isArray(raw)) return []
	return raw.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
}

// 展示分组 id 可能带 asset-parameter- 前缀，存储键（_group_params/_hidden_groups/_group_titles）统一用裸分类 id
export function toStorageGroupId(groupId: string) {
	return groupId.replace(/^asset-parameter-/, "")
}

export function getAssetGroupTitle(metadata: Record<string, unknown> | undefined, groupId: string, fallback: string) {
	return getAssetGroupTitles(metadata)[groupId] ?? fallback
}

export function isCustomAssetGroup(metadata: Record<string, unknown> | undefined, groupId: string) {
	return groupId === UNCATEGORIZED_GROUP_ID || getAssetCustomGroups(metadata).some((group) => group.id === groupId)
}

export function createAssetCustomGroupId() {
	return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

// 应用隐藏分组与拖拽顺序；未记录的组保持相对位置排在已排序组之后（特殊分组如网口状态不会被误排到最前）
export function applyAssetGroupLayout<T extends AssetGroupLike>(
	groups: T[],
	metadata: Record<string, unknown> | undefined
): T[] {
	const hidden = new Set(getAssetHiddenGroups(metadata))
	const visible = groups.filter((group) => !hidden.has(toStorageGroupId(group.id)))
	if (visible.length === 0) return visible
	const order = getAssetGroupOrder(metadata)
	if (order.length === 0) return visible
	const orderIndex = new Map(order.map((id, index) => [id, index] as const))
	return visible
		.map((group, index) => ({ group, index, order: orderIndex.get(toStorageGroupId(group.id)) }))
		.sort((left, right) => {
			const leftOrder = left.order ?? Number.MAX_SAFE_INTEGER
			const rightOrder = right.order ?? Number.MAX_SAFE_INTEGER
			return leftOrder - rightOrder || left.index - right.index
		})
		.map(({ group }) => group)
}

function readGroupParams(metadata: Record<string, unknown>, groupId: string): string[] {
	const groups = readRecord(metadata._group_params)
	const raw = groups[groupId]
	return Array.isArray(raw) ? raw.filter((key): key is string => typeof key === "string" && key.trim() !== "") : []
}

// 把自定义参数从一组移到另一组（预设字段仍在原分类，本函数只处理 _group_params 里的自定义键）
export function moveAssetCustomParam(
	metadata: Record<string, unknown>,
	key: string,
	fromGroupId: string,
	toGroupId: string
): Record<string, unknown> | undefined {
	const fromStorageId = toStorageGroupId(fromGroupId)
	const toStorageId = toStorageGroupId(toGroupId)
	if (!key || fromStorageId === toStorageId) return undefined
	const groupParams = { ...readRecord(metadata._group_params) }
	const fromKeys = readGroupParams({ ...metadata, _group_params: groupParams }, fromStorageId)
	if (!fromKeys.includes(key)) return undefined
	const toKeys = readGroupParams({ ...metadata, _group_params: groupParams }, toStorageId)
	const remainingKeys = fromKeys.filter((item) => item !== key)
	if (remainingKeys.length === 0) delete groupParams[fromStorageId]
	else groupParams[fromStorageId] = remainingKeys
	groupParams[toStorageId] = [...new Set([...toKeys, key])]
	const paramOrder = { ...readRecord(metadata._param_order) }
	const fromOrder = Array.isArray(paramOrder[fromStorageId]) ? (paramOrder[fromStorageId] as unknown[]) : []
	const remainingOrder = fromOrder.filter((item) => item !== key)
	if (remainingOrder.length === 0) delete paramOrder[fromStorageId]
	else paramOrder[fromStorageId] = remainingOrder
	const toOrder = Array.isArray(paramOrder[toStorageId]) ? (paramOrder[toStorageId] as unknown[]) : []
	paramOrder[toStorageId] = [...new Set([...toOrder, key])]
	return {
		...metadata,
		_group_params: groupParams,
		_param_order: paramOrder,
	}
}

// 删除用户新建的分组：连同该组自定义参数与顺序一起清掉，预设字段不受影响
export function removeAssetCustomGroup(metadata: Record<string, unknown>, groupId: string): Record<string, unknown> {
	const customGroups = getAssetCustomGroups(metadata).filter((group) => group.id !== groupId)
	const groupParams = { ...readRecord(metadata._group_params) }
	const keys = readGroupParams({ ...metadata, _group_params: groupParams }, groupId)
	delete groupParams[groupId]
	const paramOrder = { ...readRecord(metadata._param_order) }
	delete paramOrder[groupId]
	const tableOrder = { ...readRecord(metadata._table_row_order) }
	delete tableOrder[groupId]
	const titles = { ...getAssetGroupTitles(metadata) }
	delete titles[groupId]
	const next: Record<string, unknown> = {
		...metadata,
		_custom_groups: customGroups,
		_group_order: getAssetGroupOrder(metadata).filter((id) => id !== groupId),
		_group_titles: titles,
		_hidden_groups: getAssetHiddenGroups(metadata).filter((id) => id !== groupId),
		_group_params: groupParams,
		_param_order: paramOrder,
		_table_row_order: tableOrder,
	}
	for (const key of keys) delete next[key]
	return next
}

// 分组拖拽后的新顺序：只记录参数分组 id（特殊分组如网口状态不参与）
export function buildGroupOrderFromDrop(groups: AssetGroupLike[], sourceId: string, targetId: string) {
	const ids = groups.map((group) => group.id)
	const fromIndex = ids.indexOf(sourceId)
	const toIndex = ids.indexOf(targetId)
	if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return undefined
	const next = [...ids]
	const [moved] = next.splice(fromIndex, 1)
	next.splice(toIndex, 0, moved)
	return next
}
