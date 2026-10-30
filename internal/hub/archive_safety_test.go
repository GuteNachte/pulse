package hub

import (
	"archive/zip"
	"crypto/sha256"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestInspectZipReturnsVerifiedEntries(t *testing.T) {
	path := writeArchiveSafetyTestZip(t, map[string][]byte{
		"manifest.json":  []byte(`{"schema":"test"}`),
		"files/item.txt": []byte("pulse"),
	})

	inspection, err := inspectZip(path, defaultArchiveLimits())
	require.NoError(t, err)
	require.Len(t, inspection.Entries, 2)
	item := inspection.entry("files/item.txt")
	require.Equal(t, uint64(len("pulse")), item.Size)
	require.Equal(t, fmt.Sprintf("%x", sha256.Sum256([]byte("pulse"))), item.SHA256)

	destination := t.TempDir()
	require.NoError(t, extractInspectedZip(path, destination, inspection))
	content, err := os.ReadFile(filepath.Join(destination, "files", "item.txt"))
	require.NoError(t, err)
	require.Equal(t, []byte("pulse"), content)
}

func TestInspectZipRejectsUnsafePaths(t *testing.T) {
	tests := []string{"../escape", "/absolute", `C:\\absolute`, `safe\\..\\escape`}
	for _, name := range tests {
		t.Run(name, func(t *testing.T) {
			path := writeArchiveSafetyTestZip(t, map[string][]byte{name: []byte("x")})
			_, err := inspectZip(path, defaultArchiveLimits())
			require.ErrorContains(t, err, "unsafe archive path")
		})
	}
}

func TestInspectZipRejectsSymlinks(t *testing.T) {
	path := filepath.Join(t.TempDir(), "symlink.zip")
	file, err := os.Create(path)
	require.NoError(t, err)
	writer := zip.NewWriter(file)
	header := &zip.FileHeader{Name: "link"}
	header.SetMode(os.ModeSymlink | 0o777)
	entry, err := writer.CreateHeader(header)
	require.NoError(t, err)
	_, err = entry.Write([]byte("target"))
	require.NoError(t, err)
	require.NoError(t, writer.Close())
	require.NoError(t, file.Close())

	_, err = inspectZip(path, defaultArchiveLimits())
	require.ErrorContains(t, err, "symbolic links")
}

func TestInspectZipEnforcesConfiguredLimits(t *testing.T) {
	t.Run("entry count", func(t *testing.T) {
		path := writeArchiveSafetyTestZip(t, map[string][]byte{"a": []byte("a"), "b": []byte("b")})
		limits := defaultArchiveLimits()
		limits.MaxEntries = 1
		_, err := inspectZip(path, limits)
		require.ErrorContains(t, err, "too many entries")
	})

	t.Run("single entry bytes", func(t *testing.T) {
		path := writeArchiveSafetyTestZip(t, map[string][]byte{"large": []byte("12345")})
		limits := defaultArchiveLimits()
		limits.MaxEntryBytes = 4
		_, err := inspectZip(path, limits)
		require.ErrorContains(t, err, "entry is too large")
	})

	t.Run("total bytes", func(t *testing.T) {
		path := writeArchiveSafetyTestZip(t, map[string][]byte{"a": []byte("123"), "b": []byte("456")})
		limits := defaultArchiveLimits()
		limits.MaxUncompressed = 5
		_, err := inspectZip(path, limits)
		require.ErrorContains(t, err, "uncompressed size")
	})

	t.Run("compression ratio", func(t *testing.T) {
		path := writeArchiveSafetyTestZip(t, map[string][]byte{"zeros": []byte(strings.Repeat("0", 4096))})
		limits := defaultArchiveLimits()
		limits.MaxCompressionRatio = 2
		_, err := inspectZip(path, limits)
		require.ErrorContains(t, err, "compression ratio")
	})
}

func writeArchiveSafetyTestZip(t *testing.T, entries map[string][]byte) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "archive.zip")
	file, err := os.Create(path)
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
	return path
}
