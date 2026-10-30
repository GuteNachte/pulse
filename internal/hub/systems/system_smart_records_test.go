//go:build testing

package systems_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gutenacht.site/pulse/internal/entities/smart"
	"gutenacht.site/pulse/internal/hub/systems"
	"gutenacht.site/pulse/internal/tests"
)

func TestSaveSmartDevicesPrunesStaleDevices(t *testing.T) {
	hub, user := tests.GetHubWithUser(t)
	defer hub.Cleanup()

	systemRecord, err := tests.CreateRecord(hub, "systems", map[string]any{
		"name":  "smart-system",
		"users": []string{user.Id},
	})
	require.NoError(t, err)

	sys := systems.NewTestSystemForRecords(hub.GetSystemManager(), systemRecord)
	require.NoError(t, sys.SaveSmartDevicesForTest(map[string]smart.SmartData{
		"old-device": {
			DiskName:     "/dev/sda",
			ModelName:    "Old SSD",
			SerialNumber: "old-serial",
			DiskType:     "nvme",
			Capacity:     100,
		},
		"current-device": {
			DiskName:     "/dev/sda",
			ModelName:    "Current SSD",
			SerialNumber: "current-serial",
			DiskType:     "nvme",
			MediaType:    "nvme",
			Capacity:     200,
		},
	}))

	records, err := hub.FindRecordsByFilter("smart_devices", "system = {:system}", "", -1, 0, map[string]any{
		"system": systemRecord.Id,
	})
	require.NoError(t, err)
	require.Len(t, records, 2)

	require.NoError(t, sys.SaveSmartDevicesForTest(map[string]smart.SmartData{
		"current-device": {
			DiskName:     "/dev/sda",
			ModelName:    "Current SSD",
			SerialNumber: "current-serial",
			DiskType:     "nvme",
			MediaType:    "nvme",
			Capacity:     200,
		},
	}))

	records, err = hub.FindRecordsByFilter("smart_devices", "system = {:system}", "", -1, 0, map[string]any{
		"system": systemRecord.Id,
	})
	require.NoError(t, err)
	require.Len(t, records, 1)
	assert.Equal(t, "Current SSD", records[0].GetString("model"))
	assert.Equal(t, "current-serial", records[0].GetString("serial"))
	assert.Equal(t, "nvme", records[0].GetString("media_type"))
}
