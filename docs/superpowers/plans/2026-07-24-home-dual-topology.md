# Home Dual Topology Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Pulse 首页以左右两列、较高只读画布同时完整展示家庭网和科技网。

**Architecture:** 将现有首页单域组件拆成一个双域容器和一个可配置的单域卡片。两个卡片分别调用现有 `useTopologyWorkspaceData`，复用同一只读 `TopologyWorkspace`，保留独立路由、布局、加载状态和错误状态。

**Tech Stack:** React 19、TypeScript、Tailwind CSS、React Flow、Node test runner

---

### Task 1: 锁定首页双拓扑契约

**Files:**
- Modify: `internal/site/src/modules/network-topology/workspace-data.test.ts`

- [x] **Step 1: 写入失败测试**

新增源码契约断言，要求首页组件包含等宽两列、`home` 与 `technology` 两个域、两个标题和 `min-h-[560px]` 画布：

```ts
test("home dashboard renders independent home and technology topology cards", () => {
	const source = readFileSync(new URL("../../components/routes/home-network-topology.tsx", import.meta.url), "utf8")

	assert.ok(source.includes("grid-cols-2"))
	assert.ok(source.includes('domain="home"'))
	assert.ok(source.includes('domain="technology"'))
	assert.ok(source.includes('title="家庭网"'))
	assert.ok(source.includes('title="科技网"'))
	assert.ok(source.includes("min-h-[560px]"))
})
```

- [x] **Step 2: 运行测试并确认正确失败**

Run: `npm run test:network-topology`

Expected: 新测试因缺少 `technology` 卡片和 `min-h-[560px]` 失败。

### Task 2: 实现双域首页卡片

**Files:**
- Modify: `internal/site/src/components/routes/home-network-topology.tsx`
- Modify: `internal/site/src/modules/network-topology/components/topology-workspace.tsx`
- Test: `internal/site/src/modules/network-topology/workspace-data.test.ts`

- [x] **Step 1: 泛化单域卡片并组合两列**

让顶层组件只负责两列结构，子组件接收 `domain` 与 `title`，分别加载数据：

```tsx
export function HomeNetworkTopology({ systems }: { systems: SystemRecord[] }) {
	return (
		<div className="grid grid-cols-2 gap-4">
			<HomeTopologyCard domain="home" title="家庭网" systems={systems} />
			<HomeTopologyCard domain="technology" title="科技网" systems={systems} />
		</div>
	)
}
```

每个卡片的完整拓扑入口使用自身 `domain`，加载与错误提示只覆盖自身卡片，`TopologyWorkspace` 继续传入 `readOnly` 和 `overview`。

- [x] **Step 2: 提高只读画布高度**

将首页卡片外层和工作台总览模式的最小高度统一为 `560px`，并把视口自适应上限提高到 `640px`：

```tsx
<div className="relative min-h-[560px]">
```

```tsx
overview
	? "h-[min(64vh,640px)] min-h-[560px] grid-rows-[minmax(0,1fr)]"
	: "h-[calc(100dvh-7.5rem)] min-h-[720px] grid-rows-[auto_minmax(0,1fr)]"
```

- [x] **Step 3: 更新既有断言并运行绿色测试**

更新总览高度和标题顺序断言后运行：

Run: `npm run test:network-topology`

Expected: 全部网络拓扑测试通过。

### Task 3: 同步版本记录并完成验证

**Files:**
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`

- [x] **Step 1: 同步用户可见版本记录**

在两个 1.0.6 Web / Hub 记录中加入同一条说明：

```text
首页网络拓扑升级为左右双画布总览：家庭网固定在左、科技网固定在右，两边独立读取布局与状态并分别提供完整拓扑入口；只读画布最小高度提高到 560px，单侧加载失败不会影响另一侧，独立拓扑编辑页保持不变。
```

- [x] **Step 2: 运行静态与构建验证**

Run: `npm run test:network-topology`

Expected: PASS。

Run: `npm run typecheck`

Expected: 退出码 0。

Run: `npm run build`

Expected: 退出码 0，无构建错误。

- [x] **Step 3: 运行浏览器验收**

在 `http://localhost:5173/` 验证家庭网位于左侧、科技网位于右侧、两张画布完整显示且高度明显增加；检查页面无横向溢出、节点裁切、重叠和控制台错误，并在宽屏及较窄桌面窗口各验证一次。
