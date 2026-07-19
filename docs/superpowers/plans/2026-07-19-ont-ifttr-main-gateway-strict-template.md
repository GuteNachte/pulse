# 光猫 / ONT 与 iFTTR 主网关严格模板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `ont` 升级为代码版本化的严格类型模板，准确维护 iFTTR 主网关的设备参数、真实接口和宽带 / Wi-Fi 关系，并在本地创建已确认的真实资产数据。

**Architecture:** 本功能继续归属必需模块 `asset-center`，不新增模块、路由或开关。前端以 `ontAssetTypeSpec` 作为字段、固定选项、编辑分组、详情分组、摘要、完整度、导入与候选的单一规格源；Hub 以对应的服务器端白名单和校验器作为最终写入边界。接口仍写入 `asset_interfaces`，新增 `optical` 类型并用 `metadata.enabled` 表达启用状态；关系仍写入 `asset_relations`，由 Hub 拒绝错误的 PON / WAN 与未启用 Wi-Fi 端点。

**Tech Stack:** React 19、TypeScript 6、PocketBase、Go、Radix/shadcn 现有组件、Node contract tests、Go `testing` + `testify`、Vite 8。

---

## 文件职责与改动边界

- `internal/site/src/modules/asset-center/asset-type-specs.ts`：ONT 单一严格规格、固定选项、字段键集合和前端值校验。
- `internal/site/src/modules/asset-center/asset-schema.ts`：把严格规格转换为现有表单字段，不再让 `ont` 复用通用网络设备字段。
- `internal/site/src/modules/asset-center/asset-profiles.ts`：从 ONT 规格派生资料完整度所需字段。
- `internal/site/src/modules/asset-center/asset-edit-profile-sections.ts`：编辑工作台的置顶字段与分组边界。
- `internal/site/src/modules/asset-center/asset-detail-parameter-groups.ts`：严格规格驱动的详情参数分组。
- `internal/site/src/modules/asset-center/asset-profile-summary.ts`：ONT 列表摘要和资料完整度。
- `internal/site/src/modules/asset-center/asset-interface-display.ts`：ONT 接入方式、速率摘要、启用与接线状态。
- `internal/site/src/modules/asset-center/asset-import.ts`、`asset-import-templates.ts`、`asset-export.ts`：严格字段导入、敏感字段拒绝和导出契约。
- `internal/site/src/modules/asset-center/components/asset-edit-workbench.tsx`：ONT 固定选项和部署字段编辑。
- `internal/site/src/modules/asset-center/components/asset-interface-manager.tsx`、`asset-detail-page.tsx`：接口启用、接线、角色、频段和待建档说明。
- `internal/site/src/modules/asset-center/asset-detail-relations.ts`：允许 ONT 作为 Wi-Fi 关系目标，并只列出合适的接口。
- `internal/site/src/types.d.ts`：新增 `optical` 接口类型。
- `internal/site/src/lib/network-topology.ts`：PON 映射为上联、光口映射为下联。
- `internal/migrations/zzzzzzzz_asset_interface_optical.go`：给 PocketBase `asset_interfaces.kind` 追加 `optical`。
- `internal/hub/asset_type_validation.go`：ONT metadata 白名单、固定选项、格式和敏感字段拒绝。
- `internal/hub/asset_master_validation.go`：接口 metadata 规则和关系端点规则。
- `internal/hub/asset_enrichment_profile.go`、`asset_enrichment_online.go`：ONT 资料补全只产生严格模板允许字段，并在候选入口丢弃秘密字段。
- `docs/release-notes-next.md`、`internal/site/src/components/routes/settings/release-history.ts`：下一版与 About 分端记录。

## 固定字段契约

ONT metadata 只允许新增或修改以下业务字段；历史其他字段保留原值但只读：

```text
asset_tag
official_url
official_image_url
product_series
carrier
operating_role
manufacture_date
color
onu_type
pon_standard
pon_uplink_capacity
optical_connector
downstream_optical_port_count
downstream_optical_status
router_status
gateway_status
dhcp_status
fixed_ipv4
fixed_ipv6
management_url
lan_subnet
wifi_standard
wifi_24_supported
wifi_24_enabled
wifi_5_supported
wifi_5_enabled
wps_supported
lan_port_count
lan_2500_count
lan_1000_count
usb_port_count
voice_port_count
power_spec
indicator_control
wireless_control
reset_supported
power_switch_supported
product_number
pon_sn
mac
radio_approval_code
```

明确拒绝保存的键包括 `password`、`passwd`、`secret`、`token`、`credential`、`ssid`、`wifi_name`、`qr_code`、`qrcode`、`broadband_account`；比较时忽略大小写、空格、连字符和下划线。

### Task 1: 建立 ONT 严格规格和前端失败契约

**Files:**
- Modify: `internal/site/src/modules/asset-center/asset-type-specs.ts`
- Modify: `internal/site/src/modules/asset-center/asset-type-specs.test.ts`

- [ ] **Step 1: 先写 ONT 规格失败测试**

在 `asset-type-specs.test.ts` 导入 `ontAssetTypeSpec`、`getAssetTypeSpec`、`validateOntAssetValues`，追加：

```ts
const ontFields = ontAssetTypeSpec.sections.flatMap((section) => section.fields.map((field) => field.key))
assert.deepEqual(ontAssetTypeSpec.sections.map((section) => section.title), [
	"身份与归属",
	"光纤接入",
	"路由与管理",
	"无线网络",
	"有线网络",
	"其他端口与电源",
	"设备身份标识",
])
assert.equal(new Set(ontFields).size, ontFields.length)
assert.deepEqual(
	ontAssetTypeSpec.sections
		.flatMap((section) => section.fields)
		.find((field) => field.key === "operating_role")
		?.options?.map((option) => option.value),
	["bridge_ont", "router_ont", "ifttr_main_gateway"]
)
assert.deepEqual(
	ontAssetTypeSpec.sections
		.flatMap((section) => section.fields)
		.filter((field) => field.key === "wifi_24_enabled" || field.key === "wifi_5_enabled")
		.flatMap((field) => field.options?.map((option) => option.value) ?? []),
	["enabled", "disabled", "enabled", "disabled"]
)
assert.equal(ontFields.includes("ssid"), false)
assert.equal(ontFields.includes("wifi_password"), false)
assert.equal(getAssetTypeSpec("ont"), ontAssetTypeSpec)
assert.deepEqual(
	validateOntAssetValues({
		name: "家庭主网关",
		vendor: "华为",
		model: "V271-20",
		status: "active",
		location: "家 / 弱电箱",
		carrier: "中国联通",
		operatingRole: "ifttr_main_gateway",
	}),
	[]
)
assert.deepEqual(
	validateOntAssetValues({
		name: "",
		vendor: "",
		model: "",
		status: "planned",
		location: "",
		carrier: "其他",
		operatingRole: "custom",
	}),
	["资产名称", "厂商 / 品牌", "型号 / 规格", "使用状态", "位置", "运营商", "工作角色"]
)
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd internal/site; npm run test:asset-type-spec`

Expected: FAIL，提示 `ontAssetTypeSpec` 或 `validateOntAssetValues` 尚未导出。

- [ ] **Step 3: 添加固定选项、字段和校验器**

在 `asset-type-specs.ts` 中添加并导出以下选项与规格；字段标签、键和值保持与本计划一致：

```ts
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
				{ key: "product_series", label: "产品系列", group: "身份与归属", inputMode: "captured_candidate", source: "metadata" },
				{ key: "carrier", label: "运营商", group: "身份与归属", inputMode: "fixed_choice", source: "metadata", type: "select", options: ontCarrierOptions },
				{ key: "operating_role", label: "工作角色", group: "身份与归属", inputMode: "fixed_choice", source: "metadata", type: "select", options: ontOperatingRoleOptions },
				{ key: "manufacture_date", label: "生产日期", group: "身份与归属", inputMode: "captured_candidate", source: "metadata", type: "date" },
				{ key: "color", label: "外观颜色", group: "身份与归属", inputMode: "captured_candidate", source: "metadata" },
			],
		},
		{
			title: "光纤接入",
			fields: [
				{ key: "onu_type", label: "ONU 类型", group: "光纤接入", inputMode: "captured_candidate", source: "metadata" },
				{ key: "pon_standard", label: "PON 标准", group: "光纤接入", inputMode: "captured_candidate", source: "metadata" },
				{ key: "pon_uplink_capacity", label: "PON 上联能力", group: "光纤接入", inputMode: "captured_candidate", source: "metadata" },
				{ key: "optical_connector", label: "光纤连接器", group: "光纤接入", inputMode: "captured_candidate", source: "metadata" },
				{ key: "downstream_optical_port_count", label: "下联光口数量", group: "光纤接入", inputMode: "captured_candidate", source: "metadata", type: "number" },
				{ key: "downstream_optical_status", label: "下联光口状态", group: "光纤接入", inputMode: "fixed_choice", source: "metadata", type: "select", options: enabledStatusOptions },
			],
		},
		{
			title: "路由与管理",
			fields: [
				{ key: "router_status", label: "主路由", group: "路由与管理", inputMode: "fixed_choice", source: "metadata", type: "select", options: enabledStatusOptions },
				{ key: "gateway_status", label: "主网关", group: "路由与管理", inputMode: "fixed_choice", source: "metadata", type: "select", options: enabledStatusOptions },
				{ key: "dhcp_status", label: "DHCP", group: "路由与管理", inputMode: "fixed_choice", source: "metadata", type: "select", options: enabledStatusOptions },
				{ key: "fixed_ipv4", label: "管理 IPv4", group: "路由与管理", inputMode: "manual_required", source: "metadata" },
				{ key: "fixed_ipv6", label: "管理 IPv6", group: "路由与管理", inputMode: "manual_optional", source: "metadata", placeholder: "无" },
				{ key: "management_url", label: "管理 URL", group: "路由与管理", inputMode: "manual_optional", source: "metadata", type: "url" },
				{ key: "lan_subnet", label: "LAN 网段", group: "路由与管理", inputMode: "manual_optional", source: "metadata" },
			],
		},
		{
			title: "无线网络",
			fields: [
				{ key: "wifi_standard", label: "无线标准", group: "无线网络", inputMode: "captured_candidate", source: "metadata" },
				{ key: "wifi_24_supported", label: "2.4 GHz 支持", group: "无线网络", inputMode: "fixed_choice", source: "metadata", type: "select", options: supportedStatusOptions },
				{ key: "wifi_24_enabled", label: "2.4 GHz 状态", group: "无线网络", inputMode: "fixed_choice", source: "metadata", type: "select", options: enabledStatusOptions },
				{ key: "wifi_5_supported", label: "5 GHz 支持", group: "无线网络", inputMode: "fixed_choice", source: "metadata", type: "select", options: supportedStatusOptions },
				{ key: "wifi_5_enabled", label: "5 GHz 状态", group: "无线网络", inputMode: "fixed_choice", source: "metadata", type: "select", options: enabledStatusOptions },
				{ key: "wps_supported", label: "WPS", group: "无线网络", inputMode: "fixed_choice", source: "metadata", type: "select", options: supportedStatusOptions },
			],
		},
		{
			title: "有线网络",
			fields: [
				{ key: "lan_port_count", label: "LAN 总数", group: "有线网络", inputMode: "captured_candidate", source: "metadata", type: "number" },
				{ key: "lan_2500_count", label: "2.5GbE LAN 数量", group: "有线网络", inputMode: "captured_candidate", source: "metadata", type: "number" },
				{ key: "lan_1000_count", label: "1GbE LAN 数量", group: "有线网络", inputMode: "captured_candidate", source: "metadata", type: "number" },
			],
		},
		{
			title: "其他端口与电源",
			fields: [
				{ key: "usb_port_count", label: "USB 数量", group: "其他端口与电源", inputMode: "captured_candidate", source: "metadata", type: "number" },
				{ key: "voice_port_count", label: "电话接口数量", group: "其他端口与电源", inputMode: "captured_candidate", source: "metadata", type: "number" },
				{ key: "power_spec", label: "电源规格", group: "其他端口与电源", inputMode: "captured_candidate", source: "metadata" },
				{ key: "indicator_control", label: "指示灯控制", group: "其他端口与电源", inputMode: "fixed_choice", source: "metadata", type: "select", options: supportedStatusOptions },
				{ key: "wireless_control", label: "无线 / WPS 控制", group: "其他端口与电源", inputMode: "fixed_choice", source: "metadata", type: "select", options: supportedStatusOptions },
				{ key: "reset_supported", label: "复位能力", group: "其他端口与电源", inputMode: "fixed_choice", source: "metadata", type: "select", options: supportedStatusOptions },
				{ key: "power_switch_supported", label: "电源开关", group: "其他端口与电源", inputMode: "fixed_choice", source: "metadata", type: "select", options: supportedStatusOptions },
			],
		},
		{
			title: "设备身份标识",
			fields: [
				{ key: "product_number", label: "产品编号", group: "设备身份标识", inputMode: "captured_candidate", source: "metadata" },
				{ key: "pon_sn", label: "PON SN", group: "设备身份标识", inputMode: "captured_candidate", source: "metadata" },
				{ key: "serial_number", label: "设备序列号", group: "设备身份标识", inputMode: "captured_candidate", source: "asset" },
				{ key: "mac", label: "MAC", group: "设备身份标识", inputMode: "captured_candidate", source: "metadata" },
				{ key: "radio_approval_code", label: "无线电型号核准编号", group: "设备身份标识", inputMode: "captured_candidate", source: "metadata", span: "full" },
			],
		},
	],
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
```

把 `getAssetTypeSpec()` 改成显式分支：

```ts
export function getAssetTypeSpec(type: AssetType) {
	if (type === "internet") return internetAssetTypeSpec
	if (type === "ont") return ontAssetTypeSpec
	return undefined
}

export function getAssetTypeOptionLabel(type: AssetType, fieldKey: string, value: string) {
	const field = getAssetTypeSpec(type)?.sections
		.flatMap((section) => section.fields)
		.find((item) => item.key === fieldKey)
	return field?.options?.find((option) => option.value === value)?.label ?? value
}

export function getInternetOptionLabel(fieldKey: string, value: string) {
	return getAssetTypeOptionLabel("internet", fieldKey, value)
}
```

- [ ] **Step 4: 运行规格测试确认通过**

Run: `cd internal/site; npm run test:asset-type-spec`

Expected: PASS，最后输出 `asset type specs contract passed`。

- [ ] **Step 5: 提交严格规格**

```powershell
git add internal/site/src/modules/asset-center/asset-type-specs.ts internal/site/src/modules/asset-center/asset-type-specs.test.ts
git commit -m "feat: define strict ont asset specification"
```

### Task 2: 让编辑、详情、列表和完整度统一使用 ONT 规格

**Files:**
- Modify: `internal/site/src/modules/asset-center/asset-schema.ts`
- Modify: `internal/site/src/modules/asset-center/asset-profiles.ts`
- Modify: `internal/site/src/modules/asset-center/asset-edit-profile-sections.ts`
- Modify: `internal/site/src/modules/asset-center/asset-detail-parameter-groups.ts`
- Modify: `internal/site/src/modules/asset-center/asset-profile-summary.ts`
- Modify: `internal/site/src/modules/asset-center/components/asset-edit-workbench.tsx`
- Modify: `internal/site/src/components/routes/assets.tsx`
- Test: `internal/site/src/modules/asset-center/asset-schema-profile.test.ts`
- Test: `internal/site/src/modules/asset-center/asset-edit-profile-sections.test.ts`
- Test: `internal/site/src/modules/asset-center/asset-detail-parameter-groups.test.ts`
- Test: `internal/site/src/modules/asset-center/asset-profile-summary.test.ts`

- [ ] **Step 1: 写字段来源、编辑分组、详情分组和完整度失败测试**

追加以下断言：

```ts
assert.deepEqual(
	getAssetFormSections("ont").map((section) => section.title),
	["身份与归属", "光纤接入", "路由与管理", "无线网络", "有线网络", "其他端口与电源", "设备身份标识"]
)
assert.equal(getSectionFieldKeys("ont", "网络参数").length, 0)
assert.equal(getSectionFieldKeys("ont", "无线网络").includes("wifi_5_enabled"), true)
assert.equal(getSectionFieldKeys("ont", "设备身份标识").includes("pon_sn"), true)
```

```ts
const ontRequiredFields = getRequiredAssetProfileFieldKeys("ont")
for (const key of ["name", "type", "vendor", "model", "status", "location", "asset_tag", "fixed_ipv4", "carrier", "operating_role"]) {
	assert.equal(ontRequiredFields.has(key), true, `ONT 顶部字段缺少 ${key}`)
}
assert.deepEqual(
	buildAssetProfileEditSections("ont", ontRequiredFields).map((section) => section.title),
	["身份与归属", "光纤接入", "路由与管理", "无线网络", "有线网络", "其他端口与电源", "设备身份标识"]
)
```

在详情参数测试中建立不含秘密的 ONT fixture：

```ts
const ont = {
	id: "ont-1",
	user: "user-1",
	name: "家庭主网关",
	type: "ont",
	status: "active",
	vendor: "华为",
	model: "V271-20",
	location: "家 / 弱电箱",
	created: "2026-07-19 00:00:00.000Z",
	updated: "2026-07-19 00:00:00.000Z",
	metadata: {
		product_series: "Huawei OptiXstar",
		carrier: "中国联通",
		operating_role: "ifttr_main_gateway",
		pon_standard: "10G-EPON",
		router_status: "enabled",
		gateway_status: "enabled",
		dhcp_status: "enabled",
		fixed_ipv4: "192.168.1.1",
		wifi_standard: "Wi-Fi 7",
		wifi_24_supported: "supported",
		wifi_24_enabled: "disabled",
		wifi_5_supported: "supported",
		wifi_5_enabled: "enabled",
		lan_port_count: 4,
		lan_2500_count: 1,
		lan_1000_count: 3,
		power_spec: "DC 12V / 2A",
	},
} as unknown as AssetRecord

assertDeepEqual(
	buildAssetParameterGroups(ont).map((group) => group.title),
	["光纤接入", "路由与管理", "无线网络", "有线网络", "其他端口与电源", "设备身份标识"]
)
assertDeepEqual(
	buildAssetParameterGroups(ont)
		.find((group) => group.title === "设备身份标识")
		?.rows.map((row) => [row.label, row.value]),
	[
		["产品编号", "未确认"],
		["PON SN", "未确认"],
		["设备序列号", "未确认"],
		["MAC", "未确认"],
		["无线电型号核准编号", "未确认"],
	]
)
```

在摘要测试中断言：

```ts
assert.deepEqual(getAssetSummaryRows(ont), [
	{ label: "型号", value: "Huawei OptiXstar V271-20" },
	{ label: "工作角色", value: "iFTTR 主网关" },
	{ label: "接入", value: "10G-EPON" },
	{ label: "网络", value: "2.5GbE + 3 × 1GbE / Wi-Fi 7" },
	{ label: "位置", value: "家 / 弱电箱" },
])
assert.equal(getAssetCompleteness(ont).missing.includes("内部型号 / 搜索代码"), false)
```

- [ ] **Step 2: 运行四个定向测试确认失败**

Run:

```powershell
cd internal/site
node --experimental-strip-types src/modules/asset-center/asset-schema-profile.test.ts
node --experimental-strip-types src/modules/asset-center/asset-edit-profile-sections.test.ts
node --experimental-strip-types src/modules/asset-center/asset-detail-parameter-groups.test.ts
node --experimental-strip-types src/modules/asset-center/asset-profile-summary.test.ts
```

Expected: 至少一个测试因 `ont` 仍使用“网络参数”或摘要仍使用通用端口字段而 FAIL。

- [ ] **Step 3: 从严格规格派生表单字段和必填字段**

在 `asset-schema.ts` 导入 `ontAssetTypeSpec` 和 `type AssetTypeSpec`，抽取共用转换器：

```ts
function assetTypeSpecSectionsToFormSections(spec: AssetTypeSpec): AssetFieldSection[] {
	return spec.sections.map((section) => ({
		title: section.title,
		fields: section.fields.map((field) => ({
			key: field.key,
			label: field.label,
			source: field.source,
			type: field.type,
			required: field.inputMode === "manual_required",
			placeholder: field.placeholder,
			span: field.span,
			options: field.options ? [...field.options] : undefined,
			capture: field.inputMode === "captured_candidate" ? "agent_collectable" : "manual",
			readOnly: field.readOnly,
		})),
	}))
}

const internetSections = assetTypeSpecSectionsToFormSections(internetAssetTypeSpec)
const ontSections = assetTypeSpecSectionsToFormSections(ontAssetTypeSpec)
```

在 `getAssetFormSections()` 的网络设备分支前添加：

```ts
if (type === "ont") {
	return ontSections
}
```

删除 `networkDeviceFieldKeysByType.ont`，确保同一字段不再从通用集合维护。

在 `asset-profiles.ts` 从 ONT 规格派生必填键：

```ts
const ontRequiredFieldKeys = [
	...ontAssetTypeSpec.sections
		.flatMap((section) => section.fields)
		.filter((field) => ["carrier", "operating_role"].includes(field.key))
		.map((field) => field.key),
] as const
```

把 `ont` profile 的 `requiredFieldKeys` 改为 `ontRequiredFieldKeys`。`getRequiredAssetProfileFieldKeys()` 继续先建立通用顶部字段集合，再把 `carrier`、`operating_role` 加入；不要为 ONT 提前返回一个更小的 Set，否则厂商、型号、颜色和接入信息会在工作台重复渲染。`internal_model` 本来只在 `phone` 分支加入，不为 ONT 添加。

- [ ] **Step 4: 用规格生成详情分组、摘要和完整度**

在 `asset-detail-parameter-groups.ts` 增加 ONT 专用入口：

```ts
if (asset.type === "ont") {
	return getAssetFormSections("ont")
		.filter((section) => section.title !== "身份与归属")
		.map((section, index) => {
			const rows = section.fields.map((field) => {
				const rawValue = getAssetFieldDisplayValue(asset, field)
				const value = rawValue === "none" || rawValue === "无" ? "无" : rawValue || "未确认"
				return archiveRowToParameterRow({ field, value })
			})
			return {
				id: `ont-${normalizeGroupId(section.title)}-${index}`,
				title: section.title,
				icon: getParameterGroupIcon(section.title),
				rows,
				summary: getParameterGroupSummary(rows),
			}
		})
}
```

这条分支必须保留空字段行：未填写显示“未确认”，明确保存 `none` 或“无”才显示“无”，固定状态 `disabled` 由字段 options 显示“未启用”。三种状态不能相互替代。

在 `asset-profile-summary.ts` 为 ONT 添加标签转换和摘要：

```ts
if (asset.type === "ont") {
	const role = getAssetTypeOptionLabel("ont", "operating_role", getMetadataString(metadata, "operating_role"))
	const seriesModel = [getMetadataString(metadata, "product_series"), asset.model].filter(Boolean).join(" ")
	const wired = [
		getMetadataNumber(metadata, "lan_2500_count") ? "2.5GbE" : "",
		getMetadataNumber(metadata, "lan_1000_count") ? `${getMetadataNumber(metadata, "lan_1000_count")} × 1GbE` : "",
	].filter(Boolean).join(" + ")
	return [
		{ label: "型号", value: seriesModel || [asset.vendor, asset.model].filter(Boolean).join(" ") },
		{ label: "工作角色", value: role },
		{ label: "接入", value: getMetadataString(metadata, "pon_standard") },
		{ label: "网络", value: [wired, getMetadataString(metadata, "wifi_standard")].filter(Boolean).join(" / ") },
		{ label: "位置", value: asset.location || "未填写位置" },
	].filter((row) => row.value)
}
```

把 ONT 完整度放在通用网络设备判断前：

```ts
if (asset.type === "ont") {
	return [
		{ label: "资产名称", ok: Boolean(asset.name?.trim()) },
		{ label: "厂商 / 品牌", ok: Boolean(asset.vendor?.trim()) },
		{ label: "型号", ok: Boolean(asset.model?.trim()) },
		{ label: "位置", ok: Boolean(asset.location?.trim()) },
		{ label: "运营商", ok: Boolean(getMetadataString(metadata, "carrier")) },
		{ label: "工作角色", ok: Boolean(getMetadataString(metadata, "operating_role")) },
		{ label: "管理 IPv4", ok: Boolean(getMetadataString(metadata, "fixed_ipv4") || asset.management_ip?.trim()) },
		{ label: "PON 标准", ok: Boolean(getMetadataString(metadata, "pon_standard")) },
		{ label: "无线标准", ok: Boolean(getMetadataString(metadata, "wifi_standard")) },
		{ label: "LAN 端口", ok: (getMetadataNumber(metadata, "lan_port_count") ?? 0) > 0 },
	]
}
```

- [ ] **Step 5: 编辑和快速建档使用 ONT 固定选项**

在 `asset-edit-workbench.tsx` 让状态选项从当前类型规格读取：

```ts
const selectedTypeSpec = getAssetTypeSpec(selectedType)
const statusOptions = selectedTypeSpec ? [...selectedTypeSpec.statusOptions] : (statusField?.options ?? [])
```

在通用档案中为 ONT 直接渲染固定运营商和工作角色，并跳过自由文本 `role`：

```tsx
{selectedType === "ont" ? (
	<>
		{renderUniversalArchiveField("carrier")}
		{renderUniversalArchiveField("operating_role")}
	</>
) : null}
{capabilities.showRole && selectedType !== "ont" ? renderUniversalArchiveField("role") : null}
```

保存 ONT 时由 `operating_role` 固定值生成 `asset.role` 显示文案，不能接受自由输入：

```ts
const normalizedRole =
	form.type === "ont"
		? getAssetTypeOptionLabel("ont", "operating_role", form.metadata.operating_role ?? "")
		: form.role.trim()
```

payload 的 `role` 使用 `normalizedRole`。Hub 在 Task 4 使用同一固定映射二次归一，避免绕过前端写入其他角色文字。

在 `assets.tsx` 保存前添加：

```ts
if (form.type === "ont") {
	const errors = validateOntAssetValues({
		name,
		vendor: form.vendor,
		model: form.model,
		status: form.status,
		location: form.location,
		carrier: form.metadata.carrier ?? "",
		operatingRole: form.metadata.operating_role ?? "",
	})
	if (errors.length > 0) {
		toast({ title: "光猫 / ONT 资料未填完整", description: errors.join("、"), variant: "destructive" })
		return
	}
}
```

在 `validateNewAssetRequiredFields()` 的通用 IPv4 / `internal_model` 逻辑前加同一 ONT 分支，只要求规格中的核心字段，不要求内部型号。

- [ ] **Step 6: 运行定向测试和资产中心测试**

Run:

```powershell
cd internal/site
npm run test:asset-type-spec
npm run test:asset-center
npm run typecheck
```

Expected: 全部 PASS，TypeScript 无类型错误。

- [ ] **Step 7: 提交统一展示与编辑**

```powershell
git add internal/site/src/modules/asset-center internal/site/src/components/routes/assets.tsx
git commit -m "feat: apply strict ont profile across asset views"
```

### Task 3: 收紧导入、导出和资料补全字段边界

**Files:**
- Modify: `internal/site/src/modules/asset-center/asset-import.ts`
- Modify: `internal/site/src/modules/asset-center/asset-import-templates.ts`
- Modify: `internal/site/src/modules/asset-center/asset-export.ts`
- Modify: `internal/site/package.json`
- Modify: `internal/hub/asset_enrichment_profile.go`
- Modify: `internal/hub/asset_enrichment_online.go`
- Create: `internal/site/src/modules/asset-center/asset-import-export.test.ts`
- Test: `internal/hub/asset_enrichment_domain_test.go`
- Test: `internal/hub/asset_enrichment_test.go`

- [ ] **Step 1: 写导入与候选敏感字段失败测试**

新建 `asset-import-export.test.ts`，导入 `buildImportPreviewRow`、`buildAssetExportCsv` 和 `buildAssetCenterSnapshot`，添加：

```ts
const ontImport = buildImportPreviewRow({
	name: "测试 ONT",
	type: "ont",
	status: "active",
	vendor: "华为",
	model: "V271-20",
	location: "家 / 弱电箱",
	"metadata.carrier": "中国联通",
	"metadata.operating_role": "ifttr_main_gateway",
	"metadata.fixed_ipv4": "192.168.1.1",
	"metadata.ssid": "redacted",
}, 0, [])
assert.equal(ontImport.errors.includes("包含不允许保存的敏感字段 metadata.ssid"), true)
```

Hub allowlist 测试追加：

```go
ontFields := assetEnrichmentAllowedMetadataFieldSet("ont")
require.True(t, ontFields["pon_standard"])
require.True(t, ontFields["wifi_standard"])
require.True(t, ontFields["power_spec"])
require.False(t, ontFields["ssid"])
require.False(t, ontFields["wifi_password"])
require.False(t, ontFields["credential"])
```

在线候选解析测试写入：

```go
func TestParseAssetOnlineAISuggestionsDropsONTCredentials(t *testing.T) {
	asset := core.NewRecord(core.NewBaseCollection("assets"))
	asset.Set("type", "ont")
	const sourceURL = "https://consumer.huawei.com/cn/routers/example"
	content := `{"suggestions":[
		{"field":"pon_standard","label":"PON 标准","value":"10G-EPON","confidence":90,"source_urls":["https://consumer.huawei.com/cn/routers/example"]},
		{"field":"ssid","label":"Wi-Fi 名称","value":"redacted","confidence":90,"source_urls":["https://consumer.huawei.com/cn/routers/example"]},
		{"field":"wifi_password","label":"Wi-Fi 密码","value":"redacted","confidence":90,"source_urls":["https://consumer.huawei.com/cn/routers/example"]}
	]}`
	suggestions := (&Hub{}).parseAssetOnlineAISuggestions(asset, content, []assetOnlineSource{{
		Provider: "manual",
		Type: "official",
		Title: "Huawei product page",
		URL: sourceURL,
		Confidence: 95,
	}})
	require.Len(t, suggestions, 1)
	require.Equal(t, "metadata.pon_standard", suggestions[0].TargetField)
}
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
cd internal/site
node --experimental-strip-types src/modules/asset-center/asset-import-export.test.ts
cd C:\Users\Nacht\Documents\PL
go test -tags=testing ./internal/hub -run "TestAssetEnrichmentProfileFieldAllowlistMatchesAssetType|Test.*Online.*Suggestion" -count=1
```

Expected: FAIL，ONT 仍沿用旧的通用字段集合且导入未明确拒绝 `metadata.ssid`。

- [ ] **Step 3: 导入只接受严格字段并更新无敏感值示例**

在 `asset-import.ts` 添加：

```ts
const sensitiveMetadataKeyPattern = /^(password|passwd|secret|token|credential|ssid|wifiname|qrcode|broadbandaccount)$/

function normalizeSensitiveMetadataKey(key: string) {
	return key.toLowerCase().replace(/[\s_-]+/g, "")
}

function findSensitiveMetadataKeys(metadata: Record<string, string>) {
	return Object.keys(metadata).filter((key) => sensitiveMetadataKeyPattern.test(normalizeSensitiveMetadataKey(key)))
}
```

在 `buildImportPreviewRow()` 建立 `form` 后追加：

```ts
for (const key of findSensitiveMetadataKeys(form.metadata)) {
	errors.push(`包含不允许保存的敏感字段 metadata.${key}`)
}

if (form.type === "ont") {
	const allowed = new Set([
		"asset_tag",
		"official_url",
		"official_image_url",
		...ontAssetTypeSpec.sections
			.flatMap((section) => section.fields)
			.filter((field) => field.source === "metadata")
			.map((field) => field.key),
	])
	for (const key of Object.keys(form.metadata)) {
		if (!allowed.has(key) && !findSensitiveMetadataKeys(form.metadata).includes(key)) {
			errors.push(`字段 metadata.${key} 不属于光猫 / ONT 严格模板`)
		}
	}
}
```

把 `asset-import-templates.ts` 中 V271 示例的 `type` 从 `router` 改为 `ont`，删除 `metadata.ssid_note`，并使用以下无秘密字段：

```ts
"metadata.product_series": "Huawei OptiXstar",
"metadata.carrier": "中国联通",
"metadata.operating_role": "ifttr_main_gateway",
"metadata.pon_standard": "10G-EPON",
"metadata.fixed_ipv4": "192.168.1.1",
"metadata.management_url": "http://192.168.1.1",
"metadata.wifi_standard": "Wi-Fi 7",
"metadata.wifi_24_enabled": "disabled",
"metadata.wifi_5_enabled": "enabled",
"metadata.lan_port_count": "4",
"metadata.lan_2500_count": "1",
"metadata.lan_1000_count": "3",
```

不得在模板中写入任何真实序列号、MAC、PON SN、SSID 或密码。

- [ ] **Step 4: 让 Hub 补全白名单只含 ONT 规格字段**

把 `ontEnrichmentMetadataFields` 改为：

```go
var ontEnrichmentMetadataFields = mergeAssetEnrichmentFields(assetEnrichmentAddressMetadataFields, []string{
	"product_series", "carrier", "operating_role", "manufacture_date", "color",
	"onu_type", "pon_standard", "pon_uplink_capacity", "optical_connector",
	"downstream_optical_port_count", "downstream_optical_status",
	"router_status", "gateway_status", "dhcp_status", "lan_subnet",
	"wifi_standard", "wifi_24_supported", "wifi_24_enabled", "wifi_5_supported", "wifi_5_enabled", "wps_supported",
	"lan_port_count", "lan_2500_count", "lan_1000_count",
	"usb_port_count", "voice_port_count", "power_spec", "indicator_control", "wireless_control",
	"reset_supported", "power_switch_supported", "product_number", "pon_sn", "radio_approval_code",
})
```

在 `parseAssetOnlineAISuggestions()` 读取字段后、查 allowlist 前增加敏感键拒绝：

```go
if isSensitiveONTMetadataKey(field) {
	continue
}
```

`isSensitiveONTMetadataKey()` 与 Task 4 的 Hub 写入校验共用同一个实现，不复制另一套规则。

- [ ] **Step 5: 验证导出完整保留严格 metadata 且不自动生成秘密字段**

在 `asset-import-export.test.ts` 添加以下无秘密 fixture 和断言。导出层不得主动删除用户既有历史 metadata；秘密字段应在写入入口被拒绝，因此 fixture 不构造历史秘密值。

```ts
const ont = {
	id: "ont-1",
	user: "user-1",
	name: "测试 ONT",
	type: "ont",
	status: "active",
	vendor: "华为",
	model: "V271-20",
	location: "家 / 弱电箱",
	metadata: { operating_role: "ifttr_main_gateway", pon_standard: "10G-EPON", pon_sn: "TEST00000001" },
	created: "2026-07-19 00:00:00.000Z",
	updated: "2026-07-19 00:00:00.000Z",
} as AssetRecord

const csv = buildAssetExportCsv([ont], new Set())
const snapshot = buildAssetCenterSnapshot({
	exportedAt: new Date("2026-07-19T00:00:00.000Z"),
	assets: [ont],
	assetInterfaces: [],
	assetRelations: [],
	assetLocations: [],
	assetMaintenance: [],
	assetAttachments: [],
})
for (const output of [csv, snapshot]) {
	assert.equal(output.includes("ifttr_main_gateway"), true)
	assert.equal(output.includes("10G-EPON"), true)
	assert.equal(output.includes("TEST00000001"), true)
	for (const forbidden of ["wifi_password", "ssid", "credential"]) assert.equal(output.includes(forbidden), false)
}
```

在 `internal/site/package.json` 的 `test:asset-center` 中加入：

```json
"node --experimental-strip-types src/modules/asset-center/asset-import-export.test.ts"
```

- [ ] **Step 6: 运行测试并提交**

Run:

```powershell
cd internal/site
npm run test:asset-center
cd C:\Users\Nacht\Documents\PL
go test -tags=testing ./internal/hub -run "TestAssetEnrichment" -count=1
```

Expected: 全部 PASS。

```powershell
git add internal/site/package.json internal/site/src/modules/asset-center/asset-import.ts internal/site/src/modules/asset-center/asset-import-templates.ts internal/site/src/modules/asset-center/asset-export.ts internal/site/src/modules/asset-center/asset-import-export.test.ts internal/hub/asset_enrichment_profile.go internal/hub/asset_enrichment_online.go internal/hub/asset_enrichment_domain_test.go internal/hub/asset_enrichment_test.go
git commit -m "feat: constrain ont import and enrichment fields"
```

### Task 4: 在 Hub 强制 ONT 白名单、固定选项、格式和秘密拒绝

**Files:**
- Modify: `internal/hub/asset_type_validation.go`
- Modify: `internal/hub/asset_master_validation.go`
- Modify: `internal/hub/asset_master_validation_test.go`

- [ ] **Step 1: 写严格保存失败测试**

在顶层测试注册 `RequiresStrictONTProfile`，新测试依次验证：

```go
validBody := fmt.Sprintf(`{
	"user":"%s",
	"name":"家庭主网关",
	"type":"ont",
	"status":"active",
	"vendor":"华为",
	"model":"V271-20",
	"management_ip":"192.168.1.1",
	"location":"家 / 弱电箱",
	"metadata":{
		"carrier":"中国联通",
		"operating_role":"ifttr_main_gateway",
		"fixed_ipv4":"192.168.1.1",
		"pon_standard":"10G-EPON",
		"wifi_24_supported":"supported",
		"wifi_24_enabled":"disabled",
		"wifi_5_supported":"supported",
		"wifi_5_enabled":"enabled",
		"lan_port_count":4,
		"lan_2500_count":1,
		"lan_1000_count":3
	}
}`, user.Id)
```

断言该请求 `200`，然后分别发送并断言 `400`：

```text
carrier=其他              -> 运营商只能选择中国电信、中国联通或中国移动
operating_role=custom     -> 工作角色只能选择桥接光猫、光猫路由一体机或 iFTTR 主网关
wifi_5_enabled=auto       -> 无线启用状态只能选择启用或未启用
lan_port_count=-1         -> 端口数量必须是非负整数
fixed_ipv4=999.1.1.1      -> 管理 IPv4 格式不正确
mac=invalid               -> MAC 格式不正确
ssid=redacted             -> 不允许保存 Wi-Fi 名称、密码或认证凭据
wifi_password=redacted    -> 不允许保存 Wi-Fi 名称、密码或认证凭据
cpu_model=not-allowed     -> 字段 cpu_model 不属于光猫 / ONT 严格模板
```

使用表驱动测试发送每个无效 body，不用只检查校验 helper：

```go
tests := []struct {
	name     string
	metadata string
	message  string
}{
	{name: "carrier", metadata: `"carrier":"其他","operating_role":"ifttr_main_gateway","fixed_ipv4":"192.168.1.1"`, message: "运营商只能选择"},
	{name: "role", metadata: `"carrier":"中国联通","operating_role":"custom","fixed_ipv4":"192.168.1.1"`, message: "工作角色只能选择"},
	{name: "wifi state", metadata: `"carrier":"中国联通","operating_role":"ifttr_main_gateway","fixed_ipv4":"192.168.1.1","wifi_5_enabled":"auto"`, message: "无线启用状态只能选择"},
	{name: "negative count", metadata: `"carrier":"中国联通","operating_role":"ifttr_main_gateway","fixed_ipv4":"192.168.1.1","lan_port_count":-1`, message: "端口数量必须是非负整数"},
	{name: "ipv4", metadata: `"carrier":"中国联通","operating_role":"ifttr_main_gateway","fixed_ipv4":"999.1.1.1"`, message: "管理 IPv4 格式不正确"},
	{name: "mac", metadata: `"carrier":"中国联通","operating_role":"ifttr_main_gateway","fixed_ipv4":"192.168.1.1","mac":"invalid"`, message: "MAC 格式不正确"},
	{name: "ssid", metadata: `"carrier":"中国联通","operating_role":"ifttr_main_gateway","fixed_ipv4":"192.168.1.1","ssid":"redacted"`, message: "不允许保存 Wi-Fi 名称、密码或认证凭据"},
	{name: "password", metadata: `"carrier":"中国联通","operating_role":"ifttr_main_gateway","fixed_ipv4":"192.168.1.1","wifi_password":"redacted"`, message: "不允许保存 Wi-Fi 名称、密码或认证凭据"},
	{name: "outside template", metadata: `"carrier":"中国联通","operating_role":"ifttr_main_gateway","fixed_ipv4":"192.168.1.1","cpu_model":"not-allowed"`, message: "不属于光猫 / ONT 严格模板"},
}
for _, tc := range tests {
	t.Run(tc.name, func(t *testing.T) {
		body := fmt.Sprintf(`{"user":"%s","name":"无效 ONT %s","type":"ont","status":"active","vendor":"华为","model":"V271-20","location":"家 / 弱电箱","metadata":{%s}}`, user.Id, tc.name, tc.metadata)
		response := pulseTests.PerformTestAPIRequest(t, hub.TestApp, http.MethodPost, "/api/collections/assets/records", strings.NewReader(body), headers)
		require.Equal(t, http.StatusBadRequest, response.Status, response.Body)
		require.Contains(t, response.Body, tc.message)
	})
}
```

再创建一个带旧 `legacy_field` 的 ONT 记录，PATCH 其他合法字段时保留原值并返回 `200`；尝试改变 `legacy_field` 时返回 `400`。

- [ ] **Step 2: 运行 Hub 定向测试确认失败**

Run: `go test -tags=testing ./internal/hub -run TestAssetMasterValidation/RequiresStrictONTProfile -count=1`

Expected: FAIL，Hub 尚未调用 ONT 校验器。

- [ ] **Step 3: 实现服务器端最终写入边界**

在 `validateAssetRequiredProfileRequest()` 中加入：

```go
switch strings.TrimSpace(e.Record.GetString("type")) {
case "internet":
	return h.validateInternetAssetRecord(e)
case "ont":
	return h.validateONTAssetRecord(e)
case "phone":
	if !recordMetadataPositiveNumber(e.Record, "memory_gb") {
		return e.BadRequestError("手机资产必须填写运行内存。", nil)
	}
	if !recordMetadataPositiveNumber(e.Record, "storage_gb") {
		return e.BadRequestError("手机资产必须填写存储容量。", nil)
	}
}
return nil
```

在 `asset_type_validation.go` 添加 `ontAssetAllowedMetadataFields`，键必须与“固定字段契约”完全一致。实现：

```go
func normalizeSensitiveMetadataKey(value string) string {
	replacer := strings.NewReplacer("_", "", "-", "", " ", "")
	return replacer.Replace(strings.ToLower(strings.TrimSpace(value)))
}

func isSensitiveONTMetadataKey(key string) bool {
	switch normalizeSensitiveMetadataKey(key) {
	case "password", "passwd", "secret", "token", "credential", "ssid", "wifiname", "qrcode", "broadbandaccount":
		return true
	default:
		return false
	}
}
```

`validateONTAssetRecord()` 按以下顺序校验，保证错误可读：

1. 名称、厂商、型号、位置不能为空。
2. 状态只能是 `active`、`inactive`、`retired`。
3. `carrier` 和 `operating_role` 必须命中固定选项。
4. `*_supported` 只能是 `supported` / `unsupported`。
5. `*_status` 与 `wifi_*_enabled` 只能是 `enabled` / `disabled`。
6. 数量字段存在时必须是非负整数。
7. `fixed_ipv4` 和 `management_ip` 存在时用 `net.ParseIP` 校验且必须是 IPv4。
8. `mac` 存在时用 `net.ParseMAC` 校验。
9. `pon_sn`、`product_number`、`serial_number` 只允许 4 至 64 个字母、数字、点、冒号、连字符或斜杠。
10. 先拒绝敏感键，再按与互联网严格模板相同的 `Original()` 比较方式兼容未变化历史字段。

用于身份格式的正则写成：

```go
var ontIdentityValuePattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9.\-:/]{3,63}$`)
```

固定工作角色校验成功后同步规范化 `asset.role`：

```go
switch role := metadataString(metadata, "operating_role"); role {
case "bridge_ont":
	e.Record.Set("role", "桥接光猫")
case "router_ont":
	e.Record.Set("role", "光猫路由一体机")
case "ifttr_main_gateway":
	e.Record.Set("role", "iFTTR 主网关")
default:
	return e.BadRequestError("工作角色只能选择桥接光猫、光猫路由一体机或 iFTTR 主网关。", nil)
}
```

- [ ] **Step 4: 运行 Hub 校验测试**

Run:

```powershell
go test -tags=testing ./internal/hub -run TestAssetMasterValidation -count=1
go test -tags=testing ./internal/hub -run TestAssetEnrichment -count=1
```

Expected: 全部 PASS。

- [ ] **Step 5: 提交 Hub 严格校验**

```powershell
git add internal/hub/asset_type_validation.go internal/hub/asset_master_validation.go internal/hub/asset_master_validation_test.go
git commit -m "feat: validate strict ont records in hub"
```

### Task 5: 新增 optical 接口类型并接入拓扑映射

**Files:**
- Create: `internal/migrations/zzzzzzzz_asset_interface_optical.go`
- Create: `internal/migrations/zzzzzzzz_asset_interface_optical_test.go`
- Modify: `internal/site/src/types.d.ts`
- Modify: `internal/site/src/modules/asset-center/asset-detail-relations.ts`
- Modify: `internal/site/src/modules/asset-center/asset-interface-display.ts`
- Modify: `internal/site/src/lib/network-topology.ts`
- Modify: `internal/site/src/modules/network-topology/workspace-data.ts`
- Test: `internal/site/src/modules/asset-center/asset-interface-display.test.ts`
- Test: `internal/site/src/modules/network-topology/workspace-data.test.ts`

- [ ] **Step 1: 写迁移和前端映射失败测试**

迁移测试：

```go
func TestEnsureSelectFieldValueAddsOpticalOnce(t *testing.T) {
	collection := core.NewBaseCollection("asset_interfaces")
	collection.Fields.Add(&core.SelectField{Name: "kind", Values: []string{"ethernet", "pon"}, MaxSelect: 1})

	require.True(t, ensureSelectFieldValue(collection, "kind", "optical"))
	field, ok := collection.Fields.GetByName("kind").(*core.SelectField)
	require.True(t, ok)
	require.Equal(t, []string{"ethernet", "pon", "optical"}, field.Values)
	require.False(t, ensureSelectFieldValue(collection, "kind", "optical"))
}
```

前端测试追加：

```ts
assert.equal(formatAssetInterfaceKind("optical"), "光纤")
assert.equal(mapAssetInterfaceKindToNetworkPortType("pon", { role: "uplink" }), "uplink")
assert.equal(mapAssetInterfaceKindToNetworkPortType("optical", { role: "downlink" }), "downlink")
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
go test -tags=testing ./internal/migrations -run TestEnsureSelectFieldValueAddsOpticalOnce -count=1
cd internal/site
npm run test:asset-center
npm run test:network-topology
```

Expected: FAIL，`optical` 尚不属于接口类型或映射函数尚未处理。

- [ ] **Step 3: 添加可回滚迁移和类型选项**

`zzzzzzzz_asset_interface_optical.go` 复用现有 `ensureSelectFieldValue()`：

```go
package migrations

import (
	"database/sql"
	"errors"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("asset_interfaces")
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil
			}
			return err
		}
		if !ensureSelectFieldValue(collection, "kind", "optical") {
			return nil
		}
		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("asset_interfaces")
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil
			}
			return err
		}
		field, ok := collection.Fields.GetByName("kind").(*core.SelectField)
		if !ok || field == nil {
			return nil
		}
		values := make([]string, 0, len(field.Values))
		for _, value := range field.Values {
			if value != "optical" {
				values = append(values, value)
			}
		}
		if len(values) == len(field.Values) {
			return nil
		}
		field.Values = values
		return app.Save(collection)
	})
}
```

把 TypeScript 联合类型加入 `"optical"`，在 `interfaceKindOptions` 添加 `{ value: "optical", label: "光纤" }`，在 `formatAssetInterfaceKind()` 添加 `case "optical": return "光纤"`。

- [ ] **Step 4: 让拓扑保留上联 / 下联语义**

在 `workspace-data.ts` 导出并实现：

```ts
export function mapAssetInterfaceKindToNetworkPortType(
	kind: AssetInterfaceRecord["kind"],
	metadata: Record<string, unknown> = {}
): NetworkPortRecord["type"] {
	const role = typeof metadata.role === "string" ? metadata.role : ""
	if (kind === "pon" || role === "uplink") return "uplink"
	if (kind === "optical" || role === "downlink") return "downlink"
	if (kind === "wan") return "wan"
	if (kind === "lan" || kind === "ethernet") return "lan"
	if (kind === "wifi") return "wifi"
	if (kind === "management") return "management"
	return "custom"
}
```

`network-topology.ts` 导入该 helper，删除文件内原来的私有 mapper；`assetInterfaceToNetworkPort()` 调用时传入 `item.metadata ?? {}`。这样前端拓扑映射可由现有 `workspace-data.test.ts` 直接执行，不引入浏览器组件依赖。

- [ ] **Step 5: 运行迁移、前端测试和提交**

Run:

```powershell
go test -tags=testing ./internal/migrations -count=1
cd internal/site
npm run test:asset-center
npm run test:network-topology
npm run typecheck
```

Expected: 全部 PASS。

```powershell
git add internal/migrations/zzzzzzzz_asset_interface_optical.go internal/migrations/zzzzzzzz_asset_interface_optical_test.go internal/site/src/types.d.ts internal/site/src/modules/asset-center/asset-detail-relations.ts internal/site/src/modules/asset-center/asset-interface-display.ts internal/site/src/lib/network-topology.ts internal/site/src/modules/asset-center/asset-interface-display.test.ts internal/site/src/modules/network-topology/workspace-data.ts internal/site/src/modules/network-topology/workspace-data.test.ts
git commit -m "feat: add optical asset interfaces"
```

### Task 6: 在接口管理中区分启用状态、接线状态和接口角色

**Files:**
- Modify: `internal/site/src/modules/asset-center/asset-interface-display.ts`
- Modify: `internal/site/src/modules/asset-center/components/asset-interface-manager.tsx`
- Modify: `internal/site/src/modules/asset-center/asset-detail-page.tsx`
- Modify: `internal/hub/asset_master_validation.go`
- Test: `internal/site/src/modules/asset-center/asset-interface-display.test.ts`
- Test: `internal/site/src/modules/asset-center/components/asset-interface-manager.test.ts`
- Test: `internal/hub/asset_master_validation_test.go`

- [ ] **Step 1: 写接口状态失败测试**

前端 fixture 添加：

```ts
{
	id: "wifi-24",
	asset: "asset-1",
	name: "2.4 GHz Wi-Fi",
	kind: "wifi",
	connected: false,
	primary: false,
	metadata: { enabled: false, role: "radio", band: "2.4 GHz" },
}
```

断言 speed item 包含 `enabled: false`，组件源码包含 `启用`、`未启用`、`已接线`、`未接线`、`交换机（待建档）`，且不包含 `手机连接中`。

Hub 测试通过 API 创建 ONT 接口，依次断言：

```text
metadata.enabled 缺失       -> 400，ONT 接口必须明确填写启用状态
metadata.enabled="yes"     -> 400，接口启用状态必须是布尔值
metadata.role="usb"        -> 400，接口角色无效
kind=wifi 且 band=6 GHz     -> 400，无线频段只能是 2.4 GHz 或 5 GHz
enabled=false connected=true -> 400，未启用接口不能标记为当前接入
kind=lan speed_mbps=-1      -> 400，接口速率不能小于 0
kind=lan enabled=true       -> 200
```

使用以下表驱动请求覆盖失败分支：

```go
ont, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
	"user": user.Id, "name": "接口验收 ONT", "type": "ont", "status": "active",
})
require.NoError(t, err)
tests := []struct {
	name    string
	body    string
	message string
}{
	{name: "missing enabled", body: `{"name":"LAN 1","kind":"lan","speed_mbps":2500,"metadata":{"role":"lan"}}`, message: "必须明确填写启用状态"},
	{name: "string enabled", body: `{"name":"LAN 1","kind":"lan","speed_mbps":2500,"metadata":{"enabled":"yes","role":"lan"}}`, message: "启用状态必须是布尔值"},
	{name: "invalid role", body: `{"name":"USB","kind":"custom","metadata":{"enabled":true,"role":"usb"}}`, message: "接口角色只能选择"},
	{name: "invalid band", body: `{"name":"6 GHz Wi-Fi","kind":"wifi","metadata":{"enabled":true,"role":"radio","band":"6 GHz"}}`, message: "无线频段只能选择"},
	{name: "disabled connected", body: `{"name":"2.4 GHz Wi-Fi","kind":"wifi","connected":true,"metadata":{"enabled":false,"role":"radio","band":"2.4 GHz"}}`, message: "未启用接口不能标记为当前接入"},
	{name: "invalid speed", body: `{"name":"LAN 1","kind":"lan","speed_mbps":-1,"metadata":{"enabled":true,"role":"lan"}}`, message: "接口速率不能小于 0"},
}
for _, tc := range tests {
	t.Run(tc.name, func(t *testing.T) {
		body := strings.TrimSuffix(tc.body, "}") + fmt.Sprintf(`,"user":"%s","asset":"%s","source":"manual"}`, user.Id, ont.Id)
		response := pulseTests.PerformTestAPIRequest(t, hub.TestApp, http.MethodPost, "/api/collections/asset_interfaces/records", strings.NewReader(body), headers)
		require.Equal(t, http.StatusBadRequest, response.Status, response.Body)
		require.Contains(t, response.Body, tc.message)
	})
}
```

- [ ] **Step 2: 运行定向测试确认失败**

Run:

```powershell
cd internal/site
node --experimental-strip-types src/modules/asset-center/asset-interface-display.test.ts
node --experimental-strip-types src/modules/asset-center/components/asset-interface-manager.test.ts
cd C:\Users\Nacht\Documents\PL
go test -tags=testing ./internal/hub -run TestAssetMasterValidation/ValidatesONTInterfaceState -count=1
```

Expected: FAIL，当前保存只写 `metadata.notes`，且 UI 不显示 `enabled`。

- [ ] **Step 3: 读写接口 metadata.enabled 与角色信息**

在 `asset-detail-page.tsx` 的 payload 中改为：

```ts
metadata: {
	enabled: form.get("enabled") !== "no",
	role: form.get("interface_role")?.toString() || "",
	band: form.get("band")?.toString() || "",
	connection_note: form.get("connection_note")?.toString().trim() || "",
	notes: form.get("notes")?.toString().trim() || "",
},
```

给接口弹窗增加受控类型草稿，并在打开新增 / 编辑弹窗时同步：

```ts
const [interfaceKindDraft, setInterfaceKindDraft] = useState<AssetInterfaceKind>("ethernet")

function openAddInterfaceDialog() {
	setEditingInterface(null)
	setInterfaceKindDraft("ethernet")
	setInterfaceDialogOpen(true)
}

function openEditInterfaceDialog(record: AssetInterfaceRecord) {
	setEditingInterface(record)
	setInterfaceKindDraft(record.kind)
	setInterfaceDialogOpen(true)
}
```

接口表单在“当前接入”前新增固定选择：

```tsx
<SelectField
	name="enabled"
	label="启用状态"
	options={[{ value: "yes", label: "启用" }, { value: "no", label: "未启用" }]}
	defaultValue={editingInterface?.metadata?.enabled === false ? "no" : "yes"}
/>
<SelectField
	name="interface_role"
	label="接口角色"
	options={[
		{ value: "uplink", label: "上联" },
		{ value: "downlink", label: "下联" },
		{ value: "lan", label: "LAN" },
		{ value: "radio", label: "无线频段" },
	]}
	defaultValue={getMetadataString(editingInterface?.metadata, "role") || "lan"}
/>
```

原有接口类型 `SelectField` 改为 `value={interfaceKindDraft}` 和 `onChange={(value) => setInterfaceKindDraft(value as AssetInterfaceKind)}`。仅当 `interfaceKindDraft === "wifi"` 时渲染频段下拉：

```tsx
{interfaceKindDraft === "wifi" ? (
	<SelectField
		name="band"
		label="无线频段"
		options={[{ value: "2.4 GHz", label: "2.4 GHz" }, { value: "5 GHz", label: "5 GHz" }]}
		defaultValue={getMetadataString(editingInterface?.metadata, "band") || "5 GHz"}
	/>
) : null}
```

无线接口显示 `band` 固定下拉；非 Wi-Fi 接口提交空字符串。`connection_note` 使用普通文本框，允许“交换机（待建档）”，不允许由它创建关系。

- [ ] **Step 4: 更新接口卡和清单摘要**

`AssetInterfaceSpeedItem` 增加：

```ts
enabled: boolean
connectionNote?: string
```

兼容规则为 metadata 未出现 `enabled` 时视为启用：

```ts
export function isAssetInterfaceEnabled(record: AssetInterfaceRecord) {
	return record.metadata?.enabled !== false
}
```

组件标签规则：

```tsx
<Badge variant={isAssetInterfaceEnabled(record) ? "success" : "secondary"}>
	{isAssetInterfaceEnabled(record) ? "启用" : "未启用"}
</Badge>
{record.kind === "wifi" ? null : (
	<Badge variant={record.connected ? "success" : "outline"}>{record.connected ? "已接线" : "未接线"}</Badge>
)}
```

接口卡在地址摘要下方显示中性接线说明：

```tsx
const connectionNote = getMetadataString(record.metadata, "connection_note")

{connectionNote ? <div className="mt-1 text-xs text-muted-foreground">{connectionNote}</div> : null}
```

无线接口不显示“已接线 / 未接线”；连接终端只在关系区域出现。

- [ ] **Step 5: Hub 校验 ONT 接口 metadata**

在接口 create / update hook 的 duplicate 校验前调用 `validateAssetInterfaceProfileRequest(e)`。该函数读取接口所属资产；仅 `asset.type == "ont"` 时执行：

```go
metadata := recordJSONMap(e.Record, "metadata")
enabled, ok := metadata["enabled"].(bool)
if !ok {
	return e.BadRequestError("ONT 接口必须明确填写启用状态。", nil)
}
_ = enabled
role := metadataString(metadata, "role")
if !stringInSet(role, "uplink", "downlink", "lan", "radio") {
	return e.BadRequestError("接口角色只能选择上联、下联、LAN 或无线频段。", nil)
}
if strings.TrimSpace(e.Record.GetString("kind")) == "wifi" {
	if !stringInSet(metadataString(metadata, "band"), "2.4 GHz", "5 GHz") {
		return e.BadRequestError("无线频段只能选择 2.4 GHz 或 5 GHz。", nil)
	}
}
if !enabled && e.Record.GetBool("connected") {
	return e.BadRequestError("未启用接口不能标记为当前接入。", nil)
}
if speed := e.Record.GetFloat("speed_mbps"); speed < 0 {
	return e.BadRequestError("接口速率不能小于 0。", nil)
}
```

接口 metadata 只允许 `enabled`、`role`、`band`、`connection_note`、`notes`，历史未变化键只读兼容。

- [ ] **Step 6: 运行测试并提交**

Run:

```powershell
cd internal/site
npm run test:asset-center
npm run typecheck
cd C:\Users\Nacht\Documents\PL
go test -tags=testing ./internal/hub -run TestAssetMasterValidation -count=1
```

Expected: 全部 PASS。

```powershell
git add internal/site/src/modules/asset-center/asset-interface-display.ts internal/site/src/modules/asset-center/components/asset-interface-manager.tsx internal/site/src/modules/asset-center/asset-detail-page.tsx internal/hub/asset_master_validation.go internal/site/src/modules/asset-center/asset-interface-display.test.ts internal/site/src/modules/asset-center/components/asset-interface-manager.test.ts internal/hub/asset_master_validation_test.go
git commit -m "feat: distinguish ont interface states"
```

### Task 7: 强制宽带 / PON 与手机 / 5 GHz 关系规则

**Files:**
- Modify: `internal/hub/asset_master_validation.go`
- Modify: `internal/hub/asset_master_validation_test.go`
- Modify: `internal/site/src/modules/asset-center/asset-detail-relations.ts`
- Modify: `internal/site/src/modules/asset-center/asset-detail-relations.test.ts`

- [ ] **Step 1: 写 Wi-Fi 关系失败测试**

创建 phone、ONT、启用 5 GHz 和未启用 2.4 GHz 接口，断言：

```text
phone -> ONT 5 GHz，connected_to，link_kind=wifi  -> 200
phone -> ONT 2.4 GHz，connected_to，link_kind=wifi -> 400，无线关系不能连接未启用的 Wi-Fi 接口
phone -> ONT LAN 1，connected_to，link_kind=wifi    -> 400，无线关系必须选择 Wi-Fi 接口
ONT -> phone 5 GHz，connected_to，link_kind=wifi    -> 400，无线关系必须由终端指向接入设备
phone -> ONT 5 GHz，depends_on，link_kind=wifi      -> 400，无线链路必须使用网络连接关系
```

对两个 Wi-Fi 接口建立 API fixture 后，用以下 helper 发出真实关系请求：

```go
createWiFiRelation := func(sourceAsset string, targetAsset string, kind string, targetInterface string) pulseTests.TestAPIResponse {
	body := fmt.Sprintf(`{"user":"%s","source_asset":"%s","target_asset":"%s","kind":"%s","metadata":{"link_kind":"wifi","target_interface":"%s"}}`, user.Id, sourceAsset, targetAsset, kind, targetInterface)
	return pulseTests.PerformTestAPIRequest(t, hub.TestApp, http.MethodPost, "/api/collections/asset_relations/records", strings.NewReader(body), headers)
}

accepted := createWiFiRelation(phone.Id, ont.Id, "connected_to", wifi5.Id)
require.Equal(t, http.StatusOK, accepted.Status, accepted.Body)

disabled := createWiFiRelation(secondPhone.Id, ont.Id, "connected_to", wifi24.Id)
require.Equal(t, http.StatusBadRequest, disabled.Status, disabled.Body)
require.Contains(t, disabled.Body, "不能连接未启用的 Wi-Fi 接口")

wrongInterface := createWiFiRelation(thirdPhone.Id, ont.Id, "connected_to", lan1.Id)
require.Equal(t, http.StatusBadRequest, wrongInterface.Status, wrongInterface.Body)
require.Contains(t, wrongInterface.Body, "必须选择 Wi-Fi 接口")

wrongDirectionBody := fmt.Sprintf(`{"user":"%s","source_asset":"%s","target_asset":"%s","kind":"connected_to","metadata":{"link_kind":"wifi","source_interface":"%s"}}`, user.Id, ont.Id, fourthPhone.Id, wifi5.Id)
wrongDirection := pulseTests.PerformTestAPIRequest(t, hub.TestApp, http.MethodPost, "/api/collections/asset_relations/records", strings.NewReader(wrongDirectionBody), headers)
require.Equal(t, http.StatusBadRequest, wrongDirection.Status, wrongDirection.Body)
require.Contains(t, wrongDirection.Body, "必须由终端指向")

wrongKind := createWiFiRelation(fifthPhone.Id, ont.Id, "depends_on", wifi5.Id)
require.Equal(t, http.StatusBadRequest, wrongKind.Status, wrongKind.Body)
require.Contains(t, wrongKind.Body, "必须使用网络连接关系")
```

同时扩展互联网测试：ONT 的 PON 接口为 `metadata.role=uplink` 时接受；ONT 的 optical 下联口和 LAN 口都被拒绝。

- [ ] **Step 2: 运行关系测试确认失败**

Run: `go test -tags=testing ./internal/hub -run "TestAssetMasterValidation/(EnforcesInternetRelationBoundary|EnforcesWiFiRelationBoundary)" -count=1`

Expected: Wi-Fi 关系错误分支当前未被拒绝，测试 FAIL。

- [ ] **Step 3: 实现 Hub Wi-Fi 端点校验**

在 `validateAssetRelationRequest()` 的互联网校验后调用：

```go
if err := h.validateWiFiAssetRelation(e, sourceRecord, targetRecord); err != nil {
	return err
}
```

实现以下规则：

```go
func (h *Hub) validateWiFiAssetRelation(e *core.RecordRequestEvent, sourceRecord *core.Record, targetRecord *core.Record) error {
	if recordMetadataString(e.Record, "link_kind") != "wifi" {
		return nil
	}
	if strings.TrimSpace(e.Record.GetString("kind")) != "connected_to" {
		return e.BadRequestError("无线链路必须使用网络连接关系。", nil)
	}
	if !stringInSet(strings.TrimSpace(targetRecord.GetString("type")), "ont", "router", "gateway", "ap") {
		return e.BadRequestError("无线关系必须由终端指向光猫、路由器、网关或 AP。", nil)
	}
	interfaceID := recordMetadataString(e.Record, "target_interface")
	if interfaceID == "" {
		return e.BadRequestError("无线关系必须选择目标设备的 Wi-Fi 接口。", nil)
	}
	interfaceRecord, err := h.FindRecordById("asset_interfaces", interfaceID)
	if err != nil {
		return e.BadRequestError("目标 Wi-Fi 接口不存在。", err)
	}
	if strings.TrimSpace(interfaceRecord.GetString("kind")) != "wifi" {
		return e.BadRequestError("无线关系必须选择 Wi-Fi 接口。", nil)
	}
	if enabled, ok := recordJSONMap(interfaceRecord, "metadata")["enabled"].(bool); ok && !enabled {
		return e.BadRequestError("无线关系不能连接未启用的 Wi-Fi 接口。", nil)
	}
	return nil
}
```

历史 Wi-Fi 接口没有 `metadata.enabled` 时视为启用，避免破坏旧关系；新 ONT 接口已由 Task 6 强制明确布尔值。

- [ ] **Step 4: 前端允许 ONT 并过滤未启用 Wi-Fi**

`isRelationGuideTarget()` 的 Wi-Fi 分支改为：

```ts
case "wifi":
	return asset.type === "ont" || asset.type === "ap" || asset.type === "router" || asset.type === "gateway"
```

`getPeerInterfaceOptions()` 增加：

```ts
.filter((item) => guideId !== "wifi" || (item.kind === "wifi" && item.metadata?.enabled !== false))
```

测试断言 ONT 出现在 Wi-Fi 目标中、2.4 GHz 未启用接口不出现、5 GHz 启用接口出现。

- [ ] **Step 5: 运行关系测试并提交**

Run:

```powershell
go test -tags=testing ./internal/hub -run TestAssetMasterValidation -count=1
cd internal/site
node --experimental-strip-types src/modules/asset-center/asset-detail-relations.test.ts
```

Expected: 全部 PASS。

```powershell
git add internal/hub/asset_master_validation.go internal/hub/asset_master_validation_test.go internal/site/src/modules/asset-center/asset-detail-relations.ts internal/site/src/modules/asset-center/asset-detail-relations.test.ts
git commit -m "feat: validate ont internet and wifi relations"
```

### Task 8: 使用本地已登录环境创建真实主网关、接口和关系

**Files:**
- No repository file changes.

- [ ] **Step 1: 先启动并确认源码开发环境**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental/scripts/run-hub-dev.ps1 -Restart
Invoke-WebRequest -Uri http://localhost:8090/api/health -UseBasicParsing
```

Expected: Hub `8090` 返回 `200`，Vite `5173` 可打开。

- [ ] **Step 2: 在资产中心创建真实 ONT 主档**

通过 `http://localhost:5173/assets` 的已登录会话创建 `ont` 资产，填写已确认的非秘密值：华为、Huawei OptiXstar、V271-20、中国联通、iFTTR 主网关、家 / 弱电箱、使用中、管理 IPv4 `192.168.1.1`、Wi-Fi 7、5 GHz 启用、2.4 GHz 未启用、LAN 数量和电源规格。

铭牌身份值仅从本地照片人工复制到本地表单；不得写入终端命令、脚本、聊天、测试、日志或 Git 文件。SSID、管理密码、Wi-Fi 密码和二维码凭据全部跳过。

Expected: 保存成功，资产详情显示“光猫 / ONT 档案”和严格分组；浏览器网络请求没有 `400`。

- [ ] **Step 3: 上传不含铭牌凭据的设备封面**

通过现有本地媒体库选择设备外观照片，使用固定 16:9 编辑框裁出设备正面或整体外观，确保裁剪结果不包含铭牌、二维码、SSID、密码或唯一身份值，再设为封面。原始桌面照片只进入本地对象存储，不复制到仓库目录。

Expected: 详情大图和下方缩略图完整显示安全的 16:9 外观图；Git 工作树没有新增照片文件。

- [ ] **Step 4: 创建八个真实网络接口**

按以下固定数据创建，不填写未经确认的速率：

```text
PON 上联       kind=pon      enabled=true  connected=true  role=uplink    speed=空
下联光口       kind=optical  enabled=true  connected=false role=downlink  speed=空
LAN 1          kind=lan      enabled=true  connected=true  role=lan       speed=2500  connection_note=交换机（待建档）
LAN 2          kind=lan      enabled=true  connected=false role=lan       speed=1000
LAN 3          kind=lan      enabled=true  connected=false role=lan       speed=1000
LAN 4          kind=lan      enabled=true  connected=false role=lan       speed=1000
2.4 GHz Wi-Fi kind=wifi     enabled=false connected=false role=radio     band=2.4 GHz
5 GHz Wi-Fi   kind=wifi     enabled=true  connected=true  role=radio     band=5 GHz
```

Expected: 接口卡只显示“启用 / 未启用”和“已接线 / 未接线”；任何接口卡都不显示“手机连接中”。

- [ ] **Step 5: 创建两条真实关系**

在关系编辑器创建：

```text
中国联通宽带 -> 华为 iFTTR 主网关 / PON 上联
kind=connected_to
link_kind=internet
source_interface=空
target_interface=PON 上联
```

```text
Redmi K50 -> 华为 iFTTR 主网关 / 5 GHz Wi-Fi
kind=connected_to
link_kind=wifi
source_interface=空
target_interface=5 GHz Wi-Fi
```

Expected: 宽带详情不再显示“待关联接入设备”；ONT 关系区显示 Redmi K50 连接 5 GHz Wi-Fi。不要创建交换机占位资产或无 target 关系。

- [ ] **Step 6: 使用只读 API 确认落地数量和秘密缺失**

在浏览器已登录会话中检查当前 ONT 的 JSON 响应：1 个 ONT 主档、8 个接口、2 条相关关系。用开发者工具搜索响应，确认不含 `password`、`ssid`、`credential`、`secret`、`token`、`qr_code`。

Expected: 数量与上述一致，秘密键搜索为 0 个结果。

### Task 9: 更新版本说明和 About 分端记录

**Files:**
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`
- Modify: `internal/site/package.json`
- Create: `internal/site/src/components/routes/settings/release-history-ont.test.ts`

- [ ] **Step 1: 写发布记录契约失败测试或源码断言**

新建 `release-history-ont.test.ts`，写入：

```ts
import assert from "node:assert/strict"
import { releaseHistory } from "./release-history.ts"

const nextReleaseText = releaseHistory[0].sections.flatMap((section) => section.items).join("\n")
for (const text of ["光猫 / ONT 严格类型模板", "iFTTR 主网关", "optical", "未启用的 Wi-Fi 接口"]) {
	assert.equal(nextReleaseText.includes(text), true, `1.0.6 记录缺少 ${text}`)
}

console.log("ont release history contract passed")
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd internal/site; node --experimental-strip-types src/components/routes/settings/release-history-ont.test.ts`

Expected: FAIL，About 尚未记录本轮改动。

- [ ] **Step 3: 在下一版记录和 About 中按端写清改动**

`Web / Hub` 添加：

```text
光猫 / ONT 升级为第二个严格类型模板：通过固定工作角色区分桥接光猫、光猫路由一体机和 iFTTR 主网关，统一身份归属、光纤接入、路由管理、无线、有线、其他端口电源与设备标识字段；列表、详情、编辑、完整度、导入导出和资料补全使用同一规格，历史未知字段只读兼容。
```

```text
资产接口新增 optical 光纤类型，并把接口能力、启用状态、物理接线状态和资产关系分开维护；PON 作为上联、下联光口作为下联，USB、电话、电源和按钮只保留为硬件参数。
```

```text
Hub 新增 ONT 写入和关系边界：拒绝模板外字段、秘密字段、无效固定选项和错误身份格式；宽带只能连接 PON / WAN 上联，Wi-Fi 关系不能连接未启用无线接口，也不能把待建档交换机伪造成资产关系。
```

`移动端 / Android App` 添加：

```text
本轮没有新增 Android 原生能力；移动端 WebView 跟随 Web / Hub 1.0.6 使用相同 ONT 严格字段、接口状态和关系规则，并完成 390 × 844 视口验收。
```

`Agent / 部署` 添加：

```text
本轮不改变 Agent 采集协议或部署参数；ONT 参数、接口和关系先由资产中心手工确认，后续统一发布时 Hub、Agent、Web 和 Android App 仍使用同一 1.0.6 版本号。
```

`文档 / 规则` 添加：

```text
新增光猫 / ONT 与 iFTTR 主网关严格模板设计和实施计划，固化真实接口、工作角色、敏感信息丢弃、未建档目标不造假以及典型设备复用规则。
```

在 `internal/site/package.json` 的 `test:asset-center` 中加入：

```json
"node --experimental-strip-types src/components/routes/settings/release-history-ont.test.ts"
```

- [ ] **Step 4: 运行记录测试并提交**

Run: `cd internal/site; npm run test:asset-center`

Expected: PASS。

```powershell
git add docs/release-notes-next.md internal/site/package.json internal/site/src/components/routes/settings/release-history.ts internal/site/src/components/routes/settings/release-history-ont.test.ts
git commit -m "docs: record strict ont asset template"
```

### Task 10: 完整验证、源码重启和双视口浏览器验收

**Files:**
- Modify only if verification exposes a defect in files already listed above.

- [ ] **Step 1: 运行前端完整验证**

Run:

```powershell
cd internal/site
npm run test
npm run typecheck
npm run build
```

Expected: 三条命令退出码均为 `0`；Vite 构建无新增 warning / error。

- [ ] **Step 2: 运行 Hub 与迁移完整验证**

Run:

```powershell
cd C:\Users\Nacht\Documents\PL
go test -tags=testing ./internal/hub ./internal/migrations -count=1
```

Expected: 两个包全部 PASS。

- [ ] **Step 3: 检查格式、工作树和敏感内容**

Run:

```powershell
cd internal/site
npx biome check src/modules/asset-center src/lib/network-topology.ts src/components/routes/assets.tsx src/components/routes/settings/release-history.ts
cd C:\Users\Nacht\Documents\PL
rg -n -i "wifi[_ -]?password|management[_ -]?password|ssid|credential|qr[_ -]?code|broadband[_ -]?account" docs/superpowers docs/release-notes-next.md internal/site/src/modules/asset-center internal/hub
git status --short
```

Expected: Biome 退出码 `0`；敏感扫描只命中拒绝规则、测试中的假键名和明确“不保存”的说明，不命中任何真实值；工作树只含本轮预期文件或为空。

- [ ] **Step 4: 强制重启源码环境**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental/scripts/run-hub-dev.ps1 -Restart
Invoke-WebRequest -Uri http://localhost:8090/api/health -UseBasicParsing
```

Expected: Hub `8090` 返回 `200`，Vite `5173` 页面可加载。

- [ ] **Step 5: 桌面端验收**

使用 in-app browser 打开 `http://localhost:5173/assets`，桌面视口验证：

1. 列表显示主网关名称、Huawei OptiXstar V271-20、家 / 弱电箱、10G-EPON / iFTTR 主网关、2.5GbE + 3 × 1GbE / Wi-Fi 7、使用中。
2. 详情分组与设计一致，没有重复“通用”分组。
3. 2.4 GHz 显示未启用，5 GHz 显示启用；接口区不显示“手机连接中”。
4. LAN 1 显示 2.5GbE、已接线、交换机（待建档）；LAN 2 / 3 / 4 显示 1GbE、未接线。
5. 关系区显示宽带到 PON 上联、Redmi K50 到 5 GHz Wi-Fi。
6. 编辑页面的工作角色、运营商、支持状态和启用状态均为固定下拉，不能自定义。
7. 浏览器 console 没有相关 warning / error。

- [ ] **Step 6: 390 × 844 移动视口验收**

在 in-app browser 设置 `390 × 844`，重复打开列表、详情、编辑、接口和关系弹层。

Expected: 无横向溢出、按钮遮挡、错误叠层、不可读长值或嵌套滚动卡死；表单可以滚动到底并保存；固定选项下拉可操作。

- [ ] **Step 7: 修复验收发现的问题并重复相关验证**

若发现缺陷，先为缺陷补失败测试，再做最小修复；重复对应定向测试、完整前端验证、Hub 验证和受影响视口验收。不得只通过隐藏字段或改文案规避数据源错误。

- [ ] **Step 8: 提交最后的验收修复（仅在确有修复时）**

```powershell
git add internal/site/src internal/hub internal/migrations docs/release-notes-next.md
git commit -m "fix: close ont template acceptance gaps"
```

如果没有验收修复，不创建空提交。

## 最终完成条件

- ONT 所有用户可编辑字段来自 `ontAssetTypeSpec`，通用网络字段集合不再维护另一套 ONT 语义。
- Hub 拒绝模板外字段、敏感字段、错误固定选项、错误格式和错误接口 / 关系端点。
- `optical` 迁移、TypeScript 类型、接口选择和拓扑映射一致。
- 接口能力、启用状态、接线状态和资产关系四层语义分离。
- 本地主网关、8 个接口和 2 条真实关系可在页面立即查看；交换机仅显示待建档说明。
- 仓库、日志、测试、发布记录和聊天中没有真实密码、SSID、二维码凭据或唯一铭牌身份值。
- 前端测试、类型检查、构建、Hub 测试、迁移测试、桌面和 390 × 844 验收全部通过。
- `docs/release-notes-next.md` 与 About 1.0.6 分端记录已经同步。

## 后续可复用规则

- 同类一体设备保留基础硬件类型，用固定工作角色表达部署职责。
- 严格类型规格同时驱动字段、选项、分组、完整度、导入导出和候选白名单。
- 能力、启用、接线、关系分层保存；未建档目标只写中性说明，不创建假资产或假关系。
- 图片和资料可以提出候选，但凭据在识别和写入两个入口都必须被丢弃。
- 新的严格类型继续复制本计划的 TDD 顺序：先规格契约，再页面派生，再 Hub 写入边界，再接口 / 关系，最后落地真实数据和双视口验收。
