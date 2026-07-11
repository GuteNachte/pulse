package hub

import (
	"context"
	"crypto/tls"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	pbTests "github.com/pocketbase/pocketbase/tests"
	"github.com/stretchr/testify/require"
	_ "gutenacht.site/pulse/internal/migrations"
)

func TestWebsiteMonitorCheckIPVersionFallsBackToRequestedVersion(t *testing.T) {
	if got := websiteMonitorCheckIPVersion("IPv6", ""); got != "IPv6" {
		t.Fatalf("expected requested IPv6 to be preserved on failed dial, got %q", got)
	}
}

func TestWebsiteMonitorCheckIPVersionPrefersActualVersion(t *testing.T) {
	if got := websiteMonitorCheckIPVersion("IPv6", "IPv4"); got != "IPv4" {
		t.Fatalf("expected actual connected IP version to win, got %q", got)
	}
}

func TestWebsiteMonitorDueCheckRequiresOwningModule(t *testing.T) {
	app, err := pbTests.NewTestApp(t.TempDir())
	require.NoError(t, err)
	hub := NewHub(app)
	defer app.Cleanup()

	users, err := app.FindCachedCollectionByNameOrId("users")
	require.NoError(t, err)
	user := core.NewRecord(users)
	user.Set("email", "website-module-test@example.com")
	user.Set("password", "password123")
	require.NoError(t, app.Save(user))

	moduleSettings, err := app.FindCachedCollectionByNameOrId("module_settings")
	require.NoError(t, err)
	moduleSetting := core.NewRecord(moduleSettings)
	moduleSetting.Load(map[string]any{
		"user":      user.Id,
		"module_id": "website-monitoring",
		"enabled":   false,
	})
	require.NoError(t, app.Save(moduleSetting))

	monitors, err := app.FindCachedCollectionByNameOrId("website_monitors")
	require.NoError(t, err)
	monitor := core.NewRecord(monitors)
	monitor.Load(map[string]any{
		"user":             user.Id,
		"name":             "disabled-monitor",
		"url":              "https://example.com",
		"enabled":          true,
		"interval_seconds": 60,
		"timeout_seconds":  5,
	})
	require.NoError(t, app.Save(monitor))

	allowed, err := hub.websiteMonitorModuleEnabled(monitor)
	if err != nil {
		t.Fatal(err)
	}
	if allowed {
		t.Fatal("website monitor should be skipped when its owning module is disabled")
	}
}

func TestClassifyWebsiteMonitorFailure(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want string
	}{
		{name: "context deadline", err: context.DeadlineExceeded, want: "timeout"},
		{name: "dns", err: &net.DNSError{Err: "no such host", Name: "missing.example"}, want: "dns"},
		{name: "tls", err: tls.RecordHeaderError{Msg: "wrong version number"}, want: "tls"},
		{name: "tcp", err: &url.Error{Op: "Get", URL: "http://127.0.0.1", Err: &net.OpError{Op: "dial", Net: "tcp", Err: errString("connection refused")}}, want: "tcp"},
		{name: "network", err: errString("network is unreachable"), want: "network"},
		{name: "redirect", err: errString("stopped after 10 redirects: too many redirects"), want: "redirect"},
		{name: "unknown", err: errString("unexpected eof"), want: "unknown"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.want, classifyWebsiteMonitorFailure(tt.err))
		})
	}
}

func TestWebsiteMonitorExpectedContentCheck(t *testing.T) {
	app, err := pbTests.NewTestApp(t.TempDir())
	require.NoError(t, err)
	defer app.Cleanup()
	h := NewHub(app)

	user := createWebsiteMonitorTestRecord(t, app, "users", map[string]any{
		"email":    "website-content@example.com",
		"password": "password123",
	})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("Pulse dashboard is ready"))
	}))
	defer server.Close()

	monitor := createWebsiteMonitorTestRecord(t, app, "website_monitors", map[string]any{
		"user":             user.Id,
		"name":             "Content OK",
		"url":              server.URL,
		"expected_content": "Pulse dashboard",
		"interval_seconds": 300,
		"timeout_seconds":  10,
		"enabled":          true,
	})
	result, err := h.runWebsiteMonitorCheck(context.Background(), monitor)
	require.NoError(t, err)
	require.Equal(t, "up", result.Status)
	require.NotEmpty(t, result.Results)
	require.Equal(t, "up", result.Results[0].Status)

	monitor.Set("expected_content", "missing marker")
	result, err = h.runWebsiteMonitorCheck(context.Background(), monitor)
	require.NoError(t, err)
	require.Equal(t, "down", result.Status)
	require.NotEmpty(t, result.Results)
	require.Equal(t, "content", result.Results[0].FailureCategory)
}

func TestWebsiteMonitorAlertHistoryFollowsOwnedMonitorStatus(t *testing.T) {
	app, err := pbTests.NewTestApp(t.TempDir())
	require.NoError(t, err)
	defer app.Cleanup()
	h := NewHub(app)

	user := createWebsiteMonitorTestRecord(t, app, "users", map[string]any{
		"email":    "website-alert@example.com",
		"password": "password123",
	})
	systemRecord := createWebsiteMonitorTestRecord(t, app, "systems", map[string]any{
		"name":  "website-host",
		"users": []string{user.Id},
	})
	assetRecord := createWebsiteMonitorTestRecord(t, app, "assets", map[string]any{
		"user":   user.Id,
		"name":   "MoviePilot endpoint",
		"type":   "web_endpoint",
		"status": "active",
	})
	monitor := createWebsiteMonitorTestRecord(t, app, "website_monitors", map[string]any{
		"user":             user.Id,
		"system":           systemRecord.Id,
		"asset":            assetRecord.Id,
		"name":             "MoviePilot",
		"url":              "http://127.0.0.1:3000",
		"interval_seconds": 300,
		"timeout_seconds":  10,
		"enabled":          true,
	})

	err = h.updateWebsiteMonitorSummary(monitor, []websiteMonitorCheckResult{
		{Status: "down", Target: "internal-ipv4", Error: "请求超时", FailureCategory: "timeout"},
	}, time.Now().UTC().Format(time.RFC3339Nano))
	require.NoError(t, err)
	updatedMonitor, err := app.FindRecordById("website_monitors", monitor.Id)
	require.NoError(t, err)
	require.Equal(t, "timeout", updatedMonitor.GetString("last_failure_category"))

	historyRecord, err := app.FindFirstRecordByFilter(
		"alerts_history",
		"alert_id={:alert_id} && resolved=null",
		dbx.Params{"alert_id": websiteMonitorAlertID(monitor.Id)},
	)
	require.NoError(t, err)
	require.Equal(t, user.Id, historyRecord.GetString("user"))
	require.Equal(t, systemRecord.Id, historyRecord.GetString("system"))
	require.Equal(t, assetRecord.Id, historyRecord.GetString("asset"))
	require.Equal(t, "网站：MoviePilot", historyRecord.GetString("name"))
	require.Equal(t, float64(1), historyRecord.GetFloat("value"))

	err = h.updateWebsiteMonitorSummary(monitor, []websiteMonitorCheckResult{
		{Status: "down", Target: "internal-ipv4", Error: "仍然超时"},
	}, time.Now().UTC().Format(time.RFC3339Nano))
	require.NoError(t, err)
	count, err := app.CountRecords("alerts_history", dbx.HashExp{"alert_id": websiteMonitorAlertID(monitor.Id)})
	require.NoError(t, err)
	require.EqualValues(t, 1, count, "continuous down checks should not create duplicate active history records")

	err = h.updateWebsiteMonitorSummary(monitor, []websiteMonitorCheckResult{
		{Status: "up", Target: "internal-ipv4", StatusCode: 200},
	}, time.Now().UTC().Format(time.RFC3339Nano))
	require.NoError(t, err)

	resolvedRecord, err := app.FindRecordById("alerts_history", historyRecord.Id)
	require.NoError(t, err)
	require.NotEmpty(t, resolvedRecord.GetDateTime("resolved"))
}

func TestWebsiteMonitorAlertHistorySkipsUnownedMonitor(t *testing.T) {
	app, err := pbTests.NewTestApp(t.TempDir())
	require.NoError(t, err)
	defer app.Cleanup()
	h := NewHub(app)

	user := createWebsiteMonitorTestRecord(t, app, "users", map[string]any{
		"email":    "website-alert-unowned@example.com",
		"password": "password123",
	})
	monitor := createWebsiteMonitorTestRecord(t, app, "website_monitors", map[string]any{
		"user":             user.Id,
		"name":             "Global Site",
		"url":              "http://127.0.0.1:3000",
		"interval_seconds": 300,
		"timeout_seconds":  10,
		"enabled":          true,
	})

	err = h.updateWebsiteMonitorSummary(monitor, []websiteMonitorCheckResult{
		{Status: "down", Target: "internal-ipv4", Error: "请求超时"},
	}, time.Now().UTC().Format(time.RFC3339Nano))
	require.NoError(t, err)
	count, err := app.CountRecords("alerts_history", nil)
	require.NoError(t, err)
	require.Zero(t, count)
}

func TestWebsiteMonitorDeleteCleansChecksAndResolvesAlert(t *testing.T) {
	app, err := pbTests.NewTestApp(t.TempDir())
	require.NoError(t, err)
	defer app.Cleanup()
	h := NewHub(app)

	user := createWebsiteMonitorTestRecord(t, app, "users", map[string]any{
		"email":    "website-delete@example.com",
		"password": "password123",
	})
	systemRecord := createWebsiteMonitorTestRecord(t, app, "systems", map[string]any{
		"name":  "website-delete-host",
		"users": []string{user.Id},
	})
	monitor := createWebsiteMonitorTestRecord(t, app, "website_monitors", map[string]any{
		"user":             user.Id,
		"system":           systemRecord.Id,
		"name":             "Harbor",
		"url":              "http://127.0.0.1:3000",
		"interval_seconds": 300,
		"timeout_seconds":  10,
		"enabled":          true,
	})
	_ = createWebsiteMonitorTestRecord(t, app, "website_monitor_checks", map[string]any{
		"user":       user.Id,
		"monitor":    monitor.Id,
		"target":     "internal-ipv4",
		"url":        "http://127.0.0.1:3000",
		"status":     "down",
		"latency_ms": 10,
		"error":      "请求超时",
	})

	err = h.updateWebsiteMonitorSummary(monitor, []websiteMonitorCheckResult{
		{Status: "down", Target: "internal-ipv4", Error: "请求超时"},
	}, time.Now().UTC().Format(time.RFC3339Nano))
	require.NoError(t, err)
	historyRecord, err := app.FindFirstRecordByFilter(
		"alerts_history",
		"alert_id={:alert_id} && resolved=null",
		dbx.Params{"alert_id": websiteMonitorAlertID(monitor.Id)},
	)
	require.NoError(t, err)

	require.NoError(t, app.Delete(monitor))

	checkCount, err := app.CountRecords("website_monitor_checks", dbx.HashExp{"monitor": monitor.Id})
	require.NoError(t, err)
	require.Zero(t, checkCount)

	resolvedRecord, err := app.FindRecordById("alerts_history", historyRecord.Id)
	require.NoError(t, err)
	require.NotEmpty(t, resolvedRecord.GetDateTime("resolved"))
}

func createWebsiteMonitorTestRecord(t *testing.T, app core.App, collectionName string, fields map[string]any) *core.Record {
	t.Helper()

	collection, err := app.FindCachedCollectionByNameOrId(collectionName)
	require.NoError(t, err)
	record := core.NewRecord(collection)
	record.Load(fields)
	require.NoError(t, app.Save(record))
	return record
}

type errString string

func (e errString) Error() string {
	return string(e)
}
