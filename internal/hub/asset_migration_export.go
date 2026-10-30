package hub

import (
	"archive/zip"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"
	pbFilesystem "github.com/pocketbase/pocketbase/tools/filesystem"
	"github.com/pocketbase/pocketbase/tools/security"
	pulse "gutenacht.site/pulse"
)

type assetMigrationFileSource struct {
	ArchivePath string
	SourcePath  string
}

func (h *Hub) exportAssetMigrationPackage(e *core.RequestEvent) error {
	temporaryRoot := filepath.Join(h.DataDir(), "tmp")
	if err := os.MkdirAll(temporaryRoot, 0o755); err != nil {
		return e.InternalServerError("Failed to prepare asset export", err)
	}
	staging, err := os.MkdirTemp(temporaryRoot, "asset-export-")
	if err != nil {
		return e.InternalServerError("Failed to prepare asset export", err)
	}
	defer os.RemoveAll(staging)

	records, recordModels, err := h.collectAssetMigrationRecords(e.Auth.Id)
	if err != nil {
		return e.InternalServerError("Failed to collect asset records", err)
	}
	files, err := h.collectAssetMigrationFiles(staging, recordModels)
	if err != nil {
		return e.InternalServerError("Failed to collect asset files", err)
	}
	now := time.Now()
	filename := fmt.Sprintf("pulse-assets-%s.pulse-assets.zip", now.Format("20060102-150405"))
	output := filepath.Join(staging, filename)
	_, err = writeAssetMigrationPackage(output, assetPackageManifest{
		Schema:         assetPackageSchemaV1,
		PackageID:      security.RandomString(24),
		PulseVersion:   pulse.Version,
		CreatedAt:      now.UTC().Format(time.RFC3339),
		SourceInstance: assetMigrationSourceInstance(h.DataDir()),
		Scope:          "asset-center",
	}, records, files)
	if err != nil {
		return e.InternalServerError("Failed to create asset package", err)
	}
	content, err := os.ReadFile(output)
	if err != nil {
		return e.InternalServerError("Failed to read asset package", err)
	}
	e.Response.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	h.createOperationAudit(e, "", "export_asset_migration", "", "", "success", "资产迁移包已导出")
	return e.Blob(http.StatusOK, "application/zip", content)
}

func (h *Hub) collectAssetMigrationRecords(userID string) (assetPackageRecords, map[string][]*core.Record, error) {
	result := assetPackageRecords{Collections: make(map[string][]map[string]any, len(assetMigrationCollections))}
	models := make(map[string][]*core.Record, len(assetMigrationCollections))
	for _, collection := range assetMigrationCollections {
		records, err := h.FindRecordsByFilter(collection, "user = {:user}", "id", -1, 0, map[string]any{"user": userID})
		if err != nil {
			return result, nil, fmt.Errorf("load %s: %w", collection, err)
		}
		models[collection] = records
		rows := make([]map[string]any, 0, len(records))
		for _, record := range records {
			encoded, err := json.Marshal(record)
			if err != nil {
				return result, nil, fmt.Errorf("encode %s/%s: %w", collection, record.Id, err)
			}
			row := map[string]any{}
			if err := json.Unmarshal(encoded, &row); err != nil {
				return result, nil, fmt.Errorf("normalize %s/%s: %w", collection, record.Id, err)
			}
			delete(row, "expand")
			delete(row, "collectionId")
			delete(row, "collectionName")
			rows = append(rows, row)
		}
		result.Collections[collection] = rows
	}
	return result, models, nil
}

func (h *Hub) collectAssetMigrationFiles(staging string, records map[string][]*core.Record) ([]assetMigrationFileSource, error) {
	result := make([]assetMigrationFileSource, 0)
	filesystem, err := h.NewFilesystem()
	if err != nil {
		return nil, fmt.Errorf("open PocketBase file storage: %w", err)
	}
	defer filesystem.Close()
	for collection, collectionRecords := range records {
		for _, record := range collectionRecords {
			for _, field := range record.Collection().Fields {
				fileField, ok := field.(*core.FileField)
				if !ok {
					continue
				}
				for _, name := range record.GetStringSlice(fileField.Name) {
					archivePath := path.Join("files", "pocketbase", collection, record.Id, fileField.Name, name)
					target := filepath.Join(staging, "pocketbase", collection, record.Id, fileField.Name, filepath.Base(name))
					if err := copyAssetMigrationFilesystemObject(filesystem, record.BaseFilesPath()+"/"+name, target); err != nil {
						return nil, err
					}
					result = append(result, assetMigrationFileSource{ArchivePath: archivePath, SourcePath: target})
				}
			}
		}
	}
	store := newAssetMediaStore(h.assetMediaStoreRoot())
	seen := map[string]struct{}{}
	for _, version := range records["asset_media_versions"] {
		keys := []string{version.GetString("object_key")}
		var thumbnails []string
		if err := version.UnmarshalJSONField("thumbnail_keys", &thumbnails); err == nil {
			keys = append(keys, thumbnails...)
		}
		for _, key := range keys {
			key = strings.TrimSpace(key)
			if key == "" {
				continue
			}
			if _, exists := seen[key]; exists {
				continue
			}
			seen[key] = struct{}{}
			source, err := store.pathFor(key)
			if err != nil {
				return nil, fmt.Errorf("resolve asset media %s: %w", key, err)
			}
			if _, err := os.Stat(source); err != nil {
				return nil, fmt.Errorf("read asset media %s: %w", key, err)
			}
			result = append(result, assetMigrationFileSource{ArchivePath: path.Join("files", "media", key), SourcePath: source})
		}
	}
	return result, nil
}

func copyAssetMigrationFilesystemObject(filesystem *pbFilesystem.System, key, target string) error {
	reader, err := filesystem.GetReader(key)
	if err != nil {
		return fmt.Errorf("read PocketBase file %s: %w", key, err)
	}
	defer reader.Close()
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return fmt.Errorf("create staged file directory: %w", err)
	}
	file, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return fmt.Errorf("create staged file: %w", err)
	}
	_, copyErr := io.Copy(file, reader)
	closeErr := file.Close()
	if copyErr != nil {
		return fmt.Errorf("stage PocketBase file: %w", copyErr)
	}
	if closeErr != nil {
		return fmt.Errorf("close staged PocketBase file: %w", closeErr)
	}
	return nil
}

func assetMigrationSourceInstance(dataDir string) string {
	abs, _ := filepath.Abs(dataDir)
	digest := sha256.Sum256([]byte(strings.ToLower(filepath.Clean(abs))))
	return fmt.Sprintf("%x", digest[:12])
}

func writeAssetMigrationPackage(
	filename string,
	manifest assetPackageManifest,
	records assetPackageRecords,
	files []assetMigrationFileSource,
) (assetPackageManifest, error) {
	if manifest.Schema != assetPackageSchemaV1 {
		return manifest, fmt.Errorf("unsupported asset package schema: %s", manifest.Schema)
	}
	if err := os.MkdirAll(filepath.Dir(filename), 0o755); err != nil {
		return manifest, fmt.Errorf("create asset package directory: %w", err)
	}
	recordsJSON, err := json.MarshalIndent(records, "", "  ")
	if err != nil {
		return manifest, fmt.Errorf("encode asset package records: %w", err)
	}
	manifest.Counts = make(map[string]int, len(records.Collections))
	for collection, rows := range records.Collections {
		manifest.Counts[collection] = len(rows)
	}

	temporary, err := os.CreateTemp(filepath.Dir(filename), ".pulse-assets-*.tmp")
	if err != nil {
		return manifest, fmt.Errorf("create asset package: %w", err)
	}
	temporaryName := temporary.Name()
	committed := false
	defer func() {
		if !committed {
			_ = temporary.Close()
			_ = os.Remove(temporaryName)
		}
	}()

	writer := zip.NewWriter(temporary)
	recordEntry, err := writeAssetMigrationBytesEntry(writer, "records.json", recordsJSON)
	if err != nil {
		return manifest, err
	}
	manifest.Files = []archiveEntry{recordEntry}
	sort.Slice(files, func(i, j int) bool { return files[i].ArchivePath < files[j].ArchivePath })
	seen := map[string]struct{}{"records.json": {}, "manifest.json": {}}
	for _, source := range files {
		cleaned, err := cleanArchivePath(source.ArchivePath)
		if err != nil {
			return manifest, err
		}
		if _, exists := seen[cleaned]; exists {
			return manifest, fmt.Errorf("duplicate asset package file: %s", cleaned)
		}
		seen[cleaned] = struct{}{}
		entry, err := writeAssetMigrationFileEntry(writer, cleaned, source.SourcePath)
		if err != nil {
			return manifest, err
		}
		manifest.Files = append(manifest.Files, entry)
	}
	sort.Slice(manifest.Files, func(i, j int) bool { return manifest.Files[i].Path < manifest.Files[j].Path })
	manifestJSON, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return manifest, fmt.Errorf("encode asset package manifest: %w", err)
	}
	if _, err := writeAssetMigrationBytesEntry(writer, "manifest.json", manifestJSON); err != nil {
		return manifest, err
	}
	if err := writer.Close(); err != nil {
		return manifest, fmt.Errorf("close asset package: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		return manifest, fmt.Errorf("sync asset package: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return manifest, fmt.Errorf("close asset package file: %w", err)
	}
	if err := os.Rename(temporaryName, filename); err != nil {
		return manifest, fmt.Errorf("commit asset package: %w", err)
	}
	committed = true
	return manifest, nil
}

func writeAssetMigrationBytesEntry(writer *zip.Writer, name string, content []byte) (archiveEntry, error) {
	entryWriter, err := writer.CreateHeader(&zip.FileHeader{Name: name, Method: zip.Deflate})
	if err != nil {
		return archiveEntry{}, fmt.Errorf("create asset package entry %s: %w", name, err)
	}
	if _, err := entryWriter.Write(content); err != nil {
		return archiveEntry{}, fmt.Errorf("write asset package entry %s: %w", name, err)
	}
	digest := sha256.Sum256(content)
	return archiveEntry{Path: name, Size: uint64(len(content)), SHA256: fmt.Sprintf("%x", digest)}, nil
}

func writeAssetMigrationFileEntry(writer *zip.Writer, name, sourcePath string) (archiveEntry, error) {
	source, err := os.Open(sourcePath)
	if err != nil {
		return archiveEntry{}, fmt.Errorf("open asset package file %s: %w", name, err)
	}
	defer source.Close()
	info, err := source.Stat()
	if err != nil {
		return archiveEntry{}, fmt.Errorf("inspect asset package file %s: %w", name, err)
	}
	if !info.Mode().IsRegular() {
		return archiveEntry{}, fmt.Errorf("asset package file is not regular: %s", name)
	}
	entryWriter, err := writer.CreateHeader(&zip.FileHeader{Name: name, Method: zip.Deflate})
	if err != nil {
		return archiveEntry{}, fmt.Errorf("create asset package file %s: %w", name, err)
	}
	hash := sha256.New()
	written, err := io.Copy(io.MultiWriter(entryWriter, hash), source)
	if err != nil {
		return archiveEntry{}, fmt.Errorf("write asset package file %s: %w", name, err)
	}
	return archiveEntry{Path: name, Size: uint64(written), SHA256: fmt.Sprintf("%x", hash.Sum(nil))}, nil
}
