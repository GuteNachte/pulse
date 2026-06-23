//go:build testing

package agent

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseWindowsProcessRowsMapsExecutablePath(t *testing.T) {
	rows, err := parseWindowsProcessRows([]byte(`[
		{"Name":"clash.exe","ProcessId":1212,"ExecutablePath":"C:\\Program Files\\Clash\\clash.exe"}
	]`))
	require.NoError(t, err)
	require.Len(t, rows, 1)

	assert.Equal(t, "clash.exe", rows[0].Name)
	assert.Equal(t, uint32(1212), rows[0].ProcessID)
	assert.Equal(t, `C:\Program Files\Clash\clash.exe`, rows[0].Executable)
}

func TestParseWindowsProcessRowsMapsSingleObject(t *testing.T) {
	rows, err := parseWindowsProcessRows([]byte(`{"Name":"Docker Desktop.exe","ProcessId":3434,"ExecutablePath":"C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe"}`))
	require.NoError(t, err)
	require.Len(t, rows, 1)

	assert.Equal(t, "Docker Desktop.exe", rows[0].Name)
	assert.Equal(t, `C:\Program Files\Docker\Docker\Docker Desktop.exe`, rows[0].Executable)
}
