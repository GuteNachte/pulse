//go:build testing

package alerts_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gutenacht.site/pulse/internal/alerts"
	pulseTests "gutenacht.site/pulse/internal/tests"
)

func TestNotificationFailureRecordedAndCleared(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	webhookURL := "generic+https://token@example.com/webhook"
	setUserWebhook(t, hub, user.Id, webhookURL)

	system, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":  "test-system",
		"users": []string{user.Id},
		"host":  "127.0.0.1",
	})
	require.NoError(t, err)
	_, err = hub.FindCollectionByNameOrId("notification_failures")
	require.NoError(t, err)

	sendAttempts := 0
	restoreSender := alerts.SetShoutrrrSenderForTest(func(notificationURL string, _ string) error {
		sendAttempts++
		return fmt.Errorf("network timeout while sending to %s", notificationURL)
	})
	err = hub.GetAlertManager().SendAlert(alerts.AlertMessageData{
		UserID:   user.Id,
		SystemID: system.Id,
		Title:    "Connection to test-system is down",
		Message:  "Connection to test-system is down",
		Link:     "http://localhost/system/" + system.Id,
		LinkText: "View test-system",
	})
	require.Error(t, err)
	restoreSender()
	require.Equal(t, 1, sendAttempts, "test sender should have been called once")

	failures, err := hub.FindAllRecords("notification_failures")
	require.NoError(t, err)
	require.Len(t, failures, 1)
	assert.Equal(t, system.Id, failures[0].GetString("system"))
	assert.Equal(t, "Connection to test-system is down", failures[0].GetString("title"))
	assert.Equal(t, "generic+https://example.com", failures[0].GetString("target"))
	assert.Contains(t, failures[0].GetString("error"), "network timeout")
	assert.NotContains(t, failures[0].GetString("error"), "token@example.com")
	assert.Equal(t, 1, failures[0].GetInt("count"))

	health, err := hub.FindAllRecords("notification_channel_health")
	require.NoError(t, err)
	require.Len(t, health, 1)
	assert.Equal(t, "failed", health[0].GetString("status"))
	assert.Equal(t, "generic+https://example.com", health[0].GetString("target"))
	assert.Equal(t, 0, health[0].GetInt("success_count"))
	assert.Equal(t, 1, health[0].GetInt("failure_count"))
	assert.Contains(t, health[0].GetString("last_error"), "network timeout")
	assert.NotContains(t, health[0].GetString("last_error"), "token@example.com")
	assert.False(t, health[0].GetDateTime("last_failure_at").IsZero())

	restoreSender = alerts.SetShoutrrrSenderForTest(func(string, string) error {
		return nil
	})
	require.NoError(t, hub.GetAlertManager().SendAlert(alerts.AlertMessageData{
		UserID:   user.Id,
		SystemID: system.Id,
		Title:    "Connection to test-system is up",
		Message:  "Connection to test-system is up",
		Link:     "http://localhost/system/" + system.Id,
		LinkText: "View test-system",
	}))
	restoreSender()

	count, err := hub.CountRecords("notification_failures", dbx.HashExp{"user": user.Id})
	require.NoError(t, err)
	assert.EqualValues(t, 0, count)

	health, err = hub.FindAllRecords("notification_channel_health")
	require.NoError(t, err)
	require.Len(t, health, 1)
	assert.Equal(t, "healthy", health[0].GetString("status"))
	assert.Equal(t, 1, health[0].GetInt("success_count"))
	assert.Equal(t, 1, health[0].GetInt("failure_count"))
	assert.Empty(t, health[0].GetString("last_error"))
	assert.False(t, health[0].GetDateTime("last_success_at").IsZero())
}

func TestSilencedAlertNotificationIsSkipped(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	webhookURL := "generic+https://token@example.com/webhook"
	setUserWebhook(t, hub, user.Id, webhookURL)

	system, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":  "test-system",
		"users": []string{user.Id},
		"host":  "127.0.0.1",
	})
	require.NoError(t, err)

	_, err = pulseTests.CreateRecord(hub, "alerts_history", map[string]any{
		"alert_id":       "container:abc123",
		"user":           user.Id,
		"system":         system.Id,
		"name":           "容器：api",
		"value":          1,
		"silenced_until": time.Now().UTC().Add(time.Hour),
	})
	require.NoError(t, err)

	sendAttempts := 0
	restoreSender := alerts.SetShoutrrrSenderForTest(func(string, string) error {
		sendAttempts++
		return nil
	})
	defer restoreSender()

	require.NoError(t, hub.GetAlertManager().SendAlert(alerts.AlertMessageData{
		UserID:   user.Id,
		SystemID: system.Id,
		AlertID:  "container:abc123",
		Title:    "容器 api 异常",
		Message:  "test-system 上的容器状态异常。",
		Link:     "http://localhost/system/" + system.Id,
		LinkText: "查看机器",
	}))
	assert.Zero(t, sendAttempts, "silenced current alert should not send a duplicate notification")

	require.NoError(t, hub.GetAlertManager().SendAlert(alerts.AlertMessageData{
		UserID:   user.Id,
		SystemID: system.Id,
		AlertID:  "container:other",
		Title:    "容器 worker 异常",
		Message:  "test-system 上的容器状态异常。",
		Link:     "http://localhost/system/" + system.Id,
		LinkText: "查看机器",
	}))
	assert.Equal(t, 1, sendAttempts, "different alert id should still notify")
}

func TestAlertNotificationCooldownSuppressesDuplicateStorms(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	webhookURL := "generic+https://token@example.com/webhook"
	setUserWebhook(t, hub, user.Id, webhookURL)

	system, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":  "test-system",
		"users": []string{user.Id},
		"host":  "127.0.0.1",
	})
	require.NoError(t, err)

	sendAttempts := 0
	restoreSender := alerts.SetShoutrrrSenderForTest(func(string, string) error {
		sendAttempts++
		return nil
	})
	defer restoreSender()

	message := alerts.AlertMessageData{
		UserID:   user.Id,
		SystemID: system.Id,
		AlertID:  "container:test-api",
		Title:    "容器 api 异常",
		Message:  "test-system 上的容器状态异常。",
		Link:     "http://localhost/system/" + system.Id,
		LinkText: "查看机器",
	}
	require.NoError(t, hub.GetAlertManager().SendAlert(message))
	require.NoError(t, hub.GetAlertManager().SendAlert(message))
	assert.Equal(t, 1, sendAttempts, "duplicate alert should be suppressed during cooldown")

	states, err := hub.FindAllRecords("alert_notification_states")
	require.NoError(t, err)
	require.Len(t, states, 1)
	assert.Equal(t, "suppressed", states[0].GetString("status"))
	assert.Equal(t, 1, states[0].GetInt("suppressed_count"))

	message.Resolved = true
	message.Title = "容器 api 已恢复"
	require.NoError(t, hub.GetAlertManager().SendAlert(message))
	assert.Equal(t, 2, sendAttempts, "recovery notification should bypass alert cooldown")

	updatedState, err := hub.FindRecordById("alert_notification_states", states[0].Id)
	require.NoError(t, err)
	assert.Equal(t, "resolved", updatedState.GetString("status"))
	assert.False(t, updatedState.GetDateTime("last_resolved_at").IsZero())
}
