//go:build testing

package agent

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseWindowsProcessRowsMapsExecutablePathShared(t *testing.T) {
	rows, err := parseWindowsProcessRows([]byte(`[
		{"Name":"clash.exe","ProcessId":1212,"ExecutablePath":"C:\\Program Files\\Clash\\clash.exe"}
	]`))
	require.NoError(t, err)
	require.Len(t, rows, 1)

	assert.Equal(t, "clash.exe", rows[0].Name)
	assert.Equal(t, uint32(1212), rows[0].ProcessID)
	assert.Equal(t, `C:\Program Files\Clash\clash.exe`, rows[0].Executable)
}

func TestParseWindowsProcessRowsMapsSessionId(t *testing.T) {
	rows, err := parseWindowsProcessRows([]byte(`{"Name":"explorer.exe","ProcessId":555,"ExecutablePath":"C:\\Windows\\explorer.exe","SessionId":2}`))
	require.NoError(t, err)
	require.Len(t, rows, 1)

	assert.Equal(t, uint32(2), rows[0].SessionID)
}
