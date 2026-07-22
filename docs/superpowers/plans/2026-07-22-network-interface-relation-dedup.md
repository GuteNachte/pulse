# Network Interface Relation Deduplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 网络设备存在真实网口状态时不再重复展示接入关系表，没有网口时仍保留关系回退。

**Architecture:** 保留 `NetworkDeviceDetailModel.relations` 作为网口对端识别和其他消费者的数据来源，仅在 `AssetNetworkDetailTable` 内根据 `model.interfaces.length` 决定是否呈现关系。标题副文案和统计徽标与实际呈现内容保持一致。

**Tech Stack:** React 19、TypeScript、shadcn Table/Badge、Node contract tests、Vite。

---

### Task 1: 锁定关系去重显示规则

**Files:**
- Modify: `internal/site/src/modules/asset-center/components/asset-network-detail-table.test.ts`
- Test: `internal/site/src/modules/asset-center/components/asset-network-detail-table.test.ts`

- [ ] **Step 1: 写入失败契约**

在组件源码契约中要求关系表只在没有接口时出现，并要求新的动态副标题存在：

```ts
assert.equal(source.includes("const showRelations = model.interfaces.length === 0 && model.relations.length > 0"), true)
assert.equal(source.includes('showRelations ? <NetworkRelationTable rows={model.relations} /> : null'), true)
assert.equal(source.includes("设备能力与真实接口状态"), true)
assert.equal(source.includes("设备能力与接入关系"), true)
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```powershell
node --experimental-strip-types src/modules/asset-center/components/asset-network-detail-table.test.ts
```

Expected: FAIL，原因是组件尚未包含 `showRelations` 条件和新副标题。

### Task 2: 实现条件展示与文案同步

**Files:**
- Modify: `internal/site/src/modules/asset-center/components/asset-network-detail-table.tsx`
- Test: `internal/site/src/modules/asset-center/components/asset-network-detail-table.test.ts`

- [ ] **Step 1: 添加呈现策略**

在组件顶部计算：

```ts
const showRelations = model.interfaces.length === 0 && model.relations.length > 0
const subtitle = model.interfaces.length > 0 ? "设备能力与真实接口状态" : "设备能力与接入关系"
```

关系数量徽标与关系表统一改用 `showRelations`：

```tsx
{showRelations ? <Badge variant="secondary">{model.relations.length} 条关系</Badge> : null}
{showRelations ? <NetworkRelationTable rows={model.relations} /> : null}
```

- [ ] **Step 2: 运行定向测试并确认通过**

Run:

```powershell
node --experimental-strip-types src/modules/asset-center/components/asset-network-detail-table.test.ts
node --experimental-strip-types src/modules/asset-center/asset-network-detail-model.test.ts
```

Expected: 两个 contract 均 PASS，模型关系数据仍参与网口对端识别。

### Task 3: 同步版本记录并完成验收

**Files:**
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`

- [ ] **Step 1: 更新下一版本记录**

在 Web / Hub 开头增加同义记录：网络设备有真实网口时由网口状态统一承载连接、方向和对端摘要，不重复展示接入关系；无网口时保留关系回退，关系数据、编辑和拓扑不变。

- [ ] **Step 2: 运行完整前端验证**

Run:

```powershell
npm.cmd run test
npm.cmd run typecheck
npm.cmd run build
npx.cmd --no-install biome check src/modules/asset-center/components/asset-network-detail-table.tsx src/modules/asset-center/components/asset-network-detail-table.test.ts
```

Expected: 全部退出码为 `0`。

- [ ] **Step 3: 浏览器验收**

验证交换机和光猫详情存在“网口状态”且不存在“接入关系”，网口对端仍显示真实设备；验证宽带详情仍保留独立接入关系。检查桌面无横向溢出、无错误遮罩、无新增控制台警告或错误。

- [ ] **Step 4: 提交实现**

```powershell
git add internal/site/src/modules/asset-center/components/asset-network-detail-table.tsx internal/site/src/modules/asset-center/components/asset-network-detail-table.test.ts docs/release-notes-next.md internal/site/src/components/routes/settings/release-history.ts docs/superpowers/plans/2026-07-22-network-interface-relation-dedup.md
git commit -m "refactor: deduplicate network detail relations"
```
