package hub

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
)

func (h *Hub) startPortableRestore(e *core.RequestEvent, key string) error {
	var target restoreStorageTarget
	if e.Request.Body != nil && e.Request.ContentLength != 0 {
		if err := e.BindBody(&target); err != nil {
			return e.BadRequestError("Invalid restore target.", err)
		}
	}
	if target.AssetMediaRoot == "" {
		target.AssetMediaRoot = filepath.Join(h.DataDir(), "asset_media")
	}
	localPath, cleanup, err := h.downloadBackupToTemporary(key)
	if err != nil {
		return e.NotFoundError("Backup not found.", err)
	}
	defer cleanup()
	manifest, inspection, err := readPortableBackupPackage(localPath)
	if err != nil {
		return e.BadRequestError("Invalid Pulse backup package.", err)
	}
	if manifest.External.AssetMedia.Included {
		if err := ensureWritableDirectory(target.AssetMediaRoot); err != nil {
			return e.BadRequestError("Restore target is not writable.", err)
		}
	}

	task := portableRestoreTask{
		ID: core.GenerateDefaultRandomId(), Key: key, Status: "running", Stage: "safety_backup",
		Target: target, Manifest: manifest, UpdatedAt: time.Now().UTC().Format(time.RFC3339),
	}
	taskDir := h.portableRestoreTaskDir(task.ID)
	if err := os.MkdirAll(filepath.Join(taskDir, "payload"), 0o700); err != nil {
		return e.InternalServerError("Failed to create restore state.", err)
	}
	if err := h.writePortableRestoreTask(task); err != nil {
		return e.InternalServerError("Failed to save restore state.", err)
	}
	task.SafetyBackupKey = fmt.Sprintf("pulse_safety_%s_%s.zip", time.Now().Format("20060102_150405"), task.ID[:6])
	task.SafetyNativeBackupKey = fmt.Sprintf("pulse_safety_native_%s_%s.zip", time.Now().Format("20060102_150405"), task.ID[:6])
	task.SafetyAssetMediaRoot = h.assetMediaStoreRoot()
	if _, err := h.createPortableBackup(context.Background(), task.SafetyBackupKey); err != nil {
		task.Status, task.Stage, task.Error = "failed", "safety_backup", err.Error()
		_ = h.writePortableRestoreTask(task)
		return e.InternalServerError("Failed to create automatic safety backup.", err)
	}
	if err := h.stagePortableNativeBackup(context.Background(), task.SafetyBackupKey, task.SafetyNativeBackupKey); err != nil {
		task.Status, task.Stage, task.Error = "failed", "safety_backup", err.Error()
		_ = h.writePortableRestoreTask(task)
		return e.InternalServerError("Failed to prepare automatic rollback backup.", err)
	}
	task.Stage = "stage_payloads"
	_ = h.writePortableRestoreTask(task)
	if err := extractInspectedZip(localPath, filepath.Join(taskDir, "payload"), inspection); err != nil {
		task.Status, task.Error = "failed", err.Error()
		_ = h.writePortableRestoreTask(task)
		return e.InternalServerError("Failed to stage restore payloads.", err)
	}
	task.NativeBackupKey = "pulse_restore_" + task.ID + ".zip"
	backups, err := h.NewBackupsFilesystem()
	if err != nil {
		return e.InternalServerError("Failed to open backup storage.", err)
	}
	upload, err := filesystem.NewFileFromPath(filepath.Join(taskDir, "payload", "pocketbase.zip"))
	if err == nil {
		upload.Name, upload.OriginalName = task.NativeBackupKey, task.NativeBackupKey
		err = backups.UploadFile(upload, task.NativeBackupKey)
	}
	_ = backups.Close()
	if err != nil {
		task.Status, task.Error = "failed", err.Error()
		_ = h.writePortableRestoreTask(task)
		return e.InternalServerError("Failed to stage database backup.", err)
	}
	task.Stage = "restore_database"
	_ = h.writePortableRestoreTask(task)
	h.createOperationAudit(e, "", "restore_backup", key, "", "success", "完整实例恢复已开始")
	app := h.App
	go func(task portableRestoreTask) {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Minute)
		defer cancel()
		if err := app.RestoreBackup(ctx, task.NativeBackupKey); err != nil {
			task.Status, task.Error = "failed", err.Error()
			_ = h.writePortableRestoreTask(task)
			app.Logger().Error("Failed to restore portable backup", "key", task.Key, "err", err)
		}
	}(task)
	return e.JSON(http.StatusAccepted, task)
}

func (h *Hub) getPortableRestoreTask(e *core.RequestEvent) error {
	task, err := h.readPortableRestoreTask(strings.TrimSpace(e.Request.PathValue("id")))
	if err != nil {
		return e.NotFoundError("Restore task not found.", err)
	}
	return e.JSON(http.StatusOK, task)
}

func (h *Hub) portableRestoreStateRoot() string {
	return filepath.Join(h.DataDir(), core.LocalBackupsDirName, ".restore-state")
}
func (h *Hub) portableRestoreTaskDir(id string) string {
	return filepath.Join(h.portableRestoreStateRoot(), id)
}

func (h *Hub) writePortableRestoreTask(task portableRestoreTask) error {
	if strings.TrimSpace(task.ID) == "" {
		return fmt.Errorf("restore task id is required")
	}
	directory := h.portableRestoreTaskDir(task.ID)
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return err
	}
	task.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	content, err := json.MarshalIndent(task, "", "  ")
	if err != nil {
		return err
	}
	temporary, err := os.CreateTemp(directory, ".task-*.tmp")
	if err != nil {
		return err
	}
	name := temporary.Name()
	defer os.Remove(name)
	if _, err := temporary.Write(content); err != nil {
		temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	return os.Rename(name, filepath.Join(directory, "task.json"))
}

func (h *Hub) readPortableRestoreTask(id string) (portableRestoreTask, error) {
	task := portableRestoreTask{}
	if !assetMigrationUploadIDPattern.MatchString(id) {
		return task, fmt.Errorf("invalid restore task id")
	}
	content, err := os.ReadFile(filepath.Join(h.portableRestoreTaskDir(id), "task.json"))
	if err != nil {
		return task, err
	}
	if err := json.Unmarshal(content, &task); err != nil {
		return task, err
	}
	return task, nil
}

func (h *Hub) resumePendingPortableRestore() error {
	entries, err := os.ReadDir(h.portableRestoreStateRoot())
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		task, err := h.readPortableRestoreTask(entry.Name())
		if err != nil || task.Status != "running" {
			continue
		}
		if task.Stage == "rollback" {
			task.Status, task.Stage = "rolled_back", "rollback_complete"
			task.Error = "恢复核验失败，已自动回滚到安全备份"
			_ = h.writePortableRestoreTask(task)
			continue
		}
		if task.Stage != "restore_database" {
			continue
		}
		task.Stage = "restore_external_media"
		_ = h.writePortableRestoreTask(task)
		if err := h.restorePortableExternalMedia(task); err != nil {
			return h.rollbackPortableRestore(task, err)
		}
		task.Stage = "apply_storage_settings"
		_ = h.writePortableRestoreTask(task)
		if err := h.applyPortableRestoreStorageSettings(task); err != nil {
			return h.rollbackPortableRestore(task, err)
		}
		task.Stage = "verify"
		_ = h.writePortableRestoreTask(task)
		if err := h.verifyPortableRestore(task); err != nil {
			return h.rollbackPortableRestore(task, err)
		}
		task.Status, task.Stage, task.Error = "success", "success", ""
		_ = h.writePortableRestoreTask(task)
	}
	return nil
}

func (h *Hub) restorePortableExternalMedia(task portableRestoreTask) error {
	if !task.Manifest.External.AssetMedia.Included {
		return nil
	}
	sourceRoot := filepath.Join(h.portableRestoreTaskDir(task.ID), "payload", "external", "asset_media")
	return replacePortableRestoreDirectory(sourceRoot, task.Target.AssetMediaRoot)
}

func copyPortableRestoreFile(source, target string) error {
	input, err := os.Open(source)
	if err != nil {
		return err
	}
	defer input.Close()
	output, err := os.OpenFile(target, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(output, input)
	closeErr := output.Close()
	if copyErr != nil {
		return copyErr
	}
	return closeErr
}

func (h *Hub) applyPortableRestoreStorageSettings(task portableRestoreTask) error {
	if !task.Manifest.External.AssetMedia.Included {
		return nil
	}
	record, err := h.FindFirstRecordByFilter("system_settings", "key = 'asset_media_store'", nil)
	if err != nil {
		collection, findErr := h.FindCachedCollectionByNameOrId("system_settings")
		if findErr != nil {
			return findErr
		}
		record = core.NewRecord(collection)
		record.Set("key", "asset_media_store")
	}
	record.Set("settings", map[string]any{"root": task.Target.AssetMediaRoot})
	return h.Save(record)
}

func (h *Hub) verifyPortableRestore(task portableRestoreTask) error {
	admins, err := h.FindRecordsByFilter("users", "role = 'admin'", "", 1, 0, nil)
	if err != nil || len(admins) == 0 {
		return fmt.Errorf("恢复后未找到管理员账号")
	}
	for _, collection := range []string{"assets", "asset_interfaces", "asset_relations", "user_settings", "system_settings"} {
		if _, err := h.FindCachedCollectionByNameOrId(collection); err != nil {
			return fmt.Errorf("恢复后缺少集合 %s: %w", collection, err)
		}
	}
	if task.Manifest.External.AssetMedia.Included {
		return ensureWritableDirectory(task.Target.AssetMediaRoot)
	}
	return nil
}

func (h *Hub) rollbackPortableRestore(task portableRestoreTask, cause error) error {
	task.Stage, task.Error = "rollback", cause.Error()
	_ = h.writePortableRestoreTask(task)
	if task.SafetyNativeBackupKey == "" {
		task.SafetyNativeBackupKey = "pulse_safety_native_" + task.ID + ".zip"
		if err := h.stagePortableNativeBackup(context.Background(), task.SafetyBackupKey, task.SafetyNativeBackupKey); err != nil {
			task.Status, task.Stage, task.Error = "manual_recovery_required", "rollback_failed", cause.Error()+"; rollback staging: "+err.Error()
			_ = h.writePortableRestoreTask(task)
			return fmt.Errorf("restore verification failed and rollback staging failed: %w", err)
		}
		_ = h.writePortableRestoreTask(task)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Minute)
	defer cancel()
	if err := h.restorePortableSafetyMedia(task); err != nil {
		task.Status, task.Stage, task.Error = "manual_recovery_required", "rollback_failed", cause.Error()+"; media rollback: "+err.Error()
		_ = h.writePortableRestoreTask(task)
		return fmt.Errorf("restore verification failed and media rollback failed: %w", err)
	}
	if err := h.RestoreBackup(ctx, portableRestoreRollbackBackupKey(task)); err != nil {
		task.Status, task.Stage, task.Error = "manual_recovery_required", "rollback_failed", cause.Error()+"; rollback: "+err.Error()
		_ = h.writePortableRestoreTask(task)
		return fmt.Errorf("restore verification failed and rollback failed: %w", err)
	}
	return nil
}

func portableRestoreRollbackBackupKey(task portableRestoreTask) string {
	return task.SafetyNativeBackupKey
}

func (h *Hub) restorePortableSafetyMedia(task portableRestoreTask) error {
	originalRoot := strings.TrimSpace(task.SafetyAssetMediaRoot)
	if originalRoot == "" || pathWithinDirectory(h.DataDir(), originalRoot) {
		return nil
	}
	localPath, cleanup, err := h.downloadBackupToTemporary(task.SafetyBackupKey)
	if err != nil {
		return err
	}
	defer cleanup()
	_, inspection, err := readPortableBackupPackage(localPath)
	if err != nil {
		return err
	}
	staging, err := os.MkdirTemp(filepath.Join(h.DataDir(), core.LocalTempDirName), "rollback-media-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(staging)
	if err := extractInspectedZip(localPath, staging, inspection); err != nil {
		return err
	}
	if targetRoot := strings.TrimSpace(task.Target.AssetMediaRoot); targetRoot != "" && !samePortableRestorePath(targetRoot, originalRoot) {
		if err := removePortableRestoreMediaPayloads(targetRoot, task.Manifest); err != nil {
			return err
		}
	}
	return replacePortableRestoreDirectory(filepath.Join(staging, "external", "asset_media"), originalRoot)
}

func removePortableRestoreMediaPayloads(root string, manifest portableBackupManifest) error {
	const prefix = "external/asset_media/"
	for _, payload := range manifest.Payloads {
		if !strings.HasPrefix(payload.Path, prefix) {
			continue
		}
		target := filepath.Join(root, filepath.FromSlash(strings.TrimPrefix(payload.Path, prefix)))
		if err := ensurePathWithinRoot(root, target); err != nil {
			return err
		}
		if err := os.Remove(target); err != nil && !os.IsNotExist(err) {
			return err
		}
	}
	return nil
}

func replacePortableRestoreDirectory(source, target string) error {
	cleanTarget := filepath.Clean(target)
	volumeRoot := filepath.VolumeName(cleanTarget) + string(filepath.Separator)
	if cleanTarget == "." || cleanTarget == volumeRoot {
		return fmt.Errorf("refusing to replace unsafe media root: %s", target)
	}
	if err := os.MkdirAll(filepath.Dir(cleanTarget), 0o755); err != nil {
		return err
	}
	staging, err := os.MkdirTemp(filepath.Dir(cleanTarget), ".pulse-media-rollback-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(staging)
	if _, err := os.Stat(source); err == nil {
		if err := copyPortableRestoreDirectory(source, staging); err != nil {
			return err
		}
	} else if !os.IsNotExist(err) {
		return err
	}
	previous := cleanTarget + ".pulse-rollback-previous"
	_ = os.RemoveAll(previous)
	if _, err := os.Stat(cleanTarget); err == nil {
		if err := os.Rename(cleanTarget, previous); err != nil {
			return err
		}
	} else if !os.IsNotExist(err) {
		return err
	}
	if err := os.Rename(staging, cleanTarget); err != nil {
		_ = os.Rename(previous, cleanTarget)
		return err
	}
	return os.RemoveAll(previous)
}

func copyPortableRestoreDirectory(source, target string) error {
	return filepath.WalkDir(source, func(filename string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		relative, err := filepath.Rel(source, filename)
		if err != nil {
			return err
		}
		if relative == "." {
			return nil
		}
		destination := filepath.Join(target, relative)
		if entry.IsDir() {
			return os.MkdirAll(destination, 0o755)
		}
		if !entry.Type().IsRegular() {
			return fmt.Errorf("rollback media entry is not regular: %s", filename)
		}
		if err := os.MkdirAll(filepath.Dir(destination), 0o755); err != nil {
			return err
		}
		return copyPortableRestoreFile(filename, destination)
	})
}

func samePortableRestorePath(left, right string) bool {
	leftAbs, leftErr := filepath.Abs(left)
	rightAbs, rightErr := filepath.Abs(right)
	return leftErr == nil && rightErr == nil && strings.EqualFold(filepath.Clean(leftAbs), filepath.Clean(rightAbs))
}

func (h *Hub) stagePortableNativeBackup(ctx context.Context, portableKey, nativeKey string) error {
	localPath, cleanup, err := h.downloadBackupToTemporary(portableKey)
	if err != nil {
		return err
	}
	defer cleanup()
	_, inspection, err := readPortableBackupPackage(localPath)
	if err != nil {
		return err
	}
	staging, err := os.MkdirTemp(filepath.Join(h.DataDir(), core.LocalTempDirName), "rollback-native-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(staging)
	if err := extractInspectedZip(localPath, staging, inspection); err != nil {
		return err
	}
	nativePath := filepath.Join(staging, "pocketbase.zip")
	nativeInspection, err := inspectZip(nativePath, portableBackupArchiveLimits())
	if err != nil {
		return fmt.Errorf("inspect rollback backup: %w", err)
	}
	if _, exists := nativeInspection.byPath["data.db"]; !exists {
		return fmt.Errorf("rollback backup is missing data.db")
	}
	backups, err := h.NewBackupsFilesystem()
	if err != nil {
		return err
	}
	defer backups.Close()
	backups.SetContext(ctx)
	upload, err := filesystem.NewFileFromPath(nativePath)
	if err != nil {
		return err
	}
	upload.Name, upload.OriginalName = nativeKey, nativeKey
	return backups.UploadFile(upload, nativeKey)
}
