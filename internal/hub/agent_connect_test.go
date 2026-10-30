//go:build testing

package hub

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"gutenacht.site/pulse/agent"
	"gutenacht.site/pulse/internal/common"
	"gutenacht.site/pulse/internal/hub/ws"

	"github.com/pocketbase/pocketbase/core"
	pbtests "github.com/pocketbase/pocketbase/tests"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Helper function to create a test hub without import cycle
func createTestHub(t testing.TB) (*Hub, *pbtests.TestApp, error) {
	testDataDir := t.TempDir()
	testApp, err := pbtests.NewTestApp(testDataDir)
	if err != nil {
		return nil, nil, err
	}
	return NewHub(testApp), testApp, err
}

// cleanupTestHub stops background system goroutines before tearing down the app.
func cleanupTestHub(hub *Hub, testApp *pbtests.TestApp) {
	if hub != nil {
		sm := hub.GetSystemManager()
		sm.RemoveAllSystems()
		// Give updater goroutines a brief window to observe cancellation before DB teardown.
		for range 20 {
			if sm.GetSystemCount() == 0 {
				break
			}
			runtime.Gosched()
			time.Sleep(5 * time.Millisecond)
		}
		time.Sleep(20 * time.Millisecond)
	}
	if testApp != nil {
		testApp.Cleanup()
	}
}

// Helper function to create a test record
func createTestRecord(app core.App, collection string, data map[string]any) (*core.Record, error) {
	col, err := app.FindCachedCollectionByNameOrId(collection)
	if err != nil {
		return nil, err
	}
	record := core.NewRecord(col)
	for key, value := range data {
		record.Set(key, value)
	}

	return record, app.Save(record)
}

func mustAssetMetadata(t testing.TB, record *core.Record) map[string]any {
	t.Helper()
	var metadata map[string]any
	require.NoError(t, record.UnmarshalJSONField("metadata", &metadata))
	return metadata
}

// Helper function to create a test user
func createTestUser(app core.App) (*core.Record, error) {
	userRecord, err := createTestRecord(app, "users", map[string]any{
		"email":    "test@test.com",
		"password": "testtesttest",
	})
	return userRecord, err
}

// TestValidateAgentHeaders tests the validateAgentHeaders function
func TestValidateAgentHeaders(t *testing.T) {
	hub, testApp, err := createTestHub(t)
	if err != nil {
		t.Fatal(err)
	}
	defer cleanupTestHub(hub, testApp)

	testCases := []struct {
		name          string
		headers       http.Header
		expectError   bool
		expectedToken string
		expectedAgent string
	}{
		{
			name: "valid pulse headers",
			headers: http.Header{
				"X-Token": []string{"valid-token-123"},
				"X-Pulse": []string{"0.5.0"},
			},
			expectError:   false,
			expectedToken: "valid-token-123",
			expectedAgent: "0.5.0",
		},
		{
			name: "unknown agent header is rejected",
			headers: http.Header{
				"X-Token": []string{"valid-token-123"},
				"X-Other": []string{"0.4.9"},
			},
			expectError: true,
		},
		{
			name: "pulse header is required even with other headers",
			headers: http.Header{
				"X-Token": []string{"valid-token-123"},
				"X-Pulse": []string{"0.5.1"},
				"X-Other": []string{"0.4.9"},
			},
			expectError:   false,
			expectedToken: "valid-token-123",
			expectedAgent: "0.5.1",
		},
		{
			name: "missing token",
			headers: http.Header{
				"X-Pulse": []string{"0.5.0"},
			},
			expectError: true,
		},
		{
			name: "missing agent version",
			headers: http.Header{
				"X-Token": []string{"valid-token-123"},
			},
			expectError: true,
		},
		{
			name: "empty token",
			headers: http.Header{
				"X-Token": []string{""},
				"X-Pulse": []string{"0.5.0"},
			},
			expectError: true,
		},
		{
			name: "empty agent version",
			headers: http.Header{
				"X-Token": []string{"valid-token-123"},
				"X-Pulse": []string{""},
			},
			expectError: true,
		},
		{
			name: "token too long",
			headers: http.Header{
				"X-Token": []string{strings.Repeat("a", 65)},
				"X-Pulse": []string{"0.5.0"},
			},
			expectError: true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			acr := &agentConnectRequest{hub: hub}
			token, agentVersion, err := acr.validateAgentHeaders(tc.headers)

			if tc.expectError {
				assert.Error(t, err)
			} else {
				require.NoError(t, err)
				assert.Equal(t, tc.expectedToken, token)
				assert.Equal(t, tc.expectedAgent, agentVersion)
			}
		})
	}
}

// TestGetAllFingerprintRecordsByToken tests the getAllFingerprintRecordsByToken function
func TestGetAllFingerprintRecordsByToken(t *testing.T) {
	hub, testApp, err := createTestHub(t)
	if err != nil {
		t.Fatal(err)
	}
	defer cleanupTestHub(hub, testApp)

	// create test user
	userRecord, err := createTestUser(testApp)
	if err != nil {
		t.Fatal(err)
	}

	// Create test data
	systemRecord, err := createTestRecord(testApp, "systems", map[string]any{
		"name":   "test-system",
		"status": "pending",
		"users":  []string{userRecord.Id},
	})
	if err != nil {
		t.Fatal(err)
	}

	fingerprintRecord, err := createTestRecord(testApp, "fingerprints", map[string]any{
		"system":      systemRecord.Id,
		"token":       "test-token-123",
		"fingerprint": "test-fingerprint",
	})
	for i := range 3 {
		systemRecord, _ := createTestRecord(testApp, "systems", map[string]any{
			"name":   fmt.Sprintf("test-system-%d", i),
			"status": "pending",
			"users":  []string{userRecord.Id},
		})
		createTestRecord(testApp, "fingerprints", map[string]any{
			"system":      systemRecord.Id,
			"token":       "duplicate-token",
			"fingerprint": fmt.Sprintf("test-fingerprint-%d", i),
		})
	}
	if err != nil {
		t.Fatal(err)
	}

	testCases := []struct {
		name       string
		token      string
		expectedId string
		expectLen  int
	}{
		{
			name:       "valid token",
			token:      "test-token-123",
			expectLen:  1,
			expectedId: fingerprintRecord.Id,
		},
		{
			name:      "invalid token",
			token:     "invalid-token",
			expectLen: 0,
		},
		{
			name:      "empty token",
			token:     "",
			expectLen: 0,
		},
		{
			name:      "duplicate token",
			token:     "duplicate-token",
			expectLen: 3,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			records := getFingerprintRecordsByToken(tc.token, hub)

			require.Len(t, records, tc.expectLen)
			if tc.expectedId != "" {
				assert.Equal(t, tc.expectedId, records[0].Id)
			}
		})
	}
}

// TestSetFingerprint tests the SetFingerprint function
func TestSetFingerprint(t *testing.T) {
	hub, testApp, err := createTestHub(t)
	if err != nil {
		t.Fatal(err)
	}
	defer cleanupTestHub(hub, testApp)

	// Create test user
	userRecord, err := createTestUser(testApp)
	if err != nil {
		t.Fatal(err)
	}

	// Create test system
	systemRecord, err := createTestRecord(testApp, "systems", map[string]any{
		"name":   "test-system",
		"status": "pending",
		"users":  []string{userRecord.Id},
	})
	if err != nil {
		t.Fatal(err)
	}

	// Create fingerprint record
	fingerprintRecord, err := createTestRecord(testApp, "fingerprints", map[string]any{
		"system":      systemRecord.Id,
		"token":       "test-token-123",
		"fingerprint": "",
	})
	if err != nil {
		t.Fatal(err)
	}

	testCases := []struct {
		name           string
		recordId       string
		newFingerprint string
		expectError    bool
	}{
		{
			name:           "successful fingerprint update",
			recordId:       fingerprintRecord.Id,
			newFingerprint: "new-test-fingerprint",
			expectError:    false,
		},
		{
			name:           "empty fingerprint",
			recordId:       fingerprintRecord.Id,
			newFingerprint: "",
			expectError:    false,
		},
		{
			name:           "invalid record ID",
			recordId:       "invalid-id",
			newFingerprint: "fingerprint",
			expectError:    true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			err := hub.SetFingerprint(&ws.FingerprintRecord{Id: tc.recordId, Token: "test-token-123"}, tc.newFingerprint)

			if tc.expectError {
				assert.Error(t, err)
			} else {
				require.NoError(t, err)

				// Verify fingerprint was updated
				updatedRecord, err := testApp.FindRecordById("fingerprints", tc.recordId)
				require.NoError(t, err)
				assert.Equal(t, tc.newFingerprint, updatedRecord.GetString("fingerprint"))
			}
		})
	}
}

// TestAgentConnect tests the agentConnect function with various scenarios
func TestAgentConnect(t *testing.T) {
	hub, testApp, err := createTestHub(t)
	if err != nil {
		t.Fatal(err)
	}
	defer cleanupTestHub(hub, testApp)

	// Create test user
	userRecord, err := createTestUser(testApp)
	if err != nil {
		t.Fatal(err)
	}

	// Create test system
	systemRecord, err := createTestRecord(testApp, "systems", map[string]any{
		"name":   "test-system",
		"status": "pending",
		"users":  []string{userRecord.Id},
	})
	if err != nil {
		t.Fatal(err)
	}

	// Create fingerprint record
	testToken := "test-token-456"
	_, err = createTestRecord(testApp, "fingerprints", map[string]any{
		"system":      systemRecord.Id,
		"token":       testToken,
		"fingerprint": "",
	})
	if err != nil {
		t.Fatal(err)
	}

	testCases := []struct {
		name           string
		headers        map[string]string
		expectedStatus int
		description    string
		errorMessage   string
	}{
		{
			name: "missing token header",
			headers: map[string]string{
				"X-Pulse": "0.5.0",
			},
			expectedStatus: http.StatusBadRequest,
			description:    "Should fail due to missing token",
			errorMessage:   "",
		},
		{
			name: "missing agent version header",
			headers: map[string]string{
				"X-Token": testToken,
			},
			expectedStatus: http.StatusBadRequest,
			description:    "Should fail due to missing agent version",
			errorMessage:   "",
		},
		{
			name: "invalid token",
			headers: map[string]string{
				"X-Token": "invalid-token",
				"X-Pulse": "0.5.0",
			},
			expectedStatus: http.StatusUnauthorized,
			description:    "Should fail due to invalid token",
			errorMessage:   "Invalid token",
		},
		{
			name: "invalid agent version",
			headers: map[string]string{
				"X-Token": testToken,
				"X-Pulse": "0.5.0.0.0",
			},
			expectedStatus: http.StatusUnauthorized,
			description:    "Should fail due to invalid agent version",
			errorMessage:   "Invalid agent version",
		},
		{
			name: "valid headers but websocket upgrade will fail in test",
			headers: map[string]string{
				"X-Token": testToken,
				"X-Pulse": "0.5.0",
			},
			expectedStatus: http.StatusInternalServerError,
			description:    "Should pass validation but fail at WebSocket upgrade due to test limitations",
			errorMessage:   "WebSocket upgrade failed",
		},
		{
			name:           "Token too long",
			headers:        map[string]string{"X-Token": strings.Repeat("a", 65), "X-Pulse": "0.5.0"},
			expectedStatus: http.StatusBadRequest,
			description:    "Should reject token exceeding 64 characters",
			errorMessage:   "",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/api/pulse/agent-connect", nil)
			for key, value := range tc.headers {
				req.Header.Set(key, value)
			}

			recorder := httptest.NewRecorder()
			acr := &agentConnectRequest{
				hub: hub,
				req: req,
				res: recorder,
			}
			err = acr.agentConnect()

			assert.Equal(t, tc.expectedStatus, recorder.Code, tc.description)
			assert.Equal(t, tc.errorMessage, recorder.Body.String(), tc.description)
		})
	}
}

// TestSendResponseError tests the sendResponseError function
func TestSendResponseError(t *testing.T) {
	testCases := []struct {
		name           string
		statusCode     int
		message        string
		expectedStatus int
		expectedBody   string
	}{
		{
			name:           "unauthorized error",
			statusCode:     http.StatusUnauthorized,
			message:        "Invalid token",
			expectedStatus: http.StatusUnauthorized,
			expectedBody:   "Invalid token",
		},
		{
			name:           "bad request error",
			statusCode:     http.StatusBadRequest,
			message:        "Missing required header",
			expectedStatus: http.StatusBadRequest,
			expectedBody:   "Missing required header",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			acr := &agentConnectRequest{}
			acr.sendResponseError(recorder, tc.statusCode, tc.message)

			assert.Equal(t, tc.expectedStatus, recorder.Code)
			assert.Equal(t, tc.expectedBody, recorder.Body.String())
		})
	}
}

// TestHandleAgentConnect tests the HTTP handler
func TestHandleAgentConnect(t *testing.T) {
	hub, testApp, err := createTestHub(t)
	if err != nil {
		t.Fatal(err)
	}
	defer cleanupTestHub(hub, testApp)

	// Create test user
	userRecord, err := createTestUser(testApp)
	if err != nil {
		t.Fatal(err)
	}

	// Create test system
	systemRecord, err := createTestRecord(testApp, "systems", map[string]any{
		"name":   "test-system",
		"status": "pending",
		"users":  []string{userRecord.Id},
	})
	if err != nil {
		t.Fatal(err)
	}

	// Create fingerprint record
	testToken := "test-token-789"
	_, err = createTestRecord(testApp, "fingerprints", map[string]any{
		"system":      systemRecord.Id,
		"token":       testToken,
		"fingerprint": "",
	})
	if err != nil {
		t.Fatal(err)
	}

	testCases := []struct {
		name           string
		method         string
		headers        map[string]string
		expectedStatus int
		description    string
	}{
		{
			name:   "GET with invalid token",
			method: "GET",
			headers: map[string]string{
				"X-Token": "invalid",
				"X-Pulse": "0.5.0",
			},
			expectedStatus: http.StatusUnauthorized,
			description:    "Should reject invalid token",
		},
		{
			name:   "GET with valid token",
			method: "GET",
			headers: map[string]string{
				"X-Token": testToken,
				"X-Pulse": "0.5.0",
			},
			expectedStatus: http.StatusInternalServerError, // WebSocket upgrade fails in test
			description:    "Should pass validation but fail at WebSocket upgrade",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, "/api/pulse/agent-connect", nil)
			for key, value := range tc.headers {
				req.Header.Set(key, value)
			}

			recorder := httptest.NewRecorder()
			acr := &agentConnectRequest{
				hub: hub,
				req: req,
				res: recorder,
			}
			err = acr.agentConnect()

			assert.Equal(t, tc.expectedStatus, recorder.Code, tc.description)
		})
	}
}

func TestHandleAgentConnectLegacyApiPrefixCompatibility(t *testing.T) {
	hub, testApp, err := createTestHub(t)
	require.NoError(t, err)
	defer cleanupTestHub(hub, testApp)

	userRecord, err := createTestUser(testApp)
	require.NoError(t, err)

	systemRecord, err := createTestRecord(testApp, "systems", map[string]any{
		"name":   "legacy-system",
		"status": "pending",
		"users":  []string{userRecord.Id},
	})
	require.NoError(t, err)

	testToken := "legacy-token-789"
	_, err = createTestRecord(testApp, "fingerprints", map[string]any{
		"system":      systemRecord.Id,
		"token":       testToken,
		"fingerprint": "",
	})
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodGet, "/api/pulse/agent-connect", nil)
	req.Header.Set("X-Token", testToken)
	req.Header.Set("X-Pulse", "0.5.0")

	recorder := httptest.NewRecorder()
	acr := &agentConnectRequest{
		hub: hub,
		req: req,
		res: recorder,
	}
	err = acr.agentConnect()

	assert.Equal(t, http.StatusInternalServerError, recorder.Code)
	assert.Equal(t, "WebSocket upgrade failed", recorder.Body.String())
	assert.NoError(t, err)
}

// TestAgentWebSocketIntegration tests WebSocket connection scenarios with an actual agent
func TestAgentWebSocketIntegration(t *testing.T) {
	// Create hub and test app
	hub, testApp, err := createTestHub(t)
	require.NoError(t, err)
	defer cleanupTestHub(hub, testApp)

	// Create test user
	userRecord, err := createTestUser(testApp)
	require.NoError(t, err)

	// Create HTTP server with the actual API route
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/pulse/agent-connect" {
			acr := &agentConnectRequest{
				hub: hub,
				req: r,
				res: w,
			}
			acr.agentConnect()
		} else {
			http.NotFound(w, r)
		}
	}))
	defer ts.Close()

	testCases := []struct {
		name               string
		agentToken         string // Token agent will send
		dbToken            string // Token in database (empty means no record created)
		agentFingerprint   string // Fingerprint agent will send (empty means agent generates its own)
		dbFingerprint      string // Fingerprint in database
		expectConnection   bool
		expectFingerprint  string // "empty", "unchanged", or "updated"
		expectSystemStatus string
		description        string
	}{
		{
			name:               "empty fingerprint - agent sets fingerprint on first connection",
			agentToken:         "test-token-1",
			dbToken:            "test-token-1",
			agentFingerprint:   "agent-fingerprint-1",
			dbFingerprint:      "",
			expectConnection:   true,
			expectFingerprint:  "updated",
			expectSystemStatus: "up",
			description:        "Agent should connect and set its fingerprint when DB fingerprint is empty",
		},
		{
			name:               "matching fingerprint should be accepted",
			agentToken:         "test-token-2",
			dbToken:            "test-token-2",
			agentFingerprint:   "matching-fingerprint-123",
			dbFingerprint:      "matching-fingerprint-123",
			expectConnection:   true,
			expectFingerprint:  "unchanged",
			expectSystemStatus: "up",
			description:        "Agent should connect when its fingerprint matches existing DB fingerprint",
		},
		{
			name:               "fingerprint mismatch should be rejected",
			agentToken:         "test-token-3",
			dbToken:            "test-token-3",
			agentFingerprint:   "different-fingerprint-456",
			dbFingerprint:      "original-fingerprint-123",
			expectConnection:   false,
			expectFingerprint:  "unchanged",
			expectSystemStatus: "pending",
			description:        "Agent should be rejected when its fingerprint doesn't match existing DB fingerprint",
		},
		{
			name:               "invalid token should be rejected",
			agentToken:         "invalid-token-999",
			dbToken:            "test-token-4",
			agentFingerprint:   "matching-fingerprint-456",
			dbFingerprint:      "matching-fingerprint-456",
			expectConnection:   false,
			expectFingerprint:  "unchanged",
			expectSystemStatus: "pending",
			description:        "Connection should fail when using invalid token",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// Create test system with unique port for each test
			portNum := 45000 + len(tc.name) // Use name length to get unique port
			systemRecord, err := createTestRecord(testApp, "systems", map[string]any{
				"name":   fmt.Sprintf("test-system-%s", tc.name),
				"host":   "localhost",
				"port":   fmt.Sprintf("%d", portNum),
				"status": "pending",
				"users":  []string{userRecord.Id},
			})
			require.NoError(t, err)

			// Always create fingerprint record for this test's system
			fingerprintRecord, err := createTestRecord(testApp, "fingerprints", map[string]any{
				"system":      systemRecord.Id,
				"token":       tc.dbToken,
				"fingerprint": tc.dbFingerprint,
			})
			require.NoError(t, err)

			// Create and configure agent
			agentDataDir := t.TempDir()

			// Set up agent fingerprint if specified
			err = os.WriteFile(filepath.Join(agentDataDir, "fingerprint"), []byte(tc.agentFingerprint), 0644)
			require.NoError(t, err)
			t.Logf("Pre-created fingerprint file for agent: %s", tc.agentFingerprint)

			testAgent := agent.NewTestAgent(agentDataDir)

			// Set up environment variables for the agent
			t.Setenv("HUB_URL", ts.URL)
			t.Setenv("TOKEN", tc.agentToken)

			// Start agent in background
			done := make(chan error, 1)
			go func() {
				done <- testAgent.Start()
			}()
			defer func() {
				require.NoError(t, testAgent.Stop())
				select {
				case <-done:
				case <-time.After(2 * time.Second):
					t.Log("Timed out waiting for test agent shutdown")
				}
			}()

			// Wait for connection result
			maxWait := 15 * time.Second
			time.Sleep(40 * time.Millisecond)
			checkInterval := 20 * time.Millisecond
			timeout := time.After(maxWait)
			ticker := time.Tick(checkInterval)

			connectionManager := testAgent.GetConnectionManager()

			connectionResult := false
			for {
				select {
				case <-timeout:
					// Timeout reached
					if tc.expectConnection {
						t.Fatalf("Expected connection to succeed but timed out - agent state: %d", connectionManager.State)
					} else {
						t.Logf("Connection properly rejected (timeout) - agent state: %d", connectionManager.State)
					}
					connectionResult = false
				case <-ticker:
					if connectionManager.State == agent.WebSocketConnected {
						if tc.expectConnection {
							t.Logf("WebSocket connection successful - agent state: %d", connectionManager.State)
							connectionResult = true
						} else {
							t.Errorf("Unexpected: Connection succeeded when it should have been rejected")
							return
						}
					}
				case err := <-done:
					if err != nil {
						if !tc.expectConnection {
							t.Logf("Agent connection properly rejected: %v", err)
							connectionResult = false
						} else {
							t.Fatalf("Agent failed to start: %v", err)
						}
					}
				}

				// Break if we got the expected result or timed out
				if connectionResult == tc.expectConnection || connectionResult {
					break
				}
			}

			time.Sleep(20 * time.Millisecond)

			// Verify fingerprint state by re-reading the specific record
			updatedFingerprintRecord, err := testApp.FindRecordById("fingerprints", fingerprintRecord.Id)
			require.NoError(t, err)
			finalFingerprint := updatedFingerprintRecord.GetString("fingerprint")

			switch tc.expectFingerprint {
			case "empty":
				assert.Empty(t, finalFingerprint, "Fingerprint should be empty")
			case "unchanged":
				assert.Equal(t, tc.dbFingerprint, finalFingerprint, "Fingerprint should not change when connection is rejected")
			case "updated":
				if tc.dbFingerprint == "" {
					assert.NotEmpty(t, finalFingerprint, "Fingerprint should be updated after successful connection")
				} else {
					assert.NotEqual(t, tc.dbFingerprint, finalFingerprint, "Fingerprint should be updated after successful connection")
				}
			}

			// Verify system status
			updatedSystemRecord, err := testApp.FindRecordById("systems", systemRecord.Id)
			require.NoError(t, err)
			status := updatedSystemRecord.GetString("status")
			assert.Equal(t, tc.expectSystemStatus, status, "System status should match expected value")

			t.Logf("%s - System status: %s, Fingerprint: %s", tc.description, status, finalFingerprint)
		})
	}
}

// TestGetRealIP tests the getRealIP function
func TestGetRealIP(t *testing.T) {
	testCases := []struct {
		name       string
		headers    map[string]string
		remoteAddr string
		expectedIP string
	}{
		{
			name:       "CF-Connecting-IP header",
			headers:    map[string]string{"CF-Connecting-IP": "192.168.1.1"},
			remoteAddr: "127.0.0.1:12345",
			expectedIP: "192.168.1.1",
		},
		{
			name:       "X-Forwarded-For header with single IP",
			headers:    map[string]string{"X-Forwarded-For": "192.168.1.2"},
			remoteAddr: "127.0.0.1:12345",
			expectedIP: "192.168.1.2",
		},
		{
			name:       "X-Forwarded-For header with multiple IPs",
			headers:    map[string]string{"X-Forwarded-For": "192.168.1.3, 10.0.0.1, 172.16.0.1"},
			remoteAddr: "127.0.0.1:12345",
			expectedIP: "192.168.1.3",
		},
		{
			name:       "X-Forwarded-For header with spaces",
			headers:    map[string]string{"X-Forwarded-For": "  192.168.1.4  "},
			remoteAddr: "127.0.0.1:12345",
			expectedIP: "192.168.1.4",
		},
		{
			name:       "No headers, fallback to RemoteAddr with port",
			headers:    map[string]string{},
			remoteAddr: "192.168.1.5:54321",
			expectedIP: "192.168.1.5",
		},
		{
			name:       "No headers, fallback to RemoteAddr without port",
			headers:    map[string]string{},
			remoteAddr: "192.168.1.6",
			expectedIP: "192.168.1.6",
		},
		{
			name:       "Both headers present, CF takes precedence",
			headers:    map[string]string{"CF-Connecting-IP": "192.168.1.1", "X-Forwarded-For": "192.168.1.2"},
			remoteAddr: "127.0.0.1:12345",
			expectedIP: "192.168.1.1",
		},
		{
			name:       "X-Forwarded-For present, takes precedence over RemoteAddr",
			headers:    map[string]string{"X-Forwarded-For": "192.168.1.2"},
			remoteAddr: "192.168.1.5:54321",
			expectedIP: "192.168.1.2",
		},
		{
			name:       "Empty X-Forwarded-For, fallback to RemoteAddr",
			headers:    map[string]string{"X-Forwarded-For": ""},
			remoteAddr: "192.168.1.7:12345",
			expectedIP: "192.168.1.7",
		},
		{
			name:       "Empty CF-Connecting-IP, fallback to X-Forwarded-For",
			headers:    map[string]string{"CF-Connecting-IP": "", "X-Forwarded-For": "192.168.1.8"},
			remoteAddr: "127.0.0.1:12345",
			expectedIP: "192.168.1.8",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/", nil)
			for key, value := range tc.headers {
				req.Header.Set(key, value)
			}
			req.RemoteAddr = tc.remoteAddr

			ip := getRealIP(req)
			assert.Equal(t, tc.expectedIP, ip)
		})
	}
}

func TestIsLoopbackLocalAgentRequest(t *testing.T) {
	tests := []struct {
		name       string
		host       string
		remoteAddr string
		want       bool
	}{
		{name: "127 host from 127 remote", host: "127.0.0.1:8090", remoteAddr: "127.0.0.1:45123", want: true},
		{name: "localhost host from 127 remote", host: "localhost:8090", remoteAddr: "127.0.0.1:45123", want: true},
		{name: "ipv6 host from ipv6 remote", host: "[::1]:8090", remoteAddr: "[::1]:45123", want: true},
		{name: "lan host from loopback remote is rejected", host: "192.168.1.30:8090", remoteAddr: "127.0.0.1:45123", want: false},
		{name: "loopback host from lan remote is rejected", host: "127.0.0.1:8090", remoteAddr: "192.168.1.20:45123", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "http://"+tt.host+"/api/pulse/agent-connect", nil)
			req.RemoteAddr = tt.remoteAddr
			assert.Equal(t, tt.want, isLoopbackLocalAgentRequest(req))
		})
	}
}

func TestLocalAgentTokenEnvironmentPriority(t *testing.T) {
	t.Run("default pulse token", func(t *testing.T) {
		t.Setenv("PULSE_LOCAL_AGENT_TOKEN", "")
		assert.Equal(t, "pulse-local-agent", localAgentToken())
	})

	t.Run("pulse env is used", func(t *testing.T) {
		t.Setenv("PULSE_LOCAL_AGENT_TOKEN", "pulse-token")
		assert.Equal(t, "pulse-token", localAgentToken())
	})
}

func TestRepairLocalSystemMarkersClearsRecordsWithoutCurrentLocalToken(t *testing.T) {
	t.Setenv("PULSE_LOCAL_AGENT_TOKEN", "current-local-token")

	hub, testApp, err := createTestHub(t)
	require.NoError(t, err)
	defer cleanupTestHub(hub, testApp)

	userRecord, err := createTestUser(testApp)
	require.NoError(t, err)

	currentLocalRecord, err := createTestRecord(testApp, "systems", map[string]any{
		"name":     "hub-host",
		"is_local": true,
		"users":    []string{userRecord.Id},
	})
	require.NoError(t, err)
	_, err = createTestRecord(testApp, "fingerprints", map[string]any{
		"system":      currentLocalRecord.Id,
		"token":       "current-local-token",
		"fingerprint": "current-local-fingerprint",
	})
	require.NoError(t, err)

	staleRemoteRecord, err := createTestRecord(testApp, "systems", map[string]any{
		"name":     "nacht",
		"is_local": true,
		"users":    []string{userRecord.Id},
	})
	require.NoError(t, err)
	_, err = createTestRecord(testApp, "fingerprints", map[string]any{
		"system":      staleRemoteRecord.Id,
		"token":       "regular-agent-token",
		"fingerprint": "remote-fingerprint",
	})
	require.NoError(t, err)

	unboundRecord, err := createTestRecord(testApp, "systems", map[string]any{
		"name":     "legacy-local",
		"is_local": true,
		"users":    []string{userRecord.Id},
	})
	require.NoError(t, err)
	unconfirmedRecord, err := createTestRecord(testApp, "systems", map[string]any{
		"name":              "pending-pairing-local",
		"is_local":          true,
		"pairing_confirmed": false,
		"users":             []string{userRecord.Id},
	})
	require.NoError(t, err)
	_, err = createTestRecord(testApp, "fingerprints", map[string]any{
		"system":      unconfirmedRecord.Id,
		"token":       "regular-agent-token",
		"fingerprint": "pending-pairing-fingerprint",
	})
	require.NoError(t, err)

	require.NoError(t, hub.repairLocalSystemMarkers())

	updatedCurrentRecord, err := testApp.FindRecordById("systems", currentLocalRecord.Id)
	require.NoError(t, err)
	assert.True(t, updatedCurrentRecord.GetBool("is_local"))

	updatedStaleRecord, err := testApp.FindRecordById("systems", staleRemoteRecord.Id)
	require.NoError(t, err)
	assert.False(t, updatedStaleRecord.GetBool("is_local"))

	updatedUnboundRecord, err := testApp.FindRecordById("systems", unboundRecord.Id)
	require.NoError(t, err)
	assert.True(t, updatedUnboundRecord.GetBool("is_local"))

	updatedUnconfirmedRecord, err := testApp.FindRecordById("systems", unconfirmedRecord.Id)
	require.NoError(t, err)
	assert.False(t, updatedUnconfirmedRecord.GetBool("is_local"))
}

func TestRepairLocalSystemMarkersKeepsDevLoopbackHubRecord(t *testing.T) {
	t.Setenv("PULSE_LOCAL_AGENT_TOKEN", "current-local-token")
	t.Setenv("PULSE_DEV_LOCAL_AGENT_AS_HUB", "true")

	hub, testApp, err := createTestHub(t)
	require.NoError(t, err)
	defer cleanupTestHub(hub, testApp)

	userRecord, err := createTestUser(testApp)
	require.NoError(t, err)

	devLocalRecord, err := createTestRecord(testApp, "systems", map[string]any{
		"name":              "GuteNacht",
		"is_local":          true,
		"pairing_confirmed": true,
		"users":             []string{userRecord.Id},
		"info": map[string]any{
			"ip": "127.0.0.1",
			"cap": map[string]any{
				"platform":       "windows",
				"install_method": "windows",
				"run_mode":       "host",
				"agent_profile":  "windows-host",
			},
		},
	})
	require.NoError(t, err)
	_, err = createTestRecord(testApp, "fingerprints", map[string]any{
		"system":      devLocalRecord.Id,
		"token":       "regular-agent-token",
		"fingerprint": "dev-loopback-fingerprint",
	})
	require.NoError(t, err)

	remoteRecord, err := createTestRecord(testApp, "systems", map[string]any{
		"name":     "remote-windows",
		"is_local": true,
		"users":    []string{userRecord.Id},
		"info": map[string]any{
			"ip": "192.168.1.5",
		},
	})
	require.NoError(t, err)
	_, err = createTestRecord(testApp, "fingerprints", map[string]any{
		"system":      remoteRecord.Id,
		"token":       "regular-agent-token",
		"fingerprint": "remote-fingerprint",
	})
	require.NoError(t, err)

	require.NoError(t, hub.repairLocalSystemMarkers())

	updatedDevRecord, err := testApp.FindRecordById("systems", devLocalRecord.Id)
	require.NoError(t, err)
	assert.True(t, updatedDevRecord.GetBool("is_local"))

	updatedRemoteRecord, err := testApp.FindRecordById("systems", remoteRecord.Id)
	require.NoError(t, err)
	assert.False(t, updatedRemoteRecord.GetBool("is_local"))
}

func TestFindOrCreateLocalSystem(t *testing.T) {
	hub, testApp, err := createTestHub(t)
	require.NoError(t, err)
	defer cleanupTestHub(hub, testApp)

	userRecord, err := createTestUser(testApp)
	require.NoError(t, err)

	acr := agentConnectRequest{
		hub:          hub,
		req:          &http.Request{RemoteAddr: "127.0.0.1:45123"},
		token:        defaultLocalAgentToken,
		isLocalAgent: true,
	}
	fpRecord, err := acr.findOrCreateLocalSystem(common.FingerprintResponse{
		Fingerprint: "local-fingerprint",
		Hostname:    "hub-hostname",
	})
	require.NoError(t, err)
	require.NotEmpty(t, fpRecord.SystemId)
	require.Equal(t, "local-fingerprint", fpRecord.Fingerprint)
	require.Equal(t, defaultLocalAgentToken, fpRecord.Token)

	systemRecord, err := testApp.FindRecordById("systems", fpRecord.SystemId)
	require.NoError(t, err)
	assert.Equal(t, "hub-hostname", systemRecord.GetString("name"))
	assert.True(t, systemRecord.GetBool("is_local"))
	assert.Equal(t, "physical", systemRecord.GetString("role"))
	assert.Equal(t, "production", systemRecord.GetString("primary_use"))
	assert.Equal(t, []string{userRecord.Id}, systemRecord.Get("users"))
	assetID := systemRecord.GetString("asset")
	require.NotEmpty(t, assetID)
	assetRecord, err := testApp.FindRecordById("assets", assetID)
	require.NoError(t, err)
	assert.Equal(t, "hub-hostname", assetRecord.GetString("name"))
	assert.Equal(t, "physical_host", assetRecord.GetString("type"))
	assert.Equal(t, "Hub 所在机器", assetRecord.GetString("role"))
	assert.Equal(t, userRecord.Id, assetRecord.GetString("user"))
	assert.Equal(t, autoAssetSourceHubLocalAgent, mustAssetMetadata(t, assetRecord)["auto_created_by"])

	secondRecord, err := acr.findOrCreateLocalSystem(common.FingerprintResponse{
		Fingerprint: "local-fingerprint",
		Hostname:    "hub-hostname-2",
	})
	require.NoError(t, err)
	assert.Equal(t, fpRecord.SystemId, secondRecord.SystemId)
	assert.Equal(t, "local-fingerprint", secondRecord.Fingerprint)

	localSystems, err := testApp.FindRecordsByFilter("systems", "is_local = true", "", -1, 0)
	require.NoError(t, err)
	assert.Len(t, localSystems, 1)
}

func TestFindOrCreateLocalSystemAdoptsExistingFingerprintSystem(t *testing.T) {
	hub, testApp, err := createTestHub(t)
	require.NoError(t, err)
	defer cleanupTestHub(hub, testApp)

	userRecord, err := createTestUser(testApp)
	require.NoError(t, err)

	systemRecord, err := createTestRecord(testApp, "systems", map[string]any{
		"name":        "nacht",
		"users":       []string{userRecord.Id},
		"description": "内网镜像库",
	})
	require.NoError(t, err)
	_, err = createTestRecord(testApp, "fingerprints", map[string]any{
		"system":      systemRecord.Id,
		"token":       "old-token",
		"fingerprint": "existing-local-fingerprint",
	})
	require.NoError(t, err)

	acr := agentConnectRequest{
		hub:          hub,
		req:          &http.Request{RemoteAddr: "127.0.0.1:45123"},
		token:        defaultLocalAgentToken,
		isLocalAgent: true,
	}
	fpRecord, err := acr.findOrCreateLocalSystem(common.FingerprintResponse{
		Fingerprint: "existing-local-fingerprint",
		Hostname:    "nacht",
	})
	require.NoError(t, err)
	assert.Equal(t, systemRecord.Id, fpRecord.SystemId)

	updatedSystem, err := testApp.FindRecordById("systems", systemRecord.Id)
	require.NoError(t, err)
	assert.Equal(t, "nacht", updatedSystem.GetString("name"))
	assert.True(t, updatedSystem.GetBool("is_local"))
	assert.Equal(t, "内网镜像库", updatedSystem.GetString("description"))
	adoptedAssetID := updatedSystem.GetString("asset")
	require.NotEmpty(t, adoptedAssetID)
	adoptedAsset, err := testApp.FindRecordById("assets", adoptedAssetID)
	require.NoError(t, err)
	assert.Equal(t, "nacht", adoptedAsset.GetString("name"))
	assert.Equal(t, autoAssetSourceHubLocalAgent, mustAssetMetadata(t, adoptedAsset)["auto_created_by"])

	localSystems, err := testApp.FindRecordsByFilter("systems", "is_local = true", "", -1, 0)
	require.NoError(t, err)
	assert.Len(t, localSystems, 1)
}

func TestFindOrCreateLocalSystemDoesNotReuseStaleLocalFingerprint(t *testing.T) {
	hub, testApp, err := createTestHub(t)
	require.NoError(t, err)
	defer cleanupTestHub(hub, testApp)

	userRecord, err := createTestUser(testApp)
	require.NoError(t, err)

	staleLocalRecord, err := createTestRecord(testApp, "systems", map[string]any{
		"name":        "GuteNacht",
		"is_local":    true,
		"users":       []string{userRecord.Id},
		"description": "自己主要用的机器",
	})
	require.NoError(t, err)
	_, err = createTestRecord(testApp, "fingerprints", map[string]any{
		"system":      staleLocalRecord.Id,
		"token":       defaultLocalAgentToken,
		"fingerprint": "windows-host-fingerprint",
	})
	require.NoError(t, err)

	hubRecord, err := createTestRecord(testApp, "systems", map[string]any{
		"name":        "nacht",
		"users":       []string{userRecord.Id},
		"description": "内网镜像库",
	})
	require.NoError(t, err)
	_, err = createTestRecord(testApp, "fingerprints", map[string]any{
		"system":      hubRecord.Id,
		"token":       "old-token",
		"fingerprint": "hub-local-fingerprint",
	})
	require.NoError(t, err)

	acr := agentConnectRequest{
		hub:          hub,
		req:          &http.Request{RemoteAddr: "127.0.0.1:45123"},
		token:        defaultLocalAgentToken,
		isLocalAgent: true,
	}
	fpRecord, err := acr.findOrCreateLocalSystem(common.FingerprintResponse{
		Fingerprint: "hub-local-fingerprint",
		Hostname:    "nacht",
	})
	require.NoError(t, err)
	assert.Equal(t, hubRecord.Id, fpRecord.SystemId)

	updatedHubRecord, err := testApp.FindRecordById("systems", hubRecord.Id)
	require.NoError(t, err)
	assert.True(t, updatedHubRecord.GetBool("is_local"))

	updatedStaleRecord, err := testApp.FindRecordById("systems", staleLocalRecord.Id)
	require.NoError(t, err)
	assert.False(t, updatedStaleRecord.GetBool("is_local"))
	assert.Equal(t, "GuteNacht", updatedStaleRecord.GetString("name"))
}

func TestFindOrCreateLocalSystemRejectsKnownWindowsHostFingerprint(t *testing.T) {
	hub, testApp, err := createTestHub(t)
	require.NoError(t, err)
	defer cleanupTestHub(hub, testApp)

	userRecord, err := createTestUser(testApp)
	require.NoError(t, err)

	windowsRecord, err := createTestRecord(testApp, "systems", map[string]any{
		"name":  "GuteNacht",
		"users": []string{userRecord.Id},
		"info": map[string]any{
			"cap": map[string]any{
				"platform":       "windows",
				"install_method": "windows",
				"run_mode":       "host",
				"agent_profile":  "windows-host",
			},
		},
	})
	require.NoError(t, err)
	_, err = createTestRecord(testApp, "fingerprints", map[string]any{
		"system":      windowsRecord.Id,
		"token":       "windows-token",
		"fingerprint": "windows-host-fingerprint",
	})
	require.NoError(t, err)

	hubRecord, err := createTestRecord(testApp, "systems", map[string]any{
		"name":     "nacht",
		"is_local": true,
		"users":    []string{userRecord.Id},
	})
	require.NoError(t, err)

	acr := agentConnectRequest{
		hub:          hub,
		req:          &http.Request{RemoteAddr: "127.0.0.1:45123"},
		token:        defaultLocalAgentToken,
		isLocalAgent: true,
	}
	_, err = acr.findOrCreateLocalSystem(common.FingerprintResponse{
		Fingerprint: "windows-host-fingerprint",
		Name:        "UM-690",
		Hostname:    "UM-690",
	})
	require.Error(t, err)

	updatedWindowsRecord, err := testApp.FindRecordById("systems", windowsRecord.Id)
	require.NoError(t, err)
	assert.Equal(t, "GuteNacht", updatedWindowsRecord.GetString("name"))
	assert.False(t, updatedWindowsRecord.GetBool("is_local"))

	updatedHubRecord, err := testApp.FindRecordById("systems", hubRecord.Id)
	require.NoError(t, err)
	assert.Equal(t, "nacht", updatedHubRecord.GetString("name"))
	assert.True(t, updatedHubRecord.GetBool("is_local"))
}

func TestFindOrCreateLocalSystemReclaimsMarkedLocalWindowsHostFingerprint(t *testing.T) {
	hub, testApp, err := createTestHub(t)
	require.NoError(t, err)
	defer cleanupTestHub(hub, testApp)

	userRecord, err := createTestUser(testApp)
	require.NoError(t, err)

	windowsRecord, err := createTestRecord(testApp, "systems", map[string]any{
		"name":     "GuteNacht",
		"is_local": true,
		"users":    []string{userRecord.Id},
		"info": map[string]any{
			"cap": map[string]any{
				"platform":       "windows",
				"install_method": "windows",
				"run_mode":       "host",
				"agent_profile":  "windows-host",
			},
		},
	})
	require.NoError(t, err)
	_, err = createTestRecord(testApp, "fingerprints", map[string]any{
		"system":      windowsRecord.Id,
		"token":       defaultLocalAgentToken,
		"fingerprint": "windows-host-fingerprint",
	})
	require.NoError(t, err)

	acr := agentConnectRequest{
		hub:          hub,
		req:          &http.Request{RemoteAddr: "127.0.0.1:45123"},
		token:        defaultLocalAgentToken,
		isLocalAgent: true,
	}
	fpRecord, err := acr.findOrCreateLocalSystem(common.FingerprintResponse{
		Fingerprint: "windows-host-fingerprint",
		Name:        "UM-690",
		Hostname:    "UM-690",
	})
	require.NoError(t, err)
	assert.Equal(t, windowsRecord.Id, fpRecord.SystemId)

	updatedWindowsRecord, err := testApp.FindRecordById("systems", windowsRecord.Id)
	require.NoError(t, err)
	assert.True(t, updatedWindowsRecord.GetBool("is_local"))
	assert.Equal(t, "UM-690", updatedWindowsRecord.GetString("name"))
}

func TestFindOrCreateLocalSystemIgnoresLegacyLocalDisplayName(t *testing.T) {
	hub, testApp, err := createTestHub(t)
	require.NoError(t, err)
	defer cleanupTestHub(hub, testApp)

	_, err = createTestUser(testApp)
	require.NoError(t, err)

	acr := agentConnectRequest{
		hub:          hub,
		req:          &http.Request{RemoteAddr: "127.0.0.1:45123"},
		token:        defaultLocalAgentToken,
		isLocalAgent: true,
	}
	fpRecord, err := acr.findOrCreateLocalSystem(common.FingerprintResponse{
		Fingerprint: "hub-local-fingerprint",
		Name:        "本机",
		Hostname:    "nacht",
	})
	require.NoError(t, err)

	systemRecord, err := testApp.FindRecordById("systems", fpRecord.SystemId)
	require.NoError(t, err)
	assert.Equal(t, "nacht", systemRecord.GetString("name"))
	assert.True(t, systemRecord.GetBool("is_local"))
}
