# Asset Profile Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first compatible asset Profile registry, make it the source of truth for user-creatable asset categories, and preserve legacy virtual-machine records without offering new virtual-machine creation.

**Architecture:** Add a pure `asset-profiles.ts` domain module that maps every persisted `AssetType` to a category, label, summary keys, creation rule and required-field additions. Keep `asset-schema.ts` as the form-field catalog, but derive the type picker options and labels from the new registry. Existing records retain their type and legacy `vm` records keep their read and edit compatibility.

**Tech Stack:** TypeScript, React 19, Node direct contract tests, Biome, TypeScript compiler, Vite.

---

## File structure

- Create: `internal/site/src/modules/asset-center/asset-profiles.ts` — type taxonomy, profile metadata and query helpers.
- Create: `internal/site/src/modules/asset-center/asset-profiles.test.ts` — direct Node contract tests for creation visibility, grouping, labels and required additions.
- Modify: `internal/site/src/modules/asset-center/asset-schema.ts` — derive selectable options and labels from profiles while retaining form field definitions.
- Modify: `internal/site/src/modules/asset-center/asset-edit-profile-sections.ts` — obtain type-specific required additions from the registry.
- Modify: `internal/site/package.json` — add the direct contract test to `test:asset-center`.
- Modify: `docs/release-notes-next.md` and `internal/site/src/components/routes/settings/release-history.ts` — record user-visible classification changes.

### Task 1: Lock the profile registry contract

**Files:**
- Create: `internal/site/src/modules/asset-center/asset-profiles.test.ts`
- Modify: `internal/site/package.json`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict"
import {
  getAssetProfile,
  getCreatableAssetTypeOptions,
  getProfileRequiredFieldKeys,
} from "./asset-profiles.ts"

assert.equal(getAssetProfile("camera")?.group, "安防与办公")
assert.equal(getAssetProfile("ups")?.group, "电源设备")
assert.equal(getAssetProfile("internet")?.group, "资源与服务")
assert.equal(getAssetProfile("vm")?.creatable, false)
assert.equal(getCreatableAssetTypeOptions().some((option) => option.value === "vm"), false)
assert.deepEqual(getProfileRequiredFieldKeys("phone"), ["memory_gb", "storage_gb"])
```

- [ ] **Step 2: Run the direct test to verify it fails**

Run: `node --experimental-strip-types src/modules/asset-center/asset-profiles.test.ts`

Expected: fail because `asset-profiles.ts` does not exist.

- [ ] **Step 3: Add the test to the asset-center suite**

Add `node --experimental-strip-types src/modules/asset-center/asset-profiles.test.ts` to `test:asset-center` in `internal/site/package.json`.

### Task 2: Implement the pure profile registry

**Files:**
- Create: `internal/site/src/modules/asset-center/asset-profiles.ts`
- Test: `internal/site/src/modules/asset-center/asset-profiles.test.ts`

- [ ] **Step 1: Define the pure public contract**

```ts
export type AssetClass =
  | "compute"
  | "network"
  | "mobile"
  | "entertainment"
  | "security_office"
  | "power"
  | "smart_home"
  | "resource"
  | "other"

export type AssetProfileDefinition = {
  type: AssetType
  label: string
  group: string
  assetClass: AssetClass
  description: string
  creatable: boolean
  requiredFieldKeys: readonly string[]
}
```

- [ ] **Step 2: Register every persisted type exactly once**

Use the approved group names: `计算设备`、`网络设备`、`移动设备`、`娱乐与显示`、`安防与办公`、`电源设备`、`智能家居`、`资源与服务`、`其他`。 Register `vm` as `creatable: false`; preserve its label as `虚拟机` for historical records.

- [ ] **Step 3: Implement query helpers**

```ts
export function getAssetProfile(type: AssetType) {
  return assetProfilesByType.get(type)
}

export function getCreatableAssetTypeOptions() {
  return assetProfiles.filter((profile) => profile.creatable)
}

export function getProfileRequiredFieldKeys(type: AssetType) {
  return getAssetProfile(type)?.requiredFieldKeys ?? []
}
```

- [ ] **Step 4: Run the direct test to verify it passes**

Run: `node --experimental-strip-types src/modules/asset-center/asset-profiles.test.ts`

Expected: `asset profile contract passed`.

### Task 3: Route type options and required additions through profiles

**Files:**
- Modify: `internal/site/src/modules/asset-center/asset-schema.ts`
- Modify: `internal/site/src/modules/asset-center/asset-edit-profile-sections.ts`
- Test: `internal/site/src/modules/asset-center/asset-profiles.test.ts`

- [ ] **Step 1: Replace the duplicated selectable options table**

```ts
export const ASSET_TYPE_OPTIONS = getCreatableAssetTypeOptions().map((profile) => ({
  value: profile.type,
  label: profile.label,
  group: profile.group,
  description: profile.description,
}))
```

- [ ] **Step 2: Preserve legacy label compatibility**

```ts
export function getAssetTypeLabel(type: AssetType) {
  return getAssetProfile(type)?.label ?? type
}
```

- [ ] **Step 3: Keep current required-field behavior while extracting the phone variant rule**

```ts
for (const key of getProfileRequiredFieldKeys(type)) {
  keys.add(key)
}
```

The existing common requirements remain unchanged in this phase; only profile-specific additions leave the component-level conditional.

- [ ] **Step 4: Run targeted tests and type checks**

Run:

```text
node --experimental-strip-types src/modules/asset-center/asset-profiles.test.ts
npm run typecheck
```

Expected: both commands exit 0.

### Task 4: Record the user-visible taxonomy change and verify the UI

**Files:**
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`

- [ ] **Step 1: Record the first-stage change**

Add a Web / Hub entry stating that the asset type picker now uses the Profile registry, shows corrected category names, and excludes new virtual-machine creation while retaining legacy record compatibility.

- [ ] **Step 2: Run full static and build verification**

Run:

```text
npm run check
npm run typecheck
npm test
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 3: Browser verification**

Open `http://localhost:5173/assets`, choose `添加资产`, and verify that:

1. `计算设备`、`安防与办公`、`电源设备` and `资源与服务` appear as type groups.
2. 摄像头 and 打印机 appear under `安防与办公`.
3. UPS appears under `电源设备`.
4. 互联网接入 and 网页端点 appear under `资源与服务`.
5. 虚拟机 is absent from the picker.
6. Existing `/assets/:id` pages continue to render.

- [ ] **Step 4: Commit the phase**

```text
git add internal/site/src/modules/asset-center/asset-profiles.ts internal/site/src/modules/asset-center/asset-profiles.test.ts internal/site/src/modules/asset-center/asset-schema.ts internal/site/src/modules/asset-center/asset-edit-profile-sections.ts internal/site/package.json docs/release-notes-next.md internal/site/src/components/routes/settings/release-history.ts
git commit -m "feat: 建立资产设备Profile分类"
```
