//go:build testing

package agent

import (
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"gutenacht.site/pulse"

	"gutenacht.site/pulse/internal/common"

	"github.com/fxamacker/cbor/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestNewWebSocketClient tests WebSocket client creation
func TestNewWebSocketClient(t *testing.T) {
	agent := createTestAgent(t)

	testCases := []struct {
		name        string
		hubURL      string
		token       string
		expectError bool
		errorMsg    string
	}{
		{
			name:        "valid configuration",
			hubURL:      "http://localhost:8080",
			token:       "test-token-123",
			expectError: false,
		},
		{
			name:        "valid https URL",
			hubURL:      "https://hub.example.com",
			token:       "secure-token",
			expectError: false,
		},
		{
			name:        "missing hub URL",
			hubURL:      "",
			token:       "test-token",
			expectError: true,
			errorMsg:    "HUB_URL environment variable not set",
		},
		{
			name:        "invalid URL",
			hubURL:      "ht\ttp://invalid",
			token:       "test-token",
			expectError: true,
			errorMsg:    "invalid hub URL",
		},
		{
			name:        "missing token",
			hubURL:      "http://localhost:8080",
			token:       "",
			expectError: true,
			errorMsg:    "must set TOKEN or TOKEN_FILE",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// Set up environment
			if tc.hubURL != "" {
				t.Setenv("PULSE_AGENT_HUB_URL", tc.hubURL)
			}
			if tc.token != "" {
				t.Setenv("PULSE_AGENT_TOKEN", tc.token)
			}

			client, err := newWebSocketClient(agent)

			if tc.expectError {
				assert.Error(t, err)
				if err != nil && tc.errorMsg != "" {
					assert.Contains(t, err.Error(), tc.errorMsg)
				}
				assert.Nil(t, client)
			} else {
				require.NoError(t, err)
				assert.NotNil(t, client)
				assert.Equal(t, agent, client.agent)
				assert.Equal(t, tc.token, client.token)
				if tc.hubURL == "http://localhost:8080" {
					assert.Equal(t, "http://127.0.0.1:8080", client.hubURL.String())
				} else {
					assert.Equal(t, tc.hubURL, client.hubURL.String())
				}
				assert.NotEmpty(t, client.fingerprint)
				assert.NotNil(t, client.hubRequest)
			}
		})
	}
}

// TestWebSocketClient_GetOptions tests WebSocket client options configuration
func TestWebSocketClient_GetOptions(t *testing.T) {
	agent := createTestAgent(t)

	testCases := []struct {
		name           string
		inputURL       string
		expectedScheme string
		expectedPath   string
	}{
		{
			name:           "http to ws conversion",
			inputURL:       "http://localhost:8080",
			expectedScheme: "ws",
			expectedPath:   "/api/pulse/agent-connect",
		},
		{
			name:           "https to wss conversion",
			inputURL:       "https://hub.example.com",
			expectedScheme: "wss",
			expectedPath:   "/api/pulse/agent-connect",
		},
		{
			name:           "existing path preservation",
			inputURL:       "http://localhost:8080/custom/path",
			expectedScheme: "ws",
			expectedPath:   "/custom/path/api/pulse/agent-connect",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// Set up environment
			t.Setenv("PULSE_AGENT_HUB_URL", tc.inputURL)
			t.Setenv("PULSE_AGENT_TOKEN", "test-token")

			client, err := newWebSocketClient(agent)
			require.NoError(t, err)

			options := client.getOptions()

			// Parse the WebSocket URL
			wsURL, err := url.Parse(options.Addr)
			require.NoError(t, err)

			assert.Equal(t, tc.expectedScheme, wsURL.Scheme)
			assert.Equal(t, tc.expectedPath, wsURL.Path)

			// Check headers
			assert.Equal(t, "test-token", options.RequestHeader.Get("X-Token"))
			assert.Equal(t, pulse.Version, options.RequestHeader.Get("X-Pulse"))
			assert.Contains(t, options.RequestHeader.Get("User-Agent"), "Mozilla/5.0")

			// Test options caching
			options2 := client.getOptions()
			assert.Same(t, options, options2, "Options should be cached")
		})
	}
}

func TestWebSocketClient_AllProxyEnvironmentPriority(t *testing.T) {
	t.Run("pulse proxy sets all proxy", func(t *testing.T) {
		t.Setenv("ALL_PROXY", "")
		t.Setenv("PULSE_AGENT_ALL_PROXY", "http://pulse-proxy.local:7890")

		syncAllProxyFromAgentEnv()

		assert.Equal(t, "http://pulse-proxy.local:7890", os.Getenv("ALL_PROXY"))
	})

	t.Run("empty pulse proxy leaves all proxy unchanged", func(t *testing.T) {
		t.Setenv("ALL_PROXY", "")
		t.Setenv("PULSE_AGENT_ALL_PROXY", "")

		syncAllProxyFromAgentEnv()

		assert.Empty(t, os.Getenv("ALL_PROXY"))
	})
}

// TestWebSocketClient_HandleHubRequest tests hub request routing (basic verification logic)
func TestWebSocketClient_HandleHubRequest(t *testing.T) {
	agent := createTestAgent(t)

	// Set up environment
	t.Setenv("PULSE_AGENT_HUB_URL", "http://localhost:8080")
	t.Setenv("PULSE_AGENT_TOKEN", "test-token")

	client, err := newWebSocketClient(agent)
	require.NoError(t, err)

	testCases := []struct {
		name        string
		action      common.WebSocketAction
		hubVerified bool
		expectError bool
		errorMsg    string
	}{
		{
			name:        "CheckFingerprint without verification",
			action:      common.CheckFingerprint,
			hubVerified: false,
			expectError: false, // CheckFingerprint is allowed without verification
		},
		{
			name:        "GetData without verification",
			action:      common.GetData,
			hubVerified: false,
			expectError: true,
			errorMsg:    "hub not verified",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			client.hubVerified = tc.hubVerified

			// Create minimal request
			hubRequest := &common.HubRequest[cbor.RawMessage]{
				Action: tc.action,
				Data:   cbor.RawMessage{},
			}

			err := client.handleHubRequest(hubRequest, nil)

			if tc.expectError {
				assert.Error(t, err)
				if tc.errorMsg != "" {
					assert.Contains(t, err.Error(), tc.errorMsg)
				}
			} else {
				// For CheckFingerprint, we expect a decode error since we're not providing valid data,
				// but it shouldn't be the "hub not verified" error
				if err != nil && tc.errorMsg != "" {
					assert.NotContains(t, err.Error(), tc.errorMsg)
				}
			}
		})
	}
}

// TestWebSocketClient_GetUserAgent tests user agent generation
func TestGetUserAgent(t *testing.T) {
	// Run multiple times to check both variants
	userAgents := make(map[string]bool)

	for range 20 {
		ua := getUserAgent()
		userAgents[ua] = true

		// Check that it's a valid Mozilla user agent
		assert.Contains(t, ua, "Mozilla/5.0")
		assert.Contains(t, ua, "AppleWebKit/537.36")
		assert.Contains(t, ua, "Chrome/124.0.0.0")
		assert.Contains(t, ua, "Safari/537.36")

		// Should contain either Windows or Mac
		isWindows := strings.Contains(ua, "Windows NT 11.0")
		isMac := strings.Contains(ua, "Macintosh; Intel Mac OS X 14_0_0")
		assert.True(t, isWindows || isMac, "User agent should contain either Windows or Mac identifier")
	}

	// With enough iterations, we should see both variants
	// though this might occasionally fail
	if len(userAgents) == 1 {
		t.Log("Note: Only one user agent variant was generated in this test run")
	}
}

// TestWebSocketClient_Close tests connection closing
func TestWebSocketClient_Close(t *testing.T) {
	agent := createTestAgent(t)

	t.Setenv("PULSE_AGENT_HUB_URL", "http://localhost:8080")
	t.Setenv("PULSE_AGENT_TOKEN", "test-token")

	client, err := newWebSocketClient(agent)
	require.NoError(t, err)

	// Test closing with nil connection (should not panic)
	assert.NotPanics(t, func() {
		client.Close()
	})
}

// TestWebSocketClient_ConnectRateLimit tests connection rate limiting
func TestWebSocketClient_ConnectRateLimit(t *testing.T) {
	agent := createTestAgent(t)

	t.Setenv("PULSE_AGENT_HUB_URL", "http://localhost:8080")
	t.Setenv("PULSE_AGENT_TOKEN", "test-token")

	client, err := newWebSocketClient(agent)
	require.NoError(t, err)

	// Set recent connection attempt
	client.lastConnectAttempt = time.Now()

	// Test that connection fails quickly due to rate limiting
	// This won't actually connect but should fail fast
	err = client.Connect()
	assert.Error(t, err, "Connection should fail but not hang")
}

// TestGetToken tests the getToken function with various scenarios
func TestGetToken(t *testing.T) {
	t.Run("token from TOKEN environment variable", func(t *testing.T) {
		// Set TOKEN env var
		expectedToken := "test-token-from-env"
		t.Setenv("TOKEN", expectedToken)

		token, err := getToken()
		assert.NoError(t, err)
		assert.Equal(t, expectedToken, token)
	})

	t.Run("token from pulse agent token environment variable", func(t *testing.T) {
		// Set the Pulse token env var (should take precedence over the generic TOKEN fallback).
		expectedToken := "test-token-from-pulse-env"
		t.Setenv("PULSE_AGENT_TOKEN", expectedToken)

		token, err := getToken()
		assert.NoError(t, err)
		assert.Equal(t, expectedToken, token)
	})

	t.Run("token from TOKEN_FILE", func(t *testing.T) {
		// Create a temporary token file
		expectedToken := "test-token-from-file"
		tokenFile, err := os.CreateTemp("", "token-test-*.txt")
		require.NoError(t, err)
		defer os.Remove(tokenFile.Name())

		_, err = tokenFile.WriteString(expectedToken)
		require.NoError(t, err)
		tokenFile.Close()

		// Set TOKEN_FILE env var
		t.Setenv("TOKEN_FILE", tokenFile.Name())

		token, err := getToken()
		assert.NoError(t, err)
		assert.Equal(t, expectedToken, token)
	})

	t.Run("token from pulse agent token file", func(t *testing.T) {
		// Create a temporary token file
		expectedToken := "test-token-from-pulse-file"
		tokenFile, err := os.CreateTemp("", "token-test-*.txt")
		require.NoError(t, err)
		defer os.Remove(tokenFile.Name())

		_, err = tokenFile.WriteString(expectedToken)
		require.NoError(t, err)
		tokenFile.Close()

		// Set the Pulse token file env var (should take precedence over TOKEN_FILE).
		t.Setenv("PULSE_AGENT_TOKEN_FILE", tokenFile.Name())

		token, err := getToken()
		assert.NoError(t, err)
		assert.Equal(t, expectedToken, token)
	})

	t.Run("TOKEN takes precedence over TOKEN_FILE", func(t *testing.T) {
		// Create a temporary token file
		fileToken := "token-from-file"
		tokenFile, err := os.CreateTemp("", "token-test-*.txt")
		require.NoError(t, err)
		defer os.Remove(tokenFile.Name())

		_, err = tokenFile.WriteString(fileToken)
		require.NoError(t, err)
		tokenFile.Close()

		// Set both TOKEN and TOKEN_FILE
		envToken := "token-from-env"
		t.Setenv("TOKEN", envToken)
		t.Setenv("TOKEN_FILE", tokenFile.Name())

		token, err := getToken()
		assert.NoError(t, err)
		assert.Equal(t, envToken, token, "TOKEN should take precedence over TOKEN_FILE")
	})

	t.Run("error when neither TOKEN nor TOKEN_FILE is set", func(t *testing.T) {
		t.Setenv("PULSE_AGENT_TOKEN", "")
		t.Setenv("TOKEN", "")
		t.Setenv("PULSE_AGENT_TOKEN_FILE", "")
		t.Setenv("TOKEN_FILE", "")

		token, err := getToken()
		assert.Error(t, err)
		assert.Equal(t, "", token)
		assert.Contains(t, err.Error(), "must set TOKEN or TOKEN_FILE")
	})

	t.Run("error when TOKEN_FILE points to non-existent file", func(t *testing.T) {
		// Set TOKEN_FILE to a non-existent file
		t.Setenv("TOKEN_FILE", "/non/existent/file.txt")

		token, err := getToken()
		assert.Error(t, err)
		assert.Equal(t, "", token)
		assert.True(t, os.IsNotExist(err), "expected missing token file error")
	})

	t.Run("handles empty token file", func(t *testing.T) {
		// Create an empty token file
		tokenFile, err := os.CreateTemp("", "token-test-*.txt")
		require.NoError(t, err)
		defer os.Remove(tokenFile.Name())
		tokenFile.Close()

		// Set TOKEN_FILE env var
		t.Setenv("TOKEN_FILE", tokenFile.Name())

		token, err := getToken()
		assert.NoError(t, err)
		assert.Equal(t, "", token, "Empty file should return empty string")
	})

	t.Run("strips whitespace from TOKEN_FILE", func(t *testing.T) {
		tokenWithWhitespace := "  test-token-with-whitespace  \n\t"
		expectedToken := "test-token-with-whitespace"
		tokenFile, err := os.CreateTemp("", "token-test-*.txt")
		require.NoError(t, err)
		defer os.Remove(tokenFile.Name())

		_, err = tokenFile.WriteString(tokenWithWhitespace)
		require.NoError(t, err)
		tokenFile.Close()

		t.Setenv("TOKEN_FILE", tokenFile.Name())

		token, err := getToken()
		assert.NoError(t, err)
		assert.Equal(t, expectedToken, token, "Whitespace should be stripped from token file content")
	})

	t.Run("token from paired data dir", func(t *testing.T) {
		dataDir := t.TempDir()
		expectedToken := "test-token-from-pairing"
		require.NoError(t, os.WriteFile(filepath.Join(dataDir, "token"), []byte(expectedToken), 0o600))
		t.Setenv("DATA_DIR", dataDir)

		token, err := getToken()
		assert.NoError(t, err)
		assert.Equal(t, expectedToken, token)
	})
}
