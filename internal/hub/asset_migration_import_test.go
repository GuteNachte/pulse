package hub

import (
	"archive/zip"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestReadAssetMigrationPackagePreflightReady(t *testing.T) {
	packagePath := filepath.Join(t.TempDir(), "assets.pulse-assets.zip")
	records := assetPackageRecords{Collections: map[string][]map[string]any{
		"asset_locations":  {{"id": "location-1", "name": "卧室"}},
		"assets":           {{"id": "asset-1", "name": "UM690", "type": "mini_pc"}},
		"asset_interfaces": {{"id": "nic-1", "asset": "asset-1", "name": "eth0"}},
		"asset_relations":  {},
	}}
	_, err := writeAssetMigrationPackage(packagePath, assetPackageManifest{
		Schema: assetPackageSchemaV1, PackageID: "package-1", PulseVersion: "1.0.6", CreatedAt: "2026-07-24T00:00:00Z", SourceInstance: "source-1", Scope: "asset-center",
	}, records, nil)
	require.NoError(t, err)

	loaded, err := readAssetMigrationPackage(packagePath)
	require.NoError(t, err)
	require.Equal(t, "package-1", loaded.Manifest.PackageID)
	require.Equal(t, records.Collections["assets"], loaded.Records.Collections["assets"])
	preflight := preflightAssetMigrationPackage(loaded, nil)
	require.Equal(t, "ready", preflight.Status)
	require.Zero(t, preflight.Blockers)
	require.Equal(t, 1, preflight.Plans[assetImportAddOnly].Create)
}

func TestReadAssetMigrationPackageRejectsChecksumMismatch(t *testing.T) {
	packagePath := filepath.Join(t.TempDir(), "assets.pulse-assets.zip")
	_, err := writeAssetMigrationPackage(packagePath, assetPackageManifest{
		Schema: assetPackageSchemaV1, PackageID: "package-1", PulseVersion: "1.0.6", CreatedAt: "2026-07-24T00:00:00Z", SourceInstance: "source-1", Scope: "asset-center",
	}, assetPackageRecords{Collections: map[string][]map[string]any{"assets": {}}}, nil)
	require.NoError(t, err)
	tamperAssetMigrationRecordsEntry(t, packagePath)

	_, err = readAssetMigrationPackage(packagePath)
	require.ErrorContains(t, err, "checksum mismatch")
}

func TestAssetMigrationPreflightBlocksBrokenReferences(t *testing.T) {
	loaded := &loadedAssetMigrationPackage{
		Manifest: assetPackageManifest{Schema: assetPackageSchemaV1, PackageID: "package-1"},
		Records: assetPackageRecords{Collections: map[string][]map[string]any{
			"assets":           {{"id": "asset-1"}},
			"asset_interfaces": {{"id": "nic-1", "asset": "missing"}},
		}},
	}
	preflight := preflightAssetMigrationPackage(loaded, nil)
	require.Equal(t, "blocked", preflight.Status)
	require.Equal(t, 1, preflight.Blockers)
	require.Equal(t, "missing_asset_reference", preflight.Messages[0].Code)
}

func tamperAssetMigrationRecordsEntry(t *testing.T, filename string) {
	t.Helper()
	reader, err := zip.OpenReader(filename)
	require.NoError(t, err)
	entries := make(map[string][]byte, len(reader.File))
	for _, file := range reader.File {
		entries[file.Name] = readArchiveSafetyEntry(t, reader.File, file.Name)
	}
	require.NoError(t, reader.Close())
	entries["records.json"] = []byte(`{"collections":{"assets":[{"id":"tampered"}]}}`)
	temporary := filename + ".tmp"
	file, err := os.Create(temporary)
	require.NoError(t, err)
	writer := zip.NewWriter(file)
	for name, content := range entries {
		entry, err := writer.Create(name)
		require.NoError(t, err)
		_, err = entry.Write(content)
		require.NoError(t, err)
	}
	require.NoError(t, writer.Close())
	require.NoError(t, file.Close())
	require.NoError(t, os.Rename(temporary, filename))
}
