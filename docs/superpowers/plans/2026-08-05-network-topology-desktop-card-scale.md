# Network Topology Desktop Card Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 放大 Web 桌面端完整网络拓扑卡片，并让三层设备从工作区左侧展开，消除超宽屏中央小团块。

**Architecture:** 仅通过 `is-fit-window` 桌面作用域覆盖现有语义行布局，不修改拓扑模型、数据源或交互。终端行继续按实际设备数生成列，卡片在 `180px` 到 `260px` 之间适配；网络卡使用 `440px` 基准宽度并允许收缩。

**Tech Stack:** React、TypeScript、CSS Grid / Flexbox、Node contract tests、Playwright E2E、Vite

---

### Task 1: 锁定桌面完整拓扑的尺寸和左对齐合同

**Files:**
- Modify: `internal/site/src/modules/network-topology/workspace-data.test.ts`
- Modify: `internal/site/e2e/network-topology.spec.ts`

- [ ] **Step 1: 写入失败的 CSS 合同测试**

在 `workspace-data.test.ts` 增加：

```ts
test("desktop full topology enlarges cards and starts rows from the left", () => {
	const cssSource = readFileSync(new URL("../../index.css", import.meta.url), "utf8")
	assert.ok(cssSource.includes(".pulse-fixed-topology-viewport.is-fit-window .pulse-fixed-terminal-row"), "完整拓扑必须使用独立桌面终端行规则")
	assert.ok(cssSource.includes("repeat(var(--terminal-count), minmax(180px, 260px))"), "桌面终端卡必须按实际数量在 180px 到 260px 间适配")
	assert.ok(cssSource.includes(".pulse-fixed-topology-viewport.is-fit-window .pulse-fixed-network-row"), "完整拓扑必须使用独立桌面网络设备行规则")
	assert.ok(cssSource.includes("justify-content: flex-start"), "桌面设备行必须从左侧开始排列")
	assert.ok(cssSource.includes("flex: 0 1 440px"), "桌面网络设备卡必须使用 440px 基准宽度")
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```powershell
node --experimental-strip-types src/modules/network-topology/workspace-data.test.ts
```

Expected: FAIL，提示缺少桌面完整拓扑尺寸或左对齐规则。

- [ ] **Step 3: 补强桌面 E2E 几何检查**

在 `verifyDesktopGeometry` 中加入：

```ts
const wiredLeft = await page.locator('[data-topology-row="wired"]').first().evaluate((item) => item.getBoundingClientRect().left)
const networkLeft = await page.locator('[data-topology-row="network"]').evaluate((item) => item.getBoundingClientRect().left)
const wirelessLeft = await page.locator('[data-topology-row="wireless"]').first().evaluate((item) => item.getBoundingClientRect().left)
expect(Math.abs(wiredLeft - networkLeft)).toBeLessThanOrEqual(1)
expect(Math.abs(wirelessLeft - networkLeft)).toBeLessThanOrEqual(1)
if (geometry.length > 0) expect(Math.max(...geometry)).toBeGreaterThanOrEqual(220)
```

- [ ] **Step 4: 提交测试合同**

```powershell
git add internal/site/src/modules/network-topology/workspace-data.test.ts internal/site/e2e/network-topology.spec.ts
git commit -m "test: define desktop topology card scale"
```

### Task 2: 实施桌面左展开和卡片放大

**Files:**
- Modify: `internal/site/src/index.css`

- [ ] **Step 1: 添加仅作用于完整桌面拓扑的 CSS**

在移动端规则之前加入：

```css
@media (min-width: 900px) {
	.pulse-fixed-topology-viewport.is-fit-window .pulse-fixed-terminal-row {
		grid-template-columns: repeat(var(--terminal-count), minmax(180px, 260px));
		justify-content: start;
	}

	.pulse-fixed-topology-viewport.is-fit-window .pulse-fixed-network-row {
		justify-content: flex-start;
	}

	.pulse-fixed-topology-viewport.is-fit-window .pulse-fixed-network-card {
		flex: 0 1 440px;
	}
}
```

- [ ] **Step 2: 运行拓扑专项测试并确认通过**

Run:

```powershell
npm run test:network-topology
```

Expected: 所有网络拓扑合同、模型、布局和高亮测试 PASS。

- [ ] **Step 3: 提交桌面样式实现**

```powershell
git add internal/site/src/index.css
git commit -m "style: enlarge desktop topology cards"
```

### Task 3: 同步版本说明并完成验证

**Files:**
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`

- [ ] **Step 1: 更新开发记录**

在网络拓扑 Web / Hub 记录中补充：

```md
- Web 桌面完整拓扑放大终端与网络设备卡片，并把三层设备从工作区左侧展开；超宽屏不再把少量设备压成中央小团块，1280px 桌面仍可自动收缩且不产生横向滚动。首页紧凑拓扑和移动端保持不变。
```

- [ ] **Step 2: 更新关于页版本记录**

在 `1.0.6` 的 Web / Hub 小节加入同一用户可见口径，明确仅影响桌面完整拓扑。

- [ ] **Step 3: 运行自动化门禁**

Run:

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
npm exec -- playwright test e2e/network-topology.spec.ts --list
git diff --check
```

Expected: 所有命令退出码为 `0`；Playwright 列出 wide、compact、narrow、mobile 四个视口用例。

- [ ] **Step 4: 在当前浏览器验收桌面尺寸**

检查：

```text
2494 x 1194：终端卡约 260px，网络卡约 440px，三层左边缘对齐，无页面溢出。
1280 x 800：卡片自动收缩、完整可见，无横向滚动、裁切或重叠。
5 GHz 点击：terminal=2、network=1、radio=1、relations=2。
```

- [ ] **Step 5: 提交文档和最终验证改动**

```powershell
git add docs/release-notes-next.md internal/site/src/components/routes/settings/release-history.ts
git commit -m "docs: record desktop topology scale update"
```

