# 网络拓扑 v4 视觉回归实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 保留资产驱动、无连线和只读拓扑能力，将正式页面重做为已确认 C 方案的 v4 卡片比例、真实端口节点、三层空间结构和可读响应式布局。

**Architecture:** 继续以 `fixed-canvas` 作为拓扑展示边界。模型层只补充可追溯的配对标识和网络设备关系摘要；布局层从绝对坐标改为语义行分组；React 层输出宽带栏、终端行和网络设备行；CSS 使用响应式 Grid，而不是对完整逻辑画布执行 `transform: scale(...)`。资产查询、排序、关系索引、路由和只读详情跳转保持不变。

**Tech Stack:** React 19、TypeScript、项目现有 CSS / Tailwind 变量、Node.js `node:test`、Playwright、Vite。

---

## 文件边界

- `fixed-topology-model.ts`：资产、接口和关系投影；新增真实配对标识及网络设备关系摘要，不处理像素尺寸。
- `fixed-topology-layout.ts`：只负责把有线 / 无线终端按每行 5 台切分，并输出网络设备单排；删除固定画布尺寸、绝对坐标和缩放计算。
- `fixed-topology-canvas.tsx`：渲染宽带栏、三层语义行、卡片内容、端口节点和高亮事件。
- `index.css`：维护 C 方案的尺寸、Grid、端口造型、响应式降级和高亮视觉。
- `workspace-data.test.ts`：锁定正式路由不恢复 React Flow、连接线、编辑入口或整体缩放。
- `network-topology.spec.ts`：覆盖真实页面的卡片尺寸、端口位置、配对高亮、网络域切换和多视口溢出。
- `release-notes-next.md` / `release-history.ts`：同步下一版本和 About 页的分端更新记录。

---

### Task 1: 建立可追溯的配对标识和网络设备关系摘要

**Files:**
- Modify: `internal/site/src/modules/network-topology/fixed-canvas/fixed-topology-model.ts`
- Modify: `internal/site/src/modules/network-topology/fixed-canvas/fixed-topology-model.test.ts`

- [ ] **Step 1: 写配对标识失败测试**

在 `fixed-topology-model.test.ts` 增加纯展示合同：

```ts
test("derives traceable pair labels from real ports and bands", () => {
	assert.equal(formatTopologyPairLabel("电口 5", "wired", "接入"), "P05")
	assert.equal(formatTopologyPairLabel("LAN 1", "wired", "下联"), "L1")
	assert.equal(formatTopologyPairLabel("5 GHz", "wifi", "接入"), "5G")
	assert.equal(formatTopologyPairLabel("2.4 GHz", "wifi", "接入"), "2.4G")
	assert.equal(formatTopologyPairLabel("PON 上联", "fiber", "上联"), "WAN")
	assert.equal(formatTopologyPairLabel("待确认", "unknown", "关系待确认"), "待确认")
})
```

同时为 `FixedNetworkPort` 增加断言，要求已连接端口输出真实 `relationId`、`peerName`、`pairLabel`，未连接端口不制造这些字段。

- [ ] **Step 2: 运行模型测试确认失败**

运行：

```powershell
node --experimental-strip-types internal/site/src/modules/network-topology/fixed-canvas/fixed-topology-model.test.ts
```

预期：FAIL，提示 `formatTopologyPairLabel` 未导出或网络端口缺少关系摘要。

- [ ] **Step 3: 扩展展示模型类型**

在 `fixed-topology-model.ts` 增加：

```ts
export type FixedNetworkPort = {
	interface: AssetInterfaceRecord
	placement: "left" | "top" | "right"
	role: "wan" | "uplink" | "lan" | "downlink"
	edge?: FixedTopologyEdge
	relationId?: string
	peerName?: string
	pairLabel?: string
}

export type FixedRelationSummary = {
	id?: string
	role: "接入" | "上联" | "下联" | "关系待确认"
	upstreamName: string
	endpointLabel: string
	pairLabel: string
	medium: TopologyMedium | "unknown"
	sharedCount: number
}
```

`buildNetworkDevice()` 只从真实 `edge`、真实对端节点和真实接口生成这些字段。无关系时保持 `undefined`。

- [ ] **Step 4: 实现配对标识格式化**

实现并导出：

```ts
export function formatTopologyPairLabel(
	endpointLabel: string,
	medium: TopologyMedium | "unknown",
	role: FixedRelationSummary["role"]
) {
	if (role === "关系待确认") return "待确认"
	if (medium === "wifi") return /^5(?:\D|$)/.test(endpointLabel) ? "5G" : "2.4G"
	if (role === "上联" && /pon|wan|宽带/i.test(endpointLabel)) return "WAN"
	const number = Number(endpointLabel.match(/\d+/)?.[0])
	if (/lan/i.test(endpointLabel) && Number.isFinite(number)) return `L${number}`
	if (/(?:电口|端口|port)/i.test(endpointLabel) && Number.isFinite(number)) return `P${String(number).padStart(2, "0")}`
	return endpointLabel || "待确认"
}
```

`resolveTerminal()` 和网络端口摘要共用同一函数，禁止各自维护另一套缩写规则。

- [ ] **Step 5: 运行模型测试并提交**

运行：

```powershell
node --experimental-strip-types internal/site/src/modules/network-topology/fixed-canvas/fixed-topology-model.test.ts
```

预期：全部 PASS。

提交：

```powershell
git add internal/site/src/modules/network-topology/fixed-canvas/fixed-topology-model.ts internal/site/src/modules/network-topology/fixed-canvas/fixed-topology-model.test.ts
git commit -m "refactor: derive topology pair labels from assets"
```

---

### Task 2: 将绝对坐标布局收口为语义行布局

**Files:**
- Modify: `internal/site/src/modules/network-topology/fixed-canvas/fixed-topology-layout.ts`
- Modify: `internal/site/src/modules/network-topology/fixed-canvas/fixed-topology-layout.test.ts`

- [ ] **Step 1: 重写布局失败测试**

删除 `1600 × 760`、`FixedRect`、缩放比例和绝对坐标断言，改为：

```ts
test("groups asset-driven topology into semantic rows", () => {
	const layout = createFixedTopologyLayout(modelWith({ wired: 11, wireless: 6, networks: 2 }))
	assert.deepEqual(layout.wiredRows.map((row) => row.length), [5, 5, 1])
	assert.equal(layout.networkDevices.length, 2)
	assert.deepEqual(layout.wirelessRows.map((row) => row.length), [5, 1])
})

test("does not expose logical canvas scaling", () => {
	assert.equal("canvas" in createFixedTopologyLayout(emptyModel), false)
	assert.equal("calculateFixedTopologyViewport" in fixedTopologyLayout, false)
	assert.equal("calculateFixedTopologyScale" in fixedTopologyLayout, false)
})
```

- [ ] **Step 2: 运行布局测试确认旧实现失败**

运行：

```powershell
node --experimental-strip-types internal/site/src/modules/network-topology/fixed-canvas/fixed-topology-layout.test.ts
```

预期：FAIL，旧实现仍包含固定画布和缩放函数。

- [ ] **Step 3: 重写布局数据结构**

将 `fixed-topology-layout.ts` 收口为：

```ts
export const FIXED_TERMINALS_PER_ROW = 5

export type FixedTopologyLayout = {
	wiredRows: FixedTerminal[][]
	networkDevices: FixedNetworkDevice[]
	wirelessRows: FixedTerminal[][]
}

export function createFixedTopologyLayout(model: FixedTopologyModel): FixedTopologyLayout {
	return {
		wiredRows: splitRows(model.wiredTerminals),
		networkDevices: model.networkDevices,
		wirelessRows: splitRows(model.wirelessTerminals),
	}
}
```

`splitRows()` 继续保护性追加第三行，不截断超过 10 台的真实资产。

- [ ] **Step 4: 运行布局和模型测试并提交**

运行：

```powershell
npm --prefix internal/site run test:network-topology
```

预期：布局与模型测试全部 PASS；组件合同可能因后续任务尚未修改而失败时，只允许失败点命中旧画布缩放引用。

提交：

```powershell
git add internal/site/src/modules/network-topology/fixed-canvas/fixed-topology-layout.ts internal/site/src/modules/network-topology/fixed-canvas/fixed-topology-layout.test.ts
git commit -m "refactor: group topology into responsive rows"
```

---

### Task 3: 重写固定拓扑 DOM 为 C 方案结构

**Files:**
- Modify: `internal/site/src/modules/network-topology/fixed-canvas/fixed-topology-canvas.tsx`
- Modify: `internal/site/src/modules/network-topology/workspace-data.test.ts`

- [ ] **Step 1: 写正式 DOM 合同失败测试**

在 `workspace-data.test.ts` 锁定：

```ts
assert.ok(canvasSource.includes("pulse-fixed-topology-workspace"))
assert.ok(canvasSource.includes("pulse-fixed-terminal-row"))
assert.ok(canvasSource.includes("pulse-fixed-pair-label"))
assert.ok(canvasSource.includes("pairLabel"))
assert.equal(canvasSource.includes("ResizeObserver"), false)
assert.equal(canvasSource.includes("transform: `scale("), false)
assert.equal(canvasSource.includes("FixedRect"), false)
assert.equal(canvasSource.includes("rectStyle"), false)
```

继续保留无 `<svg>`、无 React Flow、无添加入口、无编辑按钮和无 Inspector 的既有断言。

- [ ] **Step 2: 运行组件合同确认失败**

运行：

```powershell
node --experimental-strip-types internal/site/src/modules/network-topology/workspace-data.test.ts
```

预期：FAIL，命中旧 `ResizeObserver`、绝对坐标和整体缩放。

- [ ] **Step 3: 重写画布容器和三层结构**

`FixedTopologyCanvas` 不再维护 `scale` 或 `viewportRef`，结构改为：

```tsx
<div className={cn("pulse-fixed-topology-viewport", overview && "is-overview", fitWindow && "is-fit-window")}>
	<div className="pulse-fixed-topology-canvas" data-topology-renderer="fixed-dom">
		<InternetCard node={model.internet?.node} onOpen={onNodeOpen} highlight={highlight} />
		<div className="pulse-fixed-topology-workspace">
			<TerminalRows rows={layout.wiredRows} row="wired" />
			<div className="pulse-fixed-network-row">{layout.networkDevices.map(renderNetworkCard)}</div>
			<TerminalRows rows={layout.wirelessRows} row="wireless" />
		</div>
	</div>
</div>
```

每个 `.pulse-fixed-terminal-row` 用 `--terminal-count` 暴露本行数量，CSS 负责从中间向两侧排布。

- [ ] **Step 4: 重做宽带和终端卡片内容层级**

- 宽带使用 `dt/dd` 或等价两级结构显示运营商、套餐、接入方式、装机地址和公网地址。
- 终端卡显示状态灯、名称、类型、IPv4、规格、位置。
- 关系条最后一列固定渲染：

```tsx
<span className={cn("pulse-fixed-pair-label", relation.medium === "wifi" && "is-wifi")}>
	{relation.pairLabel}
</span>
```

- 有线终端节点固定在底边中心；无线终端节点固定在顶边中心。

- [ ] **Step 5: 重做网络设备卡片端口和关系摘要**

- 顶部只渲染 `placement === "top"` 的真实 LAN / 电口节点，并用 CSS 变量按端口数量等距放置。
- 左右节点只渲染介质造型，不输出外部 `<span>` 文字；完整接口名保留在 `title` 和 `aria-label`。
- 无线频段节点固定在底边，显示 `5 GHz` / `2.4 GHz` 标签。
- 网络关系条优先展示一个上联和一个下联 / 终端汇总；每项保留真实 `relationIds`，继续复用现有双端高亮。

- [ ] **Step 6: 运行组件合同、类型检查并提交**

运行：

```powershell
node --experimental-strip-types internal/site/src/modules/network-topology/workspace-data.test.ts
npm --prefix internal/site run typecheck
```

预期：全部 PASS。

提交：

```powershell
git add internal/site/src/modules/network-topology/fixed-canvas/fixed-topology-canvas.tsx internal/site/src/modules/network-topology/workspace-data.test.ts
git commit -m "refactor: render topology with semantic v4 cards"
```

---

### Task 4: 实现 v4 卡片尺寸、节点造型和响应式 Grid

**Files:**
- Modify: `internal/site/src/index.css`
- Modify: `internal/site/src/modules/network-topology/workspace-data.test.ts`

- [ ] **Step 1: 写 CSS 合同失败测试**

在 `workspace-data.test.ts` 断言：

```ts
assert.ok(cssSource.includes("grid-template-columns: 176px minmax(0, 1fr)"))
assert.ok(cssSource.includes("repeat(5, minmax("))
assert.ok(cssSource.includes(".pulse-fixed-pair-label"))
assert.ok(cssSource.includes(".pulse-fixed-terminal-port.is-wifi"))
assert.ok(cssSource.includes("@media (max-width: 899px)"))
assert.equal(cssSource.includes("transform-origin: left top"), false)
assert.equal(cssSource.includes(".pulse-fixed-side-port span"), false)
```

- [ ] **Step 2: 运行合同测试确认旧 CSS 失败**

运行：

```powershell
node --experimental-strip-types internal/site/src/modules/network-topology/workspace-data.test.ts
```

预期：FAIL，旧 CSS 仍依赖固定画布缩放和侧边端口文字。

- [ ] **Step 3: 重写桌面三层 Grid**

实现以下基准：

```css
.pulse-fixed-topology-canvas {
	display: grid;
	grid-template-columns: 176px minmax(0, 1fr);
	min-height: 100%;
}

.pulse-fixed-topology-workspace {
	display: grid;
	grid-template-rows: minmax(112px, 1fr) 146px minmax(112px, 1fr);
	gap: clamp(24px, 3.5vh, 38px);
	padding: clamp(22px, 3vw, 34px);
}

.pulse-fixed-terminal-row {
	display: grid;
	grid-template-columns: repeat(5, minmax(150px, 210px));
	justify-content: center;
	gap: clamp(8px, 1vw, 14px);
}
```

主网关、交换机和终端卡片分别使用设计规范中的宽高范围；字体保持可读固定尺寸，不随画布整体缩放。

- [ ] **Step 4: 重做端口、关系条和高亮视觉**

- 保留当前 RJ45 金属触点和卡扣伪元素，节点中心对齐卡片边缘。
- 光纤节点使用琥珀双环，无线节点使用绿色圆形。
- 删除 `.pulse-fixed-side-port span`，左右节点不显示外部文字。
- `.pulse-fixed-pair-label` 使用固定最小宽度和等宽字体；Wi-Fi 使用绿色边框，有线使用蓝色边框。
- `.is-highlighted` 只改变边框、背景和阴影，禁止 `transform: scale()`。

- [ ] **Step 5: 实现中等宽度与窄屏降级**

- `900px` 以上保持五列和无拓扑内部滚动条。
- `900px` 以下取消页面级 `body overflow: hidden`，允许页面自然纵向浏览。
- 窄屏终端行改为两列，网络设备改为一列；宽带改为顶部紧凑信息带。
- 任何断点都不出现嵌套滚动容器，不把桌面画布缩成不可读缩略图。

- [ ] **Step 6: 运行合同测试、类型检查并提交**

运行：

```powershell
npm --prefix internal/site run test:network-topology
npm --prefix internal/site run typecheck
```

预期：全部 PASS。

提交：

```powershell
git add internal/site/src/index.css internal/site/src/modules/network-topology/workspace-data.test.ts
git commit -m "style: restore topology v4 visual hierarchy"
```

---

### Task 5: 对齐完整页面和首页双拓扑总览

**Files:**
- Modify: `internal/site/src/components/routes/network.tsx`
- Modify: `internal/site/src/components/routes/home-network-topology.tsx`
- Modify: `internal/site/src/modules/network-topology/workspace-data.test.ts`

- [ ] **Step 1: 写路由和总览失败测试**

锁定完整页面继续使用 `fitWindow`，首页继续使用 `overview`，但两者不再依赖内联高度或固定逻辑画布：

```ts
assert.ok(networkPageSource.includes("fitWindow"))
assert.ok(homeSource.includes("overview"))
assert.equal(canvasSource.includes('style={fitWindow ? { height: "100%" }'), false)
assert.equal(homeSource.includes("TopologyWorkspace"), false)
```

- [ ] **Step 2: 运行路由合同确认失败**

运行：

```powershell
node --experimental-strip-types internal/site/src/modules/network-topology/workspace-data.test.ts
```

预期：FAIL，命中旧内联高度或总览密度未对齐。

- [ ] **Step 3: 对齐完整页面容器**

- 保留家庭网 / 科技网分段切换。
- 桌面页使用导航下方剩余高度；窄屏改为自然文档高度。
- 错误横幅不得遮挡宽带标题或域切换。

- [ ] **Step 4: 对齐首页概览密度**

- 首页仍显示家庭网、科技网两张并列卡片。
- `is-overview` 隐藏端口标签和次要关系文本，只保留资产数量、设备层级和状态，避免双卡片内部文字过密。
- 首页点击资产仍进入资产详情，不恢复拓扑编辑。

- [ ] **Step 5: 运行定向测试并提交**

运行：

```powershell
npm --prefix internal/site run test:network-topology
npm --prefix internal/site run typecheck
```

预期：全部 PASS。

提交：

```powershell
git add internal/site/src/components/routes/network.tsx internal/site/src/components/routes/home-network-topology.tsx internal/site/src/modules/network-topology/workspace-data.test.ts
git commit -m "fix: align topology pages with responsive v4 layout"
```

---

### Task 6: 端到端验收和版本说明

**Files:**
- Modify: `internal/site/e2e/network-topology.spec.ts`
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`
- Verify: `internal/site/package.json`

- [ ] **Step 1: 重写 Playwright 视觉和交互断言**

保留 `2494 × 1194`、`1727 × 1272`、`1280 × 800` 三个桌面视口，新增 `390 × 844` 窄屏场景。断言：

```ts
await expect(page.locator(".pulse-fixed-internet-card")).toHaveCount(1)
await expect(page.locator(".pulse-fixed-terminal-row").first()).toBeVisible()
await expect(page.locator(".pulse-fixed-pair-label").first()).toBeVisible()
await expect(page.locator(".pulse-fixed-connections, svg")).toHaveCount(0)
await expect(page.locator(".pulse-fixed-side-port span")).toHaveCount(0)
```

桌面端额外读取卡片边界：终端卡宽度不低于 `150px`，主网关和交换机高度相同，网络设备行位于有线与无线区域之间。

- [ ] **Step 2: 验证配对标识和双端高亮**

悬停一个有线终端关系条后断言：

- 关系两端至少 2 张卡片进入 `.is-highlighted`。
- 对应真实接口节点进入 `.is-highlighted`。
- 配对标识文本与网络设备端口摘要一致。
- 移开后高亮集合为空。

再对 `5 GHz` 共享频段执行同样检查，允许多台无线终端同时高亮。

- [ ] **Step 3: 运行完整前端门禁**

运行：

```powershell
npm --prefix internal/site run test:network-topology
npm --prefix internal/site run typecheck
npm --prefix internal/site run build
git diff --check
```

预期：全部 PASS。

若存在 `PULSE_E2E_EMAIL` 和 `PULSE_E2E_PASSWORD`，再运行：

```powershell
npm --prefix internal/site run test:e2e:network-topology
```

缺少账号环境变量时明确记录未运行，不反复尝试登录；若账号启用了 MFA，立即暂停并指导白老板提供无 MFA 的专用本地测试账号。

- [ ] **Step 4: 执行真实浏览器视觉验收**

使用本地 `http://127.0.0.1:5173/network/home` 验证：

- 页面标题和路由正确，家庭网 / 科技网切换正常。
- 首屏非空、无 Vite 错误覆盖层、控制台无相关 warning / error。
- 宽带、网络设备、上下终端、节点和配对标识与已确认 C 方案一致。
- 桌面与窄屏没有横向溢出、文字重叠、节点遮挡或嵌套滚动条。
- 卡片点击进入资产详情；关系条和接口节点均触发双端高亮。

- [ ] **Step 5: 更新版本口径**

在 `docs/release-notes-next.md` 和 `release-history.ts` 的下一版本中同步：

- Web / Hub：拓扑恢复 v4 视觉层级、真实端口节点和可追溯配对标识；保持资产驱动、无连线、只读。
- 移动端 / Android：窄屏拓扑使用可读两列 / 单列降级，不再缩成不可读缩略图。
- Agent / 部署：本轮无采集协议和部署参数变化，发布时仍随统一版本同步构建。
- 文档 / 规则：新增 v4 视觉回归设计和实施计划。

- [ ] **Step 6: 最终差异检查并提交**

运行：

```powershell
git diff --check
git status --short
```

确认只包含本方案相关文件和白老板原有未提交改动，不清理、不回退无关工作区内容。

提交：

```powershell
git add internal/site/e2e/network-topology.spec.ts docs/release-notes-next.md internal/site/src/components/routes/settings/release-history.ts
git commit -m "test: verify topology v4 visual realignment"
```

本计划不包含 GitHub 发布、镜像构建、FlyNAS 部署或正式版本发布；这些操作需在本地验收通过后按统一版本号、备份和部署清单另行执行。
