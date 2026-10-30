# 官方资产图片来源 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将设备图片 Agent 收敛为官方来源采集和视觉准确性校验，移除第三方搜索与模型 URL 发现。

**Architecture:** Hub 只从资产主档已确认的官方链接提取图片并本地归档；可选视觉模型只评估归档候选。设置页只暴露该策略和校验状态。

**Tech Stack:** Go、PocketBase、React、TypeScript、现有 Agnes OpenAI-compatible 接入。

---

### Task 1: 锁定唯一来源规则

**Files:**
- Modify: `internal/hub/asset_visuals.go`
- Modify: `internal/hub/asset_visual_bocha_test.go`
- Test: `internal/hub/asset_visual_official_source_test.go`

- [ ] **Step 1: 写失败测试**

```go
func TestAssetVisualReferenceSourcesUseOnlyAssetMasterOfficialURLs(t *testing.T) {
    asset := newVisualAsset("MINISFORUM", "UM690")
    asset.Set("metadata", map[string]any{"official_url": "https://www.minisforum.com/um690"})
    sources := (&Hub{}).collectAssetVisualReferenceSourcesForColor(asset, assetVisualAIConfig{}, "")
    require.NotEmpty(t, sources)
    require.NotContains(t, sourceProviders(sources), "bocha")
    require.NotContains(t, sourceProviders(sources), "asset_visual_agent")
}
```

- [ ] **Step 2: 运行失败测试**

Run: `go test -tags=testing ./internal/hub -run TestAssetVisualReferenceSourcesUseOnlyAssetMasterOfficialURLs -count=1`

Expected: FAIL，因为当前实现仍会读取博查与模型来源发现。

- [ ] **Step 3: 实现最小官方来源收集**

```go
func (h *Hub) collectAssetVisualReferenceSourcesForColor(asset *core.Record, config assetVisualAIConfig, color string) []map[string]any {
    result := make([]map[string]any, 0, defaultAssetTurntableFrameCount*6)
    seen := map[string]bool{}
    limit := assetVisualReferenceLimit(asset, config.MaxImages)
    if officialImageURL := recordMetadataString(asset, "official_image_url"); isLikelyImageURL(officialImageURL) {
        result = appendAssetVisualReferenceSource(asset, result, seen, officialImageSource(asset, officialImageURL, color))
    }
    return h.collectAssetVisualPageImageSources(asset, result, seen, limit)
}
```

- [ ] **Step 4: 运行测试**

Run: `go test -tags=testing ./internal/hub -run 'TestAssetVisualReferenceSourcesUseOnlyAssetMasterOfficialURLs|TestAssetVisual.*Official' -count=1`

Expected: PASS。

### Task 2: 清理搜索配置与误导性 UI

**Files:**
- Modify: `internal/hub/asset_enrichment_config.go`
- Delete: `internal/hub/asset_visual_bocha.go`
- Delete: `internal/hub/asset_visual_bocha_test.go`
- Modify: `internal/site/src/components/routes/settings/ai.tsx`
- Test: `internal/hub/asset_visual_config_test.go`

- [ ] **Step 1: 写失败测试**

```go
func TestAssetEnrichmentConfigDoesNotExposeVisualSearchProvider(t *testing.T) {
    response := (&Hub{}).assetEnrichmentConfigResponse()
    _, found := response["visual_search"]
    require.False(t, found)
}
```

- [ ] **Step 2: 运行失败测试**

Run: `go test -tags=testing ./internal/hub -run TestAssetEnrichmentConfigDoesNotExposeVisualSearchProvider -count=1`

Expected: FAIL，因为响应仍暴露 `visual_search`。

- [ ] **Step 3: 移除博查配置与 UI**

删除请求、存储、响应和设置页中的博查字段；更新设备图片 Agent 文案为官方来源和视觉校验。

- [ ] **Step 4: 运行配置测试与前端类型检查**

Run: `go test -tags=testing ./internal/hub -run 'TestAssetVisual.*Config|TestAssetEnrichmentConfigDoesNotExposeVisualSearchProvider' -count=1`

Expected: PASS。

Run: `npm run typecheck`

Expected: PASS。

### Task 3: 增加可观测失败原因并更新版本记录

**Files:**
- Modify: `internal/hub/asset_visuals.go`
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`
- Test: `internal/hub/asset_enrichment_test.go`

- [ ] **Step 1: 写失败测试**

```go
require.Contains(t, task.GetString("error"), "官方")
require.Equal(t, "official_sources_required", recordSummary(task)["reason"])
```

- [ ] **Step 2: 运行失败测试**

Run: `go test -tags=testing ./internal/hub -run TestAssetVisual.*NoOfficial -count=1`

Expected: FAIL，因为当前失败原因仍建议模型或第三方来源。

- [ ] **Step 3: 实现官方来源失败语义并更新版本记录**

失败时写入 `official_sources_required`，并在前端与关于页说明不会以非官方图片替代。

- [ ] **Step 4: 完整验证**

Run: `go test -tags=testing ./internal/hub -run 'TestAssetVisual|TestProviderLogoVisual' -count=1`

Expected: PASS。

Run: `npm run typecheck && npm run check && npm run test:asset-center`

Expected: PASS。
