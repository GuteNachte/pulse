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
	Volume2Icon,
} from "lucide-react"
import { createElement } from "react"
import type { AssetInterfaceRecord, AssetRecord, AssetRelationRecord } from "@/types"
import { formatAssetParameterRowDisplay } from "./asset-parameter-display.ts"
import {
	ASSET_PARAMETER_CATEGORIES,
	getAssetArchiveField,
	type AssetParameterCategoryId,
} from "./asset-parameter-registry.ts"
import {
	getAssetFormSections,
	getMetadataString,
	getStatusLabel,
	NETWORK_ASSET_TYPES,
	type AssetFieldDefinition,
} from "./asset-schema.ts"
import {
	groupNetworkDeviceDetailRows,
	type NetworkDetailRow,
} from "./asset-network-detail-groups.ts"
import { normalizeMemorySpecification } from "./asset-memory-spec.ts"
import { normalizeNetworkInterfaceSummary } from "./asset-runtime-hardware.ts"
import { buildSwitchPortStatusRows } from "./asset-switch-port-status.ts"
import {
	formatInternetAddressTimestamp,
	getInternetAddressAutoRefreshSettings,
} from "./asset-internet-address-status.ts"
import type { AssetParameterGroup, AssetParameterRow } from "./components/asset-parameter-columns"

export type AssetParameterGroupContext = {
	interfaces?: AssetInterfaceRecord[]
	relations?: AssetRelationRecord[]
	assets?: AssetRecord[]
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
	const networkDetailRows: NetworkDetailRow<AssetParameterRow>[] = []
	const switchPortCapabilityRows: AssetParameterRow[] = []
	for (const field of fields.sort(
		(left, right) => (getAssetArchiveField(left.key)?.order ?? 0) - (getAssetArchiveField(right.key)?.order ?? 0)
	)) {
		const definition = getAssetArchiveField(field.key)
		if (definition?.scope !== "parameter" || !definition.category) continue
		const value = getAssetFieldDisplayValue(asset, field)
		if (!value) continue
		const row = {
			...fieldToParameterRow(field, value),
			section: getDetailRowSection(asset.type, field.key, originalSectionByKey.get(field.key), definition.section),
		}
		if (asset.type === "switch" && switchPortCapabilityFieldKeys.has(field.key)) {
			switchPortCapabilityRows.push(row)
			continue
		}
		if (definition.category === "network" && NETWORK_ASSET_TYPES.includes(asset.type)) {
			networkDetailRows.push({ fieldKey: field.key, row })
			continue
		}
		const rows = rowsByCategory.get(definition.category) ?? []
		rows.push(row)
		rowsByCategory.set(definition.category, rows)
	}

	const switchPortDetailRows = buildSwitchPortStatusRows(
		asset,
		context.interfaces ?? [],
		context.assets ?? [],
		context.relations ?? []
	)
	const groups = ASSET_PARAMETER_CATEGORIES.flatMap((category) => {
		if (category.id === "network" && networkDetailRows.length > 0) {
			return groupNetworkDeviceDetailRows(asset.type, networkDetailRows).map((group) => {
				const rows = group.rows.map((row) => ({ ...row, section: undefined }))
				return {
					id: group.id,
					title: group.title,
					summary: getParameterGroupSummary(rows),
					icon: getParameterGroupIcon("network"),
					rows,
				}
			})
		}
		const rows = sortDetailRows(asset.type, rowsByCategory.get(category.id) ?? [])
		if (rows.length === 0) return []
		return [
			{
				id: `asset-parameter-${category.id}`,
				title: category.title,
				summary: getParameterGroupSummary(rows),
				icon: getParameterGroupIcon(category.id),
				rows,
			},
		]
	})
	const switchPortRows = [...switchPortCapabilityRows, ...switchPortDetailRows]
	if (asset.type !== "switch" || switchPortRows.length === 0) return groups
	const switchPortGroup: AssetParameterGroup = {
		id: "switch-port-status",
		title: "网口状态",
		summary: switchPortDetailRows.length > 0 ? `${switchPortDetailRows.length} 个网口` : "已记录端口能力",
		icon: createElement(PlugIcon, { className: "size-4" }),
		rows: switchPortRows,
	}
	const networkIndex = groups.findIndex((group) => group.id === "switch-network-functions")
	const insertAt = networkIndex >= 0 ? networkIndex + 1 : 0
	return [...groups.slice(0, insertAt), switchPortGroup, ...groups.slice(insertAt)]
}

function buildServiceGroups(asset: AssetRecord) {
	const allowedSectionTitles =
		asset.type === "internet" ? new Set(["线路参数", "套餐与续费"]) : new Set(["互联网服务监控", "订阅与续费"])
	let groups: AssetParameterGroup[] = getAssetFormSections(asset.type).flatMap((section, index) => {
		if (!allowedSectionTitles.has(section.title)) return []
		const rows = section.fields.flatMap((field) => {
			const value = getAssetFieldDisplayValue(asset, field)
			return value ? [fieldToParameterRow(field, value)] : []
		})
		if (rows.length === 0) return []
		return [
			{
				id: `service-${index}`,
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
	const checkedAt = getMetadataString(asset.metadata, "public_ip_checked_at")
	const nextCheckAt = getMetadataString(asset.metadata, "public_ip_next_check_at")
	const settings = getInternetAddressAutoRefreshSettings(asset.metadata ?? {})
	const rows: AssetParameterRow[] = [
		{ label: "当前公网 IPv4", value: ipv4 || "尚未获取" },
		{ label: "当前公网 IPv6", value: ipv6 || "尚未获取" },
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
	const addressGroup: AssetParameterGroup = {
		id: "internet-public-addresses",
		title: "动态公网地址",
		summary: ipv4 || ipv6 || "尚未获取",
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
	return registrySection
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
		power: BatteryIcon,
		platform: BoxesIcon,
		processor: CpuIcon,
		graphics: ImageIcon,
		memory: MemoryStickIcon,
		storage: HardDriveIcon,
		network: NetworkIcon,
		io: PlugIcon,
		display: MonitorIcon,
		imaging: ImageIcon,
		audio: Volume2Icon,
		sensors: RadioIcon,
		thermal_environment: ThermometerIcon,
	} satisfies Record<AssetParameterCategoryId, typeof ListChecksIcon>
	const Icon = iconByCategory[category] ?? ListChecksIcon
	return createElement(Icon, { className: "size-4" })
}
