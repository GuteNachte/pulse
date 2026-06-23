package agent

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSavePairingCredentials(t *testing.T) {
	dir := t.TempDir()
	creds := PairingCredentials{
		HubURL:      "http://localhost:8090",
		AgentID:     "system123",
		AgentSecret: "secret123",
		Token:       "token123",
	}

	require.NoError(t, SavePairingCredentials(dir, creds))

	token, err := os.ReadFile(filepath.Join(dir, "token"))
	require.NoError(t, err)
	assert.Equal(t, "token123", string(token))

	env, err := os.ReadFile(filepath.Join(dir, "paired.env"))
	require.NoError(t, err)
	assert.Contains(t, string(env), "HUB_URL=http://localhost:8090")
	assert.Contains(t, string(env), "TOKEN=token123")
	assert.Contains(t, string(env), "AGENT_ID=system123")
	assert.NotContains(t, string(env), "agent_secret_hash")

	info, err := os.Stat(filepath.Join(dir, "paired.env"))
	require.NoError(t, err)
	if runtime.GOOS != "windows" {
		assert.Equal(t, os.FileMode(0o600), info.Mode().Perm())
	}
}

func TestBuildPairingCapabilitiesIncludesAgentProfile(t *testing.T) {
	t.Setenv("AGENT_PROFILE", "")
	capabilities := buildPairingCapabilities("docker", "docker")
	assert.Equal(t, runtime.GOOS, capabilities["platform"])
	assert.Equal(t, runtime.GOARCH, capabilities["arch"])
	assert.Equal(t, "docker", capabilities["install_method"])
	assert.Equal(t, "docker", capabilities["run_mode"])
	assert.Equal(t, "linux-container", capabilities["agent_profile"])
	assert.NotEmpty(t, capabilities["agent_version"])
	assert.NotEmpty(t, capabilities["privilege"])
}
