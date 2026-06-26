package hub_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"gutenacht.site/pulse"
	systemEntity "gutenacht.site/pulse/internal/entities/system"
	pulseTests "gutenacht.site/pulse/internal/tests"

	"github.com/pocketbase/pocketbase/core"
	pbTests "github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/types"
	"github.com/stretchr/testify/require"
	"gutenacht.site/pulse/internal/migrations"
)

// marshal to json and return an io.Reader (for use in ApiScenario.Body)
func jsonReader(v any) io.Reader {
	data, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return bytes.NewReader(data)
}

type testAPIResponse struct {
	Status int
	Body   string
}

func performTestAPIRequest(
	t testing.TB,
	app *pbTests.TestApp,
	method string,
	url string,
	body io.Reader,
	headers map[string]string,
) testAPIResponse {
	t.Helper()
	result := pulseTests.PerformTestAPIRequest(t, app, method, url, body, headers)
	return testAPIResponse(result)
}

func TestApiRoutesAuthentication(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	userToken, err := user.NewAuthToken()
	require.NoError(t, err, "Failed to create auth token")

	// Create test user and get auth token
	user2, err := pulseTests.CreateUser(hub, "testuser@example.com", "password123")
	require.NoError(t, err, "Failed to create test user")
	user2Token, err := user2.NewAuthToken()
	require.NoError(t, err, "Failed to create user2 auth token")

	readOnlyUser, err := pulseTests.CreateUserWithRole(hub, "readonly@example.com", "password123", "readonly")
	require.NoError(t, err, "Failed to create readonly user")
	readOnlyUserToken, err := readOnlyUser.NewAuthToken()
	require.NoError(t, err, "Failed to create readonly user auth token")

	adminUser, err := pulseTests.CreateUserWithRole(hub, "admin@example.com", "password123", "admin")
	require.NoError(t, err, "Failed to create admin user")
	adminUserToken, err := adminUser.NewAuthToken()
	require.NoError(t, err, "Failed to create admin user auth token")

	superuser, err := pulseTests.CreateSuperuser(hub, "superuser@example.com", "password123")
	require.NoError(t, err, "Failed to create superuser")
	superuserToken, err := superuser.NewAuthToken()
	require.NoError(t, err, "Failed to create superuser auth token")

	// Create test system
	system, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":              "test-system",
		"users":             []string{user.Id},
		"host":              "127.0.0.1",
		"pairing_confirmed": true,
	})
	require.NoError(t, err, "Failed to create test system")
	fingerprint, err := pulseTests.CreateRecord(hub, "fingerprints", map[string]any{
		"system":      system.Id,
		"token":       "agent-token-secret-123",
		"fingerprint": "agent-fingerprint-123",
	})
	require.NoError(t, err, "Failed to create test fingerprint")

	testAppFactory := func(t testing.TB) *pbTests.TestApp {
		return hub.TestApp
	}

	scenarios := []pulseTests.ApiScenario{
		{
			Name:            "GET /universal-token - no auth should fail",
			Method:          http.MethodGet,
			URL:             "/api/pulse/universal-token",
			ExpectedStatus:  401,
			ExpectedContent: []string{"requires valid"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "GET /universal-token - with auth should succeed",
			Method: http.MethodGet,
			URL:    "/api/pulse/universal-token",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus:  200,
			ExpectedContent: []string{"active", "token", "permanent"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "GET /universal-token - enable permanent should succeed",
			Method: http.MethodGet,
			URL:    "/api/pulse/universal-token?enable=1&permanent=1&token=permanent-token-123",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus:  200,
			ExpectedContent: []string{"\"permanent\":true", "permanent-token-123"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "GET /universal-token - superuser should fail",
			Method: http.MethodGet,
			URL:    "/api/pulse/universal-token",
			Headers: map[string]string{
				"Authorization": superuserToken,
			},
			ExpectedStatus:  403,
			ExpectedContent: []string{"Superusers cannot use universal tokens"},
			TestAppFactory: func(t testing.TB) *pbTests.TestApp {
				return hub.TestApp
			},
		},
		{
			Name:   "GET /universal-token - with readonly auth should fail",
			Method: http.MethodGet,
			URL:    "/api/pulse/universal-token",
			Headers: map[string]string{
				"Authorization": readOnlyUserToken,
			},
			ExpectedStatus:  403,
			ExpectedContent: []string{"The authorized record is not allowed to perform this action."},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:            "GET /agent-tokens - no auth should fail",
			Method:          http.MethodGet,
			URL:             "/api/pulse/agent-tokens",
			ExpectedStatus:  401,
			ExpectedContent: []string{"requires valid"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "GET /agent-tokens - returns previews without full token",
			Method: http.MethodGet,
			URL:    "/api/pulse/agent-tokens",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus:  200,
			ExpectedContent: []string{"agent-...-123", "test-system"},
			NotExpectedContent: []string{
				"agent-token-secret-123",
			},
			TestAppFactory: testAppFactory,
		},
		{
			Name:   "GET /agent-tokens/{id}/secret - explicit copy can return full token",
			Method: http.MethodGet,
			URL:    "/api/pulse/agent-tokens/" + fingerprint.Id + "/secret",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus:  200,
			ExpectedContent: []string{"agent-token-secret-123"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "GET /agent-tokens/{id}/secret - readonly auth should fail",
			Method: http.MethodGet,
			URL:    "/api/pulse/agent-tokens/" + fingerprint.Id + "/secret",
			Headers: map[string]string{
				"Authorization": readOnlyUserToken,
			},
			ExpectedStatus:  403,
			ExpectedContent: []string{"The authorized record is not allowed to perform this action."},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "POST /agent-tokens/{id}/unbind - should clear fingerprint",
			Method: http.MethodPost,
			URL:    "/api/pulse/agent-tokens/" + fingerprint.Id + "/unbind",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus:  200,
			ExpectedContent: []string{"\"bound\":false"},
			TestAppFactory:  testAppFactory,
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				updated, err := app.FindRecordById("fingerprints", fingerprint.Id)
				require.NoError(t, err)
				require.Empty(t, updated.GetString("fingerprint"))
			},
		},
		{
			Name:   "POST /agent-tokens/{id}/rotate - should rotate token and keep secret out of response",
			Method: http.MethodPost,
			URL:    "/api/pulse/agent-tokens/" + fingerprint.Id + "/rotate",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus:  200,
			ExpectedContent: []string{"token_preview", "\"bound\":false"},
			NotExpectedContent: []string{
				"agent-token-secret-123",
			},
			TestAppFactory: testAppFactory,
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				updated, err := app.FindRecordById("fingerprints", fingerprint.Id)
				require.NoError(t, err)
				require.NotEqual(t, "agent-token-secret-123", updated.GetString("token"))
				require.Empty(t, updated.GetString("fingerprint"))
			},
		},
		{
			Name:            "POST /agent-releases/sync - no auth should fail",
			Method:          http.MethodPost,
			URL:             "/api/pulse/agent-releases/sync",
			ExpectedStatus:  401,
			ExpectedContent: []string{"requires valid"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "POST /agent-releases/sync - with auth should succeed",
			Method: http.MethodPost,
			URL:    "/api/pulse/agent-releases/sync",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus:  200,
			ExpectedContent: []string{"count"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "POST /agent-releases/sync - with readonly auth should fail",
			Method: http.MethodPost,
			URL:    "/api/pulse/agent-releases/sync",
			Headers: map[string]string{
				"Authorization": readOnlyUserToken,
			},
			ExpectedStatus:  403,
			ExpectedContent: []string{"The authorized record is not allowed to perform this action."},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:            "POST /pairing-codes - no auth should fail",
			Method:          http.MethodPost,
			URL:             "/api/pulse/pairing-codes",
			ExpectedStatus:  401,
			ExpectedContent: []string{"requires valid"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "POST /pairing-codes - with readonly auth should fail",
			Method: http.MethodPost,
			URL:    "/api/pulse/pairing-codes",
			Headers: map[string]string{
				"Authorization": readOnlyUserToken,
			},
			ExpectedStatus:  403,
			ExpectedContent: []string{"The authorized record is not allowed to perform this action."},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "POST /pairing-codes - with auth should create code",
			Method: http.MethodPost,
			URL:    "/api/pulse/pairing-codes",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus:  200,
			ExpectedContent: []string{"code", "expires_at", "\"used\":false"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "GET /pairing-codes/{id} - with auth should return current session",
			Method: http.MethodGet,
			URL:    "/api/pulse/pairing-codes/paircode0000001",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			BeforeTestFunc: func(t testing.TB, app *pbTests.TestApp, e *core.ServeEvent) {
				pairingCollection, err := app.FindCachedCollectionByNameOrId("agent_pairing_codes")
				require.NoError(t, err)
				record := core.NewRecord(pairingCollection)
				record.Set("id", "paircode0000001")
				record.Set("code", "555666")
				record.Set("user", user.Id)
				record.Set("expected_ip", "192.168.1.5")
				record.Set("connect_ip", "192.168.1.5")
				record.Set("reported_ips", []string{"192.168.1.5", "fe80::1"})
				record.Set("hostname", "pair-test")
				record.Set("fingerprint_summary", "sha256:abc123abc123")
				record.Set("agent_profile", "windows-host")
				record.Set("platform", "windows")
				record.Set("arch", "amd64")
				record.Set("agent_version", "1.0.0")
				record.Set("install_method", "host")
				record.Set("run_mode", "windows_service")
				record.Set("expires_at", "2099-01-01 00:00:00.000Z")
				require.NoError(t, app.SaveNoValidate(record))
			},
			ExpectedStatus: 200,
			ExpectedContent: []string{
				"555-666",
				"target_ip",
				"connect_ip",
				"reported_ips",
				"pair-test",
				"sha256:abc123abc123",
				"windows-host",
			},
			TestAppFactory: testAppFactory,
		},
		{
			Name:   "POST /agent-pair - valid code should create system token",
			Method: http.MethodPost,
			URL:    "/api/pulse/agent-pair",
			Headers: map[string]string{
				"X-Forwarded-For": "192.168.1.5",
			},
			Body: jsonReader(map[string]any{
				"code":           "111222",
				"hostname":       "pair-test",
				"name":           "pair-test",
				"fingerprint":    "pair-fingerprint",
				"reported_ips":   []string{"192.168.1.5", "127.0.0.1", "not-an-ip", "192.168.1.5"},
				"platform":       "windows",
				"arch":           "amd64",
				"agent_version":  "1.0.0",
				"install_method": "host",
				"run_mode":       "windows_service",
				"capabilities": map[string]any{
					"agent_profile": "windows-host",
				},
			}),
			BeforeTestFunc: func(t testing.TB, app *pbTests.TestApp, e *core.ServeEvent) {
				pairingCollection, err := app.FindCachedCollectionByNameOrId("agent_pairing_codes")
				require.NoError(t, err)
				record := core.NewRecord(pairingCollection)
				record.Set("code", "111222")
				record.Set("user", user.Id)
				record.Set("expected_ip", "192.168.1.5")
				record.Set("expires_at", "2099-01-01 00:00:00.000Z")
				require.NoError(t, app.SaveNoValidate(record))
			},
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				systems, err := app.FindRecordsByFilter("systems", "name = {:name}", "", 1, 0, map[string]any{"name": "pair-test"})
				require.NoError(t, err)
				require.Len(t, systems, 1)
				require.False(t, systems[0].GetBool("pairing_confirmed"))
				require.Equal(t, "192.168.1.5", systems[0].GetString("target_ip"))
				require.Equal(t, "192.168.1.5", systems[0].GetString("connect_ip"))
				require.Equal(t, "windows-host", systems[0].GetString("agent_profile"))
				require.NotEmpty(t, systems[0].GetString("fingerprint_summary"))
				var systemReportedIPs []string
				require.NoError(t, systems[0].UnmarshalJSONField("reported_ips", &systemReportedIPs))
				require.Equal(t, []string{"192.168.1.5"}, systemReportedIPs)
				var info systemEntity.Info
				require.NoError(t, systems[0].UnmarshalJSONField("info", &info))
				require.Equal(t, "192.168.1.5", info.RemoteIP)
				collection, err := app.FindCachedCollectionByNameOrId("systems")
				require.NoError(t, err)
				require.Nil(t, collection.Fields.GetByName("host"))
				require.Nil(t, collection.Fields.GetByName("port"))
				fingerprints, err := app.FindRecordsByFilter("fingerprints", "system = {:system}", "", 1, 0, map[string]any{"system": systems[0].Id})
				require.NoError(t, err)
				require.Len(t, fingerprints, 1)
				require.NotEmpty(t, fingerprints[0].GetString("token"))
				pairingCodes, err := app.FindRecordsByFilter("agent_pairing_codes", "code = {:code}", "", 1, 0, map[string]any{"code": "111222"})
				require.NoError(t, err)
				require.Len(t, pairingCodes, 1)
				require.Equal(t, "192.168.1.5", pairingCodes[0].GetString("connect_ip"))
				require.Equal(t, "pair-test", pairingCodes[0].GetString("hostname"))
				require.Equal(t, "windows-host", pairingCodes[0].GetString("agent_profile"))
				require.Equal(t, "windows", pairingCodes[0].GetString("platform"))
				require.Equal(t, "amd64", pairingCodes[0].GetString("arch"))
				require.Equal(t, "1.0.0", pairingCodes[0].GetString("agent_version"))
				require.NotEmpty(t, pairingCodes[0].GetString("fingerprint_summary"))
				var reportedIPs []string
				require.NoError(t, pairingCodes[0].UnmarshalJSONField("reported_ips", &reportedIPs))
				require.Equal(t, []string{"192.168.1.5"}, reportedIPs)
			},
			ExpectedStatus:  200,
			ExpectedContent: []string{"agent_id", "token", "agent_secret", "pair-test"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "POST /agent-pair - expected IP mismatch should fail",
			Method: http.MethodPost,
			URL:    "/api/pulse/agent-pair",
			Headers: map[string]string{
				"X-Forwarded-For": "192.168.1.99",
			},
			Body: jsonReader(map[string]any{
				"code":           "333444",
				"hostname":       "wrong-host",
				"name":           "wrong-host",
				"fingerprint":    "wrong-fingerprint",
				"platform":       "windows",
				"arch":           "amd64",
				"agent_version":  "1.0.0",
				"install_method": "host",
				"run_mode":       "windows_service",
			}),
			BeforeTestFunc: func(t testing.TB, app *pbTests.TestApp, e *core.ServeEvent) {
				pairingCollection, err := app.FindCachedCollectionByNameOrId("agent_pairing_codes")
				require.NoError(t, err)
				record := core.NewRecord(pairingCollection)
				record.Set("code", "333444")
				record.Set("user", user.Id)
				record.Set("expected_ip", "192.168.1.5")
				record.Set("expires_at", "2099-01-01 00:00:00.000Z")
				require.NoError(t, app.SaveNoValidate(record))
			},
			ExpectedStatus:  400,
			ExpectedContent: []string{"Agent source IP does not match pairing target IP"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "POST /agent-pair - expired code should fail before creating a system",
			Method: http.MethodPost,
			URL:    "/api/pulse/agent-pair",
			Headers: map[string]string{
				"X-Forwarded-For": "192.168.1.8",
			},
			Body: jsonReader(map[string]any{
				"code":           "121212",
				"hostname":       "expired-pair",
				"name":           "expired-pair",
				"fingerprint":    "expired-pair-fingerprint",
				"platform":       "windows",
				"arch":           "amd64",
				"agent_version":  "1.0.0",
				"install_method": "host",
				"run_mode":       "windows_service",
			}),
			BeforeTestFunc: func(t testing.TB, app *pbTests.TestApp, e *core.ServeEvent) {
				pairingCollection, err := app.FindCachedCollectionByNameOrId("agent_pairing_codes")
				require.NoError(t, err)
				record := core.NewRecord(pairingCollection)
				record.Set("code", "121212")
				record.Set("user", user.Id)
				record.Set("expected_ip", "192.168.1.8")
				record.Set("expires_at", "2000-01-01 00:00:00.000Z")
				require.NoError(t, app.SaveNoValidate(record))
			},
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				systems, err := app.FindRecordsByFilter("systems", "name = {:name}", "", 1, 0, map[string]any{"name": "expired-pair"})
				require.NoError(t, err)
				require.Empty(t, systems)
			},
			ExpectedStatus:  400,
			ExpectedContent: []string{"Pairing code has expired"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "POST /agent-pair - used code should fail before creating a system",
			Method: http.MethodPost,
			URL:    "/api/pulse/agent-pair",
			Headers: map[string]string{
				"X-Forwarded-For": "192.168.1.9",
			},
			Body: jsonReader(map[string]any{
				"code":           "343434",
				"hostname":       "used-pair",
				"name":           "used-pair",
				"fingerprint":    "used-pair-fingerprint",
				"platform":       "windows",
				"arch":           "amd64",
				"agent_version":  "1.0.0",
				"install_method": "host",
				"run_mode":       "windows_service",
			}),
			BeforeTestFunc: func(t testing.TB, app *pbTests.TestApp, e *core.ServeEvent) {
				pairingCollection, err := app.FindCachedCollectionByNameOrId("agent_pairing_codes")
				require.NoError(t, err)
				record := core.NewRecord(pairingCollection)
				record.Set("code", "343434")
				record.Set("user", user.Id)
				record.Set("expected_ip", "192.168.1.9")
				record.Set("expires_at", "2099-01-01 00:00:00.000Z")
				record.Set("used", true)
				require.NoError(t, app.SaveNoValidate(record))
			},
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				systems, err := app.FindRecordsByFilter("systems", "name = {:name}", "", 1, 0, map[string]any{"name": "used-pair"})
				require.NoError(t, err)
				require.Empty(t, systems)
			},
			ExpectedStatus:  400,
			ExpectedContent: []string{"Pairing code has already been used"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "POST /agent-pair - fingerprint conflict should fail before creating a system",
			Method: http.MethodPost,
			URL:    "/api/pulse/agent-pair",
			Headers: map[string]string{
				"X-Forwarded-For": "192.168.1.6",
			},
			Body: jsonReader(map[string]any{
				"code":           "777888",
				"hostname":       "conflict-pair",
				"name":           "conflict-pair",
				"fingerprint":    "existing-pair-fingerprint",
				"platform":       "windows",
				"arch":           "amd64",
				"agent_version":  "1.0.0",
				"install_method": "host",
				"run_mode":       "windows_service",
			}),
			BeforeTestFunc: func(t testing.TB, app *pbTests.TestApp, e *core.ServeEvent) {
				pairingCollection, err := app.FindCachedCollectionByNameOrId("agent_pairing_codes")
				require.NoError(t, err)
				record := core.NewRecord(pairingCollection)
				record.Set("code", "777888")
				record.Set("user", user.Id)
				record.Set("expected_ip", "192.168.1.6")
				record.Set("expires_at", "2099-01-01 00:00:00.000Z")
				require.NoError(t, app.SaveNoValidate(record))

				fingerprint, err := app.FindFirstRecordByFilter("fingerprints", "system = {:system}", dbx.Params{"system": system.Id})
				if err != nil {
					fingerprintCollection, err := app.FindCachedCollectionByNameOrId("fingerprints")
					require.NoError(t, err)
					fingerprint = core.NewRecord(fingerprintCollection)
				}
				fingerprint.Set("system", system.Id)
				fingerprint.Set("token", "existing-token")
				fingerprint.Set("fingerprint", "existing-pair-fingerprint")
				require.NoError(t, app.SaveNoValidate(fingerprint))
			},
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				systems, err := app.FindRecordsByFilter("systems", "name = {:name}", "", 1, 0, map[string]any{"name": "conflict-pair"})
				require.NoError(t, err)
				require.Empty(t, systems)
				pairingCodes, err := app.FindRecordsByFilter("agent_pairing_codes", "code = {:code}", "", 1, 0, map[string]any{"code": "777888"})
				require.NoError(t, err)
				require.Len(t, pairingCodes, 1)
				require.False(t, pairingCodes[0].GetBool("used"))
			},
			ExpectedStatus:  400,
			ExpectedContent: []string{"Agent fingerprint already belongs to another system"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "POST /agent-pair - stale unconfirmed fingerprint should be cleared and paired again",
			Method: http.MethodPost,
			URL:    "/api/pulse/agent-pair",
			Headers: map[string]string{
				"X-Forwarded-For": "192.168.1.7",
			},
			Body: jsonReader(map[string]any{
				"code":           "999000",
				"hostname":       "repaired-pair",
				"name":           "repaired-pair",
				"fingerprint":    "stale-unconfirmed-fingerprint",
				"platform":       "windows",
				"arch":           "amd64",
				"agent_version":  "1.0.0",
				"install_method": "host",
				"run_mode":       "windows_service",
			}),
			BeforeTestFunc: func(t testing.TB, app *pbTests.TestApp, e *core.ServeEvent) {
				pairingCollection, err := app.FindCachedCollectionByNameOrId("agent_pairing_codes")
				require.NoError(t, err)
				record := core.NewRecord(pairingCollection)
				record.Set("code", "999000")
				record.Set("user", user.Id)
				record.Set("expected_ip", "192.168.1.7")
				record.Set("expires_at", "2099-01-01 00:00:00.000Z")
				require.NoError(t, app.SaveNoValidate(record))

				systemsCollection, err := app.FindCachedCollectionByNameOrId("systems")
				require.NoError(t, err)
				staleSystem := core.NewRecord(systemsCollection)
				staleSystem.Set("name", "old-unconfirmed-pair")
				staleSystem.Set("users", []string{user.Id})
				staleSystem.Set("pairing_confirmed", false)
				require.NoError(t, app.SaveNoValidate(staleSystem))

				fingerprintCollection, err := app.FindCachedCollectionByNameOrId("fingerprints")
				require.NoError(t, err)
				fingerprint := core.NewRecord(fingerprintCollection)
				fingerprint.Set("system", staleSystem.Id)
				fingerprint.Set("token", "stale-token")
				fingerprint.Set("fingerprint", "stale-unconfirmed-fingerprint")
				require.NoError(t, app.SaveNoValidate(fingerprint))
			},
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				staleSystems, err := app.FindRecordsByFilter("systems", "name = {:name}", "", 1, 0, map[string]any{"name": "old-unconfirmed-pair"})
				require.NoError(t, err)
				require.Empty(t, staleSystems)
				newSystems, err := app.FindRecordsByFilter("systems", "name = {:name}", "", 1, 0, map[string]any{"name": "repaired-pair"})
				require.NoError(t, err)
				require.Len(t, newSystems, 1)
				require.False(t, newSystems[0].GetBool("pairing_confirmed"))
			},
			ExpectedStatus:  200,
			ExpectedContent: []string{"agent_id", "token", "agent_secret", "repaired-pair"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:            "GET /agent-install/windows.ps1 - missing token and code should fail",
			Method:          http.MethodGet,
			URL:             "/api/pulse/agent-install/windows.ps1",
			ExpectedStatus:  400,
			ExpectedContent: []string{"Token or code is required."},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:           "GET /agent-install/windows.ps1 - pairing code should generate script without auth",
			Method:         http.MethodGet,
			URL:            "/api/pulse/agent-install/windows.ps1?code=123-456&hub_url=http%3A%2F%2Fhub.local%3A8090&download_url=http%3A%2F%2Fhub.local%2Fagent.exe&version=1.0.5",
			ExpectedStatus: 200,
			ExpectedContent: []string{
				"$PairingCode = '123-456'",
				"& $AgentPath pair --url $HubUrl --code $PairingCode",
				"+DATA_DIR=$AgentDataDir",
			},
			TestAppFactory: testAppFactory,
		},
		{
			Name:   "GET /agent-install/windows.ps1 - install options should generate matching script",
			Method: http.MethodGet,
			URL: "/api/pulse/agent-install/windows.ps1?token=tok123&hub_url=http%3A%2F%2Fhub.local%3A8090&download_url=http%3A%2F%2Fhub.local%2Fagent.exe&version=1.0.5" +
				"&install_dir=C%3A%5CPulse%5CAgent&data_dir=D%3A%5CPulseData&log_dir=D%3A%5CPulseLogs&clean_data=0&install_nssm=0&start_service=0&add_firewall_rule=1",
			ExpectedStatus: 200,
			ExpectedContent: []string{
				"$AgentDir = 'C:\\Pulse\\Agent'",
				"$AgentDataDir = 'D:\\PulseData'",
				"$LogDir = 'D:\\PulseLogs'",
				"New-NetFirewallRule -DisplayName \"Allow pulse-agent\"",
				"pulse-agent service has been installed but not started",
			},
			NotExpectedContent: []string{
				"winget install -e --id NSSM.NSSM",
				"Remove-Item -Recurse -Force -LiteralPath $AgentDataDir",
			},
			TestAppFactory: testAppFactory,
		},
		{
			Name:            "GET /agent-install/windows.ps1 - unsafe pairing code should fail",
			Method:          http.MethodGet,
			URL:             "/api/pulse/agent-install/windows.ps1?code=123%0A456",
			ExpectedStatus:  400,
			ExpectedContent: []string{"Installer parameter is invalid."},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:            "GET /agent-install/windows.ps1 - unsafe install option should fail",
			Method:          http.MethodGet,
			URL:             "/api/pulse/agent-install/windows.ps1?token=tok123&install_dir=C%3A%5CPulse%0AAgent",
			ExpectedStatus:  400,
			ExpectedContent: []string{"Installer parameter is invalid."},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "POST /smart/refresh - missing system should fail 400 with user auth",
			Method: http.MethodPost,
			URL:    "/api/pulse/smart/refresh",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus:  400,
			ExpectedContent: []string{"Invalid", "system", "parameter"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "POST /smart/refresh - with readonly auth should fail",
			Method: http.MethodPost,
			URL:    fmt.Sprintf("/api/pulse/smart/refresh?system=%s", system.Id),
			Headers: map[string]string{
				"Authorization": readOnlyUserToken,
			},
			ExpectedStatus:  403,
			ExpectedContent: []string{"The authorized record is not allowed to perform this action."},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "POST /smart/refresh - non-user system should fail",
			Method: http.MethodPost,
			URL:    fmt.Sprintf("/api/pulse/smart/refresh?system=%s", system.Id),
			Headers: map[string]string{
				"Authorization": user2Token,
			},
			ExpectedStatus:  404,
			ExpectedContent: []string{"The requested resource wasn't found."},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "POST /smart/refresh - good user should pass validation",
			Method: http.MethodPost,
			URL:    fmt.Sprintf("/api/pulse/smart/refresh?system=%s", system.Id),
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus:  500,
			ExpectedContent: []string{"Something went wrong while processing your request."},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:            "POST /user-alerts - no auth should fail",
			Method:          http.MethodPost,
			URL:             "/api/pulse/user-alerts",
			ExpectedStatus:  401,
			ExpectedContent: []string{"requires valid"},
			TestAppFactory:  testAppFactory,
			Body: jsonReader(map[string]any{
				"name":    "CPU",
				"value":   80,
				"min":     10,
				"systems": []string{system.Id},
			}),
		},
		{
			Name:   "POST /user-alerts - with auth should succeed",
			Method: http.MethodPost,
			URL:    "/api/pulse/user-alerts",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus:  200,
			ExpectedContent: []string{"\"success\":true"},
			TestAppFactory:  testAppFactory,
			Body: jsonReader(map[string]any{
				"name":    "CPU",
				"value":   80,
				"min":     10,
				"systems": []string{system.Id},
			}),
		},
		{
			Name:            "DELETE /user-alerts - no auth should fail",
			Method:          http.MethodDelete,
			URL:             "/api/pulse/user-alerts",
			ExpectedStatus:  401,
			ExpectedContent: []string{"requires valid"},
			TestAppFactory:  testAppFactory,
			Body: jsonReader(map[string]any{
				"name":    "CPU",
				"systems": []string{system.Id},
			}),
		},
		{
			Name:   "DELETE /user-alerts - with auth should succeed",
			Method: http.MethodDelete,
			URL:    "/api/pulse/user-alerts",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus:  200,
			ExpectedContent: []string{"\"success\":true"},
			TestAppFactory:  testAppFactory,
			Body: jsonReader(map[string]any{
				"name":    "CPU",
				"systems": []string{system.Id},
			}),
			BeforeTestFunc: func(t testing.TB, app *pbTests.TestApp, e *core.ServeEvent) {
				// Create an alert to delete
				pulseTests.CreateRecord(app, "alerts", map[string]any{
					"name":   "CPU",
					"system": system.Id,
					"user":   user.Id,
					"value":  80,
					"min":    10,
				})
			},
		},
		{
			Name:            "GET /containers/logs - no auth should fail",
			Method:          http.MethodGet,
			URL:             "/api/pulse/containers/logs?system=test-system&container=abababababab",
			ExpectedStatus:  401,
			ExpectedContent: []string{"requires valid"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:            "GET /containers/logs - request for valid non-user system should fail",
			Method:          http.MethodGet,
			URL:             fmt.Sprintf("/api/pulse/containers/logs?system=%s&container=abababababab", system.Id),
			ExpectedStatus:  404,
			ExpectedContent: []string{"The requested resource wasn't found."},
			TestAppFactory:  testAppFactory,
			Headers: map[string]string{
				"Authorization": user2Token,
			},
		},
		{
			Name:            "GET /containers/info - request for valid non-user system should fail",
			Method:          http.MethodGet,
			URL:             fmt.Sprintf("/api/pulse/containers/info?system=%s&container=abababababab", system.Id),
			ExpectedStatus:  404,
			ExpectedContent: []string{"The requested resource wasn't found."},
			TestAppFactory:  testAppFactory,
			Headers: map[string]string{
				"Authorization": user2Token,
			},
		},
		{
			Name:            "GET /containers/info - SHARE_ALL_SYSTEMS allows non-member user",
			Method:          http.MethodGet,
			URL:             fmt.Sprintf("/api/pulse/containers/info?system=%s&container=abababababab", system.Id),
			ExpectedStatus:  500,
			ExpectedContent: []string{"Something went wrong while processing your request."},
			TestAppFactory:  testAppFactory,
			Headers: map[string]string{
				"Authorization": user2Token,
			},
			BeforeTestFunc: func(t testing.TB, app *pbTests.TestApp, e *core.ServeEvent) {
				t.Setenv("SHARE_ALL_SYSTEMS", "true")
			},
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				t.Setenv("SHARE_ALL_SYSTEMS", "")
			},
		},
		{
			Name:   "GET /containers/logs - with auth but missing system param should fail",
			Method: http.MethodGet,
			URL:    "/api/pulse/containers/logs?container=abababababab",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus:  400,
			ExpectedContent: []string{"Invalid", "parameter"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "GET /containers/logs - with auth but missing container param should fail",
			Method: http.MethodGet,
			URL:    "/api/pulse/containers/logs?system=test-system",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus:  400,
			ExpectedContent: []string{"Invalid", "parameter"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "GET /containers/logs - with auth but invalid system should fail",
			Method: http.MethodGet,
			URL:    "/api/pulse/containers/logs?system=invalid-system&container=0123456789ab",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus:  404,
			ExpectedContent: []string{"The requested resource wasn't found."},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "GET /containers/logs - traversal container should fail validation",
			Method: http.MethodGet,
			URL:    "/api/pulse/containers/logs?system=" + system.Id + "&container=..%2F..%2Fversion",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus:  400,
			ExpectedContent: []string{"Invalid", "parameter"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "GET /containers/info - traversal container should fail validation",
			Method: http.MethodGet,
			URL:    "/api/pulse/containers/info?system=" + system.Id + "&container=../../version?x=",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus:  400,
			ExpectedContent: []string{"Invalid", "parameter"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "GET /containers/info - non-hex container should fail validation",
			Method: http.MethodGet,
			URL:    "/api/pulse/containers/info?system=" + system.Id + "&container=container_name",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus:  400,
			ExpectedContent: []string{"Invalid", "parameter"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "GET /containers/logs - good user should pass validation",
			Method: http.MethodGet,
			URL:    "/api/pulse/containers/logs?system=" + system.Id + "&container=0123456789ab",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus:  500,
			ExpectedContent: []string{"Something went wrong while processing your request."},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "GET /containers/info - good user should pass validation",
			Method: http.MethodGet,
			URL:    "/api/pulse/containers/info?system=" + system.Id + "&container=0123456789ab",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus:  500,
			ExpectedContent: []string{"Something went wrong while processing your request."},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "POST /operations - legacy systemd service action should be rejected",
			Method: http.MethodPost,
			URL:    "/api/pulse/operations",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			Body: jsonReader(map[string]any{
				"system":  system.Id,
				"action":  "start_service",
				"target":  "nginx.service",
				"confirm": true,
			}),
			ExpectedStatus: 403,
			ExpectedContent: []string{
				"\"failure_code\":\"unsupported\"",
				"当前版本不允许执行这个操作",
			},
			TestAppFactory: testAppFactory,
		},
		{
			Name:   "POST /operations - protected Windows service should fail even when whitelisted",
			Method: http.MethodPost,
			URL:    "/api/pulse/operations",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			Body: jsonReader(map[string]any{
				"system":  system.Id,
				"action":  "restart_monitored_service",
				"target":  "WinDefend",
				"confirm": true,
			}),
			ExpectedStatus: 403,
			ExpectedContent: []string{
				"\"failure_code\":\"protected\"",
				"受保护的 Windows 服务",
			},
			TestAppFactory: testAppFactory,
			BeforeTestFunc: func(t testing.TB, app *pbTests.TestApp, e *core.ServeEvent) {
				if !hub.GetSystemManager().HasSystem(system.Id) {
					require.NoError(t, hub.GetSystemManager().AddRecord(system, nil))
				}
				collection, err := app.FindCachedCollectionByNameOrId("monitored_services")
				require.NoError(t, err)
				serviceRecord := core.NewRecord(collection)
				serviceRecord.Set("system", system.Id)
				serviceRecord.Set("platform", "windows")
				serviceRecord.Set("name", "WinDefend")
				serviceRecord.Set("display_name", "Microsoft Defender Antivirus Service")
				serviceRecord.Set("state", 1)
				serviceRecord.Set("start_type", "auto")
				serviceRecord.Set("updated", 1)
				require.NoError(t, app.SaveNoValidate(serviceRecord))

				_, err = pulseTests.CreateRecord(app, "service_control_rules", map[string]any{
					"system":   system.Id,
					"platform": "windows",
					"name":     "WinDefend",
					"enabled":  true,
				})
				require.NoError(t, err)
			},
		},
		{
			Name:   "POST /operations - protected Pulse container should fail",
			Method: http.MethodPost,
			URL:    "/api/pulse/operations",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			Body: jsonReader(map[string]any{
				"system":  system.Id,
				"action":  "restart_container",
				"target":  "abababababab",
				"confirm": true,
			}),
			ExpectedStatus:  403,
			ExpectedContent: []string{"Pulse related containers"},
			TestAppFactory:  testAppFactory,
			BeforeTestFunc: func(t testing.TB, app *pbTests.TestApp, e *core.ServeEvent) {
				if !hub.GetSystemManager().HasSystem(system.Id) {
					require.NoError(t, hub.GetSystemManager().AddRecord(system, nil))
				}
				_, err := pulseTests.CreateRecord(app, "containers", map[string]any{
					"id":      "abababababab",
					"system":  system.Id,
					"name":    "pulse-agent",
					"image":   "registry.example.com/infra/pulse-agent:latest",
					"status":  "Up 5 minutes",
					"updated": int64(1),
				})
				require.NoError(t, err)
			},
		},

		// Auth Optional Routes - Should work without authentication
		{
			Name:            "GET /info - no auth should fail",
			Method:          http.MethodGet,
			URL:             "/api/pulse/info",
			ExpectedStatus:  401,
			ExpectedContent: []string{"requires valid"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:               "GET /public-info - no auth should return metadata without readiness",
			Method:             http.MethodGet,
			URL:                "/api/pulse/public-info",
			ExpectedStatus:     200,
			ExpectedContent:    []string{"\"v\":", "\"agent_hub_url\":"},
			NotExpectedContent: []string{"\"readiness\":", "\"agent_target_version\":", "\"agent_actual_versions\":"},
			TestAppFactory:     testAppFactory,
		},
		{
			Name:   "GET /info - should return hub metadata without legacy key field",
			Method: http.MethodGet,
			URL:    "/api/pulse/info",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus:     200,
			ExpectedContent:    []string{"\"v\":", "\"agent_target_version\":\"" + pulse.Version + "\"", "\"agent_actual_versions\":", "\"agent_total_systems\":1"},
			NotExpectedContent: []string{"\"key\":", "\"readiness\":"},
			TestAppFactory:     testAppFactory,
		},
		{
			Name:   "GET /info - admin should return readiness checks",
			Method: http.MethodGet,
			URL:    "/api/pulse/info",
			Headers: map[string]string{
				"Authorization": adminUserToken,
			},
			ExpectedStatus:     200,
			ExpectedContent:    []string{"\"readiness\":", "\"auto_login\"", "\"hub_identity\""},
			NotExpectedContent: []string{"\"key\":"},
			TestAppFactory:     testAppFactory,
		},
		{
			Name:            "GET /first-run - no auth should succeed",
			Method:          http.MethodGet,
			URL:             "/api/pulse/first-run",
			ExpectedStatus:  200,
			ExpectedContent: []string{"\"firstRun\":false"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "GET /first-run - with auth should also succeed",
			Method: http.MethodGet,
			URL:    "/api/pulse/first-run",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus:  200,
			ExpectedContent: []string{"\"firstRun\":false"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:            "GET /agent-connect - no auth should succeed (websocket upgrade fails but route is accessible)",
			Method:          http.MethodGet,
			URL:             "/api/pulse/agent-connect",
			ExpectedStatus:  400,
			ExpectedContent: []string{},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "POST /test-notification - readonly auth should fail",
			Method: http.MethodPost,
			URL:    "/api/pulse/test-notification",
			Body: jsonReader(map[string]any{
				"url": "generic://8.8.8.8",
			}),
			Headers: map[string]string{
				"Authorization": readOnlyUserToken,
			},
			ExpectedStatus:  403,
			ExpectedContent: []string{"The authorized record is not allowed to perform this action."},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "POST /test-notification - invalid auth token should fail",
			Method: http.MethodPost,
			URL:    "/api/pulse/test-notification",
			Body: jsonReader(map[string]any{
				"url": "generic://127.0.0.1",
			}),
			Headers: map[string]string{
				"Authorization": "invalid-token",
			},
			ExpectedStatus:  401,
			ExpectedContent: []string{"requires valid"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "POST /user-alerts - invalid auth token should fail",
			Method: http.MethodPost,
			URL:    "/api/pulse/user-alerts",
			Headers: map[string]string{
				"Authorization": "invalid-token",
			},
			ExpectedStatus:  401,
			ExpectedContent: []string{"requires valid"},
			TestAppFactory:  testAppFactory,
			Body: jsonReader(map[string]any{
				"name":    "CPU",
				"value":   80,
				"min":     10,
				"systems": []string{system.Id},
			}),
		},
		{
			Name:   "POST /user-alerts - readonly auth should fail",
			Method: http.MethodPost,
			URL:    "/api/pulse/user-alerts",
			Headers: map[string]string{
				"Authorization": readOnlyUserToken,
			},
			ExpectedStatus:  403,
			ExpectedContent: []string{"The authorized record is not allowed to perform this action."},
			TestAppFactory:  testAppFactory,
			Body: jsonReader(map[string]any{
				"name":    "CPU",
				"value":   80,
				"min":     10,
				"systems": []string{system.Id},
			}),
		},
		{
			Name:   "DELETE /user-alerts - readonly auth should fail",
			Method: http.MethodDelete,
			URL:    "/api/pulse/user-alerts",
			Headers: map[string]string{
				"Authorization": readOnlyUserToken,
			},
			ExpectedStatus:  403,
			ExpectedContent: []string{"The authorized record is not allowed to perform this action."},
			TestAppFactory:  testAppFactory,
			Body: jsonReader(map[string]any{
				"name":    "CPU",
				"systems": []string{system.Id},
			}),
		},
	}

	for _, scenario := range scenarios {
		scenario.Test(t)
	}
}

func TestSystemsSummaryAPI(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	userToken, err := user.NewAuthToken()
	require.NoError(t, err)
	otherUser, err := pulseTests.CreateUser(hub, "summary-other@example.com", "password123")
	require.NoError(t, err)

	ownSystem, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":  "summary-own",
		"users": []string{user.Id},
	})
	require.NoError(t, err)
	ownSystem.Set("status", "up")
	ownSystem.Set("pairing_confirmed", true)
	ownSystem.Set("info", map[string]any{
		"h":   "summary-own-host",
		"cpu": 12.5,
		"mp":  34.5,
		"dp":  56.5,
		"bb":  float64(4096),
		"bbd": []float64{1024, 3072},
		"v":   "1.0.5",
		"cap": map[string]any{
			"platform": "linux",
			"arch":     "amd64",
			"operations": []string{
				"agent_update",
				"container_control",
			},
			"last_update": map[string]any{
				"status":  "failed",
				"version": "1.0.5",
			},
			"collection_results": map[string]any{
				"smart": map[string]any{"state": "confirmed"},
			},
			"diagnostics": map[string]any{
				"docker": map[string]any{"state": "confirmed"},
			},
		},
	})
	require.NoError(t, hub.SaveNoValidate(ownSystem))

	pendingPairingSystem, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":  "summary-pending-pairing",
		"users": []string{user.Id},
	})
	require.NoError(t, err)
	pendingPairingSystem.Set("status", "up")
	pendingPairingSystem.Set("pairing_confirmed", false)
	pendingPairingSystem.Set("target_ip", "192.0.2.50")
	pendingPairingSystem.Set("info", map[string]any{
		"h": "summary-pending-host",
	})
	require.NoError(t, hub.SaveNoValidate(pendingPairingSystem))

	otherSystem, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":  "summary-other",
		"users": []string{otherUser.Id},
	})
	require.NoError(t, err)
	otherSystem.Set("status", "up")
	otherSystem.Set("pairing_confirmed", true)
	otherSystem.Set("info", map[string]any{
		"h":   "summary-other-host",
		"cpu": 99,
	})
	require.NoError(t, hub.SaveNoValidate(otherSystem))

	testAppFactory := func(t testing.TB) *pbTests.TestApp {
		return hub.TestApp
	}

	scenarios := []pulseTests.ApiScenario{
		{
			Name:            "systems summary requires auth",
			Method:          http.MethodGet,
			URL:             "/api/pulse/systems/summary",
			ExpectedStatus:  401,
			ExpectedContent: []string{"requires valid"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "systems summary returns lightweight visible records only",
			Method: http.MethodGet,
			URL:    "/api/pulse/systems/summary",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus: 200,
			ExpectedContent: []string{
				`"items":[`,
				ownSystem.Id,
				"summary-own-host",
				`"cpu":12.5`,
				`"bbd":[1024,3072]`,
				"agent_update",
				"last_update",
			},
			NotExpectedContent: []string{
				otherSystem.Id,
				"summary-other-host",
				pendingPairingSystem.Id,
				"summary-pending-host",
				"collection_results",
				"diagnostics",
			},
			TestAppFactory: testAppFactory,
		},
	}

	for _, scenario := range scenarios {
		scenario.Test(t)
	}
}

func TestPairingCodeCreationDoesNotCreateSystem(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	userToken, err := user.NewAuthToken()
	require.NoError(t, err)

	beforeCount, err := hub.CountRecords("systems")
	require.NoError(t, err)

	res := performTestAPIRequest(t, hub.TestApp, http.MethodPost, "/api/pulse/pairing-codes", jsonReader(map[string]any{
		"target_ip": "192.0.2.25",
	}), map[string]string{
		"Authorization": userToken,
	})

	require.Equal(t, http.StatusOK, res.Status)
	require.Contains(t, res.Body, `"code":"`)
	require.Contains(t, res.Body, `"used":false`)
	require.Contains(t, res.Body, `"target_ip":"192.0.2.25"`)

	afterCount, err := hub.CountRecords("systems")
	require.NoError(t, err)
	require.Equal(t, beforeCount, afterCount, "creating a pairing session must not create a half-configured system")
}

func TestSystemsSummaryHandlesLargeInventory(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	userToken, err := user.NewAuthToken()
	require.NoError(t, err)

	for i := range 100 {
		system, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
			"name":  fmt.Sprintf("summary-large-%03d", i),
			"users": []string{user.Id},
		})
		require.NoError(t, err)
		system.Set("status", "up")
		system.Set("pairing_confirmed", true)
		system.Set("info", map[string]any{
			"h":                   fmt.Sprintf("summary-large-host-%03d", i),
			"cpu":                 float64(i % 100),
			"mp":                  float64((i * 2) % 100),
			"dp":                  float64((i * 3) % 100),
			"ignored_large_field": strings.Repeat("x", 2000),
			"cap": map[string]any{
				"agent_profile": "linux-container",
				"operations":    []string{"container_control"},
				"diagnostics": map[string]any{
					"docker": map[string]any{"state": "confirmed"},
				},
			},
		})
		require.NoError(t, hub.SaveNoValidate(system))
	}

	res := performTestAPIRequest(t, hub.TestApp, http.MethodGet, "/api/pulse/systems/summary", nil, map[string]string{
		"Authorization": userToken,
	})
	require.Equal(t, http.StatusOK, res.Status)
	require.NotContains(t, res.Body, "ignored_large_field")
	require.NotContains(t, res.Body, "diagnostics")
	require.Less(t, len(res.Body), 80_000, "summary response should stay bounded for 100 systems")

	var body struct {
		Items []struct {
			ID   string         `json:"id"`
			Name string         `json:"name"`
			Info map[string]any `json:"info"`
		} `json:"items"`
	}
	require.NoError(t, json.Unmarshal([]byte(res.Body), &body))
	require.Len(t, body.Items, 100)
}

func TestSystemLogsPagedList(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	userToken, err := user.NewAuthToken()
	require.NoError(t, err)

	require.NoError(t, seedSystemLogs(hub))

	testAppFactory := func(t testing.TB) *pbTests.TestApp {
		return hub.TestApp
	}
	scenarios := []pulseTests.ApiScenario{
		{
			Name:            "system logs requires auth",
			Method:          http.MethodGet,
			URL:             "/api/pulse/logs?page=1&perPage=2",
			ExpectedStatus:  401,
			ExpectedContent: []string{"requires valid"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "system logs returns one server page and hasMore",
			Method: http.MethodGet,
			URL:    "/api/pulse/logs?page=1&perPage=2",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus: 200,
			ExpectedContent: []string{
				`"items":[`,
				`"page":1`,
				`"perPage":2`,
				`"hasMore":true`,
				"agent connected",
				"container updated",
			},
			NotExpectedContent: []string{
				"network warning",
			},
			TestAppFactory: testAppFactory,
		},
		{
			Name:   "system logs second page does not include first page rows",
			Method: http.MethodGet,
			URL:    "/api/pulse/logs?page=2&perPage=2",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus: 200,
			ExpectedContent: []string{
				`"page":2`,
				`"perPage":2`,
				`"hasMore":true`,
				"network warning",
				"old debug",
			},
			NotExpectedContent: []string{
				"agent connected",
			},
			TestAppFactory: testAppFactory,
		},
		{
			Name:   "system logs filters level on server",
			Method: http.MethodGet,
			URL:    "/api/pulse/logs?page=1&perPage=5&level=1",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus: 200,
			ExpectedContent: []string{
				`"hasMore":false`,
				"critical error",
			},
			NotExpectedContent: []string{
				"network warning",
				"agent connected",
			},
			TestAppFactory: testAppFactory,
		},
		{
			Name:   "system logs filters search on server",
			Method: http.MethodGet,
			URL:    "/api/pulse/logs?page=1&perPage=5&search=network",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus: 200,
			ExpectedContent: []string{
				`"hasMore":false`,
				"network warning",
			},
			NotExpectedContent: []string{
				"agent connected",
				"critical error",
			},
			TestAppFactory: testAppFactory,
		},
	}
	for _, scenario := range scenarios {
		scenario.Test(t)
	}
}

func TestSystemLogsPagedListHandles1000Rows(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	userToken, err := user.NewAuthToken()
	require.NoError(t, err)
	require.NoError(t, seedBulkSystemLogs(hub, 1000))

	firstPage := performTestAPIRequest(t, hub.TestApp, http.MethodGet, "/api/pulse/logs?page=1&perPage=50", nil, map[string]string{
		"Authorization": userToken,
	})
	require.Equal(t, http.StatusOK, firstPage.Status)
	require.Contains(t, firstPage.Body, `"page":1`)
	require.Contains(t, firstPage.Body, `"perPage":50`)
	require.Contains(t, firstPage.Body, `"hasMore":true`)
	require.Contains(t, firstPage.Body, "bulk log 0000")
	require.NotContains(t, firstPage.Body, "bulk log 0999")

	var firstBody struct {
		Items []struct {
			ID      string `json:"id"`
			Message string `json:"message"`
		} `json:"items"`
	}
	require.NoError(t, json.Unmarshal([]byte(firstPage.Body), &firstBody))
	require.Len(t, firstBody.Items, 50)
	require.Less(t, len(firstPage.Body), 30_000, "log page response should stay bounded even with 1000 rows")

	lastPage := performTestAPIRequest(t, hub.TestApp, http.MethodGet, "/api/pulse/logs?page=20&perPage=50", nil, map[string]string{
		"Authorization": userToken,
	})
	require.Equal(t, http.StatusOK, lastPage.Status)
	require.Contains(t, lastPage.Body, `"page":20`)
	require.Contains(t, lastPage.Body, `"hasMore":false`)
	require.Contains(t, lastPage.Body, "bulk log 0999")
	require.NotContains(t, lastPage.Body, "bulk log 0000")

	var lastBody struct {
		Items []struct {
			ID      string `json:"id"`
			Message string `json:"message"`
		} `json:"items"`
	}
	require.NoError(t, json.Unmarshal([]byte(lastPage.Body), &lastBody))
	require.Len(t, lastBody.Items, 50)
}

func seedSystemLogs(hub *pulseTests.TestHub) error {
	if _, err := hub.AuxDB().NewQuery("DELETE FROM _logs").Execute(); err != nil {
		return err
	}
	now := time.Now().UTC()
	logs := []struct {
		level   int
		message string
		data    string
	}{
		{level: 4, message: "agent connected", data: `{"system":"nacht"}`},
		{level: 4, message: "container updated", data: `{"container":"web"}`},
		{level: 2, message: "network warning", data: `{"target":"network"}`},
		{level: 8, message: "old debug", data: `{"scope":"debug"}`},
		{level: 1, message: "critical error", data: `{"error":"boom"}`},
	}
	for i, item := range logs {
		_, err := hub.AuxDB().NewQuery(`
			INSERT INTO _logs (id, level, message, data, created)
			VALUES ({:id}, {:level}, {:message}, {:data}, {:created})
		`).Bind(dbx.Params{
			"id":      fmt.Sprintf("logpage%08d", i),
			"level":   item.level,
			"message": item.message,
			"data":    item.data,
			"created": now.Add(-time.Duration(i) * time.Minute).Format(types.DefaultDateLayout),
		}).Execute()
		if err != nil {
			return err
		}
	}
	return nil
}

func seedBulkSystemLogs(hub *pulseTests.TestHub, count int) error {
	if _, err := hub.AuxDB().NewQuery("DELETE FROM _logs").Execute(); err != nil {
		return err
	}
	now := time.Now().UTC()
	for i := range count {
		_, err := hub.AuxDB().NewQuery(`
			INSERT INTO _logs (id, level, message, data, created)
			VALUES ({:id}, {:level}, {:message}, {:data}, {:created})
		`).Bind(dbx.Params{
			"id":      fmt.Sprintf("bulklog%08d", i),
			"level":   4,
			"message": fmt.Sprintf("bulk log %04d", i),
			"data":    fmt.Sprintf(`{"index":%d}`, i),
			"created": now.Add(-time.Duration(i) * time.Second).Format(types.DefaultDateLayout),
		}).Execute()
		if err != nil {
			return err
		}
	}
	return nil
}

func TestAlertHistoryPagedList(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	userToken, err := user.NewAuthToken()
	require.NoError(t, err)
	otherUser, err := pulseTests.CreateUser(hub, "alerts-other@example.com", "password123")
	require.NoError(t, err)

	require.NoError(t, seedAlertHistoryRecords(hub, user, otherUser))

	testAppFactory := func(t testing.TB) *pbTests.TestApp {
		return hub.TestApp
	}
	scenarios := []pulseTests.ApiScenario{
		{
			Name:            "alert history requires auth",
			Method:          http.MethodGet,
			URL:             "/api/pulse/alerts-history?page=1&perPage=2",
			ExpectedStatus:  401,
			ExpectedContent: []string{"requires valid"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "alert history returns one server page and hasMore",
			Method: http.MethodGet,
			URL:    "/api/pulse/alerts-history?page=1&perPage=2",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus: 200,
			ExpectedContent: []string{
				`"items":[`,
				`"page":1`,
				`"perPage":2`,
				`"hasMore":true`,
				"CPU",
				"网站：Harbor",
				"GuteNacht",
			},
			NotExpectedContent: []string{
				"Status",
				"OtherBox",
			},
			TestAppFactory: testAppFactory,
		},
		{
			Name:   "alert history second page excludes first page rows",
			Method: http.MethodGet,
			URL:    "/api/pulse/alerts-history?page=2&perPage=2",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus: 200,
			ExpectedContent: []string{
				`"page":2`,
				`"hasMore":false`,
				"Status",
				"服务：Docker",
			},
			NotExpectedContent: []string{
				"网站：Harbor",
				"OtherBox",
			},
			TestAppFactory: testAppFactory,
		},
		{
			Name:   "alert history filters search on server",
			Method: http.MethodGet,
			URL:    "/api/pulse/alerts-history?page=1&perPage=5&search=Harbor",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus: 200,
			ExpectedContent: []string{
				`"hasMore":false`,
				"网站：Harbor",
			},
			NotExpectedContent: []string{
				"CPU",
				"OtherBox",
			},
			TestAppFactory: testAppFactory,
		},
		{
			Name:   "alert history filters resolved state on server",
			Method: http.MethodGet,
			URL:    "/api/pulse/alerts-history?page=1&perPage=5&state=recovered",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus: 200,
			ExpectedContent: []string{
				`"hasMore":false`,
				"Status",
				"服务：Docker",
			},
			NotExpectedContent: []string{
				"CPU",
				"网站：Harbor",
			},
			TestAppFactory: testAppFactory,
		},
		{
			Name:   "alert history filters source on server",
			Method: http.MethodGet,
			URL:    "/api/pulse/alerts-history?page=1&perPage=5&source=website",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus: 200,
			ExpectedContent: []string{
				`"hasMore":false`,
				"网站：Harbor",
			},
			NotExpectedContent: []string{
				"CPU",
				"服务：Docker",
				"OtherBox",
			},
			TestAppFactory: testAppFactory,
		},
	}
	for _, scenario := range scenarios {
		scenario.Test(t)
	}
}

func seedAlertHistoryRecords(hub *pulseTests.TestHub, user *core.Record, otherUser *core.Record) error {
	ownSystem, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":              "gutenacht-host",
		"display_name":      "GuteNacht",
		"users":             []string{user.Id},
		"pairing_confirmed": true,
	})
	if err != nil {
		return err
	}
	otherSystem, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":              "other-host",
		"display_name":      "OtherBox",
		"users":             []string{otherUser.Id},
		"pairing_confirmed": true,
	})
	if err != nil {
		return err
	}

	now := time.Now().UTC()
	rows := []struct {
		userID   string
		systemID string
		alertID  string
		name     string
		value    float64
		resolved bool
	}{
		{userID: user.Id, systemID: ownSystem.Id, alertID: "cpu-high", name: "CPU", value: 92.5},
		{userID: user.Id, systemID: ownSystem.Id, alertID: "website-harbor", name: "网站：Harbor", value: 1},
		{userID: user.Id, systemID: ownSystem.Id, alertID: "status-down", name: "Status", value: 1, resolved: true},
		{userID: user.Id, systemID: ownSystem.Id, alertID: "service-docker", name: "服务：Docker", value: 1, resolved: true},
		{userID: otherUser.Id, systemID: otherSystem.Id, alertID: "other-memory", name: "Memory", value: 88},
	}
	collection, err := hub.FindCachedCollectionByNameOrId("alerts_history")
	if err != nil {
		return err
	}
	for i, row := range rows {
		record := core.NewRecord(collection)
		record.Set("user", row.userID)
		record.Set("system", row.systemID)
		record.Set("alert_id", row.alertID)
		record.Set("name", row.name)
		record.Set("value", row.value)
		if row.resolved {
			record.Set("resolved", now.Add(time.Duration(i)*time.Minute).Format(types.DefaultDateLayout))
		}
		if err := hub.SaveNoValidate(record); err != nil {
			return err
		}
		_, err := hub.DB().NewQuery("UPDATE alerts_history SET created = {:created} WHERE id = {:id}").Bind(dbx.Params{
			"id":      record.Id,
			"created": now.Add(-time.Duration(i) * time.Minute).Format(types.DefaultDateLayout),
		}).Execute()
		if err != nil {
			return err
		}
	}
	return nil
}

func TestDashboardSummaryAPI(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	userToken, err := user.NewAuthToken()
	require.NoError(t, err)
	otherUser, err := pulseTests.CreateUser(hub, "dashboard-other@example.com", "password123")
	require.NoError(t, err)

	ownSystem, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":  "dashboard-own",
		"users": []string{user.Id},
	})
	require.NoError(t, err)
	ownSystem.Set("pairing_confirmed", true)
	require.NoError(t, hub.SaveNoValidate(ownSystem))

	otherSystem, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":  "dashboard-other",
		"users": []string{otherUser.Id},
	})
	require.NoError(t, err)
	otherSystem.Set("pairing_confirmed", true)
	require.NoError(t, hub.SaveNoValidate(otherSystem))

	pendingSystem, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":  "dashboard-pending",
		"users": []string{user.Id},
	})
	require.NoError(t, err)

	_, err = pulseTests.CreateRecord(hub, "containers", map[string]any{
		"id":      "aaaaaa000001",
		"system":  ownSystem.Id,
		"name":    "web",
		"image":   "nginx",
		"status":  "Up 5 minutes",
		"updated": int64(1700000000000),
	})
	require.NoError(t, err)
	_, err = pulseTests.CreateRecord(hub, "containers", map[string]any{
		"id":      "aaaaaa000002",
		"system":  ownSystem.Id,
		"name":    "worker",
		"image":   "busybox",
		"status":  "Exited",
		"updated": int64(1700000000000),
	})
	require.NoError(t, err)
	_, err = pulseTests.CreateRecord(hub, "containers", map[string]any{
		"id":      "aaaaaa000003",
		"system":  otherSystem.Id,
		"name":    "other",
		"image":   "busybox",
		"status":  "Up",
		"updated": int64(1700000000000),
	})
	require.NoError(t, err)
	_, err = pulseTests.CreateRecord(hub, "containers", map[string]any{
		"id":      "aaaaaa000004",
		"system":  pendingSystem.Id,
		"name":    "pending",
		"image":   "busybox",
		"status":  "Up",
		"updated": int64(1700000000000),
	})
	require.NoError(t, err)

	for _, item := range []struct {
		name    string
		status  string
		enabled bool
		userID  string
	}{
		{name: "own-up", status: "up", enabled: true, userID: user.Id},
		{name: "own-down", status: "down", enabled: true, userID: user.Id},
		{name: "own-unknown", status: "unknown", enabled: true, userID: user.Id},
		{name: "own-disabled", status: "down", enabled: false, userID: user.Id},
		{name: "other-down", status: "down", enabled: true, userID: otherUser.Id},
	} {
		_, err = pulseTests.CreateRecord(hub, "website_monitors", map[string]any{
			"user":             item.userID,
			"name":             item.name,
			"url":              "http://127.0.0.1",
			"interval_seconds": 300,
			"timeout_seconds":  5,
			"enabled":          item.enabled,
			"last_status":      item.status,
		})
		require.NoError(t, err)
	}

	testAppFactory := func(t testing.TB) *pbTests.TestApp {
		return hub.TestApp
	}

	scenarios := []pulseTests.ApiScenario{
		{
			Name:            "dashboard summary requires auth",
			Method:          http.MethodGet,
			URL:             "/api/pulse/dashboard/summary",
			ExpectedStatus:  401,
			ExpectedContent: []string{"requires valid"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "dashboard summary returns lightweight visible counts",
			Method: http.MethodGet,
			URL:    "/api/pulse/dashboard/summary",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus: 200,
			ExpectedContent: []string{
				`"containers":{"total":2,"running":1,"stopped":1}`,
				`"websites":{"total":3,"up":1,"down":1,"unknown":1}`,
			},
			NotExpectedContent: []string{
				"dashboard-other",
				"othercontainer",
				"pendingcontainer",
				"own-disabled",
			},
			TestAppFactory: testAppFactory,
		},
	}

	for _, scenario := range scenarios {
		scenario.Test(t)
	}
}

func TestContainerListAPI(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	userToken, err := user.NewAuthToken()
	require.NoError(t, err)
	otherUser, err := pulseTests.CreateUser(hub, "container-list-other@example.com", "password123")
	require.NoError(t, err)
	otherUserToken, err := otherUser.NewAuthToken()
	require.NoError(t, err)

	systemA, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":              "alpha-container-host",
		"display_name":      "Alpha Containers",
		"users":             []string{user.Id},
		"pairing_confirmed": true,
	})
	require.NoError(t, err)
	systemB, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":              "beta-container-host",
		"display_name":      "Beta Containers",
		"users":             []string{user.Id},
		"pairing_confirmed": true,
	})
	require.NoError(t, err)
	emptySystem, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":              "empty-container-host",
		"users":             []string{user.Id},
		"pairing_confirmed": true,
	})
	require.NoError(t, err)
	otherSystem, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":              "other-container-host",
		"users":             []string{otherUser.Id},
		"pairing_confirmed": true,
	})
	require.NoError(t, err)
	pendingSystem, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":  "pending-container-host",
		"users": []string{user.Id},
	})
	require.NoError(t, err)

	for _, item := range []struct {
		id      string
		system  string
		name    string
		status  string
		project string
		config  string
	}{
		{id: "aaaaaa111111", system: systemA.Id, name: "alpha-web", status: "Up 2 minutes", project: "alpha", config: "services:\n  web:\n    image: nginx"},
		{id: "aaaaaa111112", system: systemA.Id, name: "alpha-db", status: "Exited", project: "alpha", config: "services:\n  db:\n    image: postgres"},
		{id: "bbbbbb111111", system: systemB.Id, name: "beta-worker", status: "running", project: "beta"},
		{id: "cccccc111111", system: otherSystem.Id, name: "other-hidden", status: "Up"},
		{id: "dddddd111111", system: pendingSystem.Id, name: "pending-hidden", status: "Up"},
	} {
		_, err = pulseTests.CreateRecord(hub, "containers", map[string]any{
			"id":            item.id,
			"system":        item.system,
			"name":          item.name,
			"image":         "busybox",
			"status":        item.status,
			"stack_project": item.project,
			"stack_config":  item.config,
			"updated":       int64(1700000000000),
		})
		require.NoError(t, err)
	}

	testAppFactory := func(t testing.TB) *pbTests.TestApp {
		return hub.TestApp
	}

	scenarios := []pulseTests.ApiScenario{
		{
			Name:            "container list requires auth",
			Method:          http.MethodGet,
			URL:             "/api/pulse/containers",
			ExpectedStatus:  401,
			ExpectedContent: []string{"requires valid"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "container list returns summaries and default selected system only",
			Method: http.MethodGet,
			URL:    "/api/pulse/containers",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus: 200,
			ExpectedContent: []string{
				`"system":"` + systemA.Id + `"`,
				`"id":"` + systemA.Id + `","total":2,"running":1,"stopped":1`,
				`"id":"` + systemB.Id + `","total":1,"running":1,"stopped":0`,
				`"name":"alpha-web"`,
				`"name":"alpha-db"`,
			},
			NotExpectedContent: []string{
				`"name":"beta-worker"`,
				`"name":"other-hidden"`,
				`"name":"pending-hidden"`,
			},
			TestAppFactory: testAppFactory,
		},
		{
			Name:   "container list loads one requested visible system",
			Method: http.MethodGet,
			URL:    fmt.Sprintf("/api/pulse/containers?system=%s", systemB.Id),
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus: 200,
			ExpectedContent: []string{
				`"system":"` + systemB.Id + `"`,
				`"name":"beta-worker"`,
			},
			NotExpectedContent: []string{
				`"name":"alpha-web"`,
				`"name":"other-hidden"`,
			},
			TestAppFactory: testAppFactory,
		},
		{
			Name:   "container list allows a visible empty system without fake rows",
			Method: http.MethodGet,
			URL:    fmt.Sprintf("/api/pulse/containers?system=%s", emptySystem.Id),
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus: 200,
			ExpectedContent: []string{
				`"system":"` + emptySystem.Id + `"`,
				`"items":[]`,
				`"id":"` + emptySystem.Id + `","total":0,"running":0,"stopped":0`,
			},
			NotExpectedContent: []string{
				`"name":"alpha-web"`,
				`"name":"beta-worker"`,
			},
			TestAppFactory: testAppFactory,
		},
		{
			Name:   "container list rejects another user's system",
			Method: http.MethodGet,
			URL:    fmt.Sprintf("/api/pulse/containers?system=%s", systemA.Id),
			Headers: map[string]string{
				"Authorization": otherUserToken,
			},
			ExpectedStatus:  404,
			ExpectedContent: []string{"System not found"},
			TestAppFactory:  testAppFactory,
		},
	}

	for _, scenario := range scenarios {
		scenario.Test(t)
	}
}

func TestWebsiteMonitorPagedList(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	userToken, err := user.NewAuthToken()
	require.NoError(t, err)
	otherUser, err := pulseTests.CreateUser(hub, "website-list-other@example.com", "password123")
	require.NoError(t, err)
	otherUserToken, err := otherUser.NewAuthToken()
	require.NoError(t, err)

	systemA, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":         "website-system-a",
		"display_name": "Web Alpha",
		"users":        []string{user.Id},
	})
	require.NoError(t, err)
	systemB, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":         "website-system-b",
		"display_name": "Web Beta",
		"users":        []string{user.Id},
	})
	require.NoError(t, err)

	oldCheckedAt := time.Now().UTC().Add(-2 * time.Hour).Format(time.RFC3339Nano)
	recentCheckedAt := time.Now().UTC().Add(-1 * time.Minute).Format(time.RFC3339Nano)
	for _, item := range []struct {
		userID      string
		systemID    string
		name        string
		description string
		status      string
		checkedAt   string
	}{
		{userID: user.Id, systemID: systemA.Id, name: "Blog", description: "Public blog", status: "down", checkedAt: recentCheckedAt},
		{userID: user.Id, systemID: systemA.Id, name: "Harbor", description: "Registry service", status: "up", checkedAt: recentCheckedAt},
		{userID: user.Id, systemID: systemB.Id, name: "Old IPv6", description: "Stale target", status: "up", checkedAt: oldCheckedAt},
		{userID: user.Id, systemID: systemB.Id, name: "Wiki", description: "Docs", status: "unknown", checkedAt: ""},
		{userID: otherUser.Id, systemID: systemA.Id, name: "Other User", description: "Hidden", status: "down", checkedAt: recentCheckedAt},
	} {
		_, err = pulseTests.CreateRecord(hub, "website_monitors", map[string]any{
			"user":             item.userID,
			"system":           item.systemID,
			"name":             item.name,
			"description":      item.description,
			"url":              "http://127.0.0.1",
			"interval_seconds": 60,
			"timeout_seconds":  5,
			"enabled":          true,
			"last_status":      item.status,
			"last_checked":     item.checkedAt,
		})
		require.NoError(t, err)
	}

	testAppFactory := func(t testing.TB) *pbTests.TestApp {
		return hub.TestApp
	}

	scenarios := []pulseTests.ApiScenario{
		{
			Name:            "website monitor list requires auth",
			Method:          http.MethodGet,
			URL:             "/api/pulse/website-monitors?page=1&perPage=2",
			ExpectedStatus:  401,
			ExpectedContent: []string{"requires valid"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "website monitor list returns one server page and counts",
			Method: http.MethodGet,
			URL:    "/api/pulse/website-monitors?page=1&perPage=2",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus: 200,
			ExpectedContent: []string{
				`"page":1`,
				`"perPage":2`,
				`"hasMore":true`,
				`"counts":{"all":4,"up":2,"down":1,"unknown":1,"stale":1}`,
				`"name":"Blog"`,
				`"name":"Harbor"`,
			},
			NotExpectedContent: []string{
				`"name":"Wiki"`,
				`"name":"Other User"`,
			},
			TestAppFactory: testAppFactory,
		},
		{
			Name:   "website monitor list second page excludes first page rows",
			Method: http.MethodGet,
			URL:    "/api/pulse/website-monitors?page=2&perPage=2",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus: 200,
			ExpectedContent: []string{
				`"page":2`,
				`"hasMore":false`,
				`"name":"Old IPv6"`,
				`"name":"Wiki"`,
			},
			NotExpectedContent: []string{
				`"name":"Blog"`,
				`"name":"Other User"`,
			},
			TestAppFactory: testAppFactory,
		},
		{
			Name:   "website monitor list filters search on server",
			Method: http.MethodGet,
			URL:    "/api/pulse/website-monitors?page=1&perPage=5&search=Registry",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus: 200,
			ExpectedContent: []string{
				`"counts":{"all":1,"up":1,"down":0,"unknown":0,"stale":0}`,
				`"name":"Harbor"`,
			},
			NotExpectedContent: []string{
				`"name":"Blog"`,
				`"name":"Other User"`,
			},
			TestAppFactory: testAppFactory,
		},
		{
			Name:   "website monitor list filters status on server",
			Method: http.MethodGet,
			URL:    "/api/pulse/website-monitors?page=1&perPage=5&status=down",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus: 200,
			ExpectedContent: []string{
				`"name":"Blog"`,
			},
			NotExpectedContent: []string{
				`"name":"Harbor"`,
				`"name":"Other User"`,
			},
			TestAppFactory: testAppFactory,
		},
		{
			Name:   "website monitor list filters stale on server",
			Method: http.MethodGet,
			URL:    "/api/pulse/website-monitors?page=1&perPage=5&status=stale",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus: 200,
			ExpectedContent: []string{
				`"name":"Old IPv6"`,
			},
			NotExpectedContent: []string{
				`"name":"Harbor"`,
				`"name":"Wiki"`,
			},
			TestAppFactory: testAppFactory,
		},
		{
			Name:   "website monitor list filters system on server",
			Method: http.MethodGet,
			URL:    "/api/pulse/website-monitors?page=1&perPage=5&system=" + systemB.Id,
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus: 200,
			ExpectedContent: []string{
				`"counts":{"all":2,"up":1,"down":0,"unknown":1,"stale":1}`,
				`"name":"Old IPv6"`,
				`"name":"Wiki"`,
			},
			NotExpectedContent: []string{
				`"name":"Blog"`,
				`"name":"Other User"`,
			},
			TestAppFactory: testAppFactory,
		},
		{
			Name:   "website monitor list isolates users",
			Method: http.MethodGet,
			URL:    "/api/pulse/website-monitors?page=1&perPage=5",
			Headers: map[string]string{
				"Authorization": otherUserToken,
			},
			ExpectedStatus: 200,
			ExpectedContent: []string{
				`"counts":{"all":1,"up":0,"down":1,"unknown":0,"stale":0}`,
				`"name":"Other User"`,
			},
			NotExpectedContent: []string{
				`"name":"Blog"`,
				`"name":"Harbor"`,
			},
			TestAppFactory: testAppFactory,
		},
	}

	for _, scenario := range scenarios {
		scenario.Test(t)
	}
}

func TestInfoReadinessChecksDangerousConfig(t *testing.T) {
	t.Setenv("AUTO_LOGIN", "missing-auto-login@example.com")
	t.Setenv("TRUSTED_AUTH_HEADER", "X-Pulse-Trusted")
	t.Setenv("PULSE_DEV_LOCAL_AGENT_AS_HUB", "true")
	t.Setenv("DISABLE_PASSWORD_AUTH", "true")
	t.Setenv("MFA_OTP", "superusers")
	t.Setenv("PULSE_LOCAL_AGENT_TOKEN", "")

	hub, _ := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	adminUser, err := pulseTests.CreateUserWithRole(hub, "readiness-admin@example.com", "password123", "admin")
	require.NoError(t, err)
	adminUserToken, err := adminUser.NewAuthToken()
	require.NoError(t, err)

	scenario := pulseTests.ApiScenario{
		Name:   "GET /info - admin readiness should expose dangerous runtime config",
		Method: http.MethodGet,
		URL:    "/api/pulse/info",
		Headers: map[string]string{
			"Authorization": adminUserToken,
		},
		ExpectedStatus: 200,
		ExpectedContent: []string{
			"\"readiness\":",
			"\"id\":\"auto_login\"",
			"\"status\":\"danger\"",
			"\"id\":\"trusted_auth_header\"",
			"\"id\":\"dev_local_agent_as_hub\"",
			"\"id\":\"password_auth\"",
			"\"id\":\"local_agent_token\"",
			"\"id\":\"version_consistency\"",
			"\"status\":\"unknown\"",
		},
		TestAppFactory: func(t testing.TB) *pbTests.TestApp {
			return hub.TestApp
		},
	}
	scenario.Test(t)
}

func TestPasswordLoginRateLimit(t *testing.T) {
	hub, err := pulseTests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	_, err = pulseTests.CreateUser(hub, "login-limit@example.com", "password123")
	require.NoError(t, err)

	testAppFactory := func(t testing.TB) *pbTests.TestApp {
		return hub.TestApp
	}
	for attempt := 1; attempt <= 5; attempt++ {
		scenario := pulseTests.ApiScenario{
			Name:   fmt.Sprintf("POST auth-with-password invalid attempt %d", attempt),
			Method: http.MethodPost,
			URL:    "/api/collections/users/auth-with-password",
			Body: jsonReader(map[string]any{
				"identity": "login-limit@example.com",
				"password": "wrong-password",
			}),
			ExpectedStatus: 400,
			ExpectedContent: []string{
				"Failed to authenticate",
			},
			TestAppFactory: testAppFactory,
		}
		scenario.Test(t)
	}

	lockedInvalid := pulseTests.ApiScenario{
		Name:   "POST auth-with-password locked after repeated failures",
		Method: http.MethodPost,
		URL:    "/api/collections/users/auth-with-password",
		Body: jsonReader(map[string]any{
			"identity": "login-limit@example.com",
			"password": "wrong-password",
		}),
		ExpectedStatus: 429,
		ExpectedContent: []string{
			"登录失败次数过多",
		},
		TestAppFactory: testAppFactory,
	}
	lockedInvalid.Test(t)

	lockedValid := pulseTests.ApiScenario{
		Name:   "POST auth-with-password valid password remains locked during lockout",
		Method: http.MethodPost,
		URL:    "/api/collections/users/auth-with-password",
		Body: jsonReader(map[string]any{
			"identity": "login-limit@example.com",
			"password": "password123",
		}),
		ExpectedStatus: 429,
		ExpectedContent: []string{
			"登录失败次数过多",
		},
		TestAppFactory: testAppFactory,
	}
	lockedValid.Test(t)
}

func TestPasswordLoginMFAPaths(t *testing.T) {
	t.Run("disabled MFA password login returns a token directly", func(t *testing.T) {
		hub, err := pulseTests.NewTestHub(t.TempDir())
		require.NoError(t, err)
		defer hub.Cleanup()
		hub.StartHub()

		user, err := pulseTests.CreateUser(hub, "mfa-disabled@example.com", "password123")
		require.NoError(t, err)
		user.SetVerified(true)
		require.NoError(t, hub.Save(user))

		res := performTestAPIRequest(t, hub.TestApp, http.MethodPost, "/api/collections/users/auth-with-password", jsonReader(map[string]any{
			"identity": "mfa-disabled@example.com",
			"password": "password123",
		}), nil)

		require.Equal(t, http.StatusOK, res.Status)
		require.Contains(t, res.Body, `"token":"`)
		require.NotContains(t, res.Body, `"mfaId"`)
	})

	t.Run("enabled MFA requires OTP before returning a token", func(t *testing.T) {
		t.Setenv("MFA_OTP", "true")
		hub, err := pulseTests.NewTestHub(t.TempDir())
		require.NoError(t, err)
		defer hub.Cleanup()
		hub.StartHub()

		user, err := pulseTests.CreateUser(hub, "mfa-enabled@example.com", "password123")
		require.NoError(t, err)
		user.SetVerified(true)
		require.NoError(t, hub.Save(user))

		passwordRes := performTestAPIRequest(t, hub.TestApp, http.MethodPost, "/api/collections/users/auth-with-password", jsonReader(map[string]any{
			"identity": "mfa-enabled@example.com",
			"password": "password123",
		}), nil)
		require.Equal(t, http.StatusUnauthorized, passwordRes.Status)
		require.Contains(t, passwordRes.Body, `"mfaId":"`)
		require.NotContains(t, passwordRes.Body, `"token":"`)

		var passwordBody struct {
			MFAID string `json:"mfaId"`
		}
		require.NoError(t, json.Unmarshal([]byte(passwordRes.Body), &passwordBody))
		require.NotEmpty(t, passwordBody.MFAID)

		otpRes := performTestAPIRequest(t, hub.TestApp, http.MethodPost, "/api/collections/users/request-otp", jsonReader(map[string]any{
			"email": "mfa-enabled@example.com",
		}), nil)
		require.Equal(t, http.StatusOK, otpRes.Status)
		require.Contains(t, otpRes.Body, `"otpId":"`)
		require.Eventually(t, func() bool {
			return hub.TestApp.TestMailer.TotalSend() == 1
		}, time.Second, 25*time.Millisecond)

		var otpBody struct {
			OTPID string `json:"otpId"`
		}
		require.NoError(t, json.Unmarshal([]byte(otpRes.Body), &otpBody))
		require.NotEmpty(t, otpBody.OTPID)

		otp, err := hub.FindOTPById(otpBody.OTPID)
		require.NoError(t, err)
		otp.SetPassword("123456")
		require.NoError(t, hub.Save(otp))

		invalidOTPRes := performTestAPIRequest(t, hub.TestApp, http.MethodPost, "/api/collections/users/auth-with-otp", jsonReader(map[string]any{
			"otpId":    otpBody.OTPID,
			"password": "000000",
			"mfaId":    passwordBody.MFAID,
		}), nil)
		require.Equal(t, http.StatusBadRequest, invalidOTPRes.Status)
		require.NotContains(t, invalidOTPRes.Body, `"token":"`)

		validOTPRes := performTestAPIRequest(t, hub.TestApp, http.MethodPost, "/api/collections/users/auth-with-otp", jsonReader(map[string]any{
			"otpId":    otpBody.OTPID,
			"password": "123456",
			"mfaId":    passwordBody.MFAID,
		}), nil)
		require.Equal(t, http.StatusOK, validOTPRes.Status)
		require.Contains(t, validOTPRes.Body, `"token":"`)
		require.NotContains(t, validOTPRes.Body, `"mfaId"`)

		mfas, err := hub.FindAllMFAsByRecord(user)
		require.NoError(t, err)
		require.Empty(t, mfas)
	})
}

func TestFirstUserCreation(t *testing.T) {
	t.Run("CreateUserEndpoint available when no users exist", func(t *testing.T) {
		hub, _ := pulseTests.NewTestHub(t.TempDir())
		defer hub.Cleanup()

		hub.StartHub()

		testAppFactoryExisting := func(t testing.TB) *pbTests.TestApp {
			return hub.TestApp
		}

		scenarios := []pulseTests.ApiScenario{
			{
				Name:   "POST /create-user - should be available when no users exist",
				Method: http.MethodPost,
				URL:    "/api/pulse/create-user",
				Body: jsonReader(map[string]any{
					"username": "firstuser",
					"email":    "firstuser@example.com",
					"password": "password123",
				}),
				ExpectedStatus:  200,
				ExpectedContent: []string{"User created"},
				TestAppFactory:  testAppFactoryExisting,
				BeforeTestFunc: func(t testing.TB, app *pbTests.TestApp, e *core.ServeEvent) {
					userCount, err := hub.CountRecords("users")
					require.NoError(t, err)
					require.Zero(t, userCount, "Should start with no users")
					superusers, err := hub.FindAllRecords(core.CollectionNameSuperusers)
					require.NoError(t, err)
					require.EqualValues(t, 1, len(superusers), "Should start with one temporary superuser")
					require.EqualValues(t, migrations.TempAdminEmail, superusers[0].GetString("email"), "Should have created one temporary superuser")
				},
				AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
					userCount, err := hub.CountRecords("users")
					require.NoError(t, err)
					require.EqualValues(t, 1, userCount, "Should have created one user")
					superusers, err := hub.FindAllRecords(core.CollectionNameSuperusers)
					require.NoError(t, err)
					require.EqualValues(t, 1, len(superusers), "Should have created one superuser")
					require.EqualValues(t, "firstuser@example.com", superusers[0].GetString("email"), "Should have created one superuser")
				},
			},
			{
				Name:   "POST /create-user - should not be available when users exist",
				Method: http.MethodPost,
				URL:    "/api/pulse/create-user",
				Body: jsonReader(map[string]any{
					"username": "firstuser",
					"email":    "firstuser@example.com",
					"password": "password123",
				}),
				ExpectedStatus:  403,
				ExpectedContent: []string{"Forbidden"},
				TestAppFactory:  testAppFactoryExisting,
			},
		}

		for _, scenario := range scenarios {
			scenario.Test(t)
		}
	})

	t.Run("CreateUserEndpoint not available when USER_EMAIL, USER_PASSWORD are set", func(t *testing.T) {
		t.Setenv("PULSE_HUB_USER_EMAIL", "me@example.com")
		t.Setenv("PULSE_HUB_USER_PASSWORD", "password123")

		hub, _ := pulseTests.NewTestHub(t.TempDir())
		defer hub.Cleanup()

		hub.StartHub()

		testAppFactory := func(t testing.TB) *pbTests.TestApp {
			return hub.TestApp
		}

		scenario := pulseTests.ApiScenario{
			Name:            "POST /create-user - should not be available when USER_EMAIL, USER_PASSWORD are set",
			Method:          http.MethodPost,
			URL:             "/api/pulse/create-user",
			ExpectedStatus:  404,
			ExpectedContent: []string{"wasn't found"},
			TestAppFactory:  testAppFactory,
			BeforeTestFunc: func(t testing.TB, app *pbTests.TestApp, e *core.ServeEvent) {
				users, err := hub.FindAllRecords("users")
				require.NoError(t, err)
				require.EqualValues(t, 1, len(users), "Should start with one user")
				require.EqualValues(t, "me@example.com", users[0].GetString("email"), "Should have created one user")
				superusers, err := hub.FindAllRecords(core.CollectionNameSuperusers)
				require.NoError(t, err)
				require.EqualValues(t, 1, len(superusers), "Should start with one superuser")
				require.EqualValues(t, "me@example.com", superusers[0].GetString("email"), "Should have created one superuser")
			},
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				users, err := hub.FindAllRecords("users")
				require.NoError(t, err)
				require.EqualValues(t, 1, len(users), "Should still have one user")
				require.EqualValues(t, "me@example.com", users[0].GetString("email"), "Should have created one user")
				superusers, err := hub.FindAllRecords(core.CollectionNameSuperusers)
				require.NoError(t, err)
				require.EqualValues(t, 1, len(superusers), "Should still have one superuser")
				require.EqualValues(t, "me@example.com", superusers[0].GetString("email"), "Should have created one superuser")
			},
		}

		scenario.Test(t)
	})
}

func TestCreateUserEndpointAvailability(t *testing.T) {
	t.Run("CreateUserEndpoint available when no users exist", func(t *testing.T) {
		hub, _ := pulseTests.NewTestHub(t.TempDir())
		defer hub.Cleanup()

		// Ensure no users exist
		userCount, err := hub.CountRecords("users")
		require.NoError(t, err)
		require.Zero(t, userCount, "Should start with no users")

		hub.StartHub()

		testAppFactory := func(t testing.TB) *pbTests.TestApp {
			return hub.TestApp
		}

		scenario := pulseTests.ApiScenario{
			Name:   "POST /create-user - should be available when no users exist",
			Method: http.MethodPost,
			URL:    "/api/pulse/create-user",
			Body: jsonReader(map[string]any{
				"username": "firstuser",
				"email":    "firstuser@example.com",
				"password": "password123",
			}),
			ExpectedStatus:  200,
			ExpectedContent: []string{"User created"},
			TestAppFactory:  testAppFactory,
		}

		scenario.Test(t)

		// Verify user was created
		userCount, err = hub.CountRecords("users")
		require.NoError(t, err)
		require.EqualValues(t, 1, userCount, "Should have created one user")
	})

	t.Run("CreateUserEndpoint not available when users exist", func(t *testing.T) {
		hub, _ := pulseTests.NewTestHub(t.TempDir())
		defer hub.Cleanup()

		// Create a user first
		_, err := pulseTests.CreateUser(hub, "existing@example.com", "password")
		require.NoError(t, err)

		hub.StartHub()

		testAppFactory := func(t testing.TB) *pbTests.TestApp {
			return hub.TestApp
		}

		scenario := pulseTests.ApiScenario{
			Name:   "POST /create-user - should not be available when users exist",
			Method: http.MethodPost,
			URL:    "/api/pulse/create-user",
			Body: jsonReader(map[string]any{
				"username": "another",
				"email":    "another@example.com",
				"password": "password123",
			}),
			ExpectedStatus:  404,
			ExpectedContent: []string{"wasn't found"},
			TestAppFactory:  testAppFactory,
		}

		scenario.Test(t)
	})
}

func TestAutoLoginMiddleware(t *testing.T) {
	var hubs []*pulseTests.TestHub

	defer func() {
		for _, hub := range hubs {
			hub.Cleanup()
		}
	}()

	t.Setenv("AUTO_LOGIN", "user@test.com")

	testAppFactory := func(t testing.TB) *pbTests.TestApp {
		hub, _ := pulseTests.NewTestHub(t.TempDir())
		hubs = append(hubs, hub)
		hub.StartHub()
		return hub.TestApp
	}

	scenarios := []pulseTests.ApiScenario{
		{
			Name:            "GET /info - without auto login should fail",
			Method:          http.MethodGet,
			URL:             "/api/pulse/info",
			ExpectedStatus:  401,
			ExpectedContent: []string{"requires valid"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:            "GET /info - with auto login should fail if no matching user",
			Method:          http.MethodGet,
			URL:             "/api/pulse/info",
			ExpectedStatus:  401,
			ExpectedContent: []string{"requires valid"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:               "GET /info - with auto login should succeed",
			Method:             http.MethodGet,
			URL:                "/api/pulse/info",
			ExpectedStatus:     200,
			ExpectedContent:    []string{"\"v\":"},
			NotExpectedContent: []string{"\"key\":"},
			TestAppFactory:     testAppFactory,
			BeforeTestFunc: func(t testing.TB, app *pbTests.TestApp, e *core.ServeEvent) {
				pulseTests.CreateUser(app, "user@test.com", "password123")
			},
		},
	}

	for _, scenario := range scenarios {
		scenario.Test(t)
	}
}

func TestTrustedHeaderMiddleware(t *testing.T) {
	var hubs []*pulseTests.TestHub

	defer func() {
		for _, hub := range hubs {
			hub.Cleanup()
		}
	}()

	t.Setenv("TRUSTED_AUTH_HEADER", "X-Pulse-Trusted")

	testAppFactory := func(t testing.TB) *pbTests.TestApp {
		hub, _ := pulseTests.NewTestHub(t.TempDir())
		hubs = append(hubs, hub)
		hub.StartHub()
		return hub.TestApp
	}

	scenarios := []pulseTests.ApiScenario{
		{
			Name:            "GET /info - without trusted header should fail",
			Method:          http.MethodGet,
			URL:             "/api/pulse/info",
			ExpectedStatus:  401,
			ExpectedContent: []string{"requires valid"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "GET /info - with trusted header should fail if no matching user",
			Method: http.MethodGet,
			URL:    "/api/pulse/info",
			Headers: map[string]string{
				"X-Pulse-Trusted": "user@test.com",
			},
			ExpectedStatus:  401,
			ExpectedContent: []string{"requires valid"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "GET /info - with trusted header should succeed",
			Method: http.MethodGet,
			URL:    "/api/pulse/info",
			Headers: map[string]string{
				"X-Pulse-Trusted": "user@test.com",
			},
			ExpectedStatus:     200,
			ExpectedContent:    []string{"\"v\":"},
			NotExpectedContent: []string{"\"key\":"},
			TestAppFactory:     testAppFactory,
			BeforeTestFunc: func(t testing.TB, app *pbTests.TestApp, e *core.ServeEvent) {
				pulseTests.CreateUser(app, "user@test.com", "password123")
			},
		},
	}

	for _, scenario := range scenarios {
		scenario.Test(t)
	}
}
