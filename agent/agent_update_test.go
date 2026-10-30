package agent

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gutenacht.site/pulse/internal/entities/system"
)

func TestParseAgentUpdateRequest(t *testing.T) {
	t.Run("accepts bounded update params", func(t *testing.T) {
		req, err := parseAgentUpdateRequest(map[string]string{
			"release_id":   "abc123",
			"version":      "0.19.0",
			"channel":      "stable",
			"platform":     "windows",
			"arch":         "amd64",
			"download_url": "https://example.test/pulse-agent.exe",
			"checksum":     "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		})
		require.NoError(t, err)
		assert.Equal(t, "0.19.0", req.version)
		assert.Equal(t, "https://example.test/pulse-agent.exe", req.downloadURL)
	})

	t.Run("requires download URL", func(t *testing.T) {
		_, err := parseAgentUpdateRequest(map[string]string{"version": "0.19.0"})
		require.Error(t, err)
		assert.Contains(t, err.Error(), "download_url")
	})

	t.Run("rejects unsafe URL scheme", func(t *testing.T) {
		_, err := parseAgentUpdateRequest(map[string]string{
			"version":      "0.19.0",
			"download_url": "file:///C:/temp/pulse-agent.exe",
		})
		require.Error(t, err)
		assert.Contains(t, err.Error(), "download_url")
	})

	t.Run("accepts docker image references for Linux container releases", func(t *testing.T) {
		req, err := parseAgentUpdateRequest(map[string]string{
			"release_id":   "abc123",
			"version":      "1.0.1",
			"channel":      "stable",
			"platform":     "linux",
			"arch":         "amd64",
			"download_url": "registry.example.com/infra/pulse-agent:1.0.1",
		})
		require.NoError(t, err)
		assert.Equal(t, "registry.example.com/infra/pulse-agent:1.0.1", req.downloadURL)
	})

	t.Run("rejects unknown params", func(t *testing.T) {
		_, err := parseAgentUpdateRequest(map[string]string{
			"version":      "0.19.0",
			"download_url": "https://example.test/pulse-agent.exe",
			"script":       "Invoke-Thing",
		})
		require.Error(t, err)
		assert.Contains(t, err.Error(), "unsupported agent update parameter")
	})
}

func TestAgentAlreadyAtOrAboveTarget(t *testing.T) {
	assert.True(t, agentAlreadyAtOrAboveTarget("1.0.0"))
	assert.True(t, agentAlreadyAtOrAboveTarget("1.0.1"))
	assert.False(t, agentAlreadyAtOrAboveTarget("99.0.0"))
}

func TestVerifySHA256(t *testing.T) {
	body := []byte("agent-binary")
	sum := sha256.Sum256(body)
	checksum := "sha256:" + hex.EncodeToString(sum[:])

	require.NoError(t, verifySHA256(body, checksum))
	require.Error(t, verifySHA256([]byte("changed"), checksum))
}

func TestAgentUpdateResultPath(t *testing.T) {
	dir := t.TempDir()
	assert.Equal(t, filepath.Join(dir, ".pulse_agent_update", "update-result.json"), agentUpdateResultPath(dir))
}

func TestReadLastAgentUpdateResult(t *testing.T) {
	dir := t.TempDir()
	result := &system.AgentUpdateResult{
		Status:  "succeeded",
		Version: "0.19.0",
		Message: "agent update applied",
		Time:    "2026-05-17T00:00:00Z",
	}
	require.NoError(t, writeAgentUpdateResult(dir, result))

	read := readLastAgentUpdateResult(dir)
	require.NotNil(t, read)
	assert.Equal(t, result.Status, read.Status)
	assert.Equal(t, result.Version, read.Version)
	assert.Equal(t, result.Message, read.Message)
	assert.Equal(t, result.Time, read.Time)
}

func TestReadLastAgentUpdateResultIgnoresMissingAndInvalidFiles(t *testing.T) {
	dir := t.TempDir()
	assert.Nil(t, readLastAgentUpdateResult(dir))

	require.NoError(t, os.MkdirAll(filepath.Dir(agentUpdateResultPath(dir)), 0700))
	require.NoError(t, os.WriteFile(agentUpdateResultPath(dir), []byte(`{"status":""}`), 0600))
	assert.Nil(t, readLastAgentUpdateResult(dir))

	require.NoError(t, os.WriteFile(agentUpdateResultPath(dir), []byte(`not-json`), 0600))
	assert.Nil(t, readLastAgentUpdateResult(dir))
}
