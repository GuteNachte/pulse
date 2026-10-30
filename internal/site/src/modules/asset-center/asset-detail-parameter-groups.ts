import {
	BatteryIcon,
	BoxesIcon,
	CpuIcon,
	Globe2Icon,
	HardDriveIcon,
	ImageIcon,
	ListChecksIcon,
	MemoryStickIcon,
	MonitorIcon,
	NetworkIcon,
	PlugIcon,
	RadioIcon,
	ThermometerIcon,
	AppWindowIcon,
	Volume2Icon,
	SlidersHorizontalIcon,
	InboxIcon,
	WavesIcon,
	ZapIcon,
} from "lucide-react"
import { createElement } from "react"
import type { AssetInterfaceRecord, AssetRecord, AssetRelationRecord } from "@/types"
import { formatAssetParameterRowDisplay } from "./asset-parameter-display.ts"
import {
	ASSET_PARAMETER_CATEGORIES,
	getAssetArchiveField,
	getAssetParameterFieldsForType,
	type AssetParameterCategoryId,
} from "./asset-parameter-registry.ts"
import {
	getAssetFormSections,
	getMetadataString,
	getStatusLabel,
	HOST_ASSET_TYPES,
	NETWORK_ASSET_TYPES,
	type AssetFieldDefinition,
} from "./asset-schema.ts"
import {
	applyAssetGroupLayout,
	getAssetCustomGroups,
	getAssetGroupTitle,
	getAssetHiddenGroups,
	UNCATEGORIZED_GROUP_ID,
	UNCATEGORIZED_GROUP_TITLE,
} from "./asset-custom-groups.ts"
import { groupNetworkDeviceDetailRows, type NetworkDetailRow } from "./asset-network-detail-groups.ts"
import { normalizeMemorySpecification } from "./asset-memory-spec.ts"
import { normalizeNetworkInterfaceSummary } from "./asset-runtime-hardware.ts"
import { buildSwitchPortStatusRows } from "./asset-switch-port-status.ts"
import {
	formatInternetAddressTimestamp,
	getInternetAddressAutoRefreshSettings,
	getInternetAddressMode,
} from "./asset-internet-address-status.ts"
import type { AssetParameterGroup, AssetParameterRow } from "./components/asset-parameter-columns"

export type AssetParameterGroupContext = {
	interfaces?: AssetInterfaceRecord[]
	relations?: AssetRelationRecord[]
	assets?: AssetRecord[]
}

// 2026-10-12 内存/存储的「实际安装」字段（整机一条配置）——Agent 不搜这些，用户手动填写；
// 展示与编辑弹窗共用此判定（原先定义在组编辑弹窗里，为让分组构建器生成安装表格行挪到这里）
export function isCurrentInstallField(key: string): boolean {
	return [
		"memory_gb",
		"memory_type",
		"memory_vendor",
		"memory_speed_mhz",
		"memory_detail",
		"storage_gb",
		"storage_model",
		"storage_vendor",
		"storage_media",
		"storage_detail",
		"storage_serial_note",
		"storage_summary",
	].includes(key)
}

const switchPortCapabilityFieldKeys = new Set([
	"ethernet_port_count",
	"ethernet_supported_speeds",
	"default_ethernet_speed_mbps",
	"optical_port_count",
	"optical_supported_speeds",
	"default_optical_speed_mbps",
	"other_port_count",
])

const networkDeviceSecondaryGroupOrder = [
	// 2026-10-20 用户反馈：管理功能（管理方式/VLAN/端口隔离/链路聚合）独立成组，紧跟网络能力组
	"asset-parameter-management",
	"asset-parameter-platform",
	"asset-parameter-io",
	"asset-parameter-power",
	"asset-parameter-appearance",
] as const

// 2026-10-17 用户拍板：计算设备分类固化——以下 11 类常驻显示（删光参数的分组也不消失，保留补参数入口），
// 分类体系按用户定稿：物理规格 / 处理器(CPU) / 图形核心(GPU/核显) / 内存 / 存储支持 / 网络连接 /
// 显示输出 / 接口与扩展 / 电源与功耗 / 散热设计 / 系统与软件
// （「基本信息」为左侧独立卡片；「主板与固件」并入系统与软件；「显示输出」从接口与扩展拆出）
// 其余分类（显示/影像/音频/传感器等）仍仅在有参数时显示
export const HOST_FIXED_CATEGORY_IDS: AssetParameterCategoryId[] = [
	// 2026-10-18 用户拍板：物理规格放到最上面
	"appearance",
	"processor",
	"graphics",
	"memory",
	"storage",
	// 2026-10-18 用户拍板：网络连接上移，三张表格组相邻（内存/存储/网络）
	"network",
	"display_output",
	"io",
	"power",
	"thermal_environment",
	"system",
]

// 计算设备分组显示标题（registry 分类标题保留给其他资产类型，避免影响手机等类型的分组命名）
const HOST_GROUP_TITLES: Record<string, string> = {
	processor: "处理器(CPU)",
	graphics: "图形核心(GPU/核显)",
	storage: "存储支持",
	display_output: "显示输出",
	network: "网络连接",
	power: "电源与功耗",
	thermal_environment: "散热设计",
	appearance: "物理规格",
	system: "系统与软件",
}

// 计算设备分组显示顺序（用户定稿顺序）
const HOST_GROUP_ORDER: string[] = HOST_FIXED_CATEGORY_IDS
// 2026-10-20 智能家居预设组：电气参数（插座/智能开关）与功能参数（加湿器/净化器等 iot）
// 对适用类型常驻占位——编辑态可进组补参数；查看态空组仍被 hasVisibleGroupRows 过滤隐藏
const SMART_HOME_PRESET_CATEGORY_IDS: AssetParameterCategoryId[] = ["electrical", "functions"]

function assetTypeHasCategoryFields(assetType: AssetRecord["type"], categoryId: AssetParameterCategoryId) {
	return getAssetParameterFieldsForType(assetType).some((field) => field.category === categoryId)
}
// 2026-10-17 计算设备分类标题（Agent 候选分组/完成报告等处统一用定稿名称，其余资产类型回退 registry 标题）
export function getAssetParameterCategoryTitle(assetType: AssetRecord["type"], categoryId: string): string {
	const fallback = ASSET_PARAMETER_CATEGORIES.find((category) => category.id === categoryId)?.title ?? categoryId
	return hostGroupTitle(assetType, categoryId, fallback)
}

function hostGroupTitle(assetType: AssetRecord["type"], categoryId: string, fallback: string): string {
	if (!HOST_ASSET_TYPES.includes(assetType)) return fallback
	return HOST_GROUP_TITLES[categoryId] ?? fallback
}

function orderHostGroups(assetType: AssetRecord["type"], groups: AssetParameterGroup[]): AssetParameterGroup[] {
	if (!HOST_ASSET_TYPES.includes(assetType)) return groups
	const orderIndex = (groupId: string) => {
		const categoryId = groupId.replace(/^asset-parameter-/, "")
		const index = HOST_GROUP_ORDER.indexOf(categoryId)
		return index < 0 ? HOST_GROUP_ORDER.length : index
	}
	return [...groups].sort((left, right) => orderIndex(left.id) - orderIndex(right.id))
}

// 2026-10-17 组归属映射（展示构建器与组编辑弹窗共用，单一事实源）：
// 计算设备的「主板与固件」并入「系统与软件」组（散热设计已独立成组，不再并入电源）；
// 其他资产类型保留原分类
export function resolveParameterGroupId(category: string, assetType: AssetRecord["type"]): string {
	if (HOST_ASSET_TYPES.includes(assetType) && category === "platform") return "system"
	return category
}

export function buildAssetParameterGroups(
	asset: AssetRecord,
	context: AssetParameterGroupContext = {}
): AssetParameterGroup[] {
	if (asset.type === "internet" || asset.type === "web_endpoint") return buildServiceGroups(asset)

	const formSections = getAssetFormSections(asset.type)
	const fields = formSections.flatMap((section) => section.fields)
	const originalSectionByKey = new Map(
		formSections.flatMap((section) => section.fields.map((field) => [field.key, section.title] as const))
	)
	const rowsByCategory = new Map<AssetParameterCategoryId, AssetParameterRow[]>()
	const networkInterfaceValues = new Map<string, string>()
	const memoryInstallValues = new Map<string, string>()
	const memorySupportValues = new Map<string, string>()
	const storageInstallValues = new Map<string, string>()
	const storageSupportValues = new Map<string, string>()
	const networkDetailRows: NetworkDetailRow<AssetParameterRow>[] = []
	const switchPortCapabilityRows: AssetParameterRow[] = []
	for (const field of fields.sort(
		(left, right) => (getAssetArchiveField(left.key)?.order ?? 0) - (getAssetArchiveField(right.key)?.order ?? 0)
	)) {
		const definition = getAssetArchiveField(field.key)
		if (definition?.scope !== "parameter" || !definition.category) continue
		// 2026-10-12 用户拍板：上市日期展示在设备档案卡（仍保留 registry parameter 供 Agent 提取），分组不显示
		if (field.key === "release_date") continue
		const value = getAssetFieldDisplayValue(asset, field)
		if (!value) continue
		const row = {
			...fieldToParameterRow(field, value),
			section: getDetailRowSection(asset.type, field.key, originalSectionByKey.get(field.key), definition.section),
			key: field.key,
		}
		if (asset.type === "switch" && switchPortCapabilityFieldKeys.has(field.key)) {
			switchPortCapabilityRows.push(row)
			continue
		}
		if (definition.category === "network" && NETWORK_ASSET_TYPES.includes(asset.type)) {
			networkDetailRows.push({ fieldKey: field.key, row })
			continue
		}
		// 2026-10-12 网络（非网络设备）：字段先收集，按接口成行——有线在上一行、无线网卡在下一行，表格渲染
		if (definition.category === "network") {
			networkInterfaceValues.set(field.key, value)
			continue
		}
		// 2026-10-12 内存（计算设备）：支持/安装字段全部收集，按插槽表格化重组（插槽行 = 官方支持列 + 实际安装列）
		if (HOST_ASSET_TYPES.includes(asset.type) && definition.category === "memory") {
			if (isCurrentInstallField(field.key)) memoryInstallValues.set(field.key, fieldToParameterRow(field, value).value)
			else {
				// 2026-10-12 支持内存类型展示清洗：剥离混写的频率后缀（DDR5-4800 → DDR5；
				// 兼容区间与单位：DDR5-4800/5600、DDR5 4800-6400MHz）
				let cleanValue = fieldToParameterRow(field, value).value
				if (field.key === "supported_memory_type") {
					cleanValue = cleanValue.replace(/[-\s]+\d{3,4}(?:\s*[/~～-]\s*\d{3,4})*\s*(?:mhz|mt\/s)?\s*$/i, "").trim()
				}
				memorySupportValues.set(field.key, cleanValue)
			}
			continue
		}
		// 2026-10-14 用户拍板：存储只保留实际安装的硬盘——安装字段单独收集，其余支持字段进支持值表
		// 2026-10-17 用户拍板：存储规范参数（插槽数/硬盘类型支持/接口/协议版本/每槽最大容量）单独展示
		if (HOST_ASSET_TYPES.includes(asset.type) && definition.category === "storage") {
			if (isCurrentInstallField(field.key)) storageInstallValues.set(field.key, fieldToParameterRow(field, value).value)
			else storageSupportValues.set(field.key, fieldToParameterRow(field, value).value)
			continue
		}
		// 2026-10-07 计算设备 11 组：散热与环境并入「电源与散热」（设计组固定，thermal_environment 保留给其他类型）
		// 2026-10-17 统一映射（resolveParameterGroupId）：组编辑弹窗按同一规则收字段，散热参数可编辑/可删除
		const category = resolveParameterGroupId(definition.category, asset.type) as AssetParameterCategoryId
		const rows = rowsByCategory.get(category) ?? []
		rows.push(row)
		rowsByCategory.set(category, rows)
	}

	// 2026-10-12 网络（非网络设备）：接口表格行——有线网卡在上、无线网卡在后；未进表的字段（如端口数量）附后
	const networkInterfaceRows = buildNetworkInterfaceRows(networkInterfaceValues, asset, context)
	if (networkInterfaceRows) rowsByCategory.set("network", networkInterfaceRows)
	// 2026-10-17 用户拍板：内存展示重设计——规范参数（插槽数/支持内存类型/支持频率/内存条形态/最大容量/通道数/
	// 是否可扩展等）单独铺格子；表格只显示每个插槽的实际安装（内存类型/容量/频率/品牌/规格）
	if (memorySupportValues.size > 0 || memoryInstallValues.size > 0) {
		const memorySpecOrder = [
			"memory_slots",
			"supported_memory_type",
			"supported_memory_speed_mhz",
			"memory_form_factor",
			"max_memory_gb",
			"memory_channel_count",
			"memory_upgradable",
			"ecc_memory",
		]
		const specRows: AssetParameterRow[] = []
		const pushSpecRow = (key: string) => {
			const value = memorySupportValues.get(key)
			if (!value) return
			const definition = getAssetArchiveField(key)
			// 展示格式化：标签末尾单位（GB/MHz）移到值上，与参数展示口径一致
			const display = definition
				? formatAssetParameterRowDisplay({ key, label: definition.label }, value)
				: { label: key, value }
			specRows.push({
				label: display.label,
				value: display.value,
				section: "支持规格",
				key,
			})
		}
		for (const key of memorySpecOrder) pushSpecRow(key)
		for (const key of memorySupportValues.keys()) {
			if (!memorySpecOrder.includes(key)) pushSpecRow(key)
		}
		const installCells = ["memory_type", "memory_gb", "memory_speed_mhz", "memory_vendor", "memory_detail"].map(
			(key) => memoryInstallValues.get(key) ?? ""
		)
		const slotCount = Number(memorySupportValues.get("memory_slots")) || 0
		const slotRows: AssetParameterRow[] = []
		const count = slotCount > 0 ? Math.min(slotCount, 8) : 1
		const slotInUse = memoryInstallValues.size > 0
		for (let slot = 1; slot <= count; slot++) {
			slotRows.push({
				label: slotCount > 0 ? `插槽 ${slot}` : "已安装内存",
				value: installCells.filter(Boolean).join(" · "),
				cells: installCells,
				section: "实际安装",
				inUse: slotInUse,
				// 2026-10-17 用户拍板：插槽行拖拽排序标识（_table_row_order）
				key: `slot-${slot}`,
			})
		}
		rowsByCategory.set("memory", [...specRows, ...slotRows])
	}
	// 2026-10-17 用户拍板：存储展示重设计——规范参数（插槽数/硬盘类型支持/接口/协议版本/每槽最大容量）单独铺格子；
	// 表格只显示每个盘位的实际安装（品牌/型号/容量/硬盘类型）
	if (storageInstallValues.size > 0 || storageSupportValues.size > 0) {
		const storageSpecOrder = [
			"bay_count",
			"storage_supported_types",
			"storage_interface",
			"storage_protocol",
			"storage_max_capacity_per_bay",
		]
		const specRows: AssetParameterRow[] = []
		for (const key of storageSpecOrder) {
			const value = storageSupportValues.get(key)
			if (!value) continue
			const definition = getAssetArchiveField(key)
			const display = definition
				? formatAssetParameterRowDisplay({ key, label: definition.label }, value)
				: { label: key, value }
			specRows.push({ label: display.label, value: display.value, section: "支持规格", key })
		}
		const installCells = ["storage_vendor", "storage_model", "storage_gb", "storage_media"].map(
			(key) => storageInstallValues.get(key) ?? ""
		)
		const bayCount = Number(storageSupportValues.get("bay_count")) || 0
		const bayRows: AssetParameterRow[] = []
		const count = bayCount > 0 ? Math.min(bayCount, 12) : 1
		for (let bay = 1; bay <= count; bay++) {
			bayRows.push({
				label: bayCount > 0 ? `盘位 ${bay}` : "已装存储",
				value: installCells.filter(Boolean).join(" · "),
				cells: installCells,
				section: "实际安装",
				inUse: storageInstallValues.size > 0,
				// 2026-10-17 用户拍板：盘位行拖拽排序标识（_table_row_order）
				key: `bay-${bay}`,
			})
		}
		rowsByCategory.set("storage", [...specRows, ...bayRows])
	}
	// 2026-10-17 用户拍板：粘贴/手动写入的自定义参数（_group_params 按分组清单）展示到对应分组——
	// 不在字段池里的参数按清单归组并显示「自定义参数」小节；已由预设字段渲染的 key 不重复显示
	const poolKeys = new Set(fields.map((field) => field.key))
	const customParamsByGroup = (asset.metadata?._group_params ?? {}) as Record<string, unknown>
	const validCategoryIds = new Set<string>(ASSET_PARAMETER_CATEGORIES.map((category) => category.id))
	for (const [categoryId, rawKeys] of Object.entries(customParamsByGroup)) {
		if (!validCategoryIds.has(categoryId) || !Array.isArray(rawKeys)) continue
		const customRows: AssetParameterRow[] = []
		const seen = new Set<string>()
		for (const rawKey of rawKeys) {
			const key = typeof rawKey === "string" ? rawKey.trim() : ""
			if (!key || seen.has(key) || poolKeys.has(key)) continue
			if (key.startsWith("_") || key.startsWith("current_")) continue
			const rawValue = (asset.metadata as Record<string, unknown>)[key]
			const value = rawValue === undefined || rawValue === null ? "" : String(rawValue).trim()
			if (!value) continue
			seen.add(key)
			customRows.push({ label: key, value, section: "自定义参数", key })
		}
		if (customRows.length === 0) continue
		const category = categoryId as AssetParameterCategoryId
		rowsByCategory.set(category, [...(rowsByCategory.get(category) ?? []), ...customRows])
	}
	// 2026-10-17 用户拍板：自定义排序——_param_order 按组记录行键顺序（组编辑弹窗上移/下移），展示按此顺序渲染；
	// 未记录的行保持原有相对顺序排在后面
	const paramOrderRecord = (asset.metadata?._param_order ?? {}) as Record<string, string[]>
	for (const [categoryId, order] of Object.entries(paramOrderRecord)) {
		if (!Array.isArray(order) || order.length === 0) continue
		const category = categoryId as AssetParameterCategoryId
		const rows = rowsByCategory.get(category)
		if (!rows || rows.length === 0) continue
		const orderIndex = new Map(order.map((key, index) => [key, index] as const))
		const orderedRows = [...rows].sort((left, right) => {
			const leftIndex = left.key === undefined ? undefined : orderIndex.get(left.key)
			const rightIndex = right.key === undefined ? undefined : orderIndex.get(right.key)
			if (leftIndex === undefined && rightIndex === undefined) return 0
			if (leftIndex === undefined) return 1
			if (rightIndex === undefined) return -1
			return leftIndex - rightIndex
		})
		rowsByCategory.set(category, orderedRows)
	}
	// 2026-10-17 用户拍板：表格行拖拽排序——_table_row_order 按组记录插槽/盘位/接口行顺序；
	// 只重排这些有标识的行（保持规范参数格子等无标识行的位置）
	const tableRowOrderRecord = (asset.metadata?._table_row_order ?? {}) as Record<string, string[]>
	for (const [categoryId, order] of Object.entries(tableRowOrderRecord)) {
		if (!Array.isArray(order) || order.length === 0) continue
		const category = categoryId as AssetParameterCategoryId
		const rows = rowsByCategory.get(category)
		if (!rows || rows.length === 0) continue
		const orderIndex = new Map(order.map((key, index) => [key, index] as const))
		const positions: number[] = []
		const keyedRows: AssetParameterRow[] = []
		rows.forEach((row, index) => {
			if (!row.key) return
			positions.push(index)
			keyedRows.push(row)
		})
		if (keyedRows.length === 0) continue
		keyedRows.sort((left, right) => {
			const leftIndex = orderIndex.get(left.key as string) ?? Number.MAX_SAFE_INTEGER
			const rightIndex = orderIndex.get(right.key as string) ?? Number.MAX_SAFE_INTEGER
			return leftIndex - rightIndex
		})
		const orderedRows = [...rows]
		positions.forEach((position, index) => {
			orderedRows[position] = keyedRows[index]
		})
		rowsByCategory.set(category, orderedRows)
	}

	const switchPortDetailRows = buildSwitchPortStatusRows(
		asset,
		context.interfaces ?? [],
		context.assets ?? [],
		context.relations ?? []
	)
	const metadata = asset.metadata ?? {}
	const hiddenGroups = new Set(getAssetHiddenGroups(metadata))
	const groups = ASSET_PARAMETER_CATEGORIES.flatMap((category) => {
		if (hiddenGroups.has(category.id)) return []
		if (category.id === "network" && networkDetailRows.length > 0) {
			return groupNetworkDeviceDetailRows(asset.type, networkDetailRows).map((group) => {
				const rows = group.rows.map((row) => ({ ...row, section: undefined }))
				return {
					id: group.id,
					title: getAssetGroupTitle(metadata, group.id, group.title),
					summary: getParameterGroupSummary(rows),
					icon: getParameterGroupIcon("network"),
					rows,
				}
			})
		}
		const rows = sortDetailRows(asset.type, rowsByCategory.get(category.id) ?? [])
		if (rows.length === 0) {
			// 2026-10-17 用户拍板：计算设备固化分类常驻——删光某分类参数后分组卡片不消失（保留「编辑」入口补参数）；
			// 仅固化列表内的分类占位，其余分类仍无参数不显示。
			// 2026-10-20 智能家居预设组（电气参数/功能参数）同样对适用类型占位，编辑态可进组补参数
			const isPresetCategory =
				(HOST_ASSET_TYPES.includes(asset.type) && HOST_FIXED_CATEGORY_IDS.includes(category.id)) ||
				(SMART_HOME_PRESET_CATEGORY_IDS.includes(category.id) && assetTypeHasCategoryFields(asset.type, category.id))
			if (!isPresetCategory) {
				return []
			}
			return [
				{
					id: `asset-parameter-${category.id}`,
					title: getAssetGroupTitle(metadata, category.id, hostGroupTitle(asset.type, category.id, category.title)),
					summary: "暂无参数",
					icon: getParameterGroupIcon(category.id),
					rows: [],
				},
			]
		}
		return [
			{
				id: `asset-parameter-${category.id}`,
				title: getAssetGroupTitle(metadata, category.id, hostGroupTitle(asset.type, category.id, category.title)),
				summary: getParameterGroupSummary(rows),
				icon: getParameterGroupIcon(category.id),
				rows,
			},
		]
	})
	// 2026-10-20 硬件档案自定义分组：用户新建的分组 + Agent/手动产生的「未分类」，
	// 参数仍走 _group_params，卡片与预设分组同构，可编辑、拖拽移入其他分组。
	for (const customGroup of getAssetCustomGroups(metadata)) {
		if (hiddenGroups.has(customGroup.id)) continue
		const rows = buildCustomGroupRows(asset, customGroup.id, poolKeys)
		// 空自定义分组也返回：编辑态显示「暂无参数」，避免新建后取消编辑导致分组找不到
		groups.push({
			id: customGroup.id,
			title: getAssetGroupTitle(metadata, customGroup.id, customGroup.title),
			summary: getParameterGroupSummary(rows),
			icon: createElement(SlidersHorizontalIcon, { className: "size-4" }),
			rows,
		})
	}
	if (!hiddenGroups.has(UNCATEGORIZED_GROUP_ID)) {
		const uncategorizedRows = buildCustomGroupRows(asset, UNCATEGORIZED_GROUP_ID, poolKeys)
		if (uncategorizedRows.length > 0) {
			groups.push({
				id: UNCATEGORIZED_GROUP_ID,
				title: getAssetGroupTitle(metadata, UNCATEGORIZED_GROUP_ID, UNCATEGORIZED_GROUP_TITLE),
				summary: getParameterGroupSummary(uncategorizedRows),
				icon: createElement(InboxIcon, { className: "size-4" }),
				rows: uncategorizedRows,
			})
		}
	}
	// 2026-10-17 用户定稿分类顺序：计算设备按固定顺序展示（其余资产类型维持 registry 顺序）
	const orderedGroups = orderHostGroups(asset.type, groups)
	const switchPortRows = [...switchPortCapabilityRows, ...switchPortDetailRows]
	// 2026-10-10 参数专项：移除「其他参数」组——不在固定分类里的参数不再显示（用户口径：参数只按固定硬件分类呈现）
	if (asset.type !== "switch" || switchPortRows.length === 0) {
		return applyAssetGroupLayout(prioritizeNetworkDeviceGroups(asset.type, orderedGroups), metadata)
	}
	const switchPortGroup: AssetParameterGroup = {
		id: "switch-port-status",
		title: "网口状态",
		summary: switchPortDetailRows.length > 0 ? `${switchPortDetailRows.length} 个网口` : "已记录端口能力",
		icon: createElement(PlugIcon, { className: "size-4" }),
		rows: switchPortRows,
	}
	const networkIndex = orderedGroups.findIndex((group) => group.id === "switch-network-functions")
	const insertAt = networkIndex >= 0 ? networkIndex + 1 : 0
	return applyAssetGroupLayout(
		prioritizeNetworkDeviceGroups(asset.type, [
			...orderedGroups.slice(0, insertAt),
			switchPortGroup,
			...orderedGroups.slice(insertAt),
		]),
		metadata
	)
}

// 自定义分组参数：从 _group_params[groupId] 取键，值读 metadata；按 _param_order 排序，跳过预设字段/内部键
function buildCustomGroupRows(asset: AssetRecord, groupId: string, poolKeys: Set<string>): AssetParameterRow[] {
	const metadata = (asset.metadata ?? {}) as Record<string, unknown>
	const rawKeys = (metadata._group_params as Record<string, unknown> | undefined)?.[groupId]
	if (!Array.isArray(rawKeys)) return []
	const order = Array.isArray((metadata._param_order as Record<string, unknown> | undefined)?.[groupId])
		? ((metadata._param_order as Record<string, unknown>)[groupId] as unknown[]).filter(
				(key): key is string => typeof key === "string"
			)
		: []
	const orderIndex = new Map(order.map((key, index) => [key, index] as const))
	const rows: AssetParameterRow[] = []
	const seen = new Set<string>()
	for (const rawKey of rawKeys) {
		const key = typeof rawKey === "string" ? rawKey.trim() : ""
		if (!key || seen.has(key) || poolKeys.has(key)) continue
		if (key.startsWith("_") || key.startsWith("current_")) continue
		const rawValue = metadata[key]
		const value = rawValue === undefined || rawValue === null ? "" : String(rawValue).trim()
		if (!value) continue
		seen.add(key)
		rows.push({ label: key, value, section: "自定义参数", key })
	}
	return rows
		.map((row, index) => ({ row, index }))
		.sort((left, right) => {
			const leftOrder = orderIndex.get(left.row.key ?? "") ?? Number.MAX_SAFE_INTEGER
			const rightOrder = orderIndex.get(right.row.key ?? "") ?? Number.MAX_SAFE_INTEGER
			return leftOrder - rightOrder || left.index - right.index
		})
		.map(({ row }) => row)
}

// 2026-10-17 品牌/型号拼接：型号文本已含品牌或自带品牌前缀（如「Intel I225-V 以太网控制器」「MediaTek RZ608…」）时
// 不再重复拼品牌——避免粘贴新规格后旧品牌字段残留造成「AMD MediaTek…」这类混搭
function joinBrandAndModel(brand: string, model: string): string {
	const cleanBrand = brand.trim()
	const cleanModel = model.trim()
	if (!cleanBrand) return cleanModel
	if (!cleanModel) return cleanBrand
	if (cleanModel.toLowerCase().includes(cleanBrand.toLowerCase())) return cleanModel
	const firstToken = cleanModel.split(/\s+/)[0] ?? ""
	// 首词为纯字母（品牌名形态，如 MediaTek/Intel/AMD）→ 视为型号自带品牌
	if (firstToken.length >= 2 && /^[A-Za-z]+$/.test(firstToken)) return cleanModel
	return `${cleanBrand} ${cleanModel}`
}

// 2026-10-12 网络（非网络设备）：按接口成行——有线网卡一行（品牌/型号/速率）、无线网卡一行（品牌/型号/标准）；
// 未进表的其余网络字段（如端口数量）按普通行附在表格后。无任何网络值时返回 undefined（组按空组处理）。
function buildNetworkInterfaceRows(
	values: Map<string, string>,
	asset: AssetRecord,
	context: AssetParameterGroupContext
): AssetParameterRow[] | undefined {
	if (values.size === 0) return undefined
	const cell = (...keys: string[]) => {
		for (const key of keys) {
			const value = values.get(key)?.trim()
			if (value) return value
		}
		return ""
	}
	// 2026-10-17 用户拍板：网络组重设计（与内存/存储同构）——
	// 规范参数单独铺格子（有线网卡芯片/有线速率/Wi-Fi 协议/Wi-Fi 模块/Wi-Fi 速率/蓝牙），
	// 表格只放接口与接入：接口 | 接口类型 | 连接的设备（对端从连接关系解析）
	const peers = buildNetworkPeerNames(asset, context)
	const specRows: AssetParameterRow[] = []
	const pushSpec = (label: string, value: string) => {
		if (value) specRows.push({ label, value, section: "支持规格" })
	}
	const nicVendor = getMetadataString(asset.metadata, "nic_vendor")
	const nicModel = getMetadataString(asset.metadata, "nic_model")
	const nicDetail = getMetadataString(asset.metadata, "nic_detail")
	pushSpec("有线网卡芯片", nicDetail || joinBrandAndModel(nicVendor, nicModel))
	const rawSpeed = getMetadataString(asset.metadata, "primary_nic_speed_mbps")
	pushSpec("有线速率", /^\d+$/.test(rawSpeed) ? formatNetworkSpeed(rawSpeed) : rawSpeed)
	pushSpec("Wi-Fi 协议", getMetadataString(asset.metadata, "wifi_standard"))
	pushSpec(
		"Wi-Fi 模块",
		joinBrandAndModel(getMetadataString(asset.metadata, "wifi_vendor"), getMetadataString(asset.metadata, "wifi_model"))
	)
	pushSpec("Wi-Fi 速率", getMetadataString(asset.metadata, "wifi_speed_mbps"))
	pushSpec("蓝牙", getMetadataString(asset.metadata, "bluetooth_version"))

	const rows: AssetParameterRow[] = []
	const wiredConnector = getMetadataString(asset.metadata, "nic_connector_type")
	const wiredBrand = cell("nic_vendor")
	const wiredModel = cell("nic_model", "nic_detail")
	const wiredSpeed = cell("primary_nic_speed_mbps")
	if (wiredBrand || wiredModel || wiredSpeed || wiredConnector) {
		rows.push({
			key: "wired",
			label: getMetadataString(asset.metadata, "nic_port_type") || "有线网卡",
			value: [wiredConnector, peers.wired].filter(Boolean).join(" · "),
			cells: [wiredConnector, peers.wired],
			section: "实际安装",
			inUse: true,
		})
	}
	const wifiBrand = cell("wifi_vendor")
	const wifiModelValue = cell("wifi_model")
	const wifiStandard = cell("wifi_standard")
	const wifiConnector = getMetadataString(asset.metadata, "wifi_connector_type")
	if (wifiBrand || wifiModelValue || wifiStandard || wifiConnector) {
		rows.push({
			key: "wifi",
			label: getMetadataString(asset.metadata, "wifi_port_type") || "无线网卡",
			value: [wifiConnector, peers.wifi].filter(Boolean).join(" · "),
			cells: [wifiConnector, peers.wifi],
			section: "实际安装",
			inUse: true,
		})
	}
	// 2026-10-12 编辑弹窗「添加接口」产生的扩展接口行（_network_ext_nics 清单 + ext_nicN_* 字段）
	const extraNicCount = Math.min(Number(getMetadataString(asset.metadata, "_network_ext_nics")) || 0, 6)
	for (let nicIndex = 1; nicIndex <= extraNicCount; nicIndex++) {
		const brand = getMetadataString(asset.metadata, `ext_nic${nicIndex}_vendor`)
		const model = getMetadataString(asset.metadata, `ext_nic${nicIndex}_model`)
		const connector = getMetadataString(asset.metadata, `ext_nic${nicIndex}_connector_type`)
		const speed = getMetadataString(asset.metadata, `ext_nic${nicIndex}_speed`)
		const standard = getMetadataString(asset.metadata, `ext_nic${nicIndex}_standard`)
		if (!brand && !model && !connector && !speed && !standard) continue
		rows.push({
			key: `ext-${nicIndex}`,
			label: getMetadataString(asset.metadata, `ext_nic${nicIndex}_port_type`) || `扩展接口 ${nicIndex}`,
			value: connector,
			cells: [connector, ""],
			section: "实际安装",
			inUse: true,
		})
		// 扩展接口的速率/标准保留为规范参数格子
		pushSpec(`扩展接口 ${nicIndex} 速率`, speed)
		pushSpec(`扩展接口 ${nicIndex} 标准`, standard)
	}
	const consumed = new Set([
		"nic_vendor",
		"nic_model",
		"nic_detail",
		"primary_nic_speed_mbps",
		"wifi_vendor",
		"wifi_model",
		"wifi_support",
		"wifi_standard",
		"wifi_speed_mbps",
		"bluetooth_version",
	])
	for (const [key, value] of values) {
		if (consumed.has(key) || !value) continue
		// 未进规范行的其余网络字段（如端口数量）也作为规范参数格子
		specRows.push({ label: getAssetArchiveField(key)?.label ?? key, value, section: "支持规格" })
	}
	const result = [...specRows, ...rows]
	return result.length > 0 ? result : undefined
}

// 2026-10-12 速率显示映射：存 mbps 数字，展示简洁单位（2500 → 2.5G）
const networkSpeedLabels: Record<string, string> = {
	"10": "10M",
	"100": "100M",
	"1000": "1000M",
	"2500": "2.5G",
	"5000": "5G",
	"10000": "10G",
	"25000": "25G",
	"40000": "40G",
	"100000": "100G",
}
function formatNetworkSpeed(value: string) {
	return networkSpeedLabels[value.trim()] ?? value
}

// 2026-10-12 网络连接设备解析：从本资产相关的关系里取对端名（asset 目录优先、relation.expand 兜底——
// 详情页资产清单只含当前资产），按关系挂接的接口类型分有线/无线（接口记录 kind=wifi 为无线，
// 无接口信息时按关系标签含「Wi-Fi/无线」判断）
function buildNetworkPeerNames(
	asset: AssetRecord,
	context: AssetParameterGroupContext
): { wired: string; wifi: string } {
	const result = { wired: "", wifi: "" }
	const interfaces = context.interfaces ?? []
	const relations = context.relations ?? []
	const assetsById = new Map((context.assets ?? []).map((item) => [item.id, item]))
	for (const relation of relations) {
		if (relation.source_asset !== asset.id && relation.target_asset !== asset.id) continue
		const peerId = relation.source_asset === asset.id ? relation.target_asset : relation.source_asset
		const expandedPeer = relation.expand?.[peerId === relation.source_asset ? "source_asset" : "target_asset"]
		const peer =
			assetsById.get(peerId) ??
			(expandedPeer && !Array.isArray(expandedPeer) ? (expandedPeer as AssetRecord) : undefined)
		const peerName = peer?.name ?? "未知资产"
		let wireless = false
		for (const key of ["source_interface", "target_interface"] as const) {
			const interfaceId = getMetadataString(relation.metadata, key)
			if (!interfaceId) continue
			if (interfaces.find((item) => item.id === interfaceId)?.kind === "wifi") {
				wireless = true
				break
			}
		}
		if (!wireless) {
			const label = relation.label ?? ""
			wireless = label.includes("Wi-Fi") || label.includes("WiFi") || label.includes("无线")
		}
		if (wireless) {
			if (!result.wifi) result.wifi = peerName
		} else if (!result.wired) {
			result.wired = peerName
		}
	}
	return result
}

function prioritizeNetworkDeviceGroups(assetType: AssetRecord["type"], groups: AssetParameterGroup[]) {
	if (!NETWORK_ASSET_TYPES.includes(assetType)) return groups
	return groups
		.map((group, index) => ({ group, index, priority: getNetworkDeviceGroupPriority(group.id) }))
		.sort((left, right) => left.priority - right.priority || left.index - right.index)
		.map(({ group }) => group)
}

function getNetworkDeviceGroupPriority(groupId: string) {
	if (!groupId.startsWith("asset-parameter-")) return 0
	const secondaryIndex = networkDeviceSecondaryGroupOrder.indexOf(
		groupId as (typeof networkDeviceSecondaryGroupOrder)[number]
	)
	return secondaryIndex >= 0 ? secondaryIndex + 1 : networkDeviceSecondaryGroupOrder.length + 1
}

function buildServiceGroups(asset: AssetRecord) {
	const allowedSectionTitles =
		asset.type === "internet"
			? new Set(["线路参数", "套餐与续费", "订阅周期"])
			: new Set(["互联网服务监控", "订阅与续费"])
	const hiddenByGroup = (asset.metadata?._hidden_params ?? {}) as Record<string, string[]>
	const orderByGroup = (asset.metadata?._param_order ?? {}) as Record<string, string[]>
	const groupParams = (asset.metadata?._group_params ?? {}) as Record<string, string[]>
	let groups: AssetParameterGroup[] = getAssetFormSections(asset.type).flatMap((section, index) => {
		if (!allowedSectionTitles.has(section.title)) return []
		const groupId = `service-${index}`
		const hiddenKeys = new Set(Array.isArray(hiddenByGroup[groupId]) ? hiddenByGroup[groupId] : [])
		const fieldByKey = new Map(section.fields.map((field) => [field.key, field]))
		// 2026-10-20 服务类分组与普通分组同样支持删行、拖拽排序与自定义参数：
		// _hidden_params / _param_order / _group_params 统一按 service-N 存储。
		const savedOrder = Array.isArray(orderByGroup[groupId]) ? orderByGroup[groupId] : []
		const orderedKeys = [
			...savedOrder.filter((key) => fieldByKey.has(key)),
			...section.fields.map((field) => field.key).filter((key) => !savedOrder.includes(key)),
		]
		const rows = orderedKeys.flatMap((key) => {
			if (hiddenKeys.has(key)) return []
			const field = fieldByKey.get(key)
			if (!field) return []
			const value = getAssetFieldDisplayValue(asset, field)
			return value ? [fieldToParameterRow(field, value)] : []
		})
		const customKeys = (Array.isArray(groupParams[groupId]) ? groupParams[groupId] : []).filter(
			(key) => !fieldByKey.has(key) && !getAssetArchiveField(key)
		)
		for (const key of customKeys) {
			const value = getMetadataString(asset.metadata, key)
			if (!value) continue
			rows.push({ label: getAssetArchiveField(key)?.label ?? key, value })
		}
		// 宽带「订阅周期」是用户拍板的专属分类：编辑态即使为空也保留，方便首次填写；
		// 查看态由外层 hasVisibleGroupRows 过滤空分组，不占版面。
		if (rows.length === 0 && section.title !== "订阅周期") return []
		return [
			{
				id: groupId,
				title: section.title,
				summary: getParameterGroupSummary(rows),
				icon: createElement(Globe2Icon, { className: "size-4" }),
				rows,
			},
		]
	})
	if (asset.type === "internet") groups = addInternetAddressStatusRows(asset, groups)
	return groups
}

function addInternetAddressStatusRows(asset: AssetRecord, groups: AssetParameterGroup[]) {
	const ipv4 = getMetadataString(asset.metadata, "public_ipv4")
	const ipv6 = getMetadataString(asset.metadata, "public_ipv6")
	const ipv4Error = getMetadataString(asset.metadata, "public_ipv4_error")
	const ipv6Error = getMetadataString(asset.metadata, "public_ipv6_error")
	const checkedAt = getMetadataString(asset.metadata, "public_ip_checked_at")
	const nextCheckAt = getMetadataString(asset.metadata, "public_ip_next_check_at")
	const mode = getInternetAddressMode(asset.metadata ?? {})
	const settings = getInternetAddressAutoRefreshSettings(asset.metadata ?? {})
	let rows: AssetParameterRow[]
	let title: string
	let summary: string
	if (mode === "manual") {
		// 2026-10-20 手动模式：地址由用户维护，不显示检测状态/自动更新控件。
		title = "公网地址"
		summary = ipv4 || ipv6 || "未填写"
		rows = [
			{ label: "当前公网 IPv4", value: ipv4 || "未填写" },
			{ label: "当前公网 IPv6", value: ipv6 || "未填写" },
			{ label: "维护方式", value: "手动填写" },
			{ label: "上次维护时间", value: formatInternetAddressTimestamp(checkedAt) },
			{ label: "自动更新", value: "手动模式，不自动更新" },
		]
	} else {
		// 2026-10-20 自动模式：地址与检测状态分开显示；检测失败时保留上次地址，但要明确标注。
		const detectionErrors = [
			ipv4Error ? `IPv4：${ipv4Error}${ipv4 ? "（保留上次结果）" : ""}` : "",
			ipv6Error ? `IPv6：${ipv6Error}${ipv6 ? "（保留上次结果）" : ""}` : "",
		].filter(Boolean)
		title = "动态公网地址"
		summary = ipv4 || ipv6 || (ipv4Error || ipv6Error ? "检测失败" : "尚未获取")
		rows = [
			{ label: "当前公网 IPv4", value: ipv4 || "尚未获取" },
			{ label: "当前公网 IPv6", value: ipv6 || "尚未获取" },
			...(detectionErrors.length > 0 ? [{ label: "检测状态", value: detectionErrors.join("；") }] : []),
			{ label: "上次更新时间", value: formatInternetAddressTimestamp(checkedAt) },
			{
				label: "下次更新时间",
				value: nextCheckAt
					? formatInternetAddressTimestamp(nextCheckAt)
					: settings.enabled
						? "等待首次更新"
						: "自动更新已关闭",
			},
		]
	}
	const addressGroup: AssetParameterGroup = {
		id: "internet-public-addresses",
		title,
		summary,
		icon: createElement(Globe2Icon, { className: "size-4" }),
		rows,
	}
	const lineIndex = groups.findIndex((group) => group.title === "线路参数")
	const insertAt = lineIndex >= 0 ? lineIndex + 1 : 0
	return [...groups.slice(0, insertAt), addressGroup, ...groups.slice(insertAt)]
}

function fieldToParameterRow(field: AssetFieldDefinition, value: string): AssetParameterRow {
	const display = formatAssetParameterRowDisplay(field, value)
	return {
		label: display.label,
		value: display.value,
		href: field.type === "url" && /^https?:\/\//i.test(value) ? value : undefined,
		capture: field.capture,
	}
}

function getAssetFieldDisplayValue(asset: AssetRecord, field: AssetFieldDefinition) {
	let value = ""
	switch (field.key) {
		case "name":
			value = asset.name
			break
		case "status":
			value = getStatusLabel(asset.status || "active")
			break
		case "vendor":
			value = asset.vendor || ""
			break
		case "model":
			value = asset.model || ""
			break
		case "serial_number":
			value = asset.serial_number || ""
			break
		case "management_ip":
			value = asset.management_ip || ""
			break
		case "location":
			value = asset.location || ""
			break
		case "role":
			value = asset.role || ""
			break
		case "notes":
			value = asset.notes || ""
			break
		case "memory_detail":
			value = normalizeMemorySpecification(getMetadataString(asset.metadata, field.key))
			break
		case "nic_detail":
			value = normalizeNetworkInterfaceSummary(getMetadataString(asset.metadata, field.key))
			break
		default:
			value = getMetadataString(asset.metadata, field.key)
	}
	return field.type === "select" ? (field.options?.find((option) => option.value === value)?.label ?? value) : value
}

function getDetailRowSection(
	assetType: AssetRecord["type"],
	fieldKey: string,
	originalSection: string | undefined,
	registrySection: string | undefined
) {
	if (assetType === "switch") {
		if (originalSection === "硬件与端口能力") {
			return switchPortCapabilityFieldKeys.has(fieldKey) ? "端口能力" : "网络功能"
		}
		if (originalSection === "管理与网络能力") return "网络功能"
		if (registrySection?.startsWith("网络能力")) return "网络功能"
	}
	if (assetType === "ont" && originalSection && !["身份与归属", "设备身份标识"].includes(originalSection)) {
		return originalSection
	}
	if (assetType === "ont" && originalSection === "身份与归属") return "接入角色"
	if (assetType === "ont" && originalSection === "设备身份标识") return "网络标识"
	if (fieldKey === "power_spec") return "供电规格"
	return normalizeDetailSectionTitle(registrySection)
}

function normalizeDetailSectionTitle(section: string | undefined) {
	return section?.replace(/\s+\d+$/, "")
}

function sortDetailRows(assetType: AssetRecord["type"], rows: AssetParameterRow[]) {
	const sectionOrder =
		assetType === "ont"
			? ["接入角色", "光纤接入", "路由与管理", "无线网络", "有线网络", "网络标识"]
			: assetType === "switch"
				? ["网络功能"]
				: []
	if (sectionOrder.length === 0) return rows
	return rows
		.map((row, index) => ({ row, index }))
		.sort((left, right) => {
			const leftOrder = sectionOrder.indexOf(left.row.section ?? "")
			const rightOrder = sectionOrder.indexOf(right.row.section ?? "")
			const normalizedLeft = leftOrder < 0 ? sectionOrder.length : leftOrder
			const normalizedRight = rightOrder < 0 ? sectionOrder.length : rightOrder
			return normalizedLeft - normalizedRight || left.index - right.index
		})
		.map(({ row }) => row)
}

function getParameterGroupSummary(rows: AssetParameterRow[]) {
	return rows.find((row) => row.value)?.value ?? "暂无数据"
}

function getParameterGroupIcon(category: AssetParameterCategoryId) {
	const iconByCategory = {
		appearance: BoxesIcon,
		functions: WavesIcon,
		power: BatteryIcon,
		electrical: ZapIcon,
		platform: BoxesIcon,
		processor: CpuIcon,
		graphics: ImageIcon,
		memory: MemoryStickIcon,
		storage: HardDriveIcon,
		display_output: MonitorIcon,
		network: NetworkIcon,
		management: SlidersHorizontalIcon,
		io: PlugIcon,
		display: MonitorIcon,
		imaging: ImageIcon,
		audio: Volume2Icon,
		sensors: RadioIcon,
		thermal_environment: ThermometerIcon,
		system: AppWindowIcon,
	} satisfies Record<AssetParameterCategoryId, typeof ListChecksIcon>
	const Icon = iconByCategory[category] ?? ListChecksIcon
	return createElement(Icon, { className: "size-4" })
}
