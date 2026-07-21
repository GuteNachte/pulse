# 资产详细参数固定分类 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让所有现有和未来物理设备使用同一套详细参数分类、字段归属和写入边界，同时移除设备管理 IPv6，并统一资产清单完整度百分比的语义、颜色、尺寸和位置。

**Architecture:** 在 `asset-center` 必需模块内建立一份前后端共用的资产字段目录，字段目录区分设备档案、详细参数、线路、服务和运行配置范围；详细参数只能归入固定 14 类中的一类。编辑、详情、导入导出、资料补全、Hub 白名单和完整度从目录派生，既有数据库字段和值不迁移、不删除；历史 `fixed_ipv6` 只读兼容，宽带 `public_ipv6` 继续作为线路动态地址。

**Tech Stack:** React 19、TypeScript 6、PocketBase、Go 1.26、Node `--experimental-strip-types` 合约测试、Go `testing` / `testify`、Biome、Vite、浏览器响应式验收。

---

## 模块与文件职责

本次属于现有 `asset-center` 必需模块，不新增模块、路由、数据库集合或迁移。

- `internal/assetcatalog/asset-parameter-registry.json`：唯一字段目录；保存字段键、标签、范围、分类、小标题、顺序、来源、采集方式、类型和适用资产类型。
- `internal/assetcatalog/parameter_registry.go`：嵌入并校验共享 JSON，向 Hub 提供按资产类型查询允许字段的 API。
- `internal/site/src/modules/asset-center/asset-parameter-registry.ts`：解析同一 JSON，向前端提供分类、字段和分组查询 API。
- `internal/site/src/modules/asset-center/asset-schema.ts`：继续负责表单控件、选项、占位和资产类型选择，不再自行决定详细参数分类。
- `internal/site/src/modules/asset-center/asset-type-specs.ts`：继续负责宽带、ONT、交换机的固定选项和格式校验，字段适用性改从共享目录校验。
- `internal/site/src/modules/asset-center/asset-edit-profile-sections.ts`：按共享目录生成编辑页详细参数分类，不再维护主机专用硬编码分组或“其他”。
- `internal/site/src/modules/asset-center/asset-detail-parameter-groups.ts`：按共享目录生成详情卡片，并将接口 / 关系来源的动态行合并进对应固定分类。
- `internal/site/src/modules/asset-center/asset-import*.ts`、`asset-export.ts`：从共享目录生成模板、校验字段并过滤历史管理 IPv6。
- `internal/hub/asset_enrichment_profile.go`、`asset_type_validation.go`：复用共享目录收紧资料补全和 Hub 元数据写入边界。
- `internal/site/src/modules/asset-center/asset-completeness-level.ts`：完整度区间、文案、颜色和筛选键的单一映射。
- `internal/site/src/modules/asset-center/components/asset-completeness-score-tag.tsx`：唯一百分比标签组件。
- `docs/release-notes-next.md`、`internal/site/src/components/routes/settings/release-history.ts`：同步 1.0.6 用户可见更新。

## 字段范围约定

共享目录中的 `scope` 固定为以下五种，只有 `parameter` 进入 14 类详细参数卡：

```ts
export type AssetArchiveFieldScope = "dossier" | "parameter" | "line" | "service" | "operational"
```

- `dossier`：编号、名称、类型、厂商、型号、序列号、状态、位置、用途 / 角色、颜色、管理 IPv4、MAC、管理页面和厂家资料页。
- `parameter`：物理设备稳定参数，必须且只能属于一个固定分类。
- `line`：宽带线路、动态公网地址、套餐与续费。
- `service`：互联网服务监控 URL、检测范围、归属和订阅信息。
- `operational`：实体 ID、网关关系、自动化备注、运行时接口地址等不属于稳定硬件参数的字段；保留现有功能，但不显示为硬件参数卡。

正式目录不得注册 `fixed_ipv6`。`public_ipv6` 只允许 `scope: "line"` 且 `assetTypes: ["internet"]`；运行时 `asset_interfaces.ipv6` 和 `system_details.network_interfaces[].ipv6` 不进入该目录。

### Task 1：建立共享字段目录和唯一归属检查

**Files:**
- Create: `internal/assetcatalog/asset-parameter-registry.json`
- Create: `internal/assetcatalog/parameter_registry.go`
- Create: `internal/assetcatalog/parameter_registry_test.go`
- Create: `internal/site/src/modules/asset-center/asset-parameter-registry.ts`
- Create: `internal/site/src/modules/asset-center/asset-parameter-registry.test.ts`
- Modify: `internal/site/package.json`

- [ ] **Step 1：先写前端失败测试**

创建 `asset-parameter-registry.test.ts`，直接断言固定分类、顺序、唯一键、唯一归属、禁用名称和 IPv6 边界：

```ts
import assert from "node:assert/strict"
import { ASSET_TYPE_OPTIONS, getAssetFormSections } from "./asset-schema.ts"
import {
	ASSET_PARAMETER_CATEGORIES,
	getAssetArchiveField,
	getAssetParameterFieldsForType,
	validateAssetParameterRegistry,
} from "./asset-parameter-registry.ts"

assert.deepEqual(
	ASSET_PARAMETER_CATEGORIES.map((category) => category.title),
	[
		"外观与尺寸",
		"电源",
		"主板与平台",
		"处理器",
		"显卡",
		"内存",
		"存储",
		"网络",
		"接口与扩展",
		"显示",
		"影像",
		"音频",
		"传感器",
		"散热与环境",
	]
)
assert.deepEqual(validateAssetParameterRegistry(), [])
assert.equal(getAssetArchiveField("fixed_ipv6"), undefined)
assert.equal(getAssetArchiveField("public_ipv6")?.scope, "line")
assert.deepEqual(getAssetArchiveField("public_ipv6")?.assetTypes, ["internet"])

for (const { value: type } of ASSET_TYPE_OPTIONS) {
	const fields = getAssetParameterFieldsForType(type)
	assert.equal(new Set(fields.map((field) => field.key)).size, fields.length, `${type} 不能重复注册参数`)
	for (const field of fields) assert.ok(field.category, `${type}.${field.key} 缺少固定分类`)
	const sectionCounts = new Map<string, number>()
	for (const field of fields) {
		const sectionKey = `${field.category}:${field.section ?? ""}`
		sectionCounts.set(sectionKey, (sectionCounts.get(sectionKey) ?? 0) + 1)
	}
	for (const [sectionKey, count] of sectionCounts) {
		assert.ok(count <= 8, `${type}.${sectionKey} 包含 ${count} 项，应继续拆内部小标题`)
	}
	for (const section of getAssetFormSections(type)) {
		for (const field of section.fields) {
			assert.ok(getAssetArchiveField(field.key), `${type}.${field.key} 未进入共享字段目录`)
		}
	}
}

console.log("asset parameter registry contract passed")
```

- [ ] **Step 2：运行测试确认失败**

```powershell
cd C:\Users\Nacht\Documents\PL\internal\site
node --experimental-strip-types src/modules/asset-center/asset-parameter-registry.test.ts
```

预期：因 `asset-parameter-registry.ts` 尚不存在而失败。

- [ ] **Step 3：写 Go 侧失败测试**

创建 `parameter_registry_test.go`：

```go
package assetcatalog

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestParameterRegistryContract(t *testing.T) {
	registry, err := LoadParameterRegistry()
	require.NoError(t, err)
	require.Equal(t, []string{
		"外观与尺寸", "电源", "主板与平台", "处理器", "显卡", "内存", "存储",
		"网络", "接口与扩展", "显示", "影像", "音频", "传感器", "散热与环境",
	}, registry.CategoryTitles())
	require.Nil(t, registry.Field("fixed_ipv6"))
	require.Equal(t, "line", registry.Field("public_ipv6").Scope)
	require.Equal(t, []string{"internet"}, registry.Field("public_ipv6").AssetTypes)
	require.Contains(t, registry.AllowedMetadataKeys("switch"), "ethernet_port_count")
	require.NotContains(t, registry.AllowedMetadataKeys("switch"), "public_ipv6")
}
```

- [ ] **Step 4：运行 Go 测试确认失败**

```powershell
cd C:\Users\Nacht\Documents\PL
go test ./internal/assetcatalog -run TestParameterRegistryContract -count=1
```

预期：因共享目录和加载器尚不存在而失败。

- [ ] **Step 5：实现共享目录结构与加载器**

`asset-parameter-registry.json` 使用以下完整结构，不允许任意扩展顶层分类：

```json
{
  "version": 1,
  "categories": [
    { "id": "appearance", "title": "外观与尺寸", "order": 10 },
    { "id": "power", "title": "电源", "order": 20 },
    { "id": "platform", "title": "主板与平台", "order": 30 },
    { "id": "processor", "title": "处理器", "order": 40 },
    { "id": "graphics", "title": "显卡", "order": 50 },
    { "id": "memory", "title": "内存", "order": 60 },
    { "id": "storage", "title": "存储", "order": 70 },
    { "id": "network", "title": "网络", "order": 80 },
    { "id": "io", "title": "接口与扩展", "order": 90 },
    { "id": "display", "title": "显示", "order": 100 },
    { "id": "imaging", "title": "影像", "order": 110 },
    { "id": "audio", "title": "音频", "order": 120 },
    { "id": "sensors", "title": "传感器", "order": 130 },
    { "id": "thermal_environment", "title": "散热与环境", "order": 140 }
  ],
  "fields": [
    {
      "key": "cpu_model",
      "label": "CPU 型号",
      "scope": "parameter",
      "category": "processor",
      "section": "处理器规格",
      "order": 20,
      "source": "metadata",
      "capture": "agent_collectable",
      "type": "text",
      "assetTypes": ["physical_host", "nas", "server", "mini_pc", "phone", "tablet", "wearable", "ebook", "game_console", "handheld"]
    }
  ]
}
```

每个字段对象固定使用以下结构；`category` 只在 `scope: "parameter"` 时出现：

```json
{
  "key": "cpu_model",
  "label": "CPU 型号",
  "scope": "parameter",
  "category": "processor",
  "section": "处理器规格",
  "order": 20,
  "source": "metadata",
  "capture": "agent_collectable",
  "type": "text",
  "assetTypes": ["physical_host", "nas", "server", "mini_pc", "phone", "tablet", "wearable", "ebook", "game_console", "handheld"]
}
```

字段迁入时按以下边界归类，不能创建“设备参数”“硬件性能”“设备与环境”“其他参数”等分类：

| 范围 / 分类 | 字段族 |
| --- | --- |
| `dossier` | `name`、`type`、`parent_asset`、`asset_tag`、`vendor`、`model`、`internal_model`、`serial_number`、`status`、`location`、`role`、`color`、`device_color`、`fixed_ipv4`、`mac`、`management_url`、`official_url`、`notes` |
| 外观与尺寸 | `form_factor`、`case_form_factor`、`rack_form_factor`、`mount_support`、`length_mm`、`width_mm`、`height_mm`、`dimensions`、`dimensions_mm`、`weight`、`weight_kg`、`net_weight_g`、`body_material`、`colors_available`、`water_resistance`、`installation_method`、`weather_rating`、`door_thickness` |
| 电源 | `chassis_power_detail`、`psu_vendor`、`psu_model`、`power_adapter_w`、`redundant_psu`、`power_mode`、`power_input`、`power_spec`、`battery_capacity_mah`、`battery_type`、`battery_model`、`battery_count`、`battery_life_note`、`charging_power_w`、`wireless_charging`、`capacity_va`、`capacity_w`、`outlet_count`、`topology`、`waveform`、`transfer_time_ms`、`emergency_power`、`energy_monitoring` |
| 主板与平台 | `motherboard_vendor`、`motherboard_model`、`bios_vendor`、`pcie_slots`、`bmc`、`product_series`、`product_number`、`manufacture_date` |
| 处理器 | `cpu_vendor`、`cpu_model`、`cpu_process`、`cpu_architecture`、`cpu_cores`、`cpu_frequency`、`cpu_socket_count` |
| 显卡 | `gpu_detail`、`gpu_vendor`、`gpu_model`、`gpu_board_vendor`、`gpu_vram_gb`、`transcode_engine` |
| 内存 | `memory_gb`、`memory_vendor`、`memory_detail`、`memory_type`、`memory_speed_mhz`、`supported_memory_type`、`max_memory_gb`、`memory_channel_count`、`ecc_memory` |
| 存储 | `storage_gb`、`storage_summary`、`storage_detail`、`storage_vendor`、`storage_model`、`storage_media`、`storage_serial_note`、`storage_options`、`storage_slots`、`bay_count`、`storage_backplane`、`raid_mode`、`raid_controller`、`filesystem`、`hot_swap`、`cache_slots`、`storage_target`、`dust_box_ml`、`water_tank_ml` |
| 网络 | `primary_nic_speed_mbps`、`nic_detail`、`nic_vendor`、`nic_model`、`wifi_vendor`、`wifi_model`、`wifi_support`、`wifi_standard`、`wifi_band`、`wifi_streams`、`wifi_24_supported`、`wifi_24_enabled`、`wifi_5_supported`、`wifi_5_enabled`、`bluetooth_support`、`bluetooth_version`、`mobile_network`、`sim_detail`、`positioning`、`connection_type`、`protocol`、`stream_url`、`carrier`、`operating_role`、`radio_approval_code`、`port_count`、`default_port_speed_mbps`、`wan_port_count`、`lan_port_count`、`lan_2500_count`、`lan_1000_count`、`ethernet_port_count`、`ethernet_supported_speeds`、`default_ethernet_speed_mbps`、`optical_port_count`、`optical_supported_speeds`、`default_optical_speed_mbps`、`other_port_count`、`pon_standard`、`pon_uplink_capacity`、`pon_sn`、`onu_type`、`optical_connector`、`downstream_optical_port_count`、`downstream_optical_status`、`router_status`、`gateway_status`、`dhcp_status`、`lan_subnet`、`ssid_note`、`wps_supported`、`wireless_control`、`indicator_control`、`reset_supported`、`power_switch_supported`、`vlan_note`、`vlan_status`、`management_level`、`management_access`、`port_isolation_status`、`link_aggregation_status`、`switching_capacity_gbps`、`mac_table_entries`、`security_throughput_gbps`、`vpn_throughput_gbps`、`session_capacity`、`antenna_type`、`forwarding_method` |
| 接口与扩展 | `display_outputs`、`audio_output`、`usb_detail`、`usb_ports`、`usb_port_count`、`voice_port_count`、`nfc`、`infrared`、`paper_size`、`duplex`、`supplies`、`print_speed_ppm`、`print_resolution`、`scan_resolution`、`printer_type`、`color_mode`、`unlock_methods`、`station_features` |
| 显示 | `screen_size`、`display_type`、`display_resolution`、`screen_refresh_rate`、`touch_sampling_rate`、`display_brightness`、`display_color_depth`、`hdr_support`、`display_protection`、`luminous_flux_lm`、`color_temperature_k`、`color_rendering_index`、`color_control` |
| 影像 | `camera_summary`、`rear_camera_detail`、`rear_main_camera`、`rear_ultrawide_camera`、`rear_macro_camera`、`rear_telephoto_camera`、`front_camera_detail`、`video_recording`、`image_stabilization`、`resolution`、`sensor_size`、`field_of_view`、`night_vision`、`video_codec` |
| 音频 | `speaker_detail`、`audio_detail` |
| 传感器 | `biometrics`、`sensor_detail`、`sensor_kind`、`measurement_range`、`measurement_accuracy` |
| 散热与环境 | `cooling_system`、`operating_temperature_range`、`operating_humidity_range`、`storage_temperature_range`、`storage_humidity_range`、`lightning_protection_kv` |
| `line` | `access_technology`、`auth_mode`、`down_mbps`、`up_mbps`、`public_ipv4`、`public_ipv6`、`public_ip_checked_at`、`public_ip_next_check_at`、`public_ipv4_error`、`public_ipv6_error`、`public_ip_auto_refresh`、`public_ip_refresh_interval_minutes`、`package_name`、`recurring_price_cny`、`billing_cycle`、`renewal_date`、`auto_renew` |
| `service` | `service_category`、`url`、`internal_url`、`external_url`、`endpoint_scope`、`expected_owner` 及服务订阅字段 |
| `operational` | `account_note`、`official_image_url`、`purchase_date`、`purchase_price_cny`、`warranty_months`、`release_date`、`package_weight_kg`、`preinstalled_os`、`supported_os`、`online_specs_summary`、`custom_category`、`smart_category`、`controller_platform`、`gateway_name`、`entity_id`、`room`、`automation_note`、`firmware_channel`、`protected_assets` |

`parameter_registry.go` 使用 `//go:embed asset-parameter-registry.json`，导出：

```go
func LoadParameterRegistry() (*ParameterRegistry, error)
func MustParameterRegistry() *ParameterRegistry
func (r *ParameterRegistry) Field(key string) *FieldDefinition
func (r *ParameterRegistry) AllowedMetadataKeys(assetType string) map[string]bool
func (r *ParameterRegistry) CategoryTitles() []string
```

TypeScript 包装层导出：

```ts
export const ASSET_PARAMETER_CATEGORIES: readonly AssetParameterCategoryDefinition[]
export function getAssetArchiveField(key: string): AssetArchiveFieldDefinition | undefined
export function getAssetArchiveFieldsForType(type: AssetType): AssetArchiveFieldDefinition[]
export function getAssetParameterFieldsForType(type: AssetType): AssetParameterFieldDefinition[]
export function groupAssetParameterFields(fields: AssetFieldDefinition[]): AssetParameterFieldGroup[]
export function validateAssetParameterRegistry(): string[]
```

包装层同时定义并导出以下类型；`groupAssetParameterFields` 接受结构上兼容的表单字段，避免反向导入 `asset-schema.ts` 形成循环依赖：

```ts
export type AssetParameterCategoryId =
	| "appearance" | "power" | "platform" | "processor" | "graphics" | "memory" | "storage"
	| "network" | "io" | "display" | "imaging" | "audio" | "sensors" | "thermal_environment"

export type AssetArchiveFieldDefinition = {
	key: string
	label: string
	scope: AssetArchiveFieldScope
	category?: AssetParameterCategoryId
	section?: string
	order: number
	source: "asset" | "metadata" | "interface" | "relation"
	capture: "manual" | "agent_collectable" | "agent_required" | "future_collectable"
	type: "text" | "number" | "date" | "url" | "select"
	assetTypes: AssetType[]
}

export type AssetParameterFieldDefinition = AssetArchiveFieldDefinition & {
	scope: "parameter"
	category: AssetParameterCategoryId
}
```

校验必须拒绝：重复字段键、重复分类 ID / 顺序、`parameter` 缺分类、非 `parameter` 带分类、未知分类、无适用类型、`fixed_ipv6`、`public_ipv6` 用于非宽带，以及同类型同分类小标题下重复顺序。

- [ ] **Step 6：接入测试脚本并运行通过**

在 `test:asset-center` 中加入：

```json
"node --experimental-strip-types src/modules/asset-center/asset-parameter-registry.test.ts"
```

运行：

```powershell
cd C:\Users\Nacht\Documents\PL\internal\site
npm run test:asset-center
cd C:\Users\Nacht\Documents\PL
go test ./internal/assetcatalog -count=1
```

预期：两组测试全部通过，字段覆盖报告为空。

- [ ] **Step 7：提交共享目录**

```powershell
git add internal/assetcatalog internal/site/src/modules/asset-center/asset-parameter-registry.ts internal/site/src/modules/asset-center/asset-parameter-registry.test.ts internal/site/package.json
git commit -m "feat: add canonical asset parameter registry"
```

### Task 2：让编辑页和严格模板共用固定分类

**Files:**
- Modify: `internal/site/src/modules/asset-center/asset-schema.ts`
- Modify: `internal/site/src/modules/asset-center/asset-schema-profile.test.ts`
- Modify: `internal/site/src/modules/asset-center/asset-type-specs.ts`
- Modify: `internal/site/src/modules/asset-center/asset-type-specs.test.ts`
- Modify: `internal/site/src/modules/asset-center/asset-edit-profile-sections.ts`
- Modify: `internal/site/src/modules/asset-center/asset-edit-profile-sections.test.ts`
- Modify: `internal/site/src/modules/asset-center/components/asset-edit-profile-fields.tsx`

- [ ] **Step 1：先改测试写出目标分类**

将 `asset-edit-profile-sections.test.ts` 的主机、ONT、交换机断言改为：

```ts
assert.deepEqual(
	buildAssetProfileEditSections("mini_pc", getRequiredAssetProfileFieldKeys("mini_pc")).map((section) => section.title),
	["外观与尺寸", "电源", "主板与平台", "处理器", "显卡", "内存", "存储", "网络", "接口与扩展", "购买信息", "备注"]
)
assert.deepEqual(
	buildAssetProfileEditSections("ont", getRequiredAssetProfileFieldKeys("ont")).map((section) => section.title),
	["主板与平台", "电源", "网络", "接口与扩展", "备注"]
)
assert.deepEqual(
	buildAssetProfileEditSections("switch", getRequiredAssetProfileFieldKeys("switch")).map((section) => section.title),
	["外观与尺寸", "电源", "网络", "散热与环境", "备注"]
)
for (const type of ["mini_pc", "ont", "switch"] as const) {
	const sections = buildAssetProfileEditSections(type, getRequiredAssetProfileFieldKeys(type))
	assert.equal(sections.some((section) => ["其他", "设备参数", "硬件性能", "设备与环境"].includes(section.title)), false)
}
```

在 `asset-schema-profile.test.ts` 中断言所有设备表单不出现 `fixed_ipv6`，宽带仍有 `public_ipv6`：

```ts
for (const { value: type } of ASSET_TYPE_OPTIONS) {
	const keys = getAssetFormSections(type).flatMap((section) => section.fields.map((field) => field.key))
	assert.equal(keys.includes("fixed_ipv6"), false, `${type} 不应暴露管理 IPv6`)
}
assert.equal(getSectionFieldKeys("internet", "动态公网地址").includes("public_ipv6"), true)
```

- [ ] **Step 2：运行测试确认失败**

```powershell
cd C:\Users\Nacht\Documents\PL\internal\site
node --experimental-strip-types src/modules/asset-center/asset-edit-profile-sections.test.ts
node --experimental-strip-types src/modules/asset-center/asset-schema-profile.test.ts
```

预期：旧的“外观尺寸 / 主板 / CPU / GPU / 硬盘 / 接口 / 其他”和 ONT / 交换机旧分组导致断言失败。

- [ ] **Step 3：让表单字段从共享目录取得分类元数据**

保留 `AssetFieldDefinition` 的表单属性，并增加以下可选档案元数据；从共享目录找到字段时统一覆盖标签、来源、采集方式和类型：

```ts
export type AssetFieldDefinition = {
	key: string
	label: string
	source: AssetFieldSource
	type?: AssetFieldType
	placeholder?: string
	required?: boolean
	options?: { value: string; label: string }[]
	capture?: AssetFieldCapture
	category?: AssetParameterCategoryId
	section?: string
	order?: number
}
```

删除 `fixedAddressFields`、`agentConnectionFields`、`networkDeviceFields`、`customFields` 和各严格模板里的 `fixed_ipv6` 定义及键列表引用；不得删除 `public_ipv6`。

- [ ] **Step 4：替换编辑页硬编码分组**

删除 `hostEditSectionDefinitions`、`miniPcHiddenFieldKeys` 和 `buildHostProfileEditSections`，实现统一分组：

```ts
export function buildAssetProfileEditSections(type: AssetRecord["type"], requiredFieldKeys: Set<string>) {
	const remaining = getAssetFormSections(type)
		.flatMap((section) => section.fields)
		.filter((field) => !requiredFieldKeys.has(field.key))
	const parameterFields = remaining.filter((field) => getAssetArchiveField(field.key)?.scope === "parameter")
	const fixedArchiveFields = remaining.filter((field) => getAssetArchiveField(field.key)?.scope !== "parameter")
	return [
		...groupAssetParameterFields(parameterFields),
		...buildNonParameterEditSections(type, fixedArchiveFields),
	]
}
```

`buildNonParameterEditSections` 只允许返回已有的“线路参数”“动态公网地址”“套餐与续费”“互联网服务监控”“订阅与续费”“购买信息”“备注”；物理设备的 `operational` 字段保留在原业务设置区，不得回退为“其他参数”。

- [ ] **Step 5：运行测试确认通过**

```powershell
npm run test:asset-type-spec
npm run test:asset-center
npm run typecheck
```

预期：严格模板固定选项、备注、宽带动态公网 IPv6 均保留，编辑分类与固定顺序通过。

- [ ] **Step 6：提交编辑分类改造**

```powershell
git add internal/site/src/modules/asset-center/asset-schema.ts internal/site/src/modules/asset-center/asset-schema-profile.test.ts internal/site/src/modules/asset-center/asset-type-specs.ts internal/site/src/modules/asset-center/asset-type-specs.test.ts internal/site/src/modules/asset-center/asset-edit-profile-sections.ts internal/site/src/modules/asset-center/asset-edit-profile-sections.test.ts internal/site/src/modules/asset-center/components/asset-edit-profile-fields.tsx
git commit -m "refactor: group asset editing by canonical categories"
```

### Task 3：让详情参数卡复用同一分类并合并接口关系

**Files:**
- Modify: `internal/site/src/modules/asset-center/asset-detail-parameter-groups.ts`
- Modify: `internal/site/src/modules/asset-center/asset-detail-parameter-groups.test.ts`
- Modify: `internal/site/src/modules/asset-center/asset-switch-port-status.ts`
- Modify: `internal/site/src/modules/asset-center/asset-switch-port-status.test.ts`
- Modify: `internal/site/src/modules/asset-center/components/asset-showcase-workspace.tsx`
- Modify: `internal/site/src/modules/asset-center/components/asset-showcase-layout.test.ts`
- Modify: `internal/site/src/modules/asset-center/components/asset-parameter-columns.tsx`

- [ ] **Step 1：先写详情失败测试**

将典型设备断言改成固定分类名称和顺序：

```ts
assert.deepEqual(buildAssetParameterGroups(phone).map((group) => group.title), [
	"电源", "处理器", "内存", "存储", "显示",
])
assert.deepEqual(buildAssetParameterGroups(fullyProfiledHost).map((group) => group.title), [
	"外观与尺寸", "电源", "主板与平台", "处理器", "显卡", "内存", "存储", "网络", "接口与扩展",
])
assert.deepEqual(buildAssetParameterGroups(ont).map((group) => group.title), [
	"电源", "主板与平台", "网络", "接口与扩展",
])
assert.deepEqual(buildAssetParameterGroups(networkSwitch).map((group) => group.title), [
	"外观与尺寸", "电源", "网络", "散热与环境",
])
for (const groups of [buildAssetParameterGroups(phone), buildAssetParameterGroups(fullyProfiledHost), buildAssetParameterGroups(ont)]) {
	assert.equal(groups.some((group) => ["设备参数", "硬件性能", "设备与环境", "其他参数", "其他"].includes(group.title)), false)
}
```

补充上下文测试，确认交换机只有一张“网络”卡且内部包含“端口能力”“网络功能”“网口状态”小标题：

```ts
const groups = buildAssetParameterGroups(networkSwitch, {
	interfaces: switchInterfaces,
	relations: switchRelations,
	assets: relatedAssets,
})
assert.equal(groups.filter((group) => group.title === "网络").length, 1)
assert.deepEqual(
	[...new Set(groups.find((group) => group.title === "网络")?.rows.map((row) => row.section))],
	["端口能力", "网络功能", "网口状态"]
)
```

- [ ] **Step 2：运行测试确认失败**

```powershell
cd C:\Users\Nacht\Documents\PL\internal\site
node --experimental-strip-types src/modules/asset-center/asset-detail-parameter-groups.test.ts
node --experimental-strip-types src/modules/asset-center/asset-switch-port-status.test.ts
```

预期：旧标题、旧语义映射和独立网口卡导致失败。

- [ ] **Step 3：删除详情页重复分类来源**

从 `asset-detail-parameter-groups.ts` 删除：

- `archivePersonalDeviceSectionMap`
- `archiveParameterDetailSectionMap`
- `splitArchiveSectionIntoParameterGroups`
- `buildHostHardwareProfileGroups`
- `hiddenArchiveParameterGroupTitles`
- `hiddenHostHardwareParameterGroupTitles`
- `normalizeArchiveSectionTitle`

统一导出：

```ts
export type AssetParameterGroupContext = {
	interfaces?: AssetInterfaceRecord[]
	relations?: AssetRelationRecord[]
	assets?: AssetRecord[]
}

export function buildAssetParameterGroups(
	asset: AssetRecord,
	context: AssetParameterGroupContext = {}
): AssetParameterGroup[]
```

实现顺序固定为：从共享目录选当前类型的 `parameter` 字段、读取 `asset / metadata / interface / relation` 值、过滤未确认值、按分类顺序和小标题顺序分组、将动态接口行合并到同一分类、最后过滤空分类。

- [ ] **Step 4：收口交换机网口状态**

将 `buildSwitchPortStatusGroup` 改为只返回网络分类追加行：

```ts
export function buildSwitchPortStatusRows(
	asset: AssetRecord,
	interfaces: AssetInterfaceRecord[],
	assets: AssetRecord[],
	relations: AssetRelationRecord[]
): AssetParameterRow[]
```

每行使用 `section: "网口状态"`。`AssetShowcaseWorkspace` 不再把它作为独立参数组插入，只向 `buildAssetParameterGroups` 传上下文。

- [ ] **Step 5：统一图标与卡片内部小标题**

图标只按分类 ID 映射；`AssetParameterColumns` 继续使用两列卡片布局，并按连续 `row.section` 渲染小标题。网络设备即使同时有网卡、无线、光纤、网络功能和网口状态，也只能产生一张“网络”卡。

- [ ] **Step 6：运行测试确认通过**

```powershell
npm run test:asset-center
npm run typecheck
```

预期：典型手机、迷你主机、NAS、ONT、交换机和宽带详情测试通过；宽带仍显示“线路参数 / 动态公网地址 / 套餐与续费”，不强行套 14 类硬件参数。

- [ ] **Step 7：提交详情分类改造**

```powershell
git add internal/site/src/modules/asset-center/asset-detail-parameter-groups.ts internal/site/src/modules/asset-center/asset-detail-parameter-groups.test.ts internal/site/src/modules/asset-center/asset-switch-port-status.ts internal/site/src/modules/asset-center/asset-switch-port-status.test.ts internal/site/src/modules/asset-center/components/asset-showcase-workspace.tsx internal/site/src/modules/asset-center/components/asset-showcase-layout.test.ts internal/site/src/modules/asset-center/components/asset-parameter-columns.tsx
git commit -m "refactor: render asset details from canonical categories"
```

### Task 4：收口导入导出并移除前端管理 IPv6

**Files:**
- Modify: `internal/site/src/modules/asset-center/asset-form.ts`
- Modify: `internal/site/src/modules/asset-center/asset-edit-profile-sections.ts`
- Modify: `internal/site/src/modules/asset-center/asset-import.ts`
- Modify: `internal/site/src/modules/asset-center/asset-import-templates.ts`
- Modify: `internal/site/src/modules/asset-center/asset-export.ts`
- Modify: `internal/site/src/modules/asset-center/asset-import-export.test.ts`
- Modify: `internal/site/src/modules/asset-center/asset-interface-sync.ts`
- Modify: `internal/site/src/modules/asset-center/asset-interface-sync.test.ts`
- Modify: `internal/site/src/modules/asset-center/components/asset-showcase-workspace.tsx`

- [ ] **Step 1：先写管理 IPv6 和导入导出失败测试**

在 `asset-import-export.test.ts` 增加：

```ts
const physicalPreview = buildImportPreviewRow({
	name: "测试主机",
	type: "mini_pc",
	"metadata.fixed_ipv6": "2001:db8::10",
}, 0, [])
assert.equal(physicalPreview.form.metadata.fixed_ipv6, undefined)
assert.equal(physicalPreview.warnings.includes("已忽略历史字段 metadata.fixed_ipv6"), true)

const internetPreview = buildImportPreviewRow({
	name: "家庭宽带",
	type: "internet",
	"metadata.public_ipv6": "2001:db8::20",
}, 0, [])
assert.equal(internetPreview.form.metadata.public_ipv6, "2001:db8::20")

const exported = buildAssetExportCsv([physicalAssetWithHistoricalIpv6], new Set())
assert.equal(exported.includes("fixed_ipv6"), false)
const snapshot = buildAssetCenterSnapshot(snapshotInputWithHistoricalIpv6)
assert.equal(snapshot.includes("fixed_ipv6"), false)
assert.equal(snapshot.includes("public_ipv6"), true)
```

在 `asset-interface-sync.test.ts` 增加：

```ts
const payload = buildPrimaryInterfacePayload("user-1", "asset-1", physicalFormWithHistoricalIpv6)
assert.equal(payload?.ipv6, "")
assert.equal(buildPrimaryInterfacePayload("user-1", "internet-1", internetForm), null)
```

- [ ] **Step 2：运行测试确认失败**

```powershell
cd C:\Users\Nacht\Documents\PL\internal\site
node --experimental-strip-types src/modules/asset-center/asset-import-export.test.ts
node --experimental-strip-types src/modules/asset-center/asset-interface-sync.test.ts
```

预期：旧导入别名、模板、快照和接口同步仍携带 `fixed_ipv6`，测试失败。

- [ ] **Step 3：导入模板与校验从共享目录派生**

删除 `importMetadataAliases.fixed_ipv6` 和所有模板中的 `metadata.fixed_ipv6`。模板字段由 `getAssetArchiveFieldsForType(type)` 过滤 `scope !== "operational"` 后生成；导入时：

```ts
if (metadataKey === "fixed_ipv6") {
	warnings.push("已忽略历史字段 metadata.fixed_ipv6")
	continue
}
const definition = getAssetArchiveField(metadataKey)
if (!definition || !definition.assetTypes.includes(type)) {
	errors.push(`字段 metadata.${metadataKey} 不属于 ${getAssetTypeLabel(type)} 固定模板`)
	continue
}
```

宽带 `public_ipv6` 正常导入。未知字段不得进入 `form.metadata`。

- [ ] **Step 4：导出时过滤历史管理 IPv6**

新增并统一使用：

```ts
export function sanitizeAssetMetadataForArchive(metadata?: Record<string, unknown>) {
	return Object.fromEntries(Object.entries(metadata ?? {}).filter(([key]) => key !== "fixed_ipv6"))
}
```

CSV 的 `metadata` 和 JSON 快照中的每个资产都必须调用该函数；数据库对象本身不修改。

- [ ] **Step 5：停止把管理 IPv6同步到主接口**

`buildPrimaryInterfacePayload` 的 `ipv6` 固定为空字符串，不再读取 `fixed_ipv6` 或 `public_ipv6`。保留用户在接口管理器中维护真实接口 IPv6 的能力；该运行时 / 接口事实不回写设备档案。

- [ ] **Step 6：清理详情和待补字段别名**

从 `asset-form.ts`、`asset-edit-profile-sections.ts`、`asset-showcase-workspace.tsx` 和 `asset-edit-profile-fields.tsx` 移除 `fixed_ipv6` 的显示名、必填键、连接键和专用渲染。保留历史 metadata 原值，不在保存时主动写空或删除。

- [ ] **Step 7：运行测试确认通过**

```powershell
npm run test:asset-center
npm run typecheck
```

预期：物理设备管理 IPv6 全部消失；宽带动态公网 IPv6 和接口运行时 IPv6 仍通过现有测试。

- [ ] **Step 8：提交前端 IPv6 与归档边界**

```powershell
git add internal/site/src/modules/asset-center/asset-form.ts internal/site/src/modules/asset-center/asset-edit-profile-sections.ts internal/site/src/modules/asset-center/asset-import.ts internal/site/src/modules/asset-center/asset-import-templates.ts internal/site/src/modules/asset-center/asset-export.ts internal/site/src/modules/asset-center/asset-import-export.test.ts internal/site/src/modules/asset-center/asset-interface-sync.ts internal/site/src/modules/asset-center/asset-interface-sync.test.ts internal/site/src/modules/asset-center/components/asset-showcase-workspace.tsx
git commit -m "fix: remove device management ipv6 workflows"
```

### Task 5：让 Hub 资料补全和严格模板复用共享目录

**Files:**
- Modify: `internal/hub/asset_enrichment_profile.go`
- Modify: `internal/hub/asset_enrichment_test.go`
- Modify: `internal/hub/asset_enrichment_online.go`
- Modify: `internal/hub/asset_type_validation.go`
- Modify: `internal/hub/asset_master_validation.go`
- Modify: `internal/hub/asset_master_validation_test.go`
- Modify: `internal/hub/asset_validation_rules.go`

- [ ] **Step 1：先写 Hub 写入边界失败测试**

在 `asset_enrichment_test.go` 增加：

```go
func TestAssetEnrichmentRegistryRejectsDeviceManagementIPv6(t *testing.T) {
	allowed := assetEnrichmentAllowedMetadataFieldSet("switch")
	require.False(t, allowed["fixed_ipv6"])
	require.True(t, allowed["ethernet_port_count"])
	require.True(t, assetEnrichmentAllowedMetadataFieldSet("internet")["public_ipv6"])
}
```

同一测试文件补充结构化拆分断言：AI 请求中的 `allowed_fields` 必须包含 `key / label / category / section / type`，模型返回 `cpu_model`、`memory_gb`、`storage_gb` 三条建议时生成三个目标字段；返回 `online_specs_summary` 或未注册字段时不生成建议。Agent 本地采集继续断言内存模块能拆为 `memory_gb`、`memory_detail`、`memory_vendor`、`memory_type`、`memory_speed_mhz`，不能把整段采集 JSON 写入单一正式参数。

在 `TestAssetMasterValidation` 增加 `RejectsDeviceManagementIPv6` 子测试：用 API 新建带 `metadata.fixed_ipv6` 的 `mini_pc` 并断言 `400`；用 `pulseTests.CreateRecord` 建立带历史值的记录，PATCH 只修改名称并断言 `200`，重新读取后断言历史 `fixed_ipv6` 不变；再次 PATCH 修改 `fixed_ipv6` 并断言 `400`。再增加 `AllowsInternetPublicIPv6` 子测试，用 API 创建和更新带 `metadata.public_ipv6` 的 `internet` 记录并断言两次都是 `200`。

- [ ] **Step 2：运行测试确认失败**

```powershell
cd C:\Users\Nacht\Documents\PL
go test ./internal/hub -run 'TestAssetEnrichmentRegistryRejectsDeviceManagementIPv6|TestAssetMasterValidation' -count=1
```

预期：现有 Go 白名单仍允许 `fixed_ipv6`，测试失败。

- [ ] **Step 3：替换资料补全重复白名单**

删除 `assetEnrichmentAddressMetadataFields` 里的 `fixed_ipv6`，并逐步删除 `assetEnrichmentMetadataFieldsByType` 的重复字段数组；`assetEnrichmentAllowedMetadataFieldSet` 改为调用：

```go
func assetEnrichmentAllowedMetadataFieldSet(assetType string) map[string]bool {
	return assetcatalog.MustParameterRegistry().AllowedMetadataKeys(strings.TrimSpace(assetType))
}
```

只允许 `dossier`、`parameter` 和对应类型的 `line / service` 字段生成建议；`operational`、未知和模板外字段保留原始报告审计，但不能生成可接受建议。

- [ ] **Step 4：让资料识别按目录拆分和归一化**

`asset_enrichment_online.go` 不再只把字段键字符串传给模型，而是传递目录描述：

```go
type assetEnrichmentAllowedField struct {
	Key      string `json:"key"`
	Label    string `json:"label"`
	Category string `json:"category,omitempty"`
	Section  string `json:"section,omitempty"`
	Type     string `json:"type"`
}
```

系统提示明确要求“一条原始规格包含多个事实时，按 `allowed_fields` 拆为多条建议；每条建议只能写一个字段；不能把整段原始文本写入摘要或模板外字段”。解析模型结果时只信任 `field`，标签、类型、分类和小标题从共享目录取得；数字字段写入 `metadata.value_type = "number"`，固定选择字段必须通过现有选项校验，无法可靠识别的值只保留在报告原文中，不生成建议。

- [ ] **Step 5：严格模板复用目录允许集**

ONT 和交换机的选项、数值、敏感字段校验继续保留；删除 `ontAssetAllowedMetadataFields`、`switchAssetAllowedMetadataFields` 中的重复白名单，改用共享目录的允许集。历史字段兼容逻辑保持：如果未知 / 已退役字段在原记录中存在且本次值未变化，则允许保存其他字段；新建或更改时拒绝。

- [ ] **Step 6：主档通用校验拒绝新管理 IPv6**

在 `asset_master_validation.go` 的物理设备 metadata 校验中加入统一判断：

```go
if changedMetadataValue(record, "fixed_ipv6") {
	return e.BadRequestError("设备档案不保存管理 IPv6，请在接口运行状态中查看 IPv6。", nil)
}
```

`recordAssetIPValues` 继续只检查管理 IPv4；`recordAssetInterfaceIPValues` 继续允许接口 IPv6，不能误删 Agent / 接口事实。

- [ ] **Step 7：运行 Hub 测试确认通过**

```powershell
go test ./internal/assetcatalog ./internal/hub -count=1
```

预期：共享目录、资料补全、严格模板、历史兼容和宽带公网 IPv6 测试全部通过。

- [ ] **Step 8：提交 Hub 写入边界**

```powershell
git add internal/hub/asset_enrichment_profile.go internal/hub/asset_enrichment_test.go internal/hub/asset_enrichment_online.go internal/hub/asset_type_validation.go internal/hub/asset_master_validation.go internal/hub/asset_master_validation_test.go internal/hub/asset_validation_rules.go
git commit -m "fix: enforce canonical asset metadata writes"
```

### Task 6：让完整度、筛选和百分比组件共用单一映射

**Files:**
- Create: `internal/site/src/modules/asset-center/asset-completeness-level.ts`
- Create: `internal/site/src/modules/asset-center/asset-completeness-level.test.ts`
- Create: `internal/site/src/modules/asset-center/components/asset-completeness-score-tag.tsx`
- Modify: `internal/site/src/modules/asset-center/asset-profiles.ts`
- Modify: `internal/site/src/modules/asset-center/asset-profiles.test.ts`
- Modify: `internal/site/src/modules/asset-center/asset-profile-summary.ts`
- Modify: `internal/site/src/modules/asset-center/asset-profile-summary.test.ts`
- Modify: `internal/site/src/modules/asset-center/asset-list.ts`
- Modify: `internal/site/src/modules/asset-center/asset-list-layout.test.ts`
- Modify: `internal/site/src/modules/asset-center/components/asset-card.tsx`
- Modify: `internal/site/package.json`

- [ ] **Step 1：先写区间映射失败测试**

创建 `asset-completeness-level.test.ts`：

```ts
import assert from "node:assert/strict"
import { getAssetCompletenessLevel } from "./asset-completeness-level.ts"

for (const score of [90, 100]) assert.equal(getAssetCompletenessLevel(score).id, "complete")
for (const score of [70, 89]) assert.equal(getAssetCompletenessLevel(score).id, "usable")
for (const score of [45, 69]) assert.equal(getAssetCompletenessLevel(score).id, "attention")
for (const score of [0, 44]) assert.equal(getAssetCompletenessLevel(score).id, "critical")
assert.deepEqual(
	[100, 73, 58, 21].map((score) => {
		const level = getAssetCompletenessLevel(score)
		return [level.label, level.tone]
	}),
	[["资料完整", "ok"], ["资料可用", "info"], ["资料待补", "warning"], ["资料缺口大", "danger"]]
)
```

- [ ] **Step 2：运行测试确认失败**

```powershell
cd C:\Users\Nacht\Documents\PL\internal\site
node --experimental-strip-types src/modules/asset-center/asset-completeness-level.test.ts
```

预期：映射模块尚不存在。

- [ ] **Step 3：实现唯一完整度定义**

```ts
export const ASSET_COMPLETENESS_LEVELS = [
	{
		id: "complete", min: 90, label: "资料完整", tone: "ok",
		badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300",
		barClassName: "bg-emerald-500",
	},
	{
		id: "usable", min: 70, label: "资料可用", tone: "info",
		badgeClassName: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-300",
		barClassName: "bg-sky-500",
	},
	{
		id: "attention", min: 45, label: "资料待补", tone: "warning",
		badgeClassName: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300",
		barClassName: "bg-amber-500",
	},
	{
		id: "critical", min: 0, label: "资料缺口大", tone: "danger",
		badgeClassName: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300",
		barClassName: "bg-red-500",
	},
] as const

export function getAssetCompletenessLevel(score: number) {
	const normalized = Math.max(0, Math.min(100, Math.round(score)))
	return ASSET_COMPLETENESS_LEVELS.find((level) => normalized >= level.min) ?? ASSET_COMPLETENESS_LEVELS[3]
}
```

同时定义 `AssetCompletenessTone = "ok" | "info" | "warning" | "danger"`；`AssetCompletenessStatus.tone` 改用该类型，资料卡或旧资产卡需要通用标签时，`AssetCardMetaTag` 接受 `AssetLifecycleTone | AssetCompletenessTone` 并为 `info` 使用同一 sky 样式。

`asset-profiles.ts` 为每种资产类型声明资料完整度要求，要求只能引用共享目录中的字段键，或使用固定上下文键 `context.hasInternetUplink`。替换 `getAssetCompletenessChecks` 的类型分支为：

```ts
export type AssetCompletenessRequirement = {
	id: string
	label: string
	anyOf?: readonly string[]
	positiveAnyOf?: readonly string[]
	positiveSumOf?: readonly string[]
	contextKey?: keyof AssetCompletenessContext
}

export function getAssetCompleteness(asset: AssetRecord, context: AssetCompletenessContext = {}) {
	const requirements = getAssetProfile(asset.type)?.completenessRequirements ?? []
	const checks = requirements.map((requirement) => evaluateAssetCompletenessRequirement(asset, context, requirement))
	const missing = checks.filter((check) => !check.ok).map((check) => check.label)
	const score = checks.length === 0 ? 100 : Math.round(((checks.length - missing.length) / checks.length) * 100)
	const level = getAssetCompletenessLevel(score)
	return { score, label: level.label, tone: level.tone, level: level.id, missing }
}
```

其中 `asset.management_ip`、`metadata.fixed_ipv4` 等引用由统一取值器解析；交换机端口数量使用 `positiveSumOf`，内存 / 存储替代字段使用 `positiveAnyOf / anyOf`。测试遍历全部 requirements，确保引用的 metadata 字段存在于共享目录，且不存在 `fixed_ipv6`。

`asset-list.ts` 的筛选使用 `getAssetCompleteness(...).level`，不得再手写四组阈值。

- [ ] **Step 4：实现唯一百分比组件和固定状态槽位**

`asset-completeness-score-tag.tsx`：

```tsx
export function AssetCompletenessScoreTag({ score }: { score: number }) {
	const level = getAssetCompletenessLevel(score)
	return (
		<span
			className={cn(
				"inline-flex h-5 w-11 shrink-0 items-center justify-center rounded-md border font-mono text-[11px] font-medium tabular-nums",
				level.badgeClassName
			)}
			title={`${level.label}，${score}%`}
		>
			{score}%
		</span>
	)
}
```

资产行“状态 / 资料”列使用固定两槽：

```tsx
<div className="hidden min-w-0 grid-cols-[minmax(0,1fr)_2.75rem] items-center gap-1 md:grid">
	<div className="min-w-0 justify-self-end">
		{monitored && <AssetCardMetaTag tone="ok">监控</AssetCardMetaTag>}
	</div>
	<AssetCompletenessScoreTag score={completeness.score} />
	<div className="col-span-2 max-w-full truncate text-right text-[11px] text-muted-foreground">
		{color || (parent ? `归属 ${parent.name}` : maintenanceCount > 0 ? `维护 ${maintenanceCount}` : "")}
	</div>
</div>
```

这样“监控”等标签只能占左槽，百分比永远在最右 `44px` 槽位。详情进度条和预览进度条使用 `level.barClassName`。

- [ ] **Step 5：更新布局合约测试**

`asset-list-layout.test.ts` 断言：

```ts
for (const className of ["h-5", "w-11", "items-center", "justify-center", "font-mono", "tabular-nums"]) {
	assert.ok(scoreTagSource.includes(className), `资料完整度标签缺少固定样式 ${className}`)
}
assert.ok(assetCardSource.includes("grid-cols-[minmax(0,1fr)_2.75rem]"))
assert.ok(assetCardSource.includes("<AssetCompletenessScoreTag score={completeness.score} />"))
```

- [ ] **Step 6：运行测试确认通过**

```powershell
npm run test:asset-center
npm run typecheck
```

预期：边界分数、筛选、状态文案、颜色、44 × 20px 尺寸和固定槽位全部通过。

- [ ] **Step 7：提交完整度收口**

```powershell
git add internal/site/src/modules/asset-center/asset-completeness-level.ts internal/site/src/modules/asset-center/asset-completeness-level.test.ts internal/site/src/modules/asset-center/components/asset-completeness-score-tag.tsx internal/site/src/modules/asset-center/asset-profiles.ts internal/site/src/modules/asset-center/asset-profiles.test.ts internal/site/src/modules/asset-center/asset-profile-summary.ts internal/site/src/modules/asset-center/asset-profile-summary.test.ts internal/site/src/modules/asset-center/asset-list.ts internal/site/src/modules/asset-center/asset-list-layout.test.ts internal/site/src/modules/asset-center/components/asset-card.tsx internal/site/package.json
git commit -m "fix: centralize asset completeness presentation"
```

### Task 7：同步版本记录并完成全链路验收

**Files:**
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`

- [ ] **Step 1：更新 1.0.6 Web / Hub 版本记录**

两处使用相同口径写清：

- 设备档案固定不动，详细参数统一为 14 个中等粒度分类；编辑、详情、导入导出、资料补全和完整度共用字段目录。
- 管理入口只保留管理 IPv4、MAC 和管理页面；历史管理 IPv6 不显示、不写入，宽带动态公网 IPv6 与接口运行时 IPv6 保留。
- 完整度标签使用统一区间、颜色、44 × 20px 固定尺寸和最右固定槽位。

- [ ] **Step 2：运行前端和 Hub 完整验证**

```powershell
cd C:\Users\Nacht\Documents\PL\internal\site
npm test
npm run typecheck
npx biome check src/modules/asset-center src/components/routes/settings/release-history.ts
npm run build
cd C:\Users\Nacht\Documents\PL
go test ./internal/assetcatalog ./internal/hub -count=1
git diff --check
```

预期：所有命令退出码为 0；Vite 构建无 TypeScript、JSON 导入或目录越界错误。

- [ ] **Step 3：启动源码预览**

```powershell
cd C:\Users\Nacht\Documents\PL
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\run-hub-dev.ps1 -Restart
```

预期：Hub `http://localhost:8090/api/health` 返回 `200`，Vite `http://localhost:5173` 可访问。

- [ ] **Step 4：桌面端浏览器验收**

在 `2494 × 1194` 与 `1727 × 1272` 检查：

1. 打开 `/assets/yk7dkjdriwdaage`，确认绿联交换机只显示“外观与尺寸 / 电源 / 网络 / 散热与环境”等适用分类，逐口状态位于“网络”卡内部，旧“硬件与端口能力 / 管理与网络能力 / 设备与环境”标题消失。
2. 打开 `/assets/0avxx79kdk4v2ui`，确认华为主网关只有一张“网络”卡，内部保留光纤、有线、无线和网络功能小标题；设备档案显示管理 IPv4、MAC、管理页面，不显示管理 IPv6。
3. 打开一个迷你主机和一个手机，确认处理器、显卡、内存、存储分别成卡，电源和外观不再混入“其他”。
4. 打开宽带资产 `/assets/hvpbl3jmc8w02qp`，确认动态公网 IPv6、刷新按钮、自动更新、上次更新时间和下次更新时间均正常。
5. 打开 `/assets`，确认 `44 × 20px` 百分比固定在状态列最右，73% 与 100% 宽度一致，“监控”标签不会推动百分比；四个区间颜色分别为绿、蓝、橙、红。
6. 打开任意物理设备编辑页，确认详细参数分类与详情一致，且无管理 IPv6；关闭嵌套接口编辑弹窗不关闭资产编辑页。

- [ ] **Step 5：移动端浏览器验收**

在 `375 × 812`、`390 × 844`、`430 × 932` 检查资产详情与编辑：

- 参数卡单列排列，标题、内部小标题和值不重叠。
- 长型号、URL、IPv6 和端口说明可换行或截断，不产生横向滚动。
- 空分类不渲染，不出现异常大块留白。
- 图片框无图片时仍保留，左列只显示图片和设备档案。
- 浏览器 console 没有 error / warning，网络请求没有新增 4xx / 5xx。

- [ ] **Step 6：保存浏览器证据并最终复验**

保存桌面与移动截图；检查 DOM 中禁用标题和 `fixed_ipv6` 文案均不存在，动态公网 `public_ipv6` 仍存在。再次运行：

```powershell
cd C:\Users\Nacht\Documents\PL
git diff --check
git status --short
```

预期：只有本任务预期文件有修改，未产生临时截图、构建目录或本地数据文件。

- [ ] **Step 7：提交版本记录与验收收口**

```powershell
git add docs/release-notes-next.md internal/site/src/components/routes/settings/release-history.ts
git commit -m "docs: record canonical asset parameter categories"
```

## 自检结果

- 规格覆盖：固定设备档案、14 类详细参数、唯一归属、内部小标题、Agent / 资料补全白名单、导入导出、完整度、管理 IPv6 和宽带公网 IPv6 均有对应任务。
- 兼容边界：不新增集合或迁移，不删除历史 metadata；只阻止 `fixed_ipv6` 新写入，运行时接口 IPv6 与宽带 `public_ipv6` 明确保留。
- 禁止兜底：计划中没有把未归类字段落入“其他参数”；无法稳定归类的字段由共享目录校验阻止进入正式参数。
- 类型一致：统一使用 `AssetArchiveFieldScope`、`AssetParameterCategoryId`、`AssetArchiveFieldDefinition`、`AssetParameterFieldDefinition`、`AssetParameterGroupContext` 和 `AssetCompletenessLevel`，后续任务引用名称与首次定义一致。
- 验证完整：前端合约测试、Hub 测试、TypeScript、Biome、Vite 构建、`git diff --check`、桌面与移动浏览器验收全部列入最终任务。
