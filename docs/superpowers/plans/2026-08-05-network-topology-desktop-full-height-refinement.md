# Network Topology Desktop Full Height Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Web 桌面完整拓扑以五排容量利用整页高度，继续放大卡片并清除节点上的可见图标和文字。

**Architecture:** 继续复用现有固定 DOM 拓扑和资产中心数据模型，只在 `is-fit-window` 桌面作用域调整 CSS。工作区改为上下弹性终端区夹一条固定网络设备行；完整桌面的端口节点全部隐藏并关闭指针命中，关系条和卡片高亮继续承担对应关系反馈，首页紧凑拓扑和移动端节点不受影响。

**Tech Stack:** React、TypeScript、CSS Grid / Flexbox、Node contract tests、Playwright E2E、Vite

---

### Task 1: 锁定全高五排与极简节点合同

**Files:**
- Modify: `internal/site/src/modules/network-topology/workspace-data.test.ts`
- Modify: `internal/site/e2e/network-topology.spec.ts`

- [ ] **Step 1: 写入失败的 CSS 合同测试**

更新桌面布局合同，要求完整拓扑包含 `minmax(0, 1fr) 170px minmax(0, 1fr)`、更大的桌面间距、`210px` 到 `300px` 的终端卡、`520px` 网络卡，以及只在 `is-fit-window` 下隐藏全部端口节点并关闭指针命中。

- [ ] **Step 2: 运行合同测试并确认失败**

Run:

```powershell
node --experimental-strip-types src/modules/network-topology/workspace-data.test.ts
```

Expected: FAIL，提示仍使用内容高度网格、旧卡片尺寸或节点图文仍可见。

- [ ] **Step 3: 补强桌面 E2E 几何检查**

在宽屏和紧凑桌面检查中验证工作区高度接近画布高度、上下终端区分列在网络行两侧、网络行与终端卡保持至少 `48px` 的视觉间距，并断言完整桌面全部端口节点不可见；移动端继续验证节点交互。

- [ ] **Step 4: 提交测试合同**

```powershell
git add internal/site/src/modules/network-topology/workspace-data.test.ts internal/site/e2e/network-topology.spec.ts
git commit -m "test: define full-height desktop topology"
```

### Task 2: 实施桌面全高布局并隐藏节点

**Files:**
- Modify: `internal/site/src/index.css`

- [ ] **Step 1: 添加完整桌面全高规则**

在 `@media (min-width: 900px)` 的 `is-fit-window` 作用域内：

```css
.pulse-fixed-topology-workspace {
	grid-template-rows: minmax(0, 1fr) 170px minmax(0, 1fr);
	align-content: stretch;
	gap: clamp(48px, 6vh, 72px);
}
```

终端卡使用 `minmax(210px, 300px)`，网络卡使用 `520px` 基准宽度；标准桌面提升卡高，矮桌面覆盖为仍可容纳五排的紧凑尺寸。

- [ ] **Step 2: 隐藏完整桌面端口节点**

只在 `is-fit-window` 桌面作用域隐藏 `.pulse-fixed-port-anchor`、`.pulse-fixed-radio-port`、`.pulse-fixed-terminal-port` 和 `.pulse-fixed-side-port`，并关闭 `pointer-events`；接口和关系数据、关系条与卡片高亮继续保留。

- [ ] **Step 3: 运行拓扑专项测试并确认通过**

Run:

```powershell
npm run test:network-topology
```

Expected: 网络拓扑合同、模型、布局和高亮测试全部 PASS。

- [ ] **Step 4: 提交实现**

```powershell
git add internal/site/src/index.css
git commit -m "style: fill desktop topology workspace"
```

### Task 3: 同步版本说明并完成验证

**Files:**
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`

- [ ] **Step 1: 更新开发记录和关于页**

把原“卡片放大、左侧展开”记录补充为五排容量全高布局、更大垂直间距和完整桌面端口节点全部隐藏；明确关系条高亮、首页紧凑拓扑和移动端不变。

- [ ] **Step 2: 运行完整门禁**

Run:

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
npm exec -- playwright test e2e/network-topology.spec.ts --list
git diff --check
```

Expected: 所有命令退出码为 `0`，Playwright 列出 wide、compact、narrow、mobile 四个用例。

- [ ] **Step 3: 浏览器验收**

检查 `2494 x 1194`、`1280 x 800` 的全高利用、卡片尺寸、上下间距、无滚动和全部端口节点不可见；悬停关系条验证对应终端与网络设备仍会高亮，控制台无 error / warn。

- [ ] **Step 4: 提交版本记录**

```powershell
git add docs/release-notes-next.md internal/site/src/components/routes/settings/release-history.ts
git commit -m "docs: record full-height topology refinement"
```
