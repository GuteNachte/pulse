# Network Topology WAN Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将固定网络拓扑的 WAN 接口设置从右侧 Sheet 改为居中 Dialog，其他详情交互保持不变。

**Architecture:** 复用项目已有 `components/ui/dialog.tsx`，将 `TopologyWanSheet` 收口为 `TopologyWanDialog`。业务状态、接口筛选、保存回调和错误处理不变，降低行为回归风险。

**Tech Stack:** React 19、TypeScript、Radix Dialog、Tailwind CSS、Node.js test runner、Vite。

---

### Task 1: 锁定 WAN 弹窗合同

**Files:**
- Modify: `internal/site/src/modules/network-topology/workspace-data.test.ts`
- Test: `internal/site/src/modules/network-topology/workspace-data.test.ts`

- [x] **Step 1: Add a source contract requiring Dialog imports and forbidding Sheet imports**
- [x] **Step 2: Run the focused test and confirm it fails against the current Sheet implementation**

### Task 2: 替换展示容器

**Files:**
- Create: `internal/site/src/modules/network-topology/fixed-canvas/topology-wan-dialog.tsx`
- Delete: `internal/site/src/modules/network-topology/fixed-canvas/topology-wan-sheet.tsx`
- Modify: `internal/site/src/components/routes/network.tsx`

- [x] **Step 1: Replace Sheet primitives with Dialog primitives**
- [x] **Step 2: Add responsive centered sizing and internal overflow constraints**
- [x] **Step 3: Preserve save, close, disabled and error behavior**
- [x] **Step 4: Run the focused test and confirm it passes**

### Task 3: 记录与验收

**Files:**
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`

- [x] **Step 1: Record the WAN interaction change in both user-facing version records**
- [x] **Step 2: Run `npm run test:network-topology`, `npm run typecheck`, `npm run build` and targeted Biome lint**
- [x] **Step 3: Click a network card in Browser and verify centered placement, close behavior, console health and overflow**
