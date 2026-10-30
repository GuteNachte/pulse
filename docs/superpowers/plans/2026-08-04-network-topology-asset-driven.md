# 网络拓扑资产驱动重做实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将家庭网和科技网拓扑重做为由资产中心真实资产、接口和关系自动生成的只读固定布局：宽带固定左侧，网络设备单排位于纵向中轴，有线终端在上方、无线终端在下方，并通过结构化关系条完成对应关系与双端高亮。

**Architecture:** 保留现有 `fixed-canvas` 模块作为渲染边界，但重写其模型、布局和卡片渲染合同。模型层只消费 `PulseTopologyGraph` 投影并输出稳定排序、关系索引和高亮目标；布局层生成“左宽带 + 中轴设备 + 上下五列终端”的纯数据坐标；React 层只读渲染 DOM 卡片和关系条，不再保存拓扑坐标、编辑状态或 SVG 连接线。网络路由和首页总览复用同一画布，卡片点击只导航到资产详情。

**Tech Stack:** React 19、TypeScript、Tailwind CSS / 项目现有 CSS、Radix Dialog（仅保留资产详情跳转链路）、Node.js `node:test`、Playwright、Vite。

---

### Task 1: 重建资产驱动模型、IP 排序和关系索引

**Files:**
- Modify: `internal/site/src/modules/network-topology/fixed-canvas/fixed-topology-model.ts`
- Modify: `internal/site/src/modules/network-topology/fixed-canvas/fixed-topology-model.test.ts`
- Modify: `internal/site/src/modules/network-topology/pulse-adapter.ts`（只在现有投影缺少关系端点信息时补充字段）

- [ ] **Step 1: 先写失败测试，锁定模型输出合同**

在 `fixed-topology-model.test.ts` 增加以下断言场景：

```ts
const model = buildFixedTopologyModel(graph)
assert.deepEqual(model.wiredTerminals.map((item) => item.node.id), ["asset:client-2", "asset:client-10"])
assert.deepEqual(model.wirelessTerminals.map((item) => item.node.id), ["asset:wifi-2", "asset:wifi-100"])
assert.equal(model.wiredTerminals[0].relation.role, "接入")
assert.equal(model.wiredTerminals[0].relation.endpointLabel, "电口 4")
assert.equal(model.wirelessTerminals[0].relation.endpointLabel, "5 GHz")
assert.deepEqual(model.relationIndex.get("relation-1"), ["asset:gateway", "asset:client-2"])
```

同时覆盖：缺失 IP 的名称/ID 稳定兜底、多关系共享端口、无关系设备显示 `关系待确认`、缺少端口或上游显示 `待确认`、无效 IPv4 不参与数值排序。

- [ ] **Step 2: 运行定向测试，确认新合同在旧模型上失败**

运行：`npm --prefix internal/site run test -- src/modules/network-topology/fixed-canvas/fixed-topology-model.test.ts`

预期：FAIL，失败点应是 `relation` / `relationIndex` 字段不存在或旧的有线端口排序仍优先。

- [ ] **Step 3: 实现稳定模型类型和关系索引**

把模型核心类型收敛为：

```ts
export type FixedRelationSummary = {
  id?: string
  role: "接入" | "上联" | "下联" | "关系待确认"
  upstreamName: string
  endpointLabel: string
  medium: TopologyMedium | "unknown"
  sharedCount: number
}

export type FixedTerminal = {
  node: FixedTopologyNode
  relation: FixedRelationSummary
  relationIds: string[]
  networkNodeId?: string
  networkInterface?: AssetInterfaceRecord
  terminalInterface?: AssetInterfaceRecord
  medium: TopologyMedium | "unknown"
  band?: FixedWirelessBand
}

export type FixedTopologyModel = {
  internet?: { node: FixedTopologyNode }
  networkDevices: FixedNetworkDevice[]
  wiredTerminals: FixedTerminal[]
  wirelessTerminals: FixedTerminal[]
  unplacedNodes: FixedTopologyNode[]
  relationIndex: Map<string, string[]>
}
```

实现顺序：先从真实关系构建 `relationIndex`，再按网络域过滤资产；网络设备按互联网入口到下游 BFS 层级、同层有效管理 IP、端口、名称、ID 排序；有线和无线终端均先 `compareIPv4(getNodeIPv4(a), getNodeIPv4(b))`，再按上游设备序号、端口/频段、名称、ID 兜底。关系显示文本只能来自真实端点，缺失时使用 `待确认`，不能虚构端口或设备。

- [ ] **Step 4: 运行模型测试并提交独立变更**

运行：`npm --prefix internal/site run test -- src/modules/network-topology/fixed-canvas/fixed-topology-model.test.ts`

预期：全部 PASS；提交：`git add internal/site/src/modules/network-topology/fixed-canvas/fixed-topology-model.ts internal/site/src/modules/network-topology/fixed-canvas/fixed-topology-model.test.ts internal/site/src/modules/network-topology/pulse-adapter.ts && git commit -m "refactor: make topology model asset driven"`。

### Task 2: 实现纵向中轴和五列两排布局

**Files:**
- Modify: `internal/site/src/modules/network-topology/fixed-canvas/fixed-topology-layout.ts`
- Modify: `internal/site/src/modules/network-topology/fixed-canvas/fixed-topology-layout.test.ts`

- [ ] **Step 1: 写布局失败测试**

测试必须验证：宽带矩形固定左侧且不参与终端数量计算；网络设备单排围绕纵向中轴；终端每排最多 5 张，第一排靠近中轴，第二排向外；设备不足不生成空槽位；11 台终端生成第三行而不是截断；布局宽度不超过逻辑画布。

```ts
const layout = createFixedTopologyLayout(modelWithTerminals(11, 3))
assert.equal(layout.wiredRows[0].length, 5)
assert.equal(layout.wiredRows[1].length, 5)
assert.equal(layout.wiredRows[2].length, 1)
assert.ok(layout.wiredRows[0][0].rect.y > layout.wiredRows[1][0].rect.y)
assert.ok(layout.wirelessRows[0][0].rect.y < layout.wirelessRows[1][0].rect.y)
assert.equal(layout.wiredRows.flat().filter((slot) => slot.terminal).length, 11)
```

- [ ] **Step 2: 运行定向测试并确认旧槽位实现失败**

运行：`npm --prefix internal/site run test -- src/modules/network-topology/fixed-canvas/fixed-topology-layout.test.ts`

预期：FAIL，因为旧实现只输出单行固定槽位并包含空槽位。

- [ ] **Step 3: 重写布局数据结构**

将 `FixedTopologyLayout` 改为：

```ts
export type FixedTerminalSlot = { index: number; rect: FixedRect; anchor: FixedPoint; terminal: FixedTerminal }
export type FixedTopologyLayout = {
  canvas: { width: number; height: number }
  internet: FixedRect
  internetAnchor: FixedPoint
  networkDevices: FixedNetworkLayout[]
  wiredRows: FixedTerminalSlot[][]
  wirelessRows: FixedTerminalSlot[][]
}
```

使用稳定卡片尺寸常量（桌面逻辑画布约 1600 x 760）：网络设备宽度按端口数量限制在 `300..420`，终端卡片固定 `220 x 104`，每行最多 5 张；行内位置以画布中轴为中心向左右展开，首行 y 坐标最靠近网络设备。空数据返回空数组，不创建占位槽。缩放仍由 `calculateFixedTopologyViewport` 负责，窄窗口只缩放画布而不产生横向滚动。

- [ ] **Step 4: 运行布局测试并提交**

运行：`npm --prefix internal/site run test -- src/modules/network-topology/fixed-canvas/fixed-topology-layout.test.ts`

预期：全部 PASS；提交：`git add internal/site/src/modules/network-topology/fixed-canvas/fixed-topology-layout.ts internal/site/src/modules/network-topology/fixed-canvas/fixed-topology-layout.test.ts && git commit -m "refactor: layout topology around vertical axis"`。

### Task 3: 收口只读卡片和结构化关系条

**Files:**
- Modify: `internal/site/src/modules/network-topology/fixed-canvas/fixed-topology-canvas.tsx`
- Modify: `internal/site/src/components/routes/network.tsx`
- Modify: `internal/site/src/components/routes/home-network-topology.tsx`（确认首页总览使用只读回调）
- Delete: `internal/site/src/modules/network-topology/fixed-canvas/topology-wan-dialog.tsx`（若只读拓扑不再需要 WAN 编辑入口）
- Modify: `internal/site/src/modules/network-topology/workspace-data.test.ts`

- [ ] **Step 1: 写渲染合同测试**

在 `workspace-data.test.ts` 和组件源合同中锁定：不再出现 `TopologyInspectorSheet`、`TopologyWanDialog`、独立编辑按钮、`pulse-fixed-connections`、SVG 路径或旧分区标题；必须存在 `.pulse-fixed-relation-bar`、`.pulse-fixed-network-card`、`.pulse-fixed-terminal-card` 和资产详情导航回调。

- [ ] **Step 2: 运行合同测试确认旧渲染失败**

运行：`npm --prefix internal/site run test -- src/modules/network-topology/workspace-data.test.ts`

预期：FAIL，失败点应命中旧连线/编辑器/分区标题残留。

- [ ] **Step 3: 重写画布渲染为三层 DOM**

`FixedTopologyCanvas` 只保留 `graph`、`overview`、`fitWindow` 和 `onNodeOpen`；移除 `readOnly`、`onEdgeOpen`、`onEditWan`。渲染结构固定为：

```tsx
<div className="pulse-fixed-topology-canvas">
  <InternetCard node={model.internet?.node} />
  <div className="pulse-fixed-network-row">{layout.networkDevices.map(renderNetworkDevice)}</div>
  <div className="pulse-fixed-terminal-area is-wired">{layout.wiredRows.flat().map(renderTerminal)}</div>
  <div className="pulse-fixed-terminal-area is-wireless">{layout.wirelessRows.flat().map(renderTerminal)}</div>
</div>
```

每张卡片是只读按钮，点击调用 `onNodeOpen(node)`；关系条固定显示三列文本“角色 / 上游设备 / 端口或频段”，没有关系时显示 `关系待确认`。删除 SVG、连接线命中层、空槽位、添加卡片、编辑入口和“有线终端 / 网络设备 / 无线终端”标题。

- [ ] **Step 4: 收口路由状态**

`network.tsx` 不再维护 inspector、WAN dialog、edge click 或拓扑编辑状态；仅将资产卡片点击转换为既有资产详情 URL。首页总览继续传入 `overview` 和 `fitWindow`，不得恢复编辑入口。

- [ ] **Step 5: 运行合同测试并提交**

运行：`npm --prefix internal/site run test -- src/modules/network-topology/workspace-data.test.ts`

预期：全部 PASS；提交：`git add internal/site/src/modules/network-topology/fixed-canvas/fixed-topology-canvas.tsx internal/site/src/components/routes/network.tsx internal/site/src/components/routes/home-network-topology.tsx internal/site/src/modules/network-topology/workspace-data.test.ts internal/site/src/modules/network-topology/fixed-canvas/topology-wan-dialog.tsx && git commit -m "refactor: render topology as readonly asset projection"`。

### Task 4: 建立关系条与接口的双端高亮

**Files:**
- Modify: `internal/site/src/modules/network-topology/fixed-canvas/fixed-topology-canvas.tsx`
- Create: `internal/site/src/modules/network-topology/fixed-canvas/fixed-topology-highlight.ts`
- Create: `internal/site/src/modules/network-topology/fixed-canvas/fixed-topology-highlight.test.ts`
- Modify: `internal/site/src/modules/network-topology/workspace-data.test.ts`

- [ ] **Step 1: 写高亮纯函数失败测试**

测试 `buildHighlightState(activeRelationIds, relationIndex)`：空状态返回空集合；悬停关系条返回同一关系两端资产和端口入口；同一端口共享多条关系时返回所有关系卡片；清除后所有集合为空。

- [ ] **Step 2: 实现可测试的高亮索引**

`fixed-topology-highlight.ts` 暴露：

```ts
export type FixedHighlightState = {
  relationIds: Set<string>
  assetIds: Set<string>
  interfaceIds: Set<string>
}
export function buildHighlightState(activeRelationIds: Iterable<string>, relationIndex: Map<string, string[]>): FixedHighlightState
```

组件维护单个 `activeRelationIds` 状态；关系条、端口节点和卡片关系入口使用 `onMouseEnter` / `onFocus` 设置关系 ID，`onMouseLeave` / `onBlur` 清空。class 只增加 `is-highlighted`，不改变几何尺寸；共享关系显示 `多条关系 · N` 并同步高亮所有相关卡片。

- [ ] **Step 3: 补齐可访问性和端点绑定**

每条关系条和接口节点必须是可聚焦元素，设置可读 `aria-label`，内容包含角色、上游设备、端口/频段；资产卡片保持按钮语义，禁止使用颜色作为唯一状态表达。

- [ ] **Step 4: 运行高亮与全量定向测试并提交**

运行：`npm --prefix internal/site run test -- src/modules/network-topology/fixed-canvas/fixed-topology-highlight.test.ts src/modules/network-topology/workspace-data.test.ts`

预期：全部 PASS；提交：`git add internal/site/src/modules/network-topology/fixed-canvas/fixed-topology-highlight.ts internal/site/src/modules/network-topology/fixed-canvas/fixed-topology-highlight.test.ts internal/site/src/modules/network-topology/fixed-canvas/fixed-topology-canvas.tsx internal/site/src/modules/network-topology/workspace-data.test.ts && git commit -m "feat: highlight topology relations from both endpoints"`。

### Task 5: 重做 CSS 响应式和无滚动条视觉

**Files:**
- Modify: `internal/site/src/index.css`
- Modify: `internal/site/src/modules/network-topology/workspace-data.test.ts`

- [ ] **Step 1: 写 CSS 合同测试**

锁定：画布不含旧灰色中轴线、侧边端口文字、连线样式和编辑按钮；新增网络设备横向中轴、上下终端行、关系条高亮、固定卡片尺寸、窄窗口缩放规则；`html:has(.pulse-network-topology-page)` 和页面容器不能产生 `scrollWidth > clientWidth`。

- [ ] **Step 2: 实现三层紧凑视觉**

清理 `.pulse-fixed-connections`、`.pulse-fixed-link`、`.pulse-fixed-link-hit`、旧 row label/note 和编辑按钮规则；新增 `.pulse-fixed-network-row`、`.pulse-fixed-terminal-area`、`.pulse-fixed-relation-bar`、`.is-highlighted` 样式。端口节点继续半嵌入卡片边缘但不再承担连线视觉；使用现有边框、阴影、状态色，不添加大面积渐变或装饰性背景。

- [ ] **Step 3: 验证桌面、窄窗口和动态长名称**

运行：`npm --prefix internal/site run test -- src/modules/network-topology/workspace-data.test.ts`；然后启动本地 Vite `npm --prefix internal/site run dev -- --host 0.0.0.0`，用 Playwright 在 `2494x1194`、`1727x1272`、`1280x800` 截图并断言 `document.documentElement.scrollWidth <= clientWidth`、画布可见且关系条文本不重叠。

- [ ] **Step 4: 提交样式变更**

提交：`git add internal/site/src/index.css internal/site/src/modules/network-topology/workspace-data.test.ts && git commit -m "style: make asset topology compact and responsive"`。

### Task 6: 端到端验收、版本说明和发布前门禁

**Files:**
- Modify: `internal/site/e2e/network-topology.spec.ts`
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`
- Verify: `docs/dev-startup-checklist.md`、`docs/local-dev-runbook.md`

- [ ] **Step 1: 重写 Playwright 验收场景**

删除旧的 WAN 设置、关系编辑、SVG 路径点击断言，新增：家庭网/科技网切换；宽带固定左侧；网络设备单排；上下终端按 IP 升序、每排最多 5；无空槽位/添加入口/分区标题/连接线；点击卡片进入资产详情；关系条悬停和键盘聚焦使对应端口与两端卡片同时高亮；宽窗口和窄窗口均无横向滚动；加载失败和无关系状态有明确文案。

- [ ] **Step 2: 运行完整前端验证**

依次运行：

```powershell
npm --prefix internal/site run test -- src/modules/network-topology
npm --prefix internal/site run typecheck
npm --prefix internal/site run build
npm --prefix internal/site run test:e2e -- e2e/network-topology.spec.ts
```

预期：全部 PASS；若 E2E 需要登录，先检查 `PULSE_E2E_EMAIL` / `PULSE_E2E_PASSWORD`，缺少用户必须完成的登录或 MFA 时立即暂停并指导白老板操作。

- [ ] **Step 3: 更新版本口径**

在 `docs/release-notes-next.md` 增加下一版本条目，明确 Web / Hub、移动端 / Android、Agent / 部署、文档 / 规则四个小节；在 `release-history.ts` 增加相同显式版本号和同样口径，说明拓扑改为资产驱动只读投影、移除编辑/连线、增加 IP 排序和关系双端高亮。不要回填已发布版本 `1.0.5`。

- [ ] **Step 4: 做干净工作树前的最终检查并提交**

运行：`git diff --check`、`git status --short`，确认只包含本方案相关改动和用户已有改动；提交：`git add internal/site docs/release-notes-next.md && git commit -m "feat: rebuild topology from asset center"`。本计划不包含 GitHub 发布、Harbor 镜像或 FlyNAS 部署；这些要在本地验收通过后另开发布步骤，并遵守统一版本号和备份同步规则。

---

## 自审结果

- 设计文档中的固定宽带、网络设备单排、上下终端五列两排、超过 10 台保护性追加、默认 IP 排序、结构化关系条、关系高亮、只读交互、异常状态和响应式要求均已分别覆盖在 Task 1-6。
- 计划没有保留自由画布坐标、拓扑编辑或临时连线的实现入口；连接信息全部来自资产关系投影。
- 所有测试步骤给出具体文件、命令和预期结果；没有使用 TBD、TODO 或“另行处理”占位。
