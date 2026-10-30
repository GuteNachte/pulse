package hub

import (
	"archive/zip"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestWriteAssetMigrationPackageIncludesRecordsFilesAndManifest(t *testing.T) {
	attachment := filepath.Join(t.TempDir(), "manual.pdf")
	require.NoError(t, os.WriteFile(attachment, []byte("manual"), 0o600))
	output := filepath.Join(t.TempDir(), "assets.pulse-assets.zip")
	records := assetPackageRecords{Collections: map[string][]map[string]any{
		"assets":           {{"id": "asset-1", "name": "UM690"}},
		"asset_interfaces": {{"id": "nic-1", "asset": "asset-1"}},
	}}

	manifest, err := writeAssetMigrationPackage(output, assetPackageManifest{
		Schema: assetPackageSchemaV1, PackageID: "package-1", PulseVersion: "1.0.6",
		CreatedAt: "2026-07-24T00:00:00Z", SourceInstance: "source-1", Scope: "asset-center",
	}, records, []assetMigrationFileSource{{ArchivePath: "files/attachments/asset-1/manual.pdf", SourcePath: attachment}})
	require.NoError(t, err)
	require.Equal(t, 1, manifest.Counts["assets"])
	require.Equal(t, 1, manifest.Counts["asset_interfaces"])
	require.Len(t, manifest.Files, 2)

	reader, err := zip.OpenReader(output)
	require.NoError(t, err)
	defer reader.Close()
	requireArchiveSafetyEntry(t, reader.File, "manifest.json")
	requireArchiveSafetyEntry(t, reader.File, "records.json")
	requireArchiveSafetyEntry(t, reader.File, "files/attachments/asset-1/manual.pdf")

	manifestBytes := readArchiveSafetyEntry(t, reader.File, "manifest.json")
	var decoded assetPackageManifest
	require.NoError(t, json.Unmarshal(manifestBytes, &decoded))
	require.Equal(t, manifest.Files, decoded.Files)
	require.Equal(t, "manual", string(readArchiveSafetyEntry(t, reader.File, "files/attachments/asset-1/manual.pdf")))
}

func requireArchiveSafetyEntry(t *testing.T, files []*zip.File, name string) {
	t.Helper()
	for _, file := range files {
		if file.Name == name {
			return
		}
	}
	t.Fatalf("archive entry %q not found", name)
}

func readArchiveSafetyEntry(t *testing.T, files []*zip.File, name string) []byte {
	t.Helper()
	for _, file := range files {
		if file.Name != name {
			continue
		}
		reader, err := file.Open()
		require.NoError(t, err)
		defer reader.Close()
		content, err := io.ReadAll(reader)
		require.NoError(t, err)
		return content
	}
	t.Fatalf("archive entry %q not found", name)
	return nil
}
