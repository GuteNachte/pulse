# 通用交换机资产模板实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 将交换机升级为面向所有用户的通用严格模板，支持不同管理级别、端口规模、端口速率与真实接口关系，不带任何具体设备默认值。

**Architecture:** 前端以 AssetTypeSpec 作为交换机字段、固定选项、详情分组与导入白名单的来源。asset_interfaces 保留为动态端口清单，asset_relations 保留为真实链路来源。Hub 在既有资产、接口与关系校验钩子中增加交换机类型边界，历史数据只读兼容。

**Tech Stack:** React 19、TypeScript、Radix UI、PocketBase、Go、Node 源码契约测试、Go Hub 集成测试。

---

## 变更文件与职责

- internal/site/src/modules/asset-center/asset-type-specs.ts：通用交换机字段、固定选项、导入白名单与前端值校验。
- internal/site/src/modules/asset-center/asset-type-specs.test.ts：锁定模板字段、选项与无具体设备默认值。
- internal/site/src/modules/asset-center/asset-schema.ts：去除交换机的新表单对旧通用字段的双来源读取。
- internal/site/src/modules/asset-center/asset-interface-display.ts：区分端口支持速率和实际协商速率。
- internal/site/src/modules/asset-center/components/asset-interface-manager.tsx：使用“接口”语义展示交换机端口。
- internal/hub/asset_master_validation.go：校验交换机资产与接口 metadata。
- internal/hub/asset_master_validation_test.go：真实 API 请求覆盖通过与拒绝路径。
- docs/release-notes-next.md、internal/site/src/components/routes/settings/release-history.ts：追加已实施的分端更新记录。

### Task 1: 建立通用交换机类型规格

**Files:**

- Modify: internal/site/src/modules/asset-center/asset-type-specs.ts
- Modify: internal/site/src/modules/asset-center/asset-type-specs.test.ts
- Modify: internal/site/src/modules/asset-center/asset-schema.ts

- [ ] **Step 1: 写失败契约测试**

在 asset-type-specs.test.ts 写入：

~~~
const spec = getAssetTypeSpec("switch")
assert.ok(spec)
assert.equal(spec.detailTitle, "交换机档案")
const keys = spec.sections.flatMap((section) => section.fields.map((field) => field.key))
for (const key of [
  "management_level", "management_access", "ethernet_port_count", "optical_port_count", "other_port_count",
  "default_ethernet_speed_mbps", "default_optical_speed_mbps",
  "switching_capacity_gbps", "power_mode", "poe_status", "poe_standard", "poe_budget_w", "vlan_status",
  "port_isolation_status", "link_aggregation_status",
]) assert.equal(keys.includes(key), true, "缺少 " + key)
assert.equal(keys.includes("wifi_standard"), false)
assert.equal(keys.includes("wan_port_count"), false)
assert.equal(getAssetTypeOptionLabel("switch", "management_level", "smart"), "轻管理")
assert.deepEqual(validateAssetImportMetadata("switch", { device_specific_default: "x" }), [
  "字段 metadata.device_specific_default 不属于交换机严格模板",
])
~~~

- [ ] **Step 2: 运行测试确认失败**

Run: cd internal/site; npm run test:asset-type-spec

Expected: FAIL，getAssetTypeSpec("switch") 还不存在。

- [ ] **Step 3: 实现规格与白名单**

在 asset-type-specs.ts 新建 switchAssetTypeSpec；不得定义品牌、型号、端口数量、地址、位置、接线或关系默认值。固定选项：

~~~
const switchManagementLevelOptions = [
  { value: "unmanaged", label: "非网管" },
  { value: "smart", label: "轻管理" },
  { value: "managed", label: "全管理" },
] as const
const switchFeatureStatusOptions = [
  { value: "unsupported", label: "不支持" },
  { value: "disabled", label: "未启用" },
  { value: "enabled", label: "已启用" },
] as const
~~~

分组固定为“接入信息”“硬件与端口能力”“管理与网络能力”“备注”。管理 IPv4、IPv6、URL、各类端口数量、端口速率与交换容量为可选手工字段；管理级别、主要管理入口、供电方式、PoE、VLAN、端口隔离、链路聚合为 fixed_choice。PoE 标准和供电预算仅在 PoE 状态不是 unsupported 时显示。让 getAssetTypeSpec() 和 validateAssetImportMetadata() 都使用此规格。

- [ ] **Step 4: 移除旧字段双来源并验证**

让 networkDeviceFieldKeysByType.switch 不再驱动新建或编辑字段；历史旧键只读兼容，不删除其他网络类型仍使用的 networkDeviceFields。

~~~powershell
cd internal/site
npm run test:asset-type-spec
npm run typecheck
git add src/modules/asset-center/asset-type-specs.ts src/modules/asset-center/asset-type-specs.test.ts src/modules/asset-center/asset-schema.ts
git commit -m "feat: define generic switch template"
~~~

Expected: 测试和类型检查 PASS。

### Task 2: 表达通用交换机的动态端口

**Files:**

- Modify: internal/site/src/modules/asset-center/asset-interface-display.ts
- Modify: internal/site/src/modules/asset-center/asset-interface-display.test.ts
- Modify: internal/site/src/modules/asset-center/components/asset-interface-manager.tsx
- Modify: internal/site/src/modules/asset-center/components/asset-interface-manager.test.ts
- Modify: 调用 AssetInterfaceManager 的资产编辑与详情组件

- [ ] **Step 1: 写失败测试**

在接口显示测试加入：

~~~
const port = {
  id: "port-1", asset: "switch-1", name: "端口 1", kind: "ethernet",
  speed_mbps: 2500, connected: true,
  metadata: { enabled: true, role: "uplink", negotiated_speed_mbps: 1000 },
}
const view = buildAssetInterfaceDisplay({ id: "switch-1", type: "switch" } as AssetRecord, [port] as AssetInterfaceRecord[])
assert.equal(view.speedItems[0].speedLabel, "支持 2.5 Gbps")
assert.equal(view.speedItems[0].negotiatedSpeedLabel, "协商 1 Gbps")
assert.equal(view.speedItems[0].role, "uplink")
~~~

另一个 fixture 不带 negotiated_speed_mbps，断言为“协商速率未确认”。

- [ ] **Step 2: 运行测试确认失败**

Run: cd internal/site; node --experimental-strip-types src/modules/asset-center/asset-interface-display.test.ts

Expected: FAIL，当前只显示“网卡速率”。

- [ ] **Step 3: 实现端口卡片**

为 AssetInterfaceSpeedItem 新增：

~~~
role?: "uplink" | "downlink" | "general"
negotiatedSpeedLabel?: string
~~~

仅对 asset.type === "switch"：speed_mbps 为支持速率，metadata.negotiated_speed_mbps 为实际协商速率，metadata.role 为端口角色。其他资产保持原有语义。为 AssetInterfaceManager 增加 assetType?: AssetType：交换机使用“接口 / 添加接口 / 暂无接口信息”，并显示角色、支持速率、协商速率、启用与接线；其他类型继续“网卡”。

- [ ] **Step 4: 更新调用方、验证并提交**

为有资产上下文的调用方传入 asset.type。组件契约测试断言交换机路径含“添加接口”“支持速率”“协商速率未确认”，非交换机仍含“添加网卡”。

~~~powershell
cd internal/site
node --experimental-strip-types src/modules/asset-center/asset-interface-display.test.ts
node --experimental-strip-types src/modules/asset-center/components/asset-interface-manager.test.ts
npm run typecheck
git add src/modules/asset-center/asset-interface-display.ts src/modules/asset-center/asset-interface-display.test.ts src/modules/asset-center/components/asset-interface-manager.tsx src/modules/asset-center/components/asset-interface-manager.test.ts
git commit -m "feat: show generic switch port states"
~~~

Expected: 两项契约测试与类型检查 PASS。

### Task 3: 增加 Hub 交换机写入边界

**Files:**

- Modify: internal/hub/asset_master_validation.go
- Modify: internal/hub/asset_master_validation_test.go

- [ ] **Step 1: 写失败 API 测试**

新增交换机 fixture，使用 pulseTests.PerformTestAPIRequest 验证：

~~~
management_level=smart + vlan_status=disabled                        -> 200
management_level=router                                               -> 400，管理级别只能选择非网管、轻管理或全管理
vlan_status=custom                                                    -> 400，VLAN 状态只能选择不支持、未启用或已启用
metadata.wifi_standard                                                 -> 400，字段 wifi_standard 不属于交换机严格模板
kind=ethernet + role=uplink + enabled=true                            -> 200
kind=optical + role=downlink + enabled=false + connected=true         -> 400，未启用接口不能标记为已接线
kind=wifi                                                             -> 400，交换机接口只能选择有线或光纤
role=radio                                                            -> 400，交换机接口角色只能选择上联、下联或通用
negotiated_speed_mbps=-1                                              -> 400，实际协商速率不能小于 0
~~~

- [ ] **Step 2: 运行测试确认失败**

Run: go test -tags=testing ./internal/hub -run TestAssetMasterValidation -count=1

Expected: FAIL，当前 Hub 没有交换机专属校验。

- [ ] **Step 3: 实现资产与接口校验**

在 validateAssetRequiredProfileRequest() 增加：

~~~go
case "switch":
  return h.validateSwitchAssetRecord(e)
~~~

validateSwitchAssetRecord() 仅允许规格 metadata、asset_tag、official_url 与 official_image_url；拒绝规范化后命中 password、secret、token、credential、ssid、qrcode 的键；验证管理级别、主要管理入口、供电方式、PoE、VLAN、端口隔离、链路聚合的固定选项；拒绝负数端口数量、端口速率、交换容量和 PoE 预算。PoE 不支持时拒绝写入 PoE 标准或预算。历史 metadata 仅在原记录中存在且未修改时只读兼容。

在 validateAssetInterfaceProfileRequest() 为 asset.type == "switch" 调用新函数。该函数使用：

~~~go
allowedKinds := map[string]bool{"ethernet": true, "optical": true}
allowedRoles := map[string]bool{"uplink": true, "downlink": true, "general": true}
allowedMetadata := map[string]bool{
  "enabled": true, "role": true, "connection_note": true,
  "negotiated_speed_mbps": true, "notes": true,
}
~~~

要求 enabled 为布尔值，端口角色为固定值，speed_mbps 与 negotiated_speed_mbps 不小于零，未启用端口不得标记已接线。新建接口仅接受电口或光口；既有其他类型接口只读兼容。

- [ ] **Step 4: 格式化、验证并提交**

~~~powershell
gofmt -w internal/hub/asset_master_validation.go internal/hub/asset_master_validation_test.go
go test -tags=testing ./internal/hub -run TestAssetMasterValidation -count=1
git add internal/hub/asset_master_validation.go internal/hub/asset_master_validation_test.go
git commit -m "feat: validate generic switch records"
~~~

Expected: 格式化后无 diff，Hub 测试 PASS。

### Task 4: 对齐导入、资料补全、版本记录与完整验证

**Files:**

- Modify: internal/site/src/modules/asset-center/asset-schema-profile.test.ts
- Modify: internal/site/src/modules/asset-center/asset-import-export.test.ts
- Modify: internal/site/src/modules/asset-center/asset-enrichment-candidates.test.ts
- Modify: docs/release-notes-next.md
- Modify: internal/site/src/components/routes/settings/release-history.ts

- [ ] **Step 1: 写失败测试**

断言 getSectionFieldKeys("switch", "管理与网络能力") 含 management_level、management_access、poe_status、vlan_status、port_isolation_status、link_aggregation_status；导出和资料补全允许 default_optical_speed_mbps 与 management_access，不允许 wifi_standard、wan_port_count、ssid_note 或 PON 字段。About 测试断言 Web / Hub 更新含“通用交换机资产模板”和“不会成为产品默认值”。

- [ ] **Step 2: 运行测试确认失败**

~~~powershell
cd internal/site
node --experimental-strip-types src/modules/asset-center/asset-schema-profile.test.ts
node --experimental-strip-types src/modules/asset-center/asset-import-export.test.ts
node --experimental-strip-types src/modules/asset-center/asset-enrichment-candidates.test.ts
~~~

Expected: 至少一项 FAIL，说明仍有旧交换机字段来源。

- [ ] **Step 3: 收敛调用方并写记录**

让分组、导入导出和资料补全只读取 switchAssetTypeSpec；旧不适用字段仅可读兼容。追加 1.0.6 的 Web / Hub 实施记录；Android 写明 WebView 跟随同一模板、无新增原生能力；Agent / 部署写明无协议和部署改动；文档 / 规则写明通用模板规格与实施计划。

- [ ] **Step 4: 完整验证、浏览器验收与提交**

~~~powershell
cd internal/site
npm run test
npm run typecheck
npm run build
cd C:\Users\Nacht\Documents\PL
go test -tags=testing ./internal/hub ./internal/migrations -count=1
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental/scripts/run-hub-dev.ps1 -Restart
Invoke-WebRequest -Uri http://localhost:8090/api/health -UseBasicParsing
~~~

在浏览器验收桌面与 390 × 844：新建交换机不得预填任何单台设备数据；仅显示交换机字段；可创建电口 / 光口；端口区正确区分支持速率、协商速率、启用和接线；未建档对端只保存中性说明；控制台无新增错误。

若发现问题，先新增失败测试再最小修复并重跑受影响验证。通过后：

~~~powershell
git add internal/site/src internal/hub docs/release-notes-next.md
git commit -m "docs: record generic switch template"
~~~

### Task 5: 用产品模板建立用户确认的真实资产

**Files:** 无仓库文件修改。

- [ ] **Step 1: 仅通过已登录浏览器会话建档**

使用通用表单填写用户确认的真实设备数据。端口、位置、地址、接线和对端都由表单数据保存，不能写入测试、迁移、初始化数据、公开文档或代码默认值。

- [ ] **Step 2: 维护关系与安全边界**

已建档对端创建真实接口关系；未建档设备只写“待建档”中性连接说明。不得输入或保存管理账号、密码、SSID、令牌、配置备份或设备唯一敏感身份值。

## 最终完成条件

- 新建交换机的字段、选项、详情、导入导出与资料补全均来自通用 switchAssetTypeSpec。
- 产品没有任何具体设备的品牌、型号、端口数、位置、地址、接线或关系默认值。
- 端口支持速率、实际协商速率、启用、接线与资产关系彼此独立且页面清晰可读。
- Hub 拒绝模板外字段、秘密字段、非法固定选项、非法端口类型、非法角色和错误状态组合。
- 完整前端、Hub、迁移与双视口验收通过，下一版 About 分端记录同步完成。
