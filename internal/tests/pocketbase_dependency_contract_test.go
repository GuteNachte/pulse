package tests

import (
	"bytes"
	"encoding/json"
	"io"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestPocketBaseSQLiteDependencyContract(t *testing.T) {
	_, filename, _, ok := runtime.Caller(0)
	require.True(t, ok)
	command := exec.Command("go", "list", "-m", "-json", "all")
	command.Dir = filepath.Join(filepath.Dir(filename), "..", "..")
	output, err := command.Output()
	require.NoError(t, err)

	versions := make(map[string]string)
	decoder := json.NewDecoder(bytes.NewReader(output))
	for {
		var module struct {
			Path    string
			Version string
		}
		err := decoder.Decode(&module)
		if err == io.EOF {
			break
		}
		require.NoError(t, err)
		versions[module.Path] = module.Version
	}

	require.Equal(t, "v0.40.4", versions["github.com/pocketbase/pocketbase"])
	require.Equal(t, "v1.57.0", versions["modernc.org/sqlite"])
	require.Equal(t, "v1.74.4", versions["modernc.org/libc"])
}
