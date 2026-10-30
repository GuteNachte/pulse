import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react"
import { GripVerticalIcon, PlusIcon, RefreshCwIcon, TextCursorInputIcon, Trash2Icon } from "lucide-react"
import { pb } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/use-toast"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
	getAssetFormSections,
	getMetadataString,
	normalizeNumberFieldValue,
	type AssetFieldDefinition,
} from "../asset-schema"
import {
	formatInternetAddressTimestamp,
	getInternetAddressAutoRefreshSettings,
	getInternetAddressMode,
	getInternetAddressRefreshFeedback,
	internetAddressRefreshIntervalOptions,
	type InternetAddressMode,
} from "../asset-internet-address-status"
import { getAssetArchiveField } from "../asset-parameter-registry"
import { resolveParameterGroupId } from "../asset-detail-parameter-groups"
import type { AssetRecord } from "@/types"
import { cn } from "@/lib/utils"

// 2026-10-10 参数专项二期：组编辑弹窗与详情页卡片展示同构——
// 参数按「一行一个」编辑（预设字段可改值/删行 + 新增参数行），表格组按卡片同款表格编辑。
// 2026-10-20 用户拍板：每个分类弹窗里的 Agent 填写模块全部移除，批量填写只保留编辑页的全局「Agent 填写参数」。

type NewParamRow = { id: string; key: string; label: string; value: string }

// 2026-10-17 表格行拖拽排序：插槽/盘位/网口行标识（memory slot-N / storage bay-N / network wired、wifi、ext-N）
type TableRowDescriptor = {
	id: string
	kind: "slot" | "bay" | "wired" | "wifi" | "ext"
	label: string
	rowNo: number
}

// 2026-10-17 非表格组行列表条目：预设字段行或自定义行
type RowEntry =
	| { kind: "preset"; id: string; field: AssetFieldDefinition }
	| { kind: "custom"; id: string; row: NewParamRow }

export function AssetParameterGroupEditDialog({
	open,
	onOpenChange,
	asset,
	groupId,
	groupTitle,
	readOnly,
	onSaved,
	onRenameGroup,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	asset: AssetRecord
	groupId: string
	groupTitle: string
	readOnly: boolean
	onSaved: () => void
	// 2026-10-20 用户拍板：分组重命名从卡片右上角移入编辑弹窗
	onRenameGroup?: (title: string) => Promise<boolean> | boolean
}) {
	// 2026-10-20 自定义分组：groupId 没有 asset-parameter- 前缀时（custom-… / uncategorized）直接作为存储键
	const fetchCategoryId = groupId.startsWith("asset-parameter-") ? groupId.slice("asset-parameter-".length) : groupId
	// 2026-10-17 用户拍板：表格组（网络/内存/存储）保持表格填写与候选表格；其余组改为「粘贴→按顺序直接写入」
	const isTableGroup = fetchCategoryId === "memory" || fetchCategoryId === "storage" || fetchCategoryId === "network"
	// 2026-10-20 用户拍板：动态公网地址是系统管理分组，不能增删改参数；只提供自动更新开关、间隔和立即刷新。
	const isInternetAddressGroup = asset.type === "internet" && groupId === "internet-public-addresses"

	// ---- 左：本组参数状态 ----
	const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
	const [removedFields, setRemovedFields] = useState<Set<string>>(new Set())
	const [newParams, setNewParams] = useState<NewParamRow[]>([])
	// 2026-10-17 用户拍板：非表格组的参数行支持拖拽排序——rowOrder 存行标识（预设=字段 key，自定义行=行 id），
	// 顺序持久化到 metadata._param_order（按组），展示页按该顺序渲染
	const [rowOrder, setRowOrder] = useState<string[]>([])
	const [dragRowId, setDragRowId] = useState<string | null>(null)
	// 2026-10-17 用户拍板：表格行也支持拖拽排序（插槽/盘位/接口行）——顺序持久化到 metadata._table_row_order（按组）
	const [tableRowOrder, setTableRowOrder] = useState<string[]>([])
	const [dragTableRowId, setDragTableRowId] = useState<string | null>(null)
	const rowIdSeq = useRef(0)
	const nextRowId = () => {
		rowIdSeq.current += 1
		return `row-${rowIdSeq.current}`
	}
	// 2026-10-15 用户报「删除保存后重开还在」：已保存的自定义行删除后要记下键名，保存时清掉
	// metadata 值与 _group_params 登记——否则行只是从当前表单消失，重开弹窗又被恢复出来
	const [removedCustomKeys, setRemovedCustomKeys] = useState<Set<string>>(new Set())
	const [saving, setSaving] = useState(false)
	// 2026-10-20 分组重命名：弹窗内直接改名，不再回卡片右上角操作
	const [displayTitle, setDisplayTitle] = useState(groupTitle)
	const [renameOpen, setRenameOpen] = useState(false)
	const [renameDraft, setRenameDraft] = useState(groupTitle)
	const [renameSaving, setRenameSaving] = useState(false)
	const [internetAddressMode, setInternetAddressMode] = useState<InternetAddressMode>("auto")
	const [internetAddressEnabled, setInternetAddressEnabled] = useState(true)
	const [internetAddressInterval, setInternetAddressInterval] = useState(30)
	const [internetAddressManualIPv4, setInternetAddressManualIPv4] = useState("")
	const [internetAddressManualIPv6, setInternetAddressManualIPv6] = useState("")
	const [internetAddressSaving, setInternetAddressSaving] = useState(false)
	const [internetAddressRefreshing, setInternetAddressRefreshing] = useState(false)

	// 2026-10-12 用户拍板：表格组支持加行与加列——自定义列（列名即参数键，整机共享）与网络扩展接口行
	const [tableCustomColumns, setTableCustomColumns] = useState<string[]>([])
	const [networkExtraCount, setNetworkExtraCount] = useState(0)
	const [formToken, setFormToken] = useState(0)

	// 2026-10-20 服务类分组（宽带线路/套餐/订阅周期等）由类型规格的章节生成，groupId 为 service-N；
	// 这些字段的 registry scope 是 line/dossier/operational，不走 parameter 分类过滤，按章节直接取字段。
	const serviceSectionFields = useMemo(() => {
		if (!groupId.startsWith("service-")) return null
		const index = Number(groupId.slice("service-".length))
		if (!Number.isInteger(index)) return null
		return getAssetFormSections(asset.type)[index]?.fields ?? null
	}, [asset.type, groupId])
	const editableFields = useMemo(() => {
		if (serviceSectionFields) {
			return serviceSectionFields.filter((field) => field.source === "metadata" && !field.readOnly)
		}
		return getAssetFormSections(asset.type)
			.flatMap((section) => section.fields)
			.filter(
				(field) =>
					field.source === "metadata" &&
					!field.readOnly &&
					// groupId 带有 asset-parameter- 前缀，registry 的 category 是裸 id——归一化后再比较；
					// 2026-10-17 用户报「删光参数后散热仍显示」：散热/环境字段（thermal_environment）在计算设备
					// 并入「电源与散热」组展示，弹窗按同一映射收字段（此前弹窗收不到散热字段→无法编辑删除，展示却保留）
					resolveParameterGroupId(getAssetArchiveField(field.key)?.category ?? "", asset.type) === fetchCategoryId &&
					getAssetArchiveField(field.key)?.scope === "parameter"
			)
	}, [asset.type, fetchCategoryId, serviceSectionFields])

	// 打开时重置表单状态
	useEffect(() => {
		if (!open) return
		const values: Record<string, string> = {}
		for (const field of editableFields) {
			const raw = asset.metadata?.[field.key]
			values[field.key] = raw === undefined || raw === null ? "" : String(raw)
		}
		setFieldValues(values)
		// 2026-10-12 用户拍板：预设只是建议——删除的预设字段持久隐藏（_hidden_params 按组），重开弹窗不再出现
		const hiddenByGroup = (asset.metadata?._hidden_params ?? {}) as Record<string, string[]>
		setRemovedFields(new Set(Array.isArray(hiddenByGroup[fetchCategoryId]) ? hiddenByGroup[fetchCategoryId] : []))
		// 2026-10-14 完整识别口径：恢复该组已写入的自定义参数（_group_params 清单、非 registry 字段）为可编辑行——
		// 否则自定义参数（含 Agent 填写写入的）重开弹窗看不到也删不掉
		const groupParamsByGroup = (asset.metadata?._group_params ?? {}) as Record<string, string[]>
		const restoredCustomRows = (
			Array.isArray(groupParamsByGroup[fetchCategoryId]) ? groupParamsByGroup[fetchCategoryId] : []
		)
			// 2026-10-17 用户报「怎么变成英文了」：恢复自定义行时排除预设字段（含其他分组的字段）——
			// 它们由各自分组的字段体系展示与编辑；真正的自定义参数才恢复为行
			.filter((key) => !editableFields.some((field) => field.key === key) && !getAssetArchiveField(key))
			.map((key) => ({
				id: nextRowId(),
				key,
				label: getAssetArchiveField(key)?.label ?? key,
				value: String(asset.metadata?.[key] ?? ""),
			}))
			.filter((row) => row.value !== "")
		setNewParams(restoredCustomRows)
		setDragTableRowId(null)
		const storedTableOrder = (asset.metadata?._table_row_order ?? {}) as Record<string, string[]>
		setTableRowOrder(Array.isArray(storedTableOrder[fetchCategoryId]) ? [...storedTableOrder[fetchCategoryId]] : [])
		// 2026-10-17 用户拍板：行顺序恢复——_param_order 优先（预设字段 key + 自定义行键），
		// 未记录的部分按字段池顺序与自定义行恢复顺序补在后面
		const storedOrderRecord = (asset.metadata?._param_order ?? {}) as Record<string, string[]>
		const savedOrder = Array.isArray(storedOrderRecord[fetchCategoryId]) ? storedOrderRecord[fetchCategoryId] : []
		const hiddenSet = new Set(Array.isArray(hiddenByGroup[fetchCategoryId]) ? hiddenByGroup[fetchCategoryId] : [])
		const presetOrderKeys = editableFields.filter((field) => !hiddenSet.has(field.key)).map((field) => field.key)
		const customIdByKey = new Map(restoredCustomRows.map((row) => [row.key, row.id]))
		const orderedIds: string[] = []
		for (const key of savedOrder) {
			if (presetOrderKeys.includes(key)) orderedIds.push(key)
			else if (customIdByKey.has(key) && !orderedIds.includes(customIdByKey.get(key) as string)) {
				orderedIds.push(customIdByKey.get(key) as string)
			}
		}
		for (const key of presetOrderKeys) if (!orderedIds.includes(key)) orderedIds.push(key)
		for (const row of restoredCustomRows) if (!orderedIds.includes(row.id)) orderedIds.push(row.id)
		setRowOrder(orderedIds)
		setRemovedCustomKeys(new Set())
		// 2026-10-12 网络：第一列接口类型值（有线默认电口、无线默认无线；扩展行读 ext_nicN_port_type）
		if (fetchCategoryId === "network") {
			values.nic_port_type = String(asset.metadata?.nic_port_type ?? "") || "电口"
			values.wifi_port_type = String(asset.metadata?.wifi_port_type ?? "") || "无线"
			// 物理接头类型（固定下拉；非 registry 字段，单独初始化）
			values.nic_connector_type = String(asset.metadata?.nic_connector_type ?? "")
			values.wifi_connector_type = String(asset.metadata?.wifi_connector_type ?? "")
		}
		// 表格组：恢复自定义列（_table_custom_columns）与网络扩展接口行数（_network_ext_nics）
		const storedCustomColumns = (asset.metadata?._table_custom_columns ?? {}) as Record<string, string[]>
		setTableCustomColumns(
			Array.isArray(storedCustomColumns[fetchCategoryId]) ? [...storedCustomColumns[fetchCategoryId]] : []
		)
		setNetworkExtraCount(Math.min(Number(asset.metadata?._network_ext_nics) || 0, 6))
		setFormToken((current) => current + 1)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, asset.id, groupId])

	useEffect(() => {
		setDisplayTitle(groupTitle)
		setRenameDraft(groupTitle)
		setRenameOpen(false)
	}, [groupTitle, groupId, open])

	useEffect(() => {
		if (!open || !isInternetAddressGroup) return
		const settings = getInternetAddressAutoRefreshSettings(asset.metadata ?? {})
		setInternetAddressMode(getInternetAddressMode(asset.metadata ?? {}))
		setInternetAddressEnabled(settings.enabled)
		setInternetAddressInterval(settings.intervalMinutes)
		setInternetAddressManualIPv4(getMetadataString(asset.metadata, "public_ipv4"))
		setInternetAddressManualIPv6(getMetadataString(asset.metadata, "public_ipv6"))
	}, [open, asset.id, asset.metadata, isInternetAddressGroup])

	async function submitRenameGroup() {
		const next = renameDraft.trim()
		if (!next || !onRenameGroup) return
		if (next === displayTitle) {
			setRenameOpen(false)
			return
		}
		setRenameSaving(true)
		try {
			const ok = await onRenameGroup(next)
			if (ok !== false) {
				setDisplayTitle(next)
				setRenameOpen(false)
			}
		} finally {
			setRenameSaving(false)
		}
	}

	async function saveInternetAddressSettings(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		if (readOnly) return
		setInternetAddressSaving(true)
		try {
			const body =
				internetAddressMode === "manual"
					? {
							mode: "manual",
							enabled: false,
							interval_minutes: internetAddressInterval,
							public_ipv4: internetAddressManualIPv4.trim(),
							public_ipv6: internetAddressManualIPv6.trim(),
						}
					: { mode: "auto", enabled: internetAddressEnabled, interval_minutes: internetAddressInterval }
			await pb.send(`/api/pulse/assets/${asset.id}/internet-addresses/settings`, {
				method: "POST",
				body,
			})
			toast({ title: internetAddressMode === "manual" ? "公网地址已保存" : "公网地址设置已保存" })
			onOpenChange(false)
			onSaved()
		} catch (error) {
			console.error("save internet address settings", error)
			const description = (error as { data?: { message?: string } })?.data?.message?.trim() || "请稍后重试。"
			toast({ title: "保存公网地址设置失败", description, variant: "destructive" })
		} finally {
			setInternetAddressSaving(false)
		}
	}

	async function refreshInternetAddressesNow() {
		if (readOnly || internetAddressRefreshing) return
		setInternetAddressRefreshing(true)
		try {
			const result = await pb.send(`/api/pulse/assets/${asset.id}/internet-addresses/refresh`, { method: "POST" })
			toast(getInternetAddressRefreshFeedback(result))
			onSaved()
		} catch (error) {
			console.error("refresh internet public addresses", error)
			toast({ title: "刷新公网地址失败", description: "请检查网络连接或稍后重试。", variant: "destructive" })
		} finally {
			setInternetAddressRefreshing(false)
		}
	}

	// 2026-10-20 服务类分组（订阅周期等）含固定选项字段：下拉选择后写入值，并恢复被删行
	function updatePresetField(key: string, value: string) {
		setFieldValues((current) => ({ ...current, [key]: value }))
		if (value.trim()) {
			setRemovedFields((current) => {
				if (!current.has(key)) return current
				const next = new Set(current)
				next.delete(key)
				return next
			})
		}
	}

	// 2026-10-12 用户拍板：参数列表底部「+ 添加参数」——新增一行手动参数（名称为键）
	function addNewParam() {
		const row: NewParamRow = { id: nextRowId(), key: "", label: "", value: "" }
		setNewParams((current) => [...current, row])
		setRowOrder((current) => [...current, row.id])
	}

	// 2026-10-17 用户拍板：参数行支持拖拽排序（拖拽左侧手柄到目标行位置），顺序随保存持久化
	function moveRowOver(targetId: string) {
		if (!dragRowId || dragRowId === targetId) return
		setRowOrder((current) => {
			const from = current.indexOf(dragRowId)
			const to = current.indexOf(targetId)
			if (from < 0 || to < 0 || from === to) return current
			const next = [...current]
			next.splice(from, 1)
			next.splice(to, 0, dragRowId)
			return next
		})
	}
	function dragHandleProps(rowId: string, label: string) {
		return {
			type: "button" as const,
			draggable: !readOnly && !saving,
			"aria-label": `拖拽排序 ${label}`,
			title: "拖拽调整顺序",
			onDragStart: (event: DragEvent<HTMLButtonElement>) => {
				event.dataTransfer.effectAllowed = "move"
				event.dataTransfer.setData("text/plain", rowId)
				setDragRowId(rowId)
			},
			onDragEnd: () => setDragRowId(null),
			disabled: readOnly || saving,
			className:
				"grid size-6 shrink-0 cursor-grab place-items-center rounded border border-border/70 bg-card text-muted-foreground transition-colors active:cursor-grabbing disabled:opacity-50",
		}
	}

	// 2026-10-12 表格组加行：内存/存储 = 行数控制器 +1（同步生成插槽/盘位行）；网络 = 追加扩展接口行
	function addTableRow() {
		if (fetchCategoryId === "memory") {
			const next = Math.min(Math.max(Number(fieldValues.memory_slots) || 1, 1) + 1, 12)
			setFieldValues((current) => ({ ...current, memory_slots: String(next) }))
			return
		}
		if (fetchCategoryId === "storage") {
			const next = Math.min(Math.max(Number(fieldValues.bay_count) || 1, 1) + 1, 16)
			setFieldValues((current) => ({ ...current, bay_count: String(next) }))
			return
		}
		if (fetchCategoryId === "network") {
			setNetworkExtraCount((current) => Math.min(current + 1, 6))
		}
	}

	// 2026-10-12 表格组加列：新增一个自定义列（列名可编辑，值以列名为参数键整机共享）
	function addTableCustomColumn() {
		setTableCustomColumns((current) => [...current, ""])
	}

	async function save(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const nextMetadata: Record<string, unknown> = { ...(asset.metadata ?? {}) }
		// 预设字段：删除的行清值（留空不显示），其余写入
		for (const field of editableFields) {
			const removed = removedFields.has(field.key)
			const normalized = removed ? "" : (fieldValues[field.key]?.trim() ?? "")
			// 2026-10-17 主频/睿频等数字字段：带单位（3.3 GHz）时提取数值保存，避免 Number() 得 NaN 丢数据
			nextMetadata[field.key] =
				field.type === "number" && normalized ? normalizeNumberFieldValue(normalized) : normalized
		}
		// 2026-10-12 用户拍板：预设只是建议——删除的预设字段记入隐藏清单（_hidden_params 按组），
		// 重开弹窗不再出现；填入值/候选项恢复时自动从清单移除
		const hiddenRecord = { ...((nextMetadata._hidden_params as Record<string, string[]> | undefined) ?? {}) }
		const hiddenKeys = editableFields.filter((field) => removedFields.has(field.key)).map((field) => field.key)
		if (hiddenKeys.length > 0) hiddenRecord[fetchCategoryId] = hiddenKeys
		else delete hiddenRecord[fetchCategoryId]
		nextMetadata._hidden_params = hiddenRecord
		// 新增参数：写入 metadata 并登记到该组的自定义参数清单（_group_params）
		const existingGroups = (nextMetadata._group_params ?? {}) as Record<string, string[]>
		// 2026-10-17 清单清洗：预设字段（含其他分组的字段）不算自定义参数，历史误登记项在保存时移除
		const groupParams = new Set<string>(
			(Array.isArray(existingGroups[fetchCategoryId]) ? existingGroups[fetchCategoryId] : []).filter(
				(key) => !getAssetArchiveField(key)
			)
		)
		for (const row of newParams) {
			// 2026-10-12 手动新增行（key 为空）：以名称为键写入；名称为空的行跳过
			const rowKey = row.key || row.label.trim()
			if (!rowKey) continue
			const normalized = row.value.trim()
			if (normalized) {
				nextMetadata[rowKey] = normalized
				groupParams.add(rowKey)
			} else if (row.key) {
				delete nextMetadata[rowKey]
				groupParams.delete(rowKey)
			}
		}
		// 2026-10-15 用户报「删除保存后重开还在」：本轮删除的已保存自定义行——清 metadata 值与清单登记
		for (const removedKey of removedCustomKeys) {
			delete nextMetadata[removedKey]
			groupParams.delete(removedKey)
		}
		// 2026-10-12 表格组：自定义列值（列名作为参数键）与网络扩展接口行写入
		if (isTableGroup) {
			for (const columnName of tableCustomColumns) {
				const name = columnName.trim()
				if (!name) continue
				const normalized = (fieldValues[name] ?? "").trim()
				if (normalized) {
					nextMetadata[name] = normalized
					groupParams.add(name)
				} else {
					delete nextMetadata[name]
					groupParams.delete(name)
				}
			}
			const customColumnsRecord = {
				...((nextMetadata._table_custom_columns as Record<string, string[]> | undefined) ?? {}),
			}
			const keptColumns = tableCustomColumns.map((name) => name.trim()).filter(Boolean)
			if (keptColumns.length > 0) customColumnsRecord[fetchCategoryId] = keptColumns
			else delete customColumnsRecord[fetchCategoryId]
			nextMetadata._table_custom_columns = customColumnsRecord
			if (fetchCategoryId === "network") {
				// 2026-10-12 用户拍板：第一列接口类型（有线默认电口、无线默认无线；扩展行按所选）
				const typeDefaults: [string, string][] = [
					["nic_port_type", "电口"],
					["wifi_port_type", "无线"],
				]
				for (const [typeKey, fallback] of typeDefaults) {
					const normalized = (fieldValues[typeKey] ?? "").trim()
					nextMetadata[typeKey] = normalized || fallback
				}
				// 物理接头类型（固定下拉；未选则不写）
				for (const connectorKey of ["nic_connector_type", "wifi_connector_type"]) {
					const normalized = (fieldValues[connectorKey] ?? "").trim()
					if (normalized) nextMetadata[connectorKey] = normalized
					else delete nextMetadata[connectorKey]
				}
				nextMetadata._network_ext_nics = networkExtraCount
				for (let n = 1; n <= networkExtraCount; n++) {
					for (const kind of ["vendor", "model", "connector_type", "speed", "standard"]) {
						const key = `ext_nic${n}_${kind}`
						const normalized = (fieldValues[key] ?? "").trim()
						if (normalized) nextMetadata[key] = normalized
						else delete nextMetadata[key]
					}
					for (let ci = 0; ci < tableCustomColumns.length; ci++) {
						const name = tableCustomColumns[ci].trim()
						const key = `ext_nic${n}_${name || `col${ci}`}`
						const normalized = (fieldValues[key] ?? "").trim()
						if (normalized) nextMetadata[key] = normalized
						else delete nextMetadata[key]
					}
				}
			}
		}
		const groupParamsRecord = {
			...(nextMetadata._group_params as Record<string, string[]> | undefined),
			[fetchCategoryId]: [...groupParams],
		}
		nextMetadata._group_params = groupParamsRecord
		// 2026-10-17 用户拍板：自定义排序持久化（按组记录行键顺序，展示页按此顺序渲染）
		if (!isTableGroup) {
			const orderRecord = { ...((nextMetadata._param_order as Record<string, string[]> | undefined) ?? {}) }
			const orderedKeys = rowOrder
				.map((rowId) => {
					const field = visibleFields.find((item) => item.key === rowId)
					if (field) return field.key
					const row = newParams.find((item) => item.id === rowId)
					if (!row) return ""
					return row.key || row.label.trim()
				})
				.filter(Boolean)
			if (orderedKeys.length > 0) orderRecord[fetchCategoryId] = orderedKeys
			else delete orderRecord[fetchCategoryId]
			nextMetadata._param_order = orderRecord
		}
		// 2026-10-17 用户拍板：表格行拖拽顺序持久化（插槽/盘位/接口行按组记录）
		if (isTableGroup) {
			const tableOrderRecord = {
				...((nextMetadata._table_row_order as Record<string, string[]> | undefined) ?? {}),
			}
			const orderedTableIds = orderedTableRowDescriptors.map((descriptor) => descriptor.id)
			if (orderedTableIds.length > 0) tableOrderRecord[fetchCategoryId] = orderedTableIds
			else delete tableOrderRecord[fetchCategoryId]
			nextMetadata._table_row_order = tableOrderRecord
		}

		setSaving(true)
		try {
			await pb.collection("assets").update(asset.id, { metadata: nextMetadata })
			onOpenChange(false)
			onSaved()
		} catch (error) {
			console.error("save asset parameter group", error)
		} finally {
			setSaving(false)
		}
	}

	const visibleFields = editableFields.filter((field) => !removedFields.has(field.key))
	// 2026-10-17 用户拍板：非表格组行列表按自定义顺序渲染（预设字段行 + 自定义行）
	const rowEntries = rowOrder.flatMap<RowEntry>((rowId): RowEntry[] => {
		const field = visibleFields.find((item) => item.key === rowId)
		if (field) return [{ kind: "preset" as const, id: rowId, field }]
		const row = newParams.find((item) => item.id === rowId)
		if (row) return [{ kind: "custom" as const, id: rowId, row }]
		return []
	})

	// 2026-10-12 用户拍板：表格组（网络/内存/存储）的上块 = 展示页同款横向表格，单元格可直接填写——
	// 列 = 字段（官方列 ‖ 实际列，与展示页表头对齐），行 = 插槽/盘位/接口；板级参数整机共享，
	// 编辑任一行的同一列即更新同一字段（所有行同步显示）。
	const tableColumnKeysByGroup: Record<string, string[]> = {
		// 2026-10-17 用户拍板：内存表格只放实际安装列；规范参数（类型/频率/形态/最大容量/通道数/可扩展）在上方单独编辑
		memory: ["memory_type", "memory_gb", "memory_speed_mhz", "memory_vendor", "memory_detail"],
		storage: ["storage_vendor", "storage_model", "storage_gb", "storage_media"],
		network: ["nic_vendor", "nic_model", "nic_connector_type", "primary_nic_speed_mbps", "wifi_standard", ""],
	}
	const tableHeadersByGroup: Record<string, string[]> = {
		memory: ["", "内存类型", "容量", "频率", "品牌", "规格"],
		// 2026-10-14 用户拍板：存储只做实际安装的硬盘（无支持侧列）
		storage: ["", "品牌", "型号", "容量", "硬盘类型"],
		network: ["", "品牌", "型号", "接口类型", "速率", "标准", "连接的设备"],
	}
	// 官方/实际（接口属性/连接设备）分割点 = cells 索引（该列前加分割线，与展示页一致）；存储无分割（只有实际安装）
	// 2026-10-17：内存表格只剩实际安装列，不再有官方/实际分割；网络保留「网口属性｜实际接入」
	const tableSplitAtByGroup: Record<string, number> = { network: 5 }
	// 2026-10-14 用户拍板：表头分组行——左半/右半分组标题（与展示页一致）；存储/内存无分组表头
	const tableGroupLabelsByGroup: Record<string, [string, string]> = {
		network: ["网口属性", "实际接入"],
	}
	// 2026-10-17 用户拍板：表格行拖拽排序——行标识（内存 slot-N / 存储 bay-N / 网络 wired、wifi、ext-N），
	// 按 _table_row_order 渲染并支持拖拽重排
	const tableRowDescriptors = useMemo<TableRowDescriptor[]>(() => {
		if (!isTableGroup) return []
		if (fetchCategoryId === "memory") {
			const slots = Math.min(Math.max(Number(fieldValues.memory_slots) || 1, 1), 8)
			return Array.from({ length: slots }, (_, index) => ({
				id: `slot-${index + 1}`,
				kind: "slot" as const,
				label: `插槽 ${index + 1}`,
				rowNo: index + 1,
			}))
		}
		if (fetchCategoryId === "storage") {
			const bays = Math.min(Math.max(Number(fieldValues.bay_count) || 1, 1), 12)
			return Array.from({ length: bays }, (_, index) => ({
				id: `bay-${index + 1}`,
				kind: "bay" as const,
				label: `盘位 ${index + 1}`,
				rowNo: index + 1,
			}))
		}
		if (fetchCategoryId === "network") {
			return [
				{ id: "wired", kind: "wired" as const, label: "有线网卡", rowNo: 0 },
				{ id: "wifi", kind: "wifi" as const, label: "无线网卡", rowNo: 0 },
				...Array.from({ length: networkExtraCount }, (_, index) => ({
					id: `ext-${index + 1}`,
					kind: "ext" as const,
					label: `扩展接口 ${index + 1}`,
					rowNo: index + 1,
				})),
			]
		}
		return []
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isTableGroup, fetchCategoryId, fieldValues.memory_slots, fieldValues.bay_count, networkExtraCount])
	const orderedTableRowDescriptors = useMemo(() => {
		const byId = new Map(tableRowDescriptors.map((descriptor) => [descriptor.id, descriptor]))
		const ordered: TableRowDescriptor[] = []
		for (const id of tableRowOrder) {
			const descriptor = byId.get(id)
			if (!descriptor) continue
			ordered.push(descriptor)
			byId.delete(id)
		}
		for (const descriptor of tableRowDescriptors) {
			if (byId.has(descriptor.id)) ordered.push(descriptor)
		}
		return ordered
	}, [tableRowDescriptors, tableRowOrder])
	function moveTableRowOver(targetId: string) {
		if (!dragTableRowId || dragTableRowId === targetId) return
		const currentIds = orderedTableRowDescriptors.map((descriptor) => descriptor.id)
		const from = currentIds.indexOf(dragTableRowId)
		const to = currentIds.indexOf(targetId)
		if (from < 0 || to < 0 || from === to) return
		const next = [...currentIds]
		next.splice(from, 1)
		next.splice(to, 0, dragTableRowId)
		setTableRowOrder(next)
	}
	function tableDragHandleProps(rowId: string, label: string) {
		return {
			type: "button" as const,
			draggable: !readOnly && !saving,
			"aria-label": `拖拽排序 ${label}`,
			title: "拖拽调整顺序",
			onDragStart: (event: DragEvent<HTMLButtonElement>) => {
				event.dataTransfer.effectAllowed = "move"
				event.dataTransfer.setData("text/plain", rowId)
				setDragTableRowId(rowId)
			},
			onDragEnd: () => setDragTableRowId(null),
			disabled: readOnly || saving,
			className:
				"grid size-6 shrink-0 cursor-grab place-items-center rounded border border-border/70 bg-card text-muted-foreground transition-colors active:cursor-grabbing disabled:opacity-50",
		}
	}
	// 网络两行用不同字段：有线行 / 无线行 各一套列字段（末列连接设备为只读展示，编辑弹窗内无数据源）
	// 2026-10-12 用户拍板：网络表格第一列统一为接口类型下拉（电口/光口/无线/蓝牙）；
	// 第一列后新增「接口类型」列（物理接头，固定下拉）与「速率」「标准」拆分列（速率为固定下拉，值存 mbps）
	const networkPortTypes = ["电口", "光口", "无线", "蓝牙"]
	const networkConnectorTypes = [
		"RJ45（8P8C）",
		"SFP",
		"SFP+",
		"SFP28",
		"QSFP+",
		"QSFP28",
		"内置天线",
		"外置天线",
		"USB",
		"其他",
	]
	const networkRowTypeKeys: Record<string, string> = {
		有线网卡: "nic_port_type",
		无线网卡: "wifi_port_type",
	}
	const networkRowColumnKeys: Record<string, string[]> = {
		有线网卡: ["nic_vendor", "nic_model", "nic_connector_type", "primary_nic_speed_mbps", "", ""],
		无线网卡: ["wifi_vendor", "wifi_model", "wifi_connector_type", "", "wifi_standard", ""],
	}
	const tableColumnKeys = tableColumnKeysByGroup[fetchCategoryId] ?? []
	// 行数控制器字段（插槽数）：决定表格初始行数
	const tableControllerKeys =
		fetchCategoryId === "memory" ? ["memory_slots"] : fetchCategoryId === "storage" ? ["bay_count"] : []
	// 2026-10-17 用户拍板：内存/存储的规范参数在表格上方单独编辑（存储按定稿字段集，内存为表格列之外的全部支持字段）
	const storageSpecFieldKeys = [
		"storage_supported_types",
		"storage_interface",
		"storage_protocol",
		"storage_max_capacity_per_bay",
	]
	// 2026-10-17 用户拍板：网络规范参数中的 Wi-Fi 速率/蓝牙版本在表格上方单独编辑（其余在表格单元格）
	const networkSpecFieldKeys = ["wifi_speed_mbps", "bluetooth_version"]
	const specGridFields =
		isTableGroup && (fetchCategoryId === "memory" || fetchCategoryId === "storage" || fetchCategoryId === "network")
			? editableFields
					.filter((field) => {
						if (tableColumnKeys.includes(field.key) || tableControllerKeys.includes(field.key)) return false
						if (fetchCategoryId === "storage") return storageSpecFieldKeys.includes(field.key)
						if (fetchCategoryId === "network") return networkSpecFieldKeys.includes(field.key)
						return true
					})
					.sort(
						(left, right) =>
							(getAssetArchiveField(left.key)?.order ?? 0) - (getAssetArchiveField(right.key)?.order ?? 0)
					)
			: []

	// 单元格 → 字段 key（网络按行取字段集）
	const columnKeyForRow = (rowLabel: string, columnIndex: number) => {
		if (fetchCategoryId === "network") {
			return networkRowColumnKeys[rowLabel]?.[columnIndex] ?? ""
		}
		return tableColumnKeys[columnIndex] ?? ""
	}

	// 2026-10-20 动态公网地址是系统分组：只给自动更新开关、间隔和立即刷新，地址/检测结果只读，
	// 不提供添加参数、删行、改名或删除分组。
	if (isInternetAddressGroup) {
		const ipv4 = getMetadataString(asset.metadata, "public_ipv4")
		const ipv6 = getMetadataString(asset.metadata, "public_ipv6")
		const ipv4Error = getMetadataString(asset.metadata, "public_ipv4_error")
		const ipv6Error = getMetadataString(asset.metadata, "public_ipv6_error")
		const checkedAt = getMetadataString(asset.metadata, "public_ip_checked_at")
		const nextCheckAt = getMetadataString(asset.metadata, "public_ip_next_check_at")
		const savedSettings = getInternetAddressAutoRefreshSettings(asset.metadata ?? {})
		const detectionErrors = [
			ipv4Error ? `IPv4：${ipv4Error}${ipv4 ? "（保留上次结果）" : ""}` : "",
			ipv6Error ? `IPv6：${ipv6Error}${ipv6 ? "（保留上次结果）" : ""}` : "",
		].filter(Boolean)
		return (
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className="max-h-[88dvh] w-full max-w-2xl overflow-y-auto sm:p-5">
					<form onSubmit={saveInternetAddressSettings} className="grid gap-3">
						<DialogHeader className="gap-1 border-b border-border/70 pb-3">
							<DialogTitle>公网地址设置</DialogTitle>
						</DialogHeader>
						<section className="grid gap-3 rounded-md border border-border/70 bg-card p-3">
							<div className="flex items-center justify-between gap-3 text-sm">
								<span className="font-medium text-foreground">地址模式</span>
								<select
									value={internetAddressMode}
									onChange={(event) => setInternetAddressMode(event.target.value as InternetAddressMode)}
									disabled={readOnly || internetAddressSaving}
									className="h-8 w-40 rounded-md border border-input bg-card px-2 text-sm"
								>
									<option value="auto">自动检测</option>
									<option value="manual">手动填写</option>
								</select>
							</div>
							{internetAddressMode === "manual" ? (
								<>
									<div className="grid gap-2">
										<span className="text-sm text-foreground">公网 IPv4</span>
										<Input
											value={internetAddressManualIPv4}
											onChange={(event) => setInternetAddressManualIPv4(event.target.value)}
											placeholder="例如 203.0.113.11"
											disabled={readOnly || internetAddressSaving}
											className="h-8"
										/>
									</div>
									<div className="grid gap-2">
										<span className="text-sm text-foreground">公网 IPv6</span>
										<Input
											value={internetAddressManualIPv6}
											onChange={(event) => setInternetAddressManualIPv6(event.target.value)}
											placeholder="例如 2408:8207:..."
											disabled={readOnly || internetAddressSaving}
											className="h-8"
										/>
									</div>
								</>
							) : (
								<>
									<div className="flex items-center justify-between gap-3 text-sm">
										<span className="text-foreground">自动更新公网地址</span>
										<Switch
											aria-label="自动更新公网地址"
											checked={internetAddressEnabled}
											onCheckedChange={setInternetAddressEnabled}
											disabled={readOnly || internetAddressSaving}
										/>
									</div>
									<div className="flex items-center justify-between gap-3 text-sm">
										<span className="text-foreground">更新时间间隔</span>
										<select
											value={String(internetAddressInterval)}
											onChange={(event) => setInternetAddressInterval(Number(event.target.value))}
											disabled={readOnly || internetAddressSaving || !internetAddressEnabled}
											className="h-8 w-32 rounded-md border border-input bg-card px-2 text-sm"
										>
											{internetAddressRefreshIntervalOptions.map((option) => (
												<option key={option.value} value={String(option.value)}>
													{option.label}
												</option>
											))}
										</select>
									</div>
									<div className="flex justify-end">
										<Button
											type="button"
											variant="outline"
											size="sm"
											className="h-8 gap-1.5"
											onClick={refreshInternetAddressesNow}
											disabled={readOnly || internetAddressRefreshing || internetAddressSaving}
										>
											<RefreshCwIcon className={internetAddressRefreshing ? "size-3.5 animate-spin" : "size-3.5"} />
											{internetAddressRefreshing ? "刷新中" : "立即刷新"}
										</Button>
									</div>
								</>
							)}
						</section>
						{internetAddressMode === "auto" ? (
							<section className="grid gap-1.5 rounded-md border border-border/70 bg-card p-3">
								<div className="text-sm font-semibold text-foreground">当前地址</div>
								<div className="flex min-h-7 items-center justify-between gap-3 border-b border-border/30 py-0.5">
									<span className="text-xs text-muted-foreground">公网 IPv4</span>
									<span className="min-w-0 truncate text-right font-mono text-[13px] text-foreground">
										{ipv4 || "尚未获取"}
									</span>
								</div>
								<div className="flex min-h-7 items-center justify-between gap-3 border-b border-border/30 py-0.5">
									<span className="text-xs text-muted-foreground">公网 IPv6</span>
									<span className="min-w-0 truncate text-right font-mono text-[13px] text-foreground">
										{ipv6 || "尚未获取"}
									</span>
								</div>
								{detectionErrors.length > 0 ? (
									<div className="flex min-h-7 items-start justify-between gap-3 border-b border-border/30 py-0.5">
										<span className="shrink-0 text-xs text-muted-foreground">检测状态</span>
										<span className="min-w-0 text-right text-[13px] text-foreground">{detectionErrors.join("；")}</span>
									</div>
								) : null}
								<div className="flex min-h-7 items-center justify-between gap-3 border-b border-border/30 py-0.5">
									<span className="text-xs text-muted-foreground">上次更新时间</span>
									<span className="text-right text-[13px] text-foreground">
										{formatInternetAddressTimestamp(checkedAt)}
									</span>
								</div>
								<div className="flex min-h-7 items-center justify-between gap-3 py-0.5">
									<span className="text-xs text-muted-foreground">下次更新时间</span>
									<span className="text-right text-[13px] text-foreground">
										{nextCheckAt
											? formatInternetAddressTimestamp(nextCheckAt)
											: savedSettings.enabled
												? "等待首次更新"
												: "自动更新已关闭"}
									</span>
								</div>
							</section>
						) : (
							<section className="grid gap-1.5 rounded-md border border-border/70 bg-card p-3">
								<div className="flex min-h-7 items-center justify-between gap-3 text-sm">
									<span className="text-xs text-muted-foreground">上次维护时间</span>
									<span className="text-right text-[13px] text-foreground">
										{formatInternetAddressTimestamp(checkedAt)}
									</span>
								</div>
							</section>
						)}
						<DialogFooter className="border-t border-border/70 pt-3">
							<Button
								type="button"
								variant="outline"
								onClick={() => onOpenChange(false)}
								disabled={internetAddressSaving}
							>
								取消
							</Button>
							<Button type="submit" disabled={readOnly || internetAddressSaving}>
								{internetAddressSaving ? "保存中" : "保存设置"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			{/* 2026-10-20 用户拍板：分组弹窗不需要整屏那么宽——收到 768px（max-w-3xl），表格组仍保留横向空间 */}
			<DialogContent className="max-h-[88dvh] w-full max-w-3xl overflow-y-auto sm:p-5">
				<form key={`${asset.id}-${groupId}-${formToken}`} onSubmit={save} className="grid gap-3">
					<DialogHeader className="gap-2 border-b border-border/70 pb-3">
						<div className="flex flex-wrap items-start justify-between gap-2 pe-14">
							<DialogTitle>编辑「{displayTitle}」参数</DialogTitle>
							{onRenameGroup ? (
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="h-7 min-h-7 gap-1 px-2 text-[11px]"
									onClick={() => {
										setRenameDraft(displayTitle)
										setRenameOpen(true)
									}}
									disabled={saving || renameSaving}
								>
									<TextCursorInputIcon className="size-3" />
									重命名
								</Button>
							) : null}
						</div>
						{renameOpen ? (
							<div className="flex flex-wrap items-center gap-2">
								<Input
									value={renameDraft}
									onChange={(event) => setRenameDraft(event.target.value)}
									onKeyDown={(event) => {
										if (event.key === "Enter") {
											event.preventDefault()
											submitRenameGroup()
										}
									}}
									placeholder="分组名称"
									autoFocus
									disabled={renameSaving}
									className="h-8 w-56"
								/>
								<Button
									type="button"
									size="sm"
									className="h-8"
									onClick={submitRenameGroup}
									disabled={renameSaving || !renameDraft.trim()}
								>
									{renameSaving ? "保存中" : "保存名称"}
								</Button>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="h-8"
									onClick={() => setRenameOpen(false)}
									disabled={renameSaving}
								>
									取消
								</Button>
							</div>
						) : null}
					</DialogHeader>
					<div className="grid gap-3">
						{isTableGroup ? (
							// 表格组（网络/内存/存储）：按小分类的可填写表格，与卡片展示同构
							<section className="grid content-start gap-2 rounded-md border border-border/70 bg-card p-2.5">
								<div className="text-sm font-semibold text-foreground">{displayTitle} · 参数</div>
								<div className="grid gap-2">
									{tableControllerKeys.map((key) => {
										const field = editableFields.find((item) => item.key === key)
										if (!field) return null
										return (
											<div key={key} className="flex items-center gap-2 text-xs">
												<span className="text-muted-foreground">{field.label}</span>
												<Input
													name={key}
													value={fieldValues[key] ?? ""}
													placeholder="例如 2"
													onChange={(event) => setFieldValues((current) => ({ ...current, [key]: event.target.value }))}
													disabled={readOnly || saving}
													className="h-7 w-20 text-xs"
												/>
												<span className="text-[11px] text-muted-foreground">（表格行数按此生成）</span>
											</div>
										)
									})}
									{/* 2026-10-17 用户拍板：内存/存储规范参数单独编辑，表格只放实际安装列 */}
									{/* 2026-10-20 用户拍板：规范参数格子列数与卡片展示一致（2/3/4 列） */}
									{specGridFields.length > 0 ? (
										<div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-4">
											{specGridFields.map((field) => {
												const update = (value: string) => {
													setFieldValues((current) => ({ ...current, [field.key]: value }))
													if (value.trim()) {
														setRemovedFields((current) => {
															if (!current.has(field.key)) return current
															const next = new Set(current)
															next.delete(field.key)
															return next
														})
													}
												}
												return (
													<div
														key={field.key}
														className="grid min-w-0 content-start gap-1 rounded-md border border-border/70 bg-surface-soft px-2 py-1"
													>
														<span className="truncate text-[10px] text-muted-foreground" title={field.label}>
															{field.label}
														</span>
														{field.type === "select" ? (
															<select
																value={fieldValues[field.key] ?? ""}
																onChange={(event) => update(event.target.value)}
																disabled={readOnly || saving}
																className="h-7 w-full rounded-md border border-input bg-card px-1.5 text-xs text-foreground"
															>
																<option value="">未设置</option>
																{field.options?.map((option) => (
																	<option key={option.value} value={option.value}>
																		{option.label}
																	</option>
																))}
															</select>
														) : (
															<Input
																name={field.key}
																value={fieldValues[field.key] ?? ""}
																placeholder="未填写"
																onChange={(event) => update(event.target.value)}
																disabled={readOnly || saving}
																className="h-7 w-full text-xs"
															/>
														)}
													</div>
												)
											})}
										</div>
									) : null}
									<div className="overflow-x-auto rounded-md border border-border/70">
										<table className="w-full border-collapse text-xs">
											<thead>
												{tableGroupLabelsByGroup[fetchCategoryId] ? (
													<tr className="bg-surface-soft text-left text-[11px] font-semibold text-muted-foreground">
														<th colSpan={(tableSplitAtByGroup[fetchCategoryId] ?? -1) + 1} className="px-2 pb-1">
															{tableGroupLabelsByGroup[fetchCategoryId][0]}
														</th>
														<th
															colSpan={
																(tableHeadersByGroup[fetchCategoryId] ?? []).length +
																tableCustomColumns.length -
																(tableSplitAtByGroup[fetchCategoryId] ?? -1) -
																1
															}
															className="border-l-2 border-muted-foreground/40 px-2 pb-1 ps-3"
														>
															{tableGroupLabelsByGroup[fetchCategoryId][1]}
														</th>
													</tr>
												) : null}
												<tr className="bg-surface-soft text-left text-[11px] text-muted-foreground">
													{(tableHeadersByGroup[fetchCategoryId] ?? []).map((header, headerIndex) => (
														<th
															key={`th-${headerIndex}`}
															className={cn(
																"px-2 py-1 font-semibold",
																headerIndex > 0 &&
																	headerIndex === (tableSplitAtByGroup[fetchCategoryId] ?? -1) + 1 &&
																	"border-l-2 border-muted-foreground/40 ps-3"
															)}
														>
															{header || " "}
														</th>
													))}
													{tableCustomColumns.map((columnName, customIndex) => (
														<th key={`custom-th-${customIndex}`} className="px-1.5 py-1 font-semibold">
															<Input
																value={columnName}
																placeholder="列名"
																onChange={(event) =>
																	setTableCustomColumns((current) =>
																		current.map((item, i) => (i === customIndex ? event.target.value : item))
																	)
																}
																disabled={readOnly || saving}
																className="h-6 w-24 text-[11px]"
															/>
														</th>
													))}
												</tr>
											</thead>
											<tbody>
												{orderedTableRowDescriptors.map((descriptor) => {
													const isNetworkRow = descriptor.kind === "wired" || descriptor.kind === "wifi"
													const isExtRow = descriptor.kind === "ext"
													const rowNo = descriptor.rowNo ?? 0
													return (
														<tr
															key={descriptor.id}
															onDragOver={() => moveTableRowOver(descriptor.id)}
															className={cn(
																"border-t border-border/70",
																dragTableRowId === descriptor.id && "opacity-60"
															)}
														>
															<td className="px-1 py-1">
																<div className="flex items-center gap-1">
																	<button {...tableDragHandleProps(descriptor.id, descriptor.label)}>
																		<GripVerticalIcon className="size-3.5" />
																	</button>
																	{isNetworkRow ? (
																		<select
																			name={networkRowTypeKeys[descriptor.label] ?? "port_type"}
																			value={fieldValues[networkRowTypeKeys[descriptor.label] ?? ""] ?? ""}
																			onChange={(event) =>
																				setFieldValues((current) => ({
																					...current,
																					[networkRowTypeKeys[descriptor.label] ?? ""]: event.target.value,
																				}))
																			}
																			disabled={readOnly || saving}
																			className="h-7 w-full min-w-16 rounded-md border border-input bg-card px-1.5 text-xs text-foreground"
																		>
																			{networkPortTypes.map((portType) => (
																				<option key={portType} value={portType}>
																					{portType}
																				</option>
																			))}
																		</select>
																	) : isExtRow ? (
																		<select
																			name={`ext_nic${rowNo}_port_type`}
																			value={fieldValues[`ext_nic${rowNo}_port_type`] ?? ""}
																			onChange={(event) =>
																				setFieldValues((current) => ({
																					...current,
																					[`ext_nic${rowNo}_port_type`]: event.target.value,
																				}))
																			}
																			disabled={readOnly || saving}
																			className="h-7 w-full min-w-16 rounded-md border border-input bg-card px-1.5 text-xs text-foreground"
																		>
																			<option value="">选择类型</option>
																			{networkPortTypes.map((portType) => (
																				<option key={portType} value={portType}>
																					{portType}
																				</option>
																			))}
																		</select>
																	) : (
																		<span className="whitespace-nowrap font-medium text-foreground">
																			{descriptor.label}
																		</span>
																	)}
																</div>
															</td>
															{isExtRow
																? ["vendor", "model", "connector_type", "speed", "standard"].map((kind) => {
																		const extKey = `ext_nic${rowNo}_${kind}`
																		const isConnector = kind === "connector_type"
																		return (
																			<td key={extKey} className="px-1.5 py-1">
																				{isConnector ? (
																					<select
																						name={extKey}
																						value={fieldValues[extKey] ?? ""}
																						onChange={(event) =>
																							setFieldValues((current) => ({
																								...current,
																								[extKey]: event.target.value,
																							}))
																						}
																						disabled={readOnly || saving}
																						className="h-7 w-full min-w-16 rounded-md border border-input bg-card px-1.5 text-xs text-foreground"
																					>
																						<option value="">选择</option>
																						{networkConnectorTypes.map((connector) => (
																							<option key={connector} value={connector}>
																								{connector}
																							</option>
																						))}
																					</select>
																				) : (
																					<Input
																						name={extKey}
																						value={fieldValues[extKey] ?? ""}
																						placeholder="未填写"
																						onChange={(event) =>
																							setFieldValues((current) => ({
																								...current,
																								[extKey]: event.target.value,
																							}))
																						}
																						disabled={readOnly || saving}
																						className="h-7 w-full min-w-16 text-xs"
																					/>
																				)}
																			</td>
																		)
																	})
																: (tableHeadersByGroup[fetchCategoryId] ?? []).slice(1).map((_, columnIndex) => {
																		const key = columnKeyForRow(descriptor.label, columnIndex)
																		// 连接头类型为非 registry 字段（固定下拉），不算缺失
																		const fieldMissing =
																			!key ||
																			(key.indexOf("_connector_type") < 0 &&
																				!editableFields.some((field) => field.key === key))
																		return (
																			<td
																				key={`${descriptor.id}-${columnIndex}`}
																				className={cn(
																					"px-1.5 py-1",
																					columnIndex === tableSplitAtByGroup[fetchCategoryId] &&
																						"border-l-2 border-muted-foreground/40 ps-3"
																				)}
																			>
																				{fieldMissing ? (
																					<span className="px-0.5 text-muted-foreground">—</span>
																				) : key.indexOf("_connector_type") >= 0 ? (
																					<select
																						name={`${descriptor.label}-${key}`}
																						value={fieldValues[key] ?? ""}
																						onChange={(event) => {
																							const value = event.target.value
																							const targetKey = key
																							setFieldValues((current) => ({ ...current, [targetKey]: value }))
																						}}
																						disabled={readOnly || saving}
																						className="h-7 w-full min-w-16 rounded-md border border-input bg-card px-1.5 text-xs text-foreground"
																					>
																						<option value="">选择</option>
																						{networkConnectorTypes.map((connector) => (
																							<option key={connector} value={connector}>
																								{connector}
																							</option>
																						))}
																					</select>
																				) : (
																					<Input
																						name={`${descriptor.label}-${key}`}
																						value={fieldValues[key] ?? ""}
																						placeholder="未填写"
																						onChange={(event) => {
																							const value = event.target.value
																							const targetKey = key
																							setFieldValues((current) => ({ ...current, [targetKey]: value }))
																							if (value.trim()) {
																								setRemovedFields((current) => {
																									if (!current.has(targetKey)) return current
																									const next = new Set(current)
																									next.delete(targetKey)
																									return next
																								})
																							}
																						}}
																						disabled={readOnly || saving}
																						className="h-7 w-full min-w-16 text-xs"
																					/>
																				)}
																			</td>
																		)
																	})}
															{isExtRow ? (
																<td className="border-l-2 border-muted-foreground/40 px-1.5 py-1 ps-3">
																	<span className="px-0.5 text-muted-foreground">—</span>
																</td>
															) : null}
															{tableCustomColumns.map((columnName, customIndex) => {
																const name = columnName.trim()
																const customKey = isExtRow ? `ext_nic${rowNo}_${name || `col${customIndex}`}` : name
																return (
																	<td key={`${descriptor.id}-custom-${customIndex}`} className="px-1.5 py-1">
																		{name ? (
																			<Input
																				name={isExtRow ? customKey : `${descriptor.label}-${name}`}
																				value={fieldValues[customKey] ?? ""}
																				placeholder="未填写"
																				onChange={(event) =>
																					setFieldValues((current) => ({
																						...current,
																						[customKey]: event.target.value,
																					}))
																				}
																				disabled={readOnly || saving}
																				className="h-7 w-full min-w-16 text-xs"
																			/>
																		) : (
																			<span className="px-0.5 text-muted-foreground">—</span>
																		)}
																	</td>
																)
															})}
														</tr>
													)
												})}
											</tbody>
										</table>
									</div>
									<div className="flex flex-wrap items-center gap-1.5">
										<button
											type="button"
											onClick={addTableRow}
											disabled={readOnly || saving}
											className="inline-flex h-7 w-fit items-center gap-1 rounded-md border border-dashed border-border px-2 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-50"
										>
											<PlusIcon className="size-3" />
											{fetchCategoryId === "memory"
												? "添加插槽"
												: fetchCategoryId === "storage"
													? "添加盘位"
													: "添加接口"}
										</button>
										<button
											type="button"
											onClick={addTableCustomColumn}
											disabled={readOnly || saving}
											className="inline-flex h-7 w-fit items-center gap-1 rounded-md border border-dashed border-border px-2 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-50"
										>
											<PlusIcon className="size-3" />
											添加列
										</button>
									</div>
									{/* 2026-10-17 用户拍板：表格组也支持「自定义参数」行——粘贴时对不上表格字段的参数写在这里，
									    可见、可编辑、可删除（保存登记到该组自定义参数清单） */}
									{newParams.length > 0 ? (
										<div className="grid gap-1.5">
											{newParams.map((row) => (
												<div
													key={row.id}
													className="grid min-h-8 grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] items-center gap-1.5 rounded-md border border-border/70 bg-surface-soft px-2 py-1"
												>
													{row.key ? (
														<span className="min-w-0 truncate text-xs text-muted-foreground" title={row.label}>
															{row.label}
														</span>
													) : (
														<Input
															value={row.label}
															placeholder="参数名称"
															onChange={(event) =>
																setNewParams((current) =>
																	current.map((item) =>
																		item.id === row.id ? { ...item, label: event.target.value } : item
																	)
																)
															}
															disabled={readOnly || saving}
															className="h-7 w-full text-xs"
														/>
													)}
													<Input
														value={row.value}
														placeholder="未填写"
														onChange={(event) =>
															setNewParams((current) =>
																current.map((item) =>
																	item.id === row.id ? { ...item, value: event.target.value } : item
																)
															)
														}
														disabled={readOnly || saving}
														className="h-7 w-full text-xs"
													/>
													<button
														type="button"
														aria-label={`删除 ${row.label || "新参数"}`}
														title={row.key ? "删除这一行（保存后该参数不再显示）" : "删除这一行"}
														onClick={() => {
															if (row.key) {
																setRemovedCustomKeys((current) => new Set(current).add(row.key))
															}
															setNewParams((current) => current.filter((item) => item.id !== row.id))
															setRowOrder((current) => current.filter((id) => id !== row.id))
														}}
														disabled={readOnly || saving}
														className="grid size-6 shrink-0 place-items-center rounded border border-border/70 bg-card text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive disabled:opacity-50"
													>
														<Trash2Icon className="size-3" />
													</button>
												</div>
											))}
										</div>
									) : null}
									<button
										type="button"
										onClick={addNewParam}
										disabled={readOnly || saving}
										className="inline-flex h-7 w-fit items-center gap-1 rounded-md border border-dashed border-border px-2 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-50"
									>
										<PlusIcon className="size-3" />
										添加参数
									</button>
								</div>
							</section>
						) : (
							// 2026-10-20 用户拍板：非表格组与卡片展示同构——参数一行一个，
							<section className="rounded-md border border-border/70 bg-card p-2.5">
								<div className="grid gap-2">
									<div className="text-sm font-semibold text-foreground">{displayTitle} · 参数</div>
									<div className="grid gap-1.5">
										{rowEntries.map((entry) =>
											entry.kind === "preset" ? (
												// biome-ignore lint/a11y/noStaticElementInteractions: 拖拽排序的目标行，键盘可达性由行首拖拽按钮承担
												<div
													key={entry.id}
													onDragOver={() => moveRowOver(entry.id)}
													className={cn(
														"grid min-h-8 grid-cols-[auto_minmax(0,1fr)_minmax(0,1.2fr)_auto] items-center gap-1.5 rounded-md border border-border/70 bg-surface-soft px-2 py-1",
														dragRowId === entry.id && "opacity-60"
													)}
												>
													<button {...dragHandleProps(entry.id, entry.field.label)}>
														<GripVerticalIcon className="size-3.5" />
													</button>
													<span className="min-w-0 truncate text-xs text-muted-foreground" title={entry.field.label}>
														{entry.field.label}
													</span>
													{entry.field.type === "select" ? (
														<select
															name={entry.field.key}
															value={fieldValues[entry.field.key] ?? ""}
															onChange={(event) => updatePresetField(entry.field.key, event.target.value)}
															disabled={readOnly || saving}
															className="h-7 w-full rounded-md border border-input bg-card px-1.5 text-xs text-foreground"
														>
															<option value="">未设置</option>
															{entry.field.options?.map((option) => (
																<option key={option.value} value={option.value}>
																	{option.label}
																</option>
															))}
														</select>
													) : (
														<Input
															name={entry.field.key}
															type={
																entry.field.type === "date"
																	? "date"
																	: entry.field.type === "number"
																		? "number"
																		: undefined
															}
															value={fieldValues[entry.field.key] ?? ""}
															placeholder="未填写"
															onChange={(event) => updatePresetField(entry.field.key, event.target.value)}
															disabled={readOnly || saving}
															className="h-7 w-full text-xs"
														/>
													)}
													<button
														type="button"
														aria-label={`删除 ${entry.field.label}`}
														title="删除这一行（保存后该参数不再显示）"
														onClick={() =>
															setRemovedFields((current) => {
																const next = new Set(current)
																next.add(entry.field.key)
																return next
															})
														}
														disabled={readOnly || saving}
														className="grid size-6 shrink-0 place-items-center rounded border border-border/70 bg-card text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive disabled:opacity-50"
													>
														<Trash2Icon className="size-3" />
													</button>
												</div>
											) : (
												// biome-ignore lint/a11y/noStaticElementInteractions: 拖拽排序的目标行，键盘可达性由行首拖拽按钮承担
												<div
													key={entry.id}
													onDragOver={() => moveRowOver(entry.id)}
													className={cn(
														"grid min-h-8 grid-cols-[auto_minmax(0,1fr)_minmax(0,1.2fr)_auto] items-center gap-1.5 rounded-md border border-border/70 bg-surface-soft px-2 py-1",
														dragRowId === entry.id && "opacity-60"
													)}
												>
													<button {...dragHandleProps(entry.id, entry.row.label || "新参数")}>
														<GripVerticalIcon className="size-3.5" />
													</button>
													{entry.row.key ? (
														<span className="min-w-0 truncate text-xs text-muted-foreground" title={entry.row.label}>
															{entry.row.label}
														</span>
													) : (
														<Input
															value={entry.row.label}
															placeholder="参数名称"
															onChange={(event) =>
																setNewParams((current) =>
																	current.map((item) =>
																		item.id === entry.id ? { ...item, label: event.target.value } : item
																	)
																)
															}
															disabled={readOnly || saving}
															className="h-7 w-full text-xs"
														/>
													)}
													<Input
														value={entry.row.value}
														placeholder="未填写"
														onChange={(event) =>
															setNewParams((current) =>
																current.map((item) =>
																	item.id === entry.id ? { ...item, value: event.target.value } : item
																)
															)
														}
														disabled={readOnly || saving}
														className="h-7 w-full text-xs"
													/>
													<button
														type="button"
														aria-label={`删除 ${entry.row.label || "新参数"}`}
														title={entry.row.key ? "删除这一行（保存后该参数不再显示）" : "删除这一行"}
														onClick={() => {
															if (entry.row.key) {
																setRemovedCustomKeys((current) => new Set(current).add(entry.row.key))
															}
															setNewParams((current) => current.filter((item) => item.id !== entry.id))
															setRowOrder((current) => current.filter((id) => id !== entry.id))
														}}
														disabled={readOnly || saving}
														className="grid size-6 shrink-0 place-items-center rounded border border-border/70 bg-card text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive disabled:opacity-50"
													>
														<Trash2Icon className="size-3" />
													</button>
												</div>
											)
										)}
										<button
											type="button"
											onClick={addNewParam}
											disabled={readOnly || saving}
											className="inline-flex h-7 w-fit items-center gap-1 rounded-md border border-dashed border-border px-2 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-50"
										>
											<PlusIcon className="size-3" />
											添加参数
										</button>
									</div>
								</div>
							</section>
						)}
					</div>

					<DialogFooter className="border-t border-border/70 pt-3">
						<Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
							取消
						</Button>
						<Button type="submit" disabled={saving || readOnly}>
							{saving ? "保存中" : "保存参数"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}

// 2026-10-14 参数填写 Agent：调 Hub 分类端点——粘贴文本一次分类，输出按分类归组的候选。
export type AssetParameterAgentCandidate = {
	field: string
	label: string
	value: string
	category: string
	// 2026-10-17 用户拍板：粘贴顺序（后端提取条目序号），组编辑按此顺序直接写入行列表
	order?: number
}

// 2026-10-11 用户拍板：填写结果持久化在 metadata._agent_results（按组存）——
// 编辑页全量填写弹窗按分类展示候选（组编辑弹窗已改为直接写入，不再读取候选）。
type PersistedAgentGroupResult = { at: string; candidates: AssetParameterAgentCandidate[] }

// 全量结果按分类合并写入 _agent_results（编辑页全量弹窗共享；重复分类以最后一次为准）
export async function persistAgentResultsAll(
	assetId: string,
	resultsByCategory: Record<string, PersistedAgentGroupResult>
) {
	try {
		// getOne→合并→update：只动 _agent_results，不覆盖其他字段的并发修改
		const current = await pb.collection("assets").getOne(assetId)
		const merged = { ...((current.metadata ?? {}) as Record<string, unknown>) }
		const store = {
			...((merged._agent_results ?? {}) as Record<string, PersistedAgentGroupResult>),
			...resultsByCategory,
		}
		merged._agent_results = store
		await pb.collection("assets").update(assetId, { metadata: merged })
	} catch (error) {
		console.error("persist agent results", error)
	}
}
