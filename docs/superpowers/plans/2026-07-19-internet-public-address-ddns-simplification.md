# 互联网接入公网地址 DDNS 简化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除宽带公网地址人工确认与候选保护，使 IPv4 / IPv6 始终自动更新并保留失败降级和变更历史。

**Architecture:** 继续由 `asset-center` 的 Hub 检测链路维护地址；成功检测直接更新正式值，失败保留旧值。前端只展示当前地址、最近检测时间和协议错误，保留手动刷新，不再存在确认 API 或确认按钮。

**Tech Stack:** Go、PocketBase、React 19、TypeScript、Node 直接契约测试、Playwright。

---

### Task 1: Hub 自动更新与历史字段清理

**Files:**
- Modify: `internal/hub/internet_access_test.go`
- Modify: `internal/hub/internet_access.go`
- Modify: `internal/hub/api.go`
- Modify: `internal/hub/asset_type_validation.go`
- Modify: `internal/hub/asset_enrichment_test.go`

- [ ] **Step 1: 把人工保护测试改成自动覆盖测试**

将 `TestApplyDetectedInternetAddressesPreservesManualValueAsCandidate` 改为断言旧人工值被新检测值替换，并清理历史字段：

```go
func TestApplyDetectedInternetAddressesReplacesLegacyManualValue(t *testing.T) {
	metadata := map[string]any{
		"public_ipv4": "198.51.100.8",
		"public_ipv4_source": "manual",
		"public_ipv4_candidate": "192.0.2.9",
		"public_ipv4_candidate_checked_at": "2026-07-18T00:00:00Z",
	}
	changed := applyDetectedInternetAddresses(metadata, publicInternetAddresses{IPv4: "203.0.113.10"}, "2026-07-19T00:00:00Z")
	require.Equal(t, []string{"public_ipv4"}, changed)
	require.Equal(t, "203.0.113.10", metadata["public_ipv4"])
	require.NotContains(t, metadata, "public_ipv4_source")
	require.NotContains(t, metadata, "public_ipv4_candidate")
	require.NotContains(t, metadata, "public_ipv4_candidate_checked_at")
}
```

同时把 API 端到端测试改为刷新后直接得到新地址，并断言旧候选字段消失，不再调用确认端点。

- [ ] **Step 2: 运行 Hub 定向测试并确认失败**

Run: `go test -tags=testing ./internal/hub -run "TestApplyDetectedInternetAddresses|TestInternetPublicAddress" -count=1`

Expected: FAIL，旧实现仍保留人工值或候选字段。

- [ ] **Step 3: 实现最小自动更新逻辑**

在 `applyDetectedInternetAddress` 中每次刷新先删除历史来源与候选字段；成功时直接写入检测地址：

```go
delete(metadata, addressKey+"_source")
delete(metadata, addressKey+"_candidate")
delete(metadata, addressKey+"_candidate_checked_at")
if detected == "" {
	if detectionError != "" { metadata[errorKey] = detectionError }
	return false
}
delete(metadata, errorKey)
metadata[addressKey] = detected
return current != "" && current != detected
```

从响应结构删除候选字段，删除 `confirmInternetPublicAddress` 和 `/internet-addresses/confirm` 路由；严格模板白名单删除 `*_source`、`*_candidate` 和 `*_candidate_checked_at`。

- [ ] **Step 4: 运行 Hub 定向测试并确认通过**

Run: `go test -tags=testing ./internal/hub -run "TestApplyDetectedInternetAddresses|TestInternetPublicAddress" -count=1`

Expected: PASS。

- [ ] **Step 5: 提交 Hub 改动**

```powershell
git add internal/hub/internet_access.go internal/hub/internet_access_test.go internal/hub/api.go internal/hub/asset_type_validation.go internal/hub/asset_enrichment_test.go
git commit -m "feat: simplify internet public address updates"
```

### Task 2: 前端移除确认交互

**Files:**
- Modify: `internal/site/src/modules/asset-center/asset-internet-address-status.test.ts`
- Modify: `internal/site/src/modules/asset-center/asset-internet-address-status.ts`
- Modify: `internal/site/src/modules/asset-center/components/asset-edit-workbench.tsx`
- Modify: `internal/site/src/modules/asset-center/asset-detail-page.tsx`

- [ ] **Step 1: 先写自动检测状态失败测试**

把状态测试改为只返回当前地址、检测时间和错误：

```ts
assert.deepEqual(
	getInternetAddressDisplayState({
		public_ipv4: "203.0.113.10",
		public_ipv4_error: "",
		public_ip_checked_at: "2026-07-19T00:00:00Z",
	}, "ipv4"),
	{ address: "203.0.113.10", checkedAt: "2026-07-19T00:00:00Z", error: "" }
)
```

并为 `asset-edit-workbench.tsx` 增加源码契约断言：不包含“确认新地址”“标记为已确认”和 `onConfirmInternetAddress`，仍包含“刷新公网地址”。

- [ ] **Step 2: 运行前端定向测试并确认失败**

Run: `node --experimental-strip-types src/modules/asset-center/asset-internet-address-status.test.ts`

Expected: FAIL，旧返回仍包含来源与候选状态。

- [ ] **Step 3: 实现紧凑自动检测界面**

简化状态函数：

```ts
return {
	address: read(prefix),
	checkedAt: read("public_ip_checked_at"),
	error: read(`${prefix}_error`),
}
```

编辑工作台删除确认回调和按钮；动态公网地址区在两个只读地址字段上方显示“自动检测”和最近检测时间，协议失败时显示对应错误。详情页删除 `confirmInternetAddress` 及其属性传递。

- [ ] **Step 4: 运行前端定向测试、类型检查并确认通过**

Run: `node --experimental-strip-types src/modules/asset-center/asset-internet-address-status.test.ts`

Run: `npm run typecheck`

Expected: PASS。

- [ ] **Step 5: 提交前端改动**

```powershell
git add internal/site/src/modules/asset-center/asset-internet-address-status.ts internal/site/src/modules/asset-center/asset-internet-address-status.test.ts internal/site/src/modules/asset-center/components/asset-edit-workbench.tsx internal/site/src/modules/asset-center/asset-detail-page.tsx
git commit -m "feat: simplify public address status ui"
```

### Task 3: 版本记录与完整验收

**Files:**
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`

- [ ] **Step 1: 更新 1.0.6 分端记录**

把原“人工确认保护”说明改为 DDNS 简化后的自动更新语义；Web / Hub 说明删除确认操作，移动端说明跟随 Web，Agent / 部署说明保持 Hub 执行检测。

- [ ] **Step 2: 运行完整自动验证**

Run: `npm run test`

Run: `npm run typecheck`

Run: `npm run build`

Run: `go test -tags=testing ./internal/hub ./internal/migrations -count=1`

Expected: 全部退出码 0。

- [ ] **Step 3: 浏览器验收**

访问 `http://localhost:5173/assets/hvpbl3jmc8w02qp`，打开编辑工作台并确认：

1. 当前 IPv4 / IPv6 可见。
2. 显示自动检测和最近检测时间。
3. 不存在“确认新地址”“标记为已确认”或手动确认标签。
4. “刷新公网地址”可用。
5. 桌面与 `390×844` 窄屏无横向溢出，控制台无相关 warning / error。

- [ ] **Step 4: 提交文档与验收收尾**

```powershell
git add docs/release-notes-next.md internal/site/src/components/routes/settings/release-history.ts docs/superpowers/plans/2026-07-19-internet-public-address-ddns-simplification.md
git commit -m "docs: record automatic public address updates"
```
