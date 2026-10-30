# Asset Image Candidate Preview and Canvas Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collect up to 15 device-image candidates, let users preview and reliably import them, and edit any source aspect ratio on a fixed white `16:9` canvas that preserves intentional blank space.

**Architecture:** Keep the feature inside `asset-center`. Candidate selection becomes transient frontend state that overrides the media preview without changing the asset; candidate import returns a consistent media response and can restore soft-deleted media. The editor sends image placement on a fixed output canvas, while Hub composites the source onto a white `1600×900` JPEG and retains the legacy crop renderer for old recipes.

**Tech Stack:** React 19, TypeScript, Radix UI, PocketBase 0.39, Go image APIs, `disintegration/imaging`, local filesystem object storage, Node assertion tests, Go `testify`, Browser plugin.

---

## File map

- Modify `internal/hub/asset_visuals.go`: raise device candidate defaults and hard cap to 15 while preserving the service Logo limit.
- Modify `internal/hub/asset_visual_service_logo_test.go`: protect the device and service candidate-limit split.
- Modify `internal/hub/asset_enrichment_test.go`: verify a configured limit of 15 is accepted and applied.
- Modify `internal/site/src/modules/asset-center/asset-visual-query.ts`: expose and slice device candidates at 15.
- Modify `internal/site/src/modules/asset-center/asset-visual-query.test.ts`: cover 15 device candidates and 4 service Logo candidates.
- Modify `internal/site/src/components/routes/settings/ai.tsx`: default and maximum candidate count become 15.
- Modify `internal/site/src/modules/asset-center/components/asset-edit-visual-panel.tsx`: make candidate cards previewable and reduce each card to one import action.
- Create `internal/site/src/modules/asset-center/components/asset-edit-visual-panel.test.ts`: protect preview override and one-button candidate interaction.
- Modify `internal/site/src/modules/asset-center/components/asset-media-workspace.tsx`: accept a transient preview override and preferred imported media ID.
- Modify `internal/site/src/modules/asset-center/components/asset-media-preview-layout.test.ts`: protect preview override precedence and preferred-media selection.
- Modify `internal/site/src/modules/asset-center/asset-detail-page.tsx`: return the imported media ID, remove direct candidate-to-main-image selection, and update 15-image messaging.
- Create `internal/hub/asset_media_import.go`: resolve existing, deleted, and invalid duplicate candidate media consistently.
- Create `internal/hub/asset_media_import_test.go`: cover new import, existing import, deleted restore, stable renumbering, placement cleanup, and missing-object failure.
- Modify `internal/hub/asset_media.go`: route candidate imports through the duplicate resolver and return a consistent `{media, version}` response.
- Modify `internal/site/src/modules/asset-center/components/asset-media-crop.ts`: replace image-bounded crop geometry with fixed-canvas image placement geometry.
- Modify `internal/site/src/modules/asset-center/components/asset-media-crop.test.ts`: cover contain placement, zoom below 1, zoom above 1, movement outside the canvas, and minimum visible bounds.
- Modify `internal/site/src/modules/asset-center/components/asset-media-editor-dialog.tsx`: render a fixed white canvas and move/scale the image inside it.
- Modify `internal/site/src/modules/asset-center/components/asset-media-workspace.tsx`: submit `placement` instead of a new `crop` recipe.
- Modify `internal/hub/asset_media_render.go`: composite placement-based edits onto a white output canvas while retaining legacy crop rendering.
- Modify `internal/hub/asset_media_render_test.go`: verify white blank areas, clipped overflow, correct output size, and legacy crop compatibility.
- Modify `internal/hub/asset_media_edit.go` and `asset_media_edit_test.go`: persist placement recipes and source lineage for new independent images.
- Modify `docs/release-notes-next.md` and `internal/site/src/components/routes/settings/release-history.ts`: record all user-visible changes.

### Task 1: Raise device candidate collection and display to 15

**Files:**
- Modify: `internal/hub/asset_visuals.go`
- Modify: `internal/hub/asset_visual_service_logo_test.go`
- Modify: `internal/hub/asset_enrichment_test.go`
- Modify: `internal/site/src/modules/asset-center/asset-visual-query.ts`
- Modify: `internal/site/src/modules/asset-center/asset-visual-query.test.ts`
- Modify: `internal/site/src/components/routes/settings/ai.tsx`
- Modify: `internal/site/src/modules/asset-center/asset-detail-page.tsx`

- [ ] **Step 1: Write failing limit tests**

Update the frontend assertions:

```ts
assertDeepEqual(getAssetVisualCandidateLimit("internet"), 4)
assertDeepEqual(getAssetVisualCandidateLimit("phone"), 15)

const candidateSet = {
  // existing fields
  frames: Array.from({ length: 16 }, (_, index) => ({
    index,
    label: `候选 ${index + 1}`,
    url: `https://cdn.example.com/device-${index + 1}.jpg`,
    color: index < 2 ? "墨羽" : "幽芒",
  })),
} as unknown as AssetVisualRecord

assertDeepEqual(getAssetVisualCandidateFrames(candidateSet).length, 15)
```

Add a Hub assertion:

```go
func TestDeviceVisualKeepsFifteenCandidatesWhileServiceLogoKeepsFour(t *testing.T) {
    device := core.NewRecord(core.NewBaseCollection("assets"))
    device.Set("type", "mini_pc")
    service := core.NewRecord(core.NewBaseCollection("assets"))
    service.Set("type", "internet")

    require.Equal(t, 15, assetVisualReferenceLimit(device, 15))
    require.Equal(t, 15, assetVisualCandidateFrameCount(device))
    require.Equal(t, 4, assetVisualReferenceLimit(service, 15))
    require.Equal(t, 4, assetVisualCandidateFrameCount(service))
}
```

- [ ] **Step 2: Run the tests and verify red**

Run:

```powershell
go test -tags testing ./internal/hub -run 'Test(DeviceVisualKeepsFifteen|AssetVisualRespectsConfiguredCandidateLimit)' -count=1
cd internal/site
node --experimental-strip-types src/modules/asset-center/asset-visual-query.test.ts
```

Expected: FAIL because device limits and frontend slicing are still 10/12.

- [ ] **Step 3: Implement the 15-image limit**

Use consistent constants:

```go
const defaultAssetVisualCandidateCount = 15
const defaultAssetVisualMaxImages = 15

func normalizeAssetVisualMaxImages(value int) int {
    if value <= 0 {
        return defaultAssetVisualMaxImages
    }
    if value < 2 {
        return 2
    }
    if value > 15 {
        return 15
    }
    return value
}
```

Update the image Agent system prompt from “10 张” to “15 张”, change `getAssetVisualCandidateLimit` and `getAssetVisualCandidateFrames(...).slice` to 15, set the settings form default and `NumberSetting max` to 15, and change the generation message to:

```ts
setVisualGenerationMessage("设备图片 Agent 正在生成检索关键词并收集最多 15 张高适配候选图。")
```

- [ ] **Step 4: Verify green**

Run the same Go and Node tests. Expected: PASS.

- [ ] **Step 5: Commit the limit change**

```powershell
git add internal/hub/asset_visuals.go internal/hub/asset_visual_service_logo_test.go internal/hub/asset_enrichment_test.go internal/site/src/modules/asset-center/asset-visual-query.ts internal/site/src/modules/asset-center/asset-visual-query.test.ts internal/site/src/components/routes/settings/ai.tsx internal/site/src/modules/asset-center/asset-detail-page.tsx
git commit -m "feat: increase asset image candidates to fifteen"
```

### Task 2: Make candidate cards preview-first with one import action

**Files:**
- Modify: `internal/site/src/modules/asset-center/components/asset-edit-visual-panel.tsx`
- Create: `internal/site/src/modules/asset-center/components/asset-edit-visual-panel.test.ts`
- Modify: `internal/site/src/modules/asset-center/components/asset-media-workspace.tsx`
- Modify: `internal/site/src/modules/asset-center/components/asset-media-preview-layout.test.ts`
- Modify: `internal/site/src/modules/asset-center/asset-detail-page.tsx`
- Modify: `internal/site/package.json`

- [ ] **Step 1: Write failing source-contract and behavior tests**

Create `asset-edit-visual-panel.test.ts` to assert the component owns transient candidate state, passes a preview override, makes the candidate image/card clickable, and no longer renders “选择 / 已选”:

```ts
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"

const source = readFileSync(new URL("./asset-edit-visual-panel.tsx", import.meta.url), "utf8")

assert.match(source, /useState<AssetVisualCandidateFrame/)
assert.match(source, /previewOverride=/)
assert.match(source, /preferredMediaId=/)
assert.match(source, /setSelectedCandidate\(frame\)/)
assert.doesNotMatch(source, /已选|>选择</)
assert.equal((source.match(/加入图片库/g) ?? []).length, 1)
```

Extend `asset-media-preview-layout.test.ts`:

```ts
assert.match(workspaceSource, /previewOverride \? /)
assert.match(workspaceSource, /preferredMediaId/)
assert.match(workspaceSource, /onLibrarySelection/)
```

Add the new test to `test:asset-center` in `package.json`.

- [ ] **Step 2: Run tests and verify red**

```powershell
cd internal/site
node --experimental-strip-types src/modules/asset-center/components/asset-edit-visual-panel.test.ts
node --experimental-strip-types src/modules/asset-center/components/asset-media-preview-layout.test.ts
```

Expected: FAIL because preview override and preferred media selection do not exist.

- [ ] **Step 3: Implement transient candidate preview**

In `AssetEditVisualPanel`, add:

```ts
const [selectedCandidate, setSelectedCandidate] = useState<AssetVisualCandidateFrame>()
const [preferredMediaId, setPreferredMediaId] = useState<string>()
const [importingCandidateKey, setImportingCandidateKey] = useState<string>()
```

Pass the override into the workspace:

```tsx
<AssetMediaWorkspace
  assetId={assetId}
  readOnly={readOnly}
  previewOverride={
    selectedCandidate
      ? { url: selectedCandidate.url, alt: `${selectedCandidate.label} 预览` }
      : undefined
  }
  preferredMediaId={preferredMediaId}
  onLibrarySelection={() => setSelectedCandidate(undefined)}
  fallbackPreview={defaultMediaPreview ?? currentFallback}
/>
```

Make the candidate image/card call `setSelectedCandidate(frame)`. Replace the two old actions with one button:

```tsx
<Button
  type="button"
  size="sm"
  variant="outline"
  disabled={readOnly || saving || Boolean(importingCandidateKey)}
  onClick={async () => {
    const key = `${frame.visualId}:${frame.index}`
    setImportingCandidateKey(key)
    try {
      const mediaId = await onImportVisualCandidate(frame.visualId, frame.index)
      setPreferredMediaId(mediaId)
      setSelectedCandidate(undefined)
    } finally {
      setImportingCandidateKey(undefined)
    }
  }}
>
  {importingCandidateKey === `${frame.visualId}:${frame.index}` ? "加入中" : "加入图片库"}
</Button>
```

Use `aspect-[16/9] bg-white` for every candidate image box and keep the image `h-full w-full object-contain`; do not use `object-cover`, stretching, or cropping. Apply the same white canvas to the workspace preview override and media-library preview so natural blank space looks intentional in both light and dark themes.

Change `onImportVisualCandidate` to return `Promise<string>` and remove `onSelectVisualCandidate` from this component and its caller.

- [ ] **Step 4: Implement workspace preview precedence and preferred selection**

Add props:

```ts
previewOverride?: { url: string; alt: string }
preferredMediaId?: string
onLibrarySelection?: () => void
```

Make `previewOverride` win over selected media for the large preview. After media refresh, select `preferredMediaId` when present:

```ts
useEffect(() => {
  if (preferredMediaId && data.media.some((item) => item.id === preferredMediaId)) {
    setSelectedId(preferredMediaId)
  }
}, [data.media, preferredMediaId])
```

When a library thumbnail is clicked, call `onLibrarySelection?.()` before setting its ID.

- [ ] **Step 5: Return the imported media ID from the page callback**

Use a consistent response type:

```ts
type MediaImportResponse = { media: { id: string }; version: { id: string } }

async function importAssetVisualCandidate(visualId: string, frameIndex: number) {
  if (!asset) throw new Error("资产不存在")
  const result = await pb.send<MediaImportResponse>(`/api/pulse/assets/${asset.id}/media/import-visual`, {
    method: "POST",
    body: { visual_id: visualId, frame_index: frameIndex },
  })
  await notifyAssetMediaChanged(asset.id)
  toast({ title: "已加入图片库", description: "候选图片已归档到本地媒体库。" })
  return result.media.id
}
```

- [ ] **Step 6: Verify and commit**

Run both targeted tests and `npm test`. Expected: PASS.

```powershell
git add internal/site/package.json internal/site/src/modules/asset-center/asset-detail-page.tsx internal/site/src/modules/asset-center/components/asset-edit-visual-panel.tsx internal/site/src/modules/asset-center/components/asset-edit-visual-panel.test.ts internal/site/src/modules/asset-center/components/asset-media-workspace.tsx internal/site/src/modules/asset-center/components/asset-media-preview-layout.test.ts
git commit -m "feat: preview asset image candidates before import"
```

### Task 3: Restore deleted duplicate candidate media reliably

**Files:**
- Create: `internal/hub/asset_media_import.go`
- Create: `internal/hub/asset_media_import_test.go`
- Modify: `internal/hub/asset_media.go`

- [ ] **Step 1: Write failing endpoint tests**

Build an authenticated fixture using `newAssetEnrichmentFixture`, an `httptest.Server` returning a real JPEG, and an `asset_visuals` candidate record. Exercise this sequence:

```go
first := importCandidate(t, fixture, visual.Id, 0)
require.Equal(t, http.StatusCreated, first.Status)

second := importCandidate(t, fixture, visual.Id, 0)
require.Equal(t, http.StatusOK, second.Status)
require.Equal(t, first.MediaID, second.MediaID)

deleteResponse := deleteMedia(t, fixture, first.MediaID)
require.Equal(t, http.StatusOK, deleteResponse.Status)

restored := importCandidate(t, fixture, visual.Id, 0)
require.Equal(t, http.StatusOK, restored.Status)
require.Equal(t, first.MediaID, restored.MediaID)

record, err := fixture.hub.FindRecordById("asset_media", first.MediaID)
require.NoError(t, err)
require.Equal(t, "library", record.GetString("state"))
require.Equal(t, "Redmi K50-01", record.GetString("source_title"))
```

Create another active media using `-01` before restoration and assert the restored record becomes `-02`. Assert no placement records are recreated.

- [ ] **Step 2: Run the test and verify red**

```powershell
go test -tags testing ./internal/hub -run TestImportAssetVisualCandidate -count=1
```

Expected: FAIL because the endpoint returns a bare deleted record and never restores its state.

- [ ] **Step 3: Implement a consistent duplicate resolver**

Create:

```go
type assetMediaImportResult struct {
    Media   *core.Record
    Version *core.Record
    Created bool
}

func (h *Hub) resolveExistingImportedAssetMedia(asset, media *core.Record, userID string) (assetMediaImportResult, error) {
    version, err := h.FindFirstRecordByFilter(
        "asset_media_versions",
        "id = {:id} && media = {:media} && asset = {:asset} && user = {:user}",
        map[string]any{"id": media.GetString("active_version"), "media": media.Id, "asset": asset.Id, "user": userID},
    )
    if err != nil {
        return assetMediaImportResult{}, fmt.Errorf("图片版本不存在: %w", err)
    }
    store := newAssetMediaStore(h.assetMediaStoreRoot())
    objectPath, err := store.pathFor(version.GetString("object_key"))
    if err != nil {
        return assetMediaImportResult{}, err
    }
    if _, err := os.Stat(objectPath); err != nil {
        return assetMediaImportResult{}, fmt.Errorf("图片对象不存在: %w", err)
    }
    if media.GetString("state") == "deleted" {
        media.Set("source_title", h.nextAssetMediaLibraryName(asset, userID))
        media.Set("state", "library")
        if err := h.Save(media); err != nil {
            return assetMediaImportResult{}, err
        }
    }
    return assetMediaImportResult{Media: media, Version: version}, nil
}
```

In `importAssetVisualCandidate`, use this resolver when the hash already exists. Always return:

```go
return e.JSON(status, map[string]any{"media": result.Media, "version": result.Version})
```

New records use `201`; existing or restored records use `200`.

- [ ] **Step 4: Verify and commit**

Run the targeted test and related media tests. Expected: PASS.

```powershell
git add internal/hub/asset_media.go internal/hub/asset_media_import.go internal/hub/asset_media_import_test.go
git commit -m "fix: restore deleted asset image candidates"
```

### Task 4: Replace image-bounded crop geometry with fixed-canvas placement

**Files:**
- Modify: `internal/site/src/modules/asset-center/components/asset-media-crop.ts`
- Modify: `internal/site/src/modules/asset-center/components/asset-media-crop.test.ts`
- Modify: `internal/site/src/modules/asset-center/components/asset-media-editor-dialog.tsx`
- Modify: `internal/site/src/modules/asset-center/components/asset-media-preview-layout.test.ts`
- Modify: `internal/site/src/modules/asset-center/components/asset-media-workspace.tsx`

- [ ] **Step 1: Write failing placement geometry tests**

Define the desired API:

```ts
export type AssetMediaPlacement = { x: number; y: number; width: number; height: number }

assert.deepEqual(createContainedAssetMediaPlacement(1080, 1080, 16 / 9), {
  x: 0.21875,
  y: 0,
  width: 0.5625,
  height: 1,
})

assert.deepEqual(scaleAssetMediaPlacement({ x: 0.21875, y: 0, width: 0.5625, height: 1 }, 0.5), {
  x: 0.359375,
  y: 0.25,
  width: 0.28125,
  height: 0.5,
})

const moved = moveAssetMediaPlacement({ x: 0.2, y: 0.1, width: 0.6, height: 0.8 }, -0.7, 0)
assert.equal(moved.x < 0, true)
assert.equal(moved.x + moved.width >= 0.05, true)
```

Update the source contract to require a full-stage frame, placement save, slider min `0.25`, and removal of the old overlay rectangle helper from the editor.

- [ ] **Step 2: Run tests and verify red**

```powershell
cd internal/site
node --experimental-strip-types src/modules/asset-center/components/asset-media-crop.test.ts
node --experimental-strip-types src/modules/asset-center/components/asset-media-preview-layout.test.ts
```

Expected: FAIL because placement helpers do not exist.

- [ ] **Step 3: Implement placement helpers**

Implement:

```ts
export function createContainedAssetMediaPlacement(imageWidth: number, imageHeight: number, canvasRatio: number) {
  const imageRatio = imageWidth / imageHeight
  if (imageRatio >= canvasRatio) {
    const height = canvasRatio / imageRatio
    return { x: 0, y: (1 - height) / 2, width: 1, height }
  }
  const width = imageRatio / canvasRatio
  return { x: (1 - width) / 2, y: 0, width, height: 1 }
}

export function scaleAssetMediaPlacement(placement: AssetMediaPlacement, factor: number) {
  const centerX = placement.x + placement.width / 2
  const centerY = placement.y + placement.height / 2
  const width = placement.width * factor
  const height = placement.height * factor
  return { x: centerX - width / 2, y: centerY - height / 2, width, height }
}
```

Clamp movement so at least `0.05` of normalized width/height remains visible. Convert placement to CSS percentages with `left`, `top`, `width`, and `height`.

- [ ] **Step 4: Rebuild the editor around the fixed canvas**

- The stage itself is the fixed crop/output frame and uses `bg-white`.
- The source image is absolutely positioned using placement CSS and `object-contain` without forced full-stage width/height.
- Pointer drag starts on the image/stage and updates placement by stage-relative deltas.
- Slider range becomes `0.25` to `4`; every update derives placement from the initial contained placement plus the current center, avoiding cumulative floating-point drift.
- Reset restores the initial contained placement and `1×`.
- Save calls `onSave(placement, "16:9")`.

Update the workspace request body:

```ts
body: { parent_version: versionId, placement, ratio }
```

- [ ] **Step 5: Verify and commit**

Run the targeted geometry and source-contract tests, then `npm test` and `npm run typecheck`.

```powershell
git add internal/site/src/modules/asset-center/components/asset-media-crop.ts internal/site/src/modules/asset-center/components/asset-media-crop.test.ts internal/site/src/modules/asset-center/components/asset-media-editor-dialog.tsx internal/site/src/modules/asset-center/components/asset-media-preview-layout.test.ts internal/site/src/modules/asset-center/components/asset-media-workspace.tsx
git commit -m "feat: edit asset images on a fixed white canvas"
```

### Task 5: Composite placement edits onto a white 1600×900 JPEG

**Files:**
- Modify: `internal/hub/asset_media_render.go`
- Modify: `internal/hub/asset_media_render_test.go`
- Modify: `internal/hub/asset_media.go`
- Modify: `internal/hub/asset_media_edit.go`
- Modify: `internal/hub/asset_media_edit_test.go`

- [ ] **Step 1: Write failing placement renderer tests**

Add:

```go
func TestRenderAssetMediaPlacementPreservesWhiteBlankSpace(t *testing.T) {
    source := solidPNG(t, 400, 400, color.RGBA{R: 220, G: 20, B: 40, A: 255})
    placement := assetMediaPlacement{X: .25, Y: 0, Width: .5, Height: 1}
    result, err := renderAssetMediaVersion(source, assetMediaRecipe{
        Placement: &placement,
        OutputWidth: 1600,
        OutputHeight: 900,
    })
    require.NoError(t, err)
    decoded := decodeImage(t, result)
    requireColorNear(t, decoded.At(20, 450), color.RGBA{R: 255, G: 255, B: 255, A: 255})
    requireColorNear(t, decoded.At(800, 450), color.RGBA{R: 220, G: 20, B: 40, A: 255})
}
```

Add a placement with negative `X` and assert overflow is clipped while the output remains `1600×900`. Keep the existing legacy crop tests unchanged.

- [ ] **Step 2: Run tests and verify red**

```powershell
go test -tags testing ./internal/hub -run 'TestRenderAssetMedia(Placement|Version)' -count=1
```

Expected: FAIL because `assetMediaPlacement` and placement rendering do not exist.

- [ ] **Step 3: Implement placement rendering with legacy fallback**

Add:

```go
type assetMediaPlacement struct{ X, Y, Width, Height float64 }

type assetMediaRecipe struct {
    Crop                      assetMediaCrop
    Placement                 *assetMediaPlacement
    OutputWidth, OutputHeight int
}
```

When `Placement != nil`:

1. Validate finite positive width/height, reasonable maximum scale, and finite offsets.
2. Create `image.NewRGBA(image.Rect(0, 0, outputWidth, outputHeight))`.
3. Fill it with `color.White` using `draw.Draw`.
4. Resize the decoded source to `round(outputWidth*Width)` × `round(outputHeight*Height)` with Lanczos.
5. Draw it at `round(outputWidth*X)`, `round(outputHeight*Y)`; `draw.Draw` clips overflow automatically.
6. Encode JPEG quality 92.

When `Placement == nil`, execute the existing crop normalization and crop/fill path unchanged.

- [ ] **Step 4: Store placement recipes**

Extend `assetMediaVersionRequest` with:

```go
Placement *assetMediaPlacement `json:"placement"`
```

New saves require a valid placement and pass it into `assetMediaRecipe`. Store recipe lineage as:

```go
"placement": placement,
"ratio": "16:9",
"source_media": sourceMediaID,
"source_version": sourceVersionID,
```

Keep `crop` decoding in legacy repair code so old versions remain reconstructable.

- [ ] **Step 5: Verify and commit**

Run renderer, edit, repair, and media tests. Expected: PASS.

```powershell
git add internal/hub/asset_media_render.go internal/hub/asset_media_render_test.go internal/hub/asset_media.go internal/hub/asset_media_edit.go internal/hub/asset_media_edit_test.go
git commit -m "feat: render asset images on a white output canvas"
```

### Task 6: Document, restart, and perform end-to-end verification

**Files:**
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`

- [ ] **Step 1: Record the user-visible behavior**

Add matching Web / Hub release entries covering:

- device candidate target increased from 10 to 15 while service Logo stays at 4;
- candidate click previews above without changing the asset;
- one reliable “加入图片库” action and deleted-media restoration;
- fixed `16:9` white canvas, full original display, zoom below 1, overflow clipping, and white blank-space output;
- legacy crop recipes remain compatible.

- [ ] **Step 2: Run full automated verification**

```powershell
go test -tags testing ./internal/hub -run 'Test(AssetVisual|DeviceVisual|ImportAssetVisualCandidate|AssetMedia|RenderAssetMedia|NewAssetMedia|LegacyAssetMedia|RepairLegacyAssetMedia)' -count=1
go test ./internal/migrations
cd internal/site
npm test
npm run typecheck
npm run build
npx biome check src/modules/asset-center/asset-visual-query.ts src/modules/asset-center/asset-visual-query.test.ts src/modules/asset-center/components/asset-edit-visual-panel.tsx src/modules/asset-center/components/asset-edit-visual-panel.test.ts src/modules/asset-center/components/asset-media-crop.ts src/modules/asset-center/components/asset-media-crop.test.ts src/modules/asset-center/components/asset-media-editor-dialog.tsx src/modules/asset-center/components/asset-media-workspace.tsx src/modules/asset-center/components/asset-media-preview-layout.test.ts src/components/routes/settings/ai.tsx src/components/routes/settings/release-history.ts
```

Expected: all commands exit `0`.

Run `npm run check` separately and report only unrelated pre-existing diagnostics; do not bulk-format unrelated files.

- [ ] **Step 3: Restart source preview**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental/scripts/run-hub-dev.ps1 -Restart
```

Expected: Vite listens on `5173`, Hub listens on `8090`, and the health check passes.

- [ ] **Step 4: Set the current development instance candidate count to 15**

Open `/settings/ai`, set “候选图片数量” to `15`, save, and verify the returned configuration reports `max_images: 15`. This updates the current local instance without silently rewriting intentionally customized limits in other installations.

- [ ] **Step 5: Browser end-to-end verification**

On an asset with image candidates:

1. Click “获取图片” and verify the counter target displays `/ 15` for device assets and `/ 4` for service Logo assets.
2. Click several different candidates; verify the upper `16:9` preview changes immediately, shows each source image in full with white blank space, and the detail-page cover does not change.
3. Verify each candidate card has only one “加入图片库” action.
4. Import a candidate and verify it appears in the image library and becomes selected.
5. Delete it with confirmation, import the same candidate again, and verify it is restored and visible.
6. Open the editor with square, portrait, and landscape sources. Verify `1×` shows the full image, `0.25×` increases white space, `>1×` crops, and dragging allows partial overflow while retaining a visible portion.
7. Save and verify the result is exactly `1600×900`; uncovered canvas pixels are white and the image placement matches the editor.
8. Confirm console error/warn logs contain no new related entries.
9. Delete temporary test media and restore any temporary cover/gallery changes.

- [ ] **Step 6: Final checks and commit**

```powershell
git diff --check
git status --short
git add docs/release-notes-next.md internal/site/src/components/routes/settings/release-history.ts
git commit -m "docs: record candidate preview and white canvas editing"
```

Expected: no whitespace errors; unrelated dirty files remain untouched.
