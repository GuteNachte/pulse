package hub_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	pbTests "github.com/pocketbase/pocketbase/tests"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	pulseTests "gutenacht.site/pulse/internal/tests"
)

func TestOperationAuditLinksActionAndCanBeQueriedByOperation(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	userToken, err := user.NewAuthToken()
	require.NoError(t, err)
	otherUser, err := pulseTests.CreateUser(hub, "other-operation-user@example.com", "password123")
	require.NoError(t, err)
	otherToken, err := otherUser.NewAuthToken()
	require.NoError(t, err)

	system := createOperationTestSystem(t, hub, user.Id)
	var operationID string

	createScenario := pulseTests.ApiScenario{
		Name:   "POST /operations - disconnected agent should still link audit to operation action",
		Method: http.MethodPost,
		URL:    "/api/pulse/operations",
		Headers: map[string]string{
			"Authorization": userToken,
		},
		Body: jsonReader(map[string]any{
			"system":  system.Id,
			"action":  "refresh_services",
			"target":  "",
			"confirm": true,
		}),
		ExpectedStatus: 409,
		ExpectedContent: []string{
			"\"failure_code\":\"agent_disconnected\"",
			"\"status\":\"failed\"",
		},
		TestAppFactory: func(t testing.TB) *pbTests.TestApp {
			return hub.TestApp
		},
		AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
			var body struct {
				ID          string `json:"id"`
				FailureCode string `json:"failure_code"`
				Status      string `json:"status"`
			}
			require.NoError(t, json.NewDecoder(res.Body).Decode(&body))
			require.NotEmpty(t, body.ID)
			assert.Equal(t, "failed", body.Status)
			assert.Equal(t, "agent_disconnected", body.FailureCode)
			operationID = body.ID

			action, err := app.FindRecordById("operation_actions", operationID)
			require.NoError(t, err)
			assert.Equal(t, system.Id, action.GetString("system"))
			assert.Equal(t, "refresh_services", action.GetString("action"))
			assert.Equal(t, "failed", action.GetString("status"))
			assert.Equal(t, "completed", action.GetString("stage"))
			assert.Equal(t, "agent_disconnected", action.GetString("failure_code"))

			audits, err := app.FindRecordsByFilter("operation_audit", "operation = {:operation}", "", -1, 0, dbx.Params{
				"operation": operationID,
			})
			require.NoError(t, err)
			require.Len(t, audits, 1)
			assert.Equal(t, system.Id, audits[0].GetString("system"))
			assert.Equal(t, operationID, audits[0].GetString("operation"))
			assert.Equal(t, "failed", audits[0].GetString("result"))
			assert.Equal(t, "agent_disconnected", audits[0].GetString("failure_code"))
		},
	}
	createScenario.Test(t)

	require.NotEmpty(t, operationID)
	queryScenario := pulseTests.ApiScenario{
		Name:   "GET /operations/audit - owner can query audit by operation id",
		Method: http.MethodGet,
		URL:    "/api/pulse/operations/audit?operation=" + url.QueryEscape(operationID),
		Headers: map[string]string{
			"Authorization": userToken,
		},
		ExpectedStatus: 200,
		ExpectedContent: []string{
			operationID,
			"agent_disconnected",
			"refresh_services",
		},
		TestAppFactory: func(t testing.TB) *pbTests.TestApp {
			return hub.TestApp
		},
	}
	queryScenario.Test(t)

	permissionScenario := pulseTests.ApiScenario{
		Name:   "GET /operations/audit - unrelated user cannot query another system operation audit",
		Method: http.MethodGet,
		URL:    "/api/pulse/operations/audit?operation=" + url.QueryEscape(operationID),
		Headers: map[string]string{
			"Authorization": otherToken,
		},
		ExpectedStatus:  404,
		ExpectedContent: []string{"The requested resource wasn't found."},
		TestAppFactory: func(t testing.TB) *pbTests.TestApp {
			return hub.TestApp
		},
	}
	permissionScenario.Test(t)
}

func TestOperationPreflightAuditDoesNotClaimOperationRecord(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	userToken, err := user.NewAuthToken()
	require.NoError(t, err)
	system := createOperationTestSystem(t, hub, user.Id)

	scenario := pulseTests.ApiScenario{
		Name:   "POST /operations - missing confirmation writes audit without operation relation",
		Method: http.MethodPost,
		URL:    "/api/pulse/operations",
		Headers: map[string]string{
			"Authorization": userToken,
		},
		Body: jsonReader(map[string]any{
			"system":  system.Id,
			"action":  "refresh_services",
			"confirm": false,
		}),
		ExpectedStatus: 400,
		ExpectedContent: []string{
			"\"failure_code\":\"invalid_request\"",
			"操作需要先确认",
		},
		TestAppFactory: func(t testing.TB) *pbTests.TestApp {
			return hub.TestApp
		},
		AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
			actions, err := app.FindRecordsByFilter("operation_actions", "system = {:system}", "", -1, 0, dbx.Params{
				"system": system.Id,
			})
			require.NoError(t, err)
			assert.Empty(t, actions)

			audits, err := app.FindRecordsByFilter("operation_audit", "system = {:system} && action = 'refresh_services'", "", -1, 0, dbx.Params{
				"system": system.Id,
			})
			require.NoError(t, err)
			require.Len(t, audits, 1)
			assert.Empty(t, audits[0].GetString("operation"))
			assert.Equal(t, "failed", audits[0].GetString("result"))
			assert.Equal(t, "invalid_request", audits[0].GetString("failure_code"))
		},
	}
	scenario.Test(t)
}

func TestOperationListsIncludeActorIdentity(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	user.Set("username", "operation-actor")
	require.NoError(t, hub.Save(user))

	userToken, err := user.NewAuthToken()
	require.NoError(t, err)
	system := createOperationTestSystem(t, hub, user.Id)
	action, err := pulseTests.CreateRecord(hub, "operation_actions", map[string]any{
		"system":          system.Id,
		"user":            user.Id,
		"action":          "refresh_services",
		"target":          "services",
		"status":          "succeeded",
		"stage":           "completed",
		"result":          "ok",
		"timeout_seconds": 15,
		"duration_ms":     1200,
	})
	require.NoError(t, err)
	_, err = pulseTests.CreateRecord(hub, "operation_audit", map[string]any{
		"system":    system.Id,
		"user":      user.Id,
		"operation": action.Id,
		"action":    "refresh_services",
		"target":    "services",
		"result":    "success",
		"detail":    "ok",
	})
	require.NoError(t, err)

	testAppFactory := func(t testing.TB) *pbTests.TestApp {
		return hub.TestApp
	}
	scenarios := []pulseTests.ApiScenario{
		{
			Name:   "GET /operations includes actor identity",
			Method: http.MethodGet,
			URL:    "/api/pulse/operations?system=" + system.Id,
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus: 200,
			ExpectedContent: []string{
				`"actor":{"id":"` + user.Id + `"`,
				`"username":"operation-actor"`,
				`"email":"test@example.com"`,
				`"expand":{"user":{"id":"` + user.Id + `"`,
			},
			TestAppFactory: testAppFactory,
		},
		{
			Name:   "GET /operations/audit includes actor identity",
			Method: http.MethodGet,
			URL:    "/api/pulse/operations/audit?system=" + system.Id,
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus: 200,
			ExpectedContent: []string{
				`"actor":{"id":"` + user.Id + `"`,
				`"username":"operation-actor"`,
				`"email":"test@example.com"`,
				`"expand":{"user":{"id":"` + user.Id + `"`,
			},
			TestAppFactory: testAppFactory,
		},
		{
			Name:   "GET /operations/audit paged includes actor identity",
			Method: http.MethodGet,
			URL:    "/api/pulse/operations/audit?paged=1&page=1&perPage=10&system=" + system.Id,
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus: 200,
			ExpectedContent: []string{
				`"items":[`,
				`"actor":{"id":"` + user.Id + `"`,
				`"username":"operation-actor"`,
				`"email":"test@example.com"`,
				`"expand":{"user":{"id":"` + user.Id + `"`,
			},
			TestAppFactory: testAppFactory,
		},
	}
	for _, scenario := range scenarios {
		scenario.Test(t)
	}
}

func TestGlobalOperationAuditIsScopedToActorAndAdmin(t *testing.T) {
	hub, regularUser := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	regularToken, err := regularUser.NewAuthToken()
	require.NoError(t, err)
	adminUser, err := pulseTests.CreateUserWithRole(hub, "audit-admin@example.com", "password123", "admin")
	require.NoError(t, err)
	adminToken, err := adminUser.NewAuthToken()
	require.NoError(t, err)

	createScenario := pulseTests.ApiScenario{
		Name:   "POST /users - admin user creation writes global operation audit",
		Method: http.MethodPost,
		URL:    "/api/pulse/users",
		Headers: map[string]string{
			"Authorization": adminToken,
		},
		Body: jsonReader(map[string]any{
			"username": "created-audit-user",
			"email":    "created-audit-user@example.com",
			"password": "password123",
			"role":     "user",
		}),
		ExpectedStatus:  200,
		ExpectedContent: []string{"created-audit-user@example.com"},
		TestAppFactory: func(t testing.TB) *pbTests.TestApp {
			return hub.TestApp
		},
		AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
			audit, err := app.FindFirstRecordByFilter(
				"operation_audit",
				"user = {:user} && system = '' && action = 'create_user' && target = 'created-audit-user@example.com'",
				dbx.Params{"user": adminUser.Id},
			)
			require.NoError(t, err)
			assert.Equal(t, "success", audit.GetString("result"))
		},
	}
	createScenario.Test(t)

	adminQueryScenario := pulseTests.ApiScenario{
		Name:   "GET /operations/audit - admin can see global admin audit",
		Method: http.MethodGet,
		URL:    "/api/pulse/operations/audit",
		Headers: map[string]string{
			"Authorization": adminToken,
		},
		ExpectedStatus:  200,
		ExpectedContent: []string{"create_user", "created-audit-user@example.com"},
		TestAppFactory: func(t testing.TB) *pbTests.TestApp {
			return hub.TestApp
		},
	}
	adminQueryScenario.Test(t)

	regularQueryScenario := pulseTests.ApiScenario{
		Name:   "GET /operations/audit - regular user cannot see another user's global audit",
		Method: http.MethodGet,
		URL:    "/api/pulse/operations/audit",
		Headers: map[string]string{
			"Authorization": regularToken,
		},
		ExpectedStatus:     200,
		NotExpectedContent: []string{"create_user", "created-audit-user@example.com"},
		TestAppFactory: func(t testing.TB) *pbTests.TestApp {
			return hub.TestApp
		},
	}
	regularQueryScenario.Test(t)
}

func TestWebsiteMonitorCheckWritesOperationAudit(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	userToken, err := user.NewAuthToken()
	require.NoError(t, err)
	system := createOperationTestSystem(t, hub, user.Id)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))
	defer server.Close()

	monitor, err := pulseTests.CreateRecord(hub, "website_monitors", map[string]any{
		"user":             user.Id,
		"system":           system.Id,
		"name":             "Audit Site",
		"url":              server.URL,
		"interval_seconds": 300,
		"timeout_seconds":  5,
		"enabled":          true,
	})
	require.NoError(t, err)

	scenario := pulseTests.ApiScenario{
		Name:   "POST /website-monitors/{id}/check - writes operation audit",
		Method: http.MethodPost,
		URL:    "/api/pulse/website-monitors/" + monitor.Id + "/check",
		Headers: map[string]string{
			"Authorization": userToken,
		},
		ExpectedStatus:  200,
		ExpectedContent: []string{"\"status\":\"up\""},
		TestAppFactory: func(t testing.TB) *pbTests.TestApp {
			return hub.TestApp
		},
		AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
			audit, err := app.FindFirstRecordByFilter(
				"operation_audit",
				"system = {:system} && action = 'check_website_monitor' && target = 'Audit Site'",
				dbx.Params{"system": system.Id},
			)
			require.NoError(t, err)
			assert.Equal(t, user.Id, audit.GetString("user"))
			assert.Equal(t, "success", audit.GetString("result"))
		},
	}
	scenario.Test(t)
}

func TestBackupActionsWriteOperationAudit(t *testing.T) {
	hub, _ := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	adminUser, err := pulseTests.CreateUserWithRole(hub, "backup-audit-admin@example.com", "password123", "admin")
	require.NoError(t, err)
	adminToken, err := adminUser.NewAuthToken()
	require.NoError(t, err)

	createScenario := pulseTests.ApiScenario{
		Name:   "POST /backups - writes create backup audit",
		Method: http.MethodPost,
		URL:    "/api/pulse/backups",
		Headers: map[string]string{
			"Authorization": adminToken,
		},
		Body: jsonReader(map[string]any{
			"name": "audit_backup",
		}),
		ExpectedStatus:  200,
		ExpectedContent: []string{"audit_backup.zip"},
		TestAppFactory: func(t testing.TB) *pbTests.TestApp {
			return hub.TestApp
		},
		AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
			audit, err := app.FindFirstRecordByFilter(
				"operation_audit",
				"user = {:user} && action = 'create_backup' && target = 'audit_backup.zip'",
				dbx.Params{"user": adminUser.Id},
			)
			require.NoError(t, err)
			assert.Equal(t, "success", audit.GetString("result"))
		},
	}
	createScenario.Test(t)

	downloadScenario := pulseTests.ApiScenario{
		Name:   "GET /backups/{key} - writes download backup audit",
		Method: http.MethodGet,
		URL:    "/api/pulse/backups/audit_backup.zip",
		Headers: map[string]string{
			"Authorization": adminToken,
		},
		ExpectedStatus:  200,
		ExpectedContent: []string{"PK"},
		TestAppFactory: func(t testing.TB) *pbTests.TestApp {
			return hub.TestApp
		},
		AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
			audit, err := app.FindFirstRecordByFilter(
				"operation_audit",
				"user = {:user} && action = 'download_backup' && target = 'audit_backup.zip'",
				dbx.Params{"user": adminUser.Id},
			)
			require.NoError(t, err)
			assert.Equal(t, "success", audit.GetString("result"))
		},
	}
	downloadScenario.Test(t)

	deleteScenario := pulseTests.ApiScenario{
		Name:   "DELETE /backups/{key} - writes delete backup audit",
		Method: http.MethodDelete,
		URL:    "/api/pulse/backups/audit_backup.zip",
		Headers: map[string]string{
			"Authorization": adminToken,
		},
		ExpectedStatus:  200,
		ExpectedContent: []string{"deleted"},
		TestAppFactory: func(t testing.TB) *pbTests.TestApp {
			return hub.TestApp
		},
		AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
			audit, err := app.FindFirstRecordByFilter(
				"operation_audit",
				"user = {:user} && action = 'delete_backup' && target = 'audit_backup.zip'",
				dbx.Params{"user": adminUser.Id},
			)
			require.NoError(t, err)
			assert.Equal(t, "success", audit.GetString("result"))
		},
	}
	deleteScenario.Test(t)
}

func TestCollectionRecordUpdateWritesOperationAudit(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	userToken, err := user.NewAuthToken()
	require.NoError(t, err)
	system := createOperationTestSystem(t, hub, user.Id)

	scenario := pulseTests.ApiScenario{
		Name:   "PATCH /collections/systems - direct system edit writes operation audit",
		Method: http.MethodPatch,
		URL:    "/api/collections/systems/records/" + system.Id,
		Headers: map[string]string{
			"Authorization": userToken,
		},
		Body: jsonReader(map[string]any{
			"display_name": "Edited Display Name",
		}),
		ExpectedStatus:  200,
		ExpectedContent: []string{"Edited Display Name"},
		TestAppFactory: func(t testing.TB) *pbTests.TestApp {
			return hub.TestApp
		},
		AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
			audit, err := app.FindFirstRecordByFilter(
				"operation_audit",
				"system = {:system} && user = {:user} && action = 'update_system'",
				dbx.Params{"system": system.Id, "user": user.Id},
			)
			require.NoError(t, err)
			assert.Equal(t, "Edited Display Name", audit.GetString("target"))
			assert.Equal(t, "success", audit.GetString("result"))
		},
	}
	scenario.Test(t)
}

func TestUserWritableCollectionRequestsWriteOperationAudit(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	userToken, err := user.NewAuthToken()
	require.NoError(t, err)
	system := createOperationTestSystem(t, hub, user.Id)

	pairingCode, err := pulseTests.CreateRecord(hub, "agent_pairing_codes", map[string]any{
		"user":       user.Id,
		"code":       "AUD123",
		"expires_at": time.Now().Add(time.Hour),
		"target_ip":  "192.0.2.10",
	})
	require.NoError(t, err)
	notificationHealth, err := pulseTests.CreateRecord(hub, "notification_channel_health", map[string]any{
		"user":        user.Id,
		"fingerprint": strings.Repeat("a", 64),
		"target":      "https://notify.example.test/hook",
		"status":      "failed",
	})
	require.NoError(t, err)
	alertNotificationState, err := pulseTests.CreateRecord(hub, "alert_notification_states", map[string]any{
		"user":        user.Id,
		"system":      system.Id,
		"fingerprint": strings.Repeat("b", 64),
		"alert_id":    "CPU-high",
		"title":       "CPU high",
		"status":      "suppressed",
	})
	require.NoError(t, err)

	testAppFactory := func(t testing.TB) *pbTests.TestApp {
		return hub.TestApp
	}
	scenarios := []pulseTests.ApiScenario{
		{
			Name:   "POST /collections/alerts - direct alert rule write is audited",
			Method: http.MethodPost,
			URL:    "/api/collections/alerts/records",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			Body: jsonReader(map[string]any{
				"user":   user.Id,
				"system": system.Id,
				"name":   "CPU",
				"value":  80,
				"min":    10,
			}),
			ExpectedStatus:  200,
			ExpectedContent: []string{"CPU"},
			TestAppFactory:  testAppFactory,
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				audit, err := app.FindFirstRecordByFilter(
					"operation_audit",
					"system = {:system} && user = {:user} && action = 'create_alert_rule' && target = 'CPU'",
					dbx.Params{"system": system.Id, "user": user.Id},
				)
				require.NoError(t, err)
				assert.Equal(t, "success", audit.GetString("result"))
			},
		},
		{
			Name:   "POST /collections/alert_policies - direct global alert policy write is audited",
			Method: http.MethodPost,
			URL:    "/api/collections/alert_policies/records",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			Body: jsonReader(map[string]any{
				"user":  user.Id,
				"name":  "Memory",
				"value": 85,
				"min":   10,
			}),
			ExpectedStatus:  200,
			ExpectedContent: []string{"Memory"},
			TestAppFactory:  testAppFactory,
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				audit, err := app.FindFirstRecordByFilter(
					"operation_audit",
					"user = {:user} && system = '' && action = 'create_alert_policy' && target = 'Memory'",
					dbx.Params{"user": user.Id},
				)
				require.NoError(t, err)
				assert.Equal(t, "success", audit.GetString("result"))
			},
		},
		{
			Name:   "DELETE /collections/agent_pairing_codes - direct pairing session delete is audited",
			Method: http.MethodDelete,
			URL:    "/api/collections/agent_pairing_codes/records/" + pairingCode.Id,
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus: 204,
			TestAppFactory: testAppFactory,
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				audit, err := app.FindFirstRecordByFilter(
					"operation_audit",
					"user = {:user} && action = 'delete_pairing_code' && target = '192.0.2.10'",
					dbx.Params{"user": user.Id},
				)
				require.NoError(t, err)
				assert.Equal(t, "success", audit.GetString("result"))
			},
		},
		{
			Name:   "DELETE /collections/notification_channel_health - direct notification health delete is audited",
			Method: http.MethodDelete,
			URL:    "/api/collections/notification_channel_health/records/" + notificationHealth.Id,
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus: 204,
			TestAppFactory: testAppFactory,
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				audit, err := app.FindFirstRecordByFilter(
					"operation_audit",
					"user = {:user} && action = 'delete_notification_channel_health'",
					dbx.Params{"user": user.Id},
				)
				require.NoError(t, err)
				assert.Equal(t, "success", audit.GetString("result"))
				assert.NotContains(t, audit.GetString("target"), "hook")
			},
		},
		{
			Name:   "DELETE /collections/alert_notification_states - direct alert notification state delete is audited",
			Method: http.MethodDelete,
			URL:    "/api/collections/alert_notification_states/records/" + alertNotificationState.Id,
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus: 204,
			TestAppFactory: testAppFactory,
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				audit, err := app.FindFirstRecordByFilter(
					"operation_audit",
					"system = {:system} && user = {:user} && action = 'delete_alert_notification_state' && target = 'CPU high'",
					dbx.Params{"system": system.Id, "user": user.Id},
				)
				require.NoError(t, err)
				assert.Equal(t, "success", audit.GetString("result"))
			},
		},
	}
	for _, scenario := range scenarios {
		scenario.Test(t)
	}
}

func TestAgentTokenRotateAuditDoesNotExposeSecrets(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	userToken, err := user.NewAuthToken()
	require.NoError(t, err)
	system := createOperationTestSystem(t, hub, user.Id)
	fingerprint, err := pulseTests.CreateRecord(hub, "fingerprints", map[string]any{
		"system":      system.Id,
		"token":       "full-token-should-not-appear",
		"fingerprint": "full-fingerprint-should-not-appear",
	})
	require.NoError(t, err)

	scenario := pulseTests.ApiScenario{
		Name:   "POST /agent-tokens/{id}/rotate - audit does not store token material",
		Method: http.MethodPost,
		URL:    "/api/pulse/agent-tokens/" + fingerprint.Id + "/rotate",
		Headers: map[string]string{
			"Authorization": userToken,
		},
		ExpectedStatus: 200,
		ExpectedContent: []string{
			"token_preview",
		},
		NotExpectedContent: []string{
			"full-token-should-not-appear",
		},
		TestAppFactory: func(t testing.TB) *pbTests.TestApp {
			return hub.TestApp
		},
		AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
			audit, err := app.FindFirstRecordByFilter(
				"operation_audit",
				"system = {:system} && user = {:user} && action = 'rotate_agent_token'",
				dbx.Params{"system": system.Id, "user": user.Id},
			)
			require.NoError(t, err)
			assert.Equal(t, "operation-test-system", audit.GetString("target"))
			assert.NotContains(t, audit.GetString("target"), "fingerprint-should-not-appear")
			assert.NotContains(t, audit.GetString("detail"), "token-should-not-appear")
		},
	}
	scenario.Test(t)
}

func TestFingerprintCollectionDirectWriteIsBlocked(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	userToken, err := user.NewAuthToken()
	require.NoError(t, err)
	system := createOperationTestSystem(t, hub, user.Id)
	fingerprint, err := pulseTests.CreateRecord(hub, "fingerprints", map[string]any{
		"system":      system.Id,
		"token":       "direct-write-token",
		"fingerprint": "direct-write-fingerprint",
	})
	require.NoError(t, err)

	scenario := pulseTests.ApiScenario{
		Name:   "PATCH /collections/fingerprints - direct write is blocked",
		Method: http.MethodPatch,
		URL:    "/api/collections/fingerprints/records/" + fingerprint.Id,
		Headers: map[string]string{
			"Authorization": userToken,
		},
		Body: jsonReader(map[string]any{
			"token":       "rotated-token-should-not-write",
			"fingerprint": "rotated-fingerprint-should-not-write",
		}),
		ExpectedStatus:  403,
		ExpectedContent: []string{"Only superusers can perform this action."},
		TestAppFactory: func(t testing.TB) *pbTests.TestApp {
			return hub.TestApp
		},
	}
	scenario.Test(t)
}

func TestOperationAuditPagedList(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	userToken, err := user.NewAuthToken()
	require.NoError(t, err)
	otherUser, err := pulseTests.CreateUser(hub, "audit-page-other@example.com", "password123")
	require.NoError(t, err)

	for _, target := range []string{"audit-page-1", "audit-page-2", "audit-page-3"} {
		_, err = pulseTests.CreateRecord(hub, "operation_audit", map[string]any{
			"user":   user.Id,
			"action": "test_notification",
			"target": target,
			"result": "success",
			"detail": "ok",
		})
		require.NoError(t, err)
	}
	_, err = pulseTests.CreateRecord(hub, "operation_audit", map[string]any{
		"user":   otherUser.Id,
		"action": "test_notification",
		"target": "audit-page-other",
		"result": "success",
		"detail": "other",
	})
	require.NoError(t, err)

	testAppFactory := func(t testing.TB) *pbTests.TestApp {
		return hub.TestApp
	}
	scenarios := []pulseTests.ApiScenario{
		{
			Name:   "GET /operations/audit paged list returns one page and hasMore",
			Method: http.MethodGet,
			URL:    "/api/pulse/operations/audit?paged=1&page=1&perPage=2&action=test_notification",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus: 200,
			ExpectedContent: []string{
				`"items":[`,
				`"perPage":2`,
				`"hasMore":true`,
				"test_notification",
			},
			NotExpectedContent: []string{
				"audit-page-other",
			},
			TestAppFactory: testAppFactory,
		},
		{
			Name:   "GET /operations/audit paged list filters search on server",
			Method: http.MethodGet,
			URL:    "/api/pulse/operations/audit?paged=1&page=1&perPage=2&search=audit-page-2",
			Headers: map[string]string{
				"Authorization": userToken,
			},
			ExpectedStatus: 200,
			ExpectedContent: []string{
				`"items":[`,
				"audit-page-2",
				`"hasMore":false`,
			},
			NotExpectedContent: []string{
				"audit-page-1",
				"audit-page-3",
				"audit-page-other",
			},
			TestAppFactory: testAppFactory,
		},
	}
	for _, scenario := range scenarios {
		scenario.Test(t)
	}
}

func createOperationTestSystem(t testing.TB, hub *pulseTests.TestHub, userID string) *core.Record {
	t.Helper()
	record, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":              "operation-test-system",
		"users":             []string{userID},
		"pairing_confirmed": true,
	})
	require.NoError(t, err)
	record.Set("status", "up")
	record.Set("info", map[string]any{
		"cap": map[string]any{
			"operations": []string{},
		},
	})
	require.NoError(t, hub.SaveNoValidate(record))
	require.NoError(t, hub.GetSystemManager().AddRecord(record, nil))
	return record
}
