import type { AssetStatus, AssetType } from "../../types"

export type AssetFieldInputMode =
	| "manual_required"
	| "manual_optional"
	| "fixed_choice"
	| "captured_candidate"
	| "not_applicable"

export type AssetTypeFieldSpec = {
	key: string
	label: string
	group: string
	inputMode: AssetFieldInputMode
	source: "asset" | "metadata"
	type?: "text" | "number" | "date" | "url" | "select"
	options?: readonly { value: string; label: string }[]
	placeholder?: string
	unit?: string
	readOnly?: boolean
	span?: "full"
}

export type AssetTypeSpec = {
	type: AssetType
	detailTitle: string
	providerOptions: readonly { value: string; label: string }[]
	statusOptions: readonly { value: AssetStatus; label: string }[]
	notApplicable: {
		location: boolean
		role: boolean
		interfaces: boolean
		hardware: boolean
	}
	sections: readonly { title: string; fields: readonly AssetTypeFieldSpec[] }[]
}

const internetProviderOptions = [
	{ value: "中国电信", label: "中国电信" },
	{ value: "中国联通", label: "中国联通" },
	{ value: "中国移动", label: "中国移动" },
] as const

const internetStatusOptions = [
	{ value: "active", label: "使用中" },
	{ value: "inactive", label: "暂停服务" },
	{ value: "retired", label: "已注销" },
] as const

const accessTechnologyOptions = [
	{ value: "ftth", label: "家庭光纤宽带（FTTH）" },
	{ value: "dedicated_line", label: "专线" },
	{ value: "mobile", label: "移动网络（4G / 5G）" },
] as const

const authModeOptions = [
	{ value: "pppoe", label: "PPPoE 拨号" },
	{ value: "dhcp", label: "DHCP / IPoE 自动获取" },
	{ value: "static", label: "静态 IP" },
] as const

const billingCycleOptions = [
	{ value: "monthly", label: "月付" },
	{ value: "quarterly", label: "季付" },
	{ value: "semiannual", label: "半年付" },
	{ value: "yearly", label: "年付" },
] as const

const yesNoOptions = [
	{ value: "yes", label: "是" },
	{ value: "no", label: "否" },
] as const

const ontCarrierOptions = [
	{ value: "中国电信", label: "中国电信" },
	{ value: "中国联通", label: "中国联通" },
	{ value: "中国移动", label: "中国移动" },
] as const

const ontOperatingRoleOptions = [
	{ value: "bridge_ont", label: "桥接光猫" },
	{ value: "router_ont", label: "光猫路由一体机" },
	{ value: "ifttr_main_gateway", label: "iFTTR 主网关" },
] as const

const enabledStatusOptions = [
	{ value: "enabled", label: "启用" },
	{ value: "disabled", label: "未启用" },
] as const

const supportedStatusOptions = [
	{ value: "supported", label: "支持" },
	{ value: "unsupported", label: "不支持" },
] as const

const ontStatusOptions = [
	{ value: "active", label: "使用中" },
	{ value: "inactive", label: "未启用" },
	{ value: "retired", label: "已停用" },
] as const

export const internetAssetTypeSpec: AssetTypeSpec = {
	type: "internet",
	detailTitle: "线路档案",
	providerOptions: internetProviderOptions,
	statusOptions: internetStatusOptions,
	notApplicable: { location: true, role: true, interfaces: true, hardware: true },
	sections: [
		{
			title: "基础资料",
			fields: [
				{
					key: "vendor",
					label: "运营商",
					group: "基础资料",
					inputMode: "fixed_choice",
					source: "asset",
					type: "select",
					options: internetProviderOptions,
				},
			],
		},
		{
			title: "线路参数",
			fields: [
				{
					key: "access_technology",
					label: "线路接入技术",
					group: "线路参数",
					inputMode: "fixed_choice",
					source: "metadata",
					type: "select",
					options: accessTechnologyOptions,
				},
				{
					key: "auth_mode",
					label: "联网认证方式",
					group: "线路参数",
					inputMode: "fixed_choice",
					source: "metadata",
					type: "select",
					options: authModeOptions,
				},
				{
					key: "down_mbps",
					label: "下行带宽",
					group: "线路参数",
					inputMode: "manual_required",
					source: "metadata",
					type: "number",
					placeholder: "1000",
					unit: "Mbps",
				},
				{
					key: "up_mbps",
					label: "上行带宽",
					group: "线路参数",
					inputMode: "manual_required",
					source: "metadata",
					type: "number",
					placeholder: "300",
					unit: "Mbps",
				},
			],
		},
		{
			title: "动态公网地址",
			fields: [
				{
					key: "public_ipv4",
					label: "公网 IPv4",
					group: "动态公网地址",
					inputMode: "captured_candidate",
					source: "metadata",
					readOnly: true,
				},
				{
					key: "public_ipv6",
					label: "公网 IPv6",
					group: "动态公网地址",
					inputMode: "captured_candidate",
					source: "metadata",
					readOnly: true,
				},
			],
		},
		{
			title: "套餐与续费",
			fields: [
				{
					key: "package_name",
					label: "套餐名称",
					group: "套餐与续费",
					inputMode: "manual_optional",
					source: "metadata",
					placeholder: "例如 联通千兆融合套餐",
				},
				{
					key: "recurring_price_cny",
					label: "套餐费用（元）",
					group: "套餐与续费",
					inputMode: "manual_optional",
					source: "metadata",
					type: "number",
					placeholder: "165",
				},
				{
					key: "billing_cycle",
					label: "计费周期",
					group: "套餐与续费",
					inputMode: "fixed_choice",
					source: "metadata",
					type: "select",
					options: billingCycleOptions,
				},
				{
					key: "renewal_date",
					label: "到期日期",
					group: "套餐与续费",
					inputMode: "manual_optional",
					source: "metadata",
					type: "date",
				},
				{
					key: "auto_renew",
					label: "自动续费",
					group: "套餐与续费",
					inputMode: "fixed_choice",
					source: "metadata",
					type: "select",
					options: yesNoOptions,
				},
			],
		},
		{
			title: "备注",
			fields: [
				{
					key: "notes",
					label: "备注",
					group: "备注",
					inputMode: "manual_optional",
					source: "asset",
					span: "full",
				},
			],
		},
	],
}

export const ontAssetTypeSpec: AssetTypeSpec = {
	type: "ont",
	detailTitle: "光猫 / ONT 档案",
	providerOptions: [],
	statusOptions: ontStatusOptions,
	notApplicable: { location: false, role: false, interfaces: false, hardware: false },
	sections: [
		{
			title: "身份与归属",
			fields: [
				capturedField("product_series", "产品系列", "身份与归属"),
				fixedChoiceField("carrier", "运营商", "身份与归属", ontCarrierOptions),
				fixedChoiceField("operating_role", "工作角色", "身份与归属", ontOperatingRoleOptions),
				{ ...capturedField("manufacture_date", "生产日期", "身份与归属"), type: "date" },
				capturedField("color", "外观颜色", "身份与归属"),
			],
		},
		{
			title: "光纤接入",
			fields: [
				capturedField("onu_type", "ONU 类型", "光纤接入"),
				capturedField("pon_standard", "PON 标准", "光纤接入"),
				capturedField("pon_uplink_capacity", "PON 上联能力", "光纤接入"),
				capturedField("optical_connector", "光纤连接器", "光纤接入"),
				{ ...capturedField("downstream_optical_port_count", "下联光口数量", "光纤接入"), type: "number" },
				fixedChoiceField("downstream_optical_status", "下联光口状态", "光纤接入", enabledStatusOptions),
			],
		},
		{
			title: "路由与管理",
			fields: [
				fixedChoiceField("router_status", "主路由", "路由与管理", enabledStatusOptions),
				fixedChoiceField("gateway_status", "主网关", "路由与管理", enabledStatusOptions),
				fixedChoiceField("dhcp_status", "DHCP", "路由与管理", enabledStatusOptions),
				{
					key: "fixed_ipv4",
					label: "管理 IPv4",
					group: "路由与管理",
					inputMode: "manual_required",
					source: "metadata",
				},
				{
					key: "fixed_ipv6",
					label: "管理 IPv6",
					group: "路由与管理",
					inputMode: "manual_optional",
					source: "metadata",
					placeholder: "无",
				},
				{
					key: "management_url",
					label: "管理 URL",
					group: "路由与管理",
					inputMode: "manual_optional",
					source: "metadata",
					type: "url",
				},
				{
					key: "lan_subnet",
					label: "LAN 网段",
					group: "路由与管理",
					inputMode: "manual_optional",
					source: "metadata",
				},
			],
		},
		{
			title: "无线网络",
			fields: [
				capturedField("wifi_standard", "无线标准", "无线网络"),
				fixedChoiceField("wifi_24_supported", "2.4 GHz 支持", "无线网络", supportedStatusOptions),
				fixedChoiceField("wifi_24_enabled", "2.4 GHz 状态", "无线网络", enabledStatusOptions),
				fixedChoiceField("wifi_5_supported", "5 GHz 支持", "无线网络", supportedStatusOptions),
				fixedChoiceField("wifi_5_enabled", "5 GHz 状态", "无线网络", enabledStatusOptions),
				fixedChoiceField("wps_supported", "WPS", "无线网络", supportedStatusOptions),
			],
		},
		{
			title: "有线网络",
			fields: [
				{ ...capturedField("lan_port_count", "LAN 总数", "有线网络"), type: "number" },
				{ ...capturedField("lan_2500_count", "2.5GbE LAN 数量", "有线网络"), type: "number" },
				{ ...capturedField("lan_1000_count", "1GbE LAN 数量", "有线网络"), type: "number" },
			],
		},
		{
			title: "其他端口与电源",
			fields: [
				{ ...capturedField("usb_port_count", "USB 数量", "其他端口与电源"), type: "number" },
				{ ...capturedField("voice_port_count", "电话接口数量", "其他端口与电源"), type: "number" },
				capturedField("power_spec", "电源规格", "其他端口与电源"),
				fixedChoiceField("indicator_control", "指示灯控制", "其他端口与电源", supportedStatusOptions),
				fixedChoiceField("wireless_control", "无线 / WPS 控制", "其他端口与电源", supportedStatusOptions),
				fixedChoiceField("reset_supported", "复位能力", "其他端口与电源", supportedStatusOptions),
				fixedChoiceField("power_switch_supported", "电源开关", "其他端口与电源", supportedStatusOptions),
			],
		},
		{
			title: "设备身份标识",
			fields: [
				capturedField("product_number", "产品编号", "设备身份标识"),
				capturedField("pon_sn", "PON SN", "设备身份标识"),
				{ ...capturedField("serial_number", "设备序列号", "设备身份标识"), source: "asset" },
				capturedField("mac", "MAC", "设备身份标识"),
				{ ...capturedField("radio_approval_code", "无线电型号核准编号", "设备身份标识"), span: "full" },
			],
		},
	],
}

function capturedField(key: string, label: string, group: string): AssetTypeFieldSpec {
	return { key, label, group, inputMode: "captured_candidate", source: "metadata" }
}

function fixedChoiceField(
	key: string,
	label: string,
	group: string,
	options: readonly { value: string; label: string }[]
): AssetTypeFieldSpec {
	return { key, label, group, inputMode: "fixed_choice", source: "metadata", type: "select", options }
}

export function getAssetTypeSpec(type: AssetType) {
	if (type === "internet") return internetAssetTypeSpec
	if (type === "ont") return ontAssetTypeSpec
	return undefined
}

export function getAssetTypeCapabilities(type: AssetType) {
	const notApplicable = getAssetTypeSpec(type)?.notApplicable
	return {
		showLocation: !notApplicable?.location,
		showRole: !notApplicable?.role,
		showHardware: !notApplicable?.hardware,
		showInterfaces: !notApplicable?.interfaces,
	}
}

export function normalizeInternetProvider(value: string) {
	const normalized = value.trim()
	const aliases: Record<string, string> = {
		电信: "中国电信",
		联通: "中国联通",
		移动: "中国移动",
	}
	return aliases[normalized] ?? normalized
}

export function formatInternetBandwidth(value?: number) {
	if (!value || !Number.isFinite(value) || value <= 0) return ""
	if (value >= 1000) {
		const gbps = value / 1000
		return `${Number.isInteger(gbps) ? gbps.toFixed(0) : gbps.toFixed(1)} Gbps`
	}
	return `${Math.round(value)} Mbps`
}

export function getInternetStatusLabel(status: AssetStatus) {
	return internetStatusOptions.find((option) => option.value === status)?.label ?? status
}

export function getInternetOptionLabel(fieldKey: string, value: string) {
	return getAssetTypeOptionLabel("internet", fieldKey, value)
}

export function getAssetTypeOptionLabel(type: AssetType, fieldKey: string, value: string) {
	const field = getAssetTypeSpec(type)?.sections.flatMap((section) => section.fields).find((item) => item.key === fieldKey)
	return field?.options?.find((option) => option.value === value)?.label ?? value
}

export function validateInternetAssetValues(values: {
	name: string
	provider: string
	status: AssetStatus
	accessTechnology: string
	authMode: string
	downMbps?: number
	upMbps?: number
}) {
	const errors: string[] = []
	if (!values.name.trim()) errors.push("资源名称")
	if (!internetProviderOptions.some((option) => option.value === normalizeInternetProvider(values.provider))) {
		errors.push("运营商")
	}
	if (!internetStatusOptions.some((option) => option.value === values.status)) errors.push("使用状态")
	if (!accessTechnologyOptions.some((option) => option.value === values.accessTechnology)) errors.push("线路接入技术")
	if (!authModeOptions.some((option) => option.value === values.authMode)) errors.push("联网认证方式")
	if (!values.downMbps || values.downMbps <= 0) errors.push("下行带宽")
	if (!values.upMbps || values.upMbps <= 0) errors.push("上行带宽")
	return errors
}

export function validateOntAssetValues(values: {
	name: string
	vendor: string
	model: string
	status: AssetStatus
	location: string
	carrier: string
	operatingRole: string
}) {
	const errors: string[] = []
	if (!values.name.trim()) errors.push("资产名称")
	if (!values.vendor.trim()) errors.push("厂商 / 品牌")
	if (!values.model.trim()) errors.push("型号 / 规格")
	if (!ontStatusOptions.some((option) => option.value === values.status)) errors.push("使用状态")
	if (!values.location.trim()) errors.push("位置")
	if (!ontCarrierOptions.some((option) => option.value === values.carrier)) errors.push("运营商")
	if (!ontOperatingRoleOptions.some((option) => option.value === values.operatingRole)) errors.push("工作角色")
	return errors
}
