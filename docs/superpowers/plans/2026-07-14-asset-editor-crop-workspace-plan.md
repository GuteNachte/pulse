# Asset Editor Crop Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make asset editing permissive and compact, with a persistent manual crop workflow for the selected asset image.

**Architecture:** Store normalized crop coordinates on the selected primary visual frame. The Hub owns validation and persistence through a scoped asset visual endpoint; the Web client derives a CSS crop from the same frame metadata in both the detail showcase and the editor. The editor keeps primary image actions separate from dense candidate browsing and moves image-search prerequisites to a non-blocking advisory response.

**Tech Stack:** Go, PocketBase, React 19, TypeScript, Tailwind CSS, existing `asset_visuals` JSON frames.

---

### Task 1: Persist a selected-frame crop

**Files:**
- Modify: `internal/hub/api.go`
- Modify: `internal/hub/asset_visuals.go`
- Modify: `internal/hub/asset_enrichment_test.go`

- [ ] **Step 1: Write the failing Hub test**

Add a test beside the existing visual-selection API test that creates a primary `asset_visuals` record with one frame, then POSTs to `/api/pulse/assets/{asset}/visuals/{visual}/crop` with:

```go
strings.NewReader(`{"crop":{"x":0.1,"y":0.2,"width":0.7,"height":0.6}}`)
```

Assert status `200`, the record remains primary, and `recordJSONArrayField(t, visual, "frames")[0]["crop"]` is a map with all four normalized values. Repeat with `{"crop":null}` and assert the frame has no `crop` key. Add a boundary request such as width `0` and assert `400`.

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
go test -tags=testing -count=1 ./internal/hub -run TestAssetVisualCrop
```

Expected: failure because the crop route and handler do not exist.

- [ ] **Step 3: Add the route and handler**

Register:

```go
apiAuth.POST("/assets/{id}/visuals/{visualId}/crop", h.updateAssetVisualCrop).BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
```

In `updateAssetVisualCrop`, resolve the asset with `findUserAssetRecord`, resolve the visual, require matching user, asset, `primary=true`, and exactly one frame. Decode an optional crop `{x,y,width,height}`. For a non-null crop require every value in `(0,1]` except `x` and `y` may be `0`, require `x + width <= 1` and `y + height <= 1`, then set the frame `crop` map. For null, delete `crop`. Save the visual, create an `asset_visual_crop` operation audit entry, and return `{visual: visual, status: "ready"}`.

- [ ] **Step 4: Run the Hub crop test**

Run the same command. Expected: `ok gutenacht.site/pulse/internal/hub`.

### Task 2: Share crop geometry in Web rendering

**Files:**
- Modify: `internal/site/src/types.d.ts`
- Modify: `internal/site/src/modules/asset-center/asset-visual-query.ts`
- Modify: `internal/site/src/modules/asset-center/asset-visual-query.test.ts`
- Modify: `internal/site/src/modules/asset-center/components/asset-visual-card.tsx`

- [ ] **Step 1: Write the failing query test**

Extend the frame fixture with:

```ts
crop: { x: 0.1, y: 0.2, width: 0.7, height: 0.6 }
```

Assert that a new `getAssetVisualCropStyle(frame)` returns a `clipPath` of `inset(20% 20% 20% 10%)` and an object position derived from the crop centre. Assert malformed values, values outside `0..1`, or a missing crop return `undefined`.

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --experimental-strip-types src/modules/asset-center/asset-visual-query.test.ts
```

Expected: failure because crop typing and the query helper do not exist.

- [ ] **Step 3: Implement crop typing and rendering helper**

Add an optional `crop?: { x: number; y: number; width: number; height: number }` to the visual-frame type. Implement a pure validator/helper in `asset-visual-query.ts` that only returns CSS geometry for a valid normalized rectangle. Use it in `asset-visual-card.tsx` to place the image inside an overflow-hidden stage without changing the source URL or file.

- [ ] **Step 4: Run the query test**

Run the same command. Expected: all asset visual assertions pass.

### Task 3: Add the primary-image crop editor

**Files:**
- Create: `internal/site/src/modules/asset-center/components/asset-visual-crop-editor.tsx`
- Modify: `internal/site/src/modules/asset-center/components/asset-edit-visual-panel.tsx`
- Modify: `internal/site/src/modules/asset-center/components/asset-edit-workbench.tsx`
- Modify: `internal/site/src/modules/asset-center/asset-detail-page.tsx`

- [ ] **Step 1: Write a failing crop-state test**

Create `asset-visual-crop-editor.test.ts` for exported pure helpers. Assert `clampCropRect` keeps a drag result inside normalized bounds, preserves a minimum `0.1` width and height, and `resetCropRect()` returns `undefined`.

- [ ] **Step 2: Run the crop-state test to verify it fails**

Run:

```powershell
node --experimental-strip-types src/modules/asset-center/asset-visual-crop-editor.test.ts
```

Expected: failure because the crop editor helpers do not exist.

- [ ] **Step 3: Implement the editor and persistence callback**

Create a focused component that receives `frame`, `readOnly`, `saving`, `onSave`, and renders a `16:9` canvas. Use pointer events to drag the crop rectangle and resize from the lower-right handle; apply a dark overlay outside the crop box. Provide icon controls with tooltips for edit, reset, cancel, and save. Do not alter the image file.

Pass `onSaveVisualCrop(visualId, crop)` from `AssetDetailPage`; it POSTs to the crop endpoint, reloads secondary detail data with `preserveContent: true`, and shows a success or failure toast. Pass that callback through `AssetEditWorkbench` into `AssetEditVisualPanel`.

- [ ] **Step 4: Run crop-state and asset-center tests**

Run:

```powershell
node --experimental-strip-types src/modules/asset-center/asset-visual-crop-editor.test.ts
npm run test:asset-center
```

Expected: crop helper and existing asset-center tests pass.

### Task 4: Compact the editor and make image prerequisites advisory

**Files:**
- Modify: `internal/site/src/modules/asset-center/components/asset-edit-workbench.tsx`
- Modify: `internal/site/src/modules/asset-center/components/asset-edit-profile-fields.tsx`
- Modify: `internal/site/src/modules/asset-center/components/asset-edit-action-bar.tsx`
- Modify: `internal/site/src/modules/asset-center/components/asset-edit-visual-panel.tsx`
- Modify: `internal/site/src/modules/asset-center/asset-detail-page.tsx`
- Modify: `internal/site/src/modules/asset-center/asset-profile-validation.test.ts`

- [ ] **Step 1: Write the failing validation test**

Add a test for a partial asset profile that has an empty name, vendor, model, location, and address fields. Assert the save-path validator returns no blocking errors while the new image-search advisor reports the missing values needed for the selected asset type.

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --experimental-strip-types src/modules/asset-center/asset-profile-validation.test.ts
```

Expected: failure because save validation currently returns required-field errors.

- [ ] **Step 3: Implement the compact advisory layout**

Remove required markers and native `required` attributes from edit controls. Skip `validateAssetProfileForm` as a save blocker, while preserving type-safe field normalization. Add a pure image-search advisor that returns concise recommendations; show it when “获取图片” is clicked before calling the collect endpoint, with a user-controlled “仍然获取” action.

Use smaller section padding, `gap-3`, and a wider left grid with identity fields first. Keep the right side dedicated to the large crop-capable primary preview. Change candidate cards to a dense `grid-cols-3 sm:grid-cols-4 xl:grid-cols-5` layout with fixed thumbnail aspect ratios and truncated provenance, while retaining accessible selected state and click targets.

- [ ] **Step 4: Run validation and full frontend checks**

Run:

```powershell
node --experimental-strip-types src/modules/asset-center/asset-profile-validation.test.ts
npm run check
npm run typecheck
npm run test:asset-center
```

Expected: all commands exit `0`.

### Task 5: Update user-facing version records and perform visual QA

**Files:**
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`

- [ ] **Step 1: Document the completed behavior**

Add one `Web / Hub` entry stating that the asset editor now permits incomplete drafts, presents image-search data suggestions on demand, persists non-destructive crop coordinates for a selected primary image, and shows a denser candidate grid.

- [ ] **Step 2: Browser validation**

At `http://127.0.0.1:5173/assets/hvpbl3jmc8w02qp`, verify desktop crop edit/save/reset and candidate selection. Override to a mobile viewport and verify the form and candidate grid remain single-column or multi-column without horizontal overflow. Reload after saving crop and confirm the same crop appears in the detail showcase.

- [ ] **Step 3: Final checks**

Run:

```powershell
git diff --check
go test -tags=testing -count=1 ./internal/hub -run TestAssetVisualCrop
```

Expected: no diff whitespace errors and the crop endpoint regression passes.
