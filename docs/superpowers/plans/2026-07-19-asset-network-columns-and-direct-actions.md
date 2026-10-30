# Asset Network Columns And Direct Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在资产列表展示真实的网络接入方式和全部网卡速率，并在资产详情与编辑工作台提供多网卡管理，同时把常用档案操作直接放到标题栏、将更多按钮固定在最右侧。

**Architecture:** 继续以 `asset_interfaces` 作为唯一网卡事实来源。新增纯函数负责接口分组、接入方式和速率展示；资产列表一次性并行加载接口数据，详情页负责 CRUD，列表与编辑工作台复用展示组件和现有表单。危险删除操作继续留在更多菜单中。

**Tech Stack:** React 19、TypeScript、Vite、PocketBase、Tailwind CSS、Radix/shadcn 现有组件、Lucide 图标、Node `assert` 契约测试、Playwright。

---

## File map

- Create `internal/site/src/modules/asset-center/asset-interface-display.ts`: 多网卡分组、接入方式、速率格式化和服务型资产判断。
- Create `internal/site/src/modules/asset-center/asset-interface-display.test.ts`: 覆盖多网卡、接入/主接口标识、空态和服务型资产。
- Create `internal/site/src/modules/asset-center/components/asset-interface-manager.tsx`: 复用的网卡列表与新增、编辑、删除入口。
- Create `internal/site/src/modules/asset-center/components/asset-interface-manager.test.ts`: 约束管理组件文案、状态和操作入口。
- Modify `internal/site/src/components/routes/assets.tsx`: 并行加载接口、按资产分组并传入资产行。
- Modify `internal/site/src/modules/asset-center/asset-list-layout.ts`: 将单列拆为两个网络列并调整桌面网格。
- Modify `internal/site/src/modules/asset-center/asset-list-layout.test.ts`: 锁定新表头和网格列数。
- Modify `internal/site/src/modules/asset-center/components/asset-card.tsx`: 渲染接入方式和全部网卡速率标识。
- Modify `internal/site/src/modules/asset-center/components/asset-detail-action-menu.tsx`: 外露四个常用操作，更多菜单仅保留删除。
- Create `internal/site/src/modules/asset-center/components/asset-detail-action-menu.test.ts`: 锁定操作顺序和更多菜单边界。
- Modify `internal/site/src/modules/asset-center/components/asset-edit-workbench.tsx`: 在接入信息区域嵌入网卡管理。
- Modify `internal/site/src/modules/asset-center/asset-detail-page.tsx`: 管理接口列表弹窗、编辑和删除，调整标题栏按钮顺序。
- Modify `internal/site/package.json`: 将新增契约测试加入 `test:asset-center`。
- Modify `docs/release-notes-next.md`: 记录用户可见行为。
- Modify `internal/site/src/components/routes/settings/release-history.ts`: 同步 About 的 Web / Hub 记录。

### Task 1: 多网卡展示领域函数

**Files:**
- Create: `internal/site/src/modules/asset-center/asset-interface-display.test.ts`
- Create: `internal/site/src/modules/asset-center/asset-interface-display.ts`
- Modify: `internal/site/package.json`

- [ ] **Step 1: Write the failing test**

测试真实数据结构，不测试 JSX：

```ts
import assert from "node:assert/strict"
import {
  buildAssetInterfaceDisplay,
  groupAssetInterfacesByAsset,
} from "./asset-interface-display.ts"

const interfaces = [
  { id: "lan", asset: "asset-1", name: "LAN 1", kind: "ethernet", speed_mbps: 2500, connected: true, primary: true },
  { id: "wifi", asset: "asset-1", name: "Wi-Fi", kind: "wifi", speed_mbps: 1200, connected: true, primary: false },
  { id: "spare", asset: "asset-1", name: "LAN 2", kind: "ethernet", speed_mbps: 1000, connected: false, primary: false },
]

const grouped = groupAssetInterfacesByAsset(interfaces as never)
assert.equal(grouped.get("asset-1")?.length, 3)

const display = buildAssetInterfaceDisplay({ type: "mini_pc", metadata: {} } as never, grouped.get("asset-1") ?? [])
assert.equal(display.accessLabel, "有线 + Wi-Fi")
assert.deepEqual(display.speedItems, [
  { id: "lan", label: "LAN 1", speedLabel: "2.5 Gbps", connected: true, primary: true },
  { id: "wifi", label: "Wi-Fi", speedLabel: "1.2 Gbps", connected: true, primary: false },
  { id: "spare", label: "LAN 2", speedLabel: "1 Gbps", connected: false, primary: false },
])

assert.equal(buildAssetInterfaceDisplay({ type: "mini_pc", metadata: {} } as never, []).accessLabel, "未设置")
assert.equal(
  buildAssetInterfaceDisplay({ type: "mini_pc", metadata: {} } as never, [], { loadFailed: true }).accessLabel,
  "接口读取失败"
)
assert.equal(buildAssetInterfaceDisplay({ type: "web_endpoint", metadata: {} } as never, []).speedMode, "not_applicable")
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd internal/site
node --experimental-strip-types src/modules/asset-center/asset-interface-display.test.ts
```

Expected: FAIL because `asset-interface-display.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

Implement focused exported types and functions:

```ts
import { getInternetBandwidthLabel } from "./asset-profile-summary"
import { getMetadataString } from "./asset-schema"
import type { AssetInterfaceRecord, AssetRecord } from "@/types"

export type AssetInterfaceSpeedItem = {
  id: string
  label: string
  speedLabel: string
  connected: boolean
  primary: boolean
}

export function groupAssetInterfacesByAsset(records: AssetInterfaceRecord[]) {
  const grouped = new Map<string, AssetInterfaceRecord[]>()
  for (const record of records) grouped.set(record.asset, [...(grouped.get(record.asset) ?? []), record])
  return grouped
}

export function buildAssetInterfaceDisplay(
  asset: AssetRecord,
  records: AssetInterfaceRecord[],
  options: { loadFailed?: boolean } = {}
) {
  if (asset.type === "internet" || asset.type === "web_endpoint") {
    return {
      accessLabel: getMetadataString(asset.metadata, "access_mode") || getInternetBandwidthLabel(asset) || "互联网接入",
      speedMode: "not_applicable" as const,
      speedItems: [],
    }
  }
  if (options.loadFailed) {
    return { accessLabel: "接口读取失败", speedMode: "error" as const, speedItems: [] }
  }
  const connectedKinds = [...new Set(records.filter((item) => item.connected).map((item) => formatInterfaceKind(item.kind)))]
  return {
    accessLabel: records.length === 0 ? "未设置" : connectedKinds.join(" + ") || "未接入",
    speedMode: "interfaces" as const,
    speedItems: records.map((item) => ({
      id: item.id,
      label: item.name || formatInterfaceKind(item.kind),
      speedLabel: item.speed_mbps ? formatInterfaceSpeed(item.speed_mbps) : "速率未填",
      connected: item.connected === true,
      primary: item.primary === true,
    })),
  }
}
```

`formatInterfaceKind` 覆盖现有 `ethernet/wifi/wan/lan/management/virtual/custom`；`formatInterfaceSpeed` 使用 Mbps、Gbps，避免 `2500 Mbps` 这种不紧凑显示。

- [ ] **Step 4: Run test to verify it passes**

Run the command from Step 2. Expected: PASS with a single success message.

- [ ] **Step 5: Register test and commit**

将测试路径追加到 `test:asset-center`，然后：

```powershell
git add internal/site/package.json internal/site/src/modules/asset-center/asset-interface-display.ts internal/site/src/modules/asset-center/asset-interface-display.test.ts
git commit -m "feat: add asset interface display model"
```

### Task 2: 资产列表双网络列

**Files:**
- Modify: `internal/site/src/modules/asset-center/asset-list-layout.test.ts`
- Modify: `internal/site/src/modules/asset-center/asset-list-layout.ts`
- Modify: `internal/site/src/components/routes/assets.tsx`
- Modify: `internal/site/src/modules/asset-center/components/asset-card.tsx`

- [ ] **Step 1: Update the layout contract test first**

```ts
assert.deepEqual(
  assetListColumns.map((column) => column.label),
  ["编号", "资产", "位置", "IPv4", "网络接入方式", "网卡速率", "状态 / 资料"]
)
assert.equal(assetListColumns.length, 7)
assert.match(assetListDesktopGridClassName, /minmax\(10rem/)
```

- [ ] **Step 2: Run the layout test and verify RED**

```powershell
cd internal/site
node --experimental-strip-types src/modules/asset-center/asset-list-layout.test.ts
```

Expected: FAIL because the current layout still has one “接入网络” column.

- [ ] **Step 3: Load interfaces once with the other list data**

In `assets.tsx`:

```ts
const [interfaces, setInterfaces] = useState<AssetInterfaceRecord[]>([])
const [interfaceLoadFailed, setInterfaceLoadFailed] = useState(false)

const interfaceRequest = pb.collection<AssetInterfaceRecord>("asset_interfaces").getFullList({
  fields: "id,asset,name,kind,speed_mbps,connected,primary",
  sort: "asset,-primary,name",
  requestKey: null,
}).then((records) => {
  setInterfaceLoadFailed(false)
  return records
}).catch((error) => {
  console.warn("load asset interfaces", error)
  setInterfaceLoadFailed(true)
  return []
})
const [records, interfaceRecords, locationRecords, maintenanceRecords, systemRecords, websiteRecords] = await Promise.all([
  pb.collection<AssetRecord>("assets").getFullList({ sort: "type,name", requestKey: null }),
  interfaceRequest,
  pb.collection<AssetLocationRecord>("asset_locations").getFullList({ sort: "sort_order,kind,name", requestKey: null }),
  pb.collection<AssetMaintenanceRecord>("asset_maintenance").getFullList({
    fields: "id,asset,kind,title,event_date,created",
    requestKey: null,
  }),
  pb.collection<SystemRecord>("systems").getFullList({
    fields: "id,asset,name,display_name",
    requestKey: null,
  }),
  pb.collection<WebsiteMonitorRecord>("website_monitors").getFullList({
    fields: "id,asset,name,last_status,enabled",
    requestKey: null,
  }),
])
setInterfaces(interfaceRecords)
```

Memoize `interfacesByAsset = groupAssetInterfacesByAsset(interfaces)` and pass both `interfaces={interfacesByAsset.get(asset.id) ?? []}` and `interfaceLoadFailed={interfaceLoadFailed}` to each `AssetListItem`. This preserves the asset list when only the interface request fails.

- [ ] **Step 4: Implement the seven-column layout and cell renderer**

Update `asset-list-layout.ts` to seven definitions and a seven-track desktop grid. Update `AssetListItemProps` with `interfaces: AssetInterfaceRecord[]` and `interfaceLoadFailed: boolean`, replace `getAssetNetworkLabel(asset)` with `buildAssetInterfaceDisplay(asset, interfaces, { loadFailed: interfaceLoadFailed })`, and render:

```tsx
<AssetListValue className="hidden md:block" value={network.accessLabel} />
<AssetInterfaceSpeedList className="hidden md:flex" display={network} />
```

The speed list uses wrapping compact chips; connected uses the existing success tone, primary uses a filled star with an accessible label. A service asset renders plain “无”.

- [ ] **Step 5: Run focused tests and typecheck**

```powershell
cd internal/site
node --experimental-strip-types src/modules/asset-center/asset-interface-display.test.ts
node --experimental-strip-types src/modules/asset-center/asset-list-layout.test.ts
npm run typecheck
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```powershell
git add internal/site/src/components/routes/assets.tsx internal/site/src/modules/asset-center/asset-list-layout.ts internal/site/src/modules/asset-center/asset-list-layout.test.ts internal/site/src/modules/asset-center/components/asset-card.tsx
git commit -m "feat: show asset access modes and interface speeds"
```

### Task 3: 可复用的接口管理区

**Files:**
- Create: `internal/site/src/modules/asset-center/components/asset-interface-manager.test.ts`
- Create: `internal/site/src/modules/asset-center/components/asset-interface-manager.tsx`
- Modify: `internal/site/package.json`

- [ ] **Step 1: Write the contract test**

The repository uses lightweight source contracts for UI composition. Read the component source and assert the required labels and callbacks:

```ts
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const source = readFileSync(new URL("./asset-interface-manager.tsx", import.meta.url), "utf8")
for (const text of ["添加网卡", "网络接入方式", "网卡速率", "当前接入", "主接口", "编辑", "删除"]) {
  assert.equal(source.includes(text), true, `missing ${text}`)
}
assert.equal(source.includes("onAdd"), true)
assert.equal(source.includes("onEdit"), true)
assert.equal(source.includes("onDelete"), true)
```

- [ ] **Step 2: Run test and verify RED**

```powershell
cd internal/site
node --experimental-strip-types src/modules/asset-center/components/asset-interface-manager.test.ts
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the manager component**

Create a presentational component with this stable API:

```ts
type AssetInterfaceManagerProps = {
  interfaces: AssetInterfaceRecord[]
  readOnly: boolean
  compact?: boolean
  onAdd: () => void
  onEdit: (record: AssetInterfaceRecord) => void
  onDelete: (record: AssetInterfaceRecord) => void
}
```

Render an empty state when no interfaces exist. Each row shows name, kind, speed, connected badge, primary star, IP/MAC summary, and equal-height edit/delete buttons. `compact` removes secondary IP/MAC details for the edit workbench. Use existing `Button`, `Badge`, Tooltip and semantic colors. Every manager action button must use `type="button"` so embedding the component inside the asset form never submits the profile accidentally.

- [ ] **Step 4: Run test and verify GREEN**

Run Step 2, then `npm run typecheck`. Expected: both exit 0.

- [ ] **Step 5: Register test and commit**

```powershell
git add internal/site/package.json internal/site/src/modules/asset-center/components/asset-interface-manager.tsx internal/site/src/modules/asset-center/components/asset-interface-manager.test.ts
git commit -m "feat: add reusable asset interface manager"
```

### Task 4: 接口 CRUD 接入详情与编辑工作台

**Files:**
- Modify: `internal/site/src/modules/asset-center/asset-detail-page.tsx`
- Modify: `internal/site/src/modules/asset-center/components/asset-edit-workbench.tsx`

- [ ] **Step 1: Extend the workbench props contract in a failing source test**

Add assertions to `asset-interface-manager.test.ts` that `asset-edit-workbench.tsx` contains `AssetInterfaceManager`, `onAddInterface`, `onEditInterface`, and `onDeleteInterface`. Run it and verify FAIL.

- [ ] **Step 2: Add callbacks and the manager to the workbench**

Extend `AssetEditWorkbenchProps`:

```ts
onAddInterface: () => void
onEditInterface: (record: AssetInterfaceRecord) => void
onDeleteInterface: (record: AssetInterfaceRecord) => void
```

In the “接入信息” section, render `AssetInterfaceManager` below the existing stable IP fields with `interfaces={state.interfaces}` and `compact`. Keep flat management IP fields for compatibility, but do not write interface list state into metadata.

- [ ] **Step 3: Add manager and delete behavior to the detail page**

Add `interfaceManagerOpen` state. `openInterfaceManager` opens the list; `openAddInterfaceDialog` and `openEditInterfaceDialog(record)` open the existing form. Implement:

```ts
async function deleteInterface(record: AssetInterfaceRecord) {
  if (readOnly) return
  const stateText = [record.connected ? "当前接入" : "", record.primary ? "主接口" : ""].filter(Boolean).join("、")
  if (!window.confirm(`确定删除网卡“${record.name}”吗？${stateText ? `它是${stateText}，删除后对应标识会消失。` : ""}`)) return
  try {
    await pb.collection("asset_interfaces").delete(record.id)
    await loadDetail({ preserveContent: true })
    toast({ title: "网卡已删除", description: record.name })
  } catch (error) {
    console.error("delete asset interface", error)
    toast({ title: "网卡删除失败", description: "请检查权限或稍后重试。", variant: "destructive" })
  }
}
```

The manager dialog contains `AssetInterfaceManager`. Wire the same callbacks into `AssetEditWorkbench`.

- [ ] **Step 4: Clarify interface form labels**

Change labels only, not stored values:

```tsx
<SelectField name="kind" label="网络接入方式" ... />
<SelectField name="connected" label="当前接入" ... />
<SelectField name="primary" label="主接口" ... />
<TextField name="speed_mbps" label="网卡速率 Mbps" ... />
```

Keep `clearOtherPrimaryInterfaces` so only one interface remains primary; allow multiple `connected=true`.

- [ ] **Step 5: Verify focused contracts and typecheck**

```powershell
cd internal/site
node --experimental-strip-types src/modules/asset-center/components/asset-interface-manager.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add internal/site/src/modules/asset-center/asset-detail-page.tsx internal/site/src/modules/asset-center/components/asset-edit-workbench.tsx internal/site/src/modules/asset-center/components/asset-interface-manager.test.ts
git commit -m "feat: manage asset interfaces from detail views"
```

### Task 5: 详情标题栏常用操作外露

**Files:**
- Create: `internal/site/src/modules/asset-center/components/asset-detail-action-menu.test.ts`
- Modify: `internal/site/src/modules/asset-center/components/asset-detail-action-menu.tsx`
- Modify: `internal/site/src/modules/asset-center/asset-detail-page.tsx`
- Modify: `internal/site/package.json`

- [ ] **Step 1: Write the failing source contract**

```ts
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const menu = readFileSync(new URL("./asset-detail-action-menu.tsx", import.meta.url), "utf8")
for (const label of ["接口", "关系", "维护", "附件"]) assert.equal(menu.includes(label), true)
assert.equal(menu.includes("更多"), true)
assert.equal(menu.indexOf("删除资产") > menu.indexOf("DropdownMenuContent"), true)

assert.equal(menu.indexOf("editAction") < menu.indexOf("DropdownMenuTrigger"), true, "编辑必须排列在更多之前")

const page = readFileSync(new URL("../asset-detail-page.tsx", import.meta.url), "utf8")
assert.equal(page.includes("editAction={"), true)
```

- [ ] **Step 2: Run test and verify RED**

```powershell
cd internal/site
node --experimental-strip-types src/modules/asset-center/components/asset-detail-action-menu.test.ts
```

Expected: FAIL because common actions are still dropdown items and order is reversed.

- [ ] **Step 3: Render direct buttons and keep only delete in dropdown**

`AssetDetailActionMenu` accepts `editAction: React.ReactNode` and returns a flex group in this exact order: four outline buttons, `editAction`, dropdown trigger. Common buttons use icon and `<span className="hidden xl:inline">`; every button has `aria-label` and Tooltip. The dropdown trigger label is “更多”，and its content contains only the existing destructive delete item.

- [ ] **Step 4: Move edit before action group**

In `asset-detail-page.tsx`, pass the existing edit button as `editAction={<Button ...>编辑</Button>}` and pass `onOpenInterface={openInterfaceManager}`. `AssetDetailActionMenu` itself guarantees the order common actions → edit → more. Use `flex-wrap justify-end` so narrow desktop widths do not overlap the asset title.

- [ ] **Step 5: Run contracts and typecheck**

```powershell
cd internal/site
node --experimental-strip-types src/modules/asset-center/components/asset-detail-action-menu.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Register test and commit**

```powershell
git add internal/site/package.json internal/site/src/modules/asset-center/components/asset-detail-action-menu.tsx internal/site/src/modules/asset-center/components/asset-detail-action-menu.test.ts internal/site/src/modules/asset-center/asset-detail-page.tsx
git commit -m "feat: expose common asset detail actions"
```

### Task 6: 版本记录与全量验证

**Files:**
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`

- [ ] **Step 1: Update user-visible release records**

Add matching Web / Hub bullets describing:

```text
- 资产详情标题栏直接显示接口、关系、维护和附件，编辑后为最右侧更多按钮；删除资产仍只在更多菜单中。
- 资产列表将接入网络拆为网络接入方式与网卡速率，读取全部资产接口并标识当前接入和主接口；详情与编辑工作台可新增、编辑和删除多张网卡。
```

- [ ] **Step 2: Run the full frontend verification**

```powershell
cd internal/site
npm test
npm run typecheck
npm run build
cd ../..
git diff --check
```

Expected: all commands exit 0; Lingui reports zero missing Chinese messages.

- [ ] **Step 3: Browser QA**

With the source preview at `http://localhost:5173`:

1. Open `/assets` at 2494×1194 and confirm seven headers align.
2. Verify an asset with Ethernet + Wi-Fi shows both access methods and all speed items.
3. Verify connected and primary markers can appear together.
4. Open an asset detail and confirm order: four common actions, edit, more.
5. Open interface management; add/edit/delete a non-production test interface and confirm list refresh.
6. Resize to 390×844 and verify buttons collapse without horizontal overflow.
7. Check console warnings/errors and framework overlays.

Save screenshots outside the repository.

- [ ] **Step 4: Commit documentation and any generated catalog update**

```powershell
git add docs/release-notes-next.md internal/site/src/components/routes/settings/release-history.ts internal/site/src/locales/zh-CN/zh-CN.po
git commit -m "docs: record asset network and action improvements"
```

- [ ] **Step 5: Final repository check**

```powershell
git status --short --branch
git log -6 --oneline
```

Expected: clean worktree on `main`; no feature branch is created.
