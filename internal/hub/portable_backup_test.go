//go:build testing

package hub_test

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
	pulseTests "gutenacht.site/pulse/internal/tests"
)

func TestCreatePortableBackupWrapsPocketBaseAndManifest(t *testing.T) {
	hub, _ := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()
	admin, err := pulseTests.CreateUserWithRole(hub, "portable-backup@example.com", "password123", "admin")
	require.NoError(t, err)
	token, err := admin.NewAuthToken()
	require.NoError(t, err)
	created := pulseTests.PerformTestAPIRequest(t, hub.TestApp, http.MethodPost, "/api/pulse/backups",
		strings.NewReader(`{"name":"portable_test"}`), map[string]string{"Authorization": token, "Content-Type": "application/json"})
	require.Equal(t, http.StatusOK, created.Status, created.Body)
	downloaded := pulseTests.PerformTestAPIRequest(t, hub.TestApp, http.MethodGet, "/api/pulse/backups/portable_test.zip", nil,
		map[string]string{"Authorization": token})
	require.Equal(t, http.StatusOK, downloaded.Status, downloaded.Body)
	data := []byte(downloaded.Body)
	archive, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	require.NoError(t, err)
	manifestBytes := readAssetMigrationAPIArchiveEntry(t, archive.File, "manifest.json")
	var manifest struct {
		Schema string `json:"schema"`
		Scope  string `json:"scope"`
	}
	require.NoError(t, json.Unmarshal(manifestBytes, &manifest))
	require.Equal(t, "pulse.instance.backup.v1", manifest.Schema)
	require.Equal(t, "instance", manifest.Scope)
	require.NotEmpty(t, readAssetMigrationAPIArchiveEntry(t, archive.File, "pocketbase.zip"))
	listed := pulseTests.PerformTestAPIRequest(t, hub.TestApp, http.MethodGet, "/api/pulse/backups", nil,
		map[string]string{"Authorization": token})
	require.Equal(t, http.StatusOK, listed.Status, listed.Body)
	var list struct {
		Items []struct {
			Key          string `json:"key"`
			Type         string `json:"type"`
			Scope        string `json:"scope"`
			Checksum     string `json:"checksum"`
			PulseVersion string `json:"pulse_version"`
		} `json:"items"`
	}
	require.NoError(t, json.Unmarshal([]byte(listed.Body), &list))
	require.Len(t, list.Items, 1)
	require.Equal(t, "pulse", list.Items[0].Type)
	require.Equal(t, "instance", list.Items[0].Scope)
	require.Equal(t, "unchecked", list.Items[0].Checksum)
	require.NotEmpty(t, list.Items[0].PulseVersion)
}

func TestPortableBackupUploadAndPreflight(t *testing.T) {
	source, _ := pulseTests.GetHubWithUser(t)
	defer source.Cleanup()
	admin, err := pulseTests.CreateUserWithRole(source, "portable-upload@example.com", "password123", "admin")
	require.NoError(t, err)
	token, err := admin.NewAuthToken()
	require.NoError(t, err)
	created := pulseTests.PerformTestAPIRequest(t, source.TestApp, http.MethodPost, "/api/pulse/backups",
		strings.NewReader(`{"name":"portable_upload_source"}`), map[string]string{"Authorization": token, "Content-Type": "application/json"})
	require.Equal(t, http.StatusOK, created.Status, created.Body)
	downloaded := pulseTests.PerformTestAPIRequest(t, source.TestApp, http.MethodGet, "/api/pulse/backups/portable_upload_source.zip", nil,
		map[string]string{"Authorization": token})
	require.Equal(t, http.StatusOK, downloaded.Status, downloaded.Body)

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", "portable-upload.zip")
	require.NoError(t, err)
	_, err = part.Write([]byte(downloaded.Body))
	require.NoError(t, err)
	require.NoError(t, writer.Close())
	uploaded := pulseTests.PerformTestAPIRequest(t, source.TestApp, http.MethodPost, "/api/pulse/backups/upload", &body,
		map[string]string{"Authorization": token, "Content-Type": writer.FormDataContentType()})
	require.Equal(t, http.StatusOK, uploaded.Status, uploaded.Body)
	var upload struct {
		Key string `json:"key"`
	}
	require.NoError(t, json.Unmarshal([]byte(uploaded.Body), &upload))
	require.NotEmpty(t, upload.Key)
	preflight := pulseTests.PerformTestAPIRequest(t, source.TestApp, http.MethodPost,
		"/api/pulse/backups/"+upload.Key+"/preflight", strings.NewReader(`{}`),
		map[string]string{"Authorization": token, "Content-Type": "application/json"})
	require.Equal(t, http.StatusOK, preflight.Status, preflight.Body)
	var result struct {
		Status   string `json:"status"`
		Manifest struct {
			Schema string `json:"schema"`
		} `json:"manifest"`
	}
	require.NoError(t, json.Unmarshal([]byte(preflight.Body), &result))
	require.Equal(t, "ready", result.Status)
	require.Equal(t, "pulse.instance.backup.v1", result.Manifest.Schema)
}

func TestPortableRestoreCreatesSafetyBackupAndTask(t *testing.T) {
	hub, _ := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()
	admin, err := pulseTests.CreateUserWithRole(hub, "portable-restore@example.com", "password123", "admin")
	require.NoError(t, err)
	token, err := admin.NewAuthToken()
	require.NoError(t, err)
	created := pulseTests.PerformTestAPIRequest(t, hub.TestApp, http.MethodPost, "/api/pulse/backups",
		strings.NewReader(`{"name":"portable_restore_source"}`), map[string]string{"Authorization": token, "Content-Type": "application/json"})
	require.Equal(t, http.StatusOK, created.Status, created.Body)
	restored := pulseTests.PerformTestAPIRequest(t, hub.TestApp, http.MethodPost, "/api/pulse/backups/portable_restore_source.zip/restore",
		strings.NewReader(`{}`), map[string]string{"Authorization": token, "Content-Type": "application/json"})
	require.Equal(t, http.StatusAccepted, restored.Status, restored.Body)
	var task struct {
		ID                    string `json:"id"`
		SafetyBackupKey       string `json:"safety_backup_key"`
		SafetyNativeBackupKey string `json:"safety_native_backup_key"`
		Stage                 string `json:"stage"`
	}
	require.NoError(t, json.Unmarshal([]byte(restored.Body), &task))
	require.NotEmpty(t, task.ID)
	require.NotEmpty(t, task.SafetyBackupKey)
	require.NotEmpty(t, task.SafetyNativeBackupKey)
	require.Equal(t, "restore_database", task.Stage)
	nativeBackup := pulseTests.PerformTestAPIRequest(t, hub.TestApp, http.MethodGet, "/api/pulse/backups/"+task.SafetyNativeBackupKey, nil,
		map[string]string{"Authorization": token})
	require.Equal(t, http.StatusOK, nativeBackup.Status, nativeBackup.Body)
	nativeData := []byte(nativeBackup.Body)
	nativeArchive, err := zip.NewReader(bytes.NewReader(nativeData), int64(len(nativeData)))
	require.NoError(t, err)
	require.NotEmpty(t, readAssetMigrationAPIArchiveEntry(t, nativeArchive.File, "data.db"))
}
