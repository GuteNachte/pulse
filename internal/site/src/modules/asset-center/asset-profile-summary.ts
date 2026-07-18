import type { AssetMaintenanceRecord, AssetRecord, AssetRelationRecord } from "@/types"
import { isAssetLocationNotApplicable } from "./asset-location.ts"
import {
	HOST_ASSET_TYPES,
	NETWORK_ASSET_TYPES,
	PERSONAL_ASSET_TYPES,
	SMART_HOME_ASSET_TYPES,
	getAssetTypeLabel,
	getMetadataNumber,
	getMetadataString,
	isPhoneVariantSpecRequired,
} from "./asset-schema.ts"
import { formatInternetBandwidth, getInternetOptionLabel } from "./asset-type-specs.ts"

export function getInternetBandwidthLabel(asset: AssetRecord) {
	const down = getMetadataNumber(asset.metadata, "down_mbps")
	const up = getMetadataNumber(asset.metadata, "up_mbps")
	if (!down && !up) {
		return ""
	}
	return `下行 ${formatInternetBandwidth(down)} / 上行 ${formatInternetBandwidth(up)}`
}

export function getAssetLocationLabel(asset: AssetRecord) {
	if (isAssetLocationNotApplicable(asset.type)) return "无"
	return asset.location?.trim() || getMetadataString(asset.metadata, "room") || "未填写位置"
}

export type AssetLifecycleTone = "neutral" | "ok" | "warning" | "danger"

export type AssetCompletenessStatus = {
	score: number
	label: string
	tone: AssetLifecycleTone
	missing: string[]
}

export type AssetCompletenessContext = {
	hasInternetUplink?: boolean
}

export function getAssetCompleteness(asset: AssetRecord, context: AssetCompletenessContext = {}): AssetCompletenessStatus {
	const checks = getAssetCompletenessChecks(asset, context)
	const missing = checks.filter((check) => !check.ok).map((check) => check.label)
	const score = checks.length > 0 ? Math.round(((checks.length - missing.length) / checks.length) * 100) : 100
	if (score >= 90) return { score, label: "资料完整", tone: "ok", missing }
	if (score >= 70) return { score, label: "资料可用", tone: "neutral", missing }
	if (score >= 45) return { score, label: "资料待补", tone: "warning", missing }
	return { score, label: "资料缺口大", tone: "danger", missing }
}

export function needsAssetProfileAttention(asset: AssetRecord, context: AssetCompletenessContext = {}) {
	return getAssetCompleteness(asset, context).score < 70
}

export function buildInternetUplinkAssetIds(relations: AssetRelationRecord[]) {
	const ids = new Set<string>()
	for (const relation of relations) {
		if (relation.kind === "connected_to" && getMetadataString(relation.metadata, "link_kind") === "internet") {
			ids.add(relation.source_asset)
		}
	}
	return ids
}

export function getLatestMaintenanceRecord(records: AssetMaintenanceRecord[]) {
	return [...records].sort((a, b) => {
		const aTime = new Date(a.event_date || a.created).getTime()
		const bTime = new Date(b.event_date || b.created).getTime()
		return bTime - aTime
	})[0]
}

export function getAssetSummaryRows(asset: AssetRecord): { label: string; value: string; mono?: boolean }[] {
	const rows: { label: string; value: string; mono?: boolean }[] = []
	const metadata = asset.metadata
	if (asset.type === "internet") {
		pushRow(rows, "运营商", asset.vendor)
		pushRow(rows, "线路技术", getInternetOptionLabel("access_technology", getMetadataString(metadata, "access_technology")))
		pushRow(rows, "认证方式", getInternetOptionLabel("auth_mode", getMetadataString(metadata, "auth_mode")))
		pushRow(rows, "带宽", getInternetBandwidthLabel(asset), true)
		pushRow(
			rows,
			"公网",
			getMetadataString(metadata, "public_ipv4") || getMetadataString(metadata, "public_ipv6"),
			true
		)
		return rows
	}
	if (NETWORK_ASSET_TYPES.includes(asset.type)) {
		pushRow(rows, "型号", [asset.vendor, asset.model].filter(Boolean).join(" "))
		pushRow(rows, "IPv4", getMetadataString(metadata, "fixed_ipv4") || asset.management_ip, true)
		pushRow(rows, "端口", formatPortSummary(metadata), true)
		pushRow(rows, "位置", asset.location)
		return rows
	}
	if (HOST_ASSET_TYPES.includes(asset.type) || asset.type === "vm") {
		pushRow(rows, "IPv4", getMetadataString(metadata, "fixed_ipv4") || asset.management_ip, true)
		pushRow(rows, "规格", formatHostSpec(metadata))
		pushRow(rows, "网卡", formatSpeed(getMetadataNumber(metadata, "primary_nic_speed_mbps")), true)
		return rows
	}
	if (PERSONAL_ASSET_TYPES.includes(asset.type)) {
		pushRow(rows, "IPv4", getMetadataString(metadata, "fixed_ipv4") || asset.management_ip, true)
		pushRow(rows, "容量", formatStorageGb(getMetadataNumber(metadata, "storage_gb")), true)
		pushRow(rows, "连接", getMetadataString(metadata, "wifi_standard"))
		return rows
	}
	if (asset.type === "camera") {
		pushRow(rows, "IPv4", getMetadataString(metadata, "fixed_ipv4") || asset.management_ip, true)
		pushRow(rows, "协议", getMetadataString(metadata, "protocol"))
		pushRow(rows, "规格", getMetadataString(metadata, "resolution"))
		pushRow(rows, "供电", getMetadataString(metadata, "power_mode"))
		return rows
	}
	if (asset.type === "printer") {
		pushRow(rows, "IPv4", getMetadataString(metadata, "fixed_ipv4") || asset.management_ip, true)
		pushRow(rows, "类型", getMetadataString(metadata, "printer_type"))
		pushRow(rows, "耗材", getMetadataString(metadata, "supplies"))
		pushRow(rows, "纸张", getMetadataString(metadata, "paper_size"))
		return rows
	}
	if (asset.type === "ups") {
		pushRow(rows, "容量", formatUpsCapacity(metadata), true)
		pushRow(rows, "电池", getMetadataString(metadata, "battery_model"))
		pushRow(rows, "协议", getMetadataString(metadata, "protocol"))
		pushRow(rows, "保护", getMetadataString(metadata, "protected_assets"))
		return rows
	}
	if (SMART_HOME_ASSET_TYPES.includes(asset.type)) {
		pushRow(rows, "房间", getMetadataString(metadata, "room") || asset.location)
		pushRow(rows, "协议", getMetadataString(metadata, "protocol"))
		pushRow(rows, "网关", getMetadataString(metadata, "gateway_name"))
		pushRow(rows, "实体", getMetadataString(metadata, "entity_id"), true)
		return rows
	}
	if (asset.type === "custom") {
		pushRow(rows, "IPv4", getMetadataString(metadata, "fixed_ipv4") || asset.management_ip, true)
		pushRow(rows, "分类", getMetadataString(metadata, "custom_category"))
		pushRow(rows, "MAC", getMetadataString(metadata, "mac"), true)
		pushRow(rows, "位置", asset.location)
		return rows
	}
	if (asset.type === "web_endpoint") {
		pushRow(rows, "URL", getMetadataString(metadata, "url") || getMetadataString(metadata, "internal_url"))
		pushRow(rows, "服务", getMetadataString(metadata, "service_category"))
		pushRow(rows, "范围", getMetadataString(metadata, "endpoint_scope"))
		pushRow(rows, "到期", getMetadataString(metadata, "renewal_date"))
		pushRow(rows, "计费", getMetadataString(metadata, "billing_cycle"))
		pushRow(rows, "承载", getMetadataString(metadata, "expected_owner"))
		return rows
	}
	return rows
}

export function buildAssetSearchText(asset: AssetRecord) {
	return [
		asset.name,
		asset.vendor,
		asset.model,
		asset.serial_number,
		asset.management_ip,
		asset.location,
		asset.role,
		getAssetTypeLabel(asset.type),
		...Object.values(asset.metadata ?? {}).map((value) =>
			typeof value === "string" || typeof value === "number" ? String(value) : ""
		),
	]
		.filter(Boolean)
		.join(" ")
		.toLowerCase()
}

function pushRow(
	rows: { label: string; value: string; mono?: boolean }[],
	label: string,
	value?: string,
	mono?: boolean
) {
	if (value) {
		rows.push({ label, value, mono })
	}
}

function getAssetCompletenessChecks(asset: AssetRecord, context: AssetCompletenessContext) {
	const metadata = asset.metadata
	if (asset.type === "internet") {
		return [
			{ label: "资源名称", ok: Boolean(asset.name?.trim()) },
			{ label: "运营商", ok: Boolean(asset.vendor?.trim()) },
			{ label: "使用状态", ok: Boolean(asset.status) },
			{ label: "线路接入技术", ok: Boolean(getMetadataString(metadata, "access_technology")) },
			{ label: "联网认证方式", ok: Boolean(getMetadataString(metadata, "auth_mode")) },
			{ label: "下行带宽", ok: (getMetadataNumber(metadata, "down_mbps") ?? 0) > 0 },
			{ label: "上行带宽", ok: (getMetadataNumber(metadata, "up_mbps") ?? 0) > 0 },
			{ label: "接入设备", ok: context.hasInternetUplink === true },
		]
	}
	const hasOfficialReference = Boolean(getMetadataString(metadata, "official_url"))
	const checks: { label: string; ok: boolean }[] = [
		{ label: "资产名称", ok: Boolean(asset.name?.trim()) },
		...(isAssetLocationNotApplicable(asset.type)
			? []
			: [{ label: "资产位置", ok: Boolean(asset.location?.trim() || getMetadataString(metadata, "room")) }]),
		{ label: "用途 / 角色", ok: Boolean(asset.role?.trim()) },
	]
	if (NETWORK_ASSET_TYPES.includes(asset.type)) {
		checks.push(
			{ label: "厂商 / 品牌", ok: Boolean(asset.vendor?.trim()) },
			{ label: "型号", ok: Boolean(asset.model?.trim()) },
			{ label: "厂家资料页", ok: hasOfficialReference },
			{ label: "IPv4", ok: Boolean(getMetadataString(metadata, "fixed_ipv4") || asset.management_ip?.trim()) },
			{ label: "MAC", ok: Boolean(getMetadataString(metadata, "mac")) },
			{ label: "端口数量", ok: Boolean(getMetadataNumber(metadata, "port_count")) },
			{ label: "端口速率", ok: Boolean(getMetadataNumber(metadata, "default_port_speed_mbps")) }
		)
		return checks
	}
	if (HOST_ASSET_TYPES.includes(asset.type)) {
		checks.push(
			{ label: "厂商 / 品牌", ok: Boolean(asset.vendor?.trim()) },
			{ label: "型号", ok: Boolean(asset.model?.trim()) },
			{ label: "厂家资料页", ok: hasOfficialReference },
			{ label: "IPv4", ok: Boolean(getMetadataString(metadata, "fixed_ipv4") || asset.management_ip?.trim()) },
			{ label: "CPU 型号", ok: Boolean(getMetadataString(metadata, "cpu_model")) },
			{
				label: "内存",
				ok: Boolean(getMetadataNumber(metadata, "memory_gb") || getMetadataString(metadata, "memory_detail")),
			},
			{ label: "主板型号", ok: Boolean(getMetadataString(metadata, "motherboard_model")) },
			{
				label: "存储型号",
				ok: Boolean(getMetadataString(metadata, "storage_model") || getMetadataString(metadata, "storage_detail")),
			},
			{
				label: "网卡型号",
				ok: Boolean(getMetadataString(metadata, "nic_model") || getMetadataString(metadata, "nic_detail")),
			}
		)
		return checks
	}
	if (asset.type === "vm") {
		checks.push(
			{ label: "宿主资产", ok: Boolean(asset.parent_asset) },
			{ label: "IPv4", ok: Boolean(getMetadataString(metadata, "fixed_ipv4") || asset.management_ip?.trim()) }
		)
		return checks
	}
	if (asset.type === "web_endpoint") {
		checks.push(
			{ label: "服务类型", ok: Boolean(getMetadataString(metadata, "service_category")) },
			{
				label: "URL",
				ok: Boolean(
					getMetadataString(metadata, "url") ||
						getMetadataString(metadata, "internal_url") ||
						getMetadataString(metadata, "external_url")
				),
			},
			{ label: "检测范围", ok: Boolean(getMetadataString(metadata, "endpoint_scope")) },
			{ label: "归属资产", ok: Boolean(getMetadataString(metadata, "expected_owner")) }
		)
		return checks
	}
	if (SMART_HOME_ASSET_TYPES.includes(asset.type)) {
		checks.push(
			{ label: "厂商 / 品牌", ok: Boolean(asset.vendor?.trim()) },
			{ label: "型号", ok: Boolean(asset.model?.trim()) },
			{ label: "厂家资料页", ok: hasOfficialReference },
			{ label: "协议", ok: Boolean(getMetadataString(metadata, "protocol")) },
			{ label: "网关", ok: Boolean(getMetadataString(metadata, "gateway_name")) },
			{ label: "实体 ID", ok: Boolean(getMetadataString(metadata, "entity_id")) },
			{ label: "供电方式", ok: Boolean(getMetadataString(metadata, "power_mode")) }
		)
		return checks
	}
	if (PERSONAL_ASSET_TYPES.includes(asset.type)) {
		checks.push(
			{ label: "厂商 / 品牌", ok: Boolean(asset.vendor?.trim()) },
			{ label: "型号", ok: Boolean(asset.model?.trim()) },
			{ label: "厂家资料页", ok: hasOfficialReference },
			{ label: "IPv4", ok: Boolean(getMetadataString(metadata, "fixed_ipv4") || asset.management_ip?.trim()) },
			{ label: "MAC", ok: Boolean(getMetadataString(metadata, "mac")) },
			{ label: "供电方式", ok: Boolean(getMetadataString(metadata, "power_mode")) }
		)
		if (isPhoneVariantSpecRequired(asset.type)) {
			checks.push(
				{ label: "运行内存", ok: Boolean(getMetadataNumber(metadata, "memory_gb")) },
				{ label: "存储容量", ok: Boolean(getMetadataNumber(metadata, "storage_gb")) }
			)
		}
		return checks
	}
	if (asset.type === "camera" || asset.type === "printer" || asset.type === "ups") {
		checks.push(
			{ label: "厂商 / 品牌", ok: Boolean(asset.vendor?.trim()) },
			{ label: "型号", ok: Boolean(asset.model?.trim()) },
			{ label: "厂家资料页", ok: hasOfficialReference },
			{ label: "IPv4", ok: Boolean(getMetadataString(metadata, "fixed_ipv4") || asset.management_ip?.trim()) },
			{ label: "MAC", ok: Boolean(getMetadataString(metadata, "mac")) }
		)
		return checks
	}
	checks.push(
		{ label: "自定义分类", ok: Boolean(getMetadataString(metadata, "custom_category")) },
		{
			label: "IPv4 或 MAC",
			ok: Boolean(getMetadataString(metadata, "fixed_ipv4") || getMetadataString(metadata, "mac")),
		}
	)
	return checks
}

function formatPortSummary(metadata?: Record<string, unknown>) {
	const portCount = getMetadataNumber(metadata, "port_count")
	const speed = formatSpeed(getMetadataNumber(metadata, "default_port_speed_mbps"))
	if (!portCount && !speed) return ""
	if (!portCount) return speed
	return `${portCount} 口${speed ? ` · ${speed}` : ""}`
}

function formatHostSpec(metadata?: Record<string, unknown>) {
	const cpu = getMetadataString(metadata, "cpu_model")
	const memory = getMetadataNumber(metadata, "memory_gb")
	const storage = getMetadataString(metadata, "storage_summary")
	return [cpu, memory ? `${memory}GB` : "", storage].filter(Boolean).join(" · ")
}

function formatStorageGb(value?: number) {
	return value ? `${value}GB` : ""
}

function formatUpsCapacity(metadata?: Record<string, unknown>) {
	const va = getMetadataNumber(metadata, "capacity_va")
	const watts = getMetadataNumber(metadata, "capacity_w")
	return [va ? `${va}VA` : "", watts ? `${watts}W` : ""].filter(Boolean).join(" / ")
}

function formatSpeed(value?: number) {
	if (!value) return ""
	if (value >= 1000) {
		const gbps = value / 1000
		return `${Number.isInteger(gbps) ? gbps.toFixed(0) : gbps.toFixed(1)}G`
	}
	return `${value}M`
}

