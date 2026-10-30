# 网络设备网络详情表 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将网络设备详情中的网络能力、真实接口状态和上下联关系改为紧凑、响应式、语义明确的三张表。

**Architecture:** 在 `asset-center` 内新增无 JSX 的 `NetworkDeviceDetailModel` 构造器，从现有参数字段目录、`asset_interfaces` 和 `asset_relations` 生成结构化展示行；新增专用 React 组件负责表格、状态标签、筛选和移动端布局；详情工作区只负责拆分普通参数卡与网络详情面板。数据库、Hub API、编辑页和完整度保持不变。

**Tech Stack:** React 19、TypeScript、Vite、Tailwind CSS 4、shadcn/ui `Table` / `Badge`、Node `assert` 契约测试。

---

### Task 1: 固定结构化展示模型契约

**Files:**
- Create: `internal/site/src/modules/asset-center/asset-network-detail-model.test.ts`
- Create: `internal/site/src/modules/asset-center/asset-network-detail-model.ts`
- Modify: `internal/site/package.json`

- [ ] 编写失败测试，断言非网络设备不生成网络详情模型。
- [ ] 编写失败测试，断言光猫能力按接入、光纤、路由、无线、有线顺序生成，设备控制不进入网络能力表。
- [ ] 编写失败测试，断言交换机端口从原始接口生成独立列，不再生成拼接长字符串。
- [ ] 编写失败测试，断言“未启用”“未连接”“未记录”使用不同状态值。
- [ ] 编写失败测试，断言真实关系按上联、下联、待确认排序，并保留本机接口、对端接口、链路类型和待建档状态。
- [ ] 运行定向测试并确认因模型尚不存在而失败。
- [ ] 实现最小展示模型、类型与稳定排序，使定向测试通过。
- [ ] 将定向测试加入 `test:asset-center`。
- [ ] 重跑定向测试和既有接口 / 关系测试。

### Task 2: 固定网络详情组件契约

**Files:**
- Create: `internal/site/src/modules/asset-center/components/asset-network-detail-table.test.ts`
- Create: `internal/site/src/modules/asset-center/components/asset-network-detail-table.tsx`

- [ ] 编写失败契约测试，断言组件使用项目现有 `Table` 与 `Badge`。
- [ ] 编写失败契约测试，断言桌面端包含三张语义表和正确列名。
- [ ] 编写失败契约测试，断言网口超过 12 行才显示状态筛选。
- [ ] 编写失败契约测试，断言手机端使用独立紧凑记录布局且隐藏桌面七列表格。
- [ ] 编写失败契约测试，断言组件不创建内部滚动区或分页。
- [ ] 运行测试并确认因组件尚不存在而失败。
- [ ] 实现网络能力表、网口状态表、接入关系表和状态标签。
- [ ] 实现超过 12 个接口时的“全部 / 已连接 / 未连接 / 未启用”筛选。
- [ ] 重跑组件契约测试并保持通过。

### Task 3: 接入资产详情工作区

**Files:**
- Modify: `internal/site/src/modules/asset-center/components/asset-showcase-workspace.tsx`
- Modify: `internal/site/src/modules/asset-center/components/asset-showcase-layout.test.ts`
- Modify: `internal/site/src/modules/asset-center/asset-detail-parameter-groups.test.ts`

- [ ] 先更新失败契约，断言网络设备把网络组从普通双列参数卡中移出。
- [ ] 先更新失败契约，断言网络详情面板位于右侧普通硬件参数卡之前。
- [ ] 运行契约测试并确认失败原因正确。
- [ ] 在工作区构造 `NetworkDeviceDetailModel`，渲染专用网络详情组件。
- [ ] 过滤已由网络详情面板接管的网络能力与交换机网口组，设备控制和其他硬件组继续留在普通参数卡。
- [ ] 非网络设备和宽带线路保持现有布局与关系卡行为。
- [ ] 重跑详情分组、布局、接口和关系测试。

### Task 4: 同步版本说明

**Files:**
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`

- [ ] 在 `1.0.6` Web / Hub 开发记录中追加网络详情三表的用户可见变化。
- [ ] 在关于页 `1.0.6` 的 Web / Hub 小节同步同一口径。
- [ ] 确认未改动端不虚构功能变化，版本号保持 `1.0.6`。

### Task 5: 完整验证与浏览器验收

**Files:**
- Verify only

- [ ] 运行新增模型和组件定向测试。
- [ ] 运行 `npm.cmd --prefix internal/site run test:asset-center`。
- [ ] 运行 `npm.cmd --prefix internal/site run typecheck`。
- [ ] 运行 `npm.cmd --prefix internal/site run build`。
- [ ] 检查 `git diff --check` 和工作区状态。
- [ ] 使用当前源码预览检查光猫 `/assets/0avxx79kdk4v2ui` 桌面与手机布局。
- [ ] 检查交换机 `/assets/yk7dkjdriwdaage` 的端口列、上下联排序和状态标签。
- [ ] 检查页面无横向溢出、无内部滚动、无控制台 warning / error。
- [ ] 按设计文档逐项复核非目标未被误改。
