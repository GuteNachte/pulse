# Asset Migration Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-contained asset migration ZIP that exports and restores asset-center records, PocketBase attachments, and local asset media without broken references.

**Architecture:** Hub owns package creation, ZIP validation, preflight, ID remapping, transactions, and file commit. The React asset page only uploads a package, renders the preflight result, selects an import mode, and reports task results. Existing CSV and legacy JSON import stay client-side and unchanged.

**Tech Stack:** Go 1.24, PocketBase 0.39.4, `archive/zip`, SHA256, React 19, TypeScript 6, PocketBase JS SDK, existing shadcn/Radix components.

---

## File Map

- Create `internal/hub/archive_safety.go`: shared safe-ZIP limits, normalized path checks, extraction, and SHA256 helpers.
- Create `internal/hub/archive_safety_test.go`: traversal, compression ratio, count, size, and checksum tests.
- Create `internal/hub/asset_migration_contract.go`: manifest, records, preflight, conflict mode, and result types.
- Create `internal/hub/asset_migration_export.go`: user-scoped record/file collection and ZIP streaming.
- Create `internal/hub/asset_migration_import.go`: upload staging, preflight, matching, ID mapping, transaction, and file commit.
- Create `internal/hub/asset_migration_test.go`: export/import round trip, conflict modes, permissions, rollback, and media tests.
- Modify `internal/hub/api.go`: register asset migration endpoints behind auth, non-readonly, and `asset-center` gates.
- Create `internal/site/src/modules/asset-center/asset-migration.ts`: API types and client functions.
- Create `internal/site/src/modules/asset-center/asset-migration.test.ts`: file detection and preflight-view-model tests.
- Create `internal/site/src/modules/asset-center/components/asset-migration-panel.tsx`: compact preflight, mode selection, and confirmation UI.
- Modify `internal/site/src/modules/asset-center/components/asset-export-dialog.tsx`: replace JSON snapshot action with migration package download.
- Modify `internal/site/src/modules/asset-center/components/asset-import-dialog.tsx`: route ZIP files into the migration panel while preserving CSV/JSON.
- Modify `internal/site/src/components/routes/assets.tsx`: connect package export/upload/apply handlers and refresh data after success.
- Modify `internal/site/src/modules/asset-center/asset-numbering.ts`: move durable numbering settings into `user_settings` with one-time local migration.
- Modify `internal/site/src/modules/asset-center/asset-numbering.test.ts`: cover server-first load and local migration fallback.

## Task 1: Safe Archive Foundation

**Files:**
- Create: `internal/hub/archive_safety.go`
- Create: `internal/hub/archive_safety_test.go`

- [ ] **Step 1: Write failing validation tests**

Cover a valid ZIP and rejection of `../escape`, absolute paths, backslash traversal, symlinks, more than 10,000 entries, an entry over 128 MiB, total uncompressed size over 4 GiB, and compressed ratio over 200:1.

```go
func TestInspectZipRejectsTraversal(t *testing.T) {
    path := writeTestZip(t, map[string][]byte{"../escape": []byte("x")})
    _, err := inspectZip(path, defaultArchiveLimits())
    require.ErrorContains(t, err, "unsafe archive path")
}

func TestInspectZipReturnsSHA256(t *testing.T) {
    path := writeTestZip(t, map[string][]byte{"manifest.json": []byte(`{"schema":"test"}`)})
    got, err := inspectZip(path, defaultArchiveLimits())
    require.NoError(t, err)
    require.Len(t, got.Entries, 1)
    require.Len(t, got.Entries[0].SHA256, 64)
}
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `go test -tags=testing -count=1 ./internal/hub -run TestInspectZip`

Expected: FAIL because `inspectZip` and archive types do not exist.

- [ ] **Step 3: Implement bounded ZIP inspection and extraction**

Define exact shared contracts:

```go
type archiveLimits struct {
    MaxEntries          int
    MaxEntryBytes       uint64
    MaxUncompressed     uint64
    MaxCompressionRatio float64
}

type archiveEntry struct {
    Path   string `json:"path"`
    Size   uint64 `json:"size"`
    SHA256 string `json:"sha256"`
}

func defaultArchiveLimits() archiveLimits
func inspectZip(path string, limits archiveLimits) (*archiveInspection, error)
func extractInspectedZip(path, destination string, inspection *archiveInspection) error
func cleanArchivePath(name string) (string, error)
```

Use `filepath.IsAbs`, `path.Clean`, forward-slash normalization, `zip.FileInfo().Mode()&os.ModeSymlink`, `io.LimitReader`, and `crypto/sha256`. Extraction must create only paths previously accepted by `inspectZip`.

- [ ] **Step 4: Run the focused tests**

Run: `go test -tags=testing -count=1 ./internal/hub -run 'TestInspectZip|TestExtractInspectedZip'`

Expected: PASS.

- [ ] **Step 5: Commit the isolated foundation files**

```powershell
git add internal/hub/archive_safety.go internal/hub/archive_safety_test.go
git commit -m "feat: add safe archive inspection"
```

Only commit if the staged diff contains these two new files and no pre-existing workspace edits.

## Task 2: Asset Package Contract and Export

**Files:**
- Create: `internal/hub/asset_migration_contract.go`
- Create: `internal/hub/asset_migration_export.go`
- Create: `internal/hub/asset_migration_test.go`
- Modify: `internal/hub/api.go`

- [ ] **Step 1: Write the export contract test**

Create one user, a location tree, two assets, two interfaces, one relation, maintenance, an attachment with a PocketBase file, local asset media/version/placement, a completed enrichment report, and a suggestion. Assert that another user's asset is absent.

```go
func TestExportAssetMigrationPackageIncludesOwnedRecordsAndFiles(t *testing.T) {
    fixture := newAssetMigrationFixture(t)
    packagePath, manifest := fixture.export()
    require.Equal(t, assetPackageSchemaV1, manifest.Schema)
    require.Equal(t, 2, manifest.Counts["assets"])
    requireArchiveEntry(t, packagePath, "records.json")
    requireArchivePrefix(t, packagePath, "files/attachments/")
    requireArchivePrefix(t, packagePath, "files/media/")
    require.NotContains(t, readArchiveText(t, packagePath, "records.json"), fixture.otherAsset.Id)
}
```

- [ ] **Step 2: Run the export test and verify failure**

Run: `go test -tags=testing -count=1 ./internal/hub -run TestExportAssetMigrationPackage`

Expected: FAIL because export package functions do not exist.

- [ ] **Step 3: Define explicit package types and registry**

```go
const assetPackageSchemaV1 = "pulse.asset-center.package.v1"

type assetPackageManifest struct {
    Schema         string            `json:"schema"`
    PackageID      string            `json:"package_id"`
    PulseVersion   string            `json:"pulse_version"`
    CreatedAt      string            `json:"created_at"`
    SourceInstance string            `json:"source_instance"`
    Scope          string            `json:"scope"`
    Counts         map[string]int    `json:"counts"`
    Files          []archiveEntry    `json:"files"`
}

type assetPackageRecords struct {
    Collections map[string][]map[string]any `json:"collections"`
}

var assetMigrationCollections = []string{
    "asset_locations", "assets", "asset_interfaces", "asset_relations",
    "asset_maintenance", "asset_attachments", "asset_visuals", "asset_media",
    "asset_media_versions", "asset_media_placements",
    "asset_enrichment_reports", "asset_enrichment_suggestions",
}
```

The exporter must filter every collection by `user = {:user}` and remove expanded fields. Preserve source `id`, timestamps, relations, and collection data needed for remapping. Do not export `ai_tasks`, `systems`, `website_monitors`, secrets, or browser state.

- [ ] **Step 4: Implement file collection and ZIP response**

For PocketBase file fields, enumerate collection file fields and read objects from `record.BaseFilesPath()` through `h.NewFilesystem()`. For asset media versions, resolve `object_key` through `newAssetMediaStore(h.assetMediaStoreRoot())`. Write `records.json` before final `manifest.json`, compute each file SHA256 while streaming, and use an `os.CreateTemp` file under `h.DataDir()/tmp/asset-migrations`.

Register:

```go
apiAuth.POST("/assets/migrations/export", h.exportAssetMigrationPackage).
    BindFunc(excludeReadOnlyRole).
    BindFunc(assetCenterModule)
```

The response must set `Content-Type: application/zip` and `Content-Disposition` with `.pulse-assets.zip`.

- [ ] **Step 5: Run export and permission tests**

Run: `go test -tags=testing -count=1 ./internal/hub -run 'TestExportAssetMigrationPackage|TestAssetMigrationExportPermissions'`

Expected: PASS.

## Task 3: Upload, Preflight, and Conflict Planning

**Files:**
- Modify: `internal/hub/asset_migration_contract.go`
- Create: `internal/hub/asset_migration_import.go`
- Modify: `internal/hub/asset_migration_test.go`
- Modify: `internal/hub/api.go`

- [ ] **Step 1: Write failing upload/preflight tests**

```go
func TestAssetMigrationPreflightReportsConflicts(t *testing.T) {
    fixture := newAssetMigrationFixture(t)
    uploadID := fixture.upload(fixture.packagePath)
    result := fixture.preflight(uploadID)
    require.Equal(t, "warning", result.Status)
    require.Equal(t, 1, result.Conflicts.Assets)
    require.Zero(t, result.Blockers)
}

func TestAssetMigrationPreflightBlocksChecksumMismatch(t *testing.T) {
    fixture := newAssetMigrationFixture(t)
    packagePath := tamperArchiveEntry(t, fixture.packagePath, "records.json")
    result := fixture.uploadAndPreflight(packagePath)
    require.Equal(t, "blocked", result.Status)
    require.Contains(t, result.Messages[0].Code, "checksum")
}
```

- [ ] **Step 2: Run preflight tests and verify failure**

Run: `go test -tags=testing -count=1 ./internal/hub -run TestAssetMigrationPreflight`

Expected: FAIL because upload/preflight endpoints do not exist.

- [ ] **Step 3: Implement staged upload and typed preflight**

Use server-generated IDs and store staged files under `h.DataDir()/tmp/asset-migrations/<upload-id>`. Define:

```go
type assetImportMode string
const (
    assetImportAddOnly        assetImportMode = "add_only"
    assetImportMerge          assetImportMode = "merge"
    assetImportReplaceMatched assetImportMode = "replace_matched"
)

type assetMigrationPreflight struct {
    UploadID string                    `json:"upload_id"`
    Status   string                    `json:"status"`
    Manifest assetPackageManifest      `json:"manifest"`
    Counts   map[string]int            `json:"counts"`
    Plan     map[assetImportMode]importPlan `json:"plan"`
    Messages []migrationMessage        `json:"messages"`
    Blockers int                       `json:"blockers"`
}
```

Match assets by saved migration origin, then unique `metadata.asset_tag`, then unique `serial_number + vendor + model`. Name, IP, and MAC only create warnings. Validate every required relation before returning `ready` or `warning`.

- [ ] **Step 4: Register upload and preflight routes**

```go
apiAuth.POST("/assets/migrations/upload", h.uploadAssetMigrationPackage).
    BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
apiAuth.POST("/assets/migrations/{id}/preflight", h.preflightAssetMigrationPackage).
    BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
```

Use `http.MaxBytesReader` before `ParseMultipartForm`. Reject filenames as identifiers and clean staged directories older than 24 hours.

- [ ] **Step 5: Run upload and preflight tests**

Run: `go test -tags=testing -count=1 ./internal/hub -run 'TestAssetMigrationUpload|TestAssetMigrationPreflight'`

Expected: PASS.

## Task 4: Transactional Import and File Commit

**Files:**
- Modify: `internal/hub/asset_migration_import.go`
- Modify: `internal/hub/asset_migration_test.go`

- [ ] **Step 1: Write round-trip and rollback tests**

```go
func TestApplyAssetMigrationRoundTripPreservesReferences(t *testing.T) {
    source, target := newAssetMigrationRoundTrip(t)
    result := target.apply(source.packagePath, assetImportAddOnly)
    require.Equal(t, "success", result.Status)
    requireAssetGraphMatches(t, source.hub, target.hub)
    requireAssetFilesMatch(t, source.hub, target.hub)
}

func TestApplyAssetMigrationRollsBackOnFileCommitFailure(t *testing.T) {
    fixture := newAssetMigrationFixture(t)
    fixture.makeTargetMediaReadOnly()
    before := fixture.targetCounts()
    err := fixture.applyExpectError(assetImportAddOnly)
    require.ErrorContains(t, err, "commit files")
    require.Equal(t, before, fixture.targetCounts())
}
```

- [ ] **Step 2: Run apply tests and verify failure**

Run: `go test -tags=testing -count=1 ./internal/hub -run TestApplyAssetMigration`

Expected: FAIL because apply logic is missing.

- [ ] **Step 3: Implement deterministic remapping and modes**

Use a mapping keyed by collection and source ID:

```go
type migrationIDMap map[string]map[string]string

func (m migrationIDMap) put(collection, sourceID, targetID string)
func (m migrationIDMap) require(collection, sourceID string) (string, error)
func rewriteAssetMigrationRelations(collection string, row map[string]any, ids migrationIDMap) error
```

Write in the design-specified order. `merge` only copies a source field when the target value is empty. `replace_matched` updates package-owned fields and children but does not delete unrelated assets. Store `metadata.migration_origin = {instance, record_id}` on imported assets for idempotent re-import.

- [ ] **Step 4: Make database and files atomic**

Prepare every file in a staging tree before `RunInTransaction`. During the transaction create/update records and assign PocketBase file uploads from staged content. For custom asset media, write to a transaction-specific pending directory; rename pending objects into the final store only after record validation, and register compensating deletes if the transaction or rename fails.

Register:

```go
apiAuth.POST("/assets/migrations/{id}/apply", h.applyAssetMigrationPackage).
    BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
```

Return created, merged, replaced, skipped, and file counts. Delete staging only after success or handled rollback.

- [ ] **Step 5: Run import tests**

Run: `go test -tags=testing -count=1 ./internal/hub -run 'TestApplyAssetMigration|TestAssetMigrationConflictModes|TestAssetMigrationIdempotent'`

Expected: PASS.

## Task 5: Frontend Asset Migration Flow

**Files:**
- Create: `internal/site/src/modules/asset-center/asset-migration.ts`
- Create: `internal/site/src/modules/asset-center/asset-migration.test.ts`
- Create: `internal/site/src/modules/asset-center/components/asset-migration-panel.tsx`
- Modify: `internal/site/src/modules/asset-center/components/asset-export-dialog.tsx`
- Modify: `internal/site/src/modules/asset-center/components/asset-import-dialog.tsx`
- Modify: `internal/site/src/components/routes/assets.tsx`

- [ ] **Step 1: Write failing client/view-model tests**

```ts
assert.equal(detectAssetImportKind("inventory.csv"), "rows")
assert.equal(detectAssetImportKind("legacy.json"), "rows")
assert.equal(detectAssetImportKind("home.pulse-assets.zip"), "package")

const model = buildAssetMigrationSummary(preflight)
assert.equal(model.blocked, false)
assert.equal(model.rows.find((row) => row.key === "asset_relations")?.count, 8)
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --experimental-strip-types internal/site/src/modules/asset-center/asset-migration.test.ts`

Expected: FAIL because module functions do not exist.

- [ ] **Step 3: Implement typed client helpers**

```ts
export type AssetMigrationMode = "add_only" | "merge" | "replace_matched"
export type AssetMigrationStatus = "ready" | "warning" | "blocked"

export async function downloadAssetMigrationPackage(): Promise<void>
export async function uploadAssetMigrationPackage(file: File): Promise<{ upload_id: string }>
export async function preflightAssetMigrationPackage(uploadId: string): Promise<AssetMigrationPreflight>
export async function applyAssetMigrationPackage(uploadId: string, mode: AssetMigrationMode): Promise<AssetMigrationResult>
```

Use `pb.send` for JSON calls and authenticated `fetch` for blob download/multipart upload. Extract the server filename from `Content-Disposition`, falling back to a timestamped `.pulse-assets.zip` name.

- [ ] **Step 4: Build the compact interaction**

`AssetMigrationPanel` states are `idle`, `uploading`, `preflighting`, `ready`, `applying`, `done`, and `error`. Use the existing dialog, table, button, alert, and segmented control patterns. Show counts, files, conflicts, warning/blocker messages, and the three modes. Disable confirm when blocked or running. `replace_matched` requires the existing destructive confirmation dialog.

Keep CSV/legacy JSON behavior in `AssetImportDialog`. The file input calls `detectAssetImportKind`; ZIP goes to `AssetMigrationPanel`, text formats continue through `FileReader` and current preview.

- [ ] **Step 5: Wire export and refresh**

Replace `onExportSnapshot` with `onExportPackage`. After apply success, close the dialog, call the existing asset reload path, and show exact created/merged/replaced/skipped counts. Do not add another page or route.

- [ ] **Step 6: Run frontend tests, typecheck, and build**

Run:

```powershell
node --experimental-strip-types internal/site/src/modules/asset-center/asset-migration.test.ts
npm.cmd --prefix internal/site run check -- --max-diagnostics=200
npm.cmd --prefix internal/site run build
```

Expected: all exit 0.

## Task 6: Durable Asset Numbering Settings

**Files:**
- Modify: `internal/site/src/modules/asset-center/asset-numbering.ts`
- Modify: `internal/site/src/modules/asset-center/asset-numbering.test.ts`
- Modify: `internal/site/src/components/routes/assets.tsx`

- [ ] **Step 1: Write failing migration tests**

```ts
const result = await loadDurableAssetNumberingSettings({
  server: null,
  legacy: { prefix: "HOME-", digits: "5", nextSequence: "42" },
  save: async (value) => saved.push(value),
})
assert.equal(result.prefix, "HOME-")
assert.deepEqual(saved, [{ prefix: "HOME-", digits: "5", nextSequence: "42" }])
```

Also cover server-first behavior, failed server save preserving legacy storage, and readonly users not attempting migration.

- [ ] **Step 2: Run and verify failure**

Run: `node --experimental-strip-types internal/site/src/modules/asset-center/asset-numbering.test.ts`

Expected: FAIL because durable settings helpers do not exist.

- [ ] **Step 3: Implement `user_settings` read/merge/save**

Store under `settings.asset_center.numbering` without replacing unrelated user settings. Add:

```ts
export async function loadDurableAssetNumberingSettings(): Promise<AssetNumberingSettings>
export async function saveDurableAssetNumberingSettings(settings: AssetNumberingSettings): Promise<void>
```

If server data is absent, read legacy `pulse.asset-center.numbering`, save it to the current user's record, then remove localStorage only after server success. If server data exists, it always wins.

- [ ] **Step 4: Wire the numbering dialog and run tests**

Update the assets route to await load when opening the numbering dialog and await save on confirmation. Keep the dialog layout unchanged.

Run:

```powershell
node --experimental-strip-types internal/site/src/modules/asset-center/asset-numbering.test.ts
npm.cmd --prefix internal/site run check -- --max-diagnostics=200
```

Expected: PASS and typecheck exit 0.

## Task 7: Asset Migration Documentation and Verification

**Files:**
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`
- Modify: `docs/module-architecture.md`

- [ ] **Step 1: Add release and About records**

Document that asset export now produces a restorable package with records and files; package import supports preflight, add/merge/replace, ID remapping, rollback, and audit; numbering settings now survive instance migration. Keep Web / Hub and documentation sections distinct.

- [ ] **Step 2: Run the complete focused verification**

```powershell
go test -tags=testing -count=1 -timeout=240s ./internal/hub -run 'Test(InspectZip|ExtractInspectedZip|AssetMigration)'
node --experimental-strip-types internal/site/src/modules/asset-center/asset-migration.test.ts
node --experimental-strip-types internal/site/src/modules/asset-center/asset-numbering.test.ts
npm.cmd --prefix internal/site run check -- --max-diagnostics=200
npm.cmd --prefix internal/site run build
```

Expected: every command exits 0.

- [ ] **Step 3: Perform an isolated round-trip**

Use test-created temporary Hub data directories, never current `pulse_data`: export fixture data, import into a clean Hub, then compare collection counts, relation endpoints, PocketBase attachment bytes, asset media hashes, and numbering setting values.

- [ ] **Step 4: Review the final diff**

Run `git diff --check` and inspect every touched file. Preserve all pre-existing dirty-worktree edits. Do not stage or commit an existing file unless its complete diff is known to belong to this task.
