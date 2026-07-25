package hub

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	pulse "gutenacht.site/pulse"
)

const maxPortableBackupUploadBytes int64 = 8 << 30

func (h *Hub) uploadPortableBackup(e *core.RequestEvent) error {
	e.Request.Body = http.MaxBytesReader(e.Response, e.Request.Body, maxPortableBackupUploadBytes)
	if err := e.Request.ParseMultipartForm(32 << 20); err != nil {
		return e.BadRequestError("Invalid backup upload.", err)
	}
	defer e.Request.MultipartForm.RemoveAll()
	source, _, err := e.Request.FormFile("file")
	if err != nil {
		return e.BadRequestError("Backup file is required.", err)
	}
	defer source.Close()
	staging, err := os.MkdirTemp(filepath.Join(h.DataDir(), core.LocalTempDirName), "backup-upload-")
	if err != nil {
		return e.InternalServerError("Failed to prepare backup upload.", err)
	}
	defer os.RemoveAll(staging)
	localPath := filepath.Join(staging, "upload.zip")
	file, err := os.OpenFile(localPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return e.InternalServerError("Failed to stage backup upload.", err)
	}
	written, copyErr := io.Copy(file, io.LimitReader(source, maxPortableBackupUploadBytes+1))
	closeErr := file.Close()
	if copyErr != nil || closeErr != nil || written == 0 || written > maxPortableBackupUploadBytes {
		return e.BadRequestError("Backup upload is empty, too large, or incomplete.", copyErr)
	}
	manifest, _, err := readPortableBackupPackage(localPath)
	if err != nil {
		return e.BadRequestError("Invalid Pulse backup package.", err)
	}
	key := fmt.Sprintf("pulse_uploaded_%s_%s.zip", time.Now().Format("20060102_150405"), core.GenerateDefaultRandomId()[:6])
	backups, err := h.NewBackupsFilesystem()
	if err != nil {
		return e.InternalServerError("Failed to open backup storage.", err)
	}
	defer backups.Close()
	upload, err := filesystem.NewFileFromPath(localPath)
	if err != nil {
		return e.InternalServerError("Failed to prepare backup storage object.", err)
	}
	upload.Name, upload.OriginalName = key, key
	if err := backups.UploadFile(upload, key); err != nil {
		return e.InternalServerError("Failed to store backup upload.", err)
	}
	h.createOperationAudit(e, "", "upload_backup", key, "", "success", "完整实例备份已上传")
	return e.JSON(http.StatusOK, appBackupRecord{Key: key, Size: written, Modified: time.Now().UTC().Format(time.RFC3339), Type: "pulse", PulseVersion: manifest.PulseVersion, Checksum: "verified", Scope: manifest.Scope})
}

func (h *Hub) preflightPortableBackup(e *core.RequestEvent) error {
	key := strings.TrimSpace(e.Request.PathValue("key"))
	if key == "" || filepath.Base(key) != key || !backupNamePattern.MatchString(key) {
		return e.BadRequestError("Invalid backup name.", nil)
	}
	var target restoreStorageTarget
	if e.Request.Body != nil && e.Request.ContentLength != 0 {
		if err := e.BindBody(&target); err != nil {
			return e.BadRequestError("Invalid restore target.", err)
		}
	}
	if strings.TrimSpace(target.AssetMediaRoot) == "" {
		target.AssetMediaRoot = filepath.Join(h.DataDir(), "asset_media")
	}
	localPath, cleanup, err := h.downloadBackupToTemporary(key)
	if err != nil {
		return e.NotFoundError("Backup not found.", err)
	}
	defer cleanup()
	manifest, _, err := readPortableBackupPackage(localPath)
	result := portableBackupPreflight{Key: key, Status: "ready", Target: target}
	if err != nil {
		result.Status = "blocked"
		result.Blockers = append(result.Blockers, backupCheck{Level: "error", Code: "invalid_package", Message: err.Error()})
		return e.JSON(http.StatusOK, result)
	}
	result.Manifest = manifest
	result.Checks = append(result.Checks, backupCheck{Level: "success", Code: "checksums_verified", Message: "备份载荷校验通过"})
	if compareSimpleVersions(manifest.PulseVersion, pulse.Version) > 0 {
		result.Status = "blocked"
		result.Blockers = append(result.Blockers, backupCheck{Level: "error", Code: "newer_version", Message: "备份来自更新的 Pulse 版本，请先升级目标实例"})
	}
	if manifest.External.AssetMedia.Included {
		if err := ensureWritableDirectory(target.AssetMediaRoot); err != nil {
			result.Status = "blocked"
			result.Blockers = append(result.Blockers, backupCheck{Level: "error", Code: "media_target_not_writable", Message: err.Error()})
		} else {
			result.Checks = append(result.Checks, backupCheck{Level: "success", Code: "media_target_writable", Message: "设备图片目标目录可写"})
		}
	}
	h.createOperationAudit(e, "", "preflight_backup", key, "", result.Status, "完整实例备份预检完成")
	return e.JSON(http.StatusOK, result)
}

func readPortableBackupPackage(filename string) (portableBackupManifest, *archiveInspection, error) {
	manifest := portableBackupManifest{}
	inspection, err := inspectZip(filename, portableBackupArchiveLimits())
	if err != nil {
		return manifest, nil, err
	}
	manifest, err = readPortableBackupManifest(filename)
	if err != nil {
		return manifest, nil, err
	}
	expected := map[string]bool{}
	for _, payload := range manifest.Payloads {
		actual, exists := inspection.byPath[payload.Path]
		if !exists {
			return manifest, nil, fmt.Errorf("backup payload is missing: %s", payload.Path)
		}
		if actual.Size != payload.Size || !strings.EqualFold(actual.SHA256, payload.SHA256) {
			return manifest, nil, fmt.Errorf("backup checksum mismatch: %s", payload.Path)
		}
		expected[payload.Path] = true
	}
	for _, entry := range inspection.Entries {
		if entry.Path != "manifest.json" && !expected[entry.Path] {
			return manifest, nil, fmt.Errorf("backup contains unlisted payload: %s", entry.Path)
		}
	}
	if !expected["pocketbase.zip"] {
		return manifest, nil, fmt.Errorf("pocketbase.zip payload is missing")
	}
	staging, err := os.MkdirTemp(filepath.Dir(filename), ".backup-inspect-")
	if err != nil {
		return manifest, nil, err
	}
	defer os.RemoveAll(staging)
	if err := extractInspectedZip(filename, staging, inspection); err != nil {
		return manifest, nil, err
	}
	if _, err := inspectZip(filepath.Join(staging, "pocketbase.zip"), portableBackupArchiveLimits()); err != nil {
		return manifest, nil, fmt.Errorf("invalid pocketbase backup: %w", err)
	}
	return manifest, inspection, nil
}

func portableBackupArchiveLimits() archiveLimits {
	return archiveLimits{
		MaxEntries:          100_000,
		MaxEntryBytes:       16 << 30,
		MaxUncompressed:     64 << 30,
		MaxCompressionRatio: 1_000,
	}
}

func readPortableBackupManifest(filename string) (portableBackupManifest, error) {
	manifest := portableBackupManifest{}
	content, err := readAssetMigrationArchiveEntry(filename, "manifest.json")
	if err != nil {
		return manifest, err
	}
	if err := json.Unmarshal(content, &manifest); err != nil {
		return manifest, fmt.Errorf("decode backup manifest: %w", err)
	}
	if manifest.Schema != portableBackupSchemaV1 || manifest.Scope != "instance" {
		return manifest, fmt.Errorf("unsupported backup schema: %s", manifest.Schema)
	}
	return manifest, nil
}

func (h *Hub) downloadBackupToTemporary(key string) (string, func(), error) {
	staging, err := os.MkdirTemp(filepath.Join(h.DataDir(), core.LocalTempDirName), "backup-read-")
	if err != nil {
		return "", func() {}, err
	}
	cleanup := func() { _ = os.RemoveAll(staging) }
	backups, err := h.NewBackupsFilesystem()
	if err != nil {
		cleanup()
		return "", func() {}, err
	}
	defer backups.Close()
	target := filepath.Join(staging, "backup.zip")
	if err := copyBackupFilesystemObject(backups, key, target); err != nil {
		cleanup()
		return "", func() {}, err
	}
	return target, cleanup, nil
}

func ensureWritableDirectory(directory string) error {
	if !filepath.IsAbs(directory) {
		return fmt.Errorf("设备图片目标目录必须是绝对路径")
	}
	if err := os.MkdirAll(directory, 0o755); err != nil {
		return fmt.Errorf("设备图片目标目录不可写: %w", err)
	}
	file, err := os.CreateTemp(directory, ".pulse-write-check-")
	if err != nil {
		return fmt.Errorf("设备图片目标目录不可写: %w", err)
	}
	name := file.Name()
	_ = file.Close()
	_ = os.Remove(name)
	return nil
}

func compareSimpleVersions(left, right string) int {
	parse := func(value string) [3]int {
		var result [3]int
		parts := strings.Split(strings.TrimPrefix(value, "v"), ".")
		for index := 0; index < len(parts) && index < 3; index++ {
			fields := strings.FieldsFunc(parts[index], func(r rune) bool { return r < '0' || r > '9' })
			if len(fields) > 0 {
				result[index], _ = strconv.Atoi(fields[0])
			}
		}
		return result
	}
	l, r := parse(left), parse(right)
	for index := range l {
		if l[index] > r[index] {
			return 1
		}
		if l[index] < r[index] {
			return -1
		}
	}
	return 0
}
