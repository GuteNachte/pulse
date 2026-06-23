//go:build testing

package alerts_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	pulseTests "gutenacht.site/pulse/internal/tests"
)

func TestSmartDeviceAlert(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()
	webhooks := newWebhookRecorder(t)
	setUserWebhook(t, hub, user.Id, webhooks.URL("/smart"))

	// Create a system for the user
	system, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":  "test-system",
		"users": []string{user.Id},
		"host":  "127.0.0.1",
	})
	assert.NoError(t, err)

	// Create a smart_device with state PASSED
	smartDevice, err := pulseTests.CreateRecord(hub, "smart_devices", map[string]any{
		"system": system.Id,
		"name":   "/dev/sda",
		"model":  "Samsung SSD 970 EVO",
		"state":  "PASSED",
	})
	assert.NoError(t, err)

	assert.Zero(t, webhooks.Count(), "should have 0 webhook notifications initially")

	// Re-fetch the record so PocketBase can properly track original values
	smartDevice, err = hub.FindRecordById("smart_devices", smartDevice.Id)
	assert.NoError(t, err)

	// Update the smart device state to FAILED
	smartDevice.Set("state", "FAILED")
	err = hub.Save(smartDevice)
	assert.NoError(t, err)

	// Wait for the alert to be processed
	time.Sleep(50 * time.Millisecond)

	assert.EqualValues(t, 1, webhooks.Count(), "should have 1 webhook notification after state changed to FAILED")

	lastBody := webhooks.LastBody()
	assert.Contains(t, lastBody, "SMART failure on test-system")
	assert.Contains(t, lastBody, "/dev/sda")
	assert.Contains(t, lastBody, "Samsung SSD 970 EVO")
	assert.Contains(t, lastBody, "FAILED")
}

func TestSmartDeviceAlertPassedToWarning(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()
	webhooks := newWebhookRecorder(t)
	setUserWebhook(t, hub, user.Id, webhooks.URL("/smart-warning"))

	system, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":  "test-system",
		"users": []string{user.Id},
		"host":  "127.0.0.1",
	})
	assert.NoError(t, err)

	smartDevice, err := pulseTests.CreateRecord(hub, "smart_devices", map[string]any{
		"system": system.Id,
		"name":   "/dev/mmcblk0",
		"model":  "eMMC",
		"state":  "PASSED",
	})
	assert.NoError(t, err)

	smartDevice, err = hub.FindRecordById("smart_devices", smartDevice.Id)
	assert.NoError(t, err)

	smartDevice.Set("state", "WARNING")
	err = hub.Save(smartDevice)
	assert.NoError(t, err)

	time.Sleep(50 * time.Millisecond)

	assert.EqualValues(t, 1, webhooks.Count(), "should have 1 webhook notification after state changed to WARNING")
	lastBody := webhooks.LastBody()
	assert.Contains(t, lastBody, "SMART warning on test-system")
	assert.Contains(t, lastBody, "WARNING")
}

func TestSmartDeviceAlertWarningToFailed(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()
	webhooks := newWebhookRecorder(t)
	setUserWebhook(t, hub, user.Id, webhooks.URL("/smart-failed"))

	system, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":  "test-system",
		"users": []string{user.Id},
		"host":  "127.0.0.1",
	})
	assert.NoError(t, err)

	smartDevice, err := pulseTests.CreateRecord(hub, "smart_devices", map[string]any{
		"system": system.Id,
		"name":   "/dev/mmcblk0",
		"model":  "eMMC",
		"state":  "WARNING",
	})
	assert.NoError(t, err)

	smartDevice, err = hub.FindRecordById("smart_devices", smartDevice.Id)
	assert.NoError(t, err)

	smartDevice.Set("state", "FAILED")
	err = hub.Save(smartDevice)
	assert.NoError(t, err)

	time.Sleep(50 * time.Millisecond)

	assert.EqualValues(t, 1, webhooks.Count(), "should have 1 webhook notification after state changed from WARNING to FAILED")
	lastBody := webhooks.LastBody()
	assert.Contains(t, lastBody, "SMART failure on test-system")
	assert.Contains(t, lastBody, "FAILED")
}

func TestSmartDeviceAlertNoAlertOnNonPassedToFailed(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()
	webhooks := newWebhookRecorder(t)
	setUserWebhook(t, hub, user.Id, webhooks.URL("/smart-no-alert"))

	// Create a system for the user
	system, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":  "test-system",
		"users": []string{user.Id},
		"host":  "127.0.0.1",
	})
	assert.NoError(t, err)

	// Create a smart_device with state UNKNOWN
	smartDevice, err := pulseTests.CreateRecord(hub, "smart_devices", map[string]any{
		"system": system.Id,
		"name":   "/dev/sda",
		"model":  "Samsung SSD 970 EVO",
		"state":  "UNKNOWN",
	})
	assert.NoError(t, err)

	// Re-fetch the record so PocketBase can properly track original values
	smartDevice, err = hub.FindRecordById("smart_devices", smartDevice.Id)
	assert.NoError(t, err)

	// Update the state from UNKNOWN to FAILED - should NOT trigger alert.
	// We only alert from known healthy/degraded states.
	smartDevice.Set("state", "FAILED")
	err = hub.Save(smartDevice)
	assert.NoError(t, err)

	time.Sleep(50 * time.Millisecond)

	assert.Zero(t, webhooks.Count(), "should have 0 webhook notifications when changing from UNKNOWN to FAILED")

	// Re-fetch the record again
	smartDevice, err = hub.FindRecordById("smart_devices", smartDevice.Id)
	assert.NoError(t, err)

	// Update state from FAILED to PASSED - should NOT trigger alert
	smartDevice.Set("state", "PASSED")
	err = hub.Save(smartDevice)
	assert.NoError(t, err)

	time.Sleep(50 * time.Millisecond)

	assert.Zero(t, webhooks.Count(), "should have 0 webhook notifications when changing from FAILED to PASSED")
}

func TestSmartDeviceAlertMultipleUsers(t *testing.T) {
	hub, user1 := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()
	webhooks := newWebhookRecorder(t)
	setUserWebhook(t, hub, user1.Id, webhooks.URL("/smart-user1"))

	// Create a second user
	user2, err := pulseTests.CreateUser(hub, "test2@example.com", "password")
	assert.NoError(t, err)
	setUserWebhook(t, hub, user2.Id, webhooks.URL("/smart-user2"))

	// Create a system with both users
	system, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":  "shared-system",
		"users": []string{user1.Id},
		"host":  "127.0.0.1",
	})
	assert.NoError(t, err)
	system.Set("users+", user2.Id)
	assert.NoError(t, hub.SaveNoValidate(system))

	// Create a smart_device with state PASSED
	smartDevice, err := pulseTests.CreateRecord(hub, "smart_devices", map[string]any{
		"system": system.Id,
		"name":   "/dev/nvme0n1",
		"model":  "WD Black SN850",
		"state":  "PASSED",
	})
	assert.NoError(t, err)

	// Re-fetch the record so PocketBase can properly track original values
	smartDevice, err = hub.FindRecordById("smart_devices", smartDevice.Id)
	assert.NoError(t, err)

	// Update the smart device state to FAILED
	smartDevice.Set("state", "FAILED")
	err = hub.Save(smartDevice)
	assert.NoError(t, err)

	time.Sleep(50 * time.Millisecond)

	assert.EqualValues(t, 2, webhooks.Count(), "should have 2 webhook notifications for 2 users")
}

func TestSmartDeviceAlertWithoutModel(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()
	webhooks := newWebhookRecorder(t)
	setUserWebhook(t, hub, user.Id, webhooks.URL("/smart-without-model"))

	// Create a system for the user
	system, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":  "test-system",
		"users": []string{user.Id},
		"host":  "127.0.0.1",
	})
	assert.NoError(t, err)

	// Create a smart_device with state PASSED but no model
	smartDevice, err := pulseTests.CreateRecord(hub, "smart_devices", map[string]any{
		"system": system.Id,
		"name":   "/dev/sdb",
		"state":  "PASSED",
	})
	assert.NoError(t, err)

	// Re-fetch the record so PocketBase can properly track original values
	smartDevice, err = hub.FindRecordById("smart_devices", smartDevice.Id)
	assert.NoError(t, err)

	// Update the smart device state to FAILED
	smartDevice.Set("state", "FAILED")
	err = hub.Save(smartDevice)
	assert.NoError(t, err)

	time.Sleep(50 * time.Millisecond)

	assert.EqualValues(t, 1, webhooks.Count(), "should have 1 webhook notification")

	lastBody := webhooks.LastBody()
	assert.NotContains(t, lastBody, "()", "should not have empty parentheses for missing model")
	assert.Contains(t, lastBody, "/dev/sdb")
}
