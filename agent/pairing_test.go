package agent

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPairAgentNormalizesSixDigitCode(t *testing.T) {
	var receivedCode string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request pairingRequest
		require.NoError(t, json.NewDecoder(r.Body).Decode(&request))
		receivedCode = request.Code
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"hub_url":"http://127.0.0.1:8090","agent_id":"agent-1","agent_secret":"secret-1","token":"token-1"}`))
	}))
	defer server.Close()

	_, err := PairAgent(server.URL, " 123-456 ", t.TempDir(), "")
	require.NoError(t, err)
	assert.Equal(t, "123456", receivedCode)
}

func TestPairAgentRejectsNonNumericSixCharacterCode(t *testing.T) {
	for _, code := range []string{"ABCDEF", "12A456", "12_456", "12345", "1234567"} {
		t.Run(code, func(t *testing.T) {
			_, err := PairAgent("http://127.0.0.1:8090", code, t.TempDir(), "")
			require.EqualError(t, err, "pairing code must contain exactly 6 digits")
		})
	}
}

func TestPairAgentIncludesHubFailureMessage(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"message":"Invalid or expired pairing code"}`))
	}))
	defer server.Close()

	_, err := PairAgent(server.URL, "123456", t.TempDir(), "")
	require.ErrorContains(t, err, "Invalid or expired pairing code")
}

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

func TestSavePairingCredentialsReplacesExistingFiles(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"token", "paired.env", "pairing.json"} {
		require.NoError(t, os.WriteFile(filepath.Join(dir, name), []byte("old"), 0o600))
	}
	credentials := PairingCredentials{
		HubURL:      "http://localhost:8090",
		AgentID:     "system-new",
		AgentSecret: "secret-new",
		Token:       "token-new",
	}
	require.NoError(t, SavePairingCredentials(dir, credentials))
	token, err := os.ReadFile(filepath.Join(dir, "token"))
	require.NoError(t, err)
	assert.Equal(t, "token-new", string(token))
	pairing, err := os.ReadFile(filepath.Join(dir, "pairing.json"))
	require.NoError(t, err)
	assert.Contains(t, string(pairing), "system-new")
	entries, err := os.ReadDir(dir)
	require.NoError(t, err)
	for _, entry := range entries {
		assert.NotContains(t, entry.Name(), ".pulse-pairing-")
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
