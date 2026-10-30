# Compact Asset Cards And Switch Port Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让资产详情参数卡按每一行内容自然收缩，并把交换机的端口能力与逐口记录从“网络”拆到独立“网口状态”卡。

**Architecture:** 继续让 14 类参数注册表负责稳定字段归类，但在详情组装层把交换机网络分类中的“端口能力”行提取出来，与 `asset_interfaces` 生成的逐口行合并为专属展示组。布局层移除跨行统一高度的 `auto-rows-fr`，保留 CSS Grid 默认的同一行拉伸行为。

**Tech Stack:** React 19、TypeScript、Tailwind CSS、Node 合约测试、Biome、Vite、Codex in-app Browser。

---

## 文件职责

- `internal/site/src/modules/asset-center/asset-detail-parameter-groups.ts`：组装资产详情参数组，并负责交换机“网络 / 网口状态”的展示边界。
- `internal/site/src/modules/asset-center/asset-detail-parameter-groups.test.ts`：验证交换机两张卡的标题、字段和顺序。
- `internal/site/src/modules/asset-center/components/asset-parameter-columns.tsx`：控制参数卡桌面双列和按行高度。
- `internal/site/src/modules/asset-center/components/asset-showcase-layout.test.ts`：锁定同一行等高、不同行自然高度的布局合约。
- `docs/release-notes-next.md`、`internal/site/src/components/routes/settings/release-history.ts`：同步 1.0.6 用户可见更新记录。

### Task 1：先锁定交换机分组与卡片高度合约

**Files:**
- Modify: `internal/site/src/modules/asset-center/asset-detail-parameter-groups.test.ts`
- Modify: `internal/site/src/modules/asset-center/components/asset-showcase-layout.test.ts`

- [ ] **Step 1：把交换机测试改为要求两张卡**

将交换机断言改为：

```ts
assertDeepEqual(switchGroups.map((group) => group.title), ["网络", "网口状态"])
assertDeepEqual(
	switchGroups.find((group) => group.title === "网络")?.rows.map((row) => row.section),
	["网络功能"]
)
assertDeepEqual(
	switchGroups
		.find((group) => group.title === "网口状态")
		?.rows.map((row) => row.section)
		.filter((section, index, sections) => sections.indexOf(section) === index),
	["端口能力", "端口明细"]
)
```

- [ ] **Step 2：把布局测试改为按行自然高度**

将旧的 `lg:auto-rows-fr` 断言替换为：

```ts
assert.equal(
	columns.includes('className="grid items-stretch gap-2.5 p-3 lg:grid-cols-2"'),
	true,
	"desktop parameter cards must keep equal heights only within each row"
)
assert.equal(columns.includes("lg:auto-rows-fr"), false, "different parameter rows must keep natural heights")
```

- [ ] **Step 3：运行测试确认先失败**

Run:

```powershell
cd C:\Users\Nacht\Documents\PL\internal\site
node --experimental-strip-types src/modules/asset-center/asset-detail-parameter-groups.test.ts
node --experimental-strip-types src/modules/asset-center/components/asset-showcase-layout.test.ts
```

Expected: 第一条测试仍只得到一张“网络”卡；第二条测试仍检测到 `lg:auto-rows-fr`。

### Task 2：实现交换机“网络 / 网口状态”分组

**Files:**
- Modify: `internal/site/src/modules/asset-center/asset-detail-parameter-groups.ts`
- Modify: `internal/site/src/modules/asset-center/asset-switch-port-status.ts`
- Modify: `internal/site/src/modules/asset-center/asset-switch-port-status.test.ts`

- [ ] **Step 1：把逐口行的内部小标题改为“端口明细”**

在 `buildSwitchPortRow` 返回值中使用：

```ts
return {
	label: port.name || `端口 ${index + 1}`,
	value: segments.join(" · "),
	section: "端口明细",
}
```

同步更新 `asset-switch-port-status.test.ts` 中五条期望记录的 `section`。

- [ ] **Step 2：提取交换机端口能力行**

在 `buildAssetParameterGroups` 完成字段收集后，从网络分类提取 `section === "端口能力"` 的行：

```ts
const switchPortCapabilityRows =
	asset.type === "switch" ? (rowsByCategory.get("network") ?? []).filter((row) => row.section === "端口能力") : []
if (asset.type === "switch") {
	rowsByCategory.set(
		"network",
		(rowsByCategory.get("network") ?? []).filter((row) => row.section !== "端口能力")
	)
}
```

- [ ] **Step 3：建立专属“网口状态”组**

把接口记录与端口能力合并：

```ts
const switchPortRows = [
	...switchPortCapabilityRows,
	...buildSwitchPortStatusRows(asset, context.interfaces ?? [], context.assets ?? [], context.relations ?? []),
]
const switchPortGroup: AssetParameterGroup | undefined =
	asset.type === "switch" && switchPortRows.length > 0
		? {
				id: "switch-port-status",
				title: "网口状态",
				summary: `${buildSwitchPortStatusRows(asset, context.interfaces ?? [], context.assets ?? [], context.relations ?? []).length} 个网口`,
				icon: createElement(PlugIcon, { className: "size-4" }),
				rows: switchPortRows,
			}
		: undefined
```

实现时只调用一次 `buildSwitchPortStatusRows` 并复用结果；在标准“网络”组之后插入 `switchPortGroup`。没有端口能力和接口记录时不渲染空卡。

- [ ] **Step 4：更新交换机详情排序**

交换机网络卡只需：

```ts
const sectionOrder = assetType === "switch" ? ["网络功能"] : []
```

“网口状态”组内部保留收集顺序：端口能力在前、端口明细在后。

- [ ] **Step 5：运行领域测试确认通过**

Run:

```powershell
cd C:\Users\Nacht\Documents\PL\internal\site
node --experimental-strip-types src/modules/asset-center/asset-switch-port-status.test.ts
node --experimental-strip-types src/modules/asset-center/asset-detail-parameter-groups.test.ts
```

Expected: 两项输出 `passed`，网络卡不含端口能力或逐口状态，网口状态卡同时包含端口能力和端口明细。

- [ ] **Step 6：提交分组改动**

```powershell
git add internal/site/src/modules/asset-center/asset-detail-parameter-groups.ts internal/site/src/modules/asset-center/asset-detail-parameter-groups.test.ts internal/site/src/modules/asset-center/asset-switch-port-status.ts internal/site/src/modules/asset-center/asset-switch-port-status.test.ts
git commit -m "refactor: separate switch port status details"
```

### Task 3：让参数卡只在同一行等高

**Files:**
- Modify: `internal/site/src/modules/asset-center/components/asset-parameter-columns.tsx`
- Modify: `internal/site/src/modules/asset-center/components/asset-showcase-layout.test.ts`

- [ ] **Step 1：移除跨行统一高度**

将参数卡网格改为：

```tsx
<CardContent className="grid items-stretch gap-2.5 p-3 lg:grid-cols-2">
```

CSS Grid 默认会让同一行的卡片拉伸至该行最高卡片，但不会把其他行同步到全页最高高度。

- [ ] **Step 2：运行布局和资产中心测试**

Run:

```powershell
cd C:\Users\Nacht\Documents\PL\internal\site
node --experimental-strip-types src/modules/asset-center/components/asset-showcase-layout.test.ts
npm run test:asset-center
npm run typecheck
```

Expected: 布局合约、资产中心测试和 TypeScript 均通过。

- [ ] **Step 3：提交布局改动**

```powershell
git add internal/site/src/modules/asset-center/components/asset-parameter-columns.tsx internal/site/src/modules/asset-center/components/asset-showcase-layout.test.ts
git commit -m "fix: keep asset parameter rows compact"
```

### Task 4：同步版本记录并完成浏览器验收

**Files:**
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`

- [ ] **Step 1：同步 1.0.6 更新说明**

两处加入相同口径：资产详情参数卡改为同一行等高、不同行自然收缩；交换机将网络能力与网口状态分开，逐口状态独立显示。

- [ ] **Step 2：运行最终静态验证**

Run:

```powershell
cd C:\Users\Nacht\Documents\PL\internal\site
npm test
npm run typecheck
npx biome check src/modules/asset-center/asset-detail-parameter-groups.ts src/modules/asset-center/asset-detail-parameter-groups.test.ts src/modules/asset-center/asset-switch-port-status.ts src/modules/asset-center/asset-switch-port-status.test.ts src/modules/asset-center/components/asset-parameter-columns.tsx src/modules/asset-center/components/asset-showcase-layout.test.ts src/components/routes/settings/release-history.ts
npm run build
cd C:\Users\Nacht\Documents\PL
git diff --check
```

Expected: 全部退出码为 0。

- [ ] **Step 3：桌面端浏览器验收**

Target flow: `http://localhost:5173/assets/yk7dkjdriwdaage` -> 页面加载 -> 第一行卡片紧凑，网络与网口状态独立显示。

检查：

- 页面标题与资产身份正确，无框架错误遮罩。
- “外观与尺寸”和“电源”同一行等高，实际高度接近内容，不再与长卡片等高。
- 参数目录和正文各只有一项“网络”和一项“网口状态”。
- 网络卡包含 VLAN、交换容量等能力，不包含“电口 1”。
- 网口状态卡包含端口能力、电口 1–8 和 10G SFP+ 光口。
- 新页面 console 没有 error / warning。

- [ ] **Step 4：移动端浏览器验收**

在 `390 × 844` 检查卡片单列自然高度、无横向溢出，参数目录和卡片标题不重叠。

- [ ] **Step 5：提交版本记录**

```powershell
git add docs/release-notes-next.md internal/site/src/components/routes/settings/release-history.ts
git commit -m "docs: record compact asset detail cards"
```

## 自检

- 规格覆盖：卡片高度、交换机两张卡、专属命名、接口编辑不变、桌面与移动验收均有任务。
- 类型一致：继续使用 `AssetParameterGroup` 与 `AssetParameterRow`，不新增数据库字段或注册表分类。
- 无占位符：计划内没有待定实现；每个修改步骤都给出目标代码或明确文本口径。
