package hub_test

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	pbTests "github.com/pocketbase/pocketbase/tests"
	"github.com/stretchr/testify/require"
	pulseTests "gutenacht.site/pulse/internal/tests"
)

func TestDeleteSystemRelatedDataRemovesWebsiteMonitors(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()
	userToken, err := user.NewAuthToken()
	require.NoError(t, err)

	system, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":  "website-host",
		"users": []string{user.Id},
	})
	require.NoError(t, err)

	monitor, err := pulseTests.CreateRecord(hub, "website_monitors", map[string]any{
		"user":             user.Id,
		"system":           system.Id,
		"name":             "MoviePilot",
		"url":              "http://127.0.0.1:3000",
		"interval_seconds": 300,
		"timeout_seconds":  10,
		"enabled":          true,
	})
	require.NoError(t, err)

	_, err = pulseTests.CreateRecord(hub, "website_monitor_checks", map[string]any{
		"user":    user.Id,
		"monitor": monitor.Id,
		"status":  "up",
	})
	require.NoError(t, err)

	scenario := pulseTests.ApiScenario{
		Name:   "DELETE /systems removes subordinate website monitors",
		Method: http.MethodDelete,
		URL:    fmt.Sprintf("/api/pulse/systems/%s", system.Id),
		Headers: map[string]string{
			"Authorization": userToken,
		},
		ExpectedStatus:  200,
		ExpectedContent: []string{`"status":"deleted"`},
		TestAppFactory: func(t testing.TB) *pbTests.TestApp {
			return hub.TestApp
		},
		AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, _ *http.Response) {
			remainingMonitors, err := app.FindRecordsByFilter("website_monitors", "system = {:system}", "", -1, 0, map[string]any{
				"system": system.Id,
			})
			require.NoError(t, err)
			require.Empty(t, remainingMonitors)

			remainingChecks, err := app.FindRecordsByFilter("website_monitor_checks", "monitor = {:monitor}", "", -1, 0, map[string]any{
				"monitor": monitor.Id,
			})
			require.NoError(t, err)
			require.Empty(t, remainingChecks)

			_, err = app.FindRecordById("systems", system.Id)
			require.Error(t, err)
		},
	}
	scenario.Test(t)
}

func TestDeleteSystemRejectsLocalSystem(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()
	userToken, err := user.NewAuthToken()
	require.NoError(t, err)

	system, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":     "hub-hostname",
		"users":    []string{user.Id},
		"is_local": true,
	})
	require.NoError(t, err)

	scenario := pulseTests.ApiScenario{
		Name:   "DELETE /systems rejects local system",
		Method: http.MethodDelete,
		URL:    fmt.Sprintf("/api/pulse/systems/%s", system.Id),
		Headers: map[string]string{
			"Authorization": userToken,
		},
		ExpectedStatus:  400,
		ExpectedContent: []string{"Hub 机器记录不能删除"},
		TestAppFactory: func(t testing.TB) *pbTests.TestApp {
			return hub.TestApp
		},
		AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, _ *http.Response) {
			record, err := app.FindRecordById("systems", system.Id)
			require.NoError(t, err)
			require.True(t, record.GetBool("is_local"))
		},
	}
	scenario.Test(t)
}

func TestCollectionUpdateRejectsProtectedSystemIdentityFields(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()
	userToken, err := user.NewAuthToken()
	require.NoError(t, err)

	system, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":     "remote-hostname",
		"users":    []string{user.Id},
		"is_local": false,
	})
	require.NoError(t, err)

	scenarios := []struct {
		name     string
		body     string
		expected string
	}{
		{
			name:     "reject is_local update",
			body:     `{"is_local":true}`,
			expected: "Hub 标签只能由 Hub 自动维护",
		},
		{
			name:     "reject real hostname update",
			body:     `{"name":"fake-hostname"}`,
			expected: "机器真实主机名只能由 Agent 自动维护",
		},
	}
	for _, tc := range scenarios {
		t.Run(tc.name, func(t *testing.T) {
			scenario := pulseTests.ApiScenario{
				Name:   tc.name,
				Method: http.MethodPatch,
				URL:    fmt.Sprintf("/api/collections/systems/records/%s", system.Id),
				Body:   strings.NewReader(tc.body),
				Headers: map[string]string{
					"Authorization": userToken,
					"Content-Type":  "application/json",
				},
				ExpectedStatus:  400,
				ExpectedContent: []string{tc.expected},
				TestAppFactory: func(t testing.TB) *pbTests.TestApp {
					return hub.TestApp
				},
				AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, _ *http.Response) {
					record, err := app.FindRecordById("systems", system.Id)
					require.NoError(t, err)
					require.Equal(t, "remote-hostname", record.GetString("name"))
					require.False(t, record.GetBool("is_local"))
				},
			}
			scenario.Test(t)
		})
	}
}

func TestCollectionUpdateAllowsHomeVisibilityForLocalSystem(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()
	userToken, err := user.NewAuthToken()
	require.NoError(t, err)

	system, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":           "hub-hostname",
		"users":          []string{user.Id},
		"is_local":       true,
		"hide_from_home": false,
	})
	require.NoError(t, err)

	scenario := pulseTests.ApiScenario{
		Name:   "collections PATCH allows hiding Hub host from home",
		Method: http.MethodPatch,
		URL:    fmt.Sprintf("/api/collections/systems/records/%s", system.Id),
		Body:   strings.NewReader(`{"hide_from_home":true}`),
		Headers: map[string]string{
			"Authorization": userToken,
			"Content-Type":  "application/json",
		},
		ExpectedStatus:  200,
		ExpectedContent: []string{`"hide_from_home":true`},
		TestAppFactory: func(t testing.TB) *pbTests.TestApp {
			return hub.TestApp
		},
		AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, _ *http.Response) {
			record, err := app.FindRecordById("systems", system.Id)
			require.NoError(t, err)
			require.True(t, record.GetBool("is_local"))
			require.True(t, record.GetBool("hide_from_home"))
			require.Equal(t, "hub-hostname", record.GetString("name"))
		},
	}
	scenario.Test(t)
}

func TestCollectionDeleteRejectsLocalSystem(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()
	userToken, err := user.NewAuthToken()
	require.NoError(t, err)

	system, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":     "hub-hostname",
		"users":    []string{user.Id},
		"is_local": true,
	})
	require.NoError(t, err)

	scenario := pulseTests.ApiScenario{
		Name:   "collections DELETE rejects local system",
		Method: http.MethodDelete,
		URL:    fmt.Sprintf("/api/collections/systems/records/%s", system.Id),
		Headers: map[string]string{
			"Authorization": userToken,
		},
		ExpectedStatus:  400,
		ExpectedContent: []string{"Hub 机器记录不能删除"},
		TestAppFactory: func(t testing.TB) *pbTests.TestApp {
			return hub.TestApp
		},
		AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, _ *http.Response) {
			record, err := app.FindRecordById("systems", system.Id)
			require.NoError(t, err)
			require.True(t, record.GetBool("is_local"))
		},
	}
	scenario.Test(t)
}
