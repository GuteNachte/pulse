# Global Card Spacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Pulse Web 全站真实卡片父容器的外部间距和桌面页面壳层边距统一为 `10px`，不改变卡片内部内容与交互。

**Architecture:** 在 `index.css` 建立 `--pulse-card-gap: 10px`、`--pulse-page-gutter: 10px` 和显式 `.pulse-card-gap` 语义类。主要页面、设置页、系统详情和资产工作区中直接承载卡片的父级布局迁移到统一卡片类，桌面 `.container` 复用页面边距变量；普通表单、卡片内部布局和移动端安全区不动。

**Tech Stack:** React 19、TypeScript、Tailwind CSS 4、Node test runner

---

### Task 1: 建立卡片间距契约

**Files:**
- Create: `internal/site/src/components/card-spacing.test.ts`
- Modify: `internal/site/package.json`

- [x] **Step 1: 写失败测试**

测试读取 `index.css` 与主要页面源码，断言存在 `10px` token、`.pulse-card-gap` 语义类，并覆盖首页、资产、智能家居、网站、告警、系统详情和设置页代表文件：

```ts
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("uses one 10px semantic gap for card layouts", () => {
	const css = readFileSync(new URL("../index.css", import.meta.url), "utf8")
	assert.ok(css.includes("--pulse-card-gap: 10px"))
	assert.ok(css.includes(".pulse-card-gap"))
	for (const path of [
		"./routes/home.tsx",
		"./routes/assets.tsx",
		"../modules/smarthome/page.tsx",
		"./routes/websites.tsx",
		"./routes/alerts.tsx",
		"./routes/system/system-detail-content.tsx",
		"./routes/settings/layout.tsx",
	]) {
		assert.ok(readFileSync(new URL(path, import.meta.url), "utf8").includes("pulse-card-gap"), path)
	}
})
```

- [x] **Step 2: 注册并运行测试**

把测试加入 `test:modules`，运行 `node --experimental-strip-types src/components/card-spacing.test.ts`。

Expected: 因 token 和语义类不存在而失败。

### Task 2: 新增语义 token 并迁移核心页面

**Files:**
- Modify: `internal/site/src/index.css`
- Modify: `internal/site/src/components/routes/home.tsx`
- Modify: `internal/site/src/components/routes/home-network-topology.tsx`
- Modify: `internal/site/src/components/routes/assets.tsx`
- Modify: `internal/site/src/modules/smarthome/page.tsx`
- Modify: `internal/site/src/components/routes/websites.tsx`
- Modify: `internal/site/src/components/routes/alerts.tsx`
- Modify: `internal/site/src/components/routes/clients.tsx`
- Modify: `internal/site/src/components/routes/containers.tsx`

- [x] **Step 1: 新增全局 token 与语义类**

```css
:root {
	--pulse-card-gap: 10px;
}

.pulse-card-gap {
	gap: var(--pulse-card-gap);
}
```

- [x] **Step 2: 迁移核心页面真实卡片父容器**

将页面纵向卡片栈、并列拓扑卡片、资产工作区、智能家居卡片网格、网站主从面板、告警卡片区和客户端 / 容器页面卡片栈的 `gap-4` / `gap-5` 替换为 `pulse-card-gap`。保留表单和卡片内部 `gap-*`。

- [x] **Step 3: 运行测试**

Run: `node --experimental-strip-types src/components/card-spacing.test.ts`

Expected: 核心页面断言通过。

### Task 3: 迁移设置页、系统详情与资产详情卡片组

**Files:**
- Modify: `internal/site/src/components/routes/settings/layout.tsx`
- Modify: `internal/site/src/components/routes/settings/about.tsx`
- Modify: `internal/site/src/components/routes/settings/advanced.tsx`
- Modify: `internal/site/src/components/routes/settings/agent.tsx`
- Modify: `internal/site/src/components/routes/settings/ai.tsx`
- Modify: `internal/site/src/components/routes/settings/backups.tsx`
- Modify: `internal/site/src/components/routes/settings/general.tsx`
- Modify: `internal/site/src/components/routes/settings/modules.tsx`
- Modify: `internal/site/src/components/routes/settings/notifications.tsx`
- Modify: `internal/site/src/components/routes/settings/operation-audit.tsx`
- Modify: `internal/site/src/components/routes/settings/system-logs.tsx`
- Modify: `internal/site/src/components/routes/settings/users.tsx`
- Modify: `internal/site/src/components/routes/system/system-detail-content.tsx`
- Modify: `internal/site/src/components/routes/system/disk-charts.tsx`
- Modify: `internal/site/src/components/routes/system/network-sheet.tsx`
- Modify: `internal/site/src/modules/asset-center/asset-detail-page.tsx`
- Modify: `internal/site/src/modules/asset-center/components/asset-showcase-workspace.tsx`

- [x] **Step 1: 迁移设置页卡片栈**

只替换页面根级和直接承载管理卡片的布局类，不替换设置表单、列表行、工具栏和对话框字段间距。

- [x] **Step 2: 迁移系统与资产详情卡片组**

将摘要卡、图表卡、硬件卡、参数卡和左右工作区之间的父级间距改为 `pulse-card-gap`；图表内部图例、网卡字段和资产表单保持原间距。

- [x] **Step 3: 运行格式、测试与类型检查**

Run: `npx biome check <modified files>`

Run: `npm run test:modules`

Run: `npm run typecheck`

Expected: 全部退出码为 0。

### Task 4: 同步版本记录并做浏览器验收

**Files:**
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`

- [x] **Step 1: 记录用户可见变化**

```text
全站卡片外部间距与桌面页面边距统一收紧为 10px：首页、资产、网络、智能家居、监控、系统详情和设置页的卡片栈、多列卡片网格与页面壳层共用统一语义间距；卡片内部留白、表单字段、按钮组、响应式列数、移动端安全区和业务交互保持不变。
```

- [x] **Step 2: 最终自动化验证**

Run: `npm run test:modules && npm run typecheck && npm run build`

Expected: 全部退出码为 0。

- [x] **Step 3: 浏览器验收**

在首页、资产中心、系统详情、网站和设置页测量相邻卡片间距为 `10px`，检查无重叠、横向溢出和控制台错误；恢复并保留用户首页标签。
