# Asset Local Media Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete local asset-media library inside the asset editor, including persistent originals and render versions, cover/gallery placement, local-storage settings and consistent detail rendering.

**Architecture:** Keep media bytes in a Hub-managed local directory while PocketBase collections persist the media graph. A focused Hub media service owns validated paths, atomic object writes, rendering and collection mutations; a focused React media workspace consumes typed API data and never derives final display crops itself.

**Tech Stack:** Go 1.26, PocketBase 0.39 collections/API, `github.com/disintegration/imaging`, `golang.org/x/image`, React 19, Radix UI, Tailwind, Node TypeScript contract tests.

---

### Task 1: Add media-library schema and module inventory

**Files:**
- Create: `internal/migrations/zzzzz_asset_media_library.go`
- Modify: `internal/hub/collections.go`
- Modify: `internal/hub/collections_test.go`
- Modify: `internal/site/src/modules/asset-center/manifest.ts`
- Test: `internal/hub/collections_test.go`

- [ ] **Step 1: Write failing collection assertions**

```go
for _, name := range []string{"asset_media", "asset_media_versions", "asset_media_placements"} {
    collection, err := hub.FindCollectionByNameOrId(name)
    require.NoError(t, err)
    assert.NotNil(t, collection.Fields.GetByName("asset"))
}
```

- [ ] **Step 2: Run the focused test and verify it fails because collections are absent**

Run: `go test ./internal/hub -run TestAssetMediaCollections -count=1`

- [ ] **Step 3: Add migration and collection access rules**

Create three authenticated, owner-scoped collections. `asset_media` owns `asset`, source metadata, hash, state and active version; `asset_media_versions` owns version graph and object metadata; `asset_media_placements` owns role, visibility and sort order. Add the three names to the asset-center manifest and apply the same owner relation rules used by `asset_visuals`.

- [ ] **Step 4: Re-run focused and package tests**

Run: `go test ./internal/hub -run 'TestAssetMediaCollections|TestApiCollectionsAuthRules' -count=1`

### Task 2: Build the safe local object-store service

**Files:**
- Create: `internal/hub/asset_media_store.go`
- Create: `internal/hub/asset_media_store_test.go`
- Modify: `internal/hub/hub.go`

- [ ] **Step 1: Write failing store tests**

```go
func TestAssetMediaStoreRejectsEscapingObjectKey(t *testing.T) {
    store := newAssetMediaStore(t.TempDir())
    _, err := store.pathFor("../secret.jpg")
    require.ErrorContains(t, err, "对象键无效")
}

func TestAssetMediaStoreAtomicallyWritesAndReadsObject(t *testing.T) {
    store := newAssetMediaStore(t.TempDir())
    key, err := store.write("temporary/a.jpg", []byte("image"))
    require.NoError(t, err)
    assert.Equal(t, []byte("image"), mustRead(t, store, key))
}
```

- [ ] **Step 2: Verify RED**

Run: `go test ./internal/hub -run TestAssetMediaStore -count=1`

- [ ] **Step 3: Implement path validation, temporary writes, atomic move, read, stat and cleanup**

Resolve the root from a `system_settings` record with a Hub-data-directory default. Accept only absolute configured paths, prevent traversal after `filepath.Clean`, create the four documented object prefixes, write to a temporary sibling then `Rename`, and return internal object keys rather than OS paths.

- [ ] **Step 4: Verify GREEN**

Run: `go test ./internal/hub -run TestAssetMediaStore -count=1`

### Task 3: Render real media versions and thumbnails

**Files:**
- Create: `internal/hub/asset_media_render.go`
- Create: `internal/hub/asset_media_render_test.go`
- Modify: `internal/hub/asset_visual_image_processing_test.go`

- [ ] **Step 1: Write failing recipe and rendering tests**

```go
func TestRenderAssetMediaVersionProducesCroppedJpegAndThreeThumbnails(t *testing.T) {
    result, err := renderAssetMediaVersion(testPNG(t, 1600, 900), assetMediaRecipe{
        Crop: assetMediaCrop{X: .25, Y: 0, Width: .5, Height: 1}, Aspect: "detail",
    })
    require.NoError(t, err)
    assert.Equal(t, image.Point{X: 1200, Y: 675}, result.Image.Bounds().Size())
    assert.Len(t, result.Thumbnails, 3)
}
```

- [ ] **Step 2: Verify RED**

Run: `go test ./internal/hub -run TestRenderAssetMediaVersion -count=1`

- [ ] **Step 3: Implement normalized recipe validation and deterministic render output**

Decode permitted images with pixel limits, strip metadata by re-encoding, clamp crop/rotation/flip/background values, render to JPEG, and generate `sm`, `md`, `lg` thumbnails. Use the same `cover`, `detail`, and `gallery` ratio definitions exported as front-end constants.

- [ ] **Step 4: Verify GREEN**

Run: `go test ./internal/hub -run 'TestRenderAssetMediaVersion|TestNormalizeAssetVisualImage' -count=1`

### Task 4: Add media library API and lifecycle rules

**Files:**
- Create: `internal/hub/asset_media.go`
- Create: `internal/hub/asset_media_test.go`
- Modify: `internal/hub/api.go`
- Modify: `internal/hub/asset_visuals.go`

- [ ] **Step 1: Write failing HTTP lifecycle tests**

```go
func TestAssetMediaAdoptRenderAndPlaceCover(t *testing.T) {
    media := createCandidateMedia(t, fixture, asset)
    postJSON(t, fixture, "/api/pulse/assets/"+asset.Id+"/media/"+media.Id+"/adopt", `{}`)
    version := postJSON(t, fixture, "/api/pulse/assets/"+asset.Id+"/media/"+media.Id+"/versions", renderBody)
    postJSON(t, fixture, "/api/pulse/assets/"+asset.Id+"/media/"+media.Id+"/placements", `{"version":"`+version.ID+`","role":"cover"}`)
    assertSingleVisibleCover(t, fixture, asset.Id, version.ID)
}
```

- [ ] **Step 2: Verify RED**

Run: `go test ./internal/hub -run TestAssetMediaAdoptRenderAndPlaceCover -count=1`

- [ ] **Step 3: Implement authenticated media endpoints**

Implement list, upload, URL import, adopt, render-version, placement, reorder, restore, archive/delete, object reads and store-status/cleanup APIs. Reuse existing picture-search results by converting selected legacy `asset_visuals` frames into candidate media records; never delete legacy visuals. Enforce one visible cover transactionally and reject deletion of placed versions.

- [ ] **Step 4: Add error, duplicate and authorization test cases**

Test invalid media type/size, same-asset SHA-256 duplicate, readonly user, missing object, hidden gallery item, cover replacement and deletion with a placement reference.

- [ ] **Step 5: Verify GREEN**

Run: `go test ./internal/hub -run TestAssetMedia -count=1`

### Task 5: Add local media-store settings to the asset-center settings surface

**Files:**
- Create: `internal/site/src/modules/asset-center/asset-media-store-settings.ts`
- Create: `internal/site/src/modules/asset-center/asset-media-store-settings.test.ts`
- Modify: `internal/site/src/components/routes/settings/ai.tsx`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`
- Modify: `docs/release-notes-next.md`

- [ ] **Step 1: Write a failing front-end settings contract test**

```ts
assertDeepEqual(normalizeAssetMediaStoreStatus({ root: "C:\\media", writable: true, objects: 8 }), {
  root: "C:\\media", writable: true, objects: 8, bytes: 0, configured: true,
})
```

- [ ] **Step 2: Verify RED**

Run: `npm run test:asset-center -- --runInBand`

- [ ] **Step 3: Implement directory settings card**

Add a compact asset-center card to the existing AI/settings route: root directory input, restore default, test/save, health summary, usage/object count and buttons to clear only temporary/unreferenced derivative objects. Show the explicit rule that changing the root only affects future writes and never claims a migration.

- [ ] **Step 4: Verify GREEN and typecheck**

Run: `npm run test:asset-center && npm run typecheck`

### Task 6: Replace the editor visual panel with the media workspace

**Files:**
- Create: `internal/site/src/modules/asset-center/asset-media.ts`
- Create: `internal/site/src/modules/asset-center/asset-media.test.ts`
- Create: `internal/site/src/modules/asset-center/components/asset-media-workspace.tsx`
- Create: `internal/site/src/modules/asset-center/components/asset-media-editor.tsx`
- Create: `internal/site/src/modules/asset-center/components/asset-media-library-grid.tsx`
- Modify: `internal/site/src/modules/asset-center/components/asset-edit-visual-panel.tsx`
- Modify: `internal/site/src/modules/asset-center/components/asset-edit-workbench.tsx`
- Modify: `internal/site/src/modules/asset-center/asset-detail-page.tsx`

- [ ] **Step 1: Write failing media view-model tests**

```ts
assertEqual(selectAssetMediaCover(placements), "render-cover")
assertDeepEqual(selectVisibleAssetMediaGallery(placements), ["render-1", "render-2"])
assertEqual(canDeleteAssetMediaVersion(version, placements), false)
```

- [ ] **Step 2: Verify RED**

Run: `node --experimental-strip-types src/modules/asset-center/asset-media.test.ts`

- [ ] **Step 3: Implement workspace state and UI**

Replace the old candidate-only panel with the single embedded workspace: action row, full selected-image preview, edit mode, candidate strip, library grid and version history. Reuse Radix Dialog/AlertDialog/DropdownMenu controls; use three-column candidate/library thumbnails; keep all image actions in the existing editor dialog. Implement Canvas preview from the normalized render recipe, with save calling the Hub render API.

- [ ] **Step 4: Wire list, upload, import, adopt, cover, gallery, archive, delete and history actions**

Refresh only the media workspace after a mutation. Disable destructive actions while requests run and surface Hub errors in the existing toast path. The old crop endpoint must no longer be the primary save path.

- [ ] **Step 5: Verify GREEN, lint and typecheck**

Run: `npm run test:asset-center && npm run check && npm run typecheck`

### Task 7: Render cover and gallery from media placements on the asset detail page

**Files:**
- Create: `internal/site/src/modules/asset-center/components/asset-media-showcase.tsx`
- Modify: `internal/site/src/modules/asset-center/components/asset-showcase-workspace.tsx`
- Modify: `internal/site/src/modules/asset-center/asset-detail-data.ts`
- Modify: `internal/site/src/modules/asset-center/asset-visual-query.ts`
- Test: `internal/site/src/modules/asset-center/asset-detail-data.test.ts`

- [ ] **Step 1: Write failing detail-load test**

```ts
assertEqual(state.media.cover?.versionId, "cover-render")
assertDeepEqual(state.media.gallery.map((item) => item.versionId), ["gallery-1", "gallery-2"])
```

- [ ] **Step 2: Verify RED**

Run: `node --experimental-strip-types src/modules/asset-center/asset-detail-data.test.ts`

- [ ] **Step 3: Load and render the placement model**

Load media records with the detail background data, display a real cover without artificial letterbox black bars, and show visible gallery images in stable placement order. Preserve legacy visual display only when the asset has no new media placement.

- [ ] **Step 4: Verify GREEN**

Run: `npm run test:asset-center && npm run typecheck`

### Task 8: End-to-end verification and release documentation

**Files:**
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`

- [ ] **Step 1: Run backend regression suite**

Run: `go test ./internal/hub/...`

- [ ] **Step 2: Run web tests and production build**

Run: `npm run test && npm run check && npm run typecheck && npm run build`

- [ ] **Step 3: Run the local development services and browser workflow**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File supplemental/scripts/run-hub-dev.ps1 -Restart`

Verify: `/assets/:id` → 编辑资产 → 获取图片/上传 → 加入库 → 编辑并保存新版本 → 设封面/加入图库 → 保存关闭 → 详情页显示相同结果；再验证设置页目录检查和安全清理。

- [ ] **Step 4: Update release records**

Append the implemented local-media-library behavior to the 1.0.6 development notes and add equivalent Web / Hub wording to the About release history.
