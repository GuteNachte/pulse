# Network Topology Backbone Axis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在完整 Web 桌面拓扑中用双色粗中轴表达宽带与网络设备骨干链路，并把关系条收敛为终端接入关系。

**Architecture:** `fixed-topology-model.ts` 从真实边生成有序骨干链路，并为网络端口标记对端类型；`fixed-topology-canvas.tsx` 在三列网络设备行后方渲染不可交互链路段，同时过滤网络设备间关系条。CSS 只在 `fitWindow` 桌面模式显示中轴和缩窄卡片，首页紧凑拓扑与移动端保持原状。

**Tech Stack:** React、TypeScript、CSS Grid、Node contract tests、Playwright、Vite

---

### Task 1: 固化模型合同

**Files:**
- Modify: `internal/site/src/modules/network-topology/fixed-canvas/fixed-topology-model.test.ts`
- Modify: `internal/site/src/modules/network-topology/workspace-data.test.ts`

- [x] **Step 1: 写入失败测试**

断言模型分别生成 `internet -> gateway` 的 `fiber` 骨干段和 `gateway -> switch` 的 `wired` 骨干段；网络设备端口明确区分 `terminal`、`network`、`internet` 对端。CSS 合同断言桌面存在粗中轴、黄色光纤、蓝色网线和列内缩窄卡片规则。

- [x] **Step 2: 运行专项测试确认 RED**

```powershell
npm run test:network-topology
```

Expected: FAIL，提示缺少 `backboneLinks`、对端类型或中轴样式。

### Task 2: 实现骨干链路模型与渲染

**Files:**
- Modify: `internal/site/src/modules/network-topology/fixed-canvas/fixed-topology-model.ts`
- Modify: `internal/site/src/modules/network-topology/fixed-canvas/fixed-topology-canvas.tsx`
- Modify: `internal/site/src/index.css`

- [x] **Step 1: 构建骨干链路**

从宽带与网络设备构成的真实边生成有序 `FixedBackboneLink[]`，保留关系 ID、起止槽位和介质；未知或非骨干关系不进入中轴。

- [x] **Step 2: 过滤网络设备关系条**

网络卡片只渲染 `peerKind === "terminal"` 的端口关系，终端卡关系条和高亮状态保持不变。

- [x] **Step 3: 渲染桌面中轴**

在网络设备行内增加 `aria-hidden` 的链路层，按三个槽位计算每段起止位置；`fiber` 使用黄色，`wired` 使用蓝色，链路不接受焦点和鼠标事件。

- [x] **Step 4: 缩窄网络设备卡片**

完整桌面三列中的真实卡和占位框左右缩进，保持信息可读，并让中轴只在设备间隙露出。

- [x] **Step 5: 运行专项测试确认 GREEN**

```powershell
npm run test:network-topology
```

Expected: PASS。

### Task 3: 版本记录与验收

**Files:**
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`
- Modify: `internal/site/e2e/network-topology.spec.ts`

- [x] **Step 1: 更新版本记录和 E2E 合同**

记录双色骨干中轴、网络关系过滤和卡片缩窄；E2E 检查两类链路、网络卡不含骨干关系条及页面无滚动。

- [x] **Step 2: 运行完整门禁**

```powershell
npm run test
npm run lint
npm run typecheck
npm run build
git diff --check
```

Expected: 全部退出码为 `0`。

- [x] **Step 3: 浏览器验收**

在 `2494 × 1194` 和 `1280 × 800` 检查黄色光纤、蓝色网线、三列窄边卡片、终端关系高亮、无滚动和控制台日志。
