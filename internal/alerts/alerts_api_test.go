//go:build testing

package alerts_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	pbTests "github.com/pocketbase/pocketbase/tests"
	"gutenacht.site/pulse/internal/alerts"
	pulseTests "gutenacht.site/pulse/internal/tests"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"github.com/stretchr/testify/assert"
)

// marshal to json and return an io.Reader (for use in ApiScenario.Body)
func jsonReader(v any) io.Reader {
	data, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return bytes.NewReader(data)
}

func TestIsInternalURL(t *testing.T) {
	testCases := []struct {
		name     string
		url      string
		internal bool
	}{
		{name: "loopback ipv4", url: "generic://127.0.0.1", internal: true},
		{name: "localhost hostname", url: "generic://localhost", internal: true},
		{name: "localhost hostname", url: "generic+http://localhost/api/v1/postStuff", internal: true},
		{name: "localhost hostname", url: "generic+http://127.0.0.1:8080/api/v1/postStuff", internal: true},
		{name: "localhost hostname", url: "generic+https://pulse.test/api/v1/postStuff", internal: false},
		{name: "public ipv4", url: "generic://8.8.8.8", internal: false},
		{name: "token style service url", url: "discord://abc123@123456789", internal: false},
		{name: "single label service url", url: "slack://token@team/channel", internal: false},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			internal, err := alerts.IsInternalURL(testCase.url)
			assert.NoError(t, err)
			assert.Equal(t, testCase.internal, internal)
		})
	}
}

func TestUserAlertsApi(t *testing.T) {
	hub, _ := pulseTests.NewTestHub(t.TempDir())
	defer hub.Cleanup()

	hub.StartHub()

	user1, _ := pulseTests.CreateUser(hub, "alertstest@example.com", "password")
	user1Token, _ := user1.NewAuthToken()

	user2, _ := pulseTests.CreateUser(hub, "alertstest2@example.com", "password")
	user2Token, _ := user2.NewAuthToken()

	system1, _ := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":  "system1",
		"users": []string{user1.Id},
		"host":  "127.0.0.1",
	})

	system2, _ := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":  "system2",
		"users": []string{user1.Id, user2.Id},
		"host":  "127.0.0.2",
	})
	systemUser2Only, _ := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":  "system-user2-only",
		"users": []string{user2.Id},
		"host":  "127.0.0.3",
	})
	asset1, _ := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user":   user1.Id,
		"name":   "asset-system1",
		"type":   "physical_host",
		"status": "active",
	})
	asset2, _ := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user":   user1.Id,
		"name":   "asset-system2",
		"type":   "physical_host",
		"status": "active",
	})
	unmonitoredAsset, _ := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user":   user1.Id,
		"name":   "asset-no-system",
		"type":   "physical_host",
		"status": "active",
	})
	system1.Set("asset", asset1.Id)
	system2.Set("asset", asset2.Id)
	assert.NoError(t, hub.SaveNoValidate(system1))
	assert.NoError(t, hub.SaveNoValidate(system2))

	userRecords, _ := hub.CountRecords("users")
	assert.EqualValues(t, 2, userRecords, "all users should be created")

	systemRecords, _ := hub.CountRecords("systems")
	assert.EqualValues(t, 3, systemRecords, "all systems should be created")

	testAppFactory := func(t testing.TB) *pbTests.TestApp {
		return hub.TestApp
	}

	scenarios := []pulseTests.ApiScenario{
		// {
		// 	Name:            "GET not implemented - returns index",
		// 	Method:          http.MethodGet,
		// 	URL:             "/api/pulse/user-alerts",
		// 	ExpectedStatus:  200,
		// 	ExpectedContent: []string{"<html ", "globalThis.PULSE"},
		// 	TestAppFactory:  testAppFactory,
		// },
		{
			Name:            "POST no auth",
			Method:          http.MethodPost,
			URL:             "/api/pulse/user-alerts",
			ExpectedStatus:  401,
			ExpectedContent: []string{"requires valid"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "POST no body",
			Method: http.MethodPost,
			URL:    "/api/pulse/user-alerts",
			Headers: map[string]string{
				"Authorization": user1Token,
			},
			ExpectedStatus:  400,
			ExpectedContent: []string{"Bad data"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "POST bad data",
			Method: http.MethodPost,
			URL:    "/api/pulse/user-alerts",
			Headers: map[string]string{
				"Authorization": user1Token,
			},
			ExpectedStatus:  400,
			ExpectedContent: []string{"Bad data"},
			TestAppFactory:  testAppFactory,
			Body: jsonReader(map[string]any{
				"invalidField": "this should cause validation error",
				"threshold":    "not a number",
			}),
		},
		{
			Name:   "POST malformed JSON",
			Method: http.MethodPost,
			URL:    "/api/pulse/user-alerts",
			Headers: map[string]string{
				"Authorization": user1Token,
			},
			ExpectedStatus:  400,
			ExpectedContent: []string{"Bad data"},
			TestAppFactory:  testAppFactory,
			Body:            strings.NewReader(`{"alertType": "cpu", "threshold": 80, "enabled": true,}`),
		},
		{
			Name:   "POST valid alert data multiple systems",
			Method: http.MethodPost,
			URL:    "/api/pulse/user-alerts",
			Headers: map[string]string{
				"Authorization": user1Token,
			},
			ExpectedStatus:  200,
			ExpectedContent: []string{"\"success\":true"},
			TestAppFactory:  testAppFactory,
			Body: jsonReader(map[string]any{
				"name":      "CPU",
				"value":     69,
				"min":       9,
				"systems":   []string{system1.Id, system2.Id},
				"overwrite": false,
			}),
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				// check total alerts
				alerts, _ := app.CountRecords("alerts")
				assert.EqualValues(t, 2, alerts, "should have 2 alerts")
				// check alert has correct values
				matchingAlerts, _ := app.CountRecords("alerts", dbx.HashExp{"name": "CPU", "user": user1.Id, "system": system1.Id, "value": 69, "min": 9})
				assert.EqualValues(t, 1, matchingAlerts, "should have 1 alert")
			},
		},
		{
			Name:   "POST valid alert data by asset",
			Method: http.MethodPost,
			URL:    "/api/pulse/user-alerts",
			Headers: map[string]string{
				"Authorization": user1Token,
			},
			ExpectedStatus:  200,
			ExpectedContent: []string{"\"success\":true"},
			TestAppFactory:  testAppFactory,
			Body: jsonReader(map[string]any{
				"name":      "GPU",
				"value":     70,
				"min":       6,
				"assets":    []string{asset1.Id},
				"overwrite": true,
			}),
			BeforeTestFunc: func(t testing.TB, app *pbTests.TestApp, e *core.ServeEvent) {
				pulseTests.ClearCollection(t, app, "alerts")
			},
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				alert, err := app.FindFirstRecordByFilter("alerts", "name = 'GPU' && user = {:user} && system = {:system}", dbx.Params{"user": user1.Id, "system": system1.Id})
				assert.NoError(t, err)
				if assert.NotNil(t, alert) {
					assert.EqualValues(t, 70, alert.Get("value"))
					assert.EqualValues(t, 6, alert.Get("min"))
					assert.Equal(t, asset1.Id, alert.GetString("asset"))
				}
				otherAlerts, _ := app.CountRecords("alerts", dbx.HashExp{"name": "GPU", "system": system2.Id})
				assert.Zero(t, otherAlerts)
			},
		},
		{
			Name:   "POST rejects system outside current user",
			Method: http.MethodPost,
			URL:    "/api/pulse/user-alerts",
			Headers: map[string]string{
				"Authorization": user1Token,
			},
			ExpectedStatus:  400,
			ExpectedContent: []string{"Bad data"},
			TestAppFactory:  testAppFactory,
			Body: jsonReader(map[string]any{
				"name":    "CPU",
				"value":   80,
				"min":     10,
				"systems": []string{systemUser2Only.Id},
			}),
		},
		{
			Name:   "POST rejects asset outside current user",
			Method: http.MethodPost,
			URL:    "/api/pulse/user-alerts",
			Headers: map[string]string{
				"Authorization": user2Token,
			},
			ExpectedStatus:  400,
			ExpectedContent: []string{"Bad data"},
			TestAppFactory:  testAppFactory,
			Body: jsonReader(map[string]any{
				"name":   "CPU",
				"value":  80,
				"min":    10,
				"assets": []string{asset1.Id},
			}),
		},
		{
			Name:   "POST rejects unmonitored asset target",
			Method: http.MethodPost,
			URL:    "/api/pulse/user-alerts",
			Headers: map[string]string{
				"Authorization": user1Token,
			},
			ExpectedStatus:  400,
			ExpectedContent: []string{"Bad data"},
			TestAppFactory:  testAppFactory,
			Body: jsonReader(map[string]any{
				"name":   "CPU",
				"value":  80,
				"min":    10,
				"assets": []string{unmonitoredAsset.Id},
			}),
		},
		{
			Name:   "POST valid alert data single system",
			Method: http.MethodPost,
			URL:    "/api/pulse/user-alerts",
			Headers: map[string]string{
				"Authorization": user1Token,
			},
			ExpectedStatus:  200,
			ExpectedContent: []string{"\"success\":true"},
			TestAppFactory:  testAppFactory,
			Body: jsonReader(map[string]any{
				"name":    "Memory",
				"systems": []string{system1.Id},
				"value":   90,
				"min":     10,
			}),
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				user1Alerts, _ := app.CountRecords("alerts", dbx.HashExp{"user": user1.Id})
				assert.EqualValues(t, 2, user1Alerts, "should have 2 alerts")
			},
		},
		{
			Name:   "Overwrite: false, should not overwrite existing alert",
			Method: http.MethodPost,
			URL:    "/api/pulse/user-alerts",
			Headers: map[string]string{
				"Authorization": user1Token,
			},
			ExpectedStatus:  200,
			ExpectedContent: []string{"\"success\":true"},
			TestAppFactory:  testAppFactory,
			Body: jsonReader(map[string]any{
				"name":      "CPU",
				"value":     45,
				"min":       5,
				"systems":   []string{system1.Id},
				"overwrite": false,
			}),
			BeforeTestFunc: func(t testing.TB, app *pbTests.TestApp, e *core.ServeEvent) {
				pulseTests.ClearCollection(t, app, "alerts")
				pulseTests.CreateRecord(app, "alerts", map[string]any{
					"name":   "CPU",
					"system": system1.Id,
					"user":   user1.Id,
					"value":  80,
					"min":    10,
				})
			},
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				alerts, _ := app.CountRecords("alerts")
				assert.EqualValues(t, 1, alerts, "should have 1 alert")
				alert, _ := app.FindFirstRecordByFilter("alerts", "name = 'CPU' && user = {:user}", dbx.Params{"user": user1.Id})
				assert.EqualValues(t, 80, alert.Get("value"), "should have 80 as value")
			},
		},
		{
			Name:   "Overwrite: true, should overwrite existing alert",
			Method: http.MethodPost,
			URL:    "/api/pulse/user-alerts",
			Headers: map[string]string{
				"Authorization": user2Token,
			},
			ExpectedStatus:  200,
			ExpectedContent: []string{"\"success\":true"},
			TestAppFactory:  testAppFactory,
			Body: jsonReader(map[string]any{
				"name":      "CPU",
				"value":     45,
				"min":       5,
				"systems":   []string{system2.Id},
				"overwrite": true,
			}),
			BeforeTestFunc: func(t testing.TB, app *pbTests.TestApp, e *core.ServeEvent) {
				pulseTests.ClearCollection(t, app, "alerts")
				pulseTests.CreateRecord(app, "alerts", map[string]any{
					"name":   "CPU",
					"system": system2.Id,
					"user":   user2.Id,
					"value":  80,
					"min":    10,
				})
			},
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				alerts, _ := app.CountRecords("alerts")
				assert.EqualValues(t, 1, alerts, "should have 1 alert")
				alert, _ := app.FindFirstRecordByFilter("alerts", "name = 'CPU' && user = {:user}", dbx.Params{"user": user2.Id})
				assert.EqualValues(t, 45, alert.Get("value"), "should have 45 as value")
			},
		},
		{
			Name:            "DELETE no auth",
			Method:          http.MethodDelete,
			URL:             "/api/pulse/user-alerts",
			ExpectedStatus:  401,
			ExpectedContent: []string{"requires valid"},
			TestAppFactory:  testAppFactory,
			Body: jsonReader(map[string]any{
				"name":    "CPU",
				"systems": []string{system1.Id},
			}),
			BeforeTestFunc: func(t testing.TB, app *pbTests.TestApp, e *core.ServeEvent) {
				pulseTests.ClearCollection(t, app, "alerts")
				pulseTests.CreateRecord(app, "alerts", map[string]any{
					"name":   "CPU",
					"system": system1.Id,
					"user":   user1.Id,
					"value":  80,
					"min":    10,
				})
			},
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				alerts, _ := app.CountRecords("alerts")
				assert.EqualValues(t, 1, alerts, "should have 1 alert")
			},
		},
		{
			Name:   "DELETE alert",
			Method: http.MethodDelete,
			URL:    "/api/pulse/user-alerts",
			Headers: map[string]string{
				"Authorization": user1Token,
			},
			ExpectedStatus:  200,
			ExpectedContent: []string{"\"count\":1", "\"success\":true"},
			TestAppFactory:  testAppFactory,
			Body: jsonReader(map[string]any{
				"name":    "CPU",
				"systems": []string{system1.Id},
			}),
			BeforeTestFunc: func(t testing.TB, app *pbTests.TestApp, e *core.ServeEvent) {
				pulseTests.ClearCollection(t, app, "alerts")
				pulseTests.CreateRecord(app, "alerts", map[string]any{
					"name":   "CPU",
					"system": system1.Id,
					"user":   user1.Id,
					"value":  80,
					"min":    10,
				})
			},
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				alerts, _ := app.CountRecords("alerts")
				assert.Zero(t, alerts, "should have 0 alerts")
			},
		},
		{
			Name:   "DELETE alert by asset",
			Method: http.MethodDelete,
			URL:    "/api/pulse/user-alerts",
			Headers: map[string]string{
				"Authorization": user1Token,
			},
			ExpectedStatus:  200,
			ExpectedContent: []string{"\"count\":1", "\"success\":true"},
			TestAppFactory:  testAppFactory,
			Body: jsonReader(map[string]any{
				"name":   "Disk",
				"assets": []string{asset1.Id},
			}),
			BeforeTestFunc: func(t testing.TB, app *pbTests.TestApp, e *core.ServeEvent) {
				pulseTests.ClearCollection(t, app, "alerts")
				pulseTests.CreateRecord(app, "alerts", map[string]any{
					"name":   "Disk",
					"system": system1.Id,
					"asset":  asset1.Id,
					"user":   user1.Id,
					"value":  80,
					"min":    10,
				})
			},
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				alerts, _ := app.CountRecords("alerts")
				assert.Zero(t, alerts, "should have 0 alerts")
			},
		},
		{
			Name:   "DELETE alert multiple systems",
			Method: http.MethodDelete,
			URL:    "/api/pulse/user-alerts",
			Headers: map[string]string{
				"Authorization": user1Token,
			},
			ExpectedStatus:  200,
			ExpectedContent: []string{"\"count\":2", "\"success\":true"},
			TestAppFactory:  testAppFactory,
			Body: jsonReader(map[string]any{
				"name":    "Memory",
				"systems": []string{system1.Id, system2.Id},
			}),
			BeforeTestFunc: func(t testing.TB, app *pbTests.TestApp, e *core.ServeEvent) {
				pulseTests.ClearCollection(t, app, "alerts")
				for _, systemId := range []string{system1.Id, system2.Id} {
					_, err := pulseTests.CreateRecord(app, "alerts", map[string]any{
						"name":   "Memory",
						"system": systemId,
						"user":   user1.Id,
						"value":  90,
						"min":    10,
					})
					assert.NoError(t, err, "should create alert")
				}
				alerts, _ := app.CountRecords("alerts")
				assert.EqualValues(t, 2, alerts, "should have 2 alerts")
			},
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				alerts, _ := app.CountRecords("alerts")
				assert.Zero(t, alerts, "should have 0 alerts")
			},
		},
		{
			Name:   "User 2 should not be able to delete alert of user 1",
			Method: http.MethodDelete,
			URL:    "/api/pulse/user-alerts",
			Headers: map[string]string{
				"Authorization": user2Token,
			},
			ExpectedStatus:  200,
			ExpectedContent: []string{"\"count\":1", "\"success\":true"},
			TestAppFactory:  testAppFactory,
			Body: jsonReader(map[string]any{
				"name":    "CPU",
				"systems": []string{system2.Id},
			}),
			BeforeTestFunc: func(t testing.TB, app *pbTests.TestApp, e *core.ServeEvent) {
				pulseTests.ClearCollection(t, app, "alerts")
				for _, user := range []string{user1.Id, user2.Id} {
					pulseTests.CreateRecord(app, "alerts", map[string]any{
						"name":   "CPU",
						"system": system2.Id,
						"user":   user,
						"value":  80,
						"min":    10,
					})
				}
				alerts, _ := app.CountRecords("alerts")
				assert.EqualValues(t, 2, alerts, "should have 2 alerts")
				user1AlertCount, _ := app.CountRecords("alerts", dbx.HashExp{"user": user1.Id})
				assert.EqualValues(t, 1, user1AlertCount, "should have 1 alert")
				user2AlertCount, _ := app.CountRecords("alerts", dbx.HashExp{"user": user2.Id})
				assert.EqualValues(t, 1, user2AlertCount, "should have 1 alert")
			},
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				user1AlertCount, _ := app.CountRecords("alerts", dbx.HashExp{"user": user1.Id})
				assert.EqualValues(t, 1, user1AlertCount, "should have 1 alert")
				user2AlertCount, _ := app.CountRecords("alerts", dbx.HashExp{"user": user2.Id})
				assert.Zero(t, user2AlertCount, "should have 0 alerts")
			},
		},
	}

	for _, scenario := range scenarios {
		scenario.Test(t)
	}
}

func TestGlobalAlertPoliciesApi(t *testing.T) {
	hub, _ := pulseTests.NewTestHub(t.TempDir())
	defer hub.Cleanup()

	hub.StartHub()

	user1, _ := pulseTests.CreateUser(hub, "global-alerts@example.com", "password")
	user1Token, _ := user1.NewAuthToken()

	user2, _ := pulseTests.CreateUser(hub, "global-alerts-2@example.com", "password")

	readonlyUser, _ := pulseTests.CreateUserWithRole(hub, "global-alerts-readonly@example.com", "password", "readonly")
	readonlyToken, _ := readonlyUser.NewAuthToken()

	system1, _ := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":  "policy-system-1",
		"users": []string{user1.Id},
	})
	system2, _ := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":  "policy-system-2",
		"users": []string{user1.Id},
	})
	systemOther, _ := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":  "policy-system-other",
		"users": []string{user2.Id},
	})
	asset1, _ := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user": user1.Id,
		"name": "Gaming PC",
		"type": "physical_host",
	})
	asset2, _ := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user": user1.Id,
		"name": "NAS Box",
		"type": "nas",
	})
	assetOther, _ := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user": user2.Id,
		"name": "Other Asset",
		"type": "server",
	})
	system1.Set("asset", asset1.Id)
	system2.Set("asset", asset2.Id)
	systemOther.Set("asset", assetOther.Id)
	assert.NoError(t, hub.Save(system1))
	assert.NoError(t, hub.Save(system2))
	assert.NoError(t, hub.Save(systemOther))

	testAppFactory := func(t testing.TB) *pbTests.TestApp {
		return hub.TestApp
	}

	scenarios := []pulseTests.ApiScenario{
		{
			Name:            "GET policies no auth",
			Method:          http.MethodGet,
			URL:             "/api/pulse/alert-policies",
			ExpectedStatus:  401,
			ExpectedContent: []string{"requires valid"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "POST policy readonly blocked",
			Method: http.MethodPost,
			URL:    "/api/pulse/alert-policies",
			Headers: map[string]string{
				"Authorization": readonlyToken,
			},
			Body: jsonReader(map[string]any{
				"name":  "CPU",
				"value": 80,
				"min":   10,
			}),
			ExpectedStatus:  403,
			ExpectedContent: []string{"not allowed"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "POST policy creates policy and applies to user systems",
			Method: http.MethodPost,
			URL:    "/api/pulse/alert-policies",
			Headers: map[string]string{
				"Authorization": user1Token,
			},
			Body: jsonReader(map[string]any{
				"name":  "CPU",
				"value": 72,
				"min":   8,
			}),
			ExpectedStatus:  200,
			ExpectedContent: []string{"\"success\":true", "\"applied\":2"},
			TestAppFactory:  testAppFactory,
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				policies, _ := app.CountRecords("alert_policies", dbx.HashExp{"user": user1.Id, "name": "CPU"})
				assert.EqualValues(t, 1, policies)
				alerts, _ := app.CountRecords("alerts", dbx.HashExp{"user": user1.Id, "name": "CPU"})
				assert.EqualValues(t, 2, alerts)
				system1Alert, err := app.FindFirstRecordByFilter("alerts", "system = {:system} && user = {:user} && name = 'CPU'", dbx.Params{"system": system1.Id, "user": user1.Id})
				assert.NoError(t, err)
				assert.Equal(t, asset1.Id, system1Alert.GetString("asset"))
				system2Alert, err := app.FindFirstRecordByFilter("alerts", "system = {:system} && user = {:user} && name = 'CPU'", dbx.Params{"system": system2.Id, "user": user1.Id})
				assert.NoError(t, err)
				assert.Equal(t, asset2.Id, system2Alert.GetString("asset"))
				otherAlerts, _ := app.CountRecords("alerts", dbx.HashExp{"system": systemOther.Id, "name": "CPU"})
				assert.Zero(t, otherAlerts)
			},
		},
		{
			Name:   "GET policies returns user policies only",
			Method: http.MethodGet,
			URL:    "/api/pulse/alert-policies",
			Headers: map[string]string{
				"Authorization": user1Token,
			},
			ExpectedStatus: 200,
			ExpectedContent: []string{
				"\"name\":\"CPU\"",
				"\"value\":72",
				"\"min\":8",
				"\"coverage_count\":2",
				"\"coverage_system_count\":2",
				"\"name\":\"Gaming PC\"",
				"\"name\":\"NAS Box\"",
			},
			NotExpectedContent: []string{user2.Id, "Other Asset"},
			TestAppFactory:     testAppFactory,
		},
		{
			Name:   "POST policy overwrites existing per-system alerts",
			Method: http.MethodPost,
			URL:    "/api/pulse/alert-policies",
			Headers: map[string]string{
				"Authorization": user1Token,
			},
			Body: jsonReader(map[string]any{
				"name":  "CPU",
				"value": 88,
				"min":   12,
			}),
			ExpectedStatus:  200,
			ExpectedContent: []string{"\"success\":true", "\"applied\":2"},
			TestAppFactory:  testAppFactory,
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				alert, err := app.FindFirstRecordByFilter("alerts", "system = {:system} && name = 'CPU'", dbx.Params{"system": system1.Id})
				assert.NoError(t, err)
				assert.EqualValues(t, 88, alert.Get("value"))
				assert.EqualValues(t, 12, alert.Get("min"))
				assert.Equal(t, asset1.Id, alert.GetString("asset"))
			},
		},
		{
			Name:   "DELETE policy removes policy and matching per-system alerts",
			Method: http.MethodDelete,
			URL:    "/api/pulse/alert-policies",
			Headers: map[string]string{
				"Authorization": user1Token,
			},
			Body: jsonReader(map[string]any{
				"name": "CPU",
			}),
			ExpectedStatus:  200,
			ExpectedContent: []string{"\"success\":true", "\"count\":2"},
			TestAppFactory:  testAppFactory,
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				policies, _ := app.CountRecords("alert_policies", dbx.HashExp{"user": user1.Id, "name": "CPU"})
				assert.Zero(t, policies)
				alerts, _ := app.CountRecords("alerts", dbx.HashExp{"user": user1.Id, "name": "CPU"})
				assert.Zero(t, alerts)
			},
		},
	}

	for _, scenario := range scenarios {
		scenario.Test(t)
	}

	_, err := pulseTests.CreateRecord(hub, "alert_policies", map[string]any{
		"user":  user1.Id,
		"name":  "Memory",
		"value": 91,
		"min":   7,
	})
	assert.NoError(t, err)
	system3, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":  "policy-system-3",
		"users": []string{user1.Id},
	})
	assert.NoError(t, err)
	inherited, err := hub.FindFirstRecordByFilter("alerts", "system = {:system} && user = {:user} && name = 'Memory'", dbx.Params{"system": system3.Id, "user": user1.Id})
	if assert.NoError(t, err) {
		assert.EqualValues(t, 91, inherited.Get("value"))
		assert.EqualValues(t, 7, inherited.Get("min"))
	}

	_, err = pulseTests.CreateRecord(hub, "alert_policies", map[string]any{
		"user":  user2.Id,
		"name":  "GPU",
		"value": 66,
		"min":   4,
	})
	assert.NoError(t, err)
	_, err = pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":  "policy-system-4",
		"users": []string{user1.Id},
	})
	assert.NoError(t, err)
	user1GpuAlerts, _ := hub.CountRecords("alerts", dbx.HashExp{"user": user1.Id, "name": "GPU"})
	assert.Zero(t, user1GpuAlerts)
}

func TestAlertHistoryActionsApi(t *testing.T) {
	hub, _ := pulseTests.NewTestHub(t.TempDir())
	defer hub.Cleanup()

	hub.StartHub()

	user1, _ := pulseTests.CreateUser(hub, "alert-history-user1@example.com", "password")
	user1Token, _ := user1.NewAuthToken()
	user2, _ := pulseTests.CreateUser(hub, "alert-history-user2@example.com", "password")
	user2Token, _ := user2.NewAuthToken()
	readonlyUser, _ := pulseTests.CreateUserWithRole(hub, "alert-history-readonly@example.com", "password", "readonly")
	readonlyToken, _ := readonlyUser.NewAuthToken()

	system1, _ := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":  "alert-history-system",
		"users": []string{user1.Id},
	})
	alertHistory, _ := pulseTests.CreateRecord(hub, "alerts_history", map[string]any{
		"alert_id": "container:api",
		"user":     user1.Id,
		"system":   system1.Id,
		"name":     "容器：api",
		"value":    1,
	})

	testAppFactory := func(t testing.TB) *pbTests.TestApp {
		return hub.TestApp
	}

	scenarios := []pulseTests.ApiScenario{
		{
			Name:            "acknowledge no auth",
			Method:          http.MethodPost,
			URL:             "/api/pulse/alerts-history/" + alertHistory.Id + "/acknowledge",
			ExpectedStatus:  401,
			ExpectedContent: []string{"requires valid"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "acknowledge readonly blocked",
			Method: http.MethodPost,
			URL:    "/api/pulse/alerts-history/" + alertHistory.Id + "/acknowledge",
			Headers: map[string]string{
				"Authorization": readonlyToken,
			},
			ExpectedStatus:  403,
			ExpectedContent: []string{"not allowed"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "acknowledge other user not found",
			Method: http.MethodPost,
			URL:    "/api/pulse/alerts-history/" + alertHistory.Id + "/acknowledge",
			Headers: map[string]string{
				"Authorization": user2Token,
			},
			ExpectedStatus:  404,
			ExpectedContent: []string{"not found"},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:   "acknowledge own alert history",
			Method: http.MethodPost,
			URL:    "/api/pulse/alerts-history/" + alertHistory.Id + "/acknowledge",
			Headers: map[string]string{
				"Authorization": user1Token,
			},
			ExpectedStatus:  200,
			ExpectedContent: []string{"\"success\":true", "\"acknowledged_by\":\"" + user1.Id + "\""},
			TestAppFactory:  testAppFactory,
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				record, err := app.FindRecordById("alerts_history", alertHistory.Id)
				assert.NoError(t, err)
				assert.False(t, record.GetDateTime("acknowledged_at").IsZero())
				assert.Equal(t, user1.Id, record.GetString("acknowledged_by"))
			},
		},
		{
			Name:   "silence own alert history",
			Method: http.MethodPost,
			URL:    "/api/pulse/alerts-history/" + alertHistory.Id + "/silence",
			Headers: map[string]string{
				"Authorization": user1Token,
			},
			Body: jsonReader(map[string]any{
				"duration_minutes": 240,
				"reason":           "正在维护",
			}),
			ExpectedStatus:  200,
			ExpectedContent: []string{"\"success\":true", "\"silenced_by\":\"" + user1.Id + "\"", "\"silence_reason\":\"正在维护\""},
			TestAppFactory:  testAppFactory,
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				record, err := app.FindRecordById("alerts_history", alertHistory.Id)
				assert.NoError(t, err)
				assert.True(t, record.GetDateTime("silenced_until").Time().After(time.Now().UTC()))
				assert.Equal(t, user1.Id, record.GetString("silenced_by"))
			},
		},
		{
			Name:   "unsilence own alert history",
			Method: http.MethodPost,
			URL:    "/api/pulse/alerts-history/" + alertHistory.Id + "/unsilence",
			Headers: map[string]string{
				"Authorization": user1Token,
			},
			ExpectedStatus:  200,
			ExpectedContent: []string{"\"success\":true", "\"silence_reason\":\"\""},
			TestAppFactory:  testAppFactory,
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				record, err := app.FindRecordById("alerts_history", alertHistory.Id)
				assert.NoError(t, err)
				assert.True(t, record.GetDateTime("silenced_until").IsZero())
				assert.Empty(t, record.GetString("silenced_by"))
			},
		},
	}

	for _, scenario := range scenarios {
		scenario.Test(t)
	}
}

func TestSendTestNotification(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	userToken, err := user.NewAuthToken()

	readonlyUser, err := pulseTests.CreateUserWithRole(hub, "readonly@example.com", "password123", "readonly")
	assert.NoError(t, err, "Failed to create readonly user")
	readonlyUserToken, err := readonlyUser.NewAuthToken()
	assert.NoError(t, err, "Failed to create readonly user auth token")

	adminUser, err := pulseTests.CreateUserWithRole(hub, "admin@example.com", "password123", "admin")
	assert.NoError(t, err, "Failed to create admin user")
	adminUserToken, err := adminUser.NewAuthToken()

	superuser, err := pulseTests.CreateSuperuser(hub, "superuser@example.com", "password123")
	assert.NoError(t, err, "Failed to create superuser")
	superuserToken, err := superuser.NewAuthToken()
	assert.NoError(t, err, "Failed to create superuser auth token")

	restoreSender := alerts.SetShoutrrrSenderForTest(func(string, string) error {
		return nil
	})
	defer restoreSender()

	testAppFactory := func(t testing.TB) *pbTests.TestApp {
		return hub.TestApp
	}

	scenarios := []pulseTests.ApiScenario{
		{
			Name:            "POST /test-notification - no auth should fail",
			Method:          http.MethodPost,
			URL:             "/api/pulse/test-notification",
			ExpectedStatus:  401,
			ExpectedContent: []string{"requires valid"},
			TestAppFactory:  testAppFactory,
			Body: jsonReader(map[string]any{
				"url": "generic://127.0.0.1",
			}),
		},
		{
			Name:           "POST /test-notification - with external auth should succeed",
			Method:         http.MethodPost,
			URL:            "/api/pulse/test-notification",
			TestAppFactory: testAppFactory,
			Headers: map[string]string{
				"Authorization": userToken,
			},
			Body: jsonReader(map[string]any{
				"url": "generic://8.8.8.8",
			}),
			ExpectedStatus:  200,
			ExpectedContent: []string{"\"err\":false"},
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				health, err := app.FindFirstRecordByFilter(
					"notification_channel_health",
					"user={:user} && target={:target}",
					dbx.Params{"user": user.Id, "target": "generic://8.8.8.8"},
				)
				assert.NoError(t, err)
				if assert.NotNil(t, health) {
					assert.Equal(t, "healthy", health.GetString("status"))
					assert.Equal(t, 1, health.GetInt("success_count"))
					assert.False(t, health.GetDateTime("last_success_at").IsZero())
					assert.False(t, health.GetDateTime("last_test_at").IsZero())
				}
				audit, err := app.FindFirstRecordByFilter(
					"operation_audit",
					"user={:user} && action='test_notification' && target='generic://8.8.8.8'",
					dbx.Params{"user": user.Id},
				)
				assert.NoError(t, err)
				if assert.NotNil(t, audit) {
					assert.Equal(t, "success", audit.GetString("result"))
				}
			},
		},
		{
			Name:           "POST /test-notification - readonly auth should fail",
			Method:         http.MethodPost,
			URL:            "/api/pulse/test-notification",
			TestAppFactory: testAppFactory,
			Headers: map[string]string{
				"Authorization": readonlyUserToken,
			},
			Body: jsonReader(map[string]any{
				"url": "generic://8.8.8.8",
			}),
			ExpectedStatus:  403,
			ExpectedContent: []string{"The authorized record is not allowed to perform this action."},
		},
		{
			Name:           "POST /test-notification - local url with user auth should fail",
			Method:         http.MethodPost,
			URL:            "/api/pulse/test-notification",
			TestAppFactory: testAppFactory,
			Headers: map[string]string{
				"Authorization": userToken,
			},
			Body: jsonReader(map[string]any{
				"url": "generic://localhost:8010",
			}),
			ExpectedStatus:  403,
			ExpectedContent: []string{"Only admins"},
		},
		{
			Name:           "POST /test-notification - internal url with user auth should fail",
			Method:         http.MethodPost,
			URL:            "/api/pulse/test-notification",
			TestAppFactory: testAppFactory,
			Headers: map[string]string{
				"Authorization": userToken,
			},
			Body: jsonReader(map[string]any{
				"url": "generic+http://192.168.0.5",
			}),
			ExpectedStatus:  403,
			ExpectedContent: []string{"Only admins"},
		},
		{
			Name:           "POST /test-notification - internal url with admin auth should succeed",
			Method:         http.MethodPost,
			URL:            "/api/pulse/test-notification",
			TestAppFactory: testAppFactory,
			Headers: map[string]string{
				"Authorization": adminUserToken,
			},
			Body: jsonReader(map[string]any{
				"url": "generic://127.0.0.1",
			}),
			ExpectedStatus:  200,
			ExpectedContent: []string{"\"err\":false"},
		},
		{
			Name:           "POST /test-notification - internal url with superuser auth should succeed",
			Method:         http.MethodPost,
			URL:            "/api/pulse/test-notification",
			TestAppFactory: testAppFactory,
			Headers: map[string]string{
				"Authorization": superuserToken,
			},
			Body: jsonReader(map[string]any{
				"url": "generic://127.0.0.1",
			}),
			ExpectedStatus:  200,
			ExpectedContent: []string{"\"err\":false"},
		},
	}

	for _, scenario := range scenarios {
		scenario.Test(t)
	}
}
