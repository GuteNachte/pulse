//go:build testing

package agent

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestQuotePowerShellString(t *testing.T) {
	require.Equal(t, "'SimpleService'", quotePowerShellString("SimpleService"))
	require.Equal(t, "'Service With Space'", quotePowerShellString("Service With Space"))
	require.Equal(t, "'Svc''Name'", quotePowerShellString("Svc'Name"))
}

func TestBuildUtf8PowerShellCommand(t *testing.T) {
	command := buildUtf8PowerShellCommand("Get-NetAdapter")

	require.Contains(t, command, "[Console]::InputEncoding")
	require.Contains(t, command, "[Console]::OutputEncoding")
	require.Contains(t, command, "$OutputEncoding")
	require.Contains(t, command, "Get-NetAdapter")
}
