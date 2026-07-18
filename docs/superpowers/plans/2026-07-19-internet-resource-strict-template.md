# 互联网接入严格类型模板实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `internet` 资产完整收敛为宽带线路资源严格模板，并统一字段、完整度、列表、详情、编辑、接入关系和公网地址检测。

**Architecture:** 在 `asset-type-specs.ts` 建立前端权威类型规格，`asset-schema.ts`、摘要、完整度和页面显示只消费规格，不再各自维护宽带字段。Hub 侧使用同一组稳定字段和值域做保存校验，通过现有 PocketBase Cron 每 30 分钟检测使用中的宽带；人工确认值与自动检测值分离，自动变化写为候选而不覆盖人工值。关系继续使用 `asset_relations.connected_to + metadata.link_kind=internet`，并由 Hub 强制一条宽带只有一个 PON/WAN 目标。

**Tech Stack:** TypeScript 6、React 19、Valibot、PocketBase、Go、PocketBase Cron、Node assert 测试、Go test。

---

### Task 1: 建立唯一的互联网接入类型规格

**Files:**
- Create: `internal/site/src/modules/asset-center/asset-type-specs.ts`
- Create: `internal/site/src/modules/asset-center/asset-type-specs.test.ts`
- Modify: `internal/site/src/modules/asset-center/asset-schema.ts`
- Modify: `internal/site/src/modules/asset-center/asset-profiles.ts`
- Modify: `internal/site/package.json`

- [ ] **Step 1: 写失败测试**

测试直接断言 `internetAssetTypeSpec` 的字段顺序为 `vendor, access_technology, auth_mode, down_mbps, up_mbps, public_ipv4, public_ipv6, package_name, recurring_price_cny, billing_cycle, renewal_date, auto_renew, notes`；运营商只有中国电信、中国联通、中国移动；状态只有 active/inactive/retired；带宽为必填正数；位置、用途、接口为不适用；详情标题为“线路档案”。同时断言历史运营商“联通”归一为“中国联通”，`1000` 格式化为 `1 Gbps`。

- [ ] **Step 2: 验证失败**

Run: `npm run test:asset-center`

Expected: FAIL，提示找不到 `asset-type-specs.ts` 或字段契约不匹配。

- [ ] **Step 3: 实现最小规格**

定义 `AssetTypeFieldSpec`，包含 `key/label/group/inputMode/source/type/options/required/list/detail/edit/export/completeness/unit`；定义 `internetAssetTypeSpec`、`getAssetTypeSpec()`、`normalizeInternetProvider()`、`formatInternetBandwidth()`、`getInternetStatusLabel()`。`asset-schema.ts` 的互联网表单分组由规格转换生成，`asset-profiles.ts` 的必填键从规格派生。

- [ ] **Step 4: 验证通过并提交**

Run: `npm run test:asset-center`

Expected: PASS，输出 `asset type specs contract passed` 和 `internet resource contract passed`。

Commit: `feat: define strict internet asset type spec`

### Task 2: 统一表单值域、字段分组与保存载荷

**Files:**
- Modify: `internal/site/src/modules/asset-center/asset-internet-resource.test.ts`
- Modify: `internal/site/src/modules/asset-center/asset-form.ts`
- Modify: `internal/site/src/modules/asset-center/asset-form.test.ts`
- Modify: `internal/site/src/modules/asset-center/asset-edit-profile-sections.ts`
- Modify: `internal/site/src/modules/asset-center/asset-edit-profile-sections.test.ts`
- Modify: `internal/site/src/modules/asset-center/components/asset-edit-profile-fields.tsx`
- Modify: `internal/site/src/modules/asset-center/components/asset-edit-workbench.tsx`

- [ ] **Step 1: 写失败测试**

断言互联网编辑仅出现“基础资料、线路参数、动态公网地址、套餐与续费、备注”，固定选择没有自定义入口，`down_mbps/up_mbps` 拒绝零和负数，历史运营商保存时归一；互联网不显示位置、用途、型号、序列号、网卡管理。

- [ ] **Step 2: 验证失败**

Run: `npm run test:asset-center`

Expected: FAIL，现有表单仍只有旧字段且仍渲染通用资料。

- [ ] **Step 3: 实现规格驱动表单**

在表单初始化与提交处调用规格归一函数；为互联网使用资源专属状态文案和选项；字段组件按 `select/number/date/boolean/readonly` 渲染，公网地址只读并保留立即刷新；到期日不显示候选来源入口；工作台按 `notApplicable` 隐藏位置、用途、接口和硬件区。

- [ ] **Step 4: 验证通过并提交**

Run: `npm run test:asset-center && npm run typecheck`

Expected: PASS，TypeScript 0 errors。

Commit: `feat: apply strict internet edit controls`

### Task 3: 让完整度读取接入关系上下文

**Files:**
- Modify: `internal/site/src/modules/asset-center/asset-profile-summary.ts`
- Modify: `internal/site/src/modules/asset-center/asset-profile-summary.test.ts`
- Modify: `internal/site/src/components/routes/assets.tsx`
- Modify: `internal/site/src/modules/asset-center/asset-export.ts`
- Modify: `internal/site/src/modules/asset-center/components/asset-card.tsx`

- [ ] **Step 1: 写失败测试**

调用 `getAssetCompleteness(internet, { hasInternetUplink: false })`，断言缺失项仅来自名称、运营商、状态、线路技术、认证方式、上下行带宽和“接入设备”；位置、用途、公网地址、套餐不参与。补齐 `hasInternetUplink: true` 后得分 100%。

- [ ] **Step 2: 验证失败**

Run: `node --experimental-strip-types src/modules/asset-center/asset-profile-summary.test.ts`

Expected: FAIL，当前 API 不接受关系上下文且仍要求用途、公网 IPv4。

- [ ] **Step 3: 实现关系上下文**

新增 `AssetCompletenessContext`；互联网分支完全按规格必填项检查并使用 `hasInternetUplink`。`assets.tsx` 从已加载的关系建立 `Set<assetId>`，卡片、预览和导出显式传入上下文；其他类型默认行为不变。

- [ ] **Step 4: 验证通过并提交**

Run: `npm run test:asset-center && npm run typecheck`

Expected: PASS。

Commit: `feat: include internet uplink in completeness`

### Task 4: 实现宽带专属列表与详情显示

**Files:**
- Modify: `internal/site/src/modules/asset-center/asset-list.ts`
- Modify: `internal/site/src/modules/asset-center/asset-list-layout.test.ts`
- Modify: `internal/site/src/modules/asset-center/components/asset-card.tsx`
- Modify: `internal/site/src/modules/asset-center/components/asset-parameter-columns.tsx`
- Modify: `internal/site/src/modules/asset-center/asset-detail-parameter-groups.ts`
- Modify: `internal/site/src/modules/asset-center/asset-detail-parameter-groups.test.ts`
- Modify: `internal/site/src/modules/asset-center/components/asset-detail-action-menu.tsx`
- Modify: `internal/site/src/modules/asset-center/components/asset-detail-action-menu.test.ts`
- Modify: `internal/site/src/modules/asset-center/asset-detail-page.tsx`

- [ ] **Step 1: 写失败测试**

断言宽带列表位置和网卡速率为“无”，IPv4 使用公网 IPv4，网络主行显示“家庭光纤宽带”，次行显示“PPPoE · 下行 1 Gbps / 上行 300 Mbps”；详情标题为“线路档案”，隐藏位置、用途、颜色和接口按钮，显示动态地址、套餐续费、接入关系与待关联状态。

- [ ] **Step 2: 验证失败**

Run: `npm run test:asset-center`

Expected: FAIL，现有详情仍显示“硬件档案”和接口操作。

- [ ] **Step 3: 实现专属展示**

使用规格格式化器生成列表字段；`AssetParameterColumns` 接收资产类型并为 internet 显示“线路档案”；详情参数组按规格顺序生成；`AssetDetailActionMenu` 通过 `supportsInterfaces` 隐藏接口并将关系文案改为“接入关系”；标题标签过滤不适用资料。

- [ ] **Step 4: 验证通过并提交**

Run: `npm run test:asset-center && npm run typecheck`

Expected: PASS。

Commit: `feat: render internet assets as line resources`

### Task 5: 强制宽带接入关系与 PON 接口语义

**Files:**
- Create: `internal/migrations/zzzzzzzz_asset_interface_pon.go`
- Create: `internal/migrations/zzzzzzzz_asset_interface_pon_test.go`
- Modify: `internal/site/src/types.d.ts`
- Modify: `internal/site/src/modules/asset-center/asset-detail-relations.ts`
- Modify: `internal/site/src/modules/asset-center/asset-detail-relations.test.ts`
- Modify: `internal/site/src/modules/asset-center/asset-detail-page.tsx`
- Modify: `internal/hub/asset_master_validation.go`
- Modify: `internal/hub/asset_master_validation_test.go`

- [ ] **Step 1: 写失败测试**

Go 测试覆盖：PON 是允许的接口种类；internet 关系必须 `source=internet`、无 source interface、target 类型为 ont/router/gateway、target interface 为 pon/wan；第二条当前 internet 关系被拒绝；普通关系兼容不变。前端测试覆盖目标和接口过滤。

- [ ] **Step 2: 验证失败**

Run: `go test ./internal/migrations ./internal/hub -run 'PON|InternetRelation' -count=1`

Expected: FAIL，集合不接受 `pon` 且关系未校验资源边界。

- [ ] **Step 3: 实现校验和迁移**

迁移给 `asset_interfaces.kind` 增加 `pon`。Hub 在通用端点校验之后识别 `connected_to + link_kind=internet` 并执行方向、目标类型、接口种类和唯一性校验。前端只列出允许目标和目标 PON/WAN 接口；宽带端不要求来源接口。

- [ ] **Step 4: 验证通过并提交**

Run: `go test ./internal/migrations ./internal/hub -run 'PON|InternetRelation' -count=1 && npm run test:asset-center && npm run typecheck`

Expected: PASS。

Commit: `feat: enforce internet uplink relations`

### Task 6: 保护人工公网地址并记录自动候选

**Files:**
- Modify: `internal/hub/internet_access.go`
- Modify: `internal/hub/asset_enrichment_test.go`
- Modify: `internal/site/src/modules/asset-center/asset-internet-address-status.ts`
- Modify: `internal/site/src/modules/asset-center/asset-internet-address-status.test.ts`
- Modify: `internal/site/src/modules/asset-center/asset-detail-page.tsx`

- [ ] **Step 1: 写失败测试**

Go 测试覆盖 IPv4/IPv6 独立失败保留旧值；自动来源成功时更新正式值；人工来源成功但地址变化时保留正式值并写入 `public_ipv4_candidate/public_ipv6_candidate`；相同地址不制造候选；检测时间和协议错误独立更新。前端状态测试覆盖“动态地址”“手动确认”“发现新地址待确认”。

- [ ] **Step 2: 验证失败**

Run: `go test ./internal/hub -run InternetPublic -count=1 && node --experimental-strip-types src/modules/asset-center/asset-internet-address-status.test.ts`

Expected: FAIL，当前检测会直接覆盖人工值且没有候选状态。

- [ ] **Step 3: 实现来源状态**

复用 metadata，保存 `public_ipv4_source/public_ipv6_source`（dynamic/manual）、候选地址及候选检测时间。刷新逻辑统一进入 `applyDetectedInternetAddresses`；只有自动正式值发生变化时才保存资产从而触发现有 `asset_changes`，错误不清空成功值。详情显示来源、时间、错误和候选确认入口。

- [ ] **Step 4: 验证通过并提交**

Run: `go test ./internal/hub -run InternetPublic -count=1 && npm run test:asset-center && npm run typecheck`

Expected: PASS。

Commit: `feat: preserve confirmed public addresses`

### Task 7: 增加启动与每 30 分钟自动检测

**Files:**
- Modify: `internal/hub/internet_access.go`
- Create: `internal/hub/internet_access_schedule_test.go`
- Modify: `internal/hub/hub.go`

- [ ] **Step 1: 写失败测试**

测试 `refreshActiveInternetAssets` 只查询并处理 `type=internet && status=active`；单条失败不阻断其余记录；调度注册表达式为 `*/30 * * * *`；启动调用和定时调用使用同一服务函数。

- [ ] **Step 2: 验证失败**

Run: `go test ./internal/hub -run InternetAddressSchedule -count=1`

Expected: FAIL，调度函数尚不存在。

- [ ] **Step 3: 实现任务**

抽取不依赖 HTTP 请求的 `refreshInternetAssetAddresses`；`registerCronJobs` 注册每 30 分钟任务；Hub `OnServe` 在路由和 Cron 注册后异步执行一次，使用带超时 context，逐资产记录告警日志但不阻断启动。

- [ ] **Step 4: 验证通过并提交**

Run: `go test ./internal/hub -run 'InternetAddressSchedule|InternetPublic' -count=1`

Expected: PASS。

Commit: `feat: schedule internet address detection`

### Task 8: Hub 保存白名单和值域校验及历史兼容

**Files:**
- Create: `internal/hub/asset_type_validation.go`
- Create: `internal/hub/asset_type_validation_test.go`
- Modify: `internal/hub/asset_master_validation.go`
- Modify: `internal/hub/asset_enrichment_domain.go`
- Modify: `internal/hub/asset_enrichment_domain_test.go`
- Create: `internal/migrations/zzzzzzzz_normalize_internet_assets.go`
- Create: `internal/migrations/zzzzzzzz_normalize_internet_assets_test.go`

- [ ] **Step 1: 写失败测试**

测试 internet 拒绝无效运营商、planned、无效线路技术/认证方式、非正数带宽和模板外新字段；允许保留已有历史 metadata；enrichment 白名单包含新字段但不含硬件字段；迁移把电信/联通/移动归一为完整名称，并从可识别旧 `access_mode` 迁移线路技术或认证方式，无法识别时保留原文且不猜测。

- [ ] **Step 2: 验证失败**

Run: `go test ./internal/hub ./internal/migrations -run 'InternetAssetValidation|NormalizeInternet' -count=1`

Expected: FAIL，当前保存没有类型专属值域校验。

- [ ] **Step 3: 实现校验和兼容迁移**

资产 create/update hook 调用 `validateInternetAssetRecord`。白名单只约束请求中新引入或修改的字段，历史未知字段原样保留；数值、枚举和值域错误返回中文错误。迁移只做确定性别名和旧字段映射，不填猜测值。

- [ ] **Step 4: 验证通过并提交**

Run: `go test ./internal/hub ./internal/migrations -run 'InternetAssetValidation|NormalizeInternet|AssetEnrichmentDomain' -count=1`

Expected: PASS。

Commit: `feat: validate strict internet asset records`

### Task 9: 版本说明、全量验证与浏览器验收

**Files:**
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`

- [ ] **Step 1: 更新版本记录**

在 1.0.6 Web/Hub 记录中说明严格类型规格、宽带线路字段、专属页面、接入关系、PON、完整度和公网地址调度；Android、Agent/部署小节明确本次无独立行为变化但随统一版本口径。

- [ ] **Step 2: 运行完整自动验证**

Run: `go test ./internal/hub ./internal/migrations -count=1`

Run: `npm run test && npm run typecheck && npm run build`

Expected: 全部 exit 0，无失败测试、TypeScript 错误或构建错误。

- [ ] **Step 3: 启动源码预览并浏览器验收**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File supplemental/scripts/run-hub-dev.ps1 -Restart`

在 `http://localhost:5173/assets/hvpbl3jmc8w02qp` 验证列表、详情、编辑、公网刷新和无关系待补状态；桌面与窄屏均无横向溢出，控制台无相关错误。再通过 API 或页面保存一次合法宽带并确认无需刷新即可同步。

- [ ] **Step 4: 提交**

Commit: `docs: record strict internet resource template`

最终检查 `git status --short` 只包含用户已有的无关改动；不推送远端。
