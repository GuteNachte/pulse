package hub

import (
	"archive/zip"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	"github.com/pocketbase/pocketbase/tools/security"
	pulse "gutenacht.site/pulse"
)

func (h *Hub) createPortableBackup(ctx context.Context, key string) (portableBackupManifest, error) {
	manifest := portableBackupManifest{
		Schema: portableBackupSchemaV1, BackupID: security.RandomString(24), Scope: "instance",
		PulseVersion: pulse.Version, PocketBaseVersion: pocketbase.Version, DatabaseSchema: "current",
		CreatedAt: time.Now().UTC().Format(time.RFC3339), SourceInstance: assetMigrationSourceInstance(h.DataDir()),
	}
	nativeKey := ".pulse-native-" + security.RandomString(16) + ".zip"
	if err := h.App.CreateBackup(ctx, nativeKey); err != nil {
		return manifest, err
	}
	backups, err := h.NewBackupsFilesystem()
	if err != nil {
		return manifest, err
	}
	defer backups.Close()
	backups.SetContext(ctx)
	defer backups.Delete(nativeKey)

	staging, err := os.MkdirTemp(filepath.Join(h.DataDir(), core.LocalTempDirName), "portable-backup-")
	if err != nil {
		return manifest, err
	}
	defer os.RemoveAll(staging)
	nativePath := filepath.Join(staging, "pocketbase.zip")
	if err := copyBackupFilesystemObject(backups, nativeKey, nativePath); err != nil {
		return manifest, err
	}
	output := filepath.Join(staging, key)
	if manifest, err = h.writePortableBackupPackage(output, nativePath, manifest); err != nil {
		return manifest, err
	}
	upload, err := filesystem.NewFileFromPath(output)
	if err != nil {
		return manifest, err
	}
	upload.Name, upload.OriginalName = key, key
	if err := backups.UploadFile(upload, key); err != nil {
		return manifest, err
	}
	return manifest, nil
}

func copyBackupFilesystemObject(fsys *filesystem.System, key, target string) error {
	reader, err := fsys.GetReader(key)
	if err != nil {
		return err
	}
	defer reader.Close()
	file, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(file, reader)
	closeErr := file.Close()
	if copyErr != nil {
		return copyErr
	}
	return closeErr
}

func (h *Hub) writePortableBackupPackage(output, nativePath string, manifest portableBackupManifest) (portableBackupManifest, error) {
	file, err := os.OpenFile(output, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return manifest, err
	}
	writer := zip.NewWriter(file)
	payload, err := writeAssetMigrationFileEntry(writer, "pocketbase.zip", nativePath)
	if err != nil {
		file.Close()
		return manifest, err
	}
	manifest.Payloads = append(manifest.Payloads, payload)
	mediaRoot := h.assetMediaStoreRoot()
	if !pathWithinDirectory(h.DataDir(), mediaRoot) {
		var mediaFiles []string
		err := filepath.WalkDir(mediaRoot, func(filename string, entry os.DirEntry, walkErr error) error {
			if walkErr != nil {
				if os.IsNotExist(walkErr) {
					return nil
				}
				return walkErr
			}
			if entry.IsDir() {
				return nil
			}
			info, err := entry.Info()
			if err != nil {
				return err
			}
			if !info.Mode().IsRegular() {
				return fmt.Errorf("external asset media is not regular: %s", filename)
			}
			mediaFiles = append(mediaFiles, filename)
			return nil
		})
		if err != nil && !os.IsNotExist(err) {
			writer.Close()
			file.Close()
			return manifest, err
		}
		sort.Strings(mediaFiles)
		for _, filename := range mediaFiles {
			relative, err := filepath.Rel(mediaRoot, filename)
			if err != nil {
				writer.Close()
				file.Close()
				return manifest, err
			}
			entry, err := writeAssetMigrationFileEntry(writer, filepath.ToSlash(filepath.Join("external", "asset_media", relative)), filename)
			if err != nil {
				writer.Close()
				file.Close()
				return manifest, err
			}
			manifest.Payloads = append(manifest.Payloads, entry)
			manifest.External.AssetMedia.Files++
			manifest.External.AssetMedia.Bytes += entry.Size
		}
		manifest.External.AssetMedia.Included = len(mediaFiles) > 0
	}
	manifestJSON, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		writer.Close()
		file.Close()
		return manifest, err
	}
	if _, err := writeAssetMigrationBytesEntry(writer, "manifest.json", manifestJSON); err != nil {
		writer.Close()
		file.Close()
		return manifest, err
	}
	if err := writer.Close(); err != nil {
		file.Close()
		return manifest, err
	}
	if err := file.Close(); err != nil {
		return manifest, err
	}
	return manifest, nil
}

func pathWithinDirectory(root, candidate string) bool {
	rootAbs, err1 := filepath.Abs(root)
	candidateAbs, err2 := filepath.Abs(candidate)
	if err1 != nil || err2 != nil {
		return false
	}
	relative, err := filepath.Rel(rootAbs, candidateAbs)
	return err == nil && relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator))
}

func sha256File(filename string) (string, error) {
	file, err := os.Open(filename)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", hash.Sum(nil)), nil
}
