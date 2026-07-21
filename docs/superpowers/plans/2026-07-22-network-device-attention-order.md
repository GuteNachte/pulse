# 网络设备详情关注优先排序实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让所有网络设备详情先展示接入、转发、无线和端口等核心网络卡片，再展示静态硬件规格。

**Architecture:** 在资产参数组完成现有类型专属拆分后执行一次稳定排序。网络分组与交换机网口状态使用现有 ID 自动识别，通用硬件分类按网络设备专属优先级排序；非网络设备直接返回原数组。

**Tech Stack:** TypeScript、React 19、Node 原生断言测试、Vite

---

### Task 1: 锁定网络设备参数卡优先级

**Files:**
- Modify: `internal/site/src/modules/asset-center/asset-detail-parameter-groups.test.ts`
- Modify: `internal/site/src/modules/asset-center/asset-detail-parameter-groups.ts`

- [ ] **Step 1: 写入失败测试**

将光猫期望顺序改为网络核心分类在前：

```ts
assertDeepEqual(
	buildAssetParameterGroups(ont).map((group) => group.title),
	["接入角色", "光纤接入", "路由与管理", "无线网络", "有线网络", "主板与平台", "电源"]
)
```

给交换机补充 `dimensions_mm`、`power_w` 等静态规格，并断言“网络功能”“网口状态”位于静态分类之前。保留现有手机和主机顺序断言，作为非网络设备不受影响的回归保护。

- [ ] **Step 2: 运行定向测试并确认按预期失败**

Run:

```powershell
node --experimental-strip-types internal/site/src/modules/asset-center/asset-detail-parameter-groups.test.ts
```

Expected: FAIL，光猫实际仍以“电源”“主板与平台”开头。

- [ ] **Step 3: 实现稳定的关注优先排序**

在 `buildAssetParameterGroups` 构造所有卡片后调用纯排序函数。规则如下：

```ts
const networkDeviceSecondaryGroupOrder = [
	"asset-parameter-platform",
	"asset-parameter-io",
	"asset-parameter-power",
	"asset-parameter-appearance",
] as const
```

类型专属网络分组 ID（包括 `network-fallback`）和 `switch-port-status` 排在最前，并保持现有相对顺序；随后按上述静态分类顺序排列，其他分组稳定地排在最后。`NETWORK_ASSET_TYPES` 之外的资产直接返回原顺序。

- [ ] **Step 4: 重跑定向测试并确认通过**

Run:

```powershell
node --experimental-strip-types internal/site/src/modules/asset-center/asset-detail-parameter-groups.test.ts
```

Expected: PASS，无异常输出。

- [ ] **Step 5: 提交排序实现**

```powershell
git add -- internal/site/src/modules/asset-center/asset-detail-parameter-groups.ts internal/site/src/modules/asset-center/asset-detail-parameter-groups.test.ts
git commit -m "feat: prioritize network device detail groups"
```

### Task 2: 同步用户可见版本记录

**Files:**
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`

- [ ] **Step 1: 追加 Web / Hub 更新说明**

在两个版本记录入口写明：网络设备详情采用固定关注优先级，核心网络能力置顶，静态规格后移；字段、编辑顺序和其他资产不变。

- [ ] **Step 2: 运行版本记录契约测试**

Run:

```powershell
node --experimental-strip-types internal/site/src/components/routes/settings/release-history-ont.test.ts
```

Expected: PASS，输出 `ont release history contract passed`。

- [ ] **Step 3: 提交版本记录**

```powershell
git add -- docs/release-notes-next.md internal/site/src/components/routes/settings/release-history.ts
git commit -m "docs: record network detail priority order"
```

### Task 3: 完整验证与页面验收

**Files:**
- Verify: `internal/site/src/modules/asset-center/asset-detail-parameter-groups.ts`
- Verify: `internal/site/src/modules/asset-center/asset-detail-parameter-groups.test.ts`

- [ ] **Step 1: 运行资产中心测试**

```powershell
npm.cmd --prefix internal/site run test:asset-center
```

Expected: Exit code 0。

- [ ] **Step 2: 运行类型检查与生产构建**

```powershell
npm.cmd --prefix internal/site run typecheck
npm.cmd --prefix internal/site run build
```

Expected: 两条命令均 Exit code 0。

- [ ] **Step 3: 浏览器回看光猫和交换机详情**

检查 `/assets/0avxx79kdk4v2ui` 的首张参数卡为“接入角色”，网络卡连续显示；检查 `/assets/yk7dkjdriwdaage` 的“网络功能”和“网口状态”排在外观、电源等静态规格之前。确认卡片内容、两列布局和设备档案没有变化。

- [ ] **Step 4: 检查工作区**

```powershell
git status --short
git diff --check
```

Expected: 工作区干净，且无空白错误。
