import type { AssetFormState } from "@/modules/asset-center/asset-import"
import { buildFixedSpecAssetName, buildInternetResourceName } from "@/modules/asset-center/asset-schema"
import type { AssetFieldDefinition, AssetFieldSection } from "@/modules/asset-center/asset-schema"

export const emptyAssetForm: AssetFormState = {
	name: "",
	type: "physical_host",
	status: "active",
	parent_asset: "",
	vendor: "",
	model: "",
	serial_number: "",
	management_ip: "",
	location: "",
	role: "",
	notes: "",
	metadata: {},
}

const ROOT_FIELD_KEYS = new Set([
	"name",
	"status",
	"parent_asset",
	"vendor",
	"model",
	"serial_number",
	"management_ip",
	"location",
	"role",
	"notes",
])

const ASSET_MISSING_FIELD_ALIASES: Record<string, string[]> = {
	vendor: ["厂商", "品牌", "运营商"],
	model: ["型号", "规格", "套餐", "线路名称"],
	internal_model: ["内部型号", "产品内部型号", "内部代号"],
	location: ["资产位置", "位置", "房间"],
	role: ["用途", "角色"],
	management_ip: ["IPv4", "IP", "管理 IP", "固定 IP"],
	support_url: ["厂家支持页", "支持页", "官网"],
	product_url: ["厂家产品页", "官方产品页", "规格页"],
	official_url: ["厂家官网资料页", "官网资料页", "说明书"],
	fixed_ipv4: ["IPv4", "IP", "固定 IP", "固定 IPv4", "URL"],
	fixed_ipv6: ["IPv6", "固定 IPv6"],
	mac: ["MAC", "主 MAC", "管理 MAC"],
	port_count: ["端口数量"],
	default_port_speed_mbps: ["端口速率"],
	down_mbps: ["下行带宽"],
	up_mbps: ["上行带宽"],
	access_mode: ["接入方式"],
	cpu_model: ["CPU 型号"],
	cpu_vendor: ["CPU 厂商", "CPU 品牌"],
	cpu_support_url: ["CPU 支持页", "CPU 官方规格页"],
	memory_gb: ["内存"],
	primary_nic_speed_mbps: ["主网卡速率"],
	motherboard_vendor: ["主板品牌"],
	motherboard_model: ["主板型号"],
	motherboard_support_url: ["主板支持页", "主板驱动页"],
	bios_vendor: ["BIOS 厂商"],
	gpu_detail: ["显卡品牌", "显卡型号"],
	gpu_vendor: ["GPU 厂商", "芯片厂商"],
	gpu_model: ["GPU 型号", "芯片型号"],
	gpu_board_vendor: ["显卡板卡品牌"],
	gpu_support_url: ["显卡支持页", "显卡驱动页"],
	gpu_vram_gb: ["显存"],
	memory_detail: ["内存品牌", "内存规格"],
	memory_vendor: ["内存品牌"],
	memory_model: ["内存型号", "内存颗粒"],
	memory_type: ["内存类型"],
	memory_speed_mhz: ["内存频率"],
	memory_slots_summary: ["内存插槽"],
	memory_support_url: ["内存支持页", "内存保修页"],
	storage_detail: ["硬盘品牌", "硬盘型号"],
	storage_vendor: ["硬盘品牌", "存储品牌"],
	storage_model: ["硬盘型号", "存储型号"],
	storage_media: ["存储介质", "总线"],
	storage_serial_note: ["硬盘序列号"],
	storage_support_url: ["存储支持页", "硬盘支持页", "固件页"],
	nic_detail: ["网卡品牌", "网卡型号"],
	nic_vendor: ["有线网卡品牌"],
	nic_model: ["有线网卡型号"],
	wifi_vendor: ["无线网卡品牌"],
	wifi_model: ["无线网卡型号"],
	nic_support_url: ["网卡支持页", "网卡驱动页"],
	wifi_support_url: ["无线网卡支持页", "无线网卡驱动页"],
	chassis_power_detail: ["机箱", "电源"],
	chassis_vendor: ["机箱品牌"],
	chassis_model: ["机箱型号"],
	chassis_support_url: ["机箱支持页"],
	psu_vendor: ["电源品牌"],
	psu_model: ["电源型号", "电源功率"],
	psu_support_url: ["电源支持页", "电源保修页"],
	hardware_fingerprint_note: ["专项识别依据", "硬件 ID", "DMI", "PCI", "SMART"],
	hardware_match_note: ["专项识别匹配备注", "匹配来源", "硬件资料来源"],
	vcpu: ["vCPU"],
	disk_gb: ["磁盘"],
	url: ["URL"],
	internal_url: ["URL"],
	external_url: ["URL"],
	endpoint_scope: ["端点类型"],
	expected_owner: ["归属资产"],
	protocol: ["协议"],
	gateway_name: ["网关"],
	entity_id: ["实体 ID"],
	power_mode: ["供电方式"],
	custom_category: ["自定义分类"],
}

export function getFocusedAssetFormSections(options: {
	formSections: AssetFieldSection[]
	profileFocus: boolean
	missingFields: string[]
}) {
	if (!options.profileFocus || options.missingFields.length === 0) {
		return options.formSections
	}
	const focusedSections = options.formSections
		.map((section) => ({
			...section,
			fields: section.fields.filter((field) => matchesMissingAssetField(field, options.missingFields)),
		}))
		.filter((section) => section.fields.length > 0)
	return focusedSections.length > 0 ? focusedSections : options.formSections
}

export function getAssetFormFieldValue(form: AssetFormState, field: AssetFieldDefinition) {
	if (field.source === "metadata") {
		return form.metadata[field.key] ?? ""
	}
	if (!ROOT_FIELD_KEYS.has(field.key)) {
		return ""
	}
	const value = form[field.key as keyof AssetFormState]
	return typeof value === "string" ? value : ""
}

export function buildSuggestedAssetName(form: AssetFormState) {
	if (form.type === "internet") {
		return buildInternetResourceName(form.vendor)
	}
	const fixedSpecName = buildFixedSpecAssetName(form.type, form.model, form.metadata.internal_model)
	if (fixedSpecName) return fixedSpecName
	const model = form.model.trim()
	const internalModel = form.metadata.internal_model?.trim() ?? ""
	if (!model) return ""
	if (!internalModel || model.includes(`(${internalModel})`) || model.includes(`（${internalModel}）`)) {
		return model
	}
	return `${model} (${internalModel})`
}

export function shouldReplaceAssetNameWithSuggestion(current: AssetFormState) {
	const currentName = current.name.trim()
	return !currentName || currentName === buildSuggestedAssetName(current)
}

function matchesMissingAssetField(field: AssetFieldDefinition, missingFields: string[]) {
	const normalizedField = normalizeAssetFieldLabel(field.label)
	const aliases = ASSET_MISSING_FIELD_ALIASES[field.key] ?? []
	return missingFields.some((missing) => {
		const normalizedMissing = normalizeAssetFieldLabel(missing)
		if (!normalizedMissing) return false
		if (normalizedField.includes(normalizedMissing) || normalizedMissing.includes(normalizedField)) {
			return true
		}
		return aliases.some((alias) => {
			const normalizedAlias = normalizeAssetFieldLabel(alias)
			return normalizedAlias.includes(normalizedMissing) || normalizedMissing.includes(normalizedAlias)
		})
	})
}

function normalizeAssetFieldLabel(value: string) {
	return value
		.toLowerCase()
		.replace(/\s+/g, "")
		.replace(/[/:：／·\-_()（）]/g, "")
}
