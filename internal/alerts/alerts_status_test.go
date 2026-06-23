//go:build testing

package alerts_test

import (
	"testing"
	"testing/synctest"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gutenacht.site/pulse/internal/alerts"
	pulseTests "gutenacht.site/pulse/internal/tests"
)

func TestStatusAlerts(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		hub, user := pulseTests.GetHubWithUser(t)
		defer hub.Cleanup()
		webhooks := newWebhookRecorder(t)
		setUserWebhook(t, hub, user.Id, webhooks.URL("/status"))

		systems, err := pulseTests.CreateSystems(hub, 4, user.Id, "paused")
		assert.NoError(t, err)

		var alerts []*core.Record
		for i, system := range systems {
			alert, err := pulseTests.CreateRecord(hub, "alerts", map[string]any{
				"name":   "Status",
				"system": system.Id,
				"user":   user.Id,
				"min":    i + 1,
			})
			assert.NoError(t, err)
			alerts = append(alerts, alert)
		}

		time.Sleep(10 * time.Millisecond)

		for _, alert := range alerts {
			assert.False(t, alert.GetBool("triggered"), "Alert should not be triggered immediately")
		}
		assert.Zero(t, webhooks.Count(), "Expected 0 messages")
		for _, system := range systems {
			assert.EqualValues(t, "paused", system.GetString("status"), "System should be paused")
		}
		for _, system := range systems {
			system.Set("status", "up")
			err = hub.SaveNoValidate(system)
			assert.NoError(t, err)
		}
		time.Sleep(time.Second)
		assert.EqualValues(t, 0, hub.GetPendingAlertsCount(), "should have 0 alerts in the pendingAlerts map")
		for _, system := range systems {
			system.Set("status", "down")
			err = hub.SaveNoValidate(system)
			assert.NoError(t, err)
		}
		// after 30 seconds, should have 4 alerts in the pendingAlerts map, no triggered alerts
		time.Sleep(time.Second * 30)
		assert.EqualValues(t, 4, hub.GetPendingAlertsCount(), "should have 4 alerts in the pendingAlerts map")
		triggeredCount, err := hub.CountRecords("alerts", dbx.HashExp{"triggered": true})
		assert.NoError(t, err)
		assert.EqualValues(t, 0, triggeredCount, "should have 0 alert triggered")
		assert.EqualValues(t, 0, webhooks.Count(), "should have 0 messages sent")
		// after 1:30 seconds, should have 1 triggered alert and 3 pending alerts
		time.Sleep(time.Second * 60)
		assert.EqualValues(t, 3, hub.GetPendingAlertsCount(), "should have 3 alerts in the pendingAlerts map")
		triggeredCount, err = hub.CountRecords("alerts", dbx.HashExp{"triggered": true})
		assert.NoError(t, err)
		assert.EqualValues(t, 1, triggeredCount, "should have 1 alert triggered")
		assert.EqualValues(t, 1, webhooks.Count(), "should have 1 messages sent")
		// after 2:30 seconds, should have 2 triggered alerts and 2 pending alerts
		time.Sleep(time.Second * 60)
		assert.EqualValues(t, 2, hub.GetPendingAlertsCount(), "should have 2 alerts in the pendingAlerts map")
		triggeredCount, err = hub.CountRecords("alerts", dbx.HashExp{"triggered": true})
		assert.NoError(t, err)
		assert.EqualValues(t, 2, triggeredCount, "should have 2 alert triggered")
		assert.EqualValues(t, 2, webhooks.Count(), "should have 2 messages sent")
		// now we will bring the remaning systems back up
		for _, system := range systems {
			system.Set("status", "up")
			err = hub.SaveNoValidate(system)
			assert.NoError(t, err)
		}
		time.Sleep(time.Second)
		// should have 0 alerts in the pendingAlerts map and 0 alerts triggered
		assert.EqualValues(t, 0, hub.GetPendingAlertsCount(), "should have 0 alerts in the pendingAlerts map")
		triggeredCount, err = hub.CountRecords("alerts", dbx.HashExp{"triggered": true})
		assert.NoError(t, err)
		assert.Zero(t, triggeredCount, "should have 0 alert triggered")
		// 4 messages sent, 2 down alerts and 2 up alerts for first 2 systems
		assert.EqualValues(t, 4, webhooks.Count(), "should have 4 messages sent")
	})
}
func TestStatusAlertRecoveryBeforeDeadline(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()
	webhooks := newWebhookRecorder(t)
	setUserWebhook(t, hub, user.Id, webhooks.URL("/status-recovery-before-deadline"))

	initialWebhookCount := webhooks.Count()

	systemCollection, _ := hub.FindCollectionByNameOrId("systems")
	system := core.NewRecord(systemCollection)
	system.Set("name", "test-system")
	system.Set("status", "up")
	system.Set("host", "127.0.0.1")
	system.Set("users", []string{user.Id})
	hub.Save(system)

	alertCollection, _ := hub.FindCollectionByNameOrId("alerts")
	alert := core.NewRecord(alertCollection)
	alert.Set("user", user.Id)
	alert.Set("system", system.Id)
	alert.Set("name", "Status")
	alert.Set("triggered", false)
	alert.Set("min", 1)
	hub.Save(alert)

	am := hub.AlertManager

	// 1. System goes down
	am.HandleStatusAlerts("down", system)
	assert.Equal(t, 1, am.GetPendingAlertsCount(), "Alert should be scheduled")

	// 2. System goes up BEFORE delay expires
	// Triggering HandleStatusAlerts("up") SHOULD NOT send an alert.
	am.HandleStatusAlerts("up", system)

	assert.Equal(t, 0, am.GetPendingAlertsCount(), "Alert should be canceled if system recovers before delay expires")

	assert.Equal(t, initialWebhookCount, webhooks.Count(), "Recovery notification should not be sent if system never went down")

}

func TestStatusAlertNormalRecovery(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()
	webhooks := newWebhookRecorder(t)
	setUserWebhook(t, hub, user.Id, webhooks.URL("/status-normal-recovery"))

	systemCollection, _ := hub.FindCollectionByNameOrId("systems")
	system := core.NewRecord(systemCollection)
	system.Set("name", "test-system")
	system.Set("status", "up")
	system.Set("host", "127.0.0.1")
	system.Set("users", []string{user.Id})
	hub.Save(system)

	alertCollection, _ := hub.FindCollectionByNameOrId("alerts")
	alert := core.NewRecord(alertCollection)
	alert.Set("user", user.Id)
	alert.Set("system", system.Id)
	alert.Set("name", "Status")
	alert.Set("triggered", true) // System was confirmed DOWN
	hub.Save(alert)

	am := hub.AlertManager
	initialWebhookCount := webhooks.Count()

	// System goes up
	am.HandleStatusAlerts("up", system)

	assert.Equal(t, initialWebhookCount+1, webhooks.Count(), "Recovery notification should be sent if system was triggered as down")

}

func TestHandleStatusAlertsDoesNotSendRecoveryWhileDownIsOnlyPending(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()
	webhooks := newWebhookRecorder(t)
	setUserWebhook(t, hub, user.Id, webhooks.URL("/status-pending-recovery"))

	systemCollection, err := hub.FindCollectionByNameOrId("systems")
	require.NoError(t, err)
	system := core.NewRecord(systemCollection)
	system.Set("name", "test-system")
	system.Set("status", "up")
	system.Set("host", "127.0.0.1")
	system.Set("users", []string{user.Id})
	require.NoError(t, hub.Save(system))

	alertCollection, err := hub.FindCollectionByNameOrId("alerts")
	require.NoError(t, err)
	alert := core.NewRecord(alertCollection)
	alert.Set("user", user.Id)
	alert.Set("system", system.Id)
	alert.Set("name", "Status")
	alert.Set("triggered", false)
	alert.Set("min", 1)
	require.NoError(t, hub.Save(alert))

	initialWebhookCount := webhooks.Count()
	am := alerts.NewTestAlertManagerWithoutWorker(hub)

	require.NoError(t, am.HandleStatusAlerts("down", system))
	assert.Equal(t, 1, am.GetPendingAlertsCount(), "down transition should register a pending alert immediately")

	require.NoError(t, am.HandleStatusAlerts("up", system))
	assert.Zero(t, am.GetPendingAlertsCount(), "recovery should cancel the pending down alert")
	assert.Equal(t, initialWebhookCount, webhooks.Count(), "recovery notification should not be sent before a down alert triggers")

	alertRecord, err := hub.FindRecordById("alerts", alert.Id)
	require.NoError(t, err)
	assert.False(t, alertRecord.GetBool("triggered"), "alert should remain untriggered when downtime never matured")
}

func TestStatusAlertTimerCancellationPreventsBoundaryDelivery(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		hub, user := pulseTests.GetHubWithUser(t)
		defer hub.Cleanup()
		webhooks := newWebhookRecorder(t)
		setUserWebhook(t, hub, user.Id, webhooks.URL("/status-timer-cancel"))

		systemCollection, err := hub.FindCollectionByNameOrId("systems")
		require.NoError(t, err)
		system := core.NewRecord(systemCollection)
		system.Set("name", "test-system")
		system.Set("status", "up")
		system.Set("host", "127.0.0.1")
		system.Set("users", []string{user.Id})
		require.NoError(t, hub.Save(system))

		alertCollection, err := hub.FindCollectionByNameOrId("alerts")
		require.NoError(t, err)
		alert := core.NewRecord(alertCollection)
		alert.Set("user", user.Id)
		alert.Set("system", system.Id)
		alert.Set("name", "Status")
		alert.Set("triggered", false)
		alert.Set("min", 1)
		require.NoError(t, hub.Save(alert))

		initialWebhookCount := webhooks.Count()
		am := alerts.NewTestAlertManagerWithoutWorker(hub)

		require.NoError(t, am.HandleStatusAlerts("down", system))
		assert.Equal(t, 1, am.GetPendingAlertsCount(), "down transition should register a pending alert immediately")
		require.True(t, am.ResetPendingAlertTimer(alert.Id, 25*time.Millisecond), "test should shorten the pending alert timer")

		time.Sleep(10 * time.Millisecond)
		require.NoError(t, am.HandleStatusAlerts("up", system))
		assert.Zero(t, am.GetPendingAlertsCount(), "recovery should remove the pending alert before the timer callback runs")

		time.Sleep(40 * time.Millisecond)
		assert.Equal(t, initialWebhookCount, webhooks.Count(), "timer callback should not deliver after recovery cancels the pending alert")

		alertRecord, err := hub.FindRecordById("alerts", alert.Id)
		require.NoError(t, err)
		assert.False(t, alertRecord.GetBool("triggered"), "alert should remain untriggered when cancellation wins the timer race")

		time.Sleep(time.Minute)
		synctest.Wait()
	})
}

func TestStatusAlertDownFiresAfterDelayExpires(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()
	webhooks := newWebhookRecorder(t)
	setUserWebhook(t, hub, user.Id, webhooks.URL("/status-down-delay"))

	systemCollection, err := hub.FindCollectionByNameOrId("systems")
	require.NoError(t, err)
	system := core.NewRecord(systemCollection)
	system.Set("name", "test-system")
	system.Set("status", "up")
	system.Set("host", "127.0.0.1")
	system.Set("users", []string{user.Id})
	require.NoError(t, hub.Save(system))

	alertCollection, err := hub.FindCollectionByNameOrId("alerts")
	require.NoError(t, err)
	alert := core.NewRecord(alertCollection)
	alert.Set("user", user.Id)
	alert.Set("system", system.Id)
	alert.Set("name", "Status")
	alert.Set("triggered", false)
	alert.Set("min", 1)
	require.NoError(t, hub.Save(alert))

	initialWebhookCount := webhooks.Count()
	am := alerts.NewTestAlertManagerWithoutWorker(hub)

	require.NoError(t, am.HandleStatusAlerts("down", system))
	assert.Equal(t, 1, am.GetPendingAlertsCount(), "alert should be pending after system goes down")

	// Expire the pending alert and process it
	am.ForceExpirePendingAlerts()
	processed, err := am.ProcessPendingAlerts()
	require.NoError(t, err)
	assert.Len(t, processed, 1, "one alert should have been processed")
	assert.Equal(t, 0, am.GetPendingAlertsCount(), "pending alert should be consumed after processing")

	assert.Equal(t, initialWebhookCount+1, webhooks.Count(), "down notification should be sent after delay expires")

	// Verify triggered flag is set in the DB
	alertRecord, err := hub.FindRecordById("alerts", alert.Id)
	require.NoError(t, err)
	assert.True(t, alertRecord.GetBool("triggered"), "alert should be marked triggered after downtime matures")
}

func TestStatusAlertMultipleUsersRespectDifferentMinutes(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		hub, user1 := pulseTests.GetHubWithUser(t)
		defer hub.Cleanup()
		webhooks := newWebhookRecorder(t)
		setUserWebhook(t, hub, user1.Id, webhooks.URL("/status-user1"))

		user2, err := pulseTests.CreateUser(hub, "user2@example.com", "password")
		require.NoError(t, err)
		setUserWebhook(t, hub, user2.Id, webhooks.URL("/status-user2"))

		system, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
			"name":  "shared-system",
			"users": []string{user1.Id},
			"host":  "127.0.0.1",
		})
		require.NoError(t, err)
		system.Set("users+", user2.Id)
		system.Set("status", "up")
		require.NoError(t, hub.SaveNoValidate(system))

		alertUser1, err := pulseTests.CreateRecord(hub, "alerts", map[string]any{
			"name":   "Status",
			"system": system.Id,
			"user":   user1.Id,
			"min":    1,
		})
		require.NoError(t, err)
		alertUser2, err := pulseTests.CreateRecord(hub, "alerts", map[string]any{
			"name":   "Status",
			"system": system.Id,
			"user":   user2.Id,
			"min":    2,
		})
		require.NoError(t, err)

		time.Sleep(10 * time.Millisecond)

		system.Set("status", "down")
		require.NoError(t, hub.SaveNoValidate(system))

		assert.Equal(t, 2, hub.GetPendingAlertsCount(), "both user alerts should be pending after the system goes down")

		time.Sleep(59 * time.Second)
		synctest.Wait()
		assert.Zero(t, webhooks.Count(), "no messages should be sent before the earliest alert minute elapses")

		time.Sleep(2 * time.Second)
		synctest.Wait()

		require.Equal(t, 1, webhooks.CountPath("/status-user1"), "only the first user's alert should send after one minute")
		assert.Equal(t, 0, webhooks.CountPath("/status-user2"), "the later user's alert should still be waiting")
		assert.Equal(t, 1, hub.GetPendingAlertsCount(), "the later user alert should still be pending")

		time.Sleep(58 * time.Second)
		synctest.Wait()
		assert.Equal(t, 1, webhooks.Count(), "the second user's alert should still be waiting before two minutes")

		time.Sleep(2 * time.Second)
		synctest.Wait()

		require.Equal(t, 2, webhooks.Count(), "both users should eventually receive their own status alert")
		assert.Equal(t, 1, webhooks.CountPath("/status-user2"), "the second user's alert should send after two minutes")
		assert.Zero(t, hub.GetPendingAlertsCount(), "all pending alerts should be consumed after both timers fire")

		alertUser1, err = hub.FindRecordById("alerts", alertUser1.Id)
		require.NoError(t, err)
		assert.True(t, alertUser1.GetBool("triggered"), "user1 alert should be marked triggered after delivery")

		alertUser2, err = hub.FindRecordById("alerts", alertUser2.Id)
		require.NoError(t, err)
		assert.True(t, alertUser2.GetBool("triggered"), "user2 alert should be marked triggered after delivery")
	})
}

func TestStatusAlertMultipleUsersRecoveryBetweenMinutesOnlyAlertsEarlierUser(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		hub, user1 := pulseTests.GetHubWithUser(t)
		defer hub.Cleanup()
		webhooks := newWebhookRecorder(t)
		setUserWebhook(t, hub, user1.Id, webhooks.URL("/status-recovery-user1"))

		user2, err := pulseTests.CreateUser(hub, "user2@example.com", "password")
		require.NoError(t, err)
		setUserWebhook(t, hub, user2.Id, webhooks.URL("/status-recovery-user2"))

		system, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
			"name":  "shared-system",
			"users": []string{user1.Id},
			"host":  "127.0.0.1",
		})
		require.NoError(t, err)
		system.Set("users+", user2.Id)
		system.Set("status", "up")
		require.NoError(t, hub.SaveNoValidate(system))

		alertUser1, err := pulseTests.CreateRecord(hub, "alerts", map[string]any{
			"name":   "Status",
			"system": system.Id,
			"user":   user1.Id,
			"min":    1,
		})
		require.NoError(t, err)
		alertUser2, err := pulseTests.CreateRecord(hub, "alerts", map[string]any{
			"name":   "Status",
			"system": system.Id,
			"user":   user2.Id,
			"min":    2,
		})
		require.NoError(t, err)

		time.Sleep(10 * time.Millisecond)

		system.Set("status", "down")
		require.NoError(t, hub.SaveNoValidate(system))

		time.Sleep(61 * time.Second)
		synctest.Wait()

		require.Equal(t, 1, webhooks.CountPath("/status-recovery-user1"), "the first user's down alert should send before recovery")
		assert.Equal(t, 0, webhooks.CountPath("/status-recovery-user2"), "the second user's alert should still be pending")
		assert.Equal(t, 1, hub.GetPendingAlertsCount(), "the second user's alert should still be pending")

		system.Set("status", "up")
		require.NoError(t, hub.SaveNoValidate(system))

		time.Sleep(time.Second)
		synctest.Wait()

		require.Equal(t, 2, webhooks.CountPath("/status-recovery-user1"), "recovery should notify only the user whose down alert had already triggered")
		assert.Equal(t, 0, webhooks.CountPath("/status-recovery-user2"), "user2 should not receive a recovery notification")
		assert.Zero(t, hub.GetPendingAlertsCount(), "recovery should cancel the later user's pending alert")

		time.Sleep(61 * time.Second)
		synctest.Wait()

		require.Equal(t, 2, webhooks.Count(), "user2 should never receive a down alert once recovery cancels the pending timer")

		alertUser1, err = hub.FindRecordById("alerts", alertUser1.Id)
		require.NoError(t, err)
		assert.False(t, alertUser1.GetBool("triggered"), "user1 alert should be cleared after recovery")

		alertUser2, err = hub.FindRecordById("alerts", alertUser2.Id)
		require.NoError(t, err)
		assert.False(t, alertUser2.GetBool("triggered"), "user2 alert should remain untriggered because it never fired")
	})
}

func TestStatusAlertDuplicateDownCallIsIdempotent(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	systemCollection, err := hub.FindCollectionByNameOrId("systems")
	require.NoError(t, err)
	system := core.NewRecord(systemCollection)
	system.Set("name", "test-system")
	system.Set("status", "up")
	system.Set("host", "127.0.0.1")
	system.Set("users", []string{user.Id})
	require.NoError(t, hub.Save(system))

	alertCollection, err := hub.FindCollectionByNameOrId("alerts")
	require.NoError(t, err)
	alert := core.NewRecord(alertCollection)
	alert.Set("user", user.Id)
	alert.Set("system", system.Id)
	alert.Set("name", "Status")
	alert.Set("triggered", false)
	alert.Set("min", 5)
	require.NoError(t, hub.Save(alert))

	am := alerts.NewTestAlertManagerWithoutWorker(hub)

	require.NoError(t, am.HandleStatusAlerts("down", system))
	require.NoError(t, am.HandleStatusAlerts("down", system))
	require.NoError(t, am.HandleStatusAlerts("down", system))

	assert.Equal(t, 1, am.GetPendingAlertsCount(), "repeated down calls should not schedule duplicate pending alerts")
}

func TestStatusAlertNoAlertRecord(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()
	webhooks := newWebhookRecorder(t)
	setUserWebhook(t, hub, user.Id, webhooks.URL("/status-no-alert"))

	systemCollection, err := hub.FindCollectionByNameOrId("systems")
	require.NoError(t, err)
	system := core.NewRecord(systemCollection)
	system.Set("name", "test-system")
	system.Set("status", "up")
	system.Set("host", "127.0.0.1")
	system.Set("users", []string{user.Id})
	require.NoError(t, hub.Save(system))

	// No Status alert record created for this system
	initialWebhookCount := webhooks.Count()
	am := alerts.NewTestAlertManagerWithoutWorker(hub)

	require.NoError(t, am.HandleStatusAlerts("down", system))
	assert.Equal(t, 0, am.GetPendingAlertsCount(), "no pending alert when no alert record exists")

	require.NoError(t, am.HandleStatusAlerts("up", system))
	assert.Equal(t, initialWebhookCount, webhooks.Count(), "no notification when no alert record exists")
}

func TestStatusAlertSuppressedBySystemSetting(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()
	webhooks := newWebhookRecorder(t)
	setUserWebhook(t, hub, user.Id, webhooks.URL("/status-offline-alerts-suppressed"))

	systems, err := pulseTests.CreateSystems(hub, 1, user.Id, "up")
	require.NoError(t, err)
	system := systems[0]
	system.Set("suppress_offline_alerts", true)
	require.NoError(t, hub.SaveNoValidate(system))

	alertCollection, err := hub.FindCollectionByNameOrId("alerts")
	require.NoError(t, err)
	alert := core.NewRecord(alertCollection)
	alert.Set("user", user.Id)
	alert.Set("system", system.Id)
	alert.Set("name", "Status")
	alert.Set("triggered", false)
	alert.Set("min", 1)
	require.NoError(t, hub.Save(alert))

	initialWebhookCount := webhooks.Count()
	am := alerts.NewTestAlertManagerWithoutWorker(hub)
	require.NoError(t, am.HandleStatusAlerts("down", system))

	assert.Equal(t, 0, am.GetPendingAlertsCount(), "offline alert suppressed systems should not schedule Status alerts")
	assert.Equal(t, initialWebhookCount, webhooks.Count(), "offline alert suppressed systems should not notify")
}

func TestRestorePendingStatusAlertsRequeuesDownSystemsAfterRestart(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()
	webhooks := newWebhookRecorder(t)
	setUserWebhook(t, hub, user.Id, webhooks.URL("/status-restore-pending"))

	systems, err := pulseTests.CreateSystems(hub, 1, user.Id, "down")
	require.NoError(t, err)
	system := systems[0]

	alertCollection, err := hub.FindCollectionByNameOrId("alerts")
	require.NoError(t, err)
	alert := core.NewRecord(alertCollection)
	alert.Set("user", user.Id)
	alert.Set("system", system.Id)
	alert.Set("name", "Status")
	alert.Set("triggered", false)
	alert.Set("min", 1)
	require.NoError(t, hub.Save(alert))

	initialWebhookCount := webhooks.Count()
	am := alerts.NewTestAlertManagerWithoutWorker(hub)

	require.NoError(t, am.RestorePendingStatusAlerts())
	assert.Equal(t, 1, am.GetPendingAlertsCount(), "startup restore should requeue a pending down alert for a system still marked down")

	am.ForceExpirePendingAlerts()
	processed, err := am.ProcessPendingAlerts()
	require.NoError(t, err)
	assert.Len(t, processed, 1, "restored pending alert should be processable after the delay expires")
	assert.Equal(t, initialWebhookCount+1, webhooks.Count(), "restored pending alert should send the down notification")

	alertRecord, err := hub.FindRecordById("alerts", alert.Id)
	require.NoError(t, err)
	assert.True(t, alertRecord.GetBool("triggered"), "restored pending alert should mark the alert as triggered once delivered")
}

func TestRestorePendingStatusAlertsSkipsNonDownOrAlreadyTriggeredAlerts(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	systemsDown, err := pulseTests.CreateSystems(hub, 2, user.Id, "down")
	require.NoError(t, err)
	systemDownPending := systemsDown[0]
	systemDownTriggered := systemsDown[1]

	systemUp, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":   "up-system",
		"users":  []string{user.Id},
		"host":   "127.0.0.2",
		"status": "up",
	})
	require.NoError(t, err)

	_, err = pulseTests.CreateRecord(hub, "alerts", map[string]any{
		"name":      "Status",
		"system":    systemDownPending.Id,
		"user":      user.Id,
		"min":       1,
		"triggered": false,
	})
	require.NoError(t, err)

	_, err = pulseTests.CreateRecord(hub, "alerts", map[string]any{
		"name":      "Status",
		"system":    systemUp.Id,
		"user":      user.Id,
		"min":       1,
		"triggered": false,
	})
	require.NoError(t, err)

	_, err = pulseTests.CreateRecord(hub, "alerts", map[string]any{
		"name":      "Status",
		"system":    systemDownTriggered.Id,
		"user":      user.Id,
		"min":       1,
		"triggered": true,
	})
	require.NoError(t, err)

	am := alerts.NewTestAlertManagerWithoutWorker(hub)
	require.NoError(t, am.RestorePendingStatusAlerts())
	assert.Equal(t, 1, am.GetPendingAlertsCount(), "only untriggered alerts for currently down systems should be restored")
}

func TestRestorePendingStatusAlertsIsIdempotent(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	systems, err := pulseTests.CreateSystems(hub, 1, user.Id, "down")
	require.NoError(t, err)
	system := systems[0]

	_, err = pulseTests.CreateRecord(hub, "alerts", map[string]any{
		"name":      "Status",
		"system":    system.Id,
		"user":      user.Id,
		"min":       1,
		"triggered": false,
	})
	require.NoError(t, err)

	am := alerts.NewTestAlertManagerWithoutWorker(hub)
	require.NoError(t, am.RestorePendingStatusAlerts())
	require.NoError(t, am.RestorePendingStatusAlerts())

	assert.Equal(t, 1, am.GetPendingAlertsCount(), "restoring twice should not create duplicate pending alerts")
	am.ForceExpirePendingAlerts()
	processed, err := am.ProcessPendingAlerts()
	require.NoError(t, err)
	assert.Len(t, processed, 1, "restored alert should still be processable exactly once")
	assert.Zero(t, am.GetPendingAlertsCount(), "processing the restored alert should empty the pending map")
}

func TestResolveStatusAlertsFixesStaleTriggered(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	// CreateSystems uses SaveNoValidate after initial save to bypass the
	// onRecordCreate hook that forces status = "pending".
	systems, err := pulseTests.CreateSystems(hub, 1, user.Id, "up")
	require.NoError(t, err)
	system := systems[0]

	alertCollection, err := hub.FindCollectionByNameOrId("alerts")
	require.NoError(t, err)
	alert := core.NewRecord(alertCollection)
	alert.Set("user", user.Id)
	alert.Set("system", system.Id)
	alert.Set("name", "Status")
	alert.Set("triggered", true) // Stale: system is up but alert still says triggered
	require.NoError(t, hub.Save(alert))

	// resolveStatusAlerts should clear the stale triggered flag
	require.NoError(t, alerts.ResolveStatusAlerts(hub))

	alertRecord, err := hub.FindRecordById("alerts", alert.Id)
	require.NoError(t, err)
	assert.False(t, alertRecord.GetBool("triggered"), "stale triggered flag should be cleared when system is up")
}
func TestResolveStatusAlerts(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	// Create a systemUp
	systemUp, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":   "test-system",
		"users":  []string{user.Id},
		"host":   "127.0.0.1",
		"status": "up",
	})
	assert.NoError(t, err)

	systemDown, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":   "test-system-2",
		"users":  []string{user.Id},
		"host":   "127.0.0.2",
		"status": "up",
	})
	assert.NoError(t, err)

	// Create a status alertUp for the system
	alertUp, err := pulseTests.CreateRecord(hub, "alerts", map[string]any{
		"name":   "Status",
		"system": systemUp.Id,
		"user":   user.Id,
		"min":    1,
	})
	assert.NoError(t, err)

	alertDown, err := pulseTests.CreateRecord(hub, "alerts", map[string]any{
		"name":   "Status",
		"system": systemDown.Id,
		"user":   user.Id,
		"min":    1,
	})
	assert.NoError(t, err)

	// Verify alert is not triggered initially
	assert.False(t, alertUp.GetBool("triggered"), "Alert should not be triggered initially")

	// Set the system to 'up' (this should not trigger the alert)
	systemUp.Set("status", "up")
	err = hub.SaveNoValidate(systemUp)
	assert.NoError(t, err)

	systemDown.Set("status", "down")
	err = hub.SaveNoValidate(systemDown)
	assert.NoError(t, err)

	// Wait a moment for any processing
	time.Sleep(10 * time.Millisecond)

	// Verify alertUp is still not triggered after setting system to up
	alertUp, err = hub.FindFirstRecordByFilter("alerts", "id={:id}", dbx.Params{"id": alertUp.Id})
	assert.NoError(t, err)
	assert.False(t, alertUp.GetBool("triggered"), "Alert should not be triggered when system is up")

	// Manually set both alerts triggered to true
	alertUp.Set("triggered", true)
	err = hub.SaveNoValidate(alertUp)
	assert.NoError(t, err)
	alertDown.Set("triggered", true)
	err = hub.SaveNoValidate(alertDown)
	assert.NoError(t, err)

	// Verify we have exactly one alert with triggered true
	triggeredCount, err := hub.CountRecords("alerts", dbx.HashExp{"triggered": true})
	assert.NoError(t, err)
	assert.EqualValues(t, 2, triggeredCount, "Should have exactly two alerts with triggered true")

	// Verify the specific alertUp is triggered
	alertUp, err = hub.FindFirstRecordByFilter("alerts", "id={:id}", dbx.Params{"id": alertUp.Id})
	assert.NoError(t, err)
	assert.True(t, alertUp.GetBool("triggered"), "Alert should be triggered")

	// Verify we have two unresolved alert history records
	alertHistoryCount, err := hub.CountRecords("alerts_history", dbx.HashExp{"resolved": ""})
	assert.NoError(t, err)
	assert.EqualValues(t, 2, alertHistoryCount, "Should have exactly two unresolved alert history records")

	err = alerts.ResolveStatusAlerts(hub)
	assert.NoError(t, err)

	// Verify alertUp is not triggered after resolving
	alertUp, err = hub.FindFirstRecordByFilter("alerts", "id={:id}", dbx.Params{"id": alertUp.Id})
	assert.NoError(t, err)
	assert.False(t, alertUp.GetBool("triggered"), "Alert should not be triggered after resolving")
	// Verify alertDown is still triggered
	alertDown, err = hub.FindFirstRecordByFilter("alerts", "id={:id}", dbx.Params{"id": alertDown.Id})
	assert.NoError(t, err)
	assert.True(t, alertDown.GetBool("triggered"), "Alert should still be triggered after resolving")

	// Verify we have one unresolved alert history record
	alertHistoryCount, err = hub.CountRecords("alerts_history", dbx.HashExp{"resolved": ""})
	assert.NoError(t, err)
	assert.EqualValues(t, 1, alertHistoryCount, "Should have exactly one unresolved alert history record")

}

func TestAlertsHistoryStatus(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		hub, user := pulseTests.GetHubWithUser(t)
		defer hub.Cleanup()
		webhooks := newWebhookRecorder(t)
		setUserWebhook(t, hub, user.Id, webhooks.URL("/status-cleared-before-send"))

		// Create a system
		systems, err := pulseTests.CreateSystems(hub, 1, user.Id, "up")
		assert.NoError(t, err)
		system := systems[0]

		// Create a status alertRecord for the system
		alertRecord, err := pulseTests.CreateRecord(hub, "alerts", map[string]any{
			"name":   "Status",
			"system": system.Id,
			"user":   user.Id,
			"min":    1,
		})
		assert.NoError(t, err)

		// Verify alert is not triggered initially
		assert.False(t, alertRecord.GetBool("triggered"), "Alert should not be triggered initially")

		// Set the system to 'down' (this should trigger the alert)
		system.Set("status", "down")
		err = hub.Save(system)
		assert.NoError(t, err)

		time.Sleep(time.Second * 30)
		synctest.Wait()

		alertFresh, _ := hub.FindRecordById("alerts", alertRecord.Id)
		assert.False(t, alertFresh.GetBool("triggered"), "Alert should not be triggered after 30 seconds")

		time.Sleep(time.Minute)
		synctest.Wait()

		// Verify alert is triggered after setting system to down
		alertFresh, err = hub.FindRecordById("alerts", alertRecord.Id)
		assert.NoError(t, err)
		assert.True(t, alertFresh.GetBool("triggered"), "Alert should be triggered after one minute")

		// Verify we have one unresolved alert history record
		alertHistoryCount, err := hub.CountRecords("alerts_history", dbx.HashExp{"resolved": ""})
		assert.NoError(t, err)
		assert.EqualValues(t, 1, alertHistoryCount, "Should have exactly one unresolved alert history record")

		// Set the system back to 'up' (this should resolve the alert)
		system.Set("status", "up")
		err = hub.Save(system)
		assert.NoError(t, err)

		time.Sleep(time.Second)
		synctest.Wait()

		// Verify alert is not triggered after setting system back to up
		alertFresh, err = hub.FindRecordById("alerts", alertRecord.Id)
		assert.NoError(t, err)
		assert.False(t, alertFresh.GetBool("triggered"), "Alert should not be triggered after system recovers")

		// Verify the alert history record is resolved
		alertHistoryCount, err = hub.CountRecords("alerts_history", dbx.HashExp{"resolved": ""})
		assert.NoError(t, err)
		assert.EqualValues(t, 0, alertHistoryCount, "Should have no unresolved alert history records")
	})
}

func TestStatusAlertClearedBeforeSend(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		hub, user := pulseTests.GetHubWithUser(t)
		defer hub.Cleanup()
		webhooks := newWebhookRecorder(t)
		setUserWebhook(t, hub, user.Id, webhooks.URL("/status-cleared-before-send"))

		// Create a system
		systems, err := pulseTests.CreateSystems(hub, 1, user.Id, "up")
		assert.NoError(t, err)
		system := systems[0]

		initialWebhookCount := webhooks.Count()

		// Create a status alertRecord for the system
		alertRecord, err := pulseTests.CreateRecord(hub, "alerts", map[string]any{
			"name":   "Status",
			"system": system.Id,
			"user":   user.Id,
			"min":    1,
		})
		assert.NoError(t, err)

		// Verify alert is not triggered initially
		assert.False(t, alertRecord.GetBool("triggered"), "Alert should not be triggered initially")

		// Set the system to 'down' (this should trigger the alert)
		system.Set("status", "down")
		err = hub.Save(system)
		assert.NoError(t, err)

		time.Sleep(time.Second * 30)
		synctest.Wait()

		// Set system back up to clear the pending alert before it triggers
		system.Set("status", "up")
		err = hub.Save(system)
		assert.NoError(t, err)

		time.Sleep(time.Minute)
		synctest.Wait()

		assert.Equal(t, initialWebhookCount, webhooks.Count(), "No notification should be sent if system recovers before alert triggers")

		// Verify alert is not triggered after setting system back to up
		alertFresh, err := hub.FindRecordById("alerts", alertRecord.Id)
		assert.NoError(t, err)
		assert.False(t, alertFresh.GetBool("triggered"), "Alert should not be triggered after system recovers")

		// Verify that no alert history record was created since the alert never triggered
		alertHistoryCount, err := hub.CountRecords("alerts_history")
		assert.NoError(t, err)
		assert.EqualValues(t, 0, alertHistoryCount, "Should have no unresolved alert history records since alert never triggered")
	})
}

func TestCancelPendingStatusAlertsClearsAllAlertsForSystem(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()
	webhooks := newWebhookRecorder(t)
	setUserWebhook(t, hub, user.Id, webhooks.URL("/status-cancel-pending"))

	systemCollection, err := hub.FindCollectionByNameOrId("systems")
	require.NoError(t, err)

	system1 := core.NewRecord(systemCollection)
	system1.Set("name", "system-1")
	system1.Set("status", "up")
	system1.Set("host", "127.0.0.1")
	system1.Set("users", []string{user.Id})
	require.NoError(t, hub.Save(system1))

	system2 := core.NewRecord(systemCollection)
	system2.Set("name", "system-2")
	system2.Set("status", "up")
	system2.Set("host", "127.0.0.2")
	system2.Set("users", []string{user.Id})
	require.NoError(t, hub.Save(system2))

	alertCollection, err := hub.FindCollectionByNameOrId("alerts")
	require.NoError(t, err)

	alert1 := core.NewRecord(alertCollection)
	alert1.Set("user", user.Id)
	alert1.Set("system", system1.Id)
	alert1.Set("name", "Status")
	alert1.Set("triggered", false)
	alert1.Set("min", 5)
	require.NoError(t, hub.Save(alert1))

	alert2 := core.NewRecord(alertCollection)
	alert2.Set("user", user.Id)
	alert2.Set("system", system2.Id)
	alert2.Set("name", "Status")
	alert2.Set("triggered", false)
	alert2.Set("min", 5)
	require.NoError(t, hub.Save(alert2))

	am := alerts.NewTestAlertManagerWithoutWorker(hub)
	initialWebhookCount := webhooks.Count()

	// Both systems go down
	require.NoError(t, am.HandleStatusAlerts("down", system1))
	require.NoError(t, am.HandleStatusAlerts("down", system2))
	assert.Equal(t, 2, am.GetPendingAlertsCount(), "both systems should have pending alerts")

	// System 1 is paused — cancel its pending alerts
	am.CancelPendingStatusAlerts(system1.Id)
	assert.Equal(t, 1, am.GetPendingAlertsCount(), "only system2 alert should remain pending after pausing system1")

	// Expire and process remaining alerts — only system2 should fire
	am.ForceExpirePendingAlerts()
	processed, err := am.ProcessPendingAlerts()
	require.NoError(t, err)
	assert.Len(t, processed, 1, "only the non-paused system's alert should be processed")
	assert.Equal(t, initialWebhookCount+1, webhooks.Count(), "only system2 should send a down notification")
}
