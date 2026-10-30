//go:build testing

package hub_test

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/tools/filesystem"
	"github.com/stretchr/testify/require"
	pulseTests "gutenacht.site/pulse/internal/tests"
)

func TestApplyAssetMigrationRoundTripPreservesReferences(t *testing.T) {
	source, sourceUser := pulseTests.GetHubWithUser(t)
	defer source.Cleanup()
	sourceToken, err := sourceUser.NewAuthToken()
	require.NoError(t, err)
	location, err := pulseTests.CreateRecord(source, "asset_locations", map[string]any{
		"user": sourceUser.Id, "name": "卧室", "kind": "room",
	})
	require.NoError(t, err)
	router, err := pulseTests.CreateRecord(source, "assets", map[string]any{
		"user": sourceUser.Id, "name": "主路由", "type": "router", "status": "active", "location": location.Id,
	})
	require.NoError(t, err)
	client, err := pulseTests.CreateRecord(source, "assets", map[string]any{
		"user": sourceUser.Id, "name": "UM690", "type": "mini_pc", "status": "active", "location": location.Id,
	})
	require.NoError(t, err)
	routerLAN, err := pulseTests.CreateRecord(source, "asset_interfaces", map[string]any{
		"user": sourceUser.Id, "asset": router.Id, "name": "LAN 1", "kind": "lan", "source": "manual",
	})
	require.NoError(t, err)
	clientNIC, err := pulseTests.CreateRecord(source, "asset_interfaces", map[string]any{
		"user": sourceUser.Id, "asset": client.Id, "name": "eth0", "kind": "ethernet", "source": "manual",
	})
	require.NoError(t, err)
	_, err = pulseTests.CreateRecord(source, "asset_relations", map[string]any{
		"user": sourceUser.Id, "source_asset": router.Id, "target_asset": client.Id, "kind": "connected_to", "label": "LAN 1 -> eth0",
		"metadata": map[string]any{"source_interface": routerLAN.Id, "target_interface": clientNIC.Id},
	})
	require.NoError(t, err)
	manualFile, err := filesystem.NewFileFromBytes([]byte("UM690 manual"), "manual.txt")
	require.NoError(t, err)
	_, err = pulseTests.CreateRecord(source, "asset_attachments", map[string]any{
		"user": sourceUser.Id, "asset": client.Id, "kind": "manual", "title": "说明书", "files": []*filesystem.File{manualFile},
	})
	require.NoError(t, err)
	objectKey := "assets/um690/original/device.jpg"
	objectPath := filepath.Join(source.DataDir(), "asset_media", filepath.FromSlash(objectKey))
	require.NoError(t, os.MkdirAll(filepath.Dir(objectPath), 0o755))
	require.NoError(t, os.WriteFile(objectPath, []byte("device image bytes"), 0o600))
	media, err := pulseTests.CreateRecord(source, "asset_media", map[string]any{
		"user": sourceUser.Id, "asset": client.Id, "source_kind": "upload", "source_title": "UM690-01", "content_hash": "hash", "state": "library",
	})
	require.NoError(t, err)
	version, err := pulseTests.CreateRecord(source, "asset_media_versions", map[string]any{
		"user": sourceUser.Id, "asset": client.Id, "media": media.Id, "kind": "original", "object_key": objectKey, "mime_type": "image/jpeg", "bytes": 18,
	})
	require.NoError(t, err)
	media.Set("active_version", version.Id)
	require.NoError(t, source.Save(media))
	_, err = pulseTests.CreateRecord(source, "asset_media_placements", map[string]any{
		"user": sourceUser.Id, "asset": client.Id, "media": media.Id, "version": version.Id, "role": "cover", "visible": true,
	})
	require.NoError(t, err)
	exported := pulseTests.PerformTestAPIRequest(t, source.TestApp, http.MethodPost, "/api/pulse/assets/migrations/export", nil, map[string]string{"Authorization": sourceToken})
	require.Equal(t, http.StatusOK, exported.Status, exported.Body)

	target, targetUser := pulseTests.GetHubWithUser(t)
	defer target.Cleanup()
	targetToken, err := targetUser.NewAuthToken()
	require.NoError(t, err)
	uploadID := uploadAssetMigrationPackageForAPI(t, target, targetToken, []byte(exported.Body))
	applied := pulseTests.PerformTestAPIRequest(t, target.TestApp, http.MethodPost, "/api/pulse/assets/migrations/"+uploadID+"/apply",
		strings.NewReader(`{"mode":"add_only"}`), map[string]string{"Authorization": targetToken, "Content-Type": "application/json"})
	require.Equal(t, http.StatusOK, applied.Status, applied.Body)

	assets, err := target.FindRecordsByFilter("assets", "user = {:user}", "name", -1, 0, map[string]any{"user": targetUser.Id})
	require.NoError(t, err)
	require.Len(t, assets, 2)
	locations, err := target.FindRecordsByFilter("asset_locations", "user = {:user}", "name", -1, 0, map[string]any{"user": targetUser.Id})
	require.NoError(t, err)
	require.Len(t, locations, 1)
	interfaces, err := target.FindRecordsByFilter("asset_interfaces", "user = {:user}", "name", -1, 0, map[string]any{"user": targetUser.Id})
	require.NoError(t, err)
	require.Len(t, interfaces, 2)
	relations, err := target.FindRecordsByFilter("asset_relations", "user = {:user}", "id", -1, 0, map[string]any{"user": targetUser.Id})
	require.NoError(t, err)
	require.Len(t, relations, 1)
	assetIDs := map[string]bool{assets[0].Id: true, assets[1].Id: true}
	require.True(t, assetIDs[relations[0].GetString("source_asset")])
	require.True(t, assetIDs[relations[0].GetString("target_asset")])
	var relationMetadata map[string]any
	require.NoError(t, relations[0].UnmarshalJSONField("metadata", &relationMetadata))
	interfaceIDs := map[string]bool{interfaces[0].Id: true, interfaces[1].Id: true}
	require.True(t, interfaceIDs[fmt.Sprint(relationMetadata["source_interface"])])
	require.True(t, interfaceIDs[fmt.Sprint(relationMetadata["target_interface"])])
	attachments, err := target.FindRecordsByFilter("asset_attachments", "user = {:user}", "id", -1, 0, map[string]any{"user": targetUser.Id})
	require.NoError(t, err)
	require.Len(t, attachments, 1)
	storedNames := attachments[0].GetStringSlice("files")
	require.Len(t, storedNames, 1)
	storage, err := target.NewFilesystem()
	require.NoError(t, err)
	defer storage.Close()
	reader, err := storage.GetReader(attachments[0].BaseFilesPath() + "/" + storedNames[0])
	require.NoError(t, err)
	storedContent, err := io.ReadAll(reader)
	require.NoError(t, err)
	require.NoError(t, reader.Close())
	require.Equal(t, "UM690 manual", string(storedContent))
	mediaRecords, err := target.FindRecordsByFilter("asset_media", "user = {:user}", "id", -1, 0, map[string]any{"user": targetUser.Id})
	require.NoError(t, err)
	require.Len(t, mediaRecords, 1)
	mediaVersions, err := target.FindRecordsByFilter("asset_media_versions", "user = {:user}", "id", -1, 0, map[string]any{"user": targetUser.Id})
	require.NoError(t, err)
	require.Len(t, mediaVersions, 1)
	require.Equal(t, mediaVersions[0].Id, mediaRecords[0].GetString("active_version"))
	restoredObject, err := os.ReadFile(filepath.Join(target.DataDir(), "asset_media", filepath.FromSlash(objectKey)))
	require.NoError(t, err)
	require.Equal(t, "device image bytes", string(restoredObject))
	repeatUploadID := uploadAssetMigrationPackageForAPI(t, target, targetToken, []byte(exported.Body))
	repeated := pulseTests.PerformTestAPIRequest(t, target.TestApp, http.MethodPost, "/api/pulse/assets/migrations/"+repeatUploadID+"/apply",
		strings.NewReader(`{"mode":"add_only"}`), map[string]string{"Authorization": targetToken, "Content-Type": "application/json"})
	require.Equal(t, http.StatusOK, repeated.Status, repeated.Body)
	repeatedAssets, err := target.FindRecordsByFilter("assets", "user = {:user}", "id", -1, 0, map[string]any{"user": targetUser.Id})
	require.NoError(t, err)
	require.Len(t, repeatedAssets, 2)
	repeatedInterfaces, err := target.FindRecordsByFilter("asset_interfaces", "user = {:user}", "id", -1, 0, map[string]any{"user": targetUser.Id})
	require.NoError(t, err)
	require.Len(t, repeatedInterfaces, 2)
	repeatedRelations, err := target.FindRecordsByFilter("asset_relations", "user = {:user}", "id", -1, 0, map[string]any{"user": targetUser.Id})
	require.NoError(t, err)
	require.Len(t, repeatedRelations, 1)

	for _, mode := range []string{"merge", "replace_matched"} {
		uploadID := uploadAssetMigrationPackageForAPI(t, target, targetToken, []byte(exported.Body))
		response := pulseTests.PerformTestAPIRequest(t, target.TestApp, http.MethodPost, "/api/pulse/assets/migrations/"+uploadID+"/apply",
			strings.NewReader(fmt.Sprintf(`{"mode":%q}`, mode)), map[string]string{"Authorization": targetToken, "Content-Type": "application/json"})
		if response.Status != http.StatusOK {
			audits, auditErr := target.FindRecordsByFilter("operation_audit", "action = 'apply_asset_migration'", "-created", 1, 0)
			if auditErr == nil && len(audits) > 0 {
				t.Logf("asset migration audit: %s", audits[0].GetString("detail"))
			}
		}
		require.Equal(t, http.StatusOK, response.Status, response.Body)
		assertAssetMigrationRoundTripCounts(t, target, targetUser.Id)
	}
}

func assertAssetMigrationRoundTripCounts(t *testing.T, hub *pulseTests.TestHub, userID string) {
	t.Helper()
	for collection, expected := range map[string]int{
		"asset_locations":        1,
		"assets":                 2,
		"asset_interfaces":       2,
		"asset_relations":        1,
		"asset_attachments":      1,
		"asset_media":            1,
		"asset_media_versions":   1,
		"asset_media_placements": 1,
	} {
		records, err := hub.FindRecordsByFilter(collection, "user = {:user}", "id", -1, 0, map[string]any{"user": userID})
		require.NoError(t, err)
		require.Len(t, records, expected, collection)
	}
}

func TestAssetMigrationUploadAndPreflightReportsExistingAsset(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()
	token, err := user.NewAuthToken()
	require.NoError(t, err)
	_, err = pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user": user.Id, "name": "UM690", "type": "mini_pc", "status": "active",
		"vendor": "MINISFORUM", "model": "UM690", "serial_number": "UM690-001",
	})
	require.NoError(t, err)

	exported := pulseTests.PerformTestAPIRequest(t, hub.TestApp, http.MethodPost, "/api/pulse/assets/migrations/export", nil, map[string]string{
		"Authorization": token,
	})
	require.Equal(t, http.StatusOK, exported.Status, exported.Body)

	uploadID := uploadAssetMigrationPackageForAPI(t, hub, token, []byte(exported.Body))

	preflight := pulseTests.PerformTestAPIRequest(t, hub.TestApp, http.MethodPost, "/api/pulse/assets/migrations/"+uploadID+"/preflight", nil, map[string]string{
		"Authorization": token,
	})
	require.Equal(t, http.StatusOK, preflight.Status, preflight.Body)
	var result struct {
		Status   string `json:"status"`
		Blockers int    `json:"blockers"`
		Plans    map[string]struct {
			Skip    int `json:"skip"`
			Merge   int `json:"merge"`
			Replace int `json:"replace"`
		} `json:"plans"`
	}
	require.NoError(t, json.Unmarshal([]byte(preflight.Body), &result))
	require.Equal(t, "warning", result.Status)
	require.Zero(t, result.Blockers)
	require.Equal(t, 1, result.Plans["add_only"].Skip)
	require.Equal(t, 1, result.Plans["merge"].Merge)
	require.Equal(t, 1, result.Plans["replace_matched"].Replace)
}

func TestAssetMigrationMergeReusesExistingInterfacesAndRelations(t *testing.T) {
	source, sourceUser := pulseTests.GetHubWithUser(t)
	defer source.Cleanup()
	sourceToken, err := sourceUser.NewAuthToken()
	require.NoError(t, err)
	sourceRouter, err := pulseTests.CreateRecord(source, "assets", map[string]any{
		"user": sourceUser.Id, "name": "主路由", "type": "router", "vendor": "Vendor", "model": "R1", "serial_number": "router-001",
	})
	require.NoError(t, err)
	sourceClient, err := pulseTests.CreateRecord(source, "assets", map[string]any{
		"user": sourceUser.Id, "name": "客户端", "type": "mini_pc", "vendor": "Vendor", "model": "C1", "serial_number": "client-001",
	})
	require.NoError(t, err)
	sourceLAN, err := pulseTests.CreateRecord(source, "asset_interfaces", map[string]any{
		"user": sourceUser.Id, "asset": sourceRouter.Id, "name": "LAN 1", "kind": "lan", "source": "manual",
	})
	require.NoError(t, err)
	sourceNIC, err := pulseTests.CreateRecord(source, "asset_interfaces", map[string]any{
		"user": sourceUser.Id, "asset": sourceClient.Id, "name": "eth0", "kind": "ethernet", "source": "manual",
	})
	require.NoError(t, err)
	_, err = pulseTests.CreateRecord(source, "asset_relations", map[string]any{
		"user": sourceUser.Id, "source_asset": sourceRouter.Id, "target_asset": sourceClient.Id, "kind": "connected_to",
		"metadata": map[string]any{"source_interface": sourceLAN.Id, "target_interface": sourceNIC.Id},
	})
	require.NoError(t, err)
	exported := pulseTests.PerformTestAPIRequest(t, source.TestApp, http.MethodPost, "/api/pulse/assets/migrations/export", nil,
		map[string]string{"Authorization": sourceToken})
	require.Equal(t, http.StatusOK, exported.Status, exported.Body)

	target, targetUser := pulseTests.GetHubWithUser(t)
	defer target.Cleanup()
	targetToken, err := targetUser.NewAuthToken()
	require.NoError(t, err)
	targetRouter, err := pulseTests.CreateRecord(target, "assets", map[string]any{
		"user": targetUser.Id, "name": "主路由", "type": "router", "vendor": "Vendor", "model": "R1", "serial_number": "router-001",
	})
	require.NoError(t, err)
	targetClient, err := pulseTests.CreateRecord(target, "assets", map[string]any{
		"user": targetUser.Id, "name": "客户端", "type": "mini_pc", "vendor": "Vendor", "model": "C1", "serial_number": "client-001",
	})
	require.NoError(t, err)
	targetLAN, err := pulseTests.CreateRecord(target, "asset_interfaces", map[string]any{
		"user": targetUser.Id, "asset": targetRouter.Id, "name": "LAN 1", "kind": "lan", "source": "manual",
	})
	require.NoError(t, err)
	targetNIC, err := pulseTests.CreateRecord(target, "asset_interfaces", map[string]any{
		"user": targetUser.Id, "asset": targetClient.Id, "name": "eth0", "kind": "ethernet", "source": "manual",
	})
	require.NoError(t, err)
	_, err = pulseTests.CreateRecord(target, "asset_relations", map[string]any{
		"user": targetUser.Id, "source_asset": targetRouter.Id, "target_asset": targetClient.Id, "kind": "connected_to",
		"metadata": map[string]any{"source_interface": targetLAN.Id, "target_interface": targetNIC.Id},
	})
	require.NoError(t, err)

	uploadID := uploadAssetMigrationPackageForAPI(t, target, targetToken, []byte(exported.Body))
	response := pulseTests.PerformTestAPIRequest(t, target.TestApp, http.MethodPost, "/api/pulse/assets/migrations/"+uploadID+"/apply",
		strings.NewReader(`{"mode":"merge"}`), map[string]string{"Authorization": targetToken, "Content-Type": "application/json"})
	require.Equal(t, http.StatusOK, response.Status, response.Body)
	interfaces, err := target.FindRecordsByFilter("asset_interfaces", "user = {:user}", "id", -1, 0, map[string]any{"user": targetUser.Id})
	require.NoError(t, err)
	require.Len(t, interfaces, 2)
	relations, err := target.FindRecordsByFilter("asset_relations", "user = {:user}", "id", -1, 0, map[string]any{"user": targetUser.Id})
	require.NoError(t, err)
	require.Len(t, relations, 1)
}

func uploadAssetMigrationPackageForAPI(t *testing.T, hub *pulseTests.TestHub, token string, content []byte) string {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", "assets.pulse-assets.zip")
	require.NoError(t, err)
	_, err = part.Write(content)
	require.NoError(t, err)
	require.NoError(t, writer.Close())
	uploaded := pulseTests.PerformTestAPIRequest(t, hub.TestApp, http.MethodPost, "/api/pulse/assets/migrations/upload", &body, map[string]string{
		"Authorization": token,
		"Content-Type":  writer.FormDataContentType(),
	})
	require.Equal(t, http.StatusOK, uploaded.Status, uploaded.Body)
	var upload struct {
		UploadID string `json:"upload_id"`
	}
	require.NoError(t, json.Unmarshal([]byte(uploaded.Body), &upload))
	require.NotEmpty(t, upload.UploadID)
	return upload.UploadID
}

func TestAssetMigrationExportReturnsOnlyCurrentUserRecords(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()
	token, err := user.NewAuthToken()
	require.NoError(t, err)
	asset, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user": user.Id, "name": "UM690", "type": "mini_pc", "status": "active",
	})
	require.NoError(t, err)
	_, err = pulseTests.CreateRecord(hub, "asset_interfaces", map[string]any{
		"user": user.Id, "asset": asset.Id, "name": "eth0", "kind": "ethernet", "source": "manual",
	})
	require.NoError(t, err)
	other, err := pulseTests.CreateUser(hub, "asset-migration-other@example.com", "password123")
	require.NoError(t, err)
	otherAsset, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user": other.Id, "name": "Other", "type": "mini_pc", "status": "active",
	})
	require.NoError(t, err)

	response := pulseTests.PerformTestAPIRequest(t, hub.TestApp, http.MethodPost, "/api/pulse/assets/migrations/export", nil, map[string]string{
		"Authorization": token,
	})
	require.Equal(t, http.StatusOK, response.Status, response.Body)

	data := []byte(response.Body)
	archive, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	require.NoError(t, err)
	recordsBytes := readAssetMigrationAPIArchiveEntry(t, archive.File, "records.json")
	var records struct {
		Collections map[string][]map[string]any `json:"collections"`
	}
	require.NoError(t, json.Unmarshal(recordsBytes, &records))
	require.Len(t, records.Collections["assets"], 1)
	require.Equal(t, asset.Id, records.Collections["assets"][0]["id"])
	require.NotContains(t, string(recordsBytes), otherAsset.Id)
	require.Len(t, records.Collections["asset_interfaces"], 1)
}

func readAssetMigrationAPIArchiveEntry(t *testing.T, files []*zip.File, name string) []byte {
	t.Helper()
	for _, file := range files {
		if file.Name != name {
			continue
		}
		reader, err := file.Open()
		require.NoError(t, err)
		defer reader.Close()
		var buffer bytes.Buffer
		_, err = buffer.ReadFrom(reader)
		require.NoError(t, err)
		return buffer.Bytes()
	}
	t.Fatalf("archive entry %q not found", name)
	return nil
}
