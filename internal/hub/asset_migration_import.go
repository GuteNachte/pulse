package hub

import (
	"archive/zip"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"
	pbFilesystem "github.com/pocketbase/pocketbase/tools/filesystem"
	"github.com/pocketbase/pocketbase/tools/security"
)

const maxAssetMigrationUploadBytes int64 = 512 << 20

var assetMigrationUploadIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{16,64}$`)

type loadedAssetMigrationPackage struct {
	Path       string
	Manifest   assetPackageManifest
	Records    assetPackageRecords
	Inspection *archiveInspection
}

type assetMigrationUploadMetadata struct {
	UserID     string `json:"user_id"`
	UploadedAt string `json:"uploaded_at"`
}

type assetMigrationApplyRequest struct {
	Mode assetImportMode `json:"mode"`
}

func (h *Hub) uploadAssetMigrationPackage(e *core.RequestEvent) error {
	root := h.assetMigrationStagingRoot()
	if err := os.MkdirAll(root, 0o700); err != nil {
		return e.InternalServerError("Failed to prepare asset migration upload.", err)
	}
	h.cleanupExpiredAssetMigrationUploads(root, time.Now().Add(-24*time.Hour))
	e.Request.Body = http.MaxBytesReader(e.Response, e.Request.Body, maxAssetMigrationUploadBytes)
	if err := e.Request.ParseMultipartForm(32 << 20); err != nil {
		return e.BadRequestError("Invalid asset migration upload.", err)
	}
	defer e.Request.MultipartForm.RemoveAll()
	file, _, err := e.Request.FormFile("file")
	if err != nil {
		return e.BadRequestError("Asset migration package is required.", err)
	}
	defer file.Close()

	uploadID := security.RandomString(24)
	directory := filepath.Join(root, uploadID)
	if err := os.Mkdir(directory, 0o700); err != nil {
		return e.InternalServerError("Failed to stage asset migration upload.", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = os.RemoveAll(directory)
		}
	}()
	packagePath := filepath.Join(directory, "package.pulse-assets.zip")
	target, err := os.OpenFile(packagePath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return e.InternalServerError("Failed to stage asset migration package.", err)
	}
	written, copyErr := io.Copy(target, io.LimitReader(file, maxAssetMigrationUploadBytes+1))
	closeErr := target.Close()
	if copyErr != nil || closeErr != nil {
		return e.BadRequestError("Failed to read asset migration package.", copyErr)
	}
	if written == 0 || written > maxAssetMigrationUploadBytes {
		return e.BadRequestError("Asset migration package is empty or too large.", nil)
	}
	metadata, err := json.Marshal(assetMigrationUploadMetadata{UserID: e.Auth.Id, UploadedAt: time.Now().UTC().Format(time.RFC3339)})
	if err != nil {
		return e.InternalServerError("Failed to record asset migration upload.", err)
	}
	if err := os.WriteFile(filepath.Join(directory, "upload.json"), metadata, 0o600); err != nil {
		return e.InternalServerError("Failed to record asset migration upload.", err)
	}
	committed = true
	h.createOperationAudit(e, "", "upload_asset_migration", uploadID, "", "success", "资产迁移包已上传")
	return e.JSON(http.StatusOK, map[string]any{"upload_id": uploadID})
}

func (h *Hub) preflightAssetMigrationUpload(e *core.RequestEvent) error {
	uploadID := strings.TrimSpace(e.Request.PathValue("id"))
	packagePath, err := h.assetMigrationUploadPath(uploadID, e.Auth.Id)
	if err != nil {
		return e.NotFoundError("Asset migration upload not found.", err)
	}
	loaded, err := readAssetMigrationPackage(packagePath)
	if err != nil {
		result := assetMigrationPreflight{
			UploadID: uploadID,
			Status:   "blocked",
			Messages: []migrationMessage{{Level: "error", Code: "invalid_package", Message: err.Error()}},
			Blockers: 1,
		}
		return e.JSON(http.StatusOK, result)
	}
	existing, err := h.assetMigrationExistingIdentities(e.Auth.Id)
	if err != nil {
		return e.InternalServerError("Failed to inspect existing assets.", err)
	}
	result := preflightAssetMigrationPackage(loaded, existing)
	result.UploadID = uploadID
	h.createOperationAudit(e, "", "preflight_asset_migration", uploadID, "", result.Status, "资产迁移包预检完成")
	return e.JSON(http.StatusOK, result)
}

func (h *Hub) applyAssetMigrationUpload(e *core.RequestEvent) error {
	uploadID := strings.TrimSpace(e.Request.PathValue("id"))
	request := assetMigrationApplyRequest{}
	if err := e.BindBody(&request); err != nil {
		return e.BadRequestError("Invalid asset migration request.", err)
	}
	if request.Mode != assetImportAddOnly && request.Mode != assetImportMerge && request.Mode != assetImportReplaceMatched {
		return e.BadRequestError("Invalid asset migration mode.", nil)
	}
	packagePath, err := h.assetMigrationUploadPath(uploadID, e.Auth.Id)
	if err != nil {
		return e.NotFoundError("Asset migration upload not found.", err)
	}
	loaded, err := readAssetMigrationPackage(packagePath)
	if err != nil {
		return e.BadRequestError("Invalid asset migration package.", err)
	}
	existing, err := h.assetMigrationExistingIdentities(e.Auth.Id)
	if err != nil {
		return e.InternalServerError("Failed to inspect existing assets.", err)
	}
	preflight := preflightAssetMigrationPackage(loaded, existing)
	if preflight.Blockers > 0 {
		return e.BadRequestError("Asset migration preflight is blocked.", nil)
	}
	result, err := h.applyLoadedAssetMigrationPackage(loaded, existing, e.Auth.Id, request.Mode)
	if err != nil {
		h.createOperationAudit(e, "", "apply_asset_migration", uploadID, "", "failed", err.Error())
		return e.InternalServerError("Failed to import asset migration package.", err)
	}
	_ = os.RemoveAll(filepath.Dir(packagePath))
	h.createOperationAudit(e, "", "apply_asset_migration", uploadID, "", "success", "资产迁移包已导入")
	return e.JSON(http.StatusOK, result)
}

func (h *Hub) applyLoadedAssetMigrationPackage(loaded *loadedAssetMigrationPackage, existing []migrationAssetIdentity, userID string, mode assetImportMode) (assetMigrationResult, error) {
	result := assetMigrationResult{Status: "success"}
	stagingRoot, err := os.MkdirTemp(filepath.Dir(loaded.Path), ".asset-import-*")
	if err != nil {
		return result, fmt.Errorf("prepare asset migration files: %w", err)
	}
	defer os.RemoveAll(stagingRoot)
	if err := extractInspectedZip(loaded.Path, stagingRoot, loaded.Inspection); err != nil {
		return result, fmt.Errorf("extract asset migration files: %w", err)
	}
	idMaps := make(map[string]map[string]string, len(assetMigrationCollections))
	matchedAssets := map[string]bool{}
	committedMediaKeys := []string{}
	for _, collection := range assetMigrationCollections {
		idMaps[collection] = map[string]string{}
	}
	for _, row := range loaded.Records.Collections["assets"] {
		oldID := migrationString(row, "id")
		matchID, err := matchMigrationAsset(migrationAssetIdentityFromRecord(row, loaded.Manifest.SourceInstance), existing)
		if err != nil {
			return result, err
		}
		if matchID != "" {
			idMaps["assets"][oldID] = matchID
			matchedAssets[oldID] = true
			continue
		}
		idMaps["assets"][oldID] = core.GenerateDefaultRandomId()
	}
	for _, collection := range assetMigrationCollections {
		if collection == "assets" {
			continue
		}
		for _, row := range loaded.Records.Collections[collection] {
			oldID := migrationString(row, "id")
			if oldID != "" {
				idMaps[collection][oldID] = assetMigrationStableRecordID(userID, loaded.Manifest.SourceInstance, collection, oldID)
			}
		}
	}
	for _, collection := range assetMigrationCollections {
		if collection == "assets" {
			continue
		}
		for _, row := range loaded.Records.Collections[collection] {
			oldID := migrationString(row, "id")
			if oldID == "" {
				continue
			}
			matchID, err := h.matchExistingAssetMigrationChildID(collection, row, idMaps, userID)
			if err != nil {
				return result, err
			}
			if matchID != "" {
				idMaps[collection][oldID] = matchID
			}
		}
	}
	allAssetsMatched := len(loaded.Records.Collections["assets"]) > 0 && len(matchedAssets) == len(loaded.Records.Collections["assets"])

	err = h.RunInTransaction(func(txApp core.App) error {
		for _, collectionName := range assetMigrationCollections {
			collection, err := txApp.FindCollectionByNameOrId(collectionName)
			if err != nil {
				return fmt.Errorf("load target collection %s: %w", collectionName, err)
			}
			for _, row := range loaded.Records.Collections[collectionName] {
				oldID := migrationString(row, "id")
				if mode == assetImportAddOnly && collectionName == "asset_locations" && allAssetsMatched {
					result.Skipped++
					continue
				}
				if mode == assetImportAddOnly && collectionName != "assets" && assetMigrationRowBelongsOnlyToMatchedAssets(collectionName, row, matchedAssets) {
					result.Skipped++
					continue
				}
				if collectionName == "assets" && matchedAssets[oldID] {
					switch mode {
					case assetImportAddOnly:
						result.Skipped++
						continue
					case assetImportMerge, assetImportReplaceMatched:
						record, err := txApp.FindRecordById(collectionName, idMaps[collectionName][oldID])
						if err != nil {
							return err
						}
						if err := applyAssetMigrationRow(record, row, collectionName, idMaps, userID, loaded.Manifest, mode, stagingRoot); err != nil {
							return err
						}
						if err := txApp.Save(record); err != nil {
							return fmt.Errorf("save matched %s/%s: %w", collectionName, oldID, err)
						}
						if mode == assetImportMerge {
							result.Merged++
						} else {
							result.Replaced++
						}
						continue
					}
				}
				recordID := idMaps[collectionName][oldID]
				record, findErr := txApp.FindRecordById(collectionName, recordID)
				if findErr != nil && !errors.Is(findErr, sql.ErrNoRows) {
					return fmt.Errorf("load existing %s/%s: %w", collectionName, oldID, findErr)
				}
				if findErr != nil {
					record = core.NewRecord(collection)
					record.Id = recordID
				}
				applyMode := assetImportReplaceMatched
				if findErr == nil {
					applyMode = mode
				}
				if err := applyAssetMigrationRow(record, row, collectionName, idMaps, userID, loaded.Manifest, applyMode, stagingRoot); err != nil {
					return err
				}
				if err := txApp.Save(record); err != nil {
					return fmt.Errorf("save %s/%s: %w", collectionName, oldID, err)
				}
				if findErr == nil {
					if mode == assetImportMerge {
						result.Merged++
					} else {
						result.Replaced++
					}
					continue
				}
				result.Created++
			}
		}
		for _, row := range loaded.Records.Collections["asset_media"] {
			if mode == assetImportAddOnly && assetMigrationRowBelongsOnlyToMatchedAssets("asset_media", row, matchedAssets) {
				continue
			}
			oldVersionID := migrationString(row, "active_version")
			if oldVersionID == "" {
				continue
			}
			mediaID := idMaps["asset_media"][migrationString(row, "id")]
			versionID := idMaps["asset_media_versions"][oldVersionID]
			media, err := txApp.FindRecordById("asset_media", mediaID)
			if err != nil {
				return err
			}
			media.Set("active_version", versionID)
			if err := txApp.Save(media); err != nil {
				return fmt.Errorf("link active asset media version: %w", err)
			}
		}
		var err error
		committedMediaKeys, err = h.commitAssetMigrationMediaFiles(stagingRoot, loaded.Manifest)
		if err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		store := newAssetMediaStore(h.assetMediaStoreRoot())
		for _, key := range committedMediaKeys {
			_ = store.remove(key)
		}
		return assetMigrationResult{}, err
	}
	result.Files = len(loaded.Manifest.Files) - 1
	return result, nil
}

func assetMigrationStableRecordID(userID, sourceInstance, collection, sourceID string) string {
	digest := sha256.Sum256([]byte(strings.Join([]string{userID, sourceInstance, collection, sourceID}, "\x00")))
	return fmt.Sprintf("%x", digest[:])[:15]
}

func (h *Hub) matchExistingAssetMigrationChildID(
	collection string,
	row map[string]any,
	idMaps map[string]map[string]string,
	userID string,
) (string, error) {
	oldID := migrationString(row, "id")
	for _, candidateID := range []string{oldID, idMaps[collection][oldID]} {
		if candidateID == "" {
			continue
		}
		if record, err := h.FindRecordById(collection, candidateID); err == nil && record.GetString("user") == userID {
			return record.Id, nil
		}
	}
	if collection != "asset_locations" && collection != "asset_interfaces" && collection != "asset_relations" && collection != "asset_attachments" {
		return "", nil
	}
	records, err := h.FindRecordsByFilter(collection, "user = {:user}", "id", -1, 0, map[string]any{"user": userID})
	if err != nil {
		return "", err
	}
	matches := make([]string, 0, 1)
	for _, record := range records {
		if assetMigrationChildIdentityMatches(collection, row, record, idMaps) {
			matches = append(matches, record.Id)
		}
	}
	if len(matches) > 1 {
		return "", fmt.Errorf("ambiguous %s child record match", collection)
	}
	if len(matches) == 1 {
		return matches[0], nil
	}
	return "", nil
}

func assetMigrationChildIdentityMatches(
	collection string,
	row map[string]any,
	record *core.Record,
	idMaps map[string]map[string]string,
) bool {
	remapped := func(field, targetCollection string) string {
		return idMaps[targetCollection][migrationString(row, field)]
	}
	equal := func(left, right string) bool {
		return strings.EqualFold(strings.TrimSpace(left), strings.TrimSpace(right))
	}
	switch collection {
	case "asset_locations":
		return equal(record.GetString("name"), migrationString(row, "name")) &&
			equal(record.GetString("kind"), migrationString(row, "kind"))
	case "asset_interfaces":
		return record.GetString("asset") == remapped("asset", "assets") &&
			equal(record.GetString("name"), migrationString(row, "name")) &&
			equal(record.GetString("kind"), migrationString(row, "kind"))
	case "asset_relations":
		if record.GetString("source_asset") != remapped("source_asset", "assets") ||
			record.GetString("target_asset") != remapped("target_asset", "assets") ||
			!equal(record.GetString("kind"), migrationString(row, "kind")) {
			return false
		}
		incomingMetadata := migrationMap(row["metadata"])
		existingMetadata := recordJSONMap(record, "metadata")
		for _, key := range []string{"source_interface", "target_interface"} {
			incomingID := idMaps["asset_interfaces"][migrationMapString(incomingMetadata, key)]
			if incomingID != "" && incomingID != migrationMapString(existingMetadata, key) {
				return false
			}
		}
		return true
	case "asset_attachments":
		return record.GetString("asset") == remapped("asset", "assets") &&
			equal(record.GetString("kind"), migrationString(row, "kind")) &&
			equal(record.GetString("title"), migrationString(row, "title"))
	default:
		return false
	}
}

func assetMigrationRowBelongsOnlyToMatchedAssets(collection string, row map[string]any, matched map[string]bool) bool {
	if collection == "asset_relations" {
		source := migrationString(row, "source_asset")
		target := migrationString(row, "target_asset")
		return source != "" && target != "" && matched[source] && matched[target]
	}
	assetID := migrationString(row, "asset")
	return assetID != "" && matched[assetID]
}

func applyAssetMigrationRow(record *core.Record, row map[string]any, collectionName string, idMaps map[string]map[string]string, userID string, manifest assetPackageManifest, mode assetImportMode, stagingRoot string) error {
	for key, value := range row {
		if key == "id" || key == "collectionId" || key == "collectionName" || key == "created" || key == "updated" || key == "user" {
			continue
		}
		field := record.Collection().Fields.GetByName(key)
		if field == nil {
			continue
		}
		if mode == assetImportMerge && !assetMigrationValueEmpty(record.GetRaw(key)) {
			continue
		}
		if _, isFile := field.(*core.FileField); isFile {
			files, err := assetMigrationPocketBaseFiles(stagingRoot, collectionName, migrationString(row, "id"), key, value)
			if err != nil {
				return err
			}
			if len(files) > 0 {
				record.Set(key, files)
			}
			continue
		}
		if collectionName == "asset_media" && key == "active_version" {
			continue
		}
		if relation, ok := field.(*core.RelationField); ok {
			targetCollection := assetMigrationRelationTarget(collectionName, key)
			if targetCollection != "" {
				value = remapAssetMigrationRelationValue(value, idMaps[targetCollection])
			}
			_ = relation
		}
		if key == "metadata" {
			metadata := migrationMap(value)
			remapAssetMigrationMetadata(metadata, idMaps)
			if collectionName == "assets" {
				metadata["migration_origin"] = map[string]any{"instance": manifest.SourceInstance, "record_id": migrationString(row, "id")}
			}
			value = metadata
		}
		record.Set(key, value)
	}
	record.Set("user", userID)
	return nil
}

func (h *Hub) commitAssetMigrationMediaFiles(stagingRoot string, manifest assetPackageManifest) ([]string, error) {
	store := newAssetMediaStore(h.assetMediaStoreRoot())
	created := []string{}
	for _, entry := range manifest.Files {
		if !strings.HasPrefix(entry.Path, "files/media/") {
			continue
		}
		key := strings.TrimPrefix(entry.Path, "files/media/")
		target, err := store.pathFor(key)
		if err != nil {
			return created, err
		}
		if _, err := os.Stat(target); err == nil {
			digest, hashErr := sha256File(target)
			if hashErr != nil || !strings.EqualFold(digest, entry.SHA256) {
				return created, fmt.Errorf("asset media target conflicts with backup: %s", key)
			}
			continue
		} else if !os.IsNotExist(err) {
			return created, err
		}
		source := filepath.Join(stagingRoot, filepath.FromSlash(entry.Path))
		content, err := os.ReadFile(source)
		if err != nil {
			return created, err
		}
		if _, err := store.write(key, content); err != nil {
			return created, err
		}
		created = append(created, key)
	}
	return created, nil
}

func assetMigrationPocketBaseFiles(stagingRoot, collection, recordID, field string, value any) ([]*pbFilesystem.File, error) {
	names := assetMigrationStringSlice(value)
	files := make([]*pbFilesystem.File, 0, len(names))
	for _, name := range names {
		archivePath, err := cleanArchivePath(path.Join("files", "pocketbase", collection, recordID, field, path.Base(name)))
		if err != nil {
			return nil, err
		}
		filename := filepath.Join(stagingRoot, filepath.FromSlash(archivePath))
		file, err := pbFilesystem.NewFileFromPath(filename)
		if err != nil {
			return nil, fmt.Errorf("prepare PocketBase file %s: %w", archivePath, err)
		}
		files = append(files, file)
	}
	return files, nil
}

func assetMigrationStringSlice(value any) []string {
	switch typed := value.(type) {
	case []any:
		result := make([]string, 0, len(typed))
		for _, item := range typed {
			if text := strings.TrimSpace(fmt.Sprint(item)); text != "" {
				result = append(result, text)
			}
		}
		return result
	case []string:
		return typed
	case string:
		if strings.TrimSpace(typed) != "" {
			return []string{typed}
		}
	}
	return nil
}

func assetMigrationRelationTarget(collection, field string) string {
	targets := map[string]map[string]string{
		"asset_locations":              {"parent_location": "asset_locations"},
		"assets":                       {"location": "asset_locations", "parent_asset": "assets"},
		"asset_interfaces":             {"asset": "assets"},
		"asset_relations":              {"source_asset": "assets", "target_asset": "assets"},
		"asset_maintenance":            {"asset": "assets"},
		"asset_attachments":            {"asset": "assets"},
		"asset_visuals":                {"asset": "assets"},
		"asset_media":                  {"asset": "assets", "active_version": "asset_media_versions"},
		"asset_media_versions":         {"asset": "assets", "media": "asset_media"},
		"asset_media_placements":       {"asset": "assets", "media": "asset_media", "version": "asset_media_versions"},
		"asset_enrichment_reports":     {"asset": "assets"},
		"asset_enrichment_suggestions": {"asset": "assets", "report": "asset_enrichment_reports"},
	}
	return targets[collection][field]
}

func remapAssetMigrationRelationValue(value any, ids map[string]string) any {
	switch typed := value.(type) {
	case []any:
		result := make([]string, 0, len(typed))
		for _, item := range typed {
			if mapped := ids[strings.TrimSpace(fmt.Sprint(item))]; mapped != "" {
				result = append(result, mapped)
			}
		}
		return result
	case []string:
		result := make([]string, 0, len(typed))
		for _, item := range typed {
			if mapped := ids[item]; mapped != "" {
				result = append(result, mapped)
			}
		}
		return result
	default:
		oldID := strings.TrimSpace(fmt.Sprint(value))
		if mapped := ids[oldID]; mapped != "" {
			return mapped
		}
		return ""
	}
}

func remapAssetMigrationMetadata(metadata map[string]any, idMaps map[string]map[string]string) {
	for key, collection := range map[string]string{
		"source_interface": "asset_interfaces", "target_interface": "asset_interfaces",
		"source_interface_id": "asset_interfaces", "target_interface_id": "asset_interfaces",
	} {
		if oldID := migrationMapString(metadata, key); oldID != "" {
			if mapped := idMaps[collection][oldID]; mapped != "" {
				metadata[key] = mapped
			}
		}
	}
}

func assetMigrationValueEmpty(value any) bool {
	if value == nil {
		return true
	}
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed) == ""
	case []string:
		return len(typed) == 0
	case []any:
		return len(typed) == 0
	case map[string]any:
		return len(typed) == 0
	}
	return false
}

func (h *Hub) assetMigrationStagingRoot() string {
	return filepath.Join(h.DataDir(), "tmp", "asset-migrations")
}

func (h *Hub) assetMigrationUploadPath(uploadID, userID string) (string, error) {
	if !assetMigrationUploadIDPattern.MatchString(uploadID) {
		return "", fmt.Errorf("invalid upload id")
	}
	directory := filepath.Join(h.assetMigrationStagingRoot(), uploadID)
	metadataBytes, err := os.ReadFile(filepath.Join(directory, "upload.json"))
	if err != nil {
		return "", err
	}
	metadata := assetMigrationUploadMetadata{}
	if err := json.Unmarshal(metadataBytes, &metadata); err != nil {
		return "", err
	}
	if metadata.UserID != userID {
		return "", fmt.Errorf("upload owner mismatch")
	}
	packagePath := filepath.Join(directory, "package.pulse-assets.zip")
	if _, err := os.Stat(packagePath); err != nil {
		return "", err
	}
	return packagePath, nil
}

func (h *Hub) cleanupExpiredAssetMigrationUploads(root string, cutoff time.Time) {
	entries, err := os.ReadDir(root)
	if err != nil {
		return
	}
	for _, entry := range entries {
		if !entry.IsDir() || !assetMigrationUploadIDPattern.MatchString(entry.Name()) {
			continue
		}
		info, err := entry.Info()
		if err == nil && info.ModTime().Before(cutoff) {
			_ = os.RemoveAll(filepath.Join(root, entry.Name()))
		}
	}
}

func (h *Hub) assetMigrationExistingIdentities(userID string) ([]migrationAssetIdentity, error) {
	records, err := h.FindRecordsByFilter("assets", "user = {:user}", "id", -1, 0, map[string]any{"user": userID})
	if err != nil {
		return nil, err
	}
	result := make([]migrationAssetIdentity, 0, len(records))
	for _, record := range records {
		metadata := recordJSONMap(record, "metadata")
		origin := migrationMap(metadata["migration_origin"])
		result = append(result, migrationAssetIdentity{
			ID:             record.Id,
			OriginInstance: migrationMapString(origin, "instance"),
			OriginRecord:   migrationMapString(origin, "record_id"),
			AssetTag:       migrationMapString(metadata, "asset_tag"),
			SerialNumber:   record.GetString("serial_number"),
			Vendor:         record.GetString("vendor"),
			Model:          record.GetString("model"),
			Name:           record.GetString("name"),
			ManagementIP:   record.GetString("management_ip"),
		})
	}
	return result, nil
}

func readAssetMigrationPackage(filename string) (*loadedAssetMigrationPackage, error) {
	inspection, err := inspectZip(filename, defaultArchiveLimits())
	if err != nil {
		return nil, err
	}
	manifestBytes, err := readAssetMigrationArchiveEntry(filename, "manifest.json")
	if err != nil {
		return nil, err
	}
	manifest := assetPackageManifest{}
	if err := json.Unmarshal(manifestBytes, &manifest); err != nil {
		return nil, fmt.Errorf("decode asset package manifest: %w", err)
	}
	if manifest.Schema != assetPackageSchemaV1 {
		return nil, fmt.Errorf("unsupported asset package schema: %s", manifest.Schema)
	}
	if strings.TrimSpace(manifest.PackageID) == "" {
		return nil, fmt.Errorf("asset package id is required")
	}

	expectedFiles := make(map[string]archiveEntry, len(manifest.Files))
	for _, expected := range manifest.Files {
		cleaned, err := cleanArchivePath(expected.Path)
		if err != nil {
			return nil, err
		}
		if cleaned == "manifest.json" {
			return nil, fmt.Errorf("asset package manifest cannot checksum itself")
		}
		if _, duplicate := expectedFiles[cleaned]; duplicate {
			return nil, fmt.Errorf("duplicate asset package manifest entry: %s", cleaned)
		}
		expectedFiles[cleaned] = expected
		actual, exists := inspection.byPath[cleaned]
		if !exists {
			return nil, fmt.Errorf("asset package file is missing: %s", cleaned)
		}
		if actual.Size != expected.Size || !strings.EqualFold(actual.SHA256, expected.SHA256) {
			return nil, fmt.Errorf("asset package checksum mismatch: %s", cleaned)
		}
	}
	for _, actual := range inspection.Entries {
		if actual.Path == "manifest.json" {
			continue
		}
		if _, exists := expectedFiles[actual.Path]; !exists {
			return nil, fmt.Errorf("asset package contains unlisted file: %s", actual.Path)
		}
	}
	if _, exists := expectedFiles["records.json"]; !exists {
		return nil, fmt.Errorf("asset package records manifest entry is missing")
	}

	recordBytes, err := readAssetMigrationArchiveEntry(filename, "records.json")
	if err != nil {
		return nil, err
	}
	records := assetPackageRecords{}
	if err := json.Unmarshal(recordBytes, &records); err != nil {
		return nil, fmt.Errorf("decode asset package records: %w", err)
	}
	if records.Collections == nil {
		records.Collections = map[string][]map[string]any{}
	}
	return &loadedAssetMigrationPackage{Path: filename, Manifest: manifest, Records: records, Inspection: inspection}, nil
}

func readAssetMigrationArchiveEntry(filename, name string) ([]byte, error) {
	reader, err := zip.OpenReader(filename)
	if err != nil {
		return nil, fmt.Errorf("open asset package: %w", err)
	}
	defer reader.Close()
	for _, file := range reader.File {
		cleaned, err := cleanArchivePath(file.Name)
		if err != nil {
			return nil, err
		}
		if cleaned != name {
			continue
		}
		stream, err := file.Open()
		if err != nil {
			return nil, fmt.Errorf("open asset package entry %s: %w", name, err)
		}
		content, readErr := io.ReadAll(stream)
		closeErr := stream.Close()
		if readErr != nil {
			return nil, fmt.Errorf("read asset package entry %s: %w", name, readErr)
		}
		if closeErr != nil {
			return nil, fmt.Errorf("close asset package entry %s: %w", name, closeErr)
		}
		return content, nil
	}
	return nil, fmt.Errorf("asset package entry is missing: %s", name)
}

func preflightAssetMigrationPackage(loaded *loadedAssetMigrationPackage, existingAssets []migrationAssetIdentity) assetMigrationPreflight {
	result := assetMigrationPreflight{
		Status:   "ready",
		Counts:   map[string]int{},
		Plans:    map[assetImportMode]importPlan{},
		Messages: []migrationMessage{},
	}
	if loaded == nil {
		result.Status = "blocked"
		result.Blockers = 1
		result.Messages = append(result.Messages, migrationMessage{Level: "error", Code: "invalid_package", Message: "资产迁移包无效"})
		return result
	}
	result.Manifest = loaded.Manifest
	for collection, records := range loaded.Records.Collections {
		result.Counts[collection] = len(records)
	}

	assetIDs := make(map[string]struct{}, len(loaded.Records.Collections["assets"]))
	for _, record := range loaded.Records.Collections["assets"] {
		if id := migrationString(record, "id"); id != "" {
			assetIDs[id] = struct{}{}
		}
	}
	for _, collection := range []string{"asset_interfaces", "asset_maintenance", "asset_attachments", "asset_visuals", "asset_media", "asset_enrichment_reports", "asset_enrichment_suggestions"} {
		for _, record := range loaded.Records.Collections[collection] {
			assetID := migrationString(record, "asset")
			if assetID == "" {
				continue
			}
			if _, exists := assetIDs[assetID]; !exists {
				result.Messages = append(result.Messages, migrationMessage{Level: "error", Code: "missing_asset_reference", Message: fmt.Sprintf("%s 记录引用了不存在的资产", collection)})
				result.Blockers++
			}
		}
	}
	for _, record := range loaded.Records.Collections["asset_relations"] {
		for _, field := range []string{"source_asset", "target_asset", "source", "target", "parent_asset", "child_asset"} {
			assetID := migrationString(record, field)
			if assetID == "" {
				continue
			}
			if _, exists := assetIDs[assetID]; !exists {
				result.Messages = append(result.Messages, migrationMessage{Level: "error", Code: "missing_asset_reference", Message: "资产关系引用了不存在的资产"})
				result.Blockers++
			}
		}
	}

	plans := map[assetImportMode]importPlan{
		assetImportAddOnly: {}, assetImportMerge: {}, assetImportReplaceMatched: {},
	}
	for _, record := range loaded.Records.Collections["assets"] {
		incoming := migrationAssetIdentityFromRecord(record, loaded.Manifest.SourceInstance)
		matchID, err := matchMigrationAsset(incoming, existingAssets)
		if err != nil {
			result.Messages = append(result.Messages, migrationMessage{Level: "error", Code: "ambiguous_asset_match", Message: err.Error()})
			result.Blockers++
			continue
		}
		addOnly := plans[assetImportAddOnly]
		merge := plans[assetImportMerge]
		replace := plans[assetImportReplaceMatched]
		if matchID == "" {
			addOnly.Create++
			merge.Create++
			replace.Create++
		} else {
			addOnly.Skip++
			merge.Merge++
			replace.Replace++
		}
		plans[assetImportAddOnly] = addOnly
		plans[assetImportMerge] = merge
		plans[assetImportReplaceMatched] = replace
	}
	result.Plans = plans
	if result.Blockers > 0 {
		result.Status = "blocked"
	} else if plans[assetImportAddOnly].Skip > 0 {
		result.Status = "warning"
		result.Messages = append(result.Messages, migrationMessage{
			Level:   "warning",
			Code:    "asset_conflicts",
			Message: fmt.Sprintf("检测到 %d 个可匹配的现有资产，请确认导入模式", plans[assetImportAddOnly].Skip),
		})
	}
	return result
}

func migrationAssetIdentityFromRecord(record map[string]any, sourceInstance string) migrationAssetIdentity {
	metadata := migrationMap(record["metadata"])
	origin := migrationMap(metadata["migration_origin"])
	originInstance := firstMigrationString(record, "migration_origin_instance", "origin_instance", "source_instance")
	if originInstance == "" {
		originInstance = migrationMapString(origin, "instance")
	}
	if originInstance == "" {
		originInstance = strings.TrimSpace(sourceInstance)
	}
	originRecord := firstMigrationString(record, "migration_origin_record", "origin_record", "source_record")
	if originRecord == "" {
		originRecord = migrationMapString(origin, "record_id")
	}
	if originRecord == "" {
		originRecord = migrationString(record, "id")
	}
	return migrationAssetIdentity{
		ID:             migrationString(record, "id"),
		OriginInstance: originInstance,
		OriginRecord:   originRecord,
		AssetTag:       firstNonEmptyMigrationString(firstMigrationString(record, "asset_tag", "asset_number"), migrationMapString(metadata, "asset_tag")),
		SerialNumber:   firstMigrationString(record, "serial_number", "serial"),
		Vendor:         firstMigrationString(record, "vendor", "manufacturer"),
		Model:          migrationString(record, "model"),
		Name:           migrationString(record, "name"),
		ManagementIP:   firstMigrationString(record, "management_ip", "ip", "ipv4"),
	}
}

func migrationMap(value any) map[string]any {
	switch typed := value.(type) {
	case map[string]any:
		return typed
	case string:
		result := map[string]any{}
		if json.Unmarshal([]byte(typed), &result) == nil {
			return result
		}
	}
	return map[string]any{}
}

func migrationMapString(values map[string]any, key string) string {
	if values == nil {
		return ""
	}
	value, exists := values[key]
	if !exists || value == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(value))
}

func firstNonEmptyMigrationString(values ...string) string {
	for _, value := range values {
		if value = strings.TrimSpace(value); value != "" {
			return value
		}
	}
	return ""
}

func firstMigrationString(record map[string]any, keys ...string) string {
	for _, key := range keys {
		if value, exists := record[key]; exists {
			if text := strings.TrimSpace(fmt.Sprint(value)); text != "" && text != "<nil>" {
				return text
			}
		}
	}
	return ""
}

func migrationString(record map[string]any, key string) string {
	value, exists := record[key]
	if !exists || value == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(value))
}
