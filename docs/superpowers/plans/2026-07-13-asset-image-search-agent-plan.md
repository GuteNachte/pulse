# 图片搜索 Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将资产图片链路重构为免费、自动、适合中国网络的图片搜索 Agent：官方来源优先，必应图片公开结果补足，候选本地归档并由用户确认主图。

**Architecture:** 搜索 Agent 使用规则生成检索词；配置文本模型时只补充别名和查询词，模型从不返回或信任图片 URL。Hub 先抓取官方页面，再解析必应图片结果补足候选，下载、校验和归档后交给编辑工作台选择。未来生图 Agent 不接入本轮运行链路，保留独立任务语义。

**Tech Stack:** Go、PocketBase 文件存储、现有 OpenAI-compatible 文本模型、React/TypeScript。

---

### Task 1: 搜索计划与文本模型回退

**Files:**
- Create: `internal/hub/asset_image_search.go`
- Test: `internal/hub/asset_image_search_test.go`

- [x] **Step 1: 写失败测试**

覆盖规则搜索词包含厂商、型号、颜色；文本模型返回合法 `queries` 时去重追加；模型返回 URL、过长或空响应时回退规则搜索词。

- [x] **Step 2: 运行失败测试**

Run: `go test -tags=testing -count=1 ./internal/hub -run TestAssetImageSearchPlan`

Expected: FAIL，因为搜索计划尚不存在。

- [x] **Step 3: 实现最小搜索计划**

定义 `assetImageSearchPlan`，调用现有文本模型配置但只接受 JSON `{ "queries": ["..."] }`；每条查询限制长度、拒绝 URL，模型不可用或失败时保留规则查询。不得调用视觉模型或生成图片。

- [x] **Step 4: 运行测试**

Run: `go test -tags=testing -count=1 ./internal/hub -run TestAssetImageSearchPlan`

Expected: PASS。

### Task 2: 必应候选来源适配器

**Files:**
- Modify: `internal/hub/asset_visuals.go`
- Test: `internal/hub/asset_image_search_test.go`

- [x] **Step 1: 写失败测试**

以固定的必应 `a.iusc[m]` HTML 夹具验证解析 `murl`、`purl`、标题；验证官方候选先保留，必应候选仅补足剩余名额，重复 URL、无效图片 URL、二维码和 Logo 均被排除。

- [x] **Step 2: 运行失败测试**

Run: `go test -tags=testing -count=1 ./internal/hub -run TestBingImageSearch`

Expected: FAIL，因为当前没有必应解析器。

- [x] **Step 3: 实现最小适配器**

请求 `https://cn.bing.com/images/search?q=`，仅解析公开结果里的 `a.iusc` JSON 元数据。候选统一标记 `provider=bing_images`、保留结果页 URL、图片页 URL、图片 URL、标题、检索词和来源排序。请求失败、页面结构变化或返回零候选均静默回退到已有官方结果。

- [x] **Step 4: 接入本地归档链路**

官方图片与官方页面先收集；候选未满时按搜索计划调用必应适配器。继续复用现有下载上限、图片解码、尺寸限制、空白裁切、去重、水印和本地文件归档；不在页面热链必应或厂商图片。

- [x] **Step 5: 运行测试**

Run: `go test -tags=testing -count=1 ./internal/hub -run 'TestAssetImageSearchPlan|TestBingImageSearch|TestAssetVisual|TestProviderLogoVisual'`

Expected: PASS。

### Task 3: 搜索 Agent 语义与候选可追溯性

**Files:**
- Modify: `internal/hub/asset_visuals.go`
- Modify: `internal/site/src/modules/asset-center/asset-visual-query.ts`
- Modify: `internal/site/src/modules/asset-center/components/asset-edit-visual-panel.tsx`
- Test: `internal/site/src/modules/asset-center/asset-visual-query.test.ts`

- [x] **Step 1: 写失败测试**

断言候选帧保留 `provider` 与 `sourceTitle`，并能按官方/必应来源显示；已有本地文件 URL 解析和唯一主图选择行为不变。

- [x] **Step 2: 运行失败测试**

Run: `npm.cmd --prefix internal/site run test:asset-center`

Expected: FAIL，因为候选查询类型尚未暴露来源。

- [x] **Step 3: 实现最小前端变更**

将可见文案统一为“图片搜索 Agent”；候选缩略图显示简短来源标识与标题，点击仍只调用现有确认主图动作。详情浏览页仍只显示确认后的单张本地图片。

- [x] **Step 4: 运行测试**

Run: `npm.cmd --prefix internal/site run test:asset-center && npm.cmd --prefix internal/site run typecheck`

Expected: PASS。

### Task 4: 文档、回归和浏览器验收

**Files:**
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`

- [x] **Step 1: 更新版本记录**

记录图片搜索 Agent 的来源顺序、文本模型非阻塞增强、本地归档与人工确认；明确未来生图 Agent 未在本轮实现。

- [x] **Step 2: 运行完整相关验证**

Run: `go test -tags=testing -count=1 ./internal/hub`

Expected: PASS。

Run: `npm.cmd --prefix internal/site run test && npm.cmd --prefix internal/site run check && npm.cmd --prefix internal/site run typecheck`

Expected: PASS。

- [x] **Step 3: 浏览器验收**

在本地 Hub `8090`、Vite `5173` 中打开资产编辑工作台，验证“获取图片”后候选展示来源、确认主图后详情页只显示本地已确认图片，以及无文本模型配置时仍可触发规则搜索。
