# 交换机网口状态详情 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在交换机资产详情的参数区逐口展示真实接口状态和关系中的连接设备。

**Architecture:** 新建纯展示构建器，把 `asset_interfaces` 与 `asset_relations` 归并为一个 `AssetParameterGroup`；`AssetShowcaseWorkspace` 只负责把该组插入现有参数组，不新增数据源或专用页面组件。展示继续复用现有参数卡、目录、响应式双列和统一高度规则。

**Tech Stack:** React 19、TypeScript、现有 Asset Center 参数卡、PocketBase 记录类型、Node `--experimental-strip-types` 合约测试。

---

### Task 1：定义交换机网口状态构建器

**Files:**
- Create: `internal/site/src/modules/asset-center/asset-switch-port-status.ts`
- Create: `internal/site/src/modules/asset-center/asset-switch-port-status.test.ts`
- Modify: `internal/site/package.json`

- [ ] **Step 1：先写失败测试**

覆盖数字自然排序、启用 / 接线 / 角色 / 协商速率、关系对端名称、未关联和非交换机不生成参数组。

- [ ] **Step 2：运行测试确认失败**

```powershell
cd C:\Users\Nacht\Documents\PL\internal\site
node --experimental-strip-types src/modules/asset-center/asset-switch-port-status.test.ts
```

预期：因构建器尚不存在或断言未满足而失败。

- [ ] **Step 3：实现最小构建器**

导出：

```ts
export function buildSwitchPortStatusGroup(
	asset: AssetRecord,
	interfaces: AssetInterfaceRecord[],
	assets: AssetRecord[],
	relations: AssetRelationRecord[]
): AssetParameterGroup | undefined
```

只读取当前交换机的真实接口，按电口在前、光口在后且组内名称自然排序；关系对端优先读取资产目录，其次读取 PocketBase `expand`。

- [ ] **Step 4：运行测试确认通过**

```powershell
node --experimental-strip-types src/modules/asset-center/asset-switch-port-status.test.ts
npm run test:asset-center
```

预期：测试通过且原资产中心测试无回归。

### Task 2：接入资产详情参数区

**Files:**
- Modify: `internal/site/src/modules/asset-center/components/asset-showcase-workspace.tsx`
- Modify: `internal/site/src/modules/asset-center/components/asset-showcase-layout.test.ts`

- [ ] **Step 1：先补集成失败测试**

断言 `AssetShowcaseWorkspace` 调用 `buildSwitchPortStatusGroup`，并把网口组插入现有参数组。

- [ ] **Step 2：运行测试确认失败**

```powershell
node --experimental-strip-types src/modules/asset-center/components/asset-showcase-layout.test.ts
```

- [ ] **Step 3：最小接入**

在现有 `useMemo` 中先构建严格类型参数组，再为交换机构建网口状态组，并插入“硬件与端口能力”之后；无真实接口时保持原数组。

- [ ] **Step 4：运行测试确认通过**

```powershell
npm run test:asset-center
npm run typecheck
```

### Task 3：同步版本记录并做端到端验收

**Files:**
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`

- [ ] **Step 1：同步 1.0.6 Web / Hub 记录**

说明交换机详情新增逐口状态卡，数据来自真实接口和关系，不新增重复主数据。

- [ ] **Step 2：浏览器验收**

打开 `http://localhost:5173/assets/yk7dkjdriwdaage`，检查 1～9 号端口、连接设备、未接线 / 未启用、参数目录、桌面双列、手机单列、横向溢出和控制台。

- [ ] **Step 3：完整验证**

```powershell
cd C:\Users\Nacht\Documents\PL\internal\site
npm test
npm run typecheck
cd C:\Users\Nacht\Documents\PL
git diff --check
```

预期：全部退出码为 0。
