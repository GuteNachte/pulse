//go:build testing

package hub

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestCopyPortableRestoreFileReplacesDestination(t *testing.T) {
	root := t.TempDir()
	source := filepath.Join(root, "source.bin")
	target := filepath.Join(root, "nested", "target.bin")
	require.NoError(t, os.WriteFile(source, []byte("restored"), 0o600))
	require.NoError(t, os.MkdirAll(filepath.Dir(target), 0o755))
	require.NoError(t, os.WriteFile(target, []byte("stale-content"), 0o600))

	require.NoError(t, copyPortableRestoreFile(source, target))
	content, err := os.ReadFile(target)
	require.NoError(t, err)
	require.Equal(t, []byte("restored"), content)
}

func TestReplacePortableRestoreDirectoryRemovesFailedRestoreFiles(t *testing.T) {
	root := t.TempDir()
	source := filepath.Join(root, "source")
	target := filepath.Join(root, "target")
	require.NoError(t, os.MkdirAll(filepath.Join(source, "nested"), 0o755))
	require.NoError(t, os.MkdirAll(target, 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(source, "nested", "original.jpg"), []byte("original"), 0o600))
	require.NoError(t, os.WriteFile(filepath.Join(target, "failed.jpg"), []byte("failed"), 0o600))

	require.NoError(t, replacePortableRestoreDirectory(source, target))
	content, err := os.ReadFile(filepath.Join(target, "nested", "original.jpg"))
	require.NoError(t, err)
	require.Equal(t, []byte("original"), content)
	_, err = os.Stat(filepath.Join(target, "failed.jpg"))
	require.ErrorIs(t, err, os.ErrNotExist)
}

func TestPortableRestoreRollbackUsesNativeSafetyArchive(t *testing.T) {
	task := portableRestoreTask{
		SafetyBackupKey:       "safety-outer.zip",
		SafetyNativeBackupKey: "safety-native.zip",
	}

	require.Equal(t, "safety-native.zip", portableRestoreRollbackBackupKey(task))
}
