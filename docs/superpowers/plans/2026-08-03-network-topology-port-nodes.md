# Network Topology Port Nodes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将固定网络拓扑的有线、Wi-Fi 和光纤节点升级为统一、清晰且准确骑在卡片边缘的介质化节点。

**Architecture:** 保留现有固定布局坐标和 SVG 连线锚点，只为端口元素增加统一语义类，并通过 CSS 绘制 RJ45 触点、Wi-Fi 圆形标记和光纤双环。节点以自身半尺寸抵消定位，确保视觉中心与既有连接锚点重合，不改数据模型、关系或路径算法。

**Tech Stack:** React 19、TypeScript、CSS、Node.js test runner、Biome、Vite。

---

### Task 1: 锁定节点视觉与边缘位置合同

**Files:**
- Modify: `internal/site/src/modules/network-topology/workspace-data.test.ts`
- Test: `internal/site/src/modules/network-topology/workspace-data.test.ts`

- [x] **Step 1: Write the failing test**

新增源码合同断言，要求固定画布为所有节点输出 `pulse-fixed-port-node`，样式包含 `18px × 14px` RJ45 基准、触点伪元素、Wi-Fi / 光纤变体和基于半尺寸的边缘定位。

- [x] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types src/modules/network-topology/workspace-data.test.ts`

Expected: FAIL，因为当前节点仍是 `10px × 10px` 方块，且没有统一语义类。

### Task 2: 实现介质化节点

**Files:**
- Modify: `internal/site/src/modules/network-topology/fixed-canvas/fixed-topology-canvas.tsx`
- Modify: `internal/site/src/index.css`

- [x] **Step 1: Add semantic node classes**

为上方 LAN、左右 WAN / 上联、终端有线、Wi-Fi 频段及光纤出口节点统一增加 `pulse-fixed-port-node`，并以 `is-wifi` 或父级 `is-fiber` 区分介质。

- [x] **Step 2: Draw the RJ45, Wi-Fi and fiber nodes**

使用 CSS 伪元素绘制 RJ45 触点和卡扣；Wi-Fi 改为绿色圆环中心点；光纤改为琥珀色双环。节点保持扁平、无动画，并复用项目主题色。

- [x] **Step 3: Align each node center to the card edge**

顶部和底部节点按自身半高偏移；左右节点通过 `--pulse-fixed-port-half` 和 `translate()` 把节点中心对齐卡片边缘，标签继续位于卡片内侧或节点外侧。

- [x] **Step 4: Run the focused tests**

Run: `node --experimental-strip-types src/modules/network-topology/workspace-data.test.ts`

Expected: PASS。

### Task 3: 记录与验证

**Files:**
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`

- [x] **Step 1: Update user-visible release notes**

记录 RJ45、Wi-Fi、光纤节点的统一造型及半内半外定位，明确数据、接口数量和连线关系不变。

- [x] **Step 2: Run automated verification**

Run: `npm run test:network-topology && npm run typecheck && npm run build`

Expected: 全部退出码为 `0`。

- [x] **Step 3: Run rendered verification**

在 `http://127.0.0.1:5173/network/home` 验证顶部、底部、左侧和右侧有线节点均骑在卡片边缘，Wi-Fi 与光纤节点介质清晰，真实连线命中节点中心，无重叠、滚动条或控制台错误。
