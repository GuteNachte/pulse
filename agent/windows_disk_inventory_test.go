//go:build testing

package agent

import (
	"testing"

	"github.com/stretchr/testify/require"
	"gutenacht.site/pulse/internal/entities/smart"
)

func TestConvertWindowsPhysicalDisks(t *testing.T) {
	disks := []windowsPhysicalDisk{
		{
			DeviceId:        "0",
			FriendlyName:    "Great Wall GW3300 1TB",
			SerialNumber:    " 00E04C16D9930790 ",
			FirmwareVersion: "VC2S038D",
			MediaType:       4,
			BusType:         17,
			Size:            1024209543168,
			HealthStatus:    0,
		},
		{
			DeviceId:        "1",
			Model:           "WDC WD40EFRX",
			SerialNumber:    "WD-WCC7K1234567",
			FirmwareVersion: "82.00A82",
			MediaType:       3,
			BusType:         11,
			Size:            4000787030016,
			HealthStatus:    1,
		},
	}

	devices, entries := convertWindowsPhysicalDisks(disks)

	require.Len(t, devices, 2)
	require.Equal(t, `\\.\PHYSICALDRIVE0`, devices[0].Name)
	require.Equal(t, "nvme", devices[0].Type)
	require.Equal(t, "nvme", devices[0].Protocol)
	require.Equal(t, `\\.\PHYSICALDRIVE1`, devices[1].Name)
	require.Equal(t, "sata", devices[1].Protocol)

	first := entries[`\\.\PHYSICALDRIVE0`]
	require.Equal(t, "00E04C16D9930790", first.Key)
	require.Equal(t, "Great Wall GW3300 1TB", first.Data.ModelName)
	require.Equal(t, "00E04C16D9930790", first.Data.SerialNumber)
	require.Equal(t, "VC2S038D", first.Data.FirmwareVersion)
	require.Equal(t, uint64(1024209543168), first.Data.Capacity)
	require.Equal(t, "PASSED", first.Data.SmartStatus)
	require.Equal(t, "nvme", first.Data.DiskType)
	require.Equal(t, "ssd", first.Data.MediaType)
	require.Equal(t, `\\.\PHYSICALDRIVE0`, first.Data.DiskName)

	second := entries[`\\.\PHYSICALDRIVE1`]
	require.Equal(t, "WD-WCC7K1234567", second.Key)
	require.Equal(t, "WDC WD40EFRX", second.Data.ModelName)
	require.Equal(t, "WARNING", second.Data.SmartStatus)
	require.Equal(t, "sata", second.Data.DiskType)
	require.Equal(t, "hdd", second.Data.MediaType)
}

func TestConvertWindowsPhysicalDisksFallsBackToDevicePath(t *testing.T) {
	disks := []windowsPhysicalDisk{
		{DeviceId: "0", FriendlyName: "USB Enclosure", SerialNumber: "0000_0000_0000", BusType: 7, HealthStatus: 5},
		{DeviceId: "1", FriendlyName: "Duplicate A", SerialNumber: "SAME-SERIAL", BusType: 11},
		{DeviceId: "2", FriendlyName: "Duplicate B", SerialNumber: "SAME-SERIAL", BusType: 11},
		{DeviceId: "", FriendlyName: "No device id"},
	}

	devices, entries := convertWindowsPhysicalDisks(disks)

	require.Len(t, devices, 3)
	require.Equal(t, `\\.\PHYSICALDRIVE0`, entries[`\\.\PHYSICALDRIVE0`].Key)
	require.Equal(t, `\\.\PHYSICALDRIVE1`, entries[`\\.\PHYSICALDRIVE1`].Key)
	require.Equal(t, `\\.\PHYSICALDRIVE2`, entries[`\\.\PHYSICALDRIVE2`].Key)
	require.Equal(t, "UNKNOWN", entries[`\\.\PHYSICALDRIVE0`].Data.SmartStatus)
	require.Equal(t, "usb", entries[`\\.\PHYSICALDRIVE0`].Data.DiskType)
}

func TestWindowsPhysicalDriveName(t *testing.T) {
	require.Equal(t, `\\.\PHYSICALDRIVE12`, windowsPhysicalDriveName("12"))
	require.Equal(t, `\\.\PHYSICALDRIVE0`, windowsPhysicalDriveName(" 0 "))
	require.Equal(t, "windows-physicaldisk-{abc-123}", windowsPhysicalDriveName("{ABC-123}"))
	require.Equal(t, "", windowsPhysicalDriveName(" "))
}

func TestWindowsDiskHealthAndTypeMappings(t *testing.T) {
	require.Equal(t, "PASSED", windowsDiskHealthStatus(0))
	require.Equal(t, "WARNING", windowsDiskHealthStatus(1))
	require.Equal(t, "FAILED", windowsDiskHealthStatus(2))
	require.Equal(t, "UNKNOWN", windowsDiskHealthStatus(5))

	require.Equal(t, "usb", windowsDiskBusType(7))
	require.Equal(t, "raid", windowsDiskBusType(8))
	require.Equal(t, "sas", windowsDiskBusType(10))
	require.Equal(t, "sata", windowsDiskBusType(11))
	require.Equal(t, "nvme", windowsDiskBusType(17))
	require.Equal(t, "virtual", windowsDiskBusType(14))
	require.Equal(t, "disk", windowsDiskBusType(1))

	require.Equal(t, "hdd", windowsDiskMediaType(3))
	require.Equal(t, "ssd", windowsDiskMediaType(4))
	require.Equal(t, "scm", windowsDiskMediaType(5))
	require.Equal(t, "", windowsDiskMediaType(0))
}

func TestCollectWindowsInventoryPublishesDiskData(t *testing.T) {
	const deviceName = `\\.\PHYSICALDRIVE0`
	manager := &SmartManager{
		SmartDataMap:     make(map[string]*smart.SmartData),
		windowsInventory: true,
		windowsDiskData: map[string]windowsDiskEntry{
			deviceName: {
				Key: "SN-001",
				Data: smart.SmartData{
					ModelName:    "Disk Model",
					SerialNumber: "SN-001",
					DiskName:     deviceName,
				},
			},
		},
	}
	device := &DeviceInfo{Name: deviceName, Type: "windows"}

	require.NoError(t, manager.collectWindowsInventory(device))
	published, ok := manager.SmartDataMap["SN-001"]
	require.True(t, ok)
	require.Equal(t, "Disk Model", published.ModelName)
	require.Equal(t, deviceName, published.DiskName)

	require.ErrorIs(t, manager.collectWindowsInventory(&DeviceInfo{Name: `\\.\PHYSICALDRIVE9`}), errNoValidSmartData)
}

func TestParseWindowsReliabilityCounters(t *testing.T) {
	single := []byte(`{"DeviceId":"0","Temperature":40,"PowerOnHours":null,"StartStopCycleCount":12}`)
	rows := parseWindowsReliabilityCounters(single)
	require.Len(t, rows, 1)
	require.Equal(t, "0", rows[0].DeviceId)
	require.NotNil(t, rows[0].Temperature)
	require.Equal(t, uint16(40), *rows[0].Temperature)
	require.Nil(t, rows[0].PowerOnHours)
	require.NotNil(t, rows[0].StartStopCycleCount)

	array := []byte(`[{"DeviceId":"0","Temperature":41},{"DeviceId":"1","Temperature":38}]`)
	require.Len(t, parseWindowsReliabilityCounters(array), 2)
	require.Nil(t, parseWindowsReliabilityCounters([]byte("not json")))
	require.Nil(t, parseWindowsReliabilityCounters(nil))
}

func TestApplyWindowsReliability(t *testing.T) {
	const deviceName = `\\.\PHYSICALDRIVE0`
	entries := map[string]windowsDiskEntry{
		deviceName: {Key: "SN-001", Data: smart.SmartData{DiskName: deviceName}},
	}
	temperature := uint16(40)
	hours := uint64(1234)
	cycles := uint64(56)

	applyWindowsReliability(entries, []windowsReliabilityCounter{{
		DeviceId:            "0",
		Temperature:         &temperature,
		PowerOnHours:        &hours,
		StartStopCycleCount: &cycles,
	}})

	entry := entries[deviceName]
	require.Equal(t, uint8(40), entry.Data.Temperature)
	require.Len(t, entry.Data.Attributes, 2)
	require.Equal(t, "Power_On_Hours", entry.Data.Attributes[0].Name)
	require.Equal(t, uint64(1234), entry.Data.Attributes[0].RawValue)
	require.Equal(t, "Power_Cycle_Count", entry.Data.Attributes[1].Name)
	require.Equal(t, uint64(56), entry.Data.Attributes[1].RawValue)

	// Unknown devices and absent counters must not be invented.
	applyWindowsReliability(entries, []windowsReliabilityCounter{{DeviceId: "9", Temperature: &temperature}})
	require.Len(t, entries, 1)

	high := uint16(300)
	applyWindowsReliability(entries, []windowsReliabilityCounter{{DeviceId: "0", Temperature: &high}})
	require.Equal(t, uint8(255), entries[deviceName].Data.Temperature)
	require.Empty(t, entries[deviceName].Data.Attributes)
}
