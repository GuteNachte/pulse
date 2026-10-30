# Portable Instance Backup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create, upload, preflight, restore, and verify a portable Pulse instance backup that preserves all persistent data and externally stored asset media during formal deployment.

**Architecture:** PocketBase native backup remains the database and default-data payload. Pulse wraps it in a versioned outer ZIP with a manifest and optional external media, stores restore state outside the replaceable data tree, and resumes post-restore file placement and verification during Hub startup. The settings page remains the single compact control surface.

**Tech Stack:** Go 1.24, PocketBase 0.39.4 backup APIs, `archive/zip`, SHA256, React 19, TypeScript 6, existing operations audit and settings components, Docker Compose persistent bind mounts.

---

## File Map

- Reuse `internal/hub/archive_safety.go` from the asset migration phase.
- Create `internal/hub/portable_backup_contract.go`: manifest, preflight, task, storage target, and legacy backup types.
- Create `internal/hub/portable_backup_create.go`: native backup creation, external media capture, outer ZIP, listing metadata, and download.
- Create `internal/hub/portable_backup_upload.go`: bounded upload and package preflight.
- Create `internal/hub/portable_backup_restore.go`: automatic safety backup, restore marker, PocketBase restore, startup resume, rollback, and verification.
- Create `internal/hub/portable_backup_test.go`: create/upload/preflight/restore tests and external media coverage.
- Modify `internal/hub/admin.go`: delegate existing backup handlers to portable package services while keeping legacy native ZIP compatibility.
- Modify `internal/hub/api.go`: add upload, preflight, task status, and restore target inputs under the maintenance gate.
- Modify `internal/hub/hub.go`: resume an interrupted restore before normal jobs start.
- Create `internal/site/src/modules/maintenance/backup-model.ts`: typed records, preflight, task stage, and view-model helpers.
- Create `internal/site/src/modules/maintenance/backup-model.test.ts`: status, compatibility, and task display tests.
- Create `internal/site/src/modules/maintenance/backup-client.ts`: list/create/upload/preflight/restore/download/delete/task APIs.
- Modify `internal/site/src/components/routes/settings/backups.tsx`: compact upload, version/scope/checksum columns, preflight, restore target, and progress.
- Modify `internal/site/src/components/mobile/mobile-backups.tsx`: preserve existing mobile actions and add type/checksum text without a redesign.
- Modify deployment and release documentation listed in the design spec.

## Task 1: Portable Backup Contract and Creation

**Files:**
- Create: `internal/hub/portable_backup_contract.go`
- Create: `internal/hub/portable_backup_create.go`
- Create: `internal/hub/portable_backup_test.go`
- Modify: `internal/hub/admin.go`

- [ ] **Step 1: Write failing creation tests**

```go
func TestCreatePortableBackupWrapsPocketBaseAndManifest(t *testing.T) {
    fixture := newPortableBackupFixture(t)
    backup := fixture.create()
    requireArchiveEntry(t, backup.Path, "manifest.json")
    requireArchiveEntry(t, backup.Path, "pocketbase.zip")
    require.Equal(t, portableBackupSchemaV1, backup.Manifest.Schema)
    require.Equal(t, "instance", backup.Manifest.Scope)
}

func TestCreatePortableBackupIncludesExternalAssetMedia(t *testing.T) {
    fixture := newPortableBackupFixture(t)
    fixture.useExternalMediaStore()
    backup := fixture.create()
    requireArchivePrefix(t, backup.Path, "external/asset_media/")
    require.True(t, backup.Manifest.External.AssetMedia.Included)
}
```

- [ ] **Step 2: Run and verify failure**

Run: `go test -tags=testing -count=1 ./internal/hub -run TestCreatePortableBackup`

Expected: FAIL because portable backup services do not exist.

- [ ] **Step 3: Define the versioned contract**

```go
const portableBackupSchemaV1 = "pulse.instance.backup.v1"

type portableBackupManifest struct {
    Schema            string                 `json:"schema"`
    BackupID          string                 `json:"backup_id"`
    Scope             string                 `json:"scope"`
    PulseVersion      string                 `json:"pulse_version"`
    PocketBaseVersion string                 `json:"pocketbase_version"`
    DatabaseSchema    string                 `json:"database_schema"`
    CreatedAt         string                 `json:"created_at"`
    SourceInstance    string                 `json:"source_instance"`
    Payloads          []archiveEntry         `json:"payloads"`
    External          portableExternalStores `json:"external"`
}

type appBackupRecord struct {
    Key          string `json:"key"`
    Size         int64  `json:"size"`
    Modified     string `json:"modified"`
    Type         string `json:"type"`
    PulseVersion string `json:"pulse_version,omitempty"`
    Checksum     string `json:"checksum"`
    Scope        string `json:"scope"`
}
```

Types are `pulse` and `legacy`; checksum states are `verified`, `unchecked`, and `failed`.

- [ ] **Step 4: Implement creation around PocketBase backup**

Call `e.App.CreateBackup(ctx, nativeName)`, copy that native archive into the outer ZIP as `pocketbase.zip`, and remove the temporary native backup only after the outer package is safely stored. If `h.assetMediaStoreRoot()` is outside `h.DataDir()`, walk regular files only, enforce archive limits, and add them under `external/asset_media` with hashes.

Keep existing `/backups` creation semantics but return the portable `.pulse-backup.zip` key. `listBackups` inspects only `manifest.json` for Pulse packages; legacy `.zip` entries remain listed without pretending they are verified portable packages.

- [ ] **Step 5: Run creation/list tests**

Run: `go test -tags=testing -count=1 ./internal/hub -run 'TestCreatePortableBackup|TestListBackupsIncludesLegacyAndPortable'`

Expected: PASS.

## Task 2: Upload and Compatibility Preflight

**Files:**
- Create: `internal/hub/portable_backup_upload.go`
- Modify: `internal/hub/portable_backup_test.go`
- Modify: `internal/hub/api.go`

- [ ] **Step 1: Write failing upload/preflight tests**

```go
func TestPortableBackupPreflightAcceptsCurrentVersion(t *testing.T) {
    fixture := newPortableBackupFixture(t)
    key := fixture.upload(fixture.create().Path)
    result := fixture.preflight(key, portableRestoreOptions{})
    require.Equal(t, "ready", result.Status)
    require.Empty(t, result.Blockers)
}

func TestPortableBackupPreflightBlocksNewerPulseVersion(t *testing.T) {
    fixture := newPortableBackupFixture(t)
    path := fixture.packageWithPulseVersion("99.0.0")
    result := fixture.uploadAndPreflight(path)
    require.Equal(t, "blocked", result.Status)
    require.Contains(t, result.Blockers[0].Code, "newer_version")
}
```

- [ ] **Step 2: Run and verify failure**

Run: `go test -tags=testing -count=1 ./internal/hub -run TestPortableBackupPreflight`

Expected: FAIL because upload/preflight handlers are missing.

- [ ] **Step 3: Implement bounded upload and preflight**

Use `http.MaxBytesReader`, a server-generated filename, and the configured backups filesystem. Preflight checks outer ZIP safety, manifest schema, every payload SHA256, inner `pocketbase.zip` readability, current-version compatibility, target data/media directory writability, and free space for uploaded package + extracted payload + automatic safety backup.

```go
type portableBackupPreflight struct {
    Key        string                 `json:"key"`
    Status     string                 `json:"status"`
    Manifest   portableBackupManifest `json:"manifest"`
    Target     restoreStorageTarget   `json:"target"`
    Checks     []backupCheck          `json:"checks"`
    Blockers   []backupCheck          `json:"blockers"`
    Warnings   []backupCheck          `json:"warnings"`
}
```

If external media exists, default `Target.AssetMediaRoot` to `filepath.Join(h.DataDir(), "asset_media")`; never reuse the source absolute path automatically.

- [ ] **Step 4: Register admin-only maintenance routes**

```go
apiAuth.POST("/backups/upload", h.uploadPortableBackup).
    BindFunc(requireAdminRole).BindFunc(maintenanceModule)
apiAuth.POST("/backups/{key}/preflight", h.preflightPortableBackup).
    BindFunc(requireAdminRole).BindFunc(maintenanceModule)
```

Keep existing list/download/delete routes and operation audit. Audit upload and preflight without recording secrets or manifest file content.

- [ ] **Step 5: Run upload/preflight/security tests**

Run: `go test -tags=testing -count=1 ./internal/hub -run 'TestPortableBackupUpload|TestPortableBackupPreflight|TestPortableBackupPermissions'`

Expected: PASS.

## Task 3: Safety Backup and Resumable Restore

**Files:**
- Create: `internal/hub/portable_backup_restore.go`
- Modify: `internal/hub/portable_backup_test.go`
- Modify: `internal/hub/admin.go`
- Modify: `internal/hub/api.go`
- Modify: `internal/hub/hub.go`

- [ ] **Step 1: Write failing restore-state tests**

```go
func TestPortableRestoreCreatesSafetyBackupBeforeRestore(t *testing.T) {
    fixture := newPortableBackupFixture(t)
    task := fixture.startRestore(fixture.create().Key)
    require.NotEmpty(t, task.SafetyBackupKey)
    require.Less(t, task.StageIndex("safety_backup"), task.StageIndex("restore_database"))
}

func TestPortableRestoreResumesExternalMediaAfterRestart(t *testing.T) {
    fixture := newPortableBackupFixture(t)
    task := fixture.stageRestartBoundary()
    restarted := fixture.restartHub()
    require.NoError(t, restarted.resumePendingPortableRestore())
    require.Equal(t, "success", fixture.readTask(task.ID).Status)
    requireExternalMediaMatches(t, fixture.sourceMedia, fixture.targetMedia)
}
```

- [ ] **Step 2: Run and verify failure**

Run: `go test -tags=testing -count=1 ./internal/hub -run TestPortableRestore`

Expected: FAIL because restore task persistence does not exist.

- [ ] **Step 3: Persist restore state outside the replaceable data tree**

Derive a state directory adjacent to `h.DataDir()`, for example `<data-dir>.restore-state`, and atomically write JSON with temp-file + rename:

```go
type portableRestoreTask struct {
    ID              string               `json:"id"`
    Key             string               `json:"key"`
    Status          string               `json:"status"`
    Stage           string               `json:"stage"`
    SafetyBackupKey string               `json:"safety_backup_key"`
    Target          restoreStorageTarget `json:"target"`
    Error           string               `json:"error,omitempty"`
    UpdatedAt       string               `json:"updated_at"`
}
```

Never store passwords, Token values, AI keys, or archive contents in task state.

- [ ] **Step 4: Implement restore stages and rollback**

Stages are exactly:

1. `preflight`
2. `safety_backup`
3. `stage_payloads`
4. `restore_database`
5. `restore_external_media`
6. `apply_storage_settings`
7. `verify`
8. `success`

Before `RestoreBackup`, create a portable safety backup of the current target. Extract external media into restore state, place inner `pocketbase.zip` into the backups filesystem, then call PocketBase restore. On startup, `resumePendingPortableRestore` restores external files to the chosen target, updates `system_settings.asset_media_store`, checks administrator count, core collections, relation references, expected file counts, and media writability, then marks success.

If post-restore verification fails, attempt restore from `SafetyBackupKey`; if rollback also fails, keep status `manual_recovery_required`, log both errors, and do not report health as successful.

- [ ] **Step 5: Add restore and task APIs**

```go
apiAuth.POST("/backups/{key}/restore", h.restorePortableBackup).
    BindFunc(requireAdminRole).BindFunc(maintenanceModule)
apiAuth.GET("/backups/tasks/{id}", h.getPortableRestoreTask).
    BindFunc(requireAdminRole).BindFunc(maintenanceModule)
```

Restore accepts `{ "asset_media_root": "..." }`, re-runs preflight server-side, returns HTTP 202 and a task ID, and records operation audit for start, success, failure, and rollback.

- [ ] **Step 6: Run restore and rollback tests**

Run: `go test -tags=testing -count=1 -timeout=240s ./internal/hub -run 'TestPortableRestore|TestPortableBackupRestoreAudit'`

Expected: PASS.

## Task 4: Settings Backup Client and View Model

**Files:**
- Create: `internal/site/src/modules/maintenance/backup-model.ts`
- Create: `internal/site/src/modules/maintenance/backup-model.test.ts`
- Create: `internal/site/src/modules/maintenance/backup-client.ts`

- [ ] **Step 1: Write failing view-model tests**

```ts
const row = buildBackupRow({
  key: "pulse-instance.pulse-backup.zip",
  type: "pulse",
  checksum: "verified",
  scope: "instance",
  pulse_version: "1.0.6",
  size: 2048,
  modified: "2026-07-24T00:00:00Z",
})
assert.equal(row.typeLabel, "Pulse 完整备份")
assert.equal(row.checksumLabel, "校验通过")
```

Cover legacy backup labels, blocked preflight, task stages, and `manual_recovery_required` text.

- [ ] **Step 2: Run and verify failure**

Run: `node --experimental-strip-types internal/site/src/modules/maintenance/backup-model.test.ts`

Expected: FAIL because maintenance backup modules do not exist.

- [ ] **Step 3: Implement model and client functions**

```ts
export async function listBackups(): Promise<BackupRecord[]>
export async function createPortableBackup(): Promise<BackupRecord>
export async function uploadPortableBackup(file: File): Promise<BackupRecord>
export async function preflightPortableBackup(key: string, target?: RestoreStorageTarget): Promise<BackupPreflight>
export async function startPortableRestore(key: string, target: RestoreStorageTarget): Promise<RestoreTask>
export async function getRestoreTask(id: string): Promise<RestoreTask>
export async function downloadBackup(record: BackupRecord): Promise<void>
export async function deleteBackup(record: BackupRecord): Promise<void>
```

Use authenticated `fetch` for upload/download and `pb.send` for JSON. Poll restore task at two seconds while the Hub is reachable; after disconnect, poll `/api/health` with bounded backoff, then require reauthentication.

- [ ] **Step 4: Run the model test**

Run: `node --experimental-strip-types internal/site/src/modules/maintenance/backup-model.test.ts`

Expected: PASS.

## Task 5: Compact Backup Management UI

**Files:**
- Modify: `internal/site/src/components/routes/settings/backups.tsx`
- Modify: `internal/site/src/components/mobile/mobile-backups.tsx`

- [ ] **Step 1: Replace inline API code with the maintenance client**

Keep the existing page shell, summary cards, table, mobile view, and operation confirmation dialog. State becomes:

```ts
type BackupPageState = {
  uploading: boolean
  preflight: BackupPreflight | null
  restoreTarget: BackupRecord | null
  restoreTask: RestoreTask | null
  target: RestoreStorageTarget
}
```

- [ ] **Step 2: Add upload and preflight interaction**

Add an icon button/text button “上传备份” next to “立即备份”. Accept `.zip,.pulse-backup.zip`. After upload, automatically preflight and open the existing confirmation dialog with checks grouped as passed, warning, and blocked. Show external media target input only when the manifest includes external media.

- [ ] **Step 3: Expand the compact table**

Columns: file, type/version, scope/checksum, size, time, operations. Use text plus existing status treatments, no decorative cards. Legacy rows show “旧版原生备份 / 未校验”. Restore of a Pulse package requires preflight; legacy restore keeps the existing warning.

- [ ] **Step 4: Show restore progress and re-login outcome**

Reuse `OperationConfirmDialog` progress mode. Display the exact backend stage labels. When Hub restart invalidates the target session, clear stale auth and show “恢复完成，请使用备份中的管理员账号重新登录.” Do not claim success until backend verification reports `success`.

- [ ] **Step 5: Run frontend verification**

```powershell
node --experimental-strip-types internal/site/src/modules/maintenance/backup-model.test.ts
npm.cmd --prefix internal/site run check -- --max-diagnostics=200
npm.cmd --prefix internal/site run build
```

Expected: all exit 0.

## Task 6: Deployment Documentation and End-to-End Restore Drill

**Files:**
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`
- Modify: `docs/local-dev-runbook.md`
- Modify: `docs/release-deployment-runbook.md`
- Modify: `docs/flynas-compose-checklist.md`
- Modify: `docs/module-architecture.md`

- [ ] **Step 1: Update version records and operator documentation**

Document portable package creation/upload/preflight/restore, automatic safety backup, external media target handling, sensitive-data warning, and the distinction between asset migration packages and full instance backups. Keep `./pulse_data:/pulse_data` as the required Compose mount and explicitly forbid deleting it during upgrades.

- [ ] **Step 2: Run backend and frontend regression suites**

```powershell
go test -tags=testing -count=1 -timeout=300s ./internal/hub -run 'Test(InspectZip|ExtractInspectedZip|AssetMigration|PortableBackup|PortableRestore)'
go test -tags=testing -count=1 -timeout=300s ./internal/hub
npm.cmd --prefix internal/site run check -- --max-diagnostics=200
npm.cmd --prefix internal/site run build
```

Expected: all exit 0.

- [ ] **Step 3: Execute a clean-instance restore drill**

Use temporary directories outside current `pulse_data`:

```powershell
$source = Join-Path $env:TEMP 'pulse-backup-source'
$target = Join-Path $env:TEMP 'pulse-backup-target'
```

Copy only the test fixture into `$source`, create a portable backup through the Hub API, start a second Hub with `$target`, create a temporary admin, upload/preflight/restore, then authenticate with the source admin. Compare assets, interfaces, relations, locations, settings, topology layouts, monitor records, attachment bytes, and asset media hashes. Verify `/api/health` returns 200.

Never point the drill at `C:\Users\Nacht\Documents\PL\pulse_data`.

- [ ] **Step 4: Confirm deployment persistence**

Run Compose configuration validation and inspect mounts without modifying production:

```powershell
docker compose -f supplemental/docker/hub/docker-compose.yml config
```

Expected: Hub binds `./pulse_data` to `/pulse_data`; no anonymous volume replaces it.

- [ ] **Step 5: Review final changes**

Run `git diff --check`, inspect all user-visible strings, verify release/About records, and preserve all unrelated dirty-worktree changes. Do not stage existing files whose complete diff cannot be attributed to this implementation.
