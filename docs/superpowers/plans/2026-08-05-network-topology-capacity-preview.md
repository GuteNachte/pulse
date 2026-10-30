# Network Topology Capacity Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为完整 Web 桌面拓扑增加 `2 × 6 / 1 × 3 / 2 × 6` 满容量占位骨架，并收紧三层间距。

**Architecture:** 固定布局模型继续为首页紧凑拓扑保留 5 列切行；画布组件仅在 `fitWindow` 完整桌面模式把真实终端重新排为 6 列并补齐不可交互占位框，真实资产数据和移动端渲染保持不变。CSS 使用六列终端网格和三列网络设备网格分配可用宽度，并通过矮桌面覆盖保证无页面滚动。

**Tech Stack:** React、TypeScript、CSS Grid、Node contract tests、Playwright、Vite

---

### Task 1: 锁定满容量骨架合同

**Files:**
- Modify: `internal/site/src/modules/network-topology/fixed-canvas/fixed-topology-layout.test.ts`
- Modify: `internal/site/src/modules/network-topology/workspace-data.test.ts`
- Modify: `internal/site/e2e/network-topology.spec.ts`

- [x] **Step 1: 写入失败测试**

要求完整桌面渲染布局按 `6` 个终端重新切行并补齐终端与网络设备占位槽，桌面 CSS 使用六列终端和三列网络设备网格，并收紧层间距；首页基础布局继续保持 5 列。

- [x] **Step 2: 运行测试确认 RED**

```powershell
npm run test:network-topology
```

Expected: FAIL，提示终端仍按 5 个切行或缺少满容量占位骨架。

### Task 2: 实施桌面预览骨架

**Files:**
- Modify: `internal/site/src/modules/network-topology/fixed-canvas/fixed-topology-layout.ts`
- Modify: `internal/site/src/modules/network-topology/fixed-canvas/fixed-topology-canvas.tsx`
- Modify: `internal/site/src/index.css`

- [x] **Step 1: 调整终端容量**

新增完整桌面 6 列渲染容量，保持基础布局的 5 列切行不变；进入 `fitWindow` 后先展平已排序终端，再按 6 列重新切行。

- [x] **Step 2: 补齐预览槽位**

只在 `fitWindow` 下把有线终端和无线终端分别补齐到 12 个槽位，把网络设备补齐到 3 个槽位；占位元素使用 `aria-hidden="true"`，不渲染按钮或事件。

- [x] **Step 3: 调整桌面网格和间距**

完整桌面终端行固定六列，网络设备行固定三列，卡片宽度在可用空间内均匀分配；收紧标准桌面和矮桌面的三层间距，保持卡片信息可读且页面无滚动。

- [x] **Step 4: 运行专项测试确认 GREEN**

```powershell
npm run test:network-topology
```

Expected: PASS。

### Task 3: 同步记录并验证

**Files:**
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`

- [x] **Step 1: 更新版本记录**

记录完整桌面临时满容量骨架、六列终端、三列网络设备和间距收紧；明确占位框不进入资产数据，首页和移动端不变。

- [x] **Step 2: 运行完整门禁**

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
git diff --check
```

Expected: 全部退出码为 `0`。

- [x] **Step 3: 浏览器验收**

在 `2494 × 1194` 和 `1280 × 800` 检查 `12 / 3 / 12` 槽位、无节点、无滚动、关系高亮和控制台日志。
