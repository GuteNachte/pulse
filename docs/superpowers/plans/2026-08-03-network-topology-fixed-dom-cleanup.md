# Fixed Network Topology Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐家庭网 / 科技网固定拓扑切换，以整卡点击替代独立 WAN 编辑按钮，并移除已退役的自由画布实现。

**Architecture:** 两个网络域继续共用固定 DOM 卡片与 SVG 正交连线，数据层只读取资产、接口和真实关系。网络设备整卡在可编辑账号下打开 WAN 设置，只读账号回退到详情；旧 React Flow 工作台、坐标布局、折点、撤销栈和专用样式全部删除。

**Tech Stack:** React 19、TypeScript、PocketBase、CSS、Node.js test runner、Vite。

---

### Task 1: 锁定页面与卡片交互合同

**Files:**
- Modify: `internal/site/src/modules/network-topology/workspace-data.test.ts`
- Test: `internal/site/src/modules/network-topology/workspace-data.test.ts`

- [x] **Step 1: Write failing tests for domain switching and card editing**
- [x] **Step 2: Run the focused test and confirm the missing behavior fails**
- [x] **Step 3: Implement the domain switch and whole-card WAN action**
- [x] **Step 4: Run the focused test and confirm it passes**

### Task 2: Remove labels from horizontal connection lines

**Files:**
- Modify: `internal/site/src/index.css`
- Test: `internal/site/src/modules/network-topology/workspace-data.test.ts`

- [x] **Step 1: Write a failing source contract for hidden side-port labels**
- [x] **Step 2: Hide side labels while retaining nodes and hover titles**
- [x] **Step 3: Run the focused test and confirm it passes**

### Task 3: Retire the free-canvas implementation

**Files:**
- Modify: `internal/site/src/modules/network-topology/pulse-adapter.ts`
- Modify: `internal/site/src/modules/network-topology/use-topology-workspace-data.ts`
- Modify: `internal/site/src/modules/network-topology/topology-data-query.ts`
- Modify: `internal/site/src/modules/network-topology/relation-operations.ts`
- Modify: `internal/site/src/modules/network-topology/manifest.ts`
- Delete: `internal/site/src/modules/network-topology/components/topology-workspace.tsx`
- Delete: `internal/site/src/modules/network-topology/components/topology-workspace-toolbar.tsx`
- Delete: `internal/site/src/modules/network-topology/components/topology-free-node.tsx`
- Delete: `internal/site/src/modules/network-topology/components/topology-free-edge.tsx`
- Delete: `internal/site/src/modules/network-topology/components/topology-line-node.tsx`
- Delete: retired layout, canvas-state, reconnect files and tests that only supported the free canvas
- Test: `internal/site/src/modules/network-topology/workspace-data.test.ts`

- [x] **Step 1: Write a failing retirement contract**
- [x] **Step 2: Replace React Flow graph types with Pulse fixed-graph types**
- [x] **Step 3: Remove layout reads and unused persisted-canvas state from the data hook**
- [x] **Step 4: Delete retired source, tests, CSS and package dependency**
- [x] **Step 5: Run topology tests and typecheck**
- [x] **Step 6: Replace the retired React Flow E2E flow with fixed-layout coverage**

### Task 4: Synchronize user-facing records

**Files:**
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`
- Modify: `docs/superpowers/specs/2026-08-02-network-topology-fixed-layout-design.md`

- [x] **Step 1: Record domain switching, whole-card editing, clean lines and retired free canvas**
- [x] **Step 2: Verify the three records use the same behavior description**

### Task 5: End-to-end verification

**Files:**
- Test: `internal/site/src/modules/network-topology/workspace-data.test.ts`

- [x] **Step 1: Run `npm run test:network-topology`**
- [x] **Step 2: Run `npm run typecheck` and `npm run build`**
- [x] **Step 3: Run targeted Biome lint and `git diff --check`**
- [x] **Step 4: Verify home and technology routes, WAN card click, line labels, console and overflow in Browser**
