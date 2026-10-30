# Asset Media Edit Save Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `16:9` crop editor visibly accurate and save every crop as a new, independently stored and selectable gallery image without overwriting the source or earlier edits.

**Architecture:** Keep the feature inside `asset-center`. The frontend measures the portal-mounted crop stage through a stable callback ref and submits normalized crop coordinates. Hub detects MIME types from bytes, renders the crop to `1600×900`, creates a new media record with its own version and object key, and returns the new media so the workspace can select it. An idempotent compatibility repair reconstructs legacy render records that share the old empty-ID `/.jpg` path.

**Tech Stack:** React 19, TypeScript, Radix Dialog, ResizeObserver, PocketBase 0.39, Go image APIs, `disintegration/imaging`, local filesystem object storage, Node assertion tests, Go `testify`.

---

## File map

- Modify `internal/site/src/modules/asset-center/components/asset-media-crop.ts`: own crop overlay geometry.
- Modify `internal/site/src/modules/asset-center/components/asset-media-crop.test.ts`: cover square, landscape, portrait, zoom and overlay geometry.
- Modify `internal/site/src/modules/asset-center/components/asset-media-editor-dialog.tsx`: reliably observe the mounted crop stage and render a testable frame.
- Modify `internal/site/src/modules/asset-center/components/asset-media-preview-layout.test.ts`: protect the mounted-stage and new-media-selection behavior.
- Modify `internal/site/src/modules/asset-center/components/asset-media-workspace.tsx`: consume the new save response and select the created image.
- Create `internal/hub/asset_media_mime.go`: detect media MIME from bytes.
- Create `internal/hub/asset_media_mime_test.go`: cover JPEG, PNG, WebP and invalid input.
- Modify `internal/hub/asset_media_store.go`: delete incomplete objects during rollback.
- Modify `internal/hub/asset_media_store_test.go`: cover object removal.
- Create `internal/hub/asset_media_edit.go`: object-key helpers and independent edited-media creation.
- Create `internal/hub/asset_media_edit_test.go`: cover unique keys, independent IDs and placement-free output.
- Create `internal/hub/asset_media_repair.go`: rebuild legacy shared render objects.
- Create `internal/hub/asset_media_repair_test.go`: cover detection, reconstruction and idempotency.
- Modify `internal/hub/asset_media.go`: route save/import/read operations through the new helpers.
- Modify `internal/hub/asset_media_render_test.go`: prove crop pixels correspond to the recipe.
- Modify `docs/release-notes-next.md` and `internal/site/src/components/routes/settings/release-history.ts`: record user-visible behavior.

### Task 1: Make crop geometry deterministic and visible

**Files:**
- Modify: `internal/site/src/modules/asset-center/components/asset-media-crop.test.ts`
- Modify: `internal/site/src/modules/asset-center/components/asset-media-crop.ts`
- Modify: `internal/site/src/modules/asset-center/components/asset-media-editor-dialog.tsx`
- Test: `internal/site/src/modules/asset-center/components/asset-media-preview-layout.test.ts`

- [ ] **Step 1: Write failing crop overlay tests**

Add imports and assertions for a pure overlay rectangle helper:

```ts
assert.deepEqual(
  getAssetMediaCropOverlayRect(
    { width: 800, height: 450 },
    { width: 1080, height: 1080 },
    { x: 0, y: 0.21875, width: 1, height: 0.5625 }
  ),
  { left: 175, top: 98.4375, width: 450, height: 253.125 }
)
assert.equal(getAssetMediaCropOverlayRect(undefined, { width: 1080, height: 1080 }, landscape), undefined)
```

In `asset-media-preview-layout.test.ts`, require the editor to use a mounted node and expose the crop frame:

```ts
assert.match(editorSource, /ref=\{setStageNode\}/)
assert.match(editorSource, /data-testid="asset-media-crop-frame"/)
assert.match(editorSource, /\[open, stageNode\]/)
```

- [ ] **Step 2: Run tests and verify the red state**

Run:

```powershell
cd internal/site
node --experimental-strip-types src/modules/asset-center/components/asset-media-crop.test.ts
node --experimental-strip-types src/modules/asset-center/components/asset-media-preview-layout.test.ts
```

Expected: FAIL because `getAssetMediaCropOverlayRect`, `setStageNode`, and the crop-frame test ID do not exist.

- [ ] **Step 3: Implement the pure overlay helper**

Add to `asset-media-crop.ts`:

```ts
export function getAssetMediaCropOverlayRect(
  stageSize: { width: number; height: number } | undefined,
  imageSize: { width: number; height: number } | undefined,
  crop: AssetVisualCrop | undefined
) {
  if (!stageSize || !imageSize || !crop) return undefined
  const bounds = getAssetVisualMediaBounds(stageSize.width, stageSize.height, imageSize.width, imageSize.height)
  if (!bounds) return undefined
  return {
    left: bounds.left + crop.x * bounds.width,
    top: bounds.top + crop.y * bounds.height,
    width: crop.width * bounds.width,
    height: crop.height * bounds.height,
  }
}
```

Move the `getAssetVisualMediaBounds` import from the dialog into this module.

- [ ] **Step 4: Observe the actual mounted stage node**

Replace `stageRef` with state:

```tsx
const [stageNode, setStageNode] = useState<HTMLDivElement | null>(null)

useEffect(() => {
  if (!open || !stageNode) return
  const update = () => setStageSize({ width: stageNode.clientWidth, height: stageNode.clientHeight })
  update()
  const observer = new ResizeObserver(update)
  observer.observe(stageNode)
  return () => observer.disconnect()
}, [open, stageNode])
```

Use `ref={setStageNode}`, calculate `cropStyle` with the pure helper, and add `data-testid="asset-media-crop-frame"` to the overlay. Keep the frame border, outside mask, and grip visible.

- [ ] **Step 5: Run focused frontend tests**

Run the two commands from Step 2. Expected: PASS.

### Task 2: Detect and serve the real image MIME type

**Files:**
- Create: `internal/hub/asset_media_mime.go`
- Create: `internal/hub/asset_media_mime_test.go`
- Modify: `internal/hub/asset_media.go`

- [ ] **Step 1: Write failing MIME tests**

Create tests that encode small JPEG and PNG images and include a minimal WebP RIFF header:

```go
func TestDetectAssetMediaMimeTypeUsesImageBytes(t *testing.T) {
  require.Equal(t, "image/jpeg", detectAssetMediaMimeType(jpegBytes))
  require.Equal(t, "image/png", detectAssetMediaMimeType(pngBytes))
  require.Equal(t, "image/webp", detectAssetMediaMimeType([]byte("RIFF\x10\x00\x00\x00WEBPVP8 ")))
  require.Empty(t, detectAssetMediaMimeType([]byte("not-an-image")))
}
```

- [ ] **Step 2: Run test and verify failure**

Run:

```powershell
go test ./internal/hub -run TestDetectAssetMediaMimeTypeUsesImageBytes -count=1
```

Expected: FAIL because the detector does not exist.

- [ ] **Step 3: Implement strict byte detection**

Create:

```go
func detectAssetMediaMimeType(content []byte) string {
  detected := strings.ToLower(strings.TrimSpace(http.DetectContentType(content)))
  switch detected {
  case "image/jpeg", "image/png", "image/webp", "image/gif":
    return detected
  default:
    return ""
  }
}
```

Use the detector when uploading and importing candidates. Reject empty results. In `readAssetMediaObject`, detect from the bytes and prefer the detected MIME over the stored legacy value.

- [ ] **Step 4: Run MIME and existing media tests**

Run:

```powershell
go test ./internal/hub -run 'TestDetectAssetMediaMimeType|TestAssetMedia' -count=1
```

Expected: PASS.

### Task 3: Save each edit as an independent media item

**Files:**
- Modify: `internal/hub/asset_media_store.go`
- Modify: `internal/hub/asset_media_store_test.go`
- Create: `internal/hub/asset_media_edit.go`
- Create: `internal/hub/asset_media_edit_test.go`
- Modify: `internal/hub/asset_media.go`

- [ ] **Step 1: Write failing storage and key tests**

Add:

```go
func TestAssetMediaStoreRemovesObject(t *testing.T) {
  store := newAssetMediaStore(t.TempDir())
  _, err := store.write("temporary/a.jpg", []byte("image"))
  require.NoError(t, err)
  require.NoError(t, store.remove("temporary/a.jpg"))
  _, err = os.Stat(filepath.Join(store.root, "temporary", "a.jpg"))
  require.ErrorIs(t, err, os.ErrNotExist)
}

func TestAssetMediaEditedObjectKeyContainsBothIds(t *testing.T) {
  require.Equal(t,
    "originals/asset-1/media-2/version-3.jpg",
    assetMediaEditedObjectKey("asset-1", "media-2", "version-3"),
  )
}
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
go test ./internal/hub -run 'TestAssetMediaStoreRemovesObject|TestAssetMediaEditedObjectKeyContainsBothIds' -count=1
```

Expected: FAIL because `remove` and `assetMediaEditedObjectKey` do not exist.

- [ ] **Step 3: Implement object removal and unique keys**

Add:

```go
func (store *assetMediaStore) remove(key string) error {
  path, err := store.pathFor(key)
  if err != nil { return err }
  if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) { return err }
  return nil
}

func assetMediaEditedObjectKey(assetID, mediaID, versionID string) string {
  return path.Join("originals", assetID, mediaID, versionID+".jpg")
}
```

- [ ] **Step 4: Write a failing independent-save integration test**

Using the existing PocketBase Hub test setup, seed one asset, one source media, and one original version. Call the edit creation helper twice with different crops and assert:

```go
require.NotEqual(t, first.Media.Id, second.Media.Id)
require.NotEqual(t, first.Version.Id, second.Version.Id)
require.NotEqual(t, first.Version.GetString("object_key"), second.Version.GetString("object_key"))
require.Equal(t, "library", first.Media.GetString("state"))
var recipe map[string]any
require.NoError(t, first.Version.UnmarshalJSONField("recipe", &recipe))
require.Equal(t, sourceVersion.Id, recipe["source_version"])
placements, err := testApp.FindRecordsByFilter(
  "asset_media_placements",
  "media = {:media}",
  "",
  100,
  0,
  map[string]any{"media": first.Media.Id},
)
require.NoError(t, err)
require.Empty(t, placements)
```

- [ ] **Step 5: Run the integration test and verify failure**

Run:

```powershell
go test ./internal/hub -run TestCreateEditedAssetMediaCreatesIndependentImages -count=1
```

Expected: FAIL because the helper does not exist and the current endpoint updates the same media.

- [ ] **Step 6: Implement independent edited-media creation**

Create a focused helper returning this explicit result:

```go
type assetMediaEditResult struct {
  Media   *core.Record
  Version *core.Record
}
```

The helper starts by assigning IDs before any object key is created:

```go
newMedia := core.NewRecord(mediaCollection)
newMedia.Id = core.GenerateDefaultRandomId()
newVersion := core.NewRecord(versionCollection)
newVersion.Id = core.GenerateDefaultRandomId()
key := assetMediaEditedObjectKey(asset.Id, newMedia.Id, newVersion.Id)
```

It renders the source, writes `key`, sets `source_kind=edit`, assigns `nextAssetMediaLibraryName`, stores the rendered SHA-256, saves the media and its own `kind=original` version, records source IDs and crop recipe, and returns both records. On any save failure it removes the object and deletes any partial record.

Update `createAssetMediaVersion` to call this helper and return:

```go
return e.JSON(http.StatusCreated, map[string]any{
  "media": edited.Media,
  "version": edited.Version,
})
```

Do not update the source media and do not create placements.

- [ ] **Step 7: Run independent-save and storage tests**

Run the tests from Steps 2 and 5. Expected: PASS.

### Task 4: Repair legacy shared render files

**Files:**
- Create: `internal/hub/asset_media_repair.go`
- Create: `internal/hub/asset_media_repair_test.go`
- Modify: `internal/hub/asset_media.go`

- [ ] **Step 1: Write failing legacy-path tests**

Add:

```go
func TestLegacyAssetMediaRenderObjectKey(t *testing.T) {
  require.True(t, isLegacyAssetMediaRenderObjectKey("renders/a/m/.jpg"))
  require.False(t, isLegacyAssetMediaRenderObjectKey("renders/a/m/version.jpg"))
  require.Equal(t, "renders/a/m/version.jpg", assetMediaRenderObjectKey("a", "m", "version"))
}
```

Add a reconstruction test with a colored source image and two legacy records with different recipes. Assert that repair produces different object keys and different decoded center pixels, then run repair a second time and assert keys do not change.

- [ ] **Step 2: Run repair tests and verify failure**

Run:

```powershell
go test ./internal/hub -run 'TestLegacyAssetMediaRenderObjectKey|TestRepairLegacyAssetMediaRenderVersions' -count=1
```

Expected: FAIL because repair helpers do not exist.

- [ ] **Step 3: Implement idempotent repair**

Implement:

```go
func isLegacyAssetMediaRenderObjectKey(key string) bool {
  return strings.HasSuffix(strings.ReplaceAll(key, "\\", "/"), "/.jpg")
}

func assetMediaRenderObjectKey(assetID, mediaID, versionID string) string {
  return path.Join("renders", assetID, mediaID, versionID+".jpg")
}
```

For each legacy render record, load its parent, decode `{crop, ratio}` from recipe, re-render from the parent object, write the unique key, then update `object_key`, `bytes`, and `mime_type`. Call repair before returning `listAssetMedia`; log failures and continue serving other media.

- [ ] **Step 4: Run repair and render tests**

Run:

```powershell
go test ./internal/hub -run 'TestLegacyAssetMedia|TestRepairLegacyAssetMedia|TestRenderAssetMediaVersion' -count=1
```

Expected: PASS.

### Task 5: Select and display the newly created image

**Files:**
- Modify: `internal/site/src/modules/asset-center/components/asset-media-workspace.tsx`
- Modify: `internal/site/src/modules/asset-center/components/asset-media-preview-layout.test.ts`

- [ ] **Step 1: Write a failing source-contract test**

Add assertions:

```ts
assert.match(workspaceSource, /type MediaSaveResponse = \{ media: \{ id: string \}; version: \{ id: string \} \}/)
assert.match(workspaceSource, /setSelectedId\(created\.media\.id\)/)
assert.match(workspaceSource, /await notifyAssetMediaChanged\(assetId\)/)
```

- [ ] **Step 2: Run test and verify failure**

Run:

```powershell
cd internal/site
node --experimental-strip-types src/modules/asset-center/components/asset-media-preview-layout.test.ts
```

Expected: FAIL because save currently ignores the response and closes on the same media.

- [ ] **Step 3: Consume the create response**

Define `MediaSaveResponse`, assign the `pb.send` result to `created`, await media refresh, then call `setSelectedId(created.media.id)`. Close the editor only after the refreshed list includes the new image.

- [ ] **Step 4: Run frontend tests**

Run:

```powershell
npm test
npm run typecheck
```

Expected: PASS.

### Task 6: Document and verify the complete chain

**Files:**
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`

- [ ] **Step 1: Update user-visible release records**

Add matching Web / Hub notes explaining that crop frames now mount reliably, each save creates a new numbered image, real image formats are detected, object files no longer overwrite, and old shared render files are reconstructed.

- [ ] **Step 2: Run full automated verification**

Run:

```powershell
go test ./internal/hub
cd internal/site
npm test
npm run typecheck
npm run build
npx biome check src/modules/asset-center/components/asset-media-crop.ts src/modules/asset-center/components/asset-media-crop.test.ts src/modules/asset-center/components/asset-media-editor-dialog.tsx src/modules/asset-center/components/asset-media-workspace.tsx src/modules/asset-center/components/asset-media-preview-layout.test.ts src/components/routes/settings/release-history.ts package.json
```

Expected: all commands exit `0`.

Run `npm run check` separately and report only unrelated pre-existing diagnostics; do not bulk-format unrelated files.

- [ ] **Step 3: Restart the source preview if Hub code changed**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental/scripts/run-hub-dev.ps1 -Restart
```

Expected: Hub listens on `8090`, Vite listens on `5173`, and health checks succeed.

- [ ] **Step 4: Browser end-to-end verification**

On `http://127.0.0.1:5173/assets/rb278229210c3ee`:

1. Open asset editing and select `UM690-01`.
2. Open image editing and confirm the crop frame and outside mask are visible on first open.
3. Zoom with the slider and mouse wheel, then drag the frame.
4. Save and confirm a new numbered image appears and is selected.
5. Confirm `UM690-01` is unchanged and the new preview matches the crop frame.
6. Confirm the detail page does not change before placement.
7. Set the new image as cover and confirm the detail image updates without page refresh.
8. Check console error/warn logs and capture screenshots.

- [ ] **Step 5: Final diff checks**

Run:

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors in modified files; unrelated dirty files remain untouched.
